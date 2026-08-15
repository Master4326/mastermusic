/* ==========================================================
   Módulo Spotify — OAuth PKCE + Web API
   Sin backend, sin Client Secret.
   ========================================================== */
(() => {
  'use strict';

  const STORAGE = {
    CID: 'sp_client_id',
    TOKEN: 'sp_access_token',
    REFRESH: 'sp_refresh_token',
    EXPIRES: 'sp_expires_at',
    VERIFIER: 'sp_verifier',
  };

  // Spotify exige que la Redirect URI coincida EXACTAMENTE con la
  // registrada en el dashboard. Normalizamos para que abrir la app como
  // localhost, 127.0.0.1 o con /index.html dé siempre la misma URI:
  // http://127.0.0.1:5500/  (la que imprime server.js al arrancar).
  const REDIRECT_URI = window.location.origin.replace('//localhost', '//127.0.0.1')
    + window.location.pathname.replace(/index\.html$/, '');
  const SCOPES = [
    /* Aquí se pedían `user-read-private`, `user-read-email` y
       `user-read-currently-playing`. Los tres fuera:
       - private/email: NINGÚN código los leía. Y desde las reglas de
         feb-2026 `/me` ya ni devuelve email, country ni product, así que
         pedirlos era regalar dos líneas de miedo en la pantalla de
         consentimiento ("tu dirección de correo", "tus datos de suscripción")
         a cambio de nada. `loadUser` solo usa display_name/id/images, que
         vienen igual sin permiso alguno.
       - currently-playing: era para `/me/player/currently-playing`, que ya
         no se llama — el sondeo pide `/me/player`, que va con
         `user-read-playback-state` (el de abajo).
       Quitar permisos NO rompe las sesiones ya abiertas: el token que tengas
       simplemente lleva más de los que hacen falta. */
    'user-read-playback-state',
    'user-modify-playback-state',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read',
    // Necesarios para las secciones "recientes" y "top" de la biblioteca.
    // Si tu sesión es anterior a esto, desconecta y vuelve a conectar.
    'user-read-recently-played',
    'user-top-read',
    /* NO se pide `user-library-modify`: el ❤ se retiró porque Spotify
       responde 403 a las apps en modo desarrollo aunque lo concedas, y
       pedir un permiso que no se usa solo asusta en la pantalla de
       consentimiento ("Agregar y eliminar elementos en Tu biblioteca"). */
  ].join(' ');

  // -------- PKCE helpers --------
  const randomString = (length) => {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  };

  const sha256 = async (text) => {
    const buf = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return new Uint8Array(hash);
  };

  const base64url = (bytes) => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  // -------- Client ID modal --------
  const askClientId = () => new Promise((resolve) => {
    const existing = localStorage.getItem(STORAGE.CID) || '';
    const modal = document.createElement('div');
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(8px)">
        <div style="background:#181818;border-radius:12px;padding:32px;max-width:520px;width:90%;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
          <h2 style="margin-bottom:8px;font-size:22px">Conectar con Spotify</h2>
          <p style="color:#b3b3b3;font-size:13px;margin-bottom:16px;line-height:1.5">
            Necesitas un <b>Client ID</b> gratuito de Spotify. Pasos:
          </p>
          <ol style="color:#b3b3b3;font-size:13px;margin:0 0 16px 18px;line-height:1.7">
            <li>Abre <a href="https://developer.spotify.com/dashboard" target="_blank" style="color:#1db954">developer.spotify.com/dashboard</a></li>
            <li>Login con tu cuenta normal de Spotify</li>
            <li>"Create app" → nombre libre (ej. "Mi Reproductor")</li>
            <li><b>Redirect URI:</b><br><code style="background:#000;padding:4px 8px;border-radius:4px;font-size:12px;word-break:break-all">${REDIRECT_URI}</code></li>
            <li>Marca <b>"Web API"</b> y guarda</li>
            <li>Copia el <b>Client ID</b> y pégalo aquí abajo</li>
          </ol>
          <input id="cidInput" placeholder="Pega tu Client ID aquí" value="${existing}"
            style="width:100%;padding:12px;border-radius:6px;background:#000;border:1px solid #333;color:#fff;font-size:14px;margin-bottom:12px;outline:none" />
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button id="cidCancel" style="padding:10px 18px;background:transparent;border:1px solid #555;border-radius:999px;color:#fff;cursor:pointer;font-weight:600">Cancelar</button>
            <button id="cidOk" style="padding:10px 18px;background:#1db954;border:none;border-radius:999px;color:#000;cursor:pointer;font-weight:700">Continuar</button>
          </div>
          <p style="color:#666;font-size:11px;margin-top:14px">
            Necesitas Spotify Premium para controlar la reproducción. Tu Client ID se guarda solo en tu navegador.
          </p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const input = modal.querySelector('#cidInput');
    input.focus();
    const close = (val) => { document.body.removeChild(modal); resolve(val); };
    modal.querySelector('#cidOk').onclick = () => {
      const v = input.value.trim();
      if (v) { localStorage.setItem(STORAGE.CID, v); close(v); }
    };
    modal.querySelector('#cidCancel').onclick = () => close(null);
    input.onkeydown = (e) => { if (e.key === 'Enter') modal.querySelector('#cidOk').click(); };
  });

  // -------- Auth flow --------
  const startAuth = async () => {
    let clientId = localStorage.getItem(STORAGE.CID);
    if (!clientId) {
      clientId = await askClientId();
      if (!clientId) return;
    }

    const verifier = randomString(64);
    localStorage.setItem(STORAGE.VERIFIER, verifier);
    const challenge = base64url(await sha256(verifier));

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      scope: SCOPES,
    });
    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  };

  const exchangeCode = async (code) => {
    const clientId = localStorage.getItem(STORAGE.CID);
    const verifier = localStorage.getItem(STORAGE.VERIFIER);
    if (!clientId || !verifier) return false;

    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return false;
    const data = await res.json();
    saveTokens(data);
    // limpieza de la marca que dejó el ❤ retirado (sesiones anteriores)
    try { localStorage.removeItem('mm_like_bloqueado'); } catch (x) {}
    return true;
  };

  const refreshToken = async () => {
    const clientId = localStorage.getItem(STORAGE.CID);
    const refresh = localStorage.getItem(STORAGE.REFRESH);
    if (!clientId || !refresh) return false;
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    });
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return false;
    const data = await res.json();
    saveTokens(data);
    return true;
  };

  const saveTokens = (data) => {
    if (data.access_token) localStorage.setItem(STORAGE.TOKEN, data.access_token);
    if (data.refresh_token) localStorage.setItem(STORAGE.REFRESH, data.refresh_token);
    if (data.expires_in) localStorage.setItem(STORAGE.EXPIRES, String(Date.now() + data.expires_in * 1000));
  };

  const isLoggedIn = () => {
    const tok = localStorage.getItem(STORAGE.TOKEN);
    const exp = parseInt(localStorage.getItem(STORAGE.EXPIRES) || '0', 10);
    return tok && Date.now() < exp;
  };

  const getValidToken = async () => {
    if (isLoggedIn()) return localStorage.getItem(STORAGE.TOKEN);
    if (await refreshToken()) return localStorage.getItem(STORAGE.TOKEN);
    return null;
  };

  // -------- Web API helpers --------
  const api = async (path, opts = {}) => {
    const token = await getValidToken();
    if (!token) throw new Error('No token');
    const res = await fetch('https://api.spotify.com/v1' + path, {
      ...opts,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });
    if (res.status === 204) return null;
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Spotify API ${res.status}: ${txt}`);
    }
    /* Cuerpo vacío con 200: le pasa a PUT/DELETE /me/tracks (guardar y quitar
       de "Tus me gusta"), que responden OK sin JSON. res.json() reventaría
       ahí y el corazón parecería fallar habiendo funcionado. */
    const txt = await res.text();
    if (!txt) return null;
    try { return JSON.parse(txt); } catch (e) { return null; }
  };

  // -------- Polling current playback --------
  let pollTimer = null;
  let lastTrackId = null;
  let lastIsPlaying = false;   // último estado conocido (lo refresca el polling)

  /* Aparato y modos, que ANTES no se sabían. El sondeo pedía
     `/me/player/currently-playing`, que devuelve la pista y poco más;
     `/me/player` cuesta exactamente lo mismo —una petición cada 2 s— y
     además trae el dispositivo activo, su volumen real y el estado de
     aleatorio/repetir. Sin eso, los botones de aleatorio y repetir no tenían
     forma de saber cómo estaba Spotify de verdad. */
  let lastDevice = null;       // {id, name, type, volume_percent} o null
  let lastShuffle = null;      // true/false; null = todavía no se sabe
  let lastRepeat = null;       // 'off' | 'context' | 'track'

  /* Avisa UNA vez por cambio, no en cada sondeo. Quien pinta los botones
     escucha este evento; nadie llama al manejador del clic, así que pintar
     desde aquí no puede disparar una petición de vuelta. */
  const leerModos = (data) => {
    const dev = data.device || null;
    const sh = typeof data.shuffle_state === 'boolean' ? data.shuffle_state : null;
    const rp = data.repeat_state || null;
    const idAntes = lastDevice ? lastDevice.id : null;
    const idAhora = dev ? dev.id : null;
    const cambioDev = idAhora !== idAntes;
    if (!cambioDev && sh === lastShuffle && rp === lastRepeat) return;
    lastDevice = dev;
    lastShuffle = sh;
    lastRepeat = rp;
    window.dispatchEvent(new CustomEvent('mm:spotify-modes', {
      detail: { shuffle: sh, repeat: rp, device: dev, deviceChanged: cambioDev },
    }));
    if (cambioDev) pintarChipAparato();
  };

  // El polling llega cada 2s; entre poll y poll interpolamos con un reloj
  // local para que la letra y la barra avancen suaves a 60fps en vez de
  // dar saltos de 2 segundos.
  let progBase = 0;    // progreso (s) reportado en el último poll
  let progStamp = 0;   // performance.now() de ese poll
  let progDur = 0;     // duración (s) de la pista actual
  let rafId = null;

  const paintProgress = (sec) => {
    const pct = progDur ? Math.min(100, (sec / progDur) * 100) : 0;
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressThumb').style.left = pct + '%';
    document.getElementById('timeCurrent').textContent = formatTime(sec);
    if (window.LyricsModule) window.LyricsModule.tick(sec);
  };

  const smoothLoop = () => {
    rafId = requestAnimationFrame(smoothLoop);
    if (!lastIsPlaying || !progStamp) return;
    const st = window.PlayerCore && window.PlayerCore.state;
    if (st && st.isPreview) return;   // el preview de 30s ya lo mueve el audio local
    const sec = progBase + (performance.now() - progStamp) / 1000;
    paintProgress(progDur ? Math.min(progDur, sec) : sec);
  };

  const startPolling = () => {
    if (pollTimer) return;
    const poll = async () => {
      try {
        const t0 = performance.now();
        const data = await api('/me/player');
        const t1 = performance.now();
        // Los modos se leen aunque no haya pista sonando: puede haber un
        // aparato despierto y en pausa, y el aleatorio sigue teniendo estado.
        if (data) leerModos(data);
        if (data && data.item) {
          const it = data.item;
          const track = {
            id: 'sp:' + it.id,
            name: it.name,
            artist: it.artists.map(a => a.name).join(', '),
            album: it.album ? it.album.name : '',
            duration: it.duration_ms / 1000,
            cover: it.album && it.album.images && it.album.images[0] ? it.album.images[0].url : null,
            url: null,
            spotify: true,
            uri: it.uri,
          };
          // Update now playing bar
          document.getElementById('npTitle').textContent = track.name;
          document.getElementById('npArtist').textContent = track.artist;
          const npCover = document.getElementById('npCover');
          if (npCover && track.cover) {
            npCover.style.backgroundImage = `url('${track.cover}')`;
            npCover.innerHTML = '';
          }
          const coverArt = document.getElementById('coverArt');
          if (coverArt && track.cover) {
            coverArt.style.backgroundImage = `url('${track.cover}')`;
            coverArt.style.backgroundSize = 'cover';
            coverArt.style.backgroundPosition = 'center';
            coverArt.innerHTML = '';
          }
          document.getElementById('timeTotal').textContent = formatTime(track.duration);
          // Re-ancla el reloj local con el progreso real; smoothLoop interpola
          // entre polls para que letra y barra no salten cada 2s.
          const playing = !!data.is_playing;
          if (data.progress_ms != null) {
            // Compensa la latencia de red: el progreso reportado corresponde
            // aprox. al punto medio de la petición, no al momento de recibirla.
            let anchor = data.progress_ms / 1000 + (playing ? (t1 - t0) / 2000 : 0);
            // Anti-jitter: re-anclar en seco cada 2s hacía saltar el tiempo
            // ±200ms (la línea activa de la letra parpadeaba o volvía atrás
            // y se re-animaba). Diferencias pequeñas se corrigen suave; solo
            // un salto real (seek, cambio de canción) re-ancla directo.
            const est = (progStamp && lastIsPlaying && track.id === lastTrackId)
              ? progBase + (t1 - progStamp) / 1000
              : null;
            if (playing && est !== null && Math.abs(anchor - est) < 0.8) {
              anchor = est + (anchor - est) * 0.35;
            }
            progBase = anchor;
            progStamp = t1;
            progDur = it.duration_ms / 1000;
            // Reproduciendo pinta el rAF (smoothLoop); en pausa pintamos aquí
            if (!playing) paintProgress(progBase);
          }
          // Update play icon
          lastIsPlaying = playing;
          document.getElementById('playIcon').hidden = playing;
          document.getElementById('pauseIcon').hidden = !playing;
          document.body.classList.toggle('playing', playing);

          if (track.id !== lastTrackId) {
            lastTrackId = track.id;
            window.PlayerCore.state.currentTrack = track;
            if (window.LyricsModule) window.LyricsModule.fetch(track);
          }
        }
      } catch (e) {
        // silently ignore (e.g. nothing playing)
      }
    };
    poll();
    pollTimer = setInterval(poll, 2000);
    if (!rafId) smoothLoop();
  };

  const stopPolling = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    progStamp = 0;
    // Sin sondeo no se sabe nada del aparato: dejarlo puesto haría que la
    // barra de estado siguiera diciendo dónde suena algo que ya no suena.
    lastDevice = null;
    lastShuffle = null;
    lastRepeat = null;
    pintarChipAparato();
  };

  // -------- Controles de reproducción (Spotify Connect) --------
  // app.js delega aquí cuando la canción actual es de Spotify.
  const spTogglePlay = async () => {
    try {
      await api(lastIsPlaying ? '/me/player/pause' : '/me/player/play', { method: 'PUT' });
      lastIsPlaying = !lastIsPlaying;
      // Refleja el cambio al instante; el polling lo confirma después.
      document.getElementById('playIcon').hidden = lastIsPlaying;
      document.getElementById('pauseIcon').hidden = !lastIsPlaying;
      document.body.classList.toggle('playing', lastIsPlaying);
      startPolling();
    } catch (e) {
      setStatus('✕ Spotify no respondió. Abre la app de Spotify (Premium) en algún dispositivo.');
    }
  };

  const spNext = async () => {
    try {
      await api('/me/player/next', { method: 'POST' });
      lastTrackId = null;          // fuerza al polling a refrescar la canción
      startPolling();
    } catch (e) { setStatus('✕ no se pudo saltar de canción (¿hay un dispositivo activo?)'); }
  };

  const spPrev = async () => {
    try {
      await api('/me/player/previous', { method: 'POST' });
      lastTrackId = null;
      startPolling();
    } catch (e) { setStatus('✕ no se pudo volver atrás (¿hay un dispositivo activo?)'); }
  };

  const spSetVolume = async (pct) => {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    try { await api('/me/player/volume?volume_percent=' + pct, { method: 'PUT' }); }
    catch (e) { /* algunos dispositivos no aceptan volumen remoto; silencioso */ }
  };

  /* Aleatorio y repetir en el aparato de verdad. Hasta ahora estos dos
     botones SOLO cambiaban una variable de app.js: con Spotify Connect se
     encendían y la reproducción seguía exactamente igual. Los dos LANZAN el
     error a propósito — quien pulsó necesita saber que no se aplicó para
     devolver el botón a su sitio, que es peor mentira que no tenerlo. */
  const spSetShuffle = async (on) => {
    try {
      await api('/me/player/shuffle?state=' + (on ? 'true' : 'false'), { method: 'PUT' });
      lastShuffle = !!on;
    } catch (e) {
      setStatus('✕ Spotify no aceptó el aleatorio (¿hay un dispositivo activo?)');
      throw e;
    }
  };

  // modo: 'off' | 'context' (toda la lista) | 'track' (una canción)
  const spSetRepeat = async (modo) => {
    try {
      await api('/me/player/repeat?state=' + modo, { method: 'PUT' });
      lastRepeat = modo;
    } catch (e) {
      setStatus('✕ Spotify no aceptó el modo de repetición (¿hay un dispositivo activo?)');
      throw e;
    }
  };

  /* Encolar en vez de interrumpir. Hasta ahora, desde buscar o desde la
     biblioteca solo se podía «reproducir ya», que corta en seco lo que esté
     sonando: para apuntar una canción para dentro de un rato había que
     acordarse de ella. `POST /me/player/queue` la mete detrás de la actual. */
  const spQueue = async (uri, nombre) => {
    if (!uri) return;
    try {
      await api('/me/player/queue?uri=' + encodeURIComponent(uri), { method: 'POST' });
      setStatus('＋ en cola: ' + (nombre || 'canción'));
      // Si la cola está abierta, que se vea entrar
      if (window.SevenQueueRefresh) window.SevenQueueRefresh();
    } catch (e) {
      /* El motivo literal importa: sin dispositivo activo Spotify responde
         404 «NO_ACTIVE_DEVICE», que es un problema distinto de un 403. */
      setStatus(/404/.test(e.message)
        ? '✕ no hay ningún dispositivo activo en Spotify: abre la app y dale al play'
        : '✕ no se pudo encolar. ' + detalleSpotify(e));
    }
  };

  /* Saca el mensaje que manda Spotify dentro del cuerpo del error. Los 403 de
     esta API se tragan el motivo si no se hace esto — ya pasó tres veces en
     este proyecto (biblioteca, playlists y el ❤). */
  const detalleSpotify = (e) => {
    const m = String(e && e.message || '');
    const j = m.slice(m.indexOf('{'));
    try { return JSON.parse(j).error.message || m; } catch (x) { return m; }
  };

  /* -------- Dónde suena (Spotify Connect) --------
     La app siempre fue un mando a distancia sin saberlo: manda play, pausa,
     volumen y seek a un aparato que elige Spotify por su cuenta. Con esto se
     puede además VER cuáles hay y mandar la música a otro. */
  const spDevices = async () => {
    const d = await api('/me/player/devices');
    return (d && Array.isArray(d.devices)) ? d.devices : [];
  };

  const spTransfer = async (id) => {
    /* `play` lleva el estado ACTUAL a propósito: si estaba en pausa, cambiar
       de altavoz no debería ponerse a sonar de golpe (p. ej. de madrugada). */
    await api('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [id], play: !!lastIsPlaying }),
    });
  };

  const spSeek = async (ms) => {
    try {
      await api('/me/player/seek?position_ms=' + Math.round(ms), { method: 'PUT' });
      // re-ancla el reloj local ya, sin esperar al siguiente poll (2s)
      progBase = ms / 1000;
      progStamp = performance.now();
      paintProgress(progBase);
    }
    catch (e) { setStatus('✕ no se pudo adelantar en Spotify'); }
  };

  /* Aquí vivieron estaGuardada()/guardar(), el ❤ de "Tus me gusta".
     Retirados el 2026-08-12: `PUT /me/tracks` devuelve **403 Forbidden** a
     secas a las apps en modo desarrollo, con el permiso `user-library-modify`
     concedido y todo (verificado en vivo tras reconectar). Es el mismo muro
     que tapa `/playlists/{id}/tracks`. No reimplementar: el botón no puede
     funcionar hasta que Spotify cambie las reglas. */

  const formatTime = (s) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const setStatus = (msg) => {
    if (window.SevenStatus) window.SevenStatus(msg);
    else { const s = document.getElementById('statusText'); if (s) s.textContent = msg; }
  };

  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  // -------- Search & play tracks from the app --------
  let searchResults = [];
  let searchTimer = null;

  const showSearchBlock = (show) => {
    const block = document.getElementById('spotifySearchBlock');
    if (block) block.hidden = !show;
    const hint = document.getElementById('searchHint');
    if (hint) hint.hidden = show;
  };

  /* -------- Últimas búsquedas --------
     Volver a una búsqueda de hace un minuto era volver a teclearla entera.
     Se guardan 8, sin repetir y con la más reciente delante. */
  const CLAVE_REC = 'mm_busquedas';
  const MAX_REC = 8;

  const leerRecientes = () => {
    try {
      const v = JSON.parse(localStorage.getItem(CLAVE_REC) || '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX_REC) : [];
    } catch (e) { return []; }
  };

  const anotarReciente = (q) => {
    const t = q.trim();
    if (t.length < 2) return;
    const lista = leerRecientes().filter((x) => x.toLowerCase() !== t.toLowerCase());
    lista.unshift(t);
    try { localStorage.setItem(CLAVE_REC, JSON.stringify(lista.slice(0, MAX_REC))); } catch (e) {}
    pintarRecientes();
  };

  const pintarRecientes = () => {
    const caja = document.getElementById('spotifyRecientes');
    if (!caja) return;
    const lista = leerRecientes();
    caja.hidden = !lista.length;
    if (!lista.length) { caja.innerHTML = ''; return; }
    caja.innerHTML = '<span class="sp-rec-tit">últimas:</span>'
      + lista.map((q) => `<button class="sp-rec" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('')
      + '<button class="sp-rec sp-rec-borrar" data-borrar="1" title="Borrar el historial">✕</button>';
  };

  // Esqueletos: mejor que dejar la lista vacía mientras Spotify contesta
  const pintarCargando = () => {
    const list = document.getElementById('spotifyResults');
    if (!list) return;
    list.innerHTML = Array.from({ length: 5 }, () => `
      <li class="skel">
        <div class="skel-box"></div>
        <div class="skel-lines"><div class="skel-line"></div><div class="skel-line short"></div></div>
      </li>`).join('');
  };

  const renderResults = (consulta) => {
    const list = document.getElementById('spotifyResults');
    if (!list) return;
    if (!searchResults.length) {
      list.innerHTML = consulta
        ? `<li class="sp-empty">▒ nada para «${escapeHtml(consulta)}» ▒<br>
             <span class="sp-empty-tip">prueba con el nombre del artista, o con menos palabras</span></li>`
        : `<li class="sp-empty sp-empty-inicio">
             <span class="sp-empty-ico">♫</span>
             <b>busca lo que quieras oír</b>
             <span class="sp-empty-tip">canción, artista o las dos cosas · <kbd>F</kbd> abre esto desde cualquier sitio</span>
           </li>`;
      return;
    }
    list.innerHTML = searchResults.map((t, i) => `
      <li class="sp-result" data-idx="${i}" tabindex="0">
        <div class="sp-thumb" ${t.cover ? `style="background-image:url('${t.cover}')"` : ''}>${t.cover ? '' : '♪'}</div>
        <div class="sp-meta">
          <div class="sp-name">${escapeHtml(t.name)}</div>
          <div class="sp-artist">${escapeHtml(t.artist)}${t.album ? ` <span class="sp-alb">· ${escapeHtml(t.album)}</span>` : ''}</div>
        </div>
        <div class="sp-dur">${formatTime(t.duration)}</div>
        <button class="sp-queue" title="Añadir a la cola">＋</button>
        <button class="sp-play" title="Reproducir ahora">▶</button>
      </li>
    `).join('');
  };

  /* Secuencia contra respuestas cruzadas: al teclear rápido salen varias
     peticiones y la lenta puede contestar DESPUÉS de la nueva, dejando en
     pantalla los resultados de lo que ya no está escrito. Misma solución
     que en lyrics.js. */
  let seqBusqueda = 0;

  const doSearch = async (query) => {
    const q = query.trim();
    const mia = ++seqBusqueda;
    if (!q) { searchResults = []; renderResults(''); return; }
    pintarCargando();
    try {
      // limit máx. 10: desde feb-2026 Spotify limita las búsquedas de apps
      // en development mode a 10 resultados (más devuelve 400 "Invalid limit").
      const data = await api('/search?type=track&limit=10&q=' + encodeURIComponent(q));
      if (mia !== seqBusqueda) return;
      const items = (data && data.tracks && data.tracks.items) || [];
      searchResults = items.map(it => ({
        id: 'sp:' + it.id,
        uri: it.uri,
        name: it.name,
        artist: it.artists.map(a => a.name).join(', '),
        album: it.album ? it.album.name : '',
        duration: it.duration_ms / 1000,
        cover: it.album && it.album.images && it.album.images[0] ? it.album.images[0].url : null,
        preview: it.preview_url || null,
        spotify: true,
      }));
      renderResults(q);
      if (searchResults.length) anotarReciente(q);
    } catch (e) {
      if (mia !== seqBusqueda) return;
      searchResults = [];
      const list = document.getElementById('spotifyResults');
      if (!list) return;
      const emsg = (e && e.message) || '';
      let msg;
      if (/No token/.test(emsg) || /Spotify API 401/.test(emsg)) {
        // Token caducado o ausente: el botón mentía "conectado".
        // Lo dejamos honesto y pedimos reconectar.
        try { window.PlayerCore.setSpotifyConnected(false); } catch {}
        msg = 'Tu sesión de Spotify caducó. Pulsa <b>[ conectar spotify ]</b> otra vez.<br>'
            + 'Para tu propia música usa <b>[ importar música ]</b> (no necesita Spotify).';
      } else {
        const m = emsg.match(/Spotify API (\d+):\s*([\s\S]*)$/);
        let detail = '';
        if (m && m[2]) {
          try { detail = JSON.parse(m[2]).error.message || ''; } catch { detail = m[2].slice(0, 120); }
        }
        console.error('[Spotify search] fallo:', emsg);
        msg = m
          ? `Spotify rechazó la búsqueda (error ${m[1]}).${detail ? '<br><b>' + escapeHtml(detail) + '</b>' : ''}`
          : 'No se pudo buscar en Spotify (sin conexión). Inténtalo de nuevo.';
      }
      list.innerHTML = `<li class="sp-empty" style="line-height:1.6">▒ ${msg} ▒</li>`;
    }
  };

  // Show a Spotify track in the now-playing bar (used by preview fallback)
  const showNowPlaying = (t) => {
    document.getElementById('npTitle').textContent = t.name;
    document.getElementById('npArtist').textContent = t.artist;
    const npCoverEl = document.getElementById('coverArt') || document.getElementById('npCover');
    if (npCoverEl && t.cover) {
      npCoverEl.style.backgroundImage = `url('${t.cover}')`;
      npCoverEl.style.backgroundSize = 'cover';
      npCoverEl.innerHTML = '';
    }
    document.getElementById('timeTotal').textContent = formatTime(t.duration);
    window.PlayerCore.state.currentTrack = t;
    if (window.LyricsModule) window.LyricsModule.fetch(t);
  };

  // Reproduce un contexto entero (playlist / álbum), opcionalmente empezando
  // en una pista concreta. Así la cola de Spotify sigue con el resto.
  const playContext = async (contextUri, offsetUri) => {
    const body = { context_uri: contextUri };
    if (offsetUri) body.offset = { uri: offsetUri };
    await api('/me/player/play', { method: 'PUT', body: JSON.stringify(body) });
    lastTrackId = null;
    lastIsPlaying = true;
    if (window.PlayerCore) window.PlayerCore.state.isPreview = false;
    startPolling();
  };

  // contextUri (opcional): reproduce la pista dentro de su playlist/álbum
  const playTrack = async (t, contextUri) => {
    if (!t) return;
    setStatus('▣ cargando: ' + t.name);
    try {
      // Full playback via Spotify Connect (requiere Premium + un dispositivo activo)
      const body = contextUri
        ? { context_uri: contextUri, offset: { uri: t.uri } }
        : { uris: [t.uri] };
      await api('/me/player/play', { method: 'PUT', body: JSON.stringify(body) });
      lastTrackId = null;          // fuerza al polling a refrescar la canción
      lastIsPlaying = true;
      window.PlayerCore.state.isPreview = false;
      startPolling();
      setStatus('▶ reproduciendo en Spotify: ' + t.name);
    } catch (e) {
      // Fallback: preview de 30s por el reproductor local
      if (t.preview && window.PlayerCore) {
        const audio = window.PlayerCore.audio;
        audio.src = t.preview;
        audio.play().catch(() => {});
        window.PlayerCore.state.isPlaying = true;
        window.PlayerCore.state.isPreview = true;
        document.getElementById('playIcon').hidden = true;
        document.getElementById('pauseIcon').hidden = false;
        showNowPlaying(t);
        setStatus('▶ preview 30s · para la canción completa necesitas Spotify Premium con la app abierta');
      } else {
        setStatus('✕ sin dispositivo activo. Abre Spotify (Premium) en tu móvil/PC y vuelve a intentar.');
        alert('Para reproducir la canción completa necesitas:\n\n· Spotify Premium\n· La app de Spotify abierta en algún dispositivo\n\nEsta canción tampoco tiene preview de 30s disponible.');
      }
    }
  };

  const wireSearch = () => {
    const input = document.getElementById('spotifySearchInput');
    const limpiar = document.getElementById('spotifyClear');

    if (input && !input._wired) {
      input._wired = true;
      const refrescarX = () => { if (limpiar) limpiar.hidden = !input.value; };
      input.addEventListener('input', () => {
        refrescarX();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => doSearch(input.value), 350);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();      // que no cierre el cine ni ningún panel
          if (input.value) { input.value = ''; refrescarX(); doSearch(''); }
          else input.blur();
        } else if (e.key === 'Enter') {
          clearTimeout(searchTimer);
          doSearch(input.value);
        }
      });
      refrescarX();
    }

    if (limpiar && !limpiar._wired) {
      limpiar._wired = true;
      limpiar.addEventListener('click', () => {
        input.value = '';
        limpiar.hidden = true;
        doSearch('');
        input.focus();
      });
    }

    const recientes = document.getElementById('spotifyRecientes');
    if (recientes && !recientes._wired) {
      recientes._wired = true;
      recientes.addEventListener('click', (e) => {
        const btn = e.target.closest('.sp-rec');
        if (!btn) return;
        if (btn.dataset.borrar) {
          try { localStorage.removeItem(CLAVE_REC); } catch (x) {}
          pintarRecientes();
          return;
        }
        input.value = btn.dataset.q;
        if (limpiar) limpiar.hidden = false;
        clearTimeout(searchTimer);
        doSearch(btn.dataset.q);
      });
      pintarRecientes();
    }

    const list = document.getElementById('spotifyResults');
    if (list && !list._wired) {
      list._wired = true;
      const pistaDe = (row) => searchResults[parseInt(row.dataset.idx, 10)];
      const lanzar = (row) => {
        const t = pistaDe(row);
        if (t) playTrack(t);
      };
      list.addEventListener('click', (e) => {
        const row = e.target.closest('.sp-result');
        if (!row) return;
        /* El ＋ va DENTRO de la fila, y la fila entera reproduce: sin parar
           aquí, encolar reproduciría además la canción — justo lo contrario
           de lo que pide quien la encola. */
        if (e.target.closest('.sp-queue')) {
          e.stopPropagation();
          const t = pistaDe(row);
          if (t) spQueue(t.uri, t.name);
          return;
        }
        lanzar(row);
      });
      // con teclado: las filas son focusables, Enter reproduce
      list.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const row = e.target.closest('.sp-result');
        if (!row) return;
        e.preventDefault();
        lanzar(row);
      });
      renderResults('');
    }
  };

  /* -------- Chip «dónde suena» + su menú --------
     El menú se cuelga del <body>, NO de la barra de estado. En este proyecto
     ya mordió cinco veces la misma trampa: un `position: fixed` dentro de un
     ancestro con `transform` se ancla AL ANCESTRO, no a la pantalla. Colgando
     de <body> no hay ancestro que pueda tener transform, y de paso no lo
     recorta el `overflow` de la barra. */
  let devMenu = null;
  let devAbierto = false;

  const chip = () => document.getElementById('devChip');

  const pintarChipAparato = () => {
    const c = chip();
    if (!c) return;
    const nom = document.getElementById('devName');
    if (lastDevice && lastDevice.name) {
      if (nom) nom.textContent = lastDevice.name;
      c.hidden = false;
      c.classList.toggle('dev-restringido', !!lastDevice.is_restricted);
    } else {
      c.hidden = !isLoggedIn();     // conectado pero sin aparato: se puede elegir uno
      if (nom) nom.textContent = 'elegir dispositivo';
      c.classList.remove('dev-restringido');
    }
  };

  const cerrarMenuDev = () => {
    devAbierto = false;
    if (devMenu) devMenu.hidden = true;
    const c = chip();
    if (c) c.setAttribute('aria-expanded', 'false');
  };

  const colocarMenuDev = () => {
    const c = chip();
    if (!c || !devMenu) return;
    const r = c.getBoundingClientRect();
    const ancho = devMenu.offsetWidth || 220;
    // La barra de estado vive abajo del todo: el menú abre hacia ARRIBA
    devMenu.style.left = Math.round(
      Math.max(8, Math.min(window.innerWidth - ancho - 8, r.right - ancho))) + 'px';
    devMenu.style.bottom = Math.round(window.innerHeight - r.top + 6) + 'px';
  };

  const iconoAparato = (tipo) => ({
    Computer: '▭', Smartphone: '▯', Speaker: '◉', TV: '▣',
    CastVideo: '▣', CastAudio: '◉', AVR: '◉', STB: '▣', GameConsole: '◈',
  }[tipo] || '♪');

  const pintarMenuDev = (lista) => {
    if (!lista.length) {
      devMenu.innerHTML = `<div class="dev-vacio">
        ▒ ningún dispositivo a la vista ▒
        <span>abre Spotify en el móvil o el PC y dale al play una vez</span>
      </div>`;
      return;
    }
    devMenu.innerHTML = lista.map((d) => `
      <button class="dev-item${d.is_active ? ' activo' : ''}" role="menuitem"
        data-id="${escapeHtml(d.id || '')}" ${d.is_restricted ? 'disabled' : ''}
        title="${d.is_restricted ? 'Spotify no permite controlar este dispositivo desde fuera' : ''}">
        <span class="dev-item-ico" aria-hidden="true">${iconoAparato(d.type)}</span>
        <span class="dev-item-nom">${escapeHtml(d.name || 'sin nombre')}</span>
        ${d.is_active ? '<span class="dev-item-marca">sonando</span>' : ''}
      </button>`).join('');
  };

  const abrirMenuDev = async () => {
    if (!devMenu) {
      devMenu = document.createElement('div');
      devMenu.className = 'dev-menu';
      devMenu.id = 'devMenu';
      devMenu.setAttribute('role', 'menu');
      devMenu.hidden = true;
      document.body.appendChild(devMenu);
      devMenu.addEventListener('click', async (e) => {
        const it = e.target.closest('.dev-item');
        if (!it || !it.dataset.id) return;
        cerrarMenuDev();
        try {
          await spTransfer(it.dataset.id);
          setStatus('◎ mandado a ' + it.querySelector('.dev-item-nom').textContent);
          lastTrackId = null;      // que el sondeo refresque sin esperar
          startPolling();
        } catch (err) {
          setStatus('✕ no se pudo cambiar de dispositivo. ' + detalleSpotify(err));
        }
      });
    }
    devAbierto = true;
    devMenu.hidden = false;
    const c = chip();
    if (c) c.setAttribute('aria-expanded', 'true');
    devMenu.innerHTML = '<div class="dev-vacio">▒ buscando dispositivos… ▒</div>';
    colocarMenuDev();
    try {
      pintarMenuDev(await spDevices());
    } catch (e) {
      devMenu.innerHTML = `<div class="dev-vacio">▒ no se pudo consultar ▒
        <span>${escapeHtml(detalleSpotify(e))}</span></div>`;
    }
    colocarMenuDev();   // el alto cambió al pintar la lista
  };

  const cablearChipDev = () => {
    const c = chip();
    if (!c || c._wired) return;
    c._wired = true;
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      if (devAbierto) cerrarMenuDev(); else abrirMenuDev();
    });
    document.addEventListener('click', () => { if (devAbierto) cerrarMenuDev(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && devAbierto) cerrarMenuDev();
    });
    window.addEventListener('resize', () => { if (devAbierto) colocarMenuDev(); });
  };

  // -------- Public --------
  const loadUser = async () => {
    try {
      const me = await api('/me');
      window.PlayerCore.setUser(me.display_name || me.id, (me.images && me.images[0]) ? me.images[0].url : null);
      window.PlayerCore.setSpotifyConnected(true);
      showSearchBlock(true);
      pintarChipAparato();   // conectado: el chip ya puede ofrecer elegir aparato
      if (window.LibraryModule) window.LibraryModule.onAuthChange(true);
      startPolling();
    } catch (e) {
      console.warn('Spotify load user failed', e);
    }
  };

  const connect = async () => {
    if (isLoggedIn()) {
      const ok = confirm('Ya estás conectado a Spotify. ¿Cerrar sesión?');
      if (ok) {
        localStorage.removeItem(STORAGE.TOKEN);
        localStorage.removeItem(STORAGE.REFRESH);
        localStorage.removeItem(STORAGE.EXPIRES);
        stopPolling();
        showSearchBlock(false);
        searchResults = [];
        renderResults();
        window.PlayerCore.setSpotifyConnected(false);
        window.PlayerCore.setUser('Invitado', null);
        if (window.LibraryModule) window.LibraryModule.onAuthChange(false);
      }
      return;
    }
    await startAuth();
  };

  // -------- Handle redirect with ?code=... --------
  const init = async () => {
    cablearChipDev();
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (error) {
      alert('Error de autorización Spotify: ' + error);
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.pathname);
    }
    if (code) {
      const ok = await exchangeCode(code);
      url.searchParams.delete('code');
      url.searchParams.delete('state');
      window.history.replaceState({}, '', url.pathname);
      if (ok) await loadUser();
    } else if (isLoggedIn()) {
      await loadUser();
    } else if (localStorage.getItem(STORAGE.REFRESH)) {
      if (await refreshToken()) await loadUser();
    }
    wireSearch();
  };

  window.SpotifyModule = {
    connect, api, search: doSearch, playTrack, playContext, isLoggedIn,
    togglePlay: spTogglePlay, next: spNext, prev: spPrev, seek: spSeek,
    setVolume: spSetVolume,
    setShuffle: spSetShuffle, setRepeat: spSetRepeat,
    queue: spQueue,
    // Último estado conocido del aparato y los modos (lo refresca el sondeo)
    device: () => lastDevice,
    shuffle: () => lastShuffle,
    repeat: () => lastRepeat,
    /* Posición interpolada: el mismo reloj que mueve la barra y la letra
       entre poll y poll. Sin esto, quien preguntara por el minuto actual con
       Spotify Connect recibiría el 0 del <audio> local, que está parado. */
    position: () => {
      if (!progStamp) return progBase;
      if (!lastIsPlaying) return progBase;
      const sec = progBase + (performance.now() - progStamp) / 1000;
      return progDur ? Math.min(progDur, sec) : sec;
    },
    playing: () => lastIsPlaying,
  };

  // Wait for PlayerCore to be ready
  document.addEventListener('DOMContentLoaded', () => {
    if (window.PlayerCore) init();
    else window.addEventListener('load', init);
  });
  // If DOM is already loaded
  if (document.readyState !== 'loading') {
    setTimeout(init, 0);
  }
})();
