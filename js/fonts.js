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
   categorías —anime, juegos, series y cine…— y cada una con su muestra.
   Las hojas de Google se piden SOLO de lo que se ve, y agrupadas.

   AÑADIR UNA FUENTE = añadir un objeto a CATALOGO. Nada más:
   la galería, la descarga desde Google y el ajuste de tamaño
   salen de ahí solos.

   Campos:
     id      lo que se guarda en localStorage. NO lo cambies luego:
             quien tuviera esa fuente elegida perdería su ajuste.
     nombre  lo que se lee en la tarjeta (dibujado en su propia fuente)
     grupo   categoría de la galería (ver GRUPOS)
     nota    una línea de por qué está, para quien mire la galería
     css     valor de font-family. SIEMPRE con reserva local detrás,
             por si Google no contesta (sin red, servidor caído).
     google  familia y pesos tal cual los pide fonts.googleapis.com.
             null = ya viene en el <head> de index.html.
     alto    line-height
     peso    grosor de las líneas en reposo
     activo  grosor de la línea que está sonando
     track   letter-spacing
     mayus   true = se dibuja en MAYÚSCULAS (Bebas y Cinzel están
             hechas para eso: su minúscula no existe de verdad)
     ajuste  retoque fino sobre el tamaño que se calcula solo (1 = ninguno)

   ⚠️ LICENCIAS. Esta página es pública, así que aquí SOLO entran fuentes
   que se puedan servir: las de Google Fonts (licencia abierta). Las
   tipografías de Nintendo, Mojang, Microsoft/343, Netflix o de cualquier
   anime NO se pueden redistribuir, y meter una copia sacada de por ahí no
   es una opción. Lo que se hace es elegir la libre que MÁS SE PARECE y
   rematar el parecido con CSS (la sombra dura de Minecraft, el contorno
   de Mario). Donde una fuente evoca algo, la `nota` lo dice: es un aire,
   no la original.
   ========================================================== */
