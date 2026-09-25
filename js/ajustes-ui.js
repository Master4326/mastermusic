/* ==========================================================
   CONFIGURACIÓN · LA CABECERA QUE FALTABA

   El problema que resuelve, con las palabras del usuario: «la gente se
   pierde o no puede volver». Configuración era un rollo de 250 líneas
   sin principio ni fin. Bajabas tres pantallas, ya no veías la barra de
   pestañas (que además se esconde sola en la letra), y no había ni una
   pista de dónde estabas ni de cómo salir.

   Lo que se añade, todo en una cabecera que NO se va con el scroll:

     ◂ volver …  la salida, con el nombre de la pestaña de la que
                 viniste. Lo mismo que Esc y que volver a pulsar ⚙.
     ⌕ buscar    filtra las filas por nombre y por palabras sueltas
                 (data-buscar): «micro» encuentra el micrófono sin
                 saber en qué sección vive.
     índice      una pastilla por sección; se enciende sola con el
                 scroll, así que siempre sabes por dónde vas.
     ?           despliega bajo cada ajuste lo que hace. Esa
                 explicación ya estaba escrita en el `title` de cada
                 control, pero el `title` solo sale al POSAR el ratón:
                 en un teléfono era texto que nadie podía leer.

   Y los [ver ▸]: un ajuste cuyo efecto se ve en otra pestaña ahora te
   lleva hasta allí. Cambiar «ambiente» sin ver la letra era cambiar
   algo a ciegas.

   Este módulo no guarda ni aplica ningún ajuste — de eso va
   js/settings.js. Aquí solo se navega, se busca y se explica.
   ========================================================== */
