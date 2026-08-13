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
  const cuantos = (n) => (bajo ? Math.max(3, Math.round(n * 0.34))
    : movil ? Math.max(4, Math.round(n * 0.5)) : n);

  // 30 fps en el móvil: la mitad de trabajo y a simple vista no se nota
  // en luces de fondo (en el canvas del espectro tampoco).
  const msFrame = () => (movil ? 33 : 0);

  /* `perf-tactil` va aparte de `perf-movil` a propósito: una ventana
     estrecha de escritorio es «móvil» para la carga de trabajo (conviene
     recortar), pero tiene ratón — y lo que se toca con el dedo necesita
     otras reglas (objetivos grandes, nada que dependa del hover). */
  const marcar = () => {
    if (!document.body) return;
    document.body.classList.toggle('perf-movil', movil);
    document.body.classList.toggle('perf-bajo', bajo);
    document.body.classList.toggle('perf-tactil', tactil);
  };
  document.addEventListener('DOMContentLoaded', marcar);
  marcar();   // por si algún módulo arranca antes de DOMContentLoaded

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

  window.MMPerf = {
    k,
    // cuántos frames de 60 Hz caben en dt (para ventanas de historia)
    frames60: (dtMs) => Math.min(100, Math.max(1, dtMs || DT60)) / DT60,
    movil: () => movil,
    bajo: () => bajo,
    tactil: () => tactil,
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
    ` · mem ${mem || '?'}GB · ${nucleos || '?'} núcleos`);
})();
