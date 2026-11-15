/* ==========================================================
   ◐ CONTRASTE Y BLOQUE — js/clip.js

   Dos formas más de la vista ◉ palabra (config ⚙ → letras → vista
   palabra), pedidas el 15-nov-2026 con dos vídeos de letras de TikTok:
   «quiero estos estilos en la app… no igual en colores, eso puede variar,
   pero sí igual como el estilo». Por ahora viven aparte, como la vista
   palabra; más adelante pasarán al modo edit.

     · contraste — el fondo se da la vuelta, oscuro ↔ claro, con la voz. El
       verso se escribe palabra a palabra en cursiva estrecha («apre-» se
       arma por sílabas) y, algunos versos, cada palabra sale SOLA en
       mayúsculas gigantes, también por sílabas: «PAN» → «PANTA» →
       «PANTALÓN». Detrás, un tablero casi apagado: cifras de siete
       segmentos, códigos entre <…> con datos de verdad (el minuto de la
       canción, el verso, los BPM), flechas y una raya.
     · bloque — las palabras se van encajando en un bloque apretado, cada
       una en un hueco libre (a un lado de una fila, encima o debajo) y de
       un tamaño distinto; el bloque se recentra solo. Dos tonos de la
       carátula que se cambian el sitio (fondo ↔ letra) con la voz.

   LOS COLORES salen de la carátula (css/clip.css): en el contraste, casi
   negro y casi blanco teñidos de la canción; en el bloque, el tono claro y
   el hondo del acento.

   EL FONDO QUE SE DA LA VUELTA es la gracia de los dos vídeos y es justo
   lo que la casa no deja hacer a nada más (nada parpadea). Por eso aquí:
     · solo con la voz (al entrar una palabra o una sílaba), nunca solo;
     · nunca más de uno cada 0,42 s: por debajo de los tres cambios por
       segundo que la WCAG pone de límite a los destellos grandes;
     · cruzado en 0,12 s, no en seco;
     · con «menos movimiento» no se da la vuelta: se queda quieto.

   LO QUE CUESTA: lo mismo que la vista palabra. Por fotograma solo se
   decide qué palabra (y qué sílaba) suena; el DOM se toca cuando cambia.
   El tamaño de las palabras se mide UNA vez por verso (o por bloque), en
   una sola lectura.

   REGLAS DE LA CASA que se cumplen aquí: la tipografía es la de ajustes
   (cursiva, grueso, mayúsculas y estrechado son de esa misma familia, sin
   font-family propia en la letra); el golpe es un empujón de cámara del
   2 %; las curvas son las --ed-*; el panel no gana ni un botón. Este
   archivo y css/clip.css los pide js/palabra.js solo si se elige una de
   estas dos formas.
   ========================================================== */
