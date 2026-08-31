"""
ROCOLA — versión Tinder (Python + pywebview)
=============================================

Una rocola de escritorio en Python con:
  - Descubrimiento de canciones estilo Tinder (swipe): ve un candidato,
    escúchalo, deslízalo a la derecha para agregarlo o a la izquierda
    para pasar.
  - Generación de lista aleatoria instantánea por género.
  - Cola de reproducción con play/pausa, siguiente/anterior, aleatorio,
    repetir, volumen y barra de progreso.
  - Reproducción vía el reproductor OFICIAL de YouTube (IFrame Player API)
    embebido en la ventana — no se descarga ni extrae audio de ningún video.
  - Búsqueda por género vía la YouTube Data API v3 (oficial).
  - La cola se guarda en disco (playlist.json) para que no se pierda al
    cerrar la app.

REQUISITOS
----------
1. pip install -r requirements.txt
2. Una API key de YouTube Data API v3 (ver README.md) colocada en .env
3. En Linux, pywebview necesita el motor WebKitGTK instalado, por ejemplo:
     sudo apt install python3-gi gir1.2-webkit2-4.1
   En Windows normalmente ya tienes WebView2 (Edge) preinstalado.
   En macOS usa el WebKit del sistema, no necesitas nada extra.

EJECUTAR
--------
   python main.py
"""

import json
import os
import random
from pathlib import Path

import requests
import webview
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "playlist.json"
API_KEY = os.getenv("YOUTUBE_API_KEY", "").strip()


class Api:
    """Puente entre el JavaScript de la interfaz y Python.
    Solo estos métodos son invocables desde el frontend
    (vía window.pywebview.api.<metodo>(...) en JS).
    La API key de YouTube nunca se envía al frontend: vive solo aquí.
    """

    def search_genre(self, genre, count=5, exclude_ids=None):
        if not API_KEY:
            return {"error": "Falta YOUTUBE_API_KEY. Revisa tu archivo .env (ver README.md)."}

        genre = (genre or "").strip()
        if not genre:
            return {"error": "Falta indicar un género."}

        try:
            count = max(1, min(10, int(count)))
        except (TypeError, ValueError):
            count = 5

        exclude = set(exclude_ids or [])
        max_results = min(25, count * 5)

        params = {
            "part": "snippet",
            "type": "video",
            "videoCategoryId": "10",  # Categoría "Música" en YouTube
            "maxResults": max_results,
            "q": f"{genre} música",
            "key": API_KEY,
        }

        try:
            resp = requests.get(
                "https://www.googleapis.com/youtube/v3/search",
                params=params,
                timeout=10,
            )
            data = resp.json()
        except requests.RequestException as e:
            return {"error": f"No se pudo contactar a YouTube: {e}"}

        if resp.status_code != 200:
            msg = data.get("error", {}).get("message", "Error desconocido de la API de YouTube.")
            return {"error": msg}

        items = []
        for item in data.get("items", []):
            vid = item.get("id", {}).get("videoId")
            if not vid or vid in exclude:
                continue
            sn = item.get("snippet", {})
            thumbs = sn.get("thumbnails", {})
            thumb = (thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}).get("url")
            items.append({
                "videoId": vid,
                "title": sn.get("title", vid),
                "channel": sn.get("channelTitle", ""),
                "thumbnail": thumb,
            })

        random.shuffle(items)
        return {"results": items[:count]}

    def save_playlist(self, tracks):
        try:
            DATA_FILE.write_text(
                json.dumps(tracks, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)}

    def load_playlist(self):
        if not DATA_FILE.exists():
            return {"tracks": []}
        try:
            return {"tracks": json.loads(DATA_FILE.read_text(encoding="utf-8"))}
        except Exception:
            return {"tracks": []}


def main():
    api = Api()
    index_path = (BASE_DIR / "web" / "index.html").resolve().as_uri()

    webview.create_window(
        title="Rocola",
        url=index_path,
        js_api=api,
        width=480,
        height=860,
        min_size=(400, 700),
        resizable=True,
    )
    webview.start()


if __name__ == "__main__":
    main()
