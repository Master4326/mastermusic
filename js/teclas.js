/* ==========================================================
   TECLAS · de quién es cada tecla
   ==========================================================

   Tres sitios escuchan el teclado de la app: los mandos del reproductor
   (js/app.js), las pestañas (js/seven.js) y el buscador universal
   (js/buscador.js). Los dos primeros solo miraban `e.target.tagName ===
   'INPUT'`, y por ahí se colaban tres cosas que se sienten como una app
   rota:

     · **Los atajos del navegador.** Ctrl+B (marcadores), Ctrl+H (historial),
       Ctrl+S (guardar página) y Ctrl+F (buscar en la página) llevan dentro
       una letra que aquí es un atajo. Pulsar Ctrl+F abría la barra de buscar
       de Chrome Y saltaba a la pestaña de Spotify: dos cosas a la vez, y
       ninguna pedida.

     · **El botón que tiene el foco.** El espacio es play/pausa, con
       `preventDefault()`. Quien se mueve con el tabulador llegaba a
       «siguiente», pulsaba espacio y lo que pasaba era play/pausa: el botón
       enfocado NO se podía pulsar. La tecla es del botón mientras haya un
       botón esperándola.

     · **Los cuadros de texto que no son `<input>`.** Un `<textarea>` o
       cualquier cosa con `contenteditable` tragaba los atajos igual: escribir
       una «s» dentro saltaba a configuración.

   Esto lo contesta UNA vez para todos. `js/buscador.js` ya lo hacía por su
   cuenta y bien; se queda como está (necesita que Ctrl+K funcione hasta
   escribiendo, que es la excepción).
   ========================================================== */
(() => {
  'use strict';

  /* ¿Está el foco dentro de algo donde se escribe? */
  const enTexto = (el) => {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const t = el.tagName;
    if (t === 'TEXTAREA' || t === 'SELECT') return true;
    if (t !== 'INPUT') return false;
    /* Un `<input type="range">` o `type="checkbox"` no traga texto, pero sí
       usa las flechas y el espacio para lo suyo, así que también manda. */
    return true;
  };

  /* Elementos que se activan solos con espacio o enter: mientras uno tenga
     el foco, esas dos teclas son suyas y no de la app. */
  const ROLES = new Set(['button', 'tab', 'link', 'checkbox', 'radio', 'switch', 'menuitem', 'option']);
  const activable = (el) => {
    if (!el || el === document.body) return false;
    const t = el.tagName;
    if (t === 'BUTTON' || t === 'A' || t === 'SUMMARY') return true;
    const rol = el.getAttribute && el.getAttribute('role');
    return !!(rol && ROLES.has(rol));
  };

  window.MMTeclas = {
    /* ¿Esta tecla es para la app? Falso si la está usando un cuadro de
       texto o si viene con un modificador (o sea, es del navegador o del
       sistema). Los atajos propios con modificador —Ctrl+K— se miran
       aparte, antes de preguntar aquí. */
    libre(e) {
      if (!e) return false;
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      return !enTexto(e.target);
    },

    /* ¿La tecla iría a parar al elemento que tiene el foco? Espacio y enter
       sobre un botón son del botón. */
    activaFoco(e) {
      if (!e) return false;
      if (e.code !== 'Space' && e.key !== ' ' && e.key !== 'Enter') return false;
      return activable(document.activeElement);
    },

    enTexto,
  };

  /* ══════════════════════════════════════════════════════════
     EL OTRO LADO DE LA MONEDA
     ══════════════════════════════════════════════════════════
     Si el espacio es del botón que tiene el foco, hay que mirar quién se
     queda el foco sin pedirlo. Al pulsar con el RATÓN, el navegador deja
     el foco puesto en el botón: pulsas «cola» con el ratón, luego le das
     al espacio esperando pausar… y el espacio se lo queda la pestaña
     «cola», que ya está abierta. O sea, nada. Antes funcionaba, así que
     sería cambiar un problema por otro.

     El foco solo se suelta cuando el clic vino del ratón (`detail > 0`);
     desde el teclado —enter o espacio sobre el botón enfocado— `detail`
     es 0 y el foco se queda donde estaba, que es justo lo que necesita
     quien navega con el tabulador.

     Solo la fila de mandos y las pestañas (y el ⚙ de la barra de título
     del teléfono, que es el engranaje de las pestañas): son las que
     compiten con el espacio. El ✖ del volumen se queda fuera porque su
     barra se despliega con `:focus-within`, y soltarle el foco la cerraría
     de golpe. */
  document.addEventListener('click', (e) => {
    if (e.detail === 0) return;
    const b = e.target.closest && e.target.closest('.tab, .ctrl-btn, .tb-cfg');
    if (!b || b.id === 'volBtn') return;
    if (document.activeElement === b) b.blur();
  });
})();
