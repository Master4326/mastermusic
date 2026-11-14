/* ==========================================================
   TIPOGRAFÍAS DE LA LETRA · el catálogo, parte 1 de 3
   (anime y manga, videojuegos y góticas)

   Solo datos: las fichas de las tipografías que se pueden elegir en
   config ⚙ → letras → tipografía. Qué significa cada campo (css, google,
   alto, trato…) se explica en js/fonts.js, que es quien las usa.

   El ORDEN manda en la galería: los tres archivos se cargan seguidos, antes
   que js/fonts.js, y cada uno añade sus fichas detrás de las del anterior.
   ========================================================== */
(() => {
  'use strict';
  window.MMInterno = window.MMInterno || {};
  const catalogo = window.MMInterno.fuentes = window.MMInterno.fuentes || [];
  catalogo.push(
    /* ══════════ ANIME Y MANGA ══════════
       Las tipografías de los animes son de sus estudios y no se pueden
       redistribuir. Primero las de animes MUY conocidos —la libre que más
       se parece a su logo, con el remate que lo termina de delatar— y
       detrás las japonesas libres de Google con el aire de cada cosa: la
       redonda de los subtítulos, la mincho de los títulos de episodio… */
    {
      id: 'dragonball', nombre: 'Dragon Ball', grupo: 'anime',
      nota: 'maciza y con remates como el logo de Dragon Ball, con su contorno rojo',
      css: "'Sigmar One', 'Titan One', Impact, sans-serif",
      google: 'Sigmar+One',
      alto: 1.5, peso: 400, activo: 400, track: '0.02em', mayus: true, ajuste: 1,
      trato: { tipo: 'contorno', borde: '#c1272d', caida: '#000', grosor: '0.05em' },
    },
    {
      id: 'naruto', nombre: 'Naruto', grupo: 'anime',
      nota: 'letras latinas trazadas con pincel japonés, de pergamino ninja',
      css: "'Shojumaru', 'Reggae One', Impact, sans-serif",
      google: 'Shojumaru',
      alto: 1.55, peso: 400, activo: 400, track: '0.02em', mayus: true, ajuste: 1,
      trato: { tipo: 'contorno', borde: '#111', caida: '#000', grosor: '0.045em' },
    },
    {
      id: 'onepiece', nombre: 'One Piece', grupo: 'anime',
      nota: 'de cartel de «se busca» del oeste, como las recompensas de One Piece',
      css: "'Rye', 'Sancreek', Georgia, serif",
      google: 'Rye',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
      trato: { tipo: 'caida', caida: '#3b2412', grosor: '0.05em' },
    },
    {
      id: 'kimetsu', nombre: 'Kimetsu no Yaiba', grupo: 'anime',
      nota: 'a pincel, con el trazo suelto de la caligrafía japonesa (Demon Slayer)',
      css: "'Yuji Boku', 'Yuji Syuku', 'Shippori Mincho', serif",
      google: 'Yuji+Boku',
      alto: 1.65, peso: 400, activo: 400, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      id: 'jujutsu', nombre: 'Jujutsu Kaisen', grupo: 'anime',
      nota: 'gótica japonesa negrísima, con el brillo morado de la energía maldita',
      css: "'Dela Gothic One', 'Reggae One', Impact, sans-serif",
      google: 'Dela+Gothic+One',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
      trato: { tipo: 'aura', color: 'rgba(140, 70, 255, 0.6)' },
    },
    {
      id: 'titan', nombre: 'Attack on Titan', grupo: 'anime',
      nota: 'capitales romanas en negrita, como el título de Shingeki no Kyojin',
      css: "'Cinzel', 'Trajan Pro', Georgia, serif",
      google: 'Cinzel:wght@700;900',
      alto: 1.5, peso: 700, activo: 900, track: '0.03em', mayus: true, ajuste: 1,
      trato: { tipo: 'caida', caida: 'rgba(0, 0, 0, 0.9)', grosor: '0.05em' },
    },
    {
      id: 'mha', nombre: 'My Hero Academia', grupo: 'anime',
      nota: 'rotulación de cómic americano, como el logo de My Hero Academia: ¡plus ultra!',
      css: "'Bangers', 'Luckiest Guy', Impact, sans-serif",
      google: 'Bangers',
      alto: 1.4, peso: 400, activo: 400, track: '0.03em', mayus: true, ajuste: 1,
      trato: { tipo: 'contorno', borde: '#000', caida: '#000', grosor: '0.05em' },
    },
    {
      id: 'deathnote', nombre: 'Death Note', grupo: 'anime', tambien: ['goticas'],
      nota: 'gótica negra como la tapa de la libreta, con un brillo pálido',
      css: "'UnifrakturCook', 'UnifrakturMaguntia', Georgia, serif",
      google: 'UnifrakturCook:wght@700',
      alto: 1.6, peso: 700, activo: 700, track: '0.01em', mayus: false, ajuste: 1,
      trato: { tipo: 'aura', color: 'rgba(255, 255, 255, 0.28)', caida: 'rgba(0, 0, 0, 0.95)' },
    },
    {
      id: 'ghibli', nombre: 'Ghibli', grupo: 'anime',
      nota: 'de lápiz, amable y tranquila, como un cartel escrito en una peli de Ghibli',
      css: "'Klee One', 'Zen Kurenaido', 'Segoe Print', cursive",
      google: 'Klee+One:wght@400;600',
      alto: 1.65, peso: 400, activo: 600, track: '0.01em', mayus: false, ajuste: 1,
    },
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
      id: 'hachimaru', nombre: 'Hachi Maru Pop', grupo: 'anime', tambien: ['bonitas'],
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
      /* ESTILO POKÉMON. El logo va en una letra gorda y saltarina con un
         contorno AZUL grueso: eso es lo que se reconoce de lejos, más que la
         forma exacta de cada letra. Luckiest Guy es la libre más parecida
         (solo tiene mayúsculas, como el logo a la vista). El relleno se queda
         con el color de la carátula, como en el resto de la app. */
      id: 'pokemon', nombre: 'Pokémon', grupo: 'juegos', tambien: ['anime'],
      nota: 'aire del logo de Pokémon: gorda y saltarina, con su contorno azul',
      css: "'Luckiest Guy', 'Titan One', Impact, sans-serif",
      google: 'Luckiest+Guy',
      alto: 1.45, peso: 400, activo: 400, track: '0.02em', mayus: true, ajuste: 1,
      trato: { tipo: 'contorno', borde: '#3b6fd1', caida: '#1b2a6b', grosor: '0.06em' },
    },
    {
      /* ESTILO ZELDA. Los textos de Hyrule (Breath of the Wild, Tears of the
         Kingdom) van en una romana de remates abiertos, como la Friz
         Quadrata. Marcellus SC es la libre de esa familia: mayúsculas grandes
         y versalitas, que es como se escribe «The Legend of Zelda». */
      id: 'zelda', nombre: 'Zelda', grupo: 'juegos',
      nota: 'romana de remates abiertos, como los textos de Hyrule, con brillo de trifuerza',
      css: "'Marcellus SC', 'Marcellus', 'Cinzel', Georgia, serif",
      google: 'Marcellus+SC',
      alto: 1.55, peso: 400, activo: 400, track: '0.03em', mayus: false, ajuste: 1,
      trato: { tipo: 'aura', color: 'rgba(255, 206, 92, 0.55)', caida: 'rgba(40, 24, 0, 0.9)' },
    },
    {
      id: 'sonic', nombre: 'Sonic', grupo: 'juegos',
      nota: 'de carreras y en cursiva, con estela de velocidad detrás de cada letra',
      css: "'Racing Sans One', 'Russo One', Impact, sans-serif",
      google: 'Racing+Sans+One',
      alto: 1.5, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
      trato: { tipo: 'estela' },
    },
    {
      /* ESTILO FORTNITE. La del juego (Burbank Big Condensed) es de pago. El
         parecido está en tres cosas: estrechísima, negrísima y en cursiva —
         el «¡VICTORIA MAGISTRAL!» del final—. Barlow Condensed trae esa
         cursiva DE VERDAD (no inventada por el navegador); se piden también
         las rectas, por si algún efecto del modo edit fuerza letra recta. */
      id: 'fortnite', nombre: 'Fortnite', grupo: 'juegos',
      nota: 'estrecha, negrísima y en cursiva: el «¡victoria magistral!» del battle royale',
      css: "'Barlow Condensed', 'Oswald', 'Arial Narrow', sans-serif",
      google: 'Barlow+Condensed:ital,wght@0,800;0,900;1,800;1,900',
      alto: 1.35, peso: 800, activo: 900, track: '0.01em', mayus: true, ajuste: 1,
      cursiva: true,
      trato: { tipo: 'caida', caida: '#1b2a6b', grosor: '0.06em' },
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
      id: 'cod', nombre: 'Call of Duty', grupo: 'juegos',
      nota: 'militar de plantilla, cortada como las letras de una caja de munición',
      css: "'Black Ops One', 'Saira Stencil One', Impact, sans-serif",
      google: 'Black+Ops+One',
      alto: 1.5, peso: 400, activo: 400, track: '0.02em', mayus: false, ajuste: 1,
      trato: { tipo: 'caida', caida: 'rgba(0, 0, 0, 0.9)', grosor: '0.06em' },
    },
    {
      id: 'streetfighter', nombre: 'Street Fighter', grupo: 'juegos',
      nota: 'a brochazos y en cursiva, con el contorno rojo de los carteles de pelea',
      css: "'Knewave', 'Kaushan Script', Impact, cursive",
      google: 'Knewave',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
      trato: { tipo: 'contorno', borde: '#b8141c', caida: '#000', grosor: '0.045em' },
    },
    {
      id: 'brawl', nombre: 'Brawl Stars', grupo: 'juegos',
      nota: 'gorda y redonda con contorno negro y sombra abajo, como Brawl Stars y Clash Royale',
      css: "'Lilita One', 'Titan One', Impact, sans-serif",
      google: 'Lilita+One',
      alto: 1.45, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
      trato: { tipo: 'contorno', borde: '#000', caida: '#000', grosor: '0.055em' },
    },
    {
      id: 'animalcrossing', nombre: 'Animal Crossing', grupo: 'juegos',
      nota: 'redonda y amable, como los bocadillos de diálogo de Nintendo',
      css: "'M PLUS Rounded 1c', 'Zen Maru Gothic', 'Nunito', sans-serif",
      google: 'M+PLUS+Rounded+1c:wght@500;800',
      alto: 1.6, peso: 500, activo: 800, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'castlevania', nombre: 'Castlevania', grupo: 'juegos', tambien: ['goticas'],
      nota: 'gótica hecha de píxeles, de castillo con vampiro, con brillo de sangre',
      css: "'Jacquard 24', 'UnifrakturMaguntia', 'VT323', serif",
      google: 'Jacquard+24',
      alto: 1.6, peso: 400, activo: 400, track: '0.02em', mayus: false, ajuste: 1,
      trato: { tipo: 'aura', color: 'rgba(190, 0, 20, 0.7)' },
    },
    {
      id: 'darksouls', nombre: 'Dark Souls', grupo: 'juegos', tambien: ['goticas'],
      nota: 'capitales finas y separadas como el «HAS MUERTO», con neblina roja',
      css: "'Cormorant SC', 'Cormorant Garamond', 'Cinzel', Georgia, serif",
      google: 'Cormorant+SC:wght@500;700',
      alto: 1.5, peso: 500, activo: 700, track: '0.12em', mayus: true, ajuste: 1,
      trato: { tipo: 'aura', color: 'rgba(150, 10, 10, 0.65)' },
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
      google: 'Teko:wght@400;500;600;700',
      alto: 1.35, peso: 500, activo: 700, track: '0.03em', mayus: true, ajuste: 1,
    },

    /* ══════════ GÓTICAS ══════════
       Letra negra de verdad, medievales, de terror y de rock. Ojo con las
       más cerradas (la Gótica clásica, Vampira): son preciosas pero piden
       leer despacio; para letras largas, mejor la Gótica moderna. */
    {
      id: 'unifraktur', nombre: 'Gótica', grupo: 'goticas',
      nota: 'letra gótica de verdad: medieval, metal y cabecera de periódico',
      css: "'UnifrakturMaguntia', 'Pirata One', Georgia, serif",
      google: 'UnifrakturMaguntia',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'gotisch', nombre: 'Gótica moderna', grupo: 'goticas',
      nota: 'gótica de verdad pero fácil de leer: la mejor para letras largas',
      css: "'Grenze Gotisch', 'UnifrakturMaguntia', Georgia, serif",
      google: 'Grenze+Gotisch:wght@400;700',
      alto: 1.55, peso: 400, activo: 700, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'texturina', nombre: 'Texturina', grupo: 'goticas',
      nota: 'textura medieval suavizada: parece un libro antiguo y se lee de corrido',
      css: "'Texturina', Georgia, serif",
      google: 'Texturina:ital,wght@0,400;0,700;1,400',
      alto: 1.6, peso: 400, activo: 700, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'pirata', nombre: 'Pirata', grupo: 'goticas',
      nota: 'negra y estrecha, entre letra gótica y bandera pirata',
      css: "'Pirata One', 'UnifrakturMaguntia', Georgia, serif",
      google: 'Pirata+One',
      alto: 1.5, peso: 400, activo: 400, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      id: 'fruktur', nombre: 'Fraktur', grupo: 'goticas',
      nota: 'fraktur gordita y con ritmo, de rótulo alemán antiguo',
      css: "'Fruktur', 'UnifrakturMaguntia', Georgia, serif",
      google: 'Fruktur',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'metal', nombre: 'Heavy metal', grupo: 'goticas',
      nota: 'con pinchos, de portada de disco de metal',
      css: "'Metal Mania', 'New Rocker', Impact, serif",
      google: 'Metal+Mania',
      alto: 1.55, peso: 400, activo: 400, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      id: 'rocker', nombre: 'Rock gótico', grupo: 'goticas',
      nota: 'gótica con filo, de camiseta de banda de rock',
      css: "'New Rocker', 'Pirata One', Georgia, serif",
      google: 'New+Rocker',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'victoriana', nombre: 'Victoriana', grupo: 'goticas',
      nota: 'de imprenta antigua con la tinta corrida, como un cuento de Poe',
      css: "'IM Fell English', 'Cormorant Garamond', Georgia, serif",
      google: 'IM+Fell+English:ital@0;1',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'medieval', nombre: 'Medieval', grupo: 'goticas',
      nota: 'de pergamino y pluma: castillos, espadas y juglares',
      css: "'MedievalSharp', 'Almendra', Georgia, serif",
      google: 'MedievalSharp',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'almendra', nombre: 'Almendra', grupo: 'goticas',
      nota: 'caligrafía medieval legible, con un punto de cuento',
      css: "'Almendra', 'MedievalSharp', Georgia, serif",
      google: 'Almendra:ital,wght@0,400;0,700;1,400',
      alto: 1.55, peso: 400, activo: 700, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'vampira', nombre: 'Vampira', grupo: 'goticas',
      nota: 'caligrafía gótica con florituras, de carta de vampiro; pide leer despacio',
      css: "'Mea Culpa', 'Great Vibes', 'Segoe Script', cursive",
      google: 'Mea+Culpa',
      alto: 1.7, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'bruja', nombre: 'Bruja', grupo: 'goticas',
      nota: 'a pluma y torcida, de libro de hechizos',
      css: "'Jim Nightshade', 'Segoe Script', cursive",
      google: 'Jim+Nightshade',
      alto: 1.65, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'sangre', nombre: 'Sangre', grupo: 'goticas',
      nota: 'chorreando sangre; ancha, para las canciones de miedo',
      css: "'Nosifer', 'Creepster', Impact, cursive",
      google: 'Nosifer',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: true, ajuste: 0.85,
    },
    {
      id: 'zombi', nombre: 'Zombi', grupo: 'goticas',
      nota: 'mordida y deshecha, de peli de zombis',
      css: "'Eater', 'Creepster', Impact, cursive",
      google: 'Eater',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: true, ajuste: 1,
    },
  );
})();
/* ==========================================================
   TIPOGRAFÍAS DE LA LETRA · el catálogo, parte 2 de 3
   (bonitas, llamativas, y series y cine)

   Solo datos: las fichas de las tipografías que se pueden elegir en
   config ⚙ → letras → tipografía. Qué significa cada campo (css, google,
   alto, trato…) se explica en js/fonts.js, que es quien las usa.

   El ORDEN manda en la galería: los tres archivos se cargan seguidos, antes
   que js/fonts.js, y cada uno añade sus fichas detrás de las del anterior.
   ========================================================== */
