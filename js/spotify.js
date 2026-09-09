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
    SCOPES: 'sp_scopes_v',
  };

  // Spotify exige que la Redirect URI coincida EXACTAMENTE con la
  // registrada en el dashboard. Normalizamos para que abrir la app como
  // localhost, 127.0.0.1 o con /index.html dé siempre la misma URI:
  // http://127.0.0.1:5500/  (la que imprime server.js al arrancar).
  const REDIRECT_URI = window.location.origin.replace('//localhost', '//127.0.0.1')
    + window.location.pathname.replace(/index\.html$/, '');
  /* Sube este número CADA VEZ que cambien los SCOPES de abajo. Un token ya
     emitido conserva para siempre los permisos con los que nació, y refrescarlo
     no le añade ninguno: la única forma de ganar un permiso nuevo es volver a
     pasar por la pantalla de autorización. Guardamos aquí con qué versión se
     autorizó la sesión para poder decirlo en vez de fallar sin explicación. */
  const SCOPES_V = '3';

  const SCOPES = [
    /* `user-read-currently-playing` fuera: era para
       `/me/player/currently-playing`, que ya no se llama — el sondeo pide
       `/me/player`, que va con `user-read-playback-state` (el de abajo).

       `user-read-email` y `user-read-private` VUELVEN (se habían quitado por
       inútiles, y lo eran: desde feb-2026 `/me` ya ni devuelve email, country
       ni product). Ahora hacen falta por otra razón: el **Web Playback SDK**
       los exige junto con `streaming` para arrancar, aunque su contenido no
       se lea en ningún sitio. Sin los tres, la música no puede sonar en esta
       pestaña y volveríamos a depender de tener Spotify abierto aparte. */
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'playlist-read-private',
    'playlist-read-collaborative',
    /* Para la lista puente de la radio (ver `listaRadio`). Spotify SOLO
       enciende su autoplay —el de verdad, el que pone artistas parecidos—
       cuando lo que suena es un CONTEXTO; con una canción suelta (`uris`) se
       calla al acabar. La única forma de darle un contexto a una canción
       cualquiera es meterla en una playlist nuestra, y para eso hace falta
       este permiso. Es `-private`: la lista se crea oculta. */
    'playlist-modify-private',
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
    /* Solo AQUÍ se apunta la versión de permisos, nunca en refreshToken():
       un token refrescado hereda los permisos del original, así que refrescar
       no pone al día nada. Esto se escribe al salir de la pantalla de
       autorización, que es el único momento en que se conceden de verdad. */
    try { localStorage.setItem(STORAGE.SCOPES, SCOPES_V); } catch (x) {}
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
    programarRenovacion();
  };

  /* -------- Renovar el token ANTES de que caduque --------

     El token dura una hora y hasta ahora solo se renovaba de rebote, cuando
     algo fallaba al usarlo. Eso dejaba un agujero conocido: con la app
     abierta más de una hora sin reproducir nada, nadie tocaba el token, y al
     ir a buscar o abrir la biblioteca salía «conecta spotify» aunque
     siguieras conectado — había que recargar.

     El sondeo cada 2 s lo tapaba sin querer (cada petición pasa por
     `getValidToken`). Ahora que sonando en esta pestaña YA NO hay sondeo, el
     agujero quedaba del todo al aire. Así que se renueva por reloj, un minuto
     antes de la hora, suene algo o no. */
  let renovTimer = null;

  const renovarAhora = async () => {
    // Si sale bien, `saveTokens` vuelve a programar sola con la caducidad nueva
    if (await refreshToken()) return;
    console.warn('[Spotify] no se pudo renovar el token; se reintenta en 5 min');
    clearTimeout(renovTimer);
    renovTimer = setTimeout(renovarAhora, 300000);
  };

  const programarRenovacion = () => {
    clearTimeout(renovTimer);
    if (!localStorage.getItem(STORAGE.REFRESH)) return;
    const exp = parseInt(localStorage.getItem(STORAGE.EXPIRES) || '0', 10);
    /* Un minuto de margen. El mínimo de 5 s es para el caso de abrir la app
       con el token ya caducado: renovar, pero no en el mismo suspiro que el
       arranque. */
    renovTimer = setTimeout(renovarAhora, Math.max(5000, exp - Date.now() - 60000));
  };

  const isLoggedIn = () => {
    const tok = localStorage.getItem(STORAGE.TOKEN);
    const exp = parseInt(localStorage.getItem(STORAGE.EXPIRES) || '0', 10);
    return tok && Date.now() < exp;
  };

  /* ¿La sesión abierta trae los permisos de AHORA? Una sesión de antes del
     SDK sigue siendo válida para buscar y para mandar a otro aparato, pero no
     puede reproducir aquí: le falta `streaming`. Conviene decirlo antes de
     intentarlo, no después de un error críptico del SDK. */
  const scopesAlDia = () => localStorage.getItem(STORAGE.SCOPES) === SCOPES_V;

  const getValidToken = async () => {
    if (isLoggedIn()) return localStorage.getItem(STORAGE.TOKEN);
    if (await refreshToken()) return localStorage.getItem(STORAGE.TOKEN);
    return null;
  };

  /* -------- FRENO ANTE EL 429 --------

     Spotify contesta **429 Too Many Requests** cuando se le pide demasiado en
     poco rato, y hasta ahora la app no lo miraba: `poll()` se tragaba el error
     en silencio y dos segundos después volvía a preguntar. Igual con todo lo
     demás. O sea que en cuanto caías en el 429 **te quedabas dentro**, porque
     seguías pidiendo sin parar y cada intento renueva el castigo. Con la app
     abierta en una pestaña eso son ~30 peticiones por minuto para siempre,
     aunque no suene nada, más las de la cola y las de la biblioteca.

     Ahí estaba el fallo de verdad detrás de «no salen las canciones»: la
     biblioteca, las playlists y la cola pedían y recibían 429, y la app lo
     enseñaba como si la playlist estuviera vacía.

     Ahora, al primer 429 se apunta HASTA CUÁNDO hay que callarse y las
     llamadas siguientes fallan al instante sin tocar la red. Se respeta la
     cabecera `Retry-After` si Spotify la deja leer; si no (no siempre se
     expone a otro origen), se dobla la espera en cada 429 seguido —5, 10, 20,
     40 s…— con tope de cinco minutos. Un acierto la reinicia. */
  let bloqueadoHasta = 0;      // marca de tiempo hasta la que no se pide nada
  let esperaSeguida = 0;       // segundos de la última espera, para doblarla

  const ESPERA_MIN = 5, ESPERA_MAX = 300;

  const frenado = () => Math.max(0, bloqueadoHasta - Date.now());

  const frenar = (res) => {
    const cabecera = parseInt((res && res.headers.get('Retry-After')) || '0', 10);
    esperaSeguida = cabecera > 0
      ? Math.min(ESPERA_MAX, cabecera)
      : Math.min(ESPERA_MAX, Math.max(ESPERA_MIN, esperaSeguida * 2 || ESPERA_MIN));
    bloqueadoHasta = Date.now() + esperaSeguida * 1000;
    console.warn(`[Spotify] 429: en pausa ${esperaSeguida}s` +
      (cabecera > 0 ? ' (lo pide Retry-After)' : ' (sin Retry-After legible)'));
    setStatus(`◷ spotify pidió esperar · reintentando en ${esperaSeguida}s`);
  };

  // -------- Web API helpers --------
  const api = async (path, opts = {}) => {
    /* Frenados: se falla aquí mismo, SIN tocar la red. Es lo único que saca
       de un 429; seguir pidiendo solo alarga el castigo. */
    const resto = frenado();
    if (resto) throw new Error(`Spotify API 429: espera ${Math.ceil(resto / 1000)}s`);

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
    if (res.status === 429) { frenar(res); throw new Error('Spotify API 429: demasiadas peticiones'); }
    esperaSeguida = 0;                 // una respuesta buena limpia la cuenta
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

  /* ==========================================================
     REPRODUCTOR DENTRO DE LA PESTAÑA (Web Playback SDK)

     Hasta aquí la app era SOLO un mando a distancia: sabía pedirle a Spotify
     «pon esto», pero necesitaba que hubiera un aparato encendido al otro
     lado. De ahí venía lo de tener que abrir Spotify primero — sin aparato,
     el mando apunta a la nada y la API contesta 404 NO_ACTIVE_DEVICE.

     El SDK le da la vuelta: carga un reproductor de Spotify DENTRO de esta
     página y la convierte en un aparato más de Spotify Connect, llamado
     MASTER MUSIC. A partir de ahí no hay que abrir nada: se entra a la web,
     se le da al play y suena aquí.

     Tres cosas que conviene tener presentes:
     · Hace falta **Premium** (ya hacía falta antes para controlar la
       reproducción) y los permisos `streaming` + email + private.
     · El audio va cifrado (DRM). NO se puede enchufar a un AnalyserNode, así
       que el visualizador y el ◈ siguen dependiendo del micrófono. Esto no
       es un fallo que arreglar: el navegador no da acceso a ese audio.
     · Si algo de esto falta —cuenta free, navegador sin DRM, bloqueador que
       se come scdn.co, sesión vieja sin `streaming`— NO se rompe nada: se
       apaga el SDK y la app vuelve a ser el mando a distancia de siempre.
     ========================================================== */
  const NOMBRE_APARATO = 'MASTER MUSIC';
  const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

  let sdkPlayer = null;      // instancia de Spotify.Player
  let sdkDeviceId = null;    // nuestro id de aparato, cuando está listo
  let sdkActivo = false;     // ¿lo que suena, suena AQUÍ?
  let sdkIntento = null;     // promesa del arranque, para no arrancar dos veces
  let sdkVetado = false;     // el navegador o la cuenta no pueden: no reintentar
  /* Aparato al que van los play. null = esta pestaña, que es justo lo que
     evita tener que abrir Spotify. Lo cambia el usuario desde el chip. */
  let destinoElegido = null;
  /* Lo que suena y lo que viene detrás, tal cual lo entrega el SDK. Con el
     mando a distancia esto NO se podía saber sin pedir `/me/player/queue`;
     ahora llega gratis en cada cambio de estado y da de comer a dos cosas:
     la precarga de la letra siguiente y la pestaña de cola. */
  let ventana = null;
  let ultimaPrecarga = null;   // para no repetir la misma precarga en cada evento

  const somos = (id) => !!id && id === sdkDeviceId;

  /* Si el SDK no llegó a arrancar devuelve null, y entonces las llamadas van
     sin `device_id`: exactamente el comportamiento de antes, con Spotify
     eligiendo aparato por su cuenta. */
  const destino = () => destinoElegido || sdkDeviceId || null;

  const conDestino = (path) => {
    const id = destino();
    if (!id) return path;
    return path + (path.includes('?') ? '&' : '?') + 'device_id=' + id;
  };

  /* -------- Seguir donde ibas --------
     Pega NUEVA que trae el SDK, y conviene tenerla clara: como el aparato es
     esta misma pestaña, al recargar la página el aparato desaparece y la
     música se corta. Antes no pasaba porque quien sonaba era el móvil.

     Se apunta cada pocos segundos qué sonaba y por qué minuto iba. Al volver
     a abrir, la canción aparece puesta en la barra —con su carátula y su
     letra— parada en ese punto, y el play la retoma justo ahí.

     NO se arranca sola a propósito: el navegador bloquea el audio que no ha
     pedido el usuario, y que la música se dispare al abrir una pestaña asusta
     más de lo que ayuda. */
  const CLAVE_ULTIMO = 'sp_ultimo';
  const ULTIMO_TTL = 12 * 3600 * 1000;   // pasado un día, retomar ya no tiene sentido
  let ultimoGuardado = 0;
  let reanudar = null;                   // {uri, ctx, pos} pendiente de retomar

  const guardarUltimo = (state) => {
    const it = state && state.track_window && state.track_window.current_track;
    if (!it) return;
    const ahora = Date.now();
    // Como mucho cada 5 s mientras suena; una pausa sí se apunta al momento.
    if (!state.paused && ahora - ultimoGuardado < 5000) return;
    ultimoGuardado = ahora;
    try {
      localStorage.setItem(CLAVE_ULTIMO, JSON.stringify({
        uri: it.uri,
        ctx: (state.context && state.context.uri) || null,
        pos: state.position || 0,
        t: ahora,
        // La pista entera, para poder repintarla al volver sin pedir nada
        pista: pistaDesde(it),
      }));
    } catch (e) {}
  };

  const olvidarUltimo = () => {
    reanudar = null;
    try { localStorage.removeItem(CLAVE_ULTIMO); } catch (e) {}
  };

  const restaurarUltimo = () => {
    if (reanudar || lastTrackId) return;   // ya hay algo puesto: no estorbar
    let d = null;
    try { d = JSON.parse(localStorage.getItem(CLAVE_ULTIMO) || 'null'); } catch (e) {}
    if (!d || !d.uri || !d.pista) return;
    if (Date.now() - (d.t || 0) > ULTIMO_TTL) { olvidarUltimo(); return; }

    reanudar = { uri: d.uri, ctx: d.ctx, pos: d.pos || 0 };
    pintarPista(d.pista);
    notarCambio(d.pista);        // deja la letra pedida ya, sin esperar al play
    progBase = (d.pos || 0) / 1000;
    progDur = d.pista.duration || 0;
    progStamp = 0;               // parado: que el reloj de la barra no lo mueva
    paintProgress(progBase);
    pintarPlay(false);
    /* Con retraso a propósito: `notarCambio` acaba de poner la canción en
       `PlayerCore`, y la barra de estado la repinta con el nombre de la pista
       en su repaso de cada 500 ms. Dicho ahora, el aviso duraría medio
       segundo. Dicho después, se queda. */
    setTimeout(() => {
      if (reanudar) setStatus('▸ dale al play para seguir donde lo dejaste');
    }, 900);
  };

  let avisoReconexion = false;
  const avisarReconexion = () => {
    if (avisoReconexion) return;
    avisoReconexion = true;
    setStatus('◎ tu sesión es anterior al reproductor propio · pulsa [ conectar spotify ] para autorizarlo');
  };

  const vetarSDK = (motivo, detalle) => {
    sdkVetado = true;
    sdkActivo = false;
    sdkDeviceId = null;
    console.warn('[Spotify SDK]', motivo, detalle || '');
    setStatus('◎ ' + motivo + ' · sigue funcionando como mando a distancia');
    try { if (sdkPlayer) sdkPlayer.disconnect(); } catch (e) {}
    sdkPlayer = null;
    pintarChipAparato();
    startPolling();
  };

  const cargarSDK = () => new Promise((resolve, reject) => {
    if (window.Spotify && window.Spotify.Player) { resolve(); return; }
    /* El gancho global tiene que estar puesto ANTES de meter el <script>: el
       SDK lo llama nada más cargarse y si no existe, se pierde el aviso. */
    window.onSpotifyWebPlaybackSDKReady = resolve;
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    // Los bloqueadores de rastreadores se comen scdn.co más de lo que parece.
    s.onerror = () => reject(new Error('no se pudo cargar el reproductor de Spotify'));
    document.head.appendChild(s);
  });

  /* iOS y Safari no dejan sonar un elemento de audio que no haya desbloqueado
     un gesto del usuario. Sin esto, el primer play en iPhone se queda mudo y
     SIN error: parece que la app está rota. */
  const desbloquearAlPrimerGesto = () => {
    const una = () => {
      document.removeEventListener('pointerdown', una);
      document.removeEventListener('keydown', una);
      if (sdkPlayer && sdkPlayer.activateElement) {
        sdkPlayer.activateElement().catch(() => {});
      }
    };
    document.addEventListener('pointerdown', una);
    document.addEventListener('keydown', una);
  };

  /* El corazón del asunto: el estado llega EMPUJADO por el SDK, no
     preguntando. Cada pausa, cada cambio de canción y cada seek disparan
     esto sin gastar ni una petición de la cuota. */
  const sdkEstado = (state) => {
    if (!state) {
      /* Estado nulo = ya no somos el aparato que suena (se la llevaron al
         móvil, o nos echaron). Hay que volver al sondeo: es la única forma
         de enterarse de lo que pasa fuera de esta pestaña. */
      if (sdkActivo) {
        sdkActivo = false;
        lastDevice = null;
        pintarChipAparato();
        startPolling();
      }
      return;
    }

    if (!sdkActivo) {
      sdkActivo = true;
      stopPolling(true);          // corta la red, deja vivo el reloj de la barra
      lastDevice = { id: sdkDeviceId, name: NOMBRE_APARATO, type: 'Computer', is_active: true };
      pintarChipAparato();
      if (!rafId) smoothLoop();
    }

    const it = state.track_window && state.track_window.current_track;
    if (it) {
      const track = pistaDesde(it);
      pintarPista(track);
      /* Sin compensación de latencia ni anti-jitter, al revés que el sondeo:
         esta posición no ha viajado por la red, es la del audio de aquí al
         lado. Lo que dice es exacto. */
      progBase = (state.position || 0) / 1000;
      progStamp = performance.now();
      progDur = (state.duration || it.duration_ms || 0) / 1000;
      if (state.paused) paintProgress(progBase);
      pintarPlay(!state.paused);
      notarCambio(track);
      if (window.PlayerCore) window.PlayerCore.state.isPreview = false;
    } else {
      pintarPlay(!state.paused);
    }

    /* La canción que viene: se precarga su letra AHORA, mientras suena la
       actual, para que al cambiar de pista salga sola. LRClib tarda ~6-7 s
       desde esta red, así que es la diferencia entre que la letra esté puesta
       al empezar la canción o que llegue por el primer estribillo. */
    ventana = state.track_window || null;
    const sig = ventana && ventana.next_tracks && ventana.next_tracks[0];
    if (sig && window.LyricsModule && window.LyricsModule.prefetch) {
      const clave = sig.uri || sig.id;
      if (clave && clave !== ultimaPrecarga) {
        ultimaPrecarga = clave;
        window.LyricsModule.prefetch(pistaDesde(sig));
      }
    }

    guardarUltimo(state);

    // Contexto y modos, lo mismo que `leerModos()` saca del sondeo
    lastContext = (state.context && state.context.uri) || null;
    const rep = ['off', 'context', 'track'][state.repeat_mode] || 'off';
    if (!!state.shuffle !== lastShuffle || rep !== lastRepeat) {
      lastShuffle = !!state.shuffle;
      lastRepeat = rep;
      window.dispatchEvent(new CustomEvent('mm:spotify-modes', {
        detail: { shuffle: lastShuffle, repeat: lastRepeat, device: lastDevice, deviceChanged: false },
      }));
    }
  };

  const arrancarSDK = () => {
    if (sdkIntento) return sdkIntento;
    if (sdkVetado) return Promise.resolve(false);
    /* Una sesión de antes de este cambio no tiene `streaming`, y el SDK
       fallaría con un error de autenticación que parece otra cosa. Mejor
       decirlo claro y no gastar la carga del script. */
    if (!scopesAlDia()) { avisarReconexion(); return Promise.resolve(false); }

    sdkIntento = cargarSDK().then(() => new Promise((resolve) => {
      const vol = (window.PlayerCore && window.PlayerCore.state)
        ? window.PlayerCore.state.volume : 0.7;

      sdkPlayer = new window.Spotify.Player({
        name: NOMBRE_APARATO,
        /* Se le da un token FRESCO cada vez que lo pide (también cuando el
           suyo caduca a la hora), no uno guardado al arrancar. */
        getOAuthToken: (cb) => { getValidToken().then((t) => { if (t) cb(t); }); },
        volume: Math.max(0, Math.min(1, vol)),
      });

      sdkPlayer.addListener('ready', ({ device_id }) => {
        sdkDeviceId = device_id;
        console.log('[Spotify] reproductor listo en esta pestaña:', device_id);
        pintarChipAparato();
        /* Ya hay dónde retomar: si no había nada sonando en ningún sitio, se
           deja puesta la canción de la última vez. */
        restaurarUltimo();
        resolve(true);
      });

      sdkPlayer.addListener('not_ready', ({ device_id }) => {
        if (sdkDeviceId === device_id) sdkDeviceId = null;
        if (sdkActivo) { sdkActivo = false; startPolling(); }
        pintarChipAparato();
      });

      sdkPlayer.addListener('player_state_changed', sdkEstado);

      // Navegador sin DRM (o con el DRM desactivado a mano)
      sdkPlayer.addListener('initialization_error', ({ message }) => {
        vetarSDK('este navegador no puede reproducir Spotify dentro de la página', message);
        resolve(false);
      });
      // Token sin `streaming`, o caducado sin poder renovarse
      sdkPlayer.addListener('authentication_error', ({ message }) => {
        console.warn('[Spotify SDK] autenticación:', message);
        sdkVetado = true;
        avisoReconexion = false;   // este aviso sí merece salir
        avisarReconexion();
        resolve(false);
      });
      // Cuenta free: el SDK no reproduce, punto
      sdkPlayer.addListener('account_error', ({ message }) => {
        vetarSDK('para que suene aquí hace falta Spotify Premium', message);
        resolve(false);
      });
      sdkPlayer.addListener('playback_error', ({ message }) => {
        console.warn('[Spotify SDK] reproducción:', message);
        setStatus('✕ Spotify no pudo reproducir esa pista aquí');
      });
      sdkPlayer.addListener('autoplay_failed', () => {
        setStatus('▸ toca la pantalla una vez: el navegador no deja arrancar el audio solo');
      });

      desbloquearAlPrimerGesto();
      sdkPlayer.connect().then((ok) => { if (!ok) resolve(false); });

      /* Red de seguridad: si `ready` no llega nunca, que la promesa no se
         quede colgada para siempre. El oyente sigue puesto por si llega
         tarde. */
      setTimeout(() => resolve(!!sdkDeviceId), 15000);
    })).catch((e) => {
      console.warn('[Spotify SDK] no arrancó:', e && e.message);
      return false;
    });

    return sdkIntento;
  };

  // -------- Polling current playback --------
  let pollTimer = null;
  // La reprograma startPolling(); vive aquí porque la usa el oyente de
  // visibilitychange, que se registra fuera.
  let reprogramar = () => {};
  let lastTrackId = null;
  let lastIsPlaying = false;   // último estado conocido (lo refresca el polling)

  /* Aparato y modos, que ANTES no se sabían. El sondeo pedía
     `/me/player/currently-playing`, que devuelve la pista y poco más;
     `/me/player` cuesta exactamente lo mismo —una petición cada 2 s— y
     además trae el dispositivo activo, su volumen real y el estado de
     aleatorio/repetir. Sin eso, los botones de aleatorio y repetir no tenían
     forma de saber cómo estaba Spotify de verdad. */
  let lastDevice = null;       // {id, name, type, volume_percent} o null
  /* De dónde sale lo que suena: la playlist / álbum / artista. Hace falta
     para que elegir una canción en la pestaña «cola» no rompa la cola: con
     el contexto se salta A esa canción DENTRO de la lista y lo que venía
     detrás se conserva; sin él, Spotify reproduce esa pista suelta y al
     acabar se queda callado. El sondeo ya pide /me/player, así que esto no
     cuesta ni una petición más. */
  let lastContext = null;      // 'spotify:playlist:…' o null
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

  let ultimaAncla = 0;   // último re-anclaje contra el reproductor de la pestaña

  const smoothLoop = () => {
    rafId = requestAnimationFrame(smoothLoop);
    if (!lastIsPlaying || !progStamp) return;
    const st = window.PlayerCore && window.PlayerCore.state;
    if (st && st.isPreview) return;   // el preview de 30s ya lo mueve el audio local
    const ahora = performance.now();

    /* Sonando aquí no hay sondeo que vuelva a poner el reloj en hora —esa es
       la gracia—, así que cada 10 s se lo preguntamos al propio reproductor.
       Es una lectura LOCAL: no toca la red ni gasta cuota. Sin esto, la barra
       y la letra se irían separando del audio en las canciones largas.
       La corrección es suave (el mismo 35% que usa el sondeo): re-anclar en
       seco hace parpadear la línea activa de la letra. */
    if (sdkActivo && sdkPlayer && ahora - ultimaAncla > 10000) {
      ultimaAncla = ahora;
      sdkPlayer.getCurrentState().then((s) => {
        if (!s || s.paused) return;
        const est = progBase + (performance.now() - progStamp) / 1000;
        const real = s.position / 1000;
        progBase = Math.abs(real - est) < 0.8 ? est + (real - est) * 0.35 : real;
        progStamp = performance.now();
      }).catch(() => {});
    }

    const sec = progBase + (ahora - progStamp) / 1000;
    paintProgress(progDur ? Math.min(progDur, sec) : sec);
  };

  /* -------- Pintado de la pista, compartido --------
     La misma canción llega ahora por DOS caminos: el sondeo de `/me/player`
     (cuando suena en otro aparato) y el evento `player_state_changed` del
     reproductor de esta pestaña (SDK). Los dos entregan la pista con la misma
     forma, así que el mapeo y el pintado se escriben una sola vez; lo que sí
     cambia entre uno y otro es cómo se ancla el reloj, y eso se queda en cada
     lado (el sondeo compensa la latencia de red; el SDK no la tiene). */
  const pistaDesde = (it) => ({
    // El SDK deja `id` en null para algunas pistas; el uri nunca falta.
    id: 'sp:' + (it.id || it.uri),
    name: it.name,
    artist: (it.artists || []).map((a) => a.name).join(', '),
    album: it.album ? it.album.name : '',
    duration: it.duration_ms / 1000,
    cover: it.album && it.album.images && it.album.images[0] ? it.album.images[0].url : null,
    url: null,
    spotify: true,
    uri: it.uri,
  });

  const pintarPista = (track) => {
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
  };

  const pintarPlay = (playing) => {
    lastIsPlaying = playing;
    document.getElementById('playIcon').hidden = playing;
    document.getElementById('pauseIcon').hidden = !playing;
    document.body.classList.toggle('playing', playing);
  };

  /* Va aparte del pintado a propósito: pedir la letra es caro y solo debe
     pasar cuando la canción cambia de verdad, no en cada refresco. */
  const notarCambio = (track) => {
    if (track.id === lastTrackId) return;
    lastTrackId = track.id;
    window.PlayerCore.state.currentTrack = track;
    if (window.LyricsModule) window.LyricsModule.fetch(track);
    /* Cambiar de canción es el ÚNICO momento en que la cola se acorta, así
       que es aquí donde la radio se repone. Es lo que hace que no se acabe:
       mientras la sesión siga viva, siempre quedan canciones por delante.
       Vale para los dos caminos —el SDK y el sondeo—, porque los dos pasan
       por aquí al cambiar de pista. */
    if (radio) rellenarRadio();
  };

  const startPolling = () => {
    /* Sonando en esta misma pestaña no hay NADA que preguntarle a la API: el
       estado llega solo por eventos del SDK. Se corta aquí, y no en cada
       llamador, porque `startPolling()` se llama desde diez sitios (play,
       pausa, siguiente, cambio de aparato…) y bastaría olvidarse de uno para
       volver a las 30 peticiones por minuto. El reloj de la barra sí tiene
       que seguir corriendo. */
    if (sdkActivo) { if (!rafId) smoothLoop(); return; }
    if (pollTimer) return;
    const poll = async () => {
      try {
        const t0 = performance.now();
        const data = await api('/me/player');
        const t1 = performance.now();
        // Los modos se leen aunque no haya pista sonando: puede haber un
        // aparato despierto y en pausa, y el aleatorio sigue teniendo estado.
        if (data) leerModos(data);
        if (data) lastContext = (data.context && data.context.uri) || null;
        if (data && data.item) {
          const it = data.item;
          const track = pistaDesde(it);
          /* Hay música de verdad en algún aparato: manda esa, no lo que
             dejamos apuntado de la última vez. */
          reanudar = null;
          pintarPista(track);
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
          pintarPlay(playing);
          notarCambio(track);
        }
      } catch (e) {
        // silently ignore (e.g. nothing playing)
      }
    };

    /* Cada cuánto volver a preguntar. Antes era `setInterval(poll, 2000)` a
       secas: 30 peticiones por minuto SIEMPRE, sonara algo o no, con la
       pestaña delante o enterrada detrás de otras veinte. Sumadas a las de la
       cola y la biblioteca, es lo que llevaba al 429.

       Los 2 s hacen falta SOLO mientras suena algo: son los que mantienen la
       barra de progreso en su sitio y los que hacen que un cambio de canción
       se note al momento. Parado no hay nada que refrescar, y en una pestaña
       de fondo tampoco hay nadie mirando. */
    const cuandoToca = () => {
      if (document.hidden) return 30000;              // nadie está mirando
      const resto = frenado();
      if (resto) return Math.min(60000, resto + 500); // esperar a que pase el 429
      return lastIsPlaying ? 2000 : 10000;
    };

    const siguiente = () => {
      pollTimer = setTimeout(async () => {
        if (!pollTimer) return;                       // lo pararon mientras tanto
        if (!document.hidden && !frenado()) await poll();
        if (pollTimer) siguiente();
      }, cuandoToca());
    };

    /* Volver a la pestaña tiene que refrescar YA: con el intervalo de fondo a
       30 s, si no, vuelves y sigue saliendo la canción de hace medio minuto.
       Se reprograma el temporizador que ya hay en vez de parar y arrancar el
       sondeo entero, porque `stopPolling()` borra también el aparato y los
       modos y haría parpadear el chip de «dónde suena» en cada cambio de
       pestaña. */
    reprogramar = () => {
      if (!pollTimer) return;
      clearTimeout(pollTimer);
      pollTimer = setTimeout(() => {}, 0);            // marca que sigue vivo
      poll().finally(() => { if (pollTimer) { clearTimeout(pollTimer); siguiente(); } });
    };

    poll();
    siguiente();
    if (!rafId) smoothLoop();
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !frenado()) reprogramar();
  });

  /* `soloRed`: corta las peticiones pero deja vivo el reloj de la barra y lo
     que se sabe del aparato. Lo usa el SDK al empezar a sonar aquí — ahí no
     hay que preguntar nada, pero la barra y la letra tienen que seguir
     moviéndose y el chip debe seguir diciendo dónde suena. Sin flag (cerrar
     sesión) se borra todo, que es lo que hacía antes. */
  const stopPolling = (soloRed) => {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    if (soloRed) return;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    progStamp = 0;
    // Sin sondeo no se sabe nada del aparato: dejarlo puesto haría que la
    // barra de estado siguiera diciendo dónde suena algo que ya no suena.
    lastDevice = null;
    lastShuffle = null;
    lastRepeat = null;
    lastContext = null;
    pintarChipAparato();
  };

  // -------- Controles de reproducción (Spotify Connect) --------
  // app.js delega aquí cuando la canción actual es de Spotify.
  /* Sonando en esta pestaña, play/pausa/siguiente/atrás/volumen/seek son
     llamadas LOCALES al reproductor: responden al instante, no gastan cuota
     y no pueden caer en el 429. Solo se sale a la API cuando la música va por
     otro aparato. */
  const spTogglePlay = async () => {
    /* Primer play tras recargar: en vez de un play a secas —que empezaría la
       canción desde el principio, o daría 404 si no hay aparato— se retoma la
       de la última vez por el minuto exacto en que se quedó. */
    if (reanudar && !lastIsPlaying) {
      const r = reanudar;
      reanudar = null;
      try {
        await arrancarSDK();
        const body = r.ctx
          ? { context_uri: r.ctx, offset: { uri: r.uri }, position_ms: r.pos }
          : { uris: [r.uri], position_ms: r.pos };
        await api(conDestino('/me/player/play'), { method: 'PUT', body: JSON.stringify(body) });
        lastTrackId = null;
        lastIsPlaying = true;
        startPolling();
        setStatus('▶ seguimos donde lo dejaste');
        return;
      } catch (e) {
        // Que falle no debe dejar el botón muerto: se sigue al play normal
        console.warn('[Spotify] no se pudo retomar:', e && e.message);
      }
    }
    if (sdkActivo && sdkPlayer) {
      // No hay que pintar nada a mano: `player_state_changed` llega solo.
      try { await sdkPlayer.togglePlay(); return; } catch (e) { /* cae a la API */ }
    }
    try {
      /* Con destino: darle al play sin nada sonando en ningún sitio era el
         404 de siempre. Apuntando a esta pestaña, arranca aquí. */
      await api(conDestino(lastIsPlaying ? '/me/player/pause' : '/me/player/play'), { method: 'PUT' });
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
    if (sdkActivo && sdkPlayer) {
      try { await sdkPlayer.nextTrack(); return; } catch (e) { /* cae a la API */ }
    }
    try {
      await api('/me/player/next', { method: 'POST' });
      lastTrackId = null;          // fuerza al polling a refrescar la canción
      startPolling();
    } catch (e) { setStatus('✕ no se pudo saltar de canción (¿hay un dispositivo activo?)'); }
  };

  const spPrev = async () => {
    if (sdkActivo && sdkPlayer) {
      try { await sdkPlayer.previousTrack(); return; } catch (e) { /* cae a la API */ }
    }
    try {
      await api('/me/player/previous', { method: 'POST' });
      lastTrackId = null;
      startPolling();
    } catch (e) { setStatus('✕ no se pudo volver atrás (¿hay un dispositivo activo?)'); }
  };

  const spSetVolume = async (pct) => {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    /* Este es el que más se ahorra: arrastrar la barra de volumen soltaba una
       petición por cada paso. En local es una llamada de nada. */
    if (sdkActivo && sdkPlayer) {
      try { await sdkPlayer.setVolume(pct / 100); return; } catch (e) {}
    }
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
      /* Con `device_id`: el SDK no tiene método local para aleatorio ni
         repetir, así que estos dos siguen saliendo a la API — pero apuntando
         a esta pestaña, que si no Spotify busca un aparato activo y sin
         ninguno responde 404. */
      await api(conDestino('/me/player/shuffle?state=' + (on ? 'true' : 'false')), { method: 'PUT' });
      lastShuffle = !!on;
    } catch (e) {
      setStatus('✕ Spotify no aceptó el aleatorio (¿hay un dispositivo activo?)');
      throw e;
    }
  };

  // modo: 'off' | 'context' (toda la lista) | 'track' (una canción)
  const spSetRepeat = async (modo) => {
    try {
      await api(conDestino('/me/player/repeat?state=' + modo), { method: 'PUT' });
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
      await arrancarSDK();
      await api(conDestino('/me/player/queue?uri=' + encodeURIComponent(uri)), { method: 'POST' });
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
    // Re-anclar el reloj vale para los dos caminos: el de aquí y el remoto.
    const anclar = () => {
      progBase = ms / 1000;
      progStamp = performance.now();
      paintProgress(progBase);
    };
    if (sdkActivo && sdkPlayer) {
      try { await sdkPlayer.seek(Math.round(ms)); anclar(); return; } catch (e) {}
    }
    try {
      await api('/me/player/seek?position_ms=' + Math.round(ms), { method: 'PUT' });
      // re-ancla el reloj local ya, sin esperar al siguiente poll (2s)
      anclar();
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
        /* Se guarda el id del artista principal, que antes se tiraba: es la
           puerta a `GET /artists/{id}`, el único sitio donde viven los
           géneros. Sin él, «sigue sonando» solo puede buscar por nombre. */
        artistId: (it.artists[0] && it.artists[0].id) || null,
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
    // Una playlist o un álbum ya continúan solos: se apaga la radio para que
    // no siga metiendo canciones detrás de otra cosa.
    pararRadio();
    await arrancarSDK();          // que exista el aparato antes de apuntarle
    const body = { context_uri: contextUri };
    if (offsetUri) body.offset = { uri: offsetUri };
    await api(conDestino('/me/player/play'), { method: 'PUT', body: JSON.stringify(body) });
    lastTrackId = null;
    lastIsPlaying = true;
    if (window.PlayerCore) window.PlayerCore.state.isPreview = false;
    startPolling();
  };

  /* -------- «Sigue sonando»: cola automática --------

     Poner una canción desde el buscador reproducía ESA y se acababa la
     música. En la app de Spotify no pasa: al terminar sigue con cosas
     parecidas. Esto lo imita.

     NO se puede hacer como lo hace Spotify. `GET /recommendations` —el
     endpoint que servía exactamente para esto— lleva muerto desde nov-2024 y
     responde 403 a las apps creadas después. Y aunque `context_uri` acepta
     artistas, `offset` **solo** funciona con álbum o playlist, así que
     tampoco vale el truco de «pon esta canción y sigue con el artista».

     Así que la lista se arma a mano con lo que queda vivo:
       · `GET /artists/{id}` → los géneros. Es el ÚNICO sitio donde están:
         las pistas no los traen.
       · `GET /search` con `artist:"…"` y `genre:"…"` → candidatas.
       · `POST /me/player/queue` → a la cola, en orden.

     Solo salta con una canción SUELTA. Desde una playlist o un álbum se
     reproduce en contexto y Spotify ya continúa con el resto por su cuenta.

     ---- NO SE ACABA ----
     La primera versión encolaba diez canciones y se callaba: eso no es una
     radio, es una lista corta. Ahora hay una SESIÓN de radio que sigue viva
     mientras suene, y **en cada cambio de canción se rellena la cola** para
     mantener siempre unas cuantas por delante. Mientras no pongas otra cosa,
     no se termina.

     La clave para que no se repita es el **`offset` de la búsqueda**: sin él,
     `genre:"reggaeton"` devolvería SIEMPRE las mismas diez y la radio giraría
     en bucle a los veinte minutos. Cada relleno va rotando entre las
     consultas (género 1, género 2, artista…) y pasando de página, con `vistas`
     guardando lo ya encolado para no repetir nunca. */
  const RADIO_COLCHON = 5;   // cuántas mantener siempre por delante
  const RADIO_INICIAL = 5;   // las de la primera tanda
  let radioSeq = 0;          // poner otra cosa cancela la radio anterior
  let radio = null;          // sesión viva: {generos, artista, vistas, turno…}

  const radioEncendida = () => localStorage.getItem('mm_radio') !== 'off';

  const pararRadio = () => { radioSeq++; radio = null; };

  const mezclar = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const buscarPistas = async (q, offset) => {
    try {
      // limit 10: el tope de las apps en modo desarrollo desde feb-2026.
      // offset llega hasta 1000, o sea 100 páginas por consulta.
      const d = await api('/search?type=track&limit=10&offset=' + (offset || 0)
        + '&q=' + encodeURIComponent(q));
      return ((d && d.tracks && d.tracks.items) || []).filter((x) => x && x.uri);
    } catch (e) { return []; }      // que falle una no debe tumbar la radio
  };

  /* Siguiente puñado de candidatas. Rota entre las consultas y va pasando
     páginas; cuando una consulta se agota, la rotación pasa sola a la
     siguiente y el `turno` sube, así que la radio nunca se queda seca. */
  const masCandidatas = async () => {
    const r = radio;
    if (!r || !r.consultas.length) return [];
    for (let intento = 0; intento < r.consultas.length * 2; intento++) {
      const q = r.consultas[r.turno % r.consultas.length];
      const pagina = Math.floor(r.turno / r.consultas.length);
      r.turno++;
      /* Tope del `offset` de Spotify: 1000, o sea 100 páginas por consulta.
         Son unas 3.000 canciones — más de un día seguido de música—, pero si
         alguien llega, la radio vuelve a empezar en vez de callarse: se
         olvida lo ya puesto (menos lo que suena ahora) y se repite catálogo.
         Repetirse a las 20 horas es mucho mejor que quedarse en silencio. */
      if (pagina > 99) {
        r.turno = 0;
        r.vistas = new Set();
        const actual = window.PlayerCore && window.PlayerCore.state.currentTrack;
        if (actual && actual.uri) r.vistas.add(actual.uri);
        continue;
      }
      const items = (await buscarPistas(q, pagina * 10)).filter((x) => !r.vistas.has(x.uri));
      if (items.length) return items;
    }
    return [];
  };

  // Encola de verdad. Devuelve cuántas entraron.
  const encolarPistas = async (lista, mia) => {
    let n = 0;
    for (const p of lista) {
      if (mia !== radioSeq) return n;             // pusieron otra cosa
      if (radio) radio.vistas.add(p.uri);
      try {
        await api(conDestino('/me/player/queue?uri=' + encodeURIComponent(p.uri)), { method: 'POST' });
        n++;
      } catch (e) {
        /* Un 429, o el aparato que se fue. Parar en seco: insistir con las
           que quedan solo alargaría el castigo del freno. */
        console.warn('[radio] cola cortada:', e && e.message);
        break;
      }
    }
    return n;
  };

  /* El relleno. Lo llama `notarCambio` en CADA cambio de canción, que es el
     único momento en que la cola se acorta. Con el SDK sabemos exactamente
     cuántas quedan por delante (`next_tracks`); sonando en otro aparato no
     hay forma de saberlo sin gastar peticiones, así que se repone una por
     canción, que mantiene el colchón igual de lleno. */
  const rellenarRadio = async () => {
    if (!radio || radio.rellenando || !radioEncendida()) return;
    const faltan = (sdkActivo && ventana && Array.isArray(ventana.next_tracks))
      ? RADIO_COLCHON - ventana.next_tracks.length
      : 1;
    if (faltan <= 0) return;

    radio.rellenando = true;
    const mia = radioSeq;
    try {
      let puestas = 0;
      // Dos vueltas como mucho: si en dos no salió nada, se deja para el
      // siguiente cambio de canción en vez de insistir aquí.
      for (let v = 0; v < 2 && puestas < faltan; v++) {
        const cand = await masCandidatas();
        if (mia !== radioSeq) return;
        if (!cand.length) break;
        puestas += await encolarPistas(mezclar(cand).slice(0, faltan - puestas), mia);
      }
      if (puestas && window.SevenQueueRefresh) window.SevenQueueRefresh();
    } finally {
      if (radio) radio.rellenando = false;
    }
  };

  /* ==========================================================
     EL AUTOPLAY DE VERDAD DE SPOTIFY (lista puente)

     Todo lo de arriba es una imitación: buscar por género y encolar. Está
     bien, pero no es lo que hace la app de Spotify — allí pones una canción
     de Kevin Kaarl y detrás llegan Ed Maverick, Milo j, Esperón. Eso lo
     decide el motor de recomendaciones de Spotify, y a ese motor no se llega
     por la API (`GET /recommendations` está muerto desde nov-2024).

     PERO hay una puerta: **Spotify solo enciende su autoplay cuando lo que
     suena es un CONTEXTO** (playlist o álbum). Con `uris: [una canción]` la
     música se para al acabar — es una limitación conocida y reportada desde
     hace años. Con una playlist, Spotify pone sus recomendaciones detrás.

     Así que a la canción suelta se le fabrica un contexto: una playlist
     privada nuestra, SIEMPRE LA MISMA, en la que se mete solo la canción que
     se va a poner, y se reproduce esa playlist. A partir de ahí manda el
     autoplay de Spotify: el de verdad, el mismo de la app.

     Cuesta 3 peticiones en vez de 1 (comprobar la lista, meter la canción,
     reproducir) y a cambio la radio la pone Spotify entera: cero peticiones
     después. Sale MÁS BARATO que la imitación por género, que gastaba una
     docena.

     Dos avisos honestos:
     · Crea UNA playlist privada en la cuenta del usuario. Se reutiliza para
       siempre y se sobrescribe en cada canción; no se acumula nada.
     · Depende de que el usuario tenga el «Autoplay» encendido en Spotify. Si
       no lo tiene, no llega nada — y para eso está `vigilarAutoplay`, que lo
       comprueba y enciende la radio por género como red de seguridad.
     ========================================================== */
  const CLAVE_LISTA = 'sp_lista_radio';
  const NOMBRE_LISTA = 'MASTER MUSIC · radio';
  const DESC_LISTA = 'La usa tu reproductor para que Spotify siga con música parecida. '
    + 'Se sobrescribe con cada canción; puedes borrarla cuando quieras.';

  const listaRadio = async () => {
    let id = localStorage.getItem(CLAVE_LISTA);
    if (id) {
      // Pudo borrarla desde Spotify: se comprueba antes de darla por buena
      try { await api('/playlists/' + id); return id; }
      catch (e) { try { localStorage.removeItem(CLAVE_LISTA); } catch (x) {} }
    }
    const d = await api('/me/playlists', {
      method: 'POST',
      body: JSON.stringify({ name: NOMBRE_LISTA, public: false, description: DESC_LISTA }),
    });
    id = d && d.id;
    if (id) { try { localStorage.setItem(CLAVE_LISTA, id); } catch (x) {} }
    return id || null;
  };

  // Devuelve true si consiguió poner la canción por la lista puente.
  const playPorPuente = async (t) => {
    try {
      const id = await listaRadio();
      if (!id) return false;
      // PUT reemplaza el contenido entero: la lista siempre tiene 1 canción
      await api('/playlists/' + id + '/items', {
        method: 'PUT', body: JSON.stringify({ uris: [t.uri] }),
      });
      await api(conDestino('/me/player/play'), {
        method: 'PUT', body: JSON.stringify({ context_uri: 'spotify:playlist:' + id }),
      });
      return true;
    } catch (e) {
      console.warn('[radio] la lista puente no salió, se tira de la radio propia:', e && e.message);
      return false;
    }
  };

  /* Red de seguridad. Si el usuario tiene el autoplay apagado en Spotify, o
     si a Spotify no le apetece recomendar nada, la lista puente deja la
     música muriéndose igual. Se mira una vez, a los segundos, y si detrás no
     hay nada se enciende la radio por género. */
  const vigilarAutoplay = async (t) => {
    await new Promise((r) => setTimeout(r, 7000));
    if (!radioEncendida() || radio) return;         // ya hay radio propia puesta
    if (lastTrackId && t.id && lastTrackId !== t.id) return;   // ya cambiaron de canción
    let hay = 1;
    if (sdkActivo && ventana && Array.isArray(ventana.next_tracks)) {
      hay = ventana.next_tracks.length;
    } else {
      // Sonando en otro aparato no se sabe sin preguntar: una petición, una vez
      try {
        const d = await api('/me/player/queue');
        hay = ((d && d.queue) || []).length;
      } catch (e) { return; }                       // ante la duda, no meter mano
    }
    if (hay > 0) return;                            // Spotify ya puso lo suyo
    console.warn('[radio] el autoplay de Spotify no puso nada; enciendo la radio por género');
    radiar(t);
  };

  // Abre la sesión de radio a partir de la canción que se acaba de poner.
  const radiar = async (t) => {
    if (!radioEncendida() || !t || !t.uri) return;
    pararRadio();
    const mia = radioSeq;

    let generos = [];
    if (t.artistId) {
      try {
        const a = await api('/artists/' + t.artistId);
        generos = (a && a.genres) || [];
      } catch (e) { /* sin géneros se tira solo del artista */ }
    }
    if (mia !== radioSeq) return;

    const artista = (t.artist || '').split(',')[0].trim();
    /* El orden de las consultas es el orden en que la radio va tirando. El
       género delante: es lo que pidió el usuario («música del género»), y
       poniendo el artista primero la radio empezaría pareciendo un disco
       suyo. El artista se queda como una consulta más de la rotación. */
    const consultas = generos.slice(0, 3).map((g) => 'genre:"' + g + '"');
    if (artista) consultas.push('artist:"' + artista + '"');
    if (!consultas.length) return;

    radio = {
      consultas,
      turno: 0,
      vistas: new Set([t.uri]),
      rellenando: false,
      genero: generos[0] || null,
    };

    const cand = await masCandidatas();
    if (mia !== radioSeq || !radio) return;
    const puestas = await encolarPistas(mezclar(cand).slice(0, RADIO_INICIAL), mia);
    if (mia !== radioSeq || !puestas) return;

    setStatus(radio.genero
      ? '◈ radio de ' + radio.genero + ' · seguirá sola al acabar'
      : '◈ radio encendida · seguirá sola al acabar');
    if (window.SevenQueueRefresh) window.SevenQueueRefresh();
  };

  // contextUri (opcional): reproduce la pista dentro de su playlist/álbum
  const playTrack = async (t, contextUri) => {
    if (!t) return;
    setStatus('▣ cargando: ' + t.name);
    /* Antes de mandar el play, que el reproductor de la pestaña esté
       levantado: si no, `conDestino()` no tendría a quién apuntar y con
       Spotify cerrado volveríamos al 404 de siempre. Después de la primera
       vez esto no cuesta nada (devuelve la promesa ya resuelta). */
    await arrancarSDK();
    try {
      /* Canción suelta y radio encendida: se pone por la LISTA PUENTE para
         que Spotify encienda su autoplay de verdad. Si eso falla (permiso
         que falta, red, lo que sea) se cae al play de siempre. */
      let porPuente = false;
      if (!contextUri && radioEncendida()) porPuente = await playPorPuente(t);

      if (!porPuente) {
        // Suena aquí mismo si el SDK arrancó; si no, en el aparato que haya
        const body = contextUri
          ? { context_uri: contextUri, offset: { uri: t.uri } }
          : { uris: [t.uri] };
        await api(conDestino('/me/player/play'), { method: 'PUT', body: JSON.stringify(body) });
      }
      lastTrackId = null;          // fuerza al polling a refrescar la canción
      lastIsPlaying = true;
      window.PlayerCore.state.isPreview = false;
      startPolling();
      setStatus(destino() && somos(destino())
        ? '▶ sonando aquí: ' + t.name
        : '▶ reproduciendo en Spotify: ' + t.name);
      /* Canción suelta: que al acabar no se quede la app en silencio. Si fue
         por la lista puente, la radio la pone Spotify y aquí solo se vigila
         que de verdad haya puesto algo; si no hubo puente, se enciende la
         nuestra. Sin `await`: la música ya suena y esto va por detrás. */
      if (!contextUri && radioEncendida()) {
        if (porPuente) {
          pararRadio();            // manda Spotify: que la nuestra no estorbe
          /* Con retraso, como el aviso de «seguir donde ibas»: la barra de
             estado repinta el nombre de la canción en su repaso de cada
             500 ms y se comería este mensaje. */
          setTimeout(() => setStatus('◈ radio de spotify · seguirá sola al acabar'), 900);
          vigilarAutoplay(t);
        } else {
          radiar(t);
        }
      }
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
        setStatus('▶ preview 30s · para la canción completa necesitas Spotify Premium');
      } else if (!scopesAlDia()) {
        /* Lo más probable a partir de este cambio: sesión abierta antes de
           que existiera el reproductor propio. No es culpa de la canción. */
        setStatus('◎ pulsa [ conectar spotify ] para autorizar el reproductor de esta pestaña');
        alert('Tu sesión de Spotify es anterior al reproductor propio.\n\nPulsa [ conectar spotify ] y autoriza otra vez: a partir de ahí la música suena aquí, sin tener que abrir Spotify en ningún sitio.');
      } else {
        setStatus('✕ no se pudo reproducir. ' + detalleSpotify(e));
        alert('No se pudo reproducir la canción completa.\n\n· Hace falta Spotify Premium.\n· Si tu navegador no admite contenido protegido (DRM), abre Spotify en el móvil o el PC y elígelo en «dónde suena».\n\nMotivo: ' + detalleSpotify(e));
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
      // Sonando aquí no hace falta el nombre del aparato: el aparato es esto.
      if (nom) nom.textContent = sdkActivo ? 'sonando aquí' : lastDevice.name;
      c.hidden = false;
      c.classList.toggle('dev-restringido', !!lastDevice.is_restricted);
    } else {
      c.hidden = !isLoggedIn();     // conectado pero sin aparato: se puede elegir uno
      if (nom) nom.textContent = sdkDeviceId ? 'sonará aquí' : 'elegir dispositivo';
      c.classList.remove('dev-restringido');
    }
    c.classList.toggle('dev-aqui', sdkActivo);
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
        <span>${sdkVetado
          ? 'este navegador no puede reproducir aquí: abre Spotify en el móvil o el PC'
          : 'abre Spotify en el móvil o el PC, o dale al play a una canción para que suene aquí'}</span>
      </div>`;
      return;
    }
    /* Esta pestaña primero: es el destino por defecto y el que evita tener
       que abrir Spotify, así que no debe quedar perdido entre los demás. */
    lista = lista.slice().sort((a, b) => (somos(b.id) ? 1 : 0) - (somos(a.id) ? 1 : 0));
    devMenu.innerHTML = lista.map((d) => `
      <button class="dev-item${d.is_active ? ' activo' : ''}${somos(d.id) ? ' es-aqui' : ''}" role="menuitem"
        data-id="${escapeHtml(d.id || '')}" ${d.is_restricted ? 'disabled' : ''}
        title="${d.is_restricted ? 'Spotify no permite controlar este dispositivo desde fuera' : ''}">
        <span class="dev-item-ico" aria-hidden="true">${somos(d.id) ? '◆' : iconoAparato(d.type)}</span>
        <span class="dev-item-nom">${escapeHtml(d.name || 'sin nombre')}${somos(d.id) ? ' (esta pestaña)' : ''}</span>
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
          /* Se recuerda la elección: los siguientes play van ahí y no
             vuelven a esta pestaña por su cuenta. Elegir esta pestaña deja
             el destino en null, que ya significa «aquí». */
          destinoElegido = somos(it.dataset.id) ? null : it.dataset.id;
          setStatus(somos(it.dataset.id)
            ? '◆ la música pasa a sonar aquí'
            : '◎ mandado a ' + it.querySelector('.dev-item-nom').textContent);
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
      /* Arranca el reloj de la renovación. Hace falta AQUÍ y no solo en
         `saveTokens`: al abrir la app con una sesión todavía válida no se
         guarda ningún token, así que sin esto el temporizador no se armaría
         nunca y volvería el agujero de la hora. */
      programarRenovacion();
      startPolling();
      /* Se levanta el reproductor de la pestaña nada más conectar, sin
         esperar a que le den al play: así el aparato MASTER MUSIC ya existe
         cuando llegue la primera canción, y aparece en la lista de «dónde
         suena» desde el primer momento. No se espera a que termine — que
         tarde en cargar no debe retrasar la biblioteca. */
      arrancarSDK();
    } catch (e) {
      console.warn('Spotify load user failed', e);
    }
  };

  const connect = async () => {
    /* Sesión válida pero de antes del reproductor propio: lo que hace falta
       es volver a autorizar, no cerrar sesión. Preguntar «¿cerrar sesión?»
       aquí obligaba a dos vueltas para conseguir un permiso que falta. */
    if (isLoggedIn() && !scopesAlDia()) {
      await startAuth();
      return;
    }
    if (isLoggedIn()) {
      const ok = confirm('Ya estás conectado a Spotify. ¿Cerrar sesión?');
      if (ok) {
        localStorage.removeItem(STORAGE.TOKEN);
        localStorage.removeItem(STORAGE.REFRESH);
        localStorage.removeItem(STORAGE.EXPIRES);
        try { if (sdkPlayer) sdkPlayer.disconnect(); } catch (x) {}
        sdkPlayer = null;
        sdkDeviceId = null;
        sdkActivo = false;
        sdkIntento = null;
        destinoElegido = null;
        ventana = null;
        ultimaPrecarga = null;
        clearTimeout(renovTimer);
        olvidarUltimo();
        pararRadio();
        // La lista puente es de la cuenta que se va: su id no vale para otra
        try { localStorage.removeItem(CLAVE_LISTA); } catch (x) {}
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
    /* La cola sin gastar una sola petición: sonando aquí, el SDK ya dice lo
       que viene detrás. Devuelve null cuando la música va por otro aparato, y
       entonces quien pregunte tira de `/me/player/queue` como siempre. */
    colaLocal: () => {
      if (!sdkActivo || !ventana) return null;
      return {
        currently_playing: ventana.current_track || null,
        queue: (ventana.next_tracks || []).slice(),
      };
    },
    // Último estado conocido del aparato y los modos (lo refresca el sondeo)
    device: () => lastDevice,
    // playlist/album del que sale lo que suena (lo usa la pestana «cola»)
    context: () => lastContext,
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
