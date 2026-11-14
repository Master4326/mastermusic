/* ==========================================================
   ▯ VÍDEO 9:16 — la app en formato de móvil, para grabar TikToks

   QUÉ ES. Un escenario a pantalla completa con un MARCO vertical exacto
   (9:16, el de TikTok, Reels y Shorts) y, al lado, un panel con las
   opciones y el botón de grabar. Dentro del marco va la letra DE VERDAD:
   el panel entero de la letra (#tab-lyrics) se muda al marco igual que el
   modo cine muda #lyricsEdit. Así entran solos los 120 efectos del modo
   edit, el karaoke de la vista lista, la onda que rodea el verso, las
   notas, los brillos, la escena de las canciones sin letra y la traducción
   — todo lo que ya funciona, midiendo su nuevo contenedor. No es una copia
   ni un vídeo aparte: es la app, de pie.

   TRES ESTILOS para lo que rodea a la letra:
     · app     — la app como se ve en un teléfono: barra de título, franja
                 con la carátula, el panel de la letra, la barra de progreso
                 de celdas, los mandos y las pestañas al pie.
     · vinilo  — tocadiscos grande con la carátula en la etiqueta, brazo que
                 recorre el disco y un aro de espectro alrededor.
     · letra   — solo la letra, a lo edit de TikTok, con la canción en una
                 ficha pequeña arriba.
   Y todo con los colores que la carátula le da a la app en ese momento.

   GRABAR. getDisplayMedia pide «compartir esta pestaña» (preferCurrentTab)
   y Region Capture (`CropTarget` + `cropTo`) recorta la captura al marco:
   el vídeo sale del tamaño EXACTO del marco en píxeles de pantalla, sin
   bandas negras ni el panel de al lado. El MediaRecorder graba MP4
   (H.264 + AAC) si el navegador sabe, o WebM si no.

   EL SONIDO, de donde mejor se pueda (ver js/espectro/, «EL SONIDO DEL
   VÍDEO 9:16»):
     · tu música importada → directo del <audio>, a nivel completo aunque
       la estés oyendo bajito;
     · Spotify sonando AQUÍ → el audio de la pestaña que trae el permiso
       (el del SDK va cifrado y no se puede sacar de otra forma). Y de paso
       ese audio se enchufa al espectro: con Spotify el fondo por fin baila
       con la música de verdad, también en el vídeo;
     · Spotify en OTRO aparato → solo con el ◈ (el audio del PC); si no, el
       panel lo avisa con dos arreglos a un toque.

   LO DELICADO, apuntado para que no se olvide:
     · Region Capture solo recorta si lo compartido es ESTA pestaña. Si se
       elige otra cosa en el diálogo, `cropTo` falla y se dice por qué.
     · El marco no puede cambiar de tamaño mientras graba (un vídeo no
       cambia de resolución a medias): se congela al empezar la cuenta.
     · Lo que se vea por encima del marco sale en el vídeo. Por eso el panel
       va FUERA del marco, las guías de TikTok se esconden al grabar y el
       marco deja de responder al ratón (nada de hovers en el vídeo).
     · Mientras está abierto, las teclas de la app que moverían lo de
       debajo (pestañas, W, S…) se quedan aquí: #tab-lyrics vive en el marco
       y una pestaña distinta lo escondería. Espacio, flechas y M siguen
       mandando en la música como siempre.
     · Salir con el vídeo sin guardar pide pulsar dos veces, sin confirm()
       (bloquea la página), y recargar con la grabación en marcha lo pregunta
       el propio navegador.

   ⛶ EL MODO CINE ES ESTE MISMO ESCENARIO (24-sep-2026). Antes el cine era
   otra pantalla (js/cinema.js, borrado) con su vinilo y su aura; ahora es
   el marco de aquí a pantalla ENTERA, con los mismos tres estilos: `modo`
   dice cuál de los dos está abierto. Lo que cambia en el cine:
     · el marco es la pantalla entera, sin panel ni grabación. En vertical
       (el teléfono) cada estilo es el del vídeo; en horizontal (el PC, o el
       teléfono tumbado) tiene su propia composición, que pone el CSS según
       `data-orient` (h/v), que se mide aquí;
     · una barra que asoma al mover el ratón o tocar la pantalla —estilo,
       vista de la letra, anterior/play/siguiente y salir— y se va sola a
       los 2,5 s con el cursor. En el teclado: 1 2 3 cambian el estilo y E
       la vista;
     · la barra de progreso se puede pulsar y arrastrar, y en «app» las
       pestañas y el engranaje del marco llevan a su pantalla;
     · sus opciones se guardan aparte (mm_cine_*): el cine y el vídeo pueden
       ir cada uno con su estilo;
     · salir de la pantalla completa (F11, Esc del navegador, el gesto de
       atrás del teléfono) cierra el cine, como siempre hizo.
   ========================================================== */
/* ==========================================================
   EL CINE ⛶ Y EL VÍDEO 9:16 ▯ · el escenario (js/cine/escenario.js)

   Lo que fue js/vertical.js (1.760 líneas) vive ahora en js/cine/, en
   cuatro archivos que se cargan seguidos y en este orden:

   escenario.js — las opciones que se recuerdan, el estado, montar el
   escenario y su marco exacto, la pantalla completa, y abrir y cerrar.
   contenido.js — los mandos de las opciones, qué suena dentro del marco,
   el bucle, los avisos del panel y el formato del vídeo.
   grabar.js — grabar el marco a un vídeo.
   arranque.js — lo que enseña el panel en cada fase, el teclado y las
   puertas (los botones y la API pública).

   Comparten el estado por la bolsa `comun` (window.MMInterno.cine): lo
   que cambia y usan varios archivos se lee y se escribe como `comun.x`;
   las funciones y constantes de un archivo anterior se recogen arriba de
   cada archivo y se usan por su nombre.
   ========================================================== */
