/* db.js — archivio locale (IndexedDB): spese e foto restano sul dispositivo */
(function () {
  'use strict';
  const NOME = 'finanzecontrol', VER = 1;
  let dbp = null;

  function apri() {
    if (dbp) return dbp;
    dbp = new Promise((ok, ko) => {
      const r = indexedDB.open(NOME, VER);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('spese')) db.createObjectStore('spese', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('foto')) db.createObjectStore('foto');
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return apri().then(db => new Promise((ok, ko) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const res = fn(s);
      t.oncomplete = () => ok(res && 'result' in res ? res.result : undefined);
      t.onerror = () => ko(t.error);
    }));
  }

  window.DB = {
    tutte: () => tx('spese', 'readonly', s => s.getAll()),
    salva: sp => tx('spese', 'readwrite', s => s.put(sp)),
    elimina: id => Promise.all([tx('spese', 'readwrite', s => s.delete(id)), tx('foto', 'readwrite', s => s.delete(id))]),
    foto: id => tx('foto', 'readonly', s => s.get(id)),
    salvaFoto: (id, dataUrl) => tx('foto', 'readwrite', s => s.put(dataUrl, id)),
    svuota: () => Promise.all([tx('spese', 'readwrite', s => s.clear()), tx('foto', 'readwrite', s => s.clear())])
  };
})();
