/* ==========================================================
   PlayerCore — estado + reproducción + audio.
   La UI visible (lista, carátula, tabs, búsqueda) la dibuja
   seven.js; aquí solo vive la lógica del reproductor.
   ========================================================== */
(() => {
  'use strict';

  // ---- State ----
  const state = {
    tracks: [],          // [{id, name, artist, album, duration, url, cover, file}]
    queue: [],           // índices dentro de tracks
    queueIndex: -1,
    currentTrack: null,
    isPlaying: false,
    shuffle: false,
    repeat: 'off',       // 'off' | 'all' | 'one'
    volume: 0.7,
  };

  // Volumen guardado de sesiones anteriores
  const savedVol = parseFloat(localStorage.getItem('mm_volume'));
  if (isFinite(savedVol)) state.volume = Math.max(0, Math.min(1, savedVol));

  const audio = new Audio();
  audio.volume = state.volume;

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const el = {
    fileInput: $('fileInput'),
    npTitle: $('npTitle'),
    npArtist: $('npArtist'),
    playBtn: $('playBtn'),
    playIcon: $('playIcon'),
    pauseIcon: $('pauseIcon'),
    prevBtn: $('prevBtn'),
    nextBtn: $('nextBtn'),
    shuffleBtn: $('shuffleBtn'),
    repeatBtn: $('repeatBtn'),
    progressBar: $('progressBar'),
    progressFill: $('progressFill'),
    progressThumb: $('progressThumb'),
    timeCurrent: $('timeCurrent'),
    timeTotal: $('timeTotal'),
    dropOverlay: $('dropOverlay'),
    spotifyConnectBtn: $('spotifyConnectBtn'),
    volumeCtl: $('volumeCtl'),
    volumeBar: $('volumeBar'),
    volumeFill: $('volumeFill'),
    volumeThumb: $('volumeThumb'),
    volBtn: $('volBtn'),
    volPct: $('volPct'),
  };

  // ---- Utility ----
  const formatTime = (s) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ---- Read metadata from a file ----
  const readMetadata = (file) => new Promise((resolve) => {
    if (typeof jsmediatags === 'undefined') {
      resolve({ title: file.name, artist: 'Desconocido', album: '', cover: null });
      return;
    }
    jsmediatags.read(file, {
      onSuccess: (tag) => {
        const tags = tag.tags || {};
        let cover = null;
        if (tags.picture) {
          try {
            const { data, format } = tags.picture;
            let base64 = '';
            for (let i = 0; i < data.length; i++) base64 += String.fromCharCode(data[i]);
            cover = `data:${format};base64,${btoa(base64)}`;
          } catch (e) { cover = null; }
        }
        resolve({
          title: tags.title || file.name.replace(/\.[^.]+$/, ''),
          artist: tags.artist || 'Desconocido',
          album: tags.album || '',
          cover,
        });
      },
      onError: () => resolve({
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: 'Desconocido',
        album: '',
        cover: null,
      }),
    });
  });

  const probeDuration = (url) => new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => resolve(a.duration || 0);
    a.onerror = () => resolve(0);
    a.src = url;
  });

  // ---- Add files ----
  const addFiles = async (files) => {
    const audioFiles = [...files].filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(f.name));
    if (!audioFiles.length) return;
    for (const file of audioFiles) {
      const url = URL.createObjectURL(file);
      const meta = await readMetadata(file);
      const duration = await probeDuration(url);
      const id = crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2);
      state.tracks.push({
        id, name: meta.title, artist: meta.artist, album: meta.album,
        duration, url, cover: meta.cover, file,
      });
      // Persist to IndexedDB so the library survives reloads
      if (window.MusicDB) {
        window.MusicDB.put({
          id, name: meta.title, artist: meta.artist, album: meta.album,
          duration, cover: meta.cover, blob: file,
        }).catch((e) => console.warn('No se pudo guardar la canción:', e));
      }
    }
  };

  // ---- Load persisted library from IndexedDB ----
  const loadPersisted = async () => {
    if (!window.MusicDB) return;
    try {
      const records = await window.MusicDB.getAll();
      if (!records || !records.length) return;
      for (const r of records) {
        if (!r.blob) continue;
        state.tracks.push({
          id: r.id, name: r.name, artist: r.artist, album: r.album,
          duration: r.duration, url: URL.createObjectURL(r.blob), cover: r.cover, file: r.blob,
        });
      }
    } catch (e) {
      console.warn('No se pudo cargar la biblioteca guardada:', e);
    }
  };

  // ---- Remove a track (library + IndexedDB) ----
  const removeTrack = (id) => {
    const idx = state.tracks.findIndex(t => t.id === id);
    if (idx < 0) return;
    const t = state.tracks[idx];
    if (t.url) { try { URL.revokeObjectURL(t.url); } catch (e) {} }
    state.tracks.splice(idx, 1);
    if (window.MusicDB) window.MusicDB.delete(id).catch(() => {});
    if (state.currentTrack && state.currentTrack.id === id) {
      audio.pause();
      audio.removeAttribute('src');
      state.currentTrack = null;
      state.isPlaying = false;
      updateNowPlaying();
      updatePlayIcon();
    }
  };

  // ---- Playback ----
  const playTrackById = (id) => {
    const idx = state.tracks.findIndex(t => t.id === id);
    if (idx < 0) return;
    state.queue = state.tracks.map((_, i) => i);
    if (state.shuffle) shuffleArray(state.queue, idx);
    state.queueIndex = state.queue.indexOf(idx);
    loadAndPlay(state.tracks[idx]);
  };

  const shuffleArray = (arr, keepFirst) => {
    let firstItem = null;
    if (keepFirst !== undefined) {
      firstItem = keepFirst;
      arr.splice(arr.indexOf(keepFirst), 1);
    }
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (firstItem !== null) arr.unshift(firstItem);
  };

  const loadAndPlay = (track) => {
    state.isPreview = false;
    state.currentTrack = track;
    audio.src = track.url;
    audio.play().catch(() => {});
    state.isPlaying = true;
    updateNowPlaying();
    updatePlayIcon();
    if (window.LyricsModule) window.LyricsModule.fetch(track);
  };

  const updateNowPlaying = () => {
    const t = state.currentTrack;
    if (!t) {
      el.npTitle.textContent = 'Sin canción';
      el.npArtist.textContent = '— ningún artista —';
      el.timeTotal.textContent = '0:00';
      return;
    }
    // Cambiar npTitle dispara el refresco de carátula/álbum en seven.js
    el.npTitle.textContent = t.name;
    el.npArtist.textContent = t.artist || '—';
    el.timeTotal.textContent = formatTime(t.duration);
  };

  const updatePlayIcon = () => {
    el.playIcon.hidden = state.isPlaying;
    el.pauseIcon.hidden = !state.isPlaying;
  };

  // ¿La canción actual se reproduce vía Spotify Connect?
  // Si es así, los controles mandan a Spotify en vez del audio local.
  // (state.isPreview = true cuando suena el preview de 30s por el audio local)
  const spotifyActive = () =>
    state.currentTrack && state.currentTrack.spotify && !state.isPreview && window.SpotifyModule;

  const togglePlay = () => {
    if (spotifyActive()) { window.SpotifyModule.togglePlay(); return; }
    if (!state.currentTrack) {
      if (state.tracks.length) playTrackById(state.tracks[0].id);
      return;
    }
    if (audio.paused) { audio.play().catch(() => {}); state.isPlaying = true; }
    else { audio.pause(); state.isPlaying = false; }
    updatePlayIcon();
  };

  const playNext = () => {
    if (spotifyActive()) { window.SpotifyModule.next(); return; }
    if (!state.queue.length) return;
    if (state.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    state.queueIndex++;
    if (state.queueIndex >= state.queue.length) {
      if (state.repeat === 'all') state.queueIndex = 0;
      else { state.queueIndex = state.queue.length - 1; state.isPlaying = false; updatePlayIcon(); return; }
    }
    loadAndPlay(state.tracks[state.queue[state.queueIndex]]);
  };

  const playPrev = () => {
    if (spotifyActive()) { window.SpotifyModule.prev(); return; }
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (!state.queue.length) return;
    state.queueIndex--;
    if (state.queueIndex < 0) state.queueIndex = 0;
    loadAndPlay(state.tracks[state.queue[state.queueIndex]]);
  };

  // ---- Audio events ----
  audio.addEventListener('timeupdate', () => {
    const pct = (audio.currentTime / (audio.duration || 1)) * 100;
    el.progressFill.style.width = pct + '%';
    el.progressThumb.style.left = pct + '%';
    el.timeCurrent.textContent = formatTime(audio.currentTime);
    if (window.LyricsModule) window.LyricsModule.tick(audio.currentTime);
  });
  audio.addEventListener('loadedmetadata', () => {
    el.timeTotal.textContent = formatTime(audio.duration);
    if (state.currentTrack) state.currentTrack.duration = audio.duration;
  });
  audio.addEventListener('ended', playNext);
  // body.playing → usado por la carátula giratoria (vinilo)
  audio.addEventListener('play',  () => document.body.classList.add('playing'));
  audio.addEventListener('pause', () => document.body.classList.remove('playing'));
  audio.addEventListener('ended', () => document.body.classList.remove('playing'));

  // ---- UI events ----
  el.fileInput.addEventListener('change', (e) => addFiles(e.target.files));

  // Drag & drop
  let dragCounter = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; el.dropOverlay.classList.add('active'); });
  window.addEventListener('dragleave', (e) => {
    e.preventDefault(); dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; el.dropOverlay.classList.remove('active'); }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragCounter = 0; el.dropOverlay.classList.remove('active');
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  // Delegate track clicks (delete + play)
  document.body.addEventListener('click', (e) => {
    const del = e.target.closest('.tr-del');
    if (del) { e.stopPropagation(); removeTrack(del.dataset.delId); return; }
    const row = e.target.closest('.track-row');
    if (row) { playTrackById(row.dataset.trackId); return; }
  });

  // Controls
  el.playBtn.addEventListener('click', togglePlay);
  el.nextBtn.addEventListener('click', playNext);
  el.prevBtn.addEventListener('click', playPrev);
  /* ---------- Aleatorio y repetir ----------
     Antes estos dos botones solo cambiaban una variable de aquí. Con
     reproducción local está bien —la cola es nuestra—, pero con Spotify
     Connect quien decide es Spotify: el botón se encendía y la reproducción
     seguía igual. Ahora se manda a la API, y si la petición falla el botón
     VUELVE a como estaba: un control que miente es peor que no tenerlo. */
  const MODO_SP = { off: 'off', all: 'context', one: 'track' };
  const MODO_LOCAL = { off: 'off', context: 'all', track: 'one' };

  const pintarShuffle = () => {
    el.shuffleBtn.classList.toggle('active', state.shuffle);
  };
  const pintarRepeat = () => {
    el.repeatBtn.classList.toggle('active', state.repeat !== 'off');
    el.repeatBtn.classList.toggle('repeat-one', state.repeat === 'one');
    el.repeatBtn.title = { off: 'Repetir', all: 'Repetir todo', one: 'Repetir una' }[state.repeat];
  };

  const setShuffle = (on) => {
    const antes = state.shuffle;
    state.shuffle = !!on;
    pintarShuffle();
    if (spotifyActive() && window.SpotifyModule.setShuffle) {
      window.SpotifyModule.setShuffle(state.shuffle)
        .catch(() => { state.shuffle = antes; pintarShuffle(); });
    }
  };

  const setRepeat = (modo) => {
    const antes = state.repeat;
    state.repeat = modo;
    pintarRepeat();
    if (spotifyActive() && window.SpotifyModule.setRepeat) {
      window.SpotifyModule.setRepeat(MODO_SP[modo])
        .catch(() => { state.repeat = antes; pintarRepeat(); });
    }
  };

  el.shuffleBtn.addEventListener('click', () => setShuffle(!state.shuffle));
  el.repeatBtn.addEventListener('click', () => {
    setRepeat({ off: 'all', all: 'one', one: 'off' }[state.repeat]);
  });

  // Progress bar seek
  const seekFromEvent = (e) => {
    const rect = el.progressBar.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX) || 0) - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    if (spotifyActive()) {
      const durMs = (state.currentTrack.duration || 0) * 1000;
      if (durMs) window.SpotifyModule.seek(pct * durMs);
      return;
    }
    if (audio.duration) audio.currentTime = pct * audio.duration;
  };
  el.progressBar.addEventListener('click', seekFromEvent);

  // ---- Volumen ----
  let lastNonZeroVol = state.volume > 0 ? state.volume : 0.7;
  let spVolTimer = null;

  const paintVolume = () => {
    const pct = Math.round(state.volume * 100);
    el.volumeFill.style.width = pct + '%';
    el.volumeThumb.style.left = pct + '%';
    el.volPct.textContent = pct;
    el.volBtn.classList.toggle('muted', state.volume === 0);
    el.volBtn.classList.toggle('low', state.volume > 0 && state.volume < 0.5);
    el.volBtn.title = state.volume === 0 ? 'Activar sonido (M)' : 'Silenciar (M)';
  };

  // Spotify Connect: mandar el volumen con debounce para no saturar la API
  const syncSpotifyVolume = () => {
    if (!spotifyActive() || !window.SpotifyModule.setVolume) return;
    clearTimeout(spVolTimer);
    spVolTimer = setTimeout(() => {
      window.SpotifyModule.setVolume(Math.round(state.volume * 100));
    }, 250);
  };

  const setVolume = (v) => {
    v = Math.max(0, Math.min(1, v));
    state.volume = v;
    audio.volume = v;
    if (v > 0) lastNonZeroVol = v;
    localStorage.setItem('mm_volume', String(v));
    paintVolume();
    syncSpotifyVolume();
  };

  /* Igual que setVolume pero SIN devolvérselo a Spotify: este valor VIENE de
     Spotify. Pasar por setVolume armaría un ida y vuelta (lo recibo, lo
     reenvío, me lo confirman, lo reenvío…). */
  const adoptVolume = (v) => {
    v = Math.max(0, Math.min(1, v));
    state.volume = v;
    audio.volume = v;
    if (v > 0) lastNonZeroVol = v;
    localStorage.setItem('mm_volume', String(v));
    paintVolume();
  };

  /* El estado real llega del sondeo de spotify.js. Sirve para que los botones
     se enteren de lo que pasa FUERA de la app: si pones aleatorio desde el
     móvil, aquí se enciende solo. Se pinta directamente, sin pasar por los
     manejadores del clic, así que esto no puede rebotar en otra petición. */
  window.addEventListener('mm:spotify-modes', (e) => {
    const d = e.detail || {};
    if (typeof d.shuffle === 'boolean' && d.shuffle !== state.shuffle) {
      state.shuffle = d.shuffle;
      pintarShuffle();
    }
    const local = MODO_LOCAL[d.repeat];
    if (local && local !== state.repeat) {
      state.repeat = local;
      pintarRepeat();
    }
    /* El volumen del aparato se adopta SOLO al cambiar de dispositivo, no en
       cada sondeo: si se adoptara siempre, arrastrar la barra pelearía cada
       2 s contra la respuesta del sondeo anterior y el tirador saltaría. */
    if (d.deviceChanged && d.device && typeof d.device.volume_percent === 'number') {
      adoptVolume(d.device.volume_percent / 100);
    }
  });

  const volFromEvent = (e) => {
    const rect = el.volumeBar.getBoundingClientRect();
    if (!rect.width) return;
    setVolume((e.clientX - rect.left) / rect.width);
  };
  el.volumeBar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.volumeBar.setPointerCapture(e.pointerId);
    el.volumeCtl.classList.add('dragging');
    volFromEvent(e);
  });
  el.volumeBar.addEventListener('pointermove', (e) => {
    if (e.buttons & 1) volFromEvent(e);
  });
  el.volumeBar.addEventListener('lostpointercapture', () => el.volumeCtl.classList.remove('dragging'));

  /* Con ratón el botón silencia (la barra ya se despliega sola al pasar
     por encima). Con el dedo NO hay hover, así que la barra no aparecía
     nunca: ahí el botón la abre. Silenciar sin querer, sin barra a la
     vista que lo explique, es de las cosas que más parecen una app rota:
     con el dedo se baja arrastrando hasta el cero. */
  el.volBtn.addEventListener('click', () => {
    if (window.MMPerf && window.MMPerf.tactil()) {
      el.volumeCtl.classList.toggle('abierta');
      return;
    }
    setVolume(state.volume > 0 ? 0 : lastNonZeroVol);
  });

  // tocar fuera la cierra (si no, se queda flotando encima de los botones)
  document.addEventListener('pointerdown', (e) => {
    if (!el.volumeCtl.classList.contains('abierta')) return;
    if (!e.target.closest('.volume-ctl')) el.volumeCtl.classList.remove('abierta');
  }, { passive: true });

  // Rueda del mouse sobre el control = subir/bajar de a 5%
  el.volumeCtl.addEventListener('wheel', (e) => {
    e.preventDefault();
    setVolume(state.volume + (e.deltaY < 0 ? 0.05 : -0.05));
  }, { passive: false });

  paintVolume();

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowRight' && e.shiftKey) playNext();
    else if (e.code === 'ArrowLeft' && e.shiftKey) playPrev();
    else if (e.code === 'ArrowRight') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
    else if (e.code === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
    else if (e.code === 'ArrowUp') { e.preventDefault(); setVolume(state.volume + 0.05); }
    else if (e.code === 'ArrowDown') { e.preventDefault(); setVolume(state.volume - 0.05); }
    else if (e.code === 'KeyM') setVolume(state.volume > 0 ? 0 : lastNonZeroVol);
  });

  // Spotify button (delegated to spotify.js)
  el.spotifyConnectBtn.addEventListener('click', () => {
    if (window.SpotifyModule) window.SpotifyModule.connect();
  });

  /* ---- Posición y salto, sin que cada módulo repita el desvío a Spotify ----
     Con Spotify Connect el audio NO pasa por el navegador: la posición la
     lleva el reloj interpolado de spotify.js, no `audio.currentTime`. Antes
     cada módulo nuevo tenía que acordarse de eso; ahora se pregunta aquí. */
  const position = () => {
    if (spotifyActive() && window.SpotifyModule.position) return window.SpotifyModule.position();
    return audio.currentTime || 0;
  };

  const duration = () => {
    if (state.currentTrack && state.currentTrack.duration) return state.currentTrack.duration;
    return audio.duration || 0;
  };

  const playing = () => {
    if (spotifyActive() && window.SpotifyModule.playing) return window.SpotifyModule.playing();
    return !audio.paused && !!audio.src;
  };

  const seekTo = (sec) => {
    const dur = duration();
    const s = Math.max(0, dur ? Math.min(dur, sec) : sec);
    if (spotifyActive()) { window.SpotifyModule.seek(s * 1000); return; }
    if (audio.duration) audio.currentTime = s;
  };

  /* ---- Aviso de cambio de canción ----
     La sesión de medios y el mini flotante necesitan enterarse de que cambió
     la pista. En vez de que cada uno monte su propio temporizador (y su
     propia comparación), hay UNO que compara la firma y avisa a todos.
     La firma incluye la carátula porque el sistema operativo la muestra. */
  const trackSubs = [];
  let trackFirma = null;
  const revisarTrack = () => {
    const t = state.currentTrack;
    const firma = t ? `${t.id}|${t.name}|${t.artist || ''}|${t.cover || ''}` : '';
    if (firma === trackFirma) return;
    trackFirma = firma;
    trackSubs.forEach((fn) => { try { fn(t); } catch (err) { console.warn('onTrack:', err); } });
  };
  setInterval(revisarTrack, 500);

  // ---- Public API (usado por spotify.js / visualizer.js / seven.js) ----
  window.PlayerCore = {
    state,
    audio,
    addFiles,
    playTrackById,
    // Control central: los módulos nuevos (sesión de medios, mini flotante,
    // modo cine) mandan por aquí y el desvío a Spotify se resuelve solo.
    togglePlay,
    next: playNext,
    prev: playPrev,
    seek: seekTo,
    setVolume,
    setShuffle,
    setRepeat,      // 'off' | 'all' | 'one'
    position,
    duration,
    playing,
    isSpotify: () => !!spotifyActive(),
    formatTime,
    onTrack: (fn) => {
      if (typeof fn !== 'function') return;
      trackSubs.push(fn);
      if (state.currentTrack) { try { fn(state.currentTrack); } catch (err) { console.warn('onTrack:', err); } }
    },
    setUser: () => {},   // sin panel de usuario visible; se mantiene por compatibilidad
    setSpotifyConnected: (connected) => {
      /* Se marca en el <body> porque el móvil lo necesita: allí el volumen
         de la app se oculta (para eso están los botones del teléfono),
         PERO con Spotify Connect el volumen que importa es el del aparato
         remoto, y ese los botones físicos no lo tocan. Con esta clase el
         CSS lo devuelve solo cuando de verdad hace falta. */
      document.body.classList.toggle('spotify-conectado', !!connected);
      el.spotifyConnectBtn.classList.toggle('connected', connected);
      el.spotifyConnectBtn.innerHTML = connected
        ? `<span class="bracket">[</span> spotify conectado <span class="bracket">]</span>`
        : `<span class="bracket">[</span> conectar spotify <span class="bracket">]</span>`;
    },
  };

  // Init
  loadPersisted();
})();
