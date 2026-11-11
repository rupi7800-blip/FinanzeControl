/* =========================================================
   immagine.js — prepara la foto dello scontrino per la lettura
   1. trova lo scontrino nella foto e ritaglia lo sfondo
   2. capisce se è girato (90°) e lo raddrizza (inclinazione)
   3. porta il testo alla dimensione ideale per l'OCR
   4. elimina ombre e luce non uniforme (soglia adattiva)
   ========================================================= */
(function () {
  'use strict';

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function dim(src) { return [src.naturalWidth || src.width, src.naturalHeight || src.height]; }
  function scala(src, k) {
    const [w, h] = dim(src);
    const c = canvas(w * k, h * k);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function maxLato(src, m) { const [w, h] = dim(src); return scala(src, Math.min(1, m / Math.max(w, h))); }

  // luminanza e saturazione
  function grigi(c) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const n = c.width * c.height, g = new Float32Array(n), s = new Float32Array(n);
    for (let i = 0, j = 0; j < n; i += 4, j++) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      g[j] = 0.299 * r + 0.587 * gg + 0.114 * b;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      s[j] = mx ? (mx - mn) / mx : 0;
    }
    return { g, s, w: c.width, h: c.height };
  }
  function otsu(arr) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < arr.length; i++) hist[Math.min(255, arr[i] | 0)]++;
    let tot = arr.length, sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, t = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = tot - wB; if (!wF) break;
      sB += i * hist[i];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; t = i; }
    }
    return t;
  }
  // immagine integrale per medie locali veloci
  function integrale(g, w, h, quad) {
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let rs = 0;
      for (let x = 0; x < w; x++) { const v = g[y * w + x]; rs += quad ? v * v : v; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + rs; }
    }
    return I;
  }

  /* 1. ritaglio: la carta è chiara e poco colorata; prendo la zona più grande */
  function trovaCarta(c) {
    const p = maxLato(c, 420);
    const { g, s, w, h } = grigi(p);
    // sfoco leggermente la luminanza per non spezzare la carta sul testo
    const I = integrale(g, w, h), r = 3, m = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      m[y * w + x] = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    }
    const t = otsu(m);
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = m[i] > t && s[i] < 0.35 ? 1 : 0;
    // componente connessa più grande
    const lab = new Int32Array(w * h); let best = 0, bestN = 0, id = 0; const box = {};
    const st = new Int32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (!mask[i] || lab[i]) continue;
      id++; let sp = 0, n = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
      st[sp++] = i; lab[i] = id;
      while (sp) {
        const k = st[--sp], x = k % w, y = (k / w) | 0; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mask[k - 1] && !lab[k - 1]) { lab[k - 1] = id; st[sp++] = k - 1; }
        if (x < w - 1 && mask[k + 1] && !lab[k + 1]) { lab[k + 1] = id; st[sp++] = k + 1; }
        if (y > 0 && mask[k - w] && !lab[k - w]) { lab[k - w] = id; st[sp++] = k - w; }
        if (y < h - 1 && mask[k + w] && !lab[k + w]) { lab[k + w] = id; st[sp++] = k + w; }
      }
      if (n > bestN) { bestN = n; best = id; box.x0 = x0; box.x1 = x1; box.y0 = y0; box.y1 = y1; }
    }
    if (!best) return null;
    const area = (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1);
    // la carta occupa già quasi tutta la foto, oppure è troppo piccola per essere uno scontrino
    if (area > 0.6 * w * h || bestN < 0.03 * w * h) return null;
    const k = c.width / w, mg = 0.04 * Math.max(w, h);
    return {
      x: Math.max(0, (box.x0 - mg) * k), y: Math.max(0, (box.y0 - mg) * k),
      w: Math.min(c.width, (box.x1 + mg + 1) * k) - Math.max(0, (box.x0 - mg) * k),
      h: Math.min(c.height, (box.y1 + mg + 1) * k) - Math.max(0, (box.y0 - mg) * k)
    };
  }
  function ritaglia(c, b) {
    const o = canvas(b.w, b.h);
    o.getContext('2d').drawImage(c, b.x, b.y, b.w, b.h, 0, 0, o.width, o.height);
    return o;
  }
  function ruota(c, gradi, sfondo) {
    const a = gradi * Math.PI / 180, cs = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
    const o = canvas(c.width * cs + c.height * sn, c.width * sn + c.height * cs);
    const x = o.getContext('2d');
    x.fillStyle = sfondo || '#fff'; x.fillRect(0, 0, o.width, o.height);
    x.translate(o.width / 2, o.height / 2); x.rotate(a);
    x.imageSmoothingQuality = 'high';
    x.drawImage(c, -c.width / 2, -c.height / 2);
    return o;
  }

  /* 4. soglia adattiva (Sauvola) dopo aver tolto le ombre */
  function binarizza(c, finestra, k) {
    const { g, w, h } = grigi(c);
    const I = integrale(g, w, h), Q = integrale(g, w, h, true), r = Math.max(7, finestra >> 1);
    const ctx = c.getContext('2d'), out = ctx.createImageData(w, h), o = out.data;
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), n = (x1 - x0) * (y1 - y0);
        const a = (y1 * (w + 1) + x1), b = (y0 * (w + 1) + x1), cc = (y1 * (w + 1) + x0), d = (y0 * (w + 1) + x0);
        const mean = (I[a] - I[b] - I[cc] + I[d]) / n;
        const sd = Math.sqrt(Math.max(0, (Q[a] - Q[b] - Q[cc] + Q[d]) / n - mean * mean));
        const t = mean * (1 + k * (sd / 128 - 1));
        const v = g[y * w + x] > t || sd < 3 && g[y * w + x] > mean - 8 ? 255 : 0;
        const j = (y * w + x) * 4; o[j] = o[j + 1] = o[j + 2] = v; o[j + 3] = 255;
      }
    }
    const res = canvas(w, h); res.getContext('2d').putImageData(out, 0, 0);
    return res;
  }

  // grigio senza ombre: divido per lo sfondo locale (per foto piccole o sfocate)
  function normalizza(c, finestra) {
    const { g, w, h } = grigi(c);
    const I = integrale(g, w, h), r = Math.max(15, finestra);
    const ctx = c.getContext('2d'), out = ctx.createImageData(w, h), o = out.data;
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const mean = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
        let v = g[y * w + x] / Math.max(1, mean * 1.08) * 255;
        v = v > 255 ? 255 : v < 0 ? 0 : v;
        v = 255 - (255 - v) * 1.6; // più contrasto sul testo
        const j = (y * w + x) * 4; o[j] = o[j + 1] = o[j + 2] = v < 0 ? 0 : v; o[j + 3] = 255;
      }
    }
    const res = canvas(w, h); res.getContext('2d').putImageData(out, 0, 0);
    return res;
  }
  // toglie bordi e macchie grandi (sfondo rimasto, ombre del tavolo) che confondono la lettura
  function pulisci(bin, hCar) {
    const w = bin.width, h = bin.height, ctx = bin.getContext('2d'), im = ctx.getImageData(0, 0, w, h), d = im.data;
    const ink = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) ink[i] = d[i * 4] < 128 ? 1 : 0;
    const st = new Int32Array(w * h), comp = [];
    const maxH = Math.max(hCar * 4, 80);
    for (let i = 0; i < w * h; i++) {
      if (ink[i] !== 1) continue;
      let sp = 0, x0 = w, x1 = 0, y0 = h, y1 = 0; comp.length = 0;
      st[sp++] = i; ink[i] = 2;
      while (sp) {
        const q = st[--sp], x = q % w, y = (q / w) | 0; comp.push(q);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && ink[q - 1] === 1) { ink[q - 1] = 2; st[sp++] = q - 1; }
        if (x < w - 1 && ink[q + 1] === 1) { ink[q + 1] = 2; st[sp++] = q + 1; }
        if (y > 0 && ink[q - w] === 1) { ink[q - w] = 2; st[sp++] = q - w; }
        if (y < h - 1 && ink[q + w] === 1) { ink[q + w] = 2; st[sp++] = q + w; }
      }
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      // troppo alta, oppure lunga e sottile ma non una riga di testo (bordi)
      if (ch > maxH || (cw > w * 0.6 && ch > hCar * 1.5) || (ch > hCar * 2.2 && cw < hCar * 0.45) || (cw > hCar * 6 && ch < hCar * 0.3 && cw > w * 0.3)) for (const q of comp) { const j = q * 4; d[j] = d[j + 1] = d[j + 2] = 255; }
    }
    ctx.putImageData(im, 0, 0);
    return bin;
  }

  /* 2. orientamento e inclinazione: le righe di testo danno un profilo "a pettine" */
  function profilo(bin) { // bin: canvas binario piccolo → punteggio righe orizzontali
    const d = bin.getContext('2d').getImageData(0, 0, bin.width, bin.height).data;
    const w = bin.width, h = bin.height, rows = new Float32Array(h);
    for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) if (d[(y * w + x) * 4] < 128) s++; rows[y] = s; }
    let sc = 0; for (let y = 1; y < h; y++) { const df = rows[y] - rows[y - 1]; sc += df * df; }
    return { sc: sc / (w * w), rows };
  }
  // base: 0 o 90 gradi, decisa dalla forma dei caratteri (dritti sono più alti che larghi)
  function stimaAngolo(c, base) {
    const p = maxLato(c, 700);
    const b = binarizza(p, Math.round(p.width / 18), 0.25);
    const prova = a => profilo(ruota(b, a)).sc;
    let best = base, bs = -1;
    for (let a = -24; a <= 24; a += 2) { const s = prova(base + a); if (s > bs) { bs = s; best = base + a; } }
    let fine = best;
    for (let a = best - 1.5; a <= best + 1.5; a += 0.5) { const s = prova(a); if (s > bs) { bs = s; fine = a; } }
    return { a: fine, sc: bs };
  }
  // altezza tipica dei caratteri (mediana delle macchie di inchiostro) per scegliere l'ingrandimento
  function altezzaCaratteri(c) {
    const p = maxLato(c, 1500), k = c.width / p.width;
    const b = binarizza(p, Math.round(Math.max(p.width, p.height) / 25), 0.25);
    const w = b.width, h = b.height, d = b.getContext('2d').getImageData(0, 0, w, h).data;
    const ink = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) ink[i] = d[i * 4] < 128 ? 1 : 0;
    const seen = new Uint8Array(w * h), st = new Int32Array(w * h), alt = [], rap = [];
    for (let i = 0; i < w * h; i++) {
      if (!ink[i] || seen[i]) continue;
      let sp = 0, n = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
      st[sp++] = i; seen[i] = 1;
      while (sp) {
        const q = st[--sp], x = q % w, y = (q / w) | 0; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && ink[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; st[sp++] = q - 1; }
        if (x < w - 1 && ink[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; st[sp++] = q + 1; }
        if (y > 0 && ink[q - w] && !seen[q - w]) { seen[q - w] = 1; st[sp++] = q - w; }
        if (y < h - 1 && ink[q + w] && !seen[q + w]) { seen[q + w] = 1; st[sp++] = q + w; }
      }
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      const mx = Math.max(cw, ch), mn = Math.min(cw, ch);
      if (mx >= 5 && mx <= 150 && mn >= mx * 0.25 && n >= 10 && n <= cw * ch * 0.9) { alt.push(ch); rap.push(cw / ch); }
    }
    if (alt.length < 15) return { h: 0, rapporto: 1, n: alt.length };
    alt.sort((a, b) => a - b); rap.sort((a, b) => a - b);
    // altezza: 70° percentile (maiuscole e cifre); rapporto larghezza/altezza: mediana
    return { h: alt[Math.floor(alt.length * 0.7)] * k, rapporto: rap[rap.length >> 1], n: alt.length };
  }

  /* pipeline completa → canvas pronto per Tesseract */
  function prepara(src, opz = {}) {
    let c = maxLato(src, 3200);
    const info = {};
    if (opz.ritaglio !== false) {
      const box = trovaCarta(c);
      if (box) { c = ritaglia(c, box); info.ritaglio = true; }
    }
    const car = altezzaCaratteri(c);
    info.rapporto = car.rapporto;
    let ang = opz.angolo;
    if (ang == null) {
      const dritto = stimaAngolo(c, 0);
      ang = dritto.a;
      // caratteri più larghi che alti: forse è girato; lo giro solo se anche le righe lo confermano
      if (car.rapporto > 1.15) { const girato = stimaAngolo(c, 90); if (girato.sc > dritto.sc) ang = girato.a; }
    }
    if (Math.abs(ang) >= 0.5) c = ruota(c, ang, '#fff');
    info.angolo = ang;
    // ingrandisco in modo che i caratteri siano alti ~32 px (ideale per Tesseract)
    const passo = Math.abs(ang) >= 0.5 ? altezzaCaratteri(c).h : car.h;
    // se non riesco a misurarli (foto piccola o sfocata) porto lo scontrino a ~1600 px di larghezza
    let k = passo ? 30 / passo : Math.max(1, 1600 / c.width);
    k = Math.max(0.35, Math.min(4, k));
    const lato = Math.max(c.width, c.height) * k;
    if (lato > 3600) k *= 3600 / lato;
    if (Math.abs(k - 1) > 0.08) c = scala(c, k);
    info.scala = k; info.passo = passo;
    const fin = Math.round(Math.max(31, Math.min(121, (passo ? passo * k : 32) * 2.5)));
    const out = pulisci(binarizza(c, fin, 0.2), passo ? passo * k : 32);
    const grigio = normalizza(c, fin);
    return { canvas: out, grigio, info };
  }

  window.Immagine = { prepara, ruota, ritaglia, maxLato };
})();
