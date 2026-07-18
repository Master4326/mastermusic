/* ==========================================================
   Módulo de letras sincronizadas (LRClib — sin auth, gratis)
   https://lrclib.net/docs
   ========================================================== */
(() => {
  'use strict';

  const lyricsBody = document.getElementById('lyricsBody');
  const lyricsEdit = document.getElementById('lyricsEdit');
  const modeBtn = document.getElementById('lyricsModeBtn');
  let editMode = localStorage.getItem('mm_lyrics_mode') === 'edit';
  let forceEdit = false;      // true mientras el modo cine está abierto
  let parsedLines = [];       // [{ time, text }]
  let activeIdx = -1;
  let lastTrackKey = null;
  let userScrolledRecently = false;
  let scrollTimer = null;
  let autoScrolling = false;   // true while our own smooth-scroll is animating
  let autoScrollTimer = null;
  // Offset por canción: cada pista guarda su propio ajuste; el valor viejo
  // global (mm_lyrics_offset) queda como valor por defecto para pistas nuevas.
  const defaultOffset = parseFloat(localStorage.getItem('mm_lyrics_offset') || '0') || 0;
  let offsets = {};
  try { offsets = JSON.parse(localStorage.getItem('mm_lyrics_offsets') || '{}') || {}; } catch (_) { offsets = {}; }
  let offset = defaultOffset;
  let reqSeq = 0;             // se incrementa por petición; solo la última puede tocar la UI
  let activeController = null; // AbortController de la petición en curso
  let retryTimer = null;      // reintento diferido ante fallos de red

  // Parse LRC format: "[mm:ss.xx] text"
  const parseLRC = (lrc) => {
    if (!lrc) return [];
    const lines = lrc.split(/\r?\n/);
    const result = [];
    const tag = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;
    for (const line of lines) {
      let m;
      const stamps = [];
      tag.lastIndex = 0;
      while ((m = tag.exec(line)) !== null) {
        const min = parseInt(m[1], 10);
        const sec = parseInt(m[2], 10);
        const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
        stamps.push(min * 60 + sec + ms / 1000);
      }
      const text = line.replace(tag, '').trim();
      for (const t of stamps) {
        result.push({ time: t, text });
      }
    }
    return result.sort((a, b) => a.time - b.time);
  };

  const setEmpty = (msg) => {
    parsedLines = [];
    activeIdx = -1;
    lyricsBody.innerHTML = `<p class="lyrics-empty">${msg}</p>`;
    lyricsEdit.innerHTML = `<p class="lyrics-empty">${msg}</p>`;
  };

  const renderLines = () => {
    if (!parsedLines.length) {
      setEmpty('No se encontró letra para esta canción.');
      return;
    }
    lyricsBody.innerHTML = parsedLines
      .map((l, i) => `<div class="lyric-line" data-idx="${i}" data-time="${l.time}">${l.text || '♪'}</div>`)
      .join('');
    lyricsEdit.innerHTML = '';   // el modo edit se repinta en el próximo tick
  };

  // GET con reintentos suaves ante fallos transitorios (cortes de red, 429,
  // 5xx). Cada intento tiene un tope de tiempo: una petición colgada se corta
  // y se reintenta en vez de dejar la letra "Buscando…" media canción.
  // Devuelve { data } si hubo resultado, { notFound:true } si el servidor
  // respondió "no existe" (404 u otro 4xx), o lanza si la red falla de verdad.
  // Timeout holgado: LRClib responde lento (~7s medidos), pero una petición
  // colgada de verdad se corta a los 12s y se reintenta.
  const fetchJSON = async (url, { signal, retries = 2, timeout = 12000 } = {}) => {
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const inner = new AbortController();
      const onAbort = () => inner.abort();
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      const tId = setTimeout(() => inner.abort(), timeout);
      try {
        const res = await fetch(url, { signal: inner.signal });
        if (res.status === 404) return { notFound: true };
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error('HTTP ' + res.status);   // transitorio → reintentar
        } else if (!res.ok) {
          return { notFound: true };                   // otro 4xx → sin resultado
        } else {
          return { data: await res.json() };
        }
      } catch (e) {
        // AbortError del signal externo = canción reemplazada → propagar.
        // AbortError por timeout propio = intento lento → reintentar.
        if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
        lastErr = e;
      } finally {
        clearTimeout(tId);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 450 * (attempt + 1)));  // backoff
      }
    }
    throw lastErr || new Error('fetch failed');
  };

  /* ---- Caché de letras (localStorage) ----
     Cada canción se busca UNA vez; las siguientes reproducciones salen al
     instante. "Sin letra" también se cachea, pero caduca a las 24h por si
     alguien la sube a LRClib después. LRU con tope de entradas. */
  const CACHE_KEY = 'mm_lyrics_cache';
  const CACHE_MAX = 120;
  const NF_TTL = 24 * 60 * 60 * 1000;
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (_) { cache = {}; }

  const cacheSave = () => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (_) {
      // cuota llena: suelta la mitad más vieja y reintenta una vez
      const keys = Object.keys(cache).sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
      keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => delete cache[k]);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (_) {}
    }
  };

  // null = no está en caché; { notFound:true } = cacheado como "sin letra";
  // si no, un objeto con la misma forma que devuelve LRClib.
  const cacheGet = (key) => {
    const e = cache[key];
    if (!e) return null;
    if (e.nf) {
      if (Date.now() - (e.ts || 0) > NF_TTL) { delete cache[key]; return null; }
      return { notFound: true };
    }
    e.ts = Date.now();   // toque LRU; se persiste en el próximo cacheSave
    return { syncedLyrics: e.s || null, plainLyrics: e.p || null };
  };

  const cachePut = (key, data) => {
    cache[key] = data
      ? { s: data.syncedLyrics || '', p: data.plainLyrics || '', ts: Date.now() }
      : { nf: 1, ts: Date.now() };
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
      keys.slice(0, keys.length - CACHE_MAX).forEach(k => delete cache[k]);
    }
    cacheSave();
  };

  const trackKey = (track) => `${track.artist}|||${track.name}`;

  // Resuelve la letra de una pista contra LRClib. Las dos peticiones (match
  // exacto y búsqueda difusa) salen EN PARALELO: si el match exacto acierta
  // se usa ese; si no, la búsqueda ya viene en camino y no se espera doble.
  // Devuelve el objeto de letra o null si no hay.
  const resolveLyrics = async (track, signal) => {
    const params = new URLSearchParams({
      track_name: track.name || '',
      artist_name: track.artist || '',
      album_name: track.album || '',
    });
    if (track.duration) params.append('duration', String(Math.round(track.duration)));
    // Búsqueda difusa: Spotify manda TODOS los artistas juntos ("A, B, C") y
    // títulos con "(feat. X)" / "- Remastered", que en LRClib no encuentran
    // nada. Para la difusa: solo el artista principal y el título limpio.
    const primaryArtist = (track.artist || '').split(',')[0].trim();
    const cleanName = (track.name || '')
      .replace(/\s*[\(\[][^)\]]*\b(feat|ft|with|remaster|version|edit|live|deluxe)\b[^)\]]*[\)\]]/gi, '')
      .replace(/\s+-\s+(feat|ft|with|remaster(ed)?|version|edit|live|deluxe).*$/i, '')
      .replace(/\s+/g, ' ').trim() || (track.name || '');
    const sParams = new URLSearchParams({
      track_name: cleanName,
      artist_name: primaryArtist,
    });

    const getP = fetchJSON(`https://lrclib.net/api/get?${params}`, { signal });
    const searchP = fetchJSON(`https://lrclib.net/api/search?${sParams}`, { signal });
    searchP.catch(() => {});   // evita unhandledrejection si el exacto gana

    let lyricsData = null;
    let getErr = null;
    try {
      const got = await getP;
      lyricsData = (got && got.data) ? got.data : null;
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      getErr = e;   // el exacto falló de red; aún puede salvarnos la búsqueda
    }

    if (!lyricsData) {
      let s;
      try {
        s = await searchP;
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        throw getErr || e;   // ambas fallaron → que lo maneje el reintento
      }
      const arr = s && s.data;
      if (Array.isArray(arr) && arr.length) {
        // Prefiere letra sincronizada Y con duración parecida a la pista real:
        // un resultado de otra versión (remix, en vivo, radio edit) trae los
        // tiempos corridos y la letra queda desfasada toda la canción.
        const dur = +track.duration || 0;
        const masCercano = (list) => {
          if (!list.length) return null;
          if (!dur) return list[0];
          let best = list[0], bestDiff = Infinity;
          for (const x of list) {
            const diff = Math.abs((+x.duration || 0) - dur);
            if (diff < bestDiff) { bestDiff = diff; best = x; }
          }
          return best;
        };
        lyricsData = masCercano(arr.filter(x => x.syncedLyrics))
          || masCercano(arr.filter(x => x.plainLyrics))
          || arr[0];
      }
    }
    return lyricsData || null;
  };

  // Precarga en caché la letra de la SIGUIENTE canción de la cola local,
  // para que al cambiar de pista aparezca al instante. Silencioso: no toca
  // la UI y cualquier fallo se ignora (se buscará normal cuando suene).
  let prefetchTimer = null;
  const prefetchNext = () => {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(() => {
      try {
        const st = window.PlayerCore && window.PlayerCore.state;
        if (!st || !Array.isArray(st.queue) || !st.queue.length) return;
        const nextPos = (st.queueIndex + 1) % st.queue.length;
        if (nextPos === st.queueIndex) return;
        const nt = st.tracks[st.queue[nextPos]];
        if (!nt || nt.spotify) return;
        const key = trackKey(nt);
        if (cacheGet(key) !== null) return;
        resolveLyrics(nt, undefined)
          .then(d => cachePut(key, d))
          .catch(() => {});
      } catch (_) {}
    }, 4000);   // espera a que la búsqueda de la canción actual termine
  };

  const fetchLyrics = async (track) => {
    const key = trackKey(track);
    if (key === lastTrackKey) return;   // misma canción ya resuelta: no parpadear
    lastTrackKey = key;
    songSalt = hashStr(key);   // secuencia de efectos propia de esta canción

    // carga el offset guardado de ESTA canción y avisa a la UI del slider
    offset = (key in offsets) ? offsets[key] : defaultOffset;
    window.dispatchEvent(new CustomEvent('mm:lyrics-offset', { detail: offset }));

    // Cancela cualquier búsqueda anterior y reclama este número de secuencia.
    // Así una respuesta tardía de la canción anterior NO borra la letra actual.
    clearTimeout(retryTimer);
    const myReq = ++reqSeq;
    if (activeController) { try { activeController.abort(); } catch (_) {} }
    const controller = new AbortController();
    activeController = controller;
    const isCurrent = () => myReq === reqSeq;

    // Caché primero: letra al instante si esta canción ya se buscó antes
    const cached = cacheGet(key);
    if (cached) {
      if (cached.notFound) setEmpty('No se encontró letra para esta canción.');
      else apply(cached);
      prefetchNext();
      return;
    }

    setEmpty('Buscando letra…');

    try {
      const lyricsData = await resolveLyrics(track, controller.signal);
      if (!isCurrent()) return;
      cachePut(key, lyricsData);
      if (lyricsData) apply(lyricsData);
      else setEmpty('No se encontró letra para esta canción.');
      prefetchNext();
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // reemplazada por otra canción: no tocar nada
      if (!isCurrent()) return;
      // Fallo persistente de red. Permite reintentar y prográmalo una vez más,
      // por si la conexión vuelve, siempre que sigamos en la misma canción.
      setEmpty('Sin conexión para buscar letra. Reintentando…');
      lastTrackKey = null;
      retryTimer = setTimeout(() => {
        const cur = window.PlayerCore && window.PlayerCore.state && window.PlayerCore.state.currentTrack;
        if (myReq === reqSeq && cur && `${cur.artist}|||${cur.name}` === key) {
          fetchLyrics(cur);
        }
      }, 3000);
    }
  };

  const apply = (data) => {
    if (!data) return setEmpty('No se encontró letra.');
    if (data.syncedLyrics) {
      parsedLines = parseLRC(data.syncedLyrics);
      renderLines();
    } else if (data.plainLyrics) {
      parsedLines = data.plainLyrics.split(/\r?\n/).map(t => ({ time: -1, text: t }));
      lyricsBody.innerHTML = parsedLines
        .map(l => `<div class="lyric-line">${l.text || '♪'}</div>`)
        .join('');
      lyricsEdit.innerHTML = '<p class="lyrics-empty">Esta letra no está sincronizada — el modo edit necesita tiempos. Usa la vista ≡ lista.</p>';
    } else {
      setEmpty('No se encontró letra.');
    }
  };

  /* ---- Efectos de la línea activa (estilo edit, como el regalo) ----
     Cada línea recibe su combinación determinista por índice:
     el revelado palabra a palabra se reparte según lo que dura cantada,
     y la palabra más larga sale destacada. */
  const LINE_FX = [
    'fx-rise',    // sube desde abajo con blur
    'fx-slide',   // entra alternando izquierda/derecha
    'fx-wave',    // olita con rebote
    'fx-type',    // tecleo letra por letra
    'fx-flip',    // volteo 3D desde abajo (rotateX)
    'fx-fall',    // letras caen desde arriba con rebote
    'fx-glitch',  // entrada glitch con separación RGB
    'fx-zoom',    // zoom cinematográfico desde gigante
    'fx-neon',    // parpadeo de letrero de neón encendiéndose
    'fx-spin',    // letras giran como puerta (rotateY)
    'fx-elastic', // estirón elástico con rebote
    'fx-swing',   // palabras se columpian colgadas desde arriba
  ];
  // efectos que revelan LETRA por letra; el resto va palabra a palabra
  const LETTER_FX = new Set(['fx-type', 'fx-fall', 'fx-spin', 'fx-neon']);

  // pseudo-azar determinista: misma canción + misma línea → mismo efecto,
  // pero cada canción tiene SU propia secuencia. El mezclado avalancha
  // (imul + xorshift) evita el patrón cíclico del hash lineal anterior,
  // que hacía que los efectos salieran siempre en el mismo orden.
  let songSalt = 0;
  const hashStr = (s) => {
    let h = 5381;
    for (let k = 0; k < s.length; k++) h = (Math.imul(h, 33) ^ s.charCodeAt(k)) | 0;
    return h | 0;
  };
  const semilla = (i, salt, mod) => {
    let h = (Math.imul(i + 1, 2654435761) ^ Math.imul(salt, 340573321) ^ songSalt) | 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h = (h ^ (h >>> 16)) >>> 0;
    return h % mod;
  };

  // cuánto dura cantada la línea i (para repartir las palabras)
  const duracionLinea = (i) => {
    const cur = parsedLines[i], next = parsedLines[i + 1];
    if (!cur || !next || cur.time < 0) return 3;
    return Math.min(7, Math.max(1.2, next.time - cur.time));
  };

  let revSeq = 0;   // token por revelado: invalida timers de revelados viejos

  const restoreLine = (ln, i) => {
    if (!ln.dataset.fx) return;
    ln.classList.remove(...LINE_FX, 'done');
    delete ln.dataset.fx;
    delete ln.dataset.rev;
    ln.textContent = (parsedLines[i] && parsedLines[i].text) || '♪';
  };

  let listPrevFx = '';
  const decorateLine = (ln, i) => {
    if (ln.dataset.fx) return;                    // ya decorada: no re-animar
    const text = (parsedLines[i] && parsedLines[i].text) || '♪';
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return;

    let fxk = semilla(i, 3, LINE_FX.length);
    if (LINE_FX[fxk] === listPrevFx) fxk = (fxk + 1) % LINE_FX.length;
    const fx = LINE_FX[fxk];
    listPrevFx = fx;
    ln.classList.add(fx);
    ln.dataset.fx = fx;

    // palabra destacada: la más larga (solo en líneas con sustancia)
    let idxGrande = -1;
    if (words.length >= 4) {
      idxGrande = words.reduce((mx, w, j, a) => (w.length > a[mx].length ? j : mx), 0);
    }

    const durMs = duracionLinea(i) * 1000;
    ln.innerHTML = '';
    let d = 0;

    if (LETTER_FX.has(fx)) {
      // revelado letra por letra (para líneas cortas queda precioso)
      const paso = Math.min(70, Math.max(18, (durMs * 0.4) / Math.max(1, text.length)));
      let k = 0;
      words.forEach((w, j) => {
        [...w].forEach(ch => {
          const s = document.createElement('span');
          s.className = 'w';
          s.textContent = ch;
          s.style.setProperty('--d', Math.round(d) + 'ms');
          s.style.setProperty('--sx', (k % 2 === 0 ? -1 : 1));
          if (j === idxGrande) s.classList.add('w-big');
          ln.appendChild(s);
          d += paso;
          k++;
        });
        if (j < words.length - 1) { ln.appendChild(document.createTextNode(' ')); d += paso; }
      });
    } else {
      // revelado palabra a palabra, al ritmo de la línea
      const paso = Math.min(170, Math.max(45, (durMs * 0.5) / words.length));
      words.forEach((w, j) => {
        const s = document.createElement('span');
        s.className = 'w' + (j === idxGrande ? ' w-big' : '');
        s.textContent = w;
        s.style.setProperty('--d', Math.round(d) + 'ms');
        s.style.setProperty('--sx', (j % 2 === 0 ? -1 : 1));
        ln.appendChild(s);
        if (j < words.length - 1) ln.appendChild(document.createTextNode(' '));
        d += paso;
      });
    }

    // Remate anti-bug: cuando el revelado termina, fija el texto (clase done).
    // Si alguna animación se interrumpió a mitad, esto garantiza que ninguna
    // palabra/letra quede invisible.
    const token = String(++revSeq);
    ln.dataset.rev = token;
    setTimeout(() => {
      if (ln.dataset.rev === token && ln.dataset.fx) ln.classList.add('done');
    }, d + 800);
  };

  /* ═══ MODO EDIT · una sola línea gigante, estilo edit de TikTok ═══
     Motor portado del regalo: cada línea recibe su combinación
     determinista (efecto + posición + inclinación + cámara).
     Títulos (≤3 palabras) salen GIGANTES; frases van palabra a palabra
     con la más larga destacada. La línea anterior colapsa con blur. */

  const ED_TITLE_FX = ['ed-golpe', 'ed-teclea', 'ed-cascada', 'ed-estira',
                       'ed-parpadeo', 'ed-giro3d', 'ed-rebota', 'ed-zoomloco',
                       'ed-glitch', 'ed-neon', 'ed-onda', 'ed-desliza',
                       'ed-caida3d', 'ed-latido',
                       'ed-recorte',  // cortina: el texto se revela con un barrido
                       'ed-enfoca',   // desenfoque cinematográfico que enfoca
                       'ed-sello',    // cae como sello/estampa con sacudida
                       'ed-brillo',   // entra y un destello cromado lo recorre
                       'ed-chroma',   // aberración cromática RGB que converge
                       'ed-explota',  // letras vuelan desde fuera y se arman
                       'ed-descifra', // letras aleatorias que se decodifican
                       /* portados de los edits de referencia del usuario */
                       'ed-invertido',// corte seco: fondo acento + texto oscuro
                       'ed-duo',      // palabra doble: gigante + cursiva encima
                       'ed-lockup',   // composición: palabra ENORME + mini filas
                       'ed-cinta',    // marquesinas con la frase repetida
                       'ed-contorno', // solo contorno neón, el relleno parpadea
                       'ed-portada']; // la carátula como textura de las letras
  const ED_LETTER_FX = {
    'ed-teclea': 'edl-teclea',     // tecleo
    'ed-cascada': 'edl-cae',       // letras que caen
    'ed-onda': 'edl-onda',         // olita con rebote letra a letra
    'ed-neon': 'edl-neon',         // letrero de neón encendiéndose
    'ed-explota': 'edl-explota',   // letras convergen desde posiciones locas
    'ed-descifra': 'edl-descifra', // efecto decode/hacker
  };
  const ED_STRONG = ['ed-golpe', 'ed-zoomloco', 'ed-parpadeo', 'ed-glitch',
                     'ed-sello', 'ed-explota'];
  const ED_PHRASE_FX = ['ed-acumula', 'ed-flotan', 'ed-crece', 'ed-maquina',
                        'ed-escalera', 'ed-caen', 'ed-giro', 'ed-latigo', 'ed-burbuja',
                        'ed-resorte',   // salta desde abajo con estirón elástico
                        'ed-remolino',  // cada palabra entra girando en espiral
                        'ed-foco',      // palabras borrosas gigantes que enfocan
                        'ed-poema',     // torre centrada elegante, palabra por renglón
                        /* tanda 3: presets estilo AE/CapCut para empatar con títulos */
                        'ed-ola',       // ola: cada palabra sube con rebote encadenado
                        'ed-corte',     // cortina por palabra: barrido que la revela
                        'ed-pendulo',   // columpio: cuelga y oscila hasta asentarse
                        'ed-gravedad',  // cae y rebota dos veces, como pelota
                        'ed-viento',    // ráfaga: todas llegan volando del mismo lado
                        'ed-pixelea',   // aparición pixelada a saltos (retro juego)
                        'ed-vhs',       // jitter VHS con separación RGB por palabra
                        'ed-cohete',    // despega desde abajo estirada y frena
                        'ed-carrusel',  // panel que gira como tablero de aeropuerto
                        'ed-destello',  // cada palabra enciende un flash blanco
                        'ed-susurro',   // fade lento y suave con tracking (baladas)
                        'ed-salto',     // brinco cartoon con squash & stretch
                        'ed-luzneon',   // cada palabra parpadea como letrero neón
                        'ed-iman'];     // imán: llega disparada y se ajusta al centro
  const ED_CAMS = ['edcam-zin', 'edcam-zout', 'edcam-izq', 'edcam-der',
                   'edcam-giro', 'edcam-sube', 'edcam-baja', 'edcam-late',
                   'edcam-dolly',    // acercamiento con leve giro, muy cine
                   'edcam-tiembla',  // cámara en mano: micro-sacudidas
                   'edcam-vaiven'];  // balanceo lateral suave
  const ED_TOPS = [42, 47, 55, 36, 58];

  const edLargo = (s) => s.replace(/[^\wáéíóúñ' ]/gi, '').length;

  // Elige un efecto de la lista evitando repetir el de la línea anterior:
  // dos líneas seguidas con la misma animación matan la sensación de "edit".
  let edPrevFx = '';
  let edPrevCam = '';
  /* Laboratorio de efectos (⚗): cuando demoFx/demoCam están puestos, el motor
     usa exactamente ese efecto/cámara en vez del pseudo-azar. */
  let demoFx = null;
  let demoCam = '';
  const elegirFx = (lista, i, salt) => {
    if (demoFx && lista.includes(demoFx)) { edPrevFx = demoFx; return demoFx; }
    let k = semilla(i, salt, lista.length);
    if (lista[k] === edPrevFx) k = (k + 1 + semilla(i, salt + 50, lista.length - 1)) % lista.length;
    edPrevFx = lista[k];
    return lista[k];
  };
  const elegirCam = (i) => {
    if (demoCam) { edPrevCam = demoCam; return demoCam; }
    let k = semilla(i, 5, ED_CAMS.length);
    if (ED_CAMS[k] === edPrevCam) k = (k + 1) % ED_CAMS.length;
    edPrevCam = ED_CAMS[k];
    return ED_CAMS[k];
  };

  // juntar palabras cortas en una misma fila ("OUT OF", "MY HEAD")
  const edFilas = (palabras) => {
    if (palabras.length <= 3 && palabras.join(' ').length <= 12) return [palabras.join(' ')];
    const filas = [];
    let fila = '';
    palabras.forEach(p => {
      const junta = fila ? fila + ' ' + p : p;
      if (fila && edLargo(junta) <= 10) fila = junta;
      else { if (fila) filas.push(fila); fila = p; }
    });
    if (fila) filas.push(fila);
    return filas;
  };

  // tamaño de fuente para que cada fila llene el panel sin desbordar
  const edTamanos = (filas) => {
    const W = lyricsEdit.clientWidth * 0.88;
    const H = lyricsEdit.clientHeight;
    const objetivo = Math.min(W, H * 1.1);
    const tam = filas.map(f =>
      Math.min(objetivo / (0.58 * Math.max(4, edLargo(f))), H * 0.24));
    const disponible = H * 0.58;
    const total = tam.reduce((s, t) => s + t, 0);
    const esc = total > disponible ? disponible / total : 1;
    return tam.map(t => Math.max(20, t * esc));
  };

  const edFlash = () => {
    const f = document.createElement('div');
    f.className = 'ed-flash';
    lyricsEdit.appendChild(f);
    setTimeout(() => f.remove(), 260);
  };

  // sacudida de todo el panel, para los efectos fuertes
  const edShake = () => {
    lyricsEdit.classList.remove('ed-sacudida');
    void lyricsEdit.offsetWidth;   // reinicia la animación
    lyricsEdit.classList.add('ed-sacudida');
  };

  // onda de choque: anillo que se expande desde el centro en los golpes
  const edRing = () => {
    const r = document.createElement('div');
    r.className = 'ed-ring';
    lyricsEdit.appendChild(r);
    setTimeout(() => r.remove(), 750);
  };

  // chispas pixel que salen disparadas del centro (estilo retro del player)
  const edSparks = (n = 12) => {
    const R = Math.min(lyricsEdit.clientWidth, lyricsEdit.clientHeight) || 300;
    for (let k = 0; k < n; k++) {
      const s = document.createElement('div');
      s.className = 'ed-spark';
      const ang = (k / n) * Math.PI * 2 + Math.random() * 0.8;
      const dist = R * 0.18 + Math.random() * R * 0.38;
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      s.style.setProperty('--sz', Math.round(3 + Math.random() * 5) + 'px');
      s.style.animationDelay = Math.round(Math.random() * 70) + 'ms';
      lyricsEdit.appendChild(s);
      setTimeout(() => s.remove(), 950);
    }
  };

  // marquesina: banda con la frase repetida en bucle (edit ámbar de referencia)
  const edBanda = (texto, dir) => {
    const banda = document.createElement('div');
    banda.className = 'ed-cinta-banda' + (dir < 0 ? ' rev' : '');
    banda.style.fontSize = Math.max(12, lyricsEdit.clientHeight * 0.045).toFixed(0) + 'px';
    const track = document.createElement('span');
    track.className = 'ed-cinta-track';
    const uni = (texto.toUpperCase() + ' • ').repeat(6);
    track.textContent = uni + uni;   // dos mitades idénticas = bucle sin costura
    banda.appendChild(track);
    return banda;
  };

  // carátula actual como textura (el div coverArt guarda url(...) en su estilo)
  const edCover = () => {
    const el = document.getElementById('coverArt');
    const bg = el && el.style.backgroundImage;
    return (bg && bg !== 'none') ? bg : null;
  };

  // composición tipo lockup: palabra más larga ENORME, el resto en mini filas
  // con tracking ancho arriba/abajo (como "you KNOW than this / YOU BETTER")
  const edLockup = (stack, words) => {
    let giant, arriba, abajo;
    if (words.length >= 3) {
      const L = words.reduce((mx, w, j, a) => (edLargo(w) > edLargo(a[mx]) ? j : mx), 0);
      giant = words[L];
      arriba = words.slice(0, L).join(' ');
      abajo = words.slice(L + 1).join(' ');
    } else {
      // 1-2 palabras: la misma palabra hace de eco arriba y abajo
      giant = words.join(' ');
      arriba = giant;
      abajo = giant;
    }
    const tam = edTamanos([giant])[0];
    let delay = 100;
    const mkMini = (txt) => {
      if (!txt) return;
      const m = document.createElement('div');
      m.className = 'ed-lockup-mini';
      m.textContent = txt.toUpperCase();
      m.style.fontSize = Math.max(11, tam * 0.16).toFixed(0) + 'px';
      m.style.setProperty('--d', delay + 'ms');
      delay += 150;
      stack.appendChild(m);
      return m;
    };
    mkMini(arriba);
    const g = document.createElement('div');
    g.className = 'ed-titulo ed-lockup-big';
    g.textContent = giant.toUpperCase();
    g.style.fontSize = tam.toFixed(1) + 'px';
    g.style.setProperty('--d', delay + 'ms');
    delay += 180;
    stack.appendChild(g);
    mkMini(abajo);
  };

  // decode/hacker: las letras muestran caracteres aleatorios hasta asentarse
  const ED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&/=+*<>';
  const edScramble = (stack) => {
    const spans = [...stack.querySelectorAll('.edl-descifra')];
    if (!spans.length) return;
    const t0 = performance.now();
    spans.forEach(s => {
      s.dataset.final = s.textContent;
      s.dataset.settle = (parseFloat(s.style.getPropertyValue('--d')) || 0) + 90;
    });
    const iv = setInterval(() => {
      if (!stack.isConnected || stack.dataset.out) { clearInterval(iv); return; }
      const t = performance.now() - t0;
      let vivos = 0;
      spans.forEach(s => {
        if (t < parseFloat(s.dataset.settle)) {
          vivos++;
          if (s.dataset.final.trim())
            s.textContent = ED_CHARS[(Math.random() * ED_CHARS.length) | 0];
        } else if (s.textContent !== s.dataset.final) {
          s.textContent = s.dataset.final;
        }
      });
      if (!vivos) clearInterval(iv);
    }, 50);
  };

  /* ═══ ESCENA INSTRUMENTAL ═══
     Cuando la línea es solo "♪" (intro, solo, puente), en vez de un título
     estático se monta una escena viva: nota central que late con los graves,
     espectro real debajo (getBands: FFT en vivo u onda idle), anillos sonar
     y notas satélite orbitando. El RAF muere solo cuando la escena sale. */
  const renderInstrumental = (stack) => {
    const H = lyricsEdit.clientHeight;
    const esc = document.createElement('div');
    esc.className = 'ed-inst';

    const centro = document.createElement('div');
    centro.className = 'ed-inst-centro';
    centro.style.fontSize = Math.max(46, H * 0.2).toFixed(0) + 'px';

    // anillos sonar que se expanden
    for (let k = 0; k < 3; k++) {
      const a = document.createElement('span');
      a.className = 'ed-inst-anillo';
      a.style.animationDelay = (k * 1.1).toFixed(1) + 's';
      centro.appendChild(a);
    }
    // notas satélite en órbita, por FUERA del anillo de espectro
    ['♫', '♪', '♩'].forEach((ch, k) => {
      const o = document.createElement('span');
      o.className = 'ed-inst-orbita' + (k % 2 ? ' rev' : '');
      o.style.setProperty('--r', (1.75 + k * 0.35).toFixed(2) + 'em');
      o.style.setProperty('--dur', (7 + k * 4) + 's');
      const s = document.createElement('span');
      s.className = 'ed-inst-sat';
      s.textContent = ch;
      o.appendChild(s);
      centro.appendChild(o);
    });

    // espectro CIRCULAR estilo NCS: 36 barras radiales alrededor de la nota,
    // espejadas (graves arriba, agudos abajo, simétrico a ambos lados)
    const NRAD = 36;
    const radBars = [];
    for (let k = 0; k < NRAD; k++) {
      const w = document.createElement('span');
      w.className = 'ed-inst-rad';
      w.style.transform = `rotate(${(k * 360 / NRAD).toFixed(1)}deg)`;
      const b = document.createElement('span');
      b.className = 'ed-inst-radbar';
      b.style.animationDelay = ((k % 9) * 0.13).toFixed(2) + 's';
      w.appendChild(b);
      centro.appendChild(w);
      radBars.push(b);
    }

    const nota = document.createElement('div');
    nota.className = 'ed-inst-nota';
    nota.textContent = '♪';
    centro.appendChild(nota);
    esc.appendChild(centro);
    stack.appendChild(esc);

    const viz = window.VisualizerModule;
    if (viz && viz.getBands) {
      esc.classList.add('live');
      let raf = 0;
      const paso = () => {
        if (!esc.isConnected) { cancelAnimationFrame(raf); return; }
        const bands = viz.getBands(19);
        radBars.forEach((b, k) => {
          // distancia circular al punto más alto: graves arriba, espejo a los lados
          const d = Math.min(k, NRAD - k) / (NRAD / 2);
          const v = bands[Math.round(d * (bands.length - 1))] || 0;
          b.style.transform = `scaleY(${(0.15 + v * 1.9).toFixed(3)})`;
        });
        const graves = (bands[0] + bands[1] + bands[2]) / 3;
        nota.style.transform = `scale(${(1 + graves * 0.22).toFixed(3)})`;
        raf = requestAnimationFrame(paso);
      };
      raf = requestAnimationFrame(paso);
    }
  };

  // salidas variadas: la línea anterior no siempre se va igual (más "edit")
  const ED_SALIDAS = ['colapsa', 'colapsa-sube', 'colapsa-glitch'];

  const renderEdit = (i) => {
    // la línea anterior colapsa con una salida elegida por línea
    // (.ed-fondo del invertido vive fuera del stack: se despide igual)
    lyricsEdit.querySelectorAll('.ed-stack, .ed-fondo').forEach(v => {
      if (v.dataset.out) v.remove();
      else {
        v.dataset.out = '1';
        v.classList.add(ED_SALIDAS[semilla(i, 61, ED_SALIDAS.length)]);
        setTimeout(() => v.remove(), 500);
      }
    });
    lyricsEdit.querySelectorAll('.lyrics-empty').forEach(v => v.remove());

    const text = ((parsedLines[i] && parsedLines[i].text) || '').trim() || '♪';
    const words = text.split(/\s+/).filter(Boolean);
    const durMs = duracionLinea(i) * 1000;

    const stack = document.createElement('div');
    stack.className = 'ed-stack ' + elegirCam(i);
    stack.style.setProperty('--top', ED_TOPS[semilla(i, 7, ED_TOPS.length)] + '%');
    stack.style.setProperty('--tilt', (semilla(i, 11, 7) - 3) + 'deg');
    lyricsEdit.appendChild(stack);

    // ¿línea instrumental? (solo ♪/♫ o puntos): escena viva en vez de título
    if (/^[♪♫♩♬\s·.…*\-]+$/.test(text)) {
      stack.style.setProperty('--top', '47%');
      stack.style.setProperty('--tilt', '0deg');
      renderInstrumental(stack);
      return;
    }

    let delay = 100;
    // ¿Sale como TÍTULO GIGANTE? Antes solo con ≤3 palabras (casi nunca en
    // letras reales). Ahora frases medianas también salen gigantes en filas
    // apiladas — la mayoría de las líneas alterna entre gigante y frase.
    const lenTxt = edLargo(text);
    const caps = demoFx
      ? ED_TITLE_FX.includes(demoFx)   // en el lab manda el efecto elegido
      : (words.length <= 3
        || (words.length <= 5 && lenTxt <= 30 && semilla(i, 41, 10) < 7)
        || (words.length <= 7 && lenTxt <= 44 && semilla(i, 41, 10) < 4));

    if (caps) {
      /* TÍTULO GIGANTE */
      const fx = elegirFx(ED_TITLE_FX, i, 3);

      if (fx === 'ed-lockup') {
        /* montaje propio: mini fila + palabra ENORME + mini fila */
        edLockup(stack, words);
        if (ED_STRONG.includes(fx)) { edFlash(); edShake(); edRing(); edSparks(); }
        return;
      }

      /* preparativos de los fx con escenografía extra */
      if (fx === 'ed-invertido') {
        stack.classList.add('ed-stack-inv');
        // el fondo va FUERA del stack (la cámara no lo mueve) y detrás de él;
        // en modo cine se ancla fijo al viewport para cubrir TODA la pantalla
        const fondo = document.createElement('div');
        fondo.className = 'ed-fondo';
        lyricsEdit.insertBefore(fondo, stack);
      }
      if (fx === 'ed-cinta') stack.appendChild(edBanda(text, 1));
      const portada = fx === 'ed-portada' ? edCover() : null;

      const filas = edFilas(words);
      const tams = edTamanos(filas);
      const letterCls = ED_LETTER_FX[fx];
      const rows = [];

      filas.forEach((fila, r) => {
        const div = document.createElement('div');
        div.className = 'ed-titulo';
        div.style.fontSize = tams[r].toFixed(1) + 'px';
        if (letterCls) {
          const paso = fx === 'ed-teclea' ? 65
                     : fx === 'ed-descifra' ? 70
                     : fx === 'ed-explota' ? 32 : 45;
          [...fila.toUpperCase()].forEach(ch => {
            const s = document.createElement('span');
            s.className = letterCls;
            s.textContent = ch;
            s.style.setProperty('--d', Math.round(delay) + 'ms');
            if (fx === 'ed-explota') {
              // cada letra llega volando desde su propio punto de origen
              const h = semilla(edLargo(fila) * 7 + Math.round(delay), 13, 4096);
              s.style.setProperty('--rx', (((h % 13) - 6) * 0.9).toFixed(1) + 'em');
              s.style.setProperty('--ry', (((Math.floor(h / 13) % 9) - 4) * 0.7).toFixed(1) + 'em');
              s.style.setProperty('--rr', (((h >> 5) % 360) - 180) + 'deg');
            }
            delay += paso;
            div.appendChild(s);
          });
        } else {
          div.textContent = fila.toUpperCase();
          div.classList.add(fx);
          div.style.setProperty('--d', Math.round(delay) + 'ms');
          if (fx === 'ed-desliza') {
            // cada fila entra deslizándose desde un lado distinto
            div.style.setProperty('--sx', (r % 2 === 0 ? -45 : 45) + '%');
            div.style.setProperty('--sk', (r % 2 === 0 ? 14 : -14) + 'deg');
          }
          delay += 150;
        }
        if (portada) div.style.backgroundImage = portada;
        stack.appendChild(div);
        rows.push({ div, fila });
        delay += 110;
      });

      if (fx === 'ed-cinta') stack.appendChild(edBanda(text, -1));
      if (fx === 'ed-duo' && rows.length) {
        // eco cursivo en minúsculas sobre la fila más larga (edit rosa/vino)
        const R = rows.reduce((mx, r) => (edLargo(r.fila) > edLargo(mx.fila) ? r : mx), rows[0]);
        const eco = document.createElement('span');
        eco.className = 'ed-duo-eco';
        eco.textContent = R.fila.toLowerCase();
        eco.style.setProperty('--d', Math.round(delay + 120) + 'ms');
        R.div.appendChild(eco);
      }

      if (ED_STRONG.includes(fx)) { edFlash(); edShake(); edRing(); edSparks(); }
      if (fx === 'ed-descifra') edScramble(stack);
    } else {
      /* FRASE palabra a palabra */
      const fx = elegirFx(ED_PHRASE_FX, i, 19);

      // eco gigante borroso detrás (solo en los modos tranquilos)
      if (fx === 'ed-acumula' || fx === 'ed-crece') {
        const eco = document.createElement('div');
        eco.className = 'ed-eco';
        eco.textContent = text;
        stack.appendChild(eco);
      }

      const p = document.createElement('div');
      p.className = 'ed-frase ' + fx;

      /* tamaño con garantía de que TODA la frase quepa en el cuadro */
      const H = lyricsEdit.clientHeight;
      const Wutil = lyricsEdit.clientWidth * 0.85;
      // tope proporcional a la altura: en el panel queda igual que siempre
      // (~36px), pero a pantalla completa (modo cine) crece con el espacio
      const fcap = Math.max(36, lyricsEdit.clientHeight * 0.075);
      let fsize = Math.max(18, Math.min(fcap, lyricsEdit.clientWidth / 15));
      const altoEstimado = () => {
        if (fx === 'ed-escalera' || fx === 'ed-poema') {
          // vertical: una palabra por renglón (renglón ≈ 1.7× por --fs y line-height)
          return words.length * fsize * 1.7;
        }
        // frases normales: estima renglones envueltos (VT323 ≈ 0.5em por carácter)
        const rows = Math.max(1, Math.ceil((text.length * fsize * 0.5) / Wutil));
        return rows * fsize * 1.6 + fsize * 0.6;   // margen extra por la palabra grande
      };
      if (altoEstimado() > H * 0.84) {
        fsize = Math.max(13, fsize * (H * 0.84) / altoEstimado());
      }
      p.style.fontSize = fsize.toFixed(1) + 'px';

      /* si la posición vertical elegida la sacaría del cuadro, centrarla */
      const hEst = altoEstimado();
      const topPx = H * (parseFloat(stack.style.getPropertyValue('--top')) || 47) / 100;
      if (topPx - hEst / 2 < 6 || topPx + hEst / 2 > H - 6) {
        stack.style.setProperty('--top', '47%');
      }

      let idxGrande = -1, idxCursiva = -1;
      if (fx !== 'ed-escalera' && fx !== 'ed-maquina' && fx !== 'ed-poema' && words.length >= 4) {
        idxGrande = words.reduce((mx, w, j, a) => (edLargo(w) > edLargo(a[mx]) ? j : mx), 0);
        idxCursiva = semilla(i, 29, words.length);
        if (idxCursiva === idxGrande) idxCursiva = -1;
      }

      const paso = Math.min(500, Math.max(130, (durMs * 0.6) / words.length));

      if (fx === 'ed-maquina') {
        // tecleo letra por letra
        words.forEach((w, j) => {
          [...w].forEach(ch => {
            const s = document.createElement('span');
            s.className = 'ed-pal';
            s.textContent = ch;
            s.style.margin = '0';
            s.style.setProperty('--d', Math.round(delay) + 'ms');
            delay += 26;
            p.appendChild(s);
          });
          if (j < words.length - 1) {
            const sp = document.createElement('span');
            sp.className = 'ed-pal';
            sp.innerHTML = '&nbsp;';
            sp.style.margin = '0';
            sp.style.setProperty('--d', Math.round(delay) + 'ms');
            p.appendChild(sp);
            delay += 40;
          }
        });
      } else {
        words.forEach((w, j) => {
          const s = document.createElement('span');
          s.className = 'ed-pal';
          s.textContent = w;
          s.style.setProperty('--d', Math.round(delay) + 'ms');
          s.style.setProperty('--sx', (j % 2 === 0 ? -1 : 1));
          if (j === idxGrande) s.classList.add('ed-grande');
          if (j === idxCursiva) s.classList.add('ed-cursiva');
          if (fx === 'ed-flotan') {
            const h = semilla(i * 31 + j, 17, 1000);
            s.style.setProperty('--tx', ((h % 30) - 15) + 'vw');
            s.style.setProperty('--ty', ((Math.floor(h / 30) % 16) - 8) + 'vh');
            s.style.setProperty('--rot', ((h % 44) - 22) + 'deg');
          }
          if (fx === 'ed-escalera') {
            const h = semilla(i * 13 + j, 23, 900);
            s.style.setProperty('--mx', ((h % 5) - 2) * 6 + '%');
            s.style.setProperty('--fs', (0.8 + (h % 4) * 0.28).toFixed(2) + 'em');
          }
          p.appendChild(s);
          delay += paso;
        });
      }
      stack.appendChild(p);
    }
  };

  /* ── alternar lista ↔ edit ── */
  const applyMode = () => {
    lyricsBody.hidden = editMode;
    lyricsEdit.hidden = !editMode;
    modeBtn.textContent = editMode ? '≡' : '✦';
    modeBtn.title = editMode ? 'Volver a vista lista' : 'Modo edit (letra animada)';
    modeBtn.classList.toggle('on', editMode);
    lyricsEdit.innerHTML = '';
    if (editMode && parsedLines.length && parsedLines[0].time < 0) {
      lyricsEdit.innerHTML = '<p class="lyrics-empty">Esta letra no está sincronizada — el modo edit necesita tiempos. Usa la vista ≡ lista.</p>';
    }
    activeIdx = -2;   // fuerza repintado inmediato de la vista elegida
    const audio = window.PlayerCore && window.PlayerCore.audio;
    if (audio && parsedLines.length) tick(audio.currentTime);
  };
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      editMode = !editMode;
      localStorage.setItem('mm_lyrics_mode', editMode ? 'edit' : 'list');
      applyMode();
    });
    applyMode();
  }

  /* ═══ ⚗ LABORATORIO DE EFECTOS ═══
     Panel para probar cualquier animación del modo edit sin música:
     elige efecto + cámara, escribe tu texto, o lanza el desfile automático.
     Mientras está abierto, tick() no pisa la demo. */
  let labOpen = false;
  let labEl = null, labText = null, labBtn = document.getElementById('fxLabBtn');
  let labLastFx = 'ed-golpe';
  let labAutoTimer = null;
  let labPrevEdit = false;
  let demoSeed = 1;

  const labDemo = (fx) => {
    labLastFx = fx;
    const esTitulo = ED_TITLE_FX.includes(fx);
    const propio = labText && labText.value.trim();
    const txt = propio || (esTitulo
      ? 'MASTER MUSIC'
      : 'y esta frase de prueba baila palabra por palabra contigo');
    // línea falsa temporal: renderEdit lee parsedLines[i] y la duración
    const save = parsedLines;
    demoFx = fx;
    parsedLines = [];
    parsedLines[demoSeed] = { time: 0, text: txt };
    parsedLines[demoSeed + 1] = { time: 6, text: txt };
    try { renderEdit(demoSeed); } finally {
      parsedLines = save;
      demoFx = null;
      demoSeed += 1;   // posición/inclinación distinta en cada pasada
    }
    // marca el chip activo
    if (labEl) labEl.querySelectorAll('.fx-chip[data-fx]').forEach(c =>
      c.classList.toggle('on', c.dataset.fx === fx));
  };

  const labAutoStop = () => {
    clearInterval(labAutoTimer);
    labAutoTimer = null;
    if (labEl) {
      const b = labEl.querySelector('[data-acc="auto"]');
      if (b) b.classList.remove('on');
    }
  };

  const labBuild = () => {
    labEl = document.createElement('div');
    labEl.className = 'fx-lab';
    const chips = (lista, pref) => lista.map(fx =>
      `<button class="fx-chip" data-fx="${fx}">${fx.replace(pref, '')}</button>`).join('');
    labEl.innerHTML =
      `<div class="fx-lab-head"><span>⚗ LAB DE EFECTOS</span><button class="fx-lab-close" title="Cerrar (Esc)">✕</button></div>` +
      `<input class="fx-lab-text" type="text" maxlength="90" placeholder="Tu texto de prueba (opcional)">` +
      `<div class="fx-lab-sec">Títulos gigantes</div><div class="fx-lab-grid">${chips(ED_TITLE_FX, 'ed-')}</div>` +
      `<div class="fx-lab-sec">Frases</div><div class="fx-lab-grid">${chips(ED_PHRASE_FX, 'ed-')}</div>` +
      `<div class="fx-lab-sec">Cámara</div><div class="fx-lab-grid">` +
        `<button class="fx-chip fx-cam on" data-cam="">auto</button>` +
        ED_CAMS.map(c => `<button class="fx-chip fx-cam" data-cam="${c}">${c.replace('edcam-', '')}</button>`).join('') +
      `</div>` +
      `<div class="fx-lab-acciones">` +
        `<button class="fx-lab-accion" data-acc="otra">▶ otra vez</button>` +
        `<button class="fx-lab-accion" data-acc="auto">⟳ desfile</button>` +
      `</div>`;
    document.getElementById('tab-lyrics').appendChild(labEl);
    labText = labEl.querySelector('.fx-lab-text');

    labEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.fx-chip');
      if (chip && chip.dataset.fx) { labAutoStop(); labDemo(chip.dataset.fx); return; }
      if (chip && chip.dataset.cam !== undefined) {
        demoCam = chip.dataset.cam;
        labEl.querySelectorAll('.fx-cam').forEach(c =>
          c.classList.toggle('on', c.dataset.cam === demoCam));
        labDemo(labLastFx);
        return;
      }
      const acc = e.target.closest('[data-acc]');
      if (acc && acc.dataset.acc === 'otra') { labDemo(labLastFx); return; }
      if (acc && acc.dataset.acc === 'auto') {
        if (labAutoTimer) { labAutoStop(); return; }
        acc.classList.add('on');
        const todos = [...ED_TITLE_FX, ...ED_PHRASE_FX];
        let k = Math.max(0, todos.indexOf(labLastFx));
        labDemo(todos[k]);
        labAutoTimer = setInterval(() => {
          k = (k + 1) % todos.length;
          labDemo(todos[k]);
        }, 2800);
        return;
      }
      if (e.target.closest('.fx-lab-close')) labToggle(false);
    });
    // Enter en el texto = repetir el efecto actual con ese texto
    labText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') labDemo(labLastFx);
    });
  };

  const labToggle = (on) => {
    const next = on === undefined ? !labOpen : !!on;
    if (next === labOpen) return;
    labOpen = next;
    if (labOpen) {
      if (!labEl) labBuild();
      const tab = document.querySelector('.tab[data-tab="lyrics"]');
      if (tab) tab.click();
      labPrevEdit = editMode;
      if (!editMode) { editMode = true; applyMode(); }   // sin tocar la preferencia
      lyricsEdit.innerHTML = '';
      labEl.hidden = false;
      if (labBtn) labBtn.classList.add('on');
      labDemo(labLastFx);
    } else {
      labAutoStop();
      demoCam = '';
      if (labEl) labEl.hidden = true;
      if (labBtn) labBtn.classList.remove('on');
      editMode = labPrevEdit;
      applyMode();   // repinta la letra real (o limpia si no hay canción)
    }
  };

  if (labBtn) labBtn.addEventListener('click', () => labToggle());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && labOpen) labToggle(false);
  });

  // al cambiar el tamaño del panel, recalcular la línea del modo edit
  let edResizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(edResizeTimer);
    edResizeTimer = setTimeout(() => {
      if ((editMode || forceEdit) && activeIdx >= 0) renderEdit(activeIdx);
    }, 250);
  });

  const tick = (currentTime) => {
    if (labOpen) return;   // el lab manda: la canción no pisa la demo
    if (!parsedLines.length || parsedLines[0].time < 0) return;
    // Apply user-adjustable offset: positive = letras se adelantan
    const t = currentTime + offset;
    let idx = -1;
    for (let i = 0; i < parsedLines.length; i++) {
      if (parsedLines[i].time <= t) idx = i;
      else break;
    }
    if (idx === activeIdx) return;
    activeIdx = idx;

    /* MODO EDIT: solo la línea actual, gigante y con efectos
       (forceEdit = el modo cine lo activa sin tocar la preferencia) */
    if (editMode || forceEdit) {
      if (idx >= 0) renderEdit(idx);
      else lyricsEdit.querySelectorAll('.ed-stack, .ed-fondo').forEach(v => {
        v.dataset.out = '1';
        v.classList.add('colapsa');
        setTimeout(() => v.remove(), 500);
      });
      return;
    }

    const allLines = lyricsBody.querySelectorAll('.lyric-line');
    allLines.forEach((ln, i) => {
      ln.classList.remove('active', 'past');
      if (i !== idx) restoreLine(ln, i);
      if (i < idx) ln.classList.add('past');
      else if (i === idx) { ln.classList.add('active'); decorateLine(ln, i); }
    });
    const active = lyricsBody.querySelector('.lyric-line.active');
    if (active && !userScrolledRecently) {
      // Manual VERTICAL-only scroll. Avoids scrollIntoView, which would
      // also scroll horizontally to chase a transform-scaled line and crop
      // the start/end of the text.
      const containerH = lyricsBody.clientHeight;
      const targetTop = active.offsetTop + active.offsetHeight / 2 - containerH / 2;
      // Flag this as a programmatic scroll so the 'scroll' listener below
      // doesn't mistake it for the user scrolling (which would disable
      // auto-centering and leave the lyrics drifting off-center).
      autoScrolling = true;
      clearTimeout(autoScrollTimer);
      autoScrollTimer = setTimeout(() => { autoScrolling = false; }, 700);
      lyricsBody.scrollTo({
        top: Math.max(0, targetTop),
        left: 0,
        behavior: 'smooth',
      });
    }
  };

  // ---- 60fps auto-tick from rAF loop, reading audio.currentTime directly.
  // This replaces the slow 4Hz 'timeupdate' polling and removes the
  // up-to-250ms perceived delay.
  const startLoop = () => {
    const loop = () => {
      requestAnimationFrame(loop);
      const audio = window.PlayerCore && window.PlayerCore.audio;
      if (!audio || audio.paused) return;
      tick(audio.currentTime);
    };
    loop();
  };
  if (window.PlayerCore) startLoop();
  else window.addEventListener('load', startLoop);

  // ---- Public offset control (set from settings UI) ----
  window.LyricsOffset = {
    get: () => offset,
    set: (sec) => {
      offset = Math.max(-10, Math.min(10, +sec || 0));
      if (lastTrackKey) {
        offsets[lastTrackKey] = offset;
        localStorage.setItem('mm_lyrics_offsets', JSON.stringify(offsets));
      } else {
        localStorage.setItem('mm_lyrics_offset', String(offset));
      }
      // Force re-evaluation immediately
      activeIdx = -2;
      const audio = window.PlayerCore && window.PlayerCore.audio;
      if (audio) tick(audio.currentTime);
    },
  };

  // Allow clicking a lyric line to seek
  lyricsBody.addEventListener('click', (e) => {
    const line = e.target.closest('.lyric-line');
    if (!line) return;
    const time = parseFloat(line.dataset.time);
    if (!isNaN(time) && time >= 0 && window.PlayerCore) {
      window.PlayerCore.audio.currentTime = time;
    }
  });

  // Track GENUINE user scroll (wheel / touch / keyboard) to avoid auto-scrolling
  // while they're reading. We listen to the input events rather than the generic
  // 'scroll' event, because our own smooth auto-scroll also fires 'scroll' and
  // would otherwise disable auto-centering in a feedback loop.
  const markUserScroll = () => {
    userScrolledRecently = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { userScrolledRecently = false; }, 2500);
  };
  lyricsBody.addEventListener('wheel', markUserScroll, { passive: true });
  lyricsBody.addEventListener('touchmove', markUserScroll, { passive: true });
  // Safety net: if a 'scroll' fires that we did NOT initiate, treat it as the user.
  lyricsBody.addEventListener('scroll', () => {
    if (autoScrolling) return;
    markUserScroll();
  });

  window.LyricsModule = {
    fetch: fetchLyrics,
    tick,
    // Estado de sincronización (lo consume el modo cine)
    getSync: () => ({ lines: parsedLines, idx: activeIdx }),
    isEditMode: () => editMode,
    // El modo cine fuerza el render tipo edit sin cambiar la preferencia
    forceEdit: (on) => {
      forceEdit = !!on;
      lyricsEdit.innerHTML = '';
      activeIdx = -2;   // fuerza repintado inmediato
      const audio = window.PlayerCore && window.PlayerCore.audio;
      if (audio && parsedLines.length) tick(audio.currentTime);
    },
  };
})();
