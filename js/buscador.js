/* ==========================================================
   BUSCADOR UNIVERSAL — Ctrl+K · un cuadro para todo.

   POR QUÉ EXISTE. Para poner una canción había que: elegir pestaña, esperar
   a que cargara, teclear, y encima acertar de antemano en QUÉ sitio estaba
   (¿en mi música? ¿en una playlist? ¿en Spotify?). Cinco decisiones antes de
   oír nada. Y para volver a algo que sonó ayer no había forma: el historial
   no se guardaba.

   Aquí no hay que elegir sitio. Se escribe y salen a la vez:
     · tu música importada          (al instante, está en memoria)
     · tus playlists, discos y artistas guardados
     · tu historial de escuchas     (lo que Spotify borra a los 50 temas)
     · el catálogo de Spotify       (con un respiro, para no freír la API)
     · y los MANDOS de la app       («aleatorio», «modo cine», «vaciar cola»…)

   Enter pone lo elegido. Shift+Enter lo encola sin cortar lo que suena.

   NO ES UNA COPIA DE NADA: Spotify no tiene esto. Es la idea del paleta de
   comandos de un editor de código, aplicada a la música.

   DÓNDE VIVE. Colgado del <body>, nunca dentro de .window: en este proyecto
   ya se ha mordido cinco veces la misma trampa — un `position: fixed` dentro
   de un ancestro con `transform` se ancla AL ANCESTRO, no a la pantalla
   (ver el menú «dónde suena» de js/spotify.js).
   ========================================================== */
