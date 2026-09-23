/* ==========================================================
   EL TELÉFONO EN VERTICAL · lo que cambia de sitio

   En un teléfono la app se maneja con el pulgar, y el pulgar llega ABAJO.
   La disposición de escritorio ponía justo al revés lo que más se toca:
   las pestañas arriba, en mitad de la pantalla (y encima recogiéndose
   solas), el ♡ perdido entre los botones de la música, «dónde suena» en
   la barra de estado al lado del reloj, y diez botones apretados en una
   sola fila de 28 a 44 px de ancho.

   Este módulo SOLO muda nodos: qué va a qué sitio. Cómo se ve cada uno lo
   dice style.css bajo `body.disp-movil`. Y muda los nodos DE VERDAD, sin
   copias: el mismo botón con sus mismos oyentes. Así spotify.js sigue
   pintando el ♡ y el ◎ por su id, seven.js sigue escribiendo los avisos en
   #statusText y la barra de pestañas sigue siendo la misma barra, con su
   tirador y su «se esconde sola». Nadie tiene que enterarse de dónde vive
   cada cosa.

     pestañas   → al pie de la ventana, debajo de la música
     ♡          → a la franja de «ahora suena», al lado del título
     ◎          → a la fila de vista (y su menú trae el volumen)
     los avisos → a la franja, en el renglón del disco, 4 s

   Con la LETRA ANCHA la franja se esconde entera —para eso está—, así que
   el ♡ pasa a la fila de vista y los avisos vuelven a su barra de estado
   (que en ese caso se enseña). seven.js avisa con `mm:ancho`.

   Cada nodo mudado deja una marca (un comentario) en su sitio de siempre:
   al girar el teléfono o ensanchar la ventana, vuelve exactamente ahí.
   Es la misma idea que usa el modo cine para llevarse #lyricsEdit.

   El ◈ del espectro NO se muda aquí: ya lo muda seven.js con la letra
   ancha, y dos módulos moviendo el mismo nodo acaban peleándose. seven.js
   escucha `mm:disposicion` y lo coloca él.

   Va de los primeros en index.html: cuanto antes corra, menos se ve la
   mudanza al abrir la app.
   ========================================================== */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const body = document.body;

  /* La MISMA condición que el bloque «MÓVIL VERTICAL» de style.css. Un
     teléfono tumbado no entra (ahí la pantalla es baja y las pestañas se
     quedan arriba, en su panel), y una ventana estrecha de escritorio sí:
     cabe lo mismo que en un teléfono, solo que se maneja con ratón. */
  const mq = window.matchMedia
    ? window.matchMedia('(orientation: portrait) and (max-width: 760px)')
    : { matches: false };   // sin matchMedia: la disposición de siempre

  const ventana  = document.querySelector('.window');
  const pestanas = document.querySelector('.tab-bar');
  const franja   = document.querySelector('.left-panel');
  const info     = document.querySelector('.track-info');
  const vista    = document.querySelector('.ctl-vista');
  const corazon  = $('likeBtn');
  const aparato  = $('devChip');
  const avisos   = $('statusText');

  const marcas = new Map();

  const mudar = (el, padre) => {
    if (!el || !padre) return;
    if (!marcas.has(el)) {
      const m = document.createComment(' sitio de ' + (el.id ? '#' + el.id : '.' + el.className.split(' ')[0]) + ' ');
      el.parentNode.insertBefore(m, el);
      marcas.set(el, m);
    }
    if (el.parentNode !== padre) padre.appendChild(el);
  };

  const devolver = (el) => {
    const m = el && marcas.get(el);
    if (m && m.parentNode && el.nextSibling !== m) m.parentNode.insertBefore(el, m);
  };

  let movilAntes = null;
  let firmaAntes = '';

  const aplicar = () => {
    const movil = !!mq.matches;
    /* Con la LETRA ANCHA la franja de la carátula se esconde entera (es lo
       que la letra ancha hace: darle ese sitio a la letra). El ♡ y los
       avisos no pueden irse con ella: el ♡ pasa a la fila de vista y los
       avisos vuelven a su barra de estado, que en ese caso se enseña. */
    const ancha = body.classList.contains('letra-ancha');
    const firma = movil + '|' + ancha;
    if (firma === firmaAntes) return;
    firmaAntes = firma;
    body.classList.toggle('disp-movil', movil);
    if (movil) {
      mudar(pestanas, ventana);
      mudar(aparato, vista);
      if (ancha) {
        mudar(corazon, vista);
        devolver(avisos);
      } else {
        mudar(corazon, franja);
        mudar(avisos, info);
      }
    } else {
      [pestanas, corazon, aparato, avisos].forEach(devolver);
    }
    if (movil !== movilAntes) {
      movilAntes = movil;
      document.dispatchEvent(new CustomEvent('mm:disposicion', { detail: { movil } }));
    }
  };

  if (mq.addEventListener) mq.addEventListener('change', aplicar);
  else if (mq.addListener) mq.addListener(aplicar);
  // seven.js avisa cuando se pone o se quita la letra ancha
  document.addEventListener('mm:ancho', aplicar);
  aplicar();

  /* ---------- El ⚙ de la barra de título ----------
     En el teléfono el engranaje de las pestañas se queda fuera (las
     pestañas están abajo y config no es una sección más: es ajustar). Este
     botón no es un segundo ajuste: PULSA el de siempre, así que se porta
     igual que él —abre config y, estando dentro, te devuelve a donde
     estabas—, y la tecla S y el Esc siguen funcionando como antes. */
  const cfg = $('tbCfg');
  if (cfg) {
    cfg.addEventListener('click', () => {
      const g = document.querySelector('.tab-gear');
      if (g) g.click();
    });
    document.addEventListener('mm:tab', (e) => {
      const dentro = !!(e.detail && e.detail.tab === 'settings');
      cfg.classList.toggle('active', dentro);
      cfg.setAttribute('aria-pressed', dentro ? 'true' : 'false');
    });
  }

  // Para mirar desde la consola en qué disposición está la app
  window.MMMovil = { activo: () => mq.matches };
})();