(() => {
  'use strict';

  /* Lo que comparten entre sí los archivos de js/cine/. Uso interno: desde
     fuera se habla con window.CinemaModule y window.MMVertical (los arma
     js/cine/arranque.js). */
  window.MMInterno = window.MMInterno || {};
  const comun = window.MMInterno.cine = {};

  const $ = (id) => document.getElementById(id);
  comun.$ = $;
  const PC = () => window.PlayerCore;
  comun.PC = PC;
  const LY = () => window.LyricsModule;
  comun.LY = LY;
  const VIS = () => window.VisualizerModule;
  comun.VIS = VIS;
  const SP = () => window.SpotifyModule;
  comun.SP = SP;
  const calma = () => !!(window.MMSettings && window.MMSettings.reduceMotion());
  comun.calma = calma;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  comun.clamp = clamp;
  // el mismo juez de teclas que app.js y js/seven/ (js/teclas.js)
  const libre = (e) => {
    const T = window.MMTeclas;
    return T ? T.libre(e) : !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  };
  comun.libre = libre;
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60), q = Math.floor(s % 60);
    return m + ':' + (q < 10 ? '0' : '') + q;
  };
  comun.fmt = fmt;

  /* ¿Puede este navegador grabar SOLO el marco? Hace falta todo junto:
     compartir pantalla, grabar vídeo y recortar la captura a un elemento
     (Region Capture: Chrome, Edge y Opera de escritorio). Sin eso el modo
     sigue sirviendo para grabarlo con otra herramienta (OBS, Recortes…). */
  const puedeGrabar = comun.puedeGrabar = !!(navigator.mediaDevices
    && typeof navigator.mediaDevices.getDisplayMedia === 'function'
    && typeof window.MediaRecorder === 'function'
    && window.CropTarget && typeof window.CropTarget.fromElement === 'function');

  /* ▯ EL VÍDEO 9:16 ES SOLO DE LA COPIA LOCAL (29-sep-2026).
     Grabar el audio de Spotify en un archivo es lo que sus términos llaman
     «stream ripping», y su política también prohíbe sincronizar sus
     canciones con vídeo. El usuario lo quiere para él, en su equipo, y NO en
     la página publicada: el modo solo existe abriendo la app en local
     (127.0.0.1, localhost o el archivo suelto), igual que el ⚗ laboratorio
     de js/letra/. En la web publicada no hay botón, ni sección en
     ajustes, ni mando en el buscador, ni tecla V, y `abrir()` se niega a
     abrirlo. El CINE, que usa este mismo escenario, no cambia en nada.
     Va al revés de lo que parece: css/base/ esconde esas puertas SIEMPRE, y
     aquí se destapan con `html.con-916` solo en local. Así la página
     publicada no enseña el botón ni un instante mientras carga este archivo
     (los <script> van con defer y la ventana se pinta antes). */
  const enLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    || location.protocol === 'file:';
  const videoDisponible = comun.videoDisponible = enLocal;
  document.documentElement.classList.toggle('con-916', videoDisponible);

  // ---------- Opciones (se recuerdan) ----------
  const OPC = comun.OPC = {
    estilo:  { key: 'mm_916_estilo',  def: 'app',  vals: ['app', 'vinilo', 'letra'] },
    // sin elegir todavía: la vista que la app tenga puesta (≡, ✦ o ◉)
    vista:   { key: 'mm_916_vista',   def: '',     vals: ['lista', 'edit', 'palabra'] },
    empieza: { key: 'mm_916_empieza', def: 'aqui', vals: ['aqui', 'inicio', 'estribillo'] },
    dura:    { key: 'mm_916_dura',    def: 'mano', vals: ['15', '30', '60', 'cancion', 'mano'] },
    /* 1080p = el vídeo sale a 1080×1920 DE VERDAD (en una pantalla 1080p el
       marco se tumba mientras graba: ver «EL MARCO TUMBADO»); «pantalla» =
       del tamaño del marco que se ve, sin girar nada. Los dos a 60 fps. */
    calidad: { key: 'mm_916_calidad', def: 'hd',   vals: ['hd', 'pantalla'] },
    sonido:  { key: 'mm_916_sonido',  def: 'si',   vals: ['si', 'no'] },
    guias:   { key: 'mm_916_guias',   def: 'no',   vals: ['si', 'no'] },
    firma:   { key: 'mm_916_firma',   def: 'si',   vals: ['si', 'no'] },
    // las del cine, aparte: el vinilo es lo que siempre fue el cine, y el
    // cine siempre fue la letra animada
    cineEstilo: { key: 'mm_cine_estilo', def: 'vinilo', vals: ['app', 'vinilo', 'letra'] },
    cineVista:  { key: 'mm_cine_vista',  def: 'edit',   vals: ['lista', 'edit', 'palabra'] },
  };
  const pref = (id) => {
    const o = OPC[id];
    let v = null;
    try { v = localStorage.getItem(o.key); } catch (e) { /* privado o bloqueado */ }
    if (o.vals.includes(v)) return v;
    if (id === 'vista') {
      const L = LY();
      if (L && L.vistaElegida) return L.vistaElegida();
      return L && L.isEditMode && L.isEditMode() ? 'edit' : 'lista';
    }
    return o.def;
  };
  comun.pref = pref;
  const guardarPref = (id, v) => { try { localStorage.setItem(OPC[id].key, v); } catch (e) {} };
  comun.guardarPref = guardarPref;

  // ---------- Estado ----------
  comun.raiz = null; comun.marco = null; let zona = null;
  const el = comun.el = {};
  comun.abierto = false;
  let modo = 'video';                     // 'video' (el 9:16 para grabar) o 'cine'
  const enCine = () => modo === 'cine';
  comun.enCine = enCine;
  const prefEstilo = () => pref(enCine() ? 'cineEstilo' : 'estilo');
  comun.prefEstilo = prefEstilo;
  const prefVista = () => pref(enCine() ? 'cineVista' : 'vista');
  comun.prefVista = prefVista;
  /* listo · pidiendo (el diálogo del navegador) · cuenta (3·2·1) ·
     grabando · guardando (cerrando el archivo) · hecho (el vídeo, para verlo) */
  comun.fase = 'listo';
  let tabLyrics = null, slot = null, devolverFoco = null;
  comun.entreFull = false; comun.congelado = false; let cerrandoT = null;
  comun.captura = null; comun.pistaSonido = null; comun.planGrabado = 'no'; comun.queriaFull = false;
  comun.tumbado = false; comun.canal = null;      // el marco girado para grabar en 1080p, y su canal
  comun.rec = null; comun.trozos = []; comun.mimeElegido = ''; comun.dims = { w: 0, h: 0 };
  comun.t0 = 0; comun.acumPausa = 0; comun.marcaPausa = 0; comun.sinSonarDesde = 0; comun.pistaAlEmpezar = null; comun.durGrabada = 0;
  comun.resultado = null;
  comun.cuentaT = null; comun.cuentaCancelar = null; comun.guardandoT = null;
  comun.vistaPuesta = null;
  comun.geo = { x: 0, y: 0, w: 360, h: 640, wd: 360, hd: 640 };

  // ---------- El escenario ----------
  const grupo = (id, etiqueta, opciones) => `
    <div class="v916-fila">
      <span class="set-label">${etiqueta}</span>
      <div class="seg" data-v916="${id}" role="radiogroup" aria-label="${etiqueta}">
        ${opciones.map((o) => `<button class="seg-btn" type="button" data-val="${o[0]}">${o[1]}</button>`).join('')}
      </div>
    </div>`;

  const mando = (id, ico, extra) =>
    `<button type="button" class="v916-m${extra || ''}" data-v916-mando="${id}" tabindex="-1" aria-hidden="true">${ico}</button>`;

  const construir = () => {
    if (comun.raiz) return;
    comun.raiz = document.createElement('div');
    comun.raiz.className = 'v916';
    comun.raiz.hidden = true;
    comun.raiz.setAttribute('role', 'dialog');
    comun.raiz.setAttribute('aria-modal', 'true');
    comun.raiz.setAttribute('aria-label', 'Vídeo 9:16 para TikTok');
    comun.raiz.innerHTML = `
      <div class="v916-fondo" aria-hidden="true"></div>
      <div class="v916-borde" aria-hidden="true"></div>
      <div class="v916-marco" data-estilo="app">
        <div class="v916-bg" aria-hidden="true"><span class="v916-bg-img"></span><span class="v916-bg-velo"></span></div>
        <canvas class="v916-espectro" aria-hidden="true"></canvas>
        <div class="v916-disco-zona" aria-hidden="true">
          <div class="v916-disco"><span class="v916-brillo"></span><span class="v916-etiqueta"></span></div>
          <div class="v916-brazo"><span class="v916-br-base"></span><span class="v916-br-arm"><i class="v916-br-head"></i></span></div>
        </div>
        <div class="v916-tb" aria-hidden="true">
          <span class="v916-tb-ico"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
          <span class="v916-tb-txt">MASTER MUSIC</span>
          <i class="ico ico-ajustes" data-ir="settings"></i>
        </div>
        <div class="v916-ficha">
          <span class="v916-portada" aria-hidden="true"></span>
          <span class="v916-meta">
            <span class="v916-titulo">Sin canción</span>
            <span class="v916-artista"></span>
            <span class="v916-album"></span>
          </span>
        </div>
        <div class="v916-zona"></div>
        <div class="v916-pie">
          <div class="v916-prog" aria-hidden="true">
            <span class="v916-t v916-t-cur">0:00</span>
            <span class="v916-riel"><i class="v916-lleno"></i><i class="v916-cabeza"></i></span>
            <span class="v916-t v916-t-tot">0:00</span>
          </div>
          <div class="v916-mandos">
            ${mando('shuffleBtn', '<i class="ico ico-aleatorio"></i>', ' v916-m-shuffle')}
            ${mando('prevBtn', '<i class="ico ico-anterior"></i>')}
            ${mando('playBtn', '<i class="ico ico-play"></i><i class="ico ico-pausa"></i>', ' v916-m-play')}
            ${mando('nextBtn', '<i class="ico ico-siguiente"></i>')}
            ${mando('repeatBtn', '<i class="ico ico-repetir"></i>', ' v916-m-repeat')}
          </div>
          <!-- en el vídeo son dibujo; en el cine llevan a su pestaña (data-ir) -->
          <div class="v916-tabs" aria-hidden="true">
            <span class="on" data-ir="lyrics"><i class="ico ico-letra"></i>letra</span>
            <span data-ir="search"><i class="ico ico-buscar"></i>buscar</span>
            <span data-ir="library"><i class="ico ico-listas"></i>listas</span>
            <span data-ir="queue"><i class="ico ico-cola"></i>cola</span>
            <span data-ir="stats"><i class="ico ico-historial"></i>historial</span>
          </div>
        </div>
        <div class="v916-firma" aria-hidden="true">MASTER MUSIC</div>
        <div class="v916-acabado" aria-hidden="true"></div>
        <div class="v916-guias" aria-hidden="true" hidden>
          <div class="g-seguro"></div>
          <div class="g-arriba"><span>Siguiendo</span><b>Para ti</b></div>
          <div class="g-lado"><i class="g-av"></i><i></i><i></i><i></i><i></i><i class="g-disco"></i></div>
          <div class="g-abajo"><b>@tu_usuario</b><span></span><span></span><em>♪ sonido original</em></div>
          <div class="g-nav"><i></i><i></i><i class="g-mas"></i><i></i><i></i></div>
          <span class="g-nota">guías de tiktok · no salen en el vídeo</span>
        </div>
        <div class="v916-cuenta" aria-hidden="true" hidden><b>3</b></div>
        <video class="v916-vista" hidden playsinline controls preload="auto"></video>
      </div>

      <!-- Grabando en 1080p con el marco tumbado, el panel no cabe: esta
           franja a la derecha, FUERA del marco, dice que graba y para. -->
      <div class="v916-tira" hidden>
        <span class="t-rec"><i></i>rec</span>
        <b class="t-reloj">0:00</b>
        <button type="button" class="t-parar" title="Parar (R o Esc)" aria-label="Parar la grabación"><i class="ico ico-parar" aria-hidden="true"></i></button>
        <span class="t-nota">se graba derecho · 1080×1920</span>
      </div>

      <!-- ⛶ La barra del CINE: asoma al mover el ratón o tocar la pantalla y
           se va sola. En el vídeo 9:16 no existe (display: none). -->
      <div class="v916-cine-ui" tabindex="-1">
        <div class="cine-barra">
          <div class="cine-opts">
            <div class="seg cine-seg" data-v916="cineEstilo" role="radiogroup" aria-label="Estilo del cine (1 2 3)">
              <button class="seg-btn" type="button" data-val="app" title="La app (1)">app</button>
              <button class="seg-btn" type="button" data-val="vinilo" title="El tocadiscos (2)">vinilo</button>
              <button class="seg-btn" type="button" data-val="letra" title="Solo la letra (3)">letra</button>
            </div>
            <div class="seg cine-seg" data-v916="cineVista" role="radiogroup" aria-label="Vista de la letra (E)">
              <button class="seg-btn" type="button" data-val="lista" title="La letra entera, a lo karaoke (E)">lista</button>
              <button class="seg-btn" type="button" data-val="edit" title="Verso a verso, con efectos (E)">edit</button>
              <button class="seg-btn" type="button" data-val="palabra" title="Palabra a palabra, apiladas en 3D (E)">palabra</button>
            </div>
          </div>
          <div class="cine-trans">
            <button type="button" class="cine-tr" data-v916-mando="prevBtn" title="Anterior" aria-label="Canción anterior"><i class="ico ico-anterior" aria-hidden="true"></i></button>
            <button type="button" class="cine-tr cine-play" data-v916-mando="playBtn" title="Reproducir / pausa (espacio)" aria-label="Reproducir o pausar"><i class="ico ico-play" aria-hidden="true"></i><i class="ico ico-pausa" aria-hidden="true"></i></button>
            <button type="button" class="cine-tr" data-v916-mando="nextBtn" title="Siguiente" aria-label="Canción siguiente"><i class="ico ico-siguiente" aria-hidden="true"></i></button>
          </div>
          <button type="button" class="cine-x" title="Salir del cine (Esc)" aria-label="Salir del modo cine"><i class="ico ico-cerrar" aria-hidden="true"></i></button>
        </div>
      </div>

      <aside class="v916-panel" tabindex="-1" aria-label="Opciones del vídeo 9:16">
        <div class="v916-p-cab">
          <span class="v916-p-tit"><i class="ico ico-vertical" aria-hidden="true"></i>vídeo 9:16</span>
          <span class="v916-p-rec" aria-hidden="true"><i></i>rec</span>
          <button type="button" class="v916-p-full" title="Pantalla completa" aria-label="Pantalla completa"><i class="ico ico-cine" aria-hidden="true"></i></button>
          <button type="button" class="v916-x" title="Salir (Esc)" aria-label="Salir del vídeo 9:16"><i class="ico ico-cerrar" aria-hidden="true"></i></button>
        </div>
        <div class="v916-opts">
          ${grupo('estilo', 'estilo', [['app', 'app'], ['vinilo', 'vinilo'], ['letra', 'letra']])}
          ${grupo('vista', 'letra', [['lista', 'lista'], ['edit', 'edit'], ['palabra', 'palabra']])}
          ${grupo('empieza', 'empieza', [['aqui', 'aquí'], ['inicio', 'inicio'], ['estribillo', 'estribillo']])}
          ${grupo('dura', 'dura', [['15', '15 s'], ['30', '30 s'], ['60', '60 s'], ['cancion', 'canción'], ['mano', 'a mano']])}
          ${grupo('calidad', 'calidad', [['hd', '1080p · 60'], ['pantalla', 'pantalla']])}
          ${grupo('sonido', 'sonido', [['si', 'sí'], ['no', 'no']])}
          ${grupo('guias', 'guías', [['si', 'sí'], ['no', 'no']])}
          ${grupo('firma', 'firma', [['si', 'sí'], ['no', 'no']])}
        </div>
        <div class="v916-trans">
          <button type="button" class="v916-tr" data-v916-mando="prevBtn" title="Anterior" aria-label="Canción anterior"><i class="ico ico-anterior" aria-hidden="true"></i></button>
          <button type="button" class="v916-tr v916-tr-play" data-v916-mando="playBtn" title="Reproducir / pausa (espacio)" aria-label="Reproducir o pausar"><i class="ico ico-play" aria-hidden="true"></i><i class="ico ico-pausa" aria-hidden="true"></i></button>
          <button type="button" class="v916-tr" data-v916-mando="nextBtn" title="Siguiente" aria-label="Canción siguiente"><i class="ico ico-siguiente" aria-hidden="true"></i></button>
        </div>
        <button type="button" class="v916-rec" title="Grabar el marco (R)">
          <i class="ico ico-grabar v916-rec-ico" aria-hidden="true"></i><span class="v916-rec-txt">grabar</span>
        </button>
        <p class="v916-info" aria-live="polite"></p>
        <div class="v916-aviso" hidden></div>
        <p class="v916-msg" role="status" aria-live="polite" hidden></p>
        <div class="v916-hecho" hidden>
          <p class="v916-hecho-txt"></p>
          <div class="v916-hecho-acc">
            <button type="button" class="retro-btn v916-guardar"><i class="ico ico-descargar" aria-hidden="true"></i> guardar</button>
            <button type="button" class="retro-btn small v916-compartir" hidden>compartir</button>
            <button type="button" class="retro-btn small v916-tirar">tirar</button>
          </div>
          <a class="v916-tiktok" href="https://www.tiktok.com/upload" target="_blank" rel="noopener noreferrer">subir a tiktok ↗</a>
        </div>
        <button type="button" class="v916-soltar" hidden title="Deja de compartir la pestaña con la app">● pestaña compartida · soltar</button>
      </aside>`;
    document.body.appendChild(comun.raiz);

    const q = (s) => comun.raiz.querySelector(s);
    comun.marco = q('.v916-marco');
    zona = q('.v916-zona');
    Object.assign(el, {
      panel: q('.v916-panel'),
      opts: q('.v916-opts'),
      espectro: q('.v916-espectro'),
      bgImg: q('.v916-bg-img'),
      portada: q('.v916-portada'),
      etiqueta: q('.v916-etiqueta'),
      brazo: q('.v916-brazo'),
      titulo: q('.v916-titulo'),
      artista: q('.v916-artista'),
      album: q('.v916-album'),
      riel: q('.v916-riel'),
      cabeza: q('.v916-cabeza'),
      tCur: q('.v916-t-cur'),
      tTot: q('.v916-t-tot'),
      mShuffle: q('.v916-m-shuffle'),
      mRepeat: q('.v916-m-repeat'),
      guias: q('.v916-guias'),
      cuenta: q('.v916-cuenta'),
      cuentaNum: q('.v916-cuenta b'),
      vista: q('.v916-vista'),
      rec: q('.v916-rec'),
      recIco: q('.v916-rec-ico'),
      recTxt: q('.v916-rec-txt'),
      info: q('.v916-info'),
      aviso: q('.v916-aviso'),
      msg: q('.v916-msg'),
      hecho: q('.v916-hecho'),
      hechoTxt: q('.v916-hecho-txt'),
      compartir: q('.v916-compartir'),
      soltar: q('.v916-soltar'),
      full: q('.v916-p-full'),
      tira: q('.v916-tira'),
      tReloj: q('.v916-tira .t-reloj'),
      cineUi: q('.v916-cine-ui'),
      prog: q('.v916-prog'),
    });
    q('.v916-tira .t-parar').addEventListener('click', () => comun.alternarGrabar());

    // Opciones: las del panel del vídeo y las de la barra del cine, igual
    comun.raiz.addEventListener('click', (e) => {
      const b = e.target.closest('.seg-btn');
      const g = b && b.closest('.seg[data-v916]');
      if (!g) return;
      if (e.detail > 0) b.blur();          // el espacio sigue siendo play/pausa
      if (comun.fase === 'pidiendo' || comun.fase === 'cuenta' || comun.fase === 'grabando' || comun.fase === 'guardando') return;
      comun.elegir(g.dataset.v916, b.dataset.val);
    });

    // Los mandos del marco y los del panel pulsan los de verdad: ni una
    // línea de lógica de reproducción repetida aquí.
    comun.raiz.addEventListener('click', (e) => {
      /* En el cine, las pestañas y el engranaje del estilo «app» llevan a
         su pantalla: se sale del cine y se va. En el vídeo son dibujo. */
      const ir = enCine() && e.target.closest('[data-ir]');
      if (ir) {
        const t = ir.dataset.ir;
        if (t !== 'lyrics') { cerrar(); if (window.MMNav) window.MMNav.ir(t); }
        return;
      }
      const b = e.target.closest('[data-v916-mando]');
      if (!b) return;
      if (e.detail > 0 && document.activeElement === b) b.blur();
      if (comun.fase === 'cuenta' || comun.fase === 'grabando' || comun.fase === 'pidiendo') return;
      const real = document.getElementById(b.dataset.v916Mando);
      if (real) real.click();
    });

    // ⛶ el cine: salir, la barra que asoma y el progreso que se arrastra
    q('.cine-x').addEventListener('click', () => cerrar());
    comun.raiz.addEventListener('pointermove', comun.despertar, { passive: true });
    comun.raiz.addEventListener('pointerdown', comun.despertar, { passive: true });
    // con el ratón ENCIMA de la barra (a punto de pulsar algo) no se va
    el.cineUi.addEventListener('pointerenter', () => { comun.sobreBarra = true; });
    el.cineUi.addEventListener('pointerleave', () => { comun.sobreBarra = false; comun.despertar(); });
    el.prog.addEventListener('pointerdown', (e) => {
      if (!enCine() || !comun.rielW) return;
      comun.arrastre = comun.pctRiel(e.clientX);
      comun.progPx = -1;
      try { el.prog.setPointerCapture(e.pointerId); } catch (err) { /* sin captura también vale */ }
    });
    el.prog.addEventListener('pointermove', (e) => {
      if (comun.arrastre == null) return;
      comun.arrastre = comun.pctRiel(e.clientX);
      comun.progPx = -1;
    });
    el.prog.addEventListener('pointerup', (e) => {
      if (comun.arrastre == null) return;
      const p = comun.pctRiel(e.clientX);
      comun.arrastre = null;
      comun.progPx = -1;
      const P = PC();
      const dur = P && P.duration ? P.duration() || 0 : 0;
      if (P && P.seek && dur > 0) P.seek(p * dur);
      comun.despertar();
    });
    el.prog.addEventListener('pointercancel', () => { comun.arrastre = null; comun.progPx = -1; });

    el.rec.addEventListener('click', (e) => { if (e.detail > 0) el.rec.blur(); comun.alternarGrabar(); });
    q('.v916-x').addEventListener('click', () => cerrar());
    el.full.addEventListener('click', (e) => {
      if (e.detail > 0) el.full.blur();
      if (document.fullscreenElement) soltarPantalla(true); else pedirPantalla();
    });
    q('.v916-guardar').addEventListener('click', comun.guardar);
    el.compartir.addEventListener('click', comun.compartir);
    q('.v916-tirar').addEventListener('click', (e) => {
      if (comun.resultado && !comun.resultado.guardado && !comun.confirmado(e.currentTarget, 'no lo has guardado · pulsa «tirar» otra vez para borrarlo')) return;
      comun.descartar();
    });
    el.soltar.addEventListener('click', () => {
      if (comun.fase === 'listo' || comun.fase === 'hecho') { comun.soltarCaptura(); comun.pintarFase(); }
    });
    el.aviso.addEventListener('click', comun.alAviso);
    el.vista.addEventListener('error', () => { comun.mensaje('el navegador no sabe enseñar este vídeo, pero se guarda igual'); });
  };

  // ---------- El marco: tamaño EXACTO en píxeles de pantalla ----------
  /* El vídeo sale del tamaño del marco en píxeles de verdad (los de la
     pantalla, no los CSS). Por eso se calcula aquí y no con un aspect-ratio:
     alto y ancho PARES —el H.264 no admite impares— y la esquina en un
     píxel entero, o el recorte cae entre dos píxeles y sale borroso. Con la
     pantalla completa de un monitor 1080p: 608 × 1080. */
  const GAP = 24;
  /* ══════ EL MARCO TUMBADO ══════
     En una pantalla 1080p el marco de pie mide, como mucho, 1080 píxeles
     de ALTO: el vídeo saldría a 608×1080. Pero la pantalla tiene 1920 de
     ANCHO. Así que para grabar en 1080p el marco se TUMBA (rotate(-90deg))
     y ocupa la pantalla a lo ancho: por dentro se maqueta a 1040×1848
     píxeles de verdad —todo va en unidades del marco, así que la letra y
     los efectos salen igual de colocados, solo que nítidos— y el canal de
     grabación lo endereza a 1080×1920. Mientras graba se ve de lado; el
     vídeo sale derecho. La franja de la derecha (TIRA) queda fuera del
     marco para decir que graba y poder parar. */
  const TIRA = 76;
  const alto = () => Math.floor(window.innerHeight * (window.devicePixelRatio || 1));
  // 1080p de verdad sin girar solo si la pantalla ya tiene 1920 de alto (4K)
  const hayQueTumbar = () => alto() < 1920;
  comun.hayQueTumbar = hayQueTumbar;
  // sin captureStream no hay forma de enderezar ni de escalar: se graba el marco tal cual
  const puedeHD = comun.puedeHD = typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function';
  const medirTumbado = (vw, vh, dpr) => {
    const libre = vw - TIRA;
    const hL = Math.min(libre, (vh * 16) / 9);
    const hd = Math.max(32, Math.floor((hL * dpr) / 2) * 2);   // su ALTO, que en pantalla es el ancho
    const wd = Math.max(18, Math.round((hd * 9) / 32) * 2);
    const w = wd / dpr, h = hd / dpr;
    // la caja ya girada (h de ancho, w de alto), centrada y en píxel entero
    const bx = Math.round(((libre - h) / 2) * dpr) / dpr;
    const by = Math.round(((vh - w) / 2) * dpr) / dpr;
    return { x: bx + h / 2 - w / 2, y: by + w / 2 - h / 2, w, h, wd, hd };
  };
  const medirMarco = () => {
    if (!comun.raiz || !comun.abierto || comun.congelado) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    /* En el cine el marco es la pantalla entera (lo pone el CSS) y aquí solo
       se mira hacia dónde está: de pie, cada estilo es el del vídeo; tumbado,
       el suyo de horizontal. Al girar, el verso se vuelve a pintar: el modo
       edit elige sus tamaños midiendo el hueco, y el hueco ya es otro. */
    if (enCine()) {
      comun.geo = { x: 0, y: 0, w: vw, h: vh, wd: Math.round(vw * dpr), hd: Math.round(vh * dpr) };
      const orient = vw > vh ? 'h' : 'v';
      const giro = comun.raiz.dataset.orient && comun.raiz.dataset.orient !== orient;
      comun.raiz.dataset.orient = orient;
      comun.medirLienzo();
      comun.medirRiel();
      if (giro && LY() && LY().repintar) LY().repintar();
      return;
    }
    if (comun.tumbado) {
      comun.geo = medirTumbado(vw, vh, dpr);
      const st = comun.raiz.style;
      st.setProperty('--v916-x', comun.geo.x + 'px');
      st.setProperty('--v916-y', comun.geo.y + 'px');
      st.setProperty('--v916-w', comun.geo.w + 'px');
      st.setProperty('--v916-h', comun.geo.h + 'px');
      comun.medirLienzo();
      comun.medirRiel();
      return;
    }
    const pw = vw < 980 ? 272 : 340;
    const libreW = Math.max(180, vw - pw - GAP * 3);
    const hCss = Math.min(vh, libreW * 16 / 9);
    const hd = Math.max(32, Math.floor((hCss * dpr) / 2) * 2);
    const wd = Math.max(18, Math.round((hd * 9) / 32) * 2);
    const w = wd / dpr, h = hd / dpr;
    let x = (vw - w) / 2;
    if (vw - (x + w) < pw + GAP * 2) x = Math.max(GAP, vw - pw - GAP * 2 - w);
    x = Math.round(x * dpr) / dpr;
    const y = Math.round(((vh - h) / 2) * dpr) / dpr;
    comun.geo = { x, y, w, h, wd, hd };
    const s = comun.raiz.style;
    s.setProperty('--v916-x', x + 'px');
    s.setProperty('--v916-y', y + 'px');
    s.setProperty('--v916-w', w + 'px');
    s.setProperty('--v916-h', h + 'px');
    s.setProperty('--v916-pw', pw + 'px');
    s.setProperty('--v916-px', Math.round(Math.min(vw - pw - GAP, x + w + GAP * 1.5)) + 'px');
    comun.medirLienzo();
    comun.medirRiel();
    comun.pintarInfo();
  };
  comun.medirMarco = medirMarco;
  comun.medirPendiente = false;

  // ---------- Pantalla completa ----------
  const pedirPantalla = () => {
    if (document.fullscreenElement) return;
    const d = document.documentElement;
    const f = d.requestFullscreen || d.webkitRequestFullscreen;
    if (!f) return;
    try {
      const r = f.call(d);
      comun.entreFull = true;
      if (r && r.catch) r.catch(() => { comun.entreFull = false; });
    } catch (e) { comun.entreFull = false; }
  };
  comun.pedirPantalla = pedirPantalla;
  // Solo se sale si ENTRÓ el modo (o si lo pide el botón): si ya estabas a
  // pantalla completa por tu cuenta, cerrar esto no te la quita.
  const soltarPantalla = (aMano) => {
    if (!document.fullscreenElement || (!comun.entreFull && !aMano)) return;
    comun.entreFull = false;
    const f = document.exitFullscreen || document.webkitExitFullscreen;
    if (f) { try { const r = f.call(document); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
  };
  /* A diferencia del cine, salir de pantalla completa NO cierra el modo: el
     diálogo de «compartir esta pestaña» puede sacarte de ella, y perder el
     escenario justo al darle a grabar sería lo peor. Se re-mide y listo. */
  /* El cine, en cambio, SÍ se cierra (como siempre hizo): si sales de la
     pantalla completa con F11, con el Esc del navegador o con el gesto de
     atrás del teléfono, quedarse como capa dentro de la ventana sería lo
     peor de los dos mundos. Solo si llegó a entrar: en un navegador que no
     la da (el iPhone) el cine vive como capa desde el principio. */
  comun.cineFull = false;

  // ---------- Abrir y cerrar ----------
  /* `que` = 'cine' abre el modo cine; cualquier otra cosa (o nada: los
     botones pasan su evento) abre el vídeo 9:16. Uno cada vez: los dos se
     quieren llevar la misma letra. */
  const abrir = (que) => {
    if (comun.abierto) return;
    // el vídeo 9:16 no existe en la página publicada (ver `videoDisponible`)
    if (que !== 'cine' && !videoDisponible) return;
    construir();
    tabLyrics = $('tab-lyrics');
    if (!tabLyrics) return;
    if (window.MMCompartir && window.MMCompartir.abierto && window.MMCompartir.abierto()) window.MMCompartir.cerrar();
    if (window.MMNav) window.MMNav.ir('lyrics');

    modo = que === 'cine' ? 'cine' : 'video';
    comun.abierto = true;
    clearTimeout(cerrandoT);
    devolverFoco = document.activeElement;
    slot = document.createComment('tab-lyrics-slot');
    tabLyrics.parentNode.insertBefore(slot, tabLyrics);
    zona.appendChild(tabLyrics);

    comun.raiz.classList.toggle('cine', enCine());
    comun.raiz.setAttribute('aria-label', enCine() ? 'Modo cine' : 'Vídeo 9:16 para TikTok');
    if (!enCine()) delete comun.raiz.dataset.orient;
    document.body.classList.add('v916-open');
    // el cine, además, a pantalla ENTERA: js/ambient.js no respira la letra
    document.body.classList.toggle('cine-open', enCine());
    comun.raiz.hidden = false;
    comun.raiz.classList.remove('saliendo', 'quieto');
    void comun.raiz.offsetWidth;                 // la transición de entrada arranca desde 0
    comun.raiz.classList.add('entrando');
    comun.cineFull = false;
    pedirPantalla();
    comun.fase = !enCine() && comun.resultado ? 'hecho' : 'listo';
    comun.marco.dataset.estilo = prefEstilo();
    comun.raiz.classList.toggle('sin-firma', !enCine() && pref('firma') === 'no');
    medirMarco();
    comun.pintarSegs();
    comun.firmaPista = null;
    comun.vistaPuesta = null;
    comun.aplicarVista(true);                    // y de paso repinta el verso en su sitio nuevo
    comun.pintarFase();
    comun.avisoSonido();
    comun.arrancarBucle();
    comun.sobreBarra = false;
    comun.despertar();                           // la barra del cine se deja ver al entrar
    // la pantalla completa asienta el tamaño un frame después
    requestAnimationFrame(() => requestAnimationFrame(medirMarco));
    /* El foco va al PANEL, no a un botón: con el foco en «grabar», el
       espacio —que aquí sigue siendo play/pausa— pulsaría grabar. En el
       cine, a su barra, por lo mismo. */
    setTimeout(() => {
      if (comun.abierto) (enCine() ? el.cineUi : el.panel).focus({ preventScroll: true });
    }, 30);
  };
  comun.abrir = abrir;

  let avisoCerrarT = 0;
  const cerrar = () => {
    if (!comun.abierto) return;
    // grabando, primero se para (y el vídeo se queda para verlo)
    if (comun.fase === 'grabando') { comun.parar(); return; }
    if (comun.fase === 'cuenta') { comun.cancelarCuenta(); return; }
    if (comun.fase === 'pidiendo' || comun.fase === 'guardando') return;
    if (comun.resultado && !comun.resultado.guardado && Date.now() - avisoCerrarT > 5000) {
      avisoCerrarT = Date.now();
      comun.mensaje('el vídeo no está guardado · sal otra vez para tirarlo, o dale a «guardar»');
      return;
    }
    avisoCerrarT = 0;
    comun.abierto = false;
    comun.descartar(true);
    comun.soltarCaptura();
    comun.pararBucle();
    if (slot && slot.parentNode) {
      slot.parentNode.insertBefore(tabLyrics, slot);
      slot.remove();
    }
    slot = null;
    comun.vistaPuesta = null;
    // vuelve la vista que tengas elegida en la app, con el verso de ahora
    if (LY() && LY().forzarVista) LY().forzarVista(null);
    document.body.classList.remove('v916-open', 'cine-open');
    clearTimeout(comun.quietoT);
    comun.arrastre = null;
    comun.raiz.classList.remove('entrando', 'quieto');
    comun.raiz.classList.add('saliendo');
    soltarPantalla(false);
    clearTimeout(cerrandoT);
    cerrandoT = setTimeout(() => {
      if (!comun.abierto) { comun.raiz.hidden = true; comun.raiz.classList.remove('saliendo'); }
    }, calma() ? 0 : 260);
    const f = devolverFoco;
    devolverFoco = null;
    if (f && f.focus && document.contains(f)) f.focus({ preventScroll: true });
  };
  comun.cerrar = cerrar;
})();
/* ==========================================================
   EL CINE Y EL VÍDEO 9:16 · lo que va dentro (js/cine/contenido.js)

   Los mandos de las opciones, qué suena en el marco (ficha, carátula,
   progreso), el bucle que lo mantiene al día, los avisos del panel, el
   formato del vídeo y dónde empieza. Reparto de js/cine/: ver
   escenario.js.
   ========================================================== */
