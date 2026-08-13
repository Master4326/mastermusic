/* ==========================================================
   MODO CINE — pantalla completa con las MISMAS animaciones del
   modo edit + carátula girando como vinilo al lado.
   Truco: mueve el elemento real #lyricsEdit dentro del cine
   (las animaciones calculan su tamaño según el contenedor, así
   que a pantalla completa crecen solas) y pide a LyricsModule
   que fuerce el render tipo edit sin cambiar la preferencia.
   ========================================================== */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const root = $('cinema');
  const lyricsEdit = $('lyricsEdit');
  if (!root || !lyricsEdit) return;

  const bg = $('cinemaBg');
  const brazo = $('cinemaBrazo');
  const stage = $('cinemaStage');
  const msg = $('cinemaMsg');
  const cover = $('cinemaCover');
  const title = $('cinemaTitle');
  const artist = $('cinemaArtist');
  const wave = $('cinemaWave');
  const waveCtx = wave ? wave.getContext('2d') : null;
  const mainFill = $('progressFill');
  const openBtn = $('cinemaBtn');
  const closeBtn = $('cinemaClose');
  // capas reactivas y de contexto
  const aura = $('cinemaAura');
  const label = $('cinemaLabel');
  const destellos = $('cinDestellos');
  const clave = $('cinemaClave');
  const ghostPrev = $('cinemaPrev');
  const ghostNext = $('cinemaNext');
  const gapEl = $('cinemaGap');
  const ctl = $('cinemaCtl');
  const timeCur = $('cinTimeCur');
  const timeTot = $('cinTimeTot');

  let open = false;
  let rafId = null;
  let lastTrack = null;
  // marca la posición original de #lyricsEdit para devolverlo al cerrar
  const slot = document.createComment('lyricsEdit-slot');

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const q = Math.floor(s % 60);
    return `${m}:${q < 10 ? '0' : ''}${q}`;
  };
  const calma = () => !!(window.MMSettings && window.MMSettings.reduceMotion());

  const paintTrack = () => {
    const t = window.PlayerCore && window.PlayerCore.state.currentTrack;
    const img = t && t.cover ? `url("${t.cover}")` : '';
    bg.style.backgroundImage = img;
    // la carátula va en la ETIQUETA, no en todo el disco: el resto es vinilo
    if (label) label.style.backgroundImage = img;
    cover.style.backgroundImage = img;
    root.classList.toggle('no-cover', !img);
    title.textContent = t ? t.name : 'Sin canción';
    artist.textContent = t ? (t.artist || '') : 'reproduce algo para empezar';
  };

  /* ══════ La pantalla respira con la música ══════
     Lee BeatModule (el detector de verdad: bombo, platillos, drops) y pinta.
     Aquí NO se detecta nada, igual que en ambient.js. Todo lo que se escribe
     es transform / opacity, y solo si el valor cambió de verdad: a 60 fps,
     repetir una escritura de estilo es trabajo de estilo tirado. */
  const DEST_POOL = 26;     // los destellos se reciclan, no se crean por golpe
  let destPool = [];
  let destNext = 0;
  let previoFx = {};

  const escribirVar = (el, nombre, val) => {
    if (!el) return;
    const k = el.id + nombre;
    if (previoFx[k] === val) return;
    previoFx[k] = val;
    el.style.setProperty(nombre, val);
  };

  const construirDestellos = () => {
    if (!destellos || destPool.length) return;
    for (let i = 0; i < DEST_POOL; i++) {
      const d = document.createElement('span');
      d.className = 'cin-destello';
      destellos.appendChild(d);
      destPool.push(d);
    }
  };

  const lanzarDestello = (fuerza) => {
    if (!destPool.length) return;
    const d = destPool[destNext];
    destNext = (destNext + 1) % destPool.length;
    // posición nueva por disparo; el nodo se reutiliza
    d.style.setProperty('--x', (Math.random() * 100).toFixed(1) + '%');
    d.style.setProperty('--y', (8 + Math.random() * 84).toFixed(1) + '%');
    d.style.setProperty('--s', (0.5 + fuerza * 0.9).toFixed(2));
    d.style.setProperty('--g', (Math.random() * 90).toFixed(0) + 'deg');
    // reiniciar la animación: quitar clase, forzar reflow, volver a ponerla
    d.classList.remove('on');
    void d.offsetWidth;
    d.classList.add('on');
  };

  /* El aura NO parpadea con cada bombo — eso es justo lo que se sentía como
     flashazo. Sigue dos valores muy suavizados: la energía de la canción y un
     nivel de graves con subida lenta. El resultado es que en una balada el
     aura está recogida y quieta, y en un temazo está abierta y llena de
     color, pero sin saltos por golpe. */
  let auraE = 0, auraB = 0;

  const pintarRitmo = () => {
    const B = window.BeatModule && window.BeatModule.get ? window.BeatModule.get() : null;
    if (!B) return;
    const tranquilo = calma();

    if (tranquilo) {
      escribirVar(aura, '--au-e', '0');
      escribirVar(aura, '--au-b', '0');
      return;
    }

    // suavizados MUY lentos a propósito: esto es el carácter del tema, no el golpe
    auraE += (B.energia - auraE) * 0.02;
    auraB += (Math.min(1, B.graves * 1.15) - auraB) * (B.graves > auraB ? 0.06 : 0.03);
    escribirVar(aura, '--au-e', auraE.toFixed(3));
    escribirVar(aura, '--au-b', auraB.toFixed(3));

    // los destellos de los platillos se quedan: son finos y no ciegan
    if (B.brilloAhora && B.brilloFuerza > 0.25) {
      const n = 1 + Math.round(B.brilloFuerza * 2);
      for (let i = 0; i < n; i++) lanzarDestello(B.brilloFuerza);
    }
  };

  /* ══════ Brazo del tocadiscos ══════
     Geometría real: el pivote está FUERA del plato (arriba a la derecha) y el
     brazo tiene largo fijo, así que la aguja describe un arco de fuera hacia
     dentro conforme avanza la canción. Los ángulos salen de resolver dónde
     cae la punta para el surco exterior y el interior con ese pivote y ese
     largo — por eso son números "raros" y no redondos.
       -77.8° = surco exterior (empieza)   -51.6° = surco interior (acaba)
       -90°   = aparcado, la aguja levantada fuera del disco */
  const BR_FUERA = -77.8, BR_DENTRO = -51.6, BR_PARADO = -90;
  const pintarBrazo = () => {
    const p = PC();
    const sonando = !!(p && (p.state.isPlaying || (p.audio && !p.audio.paused)));
    const dur = duracion();
    let ang = BR_PARADO;
    if (sonando && dur > 0) {
      const avance = clamp(tiempoActual() / dur, 0, 1);
      ang = BR_FUERA + (BR_DENTRO - BR_FUERA) * avance;
    }
    // una décima de grado basta: en una canción de 3 min son ~260 escrituras
    // en total, no 60 por segundo
    escribirVar(brazo, '--br-ang', ang.toFixed(1) + 'deg');
    if (brazo) brazo.classList.toggle('apoyado', sonando);
  };

  /* ══════ Contexto de la letra: verso anterior y siguiente en fantasma ══════
     Un verso suelto en medio de la nada no cuenta una historia. Los lyric
     videos buenos siempre dejan ver de dónde vienes y a dónde vas. */
  let ghostIdx = -99;
  const pintarGhosts = (sync) => {
    if (!ghostPrev || !ghostNext) return;
    const lines = (sync && sync.lines) || [];
    const idx = sync ? sync.idx : -1;
    if (idx === ghostIdx) return;
    ghostIdx = idx;
    const txt = (i) => (i >= 0 && i < lines.length && lines[i].text ? lines[i].text : '');
    const p = txt(idx - 1), n = txt(idx + 1);
    ghostPrev.textContent = p;
    ghostNext.textContent = n;
    ghostPrev.classList.toggle('on', !!p);
    ghostNext.classList.toggle('on', !!n);

    // Palabra clave: la más larga del verso actual, enorme y translúcida
    if (clave) {
      const actual = txt(idx);
      const pal = actual
        ? actual.split(/\s+/).filter(Boolean)
            .reduce((mx, w) => (w.replace(/[^\wáéíóúñ]/gi, '').length >
                                mx.replace(/[^\wáéíóúñ]/gi, '').length ? w : mx), '')
        : '';
      const limpia = pal.replace(/[^\wáéíóúñ']/gi, '');
      const nueva = limpia.length >= 4 ? limpia.toUpperCase() : '';
      if (clave.textContent !== nueva) {
        clave.textContent = nueva;
        clave.classList.remove('on');
        if (nueva) { void clave.offsetWidth; clave.classList.add('on'); }
      }
    }
  };

  /* ══════ Huecos instrumentales, en grande ══════
     Mismo criterio que la vista lista: más de 6 s entre versos (o una intro
     larga) y salen los tres puntos llenándose. */
  const GAP_MIN = 6, GAP_LEAD = 1.8;
  let gapVis = false, gapUlt = -1;
  const pintarGap = (sync, t) => {
    if (!gapEl) return;
    const lines = (sync && sync.lines) || [];
    const idx = sync ? sync.idx : -1;
    let visible = false, p = 0;
    if (lines.length && lines[0].time >= 0 && t >= 0) {
      const sig = lines[idx + 1];
      const cur = idx >= 0 ? lines[idx] : null;
      if (sig) {
        const desde = cur ? cur.time : 0;
        if (sig.time - desde > GAP_MIN) {
          const ini = desde + (cur ? GAP_LEAD : 0);
          if (t >= ini && t < sig.time) {
            visible = true;
            p = clamp((t - ini) / Math.max(0.1, sig.time - ini), 0, 1);
          }
        }
      }
    }
    if (visible !== gapVis) {
      gapVis = visible;
      gapEl.hidden = !visible;
      gapUlt = -1;
    }
    if (!visible) return;
    const q = Math.round(p * 100);
    if (q !== gapUlt) { gapUlt = q; gapEl.style.setProperty('--gp', q / 100); }
  };

  const paintMsg = () => {
    const sync = window.LyricsModule && window.LyricsModule.getSync
      ? window.LyricsModule.getSync() : null;
    const lines = (sync && sync.lines) || [];
    const synced = lines.length > 0 && lines[0].time >= 0;
    const text = synced ? '' : (lines.length ? '♪ letra sin sincronizar ♪' : '♪ ♪ ♪');
    if (msg.textContent !== text) msg.textContent = text;
    msg.hidden = synced;
  };

  // ---- Onda de progreso: espectro real + porción reproducida en acento ----
  let wW = 0, wH = 0, dpr = 1;
  const sizeWave = () => {
    if (!wave) return;
    const rect = wave.getBoundingClientRect();
    if (!rect.width) return;
    dpr = Math.max(1, window.devicePixelRatio || 1);
    wW = Math.floor(rect.width);
    wH = Math.floor(rect.height);
    wave.width = Math.floor(wW * dpr);
    wave.height = Math.floor(wH * dpr);
    waveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  window.addEventListener('resize', () => { if (open) sizeWave(); });

  /* Acento cacheado: esto se leía con getComputedStyle EN CADA FRAME, o sea
     60 recálculos de estilo forzados por segundo solo para saber un color que
     cambia una vez por canción. Mismo arreglo que en el visualizador. */
  let acentoCache = '#5ce1e6', acentoT = 0;
  const acento = () => {
    const now = performance.now();
    if (now - acentoT < 250) return acentoCache;
    acentoT = now;
    acentoCache = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#5ce1e6';
    return acentoCache;
  };

  // Duración de la pista actual, en segundos (vale para local y Spotify)
  const duracion = () => {
    const PC = window.PlayerCore;
    if (!PC) return 0;
    const t = PC.state.currentTrack;
    if (t && t.duration) return t.duration;
    return PC.audio && isFinite(PC.audio.duration) ? PC.audio.duration : 0;
  };

  /* Mapa de la canción: dónde entra cada verso. Se ve la estructura de un
     vistazo — dónde está la intro, dónde el solo, dónde vuelve el estribillo. */
  let marcas = [], marcasDe = null;
  const calcMarcas = () => {
    const sync = window.LyricsModule && window.LyricsModule.getSync
      ? window.LyricsModule.getSync() : null;
    const lines = (sync && sync.lines) || [];
    const dur = duracion();
    const firma = lines.length + '|' + dur.toFixed(1);
    if (firma === marcasDe) return marcas;
    marcasDe = firma;
    marcas = (!dur || !lines.length || lines[0].time < 0)
      ? []
      : lines.map((l) => l.time / dur).filter((p) => p > 0.002 && p < 0.998);
    return marcas;
  };

  const drawWave = () => {
    if (!waveCtx || !wW) return;
    waveCtx.clearRect(0, 0, wW, wH);
    // progreso: espejo de la barra principal (vale para local y Spotify)
    const pct = arrastrando ? arrastrePct
      : (mainFill ? (parseFloat(mainFill.style.width) || 0) / 100 : 0);
    const bw = 3, gap = 2;
    const n = Math.max(24, Math.floor(wW / (bw + gap)));
    const bands = window.VisualizerModule && window.VisualizerModule.getBands
      ? window.VisualizerModule.getBands(64) : null;
    const ac = acento();
    const mid = wH / 2;
    for (let i = 0; i < n; i++) {
      // mapeo triangular: graves al centro (joroba), agudos hacia los bordes
      const d = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
      const b = Math.min(63, Math.round(Math.pow(d, 1.25) * 63));
      const v = bands ? bands[b] : 0.08;
      const h = Math.max(2, Math.min(wH - 2, v * wH * 0.94));
      const x = i * (bw + gap);
      if ((x + bw / 2) / wW <= pct) {
        waveCtx.fillStyle = ac;
        waveCtx.shadowColor = ac;
        waveCtx.shadowBlur = 6;
      } else {
        waveCtx.fillStyle = 'rgba(232, 236, 255, 0.22)';
        waveCtx.shadowBlur = 0;
      }
      waveCtx.fillRect(x, mid - h / 2, bw, h);
    }

    // marcas de verso: pequeñas muescas arriba y abajo
    const ms = calcMarcas();
    if (ms.length) {
      waveCtx.shadowBlur = 0;
      waveCtx.fillStyle = 'rgba(232, 236, 255, 0.38)';
      for (let i = 0; i < ms.length; i++) {
        const x = Math.round(ms[i] * wW);
        waveCtx.fillRect(x, 0, 1, 4);
        waveCtx.fillRect(x, wH - 4, 1, 4);
      }
    }

    // cabeza de reproducción: aguja blanca con glow
    waveCtx.shadowColor = ac;
    waveCtx.shadowBlur = 9;
    waveCtx.fillStyle = '#fff';
    waveCtx.fillRect(Math.max(0, Math.min(wW - 2, pct * wW - 1)), 1, 2, wH - 2);
    waveCtx.shadowBlur = 0;

    // globo con el minuto mientras arrastras
    if (arrastrando) {
      const dur = duracion();
      const txt = fmt(arrastrePct * dur);
      waveCtx.font = '13px "Share Tech Mono", monospace';
      const w = waveCtx.measureText(txt).width + 12;
      const bx = clamp(arrastrePct * wW - w / 2, 2, wW - w - 2);
      waveCtx.fillStyle = 'rgba(0,0,0,0.82)';
      waveCtx.fillRect(bx, mid - 11, w, 22);
      waveCtx.fillStyle = ac;
      waveCtx.fillText(txt, bx + 6, mid + 5);
    }
  };

  // ---- Saltar en la onda: clic Y arrastre (antes solo clic) ----
  let arrastrando = false, arrastrePct = 0;

  const saltarA = (pct) => {
    const PC = window.PlayerCore;
    if (!PC) return;
    const t = PC.state.currentTrack;
    if (t && t.spotify && !PC.state.isPreview && window.SpotifyModule) {
      const durMs = (t.duration || 0) * 1000;
      if (durMs) window.SpotifyModule.seek(pct * durMs);
    } else if (PC.audio && PC.audio.duration) {
      PC.audio.currentTime = pct * PC.audio.duration;
    }
  };

  const pctDe = (clientX) => {
    const rect = wave.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };

  if (wave) {
    wave.addEventListener('pointerdown', (e) => {
      arrastrando = true;
      arrastrePct = pctDe(e.clientX);
      wave.setPointerCapture(e.pointerId);
      despertarCtl();
    });
    wave.addEventListener('pointermove', (e) => {
      if (!arrastrando) return;
      arrastrePct = pctDe(e.clientX);
    });
    const soltar = (e) => {
      if (!arrastrando) return;
      arrastrando = false;
      saltarA(pctDe(e.clientX));
    };
    wave.addEventListener('pointerup', soltar);
    wave.addEventListener('pointercancel', () => { arrastrando = false; });
  }

  /* ══════ Controles que asoman al mover el ratón ══════
     En pantalla completa no puedes pausar sin salirte, y no se ve ni el
     minuto. Los controles aparecen al mover el ratón y se van solos a los
     2,5 s, junto con el cursor — como cualquier reproductor de vídeo. */
  let ctlTimer = null;
  const despertarCtl = () => {
    root.classList.remove('quieto');
    clearTimeout(ctlTimer);
    ctlTimer = setTimeout(() => {
      if (open && !arrastrando) root.classList.add('quieto');
    }, 2500);
  };
  root.addEventListener('pointermove', despertarCtl);
  root.addEventListener('pointerdown', despertarCtl);

  const PC = () => window.PlayerCore;
  /* Segundo actual de la canción. Con Spotify Connect el <audio> local está
     parado, así que se saca de la barra de progreso principal, que spotify.js
     mantiene al día con su propio bucle. Una sola fuente para los dos motores. */
  const tiempoActual = () => {
    const p = PC();
    if (p && p.audio && !p.audio.paused && p.audio.currentTime > 0) return p.audio.currentTime;
    const pct = mainFill ? (parseFloat(mainFill.style.width) || 0) / 100 : 0;
    return pct * duracion();
  };
  const pulsar = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
  pulsar('cinPlay', () => { const b = $('playBtn'); if (b) b.click(); });
  pulsar('cinPrev', () => { const b = $('prevBtn'); if (b) b.click(); });
  pulsar('cinNext', () => { const b = $('nextBtn'); if (b) b.click(); });

  const playIco = $('cinPlayIcon'), pauseIco = $('cinPauseIcon');
  let ultTiempo = '';
  const pintarTiempo = () => {
    const p = PC();
    if (!p) return;
    const dur = duracion();
    const cur = arrastrando ? arrastrePct * dur : tiempoActual();
    const txt = fmt(cur) + '|' + fmt(dur);
    if (txt !== ultTiempo) {
      ultTiempo = txt;
      if (timeCur) timeCur.textContent = fmt(cur);
      if (timeTot) timeTot.textContent = fmt(dur);
    }
    const sonando = !!(p.state.isPlaying || (p.audio && !p.audio.paused));
    if (playIco) playIco.hidden = sonando;
    if (pauseIco) pauseIco.hidden = !sonando;
  };

  const loop = () => {
    if (!open) return;
    rafId = requestAnimationFrame(loop);
    if (document.hidden) return;
    const t = window.PlayerCore && window.PlayerCore.state.currentTrack;
    if (t !== lastTrack) { lastTrack = t; paintTrack(); }
    const sync = window.LyricsModule && window.LyricsModule.getSync
      ? window.LyricsModule.getSync() : null;
    const tSeg = tiempoActual();
    paintMsg();
    pintarRitmo();
    pintarBrazo();
    pintarGhosts(sync);
    pintarGap(sync, tSeg);
    pintarTiempo();
    drawWave();
  };

  /* ══════ Pantalla completa DE VERDAD ══════
     Se llamaba "modo cine" pero seguía dentro de la ventana, con la barra de
     direcciones encima. requestFullscreen puede fallar (permisos, iframes,
     gesto no confiable): si falla, el cine sigue funcionando como capa — por
     eso el .catch vacío y no un if bloqueante. */
  const pedirPantalla = () => {
    const el = document.documentElement;
    if (document.fullscreenElement) return;
    const f = el.requestFullscreen || el.webkitRequestFullscreen;
    if (f) { try { const r = f.call(el); if (r && r.catch) r.catch(() => {}); } catch (_) {} }
  };
  const soltarPantalla = () => {
    if (!document.fullscreenElement) return;
    const f = document.exitFullscreen || document.webkitExitFullscreen;
    if (f) { try { const r = f.call(document); if (r && r.catch) r.catch(() => {}); } catch (_) {} }
  };
  /* Si el usuario sale de pantalla completa con F11 o Esc del navegador, el
     cine tiene que enterarse y cerrarse: si no, queda una capa a pantalla
     completa dentro de una ventana normal, que es lo peor de los dos mundos. */
  document.addEventListener('fullscreenchange', () => {
    if (open && !document.fullscreenElement) closeCinema();
  });

  let cerrando = null;

  const openCinema = () => {
    if (open) return;
    open = true;
    clearTimeout(cerrando);
    document.body.classList.add('cinema-open');
    // muda el modo edit real al escenario del cine
    lyricsEdit.parentNode.insertBefore(slot, lyricsEdit);
    stage.appendChild(lyricsEdit);
    lyricsEdit.hidden = false;
    root.hidden = false;
    construirDestellos();
    pedirPantalla();
    // fuerza un reflow antes de la clase para que la transición de entrada
    // arranque desde el estado inicial y no se la salte
    void root.offsetWidth;
    // quitar 'saliendo' es obligatorio: si cierras y reabres antes de que
    // termine el fundido, se quedarían las dos clases y gana la de salir
    // (va después en la hoja) → el cine se abriría invisible.
    root.classList.remove('saliendo');
    root.classList.add('entrando');
    sizeWave();   // el canvas ya es visible: medirlo ahora
    lastTrack = window.PlayerCore && window.PlayerCore.state.currentTrack;
    marcasDe = null;      // el mapa de versos se recalcula para esta canción
    ghostIdx = -99;
    paintTrack();
    paintMsg();
    despertarCtl();
    if (window.LyricsModule && window.LyricsModule.forceEdit) {
      window.LyricsModule.forceEdit(true);
    }
    loop();
    // el canvas suele medirse antes de que el layout a pantalla completa
    // haya asentado: una segunda medida al vuelo lo deja clavado
    requestAnimationFrame(sizeWave);
  };

  const closeCinema = () => {
    if (!open) return;
    open = false;
    root.classList.remove('entrando', 'quieto');
    root.classList.add('saliendo');
    clearTimeout(ctlTimer);
    document.body.classList.remove('cinema-open');
    soltarPantalla();
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    // devuelve #lyricsEdit a su sitio y restaura su visibilidad según el modo
    slot.parentNode.insertBefore(lyricsEdit, slot);
    slot.remove();
    const LM = window.LyricsModule;
    if (LM && LM.forceEdit) LM.forceEdit(false);
    /* Quién se ve al volver lo decide el módulo de letras: si además de la
       preferencia hay una escena por fuera (reposo, o canción sin letra),
       ninguna de las dos vistas debe ocupar sitio. Antes se decidía aquí
       con `!editMode` y al cerrar sobre una canción sin letra reaparecía
       un #lyricsEdit vacío encima de la escena. */
    if (LM && LM.refreshMode) LM.refreshMode();
    else lyricsEdit.hidden = !(LM && LM.isEditMode && LM.isEditMode());
    // se oculta al terminar el fundido, no en seco
    clearTimeout(cerrando);
    cerrando = setTimeout(() => {
      if (!open) { root.hidden = true; root.classList.remove('saliendo'); }
    }, calma() ? 0 : 260);
  };

  if (openBtn) openBtn.addEventListener('click', openCinema);
  if (closeBtn) closeBtn.addEventListener('click', closeCinema);
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || !open) return;
    closeCinema();
  });

  window.CinemaModule = {
    abrir: openCinema,
    cerrar: closeCinema,
    esta: () => open,
  };
})();
