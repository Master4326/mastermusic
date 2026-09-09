/* ==========================================================
   ESTADÍSTICAS — la pantalla que lee el historial de js/historial.js.

   Todo lo que se ve aquí sale de TU equipo: ni una petición a Spotify. Y por
   eso puede hacer lo que Spotify no hace — enseñarte tus más escuchadas de
   cualquier periodo, y no solo de tres rangos fijos una vez al año.

   Aquí NO se calcula nada: las cuentas viven en `window.Historial`
   (`ranking`, `resumen`, `descubrimientos`). Esto solo pinta.
   ========================================================== */
(() => {
  'use strict';

  const cuerpo = document.getElementById('statsBody');
  if (!cuerpo) return;

  const chips = document.querySelectorAll('.st-chip');
  const recargar = document.getElementById('statsRefresh');
  let dias = 7;
  let cargando = false;

  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  // 3 h 25 min / 25 min / 40 s — la unidad que toque, sin ceros de relleno
  const dur = (seg) => {
    seg = Math.max(0, Math.round(seg || 0));
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    if (h) return `${h} h ${m} min`;
    if (m) return `${m} min`;
    return `${seg} s`;
  };

  const fecha = (ms) => new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

  const veces = (n) => n === 1 ? '1 vez' : n + ' veces';

  const filaPista = (e, i) => `
    <li class="sp-result st-fila" data-uri="${escapeHtml(e.uri || '')}" tabindex="0">
      <span class="st-pos">${i + 1}</span>
      <div class="sp-thumb" ${e.cover ? `style="background-image:url('${escapeHtml(e.cover)}')"` : ''}>${e.cover ? '' : '♪'}</div>
      <div class="sp-meta">
        <div class="sp-name">${escapeHtml(e.name)}</div>
        <div class="sp-artist">${escapeHtml(e.artist)}</div>
      </div>
      <div class="st-veces">${veces(e.veces)}<span>${dur(e.segundos)}</span></div>
    </li>`;

  const filaArtista = (e, i) => `
    <li class="sp-result st-fila st-art">
      <span class="st-pos">${i + 1}</span>
      <div class="sp-thumb" ${e.cover ? `style="background-image:url('${escapeHtml(e.cover)}')"` : ''}>${e.cover ? '' : '◍'}</div>
      <div class="sp-meta"><div class="sp-name">${escapeHtml(e.artist || '—')}</div></div>
      <div class="st-veces">${veces(e.veces)}<span>${dur(e.segundos)}</span></div>
    </li>`;

  /* El reloj de escucha: 24 barras, una por hora. Es el dato que más
     sorprende de un historial propio — a qué horas escuchas de verdad. */
  const reloj = (horas) => {
    const max = Math.max(...horas, 1);
    return `<div class="st-reloj" role="img" aria-label="A qué horas escuchas">
      ${horas.map((n, h) => `
        <div class="st-hora" title="${h}:00 · ${n} ${n === 1 ? 'escucha' : 'escuchas'}">
          <div class="st-barra" style="height:${Math.max(2, (n / max) * 100)}%"></div>
          <span>${h % 6 === 0 ? h : ''}</span>
        </div>`).join('')}
    </div>`;
  };

  const tarjeta = (n, etiqueta) => `<div class="st-dato"><b>${n}</b><span>${etiqueta}</span></div>`;

  const pintarVacio = (hayAlgo) => {
    cuerpo.innerHTML = `<div class="sp-empty" style="line-height:1.7">
      ▒ ${hayAlgo ? 'nada en este periodo' : 'todavía no hay historial'} ▒
      <br><span class="sp-empty-tip">${hayAlgo
        ? 'prueba con un periodo más largo'
        : 'ponte música y esto se va llenando solo · <b>Spotify solo guarda las últimas 50</b>, esta app las guarda todas'}</span>
    </div>`;
  };

  const pintar = (filas) => {
    if (!filas.length) { pintarVacio(false); return; }
    const H = window.Historial;
    const r = H.resumen(filas);
    if (!r.escuchas) { pintarVacio(true); return; }

    const top = H.ranking(filas, 'key', 15);
    const arts = H.ranking(filas, 'artist', 10);
    const desc = H.descubrimientos(filas, 8);

    cuerpo.innerHTML = `
      <div class="st-datos">
        ${tarjeta(r.escuchas, r.escuchas === 1 ? 'escucha' : 'escuchas')}
        ${tarjeta(dur(r.segundos), 'de música')}
        ${tarjeta(r.canciones, r.canciones === 1 ? 'canción' : 'canciones')}
        ${tarjeta(r.artistas, r.artistas === 1 ? 'artista' : 'artistas')}
      </div>
      ${r.desde ? `<p class="st-pie">desde el ${fecha(r.desde)}${
        r.saltadas ? ` · ${r.saltadas} saltadas antes de los 30 s (no cuentan)` : ''}</p>` : ''}

      <div class="st-titulo">▸ más escuchadas</div>
      <ul class="track-list sp-results">${top.map(filaPista).join('')}</ul>

      <div class="st-titulo">▸ tus artistas</div>
      <ul class="track-list sp-results">${arts.map(filaArtista).join('')}</ul>

      <div class="st-titulo">▸ a qué horas escuchas</div>
      ${reloj(r.horas)}

      ${desc.length ? `<div class="st-titulo">▸ lo último que descubriste</div>
      <ul class="track-list sp-results">${desc.map((f, i) => `
        <li class="sp-result st-fila" data-uri="${escapeHtml(f.uri || '')}" tabindex="0">
          <div class="sp-thumb" ${f.cover ? `style="background-image:url('${escapeHtml(f.cover)}')"` : ''}>${f.cover ? '' : '♪'}</div>
          <div class="sp-meta">
            <div class="sp-name">${escapeHtml(f.name)}</div>
            <div class="sp-artist">${escapeHtml(f.artist)}</div>
          </div>
          <div class="st-veces"><span>${fecha(f.t)}</span></div>
        </li>`).join('')}</ul>` : ''}

      <p class="st-pie st-nota">esto lo guarda esta app en tu equipo, no Spotify —
        su API solo devuelve las últimas 50 y borra el resto para siempre</p>
      <div class="st-acciones">
        ${top.some((e) => e.uri) ? '<button class="retro-btn small" id="statsPlaylist">[ ♫ crear playlist con estas ]</button>' : ''}
        <button class="retro-btn small" id="statsBorrar">[ borrar mi historial ]</button>
      </div>
    `;
    // Guardadas para el botón de la playlist, sin volver a leer la base
    ultimoTop = top.filter((e) => e.uri);
  };

  let ultimoTop = [];

  /* Convierte el ranking en una playlist de Spotify de verdad. Esto es lo que
     Spotify NO puede darte: él no guarda tu historial más allá de 50 temas,
     así que «mis más escuchadas de este mes» solo existe aquí. */
  const crearPlaylist = async (boton) => {
    const S = window.SpotifyModule;
    if (!S || !S.isLoggedIn()) { if (window.SevenStatus) window.SevenStatus('✕ conecta spotify primero'); return; }
    if (!ultimoTop.length) return;
    const etiqueta = { 7: 'de la semana', 30: 'del mes', 365: 'del año', 0: 'de siempre' }[dias] || '';
    const nombre = `Mis más escuchadas ${etiqueta}`.trim();
    boton.disabled = true;
    boton.textContent = '[ creando… ]';
    try {
      const r = await S.crearPlaylist(nombre, ultimoTop.map((e) => e.uri),
        `Las ${ultimoTop.length} que más has puesto ${etiqueta}, según el historial de MASTER MUSIC.`);
      boton.textContent = '[ ✓ creada en tu Spotify ]';
      if (window.SevenStatus) window.SevenStatus('♫ playlist creada: ' + nombre);
      if (r && r.url) boton.title = r.url;
    } catch (e) {
      boton.disabled = false;
      boton.textContent = '[ ♫ crear playlist con estas ]';
      const msg = (e && e.message) || '';
      if (window.SevenStatus) {
        window.SevenStatus(/403/.test(msg)
          ? '✕ Spotify no deja crear playlists a las apps en modo desarrollo'
          : '✕ no se pudo crear la playlist');
      }
      console.warn('[stats] playlist:', msg);
    }
  };

  const cargar = async () => {
    if (cargando || !window.Historial) return;
    cargando = true;
    cuerpo.innerHTML = '<div class="sp-empty">▒ leyendo tu historial… ▒</div>';
    try {
      pintar(await window.Historial.leer(dias));
    } catch (e) {
      console.warn('[stats] no se pudo leer el historial:', e && e.message);
      cuerpo.innerHTML = '<div class="sp-empty">▒ no se pudo leer el historial ▒</div>';
    } finally { cargando = false; }
  };

  chips.forEach((c) => c.addEventListener('click', () => {
    dias = parseInt(c.dataset.dias, 10) || 0;
    chips.forEach((x) => x.classList.toggle('active', x === c));
    cargar();
  }));
  if (recargar) recargar.addEventListener('click', cargar);

  // Pulsar una fila la reproduce (si es de Spotify y hay sesión)
  cuerpo.addEventListener('click', async (e) => {
    const pl = e.target.closest('#statsPlaylist');
    if (pl) { crearPlaylist(pl); return; }
    const borrar = e.target.closest('#statsBorrar');
    if (borrar) {
      if (!confirm('¿Borrar TODO tu historial de escuchas?\n\nEsto no se puede deshacer, y Spotify no guarda una copia: lo que se borre aquí se pierde.')) return;
      await window.Historial.borrar();
      cargar();
      if (window.SevenStatus) window.SevenStatus('▣ historial borrado');
      return;
    }
    const fila = e.target.closest('.st-fila');
    if (!fila || !fila.dataset.uri) return;
    const S = window.SpotifyModule;
    if (!S || !S.isLoggedIn()) { if (window.SevenStatus) window.SevenStatus('✕ conecta spotify para reproducirla'); return; }
    const nombre = fila.querySelector('.sp-name').textContent;
    S.playTrack({ uri: fila.dataset.uri, name: nombre, spotify: true,
      artist: (fila.querySelector('.sp-artist') || {}).textContent || '' });
  });

  // Solo se lee al abrir la pestaña: el historial puede tener miles de filas
  let abierta = false;
  window.StatsModule = {
    open: () => { if (!abierta) { abierta = true; } cargar(); },
  };
})();