(() => {
  'use strict';

  const panel = document.getElementById('tab-settings');
  if (!panel) return;

  const cuerpo    = document.getElementById('cfgCuerpo');
  const indice    = document.getElementById('cfgIndice');
  const entrada   = document.getElementById('cfgFiltro');
  const entradaX  = document.getElementById('cfgFiltroX');
  const vacio     = document.getElementById('cfgVacio');
  const btnVolver = document.getElementById('cfgVolver');
  const txtVolver = document.getElementById('cfgVolverTxt');
  const btnAyuda  = document.getElementById('cfgAyuda');

  const secciones = [...panel.querySelectorAll('.settings-block[data-titulo]')];
  const estado = (m) => { if (window.SevenStatus) window.SevenStatus(m); };
  const nav = () => window.MMNav;
  const calma = () => !!(window.MMSettings && window.MMSettings.reduceMotion());

  /* Texto sin tildes y en minúsculas: «micro» tiene que encontrar
     «micrófono», y «tamano» tiene que encontrar «tamaño». */
  const plano = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /* ══════════════════════════════════════════════════════════
     LA SALIDA
     ══════════════════════════════════════════════════════════ */
  const pintarVolver = () => {
    if (!txtVolver || !nav()) return;
    const prev = nav().anterior();
    const donde = prev ? nav().nombre(prev) : '';
    // `hacia` contrae la preposición: «al historial», no «a el historial»
    txtVolver.textContent = prev ? nav().hacia(prev) : '';
    if (btnVolver) {
      /* El `title` lleva el destino entero aunque el botón lo esconda por
         falta de sitio, y el aria-label también: un «volver» a secas no
         dice nada leído en voz alta. */
      const frase = donde ? 'Volver ' + nav().hacia(prev) + ' (Esc)' : 'Volver a donde estabas (Esc)';
      btnVolver.title = frase;
      btnVolver.setAttribute('aria-label', frase);
    }
  };

  if (btnVolver) {
    btnVolver.addEventListener('click', () => {
      if (nav()) nav().volver();
    });
  }

  /* Esc también sale. Con cuidado: hay tres capas que ya se cierran con
     Esc (el buscador de Ctrl+K, la galería de tipografías y el cine), y
     robarles la tecla sería cambiar un problema por otro. */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!nav() || nav().actual() !== 'settings') return;
    if (document.body.classList.contains('paleta-abierta')) return;
    if (document.body.classList.contains('comp-abierta')) return;
    // el cine y el vídeo 9:16 se quedan su Esc (js/vertical.js)
    if (document.body.classList.contains('v916-open')) return;
    /* Por clase y no por id: la galería de tipografías no está en el HTML,
       la cuelga js/fonts.js del <body> al abrirla por primera vez. Un
       getElementById contra un id que no existe en index.html es justo lo
       que caza assets/check-modulos.js — y con razón. */
    const fuentes = document.querySelector('.fuentes');
    if (fuentes && !fuentes.hidden) return;
    // Escribiendo en el buscador de ajustes, Esc borra la búsqueda
    if (document.activeElement === entrada && entrada.value) { limpiarFiltro(); return; }
    nav().volver();
  });

  /* ══════════════════════════════════════════════════════════
     LOS [ver ▸] · el ajuste te lleva a donde se ve
     ══════════════════════════════════════════════════════════ */
  panel.querySelectorAll('.set-ver[data-ver]').forEach(b => {
    const destino = b.dataset.ver;
    b.title = 'Ver el resultado en ' + (nav() ? nav().nombre(destino) : destino);
    b.addEventListener('click', () => {
      if (!nav()) return;
      nav().ir(destino);
      if (destino === 'library' && window.LibraryModule && window.LibraryModule.irA) {
        window.LibraryModule.irA('mine');
      }
      estado('▸ ' + nav().nombre(destino));
    });
  });

  /* ══════════════════════════════════════════════════════════
     ÍNDICE DE SECCIONES
     Se pinta leyendo las secciones: añadir un bloque nuevo al HTML lo
     mete en el índice sin tocar este archivo.
     ══════════════════════════════════════════════════════════ */
  const chips = new Map();   // id de sección -> pastilla

  secciones.forEach(sec => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cfg-chip';
    chip.dataset.destino = sec.id;
    chip.innerHTML = `<span class="cc-ico" aria-hidden="true">${sec.dataset.ico || ''}</span>` +
                     `<span class="cc-txt"></span>`;
    chip.querySelector('.cc-txt').textContent = sec.dataset.titulo;
    chip.addEventListener('click', () => irASeccion(sec));
    indice.appendChild(chip);
    chips.set(sec.id, chip);
  });

  const irASeccion = (sec) => {
    const y = sec.offsetTop - 8;
    cuerpo.scrollTo({ top: Math.max(0, y), behavior: calma() ? 'auto' : 'smooth' });
    marcarChip(sec.id);
    /* El foco va al título: quien navega con teclado o lector de pantalla
       tiene que aterrizar DENTRO de la sección, no seguir en la pastilla. */
    const h = sec.querySelector('h3');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  };

  const marcarChip = (id) => {
    chips.forEach((c, k) => {
      const on = k === id;
      c.classList.toggle('on', on);
      if (on) c.setAttribute('aria-current', 'true');
      else c.removeAttribute('aria-current');
    });
  };

  /* Se enciende sola con el scroll: la sección activa es la última cuyo
     comienzo ya pasó por la línea de los 90 px. */
  let pendiente = false;
  const espiarScroll = () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      const linea = cuerpo.scrollTop + 90;
      let activa = secciones.find(s => s.offsetParent !== null);
      secciones.forEach(s => { if (s.offsetParent !== null && s.offsetTop <= linea) activa = s; });
      // al final del todo manda la última visible, aunque sea cortita
      if (cuerpo.scrollTop + cuerpo.clientHeight >= cuerpo.scrollHeight - 4) {
        const vis = secciones.filter(s => s.offsetParent !== null);
        if (vis.length) activa = vis[vis.length - 1];
      }
      if (activa) marcarChip(activa.id);
    });
  };
  cuerpo.addEventListener('scroll', espiarScroll, { passive: true });

  /* ══════════════════════════════════════════════════════════
     BUSCAR UN AJUSTE
     ══════════════════════════════════════════════════════════ */
  /* Qué se puede esconder de cada sección. Lo que no esté aquí (el h3)
     se esconde con su sección entera. */
  const ITEMS = ':scope > .set-row, :scope > .library-actions, :scope > .keys-grid, :scope > .about-text';

  // Índice de búsqueda, montado una sola vez: el texto de la fila, sus
  // palabras clave (data-buscar) y TODOS los title que lleve dentro.
  const indexar = (el) => {
    const titulos = [...el.querySelectorAll('[title]')].map(n => n.getAttribute('title'));
    if (el.getAttribute('title')) titulos.push(el.getAttribute('title'));
    return plano([el.textContent, el.dataset.buscar || '', titulos.join(' ')].join(' '));
  };

  const fichas = [];
  secciones.forEach(sec => {
    const items = [...sec.querySelectorAll(ITEMS)];
    items.forEach(el => {
      const ficha = { el, sec, texto: indexar(el) };
      el._ficha = ficha;              // sin buscarla después: es la misma
      fichas.push(ficha);
    });
    // la muestra de la letra no se busca: acompaña a su sección
    sec._muestra = sec.querySelector('.font-preview');
    sec._items = items;
    const h3 = sec.querySelector('h3');
    sec._titulo = plano(sec.dataset.titulo + ' ' + (h3 ? h3.textContent : ''));
  });

  const aplicarFiltro = (q) => {
    const busca = plano(q).trim();
    panel.classList.toggle('cfg-filtrando', !!busca);
    if (entradaX) entradaX.hidden = !busca;

    let total = 0;
    secciones.forEach(sec => {
      const seccionEncaja = !!busca && sec._titulo.includes(busca);
      let vivos = 0;
      sec._items.forEach(el => {
        const on = !busca || seccionEncaja || (el._ficha && el._ficha.texto.includes(busca));
        el.hidden = !on;
        if (on) vivos++;
      });
      if (sec._muestra) sec._muestra.hidden = !!busca && !vivos;
      sec.hidden = !!busca && !vivos;
      const chip = chips.get(sec.id);
      if (chip) chip.hidden = sec.hidden;
      total += vivos;
    });

    if (vacio) vacio.hidden = !busca || total > 0;
    cuerpo.scrollTop = 0;
    espiarScroll();
  };

  const limpiarFiltro = () => {
    if (!entrada) return;
    entrada.value = '';
    aplicarFiltro('');
    entrada.focus();
  };

  if (entrada) entrada.addEventListener('input', () => aplicarFiltro(entrada.value));
  if (entradaX) entradaX.addEventListener('click', limpiarFiltro);
  /* Enter en el buscador salta al primer ajuste que quedó: buscar y
     tener que ir a por él con el ratón es media herramienta. */
  if (entrada) entrada.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const primero = fichas.find(f => !f.el.hidden && !f.sec.hidden);
    if (!primero) return;
    const foco = primero.el.querySelector('button, input, [tabindex]');
    if (foco) foco.focus();
    primero.el.classList.add('set-row-late');
    setTimeout(() => primero.el.classList.remove('set-row-late'), 900);
  });

  /* ══════════════════════════════════════════════════════════
     EL «?» · las explicaciones, bajo demanda

     El texto no se inventa aquí: sale del `title` que cada control ya
     tenía. Así no hay dos versiones de lo mismo que se puedan
     contradecir, y el ratón sigue teniendo su globito de siempre.
     ══════════════════════════════════════════════════════════ */
  const CLAVE_AYUDA = 'mm_cfg_ayuda';

  // De dónde sale la explicación de una fila, por orden de preferencia.
  // Los .swatch quedan fuera a propósito: su `title` es el nombre de un
  // color («vino», «ámbar»), no lo que hace la fila.
  const textoAyuda = (fila) => {
    if (fila.dataset.ayuda) return fila.dataset.ayuda;
    const cand = fila.querySelector('.seg[title], .set-label[title], .font-abrir[title], .retro-btn[title]');
    return cand ? cand.getAttribute('title') : '';
  };

  let ayudaMontada = false;
  const montarAyuda = () => {
    if (ayudaMontada) return;
    ayudaMontada = true;
    panel.querySelectorAll('.set-row').forEach(fila => {
      const txt = textoAyuda(fila);
      if (!txt) return;
      const p = document.createElement('p');
      p.className = 'set-ayuda';
      p.textContent = txt;
      fila.appendChild(p);
    });
    /* Los dos botones grandes de «música» no viven en una .set-row, pero
       son los que más falta hacía explicar: cada uno se lleva la suya.
       Van en un fragmento y se insertan de una vez — metiéndolas de una
       en una con `afterend` salían al revés que los botones. */
    panel.querySelectorAll('.library-actions').forEach(caja => {
      const trozo = document.createDocumentFragment();
      caja.querySelectorAll('button[title]').forEach(b => {
        const p = document.createElement('p');
        p.className = 'set-ayuda set-ayuda-suelta';
        p.textContent = b.textContent.replace(/[\[\]]/g, '').trim() + ' — ' + b.getAttribute('title');
        trozo.appendChild(p);
      });
      if (trozo.childNodes.length) caja.after(trozo);
    });
  };

  const ponerAyuda = (on, avisar) => {
    if (on) montarAyuda();
    panel.classList.toggle('cfg-con-ayuda', on);
    if (btnAyuda) btnAyuda.setAttribute('aria-pressed', on ? 'true' : 'false');
    try { localStorage.setItem(CLAVE_AYUDA, on ? 'on' : 'off'); } catch (_) {}
    if (avisar) estado(on ? '? explicaciones a la vista' : '? explicaciones escondidas');
  };

  if (btnAyuda) {
    btnAyuda.addEventListener('click', () => {
      ponerAyuda(!panel.classList.contains('cfg-con-ayuda'), true);
    });
  }
  let ayudaGuardada = 'off';
  try { ayudaGuardada = localStorage.getItem(CLAVE_AYUDA) || 'off'; } catch (_) {}
  if (ayudaGuardada === 'on') ponerAyuda(true, false);

  /* ══════════════════════════════════════════════════════════
     AL ENTRAR Y AL SALIR
     ══════════════════════════════════════════════════════════ */
  document.addEventListener('mm:tab', (e) => {
    const d = e.detail || {};
    if (d.tab === 'settings') {
      pintarVolver();
      espiarScroll();
    } else if (d.desde === 'settings' && entrada && entrada.value) {
      // se vuelve limpio: una búsqueda vieja escondiendo media pantalla
      // es justo la clase de trampa que hacía que esto no se entendiera
      entrada.value = '';
      aplicarFiltro('');
    }
  });

  pintarVolver();
  marcarChip(secciones.length ? secciones[0].id : '');

  /* Otros módulos pueden mandar a un ajuste concreto: MMAjustes.abrir()
     lleva a configuración, y con una sección la deja delante. */
  window.MMAjustes = {
    abrir: (seccion) => {
      if (nav()) nav().ir('settings');
      const sec = seccion && document.getElementById('cfg-' + seccion);
      if (sec) irASeccion(sec);
    },
    buscar: (q) => {
      if (nav()) nav().ir('settings');
      if (!entrada) return;
      entrada.value = q || '';
      aplicarFiltro(entrada.value);
      entrada.focus();
    },
  };
})();
