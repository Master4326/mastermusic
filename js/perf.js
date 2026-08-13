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

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.toggle('perf-movil', movil);
    document.body.classList.toggle('perf-bajo', bajo);
  });
  // por si algún módulo arranca antes de DOMContentLoaded
  if (document.body) {
    document.body.classList.toggle('perf-movil', movil);
    document.body.classList.toggle('perf-bajo', bajo);
  }

  window.MMPerf = {
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
