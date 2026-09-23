/* ==========================================================
   LA ONDA DE LA LETRA · hilos de seda

   Una ola hecha de hilos finos —cinco en el ordenador, menos en aparatos
   flojos— que se trenzan entre ellos, cada uno con su halo suave. Es la
   ola del lienzo de diseño del 22-sep que el usuario señaló como «muy
   bonita»; sustituye a las cintas NCS con reflejo, velo relleno, raya de
   horizonte y aura por bombo, que se veían cargadas.

   La ola SALE DEL VERSO QUE SE ESTÁ CANTANDO: se pone a su altura, se
   ABRE a su alrededor —los hilos lo rodean por arriba y por abajo, como
   un ojo, y a los lados vuelven a trenzarse— y se enciende en los flancos
   con el tono claro del acento. Al cambiar de verso la boca viaja con él:
   así la ola «recorre la letra de la canción», que es lo que el usuario
   echó de menos de la v116 cuando la v117 la hacía pasar por detrás del
   texto. Lo pidió así desde el principio: «que las letras tengan la onda
   de música, y no eso de fondo».

   Regla de la casa (ver ambient.js y el cine): el fondo NO parpadea por
   golpe. Por eso aquí la música mueve la FORMA —la ola crece, corre y
   salta con el bombo, sobre todo con ◈ sync— pero la LUZ solo cambia de
   carácter despacio, en segundos. Los hilos bailan; no se encienden y
   apagan (ver «LA MÚSICA», más abajo).

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

   Por qué un <canvas> y no más capas CSS: son ~500 puntos que se mueven
   en cada frame. Con divs eso serían 500 escrituras de estilo por frame;
   aquí es un trazo por hilo y se acabó.

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
     COLOR · el acento manda, y de él salen sus tonos

     Como en el lienzo de diseño: el hilo va en el acento de la app —que
     en «auto» lo saca colors.js de la carátula, o sea que cambia con cada
     canción— y se aclara hacia el tono luminoso del MISMO color donde la
     ola brilla (a los lados del verso). Antes el segundo tono era el
     acento girado 46° (cian→violeta, a lo NCS); junto a la letra, que va
     en el acento, eso eran dos colores peleando. Un giro de 13° y mucha
     más luz dan brillo sin cambiar de familia. `colC` es casi blanco:
     el destello que recorre el hilo principal.
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
  let colB = [180, 245, 248];
  let colC = [225, 250, 252];
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
    const luz = clamp(l, 0.52, 0.68);
    colA = deHsl(h, sat, luz);
    colB = deHsl(h + 0.035, sat * 0.92, Math.min(0.86, luz + 0.2));
    colC = mezcla(colB, [255, 255, 255], 0.55);
    degradado = null;
  };

  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function mezcla(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

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
     LOS HILOS
     Todos comparten una OLA GRANDE —dos senos lentos, la misma para
     todos—, y cada uno le suma su propia ondulación con su fase. Por eso
     se leen como una sola ola hecha de hebras que se cruzan y se vuelven
     a separar, y no como cinco rayas sueltas: es la trenza del lienzo.

     `dy` es el carril de cada hilo: sin él, con la música en calma, se
     juntan todos en una sola raya (lo que ya le pasaba a las cintas).
     `halo` = si lleva el trazo ancho y tenue debajo; en el lienzo solo
     lo llevan los dos de delante, y los de detrás van finos y sueltos —
     ese contraste de pesos es lo que da profundidad.
     ========================================================== */
  /* `lado` y `abre` son la BOCA (ver pintar): a la altura del verso los
     hilos se reparten, unos por arriba (-1) y otros por abajo (+1), y lo
     rodean como un ojo; `abre` separa un poco los del mismo lado para que
     no se monten. Alternan para que con 3 o 4 hilos también haya de los dos. */
  const HILOS = [
    { f: 0.0, a: 1.00, dy: 0.000, w: 2.2, al: 1.00, halo: 1, lado: -1, abre: 1.00 },   // el principal
    { f: 1.7, a: 0.88, dy: 0.017, w: 1.6, al: 0.80, halo: 1, lado: 1, abre: 1.00 },
    { f: 3.1, a: 1.08, dy: -0.014, w: 1.4, al: 0.58, halo: 0, lado: -1, abre: 1.14 },
    { f: 4.4, a: 0.74, dy: 0.008, w: 1.0, al: 0.40, halo: 0, lado: 1, abre: 1.14 },
    { f: 5.6, a: 1.16, dy: -0.006, w: 0.9, al: 0.28, halo: 0, lado: -1, abre: 1.28 },
  ];

  // en un aparato flojo tres hilos; en el móvil, cuatro
  const hilos = () => (bajo() ? HILOS.slice(0, 3) : movil() ? HILOS.slice(0, 4) : HILOS);

  const TAU = Math.PI * 2;
  const suave = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

  let reloj = 0;                // segundos de animación acumulados
  const ys = [];                // alturas del hilo que se traza (sin basura)
  const ola = [];               // la ola grande + el espectro, común a todos
  const cerca = [];             // 0..1: cuánto está cada x a la altura del verso

  /* Los puntos van cada ~8 px de lienzo: por debajo de eso el ojo ya no
     distingue la curva y solo se paga. En el móvil, cada 14. */
  const paso = () => (movil() ? 14 : 8) * dpr;

  const trazar = (n) => {
    ctx.beginPath();
    const px = W / (n - 1);
    ctx.moveTo(0, ys[0]);
    for (let i = 1; i < n - 1; i++) {
      const x = i * px;
      // punto de control en el propio punto, extremo en el medio del tramo:
      // curva suave con un solo punto de control por tramo
      ctx.quadraticCurveTo(x, ys[i], x + px * 0.5, (ys[i] + ys[i + 1]) * 0.5);
    }
    ctx.lineTo(W, ys[n - 1]);
  };

  /* ==========================================================
     LA MÁSCARA DE LUZ
     Cuánta luz lleva la ola en cada x, de 0 a 1, y de qué tono. Se apaga
     en los bordes del panel (la ola nace y muere, no se corta contra el
     marco) y se templa un poco a la altura del verso: ahí los hilos ya no
     pasan por DETRÁS de las letras —lo rodean por arriba y por abajo, ver
     la boca en pintar()—, así que basta con bajarles un 30 % para que
     dibujen el contorno sin pelear con la letra. A los lados, el tono
     claro del acento.

     (La v117 los apagaba al 7 % detrás del verso y los dejaba pasar por
     encima: la ola parecía cortarse en la letra. El usuario echó de menos
     cómo la v116 «recorría la letra de la canción», abriéndose alrededor
     del verso que suena, y eso es lo que se recuperó.) Va metido en el
     propio gradiente del trazo: cero pasadas de más.

     El gradiente se rehace solo cuando cambia algo que se vea (el verso
     se mueve, cambia el color, cambia el tamaño): con el verso quieto,
     que es casi siempre, se reutiliza el mismo objeto.
     ========================================================== */
  const MUESTRAS = 40;
  let mascaraFirma = '';

  const luzEn = (x, on) => {
    const u = x / W;
    let m = u < 0.07 ? suave(u / 0.07) : u > 0.93 ? suave((1 - u) / 0.07) : 1;
    // lejos: 0 pegado al centro de la escena, 1 en los flancos (tono claro)
    let lejos = Math.sin(Math.PI * u);
    if (on > 0.02 && ancla.semi > 0) {
      const d = Math.abs(x - ancla.cx) - ancla.semi;
      const hombro = Math.max(90 * dpr, ancla.semi * 0.4);
      const tapa = d <= 0 ? 1 : 1 - suave(d / hombro);
      m *= 1 - tapa * on * 0.3;
      const flanco = suave((d - hombro * 0.3) / (W * 0.22));
      lejos += (flanco - lejos) * on;
    }
    return [m, lejos];
  };

  const mascara = (on) => {
    const firma = Math.round(ancla.cx) + '|' + Math.round(ancla.semi) + '|' +
      on.toFixed(2) + '|' + W + '|' + colFirma;
    if (degradado && firma === mascaraFirma) return degradado;
    mascaraFirma = firma;
    const g = ctx.createLinearGradient(0, 0, W, 0);
    for (let s = 0; s <= MUESTRAS; s++) {
      const t = s / MUESTRAS;
      const [m, lejos] = luzEn(t * W, on);
      g.addColorStop(t, rgba(mezcla(colA, colB, lejos), m.toFixed(3)));
    }
    degradado = g;
    return g;
  };

  /* ==========================================================
     LA MÚSICA · la FORMA baila, la LUZ va despacio
     Dos velocidades a propósito:
     · la FORMA (altura de la ola, espectro, carriles, velocidad) sigue a
       la música casi al momento y SALTA con el bombo. Es lo que hacía la
       onda de la v116 y el usuario echó de menos: «reaccionaba a la
       música cuando se sync, que sea movido». Con ◈ sync o música local
       el ritmo es de verdad (fuente 'audio') y el salto va entero; cuando
       el detector va a ciegas ('estimado', Spotify sin sync) solo un
       tercio, que un metrónomo inventado bailando a tope se ve mecánico;
     · la LUZ (brillo, tono) cambia de carácter en segundos y NO late con
       el golpe: el fondo que parpadea con el bombo lo rechazó tres veces.
     Moverse no es parpadear: los hilos saltan, pero no se encienden.
     ========================================================== */
  let nivelL = 0.12;            // lentos: la luz
  let energiaL = 0.3;
  let nivelR = 0.12;            // rápidos: la forma
  let energiaR = 0.3;

  // El destello: una gota de luz que recorre el hilo principal cada ~12 s.
  let chispa = -0.3;

  const pintar = (m, dt, ahora) => {
    ctx.clearRect(0, 0, W, H);

    const on = seguirVerso(ahora, dt);
    const seg = dt / 1000;

    nivelL += ((m ? m.nivel : 0.12) - nivelL) * K(0.03, dt);
    energiaL += ((m ? m.energia : 0.3) - energiaL) * K(0.018, dt);
    nivelR += ((m ? m.nivel : 0.12) - nivelR) * K(0.25, dt);
    energiaR += ((m ? m.energia : 0.3) - energiaR) * K(0.12, dt);
    // el golpe del bombo: entero con ritmo de verdad, un tercio si es estimado
    const pesoGolpe = !m ? 0 : m.fuente === 'audio' ? 1 : m.fuente === 'estimado' ? 0.35 : 0;
    const golpe = m ? clamp(m.boom * m.boomFuerza, 0, 1) * pesoGolpe : 0;

    /* El eje de la ola es la ALTURA DEL VERSO que se canta. Sin verso se
       queda en el centro del panel. */
    const mitad = H * 0.5 + (ancla.cy - H * 0.5) * on;
    const n = Math.max(12, Math.ceil(W / paso()) + 1);
    if (ys.length !== n) { ys.length = n; ola.length = n; cerca.length = n; }

    /* LA BOCA · lo que hacía la onda de la v116 y el usuario echó de menos
       («me gustaba que recorría la letra de la canción»): a la altura del
       verso que suena los hilos se APARTAN —los de `lado` -1 por arriba,
       los de +1 por abajo— y lo rodean como un ojo; a los lados vuelven a
       juntarse y a trenzarse. Al cambiar de verso la boca viaja con él.

       Cuánto se apartan: medio verso más 40 px de aire. Ese aire importa en
       la vista lista, donde los versos van pegados (39 px de alto, sin
       hueco): así el anterior y el siguiente quedan DENTRO de la boca, en
       limpio, en vez de llevarse un hilo por encima. Tope de 0,33·H por el
       modo edit, donde el verso ocupa media pantalla. `cerca` dice cuánto
       está cada x a la altura del verso: 1 encima de las letras, 0 lejos,
       con un hombro suave entre medias. */
    const apertura = Math.min(ancla.alto * 0.55 + 40 * dpr, H * 0.33);
    const px = W / (n - 1);
    const hombro = Math.max(60 * dpr, ancla.semi * 0.55);
    for (let i = 0; i < n; i++) {
      if (on < 0.02) { cerca[i] = 0; continue; }
      const d = Math.abs(i * px - ancla.cx) - ancla.semi;
      cerca[i] = d <= 0 ? on : d >= hombro ? 0 : suave(1 - d / hombro) * on;
    }

    /* Altura de la ola: ±4,5 % del panel en calma, ±11-15 % con un tema
       movido y un salto de hasta la mitad más en cada bombo, con tope en
       el 20 %. Encima del verso se calma al 20 % (ver la boca), así que el
       baile es a los lados. En el modo edit el verso ocupa media pantalla
       y la ola vive a sus lados, donde hay sitio para que crezca. */
    let A = H * (0.045 + nivelR * 0.09 + energiaR * 0.04) * (1 + golpe * 0.5);
    A *= 1 + on * clamp(ancla.alto / H - 0.12, 0, 0.35) * 1.4;
    A = Math.min(A, H * 0.2);

    // la media del espectro, para que el detalle ondule arriba Y abajo
    let media = 0;
    for (let i = 0; i < N; i++) media += esp[i];
    media /= N;

    const T = reloj;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      // la ola nunca se aplana del todo en los bordes: solo se apaga
      const env = 0.45 + 0.55 * Math.sin(Math.PI * t);
      ola[i] = env * (
        Math.sin(t * TAU * 1.15 + T * 0.31) * 0.55 +
        Math.sin(t * TAU * 0.55 - T * 0.17 + 1.3) * 0.45 +
        (muestra(t) - media) * 1.6          // el espectro dibuja la ola (antes 0,9)
      );
    }

    const g = mascara(on);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = g;

    const brillo = clamp(0.55 + nivelL * 0.35 + energiaL * 0.1, 0, 0.95);
    const carril = H * (0.8 + energiaR * 0.6);
    const conHalo = !bajo();
    const lista = hilos();

    for (let c = lista.length - 1; c >= 0; c--) {      // de atrás adelante
      const L = lista[c];
      const y0 = mitad + L.dy * carril;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const propio =
          Math.sin(t * TAU * 2.2 + T * 0.62 + L.f) * 0.5 +
          Math.sin(t * TAU * 3.6 - T * 0.44 + L.f * 1.7) * 0.22;
        /* Encima del verso: el hilo se aparta a su lado de la boca y además
           se CALMA (una ola agitada pegada a las letras es el fondo que el
           usuario no quería); ruge a los lados, que es donde hay sitio. */
        const ce = cerca[i];
        ys[i] = clamp(
          y0 + L.lado * ce * apertura * L.abre +
            A * (ola[i] * L.a + propio * 0.55 * (0.45 + 0.55 * Math.sin(Math.PI * t))) * (1 - 0.8 * ce),
          2 * dpr, H - 2 * dpr);
      }
      trazar(n);

      /* RESPLANDOR BARATO · el mismo camino dos veces: ancho y tenue
         debajo, fino encima. `shadowBlur` haría lo mismo, pero Skia rehace
         el desenfoque en CADA trazo y esto corre 60 veces por segundo. Con
         'lighter' las dos pasadas se suman en el halo del lienzo (9 px a
         0,18 bajo un hilo de 2,2). */
      if (L.halo && conHalo) {
        ctx.globalAlpha = brillo * L.al * 0.2;
        ctx.lineWidth = L.w * dpr * 4.2;
        ctx.stroke();
      }
      ctx.globalAlpha = brillo * L.al;
      ctx.lineWidth = L.w * dpr;
      ctx.stroke();

      /* EL DESTELLO · una gota de luz que corre por el hilo principal,
         despacio, y descansa antes de volver. Es un trazo más sobre el
         camino que ya está armado. Hereda la máscara: tras el verso se
         apaga igual que el hilo, así nunca brilla encima de las letras. */
      if (c === 0 && conHalo && chispa > -0.1 && chispa < 1.1) {
        const gx = chispa * W;
        const ancho = W * 0.09;
        const pico = luzEn(clamp(gx, 0, W), on)[0] * (0.55 + energiaL * 0.3);
        if (pico > 0.02) {
          const d = ctx.createLinearGradient(gx - ancho, 0, gx + ancho, 0);
          d.addColorStop(0, rgba(colC, 0));
          d.addColorStop(0.5, rgba(colC, pico.toFixed(3)));
          d.addColorStop(1, rgba(colC, 0));
          ctx.strokeStyle = d;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = L.w * dpr * 4;
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.lineWidth = L.w * dpr * 1.2;
          ctx.stroke();
          ctx.strokeStyle = g;
        }
      }
    }

    // ~9 s de viaje y ~4 de descanso; un tema movido la acelera un poco
    chispa += seg * (0.11 + energiaL * 0.05);
    if (chispa > 1.45) chispa = -0.3;

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // la ola corre más deprisa cuanto más movido es el tema (se integra: sin saltos)
    reloj += seg * (0.8 + energiaR * 0.9 + nivelR * 0.4);
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
    leerEspectro(K(0.22, dt));      // como la v116: la ola sigue al espectro, no lo arrastra

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
