/* ==========================================================
   ENTRADAS — las otras puertas por las que se llega a la app

   Hasta ahora a MASTER MUSIC solo se entraba de una forma: abriéndola y
   poniéndose a buscar. Instalada como app (PWA), el sistema operativo
   ofrece tres puertas más que no costaban nada y estaban sin usar:

   · COMPARTIR (`share_target`). En el móvil, «Compartir» de cualquier app
     —Spotify, WhatsApp, el navegador— enseña a MASTER MUSIC en la lista.
     Compartes una canción de Spotify y suena aquí, con su letra. Si lo que
     llega no es un enlace, se abre el buscador con ese texto escrito.

   · ABRIR ARCHIVOS (`file_handlers`). Doble clic en un mp3 y lo abre este
     reproductor, como cualquier programa de música. Los archivos llegan por
     `launchQueue`, que es la única forma: el manifiesto solo dice QUÉ se
     acepta, recogerlos es cosa del JavaScript.

   · ATAJOS (`shortcuts`). Clic derecho en el icono (o mantener pulsado en
     Android): «buscar», «mi música», «historial». Llegan como `?ir=…`.

   ---- POR QUÉ `focus-existing` ----
   En el manifiesto, `launch_handler` está en `focus-existing` a propósito:
   con `navigate-existing` —lo normal— compartir una canción mientras suena
   otra RECARGARÍA la pestaña y cortaría la música. Así no: la ventana que
   ya está abierta se pone delante y lo que llega entra por `launchQueue`,
   sin recargar nada. Por eso hay dos caminos aquí: los parámetros de la url
   al arrancar (arranque en frío) y los de `launchQueue` (ventana ya viva).

   ---- LO QUE NO HACE ----
   No toca la vuelta de Spotify (`?code=…`): esa es de js/spotify.js y se
   reconoce por sus propios parámetros. Si están, este módulo se aparta.
   ========================================================== */
(() => {
  'use strict';

  const PC = () => window.PlayerCore;
  const BUS = () => window.Buscador;

  const estado = (msg) => { if (window.SevenStatus) window.SevenStatus(msg); };

  /* Por MMNav y no por un `.click()` en la pestaña: el engranaje es un
     interruptor (dentro de configuración te SACA), así que simularle un
     clic para «ir a ajustes» te echaba fuera si ya estabas dentro. */
  const irPestania = (n) => {
    if (window.MMNav) { window.MMNav.ir(n); return; }
    const t = document.querySelector(`.tab[data-tab="${n}"]`);
    if (t) t.click();
  };

  // A dónde lleva cada atajo del icono
  const DESTINOS = {
    buscar: () => { if (BUS()) BUS().abrir(); },
    listas: () => irPestania('library'),
    cola: () => irPestania('queue'),
    historial: () => irPestania('stats'),
    letra: () => irPestania('lyrics'),
    config: () => irPestania('settings'),
  };

  /* La app tarda un momento en estar entera (los módulos van con `defer` y
     la biblioteca se monta al vuelo). Nada de esto corre prisa: se espera a
     que esté quien tiene que atenderlo, con un tope para no quedarse
     esperando para siempre si algo no cargó. */
  const cuandoListo = (fn, intentos = 40) => {
    if (PC() && BUS()) { fn(); return; }
    if (intentos <= 0) return;
    setTimeout(() => cuandoListo(fn, intentos - 1), 150);
  };

  // ---------- Lo que llega compartido ----------
  const atender = (params) => {
    // La vuelta de la autorización de Spotify no es cosa nuestra
    if (params.get('code') || params.get('error')) return false;

    const ir = params.get('ir');
    if (ir && DESTINOS[ir]) {
      cuandoListo(DESTINOS[ir]);
      return true;
    }

    /* Compartido. Android manda el enlace unas veces en `url` y otras
       dentro de `text` (WhatsApp, por ejemplo, manda todo junto en `text`),
       así que se mira en los tres y se queda con el primero que traiga algo. */
    const trozos = [params.get('url'), params.get('text'), params.get('title')]
      .map((x) => (x || '').trim()).filter(Boolean);
    if (!trozos.length) return false;

    cuandoListo(() => {
      const juntos = trozos.join(' ');
      // ¿Hay un enlace de Spotify ahí dentro? Entonces eso es lo que quiere
      if (BUS().enlace && BUS().enlace(juntos)) {
        estado('⇥ abriendo lo que compartiste…');
        return;
      }
      /* Sin enlace: se abre el buscador con el texto puesto. NO se pone a
         sonar nada solo — compartir un texto es «busca esto», no «pon lo
         primero que salga». */
      BUS().abrir(trozos[0].slice(0, 120));
      estado('⌕ buscando lo que compartiste');
    });
    return true;
  };

  /* Los parámetros se quitan de la barra de direcciones en cuanto se
     atienden: si no, recargar la página volvería a abrir lo mismo y quien
     guardara esa url en favoritos se llevaría el enlace de otro día. */
  const limpiarUrl = () => {
    try { window.history.replaceState({}, '', window.location.pathname); } catch (e) {}
  };

  // ---------- Arranque en frío: lo que venga en la url ----------
  const alArrancar = () => {
    let params;
    try { params = new URL(window.location.href).searchParams; } catch (e) { return; }
    if (atender(params)) limpiarUrl();
  };

  // ---------- Ventana ya abierta: lo que traiga launchQueue ----------
  /* Se engancha lo antes posible y sin esperar a nada: el sistema encola lo
     que llegue hasta que alguien lo recoge, pero si nadie lo recoge nunca,
     compartir una canción se queda en que la ventana pasa a primer plano y
     no pasa nada más. */
  if ('launchQueue' in window && window.launchQueue && window.launchQueue.setConsumer) {
    window.launchQueue.setConsumer((lanzamiento) => {
      if (!lanzamiento) return;

      // Archivos (doble clic en un mp3, o «abrir con»)
      const manejadores = lanzamiento.files || [];
      if (manejadores.length) {
        cuandoListo(async () => {
          const archivos = [];
          for (const h of manejadores) {
            try { archivos.push(await h.getFile()); } catch (e) { /* permiso retirado */ }
          }
          if (!archivos.length) { estado('✕ no se pudieron abrir esos archivos'); return; }
          estado('▣ abriendo ' + archivos.length + (archivos.length === 1 ? ' archivo' : ' archivos'));
          PC().addFiles(archivos);
        });
        return;
      }

      // Compartido o atajo con la ventana ya abierta
      if (lanzamiento.targetURL) {
        try {
          const u = new URL(lanzamiento.targetURL, window.location.href);
          atender(u.searchParams);
        } catch (e) { /* url rara: mejor no hacer nada */ }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', alArrancar);
  } else {
    alArrancar();
  }
})();