(() => {
  'use strict';
  window.MMInterno = window.MMInterno || {};
  const catalogo = window.MMInterno.fuentes = window.MMInterno.fuentes || [];
  catalogo.push(
    /* ══════════ BONITAS ══════════
       Cursivas bonitas, redondas tiernas y elegantes de revista. */
    {
      id: 'pacifico', nombre: 'Pacifico', grupo: 'bonitas',
      nota: 'cursiva redonda de tabla de surf: la más alegre de todas',
      css: "'Pacifico', 'Lobster', 'Segoe Script', cursive",
      google: 'Pacifico',
      alto: 1.75, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'lobster', nombre: 'Lobster', grupo: 'bonitas',
      nota: 'cursiva gorda de letrero de cafetería',
      css: "'Lobster', 'Pacifico', 'Segoe Script', cursive",
      google: 'Lobster',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'sacramento', nombre: 'Sacramento', grupo: 'bonitas',
      nota: 'de un solo trazo fino, como una firma elegante',
      css: "'Sacramento', 'Great Vibes', 'Segoe Script', cursive",
      google: 'Sacramento',
      alto: 1.7, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'parisienne', nombre: 'Parisienne', grupo: 'bonitas',
      nota: 'caligrafía francesa, elegante sin pasarse',
      css: "'Parisienne', 'Great Vibes', 'Segoe Script', cursive",
      google: 'Parisienne',
      alto: 1.7, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'satisfy', nombre: 'Satisfy', grupo: 'bonitas',
      nota: 'de pincel fino, suelta y fácil de leer',
      css: "'Satisfy', 'Dancing Script', 'Segoe Script', cursive",
      google: 'Satisfy',
      alto: 1.65, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'yellowtail', nombre: 'Yellowtail', grupo: 'bonitas',
      nota: 'cursiva de los cincuenta, con chispa de rótulo antiguo',
      css: "'Yellowtail', 'Lobster', 'Segoe Script', cursive",
      google: 'Yellowtail',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'courgette', nombre: 'Courgette', grupo: 'bonitas',
      nota: 'cursiva gordita y muy legible: la más cómoda de las bonitas',
      css: "'Courgette', 'Dancing Script', 'Segoe Script', cursive",
      google: 'Courgette',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'berkshire', nombre: 'Berkshire Swash', grupo: 'bonitas',
      nota: 'con florituras en las mayúsculas, de libro de cuentos',
      css: "'Berkshire Swash', 'Lobster', Georgia, serif",
      google: 'Berkshire+Swash',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'macondo', nombre: 'Macondo', grupo: 'bonitas',
      nota: 'con adornos de cuento; se llama como el pueblo de Cien años de soledad',
      css: "'Macondo', 'Almendra', Georgia, serif",
      google: 'Macondo',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'bodoni', nombre: 'Portada de moda', grupo: 'bonitas',
      nota: 'Bodoni de alto contraste, la de las portadas de revista de moda',
      css: "'Bodoni Moda', 'Didot', 'Playfair Display', Georgia, serif",
      google: 'Bodoni+Moda:ital,wght@0,500;0,800;1,500',
      alto: 1.5, peso: 500, activo: 800, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'italiana', nombre: 'Italiana', grupo: 'bonitas',
      nota: 'fina y alta, como el anuncio de un perfume',
      css: "'Italiana', 'Cormorant Garamond', Georgia, serif",
      google: 'Italiana',
      alto: 1.55, peso: 400, activo: 400, track: '0.03em', mayus: false, ajuste: 1,
    },
    {
      id: 'poiret', nombre: 'Poiret One', grupo: 'bonitas',
      nota: 'art déco de líneas finas, de los años veinte',
      css: "'Poiret One', 'Josefin Sans', sans-serif",
      google: 'Poiret+One',
      alto: 1.55, peso: 400, activo: 400, track: '0.03em', mayus: false, ajuste: 1,
    },
    {
      id: 'josefin', nombre: 'Josefin Sans', grupo: 'bonitas',
      nota: 'geométrica y vintage: elegante y muy clara',
      css: "'Josefin Sans', 'Poppins', 'Segoe UI', sans-serif",
      google: 'Josefin+Sans:ital,wght@0,400;0,700;1,400',
      alto: 1.55, peso: 400, activo: 700, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'comfortaa', nombre: 'Comfortaa', grupo: 'bonitas',
      nota: 'redonda y abierta, suave como una almohada',
      css: "'Comfortaa', 'Nunito', 'Segoe UI', sans-serif",
      google: 'Comfortaa:wght@500;700',
      alto: 1.55, peso: 500, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'quicksand', nombre: 'Quicksand', grupo: 'bonitas',
      nota: 'redonda y fina, limpia y tranquila',
      css: "'Quicksand', 'Nunito', 'Segoe UI', sans-serif",
      google: 'Quicksand:wght@500;700',
      alto: 1.55, peso: 500, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'fredoka', nombre: 'Fredoka', grupo: 'bonitas',
      nota: 'redonda y gordita: tierna sin ser infantil',
      css: "'Fredoka', 'Nunito', 'Segoe UI', sans-serif",
      google: 'Fredoka:wght@500;700',
      alto: 1.5, peso: 500, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'cherrybomb', nombre: 'Kawaii', grupo: 'bonitas', tambien: ['anime'],
      nota: 'japonesa gordita y tierna, de pegatina kawaii',
      css: "'Cherry Bomb One', 'Hachi Maru Pop', 'Nunito', sans-serif",
      google: 'Cherry+Bomb+One',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'mochiy', nombre: 'Pop japonés', grupo: 'bonitas', tambien: ['anime'],
      nota: 'redonda y maciza, de caja de golosinas japonesa',
      css: "'Mochiy Pop One', 'Potta One', 'Nunito', sans-serif",
      google: 'Mochiy+Pop+One',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },

    /* ══════════ LLAMATIVAS ══════════
       Para lucirse: con textura, con volumen, con neón. Las Rubik de
       fantasía comparten esqueleto y cambian la piel. */
    {
      id: 'burbujas', nombre: 'Burbujas', grupo: 'llamativas',
      nota: 'hinchada como pompas de jabón',
      css: "'Rubik Bubbles', 'Bagel Fat One', 'Nunito', sans-serif",
      google: 'Rubik+Bubbles',
      alto: 1.45, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'vinilo', nombre: 'Vinilo', grupo: 'llamativas',
      nota: 'con surcos como un disco: la más musical de todas',
      css: "'Rubik Vinyl', 'Rubik', 'Segoe UI', sans-serif",
      google: 'Rubik+Vinyl',
      alto: 1.45, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'glitch', nombre: 'Glitch', grupo: 'llamativas',
      nota: 'cortada a tiras, como una pantalla que falla',
      css: "'Rubik Glitch', 'Rubik', 'Segoe UI', sans-serif",
      google: 'Rubik+Glitch',
      alto: 1.45, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'ochentera', nombre: 'Ochentera', grupo: 'llamativas',
      nota: 'rayas que se desvanecen, de logo de los ochenta',
      css: "'Rubik 80s Fade', 'Rubik', 'Segoe UI', sans-serif",
      google: 'Rubik+80s+Fade',
      alto: 1.45, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'grafiti', nombre: 'Grafiti', grupo: 'llamativas',
      nota: 'de spray, con la pintura salpicada alrededor',
      css: "'Rubik Spray Paint', 'Rubik', 'Segoe UI', sans-serif",
      google: 'Rubik+Spray+Paint',
      alto: 1.45, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'pintura', nombre: 'Pintura fresca', grupo: 'llamativas',
      nota: 'recién pintada y goteando',
      css: "'Rubik Wet Paint', 'Rubik', 'Segoe UI', sans-serif",
      google: 'Rubik+Wet+Paint',
      alto: 1.5, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'monstruo', nombre: 'Monstruo', grupo: 'llamativas',
      nota: 'peluda, de monstruo simpático',
      css: "'Rubik Beastly', 'Rubik', 'Segoe UI', sans-serif",
      google: 'Rubik+Beastly',
      alto: 1.5, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'neontubo', nombre: 'Neón de tubo', grupo: 'llamativas',
      nota: 'hecha de tubos de neón, y brilla como uno',
      css: "'Tilt Neon', 'Quicksand', 'Segoe UI', sans-serif",
      google: 'Tilt+Neon',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
      trato: { tipo: 'neon' },
    },
    {
      id: 'neonmano', nombre: 'Neón a mano', grupo: 'llamativas',
      nota: 'cursiva de letrero de neón, la de los bares de noche',
      css: "'Neonderthaw', 'Sacramento', 'Segoe Script', cursive",
      google: 'Neonderthaw',
      alto: 1.7, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
      trato: { tipo: 'neon' },
    },
    {
      id: 'kablam', nombre: '¡Kablam!', grupo: 'llamativas',
      nota: 'de cómic que tiembla, como una onomatopeya',
      css: "'Kablammo', 'Bangers', Impact, sans-serif",
      google: 'Kablammo',
      alto: 1.5, peso: 400, activo: 400, track: '0.01em', mayus: true, ajuste: 1,
    },
    {
      id: 'sombra3d', nombre: 'Letras 3D', grupo: 'llamativas',
      nota: 'con volumen de verdad, de letrero de sala de recreativas',
      css: "'Bungee Shade', 'Bungee', Impact, sans-serif",
      google: 'Bungee+Shade',
      alto: 1.45, peso: 400, activo: 400, track: '0em', mayus: true, ajuste: 0.9,
    },
    {
      id: 'cabaret', nombre: 'Cabaret', grupo: 'llamativas',
      nota: 'de marquesina de teatro de los años treinta, con una línea por dentro',
      css: "'Fascinate Inline', 'Limelight', Georgia, serif",
      google: 'Fascinate+Inline',
      alto: 1.5, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'setentera', nombre: 'Setentera', grupo: 'llamativas',
      nota: 'gorda y en cursiva, de portada de disco de los setenta',
      css: "'Shrikhand', 'Lobster', Georgia, cursive",
      google: 'Shrikhand',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'gatsby', nombre: 'Años veinte', grupo: 'llamativas',
      nota: 'de cartel de cine mudo, muy Gatsby',
      css: "'Limelight', 'Poiret One', Georgia, serif",
      google: 'Limelight',
      alto: 1.55, peso: 400, activo: 400, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      id: 'retrofuturo', nombre: 'Retrofuturo', grupo: 'llamativas',
      nota: 'redondeada y ancha: el futuro que se imaginaban en los setenta',
      css: "'Righteous', 'Audiowide', 'Segoe UI', sans-serif",
      google: 'Righteous',
      alto: 1.5, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'bagel', nombre: 'Bagel Fat One', grupo: 'llamativas',
      nota: 'hinchada hasta reventar; se lee a metros',
      css: "'Bagel Fat One', 'Nunito', system-ui, sans-serif",
      google: 'Bagel+Fat+One',
      alto: 1.5, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 1,
    },

    /* ══════════ SERIES Y CINE ══════════ */
    {
      /* ESTILO STRANGER THINGS. El logo va en ITC Benguiat (de pago) y lo que
         se reconoce es el CONTORNO ROJO que brilla, más que cada letra. Young
         Serif tiene ese aire de portada de novela de los ochenta; el trazo
         rojo va encima del color de la carátula, así el karaoke sigue
         distinguiendo lo cantado de lo que falta. */
      id: 'stranger', nombre: 'Stranger Things', grupo: 'cine',
      nota: 'serif ochentera de portada de novela, con el contorno rojo de neón del logo',
      css: "'Young Serif', 'Libre Baskerville', Georgia, serif",
      google: 'Young+Serif',
      alto: 1.5, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
      trato: { tipo: 'trazo', borde: '#ff3b30', color: 'rgba(255, 40, 40, 0.55)' },
    },
    {
      id: 'anillos', nombre: 'El Señor de los Anillos', grupo: 'cine', tambien: ['goticas'],
      nota: 'uncial celta de la Tierra Media, con el brillo del anillo en el fuego',
      css: "'Uncial Antiqua', 'MedievalSharp', Georgia, serif",
      google: 'Uncial+Antiqua',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
      trato: { tipo: 'aura', color: 'rgba(255, 140, 30, 0.6)' },
    },
    {
      id: 'cinzeldeco', nombre: 'Fantasía épica', grupo: 'cine',
      nota: 'capitales con adorno: tronos, dragones y mapas',
      css: "'Cinzel Decorative', 'Cinzel', Georgia, serif",
      google: 'Cinzel+Decorative:wght@400;700;900',
      alto: 1.55, peso: 400, activo: 700, track: '0.04em', mayus: true, ajuste: 1,
    },
    {
      id: 'western', nombre: 'Lejano oeste', grupo: 'cine',
      nota: 'de cartel de saloon, con remates de madera tallada',
      css: "'Sancreek', 'Rye', Georgia, serif",
      google: 'Sancreek',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'creepster', nombre: 'Terror', grupo: 'cine', tambien: ['goticas'],
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
      id: 'monoton', nombre: 'Neón', grupo: 'cine', tambien: ['llamativas'],
      nota: 'de tubo de neón, con las líneas huecas: noche y sintetizador',
      css: "'Monoton', 'Audiowide', sans-serif",
      google: 'Monoton',
      alto: 1.65, peso: 400, activo: 400, track: '0.03em', mayus: false, ajuste: 1,
      trato: { tipo: 'neon' },
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
  );
})();
/* ==========================================================
   TIPOGRAFÍAS DE LA LETRA · el catálogo, parte 3 de 3
   (normales, clásicas, a mano y consola)

   Solo datos: las fichas de las tipografías que se pueden elegir en
   config ⚙ → letras → tipografía. Qué significa cada campo (css, google,
   alto, trato…) se explica en js/fonts.js, que es quien las usa.

   El ORDEN manda en la galería: los tres archivos se cargan seguidos, antes
   que js/fonts.js, y cada uno añade sus fichas detrás de las del anterior.
   ========================================================== */
(() => {
  'use strict';
  window.MMInterno = window.MMInterno || {};
  const catalogo = window.MMInterno.fuentes = window.MMInterno.fuentes || [];
  catalogo.push(
    /* ══════════ NORMALES ══════════
       Las de todos los días: limpias, se leen solas y no se hacen notar. */
    {
      id: 'poppins', nombre: 'Poppins', grupo: 'normales',
      nota: 'geométrica y limpia; la que no molesta nunca',
      css: "'Poppins', 'Segoe UI', system-ui, sans-serif",
      google: 'Poppins:ital,wght@0,400;0,700;1,500',
      alto: 1.6, peso: 400, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'montserrat', nombre: 'Montserrat', grupo: 'normales',
      nota: 'nacida de los carteles de un barrio de Buenos Aires: geométrica y firme',
      css: "'Montserrat', 'Poppins', 'Segoe UI', sans-serif",
      google: 'Montserrat:ital,wght@0,500;0,800;1,600',
      alto: 1.55, peso: 500, activo: 800, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'inter', nombre: 'Inter', grupo: 'normales',
      nota: 'hecha para pantallas: la más clara en tamaños pequeños',
      css: "'Inter', 'Segoe UI', system-ui, sans-serif",
      google: 'Inter:wght@500;800',
      alto: 1.55, peso: 500, activo: 800, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'roboto', nombre: 'Roboto', grupo: 'normales',
      nota: 'la de Android: la de todos los días',
      css: "'Roboto', 'Segoe UI', system-ui, sans-serif",
      google: 'Roboto:wght@500;900',
      alto: 1.55, peso: 500, activo: 900, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'opensans', nombre: 'Open Sans', grupo: 'normales',
      nota: 'abierta y neutra, de las más leídas de internet',
      css: "'Open Sans', 'Segoe UI', system-ui, sans-serif",
      google: 'Open+Sans:wght@500;800',
      alto: 1.55, peso: 500, activo: 800, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'lato', nombre: 'Lato', grupo: 'normales',
      nota: 'redondeada por dentro y seria por fuera: cálida',
      css: "'Lato', 'Segoe UI', system-ui, sans-serif",
      google: 'Lato:ital,wght@0,400;0,900;1,400',
      alto: 1.55, peso: 400, activo: 900, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'raleway', nombre: 'Raleway', grupo: 'normales',
      nota: 'fina y elegante, con aire de revista',
      css: "'Raleway', 'Segoe UI', system-ui, sans-serif",
      google: 'Raleway:ital,wght@0,500;0,800;1,500',
      alto: 1.55, peso: 500, activo: 800, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'nunito', nombre: 'Nunito redonda', grupo: 'normales',
      nota: 'gorda y de esquinas blandas: alegre',
      css: "'Nunito', 'Segoe UI', system-ui, sans-serif",
      google: 'Nunito:ital,wght@0,700;0,900;1,900',
      alto: 1.45, peso: 700, activo: 900, track: '-0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'outfit', nombre: 'Outfit', grupo: 'normales',
      nota: 'geométrica y moderna, de marca de ropa',
      css: "'Outfit', 'Poppins', 'Segoe UI', sans-serif",
      google: 'Outfit:wght@500;800',
      alto: 1.5, peso: 500, activo: 800, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'rubik', nombre: 'Rubik', grupo: 'normales',
      nota: 'con las esquinas un poco redondas: amable sin ser infantil',
      css: "'Rubik', 'Segoe UI', system-ui, sans-serif",
      google: 'Rubik:wght@500;800',
      alto: 1.5, peso: 500, activo: 800, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'spacegrotesk', nombre: 'Space Grotesk', grupo: 'normales',
      nota: 'con un punto raro y técnico, de estudio de diseño',
      css: "'Space Grotesk', 'Segoe UI', system-ui, sans-serif",
      google: 'Space+Grotesk:wght@500;700',
      alto: 1.5, peso: 500, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'kanit', nombre: 'Kanit', grupo: 'normales',
      nota: 'cuadradita y deportiva, muy de camiseta',
      css: "'Kanit', 'Segoe UI', system-ui, sans-serif",
      google: 'Kanit:ital,wght@0,500;0,800;1,500',
      alto: 1.5, peso: 500, activo: 800, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'oswald', nombre: 'Oswald', grupo: 'normales',
      nota: 'estrecha y alta, de titular de periódico',
      css: "'Oswald', 'Bebas Neue', 'Arial Narrow', sans-serif",
      google: 'Oswald:wght@500;700',
      alto: 1.45, peso: 500, activo: 700, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'bebas', nombre: 'Bebas Neue', grupo: 'normales',
      nota: 'estrecha en mayúsculas: cabe muchísimo por renglón',
      css: "'Bebas Neue', 'Arial Narrow', sans-serif",
      google: 'Bebas+Neue',
      alto: 1.45, peso: 400, activo: 400, track: '0.03em', mayus: true, ajuste: 1,
    },
    {
      id: 'unbounded', nombre: 'Unbounded', grupo: 'normales',
      nota: 'ancha y redonda, de cartel moderno; ocupa mucho',
      css: "'Unbounded', 'Poppins', 'Segoe UI', sans-serif",
      google: 'Unbounded:wght@500;800',
      alto: 1.45, peso: 500, activo: 800, track: '0em', mayus: false, ajuste: 0.92,
    },

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
    {
      id: 'baskerville', nombre: 'Baskerville', grupo: 'clasicas',
      nota: 'la de los libros de siempre, seria y cálida',
      css: "'Libre Baskerville', Baskerville, Georgia, serif",
      google: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400',
      alto: 1.6, peso: 400, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'garamond', nombre: 'EB Garamond', grupo: 'clasicas',
      nota: 'Garamond de imprenta del siglo XVI: para lo poético',
      css: "'EB Garamond', Garamond, Georgia, serif",
      google: 'EB+Garamond:ital,wght@0,500;0,800;1,500',
      alto: 1.55, peso: 500, activo: 800, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'merriweather', nombre: 'Merriweather', grupo: 'clasicas',
      nota: 'serif robusta pensada para leer en pantalla',
      css: "'Merriweather', Georgia, serif",
      google: 'Merriweather:ital,wght@0,400;0,900;1,400',
      alto: 1.6, peso: 400, activo: 900, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'dmserif', nombre: 'DM Serif Display', grupo: 'clasicas',
      nota: 'de titular, con mucho contraste y curvas suaves',
      css: "'DM Serif Display', 'Playfair Display', Georgia, serif",
      google: 'DM+Serif+Display:ital@0;1',
      alto: 1.5, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'instrument', nombre: 'Instrument Serif', grupo: 'clasicas',
      nota: 'estrecha y elegante, la serif de moda en los diseños de ahora',
      css: "'Instrument Serif', 'Playfair Display', Georgia, serif",
      google: 'Instrument+Serif:ital@0;1',
      alto: 1.5, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'fraunces', nombre: 'Fraunces', grupo: 'clasicas',
      nota: 'serif blandita de los setenta, con curvas que parecen derretirse',
      css: "'Fraunces', 'Playfair Display', Georgia, serif",
      google: 'Fraunces:ital,wght@0,600;0,900;1,600',
      alto: 1.5, peso: 600, activo: 900, track: '0em', mayus: false, ajuste: 1,
    },

    /* ══════════ A MANO ══════════ */
    {
      id: 'dancing', nombre: 'Dancing Script', grupo: 'mano',
      nota: 'manuscrita suelta, la más legible de las de mano',
      css: "'Dancing Script', 'Segoe Script', cursive",
      google: 'Dancing+Script:wght@400;500;700',
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
    {
      id: 'indie', nombre: 'Indie Flower', grupo: 'mano',
      nota: 'redondita de cuaderno, como una nota pegada en la nevera',
      css: "'Indie Flower', 'Segoe Print', cursive",
      google: 'Indie+Flower',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'shadows', nombre: 'Shadows Into Light', grupo: 'mano',
      nota: 'fina y rápida, de apunte a lápiz',
      css: "'Shadows Into Light', 'Segoe Print', cursive",
      google: 'Shadows+Into+Light',
      alto: 1.6, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'gloria', nombre: 'Gloria Hallelujah', grupo: 'mano',
      nota: 'de cómic dibujado a mano, alegre',
      css: "'Gloria Hallelujah', 'Segoe Print', cursive",
      google: 'Gloria+Hallelujah',
      alto: 1.75, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'patrick', nombre: 'Patrick Hand', grupo: 'mano',
      nota: 'a mano pero ordenada: la más fácil de leer de este grupo',
      css: "'Patrick Hand', 'Segoe Print', cursive",
      google: 'Patrick+Hand',
      alto: 1.55, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'kalam', nombre: 'Kalam', grupo: 'mano',
      nota: 'de bolígrafo, suelta y con ritmo',
      css: "'Kalam', 'Segoe Print', cursive",
      google: 'Kalam:wght@400;700',
      alto: 1.6, peso: 400, activo: 700, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'rocksalt', nombre: 'Rock Salt', grupo: 'mano',
      nota: 'de rotulador gastado, escrita deprisa en una pared',
      css: "'Rock Salt', 'Permanent Marker', cursive",
      google: 'Rock+Salt',
      alto: 1.9, peso: 400, activo: 400, track: '0.01em', mayus: true, ajuste: 0.9,
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
    {
      id: 'sixtyfour', nombre: 'Commodore 64', grupo: 'consola',
      nota: 'de ordenador de los ochenta, con las rayas de la pantalla de tubo',
      css: "'Sixtyfour', 'VT323', monospace",
      google: 'Sixtyfour',
      alto: 1.8, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 0.8,
    },
    {
      id: 'workbench', nombre: 'Amiga', grupo: 'consola',
      nota: 'la del escritorio de un Amiga: píxel con rayas de monitor',
      css: "'Workbench', 'VT323', monospace",
      google: 'Workbench',
      alto: 1.7, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'doto', nombre: 'Pantalla LED', grupo: 'consola',
      nota: 'de puntitos, como el letrero luminoso de una estación',
      css: "'Doto', 'DotGothic16', monospace",
      google: 'Doto:wght@600;900',
      alto: 1.7, peso: 600, activo: 900, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      id: 'jersey', nombre: 'Marcador', grupo: 'consola',
      nota: 'píxel de marcador de estadio',
      css: "'Jersey 10', 'Silkscreen', monospace",
      google: 'Jersey+10',
      alto: 1.5, peso: 400, activo: 400, track: '0.02em', mayus: false, ajuste: 1,
    },
  );
})();
