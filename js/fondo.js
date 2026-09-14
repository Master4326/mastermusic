/* ==========================================================
   LA ONDA DE LA LETRA (estilo NCS)

   Cintas de sonido con su reflejo que cruzan el panel sumando luz sobre
   el fondo oscuro — las de los vídeos de NoCopyrightSounds de 2015-2017.

   PERO no son un fondo suelto: la onda SALE DEL VERSO QUE SE ESTÁ
   CANTANDO. Se pone a su altura, se abre a su alrededor dejándole un
   hueco limpio, y ruge a los lados. Al cambiar de verso, la onda se muda
   con él. Es lo que pidió el usuario: «que las letras tengan la onda de
   música, y no eso de fondo».

   Funciona igual en las dos vistas porque lo único que necesita es la
   CAJA del texto que hay pintado:
   · vista lista (≡) → el `.lyric-line.active`, medido con un Range para
     quedarse con las letras y no con el <div>, que ocupa todo el ancho;
   · modo edit (✦)  → el último `.ed-stack`, que es el verso gigante.
   Sin verso —instrumental, canción sin letra, reposo— la onda vuelve
   sola al centro y se abre de lado a lado.

   Aquí NO se escucha nada, igual que en ambient.js: el espectro sale de
   js/visualizer.js (`getBands`, que con música da FFT real y sin música
   da su onda de reposo — así el fondo nunca se queda muerto) y el ritmo
   de js/beat.js. Este módulo solo dibuja.

   Por qué un <canvas> y no más capas CSS: son ~250 puntos que se mueven
   en cada frame. Con divs eso serían 250 escrituras de estilo por frame;
   aquí es un trazo por cinta y se acabó.

   Lo enciende y lo apaga el ajuste «ambiente» de config ⚙ (settings.js
   pone `body.fondo-ondas`). El usuario puede volver al fondo de siempre
   —la carátula difuminada— o dejarlo liso, sin tocar nada más.
   ========================================================== */
