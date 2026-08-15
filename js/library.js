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
    album: it.album ? it.album.name : '',
    duration: (it.duration_ms || 0) / 1000,
    cover: it.album && it.album.images && it.album.images[0] ? it.album.images[0].url : null,
    preview: it.preview_url || null,
    spotify: true,
    // Sin URI no hay forma de pedirle a Spotify que la reproduzca
    // (archivos locales de la playlist, pistas retiradas del catálogo).
    unplayable: !it.uri,
  });

  // Cada endpoint envuelve las pistas distinto: /me/tracks y las playlists dan
  // { track }, recently-played también, /me/top/tracks las da sueltas.
  // Ojo: { track: null } (pista retirada) debe dar null, no el envoltorio;
  // por eso comprobamos la CLAVE, no que el valor sea truthy.
  const unwrap = (it) => (it && typeof it === 'object' && 'track' in it) ? it.track : it;

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

  const statsMsg = (s, via) => {
    if (!s) return 'esta playlist está vacía';
    const fuente = via === 'playlist' ? '<br>(vía el objeto playlist, porque /tracks está bloqueado)' : '';
    if (!s.recibidos) {
      return 'spotify no deja listar las canciones de esta playlist<br>'
        + '(restricción a las apps en <b>modo desarrollo</b>: devuelve la lista vacía)<br>'
        + 'pero <b>reproducirla sí funciona</b> — y así se pueden leer de la cola' + fuente;
    }
    return `spotify devolvió <b>${s.recibidos}</b> ítems y ninguno es una canción<br>`
      + `(nulos: ${s.nulos} · episodios: ${s.episodios})<br>`
      + `abre la consola del navegador para ver el detalle` + fuente;
  };

  const mapPlaylist = (p) => ({
    id: p.id,
    uri: p.uri,
    name: p.name,
    owner: (p.owner && (p.owner.display_name || p.owner.id)) || '',
    total: (p.tracks && p.tracks.total) || 0,
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

  const paintHead = () => {
    const head = $('libHead');
    if (!head) return;
    head.hidden = !view.detail;
    if (!view.detail) return;
    head.querySelector('.lib-head-title').textContent = view.detail.name;
    head.querySelector('.lib-head-sub').textContent = view.detail.sub;
    const kind = head.querySelector('.lib-head-kind');
    if (kind) kind.textContent = view.detail.owner ? 'playlist · ' + view.detail.owner : 'playlist';
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

    // Rejilla de portadas solo en la lista de playlists; el resto son filas
    const esRejilla = !view.detail && COLS[view.col].kind === 'playlist'
      && !!(cache[view.col] && cache[view.col].rows && cache[view.col].rows.length);
    ul.classList.toggle('as-grid', esRejilla);

    if (view.detail) {
      ul.innerHTML = view.detail.rows.length
        ? view.detail.rows.map(rowTrack).join('')
        : empty(statsMsg(view.detail.stats, view.detail.via)
            + '<br><button class="retro-btn small" id="libPlayQueue" style="margin-top:10px">'
            + '<span class="bracket">[</span> ▶ reproducir y ver canciones <span class="bracket">]</span></button>'
            + ' <button class="retro-btn small" id="libDiag" style="margin-top:10px">'
            + '<span class="bracket">[</span> ⚙ diagnóstico <span class="bracket">]</span></button>');
    } else {
      const c = cache[view.col];
      if (!c) {
        // aún cargando: rejilla o filas, según lo que vaya a llegar
        const esGrid = COLS[view.col].kind === 'playlist';
        ul.classList.toggle('as-grid', esGrid);
        ul.innerHTML = skeletons(esGrid ? 8 : 6);
      } else if (c.error) {
        ul.innerHTML = empty(c.error);
      } else if (!c.rows.length) {
        ul.innerHTML = empty('nada por aquí todavía');
      } else {
        ul.innerHTML = COLS[view.col].kind === 'playlist'
          ? c.rows.map(rowPlaylist).join('')
          : c.rows.map(rowTrack).join('');
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
      return 'spotify no encuentra esta playlist.<br>'
        + 'las playlists que <b>hace spotify</b> (descubrimiento semanal, daily mix, radio…)<br>'
        + 'están bloqueadas para apps en modo desarrollo' + detailOf(msg);
    }
    if (/Spotify API 429/.test(msg)) return 'spotify pidió esperar un momento (demasiadas peticiones)';
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
      const data = await getPage(def.path, more ? prev.next : 0, def.paged);
      const items = (data && data.items) || [];
      const rows = def.kind === 'playlist'
        ? items.filter(Boolean).map(mapPlaylist)
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

  // Spotify restringe algunos endpoints a las apps en development mode.
  // Si /playlists/{id}/tracks se cierra, el objeto playlist completo suele
  // seguir trayendo sus pistas (sin paginar): mejor eso que una lista vacía.
  const fetchTracksPage = async (id, offset) => {
    try {
      const d = await getPage(`/playlists/${id}/tracks`, offset, true);
      return { items: (d && d.items) || [], total: (d && d.total) || 0, more: !!(d && d.next), via: 'tracks' };
    } catch (e) {
      if (offset > 0 || !/Spotify API 40[34]/.test(e.message || '')) throw e;
      console.warn('[Biblioteca] /tracks bloqueado, probando el objeto playlist:', e.message);
      const d = await window.SpotifyModule.api(`/playlists/${id}`);
      const t = (d && d.tracks) || {};
      return { items: t.items || [], total: t.total || 0, more: false, via: 'playlist' };
    }
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
      if (ul) ul.innerHTML = empty(errorMsg(e)
        + '<br><button class="retro-btn small" id="libPlayQueue" style="margin-top:10px">'
        + '<span class="bracket">[</span> ▶ reproducir y ver canciones <span class="bracket">]</span></button>'
        + ' <button class="retro-btn small" id="libDiag" style="margin-top:10px">'
        + '<span class="bracket">[</span> ⚙ diagnóstico <span class="bracket">]</span></button>');
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

  // ---------- Sonda de diagnóstico ----------
  // Spotify restringe endpoints a las apps en development mode y no siempre
  // con el mismo código. Probamos variantes de la MISMA petición y enseñamos
  // cuál devuelve pistas, para saber por dónde tirar.
  const probes = (id) => [
    ['/tracks',                `/playlists/${id}/tracks?limit=20`],
    ['/tracks + market',       `/playlists/${id}/tracks?limit=20&market=from_token`],
    ['/tracks + add_types',    `/playlists/${id}/tracks?limit=20&additional_types=track,episode`],
    ['playlist',               `/playlists/${id}`],
    ['playlist + market',      `/playlists/${id}?market=from_token`],
    ['playlist + fields',      `/playlists/${id}?fields=tracks.items(track(id,name,uri)),tracks.total`],
  ];

  const countItems = (d) => {
    let items = (d && d.items) || (d && d.tracks && d.tracks.items);
    if (!Array.isArray(items)) items = [];
    const total = (d && d.total) != null ? d.total : (d && d.tracks && d.tracks.total);
    // Las claves de la respuesta dicen más que el conteo cuando viene rara
    const claves = d && typeof d === 'object' ? Object.keys(d).slice(0, 6).join(',') : String(d);
    return { n: items.length, total: total == null ? '?' : total, claves };
  };

  const diagnose = async (id) => {
    const ul = list();
    if (!ul) return;
    ul.innerHTML = empty('probando variantes de la petición…');
    const lines = [];
    for (const [label, path] of probes(id)) {
      try {
        const d = await window.SpotifyModule.api(path);
        const { n, total, claves } = countItems(d);
        lines.push(`<b>${escapeHtml(label)}</b> → ok · ítems: <b>${n}</b> · total: ${total}`
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

  // Spotify bloquea /playlists/{id}/tracks a las apps en development mode,
  // pero /me/player/queue sí responde: si reproducimos la playlist, la cola
  // nos devuelve sus canciones. Es la única vía que queda para verlas.
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
          openPlaylist({ id: d.id, uri: d.uri, name: d.name, total: d.total, cover: d.cover, owner: d.owner }, false);
        } else {
          cache[view.col] = null;
          paint();
          loadCollection(view.col, false);
        }
        return;
      }
      if (e.target.closest('#libMore')) {
        if (view.detail) openPlaylist(null, true);
        else loadCollection(view.col, true);
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
      if (!view.detail && COLS[view.col].kind === 'playlist') {
        // ▶ reproduce la playlist entera; el resto de la fila la abre
        if (e.target.closest('.sp-play')) playAllPlaylist(item);
        else openPlaylist(item, false);
        return;
      }
      play(item);
    });
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
  window.LibraryModule = { open, onAuthChange, detailOf };

  document.addEventListener('DOMContentLoaded', () => {
    showBlock(!!(window.SpotifyModule && window.SpotifyModule.isLoggedIn()));
  });
})();
