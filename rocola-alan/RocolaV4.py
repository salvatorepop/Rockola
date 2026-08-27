import yt_dlp
import pygame
import customtkinter as ctk
import threading
import time
import os
import requests
from io import BytesIO
from PIL import Image, ImageDraw, ImageFilter
from PIL import ImageTk as PILImageTk
import tkinter as tk
import math
import random
import numpy as np
import wave

ctk.set_appearance_mode("light")

C = {
    'crema':       "#F5E6C8",
    'crema2':      "#E8D5A8",
    'marfil':      "#FFF8EC",
    'burgundy':    "#6B1624",
    'burgundy2':   "#8A2030",
    'verde':       "#1A4A3A",
    'verde2':      "#2A6A52",
    'mostaza':     "#C8960A",
    'mostaza2':    "#A07808",
    'cobre':       "#B87333",
    'cobre2':      "#8A5522",
    'carbon':      "#2A2420",
    'carbon2':     "#3A3430",
    'hueso':       "#F0E8D8",
    'teja':        "#C45030",
    'teja2':       "#A03820",
    'negro':       "#1A1610",
    'oro_viejo':   "#B89A50",
    'oro_mate':    "#98803A",
    'bulb_on':     "#FFD080",
    'bulb_off':    "#4A3820",
    'bulb_glow':   "#FFA030",
}

FFMPEG = '/opt/homebrew/bin/'
TMP = '/tmp/rocola_temp'

pygame.mixer.init()
lista_canciones = []
indice_actual = 0
esta_pausado = False
esta_reproduciendo = False
duracion_total = 0
tiempo_inicio = 0
tiempo_pausado_acum = 0
momento_pausa = 0
cambiando_cancion = False  # flag para evitar conflictos

# ── Sonido mecánico ──
def generar_sonido_mecanico():
    sr = 44100; dur = 1.2
    t = np.linspace(0, dur, int(sr*dur), False)
    audio = np.zeros_like(t)
    # Click solenoide
    click_env = np.exp(-t*80)*(t<0.05)
    audio += click_env * np.random.uniform(-1,1,len(t)) * 0.6
    # Motor
    ms = 0.08
    motor_env = np.clip((t-ms)*8,0,1)*np.exp(-(t-ms)*2)*(t>ms)
    audio += motor_env * np.sin(2*np.pi*55*t)*0.15
    audio += motor_env * np.sin(2*np.pi*82*t)*0.08
    # Clunk brazo
    ct = 0.5
    clunk_env = np.exp(-(t-ct)*120)*(t>ct)*(t<ct+0.08)
    audio += clunk_env * np.sin(2*np.pi*120*t)*0.5
    audio += clunk_env * np.random.uniform(-1,1,len(t))*0.3
    # Aguja
    nt = 0.7
    needle_env = np.clip((t-nt)*5,0,1)*np.exp(-(t-nt)*3)*(t>nt)
    vn = np.random.uniform(-1,1,len(t))
    for i in range(1,len(vn)): vn[i]=vn[i]*0.05+vn[i-1]*0.95
    audio += needle_env*vn*0.4
    # Click final
    c2t = 0.9
    c2_env = np.exp(-(t-c2t)*100)*(t>c2t)
    audio += c2_env * np.sin(2*np.pi*200*t)*0.15

    audio = audio/np.max(np.abs(audio))*0.7
    audio = (audio*32767).astype(np.int16)
    path = '/tmp/rocola_mecanico.wav'
    with wave.open(path,'w') as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr)
        wf.writeframes(audio.tobytes())
    return path

SONIDO_MECANICO = None
try:
    SONIDO_MECANICO = pygame.mixer.Sound(generar_sonido_mecanico())
    SONIDO_MECANICO.set_volume(0.5)
except: pass

# ── YouTube ──
def buscar_yt(t):
    with yt_dlp.YoutubeDL({'quiet':True,'noplaylist':True,'extract_flat':True}) as d:
        return d.extract_info(f"ytsearch5:{t}", download=False).get('entries',[])
def info_yt(u):
    with yt_dlp.YoutubeDL({'quiet':True,'skip_download':True,'ffmpeg_location':FFMPEG}) as d:
        return d.extract_info(u, download=False)
