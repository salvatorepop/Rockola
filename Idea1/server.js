// server.js
// Backend mínimo de la Rocola: sirve el frontend y expone /api/search,
// que llama a la YouTube Data API v3 usando una API key que NUNCA se
// expone al navegador (vive solo aquí, en el servidor).

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YOUTUBE_API_KEY;

if (!API_KEY) {
  console.error('\n[ERROR] Falta YOUTUBE_API_KEY en tu archivo .env');
  console.error('Copia .env.example a .env y coloca tu API key ahí.\n');
  process.exit(1);
}

app.use(express.static(path.join(__dirname, 'public')));

// GET /api/search?genre=rock&count=3&existing=id1,id2
app.get('/api/search', async (req, res) => {
  const genre = (req.query.genre || '').trim();
  const count = Math.min(10, Math.max(1, parseInt(req.query.count, 10) || 3));
  const existing = new Set(
    (req.query.existing || '').split(',').map(s => s.trim()).filter(Boolean)
  );

  if (!genre) {
    return res.status(400).json({ error: 'Falta el parámetro "genre".' });
  }

  try {
    // Pedimos más resultados de los que necesitamos para poder filtrar
    // duplicados y elegir al azar entre varios candidatos.
    const maxResults = Math.min(25, count * 5);
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoCategoryId', '10'); // 10 = Música
    url.searchParams.set('maxResults', String(maxResults));
    url.searchParams.set('q', `${genre} música`);
    url.searchParams.set('key', API_KEY);

    const ytRes = await fetch(url);
    const data = await ytRes.json();

    if (!ytRes.ok) {
      console.error('Error de YouTube API:', data);
      return res.status(502).json({ error: data.error?.message || 'Error al consultar YouTube.' });
    }

    const items = (data.items || [])
      .filter(item => item.id?.videoId && !existing.has(item.id.videoId))
      .map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      }));

    // Barajamos y devolvemos solo la cantidad pedida
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }

    res.json({ results: items.slice(0, count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎵 Rocola corriendo en http://localhost:${PORT}\n`);
});
