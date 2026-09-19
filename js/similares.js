/* ==========================================================
   SIMILARES — de dónde salen las canciones que suenan después

   POR QUÉ EXISTE. «Sigue sonando» necesita saber qué se parece a qué, y
   Spotify ya no lo cuenta: `GET /recommendations` —el endpoint que servía
   exactamente para esto— está muerto desde nov-2024 y contesta 403 a
   cualquier app creada después. Con él se fueron `related-artists`,
   `audio-features` y `audio-analysis`. O sea: la API de Spotify sabe QUÉ
   canción es cada una, pero ya no dice a quién se parece.

   La primera solución de esta app fue un apaño: buscar por `genre:"…"` y
   encolar lo que saliera. Eso suena al género, no a la canción. La segunda
   fue peor de cara: fabricarle un contexto a la canción metiéndola en una
   PLAYLIST NUESTRA dentro de la cuenta del usuario, porque el autoplay de
   Spotify solo se enciende con playlist o disco. Funcionaba, pero le dejaba
   una lista puesta en su cuenta a quien solo quería oír una canción. Se
   retiró: ver `limpiarListaPuente` en js/spotify.js, que además la borra.

   Esto es la tercera y la buena: preguntarle a quien SÍ tiene los datos.

   ---- LA CADENA ----
   Todo sale de **ListenBrainz** (MetaBrainz, los de MusicBrainz), que publica
   sus datasets abiertos en labs.api.listenbrainz.org. Sin cuenta, sin clave,
   sin registro y con CORS: se llama desde el navegador y ya.

     1. `acr-lookup`            artista + título → el MBID **canónico** de esa
                                grabación. Canónico importa: MusicBrainz tiene
                                veinte MBID para «Take On Me» (single, disco,
                                recopilatorios…) y los datos de parecido solo
                                cuelgan de uno. Buscando a mano se acierta el
                                equivocado y no sale nada.
     2. `similar-recordings`    ese MBID → cien grabaciones que la gente
                                escucha EN LA MISMA SESIÓN. Eso es filtrado
                                colaborativo de verdad, el mismo tipo de dato
                                con el que Spotify arma sus radios.
     3. `spotify-id-from-mbid`  esos MBID → sus **ids de Spotify**, de treinta
                                en treinta y en una sola petición. Este paso
                                es el que lo cambia todo: sin él habría que
                                buscar cada canción en Spotify por su nombre
                                —una petición por canción, con su 429 al
                                fondo—. Con él, llenar la cola entera no
                                cuesta NI UNA petición de Spotify.
     4. `similar-artists`       segunda tanda: cuando las cien se acaban (son
                                horas de música), se sigue por artistas
                                parecidos, y esos sí se buscan en Spotify.

   `mlhd-similar-recordings` es el mismo paso 2 sobre otro dataset (el Music
   Listening Histories, más viejo y más grande). Se usa solo si el primero
   viene vacío, que pasa con canciones muy nuevas o muy raras.

   ---- LO QUE ESTE ARCHIVO NO SABE ----
   Nada de Spotify, salvo pedir los ids prestados. No tiene su token, no usa
   su cuota y no hereda su 429. Entra un título y un artista, salen canciones.
   Quien las reproduce es js/spotify.js.

   ---- SI FALLA ----
   Devuelve listas vacías, nunca excepciones. Sin red, con el servidor caído o
   con una canción que no está en el catálogo, quien llama se queda con su
   plan B (el género) y la música no se entera.
   ========================================================== */
