"""
ROCOLA FUSION — yt-dlp + pywebview + pygame
"""
import json, os, threading, time, random
from pathlib import Path
import yt_dlp, pygame, webview
import numpy as np, wave

BASE_DIR   = Path(__file__).resolve().parent
DATA_FILE  = BASE_DIR / "playlist.json"
TMP        = "/tmp/rocola_temp"
FFMPEG     = "/opt/homebrew/bin/"

pygame.mixer.init()

_lock = threading.Lock()
_estado = {
    "reproduciendo": False,
    "pausado":       False,
    "duracion":      0,
    "t_inicio":      0,
    "t_pausa_acum":  0,
    "t_pausa":       0,
    "cambiando":     False,
    "pending_id":    "",
}

def _set(**kw):
    with _lock: _estado.update(kw)
def _get(k):
    with _lock: return _estado[k]

# ── Sonidos ──
def _gen_wav(path, samples):
    a = np.array(samples, dtype=np.float64)
    mx = np.max(np.abs(a)) or 1
    a = (a / mx * 0.6 * 32767).astype(np.int16)
    with wave.open(path, "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100)
        w.writeframes(a.tobytes())

def _make_sounds():
    sr = 44100
    t = np.linspace(0, 0.8, int(sr * 0.8), False)
    a = np.zeros_like(t)
    a += np.exp(-t * 80) * (t < 0.05) * np.random.uniform(-1, 1, len(t)) * 0.5
    m = np.clip((t - 0.06) * 8, 0, 1) * np.exp(-(t - 0.06) * 2.5) * (t > 0.06)
    a += m * np.sin(2 * np.pi * 55 * t) * 0.12
    _gen_wav("/tmp/r_mec.wav", a)

    t2 = np.linspace(0, 0.3, int(sr * 0.3), False)
    cr = np.random.uniform(-1, 1, len(t2))
    for i in range(1, len(cr)): cr[i] = cr[i] * 0.08 + cr[i - 1] * 0.92
    b = cr * np.exp(-t2 * 5) * 0.4
    _gen_wav("/tmp/r_scr.wav", b)

SND_MEC = SND_SCR = None
try:
    _make_sounds()
    SND_MEC = pygame.mixer.Sound("/tmp/r_mec.wav"); SND_MEC.set_volume(0.35)
    SND_SCR = pygame.mixer.Sound("/tmp/r_scr.wav"); SND_SCR.set_volume(0.25)
except: pass

# ── yt-dlp helpers ──
def _clean_tmp():
    for f in os.listdir("/tmp"):
        if f.startswith("rocola_temp"):
            try: os.remove(f"/tmp/{f}")
            except: pass

def _search(query, n=8):
    opts = {"quiet": True, "noplaylist": True, "extract_flat": True}
    with yt_dlp.YoutubeDL(opts) as dl:
        res = dl.extract_info(f"ytsearch{n}:{query}", download=False)
    out = []
    for e in (res.get("entries") or []):
        vid = e.get("id", "")
        thumbs = e.get("thumbnails", [])
        thumb = thumbs[-1].get("url", "") if thumbs else f"https://img.youtube.com/vi/{vid}/hqdefault.jpg"
        out.append({
            "videoId": vid,
            "title": e.get("title", ""),
            "channel": e.get("channel", e.get("uploader", "")),
            "thumbnail": thumb,
            "duration": e.get("duration", 0) or 0,
        })
    return out

def _download_and_get_duration(url):
    """Descarga audio y obtiene duración en UN solo paso."""
    _clean_tmp()
    opts = {
        "quiet": True,
        "format": "bestaudio/best",
        "outtmpl": f"{TMP}.%(ext)s",
        "ffmpeg_location": FFMPEG,
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3"}],
    }
    with yt_dlp.YoutubeDL(opts) as dl:
        info = dl.extract_info(url, download=True)  # descarga E info de una
    dur = info.get("duration", 0) or 0
    return f"{TMP}.mp3", dur


class Api:

    def search(self, query, count=8):
        if not (query or "").strip():
            return {"error": "Escribe algo."}
        try:
            return {"results": _search(query, int(count))}
        except Exception as e:
            return {"error": str(e)[:80]}

    def search_genre(self, genre, count=8):
        terms = [f"mejores canciones {genre}", f"{genre} hits populares", f"playlist {genre} mix"]
        return self.search(random.choice(terms), count)

    def download_and_play(self, video_id, title=""):
        """Detiene, descarga y reproduce — todo en un hilo."""
        _set(cambiando=True, pending_id=video_id, reproduciendo=False, pausado=False)
        pygame.mixer.music.stop()
        if SND_MEC:
            try: SND_MEC.play()
            except: pass

        def worker():
            url = f"https://www.youtube.com/watch?v={video_id}"
            try:
                # Un solo paso: descarga + info
                archivo, dur = _download_and_get_duration(url)

                # Verificar que no pidieron otra canción
                if _get("pending_id") != video_id:
                    return

                pygame.mixer.music.load(archivo)
                pygame.mixer.music.play()
                _set(reproduciendo=True, pausado=False, cambiando=False,
                     duracion=dur, t_inicio=time.time(), t_pausa_acum=0)
            except Exception as ex:
                _set(cambiando=False, reproduciendo=False)
                print(f"[rocola] error descarga: {ex}")

        threading.Thread(target=worker, daemon=True).start()
        return {"ok": True, "status": "downloading"}

    def play_pause(self):
        with _lock:
            r, p = _estado["reproduciendo"], _estado["pausado"]
        if not r:
            return {"state": "stopped"}
        if p:
            pygame.mixer.music.unpause()
            with _lock:
                _estado["t_pausa_acum"] += time.time() - _estado["t_pausa"]
                _estado["pausado"] = False
            return {"state": "playing"}
        else:
            pygame.mixer.music.pause()
            if SND_SCR:
                try: SND_SCR.play()
                except: pass
            _set(pausado=True, t_pausa=time.time())
            return {"state": "paused"}

    def stop(self):
        pygame.mixer.music.stop()
        _set(reproduciendo=False, pausado=False, cambiando=False)
        return {"ok": True}

    def seek(self, ratio):
        with _lock:
            r, dur = _estado["reproduciendo"], _estado["duracion"]
        if not r or dur <= 0:
            return {"ok": False}
        pos = float(ratio) * dur
        pygame.mixer.music.play(start=pos)
        _set(t_inicio=time.time() - pos, t_pausa_acum=0)
        return {"ok": True}

    def set_volume(self, vol):
        pygame.mixer.music.set_volume(max(0, min(1, float(vol) / 100)))
        return {"ok": True}

    def get_status(self):
        with _lock:
            s = dict(_estado)
        if s["cambiando"]:
            return {"playing": False, "paused": False, "current": 0,
                    "duration": 0, "finished": False, "loading": True}
        if not s["reproduciendo"]:
            return {"playing": False, "paused": False, "current": 0,
                    "duration": 0, "finished": False, "loading": False}
        busy = pygame.mixer.music.get_busy()
        if not busy and not s["pausado"]:
            _set(reproduciendo=False)
            return {"playing": False, "paused": False, "current": 0,
                    "duration": 0, "finished": True, "loading": False}
        if s["pausado"]:
            elapsed = s["t_pausa"] - s["t_inicio"] - s["t_pausa_acum"]
        else:
            elapsed = time.time() - s["t_inicio"] - s["t_pausa_acum"]
        return {"playing": True, "paused": s["pausado"],
                "current": max(0, elapsed), "duration": s["duracion"],
                "finished": False, "loading": False}

    def save_playlist(self, tracks):
        try:
            # Limpiar propiedades internas de JS antes de guardar
            clean = []
            for t in tracks:
                clean.append({
                    "videoId": t.get("videoId", ""),
                    "title": t.get("title", ""),
                    "channel": t.get("channel", ""),
                    "thumbnail": t.get("thumbnail", ""),
                    "duration": t.get("duration", 0),
                })
            DATA_FILE.write_text(json.dumps(clean, ensure_ascii=False, indent=2), encoding="utf-8")
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)}

    def load_playlist(self):
        if not DATA_FILE.exists():
            return {"tracks": []}
        try:
            return {"tracks": json.loads(DATA_FILE.read_text(encoding="utf-8"))}
        except:
            return {"tracks": []}


def main():
    api = Api()
    index = str((BASE_DIR / "index.html").resolve())
    webview.create_window("Rocola", url=index, js_api=api,
                          width=1100, height=780, min_size=(900, 640), resizable=True)
    webview.start(debug=False)

if __name__ == "__main__":
    main()