/* ==========================================================
   Traductor — la letra, en español, debajo de cada verso.

   Lo que hace: coge los versos que ya trajo js/lyrics.js de LRClib y pide
   su traducción. No inventa letras ni las guarda en el proyecto: traduce
   sobre la marcha lo que la app acaba de descargar, igual que un subtítulo.

   POR QUÉ ES UN MÓDULO APARTE y no cuatro funciones dentro de lyrics.js:
   lyrics.js ya son 2.800 líneas con dos motores dentro (la vista lista y el
   de efectos del modo edit). Traducir es un problema distinto — red, caché,
   alineado de líneas, freno ante el 429 — y no comparte una sola variable
   con ellos. Aquí se prueba y se rompe sin tocar la letra.

   ---- EL PROBLEMA DE VERDAD: QUE CUADREN LAS LÍNEAS ----

   Traducir verso a verso (una petición por línea) es lo fácil y es lo peor:
   sesenta peticiones por canción, el servidor frena a la tercera canción y
   además cada verso se traduce sin saber qué decía el anterior, que es justo
   el contexto que hace falta para que una letra no salga en chino.

   Se manda el bloque entero separado por saltos de línea, y el traductor
   devuelve los saltos donde estaban. CASI siempre. Cuando no —una frase que
   se parte, dos que se juntan— la traducción se desplaza y a partir de ahí
   cada verso lleva debajo la traducción del de al lado. Peor que no tener
   traducción, porque parece que funciona.

   De ahí `traducirBloque`: se cuentan las líneas que vuelven y si no son las
   que se mandaron, el bloque se parte por la mitad y se reintenta cada
   mitad. Al final del todo queda una sola línea, que no puede descuadrar.
   Así el alineado está GARANTIZADO, no confiado, y el caso malo cuesta unas
   pocas peticiones más en vez de arruinar la canción entera.

   ---- LO QUE AHORRA TRABAJO ----
   · Un estribillo se repite seis veces y se traduce UNA (se mandan solo las
     líneas distintas).
   · Si la canción ya está en español no se pide nada: se mira antes con las
     palabras de función, y si aun así se pide, el propio traductor dice qué
     idioma detectó y se corta ahí.
   · Lo traducido se guarda en localStorage por canción, en pares
     original→traducción, para que volver a ponerla sea instantáneo.
   ========================================================== */
