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
    STATE: 'sp_state',
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
  const SCOPES_V = '4';

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
    /* Para crear playlists de verdad (`crearPlaylist`) y para RETIRAR la
       lista puente que dejaba la versión anterior de «sigue sonando» (ver
       `limpiarListaPuente`). Ya no se crea ninguna lista a espaldas de
       nadie: la cola se llena encolando, no fabricando playlists. */
    'playlist-modify-private',
    /* Para el ♥. Se pidió una vez en 2026-08 y se retiró porque
       `PUT /me/tracks` devolvía 403 con el permiso concedido y todo. La
       explicación apareció ahora: **ese endpoint ya no existe** —feb-2026 lo
       sustituyó por `PUT /me/library`— y los endpoints retirados contestan
       403 EN SILENCIO, sin decir que están retirados. O sea que el permiso
       nunca fue el problema. */
    'user-library-modify',
    // Para la sección «artistas» de la biblioteca (GET /me/following)
    'user-follow-read',
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

    /* `state`: un número al azar que va a Spotify y tiene que volver igual.
       Es lo que la documentación pide para que nadie pueda empujarte a la
       app un `code` que no pediste tú (CSRF). Faltaba: se mandaba la
       autorización sin él y al volver se borraba de la URL sin mirarlo. */
    const state = randomString(16);
    try { localStorage.setItem(STORAGE.STATE, state); } catch (e) {}

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
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
    permisoCaducado = false;   // permiso nuevo: la sesión vuelve a estar viva
    return true;
  };

  /* -------- El permiso CADUCA (y no es lo mismo que fallar) --------

     Dos formas de que renovar salga mal, y hasta ahora las dos se trataban
     igual —devolver `false` y reintentar a los cinco minutos, para siempre—:

     · Un fallo pasajero: sin red, Spotify de mantenimiento, un 500. Ahí
       reintentar es exactamente lo que hay que hacer.
     · Que el permiso ya NO valga. La documentación lo dice sin rodeos: los
       refresh token «tienen una vida de 6 meses» que empieza cuando el
       usuario autoriza y **no se alarga al renovarlos**; y el usuario puede
       retirarlos cuando quiera desde su cuenta. En los dos casos Spotify
       contesta `invalid_grant`, y ahí reintentar no arregla nada: hay que
       volver a pasar por la pantalla de autorización.

     Sin distinguirlas, a los seis meses la app se quedaba reintentando en
     bucle y enseñando un «conecta spotify» que no explicaba nada. */
  let permisoCaducado = false;

  const olvidarPermiso = () => {
    permisoCaducado = true;
    try {
      localStorage.removeItem(STORAGE.REFRESH);
      localStorage.removeItem(STORAGE.TOKEN);
      localStorage.removeItem(STORAGE.EXPIRES);
    } catch (e) {}
    clearTimeout(renovTimer);
    try { window.PlayerCore.setSpotifyConnected(false); } catch (e) {}
    setStatus('◎ el permiso de spotify caducó · pulsa [ conectar spotify ] para volver a entrar');
    console.warn('[Spotify] invalid_grant: el refresh token ya no vale (caducado o retirado)');
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
    let res;
    try {
      res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (e) {
      return false;                  // sin red: pasajero, se reintenta
    }
    if (!res.ok) {
      /* `invalid_grant` = «ese permiso ya no existe». Es el único motivo por
         el que NO se debe reintentar; la doc pide tirarlo y volver a pedir
         autorización. Un 400 con otro motivo, o un 5xx, sí son para insistir. */
      let motivo = '';
      try { motivo = (await res.json()).error || ''; } catch (e) {}
      if (motivo === 'invalid_grant') olvidarPermiso();
      return false;
    }
    const data = await res.json();
    /* OJO: Spotify NO siempre devuelve un refresh token nuevo. `saveTokens`
       solo pisa el guardado cuando viene uno («When a refresh token is not
       returned, continue using the existing token»); si pisara con undefined,
       la sesión moriría en la primera renovación. */
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
    // Caducado de verdad: insistir no lo arregla, y ya se ha avisado
    if (permisoCaducado) return;
    console.warn('[Spotify] no se pudo renovar el token; se reintenta en 5 min');
    clearTimeout(renovTimer);
    renovTimer = setTimeout(renovarAhora, 300000);
  };

  const programarRenovacion = () => {
    clearTimeout(renovTimer);
    if (permisoCaducado) return;
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

  /* Dos cosas distintas contestan 429, y desde jul-2026 se distinguen:

     · RITMO. Demasiadas peticiones en la ventana móvil de 30 segundos. Se
       espera lo que diga `Retry-After` (o se dobla la espera) y se sigue.
     · CUOTA AGOTADA. Desde jul-2026 el modo desarrollo cuenta la cuota **por
       cuenta de desarrollador** (antes por Client ID) y, cuando se acaba,
       contesta 429 con `"reason": "QUOTA_EXCEEDED"` en el cuerpo. Eso no se
       arregla esperando cinco segundos: hay que dejarlo estar un buen rato.
       Decirle al usuario «reintentando en 5s» ahí es mentirle. */
  const frenar = (res, cuerpo) => {
    const agotada = /QUOTA_EXCEEDED/.test(cuerpo || '');
    const cabecera = parseInt((res && res.headers.get('Retry-After')) || '0', 10);
    esperaSeguida = agotada
      ? ESPERA_MAX
      : (cabecera > 0
        ? Math.min(ESPERA_MAX, cabecera)
        : Math.min(ESPERA_MAX, Math.max(ESPERA_MIN, esperaSeguida * 2 || ESPERA_MIN)));
    bloqueadoHasta = Date.now() + esperaSeguida * 1000;
    console.warn(`[Spotify] 429: en pausa ${esperaSeguida}s` +
      (agotada ? ' (CUOTA AGOTADA de la cuenta de desarrollador)'
        : cabecera > 0 ? ' (lo pide Retry-After)' : ' (sin Retry-After legible)'));
    setStatus(agotada
      ? '◷ spotify agotó la cuota de tu app · tu música importada sigue funcionando'
      : `◷ spotify pidió esperar · reintentando en ${esperaSeguida}s`);
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
    if (res.status === 429) {
      // El cuerpo dice si fue el ritmo o la cuota entera (ver `frenar`)
      let cuerpo = '';
      try { cuerpo = await res.text(); } catch (e) {}
      frenar(res, cuerpo);
      throw new Error('Spotify API 429: ' + (/QUOTA_EXCEEDED/.test(cuerpo)
        ? 'cuota agotada' : 'demasiadas peticiones'));
    }
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
    relevar(state);          // por si este aparato no admitió la lista entera
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
  /* PODCASTS. Lo que suena no siempre es una canción, y hasta ahora eso
     dejaba la app como colgada: `GET /me/player` devuelve `item: null` para
     un episodio salvo que se pida `additional_types=episode`, así que la
     barra se quedaba con la última canción y el reloj parado — parecía
     roto. Ahora se pide y se traduce: el episodio entra con el nombre del
     programa donde iría el artista y su propia portada. La letra se busca
     igual y no aparece ninguna, que es justo lo que debe pasar. */
  const pistaDesde = (it) => {
    const episodio = it && it.type === 'episode';
    return {
      // El SDK deja `id` en null para algunas pistas; el uri nunca falta.
      id: 'sp:' + (it.id || it.uri),
      name: it.name,
      artist: episodio
        ? ((it.show && it.show.name) || 'podcast')
        : (it.artists || []).map((a) => a.name).join(', '),
      album: episodio ? ((it.show && it.show.name) || '') : (it.album ? it.album.name : ''),
      duration: (it.duration_ms || 0) / 1000,
      cover: episodio
        ? ((it.images && it.images[0] && it.images[0].url) || null)
        : (it.album && it.album.images && it.album.images[0] ? it.album.images[0].url : null),
      url: null,
      spotify: true,
      podcast: episodio,
      uri: it.uri,
    };
  };

  const pintarPista = (track) => {
    document.getElementById('npTitle').textContent = track.name;
    document.getElementById('npArtist').textContent = track.artist;
    /* Aquí había un segundo pintado sobre #npCover, la carátula de una barra
       inferior que se retiró hace tiempo. El id no existe desde entonces, así
       que eran cuatro líneas buscando algo que nunca está. La carátula viva es
       #coverArt, la del panel izquierdo. */
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
    refrescarLike(track);
    /* Cambiar de canción es el ÚNICO momento en que la cola se acorta, así
       que es aquí donde «sigue sonando» se repone. Es lo que hace que no se
       acabe: mientras la sesión siga viva, siempre quedan canciones por
       delante. Vale para los dos caminos —el SDK y el sondeo—, porque los
       dos pasan por aquí al cambiar de pista. */
    if (mezcla) rellenarMezcla();
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
        /* `additional_types=episode`: sin él, con un podcast sonando la API
           contesta `item: null` y la app se queda con la canción anterior
           puesta y el reloj parado (ver `pistaDesde`). */
        const data = await api('/me/player?additional_types=episode');
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

  /* ==========================================================
     ESCRIBIR EN SPOTIFY — el ♥ y las playlists

     Hasta ahora la app era de SOLO LECTURA contra Spotify: sabía buscar,
     listar y reproducir, pero no podía guardar nada. El ♥ existió y se
     retiró en agosto porque `PUT /me/tracks` devolvía 403 aun con el permiso
     concedido; la explicación llegó ahora: **ese endpoint está retirado**
     desde feb-2026 y los retirados contestan 403 sin decir por qué.

     Los de ahora son genéricos y llevan las URIs en la query (hasta 40):
       PUT    /me/library?uris=…   guardar / seguir
       DELETE /me/library?uris=…   quitar
       GET    /me/library/contains?uris=…  → [true|false]
     ========================================================== */
  const like = () => document.getElementById('likeBtn');
  let likeUri = null;        // la uri cuyo estado enseña el botón
  let likeOn = false;
  let likeMuerto = false;    // si Spotify también rechaza el endpoint nuevo

  const pintarLike = (visible) => {
    const b = like();
    if (!b) return;
    b.hidden = !visible || likeMuerto;
    b.textContent = likeOn ? '♥' : '♡';
    b.classList.toggle('like-on', likeOn);
    b.title = likeOn ? 'Quitar de Tus me gusta' : 'Guardar en Tus me gusta';
  };

  // Al cambiar de canción: preguntar si ya está guardada
  const refrescarLike = async (t) => {
    if (likeMuerto || !t || !t.uri || !t.spotify || !isLoggedIn()) { pintarLike(false); return; }
    likeUri = t.uri;
    try {
      const d = await api('/me/library/contains?uris=' + encodeURIComponent(t.uri));
      if (likeUri !== t.uri) return;               // ya cambiaron de canción
      likeOn = Array.isArray(d) ? !!d[0] : false;
      pintarLike(true);
    } catch (e) {
      /* Un 403 aquí significa que Spotify tampoco deja LEER la biblioteca a
         las apps en modo desarrollo. Se apaga el botón entero en vez de
         dejar un corazón que miente. */
      if (/40[34]/.test(e.message || '')) { likeMuerto = true; console.warn('[♥] Spotify no deja consultar la biblioteca:', detalleSpotify(e)); }
      pintarLike(false);
    }
  };

  const alternarLike = async () => {
    if (!likeUri) return;
    const quiero = !likeOn;
    // Se pinta ya y se corrige si falla: el ♥ tiene que responder al instante
    likeOn = quiero;
    pintarLike(true);
    try {
      await api('/me/library?uris=' + encodeURIComponent(likeUri), { method: quiero ? 'PUT' : 'DELETE' });
      setStatus(quiero ? '♥ guardada en Tus me gusta' : '♡ quitada de Tus me gusta');
    } catch (e) {
      likeOn = !quiero;
      pintarLike(true);
      if (/403/.test(e.message || '')) {
        likeMuerto = true;
        pintarLike(false);
        setStatus('✕ Spotify no deja guardar desde apps en modo desarrollo');
        console.warn('[♥] 403 también con /me/library:', detalleSpotify(e));
      } else {
        setStatus('✕ no se pudo guardar. ' + detalleSpotify(e));
      }
    }
  };

  /* Crear una playlist de verdad a partir de una lista de URIs. La usa la
     pantalla del historial para convertir «tus más escuchadas» en algo que
     puedas abrir en Spotify — que es justo lo que Spotify no te deja hacer,
     porque él ni siquiera guarda ese historial. */
  const crearPlaylist = async (nombre, uris, descripcion) => {
    const d = await api('/me/playlists', {
      method: 'POST',
      body: JSON.stringify({ name: nombre, public: false, description: descripcion || '' }),
    });
    const id = d && d.id;
    if (!id) throw new Error('Spotify no devolvió la playlist');
    // De 100 en 100, que es el tope de la API
    for (let i = 0; i < uris.length; i += 100) {
      await api('/playlists/' + id + '/items', {
        method: 'POST', body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
      });
    }
    return { id, url: (d.external_urls && d.external_urls.spotify) || null };
  };

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
    list.innerHTML = searchResults.map((t, i) => {
      // Artistas y álbumes: sin duración ni ＋; se abren, no se encolan
      if (t.tipo && t.tipo !== 'track') {
        return `
      <li class="sp-result" data-idx="${i}" tabindex="0">
        <div class="sp-thumb${t.tipo === 'artist' ? ' sp-thumb-redonda' : ''}" ${t.cover ? `style="background-image:url('${t.cover}')"` : ''}>${t.cover ? '' : (t.tipo === 'artist' ? '◍' : '◙')}</div>
        <div class="sp-meta">
          <div class="sp-name">${escapeHtml(t.name)}</div>
          <div class="sp-artist">${escapeHtml(t.artist)}</div>
        </div>
        <div class="sp-dur">${t.tipo === 'artist' ? 'artista' : (t.total ? t.total + ' temas' : 'álbum')}</div>
        <button class="sp-play" title="Reproducir">▶</button>
      </li>`;
      }
      return `
      <li class="sp-result" data-idx="${i}" tabindex="0">
        <div class="sp-thumb" ${t.cover ? `style="background-image:url('${t.cover}')"` : ''}>${t.cover ? '' : '♪'}</div>
        <div class="sp-meta">
          <div class="sp-name">${escapeHtml(t.name)}</div>
          <div class="sp-artist">${escapeHtml(t.artist)}${t.album ? ` <span class="sp-alb">· ${escapeHtml(t.album)}</span>` : ''}</div>
        </div>
        <div class="sp-dur">${formatTime(t.duration)}</div>
        <button class="sp-queue" title="Añadir a la cola">＋</button>
        <button class="sp-play" title="Reproducir ahora">▶</button>
      </li>`;
    }).join('');
  };

  /* Secuencia contra respuestas cruzadas: al teclear rápido salen varias
     peticiones y la lenta puede contestar DESPUÉS de la nueva, dejando en
     pantalla los resultados de lo que ya no está escrito. Misma solución
     que en lyrics.js. */
  let seqBusqueda = 0;

  /* Qué se busca: canciones, artistas o álbumes. La app llevaba desde
     siempre buscando SOLO canciones (`type=track`), y con eso no se podía
     llegar a un artista ni a un disco. */
  let tipoBusqueda = 'track';

  /* Spotify devuelve la MISMA canción tres y cuatro veces —el single, el
     disco, el recopilatorio y el «Remastered»— y desde feb-2026 la búsqueda
     de las apps en modo desarrollo trae diez resultados como mucho: cuatro
     repetidas son cuatro sitios menos para encontrar lo que se busca.

     Se deja la PRIMERA de cada canción, que es la que Spotify considera más
     relevante para lo que se ha escrito. Por eso es seguro comparar por el
     título sin paréntesis ni sufijos («Wonderwall - Live» = «Wonderwall»):
     si de verdad buscabas la de directo, esa es la que sale primera y es la
     que se queda. El artista entra en la comparación, así que una versión de
     otro no se junta nunca con el original. */
  const sinDuplicadas = (lista) => {
    const nucleo = (window.Similares && window.Similares.nucleo)
      || ((s) => String(s || '').toLowerCase().trim());
    const vistas = new Set();
    return lista.filter((t) => {
      const k = nucleo(t.name) + '|' + nucleo(t.artist);
      if (!k || vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
  };

  const doSearch = async (query) => {
    const q = query.trim();
    const mia = ++seqBusqueda;
    if (!q) { searchResults = []; renderResults(''); return; }
    pintarCargando();
    try {
      // limit máx. 10: desde feb-2026 Spotify limita las búsquedas de apps
      // en development mode a 10 resultados (más devuelve 400 "Invalid limit").
      const data = await api(`/search?type=${tipoBusqueda}&limit=10&q=` + encodeURIComponent(q));
      if (mia !== seqBusqueda) return;

      // Artistas y álbumes: filas distintas, y al pulsarlas se ABREN
      if (tipoBusqueda !== 'track') {
        const lista = tipoBusqueda === 'artist'
          ? ((data && data.artists && data.artists.items) || [])
          : ((data && data.albums && data.albums.items) || []);
        searchResults = lista.filter(Boolean).map((it) => ({
          id: it.id,
          uri: it.uri,
          name: it.name,
          artist: tipoBusqueda === 'artist'
            ? ((it.genres || []).slice(0, 2).join(' · ') || 'artista')
            : (it.artists || []).map((a) => a.name).join(', '),
          album: '',
          duration: 0,
          cover: (it.images && it.images[0]) ? it.images[0].url : null,
          total: it.total_tracks || 0,
          owner: (it.artists || []).map((a) => a.name).join(', '),
          spotify: true,
          tipo: tipoBusqueda,
        }));
        renderResults(q);
        if (searchResults.length) anotarReciente(q);
        return;
      }

      const items = (data && data.tracks && data.tracks.items) || [];
      searchResults = sinDuplicadas(items.map(it => ({
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
      })));
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
    const npCoverEl = document.getElementById('coverArt');
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
    // Una playlist o un álbum ya continúan solos: se apaga «sigue sonando»
    // para que no siga metiendo canciones detrás de otra cosa.
    pararMezcla();
    await arrancarSDK();          // que exista el aparato antes de apuntarle
    const body = { context_uri: contextUri };
    if (offsetUri) body.offset = { uri: offsetUri };
    await api(conDestino('/me/player/play'), { method: 'PUT', body: JSON.stringify(body) });
    lastTrackId = null;
    lastIsPlaying = true;
    if (window.PlayerCore) window.PlayerCore.state.isPreview = false;
    startPolling();
  };

  /* -------- «Sigue sonando»: lo que viene detrás, como en Spotify --------

     Poner una canción desde el buscador reproducía ESA y se acababa la
     música. En la app de Spotify no pasa: al terminar sigue con cosas
     parecidas. Esto lo imita, y ha costado tres intentos llegar a la forma
     buena — las dos primeras están contadas aquí porque el error era el
     mismo cada vez: dejar rastro en la cuenta de quien solo quería oír una
     canción.

     ---- LOS DOS INTENTOS QUE NO VALÍAN ----
     · v2 · LISTA PUENTE. Spotify solo enciende su autoplay cuando lo que
       suena es un CONTEXTO (playlist o disco), así que se le fabricaba uno:
       meter la canción en una playlist privada nuestra y reproducir esa.
       Funcionaba, pero le aparecía una PLAYLIST NUEVA en su Spotify.
       `limpiarListaPuente` (abajo) borra la que quedara.
     · v3 · `POST /me/player/queue`, una llamada por canción. Nada que
       borrar... pero Spotify distingue dos cosas en el panel de la derecha:
         «Siguiente»                        ← lo que continúa solo
         «Siguiente en la fila de reproducción» + [Borrar fila]
                                            ← lo que alguien metió A MANO
       Encolar cae en el segundo, y el usuario lo vio al primer vistazo:
       parecía que la app le había llenado la fila de reproducción.

     ---- LO QUE HAY AHORA (v4) ----
     La lista entera va DENTRO del propio play:

         PUT /me/player/play   { uris: [la elegida, parecida, parecida, …] }

     Es la única forma que da la API de decir «y detrás de esta, estas»
     formando parte de lo que suena. Aparecen bajo «Siguiente», sin botón de
     borrar la fila, sin playlist y sin nada que limpiar después. La cola
     sigue libre: si el usuario encola algo a mano, se pone delante de todo
     esto, que es exactamente lo que hace Spotify.

     De dónde salen las canciones: ListenBrainz (ver js/similares.js), tres
     tandas en orden —parecidas de verdad, artistas afines y, de red de
     seguridad, el género de `GET /artists/{id}`—. Las parecidas traen su id
     de Spotify resuelto en lote, así que armar una lista de cincuenta no
     cuesta NI UNA petición de Spotify.

     ---- NO SE ACABA ----
     Cincuenta canciones son unas tres horas. Cuando el reproductor llega a
     la última (`next_tracks` vacío), `rellenarMezcla` manda otra lista que
     empieza por LA QUE ESTÁ SONANDO, con `position_ms` en el punto exacto:
     la música no se entera y detrás hay otras cincuenta.

     ---- SI EL APARATO IGNORA LA LISTA ----
     Hubo reproductores que se quedaban solo con la primera uri. A los pocos
     segundos se comprueba que de verdad hay algo detrás y, si no, se cae a
     encolar a mano: peor de cara, pero mejor que quedarse en silencio. */
  const LISTA_MAX = 49;       // cuántas van detrás de la elegida
  const LISTA_MIN_OTRAS = 12; // si no hay parecidas, con esto basta para empezar
  const LOTE_URIS = 30;       // cuántas parecidas se traducen a uri de una vez
  const POR_ARTISTA = 2;      // tope de canciones seguidas del mismo artista
  const ESPERA_SIMILARES = 2500;  // lo que se aguanta antes de dar al play

  let mezclaSeq = 0;          // poner otra cosa cancela la mezcla anterior
  let mezcla = null;          // sesión viva

  const radioEncendida = () => localStorage.getItem('mm_radio') !== 'off';

  const pararMezcla = () => { mezclaSeq++; mezcla = null; };

  const barajar = (arr) => {
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
    } catch (e) { return []; }      // que falle una no debe tumbar la mezcla
  };

  /* Un nombre de artista puede traer comillas («The Quotes "Band"»), y una
     comilla suelta dentro de `artist:"…"` rompe la consulta entera de
     Spotify: se queda sin resultados y la tanda de artistas parecidos no
     encola nada. Fuera comillas y barras. */
  const paraConsulta = (s) => String(s || '').replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();

  // Lo mínimo para mandar la lista y para poder nombrarla en la barra
  const pistaCorta = (it) => ({
    uri: it.uri,
    name: it.name || '',
    artist: (it.artists || []).map((a) => a.name).filter(Boolean).join(', '),
  });

  /* ---- Tanda 1: canciones parecidas ----
     Las parecidas llegan con su MBID, no con su uri. La traducción va EN
     LOTE —treinta de una— contra ListenBrainz, que publica el id de Spotify
     de cada grabación. Es lo que hace que armar la lista no gaste cuota. */
  const traducirLote = async () => {
    const m = mezcla;
    if (!m || !m.parecidas.length) return;
    /* El trozo sale de la lista ANTES de nada. Si se devolviera sin sacarlo
       —por ejemplo sin js/similares.js cargado— quien llama volvería a pedir
       lo mismo eternamente: la lista nunca menguaría. */
    const trozo = m.parecidas.splice(0, LOTE_URIS);
    if (!window.Similares) return;
    const mapa = await window.Similares.urisSpotify(trozo.map((x) => x.mbid));
    if (m !== mezcla) return;               // pusieron otra cosa mientras
    trozo.forEach((x) => {
      const uri = mapa[x.mbid];
      if (uri && !m.vistas.has(uri)) m.listas.push({ uri, name: x.name, artist: x.artist });
    });
  };

  const deParecidas = async (n) => {
    const m = mezcla;
    const out = [];
    if (!m) return out;
    while (out.length < n) {
      if (!m.listas.length) {
        if (!m.parecidas.length) break;     // se acabaron: pasa a la tanda 2
        await traducirLote();
        if (m !== mezcla) return out;
        continue;
      }
      const p = m.listas.shift();
      if (p && !m.vistas.has(p.uri)) out.push(p);
    }
    return out;
  };

  /* ---- Tanda 2: artistas parecidos ----
     Una búsqueda por artista, y de cada uno solo un par de canciones: la
     gracia es que la lista siga sonando variada, no que se convierta en el
     grandes éxitos del primer artista que salga. `tope` limita las
     búsquedas, que aquí sí cuestan cuota de Spotify. */
  const deArtistas = async (n, tope) => {
    const m = mezcla;
    const out = [];
    if (!m) return out;
    let vueltas = 0;
    while (out.length < n && m.artistas.length && vueltas < (tope || 3)) {
      vueltas++;
      const nombre = m.artistas.shift();
      const items = await buscarPistas('artist:"' + paraConsulta(nombre) + '"', 0);
      if (m !== mezcla) return out;
      let deEste = 0;
      barajar(items).forEach((it) => {
        if (out.length >= n || deEste >= POR_ARTISTA || m.vistas.has(it.uri)) return;
        out.push(pistaCorta(it));
        deEste++;
      });
    }
    return out;
  };

  /* ---- Tanda 3: el género (red de seguridad) ----
     Los géneros solo viven en `GET /artists/{id}`; las pistas no los traen.
     Se piden UNA vez y solo si de verdad hacen falta: con las dos tandas de
     arriba funcionando, esta petición no llega a hacerse nunca. */
  const asegurarGeneros = async () => {
    const m = mezcla;
    if (!m || m.generosPedidos) return;
    m.generosPedidos = true;
    let generos = [];
    if (m.artistId) {
      try {
        const a = await api('/artists/' + m.artistId);
        generos = (a && a.genres) || [];
      } catch (e) { /* sin géneros se tira solo del artista */ }
    }
    if (m !== mezcla) return;
    m.genero = generos[0] || null;
    m.consultas = generos.slice(0, 3).map((g) => 'genre:"' + g + '"');
    if (m.semilla.artist) m.consultas.push('artist:"' + paraConsulta(m.semilla.artist) + '"');
  };

  /* Rota entre las consultas y va pasando páginas. La clave para que no se
     repita es el `offset`: sin él, `genre:"reggaeton"` devolvería SIEMPRE las
     mismas diez y esto giraría en bucle a los veinte minutos. */
  const deGenero = async (n, tope) => {
    const m = mezcla;
    const out = [];
    if (!m || !m.consultas.length) return out;
    for (let intento = 0; intento < (tope || 4) && out.length < n; intento++) {
      const q = m.consultas[m.turno % m.consultas.length];
      const pagina = Math.floor(m.turno / m.consultas.length);
      m.turno++;
      /* Tope del `offset` de Spotify: 1000, o sea 100 páginas por consulta.
         Son unas 3.000 canciones —más de un día seguido de música—, pero si
         alguien llega, vuelve a empezar en vez de callarse: se olvida lo ya
         puesto (menos lo que suena ahora) y se repite catálogo. */
      if (pagina > 99) {
        m.turno = 0;
        m.vistas = new Set();
        const actual = window.PlayerCore && window.PlayerCore.state.currentTrack;
        if (actual && actual.uri) m.vistas.add(actual.uri);
        continue;
      }
      const items = await buscarPistas(q, pagina * 10);
      if (m !== mezcla) return out;
      barajar(items).forEach((it) => {
        if (out.length < n && !m.vistas.has(it.uri)) out.push(pistaCorta(it));
      });
    }
    return out;
  };

  /* Arma la lista que va detrás de la canción. Las tres tandas en orden,
     rellenando con la siguiente lo que falte. Todo lo que sale de aquí entra
     en `vistas`: la lista de dentro de tres horas no repetirá nada de esta. */
  const armarLista = async (n) => {
    const m = mezcla;
    if (!m) return [];
    const out = [];
    const sumar = (lista, fuente) => {
      if (!out.length && lista.length) m.fuente = fuente;   // quien abre, manda
      lista.forEach((p) => {
        if (out.length >= n || !p || !p.uri) return;
        /* Contra `vistas` (lo ya puesto en toda la sesión) y contra la propia
           tanda: dos grabaciones distintas pueden apuntar a la misma canción
           de Spotify, y ponerla dos veces seguidas se nota. */
        if (m.vistas.has(p.uri) || out.some((q) => q.uri === p.uri)) return;
        out.push(p);
      });
    };

    sumar(await deParecidas(n), 'parecidas');
    if (m !== mezcla) return [];

    /* Las otras dos tandas NO aspiran a cincuenta: cada canción suya cuesta
       una búsqueda de Spotify, y con una docena hay música de sobra para
       tres cuartos de hora — para entonces lo normal es que se haya puesto
       otra cosa. Las parecidas sí llenan la lista entera: son gratis. */
    const meta = Math.max(out.length, Math.min(n, LISTA_MIN_OTRAS));
    if (out.length < meta) {
      sumar(await deArtistas(meta - out.length, 4), 'artistas');
      if (m !== mezcla) return [];
    }
    if (out.length < meta) {
      await asegurarGeneros();
      if (m !== mezcla) return [];
      sumar(await deGenero(meta - out.length, 4), 'genero');
    }

    out.forEach((p) => { m.vistas.add(p.uri); m.puestas.add(p.uri); });
    return out;
  };

  /* Manda a sonar una lista: la primera suena ya y el resto queda detrás,
     en «Siguiente». `desde` (ms) sirve para retomar la que ya sonaba en el
     punto exacto, que es como se repone la mezcla sin que se note.

     SIN `offset`: el OpenAPI de Spotify es explícito —«Only available when
     context_uri corresponds to an album or playlist object»—, así que con
     `uris` no pinta nada y podría ser un 400. `position_ms` sí vale, y se
     aplica a la primera de la lista, que es lo que hace falta.

     CUÁNTAS CABEN: la especificación NO documenta un tope para `uris`. Como
     nadie promete nada, si la lista larga se la devuelven se reintenta con
     veinte y, en el peor caso, con la canción sola: mejor sonar sin mezcla
     que no sonar. */
  const sonarLista = async (uris, desde) => {
    const cuerpo = (lista) => {
      const c = { uris: lista };
      if (desde > 0) c.position_ms = Math.floor(desde);
      return JSON.stringify(c);
    };
    try {
      await api(conDestino('/me/player/play'), { method: 'PUT', body: cuerpo(uris) });
      return uris.length;
    } catch (e) {
      const msg = String((e && e.message) || '');
      // Un 400/413 con lista larga huele a tope no documentado; lo demás no
      if (uris.length <= 20 || !/API (400|413|414)/.test(msg)) throw e;
      console.warn('[mezcla] la lista larga no entró (' + uris.length + '); pruebo con 20:', msg);
      try {
        await api(conDestino('/me/player/play'), { method: 'PUT', body: cuerpo(uris.slice(0, 20)) });
        return 20;
      } catch (e2) {
        await api(conDestino('/me/player/play'), { method: 'PUT', body: cuerpo(uris.slice(0, 1)) });
        return 1;
      }
    }
  };

  /* El minuto por el que va lo que suena, interpolado entre sondeos. Vivía
     suelto dentro de la API pública; ahora hace falta también aquí dentro,
     para reponer la mezcla SIN que la canción salte de sitio. */
  const posicionActual = () => {
    if (!progStamp || !lastIsPlaying) return progBase;
    const sec = progBase + (performance.now() - progStamp) / 1000;
    return progDur ? Math.min(progDur, sec) : sec;
  };

  // Cuántas quedan por delante, cuando se puede saber sin gastar peticiones
  const porDelante = () => ((sdkActivo && ventana && Array.isArray(ventana.next_tracks))
    ? ventana.next_tracks.length : null);

  /* Red de seguridad. Hay reproductores que de una lista de uris se quedan
     con la PRIMERA y tiran el resto: está reportado desde 2020 contra el
     reproductor web (issue 1437 del repo de la API de Spotify, archivado en
     read-only sin respuesta), y es justo el reproductor que usa esta app
     cuando la música suena en la pestaña. Si a los pocos segundos no hay
     nada detrás, se enciende el MODO RELEVO.

     Lo que NO se hace es caer a `POST /me/player/queue`: eso llenaría la
     «fila de reproducción» del usuario, que es exactamente lo que se quitó. */
  const vigilarLista = async (mia, cuantas) => {
    if (!cuantas) return;
    await new Promise((r) => setTimeout(r, 4000));
    if (mia !== mezclaSeq || !mezcla) return;
    const hay = porDelante();
    if (hay === null || hay > 0) return;          // o no se sabe, o sí llegó
    mezcla.relevo = true;
    console.warn('[mezcla] este aparato no admite listas; sigo en modo relevo');
  };

  /* EL RELEVO. La lista sigue viva aquí dentro y la siguiente se manda
     cuando la de ahora termina. Se nota igual que la pone Spotify, salvo por
     el respiro de un segundo entre canción y canción — y solo pasa en los
     aparatos que no admiten listas.

     Cómo se sabe que una canción se ha acabado con este reproductor: manda
     un estado EN PAUSA, con la posición en CERO y con esa misma canción ya
     en `previous_tracks`. Las tres cosas a la vez; con menos, pausar al
     principio de una canción dispararía el relevo. */
  const relevar = (state) => {
    if (!mezcla || !mezcla.relevo || mezcla.relevando) return;
    const tw = (state && state.track_window) || {};
    const actual = tw.current_track;
    if (!actual || !state.paused || (state.position || 0) !== 0) return;
    if (!(tw.previous_tracks || []).some((x) => x && x.uri === actual.uri)) return;

    const i = mezcla.emitidas.indexOf(actual.uri);
    if (i < 0 || i + 1 >= mezcla.emitidas.length) return;
    mezcla.relevando = true;
    /* Se manda el resto ENTERO, no solo la siguiente: si el aparato mejora
       —o era cosa de un día— la lista entra y el relevo deja de hacer falta
       sin que nadie tenga que enterarse. */
    sonarLista(mezcla.emitidas.slice(i + 1))
      .catch((e) => console.warn('[mezcla] el relevo no salió:', e && e.message))
      .finally(() => { if (mezcla) mezcla.relevando = false; });
  };

  /* La reposición. `notarCambio` la llama en cada cambio de canción; solo
     hace algo cuando ya suena la ÚLTIMA de la lista. Entonces manda una
     lista nueva que empieza por esa misma, en el segundo por el que va, así
     que lo único que cambia es que detrás vuelve a haber cincuenta. */
  const rellenarMezcla = async () => {
    if (!mezcla || mezcla.rellenando || !radioEncendida()) return;
    const actual = window.PlayerCore && window.PlayerCore.state.currentTrack;
    if (!actual || !actual.uri) return;
    /* Se mira contra NUESTRA lista, no contra lo que diga el aparato: con la
       música sonando en el móvil no hay forma de saber cuántas quedan por
       delante sin gastar una petición en cada canción. Si lo que suena es la
       última que mandamos, es que se acaba. */
    if (actual.uri !== mezcla.emitidas[mezcla.emitidas.length - 1]) return;

    mezcla.rellenando = true;
    const mia = mezclaSeq;
    try {
      const mas = await armarLista(LISTA_MAX);
      if (mia !== mezclaSeq || !mas.length) return;
      mezcla.emitidas = [actual.uri, ...mas.map((p) => p.uri)];
      await sonarLista(mezcla.emitidas, posicionActual() * 1000);
      if (window.SevenQueueRefresh) window.SevenQueueRefresh();
    } catch (e) {
      console.warn('[mezcla] no se pudo reponer:', e && e.message);
    } finally {
      if (mezcla) mezcla.rellenando = false;
    }
  };

  // Lo que se lee en la barra de estado y en la cabecera de la cola.
  const textoMezcla = () => {
    const m = mezcla;
    if (!m) return '';
    if (m.fuente === 'genero') {
      return m.genero
        ? '◈ sigue sonando · ' + m.genero
        : '◈ sigue sonando · más de ' + (m.semilla.artist || 'lo mismo');
    }
    if (m.fuente === 'artistas') return '◈ sigue sonando · artistas como ' + (m.semilla.artist || '');
    return '◈ sigue sonando · parecidas a «' + m.semilla.name + '»';
  };

  /* Abre la sesión: busca las parecidas y devuelve la lista de uris que hay
     que mandar DETRÁS de la canción. Devuelve [] si no hay nada que poner
     (sin sesión, apagado, o la mezcla ya la cancelaron). */
  const prepararMezcla = async (t, mia) => {
    mezcla = {
      semilla: { name: t.name, artist: (t.artist || '').split(',')[0].trim(), uri: t.uri },
      artistId: t.artistId || null,
      parecidas: [],       // {name, artist, mbid} sin traducir a uri
      listas: [],          // ya traducidas, listas para mandar
      artistas: [],        // nombres, para la tanda 2
      consultas: [],       // género, para la tanda 3
      turno: 0,
      generosPedidos: false,
      genero: null,
      fuente: null,
      vistas: new Set([t.uri]),
      puestas: new Set(),
      emitidas: [],
      rellenando: false,
      relevo: false,        // el aparato no admite listas: las ponemos de una en una
      relevando: false,
    };

    if (window.Similares) {
      /* Con reloj: esto retrasa el play, así que se le da lo justo. Si
         ListenBrainz tarda más de la cuenta se arranca sin él y la lista se
         arma con lo que haya (artistas o género). */
      try {
        const r = await Promise.race([
          window.Similares.deCancion({ name: t.name, artist: t.artist }),
          new Promise((res) => setTimeout(() => res(null), ESPERA_SIMILARES)),
        ]);
        if (mia !== mezclaSeq || !mezcla) return [];
        if (r) {
          mezcla.parecidas = r.canciones || [];
          mezcla.artistas = r.artistas || [];
        }
      } catch (e) {
        console.warn('[mezcla] sin recomendaciones de fuera, tiro del género:', e && e.message);
        if (mia !== mezclaSeq || !mezcla) return [];
      }
    }

    const lista = await armarLista(LISTA_MAX);
    if (mia !== mezclaSeq || !mezcla) return [];
    mezcla.emitidas = [t.uri, ...lista.map((p) => p.uri)];
    return lista;
  };

  /* Elegir una de las que vienen detrás no debe cargarse la mezcla: se manda
     otra vez la lista, empezando por ella. Así saltar tres canciones hacia
     adelante deja intacto todo lo que venía después, como en Spotify. */
  const seguirDesde = async (uri) => {
    const m = mezcla;
    if (!m) return false;
    const i = m.emitidas.indexOf(uri);
    if (i < 0) return false;
    try {
      await sonarLista(m.emitidas.slice(i));
      return true;
    } catch (e) {
      console.warn('[mezcla] no se pudo seguir desde ahí:', e && e.message);
      return false;
    }
  };

  /* ---- Limpieza de la lista puente (v2) ----
     Quien usara aquella versión tiene en su Spotify una playlist llamada
     «MASTER MUSIC · radio» que ya no sirve para nada. Esto la retira.

     Para Spotify, dejar de seguir una playlist propia ES borrarla: no hay
     endpoint de borrado, es lo mismo que hace su botón. Lo que SÍ cambió es
     por dónde se pide: `DELETE /playlists/{id}/followers` está **deprecado**
     («Use Remove Items from Library instead», dice su propio OpenAPI) y las
     apps en modo desarrollo lo perdieron en feb-2026. El bueno es el de la
     biblioteca, el mismo que usa el ♥ de aquí al lado, que acepta uris de
     playlist:  `DELETE /me/library?uris=spotify:playlist:{id}`.
     El viejo se deja de reserva por si la cuenta va con cuota extendida.

     Se intenta una sola vez: el id se borra de localStorage ANTES de pedir
     nada, así que si falla no se queda reintentando en cada arranque. */
  const CLAVE_LISTA_VIEJA = 'sp_lista_radio';

  const limpiarListaPuente = async () => {
    let id = null;
    try { id = localStorage.getItem(CLAVE_LISTA_VIEJA); } catch (e) { return; }
    if (!id) return;
    try { localStorage.removeItem(CLAVE_LISTA_VIEJA); } catch (e) {}
    try {
      try {
        await api('/me/library?uris=' + encodeURIComponent('spotify:playlist:' + id), { method: 'DELETE' });
      } catch (e) {
        await api('/playlists/' + id + '/followers', { method: 'DELETE' });
      }
      console.info('[mezcla] retirada la lista puente que dejaba la versión anterior');
      setStatus('◈ quitada de tu spotify la lista «MASTER MUSIC · radio» que dejaba la versión anterior');
    } catch (e) {
      /* Si no se pudo (ya la borró a mano, token justo, lo que sea) no se
         insiste: es una lista con una canción, y avisar de esto al abrir la
         app sería ruido. Queda en la consola por si alguien mira. */
      console.warn('[mezcla] no se pudo retirar la lista puente:', e && e.message);
    }
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
      /* Elegir una de las que ya venían detrás NO rehace la mezcla: se
         reanuda desde ahí y lo que había después sigue intacto. Es lo que
         pasa en Spotify al pulsar algo de «Siguiente». */
      if (!contextUri && mezcla && mezcla.puestas.has(t.uri) && await seguirDesde(t.uri)) {
        lastTrackId = null;
        lastIsPlaying = true;
        window.PlayerCore.state.isPreview = false;
        startPolling();
        setStatus('▶ ' + t.name);
        return;
      }

      /* Canción suelta: las parecidas se buscan ANTES del play, porque van
         dentro de él (`uris: [esta, y las que siguen]`). Es lo que hace que
         aparezcan en «Siguiente» y no en la fila de reproducción. Cuesta
         cerca de un segundo de espera —y ni eso si ya se puso antes, que el
         MBID está guardado—; a cambio no hay que tocar nada después.

         Aquí vivió antes el desvío por la LISTA PUENTE, que fabricaba una
         playlist en la cuenta del usuario. Ni rastro. */
      const conMezcla = !contextUri && radioEncendida();
      pararMezcla();                 // lo que hubiera sonando detrás, cancelado
      const mia = mezclaSeq;
      let detras = [];
      if (conMezcla) {
        detras = await prepararMezcla(t, mia);
        if (mia !== mezclaSeq) return;         // pusieron otra cosa mientras
      }

      if (contextUri) {
        await api(conDestino('/me/player/play'), {
          method: 'PUT',
          body: JSON.stringify({ context_uri: contextUri, offset: { uri: t.uri } }),
        });
      } else {
        /* `sonarLista` puede haber tenido que recortar (ver allí). Se ajusta
           lo que decimos y lo que creemos que suena detrás a lo que de verdad
           entró: prometer cuarenta y nueve y que haya una es peor que nada. */
        const entraron = await sonarLista([t.uri, ...detras.map((p) => p.uri)]);
        if (entraron - 1 < detras.length) {
          detras = detras.slice(0, Math.max(0, entraron - 1));
          if (mezcla) mezcla.emitidas = [t.uri, ...detras.map((p) => p.uri)];
        }
      }

      lastTrackId = null;          // fuerza al polling a refrescar la canción
      lastIsPlaying = true;
      window.PlayerCore.state.isPreview = false;
      startPolling();
      setStatus(destino() && somos(destino())
        ? '▶ sonando aquí: ' + t.name
        : '▶ reproduciendo en Spotify: ' + t.name);

      if (detras.length) {
        /* Con retraso, como el aviso de «seguir donde ibas»: la barra de
           estado repinta el nombre de la canción en su repaso de cada 500 ms
           y se comería este mensaje. */
        setTimeout(() => setStatus(textoMezcla() + ' · ' + detras.length + ' detrás'), 900);
        if (window.SevenQueueRefresh) setTimeout(window.SevenQueueRefresh, 1200);
        vigilarLista(mia, detras.length);      // sin await: va por detrás
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

    // Chips de tipo: canciones / artistas / álbumes
    document.querySelectorAll(".sp-tipo").forEach((c) => {
      if (c._wired) return;
      c._wired = true;
      c.addEventListener("click", () => {
        if (c.dataset.tipo === tipoBusqueda) return;
        tipoBusqueda = c.dataset.tipo;
        document.querySelectorAll(".sp-tipo").forEach((x) => x.classList.toggle("active", x === c));
        if (input && input.value.trim()) doSearch(input.value);
        else { searchResults = []; renderResults(""); }
      });
    });

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
      const lanzar = (row, soloPlay) => {
        const t = pistaDe(row);
        if (!t) return;
        /* Un artista o un álbum no se «reproducen desde la lista»: se ABREN.
           El ▶ sí los reproduce enteros por contexto (Spotify acepta álbum y
           artista como `context_uri`). Al abrirlos se salta a la pestaña de
           biblioteca, que es la que tiene la vista de detalle. */
        if (t.tipo && t.tipo !== 'track') {
          if (soloPlay) { playContext(t.uri).catch(() => setStatus('✕ no se pudo reproducir')); return; }
          const L = window.LibraryModule;
          if (L && L.abrir) {
            const tab = document.querySelector('.tab[data-tab="library"]');
            if (tab) tab.click();
            L.abrir(t.tipo, t);
          }
          return;
        }
        playTrack(t);
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
        lanzar(row, !!e.target.closest('.sp-play'));
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

  const cablearLike = () => {
    const b = like();
    if (!b || b._wired) return;
    b._wired = true;
    b.addEventListener('click', alternarLike);
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
        pararMezcla();
        /* El id de la lista puente de la v2 es de la cuenta que se va: si
           quedaba apuntado no vale para la siguiente. */
        try { localStorage.removeItem(CLAVE_LISTA_VIEJA); } catch (x) {}
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
    cablearLike();
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (error) {
      alert('Error de autorización Spotify: ' + error);
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.pathname);
    }
    if (code) {
      /* El `state` que vuelve tiene que ser el que mandamos (ver `startAuth`).
         Si no cuadra, ese `code` no salió de aquí: se tira sin canjearlo. Se
         acepta que NO venga ninguno por las sesiones a medias de antes de que
         esto existiera — un `state` guardado y otro distinto de vuelta sí es
         motivo para parar. */
      const vuelta = url.searchParams.get('state');
      const mio = localStorage.getItem(STORAGE.STATE);
      try { localStorage.removeItem(STORAGE.STATE); } catch (e) {}
      url.searchParams.delete('code');
      url.searchParams.delete('state');
      window.history.replaceState({}, '', url.pathname);
      if (mio && vuelta && vuelta !== mio) {
        console.warn('[Spotify] el `state` de vuelta no es el nuestro; no se canjea el código');
        setStatus('✕ la vuelta de spotify no cuadra · pulsa [ conectar spotify ] otra vez');
      } else if (await exchangeCode(code)) {
        await loadUser();
      }
    } else if (isLoggedIn()) {
      await loadUser();
    } else if (localStorage.getItem(STORAGE.REFRESH)) {
      if (await refreshToken()) await loadUser();
    }
    wireSearch();
    /* Con calma: al arrancar hay cola de peticiones (usuario, biblioteca,
       reproductor) y esto no corre ninguna prisa — es una limpieza que se
       hace UNA vez en la vida de cada cuenta. */
    if (isLoggedIn()) setTimeout(limpiarListaPuente, 6000);
  };

  window.SpotifyModule = {
    connect, api, search: doSearch, playTrack, playContext, isLoggedIn,
    togglePlay: spTogglePlay, next: spNext, prev: spPrev, seek: spSeek,
    setVolume: spSetVolume,
    setShuffle: spSetShuffle, setRepeat: spSetRepeat,
    queue: spQueue,
    // Escribir en Spotify: el ♥ y crear playlists de verdad
    crearPlaylist,
    puedeGuardar: () => !likeMuerto,
    /* «Sigue sonando», para que la pestaña «cola» pueda contar de dónde sale
       lo que viene detrás y marcar las que ha puesto ella. Se devuelve una
       copia plana: nadie de fuera debe poder tocar la sesión. */
    mezcla: () => ((mezcla && mezcla.puestas.size)
      ? { fuente: mezcla.fuente, semilla: { ...mezcla.semilla }, genero: mezcla.genero, texto: textoMezcla() }
      : null),   // sin nada detrás no hay nada que contar
    esDeLaMezcla: (uri) => !!(mezcla && uri && mezcla.puestas.has(uri)),
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
