/* ==========================================================
   DIÁLOGO DE LA CASA · preguntar sin la ventana del navegador

   La app preguntaba con `confirm()` y avisaba con `alert()`: la ventana
   gris del navegador, con su letra de sistema y su «127.0.0.1 dice…» en la
   cabecera, en mitad de una app pixelada. Y además BLOQUEA la página
   entera mientras está abierta: la letra se congela, el espectro se para y
   los relojes se atrasan.

   Esta es la misma ventana que ya tenía «conectar con spotify» (las clases
   .cid-* de style.css): barra con los puntos del acento, la paleta viva y
   los botones de la casa. No bloquea nada; devuelve una promesa.

     MMDialogo.confirmar({ titulo, texto, detalle, si, no }) → Promise<boolean>

   `texto` y `detalle` van SIEMPRE como texto, nunca como HTML: llevan
   nombres de canciones, y un título con «<» no puede romper la ventana.

   Mientras está abierta, las teclas son suyas: Esc dice que no, el
   tabulador da vueltas entre sus botones, y ningún atajo de la app (la W,
   la S, los números, el espacio de play/pausa) se cuela por debajo. El
   foco empieza en «no»: en una pregunta que borra algo, un Intro dado sin
   mirar no debe borrar nada.
   ========================================================== */
(() => {
  'use strict';

  let actual = null;        // el que está en pantalla: uno cada vez

  const confirmar = (opciones) => new Promise((resolve) => {
    const o = opciones || {};
    // Si ya había uno abierto, ese se cierra diciendo que no
    if (actual) actual(false);

    const antes = document.activeElement;
    const fondo = document.createElement('div');
    fondo.className = 'cid-fondo dlg-fondo';
    fondo.innerHTML = `
      <div class="cid-ventana dlg-ventana" role="alertdialog" aria-modal="true"
           aria-labelledby="dlgTitulo" aria-describedby="dlgTexto">
        <div class="cid-barra">
          <span class="cid-puntos" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
          <span class="cid-titulo" id="dlgTitulo"></span>
          <button type="button" class="cid-x dlg-x" aria-label="Cerrar">✕</button>
        </div>
        <div class="cid-cuerpo">
          <p class="dlg-texto" id="dlgTexto"></p>
          <p class="cid-fino dlg-detalle" hidden></p>
          <div class="cid-botones">
            <button type="button" class="cid-cancelar dlg-no"></button>
            <button type="button" class="cid-ok dlg-si"></button>
          </div>
        </div>
      </div>`;
    const q = (s) => fondo.querySelector(s);
    q('.cid-titulo').textContent = o.titulo || 'master music';
    q('.dlg-texto').textContent = o.texto || '¿seguro?';
    if (o.detalle) {
      q('.dlg-detalle').textContent = o.detalle;
      q('.dlg-detalle').hidden = false;
    }
    const bNo = q('.dlg-no');
    const bSi = q('.dlg-si');
    bNo.textContent = o.no || 'cancelar';
    bSi.textContent = o.si || 'sí';

    let hecho = false;
    const cerrar = (valor) => {
      if (hecho) return;
      hecho = true;
      actual = null;
      window.removeEventListener('keydown', teclas, true);
      fondo.remove();
      if (antes && antes.isConnected && antes.focus) {
        try { antes.focus({ preventScroll: true }); } catch (e) { /* sin foco que devolver */ }
      }
      resolve(!!valor);
    };
    actual = cerrar;

    /* En `window` y en captura: así llega ANTES que cualquier oyente de la
       app (los atajos viven en `document`, y el cine y el 9:16 en `window`
       con captura, que se registraron antes que este). */
    const teclas = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        cerrar(false);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const orden = [bNo, bSi, q('.dlg-x')];
        const i = orden.indexOf(document.activeElement);
        const paso = e.shiftKey ? -1 : 1;
        orden[(i + paso + orden.length) % orden.length].focus();
        return;
      }
      /* Intro y espacio sobre un botón de la ventana los pulsa el propio
         navegador; lo que no se deja es que la tecla siga hasta la app. */
      e.stopImmediatePropagation();
      if (!fondo.contains(document.activeElement)) e.preventDefault();
    };
    window.addEventListener('keydown', teclas, true);

    bNo.addEventListener('click', () => cerrar(false));
    q('.dlg-x').addEventListener('click', () => cerrar(false));
    bSi.addEventListener('click', () => cerrar(true));
    // pulsar en lo oscuro de alrededor es «no», como en cualquier ventana
    fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(false); });

    document.body.appendChild(fondo);
    bNo.focus({ preventScroll: true });
  });

  window.MMDialogo = {
    confirmar,
    abierto: () => !!actual,
  };
})();