(() => {
  'use strict';
  const comun = window.MMInterno.cine;
  const {
    $, PC, LY, VIS, SP, calma, clamp, fmt, puedeGrabar, OPC, pref, guardarPref, el, enCine,
    prefEstilo, prefVista, puedeHD
  } = comun;

  // ---------- Opciones ----------
  const pintarSegs = () => {
    comun.raiz.querySelectorAll('.seg[data-v916]').forEach((g) => {
      const v = pref(g.dataset.v916);
      g.querySelectorAll('.seg-btn').forEach((b) => {
        const on = b.dataset.val === v;
        b.classList.toggle('active', on);
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    });
  };
  comun.pintarSegs = pintarSegs;

  // las guías de TikTok son cosa del vídeo: en el cine no hay TikTok encima
  const pintarGuias = () => {
    if (el.guias) el.guias.hidden = !(!enCine() && pref('guias') === 'si' && comun.fase === 'listo');
  };
  comun.pintarGuias = pintarGuias;

  const elegir = (id, v) => {
    if (!OPC[id] || !OPC[id].vals.includes(v) || pref(id) === v) return;
    guardarPref(id, v);
    pintarSegs();
    if (id === 'estilo' || id === 'firma' || id === 'cineEstilo') cambiarEstilo();
    else if (id === 'vista' || id === 'cineVista') aplicarVista(true);
    else if (id === 'guias') pintarGuias();
    avisoSonido();
    pintarInfo();
  };
  comun.elegir = elegir;

  /* ══════ La barra del cine: asoma y se va ══════
     Como en cualquier reproductor de vídeo: al mover el ratón o tocar la
     pantalla salen la barra y el cursor, y a los 2,5 s quietos se van. No
     se va con el ratón encima de la barra ni arrastrando el progreso. */
  comun.quietoT = null; comun.sobreBarra = false;
  const despertar = () => {
    if (!comun.abierto || !enCine()) return;
    // llega con cada movimiento del ratón: la clase solo se toca si cambia
    if (comun.raiz.classList.contains('quieto')) comun.raiz.classList.remove('quieto');
    clearTimeout(comun.quietoT);
    comun.quietoT = setTimeout(() => {
      if (!comun.abierto || !enCine()) return;
      if (comun.sobreBarra || comun.arrastre != null) { despertar(); return; }
      comun.raiz.classList.add('quieto');
      // el foco no se queda en un botón escondido (el espacio lo pulsaría)
      if (el.cineUi.contains(document.activeElement) && document.activeElement !== el.cineUi) {
        el.cineUi.focus({ preventScroll: true });
      }
    }, 2500);
  };
  comun.despertar = despertar;

  // Otro estilo = otra geometría: se re-mide y el verso se vuelve a pintar
  // en su sitio nuevo (el edit mide su contenedor para elegir tamaños).
  const cambiarEstilo = () => {
    comun.marco.dataset.estilo = prefEstilo();
    comun.raiz.classList.toggle('sin-firma', !enCine() && pref('firma') === 'no');
    // en el cine, el estilo nuevo entra fundido (una vez por cambio, no por frame)
    if (enCine() && !calma()) {
      comun.marco.classList.remove('cambia');
      void comun.marco.offsetWidth;
      comun.marco.classList.add('cambia');
    }
    requestAnimationFrame(() => {
      medirLienzo();
      medirRiel();
      if (LY() && LY().repintar) LY().repintar();
    });
  };

  /* La vista de la letra dentro del marco. Una letra SIN tiempos no puede ir
     en edit ni en palabra (las dos necesitan saber cuándo entra cada verso):
     ahí va la lista, sin decir nada. Mientras la letra llega, se respeta la
     elegida. */
  const aplicarVista = (forzar) => {
    const L = LY();
    if (!L || !L.forzarVista) return;
    const s = L.getSync ? L.getSync() : null;
    const lines = (s && s.lines) || [];
    const sinTiempos = lines.length > 0 && !(lines[0].time >= 0);
    const p = prefVista();
    const v = (p === 'edit' || p === 'palabra') && !sinTiempos ? p : 'lista';
    if (!forzar && v === comun.vistaPuesta) return;
    comun.vistaPuesta = v;
    L.forzarVista(v);
  };
  comun.aplicarVista = aplicarVista;

  // ---------- Qué suena en el marco ----------
  comun.firmaPista = null;
  const pintarPista = (t) => {
    const firma = t ? (t.id || '') + '|' + (t.name || '') + '|' + (t.cover || '') : '';
    if (firma === comun.firmaPista) return;
    comun.firmaPista = firma;
    el.titulo.textContent = t ? (t.name || t.title || 'Sin título') : 'Sin canción';
    el.artista.textContent = t ? (t.artist || '') : 'pon algo para empezar';
    el.album.textContent = t ? (t.album || '') : '';
    const img = t && t.cover ? 'url("' + String(t.cover).replace(/"/g, '%22') + '")' : '';
    el.portada.style.backgroundImage = img;
    el.etiqueta.style.backgroundImage = img;
    el.bgImg.style.backgroundImage = img;
    comun.marco.classList.toggle('sin-portada', !img);
  };

  /* Progreso: el relleno se recorta con clip-path (así sus celdas pixel no se
     estiran, que es lo que haría un scaleX) y la cabeza va por transform. Se
     escribe solo cuando cambia un píxel: en una canción de tres minutos son
     unas pocas escrituras por segundo, no sesenta. */
  comun.rielW = 0; comun.progPx = -1; let tCurTxt = ''; let tTotTxt = '';
  // en el cine el progreso se arrastra: mientras, manda el dedo (0…1) y no la canción
  comun.arrastre = null;
  const medirRiel = () => { comun.rielW = el.riel ? el.riel.clientWidth : 0; comun.progPx = -1; };
  comun.medirRiel = medirRiel;
  const pctRiel = (x) => {
    const r = el.riel.getBoundingClientRect();
    return r.width > 0 ? clamp((x - r.left) / r.width, 0, 1) : 0;
  };
  comun.pctRiel = pctRiel;
  const fantasma = (n, txt) => { n.textContent = txt; n.dataset.g = txt.replace(/\d/g, '8'); };
  const pintarProgreso = (P) => {
    const dur = P.duration ? P.duration() || 0 : 0;
    const pos = comun.arrastre != null ? comun.arrastre * dur : Math.max(0, P.position ? P.position() || 0 : 0);
    const p = dur > 0 ? clamp(pos / dur, 0, 1) : 0;
    const px = Math.round(p * comun.rielW);
    if (px !== comun.progPx) {
      comun.progPx = px;
      el.riel.style.setProperty('--p', p.toFixed(4));
      el.cabeza.style.transform = 'translateX(' + px + 'px)';
    }
    const a = fmt(pos), b = fmt(dur);
    if (a !== tCurTxt) { tCurTxt = a; fantasma(el.tCur, a); }
    if (b !== tTotTxt) { tTotTxt = b; fantasma(el.tTot, b); }
  };

  /* Brazo del tocadiscos, con la geometría del tocadiscos del cine de antes:
     pivote fuera del plato, largo fijo, y la aguja que va del
     surco de fuera (-77,8°) al de dentro (-51,6°) según avanza la canción. */
  const BR_FUERA = -77.8, BR_DENTRO = -51.6, BR_PARADO = -90;
  let brAng = '', brApoyado = null;
  const pintarBrazo = (P) => {
    if (comun.marco.dataset.estilo !== 'vinilo') return;
    const sonando = !!(P.playing && P.playing());
    const dur = P.duration ? P.duration() : 0;
    let ang = BR_PARADO;
    if (sonando && dur > 0) ang = BR_FUERA + (BR_DENTRO - BR_FUERA) * clamp(P.position() / dur, 0, 1);
    const v = ang.toFixed(1) + 'deg';
    if (v !== brAng) { brAng = v; el.brazo.style.setProperty('--br-ang', v); }
    if (sonando !== brApoyado) { brApoyado = sonando; el.brazo.classList.toggle('apoyado', sonando); }
  };

  /* El espectro del marco: el aro alrededor del vinilo, o en el estilo «app»
     las columnas de segmentos detrás de la franja (como el visualizador de
     la app en el móvil, al 22 %). Sale de VisualizerModule.getBands, que sin
     señal da su onda de reposo: nunca se queda muerto. Resplandor con una
     pasada ancha y tenue, NO con shadowBlur (desenfoca en CPU por trazo). */
  let ctxE = null, eW = 0, eH = 0, eDpr = 1;
  const medirLienzo = () => {
    const cv = el.espectro;
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) { eW = eH = 0; return; }
    eDpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * eDpr), H = Math.round(h * eDpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    eW = W; eH = H;
  };
  comun.medirLienzo = medirLienzo;
  let acento = '#5ce1e6', acentoT = 0;
  const leerAcento = (ahora) => {
    if (ahora - acentoT < 300) return acento;
    acentoT = ahora;
    const v = getComputedStyle(document.body).getPropertyValue('--accent').trim();
    if (v) acento = v;
    return acento;
  };
  const aro = (c, b) => {
    const N = 96, cx = eW / 2, cy = eH / 2;
    const lado = Math.min(eW, eH);
    const r0 = lado * 0.32 * 1.04;          // el disco mide el 64 % del lienzo
    const largo = lado * 0.12;
    const grosor = Math.max(1.5 * eDpr, ((2 * Math.PI * r0) / N) * 0.5);
    c.lineCap = 'butt';
    for (let pase = 0; pase < 2; pase++) {
      c.globalAlpha = pase ? 0.9 : 0.2;
      c.lineWidth = pase ? grosor : grosor * 2.8;
      c.beginPath();
      for (let i = 0; i < N; i++) {
        const k = i < N / 2 ? i : N - 1 - i;              // espejo: graves arriba
        const v = b[Math.min(b.length - 1, Math.round((k / (N / 2 - 1)) * (b.length - 1)))] || 0;
        const len = 1.5 * eDpr + v * largo;
        const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        c.moveTo(cx + ca * r0, cy + sa * r0);
        c.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len));
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  };
  const columnas = (c, b) => {
    const N = 32;
    const paso = eW / N;
    const bw = Math.max(1, Math.floor(paso * 0.72));
    const seg = Math.max(2 * eDpr, Math.round(eH / 13));
    const hueco = Math.max(1, Math.round(seg * 0.4));
    const filas = Math.max(1, Math.floor(eH / (seg + hueco)));
    for (let i = 0; i < N; i++) {
      const v = b[Math.min(b.length - 1, Math.round((i / (N - 1)) * (b.length - 1)))] || 0;
      const on = Math.round(v * filas);
      const x = Math.round(i * paso + (paso - bw) / 2);
      for (let f = 0; f < filas; f++) {
        c.globalAlpha = f < on ? 0.9 : 0.1;
        c.fillRect(x, eH - (f + 1) * (seg + hueco) + hueco, bw, seg);
      }
    }
    c.globalAlpha = 1;
  };
  const pintarEspectro = (ahora) => {
    const estilo = comun.marco.dataset.estilo;
    if (estilo === 'letra' || !eW) return;
    if (!ctxE) ctxE = el.espectro.getContext('2d');
    const V = VIS();
    const bandas = V && V.getBands ? V.getBands(48) : null;
    ctxE.clearRect(0, 0, eW, eH);
    if (!bandas) return;
    const ac = leerAcento(ahora);
    ctxE.strokeStyle = ac;
    ctxE.fillStyle = ac;
    if (estilo === 'vinilo') aro(ctxE, bandas); else columnas(ctxE, bandas);
  };

  // ---------- El bucle ----------
  let raf = 0; let lentoT = 0; comun.relojT = '';
  const reloj = { ultimo: 0 };
  const fotograma = () => {
    const ahora = performance.now();
    const P = PC();
    if (!P || !P.state) return;
    pintarPista(P.state.currentTrack);
    pintarProgreso(P);
    pintarBrazo(P);
    pintarEspectro(ahora);
    if (ahora - lentoT > 300) { lentoT = ahora; pintarLento(P); }
    comun.vigilarGrabacion(P, ahora);
  };
  /* El fotograma lo pide el reloj de la app (js/perf.js) mientras el
     escenario esté abierto. Sonando —o contando, o grabando— va al tope de
     siempre; en pausa y sin grabar basta con 15 pasadas por segundo: nada
     se mueve y solo hay que enterarse de un cambio de canción o de mando. */
  let mandoV = null;
  const enReposo = () => (comun.fase === 'listo' || comun.fase === 'hecho') &&
    !document.body.classList.contains('playing');
  const bucle = () => {            // solo sin js/perf.js
    if (!comun.abierto) { raf = 0; return; }
    raf = requestAnimationFrame(bucle);
    if (document.hidden) return;
    if (window.MMPerf && window.MMPerf.salta(reloj, performance.now())) return;
    fotograma();
  };
  const arrancarBucle = () => {
    const M = window.MMPerf;
    if (M && M.bucle) {
      if (!mandoV) {
        mandoV = M.bucle(fotograma, {
          ms: () => (enReposo() ? 66 : M.msFrame()),
          activo: () => comun.abierto,
        });
      } else mandoV.despertar();
      return;
    }
    if (!raf) raf = requestAnimationFrame(bucle);
  };
  comun.arrancarBucle = arrancarBucle;
  const pararBucle = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  comun.pararBucle = pararBucle;

  const pintarLento = (P) => {
    if (el.mShuffle) el.mShuffle.classList.toggle('on', !!P.state.shuffle);
    if (el.mRepeat) {
      el.mRepeat.classList.toggle('on', P.state.repeat && P.state.repeat !== 'off');
      el.mRepeat.classList.toggle('uno', P.state.repeat === 'one');
    }
    aplicarVista(false);
    if (comun.fase === 'listo' && !enCine()) {
      el.rec.disabled = !puedeGrabar || !P.state.currentTrack;
      avisoSonido();
      pintarInfo();
    }
  };

  // ---------- Avisos del panel ----------
  let msgT = null;
  const mensaje = (txt) => {
    if (!el.msg) return;
    clearTimeout(msgT);
    el.msg.textContent = txt || '';
    el.msg.hidden = !txt;
    if (txt) msgT = setTimeout(() => { el.msg.hidden = true; }, 7000);
  };
  comun.mensaje = mensaje;

  let confirmarBtn = null, confirmarHasta = 0;
  const confirmado = (btn, txt) => {
    const ahora = Date.now();
    if (confirmarBtn === btn && ahora < confirmarHasta) { confirmarBtn = null; return true; }
    confirmarBtn = btn;
    confirmarHasta = ahora + 5000;
    mensaje(txt);
    return false;
  };
  comun.confirmado = confirmado;

  /* De dónde saldría el sonido si se grabara ahora mismo. */
  const planSonido = () => {
    if (pref('sonido') === 'no') return 'no';
    const P = PC();
    const t = P && P.state && P.state.currentTrack;
    if (!t) return 'no';
    if (!P.isSpotify()) return 'local';
    const S = SP();
    if (S && S.suenaAqui && S.suenaAqui()) return 'pestana';
    if (VIS() && VIS().haySync && VIS().haySync()) return 'sync';
    return 'lejos';
  };
  comun.planSonido = planSonido;

  let avisoFirma = '';
  const avisoSonido = () => {
    if (!el.aviso) return;
    const P = PC();
    const plan = planSonido();
    let html = '', firma = '';
    if (plan === 'lejos') {
      const d = SP() && SP().device ? SP().device() : null;
      const donde = d && d.name ? '«' + d.name + '»' : 'otro aparato';
      firma = 'lejos|' + donde;
      const hayPc = !!$('vizSyncBtn') && puedeGrabar;
      html = `<p>la música suena en ${escapar(donde)}: así el vídeo sale <b>sin sonido</b></p>
        <button type="button" class="retro-btn small" data-aviso="aqui">pásala aquí</button>
        ${hayPc ? '<button type="button" class="retro-btn small" data-aviso="pc">◈ audio del pc</button>' : ''}
        <button type="button" class="retro-btn small" data-aviso="mudo">sin sonido</button>`;
    } else if ((plan === 'local' || plan === 'pestana') && P && P.state && P.state.volume <= 0.001) {
      firma = 'mudo';
      html = '<p>el volumen está en 0: el vídeo saldría mudo</p>';
    }
    if (firma === avisoFirma) return;
    avisoFirma = firma;
    el.aviso.innerHTML = html;
    el.aviso.hidden = !html;
  };
  comun.avisoSonido = avisoSonido;

  const alAviso = async (e) => {
    const b = e.target.closest('[data-aviso]');
    if (!b) return;
    const que = b.dataset.aviso;
    if (que === 'aqui') {
      let ok = false;
      try { ok = !!(SP() && SP().pasarAqui && await SP().pasarAqui()); } catch (err) { ok = false; }
      mensaje(ok ? '◆ la música pasa a sonar aquí' : '✕ el reproductor de esta pestaña no está listo');
    } else if (que === 'pc') {
      // el ◈ de siempre: el clic viaja con el gesto, así que puede preguntar
      const s = $('vizSyncBtn');
      if (s) s.click();
    } else if (que === 'mudo') {
      guardarPref('sonido', 'no');
      pintarSegs();
    }
    /* null y no '': «sin aviso» también se escribe '', y con la firma a ''
       el repintado de abajo creía que no había cambiado nada y el aviso se
       quedaba puesto (lo cazó assets/vertical-test.mjs). */
    avisoFirma = null;
    setTimeout(() => { avisoSonido(); pintarInfo(); }, 400);
  };
  comun.alAviso = alAviso;

  const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Formato del vídeo ----------
  /* MP4 primero: es lo que abre cualquier teléfono y lo que TikTok prefiere.
     El genérico «avc1» deja que el navegador elija el nivel del H.264 según
     el tamaño (un nivel fijo se queda corto en una pantalla 4K). Si no hay
     H.264 (algunos Chromium sin códecs de pago), WebM: TikTok también lo
     acepta subiéndolo desde el ordenador. */
  /* El «video/mp4» a secas va DETRÁS de los WebM: sin decir códecs, un
     navegador sin AAC (Opera, por licencias, puede no traerlo) metería otro
     audio dentro del MP4 que muchos reproductores no abren. Mejor un WebM
     con los códecs dichos. */
  const MIMES_CON = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus', 'video/mp4', 'video/webm'];
  const MIMES_SIN = ['video/mp4;codecs=avc1', 'video/mp4;codecs=avc1.640028',
    'video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/mp4', 'video/webm'];
  const elegirMime = (conSonido) => {
    if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    for (const m of conSonido ? MIMES_CON : MIMES_SIN) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* sigue probando */ }
    }
    return '';
  };
  comun.elegirMime = elegirMime;

  const pintarInfo = () => {
    if (!el.info) return;
    el.soltar.hidden = !(comun.captura && (comun.fase === 'listo' || comun.fase === 'hecho'));
    if (!puedeGrabar) {
      el.info.textContent = 'este navegador no puede grabar solo el marco · prueba en chrome o edge';
      return;
    }
    if (comun.fase !== 'listo') return;
    const plan = planSonido();
    const conSon = plan !== 'no' && plan !== 'lejos';
    const ext = /mp4/.test(elegirMime(conSon)) ? 'mp4' : 'webm';
    const tam = pref('calidad') === 'hd' && puedeHD ? comun.SALIDA_W + '×' + comun.SALIDA_H : comun.geo.wd + '×' + comun.geo.hd;
    el.info.textContent = `${tam} · 60 fps · ${ext} · ${conSon ? 'con sonido' : 'sin sonido'}`;
  };
  comun.pintarInfo = pintarInfo;

  // ---------- Dónde empieza el vídeo ----------
  /* El estribillo: el verso que MÁS se repite (con dos palabras o más, para
     que un «oh» o un «yeah» no cuenten), en su primera aparición, y
     retrocediendo mientras los versos de antes también se repitan y vayan
     pegados — así se coge el estribillo desde su primer verso, no desde
     el más repetido de dentro. */
  const plano = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const buscarEstribillo = (lines) => {
    if (!lines.length || !(lines[0].time >= 0)) return null;
    const claves = lines.map((l) => plano(l.text));
    const cuenta = new Map();
    claves.forEach((k) => { if (k.split(' ').length >= 2) cuenta.set(k, (cuenta.get(k) || 0) + 1); });
    let mejor = '', max = 1;
    cuenta.forEach((n, k) => {
      if (n < 2) return;
      if (n > max || (n === max && k.length > mejor.length)) { mejor = k; max = n; }
    });
    if (!mejor) return null;
    let i = claves.indexOf(mejor);
    for (let pasos = 0; i > 0 && pasos < 4; pasos++) {
      if ((cuenta.get(claves[i - 1]) || 0) < 2) break;
      if (lines[i].time - lines[i - 1].time > 9) break;
      i--;
    }
    return lines[i].time;
  };
  comun.buscarEstribillo = buscarEstribillo;
  const puntoDeInicio = () => {
    const e = pref('empieza');
    if (e === 'inicio') return 0;
    if (e !== 'estribillo') return null;
    const s = LY() && LY().getSync ? LY().getSync() : null;
    const t = buscarEstribillo((s && s.lines) || []);
    if (t == null) { mensaje('sin estribillo claro en esta letra: empieza donde va'); return null; }
    /* La letra sale cuando `segundo + desfase` llega al verso: en tiempo de la
       canción, el verso entra en `t - desfase`. Y 1,2 s antes, para que la
       primera línea del vídeo ENTRE con su efecto en vez de salir ya puesta. */
    const off = window.LyricsOffset && window.LyricsOffset.get ? window.LyricsOffset.get() : 0;
    return Math.max(0, t - off - 1.2);
  };
  comun.puntoDeInicio = puntoDeInicio;
})();
/* ==========================================================
   EL VÍDEO 9:16 · grabar (js/cine/grabar.js)

   Compartir la pestaña, recortar la captura al marco, la cuenta atrás,
   el grabador y el vídeo que queda. Solo existe en la copia local.
   Reparto de js/cine/: ver escenario.js.
   ========================================================== */
