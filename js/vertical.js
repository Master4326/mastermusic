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

   EL SONIDO, de donde mejor se pueda (ver js/visualizer.js, «EL SONIDO DEL
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
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const PC = () => window.PlayerCore;
  const LY = () => window.LyricsModule;
  const VIS = () => window.VisualizerModule;
  const SP = () => window.SpotifyModule;
  const calma = () => !!(window.MMSettings && window.MMSettings.reduceMotion());
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  // el mismo juez de teclas que app.js y seven.js (js/teclas.js)
  const libre = (e) => {
    const T = window.MMTeclas;
    return T ? T.libre(e) : !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  };
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60), q = Math.floor(s % 60);
    return m + ':' + (q < 10 ? '0' : '') + q;
  };

  /* ¿Puede este navegador grabar SOLO el marco? Hace falta todo junto:
     compartir pantalla, grabar vídeo y recortar la captura a un elemento
     (Region Capture: Chrome, Edge y Opera de escritorio). Sin eso el modo
     sigue sirviendo para grabarlo con otra herramienta (OBS, Recortes…). */
  const puedeGrabar = !!(navigator.mediaDevices
    && typeof navigator.mediaDevices.getDisplayMedia === 'function'
    && typeof window.MediaRecorder === 'function'
    && window.CropTarget && typeof window.CropTarget.fromElement === 'function');

  // ---------- Opciones (se recuerdan) ----------
  const OPC = {
    estilo:  { key: 'mm_916_estilo',  def: 'app',  vals: ['app', 'vinilo', 'letra'] },
    // sin elegir todavía: la vista que la app tenga puesta (✦ o ≡)
    vista:   { key: 'mm_916_vista',   def: '',     vals: ['lista', 'edit'] },
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
    cineVista:  { key: 'mm_cine_vista',  def: 'edit',   vals: ['lista', 'edit'] },
  };
  const pref = (id) => {
    const o = OPC[id];
    let v = null;
    try { v = localStorage.getItem(o.key); } catch (e) { /* privado o bloqueado */ }
    if (o.vals.includes(v)) return v;
    if (id === 'vista') return LY() && LY().isEditMode && LY().isEditMode() ? 'edit' : 'lista';
    return o.def;
  };
  const guardarPref = (id, v) => { try { localStorage.setItem(OPC[id].key, v); } catch (e) {} };

  // ---------- Estado ----------
  let raiz = null, marco = null, zona = null;
  const el = {};
  let abierto = false;
  let modo = 'video';                     // 'video' (el 9:16 para grabar) o 'cine'
  const enCine = () => modo === 'cine';
  const prefEstilo = () => pref(enCine() ? 'cineEstilo' : 'estilo');
  const prefVista = () => pref(enCine() ? 'cineVista' : 'vista');
  /* listo · pidiendo (el diálogo del navegador) · cuenta (3·2·1) ·
     grabando · guardando (cerrando el archivo) · hecho (el vídeo, para verlo) */
  let fase = 'listo';
  let tabLyrics = null, slot = null, devolverFoco = null;
  let entreFull = false, congelado = false, cerrandoT = null;
  let captura = null, pistaSonido = null, planGrabado = 'no', queriaFull = false;
  let tumbado = false, canal = null;      // el marco girado para grabar en 1080p, y su canal
  let rec = null, trozos = [], mimeElegido = '', dims = { w: 0, h: 0 };
  let t0 = 0, acumPausa = 0, marcaPausa = 0, sinSonarDesde = 0, pistaAlEmpezar = null, durGrabada = 0;
  let resultado = null;
  let cuentaT = null, cuentaCancelar = null, guardandoT = null;
  let vistaPuesta = null;
  let geo = { x: 0, y: 0, w: 360, h: 640, wd: 360, hd: 640 };

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
    if (raiz) return;
    raiz = document.createElement('div');
    raiz.className = 'v916';
    raiz.hidden = true;
    raiz.setAttribute('role', 'dialog');
    raiz.setAttribute('aria-modal', 'true');
    raiz.setAttribute('aria-label', 'Vídeo 9:16 para TikTok');
    raiz.innerHTML = `
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
          ${grupo('vista', 'letra', [['lista', 'lista'], ['edit', 'edit']])}
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
    document.body.appendChild(raiz);

    const q = (s) => raiz.querySelector(s);
    marco = q('.v916-marco');
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
    q('.v916-tira .t-parar').addEventListener('click', () => alternarGrabar());

    // Opciones: las del panel del vídeo y las de la barra del cine, igual
    raiz.addEventListener('click', (e) => {
      const b = e.target.closest('.seg-btn');
      const g = b && b.closest('.seg[data-v916]');
      if (!g) return;
      if (e.detail > 0) b.blur();          // el espacio sigue siendo play/pausa
      if (fase === 'pidiendo' || fase === 'cuenta' || fase === 'grabando' || fase === 'guardando') return;
      elegir(g.dataset.v916, b.dataset.val);
    });

    // Los mandos del marco y los del panel pulsan los de verdad: ni una
    // línea de lógica de reproducción repetida aquí.
    raiz.addEventListener('click', (e) => {
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
      if (fase === 'cuenta' || fase === 'grabando' || fase === 'pidiendo') return;
      const real = document.getElementById(b.dataset.v916Mando);
      if (real) real.click();
    });

    // ⛶ el cine: salir, la barra que asoma y el progreso que se arrastra
    q('.cine-x').addEventListener('click', () => cerrar());
    raiz.addEventListener('pointermove', despertar, { passive: true });
    raiz.addEventListener('pointerdown', despertar, { passive: true });
    // con el ratón ENCIMA de la barra (a punto de pulsar algo) no se va
    el.cineUi.addEventListener('pointerenter', () => { sobreBarra = true; });
    el.cineUi.addEventListener('pointerleave', () => { sobreBarra = false; despertar(); });
    el.prog.addEventListener('pointerdown', (e) => {
      if (!enCine() || !rielW) return;
      arrastre = pctRiel(e.clientX);
      progPx = -1;
      try { el.prog.setPointerCapture(e.pointerId); } catch (err) { /* sin captura también vale */ }
    });
    el.prog.addEventListener('pointermove', (e) => {
      if (arrastre == null) return;
      arrastre = pctRiel(e.clientX);
      progPx = -1;
    });
    el.prog.addEventListener('pointerup', (e) => {
      if (arrastre == null) return;
      const p = pctRiel(e.clientX);
      arrastre = null;
      progPx = -1;
      const P = PC();
      const dur = P && P.duration ? P.duration() || 0 : 0;
      if (P && P.seek && dur > 0) P.seek(p * dur);
      despertar();
    });
    el.prog.addEventListener('pointercancel', () => { arrastre = null; progPx = -1; });

    el.rec.addEventListener('click', (e) => { if (e.detail > 0) el.rec.blur(); alternarGrabar(); });
    q('.v916-x').addEventListener('click', () => cerrar());
    el.full.addEventListener('click', (e) => {
      if (e.detail > 0) el.full.blur();
      if (document.fullscreenElement) soltarPantalla(true); else pedirPantalla();
    });
    q('.v916-guardar').addEventListener('click', guardar);
    el.compartir.addEventListener('click', compartir);
    q('.v916-tirar').addEventListener('click', (e) => {
      if (resultado && !resultado.guardado && !confirmado(e.currentTarget, 'no lo has guardado · pulsa «tirar» otra vez para borrarlo')) return;
      descartar();
    });
    el.soltar.addEventListener('click', () => {
      if (fase === 'listo' || fase === 'hecho') { soltarCaptura(); pintarFase(); }
    });
    el.aviso.addEventListener('click', alAviso);
    el.vista.addEventListener('error', () => { mensaje('el navegador no sabe enseñar este vídeo, pero se guarda igual'); });
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
  // sin captureStream no hay forma de enderezar ni de escalar: se graba el marco tal cual
  const puedeHD = typeof HTMLCanvasElement !== 'undefined'
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
    if (!raiz || !abierto || congelado) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    /* En el cine el marco es la pantalla entera (lo pone el CSS) y aquí solo
       se mira hacia dónde está: de pie, cada estilo es el del vídeo; tumbado,
       el suyo de horizontal. Al girar, el verso se vuelve a pintar: el modo
       edit elige sus tamaños midiendo el hueco, y el hueco ya es otro. */
    if (enCine()) {
      geo = { x: 0, y: 0, w: vw, h: vh, wd: Math.round(vw * dpr), hd: Math.round(vh * dpr) };
      const orient = vw > vh ? 'h' : 'v';
      const giro = raiz.dataset.orient && raiz.dataset.orient !== orient;
      raiz.dataset.orient = orient;
      medirLienzo();
      medirRiel();
      if (giro && LY() && LY().repintar) LY().repintar();
      return;
    }
    if (tumbado) {
      geo = medirTumbado(vw, vh, dpr);
      const st = raiz.style;
      st.setProperty('--v916-x', geo.x + 'px');
      st.setProperty('--v916-y', geo.y + 'px');
      st.setProperty('--v916-w', geo.w + 'px');
      st.setProperty('--v916-h', geo.h + 'px');
      medirLienzo();
      medirRiel();
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
    geo = { x, y, w, h, wd, hd };
    const s = raiz.style;
    s.setProperty('--v916-x', x + 'px');
    s.setProperty('--v916-y', y + 'px');
    s.setProperty('--v916-w', w + 'px');
    s.setProperty('--v916-h', h + 'px');
    s.setProperty('--v916-pw', pw + 'px');
    s.setProperty('--v916-px', Math.round(Math.min(vw - pw - GAP, x + w + GAP * 1.5)) + 'px');
    medirLienzo();
    medirRiel();
    pintarInfo();
  };
  let medirPendiente = false;
  window.addEventListener('resize', () => {
    if (!abierto || medirPendiente) return;
    medirPendiente = true;
    requestAnimationFrame(() => { medirPendiente = false; medirMarco(); });
  }, { passive: true });

  // ---------- Pantalla completa ----------
  const pedirPantalla = () => {
    if (document.fullscreenElement) return;
    const d = document.documentElement;
    const f = d.requestFullscreen || d.webkitRequestFullscreen;
    if (!f) return;
    try {
      const r = f.call(d);
      entreFull = true;
      if (r && r.catch) r.catch(() => { entreFull = false; });
    } catch (e) { entreFull = false; }
  };
  // Solo se sale si ENTRÓ el modo (o si lo pide el botón): si ya estabas a
  // pantalla completa por tu cuenta, cerrar esto no te la quita.
  const soltarPantalla = (aMano) => {
    if (!document.fullscreenElement || (!entreFull && !aMano)) return;
    entreFull = false;
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
  let cineFull = false;
  document.addEventListener('fullscreenchange', () => {
    if (!abierto) return;
    if (!document.fullscreenElement) entreFull = false;
    if (el.full) el.full.classList.toggle('on', !!document.fullscreenElement);
    if (!enCine()) return;
    if (document.fullscreenElement) cineFull = true;
    else if (cineFull) { cineFull = false; cerrar(); }
  });

  // ---------- Abrir y cerrar ----------
  /* `que` = 'cine' abre el modo cine; cualquier otra cosa (o nada: los
     botones pasan su evento) abre el vídeo 9:16. Uno cada vez: los dos se
     quieren llevar la misma letra. */
  const abrir = (que) => {
    if (abierto) return;
    construir();
    tabLyrics = $('tab-lyrics');
    if (!tabLyrics) return;
    if (window.MMCompartir && window.MMCompartir.abierto && window.MMCompartir.abierto()) window.MMCompartir.cerrar();
    if (window.MMNav) window.MMNav.ir('lyrics');

    modo = que === 'cine' ? 'cine' : 'video';
    abierto = true;
    clearTimeout(cerrandoT);
    devolverFoco = document.activeElement;
    slot = document.createComment('tab-lyrics-slot');
    tabLyrics.parentNode.insertBefore(slot, tabLyrics);
    zona.appendChild(tabLyrics);

    raiz.classList.toggle('cine', enCine());
    raiz.setAttribute('aria-label', enCine() ? 'Modo cine' : 'Vídeo 9:16 para TikTok');
    if (!enCine()) delete raiz.dataset.orient;
    document.body.classList.add('v916-open');
    // el cine, además, a pantalla ENTERA: js/ambient.js no respira la letra
    document.body.classList.toggle('cine-open', enCine());
    raiz.hidden = false;
    raiz.classList.remove('saliendo', 'quieto');
    void raiz.offsetWidth;                 // la transición de entrada arranca desde 0
    raiz.classList.add('entrando');
    cineFull = false;
    pedirPantalla();
    fase = !enCine() && resultado ? 'hecho' : 'listo';
    marco.dataset.estilo = prefEstilo();
    raiz.classList.toggle('sin-firma', !enCine() && pref('firma') === 'no');
    medirMarco();
    pintarSegs();
    firmaPista = null;
    vistaPuesta = null;
    aplicarVista(true);                    // y de paso repinta el verso en su sitio nuevo
    pintarFase();
    avisoSonido();
    arrancarBucle();
    sobreBarra = false;
    despertar();                           // la barra del cine se deja ver al entrar
    // la pantalla completa asienta el tamaño un frame después
    requestAnimationFrame(() => requestAnimationFrame(medirMarco));
    /* El foco va al PANEL, no a un botón: con el foco en «grabar», el
       espacio —que aquí sigue siendo play/pausa— pulsaría grabar. En el
       cine, a su barra, por lo mismo. */
    setTimeout(() => {
      if (abierto) (enCine() ? el.cineUi : el.panel).focus({ preventScroll: true });
    }, 30);
  };

  let avisoCerrarT = 0;
  const cerrar = () => {
    if (!abierto) return;
    // grabando, primero se para (y el vídeo se queda para verlo)
    if (fase === 'grabando') { parar(); return; }
    if (fase === 'cuenta') { cancelarCuenta(); return; }
    if (fase === 'pidiendo' || fase === 'guardando') return;
    if (resultado && !resultado.guardado && Date.now() - avisoCerrarT > 5000) {
      avisoCerrarT = Date.now();
      mensaje('el vídeo no está guardado · sal otra vez para tirarlo, o dale a «guardar»');
      return;
    }
    avisoCerrarT = 0;
    abierto = false;
    descartar(true);
    soltarCaptura();
    pararBucle();
    if (slot && slot.parentNode) {
      slot.parentNode.insertBefore(tabLyrics, slot);
      slot.remove();
    }
    slot = null;
    vistaPuesta = null;
    // vuelve la vista que tengas elegida en la app, con el verso de ahora
    if (LY() && LY().forzarVista) LY().forzarVista(null);
    document.body.classList.remove('v916-open', 'cine-open');
    clearTimeout(quietoT);
    arrastre = null;
    raiz.classList.remove('entrando', 'quieto');
    raiz.classList.add('saliendo');
    soltarPantalla(false);
    clearTimeout(cerrandoT);
    cerrandoT = setTimeout(() => {
      if (!abierto) { raiz.hidden = true; raiz.classList.remove('saliendo'); }
    }, calma() ? 0 : 260);
    const f = devolverFoco;
    devolverFoco = null;
    if (f && f.focus && document.contains(f)) f.focus({ preventScroll: true });
  };

  // ---------- Opciones ----------
  const pintarSegs = () => {
    raiz.querySelectorAll('.seg[data-v916]').forEach((g) => {
      const v = pref(g.dataset.v916);
      g.querySelectorAll('.seg-btn').forEach((b) => {
        const on = b.dataset.val === v;
        b.classList.toggle('active', on);
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    });
  };

  // las guías de TikTok son cosa del vídeo: en el cine no hay TikTok encima
  const pintarGuias = () => {
    if (el.guias) el.guias.hidden = !(!enCine() && pref('guias') === 'si' && fase === 'listo');
  };

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

  /* ══════ La barra del cine: asoma y se va ══════
     Como en cualquier reproductor de vídeo: al mover el ratón o tocar la
     pantalla salen la barra y el cursor, y a los 2,5 s quietos se van. No
     se va con el ratón encima de la barra ni arrastrando el progreso. */
  let quietoT = null, sobreBarra = false;
  const despertar = () => {
    if (!abierto || !enCine()) return;
    // llega con cada movimiento del ratón: la clase solo se toca si cambia
    if (raiz.classList.contains('quieto')) raiz.classList.remove('quieto');
    clearTimeout(quietoT);
    quietoT = setTimeout(() => {
      if (!abierto || !enCine()) return;
      if (sobreBarra || arrastre != null) { despertar(); return; }
      raiz.classList.add('quieto');
      // el foco no se queda en un botón escondido (el espacio lo pulsaría)
      if (el.cineUi.contains(document.activeElement) && document.activeElement !== el.cineUi) {
        el.cineUi.focus({ preventScroll: true });
      }
    }, 2500);
  };

  // Otro estilo = otra geometría: se re-mide y el verso se vuelve a pintar
  // en su sitio nuevo (el edit mide su contenedor para elegir tamaños).
  const cambiarEstilo = () => {
    marco.dataset.estilo = prefEstilo();
    raiz.classList.toggle('sin-firma', !enCine() && pref('firma') === 'no');
    // en el cine, el estilo nuevo entra fundido (una vez por cambio, no por frame)
    if (enCine() && !calma()) {
      marco.classList.remove('cambia');
      void marco.offsetWidth;
      marco.classList.add('cambia');
    }
    requestAnimationFrame(() => {
      medirLienzo();
      medirRiel();
      if (LY() && LY().repintar) LY().repintar();
    });
  };

  /* La vista de la letra dentro del marco. Una letra SIN tiempos no puede ir
     en edit (el edit necesita saber cuándo entra cada verso): ahí va la
     lista, sin decir nada. Mientras la letra llega, se respeta la elegida. */
  const aplicarVista = (forzar) => {
    const L = LY();
    if (!L || !L.forzarVista) return;
    const s = L.getSync ? L.getSync() : null;
    const lines = (s && s.lines) || [];
    const sinTiempos = lines.length > 0 && !(lines[0].time >= 0);
    const v = prefVista() === 'edit' && !sinTiempos ? 'edit' : 'lista';
    if (!forzar && v === vistaPuesta) return;
    vistaPuesta = v;
    L.forzarVista(v);
  };

  // ---------- Qué suena en el marco ----------
  let firmaPista = null;
  const pintarPista = (t) => {
    const firma = t ? (t.id || '') + '|' + (t.name || '') + '|' + (t.cover || '') : '';
    if (firma === firmaPista) return;
    firmaPista = firma;
    el.titulo.textContent = t ? (t.name || t.title || 'Sin título') : 'Sin canción';
    el.artista.textContent = t ? (t.artist || '') : 'pon algo para empezar';
    el.album.textContent = t ? (t.album || '') : '';
    const img = t && t.cover ? 'url("' + String(t.cover).replace(/"/g, '%22') + '")' : '';
    el.portada.style.backgroundImage = img;
    el.etiqueta.style.backgroundImage = img;
    el.bgImg.style.backgroundImage = img;
    marco.classList.toggle('sin-portada', !img);
  };

  /* Progreso: el relleno se recorta con clip-path (así sus celdas pixel no se
     estiran, que es lo que haría un scaleX) y la cabeza va por transform. Se
     escribe solo cuando cambia un píxel: en una canción de tres minutos son
     unas pocas escrituras por segundo, no sesenta. */
  let rielW = 0, progPx = -1, tCurTxt = '', tTotTxt = '';
  // en el cine el progreso se arrastra: mientras, manda el dedo (0…1) y no la canción
  let arrastre = null;
  const medirRiel = () => { rielW = el.riel ? el.riel.clientWidth : 0; progPx = -1; };
  const pctRiel = (x) => {
    const r = el.riel.getBoundingClientRect();
    return r.width > 0 ? clamp((x - r.left) / r.width, 0, 1) : 0;
  };
  const fantasma = (n, txt) => { n.textContent = txt; n.dataset.g = txt.replace(/\d/g, '8'); };
  const pintarProgreso = (P) => {
    const dur = P.duration ? P.duration() || 0 : 0;
    const pos = arrastre != null ? arrastre * dur : Math.max(0, P.position ? P.position() || 0 : 0);
    const p = dur > 0 ? clamp(pos / dur, 0, 1) : 0;
    const px = Math.round(p * rielW);
    if (px !== progPx) {
      progPx = px;
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
    if (marco.dataset.estilo !== 'vinilo') return;
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
    const estilo = marco.dataset.estilo;
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
  let raf = 0, lentoT = 0, relojT = '';
  const reloj = { ultimo: 0 };
  const bucle = () => {
    if (!abierto) { raf = 0; return; }
    raf = requestAnimationFrame(bucle);
    if (document.hidden) return;
    const ahora = performance.now();
    if (window.MMPerf && window.MMPerf.salta(reloj, ahora)) return;
    const P = PC();
    if (!P || !P.state) return;
    pintarPista(P.state.currentTrack);
    pintarProgreso(P);
    pintarBrazo(P);
    pintarEspectro(ahora);
    if (ahora - lentoT > 300) { lentoT = ahora; pintarLento(P); }
    vigilarGrabacion(P, ahora);
  };
  const arrancarBucle = () => { if (!raf) raf = requestAnimationFrame(bucle); };
  const pararBucle = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

  const pintarLento = (P) => {
    if (el.mShuffle) el.mShuffle.classList.toggle('on', !!P.state.shuffle);
    if (el.mRepeat) {
      el.mRepeat.classList.toggle('on', P.state.repeat && P.state.repeat !== 'off');
      el.mRepeat.classList.toggle('uno', P.state.repeat === 'one');
    }
    aplicarVista(false);
    if (fase === 'listo' && !enCine()) {
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

  let confirmarBtn = null, confirmarHasta = 0;
  const confirmado = (btn, txt) => {
    const ahora = Date.now();
    if (confirmarBtn === btn && ahora < confirmarHasta) { confirmarBtn = null; return true; }
    confirmarBtn = btn;
    confirmarHasta = ahora + 5000;
    mensaje(txt);
    return false;
  };

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

  const pintarInfo = () => {
    if (!el.info) return;
    el.soltar.hidden = !(captura && (fase === 'listo' || fase === 'hecho'));
    if (!puedeGrabar) {
      el.info.textContent = 'este navegador no puede grabar solo el marco · prueba en chrome o edge';
      return;
    }
    if (fase !== 'listo') return;
    const plan = planSonido();
    const conSon = plan !== 'no' && plan !== 'lejos';
    const ext = /mp4/.test(elegirMime(conSon)) ? 'mp4' : 'webm';
    const tam = pref('calidad') === 'hd' && puedeHD ? SALIDA_W + '×' + SALIDA_H : geo.wd + '×' + geo.hd;
    el.info.textContent = `${tam} · 60 fps · ${ext} · ${conSon ? 'con sonido' : 'sin sonido'}`;
  };

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
    captura = null;
    if (VIS() && VIS().soltarFlujo) VIS().soltarFlujo();
    if (fase === 'grabando') parar();
    else if (fase === 'cuenta') cancelarCuenta();
    avisoSonido();
    pintarInfo();
  };

  const soltarCaptura = () => {
    if (captura) {
      captura.getTracks().forEach((t) => { t.removeEventListener('ended', alTerminarCaptura); t.stop(); });
    }
    captura = null;
    if (VIS() && VIS().soltarFlujo) VIS().soltarFlujo();
    if (el.soltar) el.soltar.hidden = true;
  };

  let preparando = false;
  const alternarGrabar = () => {
    if (enCine()) return;                  // el cine se mira, no se graba
    if (fase === 'grabando') { parar(); return; }
    if (fase === 'cuenta') { cancelarCuenta(); return; }
    if (fase === 'pidiendo' || fase === 'guardando') return;
    /* Mientras se prepara (el sonido, volver a pantalla completa) la fase
       sigue en «listo»: sin este cerrojo, un doble clic —o la R y un clic—
       arrancaba dos grabaciones a la vez. */
    if (preparando) return;
    if (fase === 'hecho') {
      if (resultado && !resultado.guardado && !confirmado(el.rec, 'el de antes no está guardado · pulsa otra vez para tirarlo y grabar otro')) return;
      descartar();
    }
    preparando = true;
    grabar().catch((e) => { console.warn('[9:16] no se pudo grabar:', e); sinVideo('✕ no se pudo grabar'); })
      .finally(() => { preparando = false; });
  };

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
    if (captura && captura.active && plan === 'pestana' && !captura.getAudioTracks().length) soltarCaptura();

    /* Segundo clic tras perder la pantalla completa (ver más abajo): este
       clic SÍ es un gesto, así que ya se puede volver a ella. Se espera a
       que asiente el tamaño, porque la cuenta atrás lo congela. */
    if (captura && captura.active && queriaFull && !document.fullscreenElement) {
      queriaFull = false;
      pedirPantalla();
      await dormir(450);
      if (!abierto) return;                 // se cerró mientras tanto
      medirMarco();
    }
    queriaFull = false;

    if (!captura || !captura.active) {
      if (!abierto) return;
      captura = null;
      const eraFull = !!document.fullscreenElement;
      fase = 'pidiendo';
      pintarFase();
      mensaje(plan === 'pestana'
        ? 'dile que sí al navegador · y deja marcado «compartir el audio de la pestaña»'
        : 'dile que sí al navegador: se graba solo este marco');
      let flujo = null;
      try { flujo = await pedirCaptura(plan === 'pestana'); }
      catch (e) {
        fase = 'listo';
        pintarFase();
        mensaje(e && e.name === 'NotAllowedError' ? '' : '✕ el navegador no dejó grabar la pestaña' + (e && e.name ? ' (' + e.name + ')' : ''));
        return;
      }
      if (!abierto) { flujo.getTracks().forEach((t) => t.stop()); return; }
      const vt = flujo.getVideoTracks()[0];
      try {
        const objetivo = await window.CropTarget.fromElement(marco);
        await vt.cropTo(objetivo);
      } catch (e) {
        flujo.getTracks().forEach((t) => t.stop());
        fase = 'listo';
        pintarFase();
        mensaje('✕ hay que elegir «esta pestaña» para grabar solo el marco');
        return;
      }
      captura = flujo;
      captura.getTracks().forEach((t) => t.addEventListener('ended', alTerminarCaptura));
      // el sonido de la pestaña también mueve el fondo (Spotify por fin baila)
      if (captura.getAudioTracks().length && VIS() && VIS().oirFlujo) VIS().oirFlujo(captura);
      mensaje('');
      /* El diálogo de «compartir esta pestaña» puede SACAR al navegador de
         la pantalla completa, y entonces el marco —y el vídeo— salen más
         pequeños. Volver a ella necesita un gesto del usuario, y aceptar el
         diálogo del navegador no cuenta como gesto de la página: se para
         aquí y el siguiente clic la recupera antes de la cuenta atrás. */
      if (eraFull && !document.fullscreenElement) {
        queriaFull = true;
        fase = 'listo';
        pintarFase();
        mensaje('listo · pulsa ● otra vez y empieza a pantalla completa');
        return;
      }
    }

    planGrabado = plan;
    pistaSonido = null;
    if (plan === 'local' || plan === 'sync' || plan === 'pestana') {
      try { pistaSonido = VIS() && VIS().sonidoParaGrabar ? await VIS().sonidoParaGrabar(plan === 'pestana') : null; }
      catch (e) { pistaSonido = null; }
      if (!pistaSonido) {
        planGrabado = 'no';
        mensaje(plan === 'pestana'
          ? 'no llegó el audio de la pestaña: saldrá sin sonido · «soltar» y graba otra vez marcando el audio'
          : 'no se pudo coger el sonido: saldrá sin sonido');
      }
    } else planGrabado = 'no';
    if (!abierto) return;
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
      if (fase !== 'cuenta') { res(false); return; }
      if (k === 0) { cuentaCancelar = null; res(true); return; }
      el.cuentaNum.textContent = String(k);
      el.cuenta.classList.remove('late');
      void el.cuenta.offsetWidth;          // una vez por segundo: reinicia el latido
      el.cuenta.classList.add('late');
      el.recTxt.textContent = 'cancelar · ' + k;
      if (el.tReloj) el.tReloj.textContent = String(k);
      k--;
      cuentaT = setTimeout(paso, 1000);
    };
    cuentaCancelar = () => { clearTimeout(cuentaT); cuentaCancelar = null; res(false); };
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
  const SALIDA_W = 1080, SALIDA_H = 1920;
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
    raiz.appendChild(v);
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
    if (!canal) return;
    canal.vivo = false;
    try { canal.pista.stop(); } catch (e) {}
    try { canal.v.pause(); } catch (e) {}
    canal.v.srcObject = null;              // soltar la fuente NO para la captura
    canal.v.remove();
    canal = null;
  };

  // Tumbar o enderezar el marco (con el tamaño que le toca a cada postura)
  const tumbar = (on) => {
    if (tumbado === on) return;
    tumbado = on;
    raiz.classList.toggle('tumbado', on);
    el.tira.hidden = !on;
    const antes = congelado;
    congelado = false;
    medirMarco();
    congelado = antes;
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
    fase = 'cuenta';
    congelado = true;                       // el marco ya no cambia de tamaño
    marco.classList.add('rodando');
    const hd = pref('calidad') === 'hd' && puedeHD;
    if (hd && hayQueTumbar()) tumbar(true);
    pintarFase();
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
      canal = await montarCanal(captura && captura.getVideoTracks()[0], tumbado);
      if (fase !== 'cuenta') { desmontarCanal(); return; }   // cancelado mientras tanto
      if (!canal && tumbado) {
        tumbar(false);
        mensaje('no se pudo preparar el 1080p: se graba del tamaño de la pantalla');
      }
    }
    const ok = await cuenta(3);
    if (!ok || fase !== 'cuenta') return;
    el.cuenta.hidden = true;
    if (!P.playing()) P.togglePlay();
    const arranco = await esperar(() => P.playing(), 4000);
    if (fase !== 'cuenta') return;
    if (!arranco) { sinVideo('✕ la música no arrancó'); return; }
    await dosFrames();                      // que la cuenta ya no esté en pantalla
    if (fase !== 'cuenta') return;
    empezarRec();
  };

  const cancelarCuenta = () => {
    if (fase !== 'cuenta') return;
    if (cuentaCancelar) cuentaCancelar();
    sinVideo('');
    const P = PC();
    if (estabaSonando && P && !P.playing()) P.togglePlay();
  };

  // vuelta a «listo» sin vídeo (cancelado o fallido)
  const sinVideo = (txt) => {
    fase = 'listo';
    el.cuenta.hidden = true;
    desmontarCanal();
    tumbar(false);
    congelado = false;
    marco.classList.remove('rodando');
    if (VIS() && VIS().soltarSonido) VIS().soltarSonido();
    pistaSonido = null;
    medirMarco();
    pintarFase();
    if (txt) mensaje(txt);
  };

  const empezarRec = () => {
    const vt = captura && captura.getVideoTracks()[0];
    if (!vt || vt.readyState !== 'live') { sinVideo('✕ se dejó de compartir la pestaña'); return; }
    const pistas = [canal ? canal.pista : vt];
    if (pistaSonido && pistaSonido.readyState === 'live') pistas.push(pistaSonido);
    const conSonido = pistas.length > 1;
    mimeElegido = elegirMime(conSonido);
    const ajustes = vt.getSettings ? vt.getSettings() : {};
    dims = canal ? { w: SALIDA_W, h: SALIDA_H } : { w: ajustes.width || geo.wd, h: ajustes.height || geo.hd };
    /* 60 fps y bitrate de sobra: 1080×1920 a 60 sale a ~16 Mb/s (lo que se
       pide para subir 1080p60), y el marco de pantalla, con más por píxel
       porque tiene menos píxeles que perder cuando TikTok lo recomprima. */
    const op = { videoBitsPerSecond: Math.round(clamp(dims.w * dims.h * 60 * (canal ? 0.13 : 0.2), 6e6, 24e6)) };
    if (mimeElegido) op.mimeType = mimeElegido;
    if (conSonido) op.audioBitsPerSecond = 192000;
    try { rec = new MediaRecorder(new MediaStream(pistas), op); }
    catch (e) {
      try { rec = new MediaRecorder(new MediaStream(pistas)); mimeElegido = rec.mimeType || ''; }
      catch (e2) { sinVideo('✕ este navegador no sabe grabar vídeo'); return; }
    }
    if (!conSonido) planGrabado = 'no';
    trozos = [];
    const este = rec;
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) trozos.push(ev.data); };
    rec.onstop = () => { if (este === rec) alPararRec(); };
    rec.onerror = (ev) => { console.warn('[9:16] el grabador falló:', ev && (ev.error || ev)); parar(); };
    try { rec.start(1000); }                // un trozo por segundo: la memoria no pega saltos al final
    catch (e) { rec = null; sinVideo('✕ no se pudo empezar a grabar'); return; }
    t0 = performance.now();
    acumPausa = 0; marcaPausa = 0; sinSonarDesde = 0;
    pistaAlEmpezar = PC().state.currentTrack;
    fase = 'grabando';
    pintarFase();
  };

  const tiempoGrabado = (ahora) =>
    Math.max(0, ahora - t0 - acumPausa - (rec && rec.state === 'paused' && marcaPausa ? ahora - marcaPausa : 0));

  /* Mientras graba: si la música se para, el vídeo también (nada de tramos
     congelados); y se corta solo al llegar a la duración elegida, al acabar
     la canción («canción») o a los 10 minutos, que es lo que admite TikTok. */
  const TOPE_MS = 10 * 60 * 1000;
  const vigilarGrabacion = (P, ahora) => {
    if (fase !== 'grabando' || !rec) return;
    const suena = !!P.playing();
    if (!suena) {
      if (!sinSonarDesde) sinSonarDesde = ahora;
      // medio segundo de margen: un tirón del reproductor no parte el vídeo
      if (rec.state === 'recording' && ahora - sinSonarDesde > 450) {
        try { rec.pause(); marcaPausa = ahora; } catch (e) {}
      }
    } else {
      sinSonarDesde = 0;
      if (rec.state === 'paused') {
        try { rec.resume(); acumPausa += ahora - marcaPausa; marcaPausa = 0; } catch (e) {}
      }
    }
    const ms = tiempoGrabado(ahora);
    const d = pref('dura');
    const tope = d === '15' ? 15000 : d === '30' ? 30000 : d === '60' ? 60000 : TOPE_MS;
    if (ms >= tope) { parar(); return; }
    if (d === 'cancion') {
      // por id y no por objeto: quien pinta la canción podría rehacer la ficha
      const ahoraSuena = P.state.currentTrack;
      const otra = !ahoraSuena || (ahoraSuena !== pistaAlEmpezar
        && !(pistaAlEmpezar && ahoraSuena.id && ahoraSuena.id === pistaAlEmpezar.id));
      if (otra) { parar(); return; }
      const dur = P.duration(), pos = P.position();
      if (dur > 0 && pos >= dur - 0.25) { parar(); return; }
    }
    const txt = 'parar · ' + fmt(ms / 1000) + (tope < TOPE_MS ? ' / ' + fmt(tope / 1000) : '')
      + (rec.state === 'paused' ? ' · en pausa' : '');
    if (txt !== relojT) {
      relojT = txt;
      el.recTxt.textContent = txt;
      if (el.tReloj) el.tReloj.textContent = fmt(ms / 1000) + (rec.state === 'paused' ? ' ‖' : '');
    }
  };

  const parar = () => {
    if (fase !== 'grabando' || !rec) return;
    durGrabada = tiempoGrabado(performance.now());
    fase = 'guardando';
    pintarFase();
    try { rec.stop(); } catch (e) { /* ya parado: su onstop llega igual */ }
    // la música se para para oír el vídeo sin que suene encima
    const P = PC();
    if (P && P.playing()) P.togglePlay();
    // cinturón: si el onstop no llegara nunca, no se queda colgado aquí
    clearTimeout(guardandoT);
    guardandoT = setTimeout(() => { if (fase === 'guardando') alPararRec(); }, 5000);
  };

  const limpioArchivo = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nombreArchivo = (t, ext) => {
    const base = [limpioArchivo(t && t.artist), limpioArchivo(t && t.name)].filter(Boolean).join(' - ') || 'MASTER MUSIC';
    return base.slice(0, 110) + ' · 9x16.' + ext;
  };

  const alPararRec = () => {
    if (fase !== 'guardando') return;
    clearTimeout(guardandoT);
    const tipo = (rec && rec.mimeType) || mimeElegido || 'video/webm';
    rec = null;
    const base = tipo.split(';')[0] || 'video/webm';
    const blob = new Blob(trozos, { type: base });
    trozos = [];
    if (VIS() && VIS().soltarSonido) VIS().soltarSonido();
    pistaSonido = null;
    desmontarCanal();
    tumbar(false);
    congelado = false;
    marco.classList.remove('rodando');
    relojT = '';
    medirMarco();
    if (!blob.size) { fase = 'listo'; pintarFase(); mensaje('✕ el vídeo salió vacío'); return; }
    const ext = /mp4/.test(base) ? 'mp4' : 'webm';
    resultado = {
      blob, ext,
      url: URL.createObjectURL(blob),
      seg: durGrabada / 1000,
      w: dims.w, h: dims.h,
      conSonido: planGrabado !== 'no',
      nombre: nombreArchivo(pistaAlEmpezar, ext),
      guardado: false,
    };
    fase = 'hecho';
    pintarFase();
    mostrarResultado();
  };

  const mb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const archivo = () => {
    if (!resultado) return null;
    if (!resultado.file) {
      try { resultado.file = new File([resultado.blob], resultado.nombre, { type: resultado.blob.type }); }
      catch (e) { resultado.file = null; }
    }
    return resultado.file;
  };

  const mostrarResultado = () => {
    const r = resultado;
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
    if (!resultado) return;
    const a = document.createElement('a');
    a.href = resultado.url;
    a.download = resultado.nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    resultado.guardado = true;
    mensaje('⤓ guardado en tus descargas · «' + resultado.nombre + '»');
  };

  const compartir = async () => {
    const f = archivo();
    if (!f || !navigator.share) return;
    try {
      await navigator.share({ files: [f], title: resultado.nombre });
      resultado.guardado = true;
    } catch (e) {
      if (!e || e.name !== 'AbortError') mensaje('✕ no se pudo compartir · guárdalo y súbelo desde el archivo');
    }
  };

  const descartar = (callado) => {
    if (!resultado) { if (!callado && fase === 'hecho') { fase = 'listo'; pintarFase(); } return; }
    try { el.vista.pause(); } catch (e) {}
    el.vista.removeAttribute('src');
    try { el.vista.load(); } catch (e) {}
    el.vista.hidden = true;
    URL.revokeObjectURL(resultado.url);
    resultado = null;
    if (fase === 'hecho') fase = 'listo';
    if (!callado) pintarFase();
  };

  // ---------- Lo que enseña el panel en cada fase ----------
  const pintarFase = () => {
    if (!raiz) return;
    raiz.dataset.fase = fase;
    raiz.classList.toggle('grabando', fase === 'grabando');
    const P = PC();
    const hay = !!(P && P.state && P.state.currentTrack);
    let ico = 'grabar', txt = 'grabar', off = false;
    if (fase === 'listo') off = !puedeGrabar || !hay;
    else if (fase === 'pidiendo') { txt = 'esperando permiso…'; off = true; }
    else if (fase === 'cuenta') { ico = 'parar'; txt = 'cancelar'; }
    else if (fase === 'grabando') { ico = 'parar'; txt = 'parar · 0:00'; }
    else if (fase === 'guardando') { ico = 'parar'; txt = 'guardando…'; off = true; }
    else if (fase === 'hecho') txt = 'grabar otro';
    el.recIco.className = 'ico ico-' + ico + ' v916-rec-ico';
    el.recTxt.textContent = txt;
    el.rec.disabled = off;
    el.rec.title = fase === 'grabando' ? 'Parar (R o Esc)' : 'Grabar el marco (R)';
    el.hecho.hidden = fase !== 'hecho';
    if (fase !== 'hecho') el.vista.hidden = true;
    pintarGuias();
    pintarInfo();
  };

  // ---------- Teclado ----------
  /* Mientras está abierto, casi todas las teclas de la app se quedan aquí:
     las pestañas (1-6, L, S, B…) esconderían #tab-lyrics, que ahora vive en
     el marco. Espacio, flechas y M siguen siendo la música, como siempre.
     Ctrl+K tampoco: la paleta saldría encima… y dentro del vídeo. */
  const PASAN = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyM', 'Tab',
    'Enter', 'NumpadEnter', 'ShiftLeft', 'ShiftRight']);
  window.addEventListener('keydown', (e) => {
    if (!abierto) {
      // V abre el modo (si la tecla es de la app y no de un cuadro de texto)
      if ((e.key === 'v' || e.key === 'V') && !e.repeat && libre(e)) { e.preventDefault(); abrir(); }
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
          elegir('cineVista', pref('cineVista') === 'edit' ? 'lista' : 'edit');
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
    if (!abierto) return;
    const t = e.detail && e.detail.tab;
    if (t && t !== 'lyrics' && window.MMNav) window.MMNav.ir('lyrics');
  });

  // Recargar o cerrar la pestaña a media grabación (o con el vídeo sin
  // guardar) lo pregunta el propio navegador.
  window.addEventListener('beforeunload', (e) => {
    if (fase === 'grabando' || fase === 'cuenta' || fase === 'guardando' || (resultado && !resultado.guardado)) {
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
        if (abierto && enCine()) { elegir('cineEstilo', estilo); return; }
        guardarPref('cineEstilo', estilo);
      }
      abrir('cine');
    },
    cerrar: () => { if (abierto && enCine()) cerrar(); },
    esta: () => abierto && enCine(),
    estilo: () => pref('cineEstilo'),
  };

  window.MMVertical = {
    abrir: () => abrir('video'),
    cerrar,
    abierto: () => abierto,
    cine: () => abierto && enCine(),
    // el marco tumbado para grabar en 1080p: js/fondo.js deshace el giro al medir
    giro: () => (tumbado ? -90 : 0),
    grabando: () => fase === 'grabando' || fase === 'cuenta',
    // para las pruebas: el cálculo del estribillo, sin montar nada
    estribillo: buscarEstribillo,
  };
})();
