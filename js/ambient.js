/* ==========================================================
   Ambiente reactivo — el panel de la letra bailando con la música.
   Aquí NO se detecta nada: todo sale de js/beat.js, que es el que
   escucha (bombo, caja, platillos, tempo, energía y drops). Este
   módulo solo decide cómo se ve cada cosa.

   Las dos ideas que lo cambian todo respecto a la versión anterior:
   · Cada golpe llega con FUERZA. Antes todos valían 1 y por eso todo
     parpadeaba igual de fuerte todo el rato, que es justo lo que hace
     que algo NO se sienta frenético: sin contraste no hay golpe.
   · Los agudos existen. Los platillos y los charles pintan BRILLOS,
     que es la mitad del nervio de cualquier tema movido.
   ========================================================== */
(() => {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const capa = document.getElementById('ambient');
  const focos = capa ? [...capa.querySelectorAll('.amb-blob')] : [];

  /* ---------- Capas del panel de la letra ---------- */
  const laCover = document.getElementById('laCover');
  const laMarco = document.getElementById('laMarco');
  const laSuelo = document.getElementById('laSuelo');
  const laCircular = document.getElementById('laCircular');
  const laEstrobo = document.getElementById('laEstrobo');
  const laEq = document.getElementById('laEq');
  const laOndas = document.getElementById('laOndas');
  const laSaltarinas = document.getElementById('laSaltarinas');
  const laDestellos = document.getElementById('laDestellos');
  const laAmbiente = document.getElementById('lyricsAmbient');
  const tabLyrics = document.getElementById('tab-lyrics');
  const coverArt = document.getElementById('coverArt');
  const lyricsEdit = document.getElementById('lyricsEdit');
  const lyricsBody = document.getElementById('lyricsBody');

  if (!focos.length && !laAmbiente) return;

  const GLIFOS = ['♪', '♫', '♩', '♬', '✦', '✧', '·'];
  const previo = ['', '', ''];
  let raf = null;

  /* Cuántos elementos vivos, según el aparato (ver js/perf.js). En un
     teléfono estos tres corros sumaban 84 escrituras de estilo por frame
     a 60 fps: 5.040 por segundo solo para el fondo de la letra. */
  const P = () => window.MMPerf;
  const cuantos = (n) => (P() ? P().cuantos(n) : n);
  const enMovil = () => !!(P() && P().movil());

  /* Memo colgado del PROPIO elemento. Ojo: no vale un diccionario con
     clave `id + prop` — estas barras son <i> sin id y compartirían
     entrada, que es el fallo que ya cazamos en ncs.js. */
  const escribir = (el, prop, valor) => {
    if (!el) return;
    const k = '_mm_' + prop;
    if (el[k] === valor) return;
    el[k] = valor;
    el.style[prop] = valor;
  };

  /* ---------- Ecualizador circular alrededor de la letra ---------- */
  const NCIRC = cuantos(28);
  const circulares = [];
  if (laCircular) {
    for (let k = 0; k < NCIRC; k++) circulares.push(laCircular.appendChild(document.createElement('i')));
  }

  /* ---------- Ecualizador fantasma del borde inferior ---------- */
  const NBARRAS = cuantos(22);
  const barras = [];
  const alturas = new Array(NBARRAS).fill(0);
  if (laEq) {
    for (let k = 0; k < NBARRAS; k++) barras.push(laEq.appendChild(document.createElement('i')));
  }

  // la carátula del panel copia la de la portada; se comprueba de vez en
  // cuando porque cambiar de canción no dispara ningún evento aquí
  let portadaActual = '';
  let cuentaPortada = 0;
  const revisarPortada = () => {
    if (!laCover || !coverArt) return;
    const img = coverArt.style.backgroundImage || '';
    if (img === portadaActual) return;
    portadaActual = img;
    laCover.style.backgroundImage = img;
    laCover.style.opacity = img ? '' : '0';
  };

  /* ==========================================================
     BRILLOS — lo que pinta un platillo o un charles
     Estrellitas cortas que aparecen y se van en menos de medio
     segundo. Van en un POOL de elementos fijos que se reciclan: a
     8 charles por segundo, crear y destruir nodos sin parar deja
     basura que el navegador acaba recogiendo con un tirón, justo lo
     que no queremos en algo que va a 60 fps.
     ========================================================== */
  const NDEST = cuantos(34);
  const destellos = [];
  if (laDestellos) {
    for (let k = 0; k < NDEST; k++) {
      const el = document.createElement('i');
      el.style.opacity = '0';
      laDestellos.appendChild(el);
      destellos.push({ el, hasta: 0 });
    }
  }
  let ultimoBrillo = 0;

  const brillar = (fuerza, energia, ahora) => {
    if (!destellos.length) return;
    // un puñado, no una estrella: 1 con un charles flojo, hasta 4 en un plato
    const cuantas = Math.max(1, Math.round((0.5 + fuerza * 2.4) * (0.5 + energia * 0.9)));
    let puestas = 0;
    for (let k = 0; k < destellos.length && puestas < cuantas; k++) {
      const d = destellos[k];
      if (d.hasta > ahora) continue;
      const el = d.el;
      const dur = 240 + Math.random() * 230 - fuerza * 60;
      d.hasta = ahora + dur + 30;
      puestas++;

      const tam = (6 + Math.random() * 11 + fuerza * 8);
      el.style.setProperty('--d', tam.toFixed(0) + 'px');
      el.style.left = (Math.random() * 96).toFixed(1) + '%';
      // sesgo hacia arriba: abajo está el ecualizador y estorba
      el.style.top = (Math.random() * 74).toFixed(1) + '%';
      if (!el.animate) { el.style.opacity = '0'; continue; }
      el.animate([
        { transform: 'scale(0) rotate(0deg)', opacity: 0 },
        { transform: `scale(1) rotate(${(Math.random() * 60 - 30).toFixed(0)}deg)`,
          opacity: clamp(0.3 + fuerza * 0.38, 0, 1), offset: 0.28 },
        { transform: `scale(0.15) rotate(${(Math.random() * 90 - 45).toFixed(0)}deg)`, opacity: 0 },
      ], { duration: dur, fill: 'forwards', easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' });
    }
  };

  /* ==========================================================
     NOTAS SALTARINAS — brincan con el bombo y caen
     ========================================================== */
  let ultimoSalto = 0;
  const saltar = (fuerza, energia, ahora) => {
    if (!laSaltarinas) return;
    if (ahora - ultimoSalto < 110) return;
    // los golpes flojos no mueven a nadie; los gordos sacan a todo el mundo
    if (Math.random() > 0.2 + energia * 0.45 + fuerza * 0.4) return;
    /* El aforo se recorta en el móvil. El usuario las pidió expresamente
       «a puñados, frenéticas» (y así siguen en el PC), pero cada una es un
       nodo que se crea, se anima y se destruye: a 7 por segundo es justo
       el tipo de basura que el teléfono acaba recogiendo con un tirón. */
    const aforo = cuantos(12 + Math.round(energia * 28));
    if (laSaltarinas.children.length >= aforo) return;
    ultimoSalto = ahora;

    const alto = laSaltarinas.clientHeight || 260;
    const base = (1.5 + energia * 4 + fuerza * 2.5) * (enMovil() ? 0.5 : 1);
    const cuantas = Math.max(1, Math.min(aforo - laSaltarinas.children.length,
      Math.round(base * (0.6 + Math.random() * 0.8))));
    for (let k = 0; k < cuantas; k++) {
      const g = document.createElement('i');
      g.textContent = GLIFOS[(Math.random() * GLIFOS.length) | 0];
      g.style.left = (8 + Math.random() * 82).toFixed(1) + '%';
      g.style.fontSize = (14 + Math.random() * 12).toFixed(0) + 'px';
      laSaltarinas.appendChild(g);
      if (!g.animate) { g.remove(); continue; }

      // la altura del brinco la manda el golpe: un bombo flojo apenas
      // los levanta, un drop los manda arriba del todo
      const subida = alto * (0.22 + energia * 0.2 + fuerza * 0.25 + Math.random() * 0.12);
      const deriva = (Math.random() * 2 - 1) * 46;
      const giro = (Math.random() * 2 - 1) * 40;
      const dur = 1500 - energia * 450 + Math.random() * 260;

      /* Para que parezca gravedad y no un ascensor: curvas POR TRAMO.
         Sube frenando (ease-out), cae acelerando (ease-in), apogeo a
         mitad de camino. */
      const anim = g.animate([
        { transform: 'translate(0, 0) rotate(0deg) scale(0.7)', opacity: 0,
          easing: 'cubic-bezier(0.12, 0.7, 0.3, 1)' },
        { transform: `translate(${(deriva * 0.45).toFixed(1)}px, ${-subida.toFixed(0)}px) rotate(${(giro * 0.5).toFixed(0)}deg) scale(1.08)`,
          opacity: 0.85, offset: 0.44,
          easing: 'cubic-bezier(0.45, 0.02, 0.75, 0.5)' },
        { transform: `translate(${deriva.toFixed(1)}px, 0) rotate(${giro.toFixed(0)}deg) scale(1)`,
          opacity: 0.7, offset: 0.9, easing: 'ease-out' },
        { transform: `translate(${deriva.toFixed(1)}px, 0) rotate(${giro.toFixed(0)}deg) scale(1.2, 0.8)`,
          opacity: 0 },
      ], { duration: dur, delay: Math.random() * 90, fill: 'forwards' });

      const quitar = () => g.remove();
      if (anim.finished && anim.finished.then) anim.finished.then(quitar, quitar);
      else setTimeout(quitar, dur + 160);
    }
  };

  /* ---------- Onda de choque: una por bombo, del tamaño del golpe ---------- */
  const onda = (fuerza, tipo) => {
    if (!laOndas || laOndas.children.length > 4) return;
    const o = document.createElement('span');
    o.className = 'la-onda' + (tipo ? ' ' + tipo : '');
    o.style.setProperty('--esc', (2.2 + fuerza * 3.2).toFixed(2));
    o.style.setProperty('--op', (0.11 + fuerza * 0.26).toFixed(2));
    o.style.setProperty('--gr', (1 + fuerza * 1.7).toFixed(1) + 'px');
    o.style.setProperty('--dur', (1.35 - fuerza * 0.45).toFixed(2) + 's');
    laOndas.appendChild(o);
    o.addEventListener('animationend', () => o.remove());
  };

  /* ---------- Chispas: notas que suben, disparadas por el golpe ---------- */
  const chispas = (n, energia) => {
    if (!laAmbiente) return;
    if (laAmbiente.querySelectorAll('.la-note').length > 26) return;
    for (let k = 0; k < n; k++) {
      const s = document.createElement('span');
      s.className = 'la-note';
      /* El glifo va dentro de un <i>: la subida ya ocupa el transform del
         .la-note, así que el rebote del bombo necesita su propia capa. */
      const g = document.createElement('i');
      g.textContent = GLIFOS[(Math.random() * GLIFOS.length) | 0];
      s.appendChild(g);
      const zona = Math.random();
      const x = zona < 0.42 ? 2 + Math.random() * 18
        : zona < 0.84 ? 78 + Math.random() * 19
        : 22 + Math.random() * 56;
      s.style.setProperty('--nx', x.toFixed(1) + '%');
      s.style.setProperty('--nfs', (12 + Math.random() * 16).toFixed(0) + 'px');
      s.style.setProperty('--ndur', (2.2 + (1 - energia) * 5).toFixed(1) + 's');
      s.style.setProperty('--nh', ((laAmbiente.clientHeight || 300) + 50) + 'px');
      s.style.setProperty('--ndx', (Math.random() * 70 - 35).toFixed(0) + 'px');
      s.style.setProperty('--nrot', (Math.random() * 60 - 30).toFixed(0) + 'deg');
      s.style.setProperty('--nop', (0.2 + energia * 0.4).toFixed(2));
      laAmbiente.appendChild(s);
      s.addEventListener('animationend', () => s.remove());
    }
  };

  /* ---------- El golpetazo del drop ---------- */
  let finGolpetazo = 0;
  const golpetazo = (ahora, energia) => {
    if (!laAmbiente) return;
    laAmbiente.classList.add('golpetazo');
    finGolpetazo = ahora + 520;
    onda(0.85, 'fuerte');
    setTimeout(() => onda(0.6, 'fuerte'), 110);
    chispas(4 + Math.round(energia * 5), energia);
  };

  const panelVisible = () => tabLyrics && tabLyrics.classList.contains('active');

  const apagarPanel = () => {
    [laMarco, laEstrobo, laCover, laSuelo, laCircular].forEach((el) => {
      if (el) el.style.opacity = '0';
    });
    barras.forEach((b) => { b.style.transform = 'scaleY(0.03)'; });
    destellos.forEach((d) => { d.hasta = 0; d.el.style.opacity = '0'; });
    if (lyricsEdit) lyricsEdit.style.transform = '';
    if (lyricsBody) lyricsBody.style.transform = '';
  };

  /* ---------- Pintado del panel ---------- */
  let desplazSuelo = 0, pulsoPrev = -1, ladoMeneo = 1;

  const pintarPanel = (m) => {
    if (!panelVisible()) return;
    if (++cuentaPortada % 30 === 0) revisarPortada();

    const e = m.energia;
    const graves = m.graves;
    const boom = m.boom * m.boomFuerza;      // envolvente YA pesada por la fuerza
    const bri = m.brillo * m.brilloFuerza;

    /* Rebote de las notas flotantes. Se escriben DOS variables en el
       contenedor y las heredan todas: una sola escritura por frame en vez
       de una por nota. */
    if (laAmbiente) {
      const pulso = 1 + boom * 0.4 + graves * 0.18 + bri * 0.08;
      if (Math.abs(pulso - pulsoPrev) > 0.004) {
        laAmbiente.style.setProperty('--pulso', pulso.toFixed(3));
        laAmbiente.style.setProperty('--meneo', (boom * 10 * ladoMeneo).toFixed(2) + 'deg');
        pulsoPrev = pulso;
      }
    }

    // marco de luz: presencia en el borde + latido del golpe
    if (laMarco) {
      escribir(laMarco, 'opacity', (0.04 + e * 0.12 + graves * 0.15 + boom * 0.17).toFixed(2));
    }
    /* Destello: cuadrático a propósito, así solo se ve en el pico del
       golpe y no como una niebla permanente encima de la letra.
       El tope está BAJO adrede — el usuario pidió bajar el brillo: lo que
       tiene que notarse es la diferencia entre un toque y un drop, no lo
       fuerte que da el fogonazo. */
    if (laEstrobo) {
      escribir(laEstrobo, 'opacity', (boom * boom * 0.17 * (0.4 + e) + m.caja * m.cajaFuerza * 0.03).toFixed(2));
    }

    /* Respiración del contenido. Sigue siendo sutil (≤3.5%) porque más que
       eso descoloca la lectura, pero ahora el tamaño lo pone el golpe.
       El `anticipo` es el truco fino: en el último suspiro antes del bombo
       previsto el texto se encoge un pelo, y por contraste el golpe se
       siente el doble. Solo cuando el tempo es fiable. */
    /* En el móvil NO se respira. Escalar #lyricsEdit y #lyricsBody obliga a
       RE-RASTERIZAR toda la letra —tipografía gigante con sombras— en cada
       frame, y ese 1,5 % que casi no se ve es de lo más caro que hacía la
       app en un teléfono. En PC se queda tal cual. */
    if (!enMovil()) {
      const resp = 1 + (graves * 0.005 + boom * 0.015) * (0.4 + e) - m.anticipo * 0.0035;
      const t = `scale(${resp.toFixed(4)})`;
      escribir(lyricsEdit, 'transform', t);
      escribir(lyricsBody, 'transform', t);
    }

    // suelo synthwave: corre más rápido cuanto más movida va la canción
    if (laSuelo) {
      /* El desplazamiento repinta el degradado entero en cada frame. En el
         móvil el suelo se queda quieto: sigue estando (da el aire
         synthwave) pero sin repintarse. */
      if (!enMovil()) {
        desplazSuelo = (desplazSuelo + 0.6 + e * 3.4 + boom * 3.5) % 30;
        laSuelo.style.backgroundPosition = `0 0, 0 ${desplazSuelo.toFixed(1)}px`;
      }
      escribir(laSuelo, 'opacity', (Math.max(0, e - 0.28) * 0.4 + boom * 0.06).toFixed(2));
    }

    // ecualizador circular: envuelve la letra sin taparla
    if (laCircular) {
      escribir(laCircular, 'opacity', (Math.max(0, e - 0.22) * 0.45 + bri * 0.09).toFixed(2));
      for (let k = 0; k < NCIRC; k++) {
        const b = bandaDe(m, Math.abs(NCIRC / 2 - k) / (NCIRC / 2));
        const ang = (k / NCIRC) * 360;
        /* Dos decimales en la escala: a simple vista es lo mismo y el memo
           se salta la mayoría de las escrituras (una barra quieta no
           cambia de valor). */
        escribir(circulares[k], 'transform',
          `rotate(${ang.toFixed(1)}deg) translateY(-150%) scaleY(${(0.25 + b * 1.5).toFixed(2)})`);
      }
    }
    /* Carátula de fondo: lleva blur(42px). Cambiarle el `scale` en cada
       frame obliga al navegador a rehacer el desenfoque de una imagen
       grande — carísimo en un teléfono, y allí no se hace.
       La OPACIDAD sí se escribe siempre: una capa ya desenfocada cambia de
       opacidad en el compositor, sin volver a rasterizar nada, o sea que
       es barata. Y es imprescindible: `.la-cover` nace con `opacity: 0`
       en el CSS, así que saltarse esta línea dejaba el fondo invisible —
       fue justo lo que rompió la v65 en el móvil. */
    if (laCover && portadaActual) {
      if (!enMovil()) {
        escribir(laCover, 'transform', `scale(${(1.08 + graves * 0.1 + boom * 0.03).toFixed(3)})`);
      }
      // en móvil, algo más de presencia: sin el zoom que la hace respirar
      // se queda plana y con 0.1 apenas se distingue del fondo
      escribir(laCover, 'opacity', ((enMovil() ? 0.17 : 0.1) + graves * 0.1).toFixed(2));
    }
    // ecualizador fantasma: una barra por banda, solo scaleY
    if (barras.length) {
      for (let k = 0; k < NBARRAS; k++) {
        const v = bandaDe(m, k / (NBARRAS - 1));
        alturas[k] += (v - alturas[k]) * (v > alturas[k] ? 0.5 : 0.12);
        escribir(barras[k], 'transform', `scaleY(${(0.03 + alturas[k] * 0.97).toFixed(2)})`);
      }
    }
  };

  /* Nivel en la posición x (0 = graves, 1 = agudos) interpolando las seis
     bandas del detector. Antes esto salía de getBands(), que es el espectro
     de dibujo (suavizado y en escala rara); esto es el mismo reparto que
     usa el detector, así que lo que se ve coincide con lo que se oye. */
  const ORDEN = ['sub', 'bombo', 'bajo', 'medio', 'presencia', 'brillo'];
  const bandaDe = (m, x) => {
    const p = clamp(x, 0, 1) * (ORDEN.length - 1);
    const i = Math.floor(p), f = p - i;
    const a = m.bandas[ORDEN[i]] || 0;
    const b = m.bandas[ORDEN[Math.min(ORDEN.length - 1, i + 1)]] || 0;
    return a + (b - a) * f;
  };

  const pintar = (el, k, escala, opacidad) => {
    if (!el) return;                    // puede no haber focos de fondo
    const t = `translate3d(0,0,0) scale(${escala.toFixed(3)})`;
    const o = opacidad.toFixed(3);
    // escribir solo si cambió de verdad: evita trabajo de estilo por frame
    const firma = t + '|' + o;
    if (previo[k] === firma) return;
    previo[k] = firma;
    el.style.transform = t;
    el.style.opacity = o;
  };

  const apagar = () => { focos.forEach((f, k) => pintar(f, k, 1, 0)); };

  /* ---------- Bucle ---------- */
  /* En el móvil pinta a 30 fps. Se sigue pidiendo el frame (así el ritmo lo
     marca el navegador y no un temporizador que se desincroniza), pero uno
     de cada dos se salta: la mitad de trabajo y en luces de fondo no se
     distingue. Los GOLPES no se pierden — beat.js los detecta en su propio
     bucle y lo que aquí llega es la envolvente ya calculada. */
  const relojPintado = { ultimo: 0 };

  const bucle = () => {
    raf = requestAnimationFrame(bucle);
    if (document.hidden) return;
    if (window.MMPerf && window.MMPerf.salta(relojPintado, performance.now())) return;

    // el ajuste de movimiento manda: si el usuario (o su sistema) pide
    // menos movimiento, las luces se quedan quietas
    if (window.MMSettings && window.MMSettings.reduceMotion()) { apagar(); apagarPanel(); return; }

    const M = window.BeatModule;
    const m = M && M.get ? M.get() : null;
    if (!m) { apagar(); apagarPanel(); return; }

    const ahora = Date.now();

    if (m.fuente === 'silencio' && m.nivel < 0.005 && m.boom < 0.01) {
      apagar(); apagarPanel(); return;
    }

    // recicla los destellos cuyo turno ya pasó
    for (let k = 0; k < destellos.length; k++) {
      const d = destellos[k];
      if (d.hasta && d.hasta <= ahora) { d.hasta = 0; d.el.style.opacity = '0'; }
    }
    if (finGolpetazo && ahora > finGolpetazo && laAmbiente) {
      laAmbiente.classList.remove('golpetazo');
      finGolpetazo = 0;
    }

    /* ---- lo que dispara cada golpe, una vez por golpe ---- */
    const visible = panelVisible();
    if (m.boomAhora) {
      ladoMeneo = -ladoMeneo;
      if (visible) {
        if (m.boomFuerza > 0.22) onda(m.boomFuerza);
        saltar(m.boomFuerza, m.energia, ahora);
        chispas(Math.round(m.boomFuerza * (0.6 + m.energia * 2)), m.energia);
      }
    }
    if (m.drop && visible) golpetazo(ahora, m.energia);
    if (m.brilloAhora && visible && ahora - ultimoBrillo > 40) {
      ultimoBrillo = ahora;
      brillar(m.brilloFuerza, m.energia, ahora);
    }
    // la caja también pinta, pero en el centro y más plana que el bombo
    if (m.cajaAhora && visible && m.cajaFuerza > 0.35) brillar(m.cajaFuerza * 0.6, m.energia, ahora);

    /* ---- focos del fondo de la app ---- */
    pintar(focos[0], 0, 1 + m.graves * 0.38 + m.boom * m.boomFuerza * 0.1, 0.1 + m.graves * 0.48);
    pintar(focos[1], 1, 1 + m.medios * 0.3, 0.08 + m.medios * 0.38);
    pintar(focos[2], 2, 1 + m.agudos * 0.25 + m.brillo * 0.06, 0.06 + m.agudos * 0.32);

    pintarPanel(m);
  };

  const arrancar = () => { if (!raf) bucle(); };
  const parar = () => { if (raf) { cancelAnimationFrame(raf); raf = null; } apagar(); };

  // en segundo plano no gastamos frames
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) parar(); else arrancar();
  });

  arrancar();

  window.AmbientModule = { arrancar, parar };
})();