(() => {
  'use strict';

  const canvas = document.getElementById('laNcs');
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const body = document.body;
  const tabLyrics = document.getElementById('tab-lyrics');
  const lyricsBody = document.getElementById('lyricsBody');
  const lyricsEdit = document.getElementById('lyricsEdit');

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const P = () => window.MMPerf;
  const movil = () => !!(P() && P().movil());
  const bajo = () => !!(P() && P().bajo());
  // suavizado en tiempo real: la misma caída a 30, 60 o 165 Hz
  const K = (k60, dt) => (P() ? P().k(k60, dt) : k60);

  /* ==========================================================
     TAMAÑO DEL LIENZO
     El panel cambia de tamaño al redimensionar la ventana, al esconder
     la barra de pestañas y —sobre todo— al poner la LETRA ANCHA, que le
     da de golpe la columna de la carátula. Un ResizeObserver se entera
     de las tres cosas; `window.resize` no.

     El dpr se topa a 1,5 (a 1 en el móvil): esto son lineas difusas de
     fondo, no texto. A dpr 3 en un teléfono serían 9 veces más píxeles
     que rellenar por cada frame para una diferencia que no se ve.
     ========================================================== */
  let W = 0, H = 0, dpr = 1;
  let degradado = null;

  const medir = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) { W = H = 0; return; }
    dpr = Math.min(window.devicePixelRatio || 1, movil() ? 1 : 1.5);
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = w; canvas.height = h;
    W = w; H = h;
    degradado = null;               // el gradiente va en píxeles del lienzo
    cvCaja = null;                  // y la caja guardada del lienzo, a la basura
  };

  if (window.ResizeObserver) new ResizeObserver(medir).observe(canvas);
  window.addEventListener('resize', medir, { passive: true });

  /* ==========================================================
     COLOR · el acento manda, y de él sale el segundo tono

     Los vídeos de NCS nunca son de un solo color: la onda va de un tono
     al de al lado (cian→violeta, naranja→rosa). Aquí el primero es el
     acento de la app —que en «auto» lo saca colors.js de la carátula, o
     sea que cambia con cada canción— y el segundo es ese mismo tono
     girado 46° en el círculo cromático. Así la pareja pega SIEMPRE,
     salga el acento de donde salga.
     ========================================================== */
  const aRgb = (c) => {
    if (!c) return null;
    c = c.trim();
    if (c[0] === '#') {
      if (c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
      if (c.length >= 7) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
      return null;
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).map(Number);
    return p.length >= 3 && p.every((n) => !isNaN(n)) ? [p[0], p[1], p[2]] : null;
  };

  const aHsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const l = (mx + mn) / 2;
    if (!d) return [0, 0, l];
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h;
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h, s, l];
  };

  const deHsl = (h, s, l) => {
    h = ((h % 1) + 1) % 1;
    if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const canal = (t) => {
      t = ((t % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [Math.round(canal(h + 1 / 3) * 255), Math.round(canal(h) * 255), Math.round(canal(h - 1 / 3) * 255)];
  };

  let colFirma = '';
  let colA = [92, 225, 230];
  let colB = [140, 130, 255];
  let colT = 0;

  const revisarColor = (ahora) => {
    // cada 300 ms: getComputedStyle es de lo más caro que hay y el acento
    // solo cambia al cambiar de canción o al tocar una muestra de config
    if (ahora - colT < 300 && colFirma) return;
    colT = ahora;
    const crudo = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    if (crudo === colFirma) return;
    colFirma = crudo;
    const rgb = aRgb(crudo) || [92, 225, 230];
    const [h, s, l] = aHsl(rgb);
    /* Un acento casi blanco (el usuario puede elegir blanco puro) daría dos
       grises indistinguibles: se le pone un suelo de saturación para que la
       pareja siga leyéndose como dos colores. */
    const sat = Math.max(s, 0.45);
    colA = deHsl(h, sat, Math.max(l, 0.55));
    colB = deHsl(h + 0.128, Math.min(1, sat * 1.05), Math.max(l, 0.62));
    degradado = null;
  };

  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  const gradiente = () => {
    if (degradado) return degradado;
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, rgba(colA, 1));
    g.addColorStop(0.5, rgba(colB, 1));
    g.addColorStop(1, rgba(colA, 1));
    degradado = g;
    return g;
  };

  /* ==========================================================
     ESPECTRO
     getBands ya viene suavizado, pero para una CINTA hace falta más:
     con los saltos del espectro crudo la línea tiembla como un sismógrafo
     y se lee como ruido, no como una onda. Este segundo suavizado —y el
     promedio con los vecinos de `muestra`— es lo que la hace ondear.
     ========================================================== */
  const N = 48;
  const esp = new Float32Array(N);

  const leerEspectro = (k) => {
    const V = window.VisualizerModule;
    const b = V && V.getBands ? V.getBands(N) : null;
    for (let i = 0; i < N; i++) {
      const t = b ? b[i] : 0;
      esp[i] += (t - esp[i]) * k;
    }
  };

  // valor del espectro en t (0..1) con sus vecinos promediados
  const muestra = (t) => {
    const x = clamp(t, 0, 1) * (N - 1);
    const i = x | 0;
    const f = x - i;
    const j = i + 1 < N ? i + 1 : N - 1;
    const a = (esp[i > 0 ? i - 1 : 0] + esp[i] * 2 + esp[j]) * 0.25;
    const b = (esp[i] + esp[j] * 2 + esp[j + 1 < N ? j + 1 : j]) * 0.25;
    return a + (b - a) * f;
  };

  /* ==========================================================
     LA CAJA DEL VERSO · el ancla de toda la escena

     De aquí sale dónde se pone la onda. Dos fuentes según la vista, y la
     misma respuesta en las dos: centro, medio ancho, centro vertical y
     alto del texto que se está cantando, en píxeles del lienzo.

     El Range no es un capricho: en la vista lista el `<div class="lyric-
     line">` ocupa el ANCHO ENTERO del panel (725 px medidos en uno de
     700), así que agarrarse a él dejaría el hueco del tamaño del panel y
     no habría onda. Un Range sobre su contenido mide las LETRAS.

     Medir cuesta un LAYOUT FORZADO, así que no se mide en cada frame: 12
     veces por segundo mientras el verso se está colocando y 2 cuando ya
     está quieto, y los frames de en medio se interpolan. Es la lección de
     los destellos del cine: lo que se pinta 60 veces por segundo no puede
     preguntar por la posición de nada.
     ========================================================== */
  let rango = null;
  /* La caja del lienzo se guarda por lo mismo, y encima se mira `hidden`
     en vez de `offsetParent` —que también fuerza layout—. Solo cambia
     cuando cambia el panel, y eso ya lo caza el ResizeObserver de medir(),
     que la borra; el refresco por reloj es el cinturón por si el panel se
     mueve SIN cambiar de tamaño. */
  let cvCaja = null, cvT = 0;
  const cajaLienzo = (ahora) => {
    if (!cvCaja || ahora - cvT > 1000) { cvCaja = canvas.getBoundingClientRect(); cvT = ahora; }
    return cvCaja;
  };

  /* QUIÉN es el verso de ahora. Esto no cuesta layout —solo mira el DOM—,
     así que puede consultarse a menudo; lo caro es MEDIRLO, y eso se hace
     abajo solo cuando hace falta. */
  const versoEl = () => {
    const vivo = (el) => !!(el && !el.hidden);
    if (vivo(lyricsEdit)) {
      /* Modo edit: el ÚLTIMO .ed-stack es el verso de ahora (el anterior
         sigue un rato en el DOM mientras se va con su animación de salida).
         Se busca hacia atrás a mano en vez de con querySelectorAll porque
         esto corre en cada frame y aquello deja una lista nueva por frame
         para que la recoja la basura — y al final de la lista también hay
         destellos y aros, que no son el verso. */
      for (let el = lyricsEdit.lastElementChild; el; el = el.previousElementSibling) {
        if (el.classList && el.classList.contains('ed-stack')) return el;
      }
      return null;
    }
    if (vivo(lyricsBody)) return lyricsBody.querySelector('.lyric-line.active');
    return null;
  };

  const cajaLetra = (el, ahora) => {
    const cv = cajaLienzo(ahora);
    if (!cv.width || !cv.height) return null;
    let r;

    if (el.parentNode === lyricsBody) {
      if (!rango) rango = document.createRange();
      rango.selectNodeContents(el);
      r = rango.getBoundingClientRect();
      // un verso vacío («♪» de relleno) puede no dar caja: vale el div
      if (!r || !r.width) r = el.getBoundingClientRect();
    } else {
      r = el.getBoundingClientRect();
    }
    if (!r || !r.width || !r.height) return null;

    const cx = (r.left + r.width / 2 - cv.left) * dpr;
    const cy = (r.top + r.height / 2 - cv.top) * dpr;
    // fuera del lienzo (un verso a medio salir) no ancla nada
    if (cy < -H * 0.2 || cy > H * 1.2) return null;
    return { cx, cy, semi: (r.width / 2) * dpr, alto: r.height * dpr };
  };

  /* Lo medido (a saltos) y lo pintado (suave). La onda no salta de un
     verso al siguiente: se muda, y ese viaje es justo lo que se ve. */
  const ancla = { cx: 0, cy: 0, semi: 0, alto: 0, on: 0 };
  let medidoT = 0;
  let medido = null;
  let ultimoEl = null;
  let cambioT = -1e9;

  const seguirVerso = (ahora, dt) => {
    const el = versoEl();
    if (el !== ultimoEl) { ultimoEl = el; cambioT = ahora; }
    if (!el) {
      medido = null;
    } else {
      /* Deprisa mientras el verso se coloca —en la vista lista la lista
         está rodando hasta él, y en el modo edit la línea entra con su
         animación—, y luego a fuego lento: quieto el verso, su caja no se
         mueve, y cada medición es un layout forzado. Con esto el ritmo
         normal es 2 mediciones por segundo en vez de 12. */
      const cada = ahora - cambioT < 900 ? 80 : 500;
      if (ahora - medidoT > cada) { medidoT = ahora; medido = cajaLetra(el, ahora); }
    }
    const k = K(0.17, dt);
    if (medido) {
      // al engancharse por primera vez se coloca de golpe: interpolar desde
      // una caja vieja de otra canción sería un barrido raro por el panel
      if (ancla.on < 0.02) {
        ancla.cx = medido.cx; ancla.cy = medido.cy;
        ancla.semi = medido.semi; ancla.alto = medido.alto;
      }
      ancla.cx += (medido.cx - ancla.cx) * k;
      ancla.cy += (medido.cy - ancla.cy) * k;
      ancla.semi += (medido.semi - ancla.semi) * k;
      ancla.alto += (medido.alto - ancla.alto) * k;
      ancla.on += (1 - ancla.on) * K(0.09, dt);
    } else {
      ancla.on += (0 - ancla.on) * K(0.07, dt);
    }
    return ancla.on;
  };

  /* ==========================================================
     LAS CINTAS
     Cada una lleva su onda viajera propia (dos senos de periodos
     distintos, que es lo que hace que no se vea «de máquina»), su parte
     de espectro y su velocidad. Las de detrás son anchas, lentas y casi
     transparentes; la de delante, fina y brillante.

     `det` = cuánto le afecta el detalle del espectro. La cinta del fondo
     apenas lo nota (se mueve sola, dando ambiente) y la de delante lo
     sigue de cerca: ese contraste es lo que hace que el conjunto se vea
     vivo en vez de ver tres copias de lo mismo.
     ========================================================== */
  const CINTAS = [
    { k1: 0.9, k2: 2.1, vel: 0.055, base: 0.10, amp: 0.30, det: 0.22, alfa: 0.15, ancho: 2.6, fase: 0, sep: 0.055 },
    { k1: 1.5, k2: 3.2, vel: -0.080, base: 0.07, amp: 0.24, det: 0.55, alfa: 0.22, ancho: 1.9, fase: 1.9, sep: 0.028 },
    { k1: 2.3, k2: 4.6, vel: 0.115, base: 0.045, amp: 0.17, det: 0.95, alfa: 0.34, ancho: 1.3, fase: 3.7, sep: 0.008 },
  ];

  // en un aparato flojo, dos cintas en vez de tres
  const cintas = () => (bajo() ? CINTAS.slice(1) : CINTAS);

  let reloj = 0;                // segundos de animación acumulados
  const ys = [];                // desplazamientos reutilizados (sin basura)

  /* Los puntos van cada ~9 px de lienzo: por debajo de eso el ojo ya no
     distingue la curva y solo se paga. En el móvil, cada 16. */
  const paso = () => (movil() ? 16 : 9) * dpr;

  const trazar = (n, dir, mitad) => {
    ctx.beginPath();
    const px = W / (n - 1);
    ctx.moveTo(0, mitad + ys[0] * dir);
    for (let i = 1; i < n - 1; i++) {
      const x = i * px;
      const y = mitad + ys[i] * dir;
      const xs = x + px * 0.5;
      const yn = mitad + ys[i + 1] * dir;
      // punto de control en el propio punto, extremo en el medio del tramo:
      // curva suave con un solo punto de control por tramo
      ctx.quadraticCurveTo(x, y, xs, (y + yn) * 0.5);
    }
    ctx.lineTo(W, mitad + ys[n - 1] * dir);
  };

  const cerca = [];             // cuánto manda el verso en cada punto (0..1)

  const pintar = (m, dt, ahora) => {
    ctx.clearRect(0, 0, W, H);

    const on = seguirVerso(ahora, dt);

    const energia = m ? m.energia : 0.3;
    const nivel = m ? m.nivel : 0.12;
    const golpe = m ? m.boom * m.boomFuerza : 0;
    const brillo = m ? m.brillo * m.brilloFuerza : 0;

    /* El eje de la onda es la ALTURA DEL VERSO que se canta. Sin verso se
       queda en el centro del panel, que es donde estaba antes. */
    const mitad = H * 0.5 + (ancla.cy - H * 0.5) * on;
    const n = Math.max(12, Math.ceil(W / paso()) + 1);
    if (ys.length !== n) { ys.length = n; cerca.length = n; }

    /* Cuánto se aparta la onda a la altura del texto: medio verso más un
       puñado de píxeles de aire. Ese aire fijo importa en la vista lista,
       donde los versos van pegados —39 px de alto y 38 de separación, sin
       hueco entre ellos—: con él la boca se abre lo bastante para que el
       verso anterior y el siguiente queden DENTRO, en limpio, en vez de
       llevarse la cinta por encima. El tope de 0,33·H es por el modo edit,
       donde el verso ocupa media pantalla y sin tope las cintas se irían
       fuera del panel. */
    const apertura = Math.min(ancla.alto * 0.55 + 40 * dpr, H * 0.33);

    /* LA ONDA ES DEL TAMAÑO DE SU VERSO. En el modo edit el verso es
       enorme y la onda ruge; en la vista lista mide 40 px y la misma onda
       a todo trapo se comía los versos de arriba y de abajo —probado, se
       veía un borrón— y encima tapaba media pantalla. Así que cuando está
       anclada, la altura se mide contra el verso y no contra el panel. */
    const techoAncla = Math.min(1, (apertura + Math.max(H * 0.06, ancla.alto * 1.4)) / (H * 0.46));
    const escala = 1 - on * (1 - techoAncla);

    /* Cuánto se abre la onda. El suelo de 0,42 existe para que en una
       balada —o en silencio, o sonando por Spotify Connect sin el ◈, que
       es cuando el detector va a ciegas— siga habiendo onda que mirar:
       una línea recta no es un fondo, es una raya. */
    const fuerza = (0.42 + nivel * 0.85 + energia * 0.35 + golpe * 0.55) * escala;
    const px = W / (n - 1);
    // los hombros: cómo de rápido se cierra el hueco al alejarse del verso
    const hombro = Math.max(60 * dpr, ancla.semi * 0.55);
    for (let i = 0; i < n; i++) {
      if (on < 0.02) { cerca[i] = 0; continue; }
      const d = Math.abs(i * px - ancla.cx) - ancla.semi;
      if (d <= 0) { cerca[i] = on; continue; }
      if (d >= hombro) { cerca[i] = 0; continue; }
      const u = 1 - d / hombro;
      cerca[i] = u * u * (3 - 2 * u) * on;      // smoothstep
    }

    const g = gradiente();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = g;

    const lista = cintas();
    for (let c = 0; c < lista.length; c++) {
      const L = lista[c];
      const f = reloj * L.vel + L.fase;

      /* Cada cinta corre a su propia altura. Sin esta separación las tres
         se juntan en UNA raya en cuanto la música se calma —era lo que
         pasaba con la app en pausa— y lo que se ve no es una onda sino un
         subrayado. Al subir la energía se separan más, así el conjunto se
         abre con el tema. La franja es simétrica porque el reflejo invierte
         la separación igual que invierte la onda. */
      const sep = L.sep * H * (0.55 + energia * 0.75) * escala;

      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        /* Sobre en forma de campana: la onda nace y muere en los bordes
           del panel. Sin esto las cintas se cortan en seco contra el marco
           y se ve el truco. */
        const env = Math.pow(Math.sin(Math.PI * t), 0.75);
        const onda =
          Math.sin(t * L.k1 * Math.PI * 2 + f * 6.283) * 0.62 +
          Math.sin(t * L.k2 * Math.PI * 2 - f * 4.1) * 0.38;
        const detalle = muestra(t) * L.det;
        /* Dos cosas a la altura del verso: la cinta se APARTA (y su
           reflejo se aparta al otro lado, así que el verso queda dentro de
           una boca abierta) y además se CALMA, porque una onda agitada
           justo detrás de las letras es exactamente el fondo que el
           usuario no quería. Ruge a los lados, que es donde hay sitio.

           Y el tope de ±0,46·H no es cosmético: sin él, un drop en un tema
           movido manda la cinta MÁS ALLÁ del borde del panel y lo que se ve
           es una recta pegada al marco, justo cuando tocaba ver el golpe. */
        ys[i] = clamp(
          cerca[i] * apertura +
            (sep * env + env * H * (onda * L.base * (0.7 + energia * 0.9) + detalle * L.amp) * fuerza)
              * (1 - 0.62 * cerca[i]),
          -H * 0.46, H * 0.46
        );
      }

      /* RESPLANDOR BARATO · el mismo trazo dos veces, ancho y tenue
         primero, fino y brillante encima. `shadowBlur` haría lo mismo más
         bonito, pero Skia rehace el desenfoque en CADA trazo y esto son
         3 cintas × 2 lados × 60 veces por segundo. Con 'lighter' las dos
         pasadas se suman y el resultado es el halo de siempre.

         El camino se arma UNA vez por lado y se traza dos: el camino sigue
         vivo hasta el próximo beginPath(), así que rehacerlo era pagar 120
         curvas de balde. */
      const alfa = L.alfa * (0.75 + nivel * 0.5 + golpe * 0.6);
      const glow = !movil();

      for (let dir = 1; dir >= -1; dir -= 2) {
        trazar(n, dir, mitad);
        if (glow) {
          ctx.globalAlpha = clamp(alfa * 0.30, 0, 1);
          ctx.lineWidth = L.ancho * dpr * 4.5;
          ctx.stroke();
        }
        // el reflejo de abajo, más apagado: da profundidad sin duplicar ruido
        ctx.globalAlpha = clamp(alfa * (dir > 0 ? 1 : 0.62), 0, 1);
        ctx.lineWidth = L.ancho * dpr;
        ctx.stroke();
      }

      /* La cinta de delante lleva CUERPO: el hueco entre ella y su reflejo
         relleno con un velo que se apaga hacia fuera. Es lo que convierte
         dos líneas en una onda de sonido. */
      if (c === lista.length - 1) {
        trazar(n, 1, mitad);
        for (let i = n - 1; i >= 0; i--) {
          ctx.lineTo((i * W) / (n - 1), mitad - ys[i]);
        }
        ctx.closePath();
        /* El velo se queda por debajo de 0,25 a propósito: por encima deja
           de ser fondo y empieza a competir con la letra, que es justo lo
           que el usuario no quería del fondo anterior. */
        ctx.globalAlpha = clamp(0.07 + nivel * 0.12 + golpe * 0.12, 0, 0.25);
        ctx.fillStyle = g;
        ctx.fill();
      }
    }

    /* Línea del horizonte: el eje de la onda —o sea, el renglón del verso—,
       encendido por los platillos. Es el detalle que más «NCS» hace la
       escena y cuesta un trazo. */
    ctx.globalAlpha = clamp(0.06 + brillo * 0.22 + nivel * 0.05, 0, 1);
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    ctx.moveTo(0, mitad);
    ctx.lineTo(W, mitad);
    ctx.stroke();

    /* AURA DEL VERSO · un charco de luz alrededor de las letras, que late
       con el bombo. Se pinta ANTES del hueco y más grande que él, así que
       lo que queda es un halo: el verso encendido por su propia onda. Es
       lo que ata la letra a la escena en vez de dejarla flotando encima. */
    if (on > 0.02 && ancla.semi > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp((0.09 + golpe * 0.14 + nivel * 0.07) * on, 0, 0.3);
      ctx.save();
      ctx.translate(ancla.cx, ancla.cy);
      ctx.scale(ancla.semi * 1.18 + 70 * dpr, ancla.alto * 0.9 + 30 * dpr);
      const a = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      a.addColorStop(0, rgba(colA, 0.85));
      a.addColorStop(0.45, rgba(colB, 0.42));
      a.addColorStop(1, rgba(colB, 0));
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    /* EL HUECO DEL VERSO · se borra lo pintado en una elipse blanda sobre
       las letras. Apartar las cintas no basta: el velo de la cinta de
       delante rellena el hueco ENTRE ella y su reflejo —o sea, justo donde
       está el texto— y el horizonte lo tacharía de lado a lado. Con
       `destination-out` la letra se queda en un bolsillo limpio y la onda
       parece abrirse a su paso. Solo toca a este lienzo. */
    if (on > 0.02 && ancla.semi > 0) {
      const rx = ancla.semi * 1.1 + 24 * dpr;
      const ry = ancla.alto * 0.62 + 16 * dpr;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(ancla.cx, ancla.cy);
      ctx.scale(rx, ry);                 // el círculo unidad se vuelve elipse
      const h = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      h.addColorStop(0, 'rgba(0,0,0,' + on.toFixed(3) + ')');
      h.addColorStop(0.62, 'rgba(0,0,0,' + (on * 0.93).toFixed(3) + ')');
      h.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = h;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    reloj += dt / 1000;
  };

  /* ==========================================================
     BUCLE
     Las mismas cortesías que ambient.js: nada en segundo plano, nada con
     el cine abierto (tapa el panel entero), nada con «menos movimiento»
     y nada si la pestaña de la letra no está delante.
     ========================================================== */
  let raf = null;
  let ultimo = 0;
  const relojPintado = { ultimo: 0 };
  let limpio = true;

  const limpiar = () => {
    if (limpio || !W) return;
    ctx.clearRect(0, 0, W, H);
    limpio = true;
  };

  const activo = () =>
    body.classList.contains('fondo-ondas') &&
    !body.classList.contains('cinema-open') &&
    !!(tabLyrics && tabLyrics.classList.contains('active')) &&
    !(window.MMSettings && window.MMSettings.reduceMotion());

  const bucle = () => {
    raf = requestAnimationFrame(bucle);
    if (document.hidden) return;
    if (!activo()) { limpiar(); return; }

    const ahora = performance.now();
    if (window.MMPerf && window.MMPerf.salta(relojPintado, ahora)) return;
    if (!W || !H) { medir(); if (!W || !H) return; }

    const dt = ultimo ? Math.min(100, ahora - ultimo) : 16.7;
    ultimo = ahora;

    revisarColor(ahora);
    leerEspectro(window.MMPerf ? window.MMPerf.k(0.22, dt) : 0.22);

    const M = window.BeatModule;
    pintar(M && M.get ? M.get() : null, dt, ahora);
    limpio = false;
  };

  const arrancar = () => { if (!raf) bucle(); };
  const parar = () => { if (raf) { cancelAnimationFrame(raf); raf = null; } limpiar(); };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) parar(); else arrancar();
  });

  arrancar();

  window.FondoModule = { arrancar, parar, medir };
})();
