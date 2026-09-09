/* ==========================================================
   KARAOKE CON PUNTUACIÓN — cuánto acompañas de verdad la letra.

   EL TECHO, DICHO DE ENTRADA. Esto **no puntúa afinación**, y no es por
   pereza: el audio de Spotify va cifrado (DRM) y el navegador no deja
   analizarlo, así que la app no sabe qué nota suena en la canción. Sin la
   melodía original no hay con qué comparar. Lo que SÍ se puede medir, y es
   lo que hace, es si estás cantando **cuando toca**: si tu voz aparece
   mientras la línea está activa y se calla entre líneas.

   O sea: puntúa el ritmo y la constancia, no el oído. Está dicho en la
   pantalla también, para no vender lo que no es.

   CÓMO LO MIDE
   · Micrófono propio (no el del visualizador: ese es opcional y puede estar
     apagado; y aquí hace falta la onda cruda, sin filtros de eco).
   · Cada 60 ms mira la energía (RMS) y estima si hay voz humana por
     autocorrelación en el rango 80–1000 Hz. Un pico de energía sin período
     estable es ruido o un golpe de la canción, no una voz.
   · Compara con la línea que `LyricsModule` diga que está activa.

   EL PROBLEMA DE LOS ALTAVOCES, sin rodeos: el micrófono también oye la
   canción. Con altavoces, la app puntuaría a Kevin Kaarl y no a ti. Por eso
   se calibra el ruido de fondo ENTRE líneas y solo cuenta lo que sube
   claramente por encima — y aun así, **con auriculares esto funciona bien y
   sin ellos regular**. Se avisa al encenderlo.
   ========================================================== */
