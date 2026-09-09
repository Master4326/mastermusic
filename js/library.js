/* ==========================================================
   Biblioteca de Spotify — playlists, guardadas, recientes, top
   Usa SpotifyModule.api (mismo token PKCE). Sin estado propio
   en disco: todo se cachea en memoria hasta pulsar ⟳.
   ========================================================== */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const formatTime = (s) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const setStatus = (msg) => { if (window.SevenStatus) window.SevenStatus(msg); };

  // ---------- Colecciones ----------
  // path: endpoint base | paged: admite offset | scope: permiso que puede faltar
  const COLS = {
    playlists: { title: 'mis playlists', path: '/me/playlists',            paged: true,  kind: 'playlist' },
    saved:     { title: 'guardadas',     path: '/me/tracks',               paged: true,  kind: 'track' },
    recent:    { title: 'recientes',     path: '/me/player/recently-played', paged: false, kind: 'track',
                 scope: 'user-read-recently-played' },
    top:       { title: 'top canciones', path: '/me/top/tracks',           paged: true,  kind: 'track',
                 scope: 'user-top-read' },
    /* Álbumes y artistas: la app llevaba desde siempre sin poder abrir ni
       uno. Los dos endpoints están vivos y sin usar.
       OJO con `/me/following`: NO devuelve `{items}` como los demás, sino
       `{artists:{items,cursors}}`, y va por cursor en vez de offset. Por eso
       lleva `dentro` y `cursor`. */
    albums:    { title: 'álbumes',       path: '/me/albums',               paged: true,  kind: 'album' },
    artists:   { title: 'artistas',      path: '/me/following?type=artist', paged: false, kind: 'artist',
                 dentro: 'artists', scope: 'user-follow-read' },
  };

  // rows / next(offset) / total por colección; null = aún no cargada
  const cache = {};
  const view = {
    col: 'playlists',   // colección activa
    detail: null,       // { id, uri, name, sub, rows, next, total } si estamos dentro de una playlist
    loading: false,
  };

  // ---------- Peticiones ----------
  // Desde feb-2026 algunos endpoints rechazan limits altos en apps en
  // development mode ("Invalid limit"); reintentamos con uno más chico.
  const LIMITS = [50, 20, 10];

  const getPage = async (base, offset, paged) => {
    let lastErr = null;
    for (const limit of LIMITS) {
      const sep = base.includes('?') ? '&' : '?';
      const qs = `limit=${limit}` + (paged ? `&offset=${offset || 0}` : '');
      try {
        return await window.SpotifyModule.api(base + sep + qs);
      } catch (e) {
        lastErr = e;
        if (!/Spotify API 400/.test(e.message || '')) throw e;   // 400 = limit; otro error sube
      }
    }
    throw lastErr;
  };

  const mapTrack = (it) => ({
    id: it.id ? 'sp:' + it.id : null,
    uri: it.uri || null,
    name: it.name || '(sin título)',
    artist: (it.artists || []).map(a => a.name).filter(Boolean).join(', '),
    // Para «sigue sonando»: de aquí saca spotify.js los géneros del artista
    artistId: ((it.artists || [])[0] || {}).id || null,
    album: it.album ? it.album.name : '',
    duration: (it.duration_ms || 0) / 1000,
    cover: it.album && it.album.images && it.album.images[0] ? it.album.images[0].url : null,
    preview: it.preview_url || null,
    spotify: true,
    // Sin URI no hay forma de pedirle a Spotify que la reproduzca
    // (archivos locales de la playlist, pistas retiradas del catálogo).
    unplayable: !it.uri,
  });

  /* Cada endpoint envuelve las pistas distinto: /me/tracks y recently-played
     dan { track }, /me/top/tracks las da sueltas, y **las playlists ahora dan
     { item }** — en feb-2026 Spotify renombró `/playlists/{id}/tracks` a
     `/playlists/{id}/items` y de paso, dentro, `track` pasó a llamarse `item`.
     Se aceptan las dos formas: la vieja sigue llegando por los otros
     endpoints, que no cambiaron.

     Ojo: { track: null } (pista retirada del catálogo) debe dar null y no el
     envoltorio; por eso se comprueba la CLAVE, no que el valor sea truthy. */
  const unwrap = (it) => {
    if (!it || typeof it !== 'object') return it;
    if ('item' in it) return it.item;
    if ('track' in it) return it.track;
    /* NO se desenvuelve `album` aquí a propósito: una PISTA también trae su
       `.album`, así que hacerlo devolvería el disco en vez de la canción.
       Los de /me/albums se mapean aparte, en loadCol. */
    return it;
  };

  // Convierte los ítems crudos en filas y de paso cuenta lo que se descarta,
  // para poder decir POR QUÉ una playlist llena aparece vacía.
  const sift = (items) => {
    const stats = { recibidos: items.length, nulos: 0, episodios: 0, sinUri: 0 };
    const rows = [];
    items.forEach((raw) => {
      const t = unwrap(raw);
      if (!t) { stats.nulos++; return; }
      if (t.type === 'episode') { stats.episodios++; return; }
      const row = mapTrack(t);
      if (row.unplayable) stats.sinUri++;
      rows.push(row);
    });
    if (items.length && !rows.length) {
      console.warn('[Biblioteca] llegaron ítems pero ninguno es pista:', stats, items[0]);
    }
    return { rows, stats };
  };

  /* Lo que se le dice al usuario cuando una playlist no lista.

     Antes salían CUATRO líneas hablándole de «restricción a las apps en modo
     desarrollo», del «objeto playlist» y de que «/tracks está bloqueado». A
     quien abre una playlist para oír música eso no le dice nada y encima
     parece que la app está rota. El motivo técnico sigue estando, pero donde
     le toca: en la consola (los console.warn de fetchTracksPage) y en el
     diagnóstico, que ahora solo sale en local.

     Una línea, y debajo el botón que SÍ funciona. */
  const statsMsg = (s) => {
    /* Antes decía «spotify no deja ver la lista desde aquí», y era mentira:
       lo que pasaba es que la app pedía `/playlists/{id}/tracks`, retirado en
       feb-2026. Con `/items` las playlists propias listan. Si aun así no llega
       nada, lo normal es que sea una de las que hace Spotify. */
    if (!s || !s.recibidos) return 'esta playlist no devolvió ninguna canción<br>'
      + '<span style="opacity:.7">si la hizo spotify (daily mix, radio, descubrimiento…) no deja abrirla desde otras apps</span>';
    // Llegaron ítems pero ninguno era una canción: episodios de podcast,
    // pistas retiradas del catálogo o archivos locales de la playlist.
    if (s.episodios && s.episodios >= s.recibidos - s.nulos) return 'aquí solo hay episodios de podcast';
    return 'ninguna de estas canciones se puede reproducir';
  };

  /* El diagnóstico es una herramienta de desarrollo: prueba seis variantes de
     la misma petición y escupe códigos HTTP. Igual que el ⚗ del laboratorio,
     no tiene por qué salirle a nadie en la web publicada. */
  /* …y en la web publicada solo si se pide a propósito con `?diag` en la URL.
     Escondiéndolo del todo se perdía la única forma de ver POR QUÉ falla una
     playlist sin abrir la consola, que es justo lo que hace falta cuando el
     usuario dice «no salen las canciones» y uno no tiene su cuenta delante. */
  const enLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    || location.protocol === 'file:'
    || /[?&]diag\b/.test(location.search);

  const botonesDeRescate = () =>
    '<br><button class="retro-btn small" id="libPlayQueue" style="margin-top:10px">'
    + '<span class="bracket">[</span> ▶ reproducir y ver canciones <span class="bracket">]</span></button>'
    + (enLocal
        ? ' <button class="retro-btn small" id="libDiag" style="margin-top:10px">'
          + '<span class="bracket">[</span> ⚙ diagnóstico <span class="bracket">]</span></button>'
        : '');

  const mapAlbum = (a) => ({
    id: a.id,
    uri: a.uri,
    name: a.name || '(sin título)',
    owner: (a.artists || []).map((x) => x.name).filter(Boolean).join(', '),
    total: a.total_tracks || ((a.tracks && a.tracks.total) || 0),
    cover: (a.images && a.images[0]) ? a.images[0].url : null,
    anio: (a.release_date || '').slice(0, 4),
  });

  const mapArtist = (a) => ({
    id: a.id,
    uri: a.uri,
    name: a.name || '(sin nombre)',
    // Los géneros son lo que mejor describe a un artista de un vistazo
    owner: (a.genres || []).slice(0, 2).join(' · '),
    total: 0,
    cover: (a.images && a.images[0]) ? a.images[0].url : null,
  });

  const mapPlaylist = (p) => ({
    id: p.id,
    uri: p.uri,
    name: p.name,
    owner: (p.owner && (p.owner.display_name || p.owner.id)) || '',
    /* `items` desde feb-2026, `tracks` antes. Leer solo el viejo era lo que
       dejaba el «0 de 0 canciones» en la cabecera de cada playlist. */
    total: ((p.items || p.tracks) || {}).total || 0,
    cover: (p.images && p.images[0]) ? p.images[0].url : null,
  });

  // ---------- Render ----------
  const list = () => $('libList');

  const empty = (msg) => `<li class="sp-empty" style="line-height:1.6">▒ ${msg} ▒</li>`;

  // Esqueletos mientras llega la respuesta: dan idea de la forma que viene
  const skeletons = (n) => Array.from({ length: n }, () => `
    <li class="skel">
      <div class="skel-box"></div>
      <div class="skel-lines"><div class="skel-line"></div><div class="skel-line short"></div></div>
    </li>`).join('');

  const rowTrack = (t, i) => `
    <li class="sp-result${t.unplayable ? ' sp-unplayable' : ''}" data-idx="${i}"
        ${t.unplayable ? 'title="Spotify no da una URI para esta pista (archivo local o retirada del catálogo)"' : ''}>
      <span class="sp-idx">${String(i + 1).padStart(2, '0')}</span>
      <div class="sp-thumb" ${t.cover ? `style="background-image:url('${t.cover}')"` : ''}>${t.cover ? '' : '♪'}</div>
      <div class="sp-meta">
        <div class="sp-name">${escapeHtml(t.name)}</div>
        <div class="sp-artist">${escapeHtml(t.artist)}${t.unplayable ? ' · no disponible' : ''}</div>
      </div>
      <div class="sp-dur">${formatTime(t.duration)}</div>
      ${t.unplayable ? '<span class="sp-dur">✕</span>'
        : `<button class="sp-queue" title="Añadir a la cola">＋</button>
           <button class="sp-play" title="Reproducir ahora">▶</button>`}
    </li>`;

  // Las playlists van en rejilla de portadas, como la biblioteca de Spotify
  const rowPlaylist = (p, i) => `
    <li class="lib-card" data-idx="${i}" title="${escapeHtml(p.name)}">
      <div class="lib-card-art" ${p.cover ? `style="background-image:url('${p.cover}')"` : ''}>
        ${p.cover ? '' : '<span class="lib-card-ph">≡</span>'}
        <button class="lib-card-play sp-play" title="Reproducir">▶</button>
      </div>
      <div class="lib-card-name">${escapeHtml(p.name)}</div>
      <div class="lib-card-sub">${p.total} ${p.total === 1 ? 'canción' : 'canciones'}${p.owner ? ' · ' + escapeHtml(p.owner) : ''}</div>
    </li>`;

  /* Álbum y artista usan la MISMA tarjeta que las playlists: es la misma
     forma (portada cuadrada, nombre, subtítulo) y así la rejilla no cambia.
     Solo cambian el marcador de posición y el subtítulo. */
  const rowAlbum = (a, i) => `
    <li class="lib-card" data-idx="${i}" title="${escapeHtml(a.name)}">
      <div class="lib-card-art" ${a.cover ? `style="background-image:url('${a.cover}')"` : ''}>
        ${a.cover ? '' : '<span class="lib-card-ph">◙</span>'}
        <button class="lib-card-play sp-play" title="Reproducir el álbum">▶</button>
      </div>
      <div class="lib-card-name">${escapeHtml(a.name)}</div>
      <div class="lib-card-sub">${escapeHtml(a.owner)}${a.anio ? ' · ' + a.anio : ''}</div>
    </li>`;

  const rowArtist = (a, i) => `
    <li class="lib-card lib-card-redonda" data-idx="${i}" title="${escapeHtml(a.name)}">
      <div class="lib-card-art" ${a.cover ? `style="background-image:url('${a.cover}')"` : ''}>
        ${a.cover ? '' : '<span class="lib-card-ph">◍</span>'}
        <button class="lib-card-play sp-play" title="Reproducir a este artista">▶</button>
      </div>
      <div class="lib-card-name">${escapeHtml(a.name)}</div>
      <div class="lib-card-sub">${escapeHtml(a.owner || 'artista')}</div>
    </li>`;

  const ETIQUETA = { playlist: 'playlist', album: 'álbum', artist: 'artista' };

  const paintHead = () => {
    const head = $('libHead');
    if (!head) return;
    head.hidden = !view.detail;
    if (!view.detail) return;
    head.querySelector('.lib-head-title').textContent = view.detail.name;
    head.querySelector('.lib-head-sub').textContent = view.detail.sub;
    const kind = head.querySelector('.lib-head-kind');
    const tipo = ETIQUETA[view.detail.tipo || 'playlist'] || 'playlist';
    if (kind) kind.textContent = view.detail.owner ? tipo + ' · ' + view.detail.owner : tipo;
    const cover = $('libHeadCover');
    if (cover) {
      cover.style.backgroundImage = view.detail.cover ? `url('${view.detail.cover}')` : '';
      cover.textContent = view.detail.cover ? '' : '♪';
    }
  };

  const paintChips = () => {
    document.querySelectorAll('.lib-chip').forEach(c => {
      c.classList.toggle('active', !view.detail && c.dataset.col === view.col);
    });
  };

  const paintMore = () => {
    const btn = $('libMore');
    if (!btn) return;
    const src = view.detail || cache[view.col];
    const has = !!(src && src.next !== null && src.next !== undefined);
    btn.hidden = !has;
    btn.textContent = view.loading ? '· cargando ·' : '[ cargar más ]';
    btn.disabled = view.loading;
  };

  const paint = () => {
    const ul = list();
    if (!ul) return;
    paintChips();
    paintHead();

    // Rejilla de portadas para lo que tiene carátula cuadrada; el resto, filas
    const enRejilla = (k) => k === 'playlist' || k === 'album' || k === 'artist';
    // Dentro de un ARTISTA se enseñan sus discos: también rejilla
    const detalleEnRejilla = !!view.detail && view.detail.tipo === 'artist';
    const esRejilla = detalleEnRejilla
      || (!view.detail && enRejilla(COLS[view.col].kind)
          && !!(cache[view.col] && cache[view.col].rows && cache[view.col].rows.length));
    ul.classList.toggle('as-grid', esRejilla);

    if (view.detail) {
      ul.innerHTML = view.detail.rows.length
        ? (view.detail.tipo === 'artist'
            ? view.detail.rows.map(rowAlbum).join('')
            : view.detail.rows.map(rowTrack).join(''))
        : empty(view.detail.tipo === 'artist'
            ? 'este artista no devolvió discos'
            : statsMsg(view.detail.stats) + botonesDeRescate());
    } else {
      const c = cache[view.col];
      const k = COLS[view.col].kind;
      if (!c) {
        // aún cargando: rejilla o filas, según lo que vaya a llegar
        ul.classList.toggle('as-grid', enRejilla(k));
        ul.innerHTML = skeletons(enRejilla(k) ? 8 : 6);
      } else if (c.error) {
        ul.innerHTML = empty(c.error);
      } else if (!c.rows.length) {
        ul.innerHTML = empty('nada por aquí todavía');
      } else {
        ul.innerHTML = (k === 'playlist' ? c.rows.map(rowPlaylist)
          : k === 'album' ? c.rows.map(rowAlbum)
          : k === 'artist' ? c.rows.map(rowArtist)
          : c.rows.map(rowTrack)).join('');
      }
    }
    paintMore();
  };

  // Traduce un fallo de la API a un mensaje que el usuario pueda accionar.
  const errorMsg = (e, col) => {
    const msg = (e && e.message) || '';
    if (/No token/.test(msg) || /Spotify API 401/.test(msg)) {
      try { window.PlayerCore.setSpotifyConnected(false); } catch (_) {}
      return 'tu sesión de spotify caducó — pulsa <b>[ conectar spotify ]</b> en config ⚙';
    }
    if (/Spotify API 403/.test(msg)) {
      const scope = col && COLS[col] && COLS[col].scope;
      return scope
        ? 'esta sección necesita un permiso nuevo (<b>' + scope + '</b>):<br>'
          + 'desconecta y vuelve a conectar spotify en config ⚙'
        : 'spotify no autorizó esta petición' + detailOf(msg);
    }
    if (/Spotify API 404/.test(msg)) {
      // Sin detailOf: aquí la API solo dice "Resource not found", que no
      // añade nada y alarga un mensaje que ya explica la causa real.
      return 'esta playlist la hace spotify (descubrimiento semanal, daily mix, radio…)<br>'
        + 'y no deja abrirlas desde otras apps';
    }
    if (/Spotify API 429/.test(msg)) {
      // el freno de spotify.js mete los segundos que faltan en el mensaje
      // Era `(d+)`: sin la barra, buscaba letras «d» literales y NUNCA sacaba
      // los segundos, así que el aviso salía siempre sin el dato que importa.
      const seg = (msg.match(/espera (\d+)s/) || [])[1];
      return 'spotify pidió esperar: demasiadas peticiones'
        + (seg ? '<br>vuelve a intentarlo en <b>' + seg + ' s</b>' : '<br>espera un momento y pulsa ⟳');
    }
    console.error('[Biblioteca] fallo:', msg);
    return 'no se pudo cargar (¿sin conexión?)' + detailOf(msg);
  };

  // Saca el texto que manda la propia API para no esconder el motivo real.
  const detailOf = (msg) => {
    const m = String(msg || '').match(/Spotify API \d+:\s*([\s\S]*)$/);
    if (!m || !m[1]) return '';
    let detail = '';
    try { detail = JSON.parse(m[1]).error.message || ''; } catch (_) { detail = m[1].slice(0, 140); }
    return detail ? '<br><b>' + escapeHtml(detail) + '</b>' : '';
  };

  // ---------- Carga ----------
  const loadCollection = async (col, more) => {
    if (view.loading) return;
    const def = COLS[col];
    if (!def) return;
    const prev = cache[col];
    if (more && (!prev || prev.next == null)) return;

    view.loading = true;
    paintMore();
    try {
      const bruto = await getPage(def.path, more ? prev.next : 0, def.paged);
      // `/me/following` mete lo suyo dentro de `artists`; el resto va plano
      const data = (def.dentro && bruto && bruto[def.dentro]) ? bruto[def.dentro] : bruto;
      const items = (data && data.items) || [];
      const rows = def.kind === 'playlist'
        ? items.filter(Boolean).map(mapPlaylist)
        : def.kind === 'album'
          // cada disco viene envuelto en { added_at, album }
          ? items.map((x) => (x && x.album) ? x.album : x).filter(Boolean).map(mapAlbum)
          : def.kind === 'artist'
            ? items.filter(Boolean).map(mapArtist)
            : sift(items).rows;

      const base = (more && prev) ? prev.rows : [];
      const offset = (more ? prev.next : 0) + items.length;
      cache[col] = {
        rows: base.concat(rows),
        total: (data && data.total) || 0,
        // recently-played usa cursores, no offset: una sola página
        next: (def.paged && data && data.next) ? offset : null,
        error: null,
      };
    } catch (e) {
      cache[col] = { rows: (more && prev) ? prev.rows : [], total: 0, next: null, error: errorMsg(e, col) };
    } finally {
      view.loading = false;
      if (view.col === col && !view.detail) paint();
      else paintMore();
    }
  };

  // El objeto playlist entero suele seguir trayendo sus pistas (las primeras
  // 100, sin paginar) aunque la lista no dé ninguna. Aquí también cambió el
  // nombre: `tracks` → `items` (feb-2026).
  const viaObjetoPlaylist = async (id) => {
    const d = await window.SpotifyModule.api(`/playlists/${id}`);
    const t = (d && (d.items || d.tracks)) || {};
    return { items: t.items || [], total: t.total || 0, more: false, via: 'playlist' };
  };

  /* LA CAUSA DE «spotify no deja ver la lista de esta playlist desde aquí»:
     no era una restricción del modo desarrollo, era que **el endpoint ya no
     existe**. En feb-2026 Spotify renombró `/playlists/{id}/tracks` a
     `/playlists/{id}/items` (y con él, `track` → `item` dentro de cada
     entrada, y `tracks` → `items` en el objeto playlist). Pedirle a Spotify
     un endpoint retirado no da un error que se entienda: da 403/404, o un 200
     con la lista vacía. La app lo leyó como «no me dejan» y enseñó eso.

     El respaldo por el objeto playlist se queda igualmente: cubre el caso de
     una lista vacía sin error, que antes no disparaba nada porque solo se
     probaba dentro del `catch`. */
  const fetchTracksPage = async (id, offset) => {
    let porTracks = null;
    try {
      const d = await getPage(`/playlists/${id}/items`, offset, true);
      porTracks = { items: (d && d.items) || [], total: (d && d.total) || 0,
                    more: !!(d && d.next), via: 'items' };
      // con pistas, o pidiendo una página siguiente, no hay nada que rescatar
      if (porTracks.items.length || offset > 0) return porTracks;
      console.warn('[Biblioteca] /items respondió 200 con la lista vacía; probando el objeto playlist');
    } catch (e) {
      if (offset > 0 || !/Spotify API 40[34]/.test(e.message || '')) throw e;
      console.warn('[Biblioteca] /items falló, probando el objeto playlist:', e.message);
    }
    try {
      const alt = await viaObjetoPlaylist(id);
      if (alt.items.length) return alt;
    } catch (e) {
      console.warn('[Biblioteca] el objeto playlist tampoco:', e.message);
      if (!porTracks) throw e;      // sin nada que enseñar, que hable el error
    }
    return porTracks || { items: [], total: 0, more: false, via: 'items' };
  };

  const openPlaylist = async (p, more) => {
    if (view.loading) return;
    if (!more) {
      view.detail = { id: p.id, uri: p.uri, name: p.name, cover: p.cover || null, owner: p.owner || '',
                      sub: '· cargando ·', rows: [], next: 0, total: p.total, cargando: true };
      paint();
      const ul0 = list();
      if (ul0) ul0.innerHTML = skeletons(6);
    }
    const d = view.detail;
    if (!d || d.next == null) return;

    view.loading = true;
    paintMore();
    try {
      const data = await fetchTracksPage(d.id, d.next);
      const { rows, stats } = sift(data.items);
      d.stats = stats;
      d.via = data.via;
      d.rows = d.rows.concat(rows);
      d.total = data.total || d.total;
      d.next = data.more ? d.next + data.items.length : null;
      d.sub = `${d.rows.length} de ${d.total} ${d.total === 1 ? 'canción' : 'canciones'}`;
    } catch (e) {
      d.sub = '';
      view.loading = false;
      const ul = list();
      // Aunque no podamos LISTARLA, reproducirla por contexto sí suele funcionar.
      if (ul) ul.innerHTML = empty(errorMsg(e) + botonesDeRescate());
      paintMore();
      return;
    }
    view.loading = false;
    paint();
  };

  /* Abrir un ÁLBUM: sus canciones. `/albums/{id}/tracks` devuelve pistas
     "simplificadas" —sin el objeto `album` dentro—, así que la portada y el
     nombre del disco se les pegan aquí; si no, la fila saldría sin carátula
     y al reproducirla la barra de arriba se quedaría con la anterior. */
  const openAlbum = async (a, more) => {
    if (view.loading) return;
    if (!more) {
      view.detail = { tipo: 'album', id: a.id, uri: a.uri, name: a.name, cover: a.cover || null,
                      owner: a.owner || '', sub: '· cargando ·', rows: [], next: 0, total: a.total };
      paint();
      const ul0 = list();
      if (ul0) ul0.innerHTML = skeletons(6);
    }
    const d = view.detail;
    if (!d || d.next == null) return;
    view.loading = true;
    paintMore();
    try {
      const data = await getPage(`/albums/${d.id}/tracks`, d.next, true);
      const items = (data && data.items) || [];
      const conDisco = items.filter(Boolean).map((t) => ({
        ...t, album: { name: d.name, images: d.cover ? [{ url: d.cover }] : [] },
      }));
      const { rows, stats } = sift(conDisco);
      d.stats = stats;
      d.rows = d.rows.concat(rows);
      d.total = (data && data.total) || d.total;
      d.next = (data && data.next) ? d.next + items.length : null;
      d.sub = `${d.rows.length} de ${d.total} ${d.total === 1 ? 'canción' : 'canciones'}`;
    } catch (e) {
      d.sub = '';
      view.loading = false;
      const ul = list();
      if (ul) ul.innerHTML = empty(errorMsg(e) + botonesDeRescate());
      paintMore();
      return;
    }
    view.loading = false;
    paint();
  };

  /* Abrir un ARTISTA: sus discos. `/artists/{id}/top-tracks` se retiró en
     feb-2026, así que lo que se puede enseñar son los álbumes —que es, de
     hecho, más útil para explorar. `include_groups` deja fuera los discos
     donde solo aparece de invitado, que ensucian mucho la lista. */
  const openArtist = async (a, more) => {
    if (view.loading) return;
    if (!more) {
      view.detail = { tipo: 'artist', id: a.id, uri: a.uri, name: a.name, cover: a.cover || null,
                      owner: a.owner || '', sub: '· cargando ·', rows: [], next: 0, total: 0 };
      paint();
    }
    const d = view.detail;
    if (!d || d.next == null) return;
    view.loading = true;
    paintMore();
    try {
      const data = await getPage(`/artists/${d.id}/albums?include_groups=album,single`, d.next, true);
      const items = (data && data.items) || [];
      d.rows = d.rows.concat(items.filter(Boolean).map(mapAlbum));
      d.total = (data && data.total) || d.rows.length;
      d.next = (data && data.next) ? d.next + items.length : null;
      d.sub = `${d.rows.length} de ${d.total} ${d.total === 1 ? 'disco' : 'discos'}`;
    } catch (e) {
      d.sub = '';
      view.loading = false;
      const ul = list();
      if (ul) ul.innerHTML = empty(errorMsg(e));
      paintMore();
      return;
    }
    view.loading = false;
    paint();
  };

  const back = () => {
    view.detail = null;
    paint();
  };

  /* ---------- Sonda de diagnóstico ----------
     Prueba variantes de la MISMA petición y enseña cuál devuelve pistas.
     Se deja el endpoint VIEJO (`/tracks`) a propósito junto al nuevo: si
     alguna vez vuelve a fallar la lista, lo primero que hay que saber es si
     es otro cambio de nombre como el de feb-2026, y para eso hace falta ver
     los dos lado a lado. */
  const probes = (id) => [
    ['/items',                 `/playlists/${id}/items?limit=20`],
    ['/items + market',        `/playlists/${id}/items?limit=20&market=from_token`],
    ['/items + add_types',     `/playlists/${id}/items?limit=20&additional_types=track,episode`],
    ['/tracks (retirado)',     `/playlists/${id}/tracks?limit=20`],
    ['playlist',               `/playlists/${id}`],
    ['playlist + fields',      `/playlists/${id}?fields=items.items(item(id,name,uri)),items.total`],
  ];

  const countItems = (d) => {
    // El objeto playlist trae la lista bajo `items` (feb-2026) o `tracks`
    // (antes); la sonda tiene que saber leer las dos para poder compararlas.
    const dentro = (d && (d.items || d.tracks)) || null;
    let items = (d && Array.isArray(d.items)) ? d.items : (dentro && dentro.items);
    if (!Array.isArray(items)) items = [];
    const total = (d && d.total) != null ? d.total : (dentro && dentro.total);
    // Las claves de la respuesta dicen más que el conteo cuando viene rara
    const claves = d && typeof d === 'object' ? Object.keys(d).slice(0, 6).join(',') : String(d);
    /* De QUIÉN es la playlist es el dato que decide si hay algo que arreglar:
       las que hace Spotify (owner `spotify`: descubrimiento semanal, daily
       mix, radio, blends) están bloqueadas para las apps en modo desarrollo y
       no hay forma de abrirlas. Las del propio usuario deberían listar. */
    const o = d && d.owner;
    const duenio = o ? (o.id === 'spotify' ? 'SPOTIFY (bloqueada, sin arreglo)' : (o.display_name || o.id)) : null;
    return { n: items.length, total: total == null ? '?' : total, claves, duenio };
  };

  const diagnose = async (id) => {
    const ul = list();
    if (!ul) return;
    ul.innerHTML = empty('probando variantes de la petición…');
    const lines = [];
    for (const [label, path] of probes(id)) {
      try {
        const d = await window.SpotifyModule.api(path);
        const { n, total, claves, duenio } = countItems(d);
        lines.push(`<b>${escapeHtml(label)}</b> → ok · ítems: <b>${n}</b> · total: ${total}`
          + (duenio ? ` · de: <b>${escapeHtml(duenio)}</b>` : '')
          + `<br><span style="opacity:.6">claves: ${escapeHtml(claves)}</span>`);
        console.info('[Diagnóstico]', label, path, d);
      } catch (e) {
        const m = String(e.message || '').match(/Spotify API (\d+)/);
        lines.push(`<b>${escapeHtml(label)}</b> → error ${m ? m[1] : '?'}${detailOf(e.message)}`);
        console.warn('[Diagnóstico]', label, path, e.message);
      }
    }
    ul.innerHTML = empty(
      `<span style="color:var(--accent)">diagnóstico de la playlist</span><br>`
      + `<code style="font-size:11px">${escapeHtml(id)}</code><br><br>`
      + lines.join('<br>')
      + '<br><br><button class="retro-btn small" id="libPlayQueue">'
      + '<span class="bracket">[</span> ▶ reproducir y ver canciones <span class="bracket">]</span></button>');
  };

  // ---------- Reproducción ----------
  const play = (t) => {
    if (!window.SpotifyModule) return;
    if (t.unplayable) {
      setStatus('✕ spotify no puede reproducir esta pista (archivo local o retirada)');
      return;
    }
    // Dentro de una playlist reproducimos EN CONTEXTO: así la cola de
    // Spotify continúa con el resto de la playlist, no con una sola pista.
    const ctx = view.detail ? view.detail.uri : null;
    window.SpotifyModule.playTrack(t, ctx);
  };

  /* Rescate para cuando la lista no llega por ninguna vía (las playlists que
     hace Spotify —descubrimiento semanal, daily mix, radio, blends— siguen
     bloqueadas a las apps en modo desarrollo y no hay forma de abrirlas):
     `/me/player/queue` sí responde, así que reproduciendo la playlist la cola
     nos devuelve sus canciones. */
  const playAndListQueue = async (p) => {
    const ul = list();
    if (!window.SpotifyModule) return;
    if (ul) ul.innerHTML = empty('reproduciendo la playlist para leer sus canciones…');
    try {
      await window.SpotifyModule.playContext(p.uri);
    } catch (e) {
      if (ul) ul.innerHTML = empty('no se pudo reproducir: abre spotify (premium) en algún dispositivo'
        + detailOf(e.message));
      return;
    }
    setStatus('▶ reproduciendo: ' + p.name);
    // La cola tarda un instante en reflejar el contexto nuevo
    await new Promise(r => setTimeout(r, 1200));
    try {
      const data = await window.SpotifyModule.api('/me/player/queue');
      const items = [].concat(data && data.currently_playing ? [data.currently_playing] : [],
                              (data && data.queue) || []);
      const { rows } = sift(items);
      if (!rows.length) {
        if (ul) ul.innerHTML = empty('la cola llegó vacía; espera un segundo y pulsa ⟳');
        return;
      }
      const d = view.detail;
      if (d) {
        d.rows = rows;
        d.next = null;
        d.desdeCola = true;
        d.sub = `${rows.length} desde la cola · el listado completo está bloqueado`;
      }
      paint();
    } catch (e) {
      if (ul) ul.innerHTML = empty('se está reproduciendo, pero no se pudo leer la cola' + detailOf(e.message));
    }
  };

  const playAllPlaylist = async (p) => {
    if (!window.SpotifyModule) return;
    setStatus('▣ cargando: ' + p.name);
    try {
      await window.SpotifyModule.playContext(p.uri);
      setStatus('▶ reproduciendo: ' + p.name);
    } catch (e) {
      setStatus('✕ sin dispositivo activo. Abre Spotify (Premium) y vuelve a intentar.');
    }
  };

  // ---------- Cableado ----------
  const showBlock = (show) => {
    const block = $('libBlock');
    const hint = $('libHint');
    if (block) block.hidden = !show;
    if (hint) hint.hidden = show;
  };

  const currentRows = () => view.detail ? view.detail.rows : ((cache[view.col] && cache[view.col].rows) || []);

  const wire = () => {
    const block = $('libBlock');
    if (!block || block._wired) return;
    block._wired = true;

    block.addEventListener('click', (e) => {
      const chip = e.target.closest('.lib-chip');
      if (chip) {
        view.detail = null;
        view.col = chip.dataset.col;
        paint();
        if (!cache[view.col]) loadCollection(view.col, false);
        return;
      }
      if (e.target.closest('#libBack')) { back(); return; }
      if (e.target.closest('#libRefresh')) {
        if (view.detail) {
          const d = view.detail;
          const igual = { id: d.id, uri: d.uri, name: d.name, total: d.total, cover: d.cover, owner: d.owner };
          if (d.tipo === 'album') openAlbum(igual, false);
          else if (d.tipo === 'artist') openArtist(igual, false);
          else openPlaylist(igual, false);
        } else {
          cache[view.col] = null;
          paint();
          loadCollection(view.col, false);
        }
        return;
      }
      if (e.target.closest('#libMore')) {
        if (view.detail) {
          if (view.detail.tipo === 'album') openAlbum(null, true);
          else if (view.detail.tipo === 'artist') openArtist(null, true);
          else openPlaylist(null, true);
        } else loadCollection(view.col, true);
        return;
      }
      if (e.target.closest('#libPlayQueue')) {
        if (view.detail) playAndListQueue(view.detail);
        return;
      }
      if (e.target.closest('#libPlayAll') || e.target.closest('#libPlayAnyway')) {
        if (view.detail) playAllPlaylist(view.detail);
        return;
      }
      if (e.target.closest('#libDiag')) {
        if (view.detail) diagnose(view.detail.id);
        return;
      }
      const row = e.target.closest('.sp-result') || e.target.closest('.lib-card');
      if (!row) return;
      const item = currentRows()[parseInt(row.dataset.idx, 10)];
      if (!item) return;
      /* El ＋ encola sin interrumpir lo que suena. Va antes de todo lo demás
         porque la fila entera reproduce: si no se corta aquí, encolar
         reproduciría también, que es justo lo contrario de encolar. */
      if (e.target.closest('.sp-queue')) {
        e.stopPropagation();
        if (window.SpotifyModule && window.SpotifyModule.queue) {
          window.SpotifyModule.queue(item.uri, item.name);
        }
        return;
      }
      /* Dentro de un artista, las tarjetas son sus DISCOS: se abren. Va antes
         que la rama de las colecciones porque aquí ya estamos en un detalle. */
      if (view.detail && view.detail.tipo === 'artist') {
        if (e.target.closest('.sp-play')) playAllPlaylist(item);
        else openAlbum(item, false);
        return;
      }
      if (!view.detail) {
        const k = COLS[view.col].kind;
        // En todas: ▶ reproduce entero, el resto de la tarjeta abre
        if (k === 'playlist') {
          if (e.target.closest('.sp-play')) playAllPlaylist(item);
          else openPlaylist(item, false);
          return;
        }
        if (k === 'album') {
          if (e.target.closest('.sp-play')) playAllPlaylist(item);
          else openAlbum(item, false);
          return;
        }
        if (k === 'artist') {
          if (e.target.closest('.sp-play')) playAllPlaylist(item);
          else openArtist(item, false);
          return;
        }
      }
      play(item);
    });
  };

  /* Abrir un artista o un álbum desde FUERA (lo usa el buscador). Se
     asegura de que el bloque esté visible y cableado antes de pintar: si se
     llega aquí sin haber abierto nunca la pestaña, no hay nada montado. */
  const abrir = (tipo, item) => {
    if (!window.SpotifyModule || !window.SpotifyModule.isLoggedIn()) return;
    showBlock(true);
    wire();
    if (tipo === "artist") openArtist(item, false);
    else if (tipo === "album") openAlbum(item, false);
  };

  // Se llama al abrir la pestaña (desde seven.js)
  const open = () => {
    const logged = window.SpotifyModule && window.SpotifyModule.isLoggedIn();
    showBlock(!!logged);
    if (!logged) return;
    wire();
    paint();
    if (!cache[view.col]) loadCollection(view.col, false);
  };

  // La llama spotify.js al conectar / desconectar
  const onAuthChange = (connected) => {
    if (!connected) {
      Object.keys(cache).forEach(k => delete cache[k]);
      view.detail = null;
    }
    // El argumento manda: no volvemos a consultar isLoggedIn() aquí porque
    // depende de que el token ya se haya borrado antes de avisarnos.
    showBlock(!!connected);
    const tab = $('tab-library');
    if (connected && tab && tab.classList.contains('active')) open();
  };

  // detailOf se comparte con la cola (seven.js) para no duplicar el parseo
  // `abrir` lo usa el buscador para saltar a un artista o a un álbum
  window.LibraryModule = { open, abrir, onAuthChange, detailOf };

  document.addEventListener('DOMContentLoaded', () => {
    showBlock(!!(window.SpotifyModule && window.SpotifyModule.isLoggedIn()));
  });
})();
