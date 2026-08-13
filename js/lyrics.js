/* ==========================================================
   Módulo de letras sincronizadas (LRClib — sin auth, gratis)
   https://lrclib.net/docs
   ========================================================== */
(() => {
  'use strict';

  const lyricsBody = document.getElementById('lyricsBody');
  const lyricsEdit = document.getElementById('lyricsEdit');
  const lyricsIdle = document.getElementById('lyricsIdle');
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

  /* ---- Estado en reposo (sin canción) ----
     Se muestra en los DOS modos: antes vivía dentro de #lyricsBody, que el
     modo edit oculta, y el panel quedaba en blanco. */
  let idleOn = true;
  const setIdle = (on) => {
    if (!lyricsIdle) return;
    idleOn = !!on;
    lyricsIdle.hidden = !idleOn;
    // mientras el reposo manda, ninguna de las dos vistas ocupa sitio
    if (idleOn) { lyricsBody.hidden = true; lyricsEdit.hidden = true; setNcs(false); }
  };

  /* ---- Escena de las canciones sin letra (estilo NCS, js/ncs.js) ----
     Vive fuera de las dos vistas por la misma razón que el reposo. Devuelve
     false si el módulo no cargó, y entonces se cae al cartel de texto de
     siempre: una canción sin letra nunca debe dejar el panel en blanco. */
  let ncsOn = false;
  const setNcs = (on) => {
    const S = window.NcsScene;
    if (on && !S) return false;
    ncsOn = !!on;
    if (S) { if (ncsOn) S.mostrar(); else S.ocultar(); }
    return true;
  };

  setIdle(true);   // arranque: aún no hay canción

  // Consejos que rotan despacio: el panel vacío deja de ser un panel muerto.
  if (lyricsIdle) {
    const tipEl = document.getElementById('lyricsIdleTip');
    const TIPS = [
      'pulsa ✦ para el modo edit — la letra a pantalla completa, animada',
      '⛶ es modo cine: carátula girando y letra gigante',
      '◈ sync engancha el espectro al audio del sistema (ideal con Spotify)',
      'clic en cualquier verso para saltar a ese momento',
      '¿letra adelantada? ajústala en config ⚙ — se guarda por canción',
      'el fondo se tiñe con el color de cada carátula',
    ];
    if (tipEl) {
      let ti = Math.floor(Math.random() * TIPS.length);
      const pinta = () => {
        tipEl.textContent = TIPS[ti];
        tipEl.classList.remove('li-tip-in');
        void tipEl.offsetWidth;          // reinicia la animación de entrada
        tipEl.classList.add('li-tip-in');
        ti = (ti + 1) % TIPS.length;
      };
      pinta();
      // solo gasta ciclos mientras el reposo está a la vista
      setInterval(() => {
        if (idleOn && !document.hidden && !lyricsIdle.hidden) pinta();
      }, 6500);
    }
  }

  /* La letra llega de LRClib, o sea de fuera: antes se metía cruda en
     innerHTML. Cualquier verso con < o & rompía el HTML (y era una vía de
     inyección con una respuesta manipulada). Ojo: hay otras dos variables
     locales llamadas `esc` en este archivo, de ahí el nombre largo. */
  const escHtml = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Huecos instrumentales: si entre dos versos hay más de GAP_MIN segundos
     (intro, solo, puente) se cuela un contador de tres puntos que se llena
     mientras esperas. Sin esto la letra se queda congelada y parece que la
     app se colgó justo en la parte más bonita del tema. */
  const GAP_MIN = 6;
  const GAP_LEAD = 1.8;        // respiro tras el verso anterior antes de contar

  let lineNodes = [];          // .lyric-line, alineado con parsedLines
  let gapMap = new Map();      // idx de la línea anterior → nodo contador
  let gapAct = null;

  const limpiarLetra = () => {
    parsedLines = [];
    activeIdx = -1;
    // el innerHTML de quien llame desconecta los nodos: suelta las cachés
    lineNodes = [];
    gapMap = new Map();
    gapAct = null;
  };

  /* Mensajes de paso ("buscando…", "sin conexión…"): estos SÍ son texto,
     duran un instante y hay que poder leerlos. */
  const setEmpty = (msg) => {
    limpiarLetra();
    setNcs(false);
    lyricsBody.innerHTML = `<p class="lyrics-empty">${msg}</p>`;
    lyricsEdit.innerHTML = `<p class="lyrics-empty">${msg}</p>`;
  };

  /* Canción sin letra en LRClib. Antes se quedaba un cartel de texto plano
     en medio del panel; ahora se enciende la escena NCS: la carátula en
     círculo, su anillo de progreso y el espectro bailando con la música. */
  const setSinLetra = () => {
    limpiarLetra();
    if (!setNcs(true)) { setEmpty('No se encontró letra para esta canción.'); return; }
    lyricsBody.innerHTML = '';
    lyricsEdit.innerHTML = '';
    lyricsBody.classList.remove('sync');
    applyMode();          // reparte el hidden: con la escena encendida, ninguna vista ocupa sitio
  };

  const renderLines = () => {
    if (!parsedLines.length) {
      setSinLetra();
      return;
    }
    setNcs(false);          // hay letra: la escena NCS se retira
    const conTiempos = parsedLines[0].time >= 0;
    // sin tiempos no hay karaoke posible: la clase apaga el teñido palabra a
    // palabra para que la letra plana no se quede toda apagada
    lyricsBody.classList.toggle('sync', conTiempos);
    const hueco = (i) => `<div class="lyric-gap" data-gap="${i}" aria-hidden="true"><i></i><i></i><i></i></div>`;
    let html = '';
    // intro larga: el contador arranca antes del primer verso
    if (conTiempos && parsedLines[0].time > GAP_MIN) html += hueco(-1);
    for (let i = 0; i < parsedLines.length; i++) {
      const l = parsedLines[i];
      html += `<div class="lyric-line" data-idx="${i}" data-time="${l.time}">${escHtml(l.text) || '♪'}</div>`;
      const sig = parsedLines[i + 1];
      if (conTiempos && sig && sig.time - l.time > GAP_MIN) html += hueco(i);
    }
    lyricsBody.innerHTML = html;
    // cacheado: el tick ya no vuelve a consultar el DOM en cada cambio de línea
    lineNodes = Array.prototype.slice.call(lyricsBody.querySelectorAll('.lyric-line'));
    gapMap = new Map();
    gapAct = null;
    lyricsBody.querySelectorAll('.lyric-gap').forEach((g) => gapMap.set(+g.dataset.gap, g));
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
    // hay canción: se acabó el reposo (antes del corte por clave repetida,
    // para que reentrar en la misma pista también apague el panel de reposo)
    if (idleOn) { setIdle(false); applyMode(); }
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
      if (cached.notFound) setSinLetra();
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
      else setSinLetra();
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
    if (!data) return setSinLetra();
    if (data.syncedLyrics) {
      parsedLines = parseLRC(data.syncedLyrics);
      renderLines();
    } else if (data.plainLyrics) {
      setNcs(false);        // hay letra (aunque sin tiempos): la escena se retira
      parsedLines = data.plainLyrics.split(/\r?\n/).map(t => ({ time: -1, text: t }));
      lyricsBody.innerHTML = parsedLines
        .map(l => `<div class="lyric-line">${escHtml(l.text) || '♪'}</div>`)
        .join('');
      lyricsEdit.innerHTML = '<p class="lyrics-empty">Esta letra no está sincronizada — el modo edit necesita tiempos. Usa la vista ≡ lista.</p>';
      applyMode();          // la escena podía estar encendida: reparte el hidden
    } else {
      setSinLetra();
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
    ln._kw = null;               // los spans mueren aquí: invalida el karaoke
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

  /* ══════════ MANIFIESTO DE EFECTOS ══════════
     Fuente ÚNICA de verdad del modo edit. Cada efecto se declara UNA vez,
     aquí, y las listas que usa el motor se derivan justo debajo.

     Antes esto vivía repartido en cuatro listas distintas y añadir un efecto
     obligaba a acordarse de todas. La peligrosa era la de intensidad: si te
     la saltabas, el efecto quedaba invisible en las partes rápidas y en las
     lentas — y no fallaba nada, simplemente no salía nunca.

     Columnas:
       n  nombre     la clase CSS del efecto
       t  tipo       'T' título gigante · 'F' frase · 'TF' vale para los dos
       i  intensidad 'h' se reserva a lo movido · 'c' a lo tranquilo
                     ''  banda media (sale con cualquier cadencia)
       l  letra      clase edl-* si el efecto revela LETRA a letra
       g  golpe      1 si dispara flash + sacudida + aro + chispas

     Para añadir un efecto: una fila aquí y su CSS. Nada más. */
  const FX = [
    ['ed-golpe',         'T',   '',  '',               1],
    ['ed-teclea',        'T',   '',  'edl-teclea',     0],
    ['ed-cascada',       'T',   '',  'edl-cae',        0],
    ['ed-estira',        'T',   '',  '',               0],
    ['ed-parpadeo',      'T',   '',  '',               1],
    ['ed-giro3d',        'T',   '',  '',               0],
    ['ed-rebota',        'T',   '',  '',               0],
    ['ed-zoomloco',      'T',   '',  '',               1],
    ['ed-glitch',        'T',   '',  '',               1],
    ['ed-neon',          'T',   '',  'edl-neon',       0],
    ['ed-onda',          'T',   '',  'edl-onda',       0],
    ['ed-desliza',       'T',   '',  '',               0],
    ['ed-caida3d',       'T',   '',  '',               0],
    ['ed-latido',        'T',   '',  '',               0],
    ['ed-recorte',       'T',   '',  '',               0],  // cortina: el texto se revela con un barrido
    ['ed-enfoca',        'T',   '',  '',               0],  // desenfoque cinematográfico que enfoca
    ['ed-sello',         'T',   '',  '',               1],  // cae como sello/estampa con sacudida
    ['ed-brillo',        'T',   '',  '',               0],  // entra y un destello cromado lo recorre
    ['ed-chroma',        'T',   '',  '',               0],  // aberración cromática RGB que converge
    ['ed-explota',       'T',   '',  'edl-explota',    1],  // letras vuelan desde fuera y se arman
    ['ed-descifra',      'T',   '',  'edl-descifra',   0],  // letras aleatorias que se decodifican
    ['ed-invertido',     'T',   '',  '',               0],  // corte seco: fondo acento + texto oscuro
    ['ed-duo',           'T',   '',  '',               0],  // palabra doble: gigante + cursiva encima
    ['ed-lockup',        'T',   '',  '',               0],  // composición: palabra ENORME + mini filas
    ['ed-cinta',         'T',   '',  '',               0],  // marquesinas con la frase repetida
    ['ed-contorno',      'T',   '',  '',               0],  // solo contorno neón, el relleno parpadea
    ['ed-portada',       'T',   '',  '',               0],  // la carátula como textura de las letras
    ['ed-esquinas',      'T',   '',  'edl-esquina',    0],  // letras vuelan desde las 4 esquinas
    ['ed-caja',          'T',   '',  '',               0],  // caja de color con texto oscuro (highlight)
    ['ed-deletreo',      'T',   '',  '',               0],  // cada letra GIGANTE en secuencia, luego la palabra
    ['ed-tetris',        'T',   '',  'edl-tetris',     0],  // letras caen a saltos duros y encajan
    ['ed-diagonal',      'T',   '',  '',               0],  // filas de esquina a esquina en diagonal
    ['ed-marco',         'T',   '',  '',               0],  // corchetes de esquina que enmarcan el texto
    ['ed-persiana',      'T',   '',  'edl-persiana',   0],  // letras se abren como persianas (scaleY)
    ['ed-tv',            'T',   '',  '',               1],  // TV CRT encendiéndose: línea que se expande
    ['ed-mascara',       'T',   '',  '',               0],  // box reveal: un bloque barre y descubre el texto
    ['ed-rebana',        'T',   '',  '',               1],  // el texto llega partido en dos y se junta
    ['ed-degradado',     'T',   '',  '',               0],  // barrido de degradado por dentro de las letras
    ['ed-sombralarga',   'T',   '',  '',               0],  // sombra dura larga que se retrae al texto
    ['ed-neblina',       'T',   '',  '',               0],  // aparece de la niebla, flotando (baladas)
    ['ed-zoomlento',     'T',   '',  '',               0],  // zoom lentísimo y elegante
    ['ed-cortina',       'T',   '',  '',               0],  // se abre desde el centro como telón
    ['ed-eco',           'T',   '',  '',               0],  // estela de copias que se recogen
    ['ed-liquido',       'T',   '',  '',               0],  // entrada gelatinosa con rebote
    ['ed-flashcorte',    'T',   '',  '',               1],  // corte seco con destello blanco
    ['ed-giroeje',       'T',   '',  '',               0],  // voltea como panel de aeropuerto
    ['ed-vibra',         'T',   '',  '',               1],  // aterriza y vibra un instante
    ['ed-difumina',      'T',   '',  'edl-difumina',   0],  // letra a letra enfocando
    ['ed-giraletra',     'T',   '',  'edl-gira',       0],  // letra a letra girando sobre su eje
    ['ed-alterna',       'T',   '',  'edl-alterna',    0],  // letras alternas desde arriba y abajo
    ['ed-empuja',        'T',   '',  'edl-empuja',     0],  // letras empujando de lado con estela
    ['ed-acumula',       'F',   'c', '',               0],
    ['ed-flotan',        'F',   'c', '',               0],
    ['ed-crece',         'F',   'c', '',               0],
    ['ed-maquina',       'F',   'h', '',               0],
    ['ed-escalera',      'F',   'c', '',               0],
    ['ed-caen',          'F',   '',  '',               0],
    ['ed-giro',          'F',   '',  '',               0],
    ['ed-latigo',        'F',   'h', '',               0],
    ['ed-burbuja',       'F',   'c', '',               0],
    ['ed-resorte',       'F',   '',  '',               0],  // salta desde abajo con estirón elástico
    ['ed-remolino',      'F',   '',  '',               0],  // cada palabra entra girando en espiral
    ['ed-foco',          'F',   'c', '',               0],  // palabras borrosas gigantes que enfocan
    ['ed-poema',         'F',   'c', '',               0],  // torre centrada elegante, palabra por renglón
    ['ed-resalta',       'F',   '',  '',               0],  // karaoke: caja de color enciende palabra a palabra
    ['ed-cubo',          'F',   '',  '',               0],  // cada palabra gira como cara de cubo 3D
    ['ed-vidrio',        'F',   'c', '',               0],  // palabras transparentes (contorno) que se rellenan
    ['ed-subtitulo',     'F',   'c', '',               0],  // píldora de subtítulo estilo caption de TikTok
    ['ed-zoombrusco',    'F',   'h', '',               0],  // cada palabra se estampa desde tamaño gigante
    ['ed-impacto',       'F',   'h', '',               0],  // la frase cae en bloque y hace onda + sacudida
    ['ed-sellos',        'F',   'h', '',               0],  // cada palabra se estampa girada como sello
    ['ed-lectura',       'F',   'c', '',               0],  // subrayado que corre palabra por palabra
    ['ed-ola',           'F',   'c', '',               0],  // ola: cada palabra sube con rebote encadenado
    ['ed-corte',         'F',   '',  '',               0],  // cortina por palabra: barrido que la revela
    ['ed-pendulo',       'F',   '',  '',               0],  // columpio: cuelga y oscila hasta asentarse
    ['ed-gravedad',      'F',   'h', '',               0],  // cae y rebota dos veces, como pelota
    ['ed-viento',        'F',   'h', '',               0],  // ráfaga: todas llegan volando del mismo lado
    ['ed-pixelea',       'F',   'h', '',               0],  // aparición pixelada a saltos (retro juego)
    ['ed-vhs',           'F',   'h', '',               0],  // jitter VHS con separación RGB por palabra
    ['ed-cohete',        'F',   'h', '',               0],  // despega desde abajo estirada y frena
    ['ed-carrusel',      'F',   '',  '',               0],  // panel que gira como tablero de aeropuerto
    ['ed-destello',      'F',   'h', '',               0],  // cada palabra enciende un flash blanco
    ['ed-susurro',       'F',   'c', '',               0],  // fade lento y suave con tracking (baladas)
    ['ed-salto',         'F',   'h', '',               0],  // brinco cartoon con squash & stretch
    ['ed-luzneon',       'F',   'h', '',               0],  // cada palabra parpadea como letrero neón
    ['ed-iman',          'F',   'h', '',               0],  // imán: llega disparada y se ajusta al centro
    ['ed-desenfoca',     'F',   'c', '',               0],  // cada palabra enfoca desde el desenfoque
    ['ed-zoomsuave',     'F',   'c', '',               0],  // escala mínima + fundido, muy elegante
    ['ed-marcador',      'F',   'c', '',               0],  // rotulador que subraya palabra por palabra
    ['ed-nieve',         'F',   'c', '',               0],  // caen despacio y se posan (baladas)
    ['ed-brisa',         'F',   'c', '',               0],  // se mecen al llegar, muy suave
    ['ed-tinta',         'F',   'c', '',               0],  // mancha de tinta que se define
    ['ed-orbita',        'F',   '',  '',               0],  // llegan describiendo una curva
    ['ed-chispa',        'F',   'h', '',               0],  // destello de color al aterrizar
    ['ed-persianas',     'F',   'c', '',               0],  // cada palabra se revela por lamas
    ['ed-goteo',         'F',   'h', '',               0],  // caen como gotas con elástico
    ['ed-espejo',        'F',   '',  '',               0],  // entran reflejadas y se dan la vuelta
    ['ed-tarjeta',       'F',   'h', '',               0],  // cada palabra voltea como carta
    ['ed-estela',        'F',   'h', '',               0],  // los cortes entre trozos son secos: cuentan como golpe
    ['ed-recorta',       'F',   'c', '',               0],  // barrido que recorta la palabra al entrar
    ['ed-pulso',         'F',   'h', '',               0],  // aterrizan con doble latido
    ['ed-empujon',       'F',   'h', '',               0],  // empuje lateral fuerte con desenfoque
    ['ed-apila',         'TF',  'c', '',               0],  // filas que se acumulan, estilo edit TikTok
    ['ed-tijera',        'T',   '',  '',               0],  // corte en DIAGONAL, las dos mitades encajan
    ['ed-esquirla',      'T',   '',  '',               1],
    ['ed-trozos',        'F',   'h', '',               0],  // el verso en trozos de 2-4 palabras que se relevan
    ['ed-relevo',        'F',   'h', '',               0],  // cada palabra entra empujando a la anterior
    ['ed-ondula',        'F',   'c', '',               0],
  ];

  /* ── listas derivadas ──
     El ORDEN de títulos y frases sí importa (semilla() elige por índice), y
     sale del orden del manifiesto. En las demás solo cuenta la pertenencia:
     se consultan con includes(). */
  const soloNombres = (f) => f[0];
  const ED_TITLE_FX  = FX.filter((f) => f[1].includes('T')).map(soloNombres);
  const ED_PHRASE_FX = FX.filter((f) => f[1].includes('F')).map(soloNombres);
  const ED_STRONG    = FX.filter((f) => f[4]).map(soloNombres);
  const ED_PHRASE_HYPE = FX.filter((f) => f[1].includes('F') && f[2] === 'h').map(soloNombres);
  const ED_PHRASE_CALM = FX.filter((f) => f[1].includes('F') && f[2] === 'c').map(soloNombres);
  const ED_LETTER_FX = {};
  for (const f of FX) if (f[3]) ED_LETTER_FX[f[0]] = f[3];

  const ED_CAMS = ['edcam-zin', 'edcam-zout', 'edcam-izq', 'edcam-der',
                   'edcam-giro', 'edcam-sube', 'edcam-baja', 'edcam-late',
                   'edcam-dolly',    // acercamiento con leve giro, muy cine
                   'edcam-tiembla',  // cámara en mano: micro-sacudidas
                   'edcam-vaiven',   // balanceo lateral suave
                   /* ── tanda 5 ── */
                   'edcam-empuja',   // empujón de cámara que frena en seco
                   'edcam-orbita',   // órbita 3D leve alrededor del texto
                   'edcam-inclina',  // ladea el plano y se endereza
                   'edcam-flota',    // deriva lenta, casi imperceptible
                   'edcam-aleja',    // se retira despacio (pull back)
                   'edcam-diagonal', // deriva en diagonal
                   /* ── tanda 7: cámaras VIVAS ──
                      Las de arriba hacen su recorrido y se asientan; a partir
                      de ahí el verso queda clavado hasta que se va. Estas no
                      se asientan nunca: siguen respirando todo el rato. */
                   'edcam-respira',  // se acerca y se aleja, muy poco
                   'edcam-deriva',   // deriva diagonal sin fin
                   'edcam-pendulo',  // se mece como colgado
                   'edcam-marea',    // sube y baja como una boya
                   'edcam-espiral',  // gira y se acerca a la vez
                   'edcam-zumbido',  // cámara en mano suave
                   'edcam-acecha',   // órbita 3D sin fin
                   'edcam-vertigo']; // el efecto Hitchcock, en pequeño
  const ED_TOPS = [42, 47, 55, 36, 58];

  const edLargo = (s) => s.replace(/[^\wáéíóúñ' ]/gi, '').length;

  /* ══════ FIRMA DEL ESTRIBILLO ══════
     Hasta ahora el efecto de cada verso salía de su ÍNDICE, así que el mismo
     estribillo se veía distinto cada vuelta. En un lyric video de verdad el
     gancho entra siempre con la misma pinta: eso es lo que hace que parezca
     hecho a propósito y no una tómbola.

     edCanon(i) devuelve el índice de la PRIMERA vez que aparece ese texto, y
     todas las semillas del render se calculan con él. Resultado: efecto,
     posición, inclinación y cámara idénticos en cada repetición. */
  let canonMapa = null, canonDe = null;
  const edCanon = (i) => {
    if (canonDe !== lastTrackKey || !canonMapa) {
      canonDe = lastTrackKey;
      canonMapa = new Map();
      const primero = new Map();
      for (let k = 0; k < parsedLines.length; k++) {
        const clave = ((parsedLines[k] && parsedLines[k].text) || '')
          .toLowerCase().replace(/[^\wáéíóúñ ]/gi, '').replace(/\s+/g, ' ').trim();
        if (!clave) { canonMapa.set(k, k); continue; }
        if (!primero.has(clave)) primero.set(clave, k);
        canonMapa.set(k, primero.get(clave));
      }
    }
    const c = canonMapa.get(i);
    return c === undefined ? i : c;
  };

  // Elige un efecto de la lista evitando repetir el de la línea anterior:
  // dos líneas seguidas con la misma animación matan la sensación de "edit".
  let edPrevFx = '';
  let edPrevCam = '';
  /* Laboratorio de efectos (⚗): cuando demoFx/demoCam están puestos, el motor
     usa exactamente ese efecto/cámara en vez del pseudo-azar. */
  let demoFx = null;
  let demoCam = '';
  /* Intensidad AUTOMÁTICA: la decide la propia canción, línea por línea.
     Dos señales, la segunda solo si existe:
       1. ritmo de la letra — palabras por segundo de esta línea (siempre
          disponible: sale de los tiempos del LRC). Un estribillo apretado
          pide golpe; un verso largo y espaciado pide calma.
       2. energía de graves — solo cuando hay audio real en el navegador
          (archivo local o ◈ sync); con Spotify Connect no lo hay y nos
          quedamos solo con el ritmo, que ya funciona bien.

     ED_STRONG NO sirve para clasificar frases (solo tiene títulos: marca
     qué efectos disparan flash/sacudida). Esta lista es solo para el
     filtro de intensidad y no cambia qué efectos dan golpe. */
  /* (ED_PHRASE_HYPE y ED_PHRASE_CALM salen del manifiesto, arriba.) */

  const esFuerte = (fx, lista) => lista === ED_PHRASE_FX
    ? ED_PHRASE_HYPE.includes(fx)
    : ED_STRONG.includes(fx);

  /* Energía de graves (0..1) del momento actual. Sin audio real devuelve
     null. Lo da el detector (js/beat.js), que sabe dónde están los graves
     de verdad: las "8 primeras bandas" del espectro de dibujo llegaban
     hasta 2.3 kHz, o sea que la voz contaba como grave. */
  const energiaGraves = () => {
    const M = window.BeatModule;
    if (!M || !M.get) return null;
    try {
      const m = M.get();
      if (m.fuente !== 'audio') return null;
      return Math.max(0, Math.min(1, m.graves * 0.7 + m.boom * m.boomFuerza * 0.5));
    } catch (_) { return null; }
  };

  /* Devuelve 'soft' | 'normal' | 'hype' para la línea i. */
  const intensidadAuto = (i) => {
    const cur = parsedLines[i];
    if (!cur) return 'normal';

    /* ── cadencia: cada cuánto se suceden las líneas ──
       Ojo: NO usar palabras por segundo. Eso confunde "línea larga" con
       "canción rápida" y deja los efectos suaves sin usar, porque las frases
       largas siempre puntúan alto. Lo que marca la intensidad es el ritmo
       al que van cayendo las líneas: 1.5s = estribillo apretado, 4.6s = balada. */
    let hueco = 3.2;
    for (let k = i + 1; k < parsedLines.length; k++) {
      if (parsedLines[k].time > cur.time) { hueco = parsedLines[k].time - cur.time; break; }
    }
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    let e = clamp((4.6 - hueco) / 3.1, 0, 1);

    // La carga de texto solo MATIZA. Con más peso se comía la banda central
    // y las canciones de ritmo medio nunca usaban los efectos suaves.
    const chars = (cur.text || '').trim().length;
    e = clamp(e + clamp((chars / Math.max(0.8, hueco) - 4) / 20, -0.12, 0.12), 0, 1);

    // ── graves, si los hay: mandan casi tanto como el ritmo ──
    const g = energiaGraves();
    if (g !== null) e = e * 0.55 + g * 0.45;

    // Banda central ancha a propósito: el ritmo medio (lo más común) usa el
    // repertorio COMPLETO, y los extremos solo saltan con cadencias claras.
    return e < 0.32 ? 'soft' : e > 0.68 ? 'hype' : 'normal';
  };

  const filtrarIntensidad = (lista, i) => {
    const modo = intensidadAuto(i);
    if (modo === 'normal') return lista;
    let elegida;
    if (modo === 'hype') {
      elegida = lista.filter(f => esFuerte(f, lista));
    } else if (lista === ED_PHRASE_FX) {
      // en «suave» preferimos las frases explícitamente tranquilas
      elegida = lista.filter(f => ED_PHRASE_CALM.includes(f));
    } else {
      elegida = lista.filter(f => !esFuerte(f, lista));
    }
    return elegida.length >= 3 ? elegida : lista;
  };

  const elegirFx = (listaOriginal, i, salt) => {
    const lista = filtrarIntensidad(listaOriginal, i);
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

  // Con «menos movimiento» los adornos de golpe se quedan fuera; el texto no.
  const calma = () => !!(window.MMSettings && window.MMSettings.reduceMotion());

  const edFlash = () => {
    if (calma()) return;
    const f = document.createElement('div');
    f.className = 'ed-flash';
    lyricsEdit.appendChild(f);
    setTimeout(() => f.remove(), 260);
  };

  // sacudida de todo el panel, para los efectos fuertes
  const edShake = () => {
    if (calma()) return;
    lyricsEdit.classList.remove('ed-sacudida');
    void lyricsEdit.offsetWidth;   // reinicia la animación
    lyricsEdit.classList.add('ed-sacudida');
  };

  // onda de choque: anillo que se expande desde el centro en los golpes
  const edRing = () => {
    if (calma()) return;
    const r = document.createElement('div');
    r.className = 'ed-ring';
    lyricsEdit.appendChild(r);
    setTimeout(() => r.remove(), 750);
  };

  // chispas pixel que salen disparadas del centro (estilo retro del player)
  const edSparks = (n = 12) => {
    if (calma()) return;
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
  /* ── ed-apila: el estilo de los edits de TikTok que pasó el usuario ──
     Las palabras se acumulan en filas de 2-3 SIN moverse: cada una asoma
     en gris y se asienta a su color. Las filas alternan acento-cursiva /
     blanco-recta. Nada de glow ni desplazamiento: lo que lo hace limpio
     es justamente que no se mueve nada. */
  const edApilaFilas = (words) => {
    const filas = [];
    let fila = [];
    words.forEach((w) => {
      fila.push(w);
      if (fila.length >= 3 || fila.join(' ').length >= 13) { filas.push(fila); fila = []; }
    });
    if (fila.length) filas.push(fila);
    return filas;
  };

  /* ══════ ed-trozos — captions por trozos ══════
     La técnica que hoy es el estándar de los lyric edits: en vez de soltar el
     verso entero de golpe, se enseña en trozos de 2-4 palabras que se
     sostienen y se relevan. El tamaño del trozo lo decide la LONGITUD, no el
     número de palabras: tres palabras largas ocupan lo que cinco cortas y
     desbordarían.

     Y dentro de cada trozo, la palabra más larga sale en el color de acento
     («keyword colour pop»): es lo que hace que el ojo enganche a la primera. */
  const edPartir = (words) => {
    const out = [];
    let k = 0;
    while (k < words.length) {
      const resto = words.length - k;
      let n = 3;
      const largo3 = words.slice(k, k + 3).join(' ').length;
      if (largo3 > 22) n = 2;
      else if (largo3 < 11) n = 4;
      n = Math.min(n, resto);
      // nunca dejar un trozo suelto de una sola palabra al final
      if (resto - n === 1) n = Math.min(resto, n + 1);
      out.push(words.slice(k, k + n));
      k += n;
    }
    return out;
  };

  const edTrozos = (stack, words, durMs) => {
    const trozos = edPartir(words);
    const H = lyricsEdit.clientHeight || 400;
    const W = lyricsEdit.clientWidth || 600;

    /* Cada trozo ocupa su turno dentro de lo que dura el verso. El sostén
       recomendado es de 600-900 ms; si la línea no da para tanto se reparte
       lo que haya, pero nunca por debajo de 260 ms o no da tiempo a leer. */
    const turno = Math.max(260, (durMs * 0.94) / trozos.length);
    const caja = document.createElement('div');
    caja.className = 'ed-trozos';
    // altura fija: los trozos se apilan en la misma posición, no en cascada
    caja.style.setProperty('--turno', Math.round(turno) + 'ms');

    trozos.forEach((tr, k) => {
      const texto = tr.join(' ');
      const div = document.createElement('div');
      div.className = 'ed-trozo';
      // se escala por el trozo MÁS LARGO de todos para que no bailen de tamaño
      div.style.setProperty('--d', Math.round(k * turno) + 'ms');
      const idxClave = tr.reduce((mx, w, j) => (edLargo(w) > edLargo(tr[mx]) ? j : mx), 0);
      tr.forEach((w, j) => {
        const s = document.createElement('span');
        s.className = 'ed-pal' + (tr.length > 1 && j === idxClave ? ' ed-clave' : '');
        s.textContent = w;
        div.appendChild(s);
      });
      div.dataset.txt = texto;
      caja.appendChild(div);
    });

    // tamaño según el trozo más ancho: alto y estable, estilo cartel
    const masAncho = trozos.reduce((mx, t) => Math.max(mx, t.join(' ').length), 1);
    let fs = Math.min((W * 0.88) / (masAncho * 0.54), H * 0.30);
    caja.style.fontSize = Math.max(22, fs).toFixed(1) + 'px';
    stack.appendChild(caja);
  };

  const edApila = (stack, words, durMs) => {
    const filas = edApilaFilas(words);
    const bloque = document.createElement('div');
    bloque.className = 'ed-apila';

    // que el bloque entero quepa: limita por ancho de la fila más larga
    // y por alto según cuántas filas hay
    const H = lyricsEdit.clientHeight || 400;
    const W = lyricsEdit.clientWidth || 600;
    const masLarga = filas.reduce((mx, f) => Math.max(mx, f.join(' ').length), 1);
    let fs = Math.min((W * 0.92) / (masLarga * 0.6), (H * 0.8) / (filas.length * 1.25));
    fs = Math.max(18, Math.min(fs, H * 0.2));
    bloque.style.fontSize = fs.toFixed(1) + 'px';

    const paso = Math.min(420, Math.max(110, (durMs * 0.62) / Math.max(1, words.length)));
    let delay = 60;
    filas.forEach((fila, r) => {
      const div = document.createElement('div');
      div.className = 'ed-apila-fila ' + (r % 2 === 0 ? 'acento' : 'claro');
      fila.forEach((w) => {
        const s = document.createElement('span');
        s.className = 'ed-pal';
        s.textContent = w;
        s.style.setProperty('--d', Math.round(delay) + 'ms');
        delay += paso;
        div.appendChild(s);
      });
      bloque.appendChild(div);
    });
    stack.appendChild(bloque);
  };

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
        /* El ♪ pega con el BOMBO, no con el nivel medio de graves: aquello
           era un globo hinchándose y deshinchándose. Las barras del
           espectro sí siguen con getBands, que es lo suavizado y bonito. */
        const M = window.BeatModule;
        const m = M && M.get ? M.get() : null;
        const graves = m ? m.graves : (bands[0] + bands[1] + bands[2]) / 3;
        const golpe = m ? m.boom * m.boomFuerza : 0;
        nota.style.transform = `scale(${(1 + graves * 0.12 + golpe * 0.28).toFixed(3)})`;
        raf = requestAnimationFrame(paso);
      };
      raf = requestAnimationFrame(paso);
    }
  };

  // salidas variadas: la línea anterior no siempre se va igual (más "edit")
  /* Salidas. Eran 3 contra 105 entradas: cada verso se despedía casi siempre
     igual, y la despedida se ve tanto como la llegada. */
  const ED_SALIDAS = ['colapsa', 'colapsa-sube', 'colapsa-glitch',
                      /* ── tanda 7 ── */
                      'sal-baja',      // se hunde con desenfoque
                      'sal-derrite',   // se escurre aplastándose
                      'sal-persiana',  // se cierra por lamas
                      'sal-gira',      // voltea sobre su eje y se va
                      'sal-aspira',    // absorbida hacia el centro
                      'sal-barre',     // un barrido se la lleva
                      'sal-rompe',     // se quiebra en diagonal
                      'sal-desenfoca', // solo pierde el foco, la más elegante
                      'sal-estira',    // se estira a lo ancho hasta nada
                      'sal-cae',       // cae con peso, girando
                      'sal-tv',        // apagado de CRT: a una raya y a un punto
                      'sal-lateral',   // se escapa de lado
                      'sal-flash',     // corte seco con destello
                      'sal-encoge'];   // se va hacia dentro

  const renderEdit = (i) => {
    /* TODAS las semillas del render usan el índice canónico, no el de la
       línea: así un estribillo repetido sale idéntico cada vuelta. */
    const ci = edCanon(i);

    // la línea anterior colapsa con una salida elegida por línea
    // (.ed-fondo del invertido vive fuera del stack: se despide igual)
    lyricsEdit.querySelectorAll('.ed-stack, .ed-fondo').forEach(v => {
      if (v.dataset.out) v.remove();
      else {
        v.dataset.out = '1';
        v.classList.add(ED_SALIDAS[semilla(ci, 61, ED_SALIDAS.length)]);
        setTimeout(() => v.remove(), 500);
      }
    });
    lyricsEdit.querySelectorAll('.lyrics-empty').forEach(v => v.remove());

    const text = ((parsedLines[i] && parsedLines[i].text) || '').trim() || '♪';
    const words = text.split(/\s+/).filter(Boolean);
    const durMs = duracionLinea(i) * 1000;

    const stack = document.createElement('div');
    stack.className = 'ed-stack ' + elegirCam(ci);
    stack.style.setProperty('--top', ED_TOPS[semilla(ci, 7, ED_TOPS.length)] + '%');
    stack.style.setProperty('--tilt', (semilla(ci, 11, 7) - 3) + 'deg');
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
        || (words.length <= 5 && lenTxt <= 30 && semilla(ci, 41, 10) < 7)
        || (words.length <= 7 && lenTxt <= 44 && semilla(ci, 41, 10) < 4));

    if (caps) {
      /* TÍTULO GIGANTE */
      const fx = elegirFx(ED_TITLE_FX, ci, 3);

      if (fx === 'ed-apila') { edApila(stack, words, durMs); return; }

      if (fx === 'ed-lockup') {
        /* montaje propio: mini fila + palabra ENORME + mini fila */
        edLockup(stack, words);
        if (ED_STRONG.includes(fx)) { edFlash(); edShake(); edRing(); edSparks(); }
        return;
      }

      if (fx === 'ed-deletreo') {
        /* cada letra GIGANTE en secuencia rápida, y al final la palabra entera */
        const H = lyricsEdit.clientHeight;
        const letras = [...text.replace(/\s+/g, '').toUpperCase()].slice(0, 12);
        const pasoL = Math.min(170, Math.max(80, 1300 / letras.length));
        const fsL = Math.min(lyricsEdit.clientWidth * 0.5, H * 0.5);
        letras.forEach((ch) => {
          const d = document.createElement('div');
          d.className = 'ed-letrona';
          d.textContent = ch;
          d.style.fontSize = fsL.toFixed(0) + 'px';
          d.style.setProperty('--d', Math.round(delay) + 'ms');
          delay += pasoL;
          stack.appendChild(d);
        });
        delay += 120;
        const filasD = edFilas(words);
        const tamsD = edTamanos(filasD);
        filasD.forEach((fila, r) => {
          const div = document.createElement('div');
          div.className = 'ed-titulo ed-golpe';
          div.textContent = fila.toUpperCase();
          div.style.fontSize = tamsD[r].toFixed(1) + 'px';
          div.style.setProperty('--d', Math.round(delay) + 'ms');
          delay += 110;
          stack.appendChild(div);
        });
        return;
      }

      if (fx === 'ed-diagonal') {
        /* filas de esquina a esquina: arriba-izquierda → abajo-derecha */
        const filasD = words.length <= 4 ? words.slice() : edFilas(words);
        const tamsD = edTamanos(filasD);
        filasD.forEach((fila, r) => {
          const div = document.createElement('div');
          div.className = 'ed-titulo ed-diagonal';
          div.textContent = fila.toUpperCase();
          div.style.fontSize = tamsD[r].toFixed(1) + 'px';
          const t = filasD.length === 1 ? 0.5 : r / (filasD.length - 1);
          div.style.textAlign = t < 0.34 ? 'left' : t > 0.66 ? 'right' : 'center';
          div.style.setProperty('--sx', t < 0.5 ? -1 : 1);
          div.style.setProperty('--d', Math.round(delay) + 'ms');
          delay += 140;
          stack.appendChild(div);
        });
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
            if (fx === 'ed-esquinas') {
              // cada letra llega desde una de las 4 esquinas de la pantalla
              const h = semilla(edLargo(fila) * 11 + Math.round(delay), 31, 4096);
              const cx = (h % 2 ? 1 : -1) * (5 + (h % 30) / 10);
              const cy = ((h >> 1) % 2 ? 1 : -1) * (3 + ((h >> 3) % 20) / 10);
              s.style.setProperty('--cx', cx.toFixed(1) + 'em');
              s.style.setProperty('--cy', cy.toFixed(1) + 'em');
            }
            delay += paso;
            div.appendChild(s);
          });
        } else {
          div.textContent = fila.toUpperCase();
          div.classList.add(fx);
          // Copia del texto para los fx que pintan capas con ::before/::after
          // (ed-rebana parte el texto en dos, ed-mascara barre por encima).
          div.dataset.txt = fila.toUpperCase();
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
      if (fx === 'ed-marco') {
        // corchetes de esquina que se dibujan alrededor del título
        ['tl', 'tr', 'bl', 'br'].forEach((p, k) => {
          const e = document.createElement('span');
          e.className = 'ed-marco-esq ' + p;
          e.style.setProperty('--d', (150 + k * 90) + 'ms');
          stack.appendChild(e);
        });
      }
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
      let fx = elegirFx(ED_PHRASE_FX, ci, 19);

      if (fx === 'ed-apila') { edApila(stack, words, durMs); return; }
      if (fx === 'ed-trozos') {
        // por debajo de 4 palabras no hay nada que trocear: se rendiría a un
        // solo trozo, que es exactamente la frase entera de siempre
        if (words.length >= 4) { edTrozos(stack, words, durMs); return; }
        fx = 'ed-zoomsuave';
      }

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
        idxCursiva = semilla(ci, 29, words.length);
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
      // la frase-bloque golpea el suelo: flash + sacudida del panel
      if (fx === 'ed-impacto') { edFlash(); edShake(); }
    }
  };

  /* ── alternar lista ↔ edit ── */
  const applyMode = () => {
    /* Ni lista ni edit cuando manda una escena de las que van por fuera:
       el reposo (sin canción) o la escena NCS (canción sin letra). */
    const fuera = idleOn || ncsOn;
    lyricsBody.hidden = fuera || editMode;
    lyricsEdit.hidden = fuera || !editMode;
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

  // Búsqueda binaria: antes se recorrían TODAS las líneas en cada frame.
  const buscarIdx = (t) => {
    let lo = 0, hi = parsedLines.length - 1, r = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (parsedLines[m].time <= t) { r = m; lo = m + 1; } else { hi = m - 1; }
    }
    return r;
  };

  /* Cambio de línea INCREMENTAL. Antes esto recorría la lista entera
     quitando y poniendo clases en cada verso, o sea que cada línea nueva
     invalidaba el estilo de toda la letra. Ahora, en la reproducción normal,
     se tocan exactamente dos nodos: el que sale y el que entra. */
  const cambiarLinea = (prev, idx) => {
    if (prev >= 0 && lineNodes[prev]) {
      lineNodes[prev].classList.remove('active');
      restoreLine(lineNodes[prev], prev);
    }
    if (idx > prev) {
      for (let i = Math.max(0, prev); i < idx; i++) {
        if (lineNodes[i]) lineNodes[i].classList.add('past');
      }
    } else {
      // el usuario saltó atrás: lo que ya no es pasado vuelve a su sitio
      for (let i = idx + 1; i <= prev && i < lineNodes.length; i++) {
        if (!lineNodes[i]) continue;
        lineNodes[i].classList.remove('past', 'active');
        restoreLine(lineNodes[i], i);
      }
    }

    const active = idx >= 0 ? lineNodes[idx] : null;
    if (!active) return;
    active.classList.remove('past');
    active.classList.add('active');
    decorateLine(active, idx);

    if (userScrolledRecently) return;
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
    lyricsBody.scrollTo({ top: Math.max(0, targetTop), left: 0, behavior: 'smooth' });
  };

  /* ---- Karaoke: la línea activa se va tiñendo palabra a palabra ----
     El LRC solo trae el arranque de cada verso, así que el reparto va por
     longitud (letras + 1 por palabra), que es la aproximación estándar y se
     ve clavada. La palabra que suena AHORA lleva .cantando; las ya cantadas,
     .sung. Solo se tocan clases, nunca se reconstruye el DOM. */
  // reparto por longitud: lo comparten la vista lista y el modo edit
  const repartir = (els) => {
    if (!els.length) return [];
    const pesos = new Array(els.length);
    let total = 0;
    for (let i = 0; i < els.length; i++) {
      const p = (els[i].textContent || '').trim().length + 1;
      pesos[i] = p;
      total += p;
    }
    const out = new Array(els.length);
    let acc = 0;
    for (let i = 0; i < els.length; i++) {
      out[i] = { el: els[i], s: acc / total };
      acc += pesos[i];
    }
    return out;
  };

  const prepararKaraoke = (ln) =>
    repartir(Array.prototype.slice.call(ln.querySelectorAll('.w')));

  let kIdx = -1, kSpans = null, kNext = 0;
  const karaokeReset = () => {
    if (kSpans) {
      for (let i = 0; i < kSpans.length; i++) kSpans[i].el.classList.remove('sung', 'cantando');
    }
    kNext = 0;
  };
  const karaoke = (t, idx) => {
    if (idx < 0 || !lineNodes[idx]) { kIdx = -1; kSpans = null; return; }
    const ln = lineNodes[idx];
    if (kIdx !== idx) { kIdx = idx; kSpans = null; kNext = 0; }
    if (!kSpans) {
      // _kw puede ser [] (línea sin palabras): también vale como caché, así
      // que se comprueba la referencia, no la longitud — si no, se volvería a
      // consultar el DOM en cada frame.
      const cache = ln._kw;
      kSpans = (cache && (!cache.length || cache[0].el.isConnected))
        ? cache
        : (ln._kw = prepararKaraoke(ln));
    }
    if (!kSpans.length) return;

    const ini = parsedLines[idx].time;
    // 0.88: el verso se termina de cantar algo antes de que entre el siguiente
    const p = (t - ini) / (duracionLinea(idx) * 0.88);
    if (p < 0) return;
    if (kNext && p < kSpans[kNext - 1].s) karaokeReset();   // saltó hacia atrás

    if (kNext >= kSpans.length) return;
    let cambio = false;
    while (kNext < kSpans.length && p >= kSpans[kNext].s) {
      kSpans[kNext].el.classList.add('sung');
      kNext++;
      cambio = true;
    }
    if (!cambio) return;
    for (let i = 0; i < kSpans.length; i++) {
      kSpans[i].el.classList.toggle('cantando', i === kNext - 1);
    }
  };

  /* ══════ KARAOKE EN MODO EDIT ══════
     La técnica que hoy es estándar en los lyric edits: la palabra que suena
     se enciende, las que faltan quedan apagadas. El modo edit tenía el
     revelado de entrada (todas las palabras salen escalonadas nada más
     empezar la línea) pero NADA que siguiera la voz durante el verso.

     Aquí solo se tocan `color` y `text-shadow`. Ni transform, ni animation,
     ni opacity: esos tres canales son de los 52 efectos de entrada, y
     pisarlos corta la animación de la palabra a medias. Misma lección que en
     la vista lista.

     No se engancha dentro de renderEdit a propósito: esa función tiene cinco
     salidas tempranas (instrumental, apila, lockup, deletreo, diagonal).
     Buscando el stack vivo desde fuera, TODOS los montajes reciben karaoke
     sin tocar ninguna de sus ramas. */
  const karaokeEdit = (t, idx) => {
    if (idx < 0 || !parsedLines[idx]) return;
    const stack = lyricsEdit.querySelector('.ed-stack:not([data-out])');
    if (!stack) return;
    // ed-trozos ya lleva su propio ritmo: los trozos SON la sincronía, y
    // teñir por dentro solo restaría claridad al trozo que está en pantalla
    if (stack.querySelector('.ed-trozos')) return;

    if (stack._kIdx !== idx) { stack._kIdx = idx; stack._kw = null; stack._kn = 0; }
    if (!stack._kw) {
      // palabras si las hay; si no (título gigante), filas enteras
      let els = Array.prototype.slice.call(stack.querySelectorAll('.ed-pal'));
      if (!els.length) els = Array.prototype.slice.call(stack.querySelectorAll('.ed-titulo'));
      // fuera los separadores en blanco que mete el tecleo de ed-maquina
      els = els.filter((e) => (e.textContent || '').trim());
      stack._kw = repartir(els);
      if (stack._kw.length > 1) stack.classList.add('ed-kara');
    }
    const ks = stack._kw;
    // con una sola palabra/fila no hay karaoke que valga: se queda encendida
    if (ks.length < 2) return;

    const p = (t - parsedLines[idx].time) / (duracionLinea(idx) * 0.88);
    if (p < 0) return;
    if (stack._kn && p < ks[stack._kn - 1].s) {
      for (let i = 0; i < ks.length; i++) ks[i].el.classList.remove('sung', 'cantando');
      stack._kn = 0;
    }
    if (stack._kn >= ks.length) return;

    let cambio = false;
    while (stack._kn < ks.length && p >= ks[stack._kn].s) {
      ks[stack._kn].el.classList.add('sung');
      stack._kn++;
      cambio = true;
    }
    if (!cambio) return;
    for (let i = 0; i < ks.length; i++) {
      ks[i].el.classList.toggle('cantando', i === stack._kn - 1);
    }
  };

  // ---- Contador de los huecos instrumentales ----
  let gapUltimo = -1;
  const interludio = (t, idx) => {
    const g = gapMap.get(idx);
    if (gapAct && gapAct !== g) {
      gapAct.classList.remove('on');
      gapAct = null;
      gapUltimo = -1;
    }
    if (!g) return;
    const sig = parsedLines[idx + 1];
    if (!sig) return;
    const ini = (idx < 0 ? 0 : parsedLines[idx].time) + (idx < 0 ? 0 : GAP_LEAD);
    if (t < ini || t >= sig.time) {
      if (gapAct === g) { g.classList.remove('on'); gapAct = null; gapUltimo = -1; }
      return;
    }
    const p = (t - ini) / Math.max(0.1, sig.time - ini);
    if (gapAct !== g) { g.classList.add('on'); gapAct = g; }
    // redondeo a centésimas: recorta ~60 escrituras de estilo por segundo a las que de verdad cambian
    const q = Math.round(p * 100);
    if (q !== gapUltimo) {
      gapUltimo = q;
      g.style.setProperty('--gp', q / 100);
    }
  };

  const tick = (currentTime) => {
    if (labOpen) return;   // el lab manda: la canción no pisa la demo
    if (!parsedLines.length || parsedLines[0].time < 0) return;
    // Apply user-adjustable offset: positive = letras se adelantan
    const t = currentTime + offset;
    const idx = buscarIdx(t);
    const modoEdit = editMode || forceEdit;

    if (idx !== activeIdx) {
      const prev = activeIdx;
      activeIdx = idx;
      /* MODO EDIT: solo la línea actual, gigante y con efectos
         (forceEdit = el modo cine lo activa sin tocar la preferencia) */
      if (modoEdit) {
        if (idx >= 0) renderEdit(idx);
        else lyricsEdit.querySelectorAll('.ed-stack, .ed-fondo').forEach(v => {
          v.dataset.out = '1';
          v.classList.add('colapsa');
          setTimeout(() => v.remove(), 500);
        });
      } else {
        cambiarLinea(prev, idx);
      }
    }

    // Cada frame: el teñido palabra a palabra, en la vista que toque.
    if (modoEdit) {
      karaokeEdit(t, idx);
    } else {
      karaoke(t, idx);
      interludio(t, idx);
    }
  };

  // ---- 60fps auto-tick from rAF loop, reading audio.currentTime directly.
  // This replaces the slow 4Hz 'timeupdate' polling and removes the
  // up-to-250ms perceived delay.
  const startLoop = () => {
    const loop = () => {
      requestAnimationFrame(loop);
      if (document.hidden) return;   // en segundo plano no hay nada que pintar
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
    // ajustes → datos → limpiar caché (localStorage ya lo borra settings.js;
    // esto tira además la copia que este módulo tiene en memoria)
    clearCache: () => { cache = {}; },
    // Estado de sincronización (lo consume el modo cine)
    getSync: () => ({ lines: parsedLines, idx: activeIdx }),
    isEditMode: () => editMode,
    // ¿está puesta la escena de canción sin letra? (la consulta el cine)
    sinLetra: () => ncsOn,
    /* Reparte otra vez el hidden de las dos vistas. Existe para que el cine
       no tenga que re-deducir la regla al cerrarse: la condición (reposo,
       escena NCS, modo elegido) vive en un solo sitio. */
    refreshMode: () => applyMode(),
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
