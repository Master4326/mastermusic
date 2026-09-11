/* ==========================================================
   SEVEN.FM — orchestration: tabs, themes, clock, track list,
   cover art mirroring, status bar
   ========================================================== */
(() => {
  'use strict';

  // ---------- Tab switching ----------
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');
  // Semántica para lectores de pantalla: la barra ya es role="tablist"
  tabs.forEach(t => {
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-controls', 'tab-' + t.dataset.tab);
    t.setAttribute('aria-selected', t.classList.contains('active') ? 'true' : 'false');
  });
  contents.forEach(c => c.setAttribute('role', 'tabpanel'));
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      const name = t.dataset.tab;
      tabs.forEach(x => {
        x.classList.toggle('active', x === t);
        x.setAttribute('aria-selected', x === t ? 'true' : 'false');
      });
      contents.forEach(c => c.classList.toggle('active', c.id === 'tab-' + name));
      if (name === 'queue') renderQueue();   // refresco inmediato al abrir la cola
      if (name === 'library' && window.LibraryModule) window.LibraryModule.open();
      if (name === 'stats' && window.StatsModule) window.StatsModule.open();
      if (name === 'search') {               // foco directo al buscador
        const inp = document.getElementById('spotifySearchInput');
        if (inp && !inp.closest('[hidden]')) setTimeout(() => inp.focus(), 0);
      }
    });
  });

  // ---------- Color theme (presets + custom pickers) ----------
  const STORAGE_KEYS = {
    THEME: 'mm_theme',
    ACCENT: 'mm_accent_custom',
    ACCENT_MODE: 'mm_accent_mode',   // 'auto' (de la carátula) | 'manual'
    BG_MODE: 'mm_bg_mode',
    BG_COLOR: 'mm_bg_color',
    TEXT: 'mm_text_custom',
  };

  const root = document.documentElement;
  const body = document.body;

  const applyAccent = (hex) => {
    body.removeAttribute('data-theme');
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-glow', hex);
    root.style.setProperty('--accent-dim', darken(hex, 0.5));
    applyBordersFromAccent(hex);
  };

  const applyTheme = (name) => {
    body.dataset.theme = name;
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-glow');
    root.style.removeProperty('--accent-dim');
    // Read the resolved accent from the [data-theme] cascade and derive borders
    setTimeout(() => {
      const computed = getComputedStyle(root).getPropertyValue('--accent').trim() || '#5ce1e6';
      applyBordersFromAccent(computed);
    }, 0);
  };

  /* Saca los 4 tonos de borde (hi / light / pixel / dark) del acento, apagado
     hacia el fondo para que los bordes parezcan marcos y no neones.

     Ese "hacia el fondo" antes era un azul marino FIJO. Con el acento cyan de
     fábrica no se notaba, pero en cuanto el acento sale de la carátula el
     marino tiraba de todos los bordes hacia el azul: con un acento dorado los
     marcos salían verdosos y sucios, peleados con el resto de la ventana.
     Ahora se apagan hacia el color de panel que esté puesto, así que los
     bordes pertenecen a la misma paleta que todo lo demás. */
  let baseMarcos = { r: 26, g: 31, b: 74 };  // marino de arranque, hasta la 1ª carátula

  const applyBordersFromAccent = (hex) => {
    let rgb;
    try { rgb = hexToRgb(hex); } catch (e) { return; }
    const mix = (c1, c2, t) => ({
      r: c1.r * (1 - t) + c2.r * t,
      g: c1.g * (1 - t) + c2.g * t,
      b: c1.b * (1 - t) + c2.b * t,
    });
    const mid = mix(rgb, baseMarcos, 0.55);
    root.style.setProperty('--border-hi',    rgbToHex(mix(rgb, { r: 255, g: 255, b: 255 }, 0.35))); // bright highlight
    root.style.setProperty('--border-light', rgbToHex(mid));
    root.style.setProperty('--border-pixel', rgbToHex(mix(mid, { r: 0, g: 0, b: 0 }, 0.25)));
    root.style.setProperty('--border-dark',  rgbToHex(mix(mid, { r: 0, g: 0, b: 0 }, 0.7)));
  };

  const applyText = (hex) => {
    root.style.setProperty('--text', hex);
  };

  // ---------- Acento automático desde la carátula ----------
  // En modo 'auto' el color de acento (letra activa, bordes, botones)
  // sale de la carátula de cada canción. Elegir un swatch o color
  // personalizado pasa a 'manual'; el swatch AUTO vuelve a activarlo.
  let accentMode = localStorage.getItem(STORAGE_KEYS.ACCENT_MODE)
    || ((localStorage.getItem(STORAGE_KEYS.THEME) || localStorage.getItem(STORAGE_KEYS.ACCENT)) ? 'manual' : 'auto');
  let lastCoverAccent = null;

  const applyAccentFromCover = (hex) => {
    lastCoverAccent = hex;
    if (accentMode !== 'auto') return;
    applyAccent(hex); // solo pinta; no persiste como elección manual
  };

  const resetAccentFromCover = () => {
    lastCoverAccent = null;
    if (accentMode !== 'auto') return;
    applyTheme('cyan');
  };

  /* ---------- Escalera de texto desde la carátula ----------
     --text-dim y --text-muted eran fijos: el lavanda de fábrica se quedaba
     puesto aunque el resto de la ventana cambiara de color, y sobre una
     carátula en blanco y negro el nombre del disco cantaba en AZUL. Ahora
     los tres tonos de texto salen de la misma paleta que todo lo demás,
     salvo que el usuario haya elegido su propio color de texto. */
  let textMode = localStorage.getItem(STORAGE_KEYS.TEXT) ? 'manual' : 'auto';

  const applyTextFromCover = (text, dim, muted) => {
    if (textMode !== 'auto') return;
    root.style.setProperty('--text', text);
    root.style.setProperty('--text-dim', dim);
    root.style.setProperty('--text-muted', muted);
  };

  const resetTextFromCover = () => {
    if (textMode !== 'auto') return;
    root.style.removeProperty('--text');
    root.style.removeProperty('--text-dim');
    root.style.removeProperty('--text-muted');
  };

  const applyBgManual = (hex) => {
    body.classList.add('bg-manual');
    root.style.setProperty('--dyn-1', lighten(hex, 0.15));
    root.style.setProperty('--dyn-2', hex);
    applyPanelsFromBase(hex);
  };

  const applyBgAuto = () => {
    body.classList.remove('bg-manual');
    // Reset panels — colors.js will repopulate them from cover
    resetPanels();
    if (window.CoverColors) window.CoverColors.refresh();
  };

  // Set all chrome panels (window, panels, frame) as shades of a base color.
  // Brighter = "raised" buttons, darker = inner panels.
  const applyPanelsFromBase = (hex) => {
    let baseRgb;
    try { baseRgb = hexToRgb(hex); } catch (e) { return; }
    /* Los marcos se apagan hacia ESTE color. Se guarda en vez de leerlo del
       CSS porque --bg-panel-2 va con transición: al pedirlo justo después de
       ponerlo, getComputedStyle devuelve todavía el valor viejo y los bordes
       se quedarían una canción por detrás. */
    baseMarcos = baseRgb;

    // Detect if base is very light → use dark shades instead of light
    const lum = (baseRgb.r + baseRgb.g + baseRgb.b) / 3;
    const isLight = lum > 180;

    const shade = (t) => {
      // t > 0 → lighter, t < 0 → darker
      if (t >= 0) {
        return rgbToHex({
          r: baseRgb.r + (255 - baseRgb.r) * t,
          g: baseRgb.g + (255 - baseRgb.g) * t,
          b: baseRgb.b + (255 - baseRgb.b) * t,
        });
      }
      return rgbToHex({
        r: baseRgb.r * (1 + t),
        g: baseRgb.g * (1 + t),
        b: baseRgb.b * (1 + t),
      });
    };

    if (isLight) {
      // Light base: window slightly darker, panels darker still
      root.style.setProperty('--bg-window',  shade(-0.05));
      root.style.setProperty('--bg-panel',   shade(-0.12));
      root.style.setProperty('--bg-panel-2', shade(-0.20));
      root.style.setProperty('--bg-frame',   shade(0.05));
    } else {
      // Dark base: window=base, panels darker, frame brighter
      root.style.setProperty('--bg-window',  shade(0.12));
      root.style.setProperty('--bg-panel',   shade(0.04));
      root.style.setProperty('--bg-panel-2', shade(-0.25));
      root.style.setProperty('--bg-frame',   shade(0.22));
    }
  };

  const resetPanels = () => {
    baseMarcos = { r: 26, g: 31, b: 74 };
    root.style.removeProperty('--bg-window');
    root.style.removeProperty('--bg-panel');
    root.style.removeProperty('--bg-panel-2');
    root.style.removeProperty('--bg-frame');
  };

  // Expose for colors.js to call when auto-extracting from cover
  window.MasterColors = {
    applyPanelsFromBase, resetPanels,
    applyAccentFromCover, resetAccentFromCover,
    applyTextFromCover, resetTextFromCover,
  };

  // Color math helpers
  /* Acepta '#rrggbb' Y 'rgb(r, g, b)'. Lo segundo no era un capricho: --accent
     está registrado con @property para poder fundirlo, y un custom property
     registrado como <color> SIEMPRE se lee resuelto como rgb(...) desde
     getComputedStyle. applyTheme() lo leía así y se lo pasaba a esta función,
     que sacaba NaN de 'rg' y dejaba los cuatro bordes en '#NaNNaNNaN' —
     inválido, o sea sin borde— hasta que entrara la primera carátula. */
  const hexToRgb = (hex) => {
    const s = String(hex).trim();
    if (s.startsWith('rgb')) {
      const m = s.match(/[\d.]+/g) || [];
      return { r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0 };
    }
    const c = s.replace('#', '');
    return {
      r: parseInt(c.substr(0, 2), 16) || 0,
      g: parseInt(c.substr(2, 2), 16) || 0,
      b: parseInt(c.substr(4, 2), 16) || 0,
    };
  };
  const rgbToHex = ({ r, g, b }) => '#' + [r, g, b].map(v =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  ).join('');
  const darken = (hex, factor) => {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex({ r: r * (1 - factor), g: g * (1 - factor), b: b * (1 - factor) });
  };
  const lighten = (hex, factor) => {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex({
      r: r + (255 - r) * factor,
      g: g + (255 - g) * factor,
      b: b + (255 - b) * factor,
    });
  };

  // Preset accent swatches
  const presetSwatches = document.querySelectorAll('.swatch[data-color]');
  const accentAutoBtn = document.getElementById('accentAuto');
  const updateActiveSwatch = (color) => {
    presetSwatches.forEach(s => s.classList.toggle('active', s.dataset.color === color));
    if (accentAutoBtn) accentAutoBtn.classList.toggle('active', color === 'auto');
  };
  const setAccentManual = () => {
    accentMode = 'manual';
    localStorage.setItem(STORAGE_KEYS.ACCENT_MODE, 'manual');
  };
  presetSwatches.forEach(s => {
    s.addEventListener('click', () => {
      const name = s.dataset.color;
      setAccentManual();
      applyTheme(name);
      localStorage.setItem(STORAGE_KEYS.THEME, name);
      localStorage.removeItem(STORAGE_KEYS.ACCENT);
      updateActiveSwatch(name);
    });
  });

  // Custom accent picker
  const customAccent = document.getElementById('customAccent');
  customAccent.addEventListener('input', (e) => {
    const hex = e.target.value;
    setAccentManual();
    applyAccent(hex);
    localStorage.setItem(STORAGE_KEYS.ACCENT, hex);
    localStorage.removeItem(STORAGE_KEYS.THEME);
    updateActiveSwatch(null);
  });

  // Swatch AUTO: el acento sigue a la carátula de cada canción
  if (accentAutoBtn) {
    accentAutoBtn.addEventListener('click', () => {
      accentMode = 'auto';
      localStorage.setItem(STORAGE_KEYS.ACCENT_MODE, 'auto');
      localStorage.removeItem(STORAGE_KEYS.THEME);
      localStorage.removeItem(STORAGE_KEYS.ACCENT);
      updateActiveSwatch('auto');
      if (lastCoverAccent) applyAccent(lastCoverAccent);
      else applyTheme('cyan');
    });
  }

  // Background mode
  const bgAuto = document.getElementById('bgAuto');
  const bgManual = document.getElementById('bgManual');
  const bgPresets = document.querySelectorAll('.bg-preset');
  const customBg = document.getElementById('customBg');

  bgAuto.addEventListener('change', () => {
    if (bgAuto.checked) {
      applyBgAuto();
      localStorage.setItem(STORAGE_KEYS.BG_MODE, 'auto');
    }
  });
  bgManual.addEventListener('change', () => {
    if (bgManual.checked) {
      const saved = localStorage.getItem(STORAGE_KEYS.BG_COLOR) || '#0a0e2e';
      applyBgManual(saved);
      localStorage.setItem(STORAGE_KEYS.BG_MODE, 'manual');
    }
  });
  bgPresets.forEach(b => {
    b.addEventListener('click', () => {
      const hex = b.dataset.bg;
      bgManual.checked = true;
      applyBgManual(hex);
      customBg.value = hex;
      localStorage.setItem(STORAGE_KEYS.BG_MODE, 'manual');
      localStorage.setItem(STORAGE_KEYS.BG_COLOR, hex);
    });
  });
  customBg.addEventListener('input', (e) => {
    bgManual.checked = true;
    applyBgManual(e.target.value);
    localStorage.setItem(STORAGE_KEYS.BG_MODE, 'manual');
    localStorage.setItem(STORAGE_KEYS.BG_COLOR, e.target.value);
  });

  // Text color presets + custom
  const textPresets = document.querySelectorAll('.text-preset');
  const customText = document.getElementById('customText');
  /* Elegir color de texto a mano congela la escalera automática: a partir de
     aquí manda el usuario y la carátula ya no toca --text-dim/--text-muted. */
  const setTextManual = (hex) => {
    textMode = 'manual';
    applyText(hex);
    root.style.removeProperty('--text-dim');
    root.style.removeProperty('--text-muted');
    localStorage.setItem(STORAGE_KEYS.TEXT, hex);
  };
  textPresets.forEach(b => {
    b.addEventListener('click', () => {
      const hex = b.dataset.text;
      setTextManual(hex);
      customText.value = hex;
    });
  });
  customText.addEventListener('input', (e) => setTextManual(e.target.value));

  // Lyrics offset slider
  const offsetSlider = document.getElementById('offsetSlider');
  const offsetValue = document.getElementById('offsetValue');
  const offsetMinus = document.getElementById('offsetMinus');
  const offsetPlus = document.getElementById('offsetPlus');
  const offsetReset = document.getElementById('offsetReset');
  if (offsetSlider) {
    const fmt = (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + 's';
    const paint = (sec) => {
      offsetSlider.value = sec;
      offsetValue.textContent = fmt(sec);
    };
    const apply = (v) => {
      const sec = Math.max(-5, Math.min(5, +v || 0));
      paint(sec);
      if (window.LyricsOffset) window.LyricsOffset.set(sec);
    };
    const initial = parseFloat(localStorage.getItem('mm_lyrics_offset') || '0') || 0;
    paint(initial);
    // cada canción tiene su propio offset guardado; al cambiar de pista,
    // lyrics.js avisa con este evento para que el slider muestre el suyo
    window.addEventListener('mm:lyrics-offset', (e) => {
      paint(Math.max(-5, Math.min(5, +e.detail || 0)));
    });
    offsetSlider.addEventListener('input', () => apply(parseFloat(offsetSlider.value)));
    offsetMinus.addEventListener('click', () => apply(parseFloat(offsetSlider.value) - 0.25));
    offsetPlus.addEventListener('click',  () => apply(parseFloat(offsetSlider.value) + 0.25));
    offsetReset.addEventListener('click', () => apply(0));
  }

  // Reset button
  document.getElementById('resetColors').addEventListener('click', () => {
    [STORAGE_KEYS.THEME, STORAGE_KEYS.ACCENT, STORAGE_KEYS.ACCENT_MODE, STORAGE_KEYS.BG_MODE, STORAGE_KEYS.BG_COLOR, STORAGE_KEYS.TEXT]
      .forEach(k => localStorage.removeItem(k));
    body.removeAttribute('data-theme');
    body.classList.remove('bg-manual');
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-glow');
    root.style.removeProperty('--accent-dim');
    root.style.removeProperty('--text');
    root.style.removeProperty('--text-dim');
    root.style.removeProperty('--text-muted');
    root.style.removeProperty('--dyn-1');
    root.style.removeProperty('--dyn-2');
    resetPanels();
    accentMode = 'auto'; // por defecto el acento sigue a la carátula
    textMode = 'auto';   // y el texto también
    if (lastCoverAccent) applyAccent(lastCoverAccent);
    else applyTheme('cyan');
    // Repinta la paleta entera desde la carátula que suena ahora mismo:
    // si no, el fondo y la escalera de texto se quedaban en los de fábrica
    // hasta la siguiente canción.
    if (window.CoverColors) window.CoverColors.refresh();
    updateActiveSwatch('auto');
    bgAuto.checked = true;
    customAccent.value = '#5ce1e6';
    customBg.value = '#0a0e2e';
    customText.value = '#e8ecff';
  });

  // ---------- Restore saved settings ----------
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
  const savedAccent = localStorage.getItem(STORAGE_KEYS.ACCENT);
  const savedBgMode = localStorage.getItem(STORAGE_KEYS.BG_MODE) || 'auto';
  const savedBgColor = localStorage.getItem(STORAGE_KEYS.BG_COLOR);
  const savedText = localStorage.getItem(STORAGE_KEYS.TEXT);

  if (accentMode === 'auto') {
    // El acento vendrá de la carátula; cyan de arranque mientras carga
    applyTheme('cyan');
    updateActiveSwatch('auto');
  } else if (savedAccent) {
    applyAccent(savedAccent);
    customAccent.value = savedAccent;
    updateActiveSwatch(null);
  } else {
    applyTheme(savedTheme || 'cyan');
    updateActiveSwatch(savedTheme || 'cyan');
  }
  if (savedBgMode === 'manual' && savedBgColor) {
    bgManual.checked = true;
    applyBgManual(savedBgColor);
    customBg.value = savedBgColor;
  } else {
    bgAuto.checked = true;
  }
  if (savedText) {
    applyText(savedText);
    customText.value = savedText;
  }

  // ---------- Clock ----------
  const clockEl = document.getElementById('clock');
  const tickClock = () => {
    const d = new Date();
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    // Los ":" van en spans para que el CSS los haga parpadear
    clockEl.innerHTML = `${hh}<span class="c">:</span>${mm}<span class="c">:</span>${ss}`;
  };
  tickClock();
  setInterval(tickClock, 1000);

  // ---------- Mirror cover art + album ----------
  const coverArt = document.getElementById('coverArt');
  const npAlbumEl = document.getElementById('npAlbum');
  const npTitleEl = document.getElementById('npTitle');

  /* Esta función la dispara un MutationObserver Y un intervalo de seguridad,
     o sea que corre dos veces por segundo para siempre. Antes reescribía el
     innerHTML de la carátula y el estado en CADA pasada: dos reconstrucciones
     de DOM por segundo sin que hubiera cambiado nada. Ahora compara primero y
     solo escribe cuando de verdad cambia la canción. */
  /* ---------- Marquesina: lo que no cabe RUEDA en vez de cortarse ----------
     Como en cualquier radio de coche o en el Winamp de siempre: si el título
     desborda, se desliza hasta el final, espera y vuelve. Solo se monta
     cuando de verdad desborda; si cabe, texto plano y sin animación.

     app.js escribe textContent directamente en estos elementos (y eso barre
     el span interno), así que la marquesina se re-monta después de cada
     cambio de canción — updateCover ya corre justo en ese momento. */
  const npArtistEl = document.getElementById('npArtist');

  const montarMarquesina = (el) => {
    if (!el) return;
    const previo = el.firstElementChild;
    const conSpan = !!(previo && previo.classList && previo.classList.contains('ti-scroll'));
    const texto = conSpan ? previo.textContent : (el.textContent || '');
    if (!texto.trim()) {
      if (conSpan) el.textContent = texto;
      el.classList.remove('ti-desborda');
      return;
    }
    // scrollWidth mide el contenido completo aunque el ellipsis lo recorte,
    // y el transform del span no lo altera: la medida vale en ambos estados
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra > 4) {
      if (!conSpan) {
        el.textContent = '';
        const s = document.createElement('span');
        s.className = 'ti-scroll';
        s.textContent = texto;
        el.appendChild(s);
      }
      el.classList.add('ti-desborda');
      // 10px extra para que el final no quede pegado al borde en la pausa
      el.style.setProperty('--ti-desp', -(sobra + 10) + 'px');
      // más recorrido = ciclo más largo (a ~30 px/s), con suelo de 7 s
      el.style.setProperty('--ti-dur', Math.max(7, 4 + (sobra + 10) / 30).toFixed(1) + 's');
    } else {
      if (conSpan) el.textContent = texto;   // vuelve a texto plano (y al ellipsis)
      el.classList.remove('ti-desborda');
      el.style.removeProperty('--ti-desp');
      el.style.removeProperty('--ti-dur');
    }
  };

  const montarMarquesinas = () => {
    montarMarquesina(npTitleEl);
    montarMarquesina(npArtistEl);
    montarMarquesina(npAlbumEl);
  };

  // al cambiar el tamaño de la ventana cambia lo que cabe: re-medir
  let marqTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(marqTimer);
    marqTimer = setTimeout(montarMarquesinas, 200);
  });

  /* ---------- Barra de pestañas que se esconde sola ----------
     Como los controles del modo cine: sin tocar nada 2,5 s, la barra se
     recoge y la letra gana su sitio. SOLO cuando manda la pestaña de la
     letra — en buscar/biblioteca/cola/config la barra es la navegación y
     esconderla mientras lees descolocaría todo el contenido. */
  const tabBar = document.querySelector('.tab-bar');
  let tabsTimer = null;

  const tabActiva = () => {
    const t = document.querySelector('.tab.active');
    return t ? t.dataset.tab : '';
  };

  const tactil = () => !!(window.MMPerf && window.MMPerf.tactil());

  const ocultarTabs = () => {
    if (!tabBar || tabActiva() !== 'lyrics') return;
    /* Con ratón: si el cursor está justo encima (a punto de pulsar el
       engranaje), esconderla sería una trampa — se re-arma y ya. En táctil
       no existe el hover, y además la barra deja un tirador visible, así
       que no hace falta esta cortesía. */
    if (!tactil() && tabBar.matches(':hover')) { armarTabs(); return; }
    tabBar.classList.add('se-esconde');
  };

  const armarTabs = () => {
    clearTimeout(tabsTimer);
    // con el dedo se tarda más en apuntar que con el ratón
    tabsTimer = setTimeout(ocultarTabs, tactil() ? 4000 : 2500);
  };

  const despertarTabs = () => {
    if (tabBar) tabBar.classList.remove('se-esconde');
    armarTabs();
  };

  if (tactil()) {
    /* Solo el TIRADOR la despierta. Si la despertara cualquier toque, leer
       la letra la haría saltar cada vez que rozas la pantalla; y como el
       tirador está a la vista, ningún toque se pierde buscándola.
       Mientras está recogida las pestañas llevan `visibility: hidden`, así
       que este toque no puede activar por error el botón de debajo. */
    if (tabBar) {
      tabBar.addEventListener('pointerdown', () => {
        if (tabBar.classList.contains('se-esconde')) despertarTabs();
        else armarTabs();
      }, { passive: true });
    }
    armarTabs();
  } else {
    // mouse o teclado: cualquiera la despierta (mismo trío que el cine)
    ['pointermove', 'pointerdown', 'keydown'].forEach((ev) =>
      document.addEventListener(ev, despertarTabs, { passive: true }));
    armarTabs();
  }

  let coverFirma = null;
  const updateCover = () => {
    if (!window.PlayerCore) return;
    const t = window.PlayerCore.state.currentTrack;
    const firma = t ? `${t.id}|${t.cover || ''}|${t.album || ''}|${t.name}|${t.artist || ''}` : '';
    if (firma === coverFirma) return;
    coverFirma = firma;

    if (!t) {
      coverArt.style.backgroundImage = '';
      coverArt.classList.remove('has-image');
      coverArt.innerHTML = '<span class="cover-placeholder">♪</span>';
      npAlbumEl.textContent = '';
      montarMarquesinas();
      return;
    }
    if (t.cover) {
      coverArt.style.backgroundImage = `url('${t.cover}')`;
      coverArt.classList.add('has-image');
      coverArt.innerHTML = '';
    } else {
      coverArt.style.backgroundImage = '';
      coverArt.classList.remove('has-image');
      coverArt.innerHTML = '<span class="cover-placeholder">♪</span>';
    }
    npAlbumEl.textContent = t.album || '';
    /* Montar el span dispara otra vez el MutationObserver, pero ese pase
       muere en el corte por firma de arriba: no hay bucle. */
    montarMarquesinas();
    updateStatus(`♪ ${t.name} — ${t.artist || 'desconocido'}`);
  };

  // Watch the title element — every time it changes, refresh cover & album
  const obs = new MutationObserver(updateCover);
  obs.observe(npTitleEl, { childList: true, characterData: true, subtree: true });
  setInterval(updateCover, 500); // safety re-sync

  // ---------- Vinyl mode (carátula giratoria, opcional) ----------
  const vinylToggle = document.getElementById('vinylToggle');
  if (vinylToggle) {
    const applyVinyl = (on) => {
      body.classList.toggle('vinyl-mode', on);
      vinylToggle.classList.toggle('active', on);
    };
    applyVinyl(localStorage.getItem('mm_vinyl') === 'true');
    vinylToggle.addEventListener('click', () => {
      const on = !body.classList.contains('vinyl-mode');
      applyVinyl(on);
      localStorage.setItem('mm_vinyl', on ? 'true' : 'false');
      if (window.SevenStatus) window.SevenStatus(on ? '▣ modo vinilo activado' : '▣ modo vinilo desactivado');
    });
  }

  /* ---------- Barra de estado ----------
     En REPOSO decía «▣ listo», que no informa de nada: es el mismo texto
     con la app recién abierta, sonando una canción o en pausa. Ahora el
     reposo es lo que está sonando — que es lo que uno espera leer ahí, y
     además resuelve el caso de la marquesina: si el título de arriba está
     rodando y no lo pillaste entero, aquí está completo.
     Los mensajes de aviso siguen mandando durante sus 4 segundos; al
     agotarse se vuelve a lo que suene EN ESE MOMENTO, no a lo que sonaba
     cuando salió el mensaje. */
  const statusText = document.getElementById('statusText');
  let statusTimeout = null;

  const textoReposo = () => {
    const pc = window.PlayerCore;
    const t = pc && pc.state && pc.state.currentTrack;
    if (!t) return '▣ listo';
    const titulo = (t.title || t.name || '').trim();
    if (!titulo) return '▣ listo';
    const artista = (t.artist || '').trim();
    // isPlaying cubre los dos motores: el <audio> local y Spotify Connect
    const sonando = !!(pc.state.isPlaying || (pc.audio && !pc.audio.paused));
    /* El nombre del aparato NO va aquí: lo enseña el chip #devChip, que
       además deja cambiarlo. Ponerlo en los dos sitios lo duplicaba, y este
       texto es `aria-live`: cada aviso volvería a cantar el dispositivo. */
    return `${sonando ? '▶' : '❙❙'} ${titulo}${artista ? ' — ' + artista : ''}`;
  };

  const pintarReposo = () => {
    if (statusTimeout) return;        // hay un aviso en pantalla: no se pisa
    const txt = textoReposo();
    if (statusText.textContent !== txt) statusText.textContent = txt;
  };

  const updateStatus = (msg) => {
    statusText.textContent = msg;
    // Reinicia el flicker retro de entrada
    statusText.classList.remove('flash');
    void statusText.offsetWidth;
    statusText.classList.add('flash');
    clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      statusTimeout = null;
      statusText.textContent = textoReposo();
    }, 4000);
  };
  window.SevenStatus = updateStatus;

  /* Se repinta al cambiar de canción y al dar a play/pausa. El sondeo de
     respaldo es porque `isPlaying` lo mueven dos motores distintos y no
     todos avisan; es una comparación de cadenas cada segundo, nada. */
  const engancharReposo = () => {
    const pc = window.PlayerCore;
    if (!pc || !pc.onTrack) { setTimeout(engancharReposo, 300); return; }
    pc.onTrack(pintarReposo);
    if (pc.audio) {
      ['play', 'pause', 'ended'].forEach((ev) => pc.audio.addEventListener(ev, pintarReposo));
    }
    setInterval(pintarReposo, 1000);
    pintarReposo();
  };
  engancharReposo();

  /* Aquí vivía `renderRetroTrackList`, que pintaba la música importada en
     un <ul id="trackList"> de la pestaña de config. Ese <ul> desapareció del
     HTML y la función se quedó dando vueltas cada 500 ms buscándolo (y
     cancelándose sola en la primera vuelta). Tu música ya tiene un sitio de
     verdad: la colección «mi música» de la pestaña de listas, en
     js/library.js, que además se puede filtrar, encolar y ordenar.

     escapeHtml y formatTime se quedan: los usa la cola, aquí abajo. */
  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const formatTime = (s) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ---------- Cola de reproducción (pestaña "cola") ----------
  const queueList = document.getElementById('queueList');
  let queueBusy = false;

  const queueEmpty = (msg) =>
    `<li class="sp-empty" style="line-height:1.6">${msg}</li>`;

  const queueHead = (txt) => `<li class="q-section">${txt}</li>`;

  /* Las pistas que hay pintadas ahora mismo, en el mismo orden que las filas.
     La fila guarda solo su número (`data-idx`) y el objeto entero vive aquí:
     es como lo hacen buscar (spotify.js) y biblioteca (library.js), y evita
     tener que meter la uri y la portada dentro de un atributo HTML. */
  let filasCola = [];

  /* Misma anatomía de fila que la biblioteca: portada + meta + duración.
     `pos` (la posición dentro de la cola LOCAL) solo llega con música propia:
     es lo que permite sacar una canción de la cola, cosa que con Spotify
     Connect no se puede porque la cola es suya y su API no lo ofrece. */
  const queueRow = (t, i, idx, now, pos) => `
    <li class="sp-result ${idx >= 0 ? '' : 'sp-static'} ${now ? 'q-now sp-now' : ''}"
        ${idx >= 0 ? `data-idx="${idx}" tabindex="0" title="Sonar esta: ${escapeHtml(t.name)}"` : ''}
        ${idx >= 0 && t.id ? `data-track-id="${t.id}"` : ''}>
      <span class="sp-idx">${now ? '▶' : String(i + 1).padStart(2, '0')}</span>
      <div class="sp-thumb" ${t.cover ? `style="background-image:url('${t.cover}')"` : ''}>${t.cover ? '' : '♪'}</div>
      <div class="sp-meta">
        <div class="sp-name">${escapeHtml(t.name)}</div>
        <div class="sp-artist">${escapeHtml(t.artist || 'desconocido')}</div>
      </div>
      <div class="sp-dur">${formatTime(t.duration)}</div>
      ${pos != null ? `<button class="sp-del q-quitar" data-pos="${pos}" title="Quitar de la cola">✕</button>` : ''}
    </li>`;

  // Pista de Spotify (cruda) → la forma que usan las filas.
  // `uri` y `preview` hacen falta para poder reproducirla desde aquí.
  const spTrack = (it) => ({
    id: it.id ? 'sp:' + it.id : null,
    uri: it.uri || (it.id ? 'spotify:track:' + it.id : null),
    preview: it.preview_url || null,
    spotify: true,
    name: it.name || '(sin título)',
    artist: (it.artists || []).map(a => a.name).filter(Boolean).join(', '),
    // Para «sigue sonando»: sin esto la radio solo puede buscar por nombre
    artistId: ((it.artists || [])[0] || {}).id || null,
    duration: (it.duration_ms || 0) / 1000,
    cover: it.album && it.album.images && it.album.images.length
      ? it.album.images[it.album.images.length - 1].url : null,
  });

  /* Pinta la cola de Spotify. Sale de `renderQueue` porque ahora se llama
     dos veces seguidas: primero con lo que sabe el SDK (al instante) y luego,
     si hace falta, con la cola entera que da la API. */
  const pintarCola = (sonando, items) => {
    filasCola = [];
    let html = '';
    if (sonando) html += queueHead('sonando ahora') + queueRow(spTrack(sonando), 0, -1, true);
    html += queueHead('a continuación');
    html += items.length
      ? items.map((it, i) => {
          const t = spTrack(it);
          // sin uri no hay forma de pedirle a Spotify que la ponga
          const idx = t.uri ? filasCola.push(t) - 1 : -1;
          return queueRow(t, i, idx, false);
        }).join('')
      : queueEmpty('▒ nada más en la cola ▒');
    queueList.innerHTML = html;
  };

  /* Cola de la API, cacheada. `/me/player/queue` da la lista entera, pero
     pedirla en cada refresco (6 s) es lo que en la v87 nos comió el límite y
     Spotify devolvía 429 a TODO. Con la caché se pide una vez cada 20 s como
     mucho, y solo cuando la del SDK se queda corta. El sello es la pista que
     suena: al cambiar de canción la cola es otra y hay que volver a pedirla. */
  let colaCache = { pistas: null, sello: null, t: 0, pedida: 0 };
  const COLA_TTL = 20000;   // lo cacheado vale 20 s
  const MIN_GAP  = 2000;    // y nunca dos peticiones seguidas en menos de esto
  const olvidarCola = () => { colaCache.t = 0; };

  const colaApi = async (sello) => {
    const ahora = Date.now();
    const misma = colaCache.pistas && colaCache.sello === sello;
    /* Sirve lo cacheado si aún no ha caducado O si se acaba de pedir. El
       freno importa porque la radio rellena la cola EN TANDAS y llama a
       `SevenQueueRefresh` una vez por tanda: sin él serían tres o cuatro
       peticiones en un suspiro, que es exactamente como nos ganamos el 429. */
    if (misma && (ahora - colaCache.t < COLA_TTL || ahora - colaCache.pedida < MIN_GAP))
      return colaCache.pistas;
    const data = await window.SpotifyModule.api('/me/player/queue');
    const pistas = (data && data.queue) || [];
    colaCache = { pistas, sello, t: ahora, pedida: ahora };
    return pistas;
  };

  const renderQueue = async () => {
    if (!queueList || !window.PlayerCore || queueBusy) return;
    const st = window.PlayerCore.state;
    const cur = st.currentTrack;

    // Spotify: pedir la cola real de la cuenta a la API
    if (cur && cur.spotify && window.SpotifyModule && window.SpotifyModule.isLoggedIn()) {
      pintarDesde();          // va por su lado: no debe retrasar la cola
      queueBusy = true;
      try {
        /* Sonando en la propia pestaña, lo que viene detrás ya lo sabe el
           reproductor del SDK: se pinta al instante y sin gastar una petición
           cada 6 segundos. Enseña menos canciones por delante que la API,
           pero son las de verdad y no hay que esperarlas. Con la música en
           otro aparato no queda más remedio que preguntar. */
        const local = window.SpotifyModule.colaLocal ? window.SpotifyModule.colaLocal() : null;
        const data = local || await window.SpotifyModule.api('/me/player/queue');
        const sonando = data && data.currently_playing;
        const items = (data && data.queue) || [];

        // Lo que ya se sabe, pintado sin esperar a nadie
        pintarCola(sonando, items);

        /* El SDK NO adelanta la cola entera: `next_tracks` viene recortado y
           casi siempre trae UNA pista. Desde la v88 la música suena en la
           propia pestaña, así que la cola se veía siempre con una sola
           canción. Cuando se queda corta, se completa con la de la API —que
           sí las trae todas— y se repinta encima. */
        if (local && items.length <= 1) {
          try {
            const full = await colaApi((sonando && sonando.id) || null);
            // solo si aporta: un fallo de la API no debe borrar lo ya pintado
            if (full.length > items.length) pintarCola(sonando, full);
          } catch (e) {
            console.warn('[Cola] la API no pudo completar la del SDK:', (e && e.message) || e);
          }
        }
      } catch (e) {
        // Antes esto decía siempre "no se pudo leer la cola" y escondía el motivo
        const msg = (e && e.message) || '';
        const detalle = (window.LibraryModule && window.LibraryModule.detailOf)
          ? window.LibraryModule.detailOf(msg) : '';
        let txt;
        if (/No token/.test(msg) || /Spotify API 401/.test(msg)) {
          txt = 'tu sesión de spotify caducó — reconecta en <b>config ⚙</b>';
        } else if (/Spotify API 403/.test(msg)) {
          txt = 'spotify no deja leer la cola a las apps en <b>modo desarrollo</b>' + detalle;
        } else if (/Spotify API 404/.test(msg)) {
          txt = 'no hay ningún dispositivo activo:<br>abre spotify (premium) y dale a reproducir' + detalle;
        } else {
          console.warn('[Cola] fallo:', msg);
          txt = 'no se pudo leer la cola de spotify' + detalle;
        }
        queueList.innerHTML = queueEmpty('▒ ' + txt + ' ▒');
      } finally {
        queueBusy = false;
      }
      return;
    }

    // Local: lo que queda de la cola del reproductor
    const desde = st.queueIndex + 1;
    const up = (st.queue || []).slice(desde).map(ix => st.tracks[ix]).filter(Boolean);
    filasCola = [];
    queueList.innerHTML = (cur ? queueHead('sonando ahora') + queueRow(cur, 0, -1, true) : '')
      + queueHead('a continuación')
      + (up.length
          ? up.map((t, i) => queueRow(t, i, filasCola.push(t) - 1, false, desde + i)).join('')
          : queueEmpty(cur
              ? '▒ no hay más canciones en cola ▒<br><span class="sp-empty-tip">añade con el ＋ de cualquier lista, o con <kbd>shift+enter</kbd> en el buscador</span>'
              : '▒ reproduce algo para ver la cola ▒<br><span class="sp-empty-tip">pulsa <kbd>ctrl+K</kbd> y escribe lo que quieras oír</span>'));
    pintarDesde();
  };

  /* ---------- «Sonando desde» ----------
     La cola dice QUÉ viene después; esto dice DE DÓNDE sale. Sin las dos
     cosas no se sabe lo que se está oyendo: sonaba algo, y averiguar de qué
     playlist salía era imposible desde la app.

     El contexto que da Spotify es una uri (`spotify:playlist:37i9…`), que no
     le dice nada a nadie. Se traduce a su nombre con UNA petición por lista y
     se guarda: la misma playlist suena veinte canciones seguidas. */
  const nombresCtx = new Map();
  let ctxPidiendo = null;

  const partesCtx = (uri) => {
    const m = /^spotify:(playlist|album|artist|collection)(?::(.+))?$/.exec(uri || '');
    return m ? { tipo: m[1], id: m[2] || null } : null;
  };

  const resolverCtx = async (uri) => {
    if (nombresCtx.has(uri)) return nombresCtx.get(uri);
    const p = partesCtx(uri);
    if (!p) return null;
    if (p.tipo === 'collection') {                 // «Tus me gusta»
      const d = { tipo: 'playlist', nombre: 'tus me gusta', item: null };
      nombresCtx.set(uri, d);
      return d;
    }
    if (!p.id || ctxPidiendo === uri) return null;
    ctxPidiendo = uri;
    try {
      const ruta = { playlist: '/playlists/', album: '/albums/', artist: '/artists/' }[p.tipo];
      const d = await window.SpotifyModule.api(ruta + p.id);
      const item = {
        id: p.id, uri, name: d.name || '',
        owner: (d.owner && (d.owner.display_name || d.owner.id))
          || (d.artists || []).map((a) => a.name).join(', ') || '',
        total: ((d.items || d.tracks) || {}).total || d.total_tracks || 0,
        cover: (d.images && d.images[0]) ? d.images[0].url : null,
      };
      const info = { tipo: p.tipo, nombre: d.name || p.tipo, item };
      nombresCtx.set(uri, info);
      return info;
    } catch (e) {
      // Que no se pueda leer el nombre no es motivo para no decir nada:
      // se guarda el tipo, que ya es más que una uri en crudo.
      const info = { tipo: p.tipo, nombre: p.tipo === 'album' ? 'un álbum' : 'una lista', item: null };
      nombresCtx.set(uri, info);
      return info;
    } finally { ctxPidiendo = null; }
  };

  let ctxActual = null;      // {tipo, item} de lo que enseña el chip

  const pintarDesde = async () => {
    const chipDesde = document.getElementById('queueFrom');
    if (!chipDesde || !window.PlayerCore) return;
    const st = window.PlayerCore.state;
    const cur = st.currentTrack;

    // Música propia: la lista la sabe el reproductor, sin preguntar a nadie
    if (!cur || !cur.spotify) {
      const d = st.desde;
      chipDesde.hidden = !d || !d.nombre;
      if (d && d.nombre) chipDesde.textContent = '◂ desde ' + d.nombre;
      ctxActual = null;
      return;
    }
    const uri = (window.SpotifyModule && window.SpotifyModule.context)
      ? window.SpotifyModule.context() : null;
    if (!uri) { chipDesde.hidden = true; ctxActual = null; return; }
    const info = await resolverCtx(uri);
    if (!info) return;                     // la petición está en marcha
    ctxActual = info;
    chipDesde.hidden = false;
    chipDesde.textContent = '◂ desde ' + info.nombre;
    chipDesde.title = 'Abrir ' + (info.tipo === 'album' ? 'este álbum'
      : info.tipo === 'artist' ? 'este artista' : 'esta lista');
  };

  /* ---------- Elegir una canción de la lista y que suene ----------

     Las filas de la cola ya nacían con `data-track-id`, pero NADIE las
     escuchaba: el único delegado que hay en app.js mira `.track-row`, que es
     la lista de la config, y las de aquí son `.sp-result`. O sea que la cola
     se veía y no se podía tocar. Ahora se puede, en local y en Spotify.

     Va delegado en la lista entera y no fila a fila porque `renderQueue`
     rehace el innerHTML cada 2,5 segundos: cualquier oyente puesto en una
     fila se perdería en el primer refresco. */
  const sonarDeLaCola = (row) => {
    const t = filasCola[parseInt(row.dataset.idx, 10)];
    if (!t) return;

    if (t.spotify) {
      const S = window.SpotifyModule;
      if (!S || !S.isLoggedIn()) return;
      /* Con el contexto (la playlist de la que sale) Spotify SALTA a esa
         canción y conserva lo que venía detrás. Sin él reproduciría la pista
         suelta y al terminar se quedaría en silencio, que es justo lo
         contrario de lo que espera quien elige algo de una cola. */
      S.playTrack(t, S.context ? S.context() : null);
    } else if (window.PlayerCore && t.id) {
      window.PlayerCore.playTrackById(t.id);
    }
    updateStatus('▶ ' + t.name + (t.artist ? ' · ' + t.artist : ''));
    // repintar ya: si no, la fila elegida sigue en "a continuación" hasta el
    // siguiente refresco y parece que no ha pasado nada
    olvidarCola();            // la cola ya no es la que teníamos cacheada
    setTimeout(renderQueue, 350);
  };

  if (queueList) {
    queueList.addEventListener('click', (e) => {
      // Quitar de la cola va ANTES: el ✕ está dentro de la fila, y la fila
      // entera reproduce. Sin cortar aquí, quitar pondría la canción.
      const quitar = e.target.closest('.q-quitar');
      if (quitar) {
        e.stopPropagation();
        const pos = parseInt(quitar.dataset.pos, 10);
        if (window.PlayerCore && window.PlayerCore.dequeueAt && window.PlayerCore.dequeueAt(pos)) {
          renderQueue();
        }
        return;
      }
      const row = e.target.closest('.sp-result[data-idx]');
      if (row) sonarDeLaCola(row);
    });

    /* El chip «◂ desde …» abre esa lista. Es el atajo que faltaba: oyes algo
       que te gusta, quieres ver de dónde sale, y estabas a un clic de nada. */
    const chipDesde = document.getElementById('queueFrom');
    if (chipDesde) chipDesde.addEventListener('click', () => {
      const st = window.PlayerCore && window.PlayerCore.state;
      if (st && st.currentTrack && !st.currentTrack.spotify) {
        // Música propia: la lista es tu biblioteca
        const libTab = document.querySelector('.tab[data-tab="library"]');
        if (libTab) libTab.click();
        if (window.LibraryModule && window.LibraryModule.irA) window.LibraryModule.irA('mine');
        return;
      }
      if (!ctxActual || !ctxActual.item || !window.LibraryModule) return;
      const libTab = document.querySelector('.tab[data-tab="library"]');
      if (libTab) libTab.click();
      window.LibraryModule.abrir(ctxActual.tipo, ctxActual.item);
    });
    // con teclado: las filas son focusables (tabindex en queueRow)
    queueList.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('.sp-result[data-idx]');
      if (!row) return;
      e.preventDefault();       // que el espacio no haga scroll ni pause
      sonarDeLaCola(row);
    });
  }

  /* Refresca solo con la pestaña de la cola abierta Y la ventana delante.
     Cada pasada es una petición a Spotify (`/me/player/queue`), y a 2,5 s eran
     24 por minuto que se sumaban a las 30 del sondeo de reproducción: entre
     las dos cosas la app se comía el límite de la API y Spotify contestaba
     **429 Too Many Requests** a TODO, incluidas las playlists — que entonces
     salían vacías, como si estuvieran bloqueadas. A 6 s la cola sigue estando
     al día (nadie mira una cola a cronómetro) por la cuarta parte del gasto.
     Ver también el freno del 429 en js/spotify.js. */
  setInterval(() => {
    if (document.hidden) return;
    const tab = document.getElementById('tab-queue');
    if (tab && tab.classList.contains('active')) renderQueue();
  }, 6000);

  /* Para que encolar una canción se vea al momento en vez de esperar hasta
     2,5 s al siguiente refresco. Solo repinta si la cola está a la vista. */
  window.SevenQueueRefresh = () => {
    olvidarCola();            // acaban de encolar algo: la caché ya no vale
    const tab = document.getElementById('tab-queue');
    if (tab && tab.classList.contains('active')) renderQueue();
  };

  // ---------- Tamaño de la ventana (redimensionable + maximizar) ----------
  const winEl = document.querySelector('.window');
  const SIZE_KEY = 'mm_window_size';

  /* Hasta aquí se guardaba CUALQUIER cambio de tamaño, incluido el que hace
     el propio navegador al estrecharse. Bastaba con encoger la ventana del
     navegador una vez —o abrir la página en el móvil— para que la app se
     quedara clavada en ese tamaño PARA SIEMPRE, también al volver a la
     pantalla grande. Lo guardado por aquel código no se distingue de lo
     elegido a mano, así que se tira una sola vez y se empieza de cero. */
  const SIZE_LIMPIO = 'mm_window_size_v2';
  try {
    if (!localStorage.getItem(SIZE_LIMPIO)) {
      localStorage.removeItem(SIZE_KEY);
      localStorage.setItem(SIZE_LIMPIO, '1');
    }
  } catch (_) {}

  /* Restaura el tamaño que el usuario haya elegido antes, pero sin pasarse
     de la pantalla de AHORA: lo que cabía en el monitor grande no cabe en el
     portátil. Y en móvil no se restaura nada — allí manda la hoja de estilos
     (`width: 100%`), que es la que sabe repartir el sitio. */
  const CORTE_MOVIL = 760;   // el mismo del @media de style.css
  try {
    const saved = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
    if (saved && saved.w && saved.h && window.innerWidth > CORTE_MOVIL) {
      winEl.style.width = Math.min(saved.w, window.innerWidth - 40) + 'px';
      winEl.style.height = Math.min(saved.h, window.innerHeight - 40) + 'px';
    }
  } catch (_) {}

  /* Guarda el tamaño cuando el usuario arrastra la esquina — y SOLO entonces.
     La pista para distinguirlo: si la ventana cambia de tamaño a la vez que
     la del navegador, no lo ha pedido nadie; es el `width: min(1080px, 100%)`
     del CSS haciendo su trabajo, y congelarlo en píxeles se carga justo eso.
     También se ignora la primera medición, que es el tamaño de fábrica. */
  if ('ResizeObserver' in window) {
    let saveTimer = null;
    let primera = true;
    let ultimoResizeNavegador = 0;
    window.addEventListener('resize', () => { ultimoResizeNavegador = Date.now(); }, { passive: true });
    new ResizeObserver(() => {
      if (primera) { primera = false; return; }
      if (winEl.classList.contains('maximized')) return;
      if (Date.now() - ultimoResizeNavegador < 600) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (Date.now() - ultimoResizeNavegador < 600) return;
        try {
          localStorage.setItem(SIZE_KEY, JSON.stringify({
            w: Math.round(winEl.offsetWidth),
            h: Math.round(winEl.offsetHeight)
          }));
        } catch (_) {}
      }, 250);
    }).observe(winEl);
  }

  // ---------- Title bar buttons ----------
  document.querySelectorAll('.tb-btn').forEach(b => {
    b.addEventListener('click', () => {
      if (b.classList.contains('tb-close')) {
        if (confirm('¿Cerrar MASTER MUSIC?')) window.close();
      } else if (b.title === 'Maximizar') {
        // Agranda la ventana para llenar toda la pantalla, o la restaura
        winEl.classList.toggle('maximized');
      } else if (b.title === 'Minimizar') {
        // Restaura el tamaño normal guardado
        winEl.classList.remove('maximized');
      }
    });
  });

  // ---------- Extra keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'l' || e.key === 'L') {
      const lyricsTab = document.querySelector('.tab[data-tab="lyrics"]');
      if (lyricsTab) lyricsTab.click();
    } else if (e.key === ',' || e.key === 's') {
      const setTab = document.querySelector('.tab[data-tab="settings"]');
      if (setTab) setTab.click();
    } else if (e.key === 'q' || e.key === 'Q' || e.key === 'c' || e.key === 'C') {
      const qTab = document.querySelector('.tab[data-tab="queue"]');
      if (qTab) qTab.click();
    } else if (e.key === 'f' || e.key === 'F') {
      /* La barra «/» ya NO viene aquí: se la queda el buscador universal
         (js/buscador.js), que mira en tu música, tus listas, tu historial y
         Spotify a la vez. Saltar a la pestaña de Spotify era mandarte a uno
         solo de los cuatro sitios donde puede estar lo que buscas. */
      e.preventDefault();
      const sTab = document.querySelector('.tab[data-tab="search"]');
      if (sTab) sTab.click();
    } else if (e.key === 'b' || e.key === 'B') {
      const libTab = document.querySelector('.tab[data-tab="library"]');
      if (libTab) libTab.click();
    } else if (e.key === 'h' || e.key === 'H') {
      // Historial. La 'l' ya era de lyrics y la 'b' de biblioteca.
      const stTab = document.querySelector('.tab[data-tab="stats"]');
      if (stTab) stTab.click();
    } else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
      const map = { '1': 'lyrics', '2': 'search', '3': 'library', '4': 'queue', '5': 'settings', '6': 'stats' };
      const tab = document.querySelector(`.tab[data-tab="${map[e.key]}"]`);
      if (tab) tab.click();
    }
  });

  // ---------- Ambiente: notas flotantes en el panel de letras ----------
  // Puramente decorativo: mientras suena música y el tab de letras está a la
  // vista, cada ~1.4s sube una nota con deriva y giro aleatorios. Van por
  // debajo del texto (z-index) y sesgadas a los bordes para no estorbar.
  const lyricsAmbient = document.getElementById('lyricsAmbient');
  if (lyricsAmbient) {
    const GLYPHS = ['♪', '♫', '♩', '♬', '✦', '✧', '·'];
    const spawnNote = () => {
      if (document.hidden) return;
      // ajustes → apariencia → movimiento: «menos» las apaga
      if (window.MMSettings && window.MMSettings.reduceMotion()) return;
      if (!document.body.classList.contains('playing')) return;
      const tab = document.getElementById('tab-lyrics');
      if (!tab || !tab.classList.contains('active')) return;
      if (lyricsAmbient.querySelectorAll('.la-note').length > 18) return;

      const n = document.createElement('span');
      n.className = 'la-note';
      // el glifo va dentro de un <i> para que ambient.js pueda hacerlo
      // rebotar con el bombo sin pisar la animación de subida
      const g = document.createElement('i');
      g.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      n.appendChild(g);
      // 42% borde izquierdo, 42% borde derecho, 16% por el medio
      const zona = Math.random();
      const x = zona < 0.42 ? 2 + Math.random() * 16
        : zona < 0.84 ? 80 + Math.random() * 17
        : 25 + Math.random() * 50;
      n.style.setProperty('--nx', x.toFixed(1) + '%');
      n.style.setProperty('--nfs', (12 + Math.random() * 18).toFixed(0) + 'px');
      n.style.setProperty('--ndur', (5 + Math.random() * 5).toFixed(1) + 's');
      n.style.setProperty('--nh', (lyricsAmbient.clientHeight + 50) + 'px');
      n.style.setProperty('--ndx', (Math.random() * 60 - 30).toFixed(0) + 'px');
      n.style.setProperty('--nrot', (Math.random() * 50 - 25).toFixed(0) + 'deg');
      n.style.setProperty('--nop', (0.14 + Math.random() * 0.28).toFixed(2));
      lyricsAmbient.appendChild(n);
      n.addEventListener('animationend', () => n.remove());
    };
    /* El goteo de fondo también sigue la energía de la canción (la calcula
       ambient.js): en una balada cae una nota de vez en cuando; en algo
       movido el ambiente se llena. Los golpes puntuales los lanza
       ambient.js en cada bombo. */
    let tocaNota = 0;
    setInterval(() => {
      /* Solo mientras suena algo, la pestaña está delante y la letra a la
         vista. Antes goteaban notas al DOM cada 700 ms aunque el reproductor
         llevara horas parado o el usuario estuviera en otra pestaña. */
      if (document.hidden) return;
      const pc = window.PlayerCore;
      // isPlaying cubre los dos motores: <audio> local y Spotify Connect
      const sonando = !!(pc && (pc.state.isPlaying || (pc.audio && !pc.audio.paused)));
      if (!sonando) return;
      const tab = document.getElementById('tab-lyrics');
      if (!tab || !tab.classList.contains('active')) return;
      const e = typeof window.MM_ENERGIA === 'number' ? window.MM_ENERGIA : 0.35;
      // 1 nota cada ~2.8s en calma → cada ~0.7s a tope (la mitad en móvil:
      // cada nota es un nodo que nace, se anima y muere)
      tocaNota += (0.25 + e * 0.75) * (window.MMPerf && window.MMPerf.movil() ? 0.5 : 1);
      if (tocaNota < 1) return;
      tocaNota = 0;
      spawnNote();
    }, 700);
  }

  // ---------- Globo con el minuto sobre la barra de progreso ----------
  // Estándar en cualquier reproductor serio: saber a dónde vas a saltar
  // ANTES de soltar el clic.
  const progBar = document.getElementById('progressBar');
  if (progBar) {
    const tip = document.createElement('div');
    tip.className = 'prog-tip';
    tip.textContent = '0:00';
    progBar.appendChild(tip);
    progBar.addEventListener('mousemove', (e) => {
      const rect = progBar.getBoundingClientRect();
      if (!rect.width) return;
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const st = window.PlayerCore && window.PlayerCore.state;
      const dur = (st && st.currentTrack && st.currentTrack.duration)
        || (window.PlayerCore && window.PlayerCore.audio && window.PlayerCore.audio.duration) || 0;
      tip.textContent = formatTime(pct * dur);
      tip.style.left = (pct * 100) + '%';
    });
  }

  // ---------- Welcome status ----------
  setTimeout(() => updateStatus('▣ bienvenido a MASTER MUSIC · [F] buscar · [Q] cola · [S] config'), 200);

  // ---------- Boot fix: ensure cover updates once ----------
  setTimeout(updateCover, 100);
})();
