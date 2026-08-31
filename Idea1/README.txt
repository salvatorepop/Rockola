# Rocola — versión Tinder (Python)

Rocola de escritorio hecha en Python. Descubre canciones deslizando tarjetas
al estilo Tinder (escuchas una vista previa antes de decidir), arma listas
aleatorias instantáneas por género, y reproduce tu cola con controles
completos — todo tomando la música del reproductor **oficial** de YouTube.

## Estructura de archivos

```
main.py             → la app Python: crea la ventana y expone la API a JS
requirements.txt    → dependencias de Python
.env.example         → plantilla para tu API key
web/index.html       → solo estructura (HTML)
web/style.css        → todos los estilos, con layout flexbox para caber
                        completo en la ventana sin scroll de página
web/app.js           → toda la lógica: swipe, reproductor, cola, persistencia
playlist.json         → se crea solo, aquí se guarda tu cola entre sesiones
```

### Sobre el "sin scroll"

El layout usa flexbox de arriba a abajo (encabezado → pestañas → contenido)
en vez de alturas fijas, así que todo se reparte el espacio disponible de la
ventana automáticamente: el mazo de tarjetas crece o se achica según el
espacio libre, igual que los controles del reproductor. La única excepción
intencional es la lista de canciones en "Mi Rocola": si agregas muchas, esa
lista específica scrollea internamente (como cualquier lista de
reproducción), pero el resto de la pantalla —tarjetas, botones, controles—
siempre queda visible completo sin necesidad de mover la página.

## Por qué esta arquitectura

Es una app de Python de verdad, pero usa **pywebview** para embeber un
navegador real dentro de la ventana:

- **Python controla todo lo sensible**: la API key de YouTube y el guardado
  de tu playlist en disco viven únicamente en `main.py`. El HTML/JS de la
  interfaz nunca ve la clave — le pide a Python "búscame canciones de rock" y
  Python le regresa solo los resultados.
- **El swipe y el reproductor usan tecnología web** porque es donde se hacen
  bien las animaciones de arrastre tipo Tinder, y porque así seguimos usando
  el reproductor oficial de YouTube (IFrame Player API) en vez de extraer
  audio.

## Funciones incluidas

- **Descubrir (modo Tinder)**: eliges un género, te muestra una tarjeta a la
  vez con una vista previa sonando. Deslizas a la derecha (o ❤) para
  agregarla a tu rocola, a la izquierda (o ✕) para pasar. El mazo se rellena
  solo cuando quedan pocas tarjetas.
- **Deshacer**: el botón ↩ regresa la última decisión (quita de la cola si la
  habías agregado).
- **Lista aleatoria instantánea**: eliges cantidad y género, y agrega esa
  cantidad de canciones directo a tu cola sin deslizar una por una.
- **Agregar por URL**: por si ya sabes exactamente qué canción quieres.
- **Cola completa**: play/pausa, siguiente/anterior, aleatorio, repetir
  (una o todas), volumen, barra de progreso, y quitar canciones individuales.
- **Persistencia**: tu cola se guarda automáticamente en `playlist.json` y se
  recupera sola la próxima vez que abras la app.
- **Atajos de teclado** en modo Descubrir: ← pasar, → agregar, ↑ deshacer,
  espacio pausar/reanudar la vista previa.

## Paso 1: Consigue una API key de YouTube Data API v3

1. Ve a [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un proyecto (o usa uno existente).
3. Busca "YouTube Data API v3" y dale **Habilitar**.
4. Ve a **Credenciales** → **Crear credenciales** → **Clave de API** y cópiala.

La cuota gratuita diaria (10,000 unidades) alcanza de sobra para uso normal.

## Paso 2: Instala Python y las dependencias

Necesitas Python 3.9 o superior.

```bash
pip install -r requirements.txt
```

**Nota para Linux**: pywebview necesita el motor WebKitGTK. Si al correr la
app te marca error relacionado con GTK/WebKit, instala:

```bash
sudo apt install python3-gi gir1.2-webkit2-4.1
```

En Windows normalmente ya tienes el WebView2 de Edge preinstalado. En macOS
no necesitas nada extra (usa el WebKit del sistema).

## Paso 3: Configura tu API key

```bash
cp .env.example .env
```

Edita `.env` y coloca tu clave:

```
YOUTUBE_API_KEY=tu_clave_real_aquí
```

## Paso 4: Corre la app

```bash
python main.py
```

Se abrirá la ventana de la Rocola. Empieza en la pestaña "Descubrir",
elige un género y dale "Descubrir".


