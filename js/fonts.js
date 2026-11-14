/* ==========================================================
   TIPOGRAFÍA DE LA LETRA — ajustes → letras → tipografía

   La letra es lo único que se mira durante toda la canción, así
   que tiene su propia fuente, aparte del resto de la ventana
   (que se queda con la retro de siempre: VT323 / Press Start 2P).

   ── POR QUÉ YA NO SON BOTONES UNO AL LADO DE OTRO ──
   Con 15 fuentes, `.font-picker` era una pared de chips con salto de
   línea metida dentro de los ajustes: ocupaba media pantalla, en el
   móvil eran seis renglones, y encima PRECARGABA LAS 15 de golpe en
   cuanto los ajustes asomaban — quince hojas de Google que nadie había
   pedido. Con 38 eso ya no se sostiene.
   Ahora en los ajustes hay UNA fila con la fuente puesta, y todas viven
   guardadas en su propia galería (se abre al pulsarla): buscador,
   categorías —anime, juegos, góticas, bonitas…— y cada una con su muestra.
   Las hojas de Google se piden SOLO de lo que se ve, y agrupadas.

   ── LA TANDA GRANDE (25-sep-2026) ──
   De 41 a más de cien: juegos y animes MUY conocidos (Pokémon, Zelda,
   Fortnite, Dragon Ball, Naruto, One Piece…), góticas, bonitas,
   llamativas y normales. Cada una de las «famosas» se eligió poniendo
   varias candidatas lado a lado con su remate puesto, y todas las del
   catálogo tienen ¿ ¡ ñ y tildes (se comprobó glifa por glifa: Rock 3D
   y Butcherman se quedaron fuera por no traerlas).

   AÑADIR UNA FUENTE = añadir un objeto a CATALOGO. Nada más:
   la galería, la descarga desde Google, el ajuste de tamaño y el
   remate (`trato`) salen de ahí solos.

   Campos:
     id      lo que se guarda en localStorage. NO lo cambies luego:
             quien tuviera esa fuente elegida perdería su ajuste.
     nombre  lo que se lee en la tarjeta (dibujado en su propia fuente)
     grupo   categoría de la galería (ver GRUPOS)
     tambien (opcional) otras categorías donde TAMBIÉN sale: Pokémon es
             juego y es anime; Castlevania es juego y es gótica
     nota    una línea de por qué está, para quien mire la galería
     css     valor de font-family. SIEMPRE con reserva local detrás,
             por si Google no contesta (sin red, servidor caído).
     google  familia y pesos tal cual los pide fonts.googleapis.com.
             null = ya viene en el <head> de index.html.
             ⚠️ Un peso que la familia no tenga hace que Google conteste
             400 y se caiga el LOTE entero (van de diez en diez): todas
             las de esta lista se comprobaron una por una contra la API.
     alto    line-height
     peso    grosor de las líneas en reposo
     activo  grosor de la línea que está sonando
     track   letter-spacing
     mayus   true = se dibuja en MAYÚSCULAS (Bebas y Cinzel están
             hechas para eso: su minúscula no existe de verdad)
     ajuste  retoque fino sobre el tamaño que se calcula solo (1 = ninguno)
     cursiva (opcional) true = toda la letra en cursiva, con la cursiva
             DE VERDAD de la fuente (pídela en `google`: ital,wght@1,…)
     trato   (opcional) el remate que hace que una fuente «parezca» lo que
             evoca: el contorno azul de Pokémon, la estela de Sonic, el
             aura morada de Jujutsu Kaisen. Se pinta en el verso que suena,
             en su palabra destacada, en las ya cantadas del karaoke, en la
             muestra de ajustes y en la tarjeta de la galería. El dibujo
             está en css/base/ (busca data-lyrics-trato); aquí solo se
             elige cuál y de qué color:
               contorno  borde alrededor de cada letra + sombra dura abajo
                         { borde, caida, grosor }
               aura      resplandor de un color propio en vez del de la
                         carátula                       { color, caida }
               caida     sombra dura desplazada, sin borde { caida, grosor }
               estela    rastro de velocidad hacia atrás (color de la app)
               neon      brillo de tubo de neón         (color de la app)
               trazo     contorno fino encima de la letra y su resplandor
                         { borde, color }

   ⚠️ LICENCIAS. Esta página es pública, así que aquí SOLO entran fuentes
   que se puedan servir: las de Google Fonts (licencia abierta). Las
   tipografías de Nintendo, Mojang, Microsoft/343, Epic, Netflix o de
   cualquier anime NO se pueden redistribuir, y meter una copia sacada de
   por ahí no es una opción. Lo que se hace es elegir la libre que MÁS SE
   PARECE y rematar el parecido con CSS (la sombra dura de Minecraft, el
   contorno de Mario, el azul de Pokémon). Donde una fuente evoca algo, la
   `nota` lo dice: es un aire, no la original.
   ========================================================== */