def descargar(u):
    for f in os.listdir('/tmp'):
        if f.startswith('rocola_temp'): os.remove(f'/tmp/{f}')
    with yt_dlp.YoutubeDL({'quiet':True,'format':'bestaudio/best','outtmpl':f'{TMP}.%(ext)s',
        'ffmpeg_location':FFMPEG,'postprocessors':[{'key':'FFmpegExtractAudio','preferredcodec':'mp3'}]}) as d:
        d.download([u])
    return f'{TMP}.mp3'
def get_thumb(u, sz=(140,140)):
    try:
        r = requests.get(u, timeout=5)
        return Image.open(BytesIO(r.content)).convert("RGBA").resize(sz, Image.LANCZOS)
    except: return None

def hacer_vinyl(portada=None, size=160):
    img = Image.new("RGBA",(size,size),(0,0,0,0))
    d = ImageDraw.Draw(img)
    d.ellipse([0,0,size-1,size-1], fill="#141210", outline="#302820")
    for r in range(8,size//2-16,3):
        cx=size//2; d.ellipse([cx-r,cx-r,cx+r,cx+r], outline="#1C1A16", width=1)
    if portada:
        cs=size//3; sm=portada.resize((cs,cs),Image.LANCZOS)
        mk=Image.new("L",(cs,cs),0); ImageDraw.Draw(mk).ellipse([0,0,cs-1,cs-1],fill=255)
        sm.putalpha(mk); off=(size-cs)//2; img.paste(sm,(off,off),sm)
    else:
        r=size//6;cx=size//2; d.ellipse([cx-r,cx-r,cx+r,cx+r],fill=C['mostaza'],outline=C['mostaza2'])
    cx=size//2; d.ellipse([cx-4,cx-4,cx+4,cx+4],fill="#C0B8A0",outline="#A09880")
    return img


class Rocola(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("ROCOLA")
        self.geometry("1100x750")
        self.resizable(False, False)
        self.configure(fg_color=C['crema'])

        self.resultados = []
        self.vista = "resultados"
        self._imgs = {}
        self._portadas = {}
        self._vu_level = 0
        self._vu_target = 0
        self._bulb_phase = 0

        self._construir()
        self._animar_vu()
        self._animar_luces()

    def _construir(self):
        ext = ctk.CTkFrame(self, fg_color=C['cobre2'], corner_radius=16)
        ext.pack(fill="both", expand=True, padx=8, pady=8)
        ext2 = ctk.CTkFrame(ext, fg_color=C['cobre'], corner_radius=14)
        ext2.pack(fill="both", expand=True, padx=2, pady=2)
        self.base = ctk.CTkFrame(ext2, fg_color=C['crema2'], corner_radius=12)
        self.base.pack(fill="both", expand=True, padx=2, pady=2)

        # Header con luces
        self.canvas_header = tk.Canvas(self.base, height=52, bg=C['burgundy'], highlightthickness=0)
        self.canvas_header.pack(fill="x", padx=10, pady=(10,0))

        # Franja deco
        self.canvas_deco = tk.Canvas(self.base, height=12, bg=C['crema2'], highlightthickness=0)
        self.canvas_deco.pack(fill="x", padx=10)
        self.after(50, self._dibujar_deco)

        # Vitrina
        vit_ext = ctk.CTkFrame(self.base, fg_color=C['cobre'], corner_radius=10, height=220)
        vit_ext.pack(fill="x", padx=10, pady=(4,0))
        vit_ext.pack_propagate(False)
        vit = ctk.CTkFrame(vit_ext, fg_color=C['negro'], corner_radius=8)
        vit.pack(fill="both", expand=True, padx=3, pady=3)
        self.canvas = tk.Canvas(vit, bg="#12100C", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)

        for txt,cmd,px,anch in [("◂",self._nav_izq,6,"w"),("▸",self._nav_der,-6,"e")]:
            b = ctk.CTkButton(vit, text=txt, width=24, height=44,
                fg_color=C['cobre2'], hover_color=C['cobre'],
                font=ctk.CTkFont(size=16), text_color=C['crema'],
                corner_radius=4, command=cmd)
            if anch=="w": b.place(x=px, rely=0.42, anchor=anch)
            else: b.place(relx=1.0, x=px, rely=0.42, anchor=anch)

        # Zona media
        ctk.CTkFrame(self.base, fg_color=C['cobre'], height=2).pack(fill="x", padx=10, pady=(4,0))

        media = ctk.CTkFrame(self.base, fg_color=C['crema2'], corner_radius=0)
        media.pack(fill="x", padx=10, pady=(2,0))
        media.grid_columnconfigure(1, weight=1)

        # VU izquierdo
        self.vu_izq = tk.Canvas(media, width=50, height=95, bg=C['crema2'], highlightthickness=0)
        self.vu_izq.grid(row=0, column=0, padx=(8,6), pady=4)

        # Centro
        centro = ctk.CTkFrame(media, fg_color="transparent")
        centro.grid(row=0, column=1, sticky="ew", pady=2)

        self.lbl_titulo = ctk.CTkLabel(centro, text="INSERTE SU SELECCIÓN",
            font=ctk.CTkFont(family="Georgia",size=15,weight="bold"), text_color=C['burgundy'])
        self.lbl_titulo.pack(pady=(4,0))

        self.lbl_estado = ctk.CTkLabel(centro, text="",
            font=ctk.CTkFont(family="Georgia",size=10), text_color=C['cobre2'])
        self.lbl_estado.pack()

        bf = ctk.CTkFrame(centro, fg_color="transparent")
        bf.pack(fill="x", padx=50, pady=(2,0))
        self.lbl_ta = ctk.CTkLabel(bf, text="0:00",
            font=ctk.CTkFont(family="Courier",size=10), text_color=C['cobre2'])
        self.lbl_ta.pack(side="left")
        self.lbl_tt = ctk.CTkLabel(bf, text="0:00",
            font=ctk.CTkFont(family="Courier",size=10), text_color=C['cobre2'])
        self.lbl_tt.pack(side="right")

        self.barra = ctk.CTkProgressBar(centro, height=5,
            fg_color=C['carbon'], progress_color=C['mostaza'], corner_radius=3)
        self.barra.set(0)
        self.barra.pack(fill="x", padx=50, pady=(1,4))

        # Controles
        ctrl = ctk.CTkFrame(centro, fg_color="transparent")
        ctrl.pack(pady=(0,4))

        bs = {'height':38,'corner_radius':6,'border_width':2,'border_color':C['cobre']}

        ctk.CTkButton(ctrl, text="⏮  PREV", width=85,
            fg_color=C['burgundy'], hover_color=C['burgundy2'],
            font=ctk.CTkFont(family="Georgia",size=11),
            text_color=C['crema'], command=self.anterior, **bs).grid(row=0,column=0,padx=3)

        self.btn_play = ctk.CTkButton(ctrl, text="▶   PLAY", width=120, height=42,
            fg_color=C['verde'], hover_color=C['verde2'],
            font=ctk.CTkFont(family="Georgia",size=14,weight="bold"),
            text_color=C['crema'], corner_radius=6,
            border_width=3, border_color=C['oro_viejo'], command=self.play_pause)
        self.btn_play.grid(row=0,column=1,padx=3)

        ctk.CTkButton(ctrl, text="NEXT  ⏭", width=85,
            fg_color=C['burgundy'], hover_color=C['burgundy2'],
            font=ctk.CTkFont(family="Georgia",size=11),
            text_color=C['crema'], command=self.siguiente, **bs).grid(row=0,column=2,padx=3)

        # VU derecho
        self.vu_der = tk.Canvas(media, width=50, height=95, bg=C['crema2'], highlightthickness=0)
        self.vu_der.grid(row=0, column=2, padx=(6,4), pady=4)

        # Volumen con barra vintage
        vol_frame = ctk.CTkFrame(media, fg_color="transparent", width=130)
        vol_frame.grid(row=0, column=3, padx=(4,10), pady=4)

        ctk.CTkLabel(vol_frame, text="V O L U M E N",
            font=ctk.CTkFont(family="Georgia",size=8), text_color=C['cobre2']).pack(pady=(20,4))

        self.vol = ctk.CTkSlider(vol_frame, from_=0, to=1, width=110,
            fg_color=C['carbon'], progress_color=C['mostaza'],
            button_color=C['cobre'], button_hover_color=C['mostaza'],
            command=lambda v: pygame.mixer.music.set_volume(float(v)))
        self.vol.set(0.7)
        self.vol.pack()
        pygame.mixer.music.set_volume(0.7)

        # Panel inferior
        ctk.CTkFrame(self.base, fg_color=C['cobre'], height=2).pack(fill="x", padx=10, pady=(4,0))

        inferior = ctk.CTkFrame(self.base, fg_color=C['burgundy'], corner_radius=10)
        inferior.pack(fill="both", expand=True, padx=10, pady=(4,10))
        inferior.grid_columnconfigure(0, weight=1)
        inferior.grid_rowconfigure(1, weight=1)

        top = ctk.CTkFrame(inferior, fg_color="transparent")
        top.grid(row=0, column=0, sticky="ew", padx=8, pady=(8,4))
        top.grid_columnconfigure(0, weight=1)

        busq = ctk.CTkFrame(top, fg_color=C['carbon'], corner_radius=6)
        busq.grid(row=0, column=0, sticky="ew", padx=(0,8))
        busq.grid_columnconfigure(0, weight=1)

        self.entrada = ctk.CTkEntry(busq, placeholder_text="Buscar canción...",
            font=ctk.CTkFont(family="Georgia",size=13), fg_color="transparent",
            border_width=0, text_color=C['crema'],
            placeholder_text_color=C['cobre'], height=34)
        self.entrada.grid(row=0,column=0,sticky="ew",padx=(10,4),pady=3)
        self.entrada.bind('<Return>', lambda e: self.buscar())

        ctk.CTkButton(busq, text="BUSCAR", width=65, height=28,
            fg_color=C['mostaza2'], hover_color=C['mostaza'],
            font=ctk.CTkFont(family="Georgia",size=10,weight="bold"),
            text_color=C['negro'], corner_radius=4,
            command=self.buscar).grid(row=0,column=1,padx=(0,4),pady=3)

        tabs = ctk.CTkFrame(top, fg_color="transparent")
        tabs.grid(row=0, column=1)

        self.btn_tr = ctk.CTkButton(tabs, text="RESULTADOS", width=90, height=26,
            fg_color=C['teja'], hover_color=C['teja2'],
            font=ctk.CTkFont(family="Georgia",size=9,weight="bold"),
            text_color=C['crema'], corner_radius=4,
            command=lambda: self._tab("resultados"))
        self.btn_tr.pack(side="left", padx=(0,4))

        self.btn_tl = ctk.CTkButton(tabs, text="MI LISTA", width=70, height=26,
            fg_color=C['carbon2'], hover_color=C['carbon'],
            font=ctk.CTkFont(family="Georgia",size=9),
            text_color=C['cobre'], corner_radius=4,
            command=lambda: self._tab("lista"))
        self.btn_tl.pack(side="left")

        self.scroll = ctk.CTkScrollableFrame(inferior, fg_color=C['carbon'],
            corner_radius=6, scrollbar_button_color=C['cobre2'],
            scrollbar_button_hover_color=C['mostaza'])
        self.scroll.grid(row=1, column=0, sticky="nsew", padx=8, pady=(0,6))
        self.scroll.grid_columnconfigure(0, weight=1)

        self.lbl_info = ctk.CTkLabel(inferior, text="",
            font=ctk.CTkFont(family="Georgia",size=10), text_color=C['cobre'])
        self.lbl_info.grid(row=2, column=0, pady=(0,6))

        self.after(100, self._dibujar_vitrina)

    # ── Animaciones ──
    def _animar_luces(self):
        self._bulb_phase = (self._bulb_phase + 1) % 100
        h = self.canvas_header
        h.delete("all")
        h.update_idletasks()
        w = h.winfo_width() or 1060

        h.create_rectangle(0,0,w,52, fill=C['burgundy'], outline="")

        for i in range(0,w,28):
            h.create_polygon(i,0,i+14,7,i+28,0, fill=C['burgundy2'], outline="")
            h.create_polygon(i,52,i+14,45,i+28,52, fill=C['burgundy2'], outline="")

        h.create_line(0,8,w,8, fill=C['oro_viejo'], width=1)
        h.create_line(0,44,w,44, fill=C['oro_viejo'], width=1)

        num_bulbs = 20
        for i in range(num_bulbs):
            x = 40 + i * ((w-80)/(num_bulbs-1))
            group = i % 3
            phase = (self._bulb_phase // 8) % 3
            encendida = (group == phase) or (group == (phase+1)%3)
            if encendida:
                h.create_oval(x-8,11,x+8,21, fill="", outline=C['bulb_glow'], width=2)
                h.create_oval(x-4,13,x+4,19, fill=C['bulb_on'], outline=C['mostaza'])
                h.create_oval(x-3,35,x+3,41, fill=C['bulb_on'], outline="", stipple="gray50")
            else:
                h.create_oval(x-3,14,x+3,18, fill=C['bulb_off'], outline=C['carbon2'])

        h.create_text(w//2+1,27, text="R O C O L A",
            font=("Georgia",22,"bold"), fill="#3A1010")
        h.create_text(w//2,26, text="R O C O L A",
            font=("Georgia",22,"bold"), fill=C['crema'])

        for x in [55, w-55]:
            h.create_polygon(x,18,x+8,26,x,34,x-8,26,
                fill=C['oro_viejo'], outline=C['mostaza'])

        self.after(150, self._animar_luces)

    def _dibujar_deco(self):
        d = self.canvas_deco; d.update_idletasks()
        w = d.winfo_width() or 1060; d.delete("all")
        d.create_rectangle(0,0,w,12, fill=C['crema2'], outline="")
        for i in range(0,w,18):
            d.create_line(i,1,i+9,11, fill=C['oro_mate'], width=1)
            d.create_line(i+9,11,i+18,1, fill=C['oro_mate'], width=1)
        d.create_line(0,0,w,0, fill=C['cobre'], width=1)
        d.create_line(0,11,w,11, fill=C['cobre'], width=1)

    def _animar_vu(self):
        if esta_reproduciendo and not esta_pausado:
            self._vu_target = random.uniform(0.3, 0.95)
        else:
            self._vu_target = 0
        self._vu_level += (self._vu_target - self._vu_level) * 0.3

        for cv in [self.vu_izq, self.vu_der]:
            cv.delete("all")
            cw,ch = 50,95
            cv.create_rectangle(4,4,cw-4,ch-4, fill=C['marfil'], outline=C['cobre'], width=2)
            cv.create_text(cw//2,12, text="VU", font=("Georgia",7,"bold"), fill=C['burgundy'])
            for i in range(6):
                y=80-i*11
                cv.create_line(9,y,14,y, fill=C['carbon2'], width=1)
                cv.create_line(36,y,41,y, fill=C['carbon2'], width=1)
            nivel = self._vu_level
            bar_h = int(nivel*55)
            y_top = 80-bar_h
            color = C['verde'] if nivel<0.5 else C['mostaza'] if nivel<0.8 else C['teja']
            if bar_h>0: cv.create_rectangle(13,y_top,37,80, fill=color, outline="")
            cv.create_line(7,y_top,43,y_top, fill=C['burgundy'], width=2)
            if cv == self.vu_der:
                self._vu_target = random.uniform(0.2,0.9) if esta_reproduciendo else 0
        self.after(120, self._animar_vu)

    # ── Vitrina (sin loop constante) ──
    def _dibujar_vitrina(self):
        self.canvas.delete("all")
        self._imgs.clear()
        self.canvas.update_idletasks()
        w = self.canvas.winfo_width() or 1060
        h = self.canvas.winfo_height() or 210
        cy = h//2 - 5

        for i in range(h):
            v = max(0, 8-abs(i-h//2)//8)
            self.canvas.create_line(0,i,w,i, fill=f"#{v+12:02x}{v+10:02x}{v+8:02x}")

        if not lista_canciones:
            self.canvas.create_text(w//2,cy, text="♪     ♪     ♪",
                font=("Georgia",28), fill=C['oro_mate'])
            self.canvas.create_text(w//2,cy+35, text="A G R E G U E   C A N C I O N E S",
                font=("Georgia",11), fill=C['cobre2'])
            return

        cx = w//2

        for off in range(1,30):
            idx = indice_actual-off
            if idx<0: break
            x = cx-105-off*14
            if x<40: break
            self._disco_canto(x,cy,idx,130,8,off)

        for off in range(1,30):
            idx = indice_actual+off
            if idx>=len(lista_canciones): break
            x = cx+105+off*14
            if x>w-40: break
            self._disco_canto(x,cy,idx,130,8,off)

        portada = self._portadas.get(indice_actual)
        vinyl = hacer_vinyl(portada, 160)

        sombra = Image.new("RGBA",(170,170),(0,0,0,0))
        ImageDraw.Draw(sombra).ellipse([8,8,168,168], fill=(10,8,4,100))
        sombra = sombra.filter(ImageFilter.GaussianBlur(6))
        tk_s = PILImageTk.PhotoImage(sombra)
        self._imgs['sh'] = tk_s
        self.canvas.create_image(cx+2,cy+2, image=tk_s, anchor="center")

        aro = Image.new("RGBA",(176,176),(0,0,0,0))
        ImageDraw.Draw(aro).ellipse([0,0,175,175], outline=C['oro_viejo'], width=3)
        tk_aro = PILImageTk.PhotoImage(aro)
        self._imgs['aro'] = tk_aro
        self.canvas.create_image(cx,cy, image=tk_aro, anchor="center")

        tk_v = PILImageTk.PhotoImage(vinyl)
        self._imgs['vc'] = tk_v
        self.canvas.create_image(cx,cy, image=tk_v, anchor="center")

        cod = self._cod(indice_actual)
        self.canvas.create_text(cx,cy+92, text=f"— {cod} —",
            font=("Georgia",11,"bold"), fill=C['mostaza'])

        thumb = lista_canciones[indice_actual].get('miniatura','')
        if thumb and indice_actual not in self._portadas:
            def _l(u=thumb,i=indice_actual):
                img = get_thumb(u,(140,140))
                if img: self._portadas[i]=img; self.after(0, self._dibujar_vitrina)
            threading.Thread(target=_l, daemon=True).start()

    def _disco_canto(self, x, cy, idx, h, t, offset):
        colores = [C['mostaza'],C['teja'],C['verde'],C['cobre'],C['burgundy']]
        img = Image.new("RGBA",(t+6,h),(0,0,0,0))
        d = ImageDraw.Draw(img)
        d.rectangle([3,4,t+2,h-4], fill="#181614")
        d.line([(3+t//2,6),(3+t//2,h-6)], fill="#242220", width=1)
        d.rectangle([3,4,t+2,6], fill="#222018")
        d.rectangle([3,h-6,t+2,h-4], fill="#222018")
        lc = colores[idx%len(colores)]
        ly=h//2; d.rectangle([4,ly-6,t+1,ly+6], fill=lc)
        alpha = max(50, 255-offset*20)
        if alpha<255:
            r,g,b,a = img.split()
            a = a.point(lambda p, al=alpha: int(p*al/255))
            img.putalpha(a)
        tk_img = PILImageTk.PhotoImage(img)
        self._imgs[f'e_{idx}'] = tk_img
        iid = self.canvas.create_image(x,cy, image=tk_img, anchor="center")
        self.canvas.tag_bind(iid, "<Button-1>", lambda e,i=idx: self._ir_a(i))

    def _ir_a(self, i):
        global indice_actual; indice_actual=i
        self._dibujar_vitrina(); self._act_titulo()

    def _nav_izq(self):
        global indice_actual
        if indice_actual>0: indice_actual-=1; self._dibujar_vitrina(); self._act_titulo()

    def _nav_der(self):
        global indice_actual
        if indice_actual<len(lista_canciones)-1: indice_actual+=1; self._dibujar_vitrina(); self._act_titulo()

    def _act_titulo(self):
        if lista_canciones:
            c=lista_canciones[indice_actual]
            self.lbl_titulo.configure(text=c['titulo'][:45].upper())
            self.lbl_estado.configure(text=f"{self._cod(indice_actual)} — Seleccionado")

    def _cod(self, i): return f"{chr(65+i//5)}{(i%5)+1}"

    def _sonar_mecanico(self):
        if SONIDO_MECANICO:
            try: SONIDO_MECANICO.play()
            except: pass

    # ── Tabs ──
    def _tab(self, t):
        self.vista = t
        if t == "resultados":
            self.btn_tr.configure(fg_color=C['teja'],text_color=C['crema'],
                font=ctk.CTkFont(family="Georgia",size=9,weight="bold"))
            self.btn_tl.configure(fg_color=C['carbon2'],text_color=C['cobre'],
                font=ctk.CTkFont(family="Georgia",size=9))
            self._pintar_res()
        else:
            self.btn_tl.configure(fg_color=C['teja'],text_color=C['crema'],
                font=ctk.CTkFont(family="Georgia",size=9,weight="bold"))
            self.btn_tr.configure(fg_color=C['carbon2'],text_color=C['cobre'],
                font=ctk.CTkFont(family="Georgia",size=9))
            self._pintar_lista()

    def _limpiar(self):
        for w in self.scroll.winfo_children(): w.destroy()

    def _pintar_res(self):
        self._limpiar()
        if not self.resultados:
            ctk.CTkLabel(self.scroll,text="Sin resultados",
                font=ctk.CTkFont(family="Georgia",size=12),text_color=C['cobre']).pack(pady=12)
            return
        self.lbl_info.configure(text=f"{len(self.resultados)} encontradas")
        for i,r in enumerate(self.resultados):
            self._fila(r.get('title',''),i,True)

    def _pintar_lista(self):
        self._limpiar()
        if not lista_canciones:
            ctk.CTkLabel(self.scroll,text="Lista vacía",
                font=ctk.CTkFont(family="Georgia",size=12),text_color=C['cobre']).pack(pady=12)
            return
        self.lbl_info.configure(text=f"{len(lista_canciones)} canciones")
        for i,c in enumerate(lista_canciones):
            self._fila(c['titulo'],i,False)

    def _fila(self, titulo, idx, es_res):
        activo = (not es_res) and (idx==indice_actual) and esta_reproduciendo
        fila = ctk.CTkFrame(self.scroll,
            fg_color=C['carbon2'] if not activo else C['burgundy'],
            corner_radius=4, height=36)
        fila.pack(fill="x",pady=1,padx=2)
        fila.pack_propagate(False)
        fila.grid_columnconfigure(1, weight=1)

        cod=self._cod(idx)
        cc=C['mostaza'] if activo else C['oro_mate']
        ctk.CTkLabel(fila,text=cod,font=ctk.CTkFont(family="Courier",size=11,weight="bold"),
            text_color=cc,width=34).grid(row=0,column=0,padx=(6,4))

        t=titulo[:42]+"…" if len(titulo)>42 else titulo
        tc=C['crema'] if activo else C['hueso']
        ctk.CTkLabel(fila,text=t,font=ctk.CTkFont(family="Georgia",size=11),
            text_color=tc,anchor="w").grid(row=0,column=1,sticky="ew",padx=4)

        if es_res:
            ctk.CTkButton(fila,text="+ Agregar",width=65,height=24,
                fg_color=C['verde'],hover_color=C['verde2'],
                font=ctk.CTkFont(family="Georgia",size=9),
                text_color=C['crema'],corner_radius=4,
                command=lambda i=idx:self.agregar(i)).grid(row=0,column=2,padx=(2,6))
        else:
            ctk.CTkButton(fila,text="▶ Play" if not activo else "♪♪",
                width=50,height=24,
                fg_color=C['verde'] if not activo else C['mostaza'],
                hover_color=C['verde2'],
                font=ctk.CTkFont(family="Georgia",size=9),
                text_color=C['crema'] if not activo else C['negro'],
                corner_radius=4,
                command=lambda i=idx:self.repr_desde(i)).grid(row=0,column=2,padx=(2,6))

    # ── Acciones ──
    def buscar(self):
        texto=self.entrada.get().strip()
        if not texto: return
        self.lbl_info.configure(text="Buscando...")
        self.update()
        def hilo():
            try:
                r=buscar_yt(texto); self.resultados=r
                self.after(0,self._mostrar_busq)
            except Exception as e:
                self.after(0,lambda:self.lbl_info.configure(text=f"Error: {str(e)[:35]}"))
        threading.Thread(target=hilo,daemon=True).start()

    def _mostrar_busq(self):
        self.vista="resultados"
        self.btn_tr.configure(fg_color=C['teja'],text_color=C['crema'],
            font=ctk.CTkFont(family="Georgia",size=9,weight="bold"))
        self.btn_tl.configure(fg_color=C['carbon2'],text_color=C['cobre'],
            font=ctk.CTkFont(family="Georgia",size=9))
        self._pintar_res()

    def agregar(self, idx):
        r=self.resultados[idx]; thumbs=r.get('thumbnails') or []
        lista_canciones.append({
            'titulo':r.get('title',''), 'url':f"https://www.youtube.com/watch?v={r['id']}",
            'miniatura':thumbs[-1].get('url','') if thumbs else '',
        })
        self.lbl_info.configure(text="✅ Agregada")
        self._dibujar_vitrina()

    def play_pause(self):
        global esta_pausado,esta_reproduciendo,tiempo_pausado_acum,momento_pausa
        if not lista_canciones:
            self.lbl_estado.configure(text="Agregue canciones"); return
        if esta_reproduciendo and not esta_pausado:
            pygame.mixer.music.pause();esta_pausado=True;momento_pausa=time.time()
            self.btn_play.configure(text="▶   PLAY");self.lbl_estado.configure(text="Pausado");return
        if esta_pausado:
            pygame.mixer.music.unpause();esta_pausado=False
            tiempo_pausado_acum+=time.time()-momento_pausa
            self.btn_play.configure(text="⏸   PAUSE");self.lbl_estado.configure(text="Reproduciendo");return
        self._sonar_mecanico()
        self._play()

    def _play(self):
        global esta_reproduciendo,esta_pausado,duracion_total,tiempo_inicio,tiempo_pausado_acum,cambiando_cancion
        if not lista_canciones or cambiando_cancion: return
        cambiando_cancion = True

        # Detener lo que esté sonando
        pygame.mixer.music.stop()
        esta_reproduciendo = False

        c=lista_canciones[indice_actual]
        self.lbl_titulo.configure(text=c['titulo'][:45].upper())
        self.lbl_estado.configure(text="Cargando...")
        self.btn_play.configure(text="...",state="disabled")
        self._dibujar_vitrina()

        def hilo():
            global esta_reproduciendo,esta_pausado,duracion_total,tiempo_inicio,tiempo_pausado_acum,cambiando_cancion
            try:
                info=info_yt(c['url']);duracion_total=info.get('duration',0)
                thumb=c.get('miniatura') or info.get('thumbnail','')
                archivo=descargar(c['url'])
                pygame.mixer.music.load(archivo);pygame.mixer.music.play()
                esta_reproduciendo=True;esta_pausado=False
                tiempo_inicio=time.time();tiempo_pausado_acum=0
                cambiando_cancion=False
                self.after(0,lambda:self._ui_play(thumb))
                self._monitor()
            except Exception as e:
                cambiando_cancion=False
                self.after(0,lambda:self.lbl_estado.configure(text=f"Error: {str(e)[:35]}"))
                self.after(0,lambda:self.btn_play.configure(text="▶   PLAY",state="normal"))
        threading.Thread(target=hilo,daemon=True).start()

    def _ui_play(self, thumb):
        self.btn_play.configure(text="⏸   PAUSE",state="normal")
        c=lista_canciones[indice_actual]
        self.lbl_titulo.configure(text=c['titulo'][:45].upper())
        self.lbl_estado.configure(text=f"♪ {self._cod(indice_actual)} — Reproduciendo")
        self.lbl_tt.configure(text=self._fmt(duracion_total));self.barra.set(0)
        self._dibujar_vitrina()
        if self.vista=="lista": self._pintar_lista()

    def _monitor(self):
        def loop():
            global esta_reproduciendo,indice_actual
            while esta_reproduciendo:
                if cambiando_cancion:
                    break
                if not esta_pausado and pygame.mixer.music.get_busy():
                    t=time.time()-tiempo_inicio-tiempo_pausado_acum
                    self.after(0,lambda v=t:self._tick(v))
                elif not esta_pausado and not pygame.mixer.music.get_busy() and not cambiando_cancion:
                    if indice_actual<len(lista_canciones)-1:
                        indice_actual+=1
                        self.after(0,self._sonar_mecanico)
                        time.sleep(1.2)
                        if not cambiando_cancion:
                            self.after(0,self._play)
                    else:
                        esta_reproduciendo=False
                        self.after(0,lambda:self.btn_play.configure(text="▶   PLAY"))
                        self.after(0,lambda:self.lbl_estado.configure(text="Fin de la lista"))
                    break
                time.sleep(0.5)
        threading.Thread(target=loop,daemon=True).start()

    def _tick(self,t):
        if duracion_total>0:
            self.barra.set(min(t/duracion_total,1.0))
            self.lbl_ta.configure(text=self._fmt(int(t)))

    def siguiente(self):
        global indice_actual
        if indice_actual<len(lista_canciones)-1:
            self._sonar_mecanico()
            indice_actual+=1
            self._play()

    def anterior(self):
        global indice_actual
        if indice_actual>0:
            self._sonar_mecanico()
            indice_actual-=1
            self._play()

    def repr_desde(self, i):
        global indice_actual
        self._sonar_mecanico()
        indice_actual=i
        self._play()

    @staticmethod
    def _fmt(s): s=int(s); return f"{s//60}:{s%60:02d}"

if __name__=="__main__":
    Rocola().mainloop()