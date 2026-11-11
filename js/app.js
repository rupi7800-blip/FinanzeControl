/* =========================================================
   FinanzeControl — app.js
   Spese personali/familiari, lettura scontrini, categorie,
   torta, alert di spesa massima, analisi consuntive.
   Tutti i dati restano sul dispositivo (IndexedDB + localStorage).
   ========================================================= */
(function () {
  'use strict';

  /* ---------- utilità ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = v => (Number(v) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  const eur0 = v => (Number(v) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const oggi = () => ymd(new Date());
  const meseDi = s => s.slice(0, 7);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const MESI_B = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const nomeMese = m => { const [a, mm] = m.split('-').map(Number); return MESI[mm - 1] + ' ' + a; };
  const addMesi = (m, n) => { const [a, mm] = m.split('-').map(Number); const d = new Date(a, mm - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const dataLunga = s => new Date(s + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const parseImporto = s => { s = String(s).trim().replace(/[€\s]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const v = parseFloat(s); return isFinite(v) ? Math.round(v * 100) / 100 : 0; };
  const fmtIn = v => v ? String(v.toFixed(2)).replace('.', ',') : '';
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9à-ù]/g, '');

  let toastT = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600);
  }

  /* ---------- impostazioni ---------- */
  const CATEGORIE_BASE = [
    { id: 'alimentari', nome: 'Alimentari', icona: '🛒', colore: '#3ddc97', budget: 0 },
    { id: 'casa', nome: 'Casa', icona: '🏠', colore: '#7cc4ff', budget: 0 },
    { id: 'utenze', nome: 'Bollette e utenze', icona: '💡', colore: '#f5b83d', budget: 0 },
    { id: 'trasporti', nome: 'Auto e trasporti', icona: '⛽', colore: '#ff6f5b', budget: 0 },
    { id: 'salute', nome: 'Salute', icona: '💊', colore: '#e879a6', budget: 0 },
    { id: 'abbigliamento', nome: 'Abbigliamento', icona: '👕', colore: '#a78bfa', budget: 0 },
    { id: 'ristoranti', nome: 'Ristoranti e bar', icona: '🍽️', colore: '#fb923c', budget: 0 },
    { id: 'svago', nome: 'Svago e viaggi', icona: '🎬', colore: '#22c1c3', budget: 0 },
    { id: 'sport', nome: 'Sport', icona: '🎿', colore: '#2f9e44', budget: 0 },
    { id: 'istruzione', nome: 'Istruzione', icona: '📚', colore: '#5c7cfa', budget: 0 },
    { id: 'tecnologia', nome: 'Tecnologia', icona: '💻', colore: '#495057', budget: 0 },
    { id: 'animali', nome: 'Animali', icona: '🐾', colore: '#c0884e', budget: 0 },
    { id: 'regali', nome: 'Regali', icona: '🎁', colore: '#f06595', budget: 0 },
    { id: 'altro', nome: 'Altro', icona: '📦', colore: '#adb5bd', budget: 0 }
  ];
  const BASE = {
    categorie: CATEGORIE_BASE,
    budgetMensile: 0,
    soglia: 80,
    avvisoSchermo: true,
    notifiche: false,
    ambitoDefault: 'personale',
    ocrMotore: 'locale',
    geminiKey: '',
    geminiModel: 'gemini-2.5-flash',
    backupFoto: false,
    analisi: {
      periodo: 'mese', da: '', a: '', ambito: 'tutte', confronto: true, gruppo: 'auto',
      sezioni: { riepilogo: true, torta: true, andamento: true, budget: true, ambiti: true, fornitori: true, prodotti: true }
    }
  };
  const KEY = 'fc.impostazioni';
  let S = carica();
  function carica() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY));
      if (o) return Object.assign({}, BASE, o, { analisi: Object.assign({}, BASE.analisi, o.analisi, { sezioni: Object.assign({}, BASE.analisi.sezioni, (o.analisi || {}).sezioni) }) });
    } catch (e) { /* no */ }
    return JSON.parse(JSON.stringify(BASE));
  }
  function salvaS() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Spazio pieno: impostazioni non salvate'); } }
  const cat = id => S.categorie.find(c => c.id === id) || S.categorie.find(c => c.id === 'altro') || { id, nome: 'Altro', icona: '📦', colore: '#adb5bd', budget: 0 };

  /* ---------- stato ---------- */
  let spese = [];
  let mese = meseDi(oggi());
  let ambito = 'tutte';
  let vista = 'mese';
  let cerca = '';

  const filtraAmbito = (arr, a) => a === 'tutte' ? arr : arr.filter(s => s.ambito === a);
  const delMese = (m, a = ambito) => filtraAmbito(spese.filter(s => meseDi(s.data) === m), a);
  const somma = arr => Math.round(arr.reduce((t, s) => t + (s.importo || 0), 0) * 100) / 100;
  function perCategoria(arr) {
    const m = {};
    arr.forEach(s => { m[s.categoria] = (m[s.categoria] || 0) + s.importo; });
    return Object.keys(m).map(id => { const c = cat(id); return { id, label: c.nome, value: Math.round(m[id] * 100) / 100, color: c.colore, icona: c.icona }; })
      .sort((a, b) => b.value - a.value);
  }

  /* ---------- budget e alert ---------- */
  // i limiti valgono su tutte le spese del mese (personali + familiari)
  function livello(speso, budget) {
    if (!budget) return 'nessuno';
    const p = speso / budget * 100;
    return p >= 100 ? 'bad' : p >= S.soglia ? 'warn' : 'ok';
  }
  function statoBudget(m) {
    const arr = spese.filter(s => meseDi(s.data) === m);
    const out = S.categorie.filter(c => c.budget > 0).map(c => {
      const sp = somma(arr.filter(s => s.categoria === c.id));
      return { c, speso: sp, budget: c.budget, perc: sp / c.budget * 100, liv: livello(sp, c.budget) };
    });
    const tot = somma(arr);
    return { cat: out, tot: { speso: tot, budget: S.budgetMensile, perc: S.budgetMensile ? tot / S.budgetMensile * 100 : 0, liv: livello(tot, S.budgetMensile) } };
  }
  const PESO = { nessuno: 0, ok: 0, warn: 1, bad: 2 };
  function controllaAlert(prima, dopo, catId) {
    const avvisi = [];
    const a = prima.cat.find(x => x.c.id === catId), b = dopo.cat.find(x => x.c.id === catId);
    if (b && PESO[b.liv] > PESO[a ? a.liv : 'ok']) avvisi.push({ nome: b.c.icona + ' ' + b.c.nome, ...b });
    if (PESO[dopo.tot.liv] > PESO[prima.tot.liv]) avvisi.push({ nome: '💶 Budget mensile totale', ...dopo.tot });
    if (avvisi.length) mostraAlert(avvisi);
  }
  function mostraAlert(lista) {
    const grave = lista.some(x => x.liv === 'bad');
    const titolo = grave ? 'Spesa massima superata' : 'Ti stai avvicinando al limite';
    const corpo = x => `${x.nome}: ${eur(x.speso)} su ${eur(x.budget)} (${Math.round(x.perc)}%)`;
    if (S.avvisoSchermo) {
      const m = $('#alertModal');
      m.innerHTML = `<div class="alert-box"><div class="big">${grave ? '🚨' : '⚠️'}</div><h3>${titolo}</h3>
        ${lista.map(x => `<p style="margin:10px 0 4px">${esc(corpo(x))}</p><div class="bar"><i class="${x.liv}" style="width:${Math.min(100, x.perc)}%"></i></div>`).join('')}
        <div class="btns"><button class="btn" id="alertOk">Ho capito</button></div></div>`;
      m.hidden = false;
      $('#alertOk').onclick = () => m.hidden = true;
    }
    if (S.notifiche && 'Notification' in window && Notification.permission === 'granted') {
      const opts = { body: lista.map(corpo).join('\n'), icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'fc-alert' };
      navigator.serviceWorker && navigator.serviceWorker.controller
        ? navigator.serviceWorker.ready.then(r => r.showNotification(titolo, opts)).catch(() => {})
        : new Notification(titolo, opts);
    }
  }

  /* ---------- navigazione ---------- */
  function vai(v) {
    vista = v;
    $$('.tabbar [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
    const conMese = v !== 'impost';
    $('#mesebar').style.display = conMese ? '' : 'none';
    $('#filtroAmbito').style.display = (v === 'mese' || v === 'spese') ? '' : 'none';
    $('#sottotitolo').textContent = { mese: 'Spese del mese', spese: 'Elenco spese', analisi: 'Analisi consuntive', impost: 'Impostazioni' }[v];
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    $('#meseLabel').textContent = nomeMese(mese);
    if (vista === 'mese') renderMese();
    else if (vista === 'spese') renderSpese();
    else if (vista === 'analisi') renderAnalisi();
    else renderImpost();
  }

  /* ---------- vista MESE ---------- */
  function renderMese() {
    const v = $('#v-mese');
    const arr = delMese(mese);
    const tot = somma(arr);
    const prec = somma(delMese(addMesi(mese, -1)));
    const st = statoBudget(mese);
    const diff = prec ? (tot - prec) / prec * 100 : null;
    const [a, mm] = mese.split('-').map(Number);
    const giorniMese = new Date(a, mm, 0).getDate();
    const giorniPassati = mese === meseDi(oggi()) ? new Date().getDate() : giorniMese;
    let h = `<div class="card hero">
      <div class="lbl">Speso a ${MESI[mm - 1]}${ambito !== 'tutte' ? ' · ' + (ambito === 'personale' ? 'personali' : 'familiari') : ''}</div>
      <div class="tot">${eur(tot)}</div>
      <div class="row">
        <span class="pill">🧾 ${arr.length} spese</span>
        <span class="pill">📅 ${eur(tot / Math.max(1, giorniPassati))}/giorno</span>
        ${diff != null ? `<span class="pill">${diff > 0 ? '▲' : '▼'} ${Math.abs(Math.round(diff))}% vs ${MESI_B[(mm + 10) % 12]}</span>` : ''}
      </div>
      ${S.budgetMensile ? `<div style="margin-top:12px;font-size:13px;opacity:.85">Budget totale ${eur(st.tot.speso)} di ${eur(S.budgetMensile)} · restano ${eur(Math.max(0, S.budgetMensile - st.tot.speso))}</div>
      <div class="bar"><i class="${st.tot.liv}" style="width:${Math.min(100, st.tot.perc)}%"></i></div>` : ''}
    </div>`;

    const allarmi = st.cat.filter(x => x.liv === 'warn' || x.liv === 'bad').sort((x, y) => y.perc - x.perc);
    if (st.tot.liv === 'warn' || st.tot.liv === 'bad') allarmi.unshift({ c: { icona: '💶', nome: 'Budget totale' }, ...st.tot });
    if (allarmi.length) {
      h += `<div class="alerts">${allarmi.map(x => `<div class="al ${x.liv}"><span>${x.liv === 'bad' ? '🚨' : '⚠️'}</span><div>
        <b>${esc(x.c.icona + ' ' + x.c.nome)}: ${Math.round(x.perc)}%</b>${eur(x.speso)} su ${eur(x.budget)}${x.liv === 'bad' ? ` · superato di ${eur(x.speso - x.budget)}` : ` · restano ${eur(x.budget - x.speso)}`}</div></div>`).join('')}</div>`;
    }

    h += `<div class="card"><h3>Spese per categoria <small>tocca per dettagli</small></h3><div id="tortaMese"></div></div>`;

    if (st.cat.length) {
      h += `<div class="card"><h3>Spesa massima per categoria <small>tutte le spese</small></h3>` +
        st.cat.sort((x, y) => y.perc - x.perc).map(x => `<div class="cat-row"><div class="h"><span>${x.c.icona} ${esc(x.c.nome)}</span>
        <span><b>${eur0(x.speso)}</b> <small>/ ${eur0(x.budget)}</small></span></div>
        <div class="bar"><i class="${x.liv}" style="width:${Math.min(100, x.perc)}%"></i></div></div>`).join('') + `</div>`;
    } else {
      h += `<div class="card"><h3>Spesa massima per categoria</h3><p class="hint">Imposta un limite mensile per le categorie e riceverai un avviso al ${S.soglia}% e quando lo superi.</p>
        <button class="btn sec sm" data-go="impost">Imposta i limiti</button></div>`;
    }

    const ultime = arr.slice().sort((x, y) => y.data.localeCompare(x.data) || (y.creata || 0) - (x.creata || 0)).slice(0, 5);
    h += `<div class="card"><h3>Ultime spese ${arr.length > 5 ? '<button class="btn sec sm" data-go="spese">Tutte</button>' : ''}</h3>
      ${ultime.length ? '<div class="list">' + ultime.map(riga).join('') + '</div>' : vuoto()}</div>`;
    v.innerHTML = h;
    const dati = perCategoria(arr);
    $('#tortaMese').appendChild(dati.length ? Grafici.torta(dati, { etichetta: 'Totale mese' }) : document.createRange().createContextualFragment('<p class="hint">Nessuna spesa in questo mese.</p>'));
    legaRighe(v);
  }
  const vuoto = () => `<div class="empty"><div class="e">🧾</div><p>Nessuna spesa. Tocca <b>+</b> per fotografare uno scontrino o inserirla a mano.</p></div>`;
  function riga(s) {
    const c = cat(s.categoria);
    return `<button class="item" data-id="${s.id}"><span class="ic" style="background:${c.colore}22">${c.icona}</span>
      <span class="t"><b>${esc(s.fornitore || c.nome)}</b><small>${esc(c.nome)} · ${new Date(s.data + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
      ${s.ambito === 'familiare' ? '<span class="tag fam">Familiare</span>' : '<span class="tag">Personale</span>'}${s.haFoto ? ' 📷' : ''}</small></span>
      <span class="v">${eur(s.importo)}</span></button>`;
  }
  function legaRighe(r) {
    $$('.item[data-id]', r).forEach(b => b.onclick = () => apriEditor(spese.find(s => s.id === b.dataset.id)));
    $$('[data-go]', r).forEach(b => b.onclick = () => vai(b.dataset.go));
  }

  /* ---------- vista SPESE ---------- */
  function renderSpese() {
    const v = $('#v-spese');
    const q = cerca.trim().toLowerCase();
    let arr = q ? filtraAmbito(spese, ambito).filter(s => [s.fornitore, s.note, cat(s.categoria).nome, ...(s.prodotti || []).map(p => p.nome)].join(' ').toLowerCase().includes(q)) : delMese(mese);
    arr = arr.slice().sort((x, y) => y.data.localeCompare(x.data) || (y.creata || 0) - (x.creata || 0));
    let h = `<input class="search" id="cerca" type="search" placeholder="Cerca fornitore, prodotto, nota…" value="${esc(cerca)}">
      ${q ? `<p class="hint">Risultati in tutti i mesi: ${arr.length} spese · ${eur(somma(arr))}</p>` : `<p class="hint">${arr.length} spese · ${eur(somma(arr))}</p>`}`;
    if (!arr.length) h += vuoto();
    else {
      h += '<div class="list">';
      let g = '';
      arr.forEach(s => {
        if (s.data !== g) {
          g = s.data;
          const tg = somma(arr.filter(x => x.data === g));
          h += `<div class="day">${dataLunga(g)} · ${eur(tg)}</div>`;
        }
        h += riga(s);
      });
      h += '</div>';
    }
    v.innerHTML = h;
    const inp = $('#cerca');
    inp.oninput = () => { cerca = inp.value; const pos = inp.selectionStart; renderSpese(); const n = $('#cerca'); n.focus(); n.setSelectionRange(pos, pos); };
    legaRighe(v);
  }

  /* ---------- EDITOR spesa ---------- */
  let ed = null;
  function nuovaSpesa() {
    return { id: uid(), data: mese === meseDi(oggi()) ? oggi() : mese + '-01', importo: 0, categoria: 'alimentari', fornitore: '', piva: '', prodotti: [], ambito: S.ambitoDefault, note: '', haFoto: false, creata: Date.now() };
  }
  function apriEditor(sp, opz = {}) {
    ed = { ...JSON.parse(JSON.stringify(sp)), _nuova: !!opz.nuova, _foto: opz.foto || null, _ocr: opz.ocr || null };
    if (!S.categorie.some(c => c.id === ed.categoria)) ed.categoria = 'altro';
    $('#editorBg').hidden = false;
    document.body.style.overflow = 'hidden';
    renderEditor();
    if (ed.haFoto && !ed._foto) DB.foto(ed.id).then(f => { if (ed && f) { ed._foto = f; renderEditor(); } });
  }
  function chiudiEditor() { $('#editorBg').hidden = true; document.body.style.overflow = ''; ed = null; rifaiFoto = false; }

  function renderEditor() {
    const e = $('#editor');
    const sp = ed.prodotti.reduce((t, p) => t + (Number(p.prezzo) || 0), 0);
    const diff = ed.prodotti.length && Math.abs(sp - ed.importo) > 0.009;
    e.innerHTML = `
      <div class="ed-head"><h3>${ed._nuova ? 'Nuova spesa' : 'Modifica spesa'}</h3><button class="x" id="edX" aria-label="Chiudi">×</button></div>
      ${ed._foto ? `<div class="foto"><img src="${ed._foto}" alt="Scontrino" id="edImg"></div>` : ''}
      ${ed._ocr ? `<div class="ocr-stato ${ed._ocr.err ? 'err' : ed._ocr.avviso ? 'avv' : ''}">${ed._ocr.err ? '⚠️' : ed._ocr.fatto ? (ed._ocr.avviso ? '🔎' : '✅') : '<span class="spin"></span>'}<span>${esc(ed._ocr.msg)}</span></div>` : ''}
      ${ed._ocr && ed._ocr.consigli ? `<ul class="consigli">${ed._ocr.consigli.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      ${(ed._foto || ed._file) && (!ed._ocr || ed._ocr.fatto || ed._ocr.err) ? `<div class="btns ocr-azioni">
        <button class="btn sec sm" id="edRitaglia">✂️ Ritaglia / ruota e rileggi</button>
        ${ed._nuova ? '<button class="btn sec sm" id="edRifai">📷 Rifai foto</button>' : ''}</div>` : ''}
      <div class="f"><label for="edImp">Importo</label><input class="in importo" id="edImp" inputmode="decimal" placeholder="0,00" value="${fmtIn(ed.importo)}"></div>
      <div class="f"><span class="lab">Tipo di spesa</span><div class="seg" id="edAmb">
        <button data-a="personale" class="${ed.ambito === 'personale' ? 'on' : ''}">👤 Personale</button>
        <button data-a="familiare" class="${ed.ambito === 'familiare' ? 'on' : ''}">👨‍👩‍👧 Familiare</button></div></div>
      <div class="grid2">
        <div class="f"><label for="edData">Data</label><input class="in" type="date" id="edData" value="${ed.data}"></div>
        <div class="f"><label for="edForn">Fornitore</label><input class="in" id="edForn" placeholder="Negozio, azienda…" value="${esc(ed.fornitore)}"></div>
      </div>
      <div class="f"><span class="lab">Categoria</span><div class="catgrid" id="edCat">
        ${S.categorie.map(c => `<button data-c="${c.id}" class="${c.id === ed.categoria ? 'on' : ''}"><span>${c.icona}</span>${esc(c.nome)}</button>`).join('')}</div></div>
      <div class="f"><span class="lab">Prodotti acquistati</span><div id="edProd">
        ${ed.prodotti.map((p, i) => `<div class="prod"><input class="in pn" data-i="${i}" data-k="nome" value="${esc(p.nome)}" placeholder="Prodotto">
        <input class="in pp" data-i="${i}" data-k="prezzo" inputmode="decimal" value="${fmtIn(p.prezzo)}" placeholder="0,00"><button class="rm" data-rm="${i}" aria-label="Togli">×</button></div>`).join('')}
        </div>
        <div class="somma ${diff ? 'diff' : ''}" id="edSomma">${ed.prodotti.length ? `Somma prodotti ${eur(sp)}${diff ? ` · differenza ${eur(ed.importo - sp)} (sconti, sacchetti o righe non lette)` : ' ✓'}` : ''}</div>
        <div class="btns" style="margin-top:6px"><button class="btn sec sm" id="edAddP">+ Prodotto</button>${ed.prodotti.length ? '<button class="btn sec sm" id="edUsaSomma">Usa la somma come importo</button>' : ''}</div>
      </div>
      <div class="f"><label for="edNote">Note</label><textarea class="in" id="edNote" rows="2" placeholder="Facoltative">${esc(ed.note)}</textarea></div>
      ${ed._ocr && ed._ocr.testo ? `<details class="f"><summary class="hint">Testo letto dallo scontrino</summary><pre style="white-space:pre-wrap;font-size:11px;background:#fff;padding:10px;border-radius:10px">${esc(ed._ocr.testo)}</pre></details>` : ''}
      <div class="btns">${ed._nuova ? '' : '<button class="btn danger" id="edDel">Elimina</button>'}<button class="btn" id="edOk">Salva</button></div>`;

    $('#edX').onclick = chiudiEditor;
    const img = $('#edImg'); if (img) img.onclick = () => img.style.maxHeight = img.style.maxHeight ? '' : 'none';
    $('#edImp').oninput = ev => { ed.importo = parseImporto(ev.target.value); aggiornaSomma(); };
    $('#edData').onchange = ev => ed.data = ev.target.value || oggi();
    $('#edForn').oninput = ev => ed.fornitore = ev.target.value;
    $('#edNote').oninput = ev => ed.note = ev.target.value;
    $$('#edAmb button').forEach(b => b.onclick = () => { ed.ambito = b.dataset.a; $$('#edAmb button').forEach(x => x.classList.toggle('on', x === b)); });
    $$('#edCat button').forEach(b => b.onclick = () => { ed.categoria = b.dataset.c; $$('#edCat button').forEach(x => x.classList.toggle('on', x === b)); });
    $$('#edProd input').forEach(inp => inp.oninput = () => {
      const p = ed.prodotti[inp.dataset.i];
      if (inp.dataset.k === 'nome') p.nome = inp.value; else { p.prezzo = parseImporto(inp.value); aggiornaSomma(); }
    });
    $$('#edProd [data-rm]').forEach(b => b.onclick = () => { ed.prodotti.splice(+b.dataset.rm, 1); renderEditor(); });
    $('#edAddP').onclick = () => { ed.prodotti.push({ nome: '', prezzo: 0 }); renderEditor(); const l = $$('#edProd .pn'); l[l.length - 1].focus(); };
    const us = $('#edUsaSomma'); if (us) us.onclick = () => { ed.importo = Math.round(ed.prodotti.reduce((t, p) => t + (p.prezzo || 0), 0) * 100) / 100; renderEditor(); };
    const rt = $('#edRitaglia'); if (rt) rt.onclick = apriRitaglio;
    const rf = $('#edRifai'); if (rf) rf.onclick = () => { rifaiFoto = true; $('#inFoto').click(); };
    $('#edOk').onclick = salvaEditor;
    const del = $('#edDel'); if (del) del.onclick = eliminaEditor;
  }
  function aggiornaSomma() {
    const el = $('#edSomma'); if (!el || !ed.prodotti.length) return;
    const sp = ed.prodotti.reduce((t, p) => t + (Number(p.prezzo) || 0), 0);
    const diff = Math.abs(sp - ed.importo) > 0.009;
    el.className = 'somma' + (diff ? ' diff' : '');
    el.textContent = `Somma prodotti ${eur(sp)}${diff ? ` · differenza ${eur(ed.importo - sp)} (sconti, sacchetti o righe non lette)` : ' ✓'}`;
  }
  async function salvaEditor() {
    if (!(ed.importo > 0)) { toast('Inserisci un importo'); $('#edImp').focus(); return; }
    const prima = statoBudget(meseDi(ed.data));
    const sp = { id: ed.id, data: ed.data, importo: ed.importo, categoria: ed.categoria, fornitore: ed.fornitore.trim(), piva: ed.piva || '',
      prodotti: ed.prodotti.filter(p => p.nome.trim() || p.prezzo).map(p => ({ nome: p.nome.trim(), prezzo: p.prezzo || 0 })),
      ambito: ed.ambito, note: ed.note.trim(), haFoto: !!ed._foto, creata: ed.creata || Date.now(), modificata: Date.now() };
    try {
      await DB.salva(sp);
      if (ed._foto) await DB.salvaFoto(sp.id, ed._foto).catch(() => {});
    } catch (e) { toast('Errore nel salvataggio'); return; }
    const i = spese.findIndex(s => s.id === sp.id);
    // se era un'altra categoria/mese, il confronto "prima" deve escludere la vecchia versione: va bene così
    if (i >= 0) spese[i] = sp; else spese.push(sp);
    const nuova = ed._nuova;
    chiudiEditor();
    if (meseDi(sp.data) !== mese && nuova) mese = meseDi(sp.data);
    render();
    toast(nuova ? 'Spesa salvata' : 'Modifiche salvate');
    controllaAlert(prima, statoBudget(meseDi(sp.data)), sp.categoria);
  }
  async function eliminaEditor() {
    const b = $('#edDel');
    if (!b.dataset.ok) { b.dataset.ok = 1; b.textContent = 'Conferma'; return; }
    await DB.elimina(ed.id);
    spese = spese.filter(s => s.id !== ed.id);
    chiudiEditor(); render(); toast('Spesa eliminata');
  }

  /* ---------- nuova spesa da foto ---------- */
  let rifaiFoto = false;
  const CONSIGLI = [
    'Appoggia lo scontrino su un fondo scuro e inquadralo per intero',
    'Avvicinati: lo scontrino deve riempire quasi tutta la foto',
    'Luce buona e senza flash (il riflesso cancella il testo)',
    'Tieni il telefono parallelo allo scontrino e ben fermo'
  ];
  async function daFile(file) {
    if (!file) return;
    if (rifaiFoto && ed) { rifaiFoto = false; ed._file = file; ed._foto = null; return leggiInEditor(file); }
    rifaiFoto = false;
    const sp = nuovaSpesa();
    apriEditor(sp, { nuova: true, ocr: { msg: 'Preparo l\'immagine…' } });
    ed._file = file;
    leggiInEditor(file);
  }
  async function leggiInEditor(sorgente, opz = {}) {
    const id = ed.id;
    ed._ocr = { msg: 'Preparo l\'immagine…' }; renderEditor();
    const set = (msg, p) => { if (!ed || ed.id !== id) return; ed._ocr = { msg: msg + (p ? ' ' + Math.round(p * 100) + '%' : '') }; const st = $('.ocr-stato span:last-child'); if (st) st.textContent = ed._ocr.msg; else renderEditor(); };
    try {
      const r = await OCR.leggi(sorgente, S, S.categorie, set, opz);
      if (!ed || ed.id !== id) return;
      ed._foto = r.foto;
      if (r.illeggibile) {
        ed._ocr = { err: true, fatto: true, testo: r.testo,
          msg: r.lontana ? 'Il testo nella foto è troppo piccolo per leggerlo.' : 'Non riesco a leggere questa foto.',
          consigli: CONSIGLI.concat(S.ocrMotore !== 'gemini' ? ['Per scontrini rovinati o sbiaditi attiva in Impostazioni la lettura "Avanzata"'] : []) };
        if (r.fornitore) ed.fornitore = r.fornitore;
        renderEditor();
        return;
      }
      // l'app impara: se hai già assegnato una categoria a questo fornitore, usa quella
      let catId = r.categoria;
      if (r.fornitore) {
        const prec = spese.filter(s => norm(s.fornitore) && norm(s.fornitore) === norm(r.fornitore)).sort((a, b) => (b.creata || 0) - (a.creata || 0))[0];
        if (prec) { catId = prec.categoria; ed.ambito = prec.ambito; }
      }
      const somP = r.prodotti.reduce((t, p) => t + p.prezzo, 0);
      ed.importo = r.importo || Math.round(somP * 100) / 100 || 0;
      if (r.data) ed.data = r.data;
      ed.fornitore = r.fornitore || ed.fornitore || '';
      ed.piva = r.piva || '';
      ed.prodotti = r.prodotti;
      ed.categoria = catId;
      const mancano = [!r.importo && 'importo', !r.fornitore && 'fornitore', !r.data && 'data'].filter(Boolean);
      const trovati = [r.importo ? 'importo' : null, r.fornitore ? 'fornitore' : null, r.data ? 'data' : null, r.prodotti.length ? r.prodotti.length + ' prodotti' : null].filter(Boolean);
      let msg = 'Letti: ' + trovati.join(', ') + '.';
      if (mancano.length) msg += ' Da completare: ' + mancano.join(', ') + '.';
      if (r.dubbio) msg += ' Controlla il totale: sembra più basso di un prodotto.';
      if (!mancano.length && !r.dubbio) msg += ' Controlla e salva.';
      ed._ocr = { fatto: true, avviso: mancano.length > 0 || r.dubbio, msg, testo: r.testo,
        consigli: mancano.length >= 2 ? ['Se è letto male prova "Ritaglia / ruota e rileggi" stringendo il riquadro sullo scontrino'] : null };
      renderEditor();
    } catch (e) {
      if (!ed || ed.id !== id) return;
      try { if (!ed._foto) ed._foto = await OCR.miniatura(sorgente instanceof File ? sorgente : ed._file); } catch (x) { /* niente anteprima */ }
      ed._ocr = { err: true, fatto: true, msg: (e && e.message) || 'Lettura non riuscita: inserisci i dati a mano.' };
      renderEditor();
    }
  }

  /* ---------- ritaglio e rotazione manuale ---------- */
  let crop = null;
  async function apriRitaglio() {
    const bg = $('#cropBg');
    bg.hidden = false;
    $('#cropInfo').textContent = 'Carico la foto…';
    let src;
    try { src = await OCR.carica(ed._file || ed._foto); } catch (e) { bg.hidden = true; toast('Foto non disponibile'); return; }
    crop = { work: Immagine.maxLato(src, 3200), box: { x: 0.04, y: 0.04, w: 0.92, h: 0.92 } };
    disegnaRitaglio();
  }
  function disegnaRitaglio() {
    const cv = $('#cropCv'), area = $('#cropArea');
    const W = area.clientWidth, H = area.clientHeight, w = crop.work;
    const k = Math.min(W / w.width, H / w.height);
    cv.width = Math.round(w.width * k); cv.height = Math.round(w.height * k);
    cv.getContext('2d').drawImage(w, 0, 0, cv.width, cv.height);
    crop.k = k;
    posBox();
    $('#cropInfo').textContent = 'Trascina gli angoli sui bordi dello scontrino';
  }
  function posBox() {
    const cv = $('#cropCv'), b = crop.box, el = $('#cropBox');
    el.style.left = (cv.offsetLeft + b.x * cv.width) + 'px';
    el.style.top = (cv.offsetTop + b.y * cv.height) + 'px';
    el.style.width = (b.w * cv.width) + 'px';
    el.style.height = (b.h * cv.height) + 'px';
  }
  function legaRitaglio() {
    const el = $('#cropBox');
    let drag = null;
    el.addEventListener('pointerdown', e => {
      const cv = $('#cropCv');
      drag = { h: e.target.dataset.h || 'm', x: e.clientX, y: e.clientY, b: { ...crop.box }, W: cv.width, H: cv.height };
      el.setPointerCapture(e.pointerId); e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = (e.clientX - drag.x) / drag.W, dy = (e.clientY - drag.y) / drag.H, b = { ...drag.b }, MIN = 0.08;
      if (drag.h === 'm') { b.x = Math.min(1 - b.w, Math.max(0, b.x + dx)); b.y = Math.min(1 - b.h, Math.max(0, b.y + dy)); }
      else {
        if (drag.h.includes('w')) { const nx = Math.min(b.x + b.w - MIN, Math.max(0, b.x + dx)); b.w += b.x - nx; b.x = nx; }
        if (drag.h.includes('e')) b.w = Math.min(1 - b.x, Math.max(MIN, b.w + dx));
        if (drag.h.includes('n')) { const ny = Math.min(b.y + b.h - MIN, Math.max(0, b.y + dy)); b.h += b.y - ny; b.y = ny; }
        if (drag.h.includes('s')) b.h = Math.min(1 - b.y, Math.max(MIN, b.h + dy));
      }
      crop.box = b; posBox();
    });
    const fine = () => drag = null;
    el.addEventListener('pointerup', fine); el.addEventListener('pointercancel', fine);
    $('#cropSx').onclick = () => { crop.work = Immagine.ruota(crop.work, -90, '#000'); crop.box = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 }; disegnaRitaglio(); };
    $('#cropDx').onclick = () => { crop.work = Immagine.ruota(crop.work, 90, '#000'); crop.box = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 }; disegnaRitaglio(); };
    $('#cropNo').onclick = () => { $('#cropBg').hidden = true; crop = null; };
    $('#cropOk').onclick = () => {
      const w = crop.work, b = crop.box;
      const out = Immagine.ritaglia(w, { x: b.x * w.width, y: b.y * w.height, w: b.w * w.width, h: b.h * w.height });
      $('#cropBg').hidden = true; crop = null;
      if (ed) leggiInEditor(out, { ritaglio: false });
    };
    window.addEventListener('resize', () => { if (crop && !$('#cropBg').hidden) disegnaRitaglio(); });
  }

  /* ---------- ANALISI CONSUNTIVE ---------- */
  function intervallo(cfg, rif) {
    const [a, m] = rif.split('-').map(Number);
    let da, al;
    if (cfg.periodo === 'mese') { da = `${rif}-01`; al = ymd(new Date(a, m, 0)); }
    else if (cfg.periodo === 'trimestre') { const q = Math.floor((m - 1) / 3) * 3; da = ymd(new Date(a, q, 1)); al = ymd(new Date(a, q + 3, 0)); }
    else if (cfg.periodo === 'anno') { da = `${a}-01-01`; al = `${a}-12-31`; }
    else if (cfg.periodo === '12mesi') { da = addMesi(rif, -11) + '-01'; al = ymd(new Date(a, m, 0)); }
    else { da = cfg.da || `${rif}-01`; al = cfg.a || ymd(new Date(a, m, 0)); if (al < da) [da, al] = [al, da]; }
    return { da, al };
  }
  function precedente({ da, al }) {
    const d0 = new Date(da + 'T12:00'), d1 = new Date(al + 'T12:00');
    // periodi a mesi interi: sposto di N mesi; altrimenti di N giorni
    const interi = d0.getDate() === 1 && new Date(d1.getFullYear(), d1.getMonth() + 1, 0).getDate() === d1.getDate();
    if (interi) {
      const n = (d1.getFullYear() - d0.getFullYear()) * 12 + d1.getMonth() - d0.getMonth() + 1;
      return { da: ymd(new Date(d0.getFullYear(), d0.getMonth() - n, 1)), al: ymd(new Date(d0.getFullYear(), d0.getMonth(), 0)) };
    }
    const giorni = Math.round((d1 - d0) / 864e5) + 1;
    return { da: ymd(new Date(d0.getTime() - giorni * 864e5)), al: ymd(new Date(d0.getTime() - 864e5)) };
  }
  function mesiNel({ da, al }) {
    const out = []; let m = meseDi(da);
    while (m <= meseDi(al)) { out.push(m); m = addMesi(m, 1); }
    return out;
  }
  const nelPeriodo = (p, amb) => filtraAmbito(spese.filter(s => s.data >= p.da && s.data <= p.al), amb);
  const fmtBreve = s => new Date(s + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

  function renderAnalisi() {
    const v = $('#v-analisi');
    const cfg = S.analisi;
    const P = intervallo(cfg, mese);
    const arr = nelPeriodo(P, cfg.ambito);
    const PP = precedente(P);
    const arrP = nelPeriodo(PP, cfg.ambito);
    const tot = somma(arr), totP = somma(arrP);
    const mesi = mesiNel(P);
    const giorni = Math.round((new Date(P.al + 'T12:00') - new Date(P.da + 'T12:00')) / 864e5) + 1;
    const fattoreBudget = cfg.periodo === 'custom' ? giorni / 30.44 : mesi.length;
    const var_ = totP ? (tot - totP) / totP * 100 : null;
    const sez = cfg.sezioni;

    let h = `<details class="card cfg noprint" ${v.dataset.aperto ? 'open' : ''} id="cfgBox"><summary>⚙️ Impostazione analisi</summary>
      <div class="f"><span class="lab">Periodo</span><div class="chips" style="padding:0" id="aPer">
        ${[['mese', 'Mese'], ['trimestre', 'Trimestre'], ['anno', 'Anno'], ['12mesi', 'Ultimi 12 mesi'], ['custom', 'Personalizzato']].map(([k, l]) => `<button data-p="${k}" class="${cfg.periodo === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <p class="hint">Il periodo parte dal mese scelto in alto (${nomeMese(mese)}).</p></div>
      ${cfg.periodo === 'custom' ? `<div class="grid2"><div class="f"><label>Dal</label><input class="in" type="date" id="aDa" value="${P.da}"></div><div class="f"><label>Al</label><input class="in" type="date" id="aAl" value="${P.al}"></div></div>` : ''}
      <div class="grid2">
        <div class="f"><label for="aAmb">Spese</label><select class="in" id="aAmb">
          ${[['tutte', 'Tutte'], ['personale', 'Solo personali'], ['familiare', 'Solo familiari']].map(([k, l]) => `<option value="${k}" ${cfg.ambito === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="f"><label for="aGr">Andamento per</label><select class="in" id="aGr">
          ${[['auto', 'Automatico'], ['giorno', 'Giorno'], ['settimana', 'Settimana'], ['mese', 'Mese']].map(([k, l]) => `<option value="${k}" ${cfg.gruppo === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="set-row"><div class="t">Confronta con il periodo precedente<small>${fmtBreve(PP.da)} – ${fmtBreve(PP.al)}</small></div>
        <label class="switch"><input type="checkbox" id="aConf" ${cfg.confronto ? 'checked' : ''}><i></i></label></div>
      <span class="lab" style="margin-top:10px">Sezioni da mostrare</span>
      <div class="checks" id="aSez">${[['riepilogo', 'Riepilogo'], ['torta', 'Torta categorie'], ['andamento', 'Andamento'], ['budget', 'Consuntivo vs budget'], ['ambiti', 'Personali / familiari'], ['fornitori', 'Fornitori'], ['prodotti', 'Prodotti']]
        .map(([k, l]) => `<label><input type="checkbox" data-s="${k}" ${sez[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div>
    </details>
    <div class="card" style="padding:12px 16px"><b>Consuntivo ${fmtBreve(P.da)} – ${fmtBreve(P.al)}</b><div class="hint" style="margin:2px 0 0">${{ tutte: 'Tutte le spese', personale: 'Solo spese personali', familiare: 'Solo spese familiari' }[cfg.ambito]} · ${arr.length} movimenti</div></div>`;

    if (sez.riepilogo) {
      const mediaM = tot / Math.max(1, cfg.periodo === 'custom' ? giorni / 30.44 : mesi.filter(m => m <= meseDi(oggi())).length || 1);
      const passati = Math.min(giorni, Math.max(1, Math.round((Math.min(Date.now(), new Date(P.al + 'T23:59')) - new Date(P.da + 'T00:00')) / 864e5)));
      const medioSc = arr.length ? tot / arr.length : 0;
      h += `<div class="kpis">
        <div class="kpi"><small>Totale speso</small><b>${eur(tot)}</b>${cfg.confronto && var_ != null ? `<span class="d ${var_ > 0 ? 'up' : 'down'}">${var_ > 0 ? '▲' : '▼'} ${Math.abs(var_).toFixed(1)}% (${eur0(totP)})</span>` : ''}</div>
        <div class="kpi"><small>Media mensile</small><b>${eur(mediaM)}</b></div>
        <div class="kpi"><small>Media giornaliera</small><b>${eur(tot / passati)}</b></div>
        <div class="kpi"><small>Spesa media</small><b>${eur(medioSc)}</b></div>
      </div>`;
    }
    if (sez.torta) h += `<div class="card"><h3>Ripartizione per categoria</h3><div id="aTorta"></div></div>`;
    if (sez.andamento) {
      const gr = cfg.gruppo === 'auto' ? (giorni <= 31 ? 'giorno' : giorni <= 100 ? 'settimana' : 'mese') : cfg.gruppo;
      const serie = gruppi(arr, P, gr);
      const serieP = cfg.confronto ? gruppi(arrP, PP, gr) : null;
      const dati = serie.map((x, i) => ({ label: x.label, value: x.value, prev: serieP && serieP[i] ? serieP[i].value : null,
        over: gr === 'mese' && S.budgetMensile && x.value > S.budgetMensile }));
      h += `<div class="card trend"><h3>Andamento per ${gr} ${cfg.confronto ? '<small>grigio = periodo precedente</small>' : ''}</h3>${Grafici.barre(dati)}</div>`;
    }
    if (sez.budget) {
      const righe = S.categorie.map(c => {
        const sp = somma(arr.filter(s => s.categoria === c.id));
        const spP = somma(arrP.filter(s => s.categoria === c.id));
        const b = c.budget * fattoreBudget;
        return { c, sp, spP, b };
      }).filter(r => r.sp || r.b || r.spP).sort((x, y) => y.sp - x.sp);
      const bt = S.budgetMensile * fattoreBudget;
      h += `<div class="card"><h3>Consuntivo per categoria <small>budget × ${fattoreBudget % 1 ? fattoreBudget.toFixed(1) : fattoreBudget} ${cfg.periodo === 'custom' ? 'mesi (prop.)' : mesi.length === 1 ? 'mese' : 'mesi'}</small></h3>
        <table class="t"><thead><tr><th>Categoria</th><th class="n">Speso</th><th class="n">Budget</th><th class="n">Scost.</th>${cfg.confronto ? '<th class="n">Prec.</th>' : ''}</tr></thead><tbody>
        ${righe.map(r => `<tr><td>${r.c.icona} ${esc(r.c.nome)}</td><td class="n"><b>${eur0(r.sp)}</b></td><td class="n">${r.b ? eur0(r.b) : '–'}</td>
          <td class="n ${r.b ? (r.sp > r.b ? 'up' : 'down') : ''}">${r.b ? (r.sp > r.b ? '+' : '−') + eur0(Math.abs(r.sp - r.b)) : '–'}</td>${cfg.confronto ? `<td class="n">${eur0(r.spP)}</td>` : ''}</tr>`).join('')}
        <tr><td><b>Totale</b></td><td class="n"><b>${eur0(tot)}</b></td><td class="n">${bt ? eur0(bt) : '–'}</td><td class="n ${bt ? (tot > bt ? 'up' : 'down') : ''}">${bt ? (tot > bt ? '+' : '−') + eur0(Math.abs(tot - bt)) : '–'}</td>${cfg.confronto ? `<td class="n">${eur0(totP)}</td>` : ''}</tr>
        </tbody></table>${!S.categorie.some(c => c.budget) ? '<p class="hint">Imposta i limiti di spesa in Impostazioni per vedere lo scostamento.</p>' : ''}</div>`;
    }
    if (sez.ambiti && cfg.ambito === 'tutte') {
      const pe = somma(arr.filter(s => s.ambito === 'personale')), fa = somma(arr.filter(s => s.ambito === 'familiare'));
      h += `<div class="card"><h3>Personali e familiari</h3>
        <div class="cat-row"><div class="h"><span>👤 Personali</span><span><b>${eur(pe)}</b> <small>${tot ? Math.round(pe / tot * 100) : 0}%</small></span></div><div class="bar"><i style="width:${tot ? pe / tot * 100 : 0}%;background:#145a52"></i></div></div>
        <div class="cat-row"><div class="h"><span>👨‍👩‍👧 Familiari</span><span><b>${eur(fa)}</b> <small>${tot ? Math.round(fa / tot * 100) : 0}%</small></span></div><div class="bar"><i style="width:${tot ? fa / tot * 100 : 0}%;background:#5c7cfa"></i></div></div></div>`;
    }
    if (sez.fornitori) {
      const m = {};
      arr.forEach(s => { const k = s.fornitore || '(senza fornitore)'; m[k] = m[k] || { n: 0, v: 0 }; m[k].n++; m[k].v += s.importo; });
      const top = Object.entries(m).sort((a, b) => b[1].v - a[1].v).slice(0, 10);
      h += `<div class="card"><h3>Fornitori principali</h3>${top.length ? `<table class="t"><thead><tr><th>Fornitore</th><th class="n">Volte</th><th class="n">Totale</th></tr></thead><tbody>
        ${top.map(([k, x]) => `<tr><td>${esc(k)}</td><td class="n">${x.n}</td><td class="n"><b>${eur(x.v)}</b></td></tr>`).join('')}</tbody></table>` : '<p class="hint">Nessun dato.</p>'}</div>`;
    }
    if (sez.prodotti) {
      const m = {};
      arr.forEach(s => (s.prodotti || []).forEach(p => { const k = p.nome.toLowerCase(); if (!k) return; m[k] = m[k] || { nome: p.nome, n: 0, v: 0 }; m[k].n++; m[k].v += p.prezzo || 0; }));
      const top = Object.values(m).sort((a, b) => b.v - a.v).slice(0, 12);
      h += `<div class="card"><h3>Prodotti con più spesa</h3>${top.length ? `<table class="t"><thead><tr><th>Prodotto</th><th class="n">Acquisti</th><th class="n">Totale</th><th class="n">Medio</th></tr></thead><tbody>
        ${top.map(x => `<tr><td>${esc(x.nome)}</td><td class="n">${x.n}</td><td class="n"><b>${eur(x.v)}</b></td><td class="n">${eur(x.v / x.n)}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">I prodotti compaiono quando li registri (es. dagli scontrini fotografati).</p>'}</div>`;
    }
    h += `<div class="btns noprint"><button class="btn sec" id="aCsv">⬇️ Esporta CSV</button><button class="btn sec" id="aPrint">🖨️ Stampa / PDF</button></div>`;
    v.innerHTML = h;

    if (sez.torta) { const d = perCategoria(arr); $('#aTorta').appendChild(d.length ? Grafici.torta(d, { etichetta: 'Totale periodo' }) : document.createRange().createContextualFragment('<p class="hint">Nessuna spesa nel periodo.</p>')); }
    const salvaCfg = () => { salvaS(); v.dataset.aperto = 1; renderAnalisi(); };
    $('#cfgBox').ontoggle = ev => { if (ev.target.open) v.dataset.aperto = 1; else delete v.dataset.aperto; };
    $$('#aPer button').forEach(b => b.onclick = () => { cfg.periodo = b.dataset.p; salvaCfg(); });
    const aDa = $('#aDa'), aAl = $('#aAl');
    if (aDa) { aDa.onchange = () => { cfg.da = aDa.value; salvaCfg(); }; aAl.onchange = () => { cfg.a = aAl.value; salvaCfg(); }; }
    $('#aAmb').onchange = ev => { cfg.ambito = ev.target.value; salvaCfg(); };
    $('#aGr').onchange = ev => { cfg.gruppo = ev.target.value; salvaCfg(); };
    $('#aConf').onchange = ev => { cfg.confronto = ev.target.checked; salvaCfg(); };
    $$('#aSez input').forEach(i => i.onchange = () => { cfg.sezioni[i.dataset.s] = i.checked; salvaCfg(); });
    $('#aCsv').onclick = () => esportaCsv(arr, P);
    $('#aPrint').onclick = () => window.print();
  }
  function gruppi(arr, P, gr) {
    const out = [];
    const d0 = new Date(P.da + 'T12:00'), d1 = new Date(P.al + 'T12:00');
    if (gr === 'mese') {
      mesiNel(P).forEach(m => out.push({ label: MESI_B[+m.slice(5) - 1], value: somma(arr.filter(s => meseDi(s.data) === m)) }));
    } else if (gr === 'settimana') {
      for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 7)) {
        const a = ymd(d), e = new Date(d); e.setDate(e.getDate() + 6);
        const b = ymd(e > d1 ? d1 : e);
        out.push({ label: d.getDate() + '/' + (d.getMonth() + 1), value: somma(arr.filter(s => s.data >= a && s.data <= b)) });
      }
    } else {
      for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
        const a = ymd(d);
        out.push({ label: String(d.getDate()), value: somma(arr.filter(s => s.data === a)) });
      }
    }
    return out;
  }
  function scarica(nome, contenuto, tipo) {
    const b = new Blob([contenuto], { type: tipo });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function esportaCsv(arr, P) {
    const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const righe = [['Data', 'Fornitore', 'Categoria', 'Tipo', 'Importo', 'Prodotti', 'Note'].join(';')];
    arr.slice().sort((a, b) => a.data.localeCompare(b.data)).forEach(s => righe.push([s.data, q(s.fornitore), q(cat(s.categoria).nome), s.ambito,
      String(s.importo.toFixed(2)).replace('.', ','), q((s.prodotti || []).map(p => p.nome + ' ' + String((p.prezzo || 0).toFixed(2)).replace('.', ',')).join(' | ')), q(s.note)].join(';')));
    scarica(`FinanzeControl_${P.da}_${P.al}.csv`, '﻿' + righe.join('\r\n'), 'text/csv;charset=utf-8');
  }

  /* ---------- IMPOSTAZIONI ---------- */
  function renderImpost() {
    const v = $('#v-impost');
    v.innerHTML = `
      <div class="card"><h3>Alert di spesa massima</h3>
        <div class="set-row"><span class="sw" style="background:#e9f8f1">💶</span><div class="t">Budget mensile totale<small>0 = nessun limite</small></div>
          <input class="in bud" id="sBudTot" inputmode="decimal" value="${S.budgetMensile ? fmtIn(S.budgetMensile) : ''}" placeholder="0"></div>
        <div class="set-row"><span class="sw" style="background:#fff6e5">⚠️</span><div class="t">Avvisami al<small>percentuale del limite per il preavviso</small></div>
          <select class="in bud" id="sSoglia">${[50, 60, 70, 75, 80, 85, 90, 95].map(p => `<option value="${p}" ${S.soglia === p ? 'selected' : ''}>${p}%</option>`).join('')}</select></div>
        <div class="set-row"><span class="sw" style="background:#eef1ff">🖥️</span><div class="t">Avviso a schermo<small>quando salvi una spesa che fa scattare il limite</small></div>
          <label class="switch"><input type="checkbox" id="sSchermo" ${S.avvisoSchermo ? 'checked' : ''}><i></i></label></div>
        <div class="set-row"><span class="sw" style="background:#ffeceb">🔔</span><div class="t">Notifiche del telefono</div>
          <label class="switch"><input type="checkbox" id="sNotif" ${S.notifiche ? 'checked' : ''}><i></i></label></div>
      </div>
      <div class="card"><h3>Categorie e limiti mensili <small>€ al mese, vuoto = nessun limite</small></h3>
        <div id="sCat">${S.categorie.map((c, i) => `<div class="set-row">
          <input class="in" style="width:52px;text-align:center;padding:8px 4px;font-size:20px" data-i="${i}" data-k="icona" value="${esc(c.icona)}" aria-label="Icona">
          <div class="t"><input class="in" style="padding:9px 10px" data-i="${i}" data-k="nome" value="${esc(c.nome)}" aria-label="Nome"></div>
          <input type="color" class="colore" data-i="${i}" data-k="colore" value="${c.colore}" aria-label="Colore">
          <input class="in bud" style="width:78px" data-i="${i}" data-k="budget" inputmode="decimal" placeholder="limite" value="${c.budget ? fmtIn(c.budget) : ''}">
          ${c.id === 'altro' ? '<span style="width:30px"></span>' : `<button class="prod rm" style="border:0;background:none;color:var(--bad);font-size:20px;width:30px" data-del="${i}" aria-label="Elimina">×</button>`}
        </div>`).join('')}</div>
        <div class="btns"><button class="btn sec sm" id="sAddCat">+ Nuova categoria</button></div>
      </div>
      <div class="card"><h3>Nuove spese</h3>
        <div class="f"><span class="lab">Tipo predefinito</span><div class="seg" id="sAmb">
          <button data-a="personale" class="${S.ambitoDefault === 'personale' ? 'on' : ''}">👤 Personale</button>
          <button data-a="familiare" class="${S.ambitoDefault === 'familiare' ? 'on' : ''}">👨‍👩‍👧 Familiare</button></div></div>
        <div class="f"><span class="lab">Lettura scontrini</span><div class="seg" id="sOcr">
          <button data-m="locale" class="${S.ocrMotore === 'locale' ? 'on' : ''}">📱 Locale gratuito</button>
          <button data-m="gemini" class="${S.ocrMotore === 'gemini' ? 'on' : ''}">✨ Avanzato (Gemini)</button></div>
          <p class="hint">Locale: legge sul telefono, gratis, la foto non esce dal dispositivo. Avanzato: più preciso su prodotti e scontrini rovinati; usa una chiave gratuita di Google AI Studio e invia la foto a Google.</p></div>
        ${S.ocrMotore === 'gemini' ? `<div class="f"><label for="sKey">Chiave API Gemini</label><input class="in" id="sKey" type="password" autocomplete="off" value="${esc(S.geminiKey)}" placeholder="AIza…"></div>
          <div class="f"><label for="sMod">Modello</label><input class="in" id="sMod" value="${esc(S.geminiModel)}"></div>` : ''}
      </div>
      <div class="card"><h3>Backup</h3>
        <p class="hint">I dati sono solo su questo dispositivo. Fai un backup ogni tanto o per passare a un altro telefono.</p>
        <div class="set-row"><div class="t">Includi le foto degli scontrini<small>il file diventa più grande</small></div>
          <label class="switch"><input type="checkbox" id="sBkFoto" ${S.backupFoto ? 'checked' : ''}><i></i></label></div>
        <div class="btns"><button class="btn sec" id="sExp">⬇️ Esporta</button><button class="btn sec" id="sImp">⬆️ Importa</button></div>
        <div class="btns"><button class="btn danger" id="sReset">Cancella tutte le spese</button></div>
      </div>
      <p class="hint" style="text-align:center">FinanzeControl ${esc((window.AppUpdate && AppUpdate.current) || '')} · ${spese.length} spese registrate</p>`;

    const num = (el, fn) => el.onchange = () => { fn(parseImporto(el.value)); salvaS(); };
    num($('#sBudTot'), x => S.budgetMensile = x);
    $('#sSoglia').onchange = ev => { S.soglia = +ev.target.value; salvaS(); };
    $('#sSchermo').onchange = ev => { S.avvisoSchermo = ev.target.checked; salvaS(); };
    $('#sNotif').onchange = async ev => {
      if (ev.target.checked) {
        if (!('Notification' in window)) { toast('Notifiche non supportate su questo browser'); ev.target.checked = false; return; }
        const p = await Notification.requestPermission();
        if (p !== 'granted') { toast('Permesso notifiche negato'); ev.target.checked = false; return; }
      }
      S.notifiche = ev.target.checked; salvaS();
    };
    $$('#sCat [data-k]').forEach(el => el.onchange = () => {
      const c = S.categorie[el.dataset.i], k = el.dataset.k;
      c[k] = k === 'budget' ? parseImporto(el.value) : (el.value.trim() || c[k]);
      salvaS();
    });
    $$('#sCat [data-del]').forEach(b => b.onclick = async () => {
      const c = S.categorie[b.dataset.del];
      if (!b.dataset.ok) { b.dataset.ok = 1; b.textContent = '✓'; toast(`Tocca ✓ per eliminare "${c.nome}": le sue spese passano in Altro`); return; }
      const coinvolte = spese.filter(s => s.categoria === c.id);
      for (const s of coinvolte) { s.categoria = 'altro'; await DB.salva(s); }
      S.categorie.splice(+b.dataset.del, 1); salvaS(); renderImpost();
    });
    $('#sAddCat').onclick = () => {
      const colori = ['#14b8a6', '#eab308', '#ef4444', '#8b5cf6', '#0ea5e9', '#84cc16', '#f97316'];
      S.categorie.splice(S.categorie.length - 1, 0, { id: 'c' + uid(), nome: 'Nuova categoria', icona: '🏷️', colore: colori[S.categorie.length % colori.length], budget: 0 });
      salvaS(); renderImpost();
      const n = $$('#sCat [data-k="nome"]'); n[n.length - 2].select();
    };
    $$('#sAmb button').forEach(b => b.onclick = () => { S.ambitoDefault = b.dataset.a; salvaS(); renderImpost(); });
    $$('#sOcr button').forEach(b => b.onclick = () => { S.ocrMotore = b.dataset.m; salvaS(); renderImpost(); });
    const k = $('#sKey'); if (k) { k.onchange = () => { S.geminiKey = k.value.trim(); salvaS(); }; $('#sMod').onchange = ev => { S.geminiModel = ev.target.value.trim() || BASE.geminiModel; salvaS(); }; }
    $('#sBkFoto').onchange = ev => { S.backupFoto = ev.target.checked; salvaS(); };
    $('#sExp').onclick = esportaBackup;
    $('#sImp').onclick = () => $('#inBackup').click();
    $('#sReset').onclick = async ev => {
      const b = ev.target;
      if (!b.dataset.ok) { b.dataset.ok = 1; b.textContent = 'Tocca di nuovo per confermare'; return; }
      await DB.svuota(); spese = []; toast('Spese cancellate'); renderImpost();
    };
  }
  async function esportaBackup() {
    const out = { app: 'FinanzeControl', versione: 1, esportato: new Date().toISOString(), impostazioni: { ...S, geminiKey: '' }, spese };
    if (S.backupFoto) {
      out.foto = {};
      for (const s of spese.filter(x => x.haFoto)) { const f = await DB.foto(s.id); if (f) out.foto[s.id] = f; }
    }
    scarica(`FinanzeControl_backup_${oggi()}.json`, JSON.stringify(out), 'application/json');
  }
  async function importaBackup(file) {
    try {
      const o = JSON.parse(await file.text());
      if (o.app !== 'FinanzeControl' || !Array.isArray(o.spese)) throw new Error();
      const key = S.geminiKey;
      if (o.impostazioni) { S = Object.assign(carica(), o.impostazioni); if (!S.geminiKey) S.geminiKey = key; salvaS(); }
      for (const s of o.spese) await DB.salva(s);
      for (const id of Object.keys(o.foto || {})) await DB.salvaFoto(id, o.foto[id]);
      spese = await DB.tutte();
      toast(`Importate ${o.spese.length} spese`); render();
    } catch (e) { toast('File di backup non valido'); }
  }

  /* ---------- avvio ---------- */
  function lega() {
    $$('.tabbar [data-v]').forEach(b => b.onclick = () => vai(b.dataset.v));
    $('#mesePrev').onclick = () => { mese = addMesi(mese, -1); render(); };
    $('#meseNext').onclick = () => { mese = addMesi(mese, 1); render(); };
    $('#meseLabel').onclick = () => { mese = meseDi(oggi()); render(); };
    $$('#filtroAmbito button').forEach(b => b.onclick = () => { ambito = b.dataset.a; $$('#filtroAmbito button').forEach(x => x.classList.toggle('on', x === b)); render(); });
    const scelta = $('#sceltaBg');
    $('#fab').onclick = () => scelta.hidden = false;
    $('#sceltaChiudi').onclick = () => scelta.hidden = true;
    scelta.onclick = e => { if (e.target === scelta) scelta.hidden = true; };
    $('#optFoto').onclick = () => { scelta.hidden = true; $('#inFoto').click(); };
    $('#optFile').onclick = () => { scelta.hidden = true; $('#inFile').click(); };
    $('#optMano').onclick = () => { scelta.hidden = true; apriEditor(nuovaSpesa(), { nuova: true }); };
    ['#inFoto', '#inFile'].forEach(s => $(s).onchange = e => { const f = e.target.files[0]; e.target.value = ''; daFile(f); });
    $('#inBackup').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importaBackup(f); };
    $('#editorBg').onclick = e => { if (e.target.id === 'editorBg') chiudiEditor(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#alertModal').hidden) $('#alertModal').hidden = true; else if (ed) chiudiEditor(); } });
    // swipe orizzontale sulla barra del mese
    let x0 = null;
    $('#mesebar').addEventListener('touchstart', e => x0 = e.touches[0].clientX, { passive: true });
    $('#mesebar').addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) { mese = addMesi(mese, dx < 0 ? 1 : -1); render(); } x0 = null; });
  }

  async function avvio() {
    lega();
    legaRitaglio();
    try { spese = await DB.tutte(); } catch (e) { toast('Archivio non disponibile (modalità privata?)'); spese = []; }
    vai('mese');
    // avviso all'apertura se un limite del mese è già oltre la soglia
    const st = statoBudget(meseDi(oggi()));
    const oltre = st.cat.filter(x => x.liv === 'bad').length;
    if (oltre) setTimeout(() => toast(`🚨 ${oltre} ${oltre === 1 ? 'categoria ha' : 'categorie hanno'} superato la spesa massima`), 800);
  }
  window.FC = { get spese() { return spese; }, impostazioni: () => S };
  avvio();
})();