(() => {
  'use strict';

  const CLAVE     = 'mm_lyrics_font';
  const CLAVE_ESC = 'mm_lyrics_font_esc';   // escalas ya medidas (ver medir())
  const CLAVE_GRP = 'mm_lyrics_font_grupo'; // última categoría mirada
  const DEFECTO   = 'playfair';

  /* El orden manda en la galería: el de los botones de categoría y el de
     los rótulos de «todas». `todas` va primero y siempre existe.
     (`modernas` pasó a llamarse `normales`: quien la tuviera guardada como
     última categoría vuelve a «todas», que no hace daño.) */
  const GRUPOS = [
    { id: 'todas',      nombre: 'todas' },
    { id: 'anime',      nombre: 'anime' },
    { id: 'juegos',     nombre: 'juegos' },
    { id: 'goticas',    nombre: 'góticas' },
    { id: 'bonitas',    nombre: 'bonitas' },
    { id: 'llamativas', nombre: 'llamativas' },
    { id: 'cine',       nombre: 'series y cine' },
    { id: 'normales',   nombre: 'normales' },
    { id: 'clasicas',   nombre: 'clásicas' },
    { id: 'mano',       nombre: 'a mano' },
    { id: 'consola',    nombre: 'consola' },
  ];

  /* El catálogo (las fichas de todas las tipografías, por categorías) vive en
     js/fuentes/catalogo-1…3.js: tres archivos de datos que se cargan antes
     que este y van dejando sus fichas, en el orden de la galería, en esta
     lista. */
  const CATALOGO = (window.MMInterno && window.MMInterno.fuentes) || [];

  const root = document.documentElement;

  const porId = (id) => CATALOGO.find(f => f.id === id)
    || CATALOGO.find(f => f.id === DEFECTO) || CATALOGO[0];

  const leer = () => {
    let v = '';
    try { v = localStorage.getItem(CLAVE) || ''; } catch (_) {}
    return CATALOGO.some(f => f.id === v) ? v : DEFECTO;
  };

  // ---------- Descarga ----------
  /* Una promesa por fuente, guardada: si se pide dos veces (al elegirla y al
     asomar su tarjeta) no se cuela la hoja dos veces. */
  const pedidas = {};

  const esperarCaras = (f) => (document.fonts
    ? document.fonts.load('400 40px ' + f.css)
        .then(() => document.fonts.load('700 40px ' + f.css))
        .catch(() => {})
    : Promise.resolve());

  /* Las hojas de Google se piden EN GRUPO, no una por fuente.
     `css2?family=A&family=B&family=C` trae las tres en una sola petición, y
     la galería enseña las fuentes de seis en seis conforme se baja: pedirlas
     sueltas serían seis viajes donde cabe uno. Se junta lo que llegue en el
     mismo suspiro (60 ms) con tope de 10, que la URL tampoco es infinita. */
  const espera = new Map();     // id → {f, listo}
  let temporizador = null;
  const LOTE_MAX = 10;

  const enviarLote = () => {
    temporizador = null;
    if (!espera.size) return;
    const lote = [...espera.values()].slice(0, LOTE_MAX);
    lote.forEach(x => espera.delete(x.f.id));
    if (espera.size) temporizador = setTimeout(enviarLote, 60);

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?'
      + lote.map(x => 'family=' + x.f.google).join('&') + '&display=swap';
    let hecho = false;
    const acabar = () => { if (hecho) return; hecho = true; lote.forEach(x => x.listo()); };
    link.addEventListener('load', acabar);
    /* Si Google no contesta NO se reintenta ni se avisa de nada: el
       font-family lleva reserva local detrás, la letra se sigue leyendo. */
    link.addEventListener('error', acabar);
    setTimeout(acabar, 6000);
    document.head.appendChild(link);
  };

  const cargar = (f) => {
    if (pedidas[f.id]) return pedidas[f.id];
    if (!f.google) {                 // ya viene en el <head>
      pedidas[f.id] = esperarCaras(f);
      return pedidas[f.id];
    }
    pedidas[f.id] = new Promise((listo) => {
      espera.set(f.id, { f, listo });
      if (!temporizador) temporizador = setTimeout(enviarLote, 60);
    }).then(() => esperarCaras(f));
    return pedidas[f.id];
  };

  /* La familia que de verdad hay que esperar. Sale de `google` cuando la hay
     —es la que se descarga: para «Halo» eso es Orbitron, porque la del juego,
     si está, está instalada y disponible desde el primer momento— y si no, de
     la primera familia del font-family. */
  const familiaDiana = (f) => {
    if (f.google) return f.google.split(':')[0].replace(/\+/g, ' ');
    const m = /^\s*'([^']+)'|^\s*"([^"]+)"|^\s*([^,]+)/.exec(f.css);
    return ((m && (m[1] || m[2] || m[3])) || '').trim();
  };

  const esperarCara = (f) => new Promise((listo) => {
    const fam = familiaDiana(f);
    if (!fam || !document.fonts || !document.fonts.check) return listo();
    let vueltas = 0;
    const mirar = () => {
      let hay = false;
      try { hay = document.fonts.check('40px "' + fam + '"'); } catch (_) { hay = true; }
      // tope de 4 s: si Google no contesta se mide la de reserva y en paz
      if (hay || ++vueltas > 40) return listo();
      setTimeout(mirar, 100);
    };
    mirar();
  });

  // ---------- Tamaño: igualar lo que se VE, no los píxeles ----------
  /* Cada fuente rinde distinto: VT323 a 40px se ve como una normal de 30. Y
     los tamaños S/M/L/XL están calibrados con VT323. Así que se mide la altura
     real de cada fuente y se iguala a la de VT323 — cambiar de tipografía
     cambia la FORMA de la letra, nunca lo grande que se ve.
     Se mide la equis en las de caja baja y la hache en las de MAYÚSCULAS, que
     es lo que manda en el tamaño aparente de cada una. */
  const REFERENCIA = "'VT323', monospace";
  let lienzo = null;

  const altura = (familia, texto) => {
    try {
      if (!lienzo) lienzo = document.createElement('canvas').getContext('2d');
      lienzo.font = '100px ' + familia;
      const a = lienzo.measureText(texto).actualBoundingBoxAscent;
      return (a > 0 && isFinite(a)) ? a : 0;
    } catch (_) { return 0; }
  };

  const escalas = (() => {
    try { return JSON.parse(localStorage.getItem(CLAVE_ESC) || '{}') || {}; }
    catch (_) { return {}; }
  })();

  /* Devuelve null cuando NO se ha podido medir, que no es lo mismo que medir
     1. Antes las dos cosas devolvían 1 y el resultado se guardaba igual: si
     la fuente no había llegado del todo, se apuntaba un 1 falso en
     localStorage y esa fuente se quedaba con el tamaño sin corregir hasta que
     volvieras a elegirla. Ahora, sin medida, no se guarda nada. */
  const medir = (f) => {
    const texto = f.mayus ? 'H' : 'x';
    const base = altura(REFERENCIA, texto);
    const mia  = altura(f.css, texto);
    // Sin medida fiable (navegador viejo, fuente aún sin llegar) no se toca nada
    if (!base || !mia) return null;
    const e = (base / mia) * (f.ajuste || 1);
    // Topes: una fuente rarísima no puede dejar la letra ni diminuta ni gigante
    return Math.min(1.45, Math.max(0.6, e));
  };

  const guardarEscala = (id, e) => {
    escalas[id] = e;
    try { localStorage.setItem(CLAVE_ESC, JSON.stringify(escalas)); } catch (_) {}
  };

  // ---------- Aplicar ----------
  const aplicar = (id, repintar) => {
    const f = porId(id);
    root.style.setProperty('--lyrics-font', f.css);
    root.style.setProperty('--lyrics-line', String(f.alto));
    root.style.setProperty('--lyrics-weight', String(f.peso));
    root.style.setProperty('--lyrics-weight-on', String(f.activo));
    root.style.setProperty('--lyrics-tracking', f.track);
    root.style.setProperty('--lyrics-caps', f.mayus ? 'uppercase' : 'none');
    root.style.setProperty('--lyrics-style', f.cursiva ? 'italic' : 'normal');
    /* Para lo que una variable no arregla: una fuente concreta puede querer
       su propia sombra, su propio interletraje o lo que sea. Con el id en el
       <html>, el CSS puede apuntarle sin que este módulo sepa nada de estilos
       (lo usa la de Minecraft para su sombra dura). */
    root.dataset.lyricsFont = f.id;
    /* El remate (`trato`): el tipo va en el <html> para que el CSS sepa QUÉ
       dibujar, y los colores en variables. Sin trato se quita la marca y la
       letra vuelve al brillo de siempre, el del color de la carátula. */
    ponerTrato(root, f.trato);
    /* La escala medida la vez pasada se pone YA, sin esperar a la descarga: si
       no, al recargar la página la letra pega un salto de tamaño al llegar. */
    root.style.setProperty('--lyrics-font-scale', String(escalas[f.id] || 1));
    pintarDisparador();

    /* Esperar a que la cara esté DE VERDAD disponible antes de medir.
       Ni `cargar()` ni `document.fonts.ready` bastan: el primero solo promete
       que llegó la hoja de Google, y `document.fonts.load(...)` se conforma con
       que CUALQUIERA de las familias de la lista esté disponible — y la lista
       lleva reserva local detrás, así que resolvía con la de reserva y se
       medía la que no era. Se veía como una escala de 1 clavado de vez en
       cuando justo al elegir una fuente nueva. `check()` pregunta por UNA
       familia concreta, que es la pregunta correcta. */
    /* Y aun con la cara disponible, el lienzo puede no verla todavía: el
       `measureText` de un <canvas> tiene su propio momento para enterarse de
       una fuente recién llegada, y cuando no se ha enterado devuelve un
       ascendente de 0. Eso salía como una escala de 1 —o sea, sin corregir—
       una de cada cinco veces al elegir una fuente nueva. Se reintenta unas
       cuantas veces; en cuanto hay medida, se guarda y se aplica. */
    cargar(f).then(() => esperarCara(f)).then(() => {
      let vueltas = 0;
      const intentar = () => {
        if (leer() !== f.id) return;     // cambió de opinión mientras bajaba
        const e = medir(f);
        if (e == null) {                 // sin medida no se guarda un valor falso
          if (++vueltas <= 12) setTimeout(intentar, 120);
          return;
        }
        guardarEscala(f.id, e);
        root.style.setProperty('--lyrics-font-scale', e.toFixed(3));
        /* El modo edit calcula sus tamaños MIDIENDO el texto. Si midió con la
           fuente de reserva, esa línea se queda mal hasta que cambie sola. */
        if (repintar && window.LyricsModule && window.LyricsModule.repintar) {
          window.LyricsModule.repintar();
        }
      };
      intentar();
    });
  };

  /* Escribe el remate de una fuente en un elemento: en el <html> para la
     letra de verdad, y en la muestra de cada tarjeta de la galería, que así
     enseña la fuente CON su contorno o su aura, no a medias. */
  const ponerTrato = (el, t) => {
    if (!t) { delete el.dataset.lyricsTrato; return; }
    el.dataset.lyricsTrato = t.tipo;
    el.style.setProperty('--lf-borde', t.borde || 'transparent');
    el.style.setProperty('--lf-caida', t.caida || 'rgba(0, 0, 0, 0.8)');
    el.style.setProperty('--lf-aura', t.color || 'var(--accent-glow)');
    el.style.setProperty('--lf-grosor', t.grosor || '0.05em');
  };

  /* ══════════════════════════════════════════════════════════
     LA GALERÍA
     Se construye la PRIMERA vez que se abre, no al arrancar: son más de
     cien tarjetas que la mayoría de la gente no va a mirar nunca. Vive
     colgada del <body> —como la paleta de Ctrl+K— para que ningún
     `overflow` de los ajustes la recorte.
     ══════════════════════════════════════════════════════════ */
  /* Corta a propósito: la muestra va en una línea sin partir, y una frase
     más larga se comía en puntos suspensivos justo las fuentes anchas, que son
     las que más hay que ver. Con estas tres palabras entran enteras casi
     todas, y las que no, se ven igual de bien. */
  const MUESTRA = 'te sigo cantando';
  const disparador = document.getElementById('fontAbrir');
  const nombreEl   = document.getElementById('fontActual');

  let panel = null, lista = null, entrada = null, grupoBarra = null, mirador = null;
  let grupoActivo = 'todas', filtro = '';
  let devolverFoco = null;

  const pintarDisparador = () => {
    if (!nombreEl) return;
    const f = porId(leer());
    nombreEl.textContent = f.nombre;
    /* El botón se dibuja EN la fuente puesta: se ve cuál es sin leerla. */
    nombreEl.style.fontFamily = f.css;
    nombreEl.style.fontWeight = String(f.peso);
    nombreEl.style.fontStyle = f.cursiva ? 'italic' : 'normal';
    nombreEl.style.textTransform = f.mayus ? 'uppercase' : 'none';
    if (disparador) disparador.setAttribute('aria-label', 'Tipografía de la letra: ' + f.nombre);
  };

  const leerGrupo = () => {
    let v = '';
    try { v = localStorage.getItem(CLAVE_GRP) || ''; } catch (_) {}
    return GRUPOS.some(g => g.id === v) ? v : 'todas';
  };

  const nombreGrupo = (id) => (GRUPOS.find(g => g.id === id) || {}).nombre || id;

  /* ¿Sale esta fuente en esta categoría? En la suya, y en las de `tambien`. */
  const estaEn = (f, g) => f.grupo === g || (f.tambien || []).indexOf(g) >= 0;

  /* Texto sin tildes y en minúsculas, para que «gotica» encuentre «Gótica». */
  const plano = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  const encaja = (f) => {
    if (grupoActivo !== 'todas' && !estaEn(f, grupoActivo)) return false;
    if (!filtro) return true;
    const q = plano(filtro);
    return plano(f.nombre).includes(q)
      || [f.grupo].concat(f.tambien || []).some(g => plano(nombreGrupo(g)).includes(q))
      || plano(f.nota).includes(q);
  };

  const construirTarjeta = (f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fuente-card';
    b.dataset.font = f.id;

    const cab = document.createElement('span');
    cab.className = 'fc-cab';
    const n = document.createElement('span');
    n.className = 'fc-nombre';
    n.textContent = f.nombre;
    const g = document.createElement('span');
    g.className = 'fc-grupo';
    g.textContent = nombreGrupo(f.grupo);
    const tic = document.createElement('span');
    tic.className = 'fc-tic';
    tic.setAttribute('aria-hidden', 'true');
    tic.textContent = '✓';
    cab.append(n, g, tic);

    /* La muestra se dibuja en la fuente de la tarjeta Y con su grosor, su
       interletraje, sus mayúsculas, su cursiva y su remate: es la única
       forma de elegir sin probártelas una por una en la canción. */
    const m = document.createElement('span');
    m.className = 'fc-muestra';
    m.style.fontFamily = f.css;
    m.style.fontWeight = String(f.peso);
    m.style.fontStyle = f.cursiva ? 'italic' : 'normal';
    m.style.letterSpacing = f.track;
    m.style.textTransform = f.mayus ? 'uppercase' : 'none';
    m.style.lineHeight = String(f.alto);
    ponerTrato(m, f.trato);
    m.textContent = MUESTRA;

    const nota = document.createElement('span');
    nota.className = 'fc-nota';
    nota.textContent = f.nota || '';

    b.append(cab, m, nota);
    return b;
  };

  const pintarLista = () => {
    if (!lista) return;
    lista.textContent = '';
    const puesta = leer();
    let salen = CATALOGO.filter(encaja);
    if (!salen.length) {
      const v = document.createElement('p');
      v.className = 'fuentes-vacio';
      v.textContent = 'ninguna tipografía se llama así';
      lista.appendChild(v);
      return;
    }
    /* En «todas» y sin buscar, van por categorías y con un rótulo delante de
       cada una: con más de cien tarjetas seguidas no se sabía dónde acababa
       el anime y empezaban los juegos. Cada fuente sale UNA vez, en su grupo
       (lo de `tambien` es para cuando se mira una categoría suelta). */
    const rotulos = grupoActivo === 'todas' && !filtro;
    if (rotulos) {
      salen = GRUPOS.slice(1).flatMap(g => salen.filter(f => f.grupo === g.id));
    } else if (grupoActivo !== 'todas') {
      // en una categoría, primero las suyas y detrás las que también encajan
      salen = salen.filter(f => f.grupo === grupoActivo)
        .concat(salen.filter(f => f.grupo !== grupoActivo));
    }
    let grupoPrevio = null;
    salen.forEach(f => {
      if (rotulos && f.grupo !== grupoPrevio) {
        grupoPrevio = f.grupo;
        const r = document.createElement('p');
        r.className = 'fuentes-sep';
        r.textContent = nombreGrupo(f.grupo);
        lista.appendChild(r);
      }
      const card = construirTarjeta(f);
      if (f.id === puesta) card.classList.add('on');
      lista.appendChild(card);
      /* La hoja de Google se pide cuando la tarjeta ASOMA, no antes: abrir la
         galería no puede costar cien descargas. */
      if (mirador) mirador.observe(card); else cargar(f);
    });
  };

  const marcarPuesta = () => {
    if (!lista) return;
    const v = leer();
    lista.querySelectorAll('.fuente-card').forEach(c => {
      c.classList.toggle('on', c.dataset.font === v);
    });
  };

  const pintarGrupos = () => {
    if (!grupoBarra) return;
    grupoBarra.querySelectorAll('.fg-chip').forEach(c => {
      const on = c.dataset.grupo === grupoActivo;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  const construir = () => {
    if (panel) return;
    panel = document.createElement('div');
    panel.className = 'fuentes';
    panel.id = 'fuentesPanel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="fuentes-fondo"></div>
      <div class="fuentes-caja" role="dialog" aria-modal="true" aria-label="Tipografía de la letra">
        <div class="paleta-fila">
          <span class="paleta-prompt" aria-hidden="true">A</span>
          <input class="paleta-input" type="text" autocomplete="off" spellcheck="false"
                 placeholder="buscar tipografía…" aria-label="Buscar tipografía" />
          <button class="paleta-x" type="button" title="Cerrar (Esc)" aria-label="Cerrar">✕</button>
        </div>
        <div class="fuentes-grupos" role="group" aria-label="Categorías"></div>
        <div class="fuentes-lista"></div>
      </div>`;
    document.body.appendChild(panel);

    lista      = panel.querySelector('.fuentes-lista');
    entrada    = panel.querySelector('.paleta-input');
    grupoBarra = panel.querySelector('.fuentes-grupos');

    GRUPOS.forEach(g => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'fg-chip';
      c.dataset.grupo = g.id;
      c.textContent = g.nombre;
      grupoBarra.appendChild(c);
    });

    if ('IntersectionObserver' in window) {
      mirador = new IntersectionObserver((vistas) => {
        vistas.forEach(v => {
          if (!v.isIntersecting) return;
          mirador.unobserve(v.target);
          const f = CATALOGO.find(x => x.id === v.target.dataset.font);
          if (f) cargar(f);
        });
      }, { root: lista, rootMargin: '200px' });
    }

    grupoBarra.addEventListener('click', (e) => {
      const c = e.target.closest('.fg-chip');
      if (!c) return;
      grupoActivo = c.dataset.grupo;
      try { localStorage.setItem(CLAVE_GRP, grupoActivo); } catch (_) {}
      pintarGrupos();
      pintarLista();
      lista.scrollTop = 0;
    });

    /* Elegir NO cierra la galería: así se comparan varias seguidas viendo el
       cambio, que es justo para lo que sirve tenerlas todas juntas. */
    lista.addEventListener('click', (e) => {
      const c = e.target.closest('.fuente-card');
      if (!c) return;
      try { localStorage.setItem(CLAVE, c.dataset.font); } catch (_) {}
      aplicar(c.dataset.font, true);
      marcarPuesta();
      if (window.SevenStatus) window.SevenStatus('▣ letra: ' + porId(c.dataset.font).nombre);
    });

    entrada.addEventListener('input', () => {
      filtro = entrada.value.trim();
      pintarLista();
      lista.scrollTop = 0;
    });

    panel.querySelector('.paleta-x').addEventListener('click', cerrar);
    panel.querySelector('.fuentes-fondo').addEventListener('click', cerrar);
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar(); }
    });
  };

  const abrir = () => {
    construir();
    if (!panel.hidden) return;
    devolverFoco = document.activeElement;
    grupoActivo = leerGrupo();
    filtro = '';
    entrada.value = '';
    panel.hidden = false;
    pintarGrupos();
    pintarLista();
    lista.scrollTop = 0;
    // la puesta primero: que se vea de un vistazo cuál está elegida
    const puesta = lista.querySelector('.fuente-card.on');
    if (puesta && puesta.scrollIntoView) puesta.scrollIntoView({ block: 'nearest' });
    entrada.focus();
  };

  const cerrar = () => {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    if (devolverFoco && devolverFoco.focus) devolverFoco.focus();
    devolverFoco = null;
  };

  if (disparador) disparador.addEventListener('click', abrir);

  pintarDisparador();
  aplicar(leer(), false);

  // Por si otro módulo quiere saber (o cambiar) en qué fuente va la letra
  window.MMFonts = {
    lista: () => CATALOGO.map(f => ({ id: f.id, nombre: f.nombre, grupo: f.grupo })),
    grupos: () => GRUPOS.map(g => ({ id: g.id, nombre: g.nombre })),
    actual: leer,
    poner: (id) => {
      if (!CATALOGO.some(f => f.id === id)) return false;
      try { localStorage.setItem(CLAVE, id); } catch (_) {}
      aplicar(id, true);
      marcarPuesta();
      return true;
    },
    abrir,
    cerrar,
  };
})();
