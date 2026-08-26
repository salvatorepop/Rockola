# Rocola

Rocola que reproduce música tomándola de YouTube usando el **reproductor
oficial de YouTube (IFrame Player API)** y busca canciones por género con la
**YouTube Data API v3**. Ninguna de las dos requiere descargar ni extraer
audio: todo pasa por las vías que YouTube ofrece para este propósito.

## Cómo está armado

- `public/index.html` — el frontend: la interfaz de la rocola, el reproductor
  embebido (oculto visualmente) y toda la lógica de cola, reproducción, etc.
- `server.js` — un backend pequeño en Node/Express. Su único trabajo es
  recibir "búscame canciones de género X" desde el navegador y consultar la
  YouTube Data API v3 con tu API key. La key nunca viaja al navegador del
  usuario, así nadie puede copiarla inspeccionando la página.
- `.env.example` — plantilla para tu configuración.

## Paso 1: Consigue una API key de YouTube Data API v3

1. Ve a [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un proyecto nuevo (o usa uno existente).
3. En el buscador superior escribe "YouTube Data API v3" y ábrela.
4. Dale clic a **Habilitar**.
5. Ve a **Credenciales** → **Crear credenciales** → **Clave de API**.
6. Copia la clave que te genera.

Esta API tiene una cuota gratuita diaria (10,000 unidades/día); cada búsqueda
de género consume alrededor de 100 unidades, así que alcanza de sobra para
uso normal.

## Paso 2: Instala Node.js

Necesitas Node.js 18 o superior. Descárgalo de
[nodejs.org](https://nodejs.org/) si no lo tienes. Para checar tu versión:

```bash
node -v
```

## Paso 3: Configura el proyecto

Desde la carpeta del proyecto:

```bash
npm install
cp .env.example .env
```

Abre el archivo `.env` que se acaba de crear y coloca tu API key:

```
YOUTUBE_API_KEY=tu_clave_real_aquí
PORT=3000
```

## Paso 4: Corre la rocola

```bash
npm start
```

Verás en la terminal:

```
🎵 Rocola corriendo en http://localhost:3000
```

Abre esa dirección en tu navegador y ya está funcionando.

## Cómo se usa

- **Agregar por URL**: pega el enlace de un video de YouTube y dale
  "Agregar". Trae el título y el canal automáticamente.
- **Agregar por género**: elige un género y una cantidad, dale
  "🎲 Agregar del género" — el backend busca en YouTube, descarta lo que ya
  está en tu cola y agrega canciones al azar.
- Controles normales de reproductor: play/pausa, anterior, siguiente,
  aleatorio, repetir, volumen y barra de progreso.

## Por qué esta arquitectura y no yt-dlp

- El reproductor y la búsqueda usan únicamente APIs públicas y soportadas
  por YouTube — no dependen de ingeniería inversa de su reproductor interno,
  así que no se rompen cuando YouTube actualiza algo.
- La API key vive solo en el servidor (`server.js`), nunca en el código que
  llega al navegador.
- Si más adelante quieres desplegar esto como una app de escritorio para un
  kiosco físico, puedes empaquetar exactamente este mismo frontend con
  Electron en modo pantalla completa, apuntando al mismo backend.

## Nota

Los anuncios de YouTube pueden seguir apareciendo antes de algunos videos —
eso es parte de usar el reproductor oficial tal como está pensado. Si más
adelante el uso es comercial (negocio con público pagando), retoma la
conversación sobre licencias de música que ya tuvimos, porque eso aplica sin
importar cuál fuente de audio uses.
