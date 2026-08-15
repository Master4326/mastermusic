/* ==========================================================
   Paleta viva — saca los colores de la carátula y los reparte
   por toda la interfaz: fondo, paneles, acento y texto.

   Trabaja en OKLab / OKLCH, no en RGB ni HSL. En ese espacio la
   distancia entre dos colores se parece a la que ve el ojo, el
   tono no se tuerce al subir o bajar el brillo, y el croma
   («cuánto color tiene») es un número comparable entre tonos
   distintos. Eso arregla los dos fallos que se veían:

   1. Carátula oscura con un detalle brillante — el vinilo de
      «Muerte», con su chispa iridiscente en el centro — salía
      MAGENTA. La saturación contaba tres veces: al pesar el
      píxel, al puntuar el candidato y al forzarle un mínimo. Así
      cuatro píxeles iridiscentes le ganaban al dorado que de
      verdad manda en la portada. Ahora manda el ÁREA: un color
      tiene que ocupar un mínimo de carátula para siquiera optar
      a acento, y el croma solo desempata entre los que entran.

   2. Carátula en blanco y negro — «Clocks» — dejaba la ventana
      en gris sopa. No sobrevivía ningún píxel con color, se
      promediaba TODO (incluido el blanco del fondo) y salía un
      gris claro que aclaraba los paneles hasta volver la letra
      ilegible. Ahora una portada sin color da fondo oscuro y
      acento casi blanco, que es justo como se siente una
      carátula en blanco y negro.

   Y por encima de las dos, la red de seguridad: el acento se
   aclara hasta CUMPLIR 4,5:1 de contraste contra el panel
   (WCAG AA), se ponga como se ponga la carátula. El tono nunca
   se toca — solo la luminosidad — así que sigue siendo el color
   de la portada, pero legible siempre.
   ========================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const body = document.body;

  /* 176 y no 96: a 96×96 un rasgo FINO se disuelve. El anillo dorado de
     «Muerte» tiene un par de píxeles de grosor, y al reducir tanto se
     promediaba con el fondo negro de al lado — perdía casi todo su croma y
     dejaba de contar como color. Muestrear más fino cuesta nada (30k píxeles
     una vez por canción) y conserva anillos, rótulos y filetes. */
  const SAMPLE_SIZE   = 176;
  const COV_MIN       = 0.025;  // 2,5 % de la carátula para optar a acento
  const COV_MIN_APAG  = 0.012;  // …salvo en portadas apagadas (ver elegirAcento)
  /* Distancia OKLab a la que dos colores cuentan como el mismo. Va CORTA a
     propósito: con el umbral largo de antes, en una portada apagada todo
     quedaba a menos de esa distancia de todo, las fusiones se encadenaban
     (A con B, B con C…) y la carátula entera colapsaba en una sola familia
     gris del 87 %. El dorado se disolvía dentro de la masa oscura. */
  const MERGE_DIST    = 0.055;
  const CHROMA_FLOOR  = 0.030;  // por debajo de esto la portada es gris, no color
  const CONTRAST_MIN  = 4.5;    // WCAG AA para texto normal

  // Colores de arranque, mientras no hay carátula
  root.style.setProperty('--dyn-1', '#1a1f4a');
  root.style.setProperty('--dyn-2', '#0a0e2e');

  /* ---------- sRGB <-> OKLab ---------- */

  const lin = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  // Ojo: para v negativo se queda en la rama lineal y devuelve negativo, que es
  // justo lo que necesita el test de gama (Math.pow de un negativo daría NaN).
  const unlin = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

  const rgbToOklab = (r, g, b) => {
    const R = lin(r), G = lin(g), B = lin(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return {
      L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    };
  };

  // Devuelve sRGB en 0..1 SIN recortar: los valores fuera de [0,1] son la
  // señal de que ese OKLCH no existe en pantalla.
  const oklabToRgbF = (L, a, b) => {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return [
      unlin( 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      unlin(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
    ];
  };

  const lchToLab = (L, C, h) => [L, C * Math.cos(h), C * Math.sin(h)];

  const enGama = (L, C, h) => {
    const [, a, b] = lchToLab(L, C, h);
    const f = oklabToRgbF(L, a, b);
    return f.every(v => v >= -0.0015 && v <= 1.0015);
  };

  /* Un OKLCH puede caer fuera de lo que la pantalla sabe pintar (sobre todo
     tonos muy vivos y muy claros a la vez). En vez de recortar los canales a
     lo bruto —que TUERCE el tono— se le baja el croma hasta que entra: el
     color pierde intensidad pero sigue siendo el mismo tono de la portada. */
  const lchToRgb = (L, C, h) => {
    L = Math.max(0, Math.min(1, L));
    let c = Math.max(0, C);
    if (!enGama(L, c, h)) {
      let lo = 0, hi = c;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (enGama(L, mid, h)) lo = mid; else hi = mid;
      }
      c = lo;
    }
    const [, a, b] = lchToLab(L, c, h);
    const f = oklabToRgbF(L, a, b);
    return {
      r: Math.max(0, Math.min(255, Math.round(f[0] * 255))),
      g: Math.max(0, Math.min(255, Math.round(f[1] * 255))),
      b: Math.max(0, Math.min(255, Math.round(f[2] * 255))),
    };
  };

  /* ---------- Contraste WCAG ---------- */

  const luminancia = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const contraste = (c1, c2) => {
    const a = luminancia(c1) + 0.05, b = luminancia(c2) + 0.05;
    return a > b ? a / b : b / a;
  };

  const rgbStr = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;
  const rgbToHex = ({ r, g, b }) => '#' + [r, g, b].map(v =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  ).join('');

  /* ---------- Lectura de la carátula ---------- */

  /* Histograma en OKLab. Un solo peso: el ÁREA (con un sesgo suave hacia el
     centro, porque el sujeto de una portada suele estar ahí). Nada de premiar
     la saturación aquí — ese era el error que hacía ganar a la chispa. */
  const leerCaratula = (img) => {
    const c = document.createElement('canvas');
    c.width = SAMPLE_SIZE;
    c.height = SAMPLE_SIZE;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    let data;
    try {
      data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    } catch (e) {
      return null; // lienzo contaminado por CORS
    }

    const half = SAMPLE_SIZE / 2;
    const maxDist = Math.hypot(half, half);
    const cubos = new Map();
    let total = 0;

    for (let i = 0, px = 0; i < data.length; i += 4, px++) {
      if (data[i + 3] < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];

      const x = px % SAMPLE_SIZE;
      const y = (px / SAMPLE_SIZE) | 0;
      const w = 1.10 - (Math.hypot(x - half, y - half) / maxDist) * 0.25;

      const { L, a, b: bb } = rgbToOklab(r, g, b);
      const Lq = Math.round(L * 16);
      const aq = Math.round(a * 48) + 32;
      const bq = Math.round(bb * 48) + 32;
      const key = Lq * 4096 + aq * 64 + bq;

      const cur = cubos.get(key) || { w: 0, L: 0, a: 0, b: 0 };
      cur.w += w;
      cur.L += L * w;
      cur.a += a * w;
      cur.b += bb * w;
      cubos.set(key, cur);
      total += w;
    }

    if (!cubos.size || !total) return null;

    const lista = [...cubos.values()]
      .map(k => ({ L: k.L / k.w, a: k.a / k.w, b: k.b / k.w, w: k.w }))
      .sort((x, y) => y.w - x.w);

    /* Fusión de colores casi iguales, con distancia OKLab de verdad (los tres
       ejes pesan lo mismo). Un mismo color repartido entre varios cubos por el
       redondeo vuelve a juntarse y suma su área, pero dos colores distintos
       siguen siendo dos. Se compara contra el centro de la familia, que se
       recalcula al vuelo, así que el orden por área importa: las familias las
       fundan los colores grandes, no los residuos. */
    const fam = [];
    for (const cand of lista) {
      const near = fam.find(m =>
        Math.hypot(m.L - cand.L, m.a - cand.a, m.b - cand.b) < MERGE_DIST
      );
      if (near) {
        const t = near.w + cand.w;
        near.L = (near.L * near.w + cand.L * cand.w) / t;
        near.a = (near.a * near.w + cand.a * cand.w) / t;
        near.b = (near.b * near.w + cand.b * cand.w) / t;
        near.w = t;
      } else {
        fam.push({ ...cand });
      }
    }

    fam.sort((x, y) => y.w - x.w);
    return fam.slice(0, 14).map(m => ({
      L: m.L,
      C: Math.hypot(m.a, m.b),
      h: Math.atan2(m.b, m.a),
      cov: m.w / total,
    }));
  };

  /* ---------- Reparto de papeles ---------- */

  /* El acento tiene que ser el color CARACTERÍSTICO de la portada, no el que
     más ocupa (eso casi siempre es el fondo) ni el más vivo (eso casi siempre
     es un brillo de cuatro píxeles). Por eso: puerta dura de superficie
     primero, y entre los que pasan, el croma manda con un empujón suave del
     área. Los exponentes están puestos para que una familia de color amplia y
     media de croma le gane a una chispa vivísima pero diminuta. */
  const elegirAcento = (paleta) => {
    const util = (c) => c.C >= CHROMA_FLOOR && c.L >= 0.12 && c.L <= 0.95;

    /* Puerta de superficie en dos niveles. Si NINGUNA mancha grande tiene
       color —una portada apagada, como el vinilo de «Muerte», donde todo
       ronda croma 0,006 y el único color de verdad es un anillo dorado que
       ocupa el 2 %— se baja el listón y se deja hablar a lo pequeño: ahí ese
       anillo ES la identidad de la carátula. Si en cambio hay manchas
       grandes con color, el listón se queda alto y los destellos de cuatro
       píxeles siguen sin entrar, que era el fallo original. */
    const hayColorGrande = paleta.some(c => util(c) && c.cov >= COV_MIN);
    const minCov = hayColorGrande ? COV_MIN : COV_MIN_APAG;

    let best = null, bestScore = -1;
    for (const c of paleta) {
      if (c.cov < minCov || !util(c)) continue;
      const score = Math.min(1, c.C / 0.13) * Math.pow(c.cov, 0.32);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  };

  const construirPaleta = (paleta) => {
    const base = paleta[0];
    const cro = elegirAcento(paleta);

    // Tono de referencia: el del acento si la portada tiene color; si no, el
    // rastro de tono que quede en el color dominante (un blanco nunca es
    // neutro del todo, y ese punto de calidez o frialdad se nota).
    const hue = cro ? cro.h : base.h;

    let accent;
    if (cro) {
      /* Se conserva el TONO tal cual y solo se normaliza el croma, con una
         curva que levanta bastante lo apagado y comprime lo ya vivo: un
         dorado discreto se lee como dorado, y una portada de neón no se va
         más de neón. El techo es lo que evita el chicle fosforito de antes. */
      const C = Math.max(0.075, Math.min(0.150, 0.055 + cro.C * 0.65));
      accent = { L: 0.72, C, h: hue };
    } else {
      // Portada en blanco y negro: acento casi blanco con un susurro de tono.
      accent = { L: 0.90, C: 0.014, h: hue };
    }

    /* Fondo. La ventana es oscura por diseño, así que el fondo se ancla en
       oscuro SIEMPRE — daba igual que la carátula fuera blanca, esa era la
       sopa gris de «Clocks». Lo que sí viaja de la portada es el TONO. */
    const fondoHue = base.C >= 0.025 ? base.h : hue;
    const deep  = { L: 0.135, C: Math.min(base.C, 0.050), h: fondoHue };
    const upper = { L: 0.300, C: Math.min(accent.C * 0.55, 0.070), h: fondoHue };
    const panel = { L: 0.165, C: Math.min(base.C, 0.038), h: fondoHue };

    /* Red de seguridad: el acento se aclara hasta despegarse del fondo. Se
       mide contra la superficie MÁS CLARA sobre la que puede caer la letra
       —lo alto del degradado, no el panel oscuro— porque ese es el peor caso;
       si ahí se lee, en el resto también. Solo sube la L: el tono se queda
       intacto, así que el acento sigue siendo el color de la carátula.
       Sin esto, una portada apagada dejaba la letra activa casi invisible. */
    const panelRgb = lchToRgb(panel.L, panel.C, panel.h);
    const fondoTexto = lchToRgb(upper.L, upper.C, upper.h);
    let aRgb = lchToRgb(accent.L, accent.C, accent.h);
    while (accent.L < 0.96 && contraste(aRgb, fondoTexto) < CONTRAST_MIN) {
      accent.L += 0.015;
      aRgb = lchToRgb(accent.L, accent.C, accent.h);
    }

    /* Escalera de texto en el mismo tono, con una pizca de croma. Antes
       --text-dim se quedaba en el azul lavanda de fábrica pasara lo que
       pasara: por eso el nombre del disco salía AZUL sobre una carátula en
       blanco y negro. */
    const cText = Math.min(accent.C * 0.30, 0.040);
    const texto = {
      text:   lchToRgb(0.945, Math.min(accent.C * 0.18, 0.022), accent.h),
      dim:    lchToRgb(0.740, cText, accent.h),
      muted:  lchToRgb(0.550, cText, accent.h),
    };

    return {
      accent: aRgb,
      deep:  lchToRgb(deep.L,  deep.C,  deep.h),
      upper: lchToRgb(upper.L, upper.C, upper.h),
      panel: panelRgb,
      texto,
    };
  };

  /* ---------- Pintado ---------- */

  const aplicar = (paleta) => {
    if (!paleta || !paleta.length) return;
    const mc = window.MasterColors || {};
    const p = construirPaleta(paleta);

    // Fondo y paneles: solo en modo auto (bg-manual = el usuario eligió fondo)
    if (!body.classList.contains('bg-manual')) {
      root.style.setProperty('--dyn-1', rgbStr(p.upper));
      root.style.setProperty('--dyn-2', rgbStr(p.deep));
      if (mc.applyPanelsFromBase) mc.applyPanelsFromBase(rgbToHex(p.panel));
    }

    // Acento y texto van por su cuenta: seven.js decide si están en auto
    if (mc.applyAccentFromCover) mc.applyAccentFromCover(rgbToHex(p.accent));
    if (mc.applyTextFromCover) {
      mc.applyTextFromCover(rgbToHex(p.texto.text), rgbToHex(p.texto.dim), rgbToHex(p.texto.muted));
    }
  };

  const resetColors = () => {
    const mc = window.MasterColors || {};
    if (!body.classList.contains('bg-manual')) {
      root.style.setProperty('--dyn-1', '#1a1f4a');
      root.style.setProperty('--dyn-2', '#0a0e2e');
      if (mc.resetPanels) mc.resetPanels();
    }
    if (mc.resetAccentFromCover) mc.resetAccentFromCover();
    if (mc.resetTextFromCover) mc.resetTextFromCover();
  };

  // --- Procesar una carátula ---
  const processCover = (src) => {
    if (!src) { resetColors(); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const paleta = leerCaratula(img);
      if (paleta) aplicar(paleta);
    };
    img.onerror = () => {
      // Reintento sin crossOrigin (vale para data: URIs y mismo origen)
      const img2 = new Image();
      img2.onload = () => {
        const paleta = leerCaratula(img2);
        if (paleta) aplicar(paleta);
      };
      img2.src = src;
    };
    img.src = src;
  };

  // --- Vigilar el elemento de la carátula ---
  const coverArt = document.getElementById('coverArt');
  let lastSrc = null;

  const checkCover = () => {
    if (!coverArt) return;
    const bg = coverArt.style.backgroundImage;
    const match = bg.match(/url\(["']?(.+?)["']?\)/);
    const src = match ? match[1] : null;
    if (src !== lastSrc) {
      lastSrc = src;
      if (src) processCover(src);
      else resetColors();
    }
  };

  /* Cambiar coverArt.style.backgroundImage SÍ muta el atributo style, así que
     un observer lo caza al instante: el fondo se tiñe en cuanto entra la
     carátula, no hasta 400 ms después. El sondeo se queda como red de
     seguridad, ahora lento y dormido cuando la pestaña no está delante. */
  if ('MutationObserver' in window && coverArt) {
    new MutationObserver(checkCover)
      .observe(coverArt, { attributes: true, attributeFilter: ['style'] });
  }
  setInterval(() => { if (!document.hidden) checkCover(); }, 2000);
  checkCover();

  // Re-extracción forzada (p. ej. al devolver el fondo a modo auto)
  window.CoverColors = {
    refresh: () => { lastSrc = null; checkCover(); },
  };
})();