(() => {
  'use strict';

  const CLAVE     = 'mm_lyrics_font';
  const CLAVE_ESC = 'mm_lyrics_font_esc';   // escalas ya medidas (ver medir())
  const CLAVE_GRP = 'mm_lyrics_font_grupo'; // última categoría mirada
  const DEFECTO   = 'playfair';

  /* El orden manda en la galería. `todas` va primero y siempre existe. */
  const GRUPOS = [
    { id: 'todas',    nombre: 'todas' },
    { id: 'anime',    nombre: 'anime' },
    { id: 'juegos',   nombre: 'juegos' },
    { id: 'cine',     nombre: 'series y cine' },
    { id: 'clasicas', nombre: 'clásicas' },
    { id: 'modernas', nombre: 'modernas' },
    { id: 'mano',     nombre: 'a mano' },
    { id: 'consola',  nombre: 'consola' },
  ];

  const CATALOGO = [
    /* ══════════ CLÁSICAS ══════════ */
    {
      id: 'playfair', nombre: 'Playfair Display', grupo: 'clasicas',
      nota: 'la de fábrica: serif con contraste, se lee grande sin cansar',
      css: "'Playfair Display', Georgia, 'Times New Roman', serif",
      google: 'Playfair+Display:ital,wght@0,500;0,700;1,600',
      alto: 1.55, peso: 500, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'cormorant', nombre: 'Cormorant Garamond', grupo: 'clasicas',
      nota: 'fina y de libro antiguo; para baladas',
      css: "'Cormorant Garamond', Garamond, Georgia, serif",
      google: 'Cormorant+Garamond:ital,wght@0,500;0,700;1,600',
      alto: 1.5, peso: 500, activo: 700, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'lora', nombre: 'Lora', grupo: 'clasicas',
      nota: 'serif tranquila, la más neutra de todas',
      css: "'Lora', Georgia, serif",
      google: 'Lora:ital,wght@0,400;0,700;1,500',
      alto: 1.6, peso: 400, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'cinzel', nombre: 'Cinzel', grupo: 'clasicas',
      nota: 'capitales romanas; aire de épica y de crédito de película',
      css: "'Cinzel', Georgia, serif",
      google: 'Cinzel:wght@400;700',
      alto: 1.55, peso: 400, activo: 700, track: '0.04em', mayus: true, ajuste: 1,
    },

    /* ══════════ ANIME Y MANGA ══════════
       Las tipografías de los animes son de sus estudios y no se pueden
       redistribuir. Estas son las japonesas libres de Google con el aire
       de cada cosa: la redonda de los subtítulos, la mincho de los
       títulos de episodio, la de rotulador de los carteles… */
    {
      id: 'zenmaru', nombre: 'Zen Maru Gothic', grupo: 'anime',
      nota: 'la redondita de los subtítulos y la interfaz: el aire anime por excelencia',
      css: "'Zen Maru Gothic', 'Kosugi Maru', 'Segoe UI', sans-serif",
      google: 'Zen+Maru+Gothic:wght@400;700;900',
      alto: 1.6, peso: 400, activo: 700, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'shippori', nombre: 'Shippori Mincho', grupo: 'anime',
      nota: 'mincho: la serif japonesa de los títulos de episodio y el drama',
      css: "'Shippori Mincho', 'Yu Mincho', Georgia, serif",
      google: 'Shippori+Mincho:wght@400;600;800',
      alto: 1.6, peso: 400, activo: 800, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      id: 'reggaeone', nombre: 'Reggae One', grupo: 'anime',
      nota: 'gorda y con garra, como el título de un shonen',
      css: "'Reggae One', 'Potta One', Impact, sans-serif",
      google: 'Reggae+One',
      alto: 1.65, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'potta', nombre: 'Potta One', grupo: 'anime',
      nota: 'redonda y maciza: cartel de opening',
      css: "'Potta One', 'Zen Maru Gothic', sans-serif",
      google: 'Potta+One',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'yusei', nombre: 'Yusei Magic', grupo: 'anime',
      nota: 'de rotulador, como el cartel escrito a mano de un capítulo',
      css: "'Yusei Magic', 'Yusei Magic', 'Comic Sans MS', cursive",
      google: 'Yusei+Magic',
      alto: 1.7, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'hachimaru', nombre: 'Hachi Maru Pop', grupo: 'anime',
      nota: 'kawaii de cuaderno: para lo dulce y lo tonto',
      css: "'Hachi Maru Pop', 'Zen Maru Gothic', cursive",
      google: 'Hachi+Maru+Pop',
      alto: 1.75, peso: 400, activo: 400, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      id: 'rocknroll', nombre: 'RocknRoll One', grupo: 'anime',
      nota: 'gótica japonesa con punta: descarada sin gritar',
      css: "'RocknRoll One', 'Zen Maru Gothic', sans-serif",
      google: 'RocknRoll+One',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'kosugi', nombre: 'Kosugi Maru', grupo: 'anime',
      nota: 'redonda clásica; la más legible del grupo en pantalla pequeña',
      css: "'Kosugi Maru', 'Zen Maru Gothic', sans-serif",
      google: 'Kosugi+Maru',
      alto: 1.65, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'dotgothic', nombre: 'DotGothic16', grupo: 'anime',
      nota: 'de puntos, como los subtítulos de un anime viejo en VHS',
      css: "'DotGothic16', 'VT323', monospace",
      google: 'DotGothic16',
      alto: 1.7, peso: 400, activo: 400, track: '0.03em', mayus: false, ajuste: 1,
    },

    /* ══════════ VIDEOJUEGOS ══════════ */
    {
      /* ESTILO MINECRAFT. La fuente del juego («Mojangles») es de Mojang y no
         se puede redistribuir — y esta página es pública, así que meter una
         copia sacada de por ahí no es una opción. Pixelify Sans es la más
         parecida que hay con licencia libre. Lo que remata el parecido no son
         las letras sino la SOMBRA DURA en diagonal que el juego dibuja detrás
         del texto: eso se lo pone el CSS (busca data-lyrics-font). */
      id: 'pixel', nombre: 'Minecraft', grupo: 'juegos',
      nota: 'aire de Minecraft: Pixelify Sans + la sombra dura en diagonal del juego',
      css: "'Pixelify Sans', 'VT323', monospace",
      google: 'Pixelify+Sans:wght@400;700',
      alto: 1.65, peso: 400, activo: 700, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      /* ESTILO SUPER MARIO BROS. La tipografía de los juegos es de Nintendo y
         no se puede redistribuir. Press Start 2P es la 8-bit de NES por
         excelencia — la misma pinta que el texto dentro del juego — y encima
         YA viene en el <head> de index.html (la usan los títulos de la
         interfaz), así que esta opción no descarga ni un byte extra.
         El remate lo pone el CSS: el contorno negro grueso de los carteles
         de la época (busca data-lyrics-font). */
      id: 'mario', nombre: 'Mario Bros', grupo: 'juegos',
      nota: 'aire de NES: la 8-bit de siempre con el contorno negro de los carteles',
      css: "'Press Start 2P', 'VT323', monospace",
      google: null,
      alto: 2.1, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 0.92,
    },
    {
      /* ESTILO HALO · dos caminos en una sola lista.

         1) Si en ESTE ordenador está instalada una fuente que se llame
            «Halo» (la de fan de Will Turnbow, por ejemplo), el navegador la
            usa y se ve la de verdad. No hace falta nada más: basta con
            instalarla en el sistema como cualquier otra.
         2) Si no está, cae en Orbitron, que se descarga de Google.

         Por qué no va el archivo dentro del proyecto: la fuente del juego es
         de Microsoft/343, y la versión de fan que circula solo trae un
         «gratis» suelto, sin términos. Publicarla en la página sería
         redistribuirla e incrustarla, y para eso no hay permiso. Instalada en
         tu equipo es otra cosa: ahí no se distribuye nada.

         Consecuencia práctica: tú la verás en el PC donde la instales; en el
         móvil y para cualquier otra persona sale Orbitron. Es lo correcto y
         además es lo que hace que la página siga siendo publicable. */
      id: 'halo', nombre: 'Halo', grupo: 'juegos',
      nota: 'usa la Halo si la tienes instalada; si no, Orbitron, que es su aire',
      css: "'Halo', 'Halo 4', 'Orbitron', 'Michroma', 'Segoe UI', sans-serif",
      google: 'Orbitron:wght@500;700;900',
      alto: 1.7, peso: 500, activo: 900, track: '0.08em', mayus: true, ajuste: 1,
    },
    {
      id: 'silkscreen', nombre: 'Arcade', grupo: 'juegos',
      nota: 'píxel diminuto de recreativa: INSERT COIN',
      css: "'Silkscreen', 'Press Start 2P', monospace",
      google: 'Silkscreen:wght@400;700',
      alto: 1.95, peso: 400, activo: 700, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      id: 'chakra', nombre: 'Cyberpunk', grupo: 'juegos',
      nota: 'técnica y cortada: el aire de los shooters y los esports de ahora',
      css: "'Chakra Petch', 'Rajdhani', 'Segoe UI', sans-serif",
      google: 'Chakra+Petch:ital,wght@0,500;0,700;1,600',
      alto: 1.55, peso: 500, activo: 700, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      id: 'audiowide', nombre: 'Nave espacial', grupo: 'juegos',
      nota: 'redondeada y ancha, como el logo de un juego de naves',
      css: "'Audiowide', 'Orbitron', 'Segoe UI', sans-serif",
      google: 'Audiowide',
      alto: 1.6, peso: 400, activo: 400, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      id: 'russo', nombre: 'Russo One', grupo: 'juegos',
      nota: 'maciza y cuadrada: menú de juego de coches',
      css: "'Russo One', 'Segoe UI', sans-serif",
      google: 'Russo+One',
      alto: 1.5, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'bungee', nombre: 'Bungee', grupo: 'juegos',
      nota: 'de rótulo callejero, pensada para gritar una palabra',
      css: "'Bungee', 'Anton', Impact, sans-serif",
      google: 'Bungee',
      alto: 1.5, peso: 400, activo: 400, track: '0.01em', mayus: true, ajuste: 1,
    },
    {
      id: 'teko', nombre: 'Teko', grupo: 'juegos',
      nota: 'estrecha y alta: marcador de esports',
      css: "'Teko', 'Oswald', 'Arial Narrow', sans-serif",
      google: 'Teko:wght@400;600;700',
      alto: 1.35, peso: 500, activo: 700, track: '0.03em', mayus: true, ajuste: 1,
    },

    /* ══════════ SERIES Y CINE ══════════ */
    {
      id: 'cinzeldeco', nombre: 'Fantasía épica', grupo: 'cine',
      nota: 'capitales con adorno: tronos, dragones y mapas',
      css: "'Cinzel Decorative', 'Cinzel', Georgia, serif",
      google: 'Cinzel+Decorative:wght@400;700;900',
      alto: 1.55, peso: 400, activo: 700, track: '0.04em', mayus: true, ajuste: 1,
    },
    {
      id: 'unifraktur', nombre: 'Gótica', grupo: 'cine',
      nota: 'letra gótica de verdad: medieval, metal y cabecera de periódico',
      css: "'UnifrakturMaguntia', 'Pirata One', Georgia, serif",
      google: 'UnifrakturMaguntia',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'creepster', nombre: 'Terror', grupo: 'cine',
      nota: 'chorreante de peli de miedo; para Halloween y poco más',
      css: "'Creepster', 'Metal Mania', Impact, cursive",
      google: 'Creepster',
      alto: 1.6, peso: 400, activo: 400, track: '0.03em', mayus: false, ajuste: 1,
    },
    {
      id: 'special', nombre: 'Máquina de escribir', grupo: 'cine',
      nota: 'teclas gastadas: expediente, documental, thriller',
      css: "'Special Elite', 'Courier New', monospace",
      google: 'Special+Elite',
      alto: 1.7, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'monoton', nombre: 'Neón', grupo: 'cine',
      nota: 'de tubo de neón, con las líneas huecas: noche y sintetizador',
      css: "'Monoton', 'Audiowide', sans-serif",
      google: 'Monoton',
      alto: 1.65, peso: 400, activo: 400, track: '0.03em', mayus: false, ajuste: 1,
    },
    {
      id: 'anton', nombre: 'Cartel', grupo: 'cine',
      nota: 'negra y estrecha: el título de un póster',
      css: "'Anton', Impact, 'Arial Narrow', sans-serif",
      google: 'Anton',
      alto: 1.45, peso: 400, activo: 400, track: '0.01em', mayus: true, ajuste: 1,
    },
    {
      id: 'bevan', nombre: 'Bevan', grupo: 'cine',
      nota: 'de palo grueso con remate: cabecera de serie de los setenta',
      css: "'Bevan', Georgia, serif",
      google: 'Bevan',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },

    /* ══════════ MODERNAS ══════════ */
    {
      id: 'poppins', nombre: 'Poppins', grupo: 'modernas',
      nota: 'geométrica y limpia; la que no molesta nunca',
      css: "'Poppins', 'Segoe UI', system-ui, sans-serif",
      google: 'Poppins:ital,wght@0,400;0,700;1,500',
      alto: 1.6, peso: 400, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'nunito', nombre: 'Nunito redonda', grupo: 'modernas',
      nota: 'gorda y de esquinas blandas: alegre',
      css: "'Nunito', 'Segoe UI', system-ui, sans-serif",
      google: 'Nunito:ital,wght@0,700;0,900;1,900',
      alto: 1.45, peso: 700, activo: 900, track: '-0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'bebas', nombre: 'Bebas Neue', grupo: 'modernas',
      nota: 'estrecha en mayúsculas: cabe muchísimo por renglón',
      css: "'Bebas Neue', 'Arial Narrow', sans-serif",
      google: 'Bebas+Neue',
      alto: 1.45, peso: 400, activo: 400, track: '0.03em', mayus: true, ajuste: 1,
    },
    {
      id: 'bagel', nombre: 'Bagel Fat One', grupo: 'modernas',
      nota: 'hinchada hasta reventar; se lee a metros',
      css: "'Bagel Fat One', 'Nunito', system-ui, sans-serif",
      google: 'Bagel+Fat+One',
      alto: 1.5, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 1,
    },

    /* ══════════ A MANO ══════════ */
    {
      id: 'dancing', nombre: 'Dancing Script', grupo: 'mano',
      nota: 'manuscrita suelta, la más legible de las de mano',
      css: "'Dancing Script', 'Segoe Script', cursive",
      google: 'Dancing+Script:wght@400;700',
      alto: 1.7, peso: 500, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'vibes', nombre: 'Great Vibes', grupo: 'mano',
      nota: 'caligrafía con floritura: bonita, pero cuesta leerla deprisa',
      css: "'Great Vibes', 'Segoe Script', cursive",
      google: 'Great+Vibes',
      alto: 1.75, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'caveat', nombre: 'Caveat', grupo: 'mano',
      nota: 'como escrita a boli en una libreta',
      css: "'Caveat', 'Segoe Script', cursive",
      google: 'Caveat:wght@500;700',
      alto: 1.55, peso: 500, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'permanent', nombre: 'Rotulador', grupo: 'mano',
      nota: 'de marcador gordo: pancarta y pintada',
      css: "'Permanent Marker', 'Segoe Script', cursive",
      google: 'Permanent+Marker',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },

    /* ══════════ CONSOLA ══════════ */
    {
      id: 'retro', nombre: 'VT323 (la de siempre)', grupo: 'consola',
      nota: 'la del propio reproductor: terminal verde de los ochenta',
      css: "'VT323', 'Share Tech Mono', monospace",
      google: null,
      /* activo 400: VT323 no tiene negrita y la inventada emborronaba los
         píxeles. El peso del verso activo lo da el «doble golpe» del CSS
         (busca data-lyrics-font="retro"). */
      alto: 1.9, peso: 400, activo: 400, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      id: 'mono', nombre: 'Share Tech Mono', grupo: 'consola',
      nota: 'monoespaciada técnica, todas las letras del mismo ancho',
      css: "'Share Tech Mono', monospace",
      google: null,
      alto: 1.75, peso: 400, activo: 400, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      id: 'majormono', nombre: 'Major Mono', grupo: 'consola',
      nota: 'monoespaciada rarita, en minúsculas siempre: aire de código',
      css: "'Major Mono Display', 'Share Tech Mono', monospace",
      google: 'Major+Mono+Display',
      alto: 1.8, peso: 400, activo: 400, track: '0.02em', mayus: false, ajuste: 1,
    },
  ];

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
    /* Para lo que una variable no arregla: una fuente concreta puede querer
       su propia sombra, su propio interletraje o lo que sea. Con el id en el
       <html>, el CSS puede apuntarle sin que este módulo sepa nada de estilos
       (lo usa la de Minecraft para su sombra dura). */
    root.dataset.lyricsFont = f.id;
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

  /* ══════════════════════════════════════════════════════════
     LA GALERÍA
     Se construye la PRIMERA vez que se abre, no al arrancar: son 38
     tarjetas que la mayoría de la gente no va a mirar nunca. Vive colgada
     del <body> —como la paleta de Ctrl+K— para que ningún `overflow` de
     los ajustes la recorte.
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
    nombreEl.style.textTransform = f.mayus ? 'uppercase' : 'none';
    if (disparador) disparador.setAttribute('aria-label', 'Tipografía de la letra: ' + f.nombre);
  };

  const leerGrupo = () => {
    let v = '';
    try { v = localStorage.getItem(CLAVE_GRP) || ''; } catch (_) {}
    return GRUPOS.some(g => g.id === v) ? v : 'todas';
  };

  const nombreGrupo = (id) => (GRUPOS.find(g => g.id === id) || {}).nombre || id;

  /* Texto sin tildes y en minúsculas, para que «gotica» encuentre «Gótica». */
  const plano = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const encaja = (f) => {
    if (grupoActivo !== 'todas' && f.grupo !== grupoActivo) return false;
    if (!filtro) return true;
    const q = plano(filtro);
    return plano(f.nombre).includes(q)
      || plano(nombreGrupo(f.grupo)).includes(q)
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
       interletraje y sus mayúsculas: es la única forma de elegir sin
       probártelas una por una en la canción. */
    const m = document.createElement('span');
    m.className = 'fc-muestra';
    m.style.fontFamily = f.css;
    m.style.fontWeight = String(f.peso);
    m.style.letterSpacing = f.track;
    m.style.textTransform = f.mayus ? 'uppercase' : 'none';
    m.style.lineHeight = String(f.alto);
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
    const salen = CATALOGO.filter(encaja);
    if (!salen.length) {
      const v = document.createElement('p');
      v.className = 'fuentes-vacio';
      v.textContent = 'ninguna tipografía se llama así';
      lista.appendChild(v);
      return;
    }
    salen.forEach(f => {
      const card = construirTarjeta(f);
      if (f.id === puesta) card.classList.add('on');
      lista.appendChild(card);
      /* La hoja de Google se pide cuando la tarjeta ASOMA, no antes: abrir la
         galería no puede costar 38 descargas. */
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
