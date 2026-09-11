/* ==========================================================
   HISTORIAL — cada canción que suena, guardada para siempre.

   POR QUÉ EXISTE ESTO. Spotify **te borra el historial**: su API de
   «reproducido recientemente» devuelve unos 50 temas EN TOTAL —no 50 por
   página: cincuenta y se acabó—, y en cuanto suena el 51 el más viejo
   desaparece para siempre. Los cursores tampoco llegan más atrás. Está hecho
   así a propósito: es una ventana de conveniencia, no un archivo.

   Esta app, en cambio, está abierta mientras escuchas y ya se entera de cada
   cambio de canción. Así que puede guardarlo TODO, en tu equipo, sin pedirle
   permiso a nadie y sin que nadie te lo pueda quitar. De ahí salen las
   estadísticas de verdad: tus más escuchadas de cualquier periodo, cuántas
   veces has puesto algo, a qué horas escuchas, cuándo descubriste una
   canción.

   QUÉ SE GUARDA: una fila por escucha, con la hora de inicio, la canción y
   **cuánto se oyó de verdad**. Eso último importa: una canción que saltaste a
   los tres segundos no dice lo mismo que una que oíste entera, y sin ese dato
   las «más escuchadas» acabarían llenas de cosas que descartaste.

   NO SALE DE TU EQUIPO. Vive en IndexedDB (ver js/db.js), igual que tu
   música importada.
   ========================================================== */