(() => {
  'use strict';
  const comun = window.MMInterno.cine;
  const {
    PC, LY, VIS, clamp, fmt, puedeGrabar, pref, el, enCine, hayQueTumbar, puedeHD, medirMarco,
    pedirPantalla, medirRiel, medirLienzo, mensaje, confirmado, planSonido, avisoSonido,
    elegirMime, pintarInfo, puntoDeInicio
  } = comun;

  // ---------- Grabar ----------
  const pedirCaptura = (conAudio) => navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 60, max: 60 }, displaySurface: 'browser' },
    audio: conAudio
      ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false }
      : false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'exclude',
    systemAudio: 'exclude',
    monitorTypeSurfaces: 'exclude',
  });

  const alTerminarCaptura = () => {
    // «dejar de compartir» desde la barra del navegador
    comun.captura = null;
    if (VIS() && VIS().soltarFlujo) VIS().soltarFlujo();
    if (comun.fase === 'grabando') parar();
    else if (comun.fase === 'cuenta') cancelarCuenta();
    avisoSonido();
    pintarInfo();
  };

  const soltarCaptura = () => {
    if (comun.captura) {
      comun.captura.getTracks().forEach((t) => { t.removeEventListener('ended', alTerminarCaptura); t.stop(); });
    }
    comun.captura = null;
    if (VIS() && VIS().soltarFlujo) VIS().soltarFlujo();
    if (el.soltar) el.soltar.hidden = true;
  };
  comun.soltarCaptura = soltarCaptura;

  let preparando = false;
  const alternarGrabar = () => {
    if (enCine()) return;                  // el cine se mira, no se graba
    if (comun.fase === 'grabando') { parar(); return; }
    if (comun.fase === 'cuenta') { cancelarCuenta(); return; }
    if (comun.fase === 'pidiendo' || comun.fase === 'guardando') return;
    /* Mientras se prepara (el sonido, volver a pantalla completa) la fase
       sigue en «listo»: sin este cerrojo, un doble clic —o la R y un clic—
       arrancaba dos grabaciones a la vez. */
    if (preparando) return;
    if (comun.fase === 'hecho') {
      if (comun.resultado && !comun.resultado.guardado && !confirmado(el.rec, 'el de antes no está guardado · pulsa otra vez para tirarlo y grabar otro')) return;
      descartar();
    }
    preparando = true;
    grabar().catch((e) => { console.warn('[9:16] no se pudo grabar:', e); sinVideo('✕ no se pudo grabar'); })
      .finally(() => { preparando = false; });
  };
  comun.alternarGrabar = alternarGrabar;

  const grabar = async () => {
    const P = PC();
    if (!puedeGrabar) { mensaje('este navegador no puede grabar solo el marco · prueba en chrome o edge'); return; }
    if (!P || !P.state || !P.state.currentTrack) { mensaje('pon una canción primero'); return; }
    const plan = planSonido();
    // el AudioContext, DENTRO del clic (sin gesto nace suspendido)
    if (plan !== 'no' && VIS() && VIS().prepararSonido) { try { VIS().prepararSonido(); } catch (e) {} }
    mensaje('');

    /* Se compartió la pestaña SIN su audio (sonaba tu música, que va directa)
       y ahora suena Spotify aquí, que solo se oye por ese audio: se vuelve a
       pedir, esta vez con él, en vez de grabar un vídeo mudo. */
    if (comun.captura && comun.captura.active && plan === 'pestana' && !comun.captura.getAudioTracks().length) soltarCaptura();

    /* Segundo clic tras perder la pantalla completa (ver más abajo): este
       clic SÍ es un gesto, así que ya se puede volver a ella. Se espera a
       que asiente el tamaño, porque la cuenta atrás lo congela. */
    if (comun.captura && comun.captura.active && comun.queriaFull && !document.fullscreenElement) {
      comun.queriaFull = false;
      pedirPantalla();
      await dormir(450);
      if (!comun.abierto) return;                 // se cerró mientras tanto
      medirMarco();
    }
    comun.queriaFull = false;

    if (!comun.captura || !comun.captura.active) {
      if (!comun.abierto) return;
      comun.captura = null;
      const eraFull = !!document.fullscreenElement;
      comun.fase = 'pidiendo';
      comun.pintarFase();
      mensaje(plan === 'pestana'
        ? 'dile que sí al navegador · y deja marcado «compartir el audio de la pestaña»'
        : 'dile que sí al navegador: se graba solo este marco');
      let flujo = null;
      try { flujo = await pedirCaptura(plan === 'pestana'); }
      catch (e) {
        comun.fase = 'listo';
        comun.pintarFase();
        mensaje(e && e.name === 'NotAllowedError' ? '' : '✕ el navegador no dejó grabar la pestaña' + (e && e.name ? ' (' + e.name + ')' : ''));
        return;
      }
      if (!comun.abierto) { flujo.getTracks().forEach((t) => t.stop()); return; }
      const vt = flujo.getVideoTracks()[0];
      try {
        const objetivo = await window.CropTarget.fromElement(comun.marco);
        await vt.cropTo(objetivo);
      } catch (e) {
        flujo.getTracks().forEach((t) => t.stop());
        comun.fase = 'listo';
        comun.pintarFase();
        mensaje('✕ hay que elegir «esta pestaña» para grabar solo el marco');
        return;
      }
      comun.captura = flujo;
      comun.captura.getTracks().forEach((t) => t.addEventListener('ended', alTerminarCaptura));
      // el sonido de la pestaña también mueve el fondo (Spotify por fin baila)
      if (comun.captura.getAudioTracks().length && VIS() && VIS().oirFlujo) VIS().oirFlujo(comun.captura);
      mensaje('');
      /* El diálogo de «compartir esta pestaña» puede SACAR al navegador de
         la pantalla completa, y entonces el marco —y el vídeo— salen más
         pequeños. Volver a ella necesita un gesto del usuario, y aceptar el
         diálogo del navegador no cuenta como gesto de la página: se para
         aquí y el siguiente clic la recupera antes de la cuenta atrás. */
      if (eraFull && !document.fullscreenElement) {
        comun.queriaFull = true;
        comun.fase = 'listo';
        comun.pintarFase();
        mensaje('listo · pulsa ● otra vez y empieza a pantalla completa');
        return;
      }
    }

    comun.planGrabado = plan;
    comun.pistaSonido = null;
    if (plan === 'local' || plan === 'sync' || plan === 'pestana') {
      try { comun.pistaSonido = VIS() && VIS().sonidoParaGrabar ? await VIS().sonidoParaGrabar(plan === 'pestana') : null; }
      catch (e) { comun.pistaSonido = null; }
      if (!comun.pistaSonido) {
        comun.planGrabado = 'no';
        mensaje(plan === 'pestana'
          ? 'no llegó el audio de la pestaña: saldrá sin sonido · «soltar» y graba otra vez marcando el audio'
          : 'no se pudo coger el sonido: saldrá sin sonido');
      }
    } else comun.planGrabado = 'no';
    if (!comun.abierto) return;
    await cuentaYGrabar();
  };

  const esperar = (cond, ms) => new Promise((res) => {
    const fin = performance.now() + ms;
    const mira = () => {
      if (cond()) { res(true); return; }
      if (performance.now() > fin) { res(false); return; }
      setTimeout(mira, 50);
    };
    mira();
  });
  const dosFrames = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const dormir = (ms) => new Promise((res) => setTimeout(res, ms));

  const cuenta = (n) => new Promise((res) => {
    let k = n;
    el.cuenta.hidden = false;
    const paso = () => {
      if (comun.fase !== 'cuenta') { res(false); return; }
      if (k === 0) { comun.cuentaCancelar = null; res(true); return; }
      el.cuentaNum.textContent = String(k);
      el.cuenta.classList.remove('late');
      void el.cuenta.offsetWidth;          // una vez por segundo: reinicia el latido
      el.cuenta.classList.add('late');
      el.recTxt.textContent = 'cancelar · ' + k;
      if (el.tReloj) el.tReloj.textContent = String(k);
      k--;
      comun.cuentaT = setTimeout(paso, 1000);
    };
    comun.cuentaCancelar = () => { clearTimeout(comun.cuentaT); comun.cuentaCancelar = null; res(false); };
    paso();
  });

  /* ══════ EL CANAL DE 1080p ══════
     La captura recortada al marco pasa por un lienzo de 1080×1920 antes del
     grabador: ahí se endereza (si el marco va tumbado) y se lleva al tamaño
     exacto de TikTok. Cada fotograma que entrega la captura se pinta UNA vez
     (requestVideoFrameCallback) y se empuja al grabador con requestFrame:
     60 entran y 60 salen, sin repetir ni saltarse ninguno. El <video> que
     hace de fuente va en el DOM, en una esquina FUERA del marco: uno suelto
     no avisa de sus fotogramas. */
  const SALIDA_W = comun.SALIDA_W = 1080, SALIDA_H = comun.SALIDA_H = 1920;
  const montarCanal = async (vt, girar) => {
    if (!vt || !puedeHD) return null;
    const lienzo = document.createElement('canvas');
    lienzo.width = SALIDA_W;
    lienzo.height = SALIDA_H;
    const c = lienzo.getContext('2d', { alpha: false });
    if (!c) return null;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    let pista = null;
    try { pista = lienzo.captureStream(0).getVideoTracks()[0]; } catch (e) { pista = null; }
    if (!pista) return null;
    const v = document.createElement('video');
    v.className = 'v916-fuente';
    v.muted = true;
    v.playsInline = true;
    v.srcObject = new MediaStream([vt]);
    comun.raiz.appendChild(v);
    const k = { vivo: true, pista, v, pintados: 0, ult: 0 };
    try { await v.play(); }
    catch (e) { v.remove(); try { pista.stop(); } catch (e2) {} return null; }
    const conFotogramas = typeof v.requestVideoFrameCallback === 'function';
    const pinta = () => {
      if (!k.vivo) return;
      const ahora = performance.now();
      // sin rVFC va con el refresco de la pantalla: a 144 Hz serían 144 al grabador
      if (v.videoWidth && v.videoHeight && (conFotogramas || ahora - k.ult > 15)) {
        k.ult = ahora;
        if (girar) { c.setTransform(0, 1, -1, 0, SALIDA_W, 0); c.drawImage(v, 0, 0, SALIDA_H, SALIDA_W); }
        else { c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(v, 0, 0, SALIDA_W, SALIDA_H); }
        if (pista.requestFrame) pista.requestFrame();
        k.pintados++;
      }
      if (conFotogramas) v.requestVideoFrameCallback(pinta);
      else requestAnimationFrame(pinta);
    };
    pinta();
    return k;
  };
  const desmontarCanal = () => {
    if (!comun.canal) return;
    comun.canal.vivo = false;
    try { comun.canal.pista.stop(); } catch (e) {}
    try { comun.canal.v.pause(); } catch (e) {}
    comun.canal.v.srcObject = null;              // soltar la fuente NO para la captura
    comun.canal.v.remove();
    comun.canal = null;
  };

  // Tumbar o enderezar el marco (con el tamaño que le toca a cada postura)
  const tumbar = (on) => {
    if (comun.tumbado === on) return;
    comun.tumbado = on;
    comun.raiz.classList.toggle('tumbado', on);
    el.tira.hidden = !on;
    const antes = comun.congelado;
    comun.congelado = false;
    medirMarco();
    comun.congelado = antes;
    // el edit elige tamaños midiendo su hueco: con otro hueco, otro verso
    requestAnimationFrame(() => {
      medirLienzo();
      medirRiel();
      if (LY() && LY().repintar) LY().repintar();
    });
  };

  let estabaSonando = false;
  const cuentaYGrabar = async () => {
    const P = PC();
    comun.fase = 'cuenta';
    comun.congelado = true;                       // el marco ya no cambia de tamaño
    comun.marco.classList.add('rodando');
    const hd = pref('calidad') === 'hd' && puedeHD;
    if (hd && hayQueTumbar()) tumbar(true);
    comun.pintarFase();
    // la canción, en su sitio y quieta durante la cuenta
    estabaSonando = !!P.playing();
    if (estabaSonando) P.togglePlay();
    const desde = puntoDeInicio();
    if (desde != null) {
      P.seek(desde);
      // pinta el verso de ese segundo YA (con la música parada no hay tick)
      if (LY() && LY().tick) { try { LY().tick(desde); } catch (e) {} }
    }
    if (hd) {
      comun.canal = await montarCanal(comun.captura && comun.captura.getVideoTracks()[0], comun.tumbado);
      if (comun.fase !== 'cuenta') { desmontarCanal(); return; }   // cancelado mientras tanto
      if (!comun.canal && comun.tumbado) {
        tumbar(false);
        mensaje('no se pudo preparar el 1080p: se graba del tamaño de la pantalla');
      }
    }
    const ok = await cuenta(3);
    if (!ok || comun.fase !== 'cuenta') return;
    el.cuenta.hidden = true;
    if (!P.playing()) P.togglePlay();
    const arranco = await esperar(() => P.playing(), 4000);
    if (comun.fase !== 'cuenta') return;
    if (!arranco) { sinVideo('✕ la música no arrancó'); return; }
    await dosFrames();                      // que la cuenta ya no esté en pantalla
    if (comun.fase !== 'cuenta') return;
    empezarRec();
  };

  const cancelarCuenta = () => {
    if (comun.fase !== 'cuenta') return;
    if (comun.cuentaCancelar) comun.cuentaCancelar();
    sinVideo('');
    const P = PC();
    if (estabaSonando && P && !P.playing()) P.togglePlay();
  };
  comun.cancelarCuenta = cancelarCuenta;

  // vuelta a «listo» sin vídeo (cancelado o fallido)
  const sinVideo = (txt) => {
    comun.fase = 'listo';
    el.cuenta.hidden = true;
    desmontarCanal();
    tumbar(false);
    comun.congelado = false;
    comun.marco.classList.remove('rodando');
    if (VIS() && VIS().soltarSonido) VIS().soltarSonido();
    comun.pistaSonido = null;
    medirMarco();
    comun.pintarFase();
    if (txt) mensaje(txt);
  };

  const empezarRec = () => {
    const vt = comun.captura && comun.captura.getVideoTracks()[0];
    if (!vt || vt.readyState !== 'live') { sinVideo('✕ se dejó de compartir la pestaña'); return; }
    const pistas = [comun.canal ? comun.canal.pista : vt];
    if (comun.pistaSonido && comun.pistaSonido.readyState === 'live') pistas.push(comun.pistaSonido);
    const conSonido = pistas.length > 1;
    comun.mimeElegido = elegirMime(conSonido);
    const ajustes = vt.getSettings ? vt.getSettings() : {};
    comun.dims = comun.canal ? { w: SALIDA_W, h: SALIDA_H } : { w: ajustes.width || comun.geo.wd, h: ajustes.height || comun.geo.hd };
    /* 60 fps y bitrate de sobra: 1080×1920 a 60 sale a ~16 Mb/s (lo que se
       pide para subir 1080p60), y el marco de pantalla, con más por píxel
       porque tiene menos píxeles que perder cuando TikTok lo recomprima. */
    const op = { videoBitsPerSecond: Math.round(clamp(comun.dims.w * comun.dims.h * 60 * (comun.canal ? 0.13 : 0.2), 6e6, 24e6)) };
    if (comun.mimeElegido) op.mimeType = comun.mimeElegido;
    if (conSonido) op.audioBitsPerSecond = 192000;
    try { comun.rec = new MediaRecorder(new MediaStream(pistas), op); }
    catch (e) {
      try { comun.rec = new MediaRecorder(new MediaStream(pistas)); comun.mimeElegido = comun.rec.mimeType || ''; }
      catch (e2) { sinVideo('✕ este navegador no sabe grabar vídeo'); return; }
    }
    if (!conSonido) comun.planGrabado = 'no';
    comun.trozos = [];
    const este = comun.rec;
    comun.rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) comun.trozos.push(ev.data); };
    comun.rec.onstop = () => { if (este === comun.rec) alPararRec(); };
    comun.rec.onerror = (ev) => { console.warn('[9:16] el grabador falló:', ev && (ev.error || ev)); parar(); };
    try { comun.rec.start(1000); }                // un trozo por segundo: la memoria no pega saltos al final
    catch (e) { comun.rec = null; sinVideo('✕ no se pudo empezar a grabar'); return; }
    comun.t0 = performance.now();
    comun.acumPausa = 0; comun.marcaPausa = 0; comun.sinSonarDesde = 0;
    comun.pistaAlEmpezar = PC().state.currentTrack;
    comun.fase = 'grabando';
    comun.pintarFase();
  };

  const tiempoGrabado = (ahora) =>
    Math.max(0, ahora - comun.t0 - comun.acumPausa - (comun.rec && comun.rec.state === 'paused' && comun.marcaPausa ? ahora - comun.marcaPausa : 0));

  /* Mientras graba: si la música se para, el vídeo también (nada de tramos
     congelados); y se corta solo al llegar a la duración elegida, al acabar
     la canción («canción») o a los 10 minutos, que es lo que admite TikTok. */
  const TOPE_MS = 10 * 60 * 1000;
  const vigilarGrabacion = (P, ahora) => {
    if (comun.fase !== 'grabando' || !comun.rec) return;
    const suena = !!P.playing();
    if (!suena) {
      if (!comun.sinSonarDesde) comun.sinSonarDesde = ahora;
      // medio segundo de margen: un tirón del reproductor no parte el vídeo
      if (comun.rec.state === 'recording' && ahora - comun.sinSonarDesde > 450) {
        try { comun.rec.pause(); comun.marcaPausa = ahora; } catch (e) {}
      }
    } else {
      comun.sinSonarDesde = 0;
      if (comun.rec.state === 'paused') {
        try { comun.rec.resume(); comun.acumPausa += ahora - comun.marcaPausa; comun.marcaPausa = 0; } catch (e) {}
      }
    }
    const ms = tiempoGrabado(ahora);
    const d = pref('dura');
    const tope = d === '15' ? 15000 : d === '30' ? 30000 : d === '60' ? 60000 : TOPE_MS;
    if (ms >= tope) { parar(); return; }
    if (d === 'cancion') {
      // por id y no por objeto: quien pinta la canción podría rehacer la ficha
      const ahoraSuena = P.state.currentTrack;
      const otra = !ahoraSuena || (ahoraSuena !== comun.pistaAlEmpezar
        && !(comun.pistaAlEmpezar && ahoraSuena.id && ahoraSuena.id === comun.pistaAlEmpezar.id));
      if (otra) { parar(); return; }
      const dur = P.duration(), pos = P.position();
      if (dur > 0 && pos >= dur - 0.25) { parar(); return; }
    }
    const txt = 'parar · ' + fmt(ms / 1000) + (tope < TOPE_MS ? ' / ' + fmt(tope / 1000) : '')
      + (comun.rec.state === 'paused' ? ' · en pausa' : '');
    if (txt !== comun.relojT) {
      comun.relojT = txt;
      el.recTxt.textContent = txt;
      if (el.tReloj) el.tReloj.textContent = fmt(ms / 1000) + (comun.rec.state === 'paused' ? ' ‖' : '');
    }
  };
  comun.vigilarGrabacion = vigilarGrabacion;

  const parar = () => {
    if (comun.fase !== 'grabando' || !comun.rec) return;
    comun.durGrabada = tiempoGrabado(performance.now());
    comun.fase = 'guardando';
    comun.pintarFase();
    try { comun.rec.stop(); } catch (e) { /* ya parado: su onstop llega igual */ }
    // la música se para para oír el vídeo sin que suene encima
    const P = PC();
    if (P && P.playing()) P.togglePlay();
    // cinturón: si el onstop no llegara nunca, no se queda colgado aquí
    clearTimeout(comun.guardandoT);
    comun.guardandoT = setTimeout(() => { if (comun.fase === 'guardando') alPararRec(); }, 5000);
  };
  comun.parar = parar;

  const limpioArchivo = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nombreArchivo = (t, ext) => {
    const base = [limpioArchivo(t && t.artist), limpioArchivo(t && t.name)].filter(Boolean).join(' - ') || 'MASTER MUSIC';
    return base.slice(0, 110) + ' · 9x16.' + ext;
  };

  const alPararRec = () => {
    if (comun.fase !== 'guardando') return;
    clearTimeout(comun.guardandoT);
    const tipo = (comun.rec && comun.rec.mimeType) || comun.mimeElegido || 'video/webm';
    comun.rec = null;
    const base = tipo.split(';')[0] || 'video/webm';
    const blob = new Blob(comun.trozos, { type: base });
    comun.trozos = [];
    if (VIS() && VIS().soltarSonido) VIS().soltarSonido();
    comun.pistaSonido = null;
    desmontarCanal();
    tumbar(false);
    comun.congelado = false;
    comun.marco.classList.remove('rodando');
    comun.relojT = '';
    medirMarco();
    if (!blob.size) { comun.fase = 'listo'; comun.pintarFase(); mensaje('✕ el vídeo salió vacío'); return; }
    const ext = /mp4/.test(base) ? 'mp4' : 'webm';
    comun.resultado = {
      blob, ext,
      url: URL.createObjectURL(blob),
      seg: comun.durGrabada / 1000,
      w: comun.dims.w, h: comun.dims.h,
      conSonido: comun.planGrabado !== 'no',
      nombre: nombreArchivo(comun.pistaAlEmpezar, ext),
      guardado: false,
    };
    comun.fase = 'hecho';
    comun.pintarFase();
    mostrarResultado();
  };

  const mb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const archivo = () => {
    if (!comun.resultado) return null;
    if (!comun.resultado.file) {
      try { comun.resultado.file = new File([comun.resultado.blob], comun.resultado.nombre, { type: comun.resultado.blob.type }); }
      catch (e) { comun.resultado.file = null; }
    }
    return comun.resultado.file;
  };

  const mostrarResultado = () => {
    const r = comun.resultado;
    el.vista.src = r.url;
    el.vista.hidden = false;
    try { el.vista.currentTime = 0; } catch (e) {}
    const p = el.vista.play();
    if (p && p.catch) p.catch(() => {});
    el.hechoTxt.textContent = `✓ ${fmt(r.seg)} · ${mb(r.blob.size)} · ${r.w}×${r.h} · ${r.ext}`
      + (r.conSonido ? '' : ' · sin sonido');
    const f = archivo();
    let puede = false;
    try { puede = !!(f && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { puede = false; }
    el.compartir.hidden = !puede;
  };

  const guardar = () => {
    if (!comun.resultado) return;
    const a = document.createElement('a');
    a.href = comun.resultado.url;
    a.download = comun.resultado.nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    comun.resultado.guardado = true;
    mensaje('⤓ guardado en tus descargas · «' + comun.resultado.nombre + '»');
  };
  comun.guardar = guardar;

  const compartir = async () => {
    const f = archivo();
    if (!f || !navigator.share) return;
    try {
      await navigator.share({ files: [f], title: comun.resultado.nombre });
      comun.resultado.guardado = true;
    } catch (e) {
      if (!e || e.name !== 'AbortError') mensaje('✕ no se pudo compartir · guárdalo y súbelo desde el archivo');
    }
  };
  comun.compartir = compartir;

  const descartar = (callado) => {
    if (!comun.resultado) { if (!callado && comun.fase === 'hecho') { comun.fase = 'listo'; comun.pintarFase(); } return; }
    try { el.vista.pause(); } catch (e) {}
    el.vista.removeAttribute('src');
    try { el.vista.load(); } catch (e) {}
    el.vista.hidden = true;
    URL.revokeObjectURL(comun.resultado.url);
    comun.resultado = null;
    if (comun.fase === 'hecho') comun.fase = 'listo';
    if (!callado) comun.pintarFase();
  };
  comun.descartar = descartar;
})();
/* ==========================================================
   EL CINE Y EL VÍDEO 9:16 · el arranque (js/cine/arranque.js)

   Va el ÚLTIMO de js/cine/: lo que enseña el panel en cada fase, el
   teclado y las puertas (los botones que abren el cine y el vídeo, y la
   API pública). Reparto: ver escenario.js.
   ========================================================== */
