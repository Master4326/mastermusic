/* ==========================================================
   TEMPORIZADOR — «que se apague sola dentro de un rato»

   POR QUÉ EXISTE. Quien pone música para dormirse no quiere levantarse a
   pararla, y quien la pone para estudiar tampoco quiere que siga a las tres
   de la mañana. Es de las pocas cosas que tiene cualquier reproductor de
   toda la vida y a esta app le faltaba: dejabas «sigue sonando» encendido y
   la música, por diseño, no se acababa nunca.

   CÓMO SE USA. Desde el buscador (Ctrl+K): «apagar en 15 minutos», «en 30»,
   «en 1 hora». Escrito otra vez, cambia el plazo; «quitar el temporizador»
   lo cancela. La cuenta atrás se ve en el mismo mando mientras está puesta.

   DOS DETALLES QUE IMPORTAN:

   · BAJA EL VOLUMEN ANTES DE PARAR. Cortar en seco a alguien que se está
     durmiendo lo despierta; medio minuto de desvanecido, no. Al parar, el
     volumen vuelve a donde estaba — si no, al día siguiente la música
     arrancaría muda y parecería que la app está rota.

   · NO CUENTA CON `setTimeout` A SECAS. Un temporizador de una hora en una
     pestaña de fondo no se dispara a la hora: el navegador estrangula los
     relojes de las pestañas escondidas y llega tarde, a veces mucho. Se
     apunta la HORA de apagado y se comprueba cada pocos segundos contra el
     reloj de verdad, que es lo único que no miente.

   Vale para los dos mundos: la música de aquí y la de Spotify Connect, que
   `PlayerCore.togglePlay()` ya sabe a quién mandarle la pausa.
   ========================================================== */
(() => {
  'use strict';

  const PC = () => window.PlayerCore;
  const estado = (msg) => { if (window.SevenStatus) window.SevenStatus(msg); };

  const DESVANECIDO = 30000;   // ms que dura la bajada de volumen final
  const LATIDO = 3000;         // cada cuánto se mira el reloj

  let finaliza = 0;            // marca de tiempo del apagado, 0 = sin poner
  let reloj = null;
  let volumenPrevio = null;    // el que había antes de empezar a bajar

  const volumen = () => {
    const st = PC() && PC().state;
    return st ? st.volume : null;
  };

  const ponerVolumen = (v) => {
    if (PC() && PC().setVolume) PC().setVolume(Math.max(0, Math.min(1, v)));
  };

  const parar = () => {
    clearInterval(reloj);
    reloj = null;
    finaliza = 0;
  };

  /* Deja el volumen como estaba ANTES de que empezara el desvanecido. Se
     llama tanto al apagar como al cancelar a medias: en los dos casos lo
     que nadie quiere es encontrarse la música a cero mañana. */
  const devolverVolumen = () => {
    if (volumenPrevio !== null) {
      ponerVolumen(volumenPrevio);
      volumenPrevio = null;
    }
  };

  const apagar = () => {
    const p = PC();
    parar();
    if (p && p.playing && p.playing()) p.togglePlay();
    devolverVolumen();
    estado('◷ se acabó el temporizador · buenas noches');
  };

  const latir = () => {
    if (!finaliza) return;
    const queda = finaliza - Date.now();
    if (queda <= 0) { apagar(); return; }

    // Último medio minuto: bajando poco a poco
    if (queda <= DESVANECIDO) {
      if (volumenPrevio === null) volumenPrevio = volumen();
      if (volumenPrevio !== null) ponerVolumen(volumenPrevio * (queda / DESVANECIDO));
    }
  };

  const enMinutos = (min) => {
    if (!min || min <= 0) { quitar(); return; }
    devolverVolumen();                 // si venía de otro ya empezado
    finaliza = Date.now() + min * 60000;
    clearInterval(reloj);
    reloj = setInterval(latir, LATIDO);
    estado('◷ la música se apagará en ' + textoPlazo(min * 60000));
  };

  const quitar = () => {
    const habia = !!finaliza;
    parar();
    devolverVolumen();
    if (habia) estado('◷ temporizador quitado · la música sigue');
    return habia;
  };

  const textoPlazo = (ms) => {
    const m = Math.round(ms / 60000);
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const r = m % 60;
      return h + (h === 1 ? ' hora' : ' horas') + (r ? ' y ' + r + ' min' : '');
    }
    return Math.max(1, m) + ' min';
  };

  // Lo que queda, en ms. 0 = no hay temporizador puesto.
  const queda = () => (finaliza ? Math.max(0, finaliza - Date.now()) : 0);

  window.Temporizador = {
    poner: enMinutos,
    quitar,
    queda,
    puesto: () => !!finaliza,
    texto: () => (finaliza ? textoPlazo(queda()) : ''),
  };
})();
