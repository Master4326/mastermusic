/* ==========================================================
   ESCENA SIN LETRA — estilo NCS
   Cuando LRClib no tiene la letra de la canción, el panel ya no se
   queda con un cartel de "no se encontró letra": monta la carátula
   en círculo, su anillo de progreso y un espectro circular que baila
   con la música.

   Vive FUERA de #lyricsBody y de #lyricsEdit a propósito, igual que
   el estado de reposo: el modo edit oculta uno de los dos, y algo que
   debe verse en los dos modos no puede vivir dentro de ninguno.
   La encienden y apagan las letras (js/lyrics.js).

   Aquí NO se detecta nada: el bombo y las bandas los da BeatModule /
   VisualizerModule, igual que en ambient.js y cinema.js. Todo lo que
   se escribe es transform / opacity / una variable, y solo cuando el
   valor cambió de verdad.
   ========================================================== */
(() => {
  'use strict';

  const panel = document.getElementById('lyricsNcs');
  if (!panel) return;

  const anillo = document.getElementById('ncsAnillo');
  const discoWrap = document.getElementById('ncsDiscoWrap');
  const disco = document.getElementById('ncsDisco');
  const prog = document.getElementById('ncsProg');
  const tituloEl = document.getElementById('ncsTitulo');
  const artistaEl = document.getElementById('ncsArtista');
  const notaEl = document.getElementById('ncsNota');
  const tabLyrics = document.getElementById('tab-lyrics');
  const mainFill = document.getElementById('progressFill');

  const calma = () => !!(window.MMSettings && window.MMSettings.reduceMotion());

  /* ---------- Espectro circular ----------
     Mismo truco que la escena instrumental del modo edit: el envoltorio
     fija el ángulo y la barra crece hacia afuera con scaleY (origen en
     el borde interior del anillo). Solo transform: todo va en GPU. */
  // 48 barras radiales en un teléfono son 48 escrituras de estilo por
  // frame; con la mitad el anillo se ve igual de lleno (ver js/perf.js).
  const NRAD = window.MMPerf ? window.MMPerf.cuantos(48) : 48;
  const barras = [];
  for (let k = 0; k < NRAD; k++) {
    const w = document.createElement('span');
    w.className = 'ncs-rad';
    w.style.transform = `rotate(${(k * 360 / NRAD).toFixed(1)}deg)`;
    const b = document.createElement('i');
    // sin motor de audio las barras laten solas: el desfase las pone en cascada
    b.style.animationDelay = ((k % 11) * 0.11).toFixed(2) + 's';
    w.appendChild(b);
    anillo.appendChild(w);
    barras.push(b);
  }

  /* ---------- Escrituras memorizadas ----------
     A 60 fps, repetir una escritura de estilo que no cambia nada es
     trabajo de estilo tirado a la basura.

     OJO: el memo va COLGADO DEL ELEMENTO, no en un diccionario con la
     clave `el.id + prop` como en cinema.js. Allí solo se escribe en nodos
     con id; aquí las 48 barras del espectro son <i> sin id, y con esa
     clave las 48 compartirían la misma entrada y se pisarían entre ellas:
     cada barra que coincidiera con la última escrita se quedaría clavada. */
  const escribir = (el, prop, val) => {
    if (!el) return;
    const memo = el._mmPrev || (el._mmPrev = {});
    if (memo[prop] === val) return;
    memo[prop] = val;
    el.style.setProperty(prop, val);
  };
  const alturas = new Array(NRAD).fill(0);

  /* ---------- Datos de la canción ----------
     La carátula y los títulos salen de PlayerCore, la única fuente que
     vale para los dos motores (archivo local y Spotify Connect). */
  let firmaPista = '';
  const revisarPista = () => {
    const t = window.PlayerCore && window.PlayerCore.state && window.PlayerCore.state.currentTrack;
    const cover = (t && t.cover) || '';
    const nombre = (t && t.name) || '';
    const artista = (t && t.artist) || '';
    const firma = cover + '|' + nombre + '|' + artista;
    if (firma === firmaPista) return;
    firmaPista = firma;
    if (disco) disco.style.backgroundImage = cover ? `url("${cover}")` : '';
    panel.classList.toggle('sin-portada', !cover);
    if (tituloEl) tituloEl.textContent = nombre;
    if (artistaEl) artistaEl.textContent = artista;
  };

  // Duración y segundo actual: con Spotify Connect el <audio> local está
  // parado, así que el avance se lee de la barra principal, que spotify.js
  // mantiene al día. Misma solución que el modo cine.
  const duracion = () => {
    const PC = window.PlayerCore;
    if (!PC) return 0;
    const t = PC.state.currentTrack;
    if (t && t.duration) return t.duration;
    return PC.audio && isFinite(PC.audio.duration) ? PC.audio.duration : 0;
  };
  const avance = () => {
    const PC = window.PlayerCore;
    if (PC && PC.audio && !PC.audio.paused && PC.audio.currentTime > 0) {
      const d = duracion();
      return d ? PC.audio.currentTime / d : 0;
    }
    if (!mainFill) return 0;
    return (parseFloat(mainFill.style.width) || 0) / 100;
  };

  /* ---------- El aviso de abajo ----------
     Con Spotify Connect el audio no pasa por el navegador: no hay nada
     que analizar y el espectro sería un adorno mudo. En ese caso la nota
     dice cómo engancharlo (◈) en vez de callarse — un panel que se mueve
     sin venir a cuento parece roto. */
  const TXT_VIVO = 'sin letra para esta canción · el espectro va con la música';
  const TXT_MUDO = 'sin letra para esta canción · pulsa ◈ para engancharlo al audio';
  let notaPuesta = '';
  const revisarNota = (vivo) => {
    const txt = vivo ? TXT_VIVO : TXT_MUDO;
    if (txt === notaPuesta) return;
    notaPuesta = txt;
    if (notaEl) notaEl.textContent = txt;
  };

  /* ---------- Bucle ----------
     Uno solo, y solo mientras la escena está a la vista: en otra pestaña
     de la app, en segundo plano o con la escena apagada no gasta frames. */
  let raf = 0;
  let cuenta = 0;

  /* Con el cine abierto el panel queda debajo de una capa a pantalla completa:
     se ve tanto como en otra pestaña de la app, o sea nada. */
  const aLaVista = () => !panel.hidden &&
    !document.hidden &&
    !document.body.classList.contains('cinema-open') &&
    !!(tabLyrics && tabLyrics.classList.contains('active'));

  const relojPintado = { ultimo: 0 };

  const paso = () => {
    raf = requestAnimationFrame(paso);
    if (!aLaVista()) return;
    if (window.MMPerf && window.MMPerf.salta(relojPintado, performance.now())) return;

    // la carátula y el título se comprueban de vez en cuando: cambiar de
    // canción no dispara ningún evento que llegue hasta aquí
    if (cuenta++ % 30 === 0) revisarPista();

    const viz = window.VisualizerModule;
    const vivo = !!(viz && viz.isConnected && viz.isConnected());
    if (cuenta % 30 === 1) revisarNota(vivo);

    const M = window.BeatModule;
    const m = M && M.get ? M.get() : null;

    // el anillo de progreso vale también quieto: es información, no adorno
    const p = avance();
    escribir(prog, '--p', p.toFixed(3));

    if (calma()) {
      // el usuario (o su sistema) pide menos movimiento: la escena se queda,
      // el baile no. Es contenido, no decoración: apagarla dejaría un hueco.
      panel.classList.remove('live');
      escribir(discoWrap, 'transform', 'none');
      return;
    }

    const bands = viz && viz.getBands ? viz.getBands(25) : null;
    panel.classList.toggle('live', !!bands);
    if (!bands) return;

    /* Graves arriba y espejados a los lados: la distancia circular al punto
       más alto elige la banda, así el anillo es simétrico y el bombo se ve
       siempre en la misma parte. */
    for (let k = 0; k < NRAD; k++) {
      const d = Math.min(k, NRAD - k) / (NRAD / 2);
      const v = bands[Math.round(d * (bands.length - 1))] || 0;
      // suavizado asimétrico: sube de golpe, baja despacio (así se siente el golpe)
      const a = alturas[k];
      alturas[k] = v > a ? a + (v - a) * 0.55 : a + (v - a) * 0.14;
      const esc = (0.12 + alturas[k] * 1.85).toFixed(3);
      escribir(barras[k], 'transform', `scaleY(${esc})`);
    }

    /* La carátula pega con el BOMBO, no con el nivel medio de graves:
       aquello es un globo hinchándose sin parar. Suave a propósito — en
       este proyecto el fondo no parpadea por golpe, y esto es el sujeto
       de la escena, no el fondo. */
    const graves = m ? m.graves : (bands[0] + bands[1] + bands[2]) / 3;
    const golpe = m ? m.boom * m.boomFuerza : 0;
    escribir(discoWrap, 'transform', `scale(${(1 + graves * 0.035 + golpe * 0.075).toFixed(3)})`);
  };

  const arrancar = () => { if (!raf) paso(); };
  const parar = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) parar(); else if (!panel.hidden) arrancar();
  });

  /* ---------- API ---------- */
  const mostrar = () => {
    if (!panel.hidden) return;
    panel.hidden = false;
    firmaPista = '';        // fuerza el repintado de carátula y títulos
    notaPuesta = '';
    revisarPista();
    arrancar();
  };

  const ocultar = () => {
    if (panel.hidden) return;
    panel.hidden = true;
    parar();
    // deja el anillo en reposo: si vuelve a salir, no arranca con la foto
    // congelada del último frame de la canción anterior
    for (let k = 0; k < NRAD; k++) alturas[k] = 0;
    panel.classList.remove('live');
  };

  window.NcsScene = {
    mostrar,
    ocultar,
    activa: () => !panel.hidden,
  };
})();
