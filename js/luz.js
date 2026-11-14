/* ==========================================================
   ✧ LUZ DE BORDE — js/luz.js

   Pedida el 10-nov-2026 a partir de Lumn: el filo de la ventana se
   enciende con los colores de la carátula y late con la música. Dos
   tintas —el acento (arriba y a la izquierda) y un segundo color de la
   carátula (abajo y a la derecha, --color-2 de js/colors.js)— que se
   mezclan en las esquinas, cuatro manchas de luz que viajan despacio por
   los bordes, y un pulso que sube con cada bombo.

   config ⚙ → apariencia → luz de borde: «al ritmo» (late con la música),
   «quieta» (respira despacio, sin mirar la música) o «no». Y su grosor.

   LO QUE CUESTA. El brillo son sombras interiores que se pintan UNA vez
   (y otra al cambiar de canción, cuando cambian los colores). Las manchas
   viajan con animaciones de transform, que lleva la tarjeta gráfica. Por
   fotograma, lo único que se toca es la OPACIDAD de una capa —y solo si
   cambió—, desde el reloj común de la app (MMPerf.bucle): en pausa, con
   la pestaña escondida o con la luz quieta, este archivo no gasta nada.
   ========================================================== */
(() => {
  'use strict';

  const body = document.body;
  const root = document.documentElement;

  const ajuste = (id, def) => {
    const S = window.MMSettings;
    const v = S && S.get ? S.get(id) : null;
    return v || def;
  };
  const modo = () => {
    const v = ajuste('luz', 'ritmo');
    return v === 'no' || v === 'quieta' ? v : 'ritmo';
  };
  const GROSOR = { fina: 0.55, media: 1, ancha: 1.75 };

  /* ── la capa: se cuelga del <body>, encima de la app y del cine, debajo
     de los diálogos; no recibe clics ── */
  const luz = document.createElement('div');
  luz.className = 'luz-borde';
  luz.setAttribute('aria-hidden', 'true');
  ['lb-base', 'lb-mancha lb-m1', 'lb-mancha lb-m2', 'lb-mancha lb-m3', 'lb-mancha lb-m4', 'lb-pulso']
    .forEach((c) => {
      const i = document.createElement('i');
      i.className = c;
      luz.appendChild(i);
    });
  body.appendChild(luz);
  const pulso = luz.querySelector('.lb-pulso');

  /* ── el pulso ──
     Sube deprisa con el bombo y baja despacio: late, no parpadea (la regla
     de la casa: nada parpadea). El valor se escribe a medios puntos de
     opacidad y solo cuando cambia: la mayoría de fotogramas no tocan nada. */
  let nivel = 0;
  let puesto = -1;
  const escribir = (v) => {
    const q = Math.round(Math.max(0, Math.min(1, v)) * 200);
    if (q === puesto) return;
    puesto = q;
    pulso.style.opacity = String(q / 200);
  };

  const suena = () => body.classList.contains('playing');
  const calma = () => body.classList.contains('reduce-motion');
  const quiereLatir = () => modo() === 'ritmo' && suena() && !calma() && !document.hidden;
  // también corre mientras se apaga, para que el pulso no se quede a medias
  const activo = () => quiereLatir() || nivel > 0.004;
  const lim = (v) => (v > 1 ? 1 : v < 0 ? 0 : v);

  const paso = () => {
    let meta = 0;
    if (quiereLatir()) {
      const B = window.BeatModule;
      const m = B && B.get ? B.get() : null;
      if (m && m.fuente !== 'silencio') {
        // el golpe manda; la energía de la canción le da un suelo
        meta = 0.1 + lim(m.boom || 0) * 0.72 + lim(m.energia || 0) * 0.18;
      } else {
        meta = 0.06;
      }
    }
    nivel += (meta - nivel) * (meta > nivel ? 0.5 : 0.075);
    if (meta === 0 && nivel < 0.004) nivel = 0;
    escribir(nivel);
  };

  let mando = null;
  let raf = 0;
  const despertar = () => {
    if (mando) { mando.despertar(); return; }
    if (window.MMPerf && window.MMPerf.bucle) {
      // en el móvil a 30 fps (msFrame): un brillo que late no necesita más
      mando = window.MMPerf.bucle(paso, { ms: () => window.MMPerf.msFrame(), activo });
      return;
    }
    // sin js/perf.js: un bucle propio que se duerme solo
    if (raf) return;
    const propio = () => {
      if (document.hidden || !activo()) { raf = 0; return; }
      paso();
      raf = requestAnimationFrame(propio);
    };
    raf = requestAnimationFrame(propio);
  };

  /* ── los ajustes ── */
  const aplicar = () => {
    const m = modo();
    body.classList.toggle('luz-no', m === 'no');
    body.classList.toggle('luz-quieta', m === 'quieta');
    body.classList.toggle('luz-ritmo', m === 'ritmo');
    root.style.setProperty('--luz-k', String(GROSOR[ajuste('luzGrosor', 'media')] || 1));
    if (m !== 'ritmo') { nivel = 0; escribir(0); }
    despertar();
  };

  /* El play y la pausa no avisan con un evento propio: se mira la clase
     del <body> (la ponen js/app.js y js/spotify/). */
  if (window.MutationObserver) {
    let suenaAntes = suena();
    new MutationObserver(() => {
      const s = suena();
      if (s !== suenaAntes) { suenaAntes = s; despertar(); }
    }).observe(body, { attributes: true, attributeFilter: ['class'] });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) despertar(); });

  aplicar();

  window.MMLuz = { aplicar };
})();
