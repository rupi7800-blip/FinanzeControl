/* grafici.js — torta (ciambella) e barre in SVG, funzionano anche offline */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const eur = v => v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

  function arco(cx, cy, r, a0, a1) {
    const p = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
  }

  /* dati: [{id, label, value, color, icona}] → elemento .torta con legenda cliccabile */
  function torta(dati, opz = {}) {
    const tot = dati.reduce((s, d) => s + d.value, 0);
    const box = document.createElement('div');
    box.className = 'torta';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 220 220');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Grafico a torta delle spese per categoria');
    const R = 82, W = 34;
    const bg = document.createElementNS(NS, 'circle');
    Object.entries({ cx: 110, cy: 110, r: R, fill: 'none', stroke: 'rgba(127,140,137,.15)', 'stroke-width': W }).forEach(([k, v]) => bg.setAttribute(k, v));
    svg.appendChild(bg);
    const centro = document.createElementNS(NS, 'text');
    centro.setAttribute('x', 110); centro.setAttribute('y', 106); centro.setAttribute('text-anchor', 'middle');
    centro.setAttribute('style', 'font:800 19px Manrope,system-ui,sans-serif;fill:currentColor');
    const sotto = document.createElementNS(NS, 'text');
    sotto.setAttribute('x', 110); sotto.setAttribute('y', 128); sotto.setAttribute('text-anchor', 'middle');
    sotto.setAttribute('style', 'font:700 11px Manrope,system-ui,sans-serif;fill:#62726f');
    const setCentro = (v, l) => { centro.textContent = eur(v); sotto.textContent = l; };
    setCentro(tot, opz.etichetta || 'Totale');

    const paths = [];
    if (tot > 0) {
      let a = -Math.PI / 2;
      const gap = dati.length > 1 ? 0.025 : 0;
      dati.forEach((d, i) => {
        const span = d.value / tot * Math.PI * 2;
        const p = document.createElementNS(NS, 'path');
        const fine = Math.min(a + span - gap, a + Math.PI * 2 - 0.0001);
        p.setAttribute('d', arco(110, 110, R, a, Math.max(a + 0.001, fine)));
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', d.color);
        p.setAttribute('stroke-width', W);
        p.dataset.i = i;
        svg.appendChild(p);
        paths.push(p);
        a += span;
      });
    }
    svg.appendChild(centro); svg.appendChild(sotto);
    box.appendChild(svg);

    const ul = document.createElement('ul');
    ul.className = 'legend';
    let sel = -1;
    const evidenzia = i => {
      sel = sel === i ? -1 : i;
      paths.forEach((p, j) => p.classList.toggle('dim', sel >= 0 && j !== sel));
      [...ul.children].forEach((li, j) => li.style.opacity = sel >= 0 && j !== sel ? .45 : 1);
      if (sel >= 0) setCentro(dati[sel].value, dati[sel].label); else setCentro(tot, opz.etichetta || 'Totale');
      if (opz.onSelect) opz.onSelect(sel >= 0 ? dati[sel] : null);
    };
    dati.forEach((d, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot" style="background:${d.color}"></span><span class="n">${d.icona ? d.icona + ' ' : ''}${esc(d.label)}</span>` +
        `<span class="v">${eur(d.value)}</span><span class="p">${tot ? Math.round(d.value / tot * 100) : 0}%</span>`;
      li.onclick = () => evidenzia(i);
      ul.appendChild(li);
    });
    paths.forEach((p, i) => p.addEventListener('click', () => evidenzia(i)));
    if (dati.length) box.appendChild(ul);
    return box;
  }

  /* barre: [{label, value, prev?}] */
  function barre(dati, opz = {}) {
    const W = 340, H = 180, pl = 8, pb = 26, pt = 18;
    const max = Math.max(1, ...dati.map(d => Math.max(d.value, d.prev || 0)));
    const n = dati.length || 1, slot = (W - pl * 2) / n, bw = Math.min(26, slot * 0.62);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento delle spese">`;
    for (let g = 1; g <= 3; g++) {
      const y = pt + (H - pt - pb) * (1 - g / 3);
      s += `<line x1="${pl}" x2="${W - pl}" y1="${y}" y2="${y}" stroke="rgba(127,140,137,.18)" stroke-dasharray="3 4"/>`;
    }
    dati.forEach((d, i) => {
      const x = pl + slot * i + (slot - bw) / 2;
      const h = (H - pt - pb) * d.value / max, y = H - pb - h;
      if (d.prev != null) {
        const hp = (H - pt - pb) * d.prev / max;
        s += `<rect x="${x - 3}" y="${H - pb - hp}" width="${bw}" height="${hp}" rx="5" fill="rgba(127,140,137,.22)"/>`;
      }
      s += `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, d.value ? 2 : 0)}" rx="5" fill="${d.over ? '#e5484d' : (opz.colore || '#145a52')}"><title>${esc(d.label)}: ${eur(d.value)}</title></rect>`;
      if (n <= 8 || i % Math.ceil(n / 7) === 0)
        s += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" style="font:700 10px Manrope,system-ui;fill:#62726f">${esc(d.label)}</text>`;
      if (d.value && n <= 8)
        s += `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" style="font:800 9.5px Manrope,system-ui;fill:#10211f">${Math.round(d.value)}</text>`;
    });
    return s + '</svg>';
  }

  function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  window.Grafici = { torta, barre };
})();