(() => {
  'use strict';

  const PC = () => window.PlayerCore;
  const SP = () => window.SpotifyModule;
  const LIB = () => window.LibraryModule;
  const conSpotify = () => !!(SP() && SP().isLoggedIn());

  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const formatTime = (s) => {
    if (!isFinite(s) || s <= 0) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const estado = (msg) => { if (window.SevenStatus) window.SevenStatus(msg); };

  /* ---------- Puntuación ----------
     Sin tildes y sin mayúsculas: quien busca «corazon» espera encontrar
     «Corazón». Y por palabras sueltas, para que «beatles yesterday» valga
     aunque el artista y el título estén en campos distintos. */
  /* El rango va escrito con \u a propósito: son los signos diacríticos
     sueltos que deja NFD (la tilde de «ó» como carácter aparte). Puestos
     literales serían tres bytes invisibles en el código que cualquier editor
     puede tragarse sin que se note hasta que «corazon» deje de encontrar
     «Corazón». */
  const plano = (s) => String(s || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const puntuar = (texto, q) => {
    const t = plano(texto);
    if (!t || !q) return 0;
    if (t === q) return 1000;
    const i = t.indexOf(q);
    if (i === 0) return 700;
    if (i > 0) {
      // empezar una PALABRA vale casi tanto como empezar la frase
      const antes = t[i - 1];
      return /[\s\-–—·,.:;(/[]/.test(antes) ? 500 : Math.max(120, 260 - i);
    }
    /* Último recurso: las letras en orden aunque no seguidas («dpcto» →
       «Despacito»). Puntúa bajo a propósito: es una coincidencia débil y no
       debe adelantar a una de verdad. */
    let j = 0;
    for (let k = 0; k < t.length && j < q.length; k++) if (t[k] === q[j]) j++;
    return j === q.length ? 60 : 0;
  };

  /* Todas las palabras de la consulta tienen que aparecer en ALGÚN campo; si
     una no está, la fila se descarta entera. Es lo que evita que buscar
     «bad bunny monaco» devuelva medio catálogo por culpa de «bad». */
  const puntuarCampos = (campos, palabras) => {
    let total = 0;
    for (const p of palabras) {
      let mejor = 0;
      for (const [txt, peso] of campos) {
        const v = puntuar(txt, p) * peso;
        if (v > mejor) mejor = v;
      }
      if (!mejor) return 0;
      total += mejor;
    }
    return total / palabras.length;
  };

  const puntuarPista = (t, palabras) => puntuarCampos(
    [[t.name, 1], [t.artist, 0.82], [t.album || '', 0.55]], palabras);

  // ---------- El cuadro ----------
  let caja = null, entrada = null, lista = null, raiz = null, pie = null;
  let abierto = false;
  let filas = [];          // lo que se ve ahora, en orden
  let elegida = 0;
  let seq = 0;             // cancela búsquedas de Spotify que llegan tarde
  let temporizador = null;
  let resSpotify = [];     // última tanda de Spotify, ya puntuada
  let consultaSpotify = '';

  const construir = () => {
    if (raiz) return;
    raiz = document.createElement('div');
    raiz.className = 'paleta';
    raiz.hidden = true;
    raiz.innerHTML = `
      <div class="paleta-fondo"></div>
      <div class="paleta-caja" role="dialog" aria-modal="true" aria-label="Buscar en todo">
        <div class="paleta-fila">
          <span class="paleta-prompt" aria-hidden="true">⌕</span>
          <input class="paleta-input" type="text" autocomplete="off" spellcheck="false"
                 aria-label="Buscar" placeholder="canción, artista, lista o un mando…" />
          <button class="paleta-x" title="Cerrar (Esc)" aria-label="Cerrar">✕</button>
        </div>
        <ul class="paleta-lista" role="listbox"></ul>
        <div class="paleta-pie">
          <span><kbd>↑↓</kbd> moverse</span>
          <span><kbd>enter</kbd> poner</span>
          <span><kbd>shift</kbd>+<kbd>enter</kbd> a continuación</span>
          <span><kbd>esc</kbd> cerrar</span>
        </div>
      </div>`;
    document.body.appendChild(raiz);
    caja = raiz.querySelector('.paleta-caja');
    entrada = raiz.querySelector('.paleta-input');
    lista = raiz.querySelector('.paleta-lista');
    pie = raiz.querySelector('.paleta-pie');

    raiz.querySelector('.paleta-fondo').addEventListener('click', cerrar);
    raiz.querySelector('.paleta-x').addEventListener('click', cerrar);
    entrada.addEventListener('input', alTeclear);
    /* El teclado se escucha en la CAJA, no solo en el cuadro de texto: si no,
       en cuanto el foco pasa a la ✕ (con el tabulador) dejaban de funcionar
       las flechas, el enter y hasta el escape. */
    caja.addEventListener('keydown', alTecla);
    lista.addEventListener('click', (e) => {
      const li = e.target.closest('.paleta-fila-r');
      if (!li) return;
      const i = parseInt(li.dataset.i, 10);
      if (!isFinite(i)) return;
      lanzar(filas[i], !!e.target.closest('.paleta-mas'));
    });
    // Mover el ratón resalta, para que el clic caiga donde se ve
    lista.addEventListener('pointermove', (e) => {
      const li = e.target.closest('.paleta-fila-r');
      if (!li) return;
      const i = parseInt(li.dataset.i, 10);
      if (i !== elegida) { elegida = i; pintarElegida(); }
    });
  };

  /* ---------- Los mandos ----------
     Se declaran con `hacer` perezoso: al montarse el módulo puede que
     PlayerCore todavía no esté, y guardar la referencia ahora la dejaría
     congelada en `undefined` para toda la sesión. */
  const irPestania = (n) => {
    const t = document.querySelector(`.tab[data-tab="${n}"]`);
    if (t) t.click();
  };

  const verColeccion = (col, nombre) => {
    irPestania('library');
    if (LIB() && LIB().irA) LIB().irA(col);
    estado('▣ ' + nombre);
  };

  const MANDOS = () => [
    { n: 'reproducir / pausa', alias: 'play pause parar', ico: '⏯',
      hacer: () => PC() && PC().togglePlay() },
    { n: 'canción siguiente', alias: 'next saltar', ico: '⏭', hacer: () => PC() && PC().next() },
    { n: 'canción anterior', alias: 'prev atras volver', ico: '⏮', hacer: () => PC() && PC().prev() },
    { n: 'aleatorio', alias: 'shuffle mezclar random', ico: '⤨',
      hacer: () => {
        const st = PC() && PC().state;
        if (!st) return;
        PC().setShuffle(!st.shuffle);
        estado(st.shuffle ? '▣ aleatorio activado' : '▣ aleatorio desactivado');
      } },
    { n: 'repetir', alias: 'repeat bucle loop', ico: '⟳',
      hacer: () => {
        const st = PC() && PC().state;
        if (!st) return;
        const sig = { off: 'all', all: 'one', one: 'off' }[st.repeat];
        PC().setRepeat(sig);
        estado('▣ repetir: ' + { off: 'no', all: 'toda la lista', one: 'esta canción' }[sig]);
      } },
    { n: 'modo cine', alias: 'pantalla completa fullscreen letra grande', ico: '⛶',
      hacer: () => { const b = document.getElementById('cinemaBtn'); if (b) b.click(); } },
    { n: 'modo edit (letra animada)', alias: 'efectos tiktok', ico: '✦',
      hacer: () => { const b = document.getElementById('lyricsModeBtn'); if (b) b.click(); } },
    { n: 'silenciar', alias: 'mute volumen cero', ico: '🔇',
      hacer: () => {
        const st = PC() && PC().state;
        if (!st) return;
        PC().setVolume(st.volume > 0 ? 0 : 0.7);
      } },
    { n: 'importar música', alias: 'añadir mp3 archivos abrir carpeta local', ico: '＋',
      hacer: () => { const i = document.getElementById('fileInput'); if (i) i.click(); } },
    { n: 'vaciar la cola', alias: 'limpiar borrar a continuación', ico: '✕',
      hacer: () => {
        if (PC() && PC().clearQueue) PC().clearQueue();
        if (window.SevenQueueRefresh) window.SevenQueueRefresh();
        estado('▣ cola vaciada');
      } },
    { n: 'ver mi música', alias: 'biblioteca local importada mp3', ico: '♪',
      hacer: () => verColeccion('mine', 'tu música') },
    { n: 'ver mis playlists', alias: 'listas spotify', ico: '≡',
      hacer: () => verColeccion('playlists', 'tus playlists') },
    { n: 'ver mis canciones guardadas', alias: 'me gusta favoritas liked', ico: '♥',
      hacer: () => verColeccion('saved', 'tus guardadas') },
    { n: 'ver mis álbumes', alias: 'discos', ico: '◙',
      hacer: () => verColeccion('albums', 'tus álbumes') },
    { n: 'ver mis artistas', alias: 'seguidos', ico: '◍',
      hacer: () => verColeccion('artists', 'tus artistas') },
    { n: 'ver la cola', alias: 'a continuación qué suena después', ico: '≣',
      hacer: () => irPestania('queue') },
    { n: 'ver mi historial', alias: 'estadisticas mas escuchadas stats', ico: '▤',
      hacer: () => irPestania('stats') },
    { n: 'ver la letra', alias: 'lyrics', ico: '♫', hacer: () => irPestania('lyrics') },
    { n: 'ajustes', alias: 'configuracion opciones colores tipografia', ico: '⚙',
      hacer: () => irPestania('settings') },
    { n: conSpotify() ? 'desconectar spotify' : 'conectar spotify', alias: 'cuenta sesion login', ico: '◈',
      hacer: () => SP() && SP().connect() },
  ];

  // ---------- Historial, cacheado por sesión ----------
  let histCache = null, histT = 0;
  const HIST_TTL = 60000;

  const cargarHistorial = async () => {
    if (!window.Historial) return [];
    if (histCache && Date.now() - histT < HIST_TTL) return histCache;
    try {
      const brutas = await window.Historial.leer(0);
      // El ranking ya viene sin repetidas y ordenado por veces reproducida
      histCache = window.Historial.ranking(brutas, 'key', 300);
      histT = Date.now();
    } catch (e) {
      console.warn('[buscador] no se pudo leer el historial:', e && e.message);
      histCache = [];
    }
    return histCache;
  };

  // ---------- Convertir cada cosa en una fila ----------
  const deMando = (m, pts) => ({
    seccion: 'mandos', ico: m.ico, titulo: m.n, sub: '', pts,
    pista: 'ejecutar', accion: m.hacer,
  });

  const deLocal = (t, pts) => ({
    seccion: 'tu música', ico: '♪', cover: t.cover, titulo: t.name,
    sub: t.artist || 'desconocido', extra: formatTime(t.duration), pts,
    pista: '▶ poner',
    accion: () => {
      if (!PC()) return;
      PC().playTrackById(t.id, null, { nombre: 'tu música' });
    },
    encolar: () => {
      if (!PC() || !PC().enqueueById) return;
      PC().enqueueById(t.id, true);
      if (window.SevenQueueRefresh) window.SevenQueueRefresh();
    },
  });

  const deSpotify = (t, pts) => ({
    seccion: 'spotify', ico: '♪', cover: t.cover, titulo: t.name,
    sub: t.artist + (t.album ? ' · ' + t.album : ''), extra: formatTime(t.duration), pts,
    pista: '▶ poner',
    accion: () => SP() && SP().playTrack(t),
    encolar: () => SP() && SP().queue(t.uri, t.name),
  });

  /* Una lista tiene DOS cosas que querer: verla o ponerla. Enter la abre y
     shift+enter la pone entera — el mismo par que en las canciones (poner /
     encolar), con su propio botón y su propia etiqueta. Poner una playlist
     pasa así de «pestaña, chip, esperar, buscarla, pulsar» a dos teclas. */
  const deListaSpotify = (p, pts, tipo) => ({
    seccion: 'tus listas', ico: tipo === 'artist' ? '◍' : tipo === 'album' ? '◙' : '≡',
    cover: p.cover, redonda: tipo === 'artist', titulo: p.name,
    sub: p.owner || (p.total ? p.total + ' canciones' : tipo), pts,
    pista: 'abrir',
    accion: () => {
      irPestania('library');
      if (LIB() && LIB().abrir) LIB().abrir(tipo, p);
    },
    masIco: '▶',
    masTit: tipo === 'artist' ? 'Reproducir a este artista' : 'Reproducir la lista entera',
    cierraAlEncolar: true,
    encolar: () => { if (LIB() && LIB().playAll) LIB().playAll(p); },
  });

  const deCatalogo = (it, pts, tipo) => ({
    seccion: 'spotify', ico: tipo === 'artist' ? '◍' : '◙',
    cover: it.cover, redonda: tipo === 'artist', titulo: it.name,
    sub: it.artist || (tipo === 'artist' ? 'artista' : 'álbum'), pts,
    pista: 'abrir',
    accion: () => {
      irPestania('library');
      if (LIB() && LIB().abrir) LIB().abrir(tipo, it);
    },
  });

  const deHistorial = (h, pts) => ({
    seccion: 'ya lo has oído', ico: '↺', cover: h.cover, titulo: h.name,
    sub: (h.artist || '') + ' · ' + (h.veces === 1 ? '1 vez' : h.veces + ' veces'), pts,
    pista: h.uri ? '▶ poner' : 'sin enlace',
    accion: () => {
      if (h.uri && conSpotify()) {
        SP().playTrack({ uri: h.uri, name: h.name, artist: h.artist, cover: h.cover, spotify: true });
        return;
      }
      // Sin uri (o sin sesión) puede seguir estando entre tu música
      const st = PC() && PC().state;
      const local = st && st.tracks.find((t) =>
        plano(t.name) === plano(h.name) && plano(t.artist) === plano(h.artist));
      if (local) { PC().playTrackById(local.id, null, { nombre: 'tu música' }); return; }
      estado('✕ esa canción ya no está a mano — busca su nombre en spotify');
    },
    encolar: h.uri ? () => SP() && SP().queue(h.uri, h.name) : null,
  });

  // ---------- Reunir todo ----------
  const recoger = async (q) => {
    const palabras = q.split(/\s+/).filter(Boolean);
    const out = [];

    // 1) MANDOS — solo si se escribe algo; con el cuadro vacío van al final
    if (palabras.length) {
      MANDOS().forEach((m) => {
        const pts = puntuarCampos([[m.n, 1], [m.alias || '', 0.7]], palabras);
        if (pts) out.push(deMando(m, pts + 40));   // +40: un mando exacto manda
      });
    }

    // 2) TU MÚSICA — instantánea, ya está en memoria
    const st = PC() && PC().state;
    if (st && st.tracks.length) {
      st.tracks.forEach((t) => {
        const pts = palabras.length ? puntuarPista(t, palabras) : 0;
        if (pts) out.push(deLocal(t, pts + 30));   // lo tuyo antes que lo de fuera
      });
    }

    // 3) TUS LISTAS — lo que la biblioteca ya tenga cargado
    if (palabras.length && LIB() && LIB().coleccion) {
      const cols = [['playlists', 'playlist'], ['albums', 'album'], ['artists', 'artist']];
      cols.forEach(([col, tipo]) => {
        LIB().coleccion(col).forEach((p) => {
          const pts = puntuarCampos([[p.name, 1], [p.owner || '', 0.6]], palabras);
          if (pts) out.push(deListaSpotify(p, pts + 20, tipo));
        });
      });
      // Las guardadas son canciones, no listas
      LIB().coleccion('saved').forEach((t) => {
        const pts = puntuarPista(t, palabras);
        if (pts) out.push(deSpotify(t, pts + 15));
      });
    }

    // 4) HISTORIAL
    const hist = await cargarHistorial();
    if (palabras.length) {
      hist.forEach((h) => {
        const pts = puntuarCampos([[h.name, 1], [h.artist || '', 0.8]], palabras);
        if (pts) out.push(deHistorial(h, pts + 10));
      });
    }

    // 5) SPOTIFY — lo que trajo la última búsqueda con respiro
    if (palabras.length && consultaSpotify === q) out.push(...resSpotify);

    /* Sin nada escrito: lo último que oíste y los mandos. Es lo que uno
       quiere el 90% de las veces al abrir esto — repetir algo de ayer. */
    if (!palabras.length) {
      hist.slice(0, 6).forEach((h, i) => out.push(deHistorial(h, 1000 - i)));
      MANDOS().slice(0, 6).forEach((m, i) => out.push(deMando(m, 500 - i)));
    }

    // Fuera repetidas: la misma canción puede venir de tu música y del historial
    const vistas = new Set();
    const unicas = [];
    out.sort((a, b) => b.pts - a.pts);
    for (const f of out) {
      const clave = f.seccion === 'mandos' ? 'm:' + f.titulo
        : plano(f.titulo) + '|' + plano(f.sub).slice(0, 40);
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      unicas.push(f);
      if (unicas.length >= 40) break;
    }
    return unicas;
  };

  // ---------- Spotify, con respiro ----------
  const buscarSpotify = async (q, mia) => {
    if (!conSpotify() || q.length < 2) { resSpotify = []; return; }
    try {
      /* Tres tipos en UNA petición. `limit` bajo a propósito: desde feb-2026
         Spotify rechaza limits altos a las apps en modo desarrollo, y además
         aquí lo que hace falta son los mejores de cada clase, no cien. */
      const d = await SP().api('/search?type=track,artist,album&limit=5&q=' + encodeURIComponent(q));
      if (mia !== seq) return;
      const palabras = q.split(/\s+/).filter(Boolean);
      const nuevas = [];

      ((d && d.tracks && d.tracks.items) || []).filter(Boolean).forEach((it) => {
        const t = {
          id: 'sp:' + it.id, uri: it.uri, name: it.name,
          artist: (it.artists || []).map((a) => a.name).join(', '),
          artistId: ((it.artists || [])[0] || {}).id || null,
          album: it.album ? it.album.name : '',
          duration: (it.duration_ms || 0) / 1000,
          cover: it.album && it.album.images && it.album.images[0] ? it.album.images[0].url : null,
          preview: it.preview_url || null, spotify: true,
        };
        nuevas.push(deSpotify(t, puntuarPista(t, palabras) || 100));
      });

      ((d && d.artists && d.artists.items) || []).filter(Boolean).forEach((a) => {
        const it = {
          id: a.id, uri: a.uri, name: a.name,
          artist: (a.genres || []).slice(0, 2).join(' · ') || 'artista',
          cover: (a.images && a.images[0]) ? a.images[0].url : null,
          owner: '', total: 0, spotify: true, tipo: 'artist',
        };
        nuevas.push(deCatalogo(it, (puntuar(a.name, plano(q)) || 90) * 0.95, 'artist'));
      });

      ((d && d.albums && d.albums.items) || []).filter(Boolean).forEach((a) => {
        const it = {
          id: a.id, uri: a.uri, name: a.name,
          artist: (a.artists || []).map((x) => x.name).join(', '),
          owner: (a.artists || []).map((x) => x.name).join(', '),
          total: a.total_tracks || 0, anio: (a.release_date || '').slice(0, 4),
          cover: (a.images && a.images[0]) ? a.images[0].url : null,
          spotify: true, tipo: 'album',
        };
        nuevas.push(deCatalogo(it, (puntuar(a.name, plano(q)) || 85) * 0.9, 'album'));
      });

      resSpotify = nuevas;
      consultaSpotify = q;
    } catch (e) {
      if (mia !== seq) return;
      resSpotify = [];
      consultaSpotify = q;
      const msg = (e && e.message) || '';
      if (/429/.test(msg)) estado('▣ spotify pidió esperar un momento');
      else if (/401|No token/.test(msg)) estado('✕ tu sesión de spotify caducó');
      else console.warn('[buscador] spotify:', msg);
    }
  };

  // ---------- Pintado ----------
  const filaHTML = (f, i) => `
    <li class="paleta-fila-r${i === elegida ? ' sel' : ''}" data-i="${i}" role="option"
        aria-selected="${i === elegida ? 'true' : 'false'}">
      <span class="paleta-ico${f.redonda ? ' redonda' : ''}"
        ${f.cover ? `style="background-image:url('${escapeHtml(f.cover)}')"` : ''}>${f.cover ? '' : (f.ico || '·')}</span>
      <span class="paleta-txt">
        <span class="paleta-tit">${escapeHtml(f.titulo)}</span>
        ${f.sub ? `<span class="paleta-sub">${escapeHtml(f.sub)}</span>` : ''}
      </span>
      ${f.extra ? `<span class="paleta-dur">${escapeHtml(f.extra)}</span>` : ''}
      ${f.encolar ? `<button class="paleta-mas" title="${escapeHtml(f.masTit || 'A continuación (shift+enter)')}" tabindex="-1">${f.masIco || '＋'}</button>` : ''}
      <span class="paleta-pista">${escapeHtml(f.pista || '')}</span>
    </li>`;

  const pintar = () => {
    if (!lista) return;
    if (!filas.length) {
      const q = entrada.value.trim();
      lista.innerHTML = `<li class="paleta-vacio">▒ nada para «${escapeHtml(q)}» ▒<br>
        <span class="paleta-tip">${conSpotify()
          ? 'prueba con menos palabras, o solo con el artista'
          : 'conecta spotify en <b>config ⚙</b> para buscar en su catálogo'}</span></li>`;
      return;
    }
    let html = '';
    let seccion = null;
    filas.forEach((f, i) => {
      if (f.seccion !== seccion) {
        seccion = f.seccion;
        html += `<li class="paleta-seccion" role="presentation">${escapeHtml(seccion)}</li>`;
      }
      html += filaHTML(f, i);
    });
    lista.innerHTML = html;
    verLaElegida();
  };

  const pintarElegida = () => {
    if (!lista) return;
    lista.querySelectorAll('.paleta-fila-r').forEach((li) => {
      const on = parseInt(li.dataset.i, 10) === elegida;
      li.classList.toggle('sel', on);
      li.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    verLaElegida();
  };

  const verLaElegida = () => {
    const li = lista && lista.querySelector('.paleta-fila-r.sel');
    if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
  };

  /* ---------- Ciclo de búsqueda ----------
     Recoger es asíncrono (el historial vive en IndexedDB), así que mientras
     una búsqueda está en marcha puede llegar otra. La primera versión de
     esto llevaba un cerrojo `if (recogiendo) return;` y ESTABA AL REVÉS:
     descartaba la búsqueda NUEVA y dejaba en pantalla el resultado de la
     vieja. Al abrir el cuadro y teclear enseguida —que es lo normal— la
     lista se quedaba con lo de la consulta vacía y no encontraba nada.

     Lo correcto es lo contrario, y es lo que ya hacen el buscador de
     spotify.js y lyrics.js: que corran las dos y gane la ÚLTIMA. */
  let seqRecoger = 0;

  const refrescar = async () => {
    const mia = ++seqRecoger;
    const q = plano(entrada.value);
    const nuevas = await recoger(q);
    if (mia !== seqRecoger) return;         // llegó otra mientras tanto
    // Mantener elegida la misma fila si sigue existiendo
    const antes = filas[elegida];
    filas = nuevas;
    const mismo = antes ? filas.findIndex((f) => f.titulo === antes.titulo && f.seccion === antes.seccion) : -1;
    elegida = mismo >= 0 ? mismo : 0;
    pintar();
  };

  const alTeclear = () => {
    const q = plano(entrada.value);
    clearTimeout(temporizador);
    refrescar();                       // lo tuyo, al instante
    const mia = ++seq;
    /* Spotify va con 320 ms de respiro. Sin él, teclear «bad bunny» son diez
       peticiones y el 429 llega en dos búsquedas: ese freno ya costó caro
       una vez (ver el comentario del 429 en js/spotify.js). */
    temporizador = setTimeout(async () => {
      await buscarSpotify(q, mia);
      if (mia === seq && abierto) refrescar();
    }, 320);
  };

  const lanzar = (f, encolarla) => {
    if (!f) return;
    if (encolarla && f.encolar) {
      /* Encolar una canción NO cierra el cuadro: casi siempre se encolan
         varias seguidas. Poner una lista entera sí, porque después de eso ya
         no queda nada que buscar. */
      if (f.cierraAlEncolar) cerrar();
      f.encolar();
      estado((f.masIco === '▶' ? '▶ ' : '＋ a continuación: ') + f.titulo);
      return;
    }
    cerrar();
    try { f.accion(); } catch (e) { console.warn('[buscador]', e); }
    if (f.seccion !== 'mandos') estado('▸ ' + f.titulo);
  };

  const mover = (d) => {
    if (!filas.length) return;
    elegida = (elegida + d + filas.length) % filas.length;
    pintarElegida();
  };

  const alTecla = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
    else if (e.key === 'PageDown') { e.preventDefault(); mover(6); }
    else if (e.key === 'PageUp') { e.preventDefault(); mover(-6); }
    else if (e.key === 'Home' && !entrada.value) { e.preventDefault(); elegida = 0; pintarElegida(); }
    else if (e.key === 'Enter') { e.preventDefault(); lanzar(filas[elegida], e.shiftKey); }
    else if (e.key === 'Tab') {
      /* Cepo de foco. Es un diálogo modal (`aria-modal`) y solo tiene dos
         cosas enfocables —el cuadro de texto y la ✕—, así que el tabulador
         va de una a otra y nunca se escapa a la página de detrás, que está
         tapada y no se puede usar. Aquí hubo un momento un atajo que hacía
         que Tab encolara: se quitó porque secuestrar el tabulador deja sin
         salida a quien navega con teclado, y para encolar ya están
         shift+enter y el botón ＋. */
      e.preventDefault();
      const x = raiz.querySelector('.paleta-x');
      (document.activeElement === entrada ? x : entrada).focus();
    } else if (e.key === 'Escape') {
      /* Se para aquí: si no, el mismo Escape saldría del modo cine o cerraría
         otro panel por debajo, y cerrar el buscador acabaría cerrando dos
         cosas de una vez. */
      e.preventDefault();
      e.stopPropagation();
      if (entrada.value) { entrada.value = ''; alTeclear(); }
      else cerrar();
    }
  };

  // ---------- Abrir y cerrar ----------
  const abrir = (textoInicial) => {
    construir();
    if (abierto) { entrada.focus(); entrada.select(); return; }
    abierto = true;
    raiz.hidden = false;
    document.body.classList.add('paleta-abierta');
    entrada.value = textoInicial || '';
    elegida = 0;
    resSpotify = [];
    consultaSpotify = '';
    /* Que tus listas se puedan buscar aunque nunca hayas abierto la pestaña.
       Es una petición, y solo la primera vez. */
    if (LIB() && LIB().precargar) LIB().precargar('playlists');
    refrescar();
    // El foco después de pintar: en móvil, enfocar antes abre el teclado
    // encima de una lista todavía vacía y da un salto feo.
    setTimeout(() => { entrada.focus(); entrada.select(); }, 0);
    if (textoInicial) alTeclear();
  };

  const cerrar = () => {
    if (!abierto) return;
    abierto = false;
    seq++;                       // lo que llegue tarde de Spotify ya no vale
    clearTimeout(temporizador);
    raiz.hidden = true;
    document.body.classList.remove('paleta-abierta');
    entrada.blur();
  };

  const alternar = () => { if (abierto) cerrar(); else abrir(); };

  // ---------- Cómo se llega aquí ----------
  document.addEventListener('keydown', (e) => {
    // Ctrl+K / ⌘K funciona SIEMPRE, hasta escribiendo en otro cuadro
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      alternar();
      return;
    }
    if (abierto) return;
    const enCuadro = e.target && (e.target.tagName === 'INPUT' || e.target.isContentEditable);
    if (enCuadro) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    /* La barra abre el buscador escribiendo ya. Antes «/» saltaba a la
       pestaña de Spotify, que es la mitad de sitios donde puede estar lo que
       buscas. */
    if (e.key === '/') { e.preventDefault(); abrir(); }
  }, true);

  /* El pestillo `_wired` es la costumbre de la casa (wireSearch, cablearLike,
     cablearChipDev…) y aquí hacía falta de verdad: este cableado puede correr
     DOS veces —el DOMContentLoaded no siempre llega una sola vez, y spotify.js
     lleva años arrancando por dos caminos por lo mismo—. Con dos oyentes en el
     botón, `alternar()` se ejecutaba dos veces por clic: abría el buscador y
     lo cerraba en el mismo gesto, así que el botón parecía muerto.
     Lo pilló la prueba de humo (assets/prueba-humo.mjs). */
  const cablearBoton = () => {
    const btn = document.getElementById('paletaBtn');
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', () => alternar());
  };
  document.addEventListener('DOMContentLoaded', cablearBoton);
  if (document.readyState !== 'loading') cablearBoton();

  window.Buscador = { abrir, cerrar, alternar, abierto: () => abierto };
})();
