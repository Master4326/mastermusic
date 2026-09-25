/* ==========================================================
   ❝ COMPARTIR LA LETRA — una tarjeta de verdad

   QUÉ HABÍA ANTES. Un mando en el buscador de Ctrl+K, «compartir lo
   que suena», que mandaba TEXTO: el enlace de Spotify, o el título y
   el artista si la canción era tuya. Funcionaba, pero lo que la gente
   comparte de una canción no es su enlace: es el verso que le ha dado
   en la cara, con la carátula al lado. Eso no se puede mandar en una
   línea de texto.

   QUÉ HAY AHORA. Eliges los versos, y sale una IMAGEN: la carátula, el
   título, el artista y esos versos —en la tipografía que tengas puesta
   para la letra y con los colores que la carátula le haya dado a la
   app en ese momento—. Se comparte con el menú del sistema (el mismo
   de Instagram, WhatsApp o donde sea), se guarda como PNG o se copia
   al portapapeles.

   DÓNDE VIVE. En un panel colgado del <body>, como la galería de
   tipografías y la paleta de Ctrl+K. NO se le añade nada al panel de
   la letra, que se queda limpio: se abre con el botón ❝ de la barra de
   abajo —donde ya viven ✦, ◧ y ⛶— o desde Ctrl+K.

   LO DELICADO, en un sitio para que no se olvide:

   · CORS. La carátula de Spotify viene de i.scdn.co. Dibujar una
     imagen de otro dominio en un <canvas> lo MANCHA, y un lienzo
     manchado revienta al pedirle el PNG (`toBlob` lanza SecurityError).
     Por eso se carga con crossOrigin='anonymous' —i.scdn.co manda las
     cabeceras, es lo mismo que ya hace js/colors.js para sacar la
     paleta—. Para blob: y data: (tu música) no hace falta y además
     estorba, así que ahí se pide a pelo.

   · LAS FUENTES. `ctx.font` con una familia que el navegador todavía
     no tiene resuelta NO falla: dibuja con la de reserva y se queda tan
     ancho. Se espera a `document.fonts.load()` de cada una antes de
     pintar; si no, la primera tarjeta salía en Times New Roman.
   ========================================================== */
