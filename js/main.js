/* เริ่มระบบ: ล็อกอินด้วย Google (Gmail), เมนู, เราต์เตอร์ */
(function () {
  'use strict';
  const App = window.App, esc = App.esc, $ = App.$, S = App.state, cfg = App.cfg;

  // ---------------------------------------------------------------- เมนู
  const NAV = [
    { id: 'dashboard', label: 'ภาพรวม', icon: '📊', hash: '#/dashboard' },
    { id: 'plans', label: 'แผนงาน/โครงการ', icon: '📋', hash: '#/plans' },
    { id: 'overdue', label: 'ค้างส่งสรุป', icon: '⏰', hash: '#/overdue' },
    { id: 'fix', label: 'ข้อมูลรอแก้ไข', icon: '🛠', hash: '#/fix' },
    { sep: 'แอดมิน', admin: true },
    { id: 'users', label: 'ผู้ใช้งาน', icon: '👥', hash: '#/admin/users', admin: true, badge: 'pendingUsers' },
    { id: 'masters', label: 'ข้อมูลหลัก/ตั้งค่า', icon: '⚙️', hash: '#/admin/masters', admin: true },
    { id: 'reports', label: 'รายงาน/ส่งออก', icon: '🖨', hash: '#/admin/reports', admin: true },
    { id: 'audit', label: 'ประวัติการใช้งาน', icon: '🕘', hash: '#/admin/audit', admin: true }
  ];
  function buildNav() {
    $('#nav').innerHTML = NAV.filter(n => !n.admin || App.isAdmin()).map(n => n.sep ? '<div class="nav-sep">' + n.sep + '</div>' :
      '<a class="nav-item" data-nav="' + n.id + '" href="' + n.hash + '"><span class="ico">' + n.icon + '</span><span>' + esc(n.label) + '</span>' + (n.badge ? '<span class="nav-badge" data-badge="' + n.badge + '" hidden></span>' : '') + '</a>').join('');
    const u = S.user;
    $('#user-chip').innerHTML = (u.picture ? '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">' : '<span class="avatar">' + esc((u.name || u.email).charAt(0)) + '</span>') +
      '<div class="uc-text"><b>' + esc(u.name) + '</b><span>' + esc({ admin: 'แอดมิน', user: 'เจ้าหน้าที่', viewer: 'ผู้ดูข้อมูล' }[u.role] || u.role) + '</span></div><button class="icon-btn" id="btn-logout" title="ออกจากระบบ" aria-label="ออกจากระบบ">⎋</button>';
    $('#btn-logout').addEventListener('click', () => App.logout());
    App.updateBadges();
  }
  App.updateBadges = function () { App.$$('[data-badge]').forEach(b => { const n = S[b.dataset.badge] || 0; b.textContent = n; b.hidden = !n; }); };

  // ---------------------------------------------------------------- เราต์เตอร์
  const ROUTES = [
    { re: /^#?\/?$|^#\/dashboard$/, page: 'dashboard', nav: 'dashboard' },
    { re: /^#\/plans$/, page: 'plans', nav: 'plans' },
    { re: /^#\/plan\/([\w-]+)$/, page: 'plan', nav: 'plans' },
    { re: /^#\/overdue$/, page: 'overdue', nav: 'overdue' },
    { re: /^#\/fix$/, page: 'fix', nav: 'fix' },
    { re: /^#\/admin\/users$/, page: 'users', nav: 'users', admin: true },
    { re: /^#\/admin\/masters$/, page: 'masters', nav: 'masters', admin: true },
    { re: /^#\/admin\/reports$/, page: 'reports', nav: 'reports', admin: true },
    { re: /^#\/admin\/audit$/, page: 'audit', nav: 'audit', admin: true }
  ];
  let renderSeq = 0;
  App.render = async function () {
    if (!S.token) return;
    const seq = ++renderSeq, view = $('#view'), hash = location.hash || '#/dashboard';
    App.destroyCharts && App.destroyCharts();
    const route = ROUTES.find(r => r.re.test(hash));
    App.$$('.nav-item').forEach(a => a.classList.toggle('on', !!route && a.dataset.nav === route.nav));
    closeSidebar();
    if (!route) { view.innerHTML = '<div class="card empty"><h2>ไม่พบหน้านี้</h2><a class="btn" href="#/dashboard">กลับหน้าภาพรวม</a></div>'; return; }
    if (route.admin && !App.isAdmin()) { view.innerHTML = '<div class="card empty"><h2>เฉพาะแอดมิน</h2><p class="muted">ท่านไม่มีสิทธิ์เข้าหน้านี้</p></div>'; return; }
    const m = hash.match(route.re);
    try { await App.pages[route.page](view, m && m[1]); }
    catch (e) {
      if (seq !== renderSeq) return;
      view.innerHTML = '<div class="card error-card"><h2>โหลดข้อมูลไม่สำเร็จ</h2><p>' + esc(e.message || e) + '</p><button class="btn primary" data-act="retry">ลองใหม่</button></div>';
    }
    if (seq === renderSeq) window.scrollTo(0, 0);
  };
  App.actions.retry = () => App.render();
  window.addEventListener('hashchange', () => App.render());

  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#backdrop').classList.remove('on'); }
  App.actions.menu = () => { $('#sidebar').classList.toggle('open'); $('#backdrop').classList.toggle('on'); };
  App.actions.closeMenu = closeSidebar;

  // ---------------------------------------------------------------- เริ่มระบบหลังล็อกอิน
  App.start = async function () {
    const [masters, me] = await Promise.all([App.api('masters.get'), App.api('me')]);
    S.masters = masters; S.user = me.user; S.pendingUsers = me.pendingUsers || 0;
    S.year = S.year || masters.settings.CurrentYear;
    App.saveSession();
    $('#login-screen').hidden = true; $('#app').hidden = false;
    buildNav();
    if (!location.hash || location.hash === '#') location.hash = '#/dashboard'; else App.render();
  };

  // ---------------------------------------------------------------- ล็อกอิน Google
  let gisReady = false;
  function loginMsg(html, cls) { const el = $('#login-msg'); el.className = 'login-msg ' + (cls || ''); el.innerHTML = html; el.hidden = !html; }
  App.showLogin = function (msg) {
    $('#app').hidden = true; $('#login-screen').hidden = false; $('#login-spin').hidden = true; $('#g-btn').hidden = false;
    loginMsg(msg ? esc(msg) : '', msg ? 'warn' : '');
    initGoogle();
  };
  function initGoogle() {
    const idv = cfg.GOOGLE_CLIENT_ID || '';
    if (!idv || /YOUR_CLIENT_ID/.test(idv)) { loginMsg('ยังไม่ได้ตั้งค่า <b>GOOGLE_CLIENT_ID</b> ในไฟล์ <code>config.js</code>', 'err'); $('#g-btn').hidden = true; return; }
    let tries = 0;
    const t = setInterval(() => {
      if (window.google && google.accounts && google.accounts.id) {
        clearInterval(t);
        if (!gisReady) { google.accounts.id.initialize({ client_id: idv, callback: onCredential, auto_select: false, cancel_on_tap_outside: true }); gisReady = true; }
        $('#g-btn').innerHTML = '';
        google.accounts.id.renderButton($('#g-btn'), { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'th', width: 300 });
      } else if (++tries > 60) { clearInterval(t); loginMsg('โหลดระบบ Google Sign-In ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตหรือการบล็อกสคริปต์ แล้วรีเฟรชหน้า', 'err'); }
    }, 200);
  }
  async function onCredential(resp) {
    $('#g-btn').hidden = true; $('#login-spin').hidden = false; loginMsg('');
    try {
      const r = await App.api('loginGoogle', { idToken: resp.credential }, { noLogout: true });
      if (r.status === 'approved') {
        S.token = r.token; S.expiresAt = r.expiresAt; S.user = r.user; App.saveSession();
        await App.start();
      } else {
        $('#login-spin').hidden = true;
        const icon = r.status === 'pending' ? '⏳' : '⛔';
        loginMsg('<div class="status-box ' + esc(r.status) + '"><div class="big">' + icon + '</div><b>' + esc(r.message) + '</b><div class="muted small">บัญชี: ' + esc(r.email) + '</div>' +
          (r.status === 'pending' ? '<p class="small">ผู้ดูแลระบบได้รับแจ้งแล้ว เมื่ออนุมัติแล้วให้เข้าสู่ระบบอีกครั้ง</p>' : '') + '<button class="btn" id="btn-other">ใช้บัญชี Google อื่น</button></div>', '');
        $('#btn-other').addEventListener('click', () => { try { google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ } App.showLogin(''); });
      }
    } catch (e) { $('#login-spin').hidden = true; $('#g-btn').hidden = false; loginMsg(esc(e.message), 'err'); }
  }

  // ---------------------------------------------------------------- boot
  document.addEventListener('DOMContentLoaded', async () => {
    document.title = cfg.APP_NAME || document.title;
    $('#login-org').textContent = cfg.ORG_NAME || ''; $('#login-title').textContent = cfg.APP_NAME || '';
    const s = App.loadSession();
    if (s) {
      S.token = s.token; S.expiresAt = s.expiresAt; S.user = s.user;
      try { await App.start(); return; } catch (e) { App.clearSession(); App.showLogin(e.code === 'AUTH' ? '' : e.message); return; }
    }
    App.showLogin('');
  });
})();