(() => {
  'use strict';

  /* Una escucha cuenta cuando llega a 30 s o a la mitad de la canción, lo que
     pase antes. Es la regla clásica del scrobbling y está bien pensada: 30 s
     ya no es un salto accidental, y la mitad salva a los temas cortos. Las
     que no llegan se guardan igual, marcadas con `corta`, porque saber qué
     saltas también es información — pero no cuentan como reproducción. */
  const MINIMO_SEG = 30;
  const MINIMA_FRACCION = 0.5;

  const clave = (t) => `${(t.artist || '').toLowerCase()}|||${(t.name || '').toLowerCase()}`;

  let actual = null;      // {fila, id, oidaBase, desde} de lo que suena ahora
  let ticker = null;      // escribe en la base de datos cada 15 s
  let contador = null;    // cuenta en memoria cada 2 s

  const ahoraSuena = () => {
    const PC = window.PlayerCore;
    return !!(PC && PC.playing && PC.playing());
  };

  const posicion = () => {
    const PC = window.PlayerCore;
    try { return (PC && PC.position) ? PC.position() : 0; } catch (e) { return 0; }
  };

  /* Cuánto se ha oído. NO se usa la posición a secas: si adelantas al minuto
     3, la posición dice 180 s pero solo has oído unos segundos. Se acumula el
     tiempo real transcurrido mientras sonaba. */
  let sonaba = false;
  const acumular = () => {
    if (!actual) return;
    const ahora = performance.now();
    /* Si VENÍA sonando, el tramo hasta este instante se oyó — aunque justo
       ahora ya esté en pausa. Esto es lo que antes se perdía: el evento
       `pause` llega cuando el audio YA se paró, así que `ahoraSuena()` era
       false y el rato desde la última cuenta se tiraba entero. Con una
       canción pausada a mitad eso bastaba para dejarla en 0 segundos oídos,
       marcarla como saltada y que no apareciera nunca en las estadísticas. */
    if (actual.desde != null && (ahoraSuena() || sonaba)) {
      actual.oida += (ahora - actual.desde) / 1000;
    }
    sonaba = ahoraSuena();
    actual.desde = sonaba ? ahora : null;
  };

  const cerrar = async () => {
    if (!actual) return;
    acumular();
    const f = actual.fila;
    const oida = Math.round(actual.oida);
    const minimo = Math.min(MINIMO_SEG, (f.dur || 0) * MINIMA_FRACCION || MINIMO_SEG);
    f.oida = oida;
    f.corta = oida < minimo;
    // La fila ya existe desde que empezó la canción: aquí solo se completa.
    try {
      if (actual.id != null && window.MusicDB) {
        f.id = actual.id;
        await window.MusicDB.playPut(f);
      }
    } catch (e) { console.warn('[historial] no se pudo cerrar la escucha:', e && e.message); }
    actual = null;
  };

  const abrir = async (t) => {
    if (!t || !t.name) return;
    const fila = {
      t: Date.now(),
      key: clave(t),
      name: t.name,
      artist: t.artist || '',
      album: t.album || '',
      cover: t.cover || null,
      uri: t.uri || null,
      dur: Math.round(t.duration || 0),
      oida: 0,
      corta: true,
      fuente: t.spotify ? 'spotify' : 'local',
    };
    actual = { fila, id: null, oida: 0, desde: ahoraSuena() ? performance.now() : null };
    /* Se escribe YA, sin esperar a que termine la canción: si cierras la
       pestaña a mitad, la escucha queda registrada igual (con lo que llevara
       oído en el último guardado). Perder la fila entera por cerrar sería el
       fallo más tonto posible en algo que existe para no perder nada. */
    try {
      if (window.MusicDB) {
        const id = await window.MusicDB.playAdd(fila);
        if (actual && actual.fila === fila) actual.id = id;
      }
    } catch (e) { console.warn('[historial] no se pudo abrir la escucha:', e && e.message); }
  };

  const alCambiar = (t) => {
    // El orden importa: primero se cierra la anterior, luego se abre la nueva
    cerrar().then(() => { if (t) abrir(t); });
  };

  /* Guardado periódico mientras suena. Sin esto, cerrar el navegador a mitad
     de una canción larga dejaría la escucha con 0 segundos oídos. */
  const guardarProgreso = async () => {
    if (!actual || actual.id == null) return;
    acumular();
    const f = actual.fila;
    const oida = Math.round(actual.oida);
    if (oida === f.oida) return;             // nada nuevo que escribir
    const minimo = Math.min(MINIMO_SEG, (f.dur || 0) * MINIMA_FRACCION || MINIMO_SEG);
    f.oida = oida;
    f.corta = oida < minimo;
    f.id = actual.id;
    try { if (window.MusicDB) await window.MusicDB.playPut(f); } catch (e) {}
  };

  const arrancar = () => {
    const PC = window.PlayerCore;
    if (!PC || !PC.onTrack) { setTimeout(arrancar, 300); return; }
    PC.onTrack(alCambiar);
    /* Contar es barato (una resta en memoria); escribir en la base de datos
       no. Así que se cuenta cada dos segundos y se escribe cada quince.
       Antes solo se contaba al escribir, y con eso cualquier pausa se tragaba
       hasta 15 s de escucha. */
    contador = setInterval(acumular, 2000);
    ticker = setInterval(guardarProgreso, 15000);
    /* Y en el momento exacto de la pausa, sin esperar al tic: es el caso que
       más se nota, porque quien pausa muchas veces se va. Con Spotify Connect
       no hay <audio> al que escuchar — allí basta el contador de arriba. */
    if (PC.audio && PC.audio.addEventListener) {
      PC.audio.addEventListener('play', acumular);
      /* Al pausar no basta con contar: hay que ESCRIBIR. Quien pausa muchas
         veces cierra la pestaña ahí mismo, y el siguiente guardado periódico
         no llega nunca. */
      ['pause', 'ended'].forEach((ev) => PC.audio.addEventListener(ev, guardarProgreso));
    }
    // Al cerrar o al esconder la pestaña, apuntar lo que llevaba oído
    window.addEventListener('pagehide', guardarProgreso);
    document.addEventListener('visibilitychange', () => { if (document.hidden) guardarProgreso(); });
  };

  // ---------- Consultas para la pantalla de estadísticas ----------

  /* Agrupa escuchas en un ranking. `campo` decide por qué se agrupa: `key`
     para canciones, `artist` para artistas. Solo cuentan las que pasaron del
     mínimo; las saltadas se descartan aquí y no en la escritura, para poder
     cambiar la regla algún día sin haber perdido el dato. */
  const ranking = (filas, campo, tope) => {
    const mapa = new Map();
    filas.forEach((f) => {
      if (f.corta) return;
      const k = campo === 'artist' ? (f.artist || '—') : f.key;
      const e = mapa.get(k) || { veces: 0, segundos: 0, name: f.name, artist: f.artist, cover: f.cover, key: k, uri: f.uri };
      e.veces++;
      e.segundos += f.oida || 0;
      if (!e.cover && f.cover) e.cover = f.cover;
      mapa.set(k, e);
    });
    return [...mapa.values()].sort((a, b) => b.veces - a.veces || b.segundos - a.segundos)
      .slice(0, tope || 20);
  };

  const resumen = (filas) => {
    const buenas = filas.filter((f) => !f.corta);
    const segundos = buenas.reduce((s, f) => s + (f.oida || 0), 0);
    const horas = new Array(24).fill(0);
    buenas.forEach((f) => { horas[new Date(f.t).getHours()]++; });
    return {
      escuchas: buenas.length,
      saltadas: filas.length - buenas.length,
      segundos,
      canciones: new Set(buenas.map((f) => f.key)).size,
      artistas: new Set(buenas.map((f) => f.artist).filter(Boolean)).size,
      horas,
      desde: filas.length ? Math.min(...filas.map((f) => f.t)) : null,
    };
  };

  // Primera vez que aparece cada canción: los «descubrimientos»
  const descubrimientos = (filas, tope) => {
    const vistas = new Map();
    filas.slice().sort((a, b) => a.t - b.t).forEach((f) => {
      if (f.corta || vistas.has(f.key)) return;
      vistas.set(f.key, f);
    });
    return [...vistas.values()].sort((a, b) => b.t - a.t).slice(0, tope || 12);
  };

  window.Historial = {
    /* `dias`: cuántos días atrás mirar. 0 o nada = todo el historial. */
    leer: async (dias) => {
      if (!window.MusicDB) return [];
      if (!dias) return window.MusicDB.playAll();
      return window.MusicDB.playRange(Date.now() - dias * 86400000, Date.now() + 1);
    },
    ranking,
    resumen,
    descubrimientos,
    cuantas: () => (window.MusicDB ? window.MusicDB.playCount() : Promise.resolve(0)),
    borrar: () => (window.MusicDB ? window.MusicDB.playClear() : Promise.resolve()),
    /* Lo que suena ahora, para que la pantalla pueda pintarlo sin esperar a
       que la canción termine y se escriba. */
    enCurso: () => (actual ? { ...actual.fila, oida: Math.round(actual.oida) } : null),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
