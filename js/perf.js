/* ==========================================================
   PERF — cuánto trabajo aguanta este aparato.

   Hasta ahora la app corría EXACTAMENTE la misma carga en un PC y en un
   teléfono: seis bucles a 60 fps, 28+22+34 elementos moviéndose por
   frame, desenfoques de 70 px y un canvas a la resolución real del móvil
   (que en un teléfono moderno es ×3). De ahí los tirones.

   Un solo sitio decide, y todos preguntan aquí. Si mañana hay que ser más
   agresivo, se toca este archivo y no ocho.

   Se carga ANTES que los módulos que lo consultan, y todo el que pregunta
   lo hace con salvaguarda (`window.MMPerf ? … : valor de PC`), así que si
   este archivo faltara la app seguiría funcionando como antes.
   ========================================================== */
(() => {
  'use strict';

  /* `pointer: coarse` distingue mejor que el ancho: un teléfono en
     horizontal pasa de 760 px y sigue siendo un teléfono, y una ventana
     estrecha en el PC no lo es. El ancho queda de respaldo. */
  const tactil = window.matchMedia('(pointer: coarse)').matches;
  const corto = Math.min(window.innerWidth, window.innerHeight) <= 820;
  const movil = tactil || corto;

  /* `deviceMemory` y `hardwareConcurrency` no existen en todos los
     navegadores. Sin dato y siendo táctil suponemos aparato modesto:
     equivocarse por arriba se paga en tirones, por abajo solo en unas
     lucecitas de menos que nadie echa en falta. */
  const mem = navigator.deviceMemory || 0;
  const nucleos = navigator.hardwareConcurrency || 0;
  const bajo = movil && (mem <= 4 || nucleos <= 4);

  /* Cuántos elementos vivos pintar de los que pediría un PC. No es un
     ajuste de gusto: cada uno de esos nodos es una escritura de estilo y
     una capa que componer en cada frame. */
  const cuantos = (n) => (nivel >= 2 ? Math.max(3, Math.round(n * 0.34))
    : nivel >= 1 ? Math.max(4, Math.round(n * 0.5)) : n);

  /* ---------- SUPERFICIE DE PANTALLA ----------

     El bug que trajo todo esto: en un monitor de 2K o un ultrawide la app
     daba tirones y en 1080p no. La causa no es que esos equipos sean malos,
     es que TODO el adorno de fondo estaba medido en `vmax`, o sea en
     proporción del lado MAYOR de la pantalla. Los tres focos de `.amb-blob`
     miden 46/38/26 vmax y llevan `filter: blur(70px)`, así que:

         1920×1080  →  vmax 19,2 px  →  foco grande de   883 px (0,78 Mpx)
         2560×1440  →  vmax 25,6 px  →  foco grande de 1.178 px (1,39 Mpx)
         3440×1440  →  vmax 34,4 px  →  foco grande de 1.582 px (2,50 Mpx)

     Medido con la sonda: 5,2 Mpx desenfocados en 1080p, 7,6 en 2K y 11,6 en
     el ultrawide. Un desenfoque cuesta superficie × radio, y encima
     `ambient.js` le cambia la escala en cada frame, lo que obliga a
     REHACERLO entero. De ahí que el mismo equipo que va sobrado en 1080p se
     arrastre a 17,8 fps en un ultrawide (medido en el vídeo del usuario:
     intervalos de 50-58 ms entre cambios reales de imagen).

     `escalaFondo()` devuelve el factor por el que hay que encoger esos
     adornos para que su superficie en píxeles NO crezca con la pantalla: la
     raíz cuadrada mantiene el ÁREA constante, que es lo que se paga.
     Con tope por abajo para que en una pantalla enorme no queden ridículos.

     Clave: en 1080p o menos vale exactamente 1, así que en la pantalla del
     usuario no cambia ni un píxel. Solo se recorta hacia arriba. */
  const BASE_MPX = (1920 * 1080) / 1e6;          // la pantalla de referencia
  let superficie = 0, escala = 1;

  const medirPantalla = () => {
    const d = Math.min(2, window.devicePixelRatio || 1);
    superficie = (window.innerWidth * window.innerHeight * d * d) / 1e6;
    escala = superficie <= BASE_MPX ? 1
      : Math.max(0.62, Math.sqrt(BASE_MPX / superficie));
    escala = Math.round(escala * 100) / 100;
    /* Un solo número para el CSS. Lo usan tanto el TAMAÑO del foco como el
       RADIO de su desenfoque: un foco más pequeño necesita menos radio para
       verse igual de difuso, y como el coste es superficie × radio, aplicarlo
       a los dos ahorra dos veces. */
    if (document.documentElement) {
      document.documentElement.style.setProperty('--fondo-escala', escala);
    }
    if (document.body) {
      document.body.classList.toggle('pantalla-grande', superficie > BASE_MPX * 1.25);
    }
  };
  medirPantalla();
  document.addEventListener('DOMContentLoaded', medirPantalla);
  window.addEventListener('resize', medirPantalla, { passive: true });

  /* ---------- TOPE DE FOTOGRAMAS ----------

     30 fps en el móvil: la mitad de trabajo y a simple vista no se nota en
     luces de fondo (en el canvas del espectro tampoco).

     Y 60 fps COMO MÁXIMO en todas partes, que antes no había ninguno. En un
     monitor de 120 Hz —el del vídeo— o de 165 Hz, los bucles de adorno
     corrían a 120 o 165 pasadas por segundo: dos o tres veces el trabajo por
     nada, porque estos adornos son luces muy suavizadas y un espectro de
     barras, y a 60 se ven idénticos. La letra y los efectos de edit NO se
     tocan: son animaciones CSS y siguen a los hercios que dé la pantalla.

     ¿Por qué 13 y no 16,67? Porque el tope no puede caer donde quiera: solo
     se puede pintar en un vsync, así que el intervalo real es el primer
     múltiplo del periodo de la pantalla que llegue al tope. Con 16,67:

         60 Hz  (16,67 ms) → 16,67 → 60 fps   ✔ (justo, y cualquier redondeo lo tira a 30)
        120 Hz  ( 8,33 ms) → 16,67 → 60 fps   ✔
        144 Hz  ( 6,94 ms) → 20,83 → 48 fps   ✘
        165 Hz  ( 6,06 ms) → 18,18 → 55 fps

     o sea que en un monitor de 144 Hz pedir «60» daba 48. Con 13 ms de tope,
     60 Hz y 120 Hz dan 60 clavados, 144 Hz da 72 y 165 Hz da 55: nunca por
     debajo de lo que se buscaba. Los 33 del móvil se quedan como estaban
     (en una pantalla de 60 Hz caen justo en 30 fps). */
  const msFrame = () => (nivel >= 1 ? 33 : 13);

  /* `perf-tactil` va aparte de `perf-movil` a propósito: una ventana
     estrecha de escritorio es «móvil» para la carga de trabajo (conviene
     recortar), pero tiene ratón — y lo que se toca con el dedo necesita
     otras reglas (objetivos grandes, nada que dependa del hover). */
  // (las clases las pone aplicarNivel(), más abajo: el nivel puede cambiar
  //  en marcha y tiene que ser un solo sitio quien las escriba)

  /* ---------- Suavizados que no dependen de los fps ----------

     Media app está escrita con la forma `x += (objetivo - x) * k`, y esa
     `k` se aplica UNA VEZ POR FRAME. Todas se afinaron a 60 Hz, así que en
     un monitor de 165 Hz corren 2,75 veces más seguido: las barras caen
     casi tres veces más rápido de lo previsto y el ambiente se vuelve
     nervioso. En un móvil a 30 fps pasa lo contrario, va todo espeso.

     La conversión correcta de un suavizado exponencial a otro paso de
     tiempo es `k' = 1 - (1-k)^(dt/dt60)`. Así 0.12 significa lo mismo a
     30, 60, 144 o 240 Hz: el mismo tiempo real de caída.

     El `dt` se recorta a 100 ms: al volver de otra pestaña puede llegar un
     salto enorme y sin tope el suavizado daría un tirón en vez de una
     transición. */
  const DT60 = 1000 / 60;
  const k = (k60, dtMs) => {
    if (!(k60 > 0)) return 0;
    if (k60 >= 1) return 1;
    const dt = Math.min(100, Math.max(1, dtMs || DT60));
    if (Math.abs(dt - DT60) < 1.5) return k60;    // ya vamos a 60: sin cuentas
    return 1 - Math.pow(1 - k60, dt / DT60);
  };

  /* ---------- CALIDAD ADAPTATIVA ----------

     Hasta aquí todo se decidía UNA vez, al arrancar, y por lo que el aparato
     DICE ser: si es táctil o si la pantalla es pequeña. Eso deja fuera justo
     el caso del que se queja el usuario — un PC de sobremesa flojo, o viejo,
     o con la batería en modo ahorro, o con veinte pestañas abiertas: tiene
     ratón y pantalla grande, así que recibía la carga completa de un equipo
     potente y se atragantaba. Y al revés: un móvil bueno se quedaba recortado
     sin necesidad.

     Así que además de suponer, se MIDE. Se cuentan los frames de verdad y, si
     el aparato no da la talla un rato seguido, se baja un escalón de calidad
     — que son exactamente las mismas mitigaciones que ya existían para móvil,
     reutilizadas. Si luego se recupera y aguanta bien un buen rato, se vuelve
     a subir.

     Tres reglas para que esto no se note ni se vuelva loco:
     1) HISTÉRESIS: bajar es fácil (2 s malos), subir es difícil (12 s buenos).
        Si no, se pasaría la vida oscilando entre dos niveles.
     2) Solo se juzga cuando la página está VISIBLE y sonando algo. En una
        pestaña de fondo el navegador baja a 1 fps a propósito: eso no es que
        el aparato sea malo.
     3) Los primeros 3 s no cuentan: al arrancar hay descarga de fuentes,
        parseo y primer pintado, y ahí cualquiera va lento. */
  const NIVELES = ['alto', 'medio', 'bajo'];
  let nivel = bajo ? 2 : movil ? 1 : 0;    // punto de partida: lo que se supuso
  const oyentes = [];

  const aplicarNivel = () => {
    if (!document.body) return;
    document.body.classList.toggle('perf-movil', nivel >= 1);
    document.body.classList.toggle('perf-bajo', nivel >= 2);
    document.body.classList.toggle('perf-tactil', tactil);
  };

  aplicarNivel();                                    // el nivel de partida, ya
  document.addEventListener('DOMContentLoaded', aplicarNivel);   // por si no había body

  const cambiar = (n) => {
    n = Math.max(0, Math.min(2, n));
    if (n === nivel) return;
    const antes = NIVELES[nivel];
    nivel = n;
    aplicarNivel();
    console.info(`[perf] calidad: ${antes} → ${NIVELES[nivel]}`);
    for (const f of oyentes) { try { f(NIVELES[nivel]); } catch (_) {} }
  };

  /* El vigilante. Un solo rAF propio, cortísimo: cuenta frames y no toca el
     DOM. Lo que cuesta esto es despreciable al lado de lo que evita. */
  const OBJETIVO = 50;      // fps por debajo de los cuales se considera que sufre
  const HOLGADO = 58;       // y por encima de los cuales va sobrado
  let marca = 0, frames = 0, malos = 0, buenos = 0, arranque = 0;

  /* Los hercios REALES de la pantalla, que no se pueden preguntar: se
     deducen del mejor segundo visto. Empieza suponiendo 60 y sube solo.
     Hace falta porque el listón tiene que ser relativo a lo que la pantalla
     puede dar: pedirle 58 fps a un móvil de 60 Hz es pedirle la perfección
     (cualquier hipo lo baja de escalón para siempre), y en uno de 165 Hz
     los mismos 58 los pasa un equipo que va a un tercio de gas. */
  let refresco = 60;

  const vigilar = (t) => {
    requestAnimationFrame(vigilar);
    if (!arranque) { arranque = t; marca = t; return; }
    frames++;
    const dt = t - marca;
    if (dt < 1000) return;               // se juzga por ventanas de un segundo
    const fps = (frames * 1000) / dt;
    frames = 0; marca = t;

    if (t - arranque < 3000) return;                        // regla 3
    if (fps > refresco) refresco = Math.min(250, fps);      // hercios de la pantalla
    if (document.hidden || !document.body.classList.contains('playing')) {
      malos = buenos = 0;                                   // regla 2
      return;
    }
    /* El listón, relativo a los hercios de la pantalla y NO al nivel.

       Antes bajaba con el nivel (suelo 26 / techo 30 a partir de `medio`)
       dando por hecho que en el móvil el propio rAF iba a 30. No va: el tope
       de 30 fps está DENTRO de los bucles de pintado, rAF sigue llamando a
       los hercios de la pantalla. Así que en cualquier monitor de 120 Hz un
       equipo en `medio` medía 120, veía «va sobrado», subía a `alto`, se
       atragantaba, volvía a bajar... un vaivén cada catorce segundos. */
    const suelo = Math.min(OBJETIVO, refresco * 0.80);
    const techo = Math.min(HOLGADO, refresco * 0.92);

    if (fps < suelo) { malos++; buenos = 0; } else if (fps >= techo) { buenos++; malos = 0; }
    else { malos = buenos = 0; }

    if (malos >= 2) { malos = 0; cambiar(nivel + 1); }       // regla 1: bajar rápido
    else if (buenos >= 12) { buenos = 0; cambiar(nivel - 1); }   // subir despacio
  };
  requestAnimationFrame(vigilar);

  window.MMPerf = {
    k,
    /* Nivel actual: 'alto' | 'medio' | 'bajo'. `medio` es lo que antes se
       llamaba «móvil» y `bajo` lo que se llamaba «móvil modesto». */
    nivel: () => NIVELES[nivel],
    /* Avisa cuando cambia, para lo que no se puede arreglar solo con CSS
       (el número de barras del visualizador, por ejemplo). */
    alCambiar: (f) => { if (typeof f === 'function') oyentes.push(f); },
    // cuántos frames de 60 Hz caben en dt (para ventanas de historia)
    frames60: (dtMs) => Math.min(100, Math.max(1, dtMs || DT60)) / DT60,
    /* movil() y bajo() responden al nivel VIVO, no a lo que se supuso al
       arrancar: así un PC flojo que ha bajado de escalón recibe las mismas
       mitigaciones que un móvil, y un móvil bueno que ha subido las suelta. */
    movil: () => nivel >= 1,
    bajo: () => nivel >= 2,
    tactil: () => tactil,
    // Megapíxeles que hay que pintar de verdad (ya contando el devicePixelRatio)
    superficie: () => superficie,
    // Factor ≤1 para encoger los adornos de fondo. 1 en 1080p o menos.
    escalaFondo: () => escala,
    /* ¿Es una pantalla lo bastante grande como para que rehacer un desenfoque
       en cada frame salga caro? Lo consultan ambient.js y cinema.js para
       dejar quieta la carátula de fondo en vez de reescalarla. */
    fondoFijo: () => nivel >= 1 || superficie > BASE_MPX * 1.25,
    hercios: () => Math.round(refresco),
    cuantos,
    msFrame,
    /* Reloj propio para cada bucle: le pasas dónde guardas el último
       pintado y te dice si toca. Devuelve true = SALTA este frame. */
    salta: (estado, ahora) => {
      const min = msFrame();
      if (!min) return false;
      if (ahora - (estado.ultimo || 0) < min) return true;
      estado.ultimo = ahora;
      return false;
    },
  };

  console.info(`[perf] ${movil ? (bajo ? 'móvil modesto' : 'móvil') : 'escritorio'}` +
    ` · mem ${mem || '?'}GB · ${nucleos || '?'} núcleos` +
    ` · pantalla ${superficie.toFixed(1)} Mpx · adornos al ${Math.round(escala * 100)}%`);
})();
