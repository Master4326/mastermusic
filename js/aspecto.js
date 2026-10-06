/* ==========================================================
   ASPECTO · la cara de toda la app (config ⚙ → apariencia → aspecto)

   «8 bits» es la de siempre y la de fábrica. Los otros tres —cristal,
   estudio, noche— viven en css/aspectos.css, que SOLO se descarga si eliges
   uno: quien se queda en 8 bits no paga ni un byte más al abrir.

   Al ABRIR la app manda el guion pequeño del <head> de index.html: pone
   `data-aspecto` y la clase `moderno` en <html> y pide el CSS antes de
   pintar. Este módulo es lo de DESPUÉS: cambiar de aspecto en vivo desde
   ajustes (sin recargar y sin enseñar una mezcla de los dos: primero llega
   el CSS, luego se cambia), su tipografía, el color de la barra del
   sistema y la carátula de fondo de «cristal».

   La preferencia (`mm_aspecto`) la guarda js/settings.js, como todas las
   de ajustes; aquí solo se aplica.
   ========================================================== */
(() => {
  'use strict';

  const LISTA = ['8bits', 'cristal', 'estudio', 'noche', 'hifi', 'vinilo', 'aero', 'manga', 'revista'];
  /* La base común de los modernos (css/aspectos.css) y, para los cinco
     «mundos» (hifi, vinilo, aero, manga, revista), su hoja propia: cada
     uno pesa lo suyo y solo lo paga quien lo elige. Las rutas y las
     tipografías vienen del guion del <head> (index.html), que es quien
     abre la app con ellas; aquí solo se repiten por si faltara. */
  const BASE = window.MMAspectoBase || {
    css: 'css/aspectos.css',
    propias: {
      hifi: 'css/aspecto-hifi.css',
      vinilo: 'css/aspecto-vinilo.css',
      aero: 'css/aspecto-aero.css',
      manga: 'css/aspecto-manga.css',
      revista: 'css/aspecto-revista.css',
    },
    fuentes: {
      estudio: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400..700&display=swap',
      noche: 'https://fonts.googleapis.com/css2?family=Figtree:wght@400..800&display=swap',
      hifi: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&display=swap',
      vinilo: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,700;1,800&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&display=swap',
      aero: 'https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700&display=swap',
      manga: 'https://fonts.googleapis.com/css2?family=Bangers&family=M+PLUS+Rounded+1c:wght@500;700;800&display=swap',
      revista: 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap',
    },
  };
  /* El color de la barra del sistema (móvil, ventana instalada). En 8 bits
     lo lleva js/seven.js, que lo saca de la carátula y lo deja apuntado en
     data-ocho-bits aunque haya un aspecto puesto: al volver se repone ese.
     En los claros va claro: el sistema pone sus iconos oscuros encima. */
  const BARRA = {
    cristal: '#0b0b0f', estudio: '#000000', noche: '#060607',
    hifi: '#2c2e33', vinilo: '#efe6d4', aero: '#a6dbf6', manga: '#fdfcf8', revista: '#f4f2ed',
  };

  const root = document.documentElement;
  let pedido = 0;   // solo el último cambio puede aplicarse

  const actual = () => {
    const a = root.getAttribute('data-aspecto');
    return LISTA.includes(a) ? a : '8bits';
  };

  // Una hoja de los aspectos: si el <head> no la pidió (se abrió con otro),
  // se pide ahora. Se espera a que llegue para no pintar una mezcla.
  const hojaLista = (id, href) => new Promise((listo) => {
    let l = document.getElementById(id);
    if (l && l.sheet) { listo(true); return; }
    if (!l) {
      l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.id = id;
      document.head.appendChild(l);
    }
    l.addEventListener('load', () => listo(true), { once: true });
    l.addEventListener('error', () => listo(false), { once: true });
    // sin red y sin caché el aspecto no puede llegar: no se espera para siempre
    setTimeout(() => listo(!!l.sheet), 4000);
  });
  /* La base común y, si el aspecto la tiene, su hoja propia, las dos a la
     vez. La propia se engancha DESPUÉS de la base (manda en los empates) y
     se queda puesta al cambiar a otro: todas sus reglas dependen de su
     data-aspecto, así que una hoja cargada que no toca no pinta nada. */
  const cssListo = (a) => {
    const base = hojaLista('aspectoCss', BASE.css);
    const propia = BASE.propias && BASE.propias[a] ? hojaLista('aspectoCss-' + a, BASE.propias[a]) : Promise.resolve(true);
    return Promise.all([base, propia]).then(([b, p]) => b && p);
  };

  const ponerFuente = (a) => {
    const url = BASE.fuentes[a];
    let f = document.getElementById('aspectoFuente');
    if (!url) return;
    if (f && f.href === url) return;
    if (!f) {
      f = document.createElement('link');
      f.rel = 'stylesheet';
      f.id = 'aspectoFuente';
      document.head.appendChild(f);
    }
    f.href = url;
  };

  const ponerBarra = (a) => {
    const m = document.querySelector('meta[name="theme-color"]');
    if (!m) return;
    if (BARRA[a]) {
      // lo que tenía el 8 bits se guarda (si seven.js no lo apuntó ya)
      if (!m.dataset.ochoBits) m.dataset.ochoBits = m.getAttribute('content') || '#0a0e2e';
      m.setAttribute('content', BARRA[a]);
    } else if (m.dataset.ochoBits) {
      m.setAttribute('content', m.dataset.ochoBits);
    }
  };

  // Lo que se mide con JS (el espectro, la marquesina del título, el modo
  // edit) se vuelve a medir: las fuentes y los márgenes acaban de cambiar.
  const remedir = () => {
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };

  const poner = async (a) => {
    if (!LISTA.includes(a)) a = '8bits';
    const mio = ++pedido;
    if (a === '8bits') {
      root.removeAttribute('data-aspecto');
      root.classList.remove('moderno');
      ponerBarra(a);
      remedir();
      avisar(a);
      return true;
    }
    ponerFuente(a);
    const ok = await cssListo(a);
    if (mio !== pedido) return false;        // llegó otro cambio mientras tanto
    if (!ok) return false;                   // sin el CSS, mejor quedarse como está
    root.setAttribute('data-aspecto', a);
    root.classList.add('moderno');
    ponerBarra(a);
    pintarPortada();
    remedir();
    avisar(a);
    // con la tipografía ya bajada se vuelve a medir (la marquesina, el edit)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remedir);
    return true;
  };

  const avisar = (a) => {
    try { document.dispatchEvent(new CustomEvent('mm:aspecto', { detail: { aspecto: a } })); } catch (e) {}
  };

  /* ---------- La carátula de fondo de «cristal» ----------
     css/aspectos.css la pinta difuminada a pantalla entera desde --portada.
     Cambiar de canción no avisa con ningún evento: se mira el estilo de la
     portada de la izquierda, que es la que todos actualizan (el mismo truco
     que js/ambient.js con la del panel de la letra). */
  const coverArt = document.getElementById('coverArt');
  let portadaPuesta = null;
  const pintarPortada = () => {
    if (!coverArt) return;
    const img = coverArt.style.backgroundImage || '';
    if (img === portadaPuesta) return;
    portadaPuesta = img;
    if (img && img !== 'none') root.style.setProperty('--portada', img);
    else root.style.removeProperty('--portada');
  };
  if (coverArt && 'MutationObserver' in window) {
    new MutationObserver(pintarPortada).observe(coverArt, { attributes: true, attributeFilter: ['style'] });
  }
  pintarPortada();

  /* ---------- Los títulos de ajustes ----------
     Llevan sus tildes de adorno en el propio texto («~ música ~»), que en
     8 bits son parte del dibujo. En los aspectos modernos sobran: se meten
     en un <span> para que el CSS pueda esconderlas. El texto que lee un
     lector de pantalla no cambia. */
  document.querySelectorAll('.settings-block h3').forEach((h) => {
    if (h.querySelector('.h3-tilde')) return;
    const t = h.textContent;
    const m = t.match(/^(\s*~\s*)(.*?)(\s*~\s*)$/);
    if (!m) return;
    h.textContent = '';
    const a = document.createElement('span');
    a.className = 'h3-tilde';
    a.textContent = m[1];
    const b = document.createElement('span');
    b.className = 'h3-tilde';
    b.textContent = m[3];
    h.append(a, m[2], b);
  });

  /* ---------- Los «▒» de los mensajes ----------
     «▒ nada en este periodo ▒», «▒ conecta spotify… ▒»: en 8 bits son el
     marco del mensaje; en los aspectos modernos parecen un fallo. Van en el
     propio texto (los escriben una docena de sitios), así que se meten en
     un <span class="adorno-8bits"> que el CSS moderno esconde y el 8 bits
     enseña igual que antes. Solo se vigilan las listas donde salen —no la
     página entera, que con la letra animándose cambia sin parar— y solo
     cuando les cambia el contenido. */
  const ADORNO = /\s*▒+\s*/g;
  const envolver = (raiz) => {
    if (!raiz) return;
    const andador = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const nodos = [];
    while (andador.nextNode()) {
      const n = andador.currentNode;
      if (n.nodeValue.includes('▒') && !(n.parentElement && n.parentElement.classList.contains('adorno-8bits'))) nodos.push(n);
    }
    nodos.forEach((n) => {
      const frag = document.createDocumentFragment();
      let desde = 0;
      n.nodeValue.replace(ADORNO, (m, pos) => {
        if (pos > desde) frag.append(n.nodeValue.slice(desde, pos));
        const s = document.createElement('span');
        s.className = 'adorno-8bits';
        s.textContent = m;
        frag.append(s);
        desde = pos + m.length;
        return m;
      });
      if (desde < n.nodeValue.length) frag.append(n.nodeValue.slice(desde));
      n.replaceWith(frag);
    });
  };
  const vigilar = (el) => {
    if (!el || el.dataset.adornoVigilado) return;
    el.dataset.adornoVigilado = '1';
    envolver(el);
    if ('MutationObserver' in window) new MutationObserver(() => envolver(el)).observe(el, { childList: true, subtree: true });
  };
  ['searchHint', 'libHint', 'cfgVacio', 'spotifyResults', 'libList', 'queueList', 'statsBody']
    .forEach((id) => vigilar(document.getElementById(id)));
  vigilar(document.querySelector('.drop-card'));
  // el buscador (Ctrl+K) se monta la primera vez que se abre
  vigilar(document.querySelector('.paleta'));
  if ('MutationObserver' in window && !document.querySelector('.paleta')) {
    const espera = new MutationObserver(() => {
      const p = document.querySelector('body > .paleta');
      if (p) { vigilar(p); espera.disconnect(); }
    });
    espera.observe(document.body, { childList: true });
  }

  // en 8 bits la barra ya es cosa de seven.js: aquí solo si hay aspecto
  if (actual() !== '8bits') ponerBarra(actual());

  window.MMAspecto = { poner, actual, lista: () => LISTA.slice() };
})();