(() => {
  'use strict';

  const boton = document.getElementById('karaokeBtn');
  if (!boton) return;

  const MUESTRA = 2048;        // ventana de análisis
  const PASO = 60;             // ms entre medidas
  const F_MIN = 80, F_MAX = 1000;   // rango de voz cantada
  const MARGEN = 2.2;          // cuánto hay que subir sobre el fondo para contar

  let ctx = null, analizador = null, stream = null, fuente = null;
  let datos = null, timer = null;
  let activo = false;

  let idxLinea = -1;           // línea que se está midiendo
  let conVoz = 0, total = 0;   // muestras de la línea actual
  let fondo = 0.01;            // nivel de ruido/música medido entre líneas
  const notas = [];            // puntuación de cada línea cerrada

  const panel = () => document.getElementById('karaokePanel');

  const setStatus = (m) => { if (window.SevenStatus) window.SevenStatus(m); };

  // ---------- Análisis ----------
  const rms = (buf) => {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  };

  /* Autocorrelación: busca el período que mejor se repite. Sirve para
     distinguir una VOZ (señal periódica) de un golpe de batería o del roce
     del micro, que tienen energía pero no período estable. No hace falta
     afinar fino —no vamos a comparar notas—, solo saber si hay tono. */
  const hayTono = (buf, sr) => {
    const tMin = Math.floor(sr / F_MAX);
    const tMax = Math.floor(sr / F_MIN);
    let mejor = -1, mejorCorr = 0, energia = 0;
    for (let i = 0; i < buf.length; i++) energia += buf[i] * buf[i];
    if (energia < 1e-4) return false;
    for (let t = tMin; t <= tMax && t < buf.length; t++) {
      let c = 0;
      for (let i = 0; i < buf.length - t; i++) c += buf[i] * buf[i + t];
      c /= (buf.length - t);
      if (c > mejorCorr) { mejorCorr = c; mejor = t; }
    }
    // Normalizado contra la energía: por encima de 0.35 ya es claramente tonal
    return mejor > 0 && (mejorCorr / (energia / buf.length)) > 0.35;
  };

  // ---------- Puntuación ----------
  const cerrarLinea = () => {
    if (total < 3) { conVoz = 0; total = 0; return; }   // línea demasiado corta
    /* La nota es la fracción de la línea en la que había voz, con un tope
       generoso: nadie canta el 100% del tiempo —hay respiraciones— así que
       un 70% de cobertura ya se considera perfecto. */
    const cobertura = conVoz / total;
    notas.push(Math.max(0, Math.min(100, Math.round((cobertura / 0.7) * 100))));
    conVoz = 0; total = 0;
    pintar();
  };

  const media = () => notas.length
    ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : 0;

  const juicio = (n) => n >= 90 ? 'te la sabes entera'
    : n >= 70 ? 'muy bien'
    : n >= 45 ? 'vas siguiéndola'
    : n >= 20 ? 'te pierdes a ratos'
    : 'casi no te oigo';

  const pintar = () => {
    const p = panel();
    if (!p) return;
    const n = media();
    p.innerHTML = `
      <div class="kar-nota"><b>${n}</b><span>de 100</span></div>
      <div class="kar-info">
        <div class="kar-juicio">${notas.length ? juicio(n) : 'esperando a que empiece la letra…'}</div>
        <div class="kar-lineas">${notas.length} ${notas.length === 1 ? 'línea' : 'líneas'} medidas</div>
        <div class="kar-barras">${notas.slice(-24).map((x) =>
          `<i style="height:${Math.max(6, x)}%"></i>`).join('')}</div>
      </div>`;
  };

  // ---------- Bucle ----------
  const tic = () => {
    if (!activo || !analizador) return;
    analizador.getFloatTimeDomainData(datos);
    const nivel = rms(datos);
    const L = window.LyricsModule;
    const s = (L && L.getSync) ? L.getSync() : null;
    const idx = s ? s.idx : -1;
    const enLinea = idx >= 0 && s && s.lines && s.lines[idx] && s.lines[idx].time >= 0;

    if (!enLinea) {
      /* Entre líneas: aquí solo debería sonar la canción. Es la referencia
         para saber qué es «fondo» y qué es tu voz. Se sigue lentamente para
         que un cambio de volumen no rompa la medida. */
      fondo = fondo * 0.95 + nivel * 0.05;
      if (idxLinea !== -1) { cerrarLinea(); idxLinea = -1; }
      return;
    }

    if (idx !== idxLinea) { cerrarLinea(); idxLinea = idx; }
    total++;
    if (nivel > fondo * MARGEN && hayTono(datos, ctx.sampleRate)) conVoz++;
  };

  // ---------- Encender / apagar ----------
  const encender = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Crudo: los filtros de eco y ruido se comen justo lo que medimos
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      setStatus('✕ sin micrófono no se puede puntuar');
      return false;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (x) {} }
    fuente = ctx.createMediaStreamSource(stream);
    analizador = ctx.createAnalyser();
    analizador.fftSize = MUESTRA;
    /* El micrófono NO se conecta al destino: se oiría a sí mismo y acoplaría.
       Un analizador suelto funciona sin necesidad de llegar a la salida. */
    fuente.connect(analizador);
    datos = new Float32Array(analizador.fftSize);
    notas.length = 0;
    conVoz = 0; total = 0; idxLinea = -1; fondo = 0.01;
    activo = true;
    timer = setInterval(tic, PASO);
    document.body.classList.add('karaoke-on');
    pintar();
    setStatus('♪ karaoke: canta con la letra · mejor con auriculares');
    return true;
  };

  const apagar = () => {
    activo = false;
    clearInterval(timer); timer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (ctx) { try { ctx.close(); } catch (e) {} }
    ctx = null; analizador = null; fuente = null; stream = null;
    document.body.classList.remove('karaoke-on');
    const n = media();
    if (notas.length) setStatus(`♪ karaoke: ${n}/100 · ${juicio(n)}`);
  };

  boton.addEventListener('click', async () => {
    if (activo) { apagar(); boton.classList.remove('activo'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('✕ este navegador no da acceso al micrófono');
      return;
    }
    if (await encender()) boton.classList.add('activo');
  });

  // Si se cierra la pestaña, soltar el micrófono
  window.addEventListener('pagehide', () => { if (activo) apagar(); });

  window.KaraokeModule = {
    activo: () => activo,
    nota: () => media(),
    apagar,
  };
})();
