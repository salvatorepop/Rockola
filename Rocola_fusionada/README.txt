════════════════════════════════════════════════════════════
                     R O C O L A
              Instrucciones de instalación
════════════════════════════════════════════════════════════

REQUISITOS
──────────
- Python 3.10 o superior
- ffmpeg instalado en el sistema


PASO 1 — Instalar ffmpeg
────────────────────────

  Mac:
    brew install ffmpeg

  Windows:
    winget install ffmpeg

  Si no tienes Homebrew en Mac:
    Instálalo desde https://brew.sh


PASO 2 — Crear entorno virtual
────────────────────────────────

  Mac / Linux:
    python3 -m venv venv
    source venv/bin/activate

  Windows:
    python -m venv venv
    venv\Scripts\activate


PASO 3 — Instalar dependencias
────────────────────────────────

  Con el venv activado:
    pip install -r requirements.txt

  O manualmente:
    pip install yt-dlp pygame-ce pywebview Pillow requests numpy


PASO 4 — Configurar la ruta de ffmpeg
────────────────────────────────────────

  Abre main.py y busca esta línea cerca del inicio:

    FFMPEG = "/opt/homebrew/bin/"

  Cámbiala según tu sistema:

  Mac (Homebrew):
    FFMPEG = "/opt/homebrew/bin/"

  Windows:
    FFMPEG = "C:\\ffmpeg\\bin\\"
    (ajusta la ruta según donde hayas instalado ffmpeg)

  Linux:
    FFMPEG = "/usr/bin/"


PASO 5 — Ejecutar la app
──────────────────────────

  Con el venv activado:
    python main.py


ESTRUCTURA DE ARCHIVOS
──────────────────────
  main.py         Backend Python (búsqueda, descarga, reproducción)
  index.html      Interfaz principal
  style.css       Estilos
  app.js          Lógica de la interfaz
  requirements.txt  Dependencias de Python
  playlist.json   Se crea automáticamente al agregar canciones


NOTAS
─────
- La playlist se guarda automáticamente en playlist.json
  al cerrar la app o agregar/quitar canciones.

- Al abrir la app, la playlist guardada se carga automáticamente.

- La app requiere conexión a internet para buscar
  y descargar canciones de YouTube.

- Las canciones se descargan temporalmente en /tmp/
  y se eliminan al cambiar de canción.

════════════════════════════════════════════════════════════
