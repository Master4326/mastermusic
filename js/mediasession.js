/* ==========================================================
   SESIÓN DE MEDIOS — la app existe fuera de su ventana.
   Publica la canción en el sistema operativo: carátula y título en el
   overlay de volumen de Windows, en la pantalla de bloqueo del móvil, en
   el centro multimedia del navegador, y hace que respondan los botones
   de los auriculares y las teclas ⏯ ⏮ ⏭ del teclado.

   LÍMITE HONESTO: el navegador solo enseña esta ficha cuando hay audio
   REAL sonando en la pestaña. Con un mp3 local sale siempre; con Spotify
   Connect el audio no pasa por el navegador (lo sirve la app de Spotify
   en otro dispositivo), así que ahí no aparece — y no hace falta, porque
   el propio Spotify ya publica su ficha en el sistema. Los mandos se
   registran igual: no cuesta nada y así los dos casos comparten camino.
   ========================================================== */
(() => {
  'use strict';

  const ms = navigator.mediaSession;
  if (!ms || typeof window.MediaMetadata !== 'function') return;

  const PC = () => window.PlayerCore;

  /* ---- Carátula ----
     El sistema pide un juego de tamaños. No tenemos varias resoluciones de
     la misma imagen, así que declaramos la que hay en los tres tamaños que
     Windows y Android suelen pedir: el sistema la reescala. Sin `sizes` hay
     lanzadores que la descartan y dejan el hueco gris. */
  const TAMANOS = ['96x96', '256x256', '512x512'];

  const tipoDe = (src) => {
    const m = /^data:([^;,]+)/.exec(src || '');
    if (m) return m[1];
    if (/\.png(\?|$)/i.test(src)) return 'image/png';
    return 'image/jpeg';
  };

  const artwork = (cover) => {
    if (!cover) return [];
    const type = tipoDe(cover);
    return TAMANOS.map((sizes) => ({ src: cover, sizes, type }));
  };

  // ---- Ficha de la canción ----
  const publicar = (t) => {
    if (!t) { ms.metadata = null; return; }
    try {
      ms.metadata = new MediaMetadata({
        title: t.name || 'Sin título',
        artist: t.artist || '',
        album: t.album || '',
        artwork: artwork(t.cover),
      });
    } catch (e) {
      console.warn('[mediasession] no se pudo publicar la ficha:', e);
    }
  };

  /* ---- Mandos ----
     Todos delegan en PlayerCore, que ya sabe si mandar al <audio> local o a
     Spotify Connect. Registrar uno que no se puede atender es peor que no
     registrarlo: el sistema pinta el botón y luego no hace nada. */
  const SALTO = 10;   // segundos de los botones de retroceso/avance

  const mando = (nombre, fn) => {
    try { ms.setActionHandler(nombre, fn); }
    catch (e) { /* acción no soportada por este navegador: se ignora */ }
  };

  mando('play',  () => { const p = PC(); if (p && !p.playing()) p.togglePlay(); });
  mando('pause', () => { const p = PC(); if (p && p.playing()) p.togglePlay(); });
  mando('previoustrack', () => { const p = PC(); if (p) p.prev(); });
  mando('nexttrack',     () => { const p = PC(); if (p) p.next(); });
  mando('seekbackward', (d) => {
    const p = PC(); if (!p) return;
    p.seek(p.position() - ((d && d.seekOffset) || SALTO));
  });
  mando('seekforward', (d) => {
    const p = PC(); if (!p) return;
    p.seek(p.position() + ((d && d.seekOffset) || SALTO));
  });
  mando('seekto', (d) => {
    const p = PC(); if (!p || !d || d.seekTime == null) return;
    p.seek(d.seekTime);
  });
  mando('stop', () => { const p = PC(); if (p && p.playing()) p.togglePlay(); });

  /* ---- Estado y posición ----
     `setPositionState` es lo que dibuja la barra de progreso del sistema.
     Es quisquillosa: revienta si la posición se pasa de la duración o si
     alguna no es finita — y con Spotify la duración llega un instante
     después que la canción. De ahí la comprobación antes de escribir.

     Solo se escribe cuando algo cambia de verdad: el estado, o un salto
     mayor de medio segundo respecto a lo que el sistema ya estaba
     extrapolando por su cuenta. Escribirlo 2 veces por segundo a pelo hace
     que la barra del sistema tiemble. */
  let estadoPrev = null;
  let posPrev = 0;
  let selloPrev = 0;

  const refrescar = () => {
    const p = PC();
    if (!p) return;

    const sonando = p.playing();
    const estado = sonando ? 'playing' : 'paused';
    if (estado !== estadoPrev) {
      ms.playbackState = p.state.currentTrack ? estado : 'none';
      estadoPrev = estado;
      selloPrev = 0;               // fuerza reescribir la posición
    }

    if (typeof ms.setPositionState !== 'function') return;

    const dur = p.duration();
    const pos = p.position();
    if (!isFinite(dur) || dur <= 0 || !isFinite(pos) || pos < 0) return;

    // dónde creería el sistema que estamos si nadie le dijera nada
    const estimado = selloPrev
      ? posPrev + (sonando ? (performance.now() - selloPrev) / 1000 : 0)
      : null;
    if (estimado !== null && Math.abs(pos - estimado) < 0.5) return;

    try {
      ms.setPositionState({
        duration: dur,
        playbackRate: 1,
        position: Math.min(pos, dur),
      });
      posPrev = pos;
      selloPrev = performance.now();
    } catch (e) {
      // duración aún inconsistente (cambio de canción a medias): al próximo
    }
  };

  const arrancar = () => {
    const p = PC();
    if (!p || !p.onTrack) { setTimeout(arrancar, 300); return; }
    p.onTrack((t) => {
      publicar(t);
      selloPrev = 0;               // canción nueva: la barra del sistema se re-ancla
      estadoPrev = null;
    });
    setInterval(refrescar, 500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
