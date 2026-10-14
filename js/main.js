/* เริ่มระบบ: ล็อกอินด้วย Google (Gmail), เมนู, เราต์เตอร์ */
(function () {
  'use strict';
  const App = window.App, esc = App.esc, $ = App.$, S = App.state, cfg = App.cfg;

  // ---------------------------------------------------------------- เมนู
  const NAV = [
    { sep: 'WORKSPACE' },
    { id: 'mywork', label: 'งานของฉัน', icon: 'fa-user-check', hash: '#/mywork' },
    { id: 'dashboard', label: 'ภาพรวมผู้บริหาร', icon: 'fa-chart-line', hash: '#/dashboard' },
    { id: 'plans', label: 'โครงการทั้งหมด', icon: 'fa-folder-open', hash: '#/plans' },
    { id: 'strategy', label: 'แผนงานและกลยุทธ์', icon: 'fa-bullseye', hash: '#/strategy' },
    { id: 'tasks', label: 'งานและสิ่งที่ต้องทำ', icon: 'fa-list-check', hash: '#/tasks' },
    { id: 'timeline', label: 'แผนเวลาโครงการ', icon: 'fa-timeline', hash: '#/timeline' },
    { id: 'milestones', label: 'หมุดหมายสำคัญ', icon: 'fa-flag', hash: '#/milestones' },
    { id: 'overdue', label: 'ค้างส่งสรุป', icon: 'fa-clock', hash: '#/overdue' },
    { sep: 'FINANCE & GOVERNANCE' },
    { id: 'budget', label: 'งบประมาณ', icon: 'fa-wallet', hash: '#/budget' },
    { id: 'expenses', label: 'ค่าใช้จ่าย', icon: 'fa-receipt', hash: '#/expenses' },
    { id: 'approvals', label: 'คำขออนุมัติ', icon: 'fa-clipboard-check', hash: '#/approvals' },
    { id: 'risks', label: 'บริหารความเสี่ยง', icon: 'fa-triangle-exclamation', hash: '#/risks' },
    { id: 'issues', label: 'ปัญหาและอุปสรรค', icon: 'fa-circle-exclamation', hash: '#/issues' },
    { sep: 'COLLABORATION' },
    { id: 'resources', label: 'ทรัพยากร', icon: 'fa-boxes-stacked', hash: '#/resources' },
    { id: 'team', label: 'ทีมและผู้รับผิดชอบ', icon: 'fa-people-group', hash: '#/team' },
    { id: 'documents', label: 'เอกสารโครงการ', icon: 'fa-file-lines', hash: '#/documents' },
    { id: 'meetings', label: 'การประชุม', icon: 'fa-calendar-check', hash: '#/meetings' },
    { sep: 'INSIGHTS & SYSTEM' },
    { id: 'report', label: 'รายงานผู้บริหาร', icon: 'fa-chart-column', hash: '#/report' },
    { id: 'alerts', label: 'ศูนย์แจ้งเตือน', icon: 'fa-bell', hash: '#/alerts' },
    { id: 'activity', label: 'ประวัติการทำรายการ', icon: 'fa-clock-rotate-left', hash: '#/activity' },
    { id: 'archive', label: 'คลังโครงการ', icon: 'fa-box-archive', hash: '#/archive' },
    { id: 'fix', label: 'ข้อมูลรอแก้ไข', icon: 'fa-screwdriver-wrench', hash: '#/fix' },
    { id: 'masters', label: 'ตั้งค่าระบบ', icon: 'fa-gear', hash: '#/admin/masters', admin: true },
    { sep: 'ADMIN', admin: true },
    { id: 'users', label: 'ผู้ใช้งาน', icon: 'fa-users', hash: '#/admin/users', admin: true, badge: 'pendingUsers' },
    { id: 'reports', label: 'รายงาน/ส่งออก', icon: 'fa-print', hash: '#/admin/reports', admin: true },
    { id: 'audit', label: 'ประวัติการใช้งานระบบ', icon: 'fa-shield-alt', hash: '#/admin/audit', admin: true }
  ];
  App.buildNav = function () { buildNav(); };
  function buildNav() {
    $('#nav').innerHTML = NAV.filter(n => !n.admin || App.isAdmin()).map(n => n.sep ? '<div class="nav-sep">' + n.sep + '</div>' :
      '<a class="nav-item" data-nav="' + n.id + '" href="' + n.hash + '"><span class="ico"><i class="fas ' + n.icon + '"></i></span><span>' + esc(n.label) + '</span>' + (n.badge ? '<span class="nav-badge" data-badge="' + n.badge + '" hidden></span>' : '') + '</a>').join('');
    const u = S.user;
    const roleTh = { admin: 'แอดมิน', user: 'เจ้าหน้าที่', viewer: 'ผู้ดูข้อมูล' }[u.role] || u.role;
    const av0 = u.picture ? '<img class="avatar" src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">' : '<span class="avatar">' + esc((u.name || u.email || '?').charAt(0)) + '</span>';
    const av = '<button type="button" class="avatar-btn" data-act="profile" title="เปลี่ยนรูปประจำตัว" aria-label="เปลี่ยนรูปประจำตัว">' + av0 + '</button>';
    $('#user-chip').innerHTML = '<div class="role-badge">' + esc(roleTh) + '</div><div class="user-mini">' + av +
      '<span class="nm" title="' + esc(u.email || '') + '">' + esc(u.name || u.email) + '</span></div>' +
      '<button class="btn-logout" id="btn-logout"><i class="fas fa-sign-out-alt"></i> ออกจากระบบ</button>';
    $('#tb-avatar').innerHTML = av;
    $('#btn-logout').addEventListener('click', () => App.logout());
    if (cfg.ORG_NAME) $('#ws-name').textContent = cfg.ORG_NAME.replace('โรงพยาบาล', 'รพ.');
    App.updateBadges();
  }
  App.updateBadges = function () { App.$$('[data-badge]').forEach(b => { const n = S[b.dataset.badge] || 0; b.textContent = n; b.hidden = !n; }); const d = $('#tb-dot'); if (d) d.hidden = !(S.pendingUsers > 0); };

  // ---------------------------------------------------------------- เราต์เตอร์
  const ROUTES = [
    { re: /^#?\/?$|^#\/dashboard$/, page: 'dashboard', nav: 'dashboard' },
    { re: /^#\/mywork$/, page: 'mywork', nav: 'mywork' },
    { re: /^#\/strategy$/, page: 'strategy', nav: 'strategy' },
    { re: /^#\/tasks$/, page: 'tasks', nav: 'tasks' },
    { re: /^#\/timeline$/, page: 'timeline', nav: 'timeline' },
    { re: /^#\/milestones$/, page: 'milestones', nav: 'milestones' },
    { re: /^#\/budget$/, page: 'budget', nav: 'budget' },
    { re: /^#\/expenses$/, page: 'expenses', nav: 'expenses' },
    { re: /^#\/approvals$/, page: 'approvals', nav: 'approvals' },
    { re: /^#\/risks$/, page: 'risks', nav: 'risks' },
    { re: /^#\/issues$/, page: 'issues', nav: 'issues' },
    { re: /^#\/resources$/, page: 'resources', nav: 'resources' },
    { re: /^#\/team$/, page: 'team', nav: 'team' },
    { re: /^#\/documents$/, page: 'documents', nav: 'documents' },
    { re: /^#\/meetings$/, page: 'meetings', nav: 'meetings' },
    { re: /^#\/report$/, page: 'report', nav: 'report' },
    { re: /^#\/alerts$/, page: 'alerts', nav: 'alerts' },
    { re: /^#\/activity$/, page: 'activity', nav: 'activity' },
    { re: /^#\/archive$/, page: 'archive', nav: 'archive' },
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
    App.$$('.nav-item,.mn-item[data-nav]').forEach(a => a.classList.toggle('on', !!route && a.dataset.nav === route.nav));
    const nv = NAV.find(n => route && n.id === route.nav); $('#crumb').textContent = nv ? nv.label : 'SANSAI Strategy & Plan'; $('#tb-year').textContent = 'ปีงบ ' + (S.year || '');
    closeSidebar();
    if (!route) { view.innerHTML = '<div class="card empty"><h2>ไม่พบหน้านี้</h2><a class="btn" href="#/dashboard">กลับหน้าภาพรวม</a></div>'; return; }
    if (route.admin && !App.isAdmin()) { view.innerHTML = '<div class="card empty"><h2>เฉพาะแอดมิน</h2><p class="muted">ท่านไม่มีสิทธิ์เข้าหน้านี้</p></div>'; return; }
    const m = hash.match(route.re);
    view.setAttribute('aria-busy', 'true');
    try { await App.pages[route.page](view, m && m[1]); }
    catch (e) {
      if (seq !== renderSeq) return;
      view.innerHTML = '<div class="card error-card"><h2>โหลดข้อมูลไม่สำเร็จ</h2><p>' + esc(e.message || e) + '</p><button class="btn primary" data-act="retry">ลองใหม่</button></div>';
    }
    if (seq === renderSeq) {
      view.setAttribute('aria-busy', 'false');
      view.querySelectorAll('input:not([type=hidden]):not([aria-label]),select:not([aria-label]),textarea:not([aria-label])').forEach(el => { // ป้ายกำกับสำหรับโปรแกรมอ่านหน้าจอ
        if ((el.id && view.querySelector('label[for="' + el.id + '"]')) || el.closest('label')) return;
        const t = el.placeholder || (el.options && el.options[0] && el.options[0].textContent) || el.name; if (t) el.setAttribute('aria-label', t);
      });
      window.scrollTo(0, 0);
    }
  };
  App.actions.retry = () => App.render();
  window.addEventListener('hashchange', () => App.render());

  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#backdrop').classList.remove('on'); }
  App.actions.menu = () => { $('#sidebar').classList.toggle('open'); $('#backdrop').classList.toggle('on'); };
  App.actions.closeMenu = closeSidebar;

  // ---------------------------------------------------------------- เริ่มระบบหลังล็อกอิน
  App.start = async function () {
    const [masters, me] = await Promise.all([App.api('masters.get'), App.api('me')]);
    S.masters = masters; S.user = me.user; S.maintenance = !!me.maintenance;
    (function () { let b = document.getElementById('maint-banner'); if (!b) { b = document.createElement('div'); b.id = 'maint-banner'; b.setAttribute('role', 'status'); b.textContent = 'ระบบอยู่ระหว่างปิดปรับปรุงชั่วคราว — ดูข้อมูลได้ แต่ยังบันทึกการแก้ไขไม่ได้ (เฉพาะแอดมินบันทึกได้)'; document.body.appendChild(b); } b.hidden = !me.maintenance; })(); S.pendingUsers = me.pendingUsers || 0;
    S.year = S.year || masters.settings.CurrentYear;
    App.saveSession();
    $('#login-screen').hidden = true; const acs = $('#access-screen'); if (acs) acs.hidden = true; $('#app').hidden = false;
    buildNav();
    if (!location.hash || location.hash === '#') location.hash = '#/dashboard'; else App.render();
  };

  // ---------------------------------------------------------------- ล็อกอิน Google
  let gisReady = false;
  function loginMsg(html, cls) { const el = $('#login-msg'); el.className = 'login-msg ' + (cls || ''); el.innerHTML = html; el.hidden = !html; }
  App.showLogin = function (msg) {
    const ac = $('#access-screen'); if (ac) ac.hidden = true;
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
        google.accounts.id.renderButton($('#g-btn'), { theme: 'outline', size: 'large', shape: 'rectangular', text: 'signin_with', locale: 'th', width: 300 });
      } else if (++tries > 60) { clearInterval(t); loginMsg('โหลดระบบ Google Sign-In ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตหรือการบล็อกสคริปต์ แล้วรีเฟรชหน้า', 'err'); }
    }, 200);
  }
  App.completeLogin = async function (r) { S.token = r.token; S.expiresAt = r.expiresAt; S.user = r.user; App.saveSession(); await App.start(); };
  async function onCredential(resp) {
    $('#g-btn').hidden = true; $('#login-spin').hidden = false; loginMsg('');
    try {
      const r = await App.api('loginGoogle', { idToken: resp.credential }, { noLogout: true });
      if (r.status === 'approved') {
        await App.completeLogin(r);
      } else {
        // ยังไม่ได้รับอนุมัติ: new = กรอกแบบขออนุญาต · pending/rejected/suspended = หน้าสถานะ (ดู js/access.js)
        $('#login-spin').hidden = true; $('#g-btn').hidden = false;
        await App.access.show(r, resp.credential);
      }
    } catch (e) { $('#login-spin').hidden = true; $('#g-btn').hidden = false; loginMsg(esc(e.message), 'err'); }
  }

  // ---------------------------------------------------------------- boot
  document.addEventListener('DOMContentLoaded', async () => {
    document.title = cfg.APP_NAME || document.title;
    if (cfg.ORG_NAME) $('#login-org-name').textContent = cfg.ORG_NAME;
    const s = App.loadSession();
    if (s) {
      S.token = s.token; S.expiresAt = s.expiresAt; S.user = s.user;
      try { await App.start(); return; } catch (e) { App.clearSession(); App.showLogin(e.code === 'AUTH' ? '' : e.message); return; }
    }
    App.showLogin('');
  });
})();
