/* ==========================================================
   Visualizador de audio — espectro de segmentos, como el display VFD
   de una cadena de música (antes: barras lisas con reflejo).
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

  /* Suavizados en TIEMPO REAL, no por frame: la misma caída se ve igual a
     30, 60 o 165 Hz. Ver la explicación larga en js/perf.js. */
  const K = (k60, dt) => (window.MMPerf ? window.MMPerf.k(k60, dt) : k60);
  const F60 = (dt) => (window.MMPerf ? window.MMPerf.frames60(dt) : 1);
  const DT_NOMINAL = 1000 / 60;

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
  /* El nivel de calidad puede cambiar en marcha (js/perf.js mide los fps de
     verdad). Cuando baja o sube hay que rehacer el canvas — el tope de
     resolución depende del nivel — y olvidar las tiras cacheadas, porque
     cambia el número de barras y con él su altura. */
  if (window.MMPerf && window.MMPerf.alCambiar) {
    window.MMPerf.alCambiar(() => { cacheVfd = null; sizeCanvas(); });
  }

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

  /* ---------- El espectro como un display de equipo (VFD) ----------
     Antes eran 64 barras lisas con reflejo: el visualizador «de cualquier
     web». Ahora es la pantalla de fósforo de una cadena de los 80-90:
     columnas de segmentos con los APAGADOS a la vista (el fósforo sin
     encender se ve), el color por tramos sacados de la paleta —como los 16
     tonos que el viscolor.txt de Winamp le daba al espectro— y el pico como
     un segmento que cae despacio. Nada parpadea: sube y baja con el mismo
     suavizado de siempre.

     Lo caro se hace UNA vez (y se rehace solo si cambian el color, el
     tamaño o el número de columnas): la rejilla apagada va en un lienzo
     aparte, y las posiciones y los tonos, en tablas. Cada frame es un
     drawImage de la rejilla + un relleno por FILA (todas las columnas
     encendidas a esa altura en un solo path) + los picos. Sin degradados ni
     shadowBlur: el resplandor sigue siendo el drop-shadow del CSS, una
     pasada de la GPU (ver #visualizer). La historia de por qué: este bucle
     llegó a comerse 100 ms de cada segundo con 128 desenfoques de CPU. */
  let cacheVfd = null;
  const mezclar = (a, b, t) => ({
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  });
  const rejilla = (nc, playing) => {
    const { accent, claro } = colores();
    const firma = `${accent.r},${accent.g},${accent.b}|${W}x${H}@${dpr}|${nc}|${playing ? 1 : 0}`;
    if (cacheVfd && cacheVfd.firma === firma) return cacheVfd;

    // un segmento cada ~9 px de alto: 8 filas como poco, 20 como mucho
    const filas = Math.max(8, Math.min(20, Math.round(H / 9)));
    // bordes pegados a píxeles de verdad: un segmento a medio píxel se ve borroso
    const snap = (v) => Math.round(v * dpr) / dpr;
    const padX = 2, padY = 3, gy = 2;
    const gx = nc > 24 ? 3 : 4;
    const cw = (W - padX * 2 - gx * (nc - 1)) / nc;
    const paso = (H - padY * 2 + gy) / filas;
    const cols = [], rows = [];
    for (let c = 0; c < nc; c++) {
      const x0 = snap(padX + c * (cw + gx)), x1 = snap(padX + c * (cw + gx) + cw);
      cols.push([x0, Math.max(1 / dpr, x1 - x0)]);
    }
    for (let r = 0; r < filas; r++) {
      const base = H - padY - r * paso;
      const y0 = snap(base - (paso - gy)), y1 = snap(base);
      rows.push([y0, Math.max(1 / dpr, y1 - y0)]);
    }

    /* Tonos por tramo, de abajo arriba: el acento apagado → el acento → su
       versión clara. Sin señal (la onda de respaldo) va un poco más tenue. */
    const oscuro = mezclar(accent, { r: 0, g: 0, b: 0 }, 0.35);
    const alfa = playing ? 1 : 0.75;
    const tonos = rows.map((_, r) => {
      const f = filas > 1 ? r / (filas - 1) : 1;
      return rgba(f < 0.6 ? mezclar(oscuro, accent, f / 0.6) : mezclar(accent, claro, (f - 0.6) / 0.4), alfa);
    });

    // la rejilla apagada, a la resolución real del lienzo
    const fondo = document.createElement('canvas');
    fondo.width = canvas.width; fondo.height = canvas.height;
    const fx = fondo.getContext('2d');
    fx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fx.fillStyle = rgba(accent, 0.08);
    fx.beginPath();
    for (const [x, w] of cols) for (const [y, h] of rows) fx.rect(x, y, w, h);
    fx.fill();

    cacheVfd = { firma, filas, cols, rows, tonos, fondo, pico: rgba(claro, 0.95), lit: new Int16Array(nc) };
    return cacheVfd;
  };

  /* 64 barras eran 64 en todas partes. En un teléfono no se distinguen y
     cada una cuesta dos drawImage y un fillRect por frame. */
  const barrasVisibles = () => (window.MMPerf
    ? Math.min(NUM_BARS, window.MMPerf.cuantos(NUM_BARS))
    : NUM_BARS);

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
  const hayMic = !!(navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function');

  /* ⚠ EL MICRÓFONO VA APAGADO POR DEFECTO, y no es un capricho.

     En cuanto una página abre el micrófono, Android y iOS cambian TODO el
     audio del aparato al modo de llamada: bajan el volumen, aplican
     procesado de voz y en algunos móviles lo mandan al auricular. Es
     decisión del sistema operativo, no del navegador, y **desde una página
     web no hay forma de evitarlo**: no existe ninguna API que diga «abre el
     micro pero no toques la salida». El usuario lo describió exacto: «la
     música se pone como si estuviera en una llamada, bajito».

     Solo hay UN caso en que no molesta: que la música NO suene en este
     teléfono (Spotify mandando a un parlante, a la tele, a otro equipo).
     Ahí el bajón no le pasa a nada que estés oyendo y el micrófono capta
     el altavoz de verdad, con graves. Como no hay manera fiable de
     detectar ese caso —Spotify dice el nombre del aparato, no si es ESTE—,
     lo decide el usuario en Ajustes. Apagado por defecto. */
  const micPermitido = () => {
    try { return localStorage.getItem('mm_mic') === 'on'; } catch (_) { return false; }
  };
  // funciones, no constantes: el ajuste se puede cambiar sin recargar
  const puedeMic = () => hayMic && micPermitido();
  const porMic = () => !puedePantalla && puedeMic();
  const puedeCapturar = () => puedePantalla || puedeMic();

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
    /* El reparto va sobre las barras que de verdad se pintan, no sobre las
       64 de siempre: con menos barras cada una abarca más banda. Si se
       repartiera entre 64 y luego solo se dibujaran las primeras 22, se
       verían nada más que los graves. */
    const nb = barrasVisibles();
    const out = new Array(nb);
    const minF = 2, maxF = bins * 0.78;
    for (let i = 0; i < nb; i++) {
      const lo = minF + Math.pow(i / nb, 1.9) * (maxF - minF);
      const hi = minF + Math.pow((i + 1) / nb, 1.9) * (maxF - minF);
      let max = 0;
      for (let j = Math.floor(lo); j < Math.ceil(hi) && j < bins; j++) if (freqData[j] > max) max = freqData[j];
      out[i] = max / 255;
    }
    return out;
  };

  // ---- Animación suave cuando no hay señal ----
  const idleSpectrum = () => {
    const t = performance.now() / 1000;
    const nb = barrasVisibles();
    const out = new Array(nb);
    for (let i = 0; i < nb; i++) {
      const x = i / nb;
      const env = Math.sin(x * Math.PI);                                   // joroba central
      const wave = (Math.sin(t * 1.6 + x * 7) * 0.5 + 0.5) * 0.40
                 + (Math.sin(t * 2.7 + x * 13) * 0.5 + 0.5) * 0.16;
      out[i] = env * wave + 0.015;
    }
    return out;
  };

  // ---- Modo SYNC: captura el audio del sistema (para Spotify) ----
  // El audio de Spotify Connect no pasa por el navegador, así que no se
  // puede analizar directo. Con getDisplayMedia el usuario comparte el
  // audio del sistema y el espectro reacciona a lo que realmente suena.
  // Solo se ANALIZA: no se conecta a destination (evitaría eco/duplicado).
  const setStatus = (msg) => { if (window.SevenStatus) window.SevenStatus(msg); };
  const syncBtn = document.getElementById('vizSyncBtn');

  const pintarBotonSync = () => {
    if (!syncBtn) return;
    syncBtn.hidden = !puedeCapturar();
    if (porMic()) {
      /* Que se sepa QUÉ hace antes de pulsarlo. Pedir el micrófono sin
         avisar, en una app de música, es de las cosas que más mosquean. */
      // el ◈ lo pinta el CSS (.viz-sync::before), en la rejilla de los iconos pixel
      syncBtn.textContent = 'oír';
      syncBtn.dataset.modo = 'mic';
      syncBtn.title = 'Escuchar por el micrófono para que el espectro siga la música. ' +
        'Solo tiene sentido si suena en OTRO aparato: si suena en este teléfono, ' +
        'el sistema baja el volumen como en una llamada.';
    } else {
      syncBtn.textContent = 'sync';
      delete syncBtn.dataset.modo;
      syncBtn.title = 'Sincronizar el espectro con el audio del sistema — ideal para Spotify. ' +
        'Comparte tu pantalla marcando "compartir audio del sistema".';
    }
  };
  pintarBotonSync();

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
    if (!puedeCapturar()) {
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
  const eqPrev = [-1, -1, -1, -1, -1];   // último paso escrito, para no repetir

  /* La fila que SUENA en las listas y en la cola (library.js y seven.js
     ponen .sp-eq en el sitio del número) lleva tres de estas cinco:
     graves, medios y agudos. Colección viva: las filas que se pintan
     después entran solas, sin buscarlas en cada fotograma. Sin audio que
     medir se quita .live y manda la animación de respaldo del CSS, igual
     que en el mini-EQ; en pausa, quietas. */
  const filasEq = document.getElementsByClassName('sp-eq');
  const FILA_BANDAS = [0, 2, 4];
  const pintarFilasEq = (playing) => {
    for (let f = 0; f < filasEq.length; f++) {
      const eq = filasEq[f];
      const barras = eq.children;
      if (eq._vivo !== playing) {
        eq._vivo = playing;
        eq.classList.toggle('live', playing);
        if (!playing) {
          for (let j = 0; j < barras.length; j++) { barras[j].style.transform = ''; barras[j]._paso = -1; }
        }
      }
      if (!playing) continue;
      for (let j = 0; j < barras.length && j < FILA_BANDAS.length; j++) {
        const paso = eqPrev[FILA_BANDAS[j]];
        if (barras[j]._paso !== paso) {
          barras[j]._paso = paso;
          barras[j].style.transform = 'scaleY(' + (0.25 + paso * 0.25).toFixed(2) + ')';
        }
      }
    }
  };

  const updateMiniEq = (playing) => {
    if (!eqBars.length) return;
    if (playing) {
      if (!eqLive) { miniEq.classList.add('live'); eqLive = true; }
      for (let k = 0; k < eqBars.length; k++) {
        const v = Math.min(1, (smooth[eqIdx[k]] || 0) * 1.35);
        const paso = Math.min(3, Math.round(v * 3));     // 0..3
        /* Se escribe transform, no height: escribir el alto obliga a rehacer
           layout. El valor está cuantizado a 4 pasos, así que casi todos los
           frames repiten y ni siquiera se toca el estilo. */
        if (eqPrev[k] !== paso) {
          eqPrev[k] = paso;
          eqBars[k].style.transform = 'scaleY(' + (0.25 + paso * 0.25).toFixed(2) + ')';
        }
      }
    } else if (eqLive) {
      miniEq.classList.remove('live');
      eqLive = false;
      for (let k = 0; k < eqBars.length; k++) { eqBars[k].style.transform = ''; eqPrev[k] = -1; }
    }
    pintarFilasEq(playing);
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
    /* El tope lo pone perf.js: 33 ms en el móvil o si la calidad ha bajado,
       16 ms (60 fps) en el resto. Antes aquí había un 0 con música sonando,
       o sea SIN tope: en un monitor de 120 o 165 Hz este canvas se repintaba
       120 o 165 veces por segundo para un gráfico de barras que a 60 se ve
       idéntico. Sin señal se sigue pidiendo 33: la onda de respaldo es lenta
       y suave y a 30 fps no se distingue. */
    const tope = window.MMPerf ? window.MMPerf.msFrame() : (playing ? 0 : 33);
    const minMs = playing ? tope : Math.max(33, tope);
    if (t0 - ultimoFrame < minMs) return;
    /* Tiempo real transcurrido desde el frame que SÍ se pintó (no desde el
       anterior sin más): con el tope de 30 fps del móvil, contar mal aquí
       haría que el suavizado se aplicara a medias. */
    const dt = ultimoFrame ? t0 - ultimoFrame : DT_NOMINAL;
    ultimoFrame = t0;
    const kSube = K(0.5, dt);
    const kBaja = K(0.12, dt);
    const fr = F60(dt);

    haySenal = playing;
    if (!vals) vals = idleSpectrum();

    /* Las cuentas se hacen SIEMPRE, se vea o no: smooth[] tiene que seguir
       vivo porque de ahí comen getBands() —la onda del modo cine— y el
       mini-EQ de la barra de estado. Ataque rápido, caída lenta; el pico
       cae con su propia inercia. */
    const nb = barrasVisibles();
    for (let i = 0; i < nb; i++) {
      const target = vals[i];
      const s = smooth[i];
      smooth[i] = s + (target - s) * (target > s ? kSube : kBaja);
      const v = smooth[i];
      if (v > peaks[i]) { peaks[i] = v; peakVel[i] = 0; }
      else { peakVel[i] += 0.0009 * fr; peaks[i] = Math.max(v, peaks[i] - peakVel[i] * fr); }
    }
    updateMiniEq(playing);

    // Fuera de pantalla (modo cine, ventana encogida) no se pinta nada
    if (!visible) return;

    /* Una columna por cada DOS bandas (32 con las 64 del ordenador): en un
       display de segmentos, 64 columnas finísimas se leen como ruido. */
    const nc = Math.max(1, Math.ceil(nb / 2));
    const R = rejilla(nc, playing);
    const { filas, cols, rows, tonos, lit } = R;

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(R.fondo, 0, 0, W, H);        // los segmentos apagados

    for (let c = 0; c < nc; c++) {
      const v = Math.max(smooth[2 * c], smooth[2 * c + 1] || 0);
      lit[c] = Math.min(filas, Math.round(v * filas));
    }
    /* Los encendidos, fila a fila: todas las columnas que llegan a esa
       altura van en un solo path con el tono de la fila. Si en una fila no
       hay ninguna, en las de encima tampoco. */
    for (let r = 0; r < filas; r++) {
      let hay = false;
      ctx.beginPath();
      const y = rows[r][0], h = rows[r][1];
      for (let c = 0; c < nc; c++) {
        if (lit[c] > r) { ctx.rect(cols[c][0], y, cols[c][1], h); hay = true; }
      }
      if (!hay) break;
      ctx.fillStyle = tonos[r];
      ctx.fill();
    }

    // el pico: un segmento claro que cae despacio por encima de la columna
    ctx.beginPath();
    let hayPico = false;
    for (let c = 0; c < nc; c++) {
      const n = Math.round(Math.max(peaks[2 * c], peaks[2 * c + 1] || 0) * filas);
      if (n < 1) continue;
      const r = Math.min(filas - 1, n - 1);
      ctx.rect(cols[c][0], rows[r][0], cols[c][1], rows[r][1]);
      hayPico = true;
    }
    if (hayPico) { ctx.fillStyle = R.pico; ctx.fill(); }
  };
  draw();

  /* ---------- El tiempo, con sus «8» apagados detrás ----------
     A juego con el espectro: el tiempo va en 7 segmentos (DSEG7, ver .time
     en el CSS) y, como en un display de verdad, detrás de cada cifra se ven
     sus segmentos apagados. El CSS los pinta con un ::before que lee
     data-g; aquí se escribe ese data-g —el mismo texto con cada cifra y cada
     «-» hecho un «8»— cada vez que alguien cambia el tiempo (app.js, el
     reloj de spotify.js, el modo «lo que queda»…). Escribir un atributo no
     despierta al observador, así que no hay bucle. */
  const fantasma = (el) => {
    if (!el) return;
    const poner = () => {
      const g = el.textContent.replace(/[0-9-]/g, '8');
      if (el.dataset.g !== g) el.dataset.g = g;
    };
    poner();
    new MutationObserver(poner).observe(el, { childList: true, characterData: true, subtree: true });
  };
  fantasma(document.getElementById('timeCurrent'));
  fantasma(document.getElementById('timeTotal'));

  // API pública mínima
  window.VisualizerModule = {
    /* «Hay FFT real ahora mismo», que es lo que preguntan quienes la usan.
       Antes devolvía `connected`, que solo mira si el grafo del <audio>
       local está montado: seguía dando true al pasarse a Spotify Connect
       (sin señal) y daba false con ◈ sync (con señal). Las dos al revés. */
    isConnected: () => haySenal,
    // ¿está activa la captura del audio del sistema?
    haySync: () => !!capStream,
    // lo llama js/settings.js al cambiar el permiso del micrófono
    refrescarSync: () => { pintarBotonSync(); if (capStream && !puedeCapturar()) stopCapture(); },
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
      /* Se remuestrea sobre las barras VIVAS, no sobre las 64 del array: en
         un móvil solo se rellenan las primeras y las demás valen 0 — el modo
         cine se quedaría con la onda plana de medio espectro en adelante. */
      const nb = barrasVisibles();
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        const j = Math.min(nb - 1, Math.round(i * (nb - 1) / Math.max(1, n - 1)));
        out[i] = smooth[j];
      }
      return out;
    },
  };
})();
