/* =========================================================
   ocr.js — lettura di scontrini, fatture e ricevute
   Motore "locale": Tesseract.js (gratuito, gira nel telefono)
   Motore "avanzato": Google Gemini con la tua chiave (facoltativo)
   Restituisce { importo, data, fornitore, piva, prodotti[], categoria, testo }
   ========================================================= */
(function () {
  'use strict';

  const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  const caricati = {};
  function script(src) {
    if (!caricati[src]) caricati[src] = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => { delete caricati[src]; ko(new Error('Connessione assente: impossibile scaricare il motore di lettura')); };
      document.head.appendChild(s);
    });
    return caricati[src];
  }

  /* ---------- immagini ---------- */
  function fileToImage(file) {
    return new Promise((ok, ko) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { ok(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
      img.onerror = () => ko(new Error('Immagine non leggibile'));
      img.src = url;
    });
  }
  async function pdfToCanvas(file) {
    await script(PDFJS);
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await pdf.getPage(1);
    const vp0 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(3, 2000 / vp0.width) });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    // testo già presente nel PDF (fatture digitali): più preciso dell'OCR
    let testo = '';
    try {
      const tc = await page.getTextContent();
      const righe = {};
      tc.items.forEach(it => { const y = Math.round(it.transform[5] / 4); (righe[y] = righe[y] || []).push(it); });
      testo = Object.keys(righe).map(Number).sort((a, b) => b - a)
        .map(y => righe[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ')).join('\n');
    } catch (e) { /* no */ }
    return { canvas: c, testo };
  }
  function disegna(src, maxLato) {
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    const k = Math.min(1, maxLato / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function miniatura(src) { return disegna(src, 1100).toDataURL('image/jpeg', 0.72); }

  /* ---------- numeri e date ---------- */
  const RE_PREZZO = /(-?\d{1,3}(?:[.\s']\d{3})*\s?[.,]\s?\d{2}|-?\d+\s?[.,]\s?\d{2})(?!\d)/g;
  function num(s) {
    s = String(s).replace(/[\s']/g, '');
    const neg = s.startsWith('-');
    s = s.replace('-', '');
    const lc = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    if (lc < 0) return Number(s) * (neg ? -1 : 1);
    const v = Number(s.slice(0, lc).replace(/[.,]/g, '') + '.' + s.slice(lc + 1));
    return neg ? -v : v;
  }
  function prezziRiga(r) {
    const out = []; let m;
    RE_PREZZO.lastIndex = 0;
    while ((m = RE_PREZZO.exec(r))) out.push({ v: num(m[1]), i: m.index, s: m[0] });
    return out;
  }
  function trovaData(testo) {
    const re = /(\d{1,2})\s?[\/\-.]\s?(\d{1,2})\s?[\/\-.]\s?(\d{2,4})/g; let m;
    const oggi = new Date();
    while ((m = re.exec(testo))) {
      let g = +m[1], me = +m[2], a = +m[3];
      if (a < 100) a += 2000;
      if (me < 1 || me > 12 || g < 1 || g > 31 || a < 2000 || a > oggi.getFullYear() + 1) continue;
      return `${a}-${String(me).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
    }
    const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    const re2 = /(\d{1,2})\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*\.?\s+(\d{4})/i;
    const m2 = testo.match(re2);
    if (m2) return `${m2[3]}-${String(mesi.indexOf(m2[2].toLowerCase()) + 1).padStart(2, '0')}-${String(+m2[1]).padStart(2, '0')}`;
    return null;
  }

  /* ---------- categorie: parole chiave ---------- */
  const PAROLE = {
    alimentari: ['esselunga', 'coop', 'conad', 'carrefour', 'lidl', 'eurospin', 'aldi', 'iper', 'tigros', 'bennet', 'penny', 'md', 'pam', 'despar', 'crai', 'sigma', 'famila', 'unes', 'u2', 'il gigante', 'todis', 'in\'s', 'supermercat', 'ipermercat', 'alimentar', 'panetteri', 'panificio', 'macelleri', 'pescheri', 'fruttivendol', 'ortofrutt', 'latte', 'pane', 'pasta', 'formagg', 'yogurt', 'uova', 'biscott', 'acqua nat', 'acqua min', 'verdur', 'insalat', 'mozzarell', 'prosciutt', 'pollo', 'carne', 'bovino', 'suino', 'pesce', 'tonno', 'olio', 'caffe', 'zucchero', 'farina', 'riso', 'pomodor', 'banan', 'mele', 'patate', 'burro', 'salum', 'grana', 'parmigian', 'birra', 'vino', 'succo'],
    casa: ['ikea', 'leroy merlin', 'bricoman', 'brico', 'obi', 'tecnomat', 'acqua & sapone', 'acqua e sapone', 'tigota', 'tigotà', 'risparmio casa', 'maury', 'detersiv', 'carta igien', 'scottex', 'tovagliol', 'sapone', 'ammorbid', 'candeggin', 'sgrassat', 'lampadin', 'ferrament', 'mobil', 'pentol', 'spugn', 'sacchi', 'brillant'],
    utenze: ['enel', 'a2a', 'plenitude', 'edison', 'hera', 'iren', 'acea', 'sorgenia', 'engie', 'tim', 'vodafone', 'windtre', 'wind', 'iliad', 'fastweb', 'ho.', 'very mobile', 'bollett', 'fornitura', 'energia elettr', 'gas naturale', 'kwh', 'smc', 'canone', 'servizio idrico', 'tari'],
    trasporti: ['esso', 'eni', 'agip', 'enilive', 'q8', 'ip', 'tamoil', 'api', 'shell', 'carburant', 'benzina', 'gasolio', 'diesel', 'super s/pb', 'self service', 'erogatore', 'litri', 'autostrad', 'telepass', 'parchegg', 'trenitalia', 'trenord', 'italo', 'atm', 'pedagg', 'officina', 'pneumatic', 'gomme', 'autolavagg', 'revision', 'bollo auto', 'assicuraz'],
    salute: ['farmacia', 'parafarmac', 'ticket', 'medic', 'tachipirin', 'ospedal', 'dentist', 'odontoiatr', 'poliambulat', 'analisi clin', 'ottica', 'lloyds', 'sanitar', 'fisioterap', 'ricetta', 'mg', 'compresse', 'cerott'],
    abbigliamento: ['zara', 'h&m', 'ovs', 'calzedonia', 'intimissimi', 'tezenis', 'primark', 'bershka', 'pull&bear', 'kiabi', 'benetton', 'coin', 'upim', 'piazza italia', 'scarpe', 'calzatur', 'maglia', 'magliett', 'pantalon', 'giacca', 'giubbott', 'calze', 'camicia', 'felpa', 'jeans', 'abbigliam'],
    ristoranti: ['ristorant', 'pizzeri', 'trattori', 'osteri', 'bar', 'caffetteri', 'pasticceri', 'gelateri', 'mcdonald', 'burger king', 'autogrill', 'old wild west', 'roadhouse', 'sushi', 'kebab', 'piadineri', 'coperto', 'pub', 'birreri', 'aperitiv', 'cappuccin', 'brioche', 'cornetto', 'tavola calda', 'just eat', 'deliveroo', 'glovo'],
    svago: ['cinema', 'uci', 'the space', 'teatro', 'netflix', 'spotify', 'disney', 'prime video', 'dazn', 'sky', 'feltrinelli', 'mondadori', 'libreri', 'giunti', 'gamestop', 'playstation', 'nintendo', 'steam', 'museo', 'concert', 'ticketone', 'luna park', 'parco divert', 'hotel', 'albergo', 'booking', 'airbnb'],
    sport: ['decathlon', 'cisalfa', 'sportler', 'palestr', 'piscin', 'skipass', 'ski pass', 'impianti', 'noleggio sci', 'tesseram', 'iscrizion gara', 'integrator', 'proteine', 'bicicl', 'ciclo', 'running'],
    istruzione: ['universit', 'ateneo', 'scuola', 'cancelleri', 'quadern', 'penne', 'libro di testo', 'libri scolast', 'corso', 'retta', 'tasse universit', 'iscrizione anno', 'master'],
    tecnologia: ['mediaworld', 'unieuro', 'euronics', 'expert', 'trony', 'comet', 'apple', 'amazon', 'samsung', 'xiaomi', 'cavo', 'caricator', 'usb', 'cuffie', 'auricolar', 'smartphone', 'notebook', 'stampant', 'cartucc', 'toner', 'hdmi'],
    animali: ['arcaplanet', 'isola dei tesori', 'zooplus', 'maxi zoo', 'veterinar', 'crocchett', 'lettiera', 'pet', 'cane', 'gatto', 'antiparassit'],
    regali: ['regalo', 'regali', 'fiori', 'fiorist', 'gioielleri', 'pandora', 'profumeri', 'douglas', 'sephora', 'kiko', 'giocattol', 'toys', 'bomboniere', 'biglietto auguri']
  };
  const RE_CAT = {};
  Object.keys(PAROLE).forEach(k => {
    RE_CAT[k] = PAROLE[k].map(w => {
      const e = w.replace(/[.*+?^${}()|[\]\\&]/g, m => '\\' + m);
      return new RegExp('(^|[^a-zà-ù])' + e + (w.length <= 4 ? '(?![a-zà-ù])' : ''), 'i');
    });
  });
  function indovinaCategoria(fornitore, prodotti, testo, idsDisponibili) {
    const punti = {};
    const somma = (k, s, peso) => RE_CAT[k].forEach(re => { if (re.test(s)) punti[k] = (punti[k] || 0) + peso; });
    Object.keys(RE_CAT).forEach(k => {
      if (fornitore) somma(k, fornitore, 5);
      prodotti.forEach(p => somma(k, p.nome, 1));
      somma(k, (testo || '').slice(0, 400), 1);
    });
    const best = Object.keys(punti).filter(k => idsDisponibili.includes(k)).sort((a, b) => punti[b] - punti[a])[0];
    return best || (idsDisponibili.includes('altro') ? 'altro' : idsDisponibili[0]);
  }

  /* ---------- analisi del testo ---------- */
  const CATENE = ['Esselunga', 'Coop', 'Conad', 'Carrefour', 'Lidl', 'Eurospin', 'Aldi', 'Iper', 'Tigros', 'Bennet', 'Penny Market', 'Pam', 'Despar', 'Crai', 'Famila', 'Unes', 'Il Gigante', 'Todis', 'MD',
    'Esso', 'Eni', 'Enilive', 'Q8', 'Tamoil', 'Shell', 'IP', 'Decathlon', 'IKEA', 'Leroy Merlin', 'Bricoman', 'Brico', 'OBI', 'Tigotà', 'Acqua & Sapone', 'MediaWorld', 'Unieuro', 'Euronics', 'Expert', 'Amazon',
    'Zara', 'H&M', 'OVS', 'Calzedonia', 'Intimissimi', 'Primark', 'McDonald\'s', 'Burger King', 'Autogrill', 'Feltrinelli', 'Mondadori', 'Arcaplanet', 'Douglas', 'Sephora', 'Kiko', 'Enel', 'A2A', 'Hera', 'Iren', 'TIM', 'Vodafone', 'Iliad', 'Fastweb', 'Trenitalia', 'Trenord'];
  const NO_PROD = /(sub\s?tot|totale|\btot\.|importo|\biva\b|imponibile|imposta|aliquota|\bresto\b|contant|\bcarta\s+(di\s+)?(credito|debito)|bancomat|pagamento|elettronic|sconto\s*(totale|fidelity)|arrotond|n\.?\s*pezzi|\barticoli\b|scontrino|documento|fiscale|p\.?\s?iva|\bc\.?\s?f\.?\s|\bcassa\b|operatore|transaz|autorizz|\beuro\b|\beur\b|\bdata\b|\bora\b|\btel\b|\bvia\b|\bviale\b|\bpiazza\b|\bcorso\b|www|grazie|arrivederci|\bpunti\b|\bsaldo\b|\brt\b|matricola|\bcod\.|codice|\bresi\b|visa|mastercard|maestro|contactless|acquirer|\bstan\b|terminale|esercente|da pagare|\bnetto\b|pagato|totali)/i;

  // versione della riga per cercare le parole chiave, tollerante agli errori tipici dell'OCR (T0TALE, TOTA1E, 5CONTO)
  function chiave(r) {
    return r.toLowerCase()
      .replace(/([a-zà-ù])0|0([a-zà-ù])/g, (m, a, b) => (a || '') + 'o' + (b || ''))
      .replace(/([a-zà-ù])[1|!]|[1|!]([a-zà-ù])/g, (m, a, b) => (a || '') + 'l' + (b || ''))
      .replace(/([a-zà-ù])5|5([a-zà-ù])/g, (m, a, b) => (a || '') + 's' + (b || ''))
      .replace(/tota[il1]e|t0tale|totaie|tqtale|totalf/g, 'totale');
  }
  function pulisciNome(n) {
    return n.replace(/^[^a-zà-ù0-9]+/i, '').replace(/^[il|!]\s+(?=[a-zà-ù]{3})/i, '').replace(/[^a-zà-ù0-9%.)]+$/i, '').trim();
  }
  function analizza(testo, idsCat) {
    const righe = testo.split(/\r?\n/).map(r => r.replace(/\s+/g, ' ').replace(/^[|!'‘’"“”`.,:;_-]+\s*/, '').trim()).filter(r => r.length > 1);
    const minus = chiave(testo);

    // totale
    const PRIO = [
      [/totale\s+complessivo|importo\s+pagato|totale\s+(da\s+)?pagare|netto\s+a\s+pagare|totale\s+documento|totale\s+fattura|totale\s+euro|totale\s+eur|tot\.?\s*euro/i, 10],
      [/\btotale\b|\btot\b|\btot\./i, 7],
      [/importo|da\s+pagare|pagato|pagamento\s+elettronico|addebito/i, 4]
    ];
    const ESCL = /sub\s?tot|iva|imponibile|imposta|sconti?\b|resto|pezzi|articoli|risparmi|punti|n\.\s*\d/i;
    let cand = [];
    righe.forEach((r, i) => {
      for (const [re, sc] of PRIO) {
        const kr = chiave(r);
        if (!re.test(kr) || ESCL.test(kr)) continue;
        let pr = prezziRiga(r);
        if (!pr.length && righe[i + 1]) pr = prezziRiga(righe[i + 1]);
        if (pr.length) cand.push({ v: pr[pr.length - 1].v, sc, i });
        break;
      }
    });
    cand = cand.filter(c => c.v > 0 && c.v < 100000);
    let importo = null;
    if (cand.length) {
      // stesso valore su più righe (TOTALE, PAGAMENTO, IMPORTO PAGATO) = più affidabile
      const peso = {};
      cand.forEach(c => { peso[c.v] = (peso[c.v] || 0) + c.sc; });
      importo = Number(Object.keys(peso).sort((a, b) => peso[b] - peso[a] || b - a)[0]);
    } else {
      const tutti = [];
      righe.forEach(r => { if (!/contant|resto|carta|bancomat|iva|imponibile/i.test(r)) prezziRiga(r).forEach(p => tutti.push(p.v)); });
      if (tutti.length) importo = Math.max(...tutti.filter(v => v > 0 && v < 100000));
    }
    if (!isFinite(importo)) importo = null;

    // fornitore
    let fornitore = null;
    for (const c of CATENE) {
      // lettere che l'OCR confonde spesso: i/l/1, o/0, s/5, e/c
      const e = c.toLowerCase().split('').map(ch => ({ i: '[il1|!]', l: '[il1|!]', o: '[o0]', s: '[s5]', e: '[ec]', '.': '\\.?', ' ': '\\s?', "'": ".?" }[ch] || ch.replace(/[*+?^${}()|[\]\\&]/g, m => '\\' + m))).join('');
      const re = new RegExp('(^|[^a-z])' + e + (c.length <= 4 ? '(?![a-z])' : ''), 'i');
      const testa = righe.slice(0, 8).join('\n');
      if (re.test(testa) || (c.length > 4 && re.test(testo))) { fornitore = c; break; }
    }
    if (!fornitore) {
      for (const r of righe.slice(0, 7)) {
        const lettere = (r.match(/[a-zà-ù]/gi) || []).length;
        if (lettere < 3 || lettere / r.length < 0.5) continue;
        if (/documento|commerciale|scontrino|fattura\b|ricevuta|^via |p\.?\s?iva|tel|www|vendita|benvenut|^data/i.test(r)) continue;
        fornitore = r.replace(/[^\wà-ù&'.\-\s]/gi, '').trim().replace(/\b\w/g, l => l.toUpperCase()).slice(0, 60);
        break;
      }
    }
    const piva = (testo.match(/(?:p\.?\s?iva|partita\s+iva|vat)[^\d]{0,6}(?:it)?\s?(\d{11})/i) || [])[1] || null;

    // prodotti: righe con descrizione + prezzo, prima del totale
    const fine = cand.length ? Math.min(...cand.map(c => c.i)) : righe.length;
    const prodotti = [];
    righe.slice(0, fine).forEach(r => {
      if (NO_PROD.test(chiave(r)) || /\d[.,]\d{2}\s*(l|lt|litri)\b/i.test(r)) return;
      const pr = prezziRiga(r);
      if (!pr.length) return;
      const ult = pr[pr.length - 1];
      let nome = r.slice(0, pr.length > 1 && /\d\s*[xX*]\s*\d/.test(r) ? pr[0].i : ult.i)
        .replace(/\s+\d{1,2}\s?%.*$/, '').replace(/\b\d+\s*[xX*]\s*$/, '').replace(/[€*#|]+/g, ' ').replace(/\s+/g, ' ').trim();
      const lettere = (nome.match(/[a-zà-ù]/gi) || []).length;
      if (lettere < 2) return;
      if (/^\d+\s*[xX*]/.test(nome) && prodotti.length) { // riga "2 x 1,20" riferita al prodotto precedente
        prodotti[prodotti.length - 1].prezzo = ult.v; return;
      }
      if (ult.v === 0 || Math.abs(ult.v) > 10000) return;
      nome = pulisciNome(nome.replace(/\s+[A-Z]$/, '')).slice(0, 60);
      if ((nome.match(/[a-zà-ù]/gi) || []).length < 2) return;
      prodotti.push({ nome: nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase(), prezzo: ult.v });
    });

    const data = trovaData(testo);
    const categoria = indovinaCategoria(fornitore, prodotti, testo, idsCat);
    return { importo, data, fornitore, piva, prodotti: prodotti.slice(0, 80), categoria, testo };
  }

  /* ---------- motori ---------- */
  let worker = null;
  async function preparaWorker(avanzamento) {
    await script(TESSERACT);
    if (!worker) {
      avanzamento && avanzamento('Preparo il lettore (solo la prima volta)…', 0);
      worker = await Tesseract.createWorker('ita', 1, {
        logger: m => { if (m.status === 'recognizing text' && avanzamento && avanzamento.fase) avanzamento(avanzamento.fase, m.progress); }
      });
    }
    return worker;
  }
  async function riconosci(canvas, psm, avanzamento, fase) {
    const w = await preparaWorker(avanzamento);
    if (avanzamento) avanzamento.fase = fase;
    await w.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: String(psm), user_defined_dpi: '300' });
    const r = await w.recognize(canvas);
    return { testo: r.data.text || '', conf: r.data.confidence || 0 };
  }
  // quanto "sembra uno scontrino" il testo letto: serve a scegliere il tentativo migliore
  function qualita(t, conf) {
    const prezzi = (t.match(/\d[.,]\s?\d{2}(?!\d)/g) || []).length;
    const parole = (t.match(/\b(totale|iva|euro|documento|commerciale|pagamento|subtotale|contanti|resto|importo|fattura|ricevuta)\b/gi) || []).length;
    return conf + Math.min(prezzi, 25) * 2 + parole * 6;
  }
  async function tesseract(sorgente, avanzamento, opz = {}) {
    await preparaWorker(avanzamento);
    avanzamento && avanzamento('Raddrizzo e pulisco la foto…', 0);
    await new Promise(r => setTimeout(r, 30));
    const prep = window.Immagine.prepara(sorgente, opz);
    let best = await riconosci(prep.canvas, 6, avanzamento, 'Leggo lo scontrino…');
    best.q = qualita(best.testo, best.conf);
    // poco convincente: provo capovolto e con un'altra segmentazione
    if (best.conf < 70) {
      const tentativi = [
        () => riconosci(prep.grigio, 6, avanzamento, 'Secondo tentativo…'),
        () => riconosci(window.Immagine.ruota(prep.canvas, 180), 6, avanzamento, 'Provo a capovolgerlo…'),
        () => riconosci(prep.canvas, 4, avanzamento, 'Ultimo tentativo…')
      ];
      for (const t of tentativi) {
        const r = await t(); r.q = qualita(r.testo, r.conf);
        if (window.FC_DEBUG) console.log('DBG tentativo', Math.round(r.conf), Math.round(r.q), 'vs', Math.round(best.q));
        if (r.q > best.q) best = r;
        if (best.conf >= 75) break;
      }
    }
    return { testo: best.testo, conf: best.conf, info: prep.info };
  }

  async function gemini(canvas, cfg, categorie) {
    const b64 = disegna(canvas, 1600).toDataURL('image/jpeg', 0.85).split(',')[1];
    const elenco = categorie.map(c => `${c.id} (${c.nome})`).join(', ');
    const prompt = 'Sei un lettore di scontrini, fatture e ricevute italiane. Estrai i dati e rispondi SOLO con JSON: ' +
      '{"importo": numero totale pagato in euro, "data": "AAAA-MM-GG" o null, "fornitore": nome del negozio/azienda, "piva": partita IVA o null, ' +
      '"prodotti": [{"nome": descrizione leggibile, "prezzo": numero}], "categoria": uno di questi id: ' + elenco + '}. ' +
      'Usa il punto come separatore decimale. Ignora righe di IVA, resto e pagamento.';
    const model = (cfg.geminiModel || 'gemini-2.5-flash').trim();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.geminiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 }
      })
    });
    if (!res.ok) throw new Error('Gemini: errore ' + res.status + (res.status === 400 || res.status === 403 ? ' (controlla la chiave)' : ''));
    const j = await res.json();
    const txt = j.candidates && j.candidates[0] && j.candidates[0].content.parts.map(p => p.text || '').join('');
    const o = JSON.parse(txt.replace(/^```json|```$/g, ''));
    const ids = categorie.map(c => c.id);
    const prodotti = (o.prodotti || []).filter(p => p && p.nome).map(p => ({ nome: String(p.nome).slice(0, 60), prezzo: Number(p.prezzo) || 0 }));
    return {
      importo: Number(o.importo) || null,
      data: /^\d{4}-\d{2}-\d{2}$/.test(o.data || '') ? o.data : null,
      fornitore: o.fornitore || null, piva: o.piva || null, prodotti,
      categoria: ids.includes(o.categoria) ? o.categoria : indovinaCategoria(o.fornitore, prodotti, '', ids),
      testo: ''
    };
  }

  /* API pubblica: leggi(file, impostazioni, categorie, avanzamento) */
  async function leggi(file, cfg, categorie, avanzamento, opz = {}) {
    const ids = categorie.map(c => c.id);
    let sorgente, testoPdf = '';
    if (file instanceof HTMLCanvasElement || file instanceof HTMLImageElement) {
      sorgente = file;
    } else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      avanzamento && avanzamento('Apro il PDF…', 0);
      const p = await pdfToCanvas(file);
      sorgente = p.canvas; testoPdf = p.testo;
    } else {
      sorgente = await fileToImage(file);
    }
    const foto = miniatura(sorgente);
    let dati;
    if (cfg.ocrMotore === 'gemini' && cfg.geminiKey) {
      try {
        avanzamento && avanzamento('Riconoscimento avanzato in corso…', 0.3);
        dati = await gemini(sorgente, cfg, categorie);
      } catch (e) {
        avanzamento && avanzamento('Avanzato non riuscito, uso il lettore locale…', 0);
        dati = null;
      }
    }
    if (!dati) {
      let testo, conf = 90, info = {};
      if (testoPdf.replace(/\s/g, '').length > 40) testo = testoPdf;
      else ({ testo, conf, info } = await tesseract(sorgente, avanzamento, opz));
      dati = analizza(testo, ids);
      dati.conf = conf;
      // lettura troppo povera: meglio campi vuoti che dati inventati
      dati.illeggibile = !dati.importo && dati.prodotti.length < 2 || conf < 40 && !dati.importo;
      if (dati.illeggibile) { dati.fornitore = CATENE.find(c => new RegExp('\\b' + c + '\\b', 'i').test(testo)) || null; dati.prodotti = []; dati.importo = null; }
      dati.lontana = info.passo && info.passo < 10; // caratteri piccolissimi nella foto
      if (!dati.illeggibile && dati.importo) {
        // il totale non può essere più piccolo del prodotto più caro
        const maxP = Math.max(0, ...dati.prodotti.map(p => p.prezzo));
        if (maxP > dati.importo * 1.01) dati.dubbio = true;
      }
    }
    dati.foto = foto;
    return dati;
  }

  // apre un file (immagine o PDF) o una foto salvata e restituisce qualcosa di disegnabile
  async function carica(f) {
    if (typeof f === 'string') { const img = new Image(); img.src = f; await img.decode(); return img; }
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')) return (await pdfToCanvas(f)).canvas;
    return fileToImage(f);
  }
  window.OCR = { leggi, analizza, indovinaCategoria, carica, miniatura: f => carica(f).then(miniatura) };
})();
