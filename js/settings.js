/* ==========================================================
   Ajustes de comportamiento y apariencia
   (los colores siguen viviendo en seven.js; aquí va lo demás)
   Cada opción es un grupo .seg con data-set y botones data-val.
   ========================================================== */
(() => {
  'use strict';

  const body = document.body;
  const root = document.documentElement;

  // clave de localStorage, valor por defecto y qué hace cada opción
  const OPCIONES = {
    crt:    { key: 'mm_crt',        def: 'full' },
    rows:   { key: 'mm_rows',       def: 'normal' },
    motion: { key: 'mm_motion',     def: 'auto' },
    lyrics: { key: 'mm_lyrics_size', def: 'm' },
    /* Permiso para que el espectro escuche por el micrófono. APAGADO por
       defecto y con razón: mientras el micrófono está abierto, Android y
       iOS ponen todo el audio del aparato en modo llamada y la música se
       oye más bajita. No hay forma de evitarlo desde una web. Solo vale la
       pena si la música suena en OTRO aparato — y eso solo lo sabe el
       usuario, así que lo decide él. La lee js/visualizer.js directamente
       de localStorage: mismo nombre y mismo formato, sin traducciones. */
    mic:    { key: 'mm_mic', def: 'off' },
    // La intensidad del modo edit NO es un ajuste: lyrics.js la deduce sola
    // del ritmo de cada línea y de los graves (ver intensidadAuto).
  };

  const leer = (id) => {
    const o = OPCIONES[id];
    return localStorage.getItem(o.key) || o.def;
  };

  // ---------- Aplicar ----------
  const LYRICS_SCALE = { s: 0.8, m: 1, l: 1.25, xl: 1.5 };

  // «menos movimiento»: auto = lo que diga el sistema
  const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const aplicarMovimiento = () => {
    const v = leer('motion');
    const menos = v === 'less' || (v === 'auto' && mqMotion.matches);
    body.classList.toggle('reduce-motion', menos);
    pintarAvisoMovimiento(v, menos);
    return menos;
  };

  /* El estado real tiene que verse. Si el sistema pide menos movimiento,
     «automático» apaga scanlines y notas flotantes sin decir nada, y parece
     que la app se ha roto. */
  const pintarAvisoMovimiento = (v, menos) => {
    const el = document.getElementById('motionHint');
    if (!el) return;
    const base = '«automático» sigue la preferencia de tu sistema. '
      + '«menos» detiene scanlines, notas flotantes, vinilo y destellos '
      + '— la letra sigue funcionando igual.';
    let estado;
    if (menos && v === 'auto') {
      estado = '<b style="color:var(--accent)">ahora mismo: reducido</b>, porque tu sistema '
        + 'tiene los efectos de animación desactivados. Pon <b>«completo»</b> si quieres '
        + 'las notas flotantes y el ambiente igualmente.';
    } else if (menos) {
      estado = '<b style="color:var(--accent)">ahora mismo: reducido</b> (lo has elegido tú).';
    } else {
      estado = '<b style="color:var(--accent)">ahora mismo: completo</b>.';
    }
    el.innerHTML = estado + '<br>' + base;
  };

  const aplicar = (id) => {
    const v = leer(id);
    if (id === 'crt') {
      body.classList.toggle('crt-soft', v === 'soft');
      body.classList.toggle('crt-off', v === 'off');
    } else if (id === 'rows') {
      body.classList.toggle('rows-compact', v === 'compact');
      body.classList.toggle('rows-cozy', v === 'cozy');
      root.style.setProperty('--row-pad', v === 'compact' ? '3px' : v === 'cozy' ? '10px' : '6px');
    } else if (id === 'motion') {
      aplicarMovimiento();
    } else if (id === 'lyrics') {
      root.style.setProperty('--lyrics-scale', String(LYRICS_SCALE[v] || 1));
    } else if (id === 'mic') {
      /* Se le avisa al visualizador para que enseñe o esconda el botón ◈
         sin recargar — y sobre todo para que SUELTE el micrófono en el
         acto si lo acaban de apagar. */
      if (window.VisualizerModule && window.VisualizerModule.refrescarSync) {
        window.VisualizerModule.refrescarSync();
      }
    }
  };

  const pintarSeg = (id) => {
    const grupo = document.querySelector(`.seg[data-set="${id}"]`);
    if (!grupo) return;
    const v = leer(id);
    grupo.querySelectorAll('.seg-btn').forEach(b => {
      const on = b.dataset.val === v;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  Object.keys(OPCIONES).forEach(id => { aplicar(id); pintarSeg(id); });

  // El sistema puede cambiar la preferencia de movimiento con la app abierta
  const onMq = () => { if (leer('motion') === 'auto') aplicarMovimiento(); };
  if (mqMotion.addEventListener) mqMotion.addEventListener('change', onMq);
  else if (mqMotion.addListener) mqMotion.addListener(onMq);

  // ---------- Clics ----------
  document.querySelectorAll('.seg[data-set]').forEach(grupo => {
    const id = grupo.dataset.set;
    grupo.setAttribute('role', 'group');
    grupo.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn || !OPCIONES[id]) return;
      localStorage.setItem(OPCIONES[id].key, btn.dataset.val);
      aplicar(id);
      pintarSeg(id);
      if (window.SevenStatus) window.SevenStatus('▣ ajuste guardado');
    });
  });

  // ---------- Datos ----------
  const $ = (id) => document.getElementById(id);

  const kb = (n) => n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB';

  const pintarTamCache = () => {
    const el = $('cacheSize');
    if (!el) return;
    let raw = '';
    try { raw = localStorage.getItem('mm_lyrics_cache') || ''; } catch (_) {}
    let n = 0;
    try { n = Object.keys(JSON.parse(raw || '{}')).length; } catch (_) {}
    el.textContent = raw ? `${n} letras · ${kb(raw.length)}` : 'vacía';
  };

  const pintarTamLib = async () => {
    const el = $('librarySize');
    if (!el || !window.MusicDB) return;
    try {
      const all = await window.MusicDB.getAll();
      el.textContent = all.length ? `${all.length} pista${all.length === 1 ? '' : 's'}` : 'vacía';
    } catch (_) { el.textContent = '—'; }
  };

  const refrescarDatos = () => { pintarTamCache(); pintarTamLib(); };
  refrescarDatos();
  // Al abrir la pestaña de config los números deben estar al día
  const tabCfg = document.querySelector('.tab[data-tab="settings"]');
  if (tabCfg) tabCfg.addEventListener('click', refrescarDatos);

  const btnCache = $('clearLyricsCache');
  if (btnCache) btnCache.addEventListener('click', () => {
    try {
      localStorage.removeItem('mm_lyrics_cache');
      if (window.LyricsModule && window.LyricsModule.clearCache) window.LyricsModule.clearCache();
    } catch (_) {}
    pintarTamCache();
    if (window.SevenStatus) window.SevenStatus('▣ caché de letras vaciada');
  });

  const btnLib = $('clearLibrary');
  if (btnLib) btnLib.addEventListener('click', async () => {
    if (!window.MusicDB) return;
    if (!confirm('¿Borrar toda la música que importaste?\n\nNo afecta a Spotify ni a los archivos de tu disco.')) return;
    try {
      await window.MusicDB.clear();
      if (window.PlayerCore && window.PlayerCore.state) {
        window.PlayerCore.state.tracks.length = 0;
        window.PlayerCore.state.queue.length = 0;
      }
      if (window.SevenStatus) window.SevenStatus('▣ biblioteca local borrada');
    } catch (_) {
      if (window.SevenStatus) window.SevenStatus('✕ no se pudo borrar la biblioteca');
    }
    pintarTamLib();
  });

  // Otros módulos pueden preguntar si toca ir con calma
  window.MMSettings = {
    get: leer,
    reduceMotion: () => body.classList.contains('reduce-motion'),
  };
})();