window.Traductor = (() => {
  'use strict';

  const DESTINO = 'es';

  /* Tamaño de cada envío. El límite real es el largo de la URL (el texto va
     en la query), así que se mide en caracteres, no en versos. 1.200 deja la
     URL codificada bien por debajo de los 4.000 que aguanta todo el mundo. */
  const CHARS_BLOQUE = 1200;
  const LINEAS_BLOQUE = 40;
  /* Tope de peticiones por canción. Es la red de seguridad del partido por
     la mitad: si un traductor se pusiera a descuadrar TODOS los bloques, la
     recursión podría pedir una por verso. Pasado el tope se deja lo que haya
     traducido y el resto se queda sin traducir, que es un fallo visible y
     tranquilo en vez de una tormenta de peticiones. */
  const MAX_PETICIONES = 45;

  /* ---------- Freno ante el «me estás pidiendo demasiado» ----------
     Misma lección que ya aprendieron lyrics.js con LRClib y spotify.js con
     la API de Spotify: cuando el servidor contesta 429, se para. Y se para
     para TODAS las canciones, no solo para la que se llevó el castigo. */
  let frenoHasta = 0;
  const FRENO_SEG = 60;
  const frenado = () => Date.now() < frenoHasta;
  const frenar = (seg) => { frenoHasta = Date.now() + (seg || FRENO_SEG) * 1000; };

  /* ---------- Caché ----------
     Se guarda por canción, pero por PARES original→traducción y no como una
     lista alineada. Cuesta lo mismo y aguanta que la letra cambie: si LRClib
     devuelve otra versión de la misma canción (una línea más, un remaster),
     una lista alineada se descoloca entera y los pares siguen valiendo verso
     a verso. Lo que no estaba se pide, lo demás sale al instante. */
  const CACHE_KEY = 'mm_trad_cache';
  const CACHE_MAX = 40;
  const CACHE_V = 1;
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (_) { cache = {}; }

  const cacheGuardar = () => {
    try {
      const claves = Object.keys(cache);
      if (claves.length > CACHE_MAX) {
        claves.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0))
          .slice(0, claves.length - CACHE_MAX)
          .forEach((k) => delete cache[k]);
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (_) {
      /* Sin sitio (la caché de letras comparte los ~5 MB): se tira la mitad
         más vieja y se reintenta UNA vez. Si tampoco cabe, se sigue sin
         caché — traducir de nuevo es lento, perder la app no es una opción. */
      try {
        const claves = Object.keys(cache).sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
        claves.slice(0, Math.ceil(claves.length / 2)).forEach((k) => delete cache[k]);
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch (__) {}
    }
  };

  const cacheDe = (key) => {
    const e = key && cache[key];
    if (!e || e.v !== CACHE_V) return null;
    return e;
  };

  const cachePoner = (key, idioma, pares) => {
    if (!key) return;
    const ya = cacheDe(key);
    cache[key] = {
      v: CACHE_V,
      ts: Date.now(),
      idioma: idioma || (ya && ya.idioma) || '',
      pares: Object.assign({}, ya && ya.pares, pares),
    };
    cacheGuardar();
  };

  /* ---------- ¿Hace falta traducir esto? ----------
     Las palabras de función delatan el idioma mejor que cualquier otra cosa
     en un texto corto. Es el mismo criterio que usa lyrics.js para elegir
     entre dos fichas de LRClib; aquí sirve para no gastar ni una petición en
     una canción que ya está en español. Con poca señal no se opina: se
     pregunta al traductor, que detecta y lo dice en la respuesta. */
  const ES_W = new Set(('que de la el y no me te con por para mi tu se es un una como mas pero yo su lo los las ' +
    'en al del si ya cuando donde todo nada quiero amor corazon vida noche eres estoy hay muy solo ser tan').split(' '));
  const EN_W = new Set(("the and you i me to of in it is my that on for be we your this all just like don't " +
    "can't i'm love night baby know got get there was were with what when").split(' '));

  const normTxt = (s) => String(s == null ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’'`´]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const idiomaDe = (txt) => {
    const pal = normTxt(String(txt || '').replace(/\[[^\]]*\]/g, ' ')).split(' ');
    let es = 0, en = 0;
    for (const p of pal) { if (ES_W.has(p)) es++; if (EN_W.has(p)) en++; }
    if (es + en < 10) return null;          // poca señal: que decida el traductor
    if (es > en * 1.8) return 'es';
    if (en > es * 1.8) return 'en';
    return null;                            // bilingüe o dudoso
  };

  /* Versos que no se mandan a traducir: los vacíos y los que solo son notas
     musicales o puntos (las marcas de instrumental de LRClib). Traducirlos
     no da nada y encima descuadra el bloque, porque una línea vacía puede
     volver colapsada con la de al lado. */
  const traducible = (t) => {
    const s = String(t || '').trim();
    if (!s) return false;
    if (/^[♪♫♬♩\s·.…*\-_~]+$/.test(s)) return false;
    return /[\p{L}]/u.test(s);
  };

  /* ---------- La red ----------
     Endpoint público de Google Translate (el que usa la extensión del
     navegador). Sin clave, con CORS abierto y con una propiedad que aquí
     vale oro: la respuesta dice qué idioma DETECTÓ, así que una canción que
     ya está en español se corta en la primera petición.

     Formato de la respuesta: [[[trad, original, …], …], null, "en", …]
     — los trozos vienen partidos por frases, no por líneas; se pegan todos
     y es el texto pegado el que conserva los saltos de línea originales. */
  const GOOGLE = 'https://translate.googleapis.com/translate_a/single';

  const gtx = async (texto, signal) => {
    const url = `${GOOGLE}?client=gtx&sl=auto&tl=${DESTINO}&dt=t&q=${encodeURIComponent(texto)}`;
    const res = await fetch(url, { signal });
    if (res.status === 429 || res.status === 503) {
      frenar(FRENO_SEG);
      throw new Error('freno ' + res.status);
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const datos = await res.json();
    const trozos = (datos && datos[0]) || [];
    const out = trozos.map((t) => (t && t[0]) || '').join('');
    return { texto: out, idioma: (datos && datos[2]) || '' };
  };

  /* Segundo traductor, solo para cuando el primero no está. Va verso a verso
     (su API no admite bloques) y tiene una cuota diaria pequeña por IP, así
     que NO es un sustituto: es el último recurso para que la traducción no
     desaparezca entera por un corte pasajero. */
  const MYMEMORY = 'https://api.mymemory.translated.net/get';

  const mymemory = async (linea, signal) => {
    const url = `${MYMEMORY}?q=${encodeURIComponent(linea)}&langpair=${encodeURIComponent('en|' + DESTINO)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if (d && d.quotaFinished) { frenar(15 * 60); throw new Error('cuota agotada'); }
    const t = d && d.responseData && d.responseData.translatedText;
    if (!t) throw new Error('sin traducción');
    return String(t);
  };

  /* ---------- El bloque que SIEMPRE cuadra ----------
     Manda las líneas juntas; si no vuelven las mismas, parte por la mitad y
     reintenta. Una sola línea no puede descuadrar: sea lo que sea lo que
     vuelva, es su traducción (con los saltos internos aplanados). */
  const traducirBloque = async (lineas, estado) => {
    if (!lineas.length) return [];
    if (estado.signal && estado.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (estado.pedidas >= MAX_PETICIONES) return lineas.map(() => '');

    estado.pedidas++;
    const { texto, idioma } = await gtx(lineas.join('\n'), estado.signal);
    if (idioma && !estado.idioma) estado.idioma = idioma;
    /* El traductor ya dijo que esto está en español: no hay nada que hacer
       con el resto de la canción. La excepción viaja hasta `traducir`, que
       la reconoce y devuelve «no hace falta». */
    if (idioma === DESTINO) { const e = new Error('ya en español'); e.mismoIdioma = true; throw e; }

    const partes = texto.split('\n');
    if (partes.length === lineas.length) return partes.map((p) => p.trim());
    if (lineas.length === 1) return [texto.replace(/\s*\n+\s*/g, ' ').trim()];

    const med = Math.ceil(lineas.length / 2);
    const a = await traducirBloque(lineas.slice(0, med), estado);
    const b = await traducirBloque(lineas.slice(med), estado);
    return a.concat(b);
  };

  const respaldoBloque = async (lineas, estado) => {
    const out = [];
    for (const l of lineas) {
      if (estado.signal && estado.signal.aborted) break;
      if (estado.pedidas >= MAX_PETICIONES || frenado()) { out.push(''); continue; }
      estado.pedidas++;
      try { out.push(await mymemory(l, estado.signal)); } catch (_) { out.push(''); }
    }
    while (out.length < lineas.length) out.push('');
    return out;
  };

  /* ---------- Lo que llama lyrics.js ----------
     textos → array de versos tal cual salen de la letra.
     opts.key    → clave de la canción (para la caché)
     opts.signal → AbortSignal: al cambiar de canción se corta
     opts.onAvance(lineas) → se llama con el array ya alineado cada vez que
       llega un bloque, para que la traducción vaya apareciendo por arriba en
       vez de saltar entera al final.

     Devuelve { lineas, idioma } o null si no hay nada que traducir (ya está
     en español, o la letra son solo notas musicales). */
  const traducir = async (textos, opts) => {
    const o = opts || {};
    const signal = o.signal;
    const key = o.key ? o.key + '|||' + DESTINO : null;
    const lista = Array.isArray(textos) ? textos : [];
    const vacio = lista.map(() => '');

    const guardada = cacheDe(key);
    if (guardada && guardada.idioma === DESTINO) return null;   // ya se supo antes

    // ¿qué versos tienen sustancia y cuáles son distintos entre sí?
    const idxUtil = [];
    for (let i = 0; i < lista.length; i++) if (traducible(lista[i])) idxUtil.push(i);
    if (!idxUtil.length) return null;

    if (idiomaDe(idxUtil.map((i) => lista[i]).join('\n')) === DESTINO) {
      cachePoner(key, DESTINO, {});
      return null;
    }

    const pares = Object.assign({}, guardada && guardada.pares);
    const salida = vacio.slice();
    const pinta = () => {
      for (const i of idxUtil) salida[i] = pares[String(lista[i]).trim()] || '';
      return salida;
    };

    // lo que ya estaba guardado se ve YA, antes de tocar la red
    pinta();
    let hayCache = false;
    for (const i of idxUtil) if (salida[i]) { hayCache = true; break; }
    if (hayCache && o.onAvance) o.onAvance(salida.slice());

    const pendientes = [];
    const vistas = new Set();
    for (const i of idxUtil) {
      const t = String(lista[i]).trim();
      if (pares[t] || vistas.has(t)) continue;
      vistas.add(t);
      pendientes.push(t);
    }
    if (!pendientes.length) return { lineas: salida.slice(), idioma: (guardada && guardada.idioma) || '' };
    if (frenado()) return { lineas: salida.slice(), idioma: '', frenado: true };

    // a bloques, por caracteres y por número de versos
    const bloques = [];
    let actual = [], largo = 0;
    for (const t of pendientes) {
      if (actual.length && (largo + t.length > CHARS_BLOQUE || actual.length >= LINEAS_BLOQUE)) {
        bloques.push(actual); actual = []; largo = 0;
      }
      actual.push(t); largo += t.length + 1;
    }
    if (actual.length) bloques.push(actual);

    const estado = { signal, pedidas: 0, idioma: '' };
    let nuevos = {};
    let falloGoogle = false;

    for (const bloque of bloques) {
      if (signal && signal.aborted) break;
      let trads = null;
      try {
        trads = await traducirBloque(bloque, estado);
      } catch (e) {
        if (e && e.mismoIdioma) { cachePoner(key, DESTINO, {}); return null; }
        if (e && e.name === 'AbortError') throw e;
        falloGoogle = true;
        // se prueba el respaldo con ESTE bloque; si tampoco, se deja de pedir
        trads = await respaldoBloque(bloque, estado);
        if (!trads.some(Boolean)) break;
      }
      for (let k = 0; k < bloque.length; k++) {
        const t = trads[k];
        /* Una traducción idéntica al original casi siempre significa «esto
           no lo sé traducir» (un nombre propio, una onomatopeya). Guardarla
           dejaría el verso repetido debajo de sí mismo, que se lee como un
           fallo. Mejor que no salga nada. */
        if (t && t !== bloque[k]) { pares[bloque[k]] = t; nuevos[bloque[k]] = t; }
      }
      if (o.onAvance) o.onAvance(pinta().slice());
    }

    if (Object.keys(nuevos).length) cachePoner(key, estado.idioma, nuevos);
    return { lineas: pinta().slice(), idioma: estado.idioma, parcial: falloGoogle };
  };

  /* Igual que el micrófono y «sigue sonando»: la preferencia se lee de
     localStorage con el mismo nombre y el mismo formato que le da
     js/settings.js, sin traducciones por el medio (ver OPCIONES allí). */
  const activa = () => {
    try { return (localStorage.getItem('mm_trad') || 'off') === 'on'; } catch (_) { return false; }
  };

  return {
    activa,
    idioma: () => DESTINO,
    traducir,
    frenado,
    // config ⚙ → datos: cuántas canciones traducidas hay guardadas
    tam: () => {
      let raw = '';
      try { raw = localStorage.getItem(CACHE_KEY) || ''; } catch (_) {}
      return { n: Object.keys(cache).length, bytes: raw.length };
    },
    limpiar: () => {
      cache = {};
      try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
    },
  };
})();