(() => {
  'use strict';

  const PC = () => window.PlayerCore;
  const LY = () => window.LyricsModule;
  const estado = (m) => { if (window.SevenStatus) window.SevenStatus(m); };

  // Cuántos versos caben en una tarjeta sin que se vuelva un muro de
  // texto. Cinco es lo que usa todo el mundo, y por algo será.
  const MAX_VERSOS = 5;

  const FORMATOS = {
    cuadrado: { w: 1080, h: 1080, nombre: 'cuadrado' },
    historia: { w: 1080, h: 1920, nombre: 'historia' },
  };

  const CLAVE_FMT = 'mm_comp_formato';
  const CLAVE_BG  = 'mm_comp_fondo';

  let panel = null, lienzo = null, ctx = null, listaEl = null, ayudaEl = null;
  let devolverFoco = null;
  let sel = [];              // índices elegidos: seguidos y ordenados
  let versos = [];           // [{ text, trad }]
  let pista = null;
  let formato = 'cuadrado';
  let fondo = 'caratula';
  let conTrad = false;
  let imgCache = { src: null, img: null };
  let pintando = false, otraVez = false;

  const leerPref = (k, def) => {
    try { return localStorage.getItem(k) || def; } catch (_) { return def; }
  };
  const guardarPref = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

  /* ---------- Colores de la app, tal y como están AHORA ----------
     No se copian a mano: se leen del CSS. Así la tarjeta sale con la
     paleta que la carátula le acaba de dar a la ventana, que es de lo
     que va esta app. */
  const css = (v, def) => {
    const s = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    return s || def;
  };

  /* ---------- La tipografía de la letra ----------
     La misma que estés viendo en el panel. `--lyrics-font` es una LISTA
     («'Playfair Display', serif»), que es justo lo que ctx.font quiere. */
  const fuenteLetra = () => ({
    familia: css('--lyrics-font', "'VT323', monospace"),
    peso: css('--lyrics-weight-on', '700'),
    caps: css('--lyrics-caps', 'none') === 'uppercase',
    track: css('--lyrics-tracking', '0.02em'),
    // «italic » o nada: va delante del peso en ctx.font (la de Fortnite)
    estilo: css('--lyrics-style', 'normal') === 'italic' ? 'italic ' : '',
  });

  const UI = "'VT323', monospace";
  const MARCA = "'Press Start 2P', monospace";

  /* ---------- La traducción, del tamaño que le toca ----------
     En la letra de verdad el subtítulo va al 0,58 del verso y en su misma
     tipografía (.lyric-trad, en css/style.css). La tarjeta lo tenía al
     0,42 y en la fuente de la interfaz: al mirarla en pequeño —que es
     como se mira una tarjeta— no se leía. */
  const TRAD_RATIO = 0.58;
  const TRAD_MIN = 26;        // suelo, en píxeles de tarjeta (la tarjeta mide 1080)
  const TRAD_TRACK = '0.01em';
  const TRAD_LINEAS = 3;      // más de tres líneas ya no es un subtítulo
  const TAM_MIN = 28;         // lo más pequeño que se deja el verso

  /* Un `ctx.font` con una familia sin resolver no falla: dibuja con la
     de reserva. Hay que esperarlas de una en una. */
  const fuentesListas = async () => {
    if (!document.fonts || !document.fonts.load) return;
    const f = fuenteLetra();
    // la cara EXACTA del verso (peso y cursiva): con otra, el lienzo pinta
    // la de reserva hasta que llegue
    const pedir = [`${f.estilo}${f.peso} 64px ${f.familia}`, `italic 40px ${f.familia}`,
      `40px ${UI}`, `16px ${MARCA}`];
    try {
      await Promise.all(pedir.map((p) => document.fonts.load(p, 'Ag')));
    } catch (_) { /* si una no llega, se pinta con lo que haya */ }
  };

  /* ---------- La carátula ----------
     crossOrigin solo donde hace falta: para blob: y data: no aporta
     nada y en algunos navegadores hace fallar la carga. */
  const cargarCaratula = (src) => new Promise((res) => {
    if (!src) { res(null); return; }
    if (imgCache.src === src && imgCache.img) { res(imgCache.img); return; }
    const propio = /^(blob:|data:)/.test(src);
    const probar = (conCors) => {
      const img = new Image();
      if (conCors) img.crossOrigin = 'anonymous';
      img.onload = () => { imgCache = { src, img }; res(img); };
      img.onerror = () => {
        /* Sin CORS el lienzo quedaría manchado y el PNG no se podría
           sacar, así que el segundo intento SOLO se hace cuando la
           imagen es nuestra (blob:/data:) y no puede manchar nada. */
        if (conCors && propio) probar(false); else res(null);
      };
      img.src = src;
    };
    probar(!propio);
  });

  // ══════════════════════════════════════════════════════════
  // DIBUJAR LA TARJETA
  // ══════════════════════════════════════════════════════════

  /* Parte un texto en líneas que quepan. Una palabra más larga que el
     ancho entero (un enlace, una onomatopeya de tres metros) se corta
     por donde sea: mejor partida que desbordada. */
  const envolver = (texto, ancho) => {
    const fuera = [];
    String(texto).split(/\s+/).filter(Boolean).forEach((palabra) => {
      let actual = fuera.length ? fuera[fuera.length - 1] : null;
      const prueba = actual == null ? palabra : actual + ' ' + palabra;
      if (actual != null && ctx.measureText(prueba).width <= ancho) {
        fuera[fuera.length - 1] = prueba;
        return;
      }
      if (ctx.measureText(palabra).width <= ancho) { fuera.push(palabra); return; }
      let trozo = '';
      for (const ch of palabra) {
        if (ctx.measureText(trozo + ch).width > ancho && trozo) { fuera.push(trozo); trozo = ''; }
        trozo += ch;
      }
      if (trozo) fuera.push(trozo);
    });
    return fuera.length ? fuera : [''];
  };

  const redondeado = (x, y, w, h, r) => {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const pintarFondo = (img, W, H) => {
    const deep = css('--bg-deep', '#0a0e2e');
    const d1 = css('--dyn-1', css('--bg-window', '#1a1f4a'));
    const d2 = css('--dyn-2', deep);

    if (fondo === 'caratula' && img) {
      /* La carátula desenfocada y ampliada un 20%: el desenfoque de
         canvas deja los bordes transparentes, y sin ese margen se veía
         un marco claro alrededor de la tarjeta. */
      const escala = Math.max(W / img.width, H / img.height) * 1.2;
      const w = img.width * escala, h = img.height * escala;
      ctx.save();
      ctx.filter = 'blur(44px) saturate(1.25)';
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      ctx.restore();
      // Velo para que el texto se lea sobre cualquier carátula
      const velo = ctx.createLinearGradient(0, 0, 0, H);
      velo.addColorStop(0, 'rgba(0,0,0,0.45)');
      velo.addColorStop(0.55, 'rgba(0,0,0,0.62)');
      velo.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = velo;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    if (fondo === 'color') {
      const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, d1);
      g.addColorStop(1, d2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    ctx.fillStyle = deep;
    ctx.fillRect(0, 0, W, H);
  };

  const dibujar = async () => {
    const fmt = FORMATOS[formato] || FORMATOS.cuadrado;
    const W = fmt.w, H = fmt.h;
    if (lienzo.width !== W || lienzo.height !== H) { lienzo.width = W; lienzo.height = H; }

    const img = await cargarCaratula(pista && pista.cover);
    const acento = css('--accent', '#5ce1e6');
    const texto = css('--text', '#e8ecff');
    const tenue = css('--text-dim', '#8b94d8');
    const mudo = css('--text-muted', '#7c86c2');
    const f = fuenteLetra();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    pintarFondo(img, W, H);

    const P = 84;                    // margen de la tarjeta
    const anchoUtil = W - P * 2;

    /* ---------- Cabecera: carátula + título + artista ----------
       Un poco más grande en formato historia: en 1080×1920 la misma
       cabecera de la tarjeta cuadrada se queda perdida arriba. */
    const historia = formato === 'historia';
    const lado = historia ? 206 : 176;
    const cabY = P;
    if (img) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 8;
      redondeado(P, cabY, lado, lado, 10);
      ctx.clip();
      const e = Math.max(lado / img.width, lado / img.height);
      const w = img.width * e, h = img.height * e;
      ctx.drawImage(img, P + (lado - w) / 2, cabY + (lado - h) / 2, w, h);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = acento;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.65;
      redondeado(P + 1.5, cabY + 1.5, lado - 3, lado - 3, 10);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      redondeado(P, cabY, lado, lado, 10);
      ctx.fill();
      ctx.strokeStyle = acento; ctx.lineWidth = 3; ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = acento;
      ctx.font = `86px ${UI}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('♪', P + lado / 2, cabY + lado / 2);
      ctx.restore();
    }

    const metaX = P + lado + 34;
    const metaAncho = W - metaX - P;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const tamTit = historia ? 60 : 52;
    const tamArt = historia ? 44 : 38;
    ctx.font = `${tamTit}px ${UI}`;
    const titulo = envolver((pista && (pista.name || pista.title)) || 'Sin canción', metaAncho).slice(0, 2);
    // Centrado contra la carátula: dos líneas de título empiezan más arriba
    let ty = cabY + lado / 2 - (titulo.length * tamTit + tamArt) / 2 + tamTit * 0.82;
    ctx.fillStyle = texto;
    titulo.forEach((l) => { ctx.fillText(l, metaX, ty); ty += tamTit * 1.04; });

    ctx.font = `${tamArt}px ${UI}`;
    ctx.fillStyle = tenue;
    const artista = envolver((pista && pista.artist) || '', metaAncho).slice(0, 1);
    artista.forEach((l) => { ctx.fillText(l, metaX, ty + 4); });

    // ---------- Pie ----------
    // 16 px, no 17: Press Start 2P es de 8 × 8 y solo sale limpia a múltiplos de 8
    ctx.font = `16px ${MARCA}`;
    ctx.fillStyle = mudo;
    ctx.textAlign = 'left';
    ctx.fillText('MASTER MUSIC', P, H - P + 4);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = tenue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(P, H - P - 36);
    ctx.lineTo(W - P, H - P - 36);
    ctx.stroke();
    ctx.restore();

    // ---------- Los versos ----------
    const arriba = cabY + lado + 70;
    const abajo = H - P - 92;
    const alto = abajo - arriba;
    const elegidos = sel.map((i) => versos[i]).filter(Boolean);

    if (!elegidos.length) {
      ctx.font = `34px ${UI}`;
      ctx.fillStyle = mudo;
      ctx.textAlign = 'center';
      ctx.fillText('sin versos elegidos', W / 2, arriba + alto / 2);
      return;
    }

    /* ---------- Tamaño automático ----------
       Se empieza grande y se baja hasta que el bloque entra. Un tamaño
       fijo obliga a elegir entre que un verso corto se vea ridículo o
       que cinco largos se salgan.

       LA TRADUCCIÓN ERA LA HERMANA POBRE de la tarjeta: iba al 0,42 del
       verso, en la tipografía de la interfaz —una de píxeles, que en
       pequeño es la que peor aguanta— y con el color más apagado que
       tiene la app. En una tarjeta de 1080 que se mira a un tercio de su
       tamaño, eso no es un subtítulo: es una raya gris. Y el aire era el
       mismo antes que después, así que cada traducción acababa pegada al
       verso de ABAJO, como si fuera el título del siguiente.

       Ahora es lo que ya es en la letra de verdad (.lyric-trad): la
       MISMA tipografía del verso, cursiva, al 0,58 y con el color del
       texto solo un poco bajado —en la letra, la traducción del verso
       que suena se ilumina, y en la tarjeta TODOS los versos son «el que
       suena»—, pegada a su verso, separada del siguiente y con una
       barrita de acento que dice de quién cuelga. */
    const medir = (tamV, capTrad, apretado) => {
      const interlinea = tamV * (apretado ? 1.16 : 1.3);
      /* El 0,58 de la letra, pero sin dejar que se quede en nada cuando
         el verso encoge: por debajo de cierto tamaño el subtítulo sube
         hasta el 0,72 —sigue siendo claramente el segundo, y se lee—. */
      const tamTrad = Math.max(Math.round(tamV * TRAD_RATIO),
        Math.min(TRAD_MIN, Math.round(tamV * 0.72)));
      const interTrad = tamTrad * (apretado ? 1.2 : 1.34);
      const sangria = Math.round(tamV * 0.34);
      const aireTrad = Math.round(tamV * (apretado ? 0.1 : 0.18));
      const aireVerso = Math.round(tamV * (apretado ? 0.38 : 0.62));
      const trozos = [];
      let total = 0;
      elegidos.forEach((v, n) => {
        ctx.font = `${f.estilo}${f.peso} ${tamV}px ${f.familia}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = f.track;
        const lineas = envolver(f.caps ? String(v.text).toUpperCase() : v.text, anchoUtil);
        let altoV = lineas.length * interlinea;
        let tl = [];
        if (conTrad && v.trad) {
          ctx.font = `italic ${tamTrad}px ${f.familia}`;
          if ('letterSpacing' in ctx) ctx.letterSpacing = TRAD_TRACK;
          tl = envolver(v.trad, anchoUtil - sangria);
          /* Si hay que cortar, se corta CON puntos suspensivos. Antes se
             tiraban las líneas de más en silencio y la traducción se
             quedaba a mitad de frase, como si el traductor fuera manco. */
          if (tl.length > capTrad) {
            tl = tl.slice(0, capTrad);
            tl[capTrad - 1] = tl[capTrad - 1].replace(/[\s,;:.]+$/, '') + '…';
          }
          altoV += aireTrad + tl.length * interTrad;
        }
        total += altoV + (n < elegidos.length - 1 ? aireVerso : 0);
        trozos.push({ lineas, tl });
      });
      return { tam: tamV, trozos, interlinea, tamTrad, interTrad, sangria, aireTrad, aireVerso, total };
    };

    let bloque = null;
    const tamMax = formato === 'historia' ? 82 : 70;
    for (const cap of [TRAD_LINEAS, 2]) {
      for (let t = tamMax; t >= TAM_MIN; t -= 2) {
        const b = medir(t, cap, false);
        if (b.total <= alto) { bloque = b; break; }
      }
      if (bloque) break;
    }
    /* Ni al mínimo entra (cinco versos largos, cada uno con su
       traducción): se aprieta la interlínea. Antes, en este caso, la
       tarjeta se quedaba SIN traducción y sin decir ni mu. */
    if (!bloque) bloque = medir(TAM_MIN, 2, true);
    const tam = bloque.tam;

    /* Dónde empieza el primer verso. Se calcula ANTES de la comilla
       porque la comilla va pegada a él: colgada arriba del todo, a
       media tarjeta de distancia del texto, no parecía una comilla
       sino una mancha que se le había caído a alguien. */
    const y0 = arriba + Math.max(0, (alto - bloque.total) / 2) + tam;

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = acento;
    ctx.font = `${Math.round(tam * 1.5)}px ${UI}`;
    ctx.textAlign = 'left';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillText('❝', P - 4, y0 - tam * 0.62);
    ctx.restore();

    let y = y0;
    ctx.textAlign = 'left';
    bloque.trozos.forEach(({ lineas, tl }) => {
      ctx.font = `${f.estilo}${f.peso} ${tam}px ${f.familia}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = f.track;
      ctx.fillStyle = texto;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 14;
      lineas.forEach((l) => { ctx.fillText(l, P, y); y += bloque.interlinea; });
      ctx.restore();

      if (tl.length) {
        y += bloque.aireTrad;
        const primera = y;
        ctx.save();
        ctx.font = `italic ${bloque.tamTrad}px ${f.familia}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = TRAD_TRACK;
        ctx.fillStyle = texto;
        ctx.globalAlpha = 0.78;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 12;
        tl.forEach((l) => { ctx.fillText(l, P + bloque.sangria, y); y += bloque.interTrad; });
        ctx.restore();
        /* La barrita de acento: dice «esto cuelga del verso de arriba»
           sin gastar ni un punto de tamaño en decirlo. */
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = acento;
        ctx.fillRect(P + 1, primera - bloque.tamTrad * 0.84, 3,
          (tl.length - 1) * bloque.interTrad + bloque.tamTrad * 1.05);
        ctx.restore();
      }
      y += bloque.aireVerso;
    });
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  };

  // Un repintado a la vez; si llega otro mientras, se encadena
  const pintar = async () => {
    if (pintando) { otraVez = true; return; }
    pintando = true;
    try {
      await fuentesListas();
      await dibujar();
    } catch (e) {
      console.warn('compartir: no se pudo pintar la tarjeta', e);
    }
    pintando = false;
    if (otraVez) { otraVez = false; pintar(); }
  };

  // ══════════════════════════════════════════════════════════
  // SACAR EL PNG
  // ══════════════════════════════════════════════════════════
  const aBlob = () => new Promise((res, rej) => {
    try {
      lienzo.toBlob((b) => (b ? res(b) : rej(new Error('sin blob'))), 'image/png');
    } catch (e) { rej(e); }   // lienzo manchado por una carátula sin CORS
  });

  const nombreArchivo = () => {
    const t = (pista && (pista.name || pista.title)) || 'letra';
    const limpio = t.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 40);
    return (limpio || 'letra') + '.png';
  };

  const textoAcompanante = () => {
    const v = sel.map((i) => versos[i] && versos[i].text).filter(Boolean).join(' / ');
    const t = (pista && (pista.name || pista.title)) || '';
    const a = (pista && pista.artist) || '';
    const cabeza = v ? `«${v}»` : '♪';
    return `${cabeza} — ${t}${a ? ' · ' + a : ''}`;
  };

  const enlaceSpotify = () => {
    const u = pista && pista.uri;
    return u && u.startsWith('spotify:track:') ? 'https://open.spotify.com/track/' + u.split(':')[2] : '';
  };

  const descargar = async (silencioso) => {
    const b = await aBlob();
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (!silencioso) estado('▣ imagen guardada: ' + nombreArchivo());
  };

  const compartir = async () => {
    let blob;
    try { blob = await aBlob(); }
    catch (_) {
      estado('✕ la carátula no deja sacar la imagen (permiso del servidor)');
      return;
    }
    const archivo = new File([blob], nombreArchivo(), { type: 'image/png' });
    const base = { files: [archivo] };
    /* De más a menos: con texto y enlace, solo con texto, solo el
       archivo. Cada plataforma acepta una combinación distinta y
       `canShare` es la única forma de saberlo sin fallar delante del
       usuario. */
    const intentos = [
      Object.assign({ title: textoAcompanante(), text: textoAcompanante() },
        enlaceSpotify() ? { url: enlaceSpotify() } : {}, base),
      Object.assign({ text: textoAcompanante() }, base),
      base,
    ];
    if (navigator.share && navigator.canShare) {
      for (const datos of intentos) {
        if (!navigator.canShare(datos)) continue;
        try {
          await navigator.share(datos);
          estado('⇥ compartido');
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;   // lo canceló: no es un fallo
          break;                                       // falló de verdad: a guardar
        }
      }
    }
    /* Sin menú de compartir —los escritorios, casi siempre— se baja el
       PNG, que es lo mismo con un paso más. */
    await descargar(true);
    estado('▣ este aparato no comparte imágenes: se guardó ' + nombreArchivo());
  };

  const copiar = async () => {
    try {
      const blob = await aBlob();
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error('sin portapapeles');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      estado('⇥ imagen copiada — pégala donde quieras');
    } catch (_) {
      estado('✕ este navegador no deja copiar imágenes · usa [ guardar ]');
    }
  };

  // ══════════════════════════════════════════════════════════
  // EL PANEL
  // ══════════════════════════════════════════════════════════
  const pintarLista = () => {
    listaEl.textContent = '';
    if (!versos.length) {
      const v = document.createElement('p');
      v.className = 'comp-vacio';
      v.textContent = 'esta canción no tiene letra — se comparte la carátula';
      listaEl.appendChild(v);
      return;
    }
    versos.forEach((v, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'comp-verso' + (sel.includes(i) ? ' on' : '');
      b.dataset.i = String(i);
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', sel.includes(i) ? 'true' : 'false');
      b.textContent = v.text;
      listaEl.appendChild(b);
    });
  };

  const pintarAyuda = () => {
    if (!ayudaEl) return;
    if (!versos.length) { ayudaEl.textContent = 'sin letra que elegir'; return; }
    ayudaEl.textContent = sel.length
      ? `${sel.length} de ${MAX_VERSOS} versos · toca para añadir o quitar`
      : `toca un verso · hasta ${MAX_VERSOS} seguidos`;
  };

  /* Elegir versos SEGUIDOS. Un verso suelto de aquí y otro de allá no
     es una cita, es un recorte: la tarjeta tiene que leerse como se
     canta. Por eso al tocar algo lejos se empieza de nuevo ahí. */
  const alElegir = (i) => {
    const pos = sel.indexOf(i);
    if (!sel.length) sel = [i];
    else if (pos >= 0) {
      if (sel.length === 1) sel = [];
      else if (i === sel[0]) sel = sel.slice(1);
      else if (i === sel[sel.length - 1]) sel = sel.slice(0, -1);
      else sel = [i];
    } else if (i === sel[0] - 1 && sel.length < MAX_VERSOS) sel = [i].concat(sel);
    else if (i === sel[sel.length - 1] + 1 && sel.length < MAX_VERSOS) sel = sel.concat([i]);
    else sel = [i];
    pintarLista();
    pintarAyuda();
    pintar();
  };

  const grupo = (nombre, etiqueta, opciones) => `
    <div class="comp-fila">
      <span class="set-label">${etiqueta}</span>
      <div class="seg" data-comp="${nombre}" role="radiogroup" aria-label="${etiqueta}">
        ${opciones.map((o) => `<button class="seg-btn" type="button" data-val="${o[0]}">${o[1]}</button>`).join('')}
      </div>
    </div>`;

  const construir = () => {
    if (panel) return;
    panel = document.createElement('div');
    panel.className = 'comp';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="comp-fondo"></div>
      <div class="comp-caja" role="dialog" aria-modal="true" aria-label="Compartir la letra">
        <div class="comp-cab">
          <span class="comp-tit"><span aria-hidden="true">❝</span> compartir la letra</span>
          <button class="paleta-x comp-x" type="button" title="Cerrar (Esc)" aria-label="Cerrar">✕</button>
        </div>
        <div class="comp-cuerpo">
          <div class="comp-vista">
            <canvas class="comp-lienzo" role="img"
                    aria-label="Vista previa de la tarjeta que vas a compartir"></canvas>
          </div>
          <div class="comp-lado">
            <p class="comp-ayuda"></p>
            <div class="comp-versos" role="listbox" aria-label="Versos de la canción"></div>
            <div class="comp-opts">
              ${grupo('formato', 'formato', [['cuadrado', 'cuadrado'], ['historia', 'historia']])}
              ${grupo('fondo', 'fondo', [['caratula', 'carátula'], ['color', 'color'], ['liso', 'liso']])}
              <div class="comp-fila comp-fila-trad" hidden>
                <span class="set-label">traducción</span>
                <div class="seg" data-comp="trad" role="radiogroup" aria-label="Traducción">
                  <button class="seg-btn" type="button" data-val="on">sí</button>
                  <button class="seg-btn" type="button" data-val="off">no</button>
                </div>
              </div>
            </div>
            <div class="comp-acciones">
              <button class="retro-btn comp-enviar" type="button">
                <span class="bracket">[</span> compartir <span class="bracket">]</span>
              </button>
              <button class="retro-btn small comp-guardar" type="button">
                <span class="bracket">[</span> guardar <span class="bracket">]</span>
              </button>
              <button class="retro-btn small comp-copiar" type="button">
                <span class="bracket">[</span> copiar <span class="bracket">]</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(panel);

    lienzo = panel.querySelector('.comp-lienzo');
    ctx = lienzo.getContext('2d');
    listaEl = panel.querySelector('.comp-versos');
    ayudaEl = panel.querySelector('.comp-ayuda');

    panel.querySelector('.comp-fondo').addEventListener('click', cerrar);
    panel.querySelector('.comp-x').addEventListener('click', cerrar);
    listaEl.addEventListener('click', (e) => {
      const b = e.target.closest('.comp-verso');
      if (b) alElegir(parseInt(b.dataset.i, 10));
    });

    panel.querySelectorAll('.seg[data-comp]').forEach((g) => {
      g.addEventListener('click', (e) => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        const cual = g.dataset.comp;
        if (cual === 'formato') { formato = b.dataset.val; guardarPref(CLAVE_FMT, formato); }
        else if (cual === 'fondo') { fondo = b.dataset.val; guardarPref(CLAVE_BG, fondo); }
        else if (cual === 'trad') conTrad = b.dataset.val === 'on';
        pintarSegs();
        pintar();
      });
    });

    panel.querySelector('.comp-enviar').addEventListener('click', compartir);
    panel.querySelector('.comp-guardar').addEventListener('click', () => descargar(false));
    panel.querySelector('.comp-copiar').addEventListener('click', copiar);

    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar(); }
    });
  };

  const pintarSegs = () => {
    const valor = { formato, fondo, trad: conTrad ? 'on' : 'off' };
    panel.querySelectorAll('.seg[data-comp]').forEach((g) => {
      g.querySelectorAll('.seg-btn').forEach((b) => {
        const on = b.dataset.val === valor[g.dataset.comp];
        b.classList.toggle('active', on);
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
    });
  };

  /* Preselección: el verso que suena AHORA y los dos siguientes. Abrir
     y compartir tiene que ser un toque; elegir a mano es para el que
     quiera otra cosa. */
  const preseleccionar = (idx) => {
    if (!versos.length) { sel = []; return; }
    const desde = idx >= 0 ? idx : 0;
    sel = [];
    for (let i = desde; i < versos.length && sel.length < 3; i++) sel.push(i);
  };

  const abrir = () => {
    construir();
    if (!panel.hidden) return;

    pista = (PC() && PC().state && PC().state.currentTrack) || null;
    if (!pista) { estado('✕ no hay nada sonando que compartir'); return; }

    const sync = (LY() && LY().getSync && LY().getSync()) || { lines: [], idx: -1, trad: [] };
    const trad = sync.trad || [];
    versos = (sync.lines || [])
      .map((l, i) => ({ text: String(l.text || '').trim(), trad: (trad[i] || '').trim() }))
      .filter((v) => v.text);
    preseleccionar(sync.idx);

    formato = FORMATOS[leerPref(CLAVE_FMT, 'cuadrado')] ? leerPref(CLAVE_FMT, 'cuadrado') : 'cuadrado';
    fondo = ['caratula', 'color', 'liso'].includes(leerPref(CLAVE_BG, 'caratula'))
      ? leerPref(CLAVE_BG, 'caratula') : 'caratula';
    // La traducción solo se ofrece si de verdad hay algo traducido
    const hayTrad = versos.some((v) => v.trad);
    conTrad = hayTrad;
    panel.querySelector('.comp-fila-trad').hidden = !hayTrad;

    devolverFoco = document.activeElement;
    panel.hidden = false;
    document.body.classList.add('comp-abierta');
    pintarSegs();
    pintarLista();
    pintarAyuda();
    pintar();

    const elegido = listaEl.querySelector('.comp-verso.on');
    if (elegido && elegido.scrollIntoView) elegido.scrollIntoView({ block: 'center' });
    panel.querySelector('.comp-x').focus();
  };

  const cerrar = () => {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.body.classList.remove('comp-abierta');
    if (devolverFoco && devolverFoco.focus) devolverFoco.focus();
    devolverFoco = null;
  };

  const boton = document.getElementById('compartirBtn');
  if (boton) boton.addEventListener('click', abrir);

  window.MMCompartir = {
    abrir,
    cerrar,
    abierto: () => !!panel && !panel.hidden,
    // para las pruebas y para quien quiera la tarjeta sin el panel
    blob: aBlob,
  };
})();
