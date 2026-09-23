/* ==========================================================
   CARÁTULA · el cambio de canción entra con una disolución de píxeles

   Antes, al cambiar de canción se ponía la portada nueva en
   `background-image` de golpe: un corte seco, y si la imagen no estaba en
   caché el cuadro se quedaba un instante en NEGRO mientras llegaba.

   Ahora, por orden:
     1. la imagen nueva se descarga y se DESCODIFICA antes de tocar nada
        (`img.decode()`): mientras tanto sigue a la vista la anterior;
     2. se pone debajo, y encima un lienzo con la portada VIEJA que se va
        borrando a bloques siguiendo la matriz de Bayer 8×8 — la
        «visual effect dissolve» de HyperCard: medio segundo en 16 pasos,
        que se lee digital, no borroso.
   Con «menos movimiento», con la pestaña oculta o si no había portada
   antes, corte seco como siempre (pero ya sin el negro).

   Los que ponen la portada (spotify.js y seven.js) llaman a
   `MMCaratula.poner(el, url)` en vez de escribir `backgroundImage`. Lo
   demás —has-image, el placeholder, el tamaño— lo siguen haciendo ellos.
   Quien escucha el atributo style de #coverArt (colors.js saca de ahí la
   paleta, ambient.js el fondo de la letra) se entera al entrar la nueva.
   ========================================================== */
(() => {
  'use strict';

  const B8 = [
     0, 32,  8, 40,  2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44,  4, 36, 14, 46,  6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
     3, 35, 11, 43,  1, 33,  9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47,  7, 39, 13, 45,  5, 37,
    63, 31, 55, 23, 61, 29, 53, 21,
  ];
  const PASOS = 16;
  const DURACION = 520;   // ms
  const BLOQUE = 6;       // px de pantalla por bloque

  let actual = '';        // url puesta (o descodificándose)
  let anterior = null;    // la <img> ya descodificada que está a la vista
  let turno = 0;          // cada cambio deja sin efecto a los que iban a medias

  const menosMov = () => document.body.classList.contains('reduce-motion')
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const quitarLienzo = (el) => {
    const c = el.querySelector(':scope > canvas.cover-disuelve');
    if (c) c.remove();
  };

  const aplicar = (el, url, img) => {
    const css = `url('${url}')`;
    const viejo = anterior;
    anterior = img;
    const lado = el.clientWidth, alto = el.clientHeight;
    if (menosMov() || document.hidden || !viejo || !viejo.naturalWidth || !img.naturalWidth
        || lado < 16 || alto < 16) {
      quitarLienzo(el);
      el.style.backgroundImage = css;
      return;
    }

    // la portada VIEJA en un lienzo encima, con el mismo recorte que «cover»
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let c = el.querySelector(':scope > canvas.cover-disuelve');
    if (!c) {
      c = document.createElement('canvas');
      c.className = 'cover-disuelve';
      c.setAttribute('aria-hidden', 'true');
      el.appendChild(c);
    }
    const W = Math.round(lado * dpr), H = Math.round(alto * dpr);
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const r = Math.max(W / viejo.naturalWidth, H / viejo.naturalHeight);
    const dw = viejo.naturalWidth * r, dh = viejo.naturalHeight * r;
    x.drawImage(viejo, (W - dw) / 2, (H - dh) / 2, dw, dh);

    // la nueva, debajo: lo que se borra del lienzo la va destapando
    el.style.backgroundImage = css;

    const b = Math.max(2, Math.round(BLOQUE * dpr));
    const n = Math.ceil(W / b), m = Math.ceil(H / b);
    const mio = turno;
    const t0 = performance.now();
    let hecho = 0;
    const paso = (t) => {
      // otro cambio llegó por medio (reutiliza este lienzo) o alguien lo quitó
      if (mio !== turno || !c.isConnected) return;
      const k = Math.min(PASOS, Math.floor((t - t0) / (DURACION / PASOS)) + 1);
      const lo = (hecho * 64) / PASOS, hi = (k * 64) / PASOS;
      for (let by = 0; by < m; by++) {
        for (let bx = 0; bx < n; bx++) {
          const u = B8[(by & 7) * 8 + (bx & 7)];
          if (u >= lo && u < hi) x.clearRect(bx * b, by * b, b, b);
        }
      }
      hecho = k;
      if (k < PASOS) requestAnimationFrame(paso);
      else c.remove();
    };
    requestAnimationFrame(paso);
  };

  const poner = (el, url) => {
    if (!el) return;
    if (!url) {
      turno++;
      actual = '';
      anterior = null;
      quitarLienzo(el);
      el.style.backgroundImage = '';
      return;
    }
    if (url === actual) return;   // la misma portada: ya puesta o llegando
    actual = url;
    const mio = ++turno;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    const listo = img.decode
      ? img.decode()
      : new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; });
    /* Si no se puede descodificar se pone igual (el navegador lo intentará
       por su cuenta), y si la red se atasca, a los 2,5 s también: esperar
       para siempre sería peor que el negro de antes. */
    const tope = new Promise((ok) => setTimeout(ok, 2500));
    Promise.race([listo.catch(() => {}), tope]).then(() => {
      if (mio !== turno) return;
      aplicar(el, url, img);
    });
  };

  // en varias líneas a propósito: así lo lee assets/check-modulos.js
  window.MMCaratula = {
    poner,
  };
})();