(() => {
  'use strict';

  const LABS = 'https://labs.api.listenbrainz.org';

  /* Los algoritmos son una lista cerrada: el nombre exacto o un 400 que los
     enumera todos. Estos son los de ventana larga (7500 días ≈ su histórico
     entero), que dan resultados estables en vez de lo que se lleve esta
     semana. El de artistas lleva otros números porque su enumerado es otro:
     copiar el de canciones aquí da 400. */
  const ALGO_CANCIONES = 'session_based_days_7500_session_300_contribution_5_threshold_15_limit_50_skip_30';
  const ALGO_ARTISTAS  = 'session_based_days_7500_session_300_contribution_3_threshold_10_limit_100_filter_True_skip_30';
  const ALGO_MLHD      = 'session_based_mlhd_session_300_contribution_5_threshold_15_limit_50_skip_30';

  // Si en este tiempo no ha contestado, la música no puede esperar más.
  const ESPERA = 9000;

  /* Sin tildes, sin mayúsculas y con la tipografía fina aplanada. Lo último
     no es un capricho: el catálogo de MusicBrainz escribe «i can’t help it»
     con apóstrofo curvo (U+2019) y «a‐ha» con guion tipográfico (U+2010),
     mientras que Spotify manda los de la máquina de escribir. Sin igualarlos,
     dos formas del MISMO título no se reconocen y la canción se queda sin
     recomendaciones — justo lo que pasaba con la del pantallazo. */
  const plano = (s) => String(s || '').normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‛ʼ´`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—−]/g, '-')
    .toLowerCase().trim();

  /* El «núcleo» de un título: sin paréntesis ni sufijos con guion. Es lo que
     permite ver que «Blinding Lights (Remastered)» y «Blinding Lights - Live»
     son la misma canción de fondo. Se usa para comparar, nunca para mostrar. */
  const nucleo = (s) => plano(s)
    .replace(/\s*[([].*?[)\]]\s*/g, ' ')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+/g, ' ').trim();

  const parecido = (a, b) => {
    const x = nucleo(a), y = nucleo(b);
    return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
  };

  const pedir = async (url, opts) => {
    const corta = new AbortController();
    const reloj = setTimeout(() => corta.abort(), ESPERA);
    try {
      const res = await fetch(url, {
        ...(opts || {}),
        signal: corta.signal,
        headers: { Accept: 'application/json', ...((opts && opts.headers) || {}) },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;              // sin red, servidor caído, lo que sea: plan B
    } finally {
      clearTimeout(reloj);
    }
  };

  /* Estos datasets aceptan GET con un caso o POST con una lista de casos.
     El POST es el que ahorra peticiones: treinta canciones en una. */
  const pedirLote = (ruta, casos) => pedir(LABS + ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(casos),
  });

  /* Algunos endpoints contestan [[entrada],[salida]] en vez de la lista
     pelada. Se acepta cualquiera de las dos formas. */
  const comoLista = (d) => {
    if (!Array.isArray(d)) return [];
    if (d.length && Array.isArray(d[0])) return d[d.length - 1] || [];
    return d;
  };

  // ---------- Caché: qué MBID le toca a cada canción ----------
  /* En localStorage porque es información que NO cambia: el MBID de una
     grabación es el mismo hoy que dentro de un año. Sin esto, volver a poner
     la misma canción repetiría la búsqueda entera. */
  const CLAVE_CACHE = 'mm_mbid_v1';
  const TOPE_CACHE = 400;

  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CLAVE_CACHE) || '{}') || {}; }
  catch (e) { cache = {}; }

  const guardar = (clave, ficha) => {
    cache[clave] = ficha;        // null también se guarda: no volver a buscar
    const claves = Object.keys(cache);
    if (claves.length > TOPE_CACHE) {
      // Las más viejas primero: el orden de inserción de un objeto plano
      claves.slice(0, claves.length - TOPE_CACHE).forEach((k) => { delete cache[k]; });
    }
    try { localStorage.setItem(CLAVE_CACHE, JSON.stringify(cache)); } catch (e) {}
  };

  /* Artista + título → los identificadores canónicos de MusicBrainz.
     Devuelve null si no la encuentra, y eso NO es un fallo: hay canciones que
     no están en el catálogo, y para eso está el plan B del género. */
  const identificar = async ({ name, artist }) => {
    if (!name) return null;
    const clave = 'a:' + plano(artist) + '|' + plano(name);
    if (Object.prototype.hasOwnProperty.call(cache, clave)) return cache[clave];

    const d = await pedir(LABS + '/acr-lookup/json?artist_credit_name='
      + encodeURIComponent(artist || '') + '&recording_name=' + encodeURIComponent(name));
    const fila = comoLista(d)[0];
    /* Se comprueba que el título casa. El mapeador siempre contesta algo y
       con títulos cortos («Alone», «Yes») se equivoca de canción: encolar
       parecidas a otra cosa es peor que no encolar nada. */
    const ficha = (fila && fila.recording_mbid && parecido(fila.recording_name, name))
      ? {
        mbid: fila.recording_mbid,
        artistaMbid: (fila.artist_mbids || [])[0] || null,
        nombre: fila.recording_name || name,
        artista: fila.artist_credit_name || artist,
      }
      : null;

    guardar(clave, ficha);
    return ficha;
  };

  /* Baraja DENTRO de bloques pequeños. Las recomendaciones vienen ordenadas
     por fuerza y ese orden es bueno: lo que más se parece, primero. Pero
     dejarlo tal cual hace que poner la misma canción dos días seguidos dé
     exactamente la misma cola. Removiendo de cuatro en cuatro se conserva la
     calidad (nada bueno cae al final) y cambia el orden de un día para otro. */
  const barajarPorBloques = (arr, bloque = 4) => {
    const out = [];
    for (let i = 0; i < arr.length; i += bloque) {
      const trozo = arr.slice(i, i + bloque);
      for (let j = trozo.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [trozo[j], trozo[k]] = [trozo[k], trozo[j]];
      }
      out.push(...trozo);
    }
    return out;
  };

  const sinRepetidas = (recs) => {
    const vistas = new Set();
    return recs.filter((r) => {
      const k = plano(r.artist) + '|' + nucleo(r.name);
      if (!k || vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
  };

  const comoRecomendacion = (x) => ({
    name: x.recording_name,
    artist: x.artist_credit_name,
    mbid: x.recording_mbid || null,
    fuerza: x.score || 0,
  });

  /* Grabaciones que la gente escucha en la misma sesión que esta. Si el
     dataset principal no sabe de ella se prueba con el de MLHD, que es más
     viejo pero mucho más grande. */
  const cancionesComo = async (mbid) => {
    if (!mbid) return [];
    const tirar = async (ruta, algo) => {
      const d = await pedir(LABS + ruta + '/json?recording_mbids=' + encodeURIComponent(mbid)
        + '&algorithm=' + algo);
      return comoLista(d).filter((x) => x && x.recording_name && x.artist_credit_name).map(comoRecomendacion);
    };
    let recs = await tirar('/similar-recordings', ALGO_CANCIONES);
    if (!recs.length) recs = await tirar('/mlhd-similar-recordings', ALGO_MLHD);
    return barajarPorBloques(sinRepetidas(recs));
  };

  /* Artistas que escucha la misma gente. Es la segunda tanda: cuando las cien
     canciones parecidas se acaban, la mezcla sigue tirando de aquí. */
  const artistasComo = async (artistaMbid) => {
    if (!artistaMbid) return [];
    const d = await pedir(LABS + '/similar-artists/json?artist_mbids=' + encodeURIComponent(artistaMbid)
      + '&algorithm=' + ALGO_ARTISTAS);
    const nombres = comoLista(d).filter((x) => x && x.name).map((x) => x.name);
    return barajarPorBloques([...new Set(nombres)]);
  };

  /* MBID → uri de Spotify, en lote. Es el paso que hace que llenar la cola
     salga gratis de cuota: treinta canciones resueltas en una sola petición
     que NO va a Spotify.

     Un MBID puede traer veinte ids (el mismo tema en single, en disco y en
     diez recopilatorios). Se coge el primero: son la misma grabación, y al
     encolar da igual de qué disco salga. */
  const urisSpotify = async (mbids) => {
    const limpios = [...new Set((mbids || []).filter(Boolean))];
    if (!limpios.length) return {};
    const d = await pedirLote('/spotify-id-from-mbid/json', limpios.map((m) => ({ recording_mbid: m })));
    const mapa = {};
    comoLista(d).forEach((x) => {
      const id = ((x && x.spotify_track_ids) || [])[0];
      if (x && x.recording_mbid && id) mapa[x.recording_mbid] = 'spotify:track:' + id;
    });
    return mapa;
  };

  /* La cadena entera de una vez, que es como la usa js/spotify.js: entra la
     canción que acaba de sonar y salen las que van detrás. Las dos consultas
     de parecido van en paralelo: son independientes y así se tarda una en
     vez de dos. */
  const deCancion = async (pista) => {
    const vacio = { canciones: [], artistas: [], mbid: null };
    if (!pista || !pista.name) return vacio;
    const artista = (pista.artist || '').split(',')[0].trim();
    const ficha = await identificar({ name: pista.name, artist: artista });
    if (!ficha) return vacio;
    const [canciones, artistas] = await Promise.all([
      cancionesComo(ficha.mbid),
      artistasComo(ficha.artistaMbid),
    ]);
    return { canciones, artistas, mbid: ficha.mbid };
  };

  window.Similares = {
    deCancion, identificar, cancionesComo, artistasComo, urisSpotify, nucleo, parecido,
  };
})();
