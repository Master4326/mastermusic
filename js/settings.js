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
    /* «Sigue sonando»: al reproducir una canción SUELTA del buscador, encolar
       parecidas para que la música no se pare al acabar. La lee js/spotify.js
       directamente de localStorage, igual que el micrófono: mismo nombre y
       mismo formato, sin traducciones por el medio. */
    radio:  { key: 'mm_radio', def: 'on' },
    /* AMBIENTE · qué se ve detrás de la letra. «ondas» es la escena estilo
       NCS de js/fondo.js, «clasico» la carátula difuminada de siempre y
       «liso» ninguna de las dos. Lo lee fondo.js por la clase del <body>,
       no de localStorage: así basta con pulsar para que cambie. */
    ambiente: { key: 'mm_ambiente', def: 'ondas' },
    /* TRADUCCIÓN · la letra en español, en pequeño debajo de cada verso.
       Apagada por defecto a propósito: gasta red y no tiene sentido en una
       canción que ya está en español (js/traductor.js lo detecta solo y no
       pide nada, pero el que solo oye música en español no debería ni
       enterarse). La lee traductor.js directamente de localStorage, igual
       que el micrófono y «sigue sonando». */
    trad:   { key: 'mm_trad', def: 'off' },
    /* VINILO · la carátula gira como un disco. Es la misma clave y el mismo
       formato ('true'/'false') que el botón ◉ de encima de la carátula
       (js/seven.js): los dos mandan sobre lo mismo. En el teléfono este es
       su único sitio, porque allí la carátula mide 60 px y el ◉ se la comía. */
    vinilo: { key: 'mm_vinyl', def: 'false' },
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
    return menos;
  };
  /* Aquí vivía pintarAvisoMovimiento(), un párrafo que explicaba en qué estado
     estaba «movimiento». Se fue con el resto de las explicaciones largas de
     ajustes: lo que hace cada opción se ve al pulsarla, y el detalle está en
     el `title` del grupo. */

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
    } else if (id === 'ambiente') {
      body.classList.toggle('fondo-ondas', v === 'ondas');
      body.classList.toggle('fondo-liso', v === 'liso');
    } else if (id === 'trad') {
      /* Que se vea en la canción que YA está sonando, sin cambiar de tema:
         encendida pide la traducción (instantánea si está en caché) y
         apagada quita los subtítulos en el acto. */
      if (window.LyricsModule && window.LyricsModule.refrescarTrad) {
        window.LyricsModule.refrescarTrad();
      }
      /* Y en la muestra de ajustes, para el que la enciende sin música
         puesta: el verso de mentira se lleva su subtítulo debajo. */
      const muestraTrad = document.getElementById('fpTrad');
      if (muestraTrad) muestraTrad.hidden = v !== 'on';
    } else if (id === 'mic') {
      /* Se le avisa al visualizador para que enseñe o esconda el botón ◈
         sin recargar — y sobre todo para que SUELTE el micrófono en el
         acto si lo acaban de apagar. */
      if (window.VisualizerModule && window.VisualizerModule.refrescarSync) {
        window.VisualizerModule.refrescarSync();
      }
    } else if (id === 'vinilo') {
      /* La clase del <body> es lo que hace girar la carátula; el ◉ de
         encima de ella se marca igual, para que los dos digan lo mismo. */
      const on = v === 'true';
      body.classList.toggle('vinyl-mode', on);
      const boton = document.getElementById('vinylToggle');
      if (boton) {
        boton.classList.toggle('active', on);
        boton.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
  };

  /* Un grupo .seg es un radiogroup de verdad, no tres interruptores
     sueltos: las opciones se excluyen entre ellas. Se nota en el teclado
     —el tabulador salta al SIGUIENTE ajuste y las flechas se mueven
     dentro del grupo, en vez de tener que pasar por las cuatro
     opciones— y en lo que anuncia un lector de pantalla. */
  const pintarSeg = (id) => {
    const grupo = document.querySelector(`.seg[data-set="${id}"]`);
    if (!grupo) return;
    const v = leer(id);
    const btns = [...grupo.querySelectorAll('.seg-btn')];
    let hayPuesta = false;
    btns.forEach(b => {
      const on = b.dataset.val === v;
      if (on) hayPuesta = true;
      b.classList.toggle('active', on);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.removeAttribute('aria-pressed');
      b.tabIndex = on ? 0 : -1;
    });
    // valor guardado que ya no existe: que al menos se pueda tabular
    if (!hayPuesta && btns[0]) btns[0].tabIndex = 0;
  };

  Object.keys(OPCIONES).forEach(id => { aplicar(id); pintarSeg(id); });

  // El sistema puede cambiar la preferencia de movimiento con la app abierta
  const onMq = () => { if (leer('motion') === 'auto') aplicarMovimiento(); };
  if (mqMotion.addEventListener) mqMotion.addEventListener('change', onMq);
  else if (mqMotion.addListener) mqMotion.addListener(onMq);

  // El ◉ de la carátula cambió el vinilo por su cuenta: marcar el que toca
  document.addEventListener('mm:vinilo', () => pintarSeg('vinilo'));

  // ---------- Elegir ----------
  // Cómo se llama cada ajuste cuando hay que decirlo en una frase
  const ETIQUETA = {
    crt:      'pantalla crt',
    rows:     'listas',
    motion:   'movimiento',
    lyrics:   'tamaño de la letra',
    mic:      'micrófono',
    radio:    'sigue sonando',
    ambiente: 'ambiente',
    trad:     'traducción',
    vinilo:   'vinilo',
  };

  const elegir = (id, val, conFoco) => {
    if (!OPCIONES[id]) return;
    localStorage.setItem(OPCIONES[id].key, val);
    aplicar(id);
    pintarSeg(id);
    const grupo = document.querySelector(`.seg[data-set="${id}"]`);
    const btn = grupo && grupo.querySelector(`.seg-btn[data-val="${val}"]`);
    if (conFoco && btn) btn.focus();
    /* «▣ ajuste guardado» no decía CUÁL ni en qué había quedado. Con el
       efecto en otra pestaña, esa línea era la única señal de que algo
       había pasado — y no señalaba nada. */
    if (window.SevenStatus) {
      window.SevenStatus(`▣ ${ETIQUETA[id] || id} · ${btn ? btn.textContent.trim() : val}`);
    }
  };

  document.querySelectorAll('.seg[data-set]').forEach(grupo => {
    const id = grupo.dataset.set;
    grupo.setAttribute('role', 'radiogroup');
    // El grupo se llama como su etiqueta: sin esto son «tres botones»
    const et = grupo.closest('.set-row') && grupo.closest('.set-row').querySelector('.set-label');
    if (et && !grupo.getAttribute('aria-label')) {
      grupo.setAttribute('aria-label', et.textContent.trim());
    }
    grupo.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (btn) elegir(id, btn.dataset.val, false);
    });
    /* Flechas dentro del grupo, inicio/fin a los extremos. Sin esto, con
       teclado había que pasar por CADA opción de CADA ajuste para llegar
       al siguiente: veintitantos tabuladores para cruzar la pantalla. */
    grupo.addEventListener('keydown', (e) => {
      const btns = [...grupo.querySelectorAll('.seg-btn')];
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % btns.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + btns.length) % btns.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = btns.length - 1;
      else return;
      e.preventDefault();
      elegir(id, btns[j].dataset.val, true);
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
    // las traducciones son parte de lo mismo: se guardan y se tiran juntas
    const t = (window.Traductor && window.Traductor.tam) ? window.Traductor.tam() : { n: 0, bytes: 0 };
    const total = raw.length + t.bytes;
    if (!total) { el.textContent = 'vacía'; return; }
    el.textContent = `${n} letras${t.n ? ` · ${t.n} traducidas` : ''} · ${kb(total)}`;
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
  /* Al abrir configuración los números tienen que estar al día. Se
     escucha el aviso de seven.js y no el clic del engranaje: ahora se
     llega aquí de cinco maneras (la tecla S, el buscador de Ctrl+K, un
     [ver ▸] de otro sitio…) y solo una de ellas era ese clic. */
  document.addEventListener('mm:tab', (e) => {
    if (e.detail && e.detail.tab === 'settings') refrescarDatos();
  });

  const btnCache = $('clearLyricsCache');
  if (btnCache) btnCache.addEventListener('click', () => {
    try {
      localStorage.removeItem('mm_lyrics_cache');
      if (window.LyricsModule && window.LyricsModule.clearCache) window.LyricsModule.clearCache();
      if (window.Traductor && window.Traductor.limpiar) window.Traductor.limpiar();
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
      /* Y se avisa, que si no «tu música» seguía enseñando la lista de
         antes: filas que al pulsarlas no sonaba nada. El botón parecía
         no haber hecho su trabajo, y lo había hecho entero. */
      window.dispatchEvent(new CustomEvent('mm:biblioteca', { detail: { n: 0 } }));
      if (window.SevenQueueRefresh) window.SevenQueueRefresh();
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
