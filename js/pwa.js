/* ติดตั้งเป็นแอป (PWA): ปุ่ม "ติดตั้งแอป" + วิธีติดตั้งบน iPhone/iPad + service worker
   ใช้ได้เมื่อเปิดผ่าน HTTPS (Vercel) — เปิดแล้วเป็นหน้าต่างแอปแยก ไม่มีแถบเบราว์เซอร์ */
(function () {
  'use strict';
  const App = window.App;
  const ua = navigator.userAgent || '';
  const isIos = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  let deferred = null;

  // ---- service worker
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing; if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller && App && App.toast) App.toast('มีเวอร์ชันใหม่ของระบบ — รีเฟรชหน้าเพื่ออัปเดต', 'info');
          });
        });
      }).catch(() => { /* ไม่รองรับ/ถูกบล็อก: ใช้งานแบบเว็บปกติ */ });
    });
  }

  // ---- ปุ่มติดตั้ง
  const css = document.createElement('style');
  css.textContent = '.pwa-btn{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.pwa-btn[hidden]{display:none}' +
    '.login-pwa{margin:12px 0 0;text-align:center}.login-pwa .pwa-btn{font-size:.85rem}' +
    '@media(max-width:700px){.tb-right .pwa-btn span{display:none}}' +
    '#pwa-dlg{border:0;border-radius:18px;padding:24px 26px;max-width:420px;width:calc(100% - 32px);box-shadow:0 30px 80px rgba(17,22,65,.4);color:var(--ink,#17233d);background:var(--card,#fff)}' +
    '#pwa-dlg::backdrop{background:rgba(11,20,38,.55)}#pwa-dlg h3{margin:0 0 8px}#pwa-dlg ol{padding-left:20px;line-height:1.9;margin:8px 0 16px}';
  document.head.appendChild(css);

  const mk = () => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm ghost pwa-btn'; b.hidden = true; b.title = 'ติดตั้งเป็นแอป (เปิดเป็นหน้าต่างแยก)'; b.innerHTML = '<i class="fas fa-download"></i><span>ติดตั้งแอป</span>'; b.addEventListener('click', install); return b; };
  const btns = [];
  function mount() {
    const tb = document.querySelector('.tb-right'), av = document.getElementById('tb-avatar');
    if (tb) { const b = mk(); tb.insertBefore(b, av || null); btns.push(b); }
    const lr = document.querySelector('.login-right');
    if (lr) { const w = document.createElement('div'); w.className = 'login-pwa'; const b = mk(); w.appendChild(b); lr.appendChild(w); btns.push(b); }
    refresh();
  }
  function refresh() { const show = !standalone() && (!!deferred || isIos); btns.forEach(b => { b.hidden = !show; }); }

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; refresh(); });
  window.addEventListener('appinstalled', () => { deferred = null; refresh(); if (App && App.toast) App.toast('ติดตั้งแอปเรียบร้อย — เปิดจากไอคอนบนหน้าจอหลักหรือเมนูโปรแกรมได้เลย', 'success'); });
  if (window.matchMedia) { try { matchMedia('(display-mode: standalone)').addEventListener('change', refresh); } catch (e) { /* ignore */ } }

  async function install() {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { /* ignore */ }
      deferred = null; refresh(); return;
    }
    help();
  }
  function help() {
    let d = document.getElementById('pwa-dlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'pwa-dlg'; document.body.appendChild(d); }
    d.innerHTML = '<h3><i class="fas fa-mobile-screen"></i> ติดตั้งเป็นแอป</h3>' + (isIos
      ? '<p>บน iPhone / iPad ต้องเปิดด้วย <b>Safari</b> แล้ว:</p><ol><li>แตะปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรขึ้น)</li><li>เลือก <b>“เพิ่มลงในหน้าจอโฮม”</b></li><li>แตะ <b>เพิ่ม</b> — จะได้ไอคอนบนหน้าจอหลัก</li></ol>'
      : '<p>เบราว์เซอร์นี้ยังไม่แสดงตัวเลือกติดตั้งอัตโนมัติ ลองทำดังนี้:</p><ol><li>ใช้ <b>Chrome</b> หรือ <b>Edge</b> เปิดเว็บนี้ผ่าน HTTPS</li><li>กดไอคอนติดตั้งที่ท้ายแถบที่อยู่ หรือเมนู ⋮ → <b>“ติดตั้ง/Install”</b></li></ol>') +
      '<div style="text-align:right"><button type="button" class="btn primary" id="pwa-close">เข้าใจแล้ว</button></div>';
    document.getElementById('pwa-close').addEventListener('click', () => d.close());
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }

  if (standalone()) document.documentElement.classList.add('is-app');
  document.addEventListener('DOMContentLoaded', mount);
})();
