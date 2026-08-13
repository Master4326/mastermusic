/* ==========================================================
   DETECTOR DE MÚSICA — js/beat.js
   Lo que antes hacía ambient.js con una sola regla ("los graves
   subieron un 32% sobre su media") lo hace aquí un detector de
   verdad, del tipo que usan los analizadores musicales:

   1. SEIS BANDAS en Hz reales (no "las 5 primeras barras"), con los
      cortes de manual de batería: bombo 45-120, caja 1.5-4.5k,
      platillos 4.5-13k. Antes "graves" llegaba hasta 645 Hz, así que
      la voz y la caja contaban como bombo — de ahí la papilla.
   2. FLUJO ESPECTRAL por banda: no mira el nivel, mira cuánto SUBE
      el espectro de un frame al siguiente. Un platillo apenas mueve
      el nivel medio pero dispara el flujo; un sintetizador que sube
      despacio mueve el nivel y NO dispara nada. Eso es un ataque.
   3. UMBRAL ADAPTATIVO por banda (media + k·desviación de ~1 s de
      historia): en un tema denso exige más, en uno vacío menos. Un
      número fijo o detecta todo o no detecta nada.
   4. Cada golpe sale con FUERZA 0..1. Antes todos los bombos valían
      exactamente lo mismo, y por eso un drop se veía igual que el
      bombo más flojo de la intro. Esto es la mitad del "frenesí".
   5. TEMPO: histograma de intervalos entre bombos con plegado de
      octava → BPM, fase y confianza. Permite anticipar el golpe.

   Referencias: flujo espectral + selección de picos con umbral
   adaptativo (Dixon, «Onset Detection Revisited»), y el clásico de
   sub-bandas energía/varianza para el reparto de frecuencias.

   Sin audio en el navegador (Spotify Connect sin ◈ sync) no hay nada
   que detectar: entra en modo ESTIMADO y late con la cadencia de la
   letra, avisando de que se puede activar ◈ para ir de verdad.
   ========================================================== */