(() => {
  'use strict';

  /* Pseudo-azar determinista, el mismo de js/palabra.js: un verso sale
     siempre igual (qué versos van en grande, dónde cae cada palabra). */
  const azar = (a, b) => {
    let h = (Math.imul(a + 3, 2654435761) ^ Math.imul(b + 11, 340573321)) | 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const tieneLetra = (s) => /[\p{L}\p{N}]/u.test(String(s || ''));

  // milisegundos mínimos entre dos vueltas del fondo (ver la cabecera)
  const MIN_GIRO = { contraste: 420, bloque: 460 };
  // lo que se estrecha la letra del contraste (scale X en css/clip.css)
  const ESTRECHO_FRASE = 0.88;
  const ESTRECHO_GRANDE = 0.66;
  // palabras por bloque como mucho: más, y el bloque se vuelve sopa de letras
  const POR_BLOQUE = 7;

  /* ══════════ ESTADO ══════════ */
  let raiz = null;          // #lyricsPalabra (el mismo panel de la vista palabra)
  let api = null;           // lo que presta js/letra/ (el mismo objeto que a palabra.js)
  let escena = null;        // .cl-escena: el fondo que se da la vuelta
  let hud = null;           // .cl-hud: el tablero de detrás (solo el contraste)
  let lienzo = null;        // .cl-lienzo: la letra, y el empujón del golpe
  let pausa = null;         // los tres puntos de los huecos
  let montado = false;
  let visible = false;

  let forma = 'contraste';
  let lineaIdx = -9;        // verso pintado (-9 = ninguno)
  let ultimoT = 0;
  let verso = null;         // lo montado del verso de ahora (ver versoContraste / versoBloque)
  let finVerso = 0;
  let sigVerso = Infinity;
  let reposo = false;
  let gpPuesto = -1;
  let W = 0, H = 0;
  let pendiente = false;    // se pidió pintar con el panel escondido (0 × 0)
  let escalaLetra = 1;

  let invertido = false;
  let ultimoGiro = -1e9;
  let giros = 0;            // semilla del tablero: cambia con cada vuelta
  let ultimoGolpe = 0;

  const calma = () => !!(api && api.calma && api.calma());
  const formaPedida = () => (api && api.estilo && api.estilo() === 'bloque' ? 'bloque' : 'contraste');

  /* ══════════ MEDIDAS ══════════
     Del layout del panel, no de su caja en pantalla (el vídeo 9:16 tumbado
     gira el marco: misma lección que js/palabra.js y js/fondo.js). */
  const medirPanel = () => {
    W = raiz.clientWidth;
    H = raiz.clientHeight;
    if (escena) escena.style.setProperty('--cl-alto', H + 'px');
    return W > 40 && H > 40;
  };
  // el tamaño de letra de ajustes (S/M/L/XL) por lo que se VE de la fuente
  const leerEscala = () => {
    const cs = getComputedStyle(document.documentElement);
    const a = parseFloat(cs.getPropertyValue('--lyrics-scale')) || 1;
    const b = parseFloat(cs.getPropertyValue('--lyrics-font-scale')) || 1;
    escalaLetra = Math.max(0.6, Math.min(1.6, a * b));
  };
  // un ancho que no llega (jsdom, una fuente sin cargar): se calcula a ojo
  const anchoA = (medido, fs, txt) => (medido > 0 ? medido : fs * 0.55 * String(txt).length);

  /* ══════════ LAS SÍLABAS ══════════
     Una palabra en trozos para irla armando con la voz («pantalón» →
     pan·ta·lón, «quieren» → quie·ren). No es la silabación de la RAE:
     corta tras cada grupo de vocales y se lleva una consonante si la que
     sigue también lo es. Para verla crecer, basta. */
  const V = 'aeiouáéíóúüàèìòùâêîôûäëïöAEIOUÁÉÍÓÚÜÀÈÌÒÙÂÊÎÔÛÄËÏÖ';
  const RE_SILABA = new RegExp(`[^${V}]*[${V}]+(?:[^${V}](?![${V}]))?`, 'g');
  const trozos = (w) => {
    const s = String(w || '');
    const m = s.match(RE_SILABA) || [];
    if (m.length < 2) return [s];
    const dentro = m.join('').length;
    if (dentro < s.length) m[m.length - 1] += s.slice(dentro);   // la cola sin vocal va con la última
    // como mucho cuatro pasos: más, y la palabra tartamudea
    while (m.length > 4) {
      let j = 0;
      for (let i = 1; i < m.length - 1; i++) if (m[i].length + m[i + 1].length < m[j].length + m[j + 1].length) j = i;
      m.splice(j, 2, m[j] + m[j + 1]);
    }
    return m;
  };
  /* Cuándo entra cada trozo: repartidos por letras en lo que dura la
     palabra (sin el último 15 %, que es donde la voz ya la está soltando).
     Solo las palabras largas y lentas se arman: las cortas salen enteras. */
  const cortesDe = (p) => {
    const dur = (p.t1 || p.t0) - p.t0;
    const letras = p.txt.replace(/[^\p{L}\p{N}]/gu, '').length;
    if (letras < 5 || dur < 0.36) return null;
    const tr = trozos(p.txt);
    if (tr.length < 2) return null;
    const total = tr.reduce((s, x) => s + x.length, 0);
    const cortes = [];
    let acum = 0;
    for (let i = 0; i < tr.length - 1; i++) {
      acum += tr[i].length;
      cortes.push(p.t0 + dur * 0.85 * (acum / total));
    }
    return { tr, cortes };
  };
  // el texto de la palabra con sus primeros `n + 1` trozos
  const parcial = (p, n, guion) => {
    if (!p.silabas || n >= p.silabas.tr.length - 1) return p.txt;
    return p.silabas.tr.slice(0, n + 1).join('') + (guion ? '-' : '');
  };

  /* ══════════ EL TABLERO DE DETRÁS (contraste) ══════════
     Un puñado de piezas que se recolocan y cambian de texto con cada vuelta
     del fondo: casi apagadas y algo desenfocadas, decoran sin leerse. Los
     códigos dicen cosas de verdad cuando pueden. Se colocan en % del panel:
     barajar no lee ningún layout. */
  const PIEZAS = ['num', 'num', 'cod', 'cod', 'cod', 'cod', 'cod', 'flecha', 'flecha', 'raya', 'caja'];
  let piezas = [];
  const montarHud = () => {
    hud = document.createElement('div');
    hud.className = 'cl-hud';
    hud.setAttribute('aria-hidden', 'true');
    piezas = PIEZAS.map((tipo) => {
      const el = document.createElement('span');
      el.className = 'cl-h cl-h-' + tipo;
      el.hidden = true;
      hud.appendChild(el);
      return { tipo, el };
    });
  };
  const dos = (n) => String(Math.floor(n)).padStart(2, '0');
  const cifras = (s, n) => {
    let r = '';
    for (let i = 0; i < n; i++) r += Math.floor(azar(s, i + 7) * 10);
    return r;
  };
  const hexa = (s, n) => {
    let r = '';
    for (let i = 0; i < n; i++) r += '0123456789ABCDEF'[Math.floor(azar(s, i + 31) * 16)];
    return r;
  };
  const bpm = () => {
    const B = window.BeatModule;
    const m = B && B.get ? B.get() : null;
    return m && m.bpm && (m.confianza || 0) > 0.35 ? m.bpm : 0;
  };
  const codigo = (s, i) => {
    const t = Math.max(0, ultimoT);
    const n = api ? api.lineas().length : 0;
    const d = new Date();
    switch (Math.floor(azar(s, i * 13 + 1) * 8)) {
      case 0: return `<${d.getFullYear()}/${dos(d.getMonth() + 1)}>`;
      case 1: return `<${dos(t / 60)}:${dos(t % 60)}.${dos((t % 1) * 100)}>`;
      case 2: return n ? `<VERSO ${Math.max(1, lineaIdx + 1)}/${n}>` : `<${cifras(s + i, 5)}>`;
      case 3: return `<CONT.${hexa(s + i, 8)}>`;
      case 4: return `<ERROR/${cifras(s + i, 6)}>`;
      case 5: { const b = bpm(); return b ? `<${b} BPM>` : `<${cifras(s + i, 5)}>`; }
      case 6: return cifras(s + i, 12 + Math.floor(azar(s, i + 3) * 12));
      default: return `<${cifras(s + i, 4)}/${cifras(s + i + 9, 2)}>`;
    }
  };
  const barajarHud = () => {
    if (!hud || forma !== 'contraste') return;
    const s = ++giros;
    piezas.forEach((p, i) => {
      const r = azar(s, i * 5 + 2);
      const sale = p.tipo === 'num' ? r < (i === 0 ? 0.8 : 0.3)
        : p.tipo === 'cod' ? r < 0.62
        : p.tipo === 'flecha' ? r < 0.5
        : r < 0.38;
      if (!sale) { p.el.hidden = true; return; }
      const x = azar(s, i * 5 + 3), y = azar(s, i * 5 + 4), z = azar(s, i * 5 + 5);
      let izq, arr;
      if (p.tipo === 'num') {
        // las cifras grandes, a los lados: detrás de la letra estorbarían
        p.el.textContent = String(Math.floor(z * 10));
        izq = z < 0.5 ? 2 + x * 16 : 70 + x * 18;
        arr = 6 + y * 46;
      } else if (p.tipo === 'cod') {
        p.el.textContent = codigo(s, i);
        p.el.classList.toggle('grande', z < 0.22);
        izq = 2 + x * 66;
        arr = 3 + y * 90;
      } else if (p.tipo === 'flecha') {
        p.el.textContent = '>';
        izq = 4 + x * 88;
        arr = 10 + y * 78;
      } else if (p.tipo === 'raya') {
        izq = 6 + x * 88;
        arr = 4 + y * 20;
      } else {
        izq = 4 + x * 86;
        arr = 8 + y * 80;
      }
      p.el.style.left = izq.toFixed(1) + '%';
      p.el.style.top = arr.toFixed(1) + '%';
      p.el.hidden = false;
    });
  };

  /* ══════════ LA VUELTA DEL FONDO ══════════ */
  const ponerInvertido = (v) => {
    invertido = v;
    raiz.classList.toggle('cl-inv', v);
  };
  const girar = () => {
    if (calma()) return;
    const ahora = performance.now();
    if (ahora - ultimoGiro < MIN_GIRO[forma]) return;
    ultimoGiro = ahora;
    ponerInvertido(!invertido);
    barajarHud();
  };

  /* Entrada de una palabra: Web Animations, que se reinicia sola cada vez
     (con una clase habría que forzar un reflow para repetirla). */
  const animar = (el, marcos, ms, curva) => {
    if (calma() || !el || typeof el.animate !== 'function') return;
    el.animate(marcos, { duration: ms, easing: curva });
  };

  /* ══════════ CONTRASTE ══════════
     ¿Este verso va palabra a palabra en GRANDE? Como en el vídeo: algunos
     versos cortos, nunca dos seguidos, y solo si sus palabras duran lo
     bastante para leerse solas. */
  const grandeBase = (idx) => {
    if (idx < 0 || !api) return false;
    const pal = api.tiempos(idx).filter((p) => tieneLetra(p.txt));
    const n = pal.length;
    if (!n || n > 6) return false;
    const dura = ((pal[n - 1].t1 || pal[n - 1].t0) - pal[0].t0) / n;
    if (dura < 0.2) return false;
    return n <= 2 || azar(idx, 5) < 0.5;
  };
  const vaEnGrande = (idx) => grandeBase(idx) && !grandeBase(idx - 1);

  const versoContraste = (idx, pal) => {
    const grande = vaEnGrande(idx);
    const caja = document.createElement('div');
    caja.className = 'cl-verso ' + (grande ? 'grande' : 'frase');
    const palabras = pal.map((p) => ({ txt: p.txt, t0: p.t0, t1: p.t1, silabas: null, el: null, fs: 0 }));
    palabras.forEach((p) => { p.silabas = cortesDe(p); });

    if (grande) {
      /* Cada palabra a su tamaño: lo más alto que quepa a lo ancho, ya
         estrechada. Se miden todas a 100 px de una vez y se escalan. */
      const tope = Math.max(28, Math.min(H * 0.42, W * 0.36) * escalaLetra);
      const mide = palabras.map((p) => {
        const s = document.createElement('span');
        s.className = 'cl-mide';
        s.textContent = p.txt;
        caja.appendChild(s);
        return s;
      });
      lienzo.appendChild(caja);
      const anchos = mide.map((s) => s.offsetWidth);   // una sola lectura
      mide.forEach((s) => s.remove());
      palabras.forEach((p, k) => {
        const w = anchoA(anchos[k], 100, p.txt) / 100 * ESTRECHO_GRANDE;
        p.fs = Math.min(tope, (W * 0.9) / Math.max(0.1, w));
      });
      const g = document.createElement('div');
      g.className = 'cl-g';
      caja.appendChild(g);
      return { idx, forma: 'contraste', modo: 'grande', caja, g, palabras, k: -2, sub: -1 };
    }

    /* La frase: todas las palabras puestas pero escondidas; cada una se
       destapa al cantarse y, como la línea va centrada, la frase crece
       desde el medio, como en el vídeo. El tamaño se mide UNA vez, con el
       verso entero a la vista. */
    // de pie (el teléfono, el 9:16) la frase baja en tres renglones grandes, como en un TikTok
    const dePie = H > W;
    let fs = Math.max(16, Math.min(H * 0.1, W * (dePie ? 0.15 : 0.075), 88) * escalaLetra);
    caja.style.fontSize = fs.toFixed(1) + 'px';
    palabras.forEach((p, k) => {
      if (k) caja.appendChild(document.createTextNode(' '));
      const s = document.createElement('span');
      s.className = 'cl-p';
      s.textContent = p.txt;
      caja.appendChild(s);
      p.el = s;
    });
    caja.style.whiteSpace = 'nowrap';
    lienzo.appendChild(caja);
    const ancho = caja.offsetWidth;                     // una sola lectura
    const maxW = (W * 0.86) / ESTRECHO_FRASE;
    // como mucho dos renglones (tres de pie); si no caben, más pequeña
    const renglones = dePie ? 2.75 : 1.85;
    if (ancho > maxW * renglones) {
      fs *= (maxW * renglones) / ancho;
      caja.style.fontSize = fs.toFixed(1) + 'px';
    }
    caja.style.whiteSpace = '';
    caja.style.maxWidth = maxW.toFixed(0) + 'px';
    palabras.forEach((p) => { p.el.hidden = true; });
    return { idx, forma: 'contraste', modo: 'frase', caja, palabras, k: -2, sub: -1 };
  };

  const pintarContraste = (k, sub) => {
    const v = verso;
    const P = v.palabras;
    if (v.modo === 'grande') {
      const p = P[k];
      if (!p) { v.g.textContent = ''; return; }
      if (k !== v.k) {
        v.g.style.fontSize = p.fs.toFixed(1) + 'px';
        v.g.textContent = parcial(p, sub, false);
        // entra estirada de alto y se asienta: el «golpe» de las palabras sueltas del vídeo
        animar(v.g, [
          { transform: 'scaleY(1.32)', opacity: 0.2 },
          { transform: 'scaleY(1)', opacity: 1 },
        ], 190, 'cubic-bezier(0.05, 0.7, 0.1, 1)');
      } else {
        v.g.textContent = parcial(p, sub, false);
      }
      return;
    }
    // la frase: destapar hasta k, esconder lo que quede después (un salto atrás)
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const ver = i <= k;
      if (p.el.hidden === ver) {
        p.el.hidden = !ver;
        if (ver && i === k) animar(p.el, [{ opacity: 0 }, { opacity: 1 }], 90, 'linear');
      }
      const txt = i < k ? p.txt : i === k ? parcial(p, sub, true) : p.txt;
      if (p.el.textContent !== txt) p.el.textContent = txt;
    }
  };

  /* ══════════ BLOQUE ══════════
     Las palabras de un verso, en tandas de como mucho POR_BLOQUE (repartidas
     a partes iguales). Cada tanda es un bloque que se monta al empezar. */
  const tandas = (n) => {
    const g = Math.max(1, Math.ceil(n / POR_BLOQUE));
    const tam = Math.ceil(n / g);
    const r = [];
    for (let a = 0; a < n; a += tam) r.push({ a, b: Math.min(n, a + tam), el: null, items: null, centros: null });
    return r;
  };

  const versoBloque = (idx, pal) => {
    const palabras = pal.map((p) => ({ txt: p.txt, t0: p.t0, t1: p.t1 }));
    return { idx, forma: 'bloque', palabras, tandas: tandas(palabras.length), tanda: -1, k: -2, sub: 0 };
  };

  /* Dónde va cada palabra del bloque. Por orden de llegada, cada una prueba
     los huecos que hay —a la derecha o a la izquierda de una fila, una fila
     nueva encima o debajo— y se queda con el que deja el bloque más cerca
     de su forma (más ancho que alto, como en el vídeo), con un poco de azar
     para que no salgan todos iguales. Las de una fila se apoyan abajo, como
     sobre una línea base. Coordenadas en px con el (0, 0) en la primera. */
  const encajar = (items, semilla, maxW, maxH) => {
    const filas = [];
    const OBJ = 1.9;
    items.forEach((it, i) => {
      const hueco = it.fs * 0.26;
      if (!i) {
        const f = { y: -it.h / 2, h: it.h, x0: -it.w / 2, x1: it.w / 2 };
        filas.push(f);
        it.fila = f;
        it.x = f.x0;
        return;
      }
      let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
      for (const f of filas) {
        bx0 = Math.min(bx0, f.x0); bx1 = Math.max(bx1, f.x1);
        by0 = Math.min(by0, f.y); by1 = Math.max(by1, f.y + f.h);
      }
      const cands = [];
      for (const f of filas) {
        // en una fila más baja que ella no entra (pisaría la de encima), salvo en la de arriba del todo
        const arriba = f.y === by0;
        if (it.h > f.h * 1.12 && !arriba) continue;
        cands.push({ tipo: 'der', f, x: f.x1 + hueco });
        cands.push({ tipo: 'izq', f, x: f.x0 - hueco - it.w });
      }
      const libre = bx1 - bx0 - it.w;
      const centro = libre > 0 ? bx0 + it.w / 2 + azar(semilla, i * 7 + 1) * libre : (bx0 + bx1) / 2;
      cands.push({ tipo: 'arriba', x: centro - it.w / 2 });
      cands.push({ tipo: 'abajo', x: centro - it.w / 2 });

      let mejor = null, mejorP = Infinity;
      cands.forEach((c, ci) => {
        const x0 = Math.min(bx0, c.x), x1 = Math.max(bx1, c.x + it.w);
        let y0 = by0, y1 = by1;
        if (c.tipo === 'arriba') y0 -= it.h;
        else if (c.tipo === 'abajo') y1 += it.h;
        else if (c.f.y === by0 && it.h > c.f.h) y0 -= it.h - c.f.h;
        const ancho = x1 - x0, alto = y1 - y0;
        let p = Math.abs(Math.log((ancho / alto) / OBJ));
        if (ancho > maxW) p += 3 + ((ancho - maxW) / maxW) * 4;
        if (alto > maxH) p += 3 + ((alto - maxH) / maxH) * 4;
        if (c.tipo === 'der') p -= 0.08;              // un poco de orden de lectura
        p += azar(semilla, i * 7 + ci + 2) * 0.35;
        if (p < mejorP) { mejorP = p; mejor = c; }
      });

      let f;
      if (mejor.tipo === 'arriba') {
        f = { y: by0 - it.h, h: it.h, x0: mejor.x, x1: mejor.x + it.w };
        filas.unshift(f);
      } else if (mejor.tipo === 'abajo') {
        f = { y: by1, h: it.h, x0: mejor.x, x1: mejor.x + it.w };
        filas.push(f);
      } else {
        f = mejor.f;
        if (mejor.tipo === 'der') f.x1 = mejor.x + it.w; else f.x0 = mejor.x;
        if (it.h > f.h) { f.y -= it.h - f.h; f.h = it.h; }   // la de arriba crece hacia arriba
      }
      it.fila = f;
      it.x = mejor.x;
    });
    items.forEach((it) => { it.y = it.fila.y + it.fila.h - it.h; });
  };

  const montarTanda = (ti) => {
    const v = verso;
    const t = v.tandas[ti];
    if (t.el) return t;
    const el = document.createElement('div');
    el.className = 'cl-racimo';
    const base = Math.max(18, Math.min(H * 0.17, W * (H > W ? 0.22 : 0.13), 150) * escalaLetra);
    const items = [];
    for (let k = t.a; k < t.b; k++) {
      const r = azar(v.idx * 31 + k, 3);
      const kk = r < 0.18 ? 1.42 : r < 0.42 ? 1.2 : r > 0.84 ? 0.78 : 1;
      const s = document.createElement('span');
      s.className = 'cl-w';
      s.textContent = v.palabras[k].txt;
      s.style.fontSize = (base * kk).toFixed(1) + 'px';
      el.appendChild(s);
      items.push({ k, el: s, fs: base * kk, w: 0, h: 0, x: 0, y: 0, fila: null });
    }
    lienzo.appendChild(el);
    const anchos = items.map((it) => it.el.offsetWidth);   // una sola lectura
    items.forEach((it, i) => {
      it.w = anchoA(anchos[i], it.fs, it.el.textContent);
      it.h = it.fs * 0.94;
    });
    const maxW = W * 0.86, maxH = H * 0.74;
    encajar(items, v.idx * 7 + ti, maxW, maxH);
    // si el bloque entero no cabe, todo más pequeño (todo escala igual)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const it of items) {
      x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x + it.w);
      y0 = Math.min(y0, it.y); y1 = Math.max(y1, it.y + it.h);
    }
    const e = Math.min(1, maxW / Math.max(1, x1 - x0), maxH / Math.max(1, y1 - y0));
    // el centro de lo que se ve con cada palabra nueva: el bloque se recentra al crecer
    const centros = [];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    items.forEach((it) => {
      if (e < 1) {
        it.fs *= e; it.w *= e; it.h *= e; it.x *= e; it.y *= e;
        it.el.style.fontSize = it.fs.toFixed(1) + 'px';
      }
      it.el.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px)`;
      a0 = Math.min(a0, it.x); a1 = Math.max(a1, it.x + it.w);
      b0 = Math.min(b0, it.y); b1 = Math.max(b1, it.y + it.h);
      centros.push({ x: (a0 + a1) / 2, y: (b0 + b1) / 2 });
    });
    t.el = el; t.items = items; t.centros = centros;
    // empieza ya centrado en su primera palabra, sin viaje
    el.style.transition = 'none';
    el.style.transform = `translate(${(-centros[0].x).toFixed(1)}px, ${(-centros[0].y).toFixed(1)}px)`;
    void el.offsetWidth;
    el.style.transition = '';
    return t;
  };

  const soltar = (el) => {
    if (!el) return;
    el.classList.add('sale');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
  };

  const pintarBloque = (k) => {
    const v = verso;
    let ti = -1;
    if (k >= 0) ti = v.tandas.findIndex((t) => k >= t.a && k < t.b);
    if (ti !== v.tanda) {
      // otra tanda: la de antes se deshace (la de un salto atrás, también)
      if (v.tanda >= 0 && v.tandas[v.tanda].el) {
        soltar(v.tandas[v.tanda].el);
        v.tandas[v.tanda].el = null;
      }
      v.tanda = ti;
      if (ti >= 0) montarTanda(ti);
    }
    if (ti < 0) return;
    const t = v.tandas[ti];
    t.items.forEach((it) => {
      const on = it.k <= k;
      if (it.el.classList.contains('on') !== on) it.el.classList.toggle('on', on);
      it.el.classList.toggle('nueva', it.k === k);
    });
    const c = t.centros[k - t.a];
    if (c) t.el.style.transform = `translate(${(-c.x).toFixed(1)}px, ${(-c.y).toFixed(1)}px)`;
  };

  /* ══════════ UN VERSO NUEVO ══════════ */
  const quitarVerso = (animado) => {
    if (!verso) return;
    if (verso.forma === 'bloque') {
      for (const t of verso.tandas) if (t.el) { if (animado) soltar(t.el); else t.el.remove(); t.el = null; }
    } else if (verso.caja) {
      if (animado) soltar(verso.caja); else verso.caja.remove();
    }
    verso = null;
  };

  const construir = (idx, animado) => {
    lineaIdx = idx;
    reposo = false;
    if (escena) escena.classList.remove('reposa');
    quitarVerso(animado !== false);
    if (idx < 0 || !api) return;
    const lines = api.lineas();
    const sig = lines[idx + 1];
    sigVerso = sig && sig.time >= 0 ? sig.time : Infinity;
    finVerso = api.fin(idx);
    // un verso de puro adorno («♪», «…») no se escribe: es un respiro
    const pal = api.tiempos(idx).filter((p) => tieneLetra(p.txt));
    if (!pal.length) { finVerso = lines[idx] ? lines[idx].time : 0; return; }
    if (!medirPanel()) { pendiente = true; return; }
    pendiente = false;
    leerEscala();
    verso = forma === 'bloque' ? versoBloque(idx, pal) : versoContraste(idx, pal);
  };

  /* La palabra (y la sílaba) de ahora. `quieto`: al repintar el mismo
     verso no se da la vuelta al fondo. */
  const avanzar = (t, quieto) => {
    const v = verso;
    const P = v.palabras;
    let k = v.k < 0 ? -1 : v.k;
    while (k + 1 < P.length && P[k + 1].t0 <= t) k++;
    while (k >= 0 && P[k].t0 > t) k--;               // saltó hacia atrás
    let sub = 0;
    const s = k >= 0 ? P[k].silabas : null;
    if (s) while (sub < s.cortes.length && s.cortes[sub] <= t) sub++;
    if (k === v.k && sub === v.sub) return;
    const adelante = k > v.k || (k === v.k && sub > v.sub);
    if (v.forma === 'bloque') pintarBloque(k); else pintarContraste(k, sub);
    v.k = k;
    v.sub = sub;
    if (adelante && k >= 0 && !quieto) girar();
  };

  /* ══════════ LOS HUECOS ══════════
     Intro, solos y puentes: la letra se queda en penumbra y tres puntos van
     llenándose hasta el verso siguiente (los mismos de la vista palabra). */
  const ponerPausa = (p) => {
    if (!pausa) return;
    if (p < 0) {
      if (gpPuesto !== -1) { pausa.classList.remove('on'); gpPuesto = -1; }
      return;
    }
    const q = Math.round(Math.max(0, Math.min(1, p)) * 100);
    if (gpPuesto === -1) pausa.classList.add('on');
    if (q !== gpPuesto) { gpPuesto = q; pausa.style.setProperty('--gp', String(q / 100)); }
  };
  const huecos = (t, idx) => {
    const lines = api.lineas();
    if (idx < 0) {
      const primero = lines[0];
      const falta = primero ? primero.time - t : 0;
      ponerPausa(primero && primero.time > 2.5 && falta > 0 ? t / primero.time : -1);
      return;
    }
    const desde = finVerso + 0.6;
    const quieto = t > desde && sigVerso - t > 1.6 && sigVerso - desde > 2.4;
    if (quieto !== reposo) {
      reposo = quieto;
      if (escena) escena.classList.toggle('reposa', quieto && !!verso);
    }
    ponerPausa(quieto && isFinite(sigVerso) ? (t - desde) / (sigVerso - desde) : -1);
  };

  /* ══════════ EL GOLPE ══════════
     El empujón de cámara del 2 % de la vista palabra, en los bombos
     fuertes y nunca más de uno cada 0,45 s. Solo la letra: el fondo ya
     tiene bastante con darse la vuelta. */
  const golpe = () => {
    if (calma() || !lienzo || typeof lienzo.animate !== 'function') return;
    const B = window.BeatModule;
    const m = B && B.get ? B.get() : null;
    if (!m || !m.boomAhora || m.fuente === 'silencio' || (m.boomFuerza || 0) < 0.58) return;
    const ahora = performance.now();
    if (ahora - ultimoGolpe < 450) return;
    ultimoGolpe = ahora;
    lienzo.animate([
      { scale: 1, easing: 'cubic-bezier(0.3, 0, 0.6, 1)' },
      { scale: 1.02, offset: 0.16, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      { scale: 1 },
    ], { duration: 520 });
  };

  /* ══════════ LA FORMA ══════════ */
  const ponerForma = () => {
    raiz.classList.add('cl-on');
    raiz.classList.toggle('cl-contraste', forma === 'contraste');
    raiz.classList.toggle('cl-bloque', forma === 'bloque');
    if (hud) hud.hidden = forma !== 'contraste';
    if (forma === 'contraste') barajarHud();
  };

  /* ══════════ CADA FOTOGRAMA ══════════
     `t` llega ya en segundos de la letra (desfase, adelanto y latencia
     descontados por js/letra/) e `idx` es el verso de ahora. */
  const tick = (t, idx) => {
    if (!montado) return;
    ultimoT = t;
    if (!visible) mostrar();
    const f = formaPedida();
    if (f !== forma) { forma = f; ponerForma(); construir(idx, false); }
    else if (idx !== lineaIdx || (pendiente && idx >= 0)) construir(idx);
    if (verso) avanzar(t);
    huecos(t, idx);
    golpe();
  };

  /* ══════════ MONTAJE ══════════ */
  const montar = (contenedor, prestado) => {
    if (montado) return;
    raiz = contenedor;
    api = prestado;
    escena = document.createElement('div');
    escena.className = 'cl-escena';
    escena.hidden = true;
    montarHud();
    lienzo = document.createElement('div');
    lienzo.className = 'cl-lienzo';
    pausa = document.createElement('div');
    pausa.className = 'cl-pausa';
    pausa.setAttribute('aria-hidden', 'true');
    pausa.innerHTML = '<i></i><i></i><i></i>';
    escena.appendChild(hud);
    escena.appendChild(lienzo);
    escena.appendChild(pausa);
    raiz.appendChild(escena);
    montado = true;

    /* El panel cambia de tamaño (ventana, letra ancha, el cine, volver a la
       letra desde otra pestaña): el verso de ahora, recolocado y sin
       volver a entrar. */
    if (window.ResizeObserver) {
      let espera = null, wPrev = 0, hPrev = 0;
      new ResizeObserver(() => {
        clearTimeout(espera);
        espera = setTimeout(() => {
          if (!visible) return;
          const w = raiz.clientWidth, h = raiz.clientHeight;
          if (Math.abs(w - wPrev) < 2 && Math.abs(h - hPrev) < 2 && !pendiente) return;
          wPrev = w; hPrev = h;
          if (lineaIdx >= 0) repintar();
        }, 140);
      }).observe(raiz);
    }
  };

  const mostrar = () => {
    if (!montado) return;
    visible = true;
    escena.hidden = false;
    forma = formaPedida();
    ponerForma();
  };

  /* Vuelve a pintar el verso de ahora (otra forma, otra tipografía, otro
     tamaño de panel) sin salida ni giro: es el mismo verso. */
  const repintar = () => {
    if (!montado || !visible) return;
    forma = formaPedida();
    ponerForma();
    const idx = lineaIdx;
    construir(idx, false);
    if (verso) avanzar(ultimoT, true);
  };

  /* Letra nueva o ninguna: fuera todo, sin animar. El fondo se queda. */
  const limpiar = () => {
    if (!montado) return;
    quitarVerso(false);
    lienzo.querySelectorAll('.cl-verso, .cl-racimo').forEach((n) => n.remove());
    lineaIdx = -9;
    reposo = false;
    escena.classList.remove('reposa');
    ponerPausa(-1);
  };

  /* La vista palabra vuelve a «pila» o «lente»: se esconde todo y el panel
     se queda como estaba. */
  const ocultar = () => {
    if (!montado) return;
    limpiar();
    visible = false;
    escena.hidden = true;
    ponerInvertido(false);
    raiz.classList.remove('cl-on', 'cl-contraste', 'cl-bloque');
  };

  /* Lo que se está cantando, para quien quiera rodearlo (la onda de
     js/fondo.js, que con estas formas no se pinta: el fondo es el suyo). */
  const ancla = () => {
    if (!verso) return null;
    if (verso.forma === 'bloque') {
      const t = verso.tandas[verso.tanda];
      const it = t && t.items ? t.items[verso.k - t.a] : null;
      return it ? it.el : null;
    }
    return verso.modo === 'grande' ? verso.g : verso.caja;
  };

  window.MMClip = {
    montar,
    tick,
    repintar,
    limpiar,
    ocultar,
    ancla,
    montado: () => montado,
    visible: () => visible,
    // para las pruebas
    trozos,
    invertido: () => invertido,
  };
})();
