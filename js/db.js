/* ==========================================================
   MusicDB — almacenamiento persistente en IndexedDB.

   Dos almacenes:
   · `tracks` — los archivos de audio importados (como Blob) + metadatos,
     para que la biblioteca local sobreviva a recargas y cierres.
   · `plays`  — el historial de escuchas (v2). Una fila por canción puesta,
     con la hora y cuánto se oyó de verdad. Ver js/historial.js.

   El historial vive AQUÍ y no en localStorage a propósito: son miles de
   filas y crecen para siempre; localStorage tiene ~5 MB y se lee y escribe
   entero cada vez.
   ========================================================== */
window.MusicDB = (() => {
  'use strict';

  const DB_NAME = 'mastermusic';
  const STORE = 'tracks';
  const PLAYS = 'plays';
  /* v1 → v2: se añade el historial. Subir VERSION es lo que dispara
     `onupgradeneeded`; sin eso el almacén nuevo no se crea nunca y todo
     falla con NotFoundError. */
  const VERSION = 2;
  let dbPromise = null;

  const open = () => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB no soportado')); return; }
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(PLAYS)) {
          /* Clave automática: una escucha no tiene identidad propia, y la
             misma canción puede repetirse mil veces. El índice por `t` (la
             hora) es el que hace baratas las consultas por periodo: «lo de
             esta semana» es un rango, no recorrer el historial entero. */
          const s = db.createObjectStore(PLAYS, { keyPath: 'id', autoIncrement: true });
          s.createIndex('t', 't');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  };

  const run = async (almacen, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(almacen, mode);
      const store = tx.objectStore(almacen);
      const req = fn(store);
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };

  return {
    // ---- Biblioteca local (sin cambios: las llamadas de antes siguen valiendo)
    put: (record) => run(STORE, 'readwrite', (s) => s.put(record)),
    getAll: () => run(STORE, 'readonly', (s) => s.getAll()),
    delete: (id) => run(STORE, 'readwrite', (s) => s.delete(id)),
    clear: () => run(STORE, 'readwrite', (s) => s.clear()),

    // ---- Historial de escuchas
    playAdd: (fila) => run(PLAYS, 'readwrite', (s) => s.add(fila)),
    playPut: (fila) => run(PLAYS, 'readwrite', (s) => s.put(fila)),
    /* Escuchas entre dos fechas (ms). Va por el índice `t`, así que pedir
       «este mes» no cuesta leer los cinco años que haya detrás. */
    playRange: (desde, hasta) => run(PLAYS, 'readonly', (s) =>
      s.index('t').getAll(IDBKeyRange.bound(desde || 0, hasta || Date.now() + 1))),
    playAll: () => run(PLAYS, 'readonly', (s) => s.getAll()),
    playCount: () => run(PLAYS, 'readonly', (s) => s.count()),
    playClear: () => run(PLAYS, 'readwrite', (s) => s.clear()),
  };
})();
