/* ==========================================================
   Visualizador de audio — espectro reflejado, profesional.
   · FFT real (Web Audio) cuando el audio suena por el <audio>
     local (canciones importadas y previews de Spotify).
   · Animación suave de respaldo (idle) cuando no hay señal
     (silencio, o reproducción en Spotify Connect remoto).

   SEGURIDAD DE AUDIO: el grafo se conecta de forma perezosa solo
   tras un gesto del usuario (evento 'play'), reanudando primero el
   AudioContext. Si algo falla, se captura y el audio sigue sonando
   por la ruta normal del navegador — nunca se silencia.
   ========================================================== */
(() => {
  'use strict';

  const canvas = document.getElementById('visualizer');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // ---- Web Audio state ----
  let audioCtx = null, analyser = null, source = null, freqData = null;
  let connected = false, attaching = false;
  // Captura del audio del sistema (modo sync, para Spotify Connect)
  let capStream = null, capSource = null, capAnalyser = null;

  /* ---- Analizador CRUDO, solo para el detector de ritmo (js/beat.js) ----
     Va aparte del que dibuja. Aquel suaviza a propósito (0.82) para que las
     barras no tiemblen, pero ESE suavizado se come el ataque del bombo: un
     golpe seco llega convertido en una loma. El detector necesita la señal
     tal cual entra, así que tiene su propio nodo con suavizado 0. */
  let detAnalyser = null, capDet = null, detSink = null;
  const crearDetector = (ac) => {
    const a = ac.createAnalyser();
    a.fftSize = FFT_SIZE;
    a.smoothingTimeConstant = 0;
    a.minDecibels = -100;
    a.maxDecibels = -6;
    return a;
  };

  const NUM_BARS = 64;
  const FFT_SIZE = 2048;
  const smooth  = new Array(NUM_BARS).fill(0);
  const peaks   = new Array(NUM_BARS).fill(0);
  const peakVel = new Array(NUM_BARS).fill(0);

  // ---- Canvas sizing (nítido en pantallas HiDPI) ----
  let W = 0, H = 0, dpr = 1;
  const sizeCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    /* TOPE de resolución. Un teléfono moderno da devicePixelRatio 3, así
       que un canvas de 380×120 CSS pasaba a 1140×360 píxeles reales: nueve
       veces los píxeles a rellenar 60 veces por segundo. Con 1.5 las barras
       siguen viéndose nítidas y cuesta la cuarta parte. */
    const tope = window.MMPerf && window.MMPerf.movil() ? 1.5 : 2;
    dpr = Math.min(tope, Math.max(1, window.devicePixelRatio || 1));
    W = Math.max(120, Math.floor(rect.width));
    H = Math.max(60, Math.floor(rect.height));
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  sizeCanvas();
  window.addEventListener('resize', sizeCanvas);
  if (window.ResizeObserver) new ResizeObserver(sizeCanvas).observe(canvas);

  // ---- Color helpers (siguen el acento del tema) ----
  const cssVar = (n, f) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    return v || f;
  };
  /* Paleta cacheada. Antes se leían las variables con getComputedStyle EN
     CADA FRAME: 180 recálculos de estilo forzados por segundo solo para
     pintar unas barras. Los colores cambian cuando entra una carátula nueva
     o el usuario toca los ajustes, o sea que refrescarlos cuatro veces por
     segundo va sobrado. */

  /* Punta de las barras: versión CLARA del acento (mezcla hacia blanco).
     Antes era --magenta, un rosa fijo que se quedaba igual aunque la
     carátula o el usuario cambiaran el color — regla de la casa: nada de
     colores fijos, todo de la paleta viva. Blanco vale como mezcla porque
     es luz, no color de marca. */
  const aclarar = ({ r, g, b }, f) => ({
    r: Math.round(r + (255 - r) * f),
    g: Math.round(g + (255 - g) * f),
    b: Math.round(b + (255 - b) * f),
  });

  let paleta = null, paletaT = 0;
  const colores = () => {
    const now = performance.now();
    if (paleta && now - paletaT < 250) return paleta;
    paletaT = now;
    const cs = getComputedStyle(document.documentElement);
    const leer = (n, f) => (cs.getPropertyValue(n).trim() || f);
    const accent = toRgb(leer('--accent', '#5ce1e6'));
    paleta = {
      accent,
      glow:  toRgb(leer('--accent-glow', '#5ce1e6')),
      claro: aclarar(accent, 0.68),
    };
    return paleta;
  };
  const toRgb = (hex) => {
    if (hex.startsWith('rgb')) { const m = hex.match(/\d+/g); return { r: +m[0], g: +m[1], b: +m[2] }; }
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    return { r: parseInt(c.substr(0, 2), 16), g: parseInt(c.substr(2, 2), 16), b: parseInt(c.substr(4, 2), 16) };
  };
  const rgba = ({ r, g, b }, a = 1) => `rgba(${r},${g},${b},${a})`;

  // ---- Conexión perezosa al grafo de audio ----
  const tryAttach = async () => {
    if (connected) {
      if (audioCtx && audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch (e) {} }
      return;
    }
    if (attaching) return;
    attaching = true;
    try {
      if (!window.PlayerCore || !window.PlayerCore.audio) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      if (audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch (e) {} }
      source = audioCtx.createMediaElementSource(window.PlayerCore.audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.82;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      /* Rama del detector. Termina en una ganancia 0 que sí llega al destino:
         Chromium recorre el grafo HACIA ATRÁS desde la salida, así que una
         rama muerta podría no procesarse nunca. Con ganancia 0 no suena. */
      detAnalyser = crearDetector(audioCtx);
      source.connect(detAnalyser);
      detSink = audioCtx.createGain();
      detSink.gain.value = 0;
      detAnalyser.connect(detSink);
      detSink.connect(audioCtx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      connected = true;
    } catch (e) {
      console.warn('[viz] no se pudo conectar (el audio sigue sonando):', e);
      connected = false; audioCtx = null; source = null; analyser = null;
      detAnalyser = null; detSink = null;   // que el detector no herede un nodo suelto
    } finally {
      attaching = false;
    }
  };

  // Engancha el evento play (gesto de usuario) para conectar de forma segura
  const hookAudio = () => {
    if (!window.PlayerCore || !window.PlayerCore.audio) { setTimeout(hookAudio, 150); return; }
    const a = window.PlayerCore.audio;
    a.addEventListener('play', () => { tryAttach(); });
    a.addEventListener('playing', () => { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {}); });
  };
  hookAudio();

  // Watchdog: reanuda el contexto si el navegador lo suspende
  setInterval(() => {
    const a = window.PlayerCore && window.PlayerCore.audio;
    if (a && !a.paused && audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  });

  /* DOS CAMINOS para oír lo que suena fuera del navegador:

     · Escritorio → `getDisplayMedia`: compartes la pantalla marcando
       «compartir el audio del sistema». Señal limpia y directa.
     · Móvil → `getUserMedia`: el MICRÓFONO. Compartir pantalla no existe
       en los navegadores de teléfono, ni en Android ni en iPhone, así que
       la única forma de que el espectro siga a Spotify es que el teléfono
       ESCUCHE lo que sale por el altavoz. Mismo principio que usa Shazam.

     Da igual de dónde venga: la captura monta un MediaStreamSource y al
     analizador el origen del flujo le da exactamente igual.

     Se comprueba si cada método EXISTE, en vez de deducirlo del tamaño de
     pantalla: ese es el dato de verdad. Y va aquí arriba, antes de quien
     lo consulta, para no dejar la trampa de una constante declarada
     después de su primer uso. */
  const puedePantalla = !!(navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function');
  const puedeMic = !!(navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function');
  const porMic = () => !puedePantalla && puedeMic;
  const puedeCapturar = puedePantalla || puedeMic;

  /* Con un mp3 tuyo sonando, la señal DIRECTA gana a la del micrófono:
     no lleva ruido de la habitación, no llega tarde y trae los graves de
     verdad (el altavoz de un teléfono casi no tiene). Con la captura de
     pantalla del escritorio no hace falta distinguir: esa señal ya es el
     audio del sistema, tan buena como la directa. */
  const localSonando = () => {
    const a = window.PlayerCore && window.PlayerCore.audio;
    return !!(analyser && connected && a && !a.paused && !a.ended);
  };
  const fuente = () => {
    if (capAnalyser && !(porMic() && localSonando())) return capAnalyser;
    return analyser;
  };

  const isLive = () => {
    if (!audioCtx || audioCtx.state !== 'running') return false;
    // Modo sync: el espectro viene del audio del sistema (Spotify u otro)
    if (capAnalyser && !(porMic() && localSonando())) return true;
    return localSonando();
  };

  // ---- Magnitudes del espectro (bandas log) ----
  const computeSpectrum = () => {
    fuente().getByteFrequencyData(freqData);
    const bins = freqData.length;
    let sum = 0;
    for (let i = 0; i < bins; i++) sum += freqData[i];
    if (sum === 0) return null;       // audio enrutado fuera / cambio de pista
    const out = new Array(NUM_BARS);
    const minF = 2, maxF = bins * 0.78;
    for (let i = 0; i < NUM_BARS; i++) {
      const lo = minF + Math.pow(i / NUM_BARS, 1.9) * (maxF - minF);
      const hi = minF + Math.pow((i + 1) / NUM_BARS, 1.9) * (maxF - minF);
      let max = 0;
      for (let j = Math.floor(lo); j < Math.ceil(hi) && j < bins; j++) if (freqData[j] > max) max = freqData[j];
      out[i] = max / 255;
    }
    return out;
  };

  // ---- Animación suave cuando no hay señal ----
  const idleSpectrum = () => {
    const t = performance.now() / 1000;
    const out = new Array(NUM_BARS);
    for (let i = 0; i < NUM_BARS; i++) {
      const x = i / NUM_BARS;
      const env = Math.sin(x * Math.PI);                                   // joroba central
      const wave = (Math.sin(t * 1.6 + x * 7) * 0.5 + 0.5) * 0.40
                 + (Math.sin(t * 2.7 + x * 13) * 0.5 + 0.5) * 0.16;
      out[i] = env * wave + 0.015;
    }
    return out;
  };

  // ---- Barra con tope redondeado ----
  const roundedTopBar = (x, y, w, h, r) => {
    r = Math.min(r, w / 2, h);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  };

  // ---- Modo SYNC: captura el audio del sistema (para Spotify) ----
  // El audio de Spotify Connect no pasa por el navegador, así que no se
  // puede analizar directo. Con getDisplayMedia el usuario comparte el
  // audio del sistema y el espectro reacciona a lo que realmente suena.
  // Solo se ANALIZA: no se conecta a destination (evitaría eco/duplicado).
  const setStatus = (msg) => { if (window.SevenStatus) window.SevenStatus(msg); };
  const syncBtn = document.getElementById('vizSyncBtn');

  if (syncBtn) {
    syncBtn.hidden = !puedeCapturar;
    if (porMic()) {
      /* Que se sepa QUÉ hace antes de pulsarlo. Pedir el micrófono sin
         avisar, en una app de música, es de las cosas que más mosquean. */
      syncBtn.textContent = '◈ oír';
      syncBtn.dataset.modo = 'mic';
      syncBtn.title = 'Escuchar por el micrófono para que el espectro siga la música. ' +
        'Ponla por el altavoz (con audífonos no hay nada que oír). ' +
        'El sonido se analiza al vuelo: no se graba ni se envía a ningún sitio.';
    }
  }

  const stopCapture = () => {
    if (capStream) capStream.getTracks().forEach(t => { t.onended = null; t.stop(); });
    try { if (capSource) capSource.disconnect(); } catch (e) {}
    capStream = null; capSource = null; capAnalyser = null; capDet = null;
    if (syncBtn) syncBtn.classList.remove('active');
  };

  /* Por qué falló el último intento. Se declara ANTES de quien lo escribe:
     con `let` después, aunque en la práctica funcione (se asigna al
     ejecutar, no al definir), queda una trampa esperando a cualquiera que
     mueva el código. */
  let ultimoMotivo = '';

  /* Los tres «false» son OBLIGATORIOS, sobre todo con el micrófono: la
     cancelación de eco existe para BORRAR lo que sale por el altavoz del
     propio aparato… que aquí es justo lo que queremos oír. Con ellos
     puestos el navegador se come la música y el espectro se queda plano.
     Es el error clásico de capturar audio por micrófono. */
  const CRUDO = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

  const pedirFlujo = () => {
    if (puedePantalla) {
      return navigator.mediaDevices.getDisplayMedia({
        video: true, audio: CRUDO, systemAudio: 'include',
      });
    }
    return navigator.mediaDevices.getUserMedia({ audio: CRUDO });
  };

  const startCapture = async () => {
    try {
      const stream = await pedirFlujo();
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        stream.getTracks().forEach(t => t.stop());
        ultimoMotivo = porMic()
          ? '✕ el micrófono no dio señal'
          : '✕ no se compartió audio — marca "compartir audio del sistema"';
        return false;
      }
      // No necesitamos el video: liberarlo ahorra recursos, pero mantenemos
      // el track para detectar cuando el usuario detiene la compartición.
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch (e) {} }
      capSource = audioCtx.createMediaStreamSource(stream);
      capAnalyser = audioCtx.createAnalyser();
      capAnalyser.fftSize = FFT_SIZE;
      capAnalyser.smoothingTimeConstant = 0.82;
      capAnalyser.minDecibels = -90;
      capAnalyser.maxDecibels = -10;
      capSource.connect(capAnalyser);
      // el detector también escucha la captura (aquí sí vale una rama sin
      // salida: un MediaStreamSource corre siempre, no lo tira el destino)
      capDet = crearDetector(audioCtx);
      capSource.connect(capDet);
      if (!freqData) freqData = new Uint8Array(capAnalyser.frequencyBinCount);
      capStream = stream;
      stream.getTracks().forEach(t => { t.onended = () => { stopCapture(); setStatus('◈ sync desactivado'); }; });
      return true;
    } catch (e) {
      /* Antes CUALQUIER fallo salía como «sync cancelado», que es mentira
         la mitad de las veces. El nombre del error dice qué pasó de
         verdad y el usuario puede hacer algo con esa información. */
      stopCapture();
      const n = (e && e.name) || '';
      if (n === 'NotAllowedError') {
        // lo canceló él (o denegó el permiso): con el micrófono conviene
        // decirlo, porque el navegador recuerda el «no» y no vuelve a preguntar
        ultimoMotivo = porMic()
          ? '✕ sin permiso de micrófono. Se cambia en el candado 🔒 de la barra de direcciones'
          : '';
      } else if (n === 'NotSupportedError' || n === 'TypeError') {
        ultimoMotivo = '✕ este navegador no deja capturar el audio';
      } else if (n === 'NotFoundError') {
        ultimoMotivo = porMic() ? '✕ no se encontró micrófono' : '✕ no se encontró nada que compartir';
      } else if (n === 'NotReadableError') {
        ultimoMotivo = '✕ el micrófono lo está usando otra app';
      } else {
        ultimoMotivo = '✕ no se pudo capturar el audio' + (n ? ' (' + n + ')' : '');
      }
      return false;
    }
  };

  /* Con el micrófono, en segundo plano se SUELTA. Estando la pestaña
     oculta el análisis no corre igualmente (el rAF se congela), así que
     dejarlo abierto solo gastaría batería y mantendría el aviso de
     «micrófono en uso» por nada. Al volver se reengancha solo: el permiso
     ya está dado, no vuelve a preguntar. */
  let micEnPausa = false;

  const activarSync = async () => {
    ultimoMotivo = '';
    const ok = await startCapture();
    if (syncBtn) syncBtn.classList.toggle('active', ok);
    return ok;
  };

  if (syncBtn) syncBtn.addEventListener('click', async () => {
    if (capStream) {
      micEnPausa = false;
      stopCapture();
      setStatus(porMic() ? '◈ micrófono apagado' : '◈ sync desactivado');
      return;
    }
    if (!puedeCapturar) {
      setStatus('✕ este navegador no puede capturar audio');
      return;
    }
    const ok = await activarSync();
    if (ok) {
      setStatus(porMic()
        ? '◈ escuchando por el micrófono — ponla por el altavoz'
        : '◈ espectro sincronizado con el audio del sistema');
    } else if (ultimoMotivo) setStatus(ultimoMotivo);
    else setStatus('✕ sync cancelado');
  });

  document.addEventListener('visibilitychange', () => {
    if (!porMic()) return;
    if (document.hidden) {
      if (capStream) { micEnPausa = true; stopCapture(); }
    } else if (micEnPausa) {
      micEnPausa = false;
      activarSync();
    }
  });

  // ---- Mini-EQ de la barra de estado: baila con el espectro real ----
  // Cuando hay FFT en vivo, las barritas usan bandas reales (graves → agudos)
  // cuantizadas a pasos de 3px (look pixel). Sin señal (p. ej. Spotify
  // Connect remoto) se quita la clase .live y vuelve la animación CSS.
  const miniEq = document.querySelector('.mini-eq');
  const eqBars = miniEq ? Array.from(miniEq.querySelectorAll('i')) : [];
  const eqIdx = [3, 10, 20, 33, 47];   // índices en smooth[] para cada barrita
  let eqLive = false;
  const eqPrev = [0, 0, 0, 0, 0];      // última altura escrita, para no repetir
  const updateMiniEq = (playing) => {
    if (!eqBars.length) return;
    if (playing) {
      if (!eqLive) { miniEq.classList.add('live'); eqLive = true; }
      for (let k = 0; k < eqBars.length; k++) {
        const v = Math.min(1, (smooth[eqIdx[k]] || 0) * 1.35);
        const px = 3 + Math.min(3, Math.round(v * 3)) * 3;
        // el valor está cuantizado a 4 alturas: casi todos los frames repiten.
        // Comparar antes de escribir evita ~300 invalidaciones de estilo/s.
        if (eqPrev[k] !== px) { eqPrev[k] = px; eqBars[k].style.height = px + 'px'; }
      }
    } else if (eqLive) {
      miniEq.classList.remove('live');
      eqLive = false;
      for (let k = 0; k < eqBars.length; k++) { eqBars[k].style.height = ''; eqPrev[k] = 0; }
    }
  };

  // ¿está entrando audio de verdad AHORA? (no basta con que el grafo exista:
  // el usuario puede tener el grafo montado y estar oyendo por Spotify Connect)
  let haySenal = false;

  /* ¿El lienzo está realmente a la vista? En modo cine, con otra pestaña
     abierta o con la ventana encogida, el visualizador sigue existiendo pero
     no lo ve nadie: no tiene sentido pintarlo 60 veces por segundo. */
  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (ents) => { visible = ents[ents.length - 1].isIntersecting; },
      { threshold: 0 }
    ).observe(canvas);
  }

  // ---- Bucle de render ----
  let ultimoFrame = 0;
  const draw = (ts) => {
    requestAnimationFrame(draw);

    if (document.hidden) return;   // en segundo plano no hay nada que hacer

    const live = isLive();
    let vals = live ? computeSpectrum() : null;
    const playing = !!(live && vals);

    /* Sin señal lo que se ve es la onda de respaldo, que es lenta y suave:
       a 30 fps se ve idéntica y cuesta la mitad. Con música real, los 60
       — salvo en el móvil, donde 30 son los que hay para todo. */
    const t0 = ts || performance.now();
    const minMs = window.MMPerf && window.MMPerf.movil() ? 33 : (playing ? 0 : 33);
    if (t0 - ultimoFrame < minMs) return;
    ultimoFrame = t0;

    haySenal = playing;
    if (!vals) vals = idleSpectrum();

    /* Fuera de pantalla (modo cine, ventana encogida) se hacen las cuentas
       pero NO se pinta: smooth[] tiene que seguir vivo porque de ahí come
       getBands(), que es lo que mueve la onda del modo cine. Lo que se ahorra
       es justo lo caro: degradados, shadowBlur y relleno por barra. */
    if (!visible) {
      for (let i = 0; i < NUM_BARS; i++) {
        const target = vals[i];
        const s = smooth[i];
        smooth[i] = target > s ? s + (target - s) * 0.5 : s + (target - s) * 0.12;
        const v = smooth[i];
        if (v > peaks[i]) { peaks[i] = v; peakVel[i] = 0; }
        else { peakVel[i] += 0.0009; peaks[i] = Math.max(v, peaks[i] - peakVel[i]); }
      }
      updateMiniEq(playing);
      return;
    }

    ctx.clearRect(0, 0, W, H);

    const { accent, glow, claro } = colores();

    const center = H / 2;
    const gap = 2;
    const barW = (W - gap * (NUM_BARS - 1)) / NUM_BARS;
    const maxBar = H * 0.46;
    const radius = Math.min(barW / 2, 3);

    // Línea central tenue
    ctx.strokeStyle = rgba(accent, 0.10);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, center); ctx.lineTo(W, center); ctx.stroke();

    for (let i = 0; i < NUM_BARS; i++) {
      const target = vals[i];
      const s = smooth[i];
      // ataque rápido, caída lenta
      smooth[i] = target > s ? s + (target - s) * 0.5 : s + (target - s) * 0.12;
      const v = smooth[i];
      const bh = Math.max(1.5, v * maxBar);
      const x = i * (barW + gap);

      // pico que cae
      if (v > peaks[i]) { peaks[i] = v; peakVel[i] = 0; }
      else { peakVel[i] += 0.0009; peaks[i] = Math.max(v, peaks[i] - peakVel[i]); }

      // barra superior con degradado + glow
      const grad = ctx.createLinearGradient(0, center - bh, 0, center);
      grad.addColorStop(0,    rgba(claro, playing ? 1 : 0.7));
      grad.addColorStop(0.55, rgba(accent, 0.95));
      grad.addColorStop(1,    rgba(accent, 0.55));
      ctx.shadowColor = rgba(glow, playing ? 0.9 : 0.4);
      ctx.shadowBlur = playing ? 12 : 6;
      ctx.fillStyle = grad;
      roundedTopBar(x, center - bh, barW, bh, radius);
      ctx.fill();

      // reflejo inferior, desvanecido (sin glow)
      ctx.shadowBlur = 0;
      const refl = ctx.createLinearGradient(0, center, 0, center + bh * 0.7);
      refl.addColorStop(0, rgba(accent, 0.30));
      refl.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = refl;
      ctx.fillRect(x, center, barW, bh * 0.7);

      // tope del pico: punta clara con el glow del acento
      const py = center - Math.max(1.5, peaks[i] * maxBar) - 2;
      ctx.shadowColor = rgba(glow, 0.9);
      ctx.shadowBlur = 8;
      ctx.fillStyle = rgba(claro, 0.95);
      ctx.fillRect(x, py, barW, 2);
      ctx.shadowBlur = 0;
    }

    updateMiniEq(playing);
  };
  draw();

  // API pública mínima
  window.VisualizerModule = {
    /* «Hay FFT real ahora mismo», que es lo que preguntan quienes la usan.
       Antes devolvía `connected`, que solo mira si el grafo del <audio>
       local está montado: seguía dando true al pasarse a Spotify Connect
       (sin señal) y daba false con ◈ sync (con señal). Las dos al revés. */
    isConnected: () => haySenal,
    // ¿está activa la captura del audio del sistema?
    haySync: () => !!capStream,
    /* Nodo CRUDO para el detector de ritmo. Nadie más debería usarlo:
       sus datos son el espectro sin suavizar, feo de dibujar. */
    getDetector: () => {
      // misma preferencia que el espectro: lo directo gana al micrófono
      const a = (capDet && !(porMic() && localSonando())) ? capDet : detAnalyser;
      if (!a || !audioCtx || audioCtx.state !== 'running') return null;
      return a;
    },
    getSampleRate: () => (audioCtx ? audioCtx.sampleRate : 44100),
    // Espectro suavizado remuestreado a n bandas (0..1, graves → agudos).
    // Con señal en vivo (local o ◈ sync) es FFT real; sin señal, la onda idle.
    getBands: (n) => {
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        const j = Math.min(NUM_BARS - 1, Math.round(i * (NUM_BARS - 1) / Math.max(1, n - 1)));
        out[i] = smooth[j];
      }
      return out;
    },
  };
})();