(() => {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ahoraMs = () => Date.now();

  /* ---------- Bandas (Hz) ----------
     `ref` = refractario en ms: mínimo entre dos golpes de esa banda.
     Los platillos van a semicorcheas (45 ms ≈ 330 BPM en corcheas),
     el bombo casi nunca baja de 100 ms. */
  const DEF = [
    { id: 'sub',       lo: 20,   hi: 55,    ref: 120 },
    { id: 'bombo',     lo: 45,   hi: 120,   ref: 100 },
    { id: 'bajo',      lo: 120,  hi: 320,   ref: 100 },
    { id: 'medio',     lo: 320,  hi: 1500,  ref: 90  },
    { id: 'presencia', lo: 1500, hi: 4500,  ref: 80  },
    { id: 'brillo',    lo: 4500, hi: 13000, ref: 45  },
  ];

  const HIST = 60;    // frames de historia para el umbral (~1 s a 60 fps)
  const TAPA = 18;    // dB: tope de subida por bin. Sin tope, un bin que
                      // sale del silencio se lleva él solo la decisión.
  const SUELO = -140; // dB para los bins mudos (getFloatFrequencyData da -Infinity)

  const bandas = DEF.map((d) => ({
    ...d,
    i0: 0, i1: 0, n: 1,
    nivel: 0,       // 0..1 absoluto, del dB medio de la banda
    norm: 0,        // 0..1 relativo a su propio techo (para pintar)
    suave: 0,       // nivel con ataque rápido y caída lenta
    techo: 0.08,
    flujo: 0, f1: 0, f2: 0,
    hist: new Float32Array(HIST), hp: 0, hn: 0,
    ultimo: 0, fuerza: 0, pulso: 0, ahora: false,
    tasa: 0,        // golpes por segundo (suavizado)
  }));
  const porId = {};
  bandas.forEach((b) => { porId[b.id] = b; });

  let dbBuf = null, prevDb = null, binsActuales = 0, srActual = 0;

  const mapear = (sampleRate, bins) => {
    const porBin = sampleRate / (bins * 2);
    for (const b of bandas) {
      b.i0 = Math.max(1, Math.floor(b.lo / porBin));
      b.i1 = Math.min(bins - 1, Math.ceil(b.hi / porBin));
      if (b.i1 < b.i0) b.i1 = b.i0;
      b.n = b.i1 - b.i0 + 1;
    }
  };

  /* ---------- Umbral adaptativo ----------
     media + k·desviación sobre la historia reciente de flujo. El suelo
     absoluto evita que en un silencio el ruido de fondo (media≈0,
     desviación≈0) dispare golpes fantasma cada dos frames. */
  const umbralDe = (b) => {
    const n = b.hn;
    if (n < 12) return 0.34;
    let s = 0;
    for (let i = 0; i < n; i++) s += b.hist[i];
    const media = s / n;
    let v = 0;
    for (let i = 0; i < n; i++) { const d = b.hist[i] - media; v += d * d; }
    const desv = Math.sqrt(v / n);
    return Math.max(media + 1.55 * desv, media * 1.45, 0.055);
  };

  const empujar = (b, v) => {
    b.hist[b.hp] = v;
    b.hp = (b.hp + 1) % HIST;
    if (b.hn < HIST) b.hn++;
  };

  /* ---------- Marco: el objeto que leen los demás ----------
     Se reutiliza en cada frame a propósito: crear uno nuevo 60 veces por
     segundo le da trabajo al recolector de basura justo cuando estamos
     intentando que nada tiemble. */
  const marco = {
    fuente: 'silencio',      // 'audio' | 'estimado' | 'silencio'
    nivel: 0,
    graves: 0, medios: 0, agudos: 0,   // niveles suavizados 0..1
    bandas: {},                        // id → nivel normalizado 0..1
    boom: 0, boomFuerza: 0, boomAhora: false,   // el BOMBO
    caja: 0, cajaFuerza: 0, cajaAhora: false,   // caja / palmas
    brillo: 0, brilloFuerza: 0, brilloAhora: false, // platillos → BRILLOS
    drop: false,
    bpm: 0, fase: 0, confianza: 0, anticipo: 0,
    energia: 0,
  };
  bandas.forEach((b) => { marco.bandas[b.id] = 0; });

  /* ---------- Tempo ---------- */
  let golpes = [];            // {t, f} de los últimos bombos
  let periodo = 0, confianza = 0, ultimoBoom = 0, ultimoCalculo = 0;

  const calcularTempo = (ahora) => {
    golpes = golpes.filter((g) => ahora - g.t < 12000);
    if (golpes.length < 5) { confianza *= 0.96; return; }

    /* Histograma de intervalos. Se miran los saltos de 1, 2 y 3 golpes:
       si el detector se salta un bombo, el intervalo doble sigue dando
       el mismo periodo al dividirlo. */
    const cesta = new Map();
    let total = 0;
    for (let i = 1; i < golpes.length; i++) {
      for (let d = 1; d <= 3 && i - d >= 0; d++) {
        let p = (golpes[i].t - golpes[i - d].t) / d;
        if (p < 90 || p > 3000) continue;
        // plegado de octava: 60-200 BPM. Un tema a 160 y otro a 80 tienen
        // el mismo pulso, solo cambia dónde lo cuenta uno.
        while (p < 300) p *= 2;
        while (p > 1000) p /= 2;
        if (p < 300 || p > 1000) continue;
        const peso = (golpes[i].f + golpes[i - d].f) * 0.5 + 0.15;
        const k = Math.round(p / 8) * 8;
        // se reparte a los vecinos: dos medidas a 498 y 502 ms deben sumar,
        // no competir por culpa del redondeo
        cesta.set(k, (cesta.get(k) || 0) + peso);
        cesta.set(k - 8, (cesta.get(k - 8) || 0) + peso * 0.45);
        cesta.set(k + 8, (cesta.get(k + 8) || 0) + peso * 0.45);
        total += peso;
      }
    }
    let mejor = 0, mejorP = 0;
    cesta.forEach((v, k) => { if (v > mejor) { mejor = v; mejorP = k; } });
    if (!mejorP || total <= 0) return;

    // afinado: media de los intervalos que caen cerca del ganador, para no
    // quedarnos con la rejilla gruesa de 8 ms (≈2 BPM de error a 120)
    let sp = 0, sw = 0;
    for (let i = 1; i < golpes.length; i++) {
      for (let d = 1; d <= 3 && i - d >= 0; d++) {
        let p = (golpes[i].t - golpes[i - d].t) / d;
        while (p < 300) p *= 2;
        while (p > 1000) p /= 2;
        if (Math.abs(p - mejorP) > 14) continue;
        sp += p; sw++;
      }
    }
    const fino = sw ? sp / sw : mejorP;
    periodo = periodo ? periodo + (fino - periodo) * 0.45 : fino;
    confianza = clamp(mejor / total, 0, 1);
  };

  /* ---------- Energía: el carácter del tema ----------
     No es el nivel del momento. Es "esto es una balada" o "esto es un
     temazo", y por eso va muy suavizado. Manda sobre todo lo que pinta
     ambient.js, así dos canciones distintas se ven distintas. */
  let energia = 0, nivelLento = 0, ultimoDrop = 0;

  const energiaPorLetra = () => {
    const L = window.LyricsModule;
    if (!L || !L.getSync) return null;
    try {
      const { lines, idx } = L.getSync();
      if (!lines || !lines.length || idx < 0) return null;
      const cur = lines[idx];
      let sig = null;
      for (let k = idx + 1; k < lines.length; k++) {
        if (lines[k].time > cur.time) { sig = lines[k]; break; }
      }
      if (!sig) return null;
      return clamp((4.6 - (sig.time - cur.time)) / 3.1, 0, 1);
    } catch (_) { return null; }
  };

  const medirEnergia = (objetivo) => {
    /* Curva en S: sin ella casi todo caía en la zona media (una balada
       marcaba 0.44 y un temazo 0.65, indistinguibles). Ahora lo flojo se
       hunde y lo movido se dispara. */
    const t = clamp((objetivo - 0.18) / 0.55, 0, 1);
    const s = t * t * (3 - 2 * t);
    energia += (s - energia) * 0.02;
    window.MM_ENERGIA = energia;
    return energia;
  };

  /* ---------- Un frame con señal real ---------- */
  const conAudio = (an, ahora) => {
    const bins = an.frequencyBinCount;
    const V = window.VisualizerModule;
    const sr = (V && V.getSampleRate ? V.getSampleRate() : 44100) || 44100;
    if (bins !== binsActuales || sr !== srActual) {
      binsActuales = bins; srActual = sr;
      dbBuf = new Float32Array(bins);
      prevDb = new Float32Array(bins).fill(SUELO);
      mapear(sr, bins);
    }
    an.getFloatFrequencyData(dbBuf);

    let pico = SUELO;
    for (let i = 1; i < bins; i += 7) if (dbBuf[i] > pico) pico = dbBuf[i];
    // el grafo está montado pero no entra nada (pista cambiando, audio
    // enrutado fuera): no es silencio del tema, es que no hay señal
    if (pico <= -98) return false;

    let nivelGlobal = 0;
    const PESO = { sub: 0.10, bombo: 0.22, bajo: 0.22, medio: 0.24, presencia: 0.14, brillo: 0.08 };

    for (const b of bandas) {
      let suma = 0, flujo = 0;
      for (let i = b.i0; i <= b.i1; i++) {
        const d = dbBuf[i] > SUELO ? dbBuf[i] : SUELO;
        suma += d;
        const sube = d - prevDb[i];
        if (sube > 0) flujo += sube > TAPA ? TAPA : sube;
      }
      const mediaDB = suma / b.n;
      b.nivel = clamp((mediaDB + 82) / 64, 0, 1);      // -82..-18 dB → 0..1
      nivelGlobal += b.nivel * PESO[b.id];

      // techo por banda: los agudos siempre pesan menos en dB que los
      // graves; sin esto el brillo se vería apagado en todas las canciones
      if (b.nivel > b.techo) b.techo += (b.nivel - b.techo) * 0.25;
      else b.techo += (b.nivel - b.techo) * 0.0012;
      if (b.techo < 0.06) b.techo = 0.06;
      b.norm = clamp(b.nivel / b.techo, 0, 1);
      b.suave += (b.norm - b.suave) * (b.norm > b.suave ? 0.45 : 0.09);

      /* Flujo 0..1. Se apaga con el nivel: una banda que sube 10 dB pero
         sigue a -75 dB no la oye nadie, y sin esta reja el silencio entre
         canciones se llena de golpes inventados. */
      let fl = (flujo / b.n) / TAPA;
      fl *= clamp(b.nivel * 2.6, 0, 1);

      b.f2 = b.f1; b.f1 = b.flujo; b.flujo = fl;

      /* Pico local con UN frame de retraso: se acepta f1 si era mayor que
         el anterior y no menor que el siguiente. 16 ms de retraso que
         nadie ve, a cambio de no disparar tres veces en la subida del
         mismo golpe. */
      const umbral = umbralDe(b);
      b.ahora = false;
      if (b.f1 > b.f2 && b.f1 >= b.flujo && b.f1 > umbral && ahora - b.ultimo >= b.ref) {
        b.ultimo = ahora;
        b.ahora = true;
        /* Fuerza 0..1 — lo que hacía falta para que un drop no se viera
           igual que el bombo más flojo de la intro. Tres cosas distintas:
           cuánto destaca sobre su propio umbral, cuán seco es el ataque, y
           lo FUERTE que suena la banda. La tercera es la que separa una
           balada de un temazo: las dos primeras saturan en cuanto hay un
           golpe seco, lo pegue fuerte o flojo. */
        const rel = clamp((b.f1 - umbral) / Math.max(0.06, umbral * 0.95), 0, 1);
        const abs = clamp(b.f1 / 0.55, 0, 1);
        const alto = clamp((b.nivel - 0.44) / 0.44, 0, 1);
        b.fuerza = clamp(rel * 0.26 + abs * 0.30 + alto * 0.44, 0.08, 1);
        b.pulso = 1;
      }
      empujar(b, fl);
      b.pulso *= 0.86;
      b.tasa += ((b.ahora ? 60 : 0) - b.tasa) * 0.04;   // golpes/s suavizado
    }
    prevDb.set(dbBuf);

    marco.nivel = nivelGlobal;
    // la fuerza de los golpes sube con lo que suena: el mismo bombo pega
    // más en el estribillo que en la intro
    const cuerpo = 0.35 + 0.65 * clamp(nivelGlobal * 1.8, 0, 1);

    /* BOOM = bombo, o el sub por su cuenta (los 808 y los sub-bass a veces
       no mueven la banda del bombo). Refractario común para no contar dos
       veces el mismo golpe con dos nombres. */
    const bombo = porId.bombo, sub = porId.sub;
    marco.boomAhora = false;
    if ((bombo.ahora || sub.ahora) && ahora - ultimoBoom >= 95) {
      const f = Math.max(bombo.ahora ? bombo.fuerza : 0, sub.ahora ? sub.fuerza * 0.92 : 0);
      marco.boomAhora = true;
      marco.boomFuerza = clamp(f * cuerpo, 0, 1);
      marco.boom = 1;
      ultimoBoom = ahora;
      golpes.push({ t: ahora, f: marco.boomFuerza });
    }

    // CAJA: el crujido va en presencia, pero sin algo de cuerpo debajo es
    // una "s" cantada, no un golpe
    const pres = porId.presencia;
    marco.cajaAhora = !!(pres.ahora && porId.medio.nivel > 0.12);
    if (marco.cajaAhora) { marco.cajaFuerza = clamp(pres.fuerza * cuerpo, 0, 1); marco.caja = 1; }

    // BRILLOS: platillos y charles
    const bri = porId.brillo;
    marco.brilloAhora = bri.ahora;
    if (bri.ahora) { marco.brilloFuerza = clamp(bri.fuerza * cuerpo, 0, 1); marco.brillo = 1; }

    /* DROP: un bombo fuerte justo cuando el tema salta por encima de su
       propio nivel de los últimos segundos. Es el "ahora sí" después del
       break, y merece que se rompa la pantalla. */
    nivelLento += (nivelGlobal - nivelLento) * (nivelGlobal > nivelLento ? 0.006 : 0.010);
    marco.drop = false;
    if (marco.boomAhora && marco.boomFuerza > 0.6 &&
        nivelGlobal > nivelLento * 1.26 && ahora - ultimoDrop > 3500) {
      marco.drop = true;
      ultimoDrop = ahora;
    }

    if (ahora - ultimoCalculo > 420) { ultimoCalculo = ahora; calcularTempo(ahora); }

    // energía: cuánto suena + cuántos bombos + cuánto charles
    const tasaBombo = clamp(bombo.tasa / 3.2, 0, 1);
    const tasaBrillo = clamp(bri.tasa / 7, 0, 1);
    medirEnergia(nivelGlobal * 0.45 + tasaBombo * 0.35 + tasaBrillo * 0.20);

    marco.fuente = 'audio';
    return true;
  };

  /* ---------- Sin señal: pulso estimado ----------
     Con Spotify Connect el audio no pasa por el navegador y no hay NADA
     que analizar. En vez de dejar el panel muerto, se late con la cadencia
     de la letra: no está a compás, pero respira con la canción. Flojo a
     propósito — el frenesí de verdad se lo gana el audio real. */
  let ultimoEst = 0, avisado = false, desdeSinSenal = 0;

  /* El botón ◈ vive en una esquina al 50% de opacidad y es fácil no verlo
     nunca. Cuando llevamos un rato sonando a ciegas se le pide que respire:
     es literalmente la diferencia entre que esto vaya al ritmo o no. */
  let btnSync = undefined, sugerido = false;
  const sugerirSync = (on) => {
    if (on === sugerido) return;
    if (btnSync === undefined) {
      btnSync = document.getElementById ? document.getElementById('vizSyncBtn') : null;
    }
    // en el móvil el botón está oculto (compartir pantalla es de
    // escritorio): no tiene sentido pedirle atención a algo que no está
    if (!btnSync || btnSync.hidden) return;
    sugerido = on;
    btnSync.classList.toggle('sugerido', on);
  };

  const estimado = (ahora) => {
    const porLetra = energiaPorLetra();
    const e = medirEnergia(porLetra === null ? 0.35 : porLetra);
    const bpm = 72 + e * 66;
    periodo = 60000 / bpm;
    confianza = 0.25;

    if (ahora - ultimoEst >= periodo) {
      ultimoEst = ahora;
      ultimoBoom = ahora;
      marco.boomAhora = true;
      marco.boomFuerza = 0.28 + e * 0.34;
      marco.boom = 1;
      golpes.push({ t: ahora, f: marco.boomFuerza });
      if (golpes.length > 40) golpes.shift();
    }
    // contratiempo: un brillo entre bombo y bombo, para que no sea un metrónomo
    const mitad = ultimoEst + periodo * 0.5;
    if (ahora >= mitad && ahora - mitad < 34) {
      marco.brilloAhora = true;
      marco.brilloFuerza = 0.2 + e * 0.25;
      marco.brillo = 1;
    }

    // niveles: una respiración lenta, sin picos falsos
    const fase = clamp((ahora - ultimoEst) / periodo, 0, 1);
    const resp = 0.18 + e * 0.3 + Math.max(0, 1 - fase * 3) * 0.22;
    for (const b of bandas) {
      b.norm = b.suave += (resp - b.suave) * 0.12;
      b.nivel = resp * 0.6;
    }
    marco.nivel = resp * 0.7;
    marco.fuente = 'estimado';

    /* Aviso: quien oye por Spotify Connect no sabe que existe ◈, y sin ◈
       esto nunca irá a compás por mucho detector que le pongamos. */
    const V = window.VisualizerModule;
    const conSync = !!(V && V.haySync && V.haySync());
    sugerirSync(!conSync && desdeSinSenal > 60 * 12);
    /* El consejo solo sirve donde ◈ existe. En el móvil no hay forma de
       capturar el audio del sistema, así que decirle que lo active sería
       mandarlo a buscar un botón que no está. */
    const hayBoton = document.getElementById && document.getElementById('vizSyncBtn');
    if (!avisado && !conSync && hayBoton && !hayBoton.hidden &&
        desdeSinSenal > 60 * 25 && window.SevenStatus) {
      avisado = true;
      // en el móvil el botón escucha por el micrófono: el consejo cambia
      window.SevenStatus(hayBoton.dataset.modo === 'mic'
        ? '◈ actívalo y pon la música por el altavoz: el fondo irá al ritmo real'
        : '◈ actívalo para que el fondo vaya al ritmo real');
    }
  };

  /* ---------- Bucle ---------- */
  let raf = null;

  const apagar = () => {
    marco.fuente = 'silencio';
    marco.boomAhora = marco.cajaAhora = marco.brilloAhora = marco.drop = false;
    marco.boom *= 0.9; marco.caja *= 0.9; marco.brillo *= 0.9;
    marco.nivel *= 0.94;
    for (const b of bandas) {
      b.suave *= 0.94; b.norm *= 0.94; b.nivel *= 0.94; b.pulso *= 0.9;
      b.flujo = b.f1 = b.f2 = 0; b.ahora = false;
    }
    marco.graves = porId.bombo.suave;
    marco.medios = porId.medio.suave;
    marco.agudos = porId.brillo.suave;
    confianza *= 0.97;
    marco.confianza = confianza;
    marco.anticipo = 0;
  };

  const paso = () => {
    const ahora = ahoraMs();
    marco.boomAhora = marco.cajaAhora = marco.brilloAhora = marco.drop = false;

    if (!document.body || !document.body.classList.contains('playing')) {
      desdeSinSenal = 0;
      apagar();
      return;
    }

    const V = window.VisualizerModule;
    const an = V && V.getDetector ? V.getDetector() : null;
    const vivo = an ? conAudio(an, ahora) : false;
    if (vivo) { desdeSinSenal = 0; sugerirSync(false); }
    else { desdeSinSenal++; estimado(ahora); }

    // envolventes que decaen: valen para pintar sin tener que mirar el flanco
    marco.boom *= 0.86;
    marco.caja *= 0.84;
    marco.brillo *= 0.80;

    marco.graves = Math.max(porId.sub.suave, porId.bombo.suave);
    marco.medios = (porId.bajo.suave + porId.medio.suave) * 0.5;
    marco.agudos = (porId.presencia.suave + porId.brillo.suave) * 0.5;
    for (const b of bandas) marco.bandas[b.id] = b.norm;

    marco.energia = energia;
    marco.bpm = periodo ? Math.round(60000 / periodo) : 0;
    marco.confianza = confianza;
    if (periodo && ultimoBoom) {
      const f = ((ahora - ultimoBoom) / periodo) % 1;
      marco.fase = f < 0 ? f + 1 : f;
      /* Anticipo: sube en el último 18% antes del golpe previsto. Sirve para
         "coger aire" justo antes del bombo, que es lo que hace que el
         golpe se sienta el doble de grande. Solo si nos fiamos del tempo. */
      marco.anticipo = confianza > 0.45 ? clamp((marco.fase - 0.82) / 0.18, 0, 1) * confianza : 0;
    } else {
      marco.fase = 0; marco.anticipo = 0;
    }
  };

  const bucle = () => { raf = requestAnimationFrame(bucle); if (!document.hidden) paso(); };
  const arrancar = () => { if (!raf) bucle(); };
  const parar = () => { if (raf) { cancelAnimationFrame(raf); raf = null; } };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) parar(); else arrancar();
  });
  arrancar();

  window.BeatModule = {
    get: () => marco,
    // para pruebas y para el resto de módulos que quieran forzar un frame
    paso,
    arrancar, parar,
  };
})();