(() => {
  'use strict';
  const comun = window.MMInterno.cine;
  const {
    $, PC, libre, puedeGrabar, videoDisponible, OPC, pref, guardarPref, el, enCine, medirMarco,
    abrir, cerrar, pintarGuias, elegir, despertar, pintarInfo, buscarEstribillo, alternarGrabar
  } = comun;

  window.addEventListener('resize', () => {
    if (!comun.abierto || comun.medirPendiente) return;
    comun.medirPendiente = true;
    requestAnimationFrame(() => { comun.medirPendiente = false; medirMarco(); });
  }, { passive: true });
  document.addEventListener('fullscreenchange', () => {
    if (!comun.abierto) return;
    if (!document.fullscreenElement) comun.entreFull = false;
    if (el.full) el.full.classList.toggle('on', !!document.fullscreenElement);
    if (!enCine()) return;
    if (document.fullscreenElement) comun.cineFull = true;
    else if (comun.cineFull) { comun.cineFull = false; cerrar(); }
  });

  // ---------- Lo que enseña el panel en cada fase ----------
  const pintarFase = () => {
    if (!comun.raiz) return;
    comun.raiz.dataset.fase = comun.fase;
    comun.raiz.classList.toggle('grabando', comun.fase === 'grabando');
    const P = PC();
    const hay = !!(P && P.state && P.state.currentTrack);
    let ico = 'grabar', txt = 'grabar', off = false;
    if (comun.fase === 'listo') off = !puedeGrabar || !hay;
    else if (comun.fase === 'pidiendo') { txt = 'esperando permiso…'; off = true; }
    else if (comun.fase === 'cuenta') { ico = 'parar'; txt = 'cancelar'; }
    else if (comun.fase === 'grabando') { ico = 'parar'; txt = 'parar · 0:00'; }
    else if (comun.fase === 'guardando') { ico = 'parar'; txt = 'guardando…'; off = true; }
    else if (comun.fase === 'hecho') txt = 'grabar otro';
    el.recIco.className = 'ico ico-' + ico + ' v916-rec-ico';
    el.recTxt.textContent = txt;
    el.rec.disabled = off;
    el.rec.title = comun.fase === 'grabando' ? 'Parar (R o Esc)' : 'Grabar el marco (R)';
    el.hecho.hidden = comun.fase !== 'hecho';
    if (comun.fase !== 'hecho') el.vista.hidden = true;
    pintarGuias();
    pintarInfo();
  };
  comun.pintarFase = pintarFase;

  // ---------- Teclado ----------
  /* Mientras está abierto, casi todas las teclas de la app se quedan aquí:
     las pestañas (1-6, L, S, B…) esconderían #tab-lyrics, que ahora vive en
     el marco. Espacio, flechas y M siguen siendo la música, como siempre.
     Ctrl+K tampoco: la paleta saldría encima… y dentro del vídeo. */
  const PASAN = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyM', 'Tab',
    'Enter', 'NumpadEnter', 'ShiftLeft', 'ShiftRight']);
  window.addEventListener('keydown', (e) => {
    // con una ventana de la casa abierta (js/dialogo.js), las teclas son suyas
    if (window.MMDialogo && window.MMDialogo.abierto()) return;
    if (!comun.abierto) {
      // V abre el modo (si la tecla es de la app y no de un cuadro de texto)
      if (videoDisponible && (e.key === 'v' || e.key === 'V') && !e.repeat && libre(e)) {
        e.preventDefault();
        abrir();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrar();
      return;
    }
    /* En el cine: 1 2 3 cambian el estilo y E la vista de la letra (los
       números, fuera, son las pestañas; aquí no hay pestañas que cambiar).
       Y cualquier tecla despierta la barra. Grabar no: la R no hace nada. */
    if (enCine()) {
      despertar();
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && libre(e)) {
        const est = { Digit1: 'app', Digit2: 'vinilo', Digit3: 'letra',
          Numpad1: 'app', Numpad2: 'vinilo', Numpad3: 'letra' }[e.code];
        if (est) { e.preventDefault(); e.stopPropagation(); elegir('cineEstilo', est); return; }
        if (e.code === 'KeyE') {
          e.preventDefault();
          e.stopPropagation();
          // E recorre las tres: lista → edit → palabra → lista
          const ya = pref('cineVista');
          elegir('cineVista', ya === 'lista' ? 'edit' : ya === 'edit' ? 'palabra' : 'lista');
          return;
        }
      }
    }
    if (!enCine() && (e.key === 'r' || e.key === 'R') && !e.repeat && libre(e)) {
      e.preventDefault();
      e.stopPropagation();
      alternarGrabar();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (e.key === 'k' || e.key === 'K') { e.preventDefault(); e.stopPropagation(); }
      return;                               // el resto es del navegador (recargar, zoom…)
    }
    if (PASAN.has(e.code)) return;
    e.stopPropagation();
  }, true);

  // Si algo cambia de pestaña por debajo, la letra vuelve a su sitio.
  document.addEventListener('mm:tab', (e) => {
    if (!comun.abierto) return;
    const t = e.detail && e.detail.tab;
    if (t && t !== 'lyrics' && window.MMNav) window.MMNav.ir('lyrics');
  });

  // Recargar o cerrar la pestaña a media grabación (o con el vídeo sin
  // guardar) lo pregunta el propio navegador.
  window.addEventListener('beforeunload', (e) => {
    if (comun.fase === 'grabando' || comun.fase === 'cuenta' || comun.fase === 'guardando' || (comun.resultado && !comun.resultado.guardado)) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ---------- Puertas ----------
  const btn = $('verticalBtn');
  if (btn) btn.addEventListener('click', () => abrir('video'));
  const btnCfg = $('verticalAbrir');
  if (btnCfg) btnCfg.addEventListener('click', () => abrir('video'));
  const btnCine = $('cinemaBtn');
  if (btnCine) btnCine.addEventListener('click', () => abrir('cine'));

  /* El cine de siempre, por su nombre de siempre: el buscador, el móvil y
     las pruebas lo llaman así. Con el vídeo 9:16 abierto no se abre encima
     (la letra ya está en ese marco). */
  window.CinemaModule = {
    // con estilo ('app' | 'vinilo' | 'letra') abre ya en ese (lo usa el buscador)
    abrir: (estilo) => {
      if (OPC.cineEstilo.vals.includes(estilo)) {
        if (comun.abierto && enCine()) { elegir('cineEstilo', estilo); return; }
        guardarPref('cineEstilo', estilo);
      }
      abrir('cine');
    },
    cerrar: () => { if (comun.abierto && enCine()) cerrar(); },
    esta: () => comun.abierto && enCine(),
    estilo: () => pref('cineEstilo'),
  };

  window.MMVertical = {
    abrir: () => abrir('video'),
    cerrar,
    abierto: () => comun.abierto,
    // ¿existe el vídeo 9:16 aquí? Solo en la copia local (ver `videoDisponible`)
    disponible: () => videoDisponible,
    cine: () => comun.abierto && enCine(),
    // el marco tumbado para grabar en 1080p: js/fondo.js deshace el giro al medir
    giro: () => (comun.tumbado ? -90 : 0),
    grabando: () => comun.fase === 'grabando' || comun.fase === 'cuenta',
    // para las pruebas: el cálculo del estribillo, sin montar nada
    estribillo: buscarEstribillo,
  };
})();
