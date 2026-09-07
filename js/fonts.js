/* ==========================================================
   TIPOGRAFÍA DE LA LETRA — ajustes → letras → tipografía

   La letra es lo único que se mira durante toda la canción, así
   que tiene su propia fuente, aparte del resto de la ventana
   (que se queda con la retro de siempre: VT323 / Press Start 2P).

   AÑADIR UNA FUENTE = añadir un objeto a CATALOGO. Nada más:
   los botones, la descarga desde Google y el ajuste de tamaño
   salen de ahí solos.

   Campos:
     id      lo que se guarda en localStorage. NO lo cambies luego:
             quien tuviera esa fuente elegida perdería su ajuste.
     nombre  lo que se lee en el botón (dibujado en su propia fuente)
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
   ========================================================== */
(() => {
  'use strict';

  const CLAVE     = 'mm_lyrics_font';
  const CLAVE_ESC = 'mm_lyrics_font_esc';   // escalas ya medidas (ver medir())
  const DEFECTO   = 'playfair';

  const CATALOGO = [
    {
      id: 'playfair', nombre: 'Playfair Display',
      css: "'Playfair Display', Georgia, 'Times New Roman', serif",
      google: 'Playfair+Display:ital,wght@0,500;0,700;1,600',
      alto: 1.55, peso: 500, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      /* ESTILO MINECRAFT. La fuente del juego («Mojangles») es de Mojang y no
         se puede redistribuir — y esta página es pública, así que meter una
         copia sacada de por ahí no es una opción. Pixelify Sans es la más
         parecida que hay con licencia libre. Lo que remata el parecido no son
         las letras sino la SOMBRA DURA en diagonal que el juego dibuja detrás
         del texto: eso se lo pone el CSS (busca data-lyrics-font). */
      id: 'pixel', nombre: 'Pixelify · estilo Minecraft',
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
      id: 'mario', nombre: 'Press Start · estilo Mario',
      css: "'Press Start 2P', 'VT323', monospace",
      google: null,
      alto: 2.1, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 0.92,
    },
    {
      /* ESTILO HALO. La del juego es de Microsoft/343 y tampoco se puede
         redistribuir. Orbitron es la geométrica de ciencia ficción más
         reconocible con licencia libre; en MAYÚSCULAS y con el interletraje
         abierto da el aire militar-espacial de los rótulos de Halo. */
      id: 'halo', nombre: 'Orbitron · estilo Halo',
      css: "'Orbitron', 'Michroma', 'Segoe UI', sans-serif",
      google: 'Orbitron:wght@500;700;900',
      alto: 1.7, peso: 500, activo: 900, track: '0.08em', mayus: true, ajuste: 1,
    },
    {
      id: 'retro', nombre: 'VT323 (la de siempre)',
      css: "'VT323', 'Share Tech Mono', monospace",
      google: null,
      alto: 1.9, peso: 400, activo: 700, track: '0.02em', mayus: false, ajuste: 1,
    },
    {
      id: 'cormorant', nombre: 'Cormorant Garamond',
      css: "'Cormorant Garamond', Garamond, Georgia, serif",
      google: 'Cormorant+Garamond:ital,wght@0,500;0,700;1,600',
      alto: 1.5, peso: 500, activo: 700, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'lora', nombre: 'Lora',
      css: "'Lora', Georgia, serif",
      google: 'Lora:ital,wght@0,400;0,700;1,500',
      alto: 1.6, peso: 400, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'cinzel', nombre: 'Cinzel',
      css: "'Cinzel', Georgia, serif",
      google: 'Cinzel:wght@400;700',
      alto: 1.55, peso: 400, activo: 700, track: '0.04em', mayus: true, ajuste: 1,
    },
    {
      id: 'poppins', nombre: 'Poppins',
      css: "'Poppins', 'Segoe UI', system-ui, sans-serif",
      google: 'Poppins:ital,wght@0,400;0,700;1,500',
      alto: 1.6, peso: 400, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'nunito', nombre: 'Nunito redonda',
      css: "'Nunito', 'Segoe UI', system-ui, sans-serif",
      google: 'Nunito:ital,wght@0,700;0,900;1,900',
      alto: 1.45, peso: 700, activo: 900, track: '-0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'bebas', nombre: 'Bebas Neue',
      css: "'Bebas Neue', 'Arial Narrow', sans-serif",
      google: 'Bebas+Neue',
      alto: 1.45, peso: 400, activo: 400, track: '0.03em', mayus: true, ajuste: 1,
    },
    {
      id: 'bagel', nombre: 'Bagel Fat One',
      css: "'Bagel Fat One', 'Nunito', system-ui, sans-serif",
      google: 'Bagel+Fat+One',
      alto: 1.5, peso: 400, activo: 400, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'dancing', nombre: 'Dancing Script',
      css: "'Dancing Script', 'Segoe Script', cursive",
      google: 'Dancing+Script:wght@400;700',
      alto: 1.7, peso: 500, activo: 700, track: '0em', mayus: false, ajuste: 1,
    },
    {
      id: 'vibes', nombre: 'Great Vibes',
      css: "'Great Vibes', 'Segoe Script', cursive",
      google: 'Great+Vibes',
      alto: 1.75, peso: 400, activo: 400, track: '0.01em', mayus: false, ajuste: 1,
    },
    {
      id: 'mono', nombre: 'Share Tech Mono',
      css: "'Share Tech Mono', monospace",
      google: null,
      alto: 1.75, peso: 400, activo: 400, track: '0.02em', mayus: false, ajuste: 1,
    },
  ];

  const root   = document.documentElement;
  const picker = document.getElementById('fontPicker');

  const porId = (id) => CATALOGO.find(f => f.id === id)
    || CATALOGO.find(f => f.id === DEFECTO) || CATALOGO[0];

  const leer = () => {
    let v = '';
    try { v = localStorage.getItem(CLAVE) || ''; } catch (_) {}
    return CATALOGO.some(f => f.id === v) ? v : DEFECTO;
  };

  // ---------- Descarga ----------
  /* Una promesa por fuente, guardada: si se pide dos veces (al elegirla y al
     precargar el selector) no se cuela el <link> dos veces. */
  const pedidas = {};

  const esperarCaras = (f) => (document.fonts
    ? document.fonts.load('400 40px ' + f.css)
        .then(() => document.fonts.load('700 40px ' + f.css))
        .catch(() => {})
    : Promise.resolve());

  const cargar = (f) => {
    if (pedidas[f.id]) return pedidas[f.id];
    if (!f.google) {                 // ya viene en el <head>
      pedidas[f.id] = esperarCaras(f);
      return pedidas[f.id];
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + f.google + '&display=swap';
    pedidas[f.id] = new Promise((listo) => {
      link.addEventListener('load', listo);
      /* Si Google no contesta NO se reintenta ni se avisa de nada: el
         font-family lleva reserva local detrás, la letra se sigue leyendo. */
      link.addEventListener('error', listo);
      setTimeout(listo, 5000);
      document.head.appendChild(link);
    }).then(() => esperarCaras(f));
    return pedidas[f.id];
  };

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

  const medir = (f) => {
    const texto = f.mayus ? 'H' : 'x';
    const base = altura(REFERENCIA, texto);
    const mia  = altura(f.css, texto);
    // Sin medida fiable (navegador viejo, fuente aún sin llegar) no se toca nada
    if (!base || !mia) return escalas[f.id] || 1;
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

    cargar(f).then(() => {
      if (leer() !== f.id) return;     // cambió de opinión mientras bajaba
      const e = medir(f);
      guardarEscala(f.id, e);
      root.style.setProperty('--lyrics-font-scale', e.toFixed(3));
      /* El modo edit calcula sus tamaños MIDIENDO el texto. Si midió con la
         fuente de reserva, esa línea se queda mal hasta que cambie sola. */
      if (repintar && window.LyricsModule && window.LyricsModule.repintar) {
        window.LyricsModule.repintar();
      }
    });
  };

  // ---------- Botones ----------
  const pintarActivo = () => {
    if (!picker) return;
    const v = leer();
    picker.querySelectorAll('.font-chip').forEach(b => {
      const on = b.dataset.font === v;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  if (picker) {
    picker.setAttribute('role', 'group');
    CATALOGO.forEach(f => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'font-chip';
      b.dataset.font = f.id;
      /* Cada botón se dibuja en su propia fuente Y con su propio grosor: es
         su mejor muestra, y así se ve que la Nunito es gorda y la Cormorant
         fina sin tener que explicarlo. */
      b.style.fontFamily = f.css;
      b.style.fontWeight = String(f.peso);
      if (f.mayus) b.style.letterSpacing = '0.04em';
      b.textContent = f.nombre;
      picker.appendChild(b);
    });
    pintarActivo();

    picker.addEventListener('click', (e) => {
      const b = e.target.closest('.font-chip');
      if (!b) return;
      try { localStorage.setItem(CLAVE, b.dataset.font); } catch (_) {}
      aplicar(b.dataset.font, true);
      pintarActivo();
      if (window.SevenStatus) window.SevenStatus('▣ letra: ' + porId(b.dataset.font).nombre);
    });

    /* Los botones solo se ven en su fuente si esa fuente está descargada, y son
       diez descargas que nadie ha pedido todavía. Se bajan la primera vez que
       el selector aparece en pantalla — o sea, al abrir config ⚙. */
    const precargar = () => CATALOGO.forEach(cargar);
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver((vistas) => {
        if (!vistas.some(v => v.isIntersecting)) return;
        obs.disconnect();
        precargar();
      });
      obs.observe(picker);
    } else {
      const tab = document.querySelector('.tab[data-tab="settings"]');
      if (tab) tab.addEventListener('click', precargar, { once: true });
    }
  }

  aplicar(leer(), false);

  // Por si otro módulo quiere saber (o cambiar) en qué fuente va la letra
  window.MMFonts = {
    lista: () => CATALOGO.map(f => ({ id: f.id, nombre: f.nombre })),
    actual: leer,
    poner: (id) => {
      if (!CATALOGO.some(f => f.id === id)) return false;
      try { localStorage.setItem(CLAVE, id); } catch (_) {}
      aplicar(id, true);
      pintarActivo();
      return true;
    },
  };
})();
