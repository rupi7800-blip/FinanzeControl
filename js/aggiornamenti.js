/* =========================================================
   aggiornamenti.js — avviso di nuova versione per le web app
   Uso in index.html:
     <script src="aggiornamenti.js" data-version="1.0.0" defer></script>
   e nella cartella dell'app un file version.json:
     { "version": "1.0.0", "date": "2026-11-09", "notes": ["Novità…"] }
   Quando version.json ha un numero diverso da data-version compare
   il tasto "Aggiorna" e una notifica. Facoltativo: un elemento con
   attributo data-update-slot dove inserire il tasto (es. nell'intestazione).
   ========================================================= */
(function () {
  'use strict';
  var me = document.currentScript;
  var CURRENT = (me && me.dataset.version) || '0';
  var BASE = me && me.src ? me.src.replace(/[^/]*$/, '') : './';
  // version.json sta nella cartella della pagina (non in quella dello script)
  var URL_V = new URL((me && me.dataset.versionUrl) || 'version.json', location.href.split('#')[0].split('?')[0]).href;
  var KEY = 'upd.dismissed.' + location.pathname;
  var latest = null, btn = null, shown = false;

  function cmp(a, b) {
    var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var css = '' +
    '.upd-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border:0;border-radius:999px;cursor:pointer;' +
    'font:700 14px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;background:linear-gradient(135deg,#ff7a52,#ff5464);' +
    'box-shadow:0 6px 18px rgba(255,90,80,.38);animation:updPulse 2.4s ease-in-out infinite}' +
    '.upd-btn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}' +
    '.upd-btn.upd-float{position:fixed;left:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:2147483000}' +
    '@keyframes updPulse{0%,100%{box-shadow:0 6px 18px rgba(255,90,80,.38)}50%{box-shadow:0 6px 26px rgba(255,90,80,.7)}}' +
    '.upd-card{position:fixed;left:50%;top:calc(12px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:2147483001;' +
    'width:min(460px,calc(100% - 20px));background:#14203a;color:#fff;border-radius:20px;padding:16px 16px 14px;' +
    'box-shadow:0 24px 60px rgba(0,0,0,.35);font:500 14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:updDrop .35s cubic-bezier(.2,.9,.25,1)}' +
    '.upd-card h4{margin:0 0 4px;font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px}' +
    '.upd-card ul{margin:6px 0 0;padding-left:18px;opacity:.85}.upd-card p{margin:0;opacity:.8}' +
    '.upd-card .upd-row{display:flex;gap:8px;margin-top:12px;justify-content:flex-end}' +
    '.upd-card button{border:0;border-radius:12px;padding:10px 14px;font:800 14px system-ui,sans-serif;cursor:pointer}' +
    '.upd-card .upd-later{background:rgba(255,255,255,.12);color:#fff}.upd-card .upd-go{background:#fff;color:#14203a}' +
    '@keyframes updDrop{from{transform:translate(-50%,-30px);opacity:0}}' +
    '.upd-busy{position:fixed;inset:0;z-index:2147483002;background:rgba(10,16,32,.6);display:grid;place-items:center;color:#fff;font:700 16px system-ui,sans-serif}';
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>';

  function injectCss() {
    if (document.getElementById('upd-css')) return;
    var s = document.createElement('style');
    s.id = 'upd-css'; s.textContent = css;
    document.head.appendChild(s);
  }

  function showButton() {
    if (btn) return;
    injectCss();
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'upd-btn';
    btn.innerHTML = ICON + '<span>Aggiorna</span>';
    btn.title = 'Nuova versione ' + latest.version + ' disponibile';
    btn.addEventListener('click', applyUpdate);
    var slot = document.querySelector('[data-update-slot]');
    if (slot) slot.appendChild(btn); else { btn.classList.add('upd-float'); document.body.appendChild(btn); }
  }

  function showCard() {
    if (shown) return;
    shown = true;
    var dismissed = null;
    try { dismissed = localStorage.getItem(KEY); } catch (e) { /* no */ }
    if (dismissed === latest.version) return; // già visto: resta solo il tasto
    injectCss();
    var notes = (latest.notes || []).slice(0, 5);
    var card = document.createElement('div');
    card.className = 'upd-card';
    card.setAttribute('role', 'alert');
    card.innerHTML = '<h4>' + ICON.replace('<svg', '<svg style="width:18px;height:18px;stroke:#ff7a52;fill:none;stroke-width:2.4"') +
      'Aggiornamento disponibile</h4><p>Versione ' + esc(latest.version) + (latest.date ? ' · ' + esc(latest.date) : '') + '</p>' +
      (notes.length ? '<ul>' + notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="upd-row"><button class="upd-later" type="button">Più tardi</button><button class="upd-go" type="button">Aggiorna ora</button></div>';
    document.body.appendChild(card);
    card.querySelector('.upd-later').onclick = function () {
      try { localStorage.setItem(KEY, latest.version); } catch (e) { /* no */ }
      card.remove();
    };
    card.querySelector('.upd-go').onclick = applyUpdate;
  }

  function systemNotify() {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    var title = 'Aggiornamento disponibile';
    var ic = me && me.dataset.icon ? me.dataset.icon : (document.querySelector('link[rel="apple-touch-icon"]') || document.querySelector('link[rel~="icon"]') || {}).href;
    var opts = { body: 'Versione ' + latest.version + ': apri l\'app e tocca "Aggiorna".', tag: 'app-update', icon: ic };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(function (r) { r.showNotification(title, opts); }).catch(function () {});
    } else { try { new Notification(title, opts); } catch (e) { /* no */ } }
  }

  function check() {
    if (!navigator.onLine) return Promise.resolve(false);
    return fetch(URL_V + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        if (!v || !v.version || cmp(v.version, CURRENT) <= 0) return false;
        var isNew = !latest || latest.version !== v.version;
        latest = v;
        showButton();
        showCard();
        if (isNew) systemNotify();
        document.dispatchEvent(new CustomEvent('app-update-available', { detail: v }));
        return true;
      })
      .catch(function () { return false; });
  }

  function applyUpdate() {
    injectCss();
    var busy = document.createElement('div');
    busy.className = 'upd-busy';
    busy.textContent = 'Aggiornamento in corso…';
    document.body.appendChild(busy);
    var page = location.href.split('#')[0].split('?')[0];
    // 1) svuota le copie salvate della versione vecchia, solo di QUESTA app
    //    (le app sullo stesso indirizzo GitHub hanno ognuna le sue)
    var mia = new URL('./', page).href;
    var clear = window.caches ? caches.keys().then(function (k) {
      return Promise.all(k.map(function (n) {
        return caches.open(n).then(function (c) { return c.keys(); }).then(function (reqs) {
          if (reqs.some(function (q) { return q.url.indexOf(mia) === 0; })) return caches.delete(n);
        });
      }));
    }).catch(function () {}) : Promise.resolve();
    // 2) scarica di nuovo dalla rete tutti i file dell'app (pagina, script, stili, icone)
    var urls = [page, new URL('index.html', page).href];
    Array.prototype.forEach.call(document.querySelectorAll('script[src],link[href]'), function (el) {
      var u = el.src || el.href;
      if (u && u.indexOf(location.origin) === 0) urls.push(u);
    });
    var refresh = clear.then(function () {
      return Promise.all(urls.map(function (u) { return fetch(u, { cache: 'reload' }).catch(function () {}); }));
    });
    // 3) attiva l'eventuale service worker nuovo
    var sw = navigator.serviceWorker ? navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return;
      return reg.update().catch(function () {}).then(function () {
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      });
    }).catch(function () {}) : Promise.resolve();
    Promise.all([refresh, sw]).then(function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* no */ }
      setTimeout(function () { location.reload(); }, 300);
    });
  }

  window.AppUpdate = { check: check, apply: applyUpdate, current: CURRENT };

  function start() {
    setTimeout(check, 2500);
    setInterval(check, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
    window.addEventListener('online', check);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
