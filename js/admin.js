/* หน้าแอดมิน: ผู้ใช้งาน (อนุมัติ Gmail), ข้อมูลหลัก/ตั้งค่า, ประวัติการใช้งาน, รายงาน/ส่งออก */
(function () {
  'use strict';
  const App = window.App, esc = App.esc, $ = App.$, S = App.state;
  const pageHead = (t, s, a) => App.pageHead(t, s, a);

  // ===================================================================== ผู้ใช้งาน
  const USER_TABS = [['pending', 'รออนุมัติ'], ['approved', 'อนุมัติแล้ว'], ['other', 'ปฏิเสธ/ระงับ'], ['all', 'ทั้งหมด']];
  const ST_LABEL = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ', suspended: 'ระงับ' };
  const ST_CLASS = { pending: 'amber', approved: 'green', rejected: 'red', suspended: 'dark' };
  const ROLE_LABEL = { admin: 'แอดมิน', user: 'เจ้าหน้าที่ (แก้ไขได้)', viewer: 'ผู้ดูข้อมูล (อ่านอย่างเดียว)' };

  App.pages.users = async function (view) {
    view.innerHTML = App.skeleton();
    const users = await App.api('users.list');
    S.users = users;
    const tab = S.userTab || (users.some(u => u.Status === 'pending') ? 'pending' : 'approved');
    const rows = users.filter(u => tab === 'all' || (tab === 'other' ? (u.Status === 'rejected' || u.Status === 'suspended') : u.Status === tab))
      .sort((a, b) => String(b.RequestedAt).localeCompare(String(a.RequestedAt)));
    const count = k => users.filter(u => k === 'all' || (k === 'other' ? (u.Status === 'rejected' || u.Status === 'suspended') : u.Status === k)).length;
    view.innerHTML = pageHead('ผู้ใช้งาน', 'ผู้ที่ล็อกอินด้วย Gmail ครั้งแรกจะอยู่สถานะ "รออนุมัติ" จนกว่าแอดมินจะอนุมัติ — สิทธิ์เปลี่ยนมีผลทันที', '') +
      '<div class="tabs">' + USER_TABS.map(t => '<button class="tab' + (t[0] === tab ? ' on' : '') + '" data-act="userTab" data-id="' + t[0] + '">' + t[1] + ' <span class="count">' + count(t[0]) + '</span></button>').join('') + '</div>' +
      '<div class="card table-card"><div class="table-wrap"><table class="table"><thead><tr><th>ผู้ใช้</th><th>กลุ่มงาน / ผู้รับผิดชอบ</th><th>บทบาท</th><th>สถานะ</th><th>เข้าล่าสุด</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(u => '<tr><td><div class="user-cell">' + (u.Picture ? '<img src="' + esc(u.Picture) + '" alt="" referrerpolicy="no-referrer">' : '<span class="avatar">' + esc((u.Name || u.Email).charAt(0)) + '</span>') + '<div><b>' + esc(u.Name) + '</b><div class="muted small">' + esc(u.Email) + '</div></div></div></td>' +
        '<td>' + esc(u.Department || '-') + '<div class="muted small">' + esc(u.PersonName || '') + '</div></td><td>' + esc(ROLE_LABEL[u.Role] || u.Role) + '</td><td>' + App.badge(ST_LABEL[u.Status] || u.Status, ST_CLASS[u.Status]) + '<div class="muted small">' + (u.RequestedAt ? 'ขอเมื่อ ' + App.dateTime(u.RequestedAt) : '') + '</div></td><td class="muted small">' + (u.LastLoginAt ? App.dateTime(u.LastLoginAt) : '—') + '</td><td class="act-cell wrap">' + userButtons(u) + '</td></tr>').join('') :
        '<tr><td colspan="6" class="empty">ไม่มีรายการ</td></tr>') + '</tbody></table></div></div>';
  };
  function userButtons(u) {
    const id = ' data-id="' + esc(u.Email) + '"', self = u.Email.toLowerCase() === S.user.email.toLowerCase();
    if (u.Status === 'pending') return '<button class="btn sm primary" data-act="approveUser"' + id + '>อนุมัติ</button><button class="btn sm danger ghost" data-act="rejectUser"' + id + '>ปฏิเสธ</button>';
    let h = '<button class="btn sm ghost" data-act="editUser"' + id + '>แก้ไข</button>';
    if (u.Status === 'approved' && !self) h += '<button class="btn sm ghost" data-act="suspendUser"' + id + '>ระงับ</button>';
    if ((u.Status === 'rejected' || u.Status === 'suspended')) h += '<button class="btn sm" data-act="approveUser"' + id + '>อนุมัติ/คืนสิทธิ์</button>';
    if (!self) h += '<button class="icon-btn" title="ลบ" data-act="deleteUser"' + id + '><i class="fas fa-trash"></i></button>';
    return h;
  }
  const userOf = email => S.users.find(u => u.Email === email);
  const refreshBadge = async () => { try { const m = await App.api('me', {}, { noLogout: true }); S.pendingUsers = m.pendingUsers || 0; App.updateBadges && App.updateBadges(); } catch (e) { /* ignore */ } };
  App.actions.userTab = el => { S.userTab = el.dataset.id; App.render(); };
  function userForm(u, approving) {
    const depts = (App.masters().data.departments || []).filter(d => d.Active !== false);
    const ppl = (App.masters().data.people || []).filter(p => p.Active !== false);
    const html = '<div class="form-grid">' + App.field({ name: 'name', label: 'ชื่อที่แสดง', value: u.Name, full: true }) +
      App.field({ name: 'role', label: 'บทบาท', type: 'select', noBlank: true, options: [{ v: 'user', l: ROLE_LABEL.user }, { v: 'viewer', l: ROLE_LABEL.viewer }, { v: 'admin', l: ROLE_LABEL.admin }], value: u.Role, full: true }) +
      App.field({ name: 'department', label: 'กลุ่มงาน', type: 'select', options: depts.map(d => d.Name), value: u.Department }) +
      App.field({ name: 'personName', label: 'ผูกกับผู้รับผิดชอบ (ใช้กับสิทธิ์ "แก้ได้เฉพาะแผนตนเอง")', type: 'select', options: ppl.map(p => p.Name), value: u.PersonName }) +
      App.field({ name: 'note', label: 'หมายเหตุ', value: u.Note || '', full: true }) + '</div>';
    App.modal({ title: (approving ? 'อนุมัติ: ' : 'แก้ไข: ') + u.Email, html: html, onSubmit: async d => {
      const v = App.values(d); const p = { email: u.Email, name: v.name, role: v.role, department: v.department, personName: v.personName, note: v.note };
      if (approving) p.status = 'approved';
      await App.api('users.update', p); App.toast(approving ? 'อนุมัติแล้ว (ระบบส่งอีเมลแจ้งผู้ใช้)' : 'บันทึกแล้ว', 'success'); await refreshBadge(); App.render(); } });
  }
  App.actions.approveUser = el => userForm(userOf(el.dataset.id), true);
  App.actions.editUser = el => userForm(userOf(el.dataset.id), false);
  const setStatus = async (email, status, msg) => { await App.api('users.update', { email: email, status: status }); App.toast(msg, 'success'); await refreshBadge(); App.render(); };
  App.actions.rejectUser = async el => { if (await App.confirm('ปฏิเสธคำขอของ ' + el.dataset.id + ' ?', 'ปฏิเสธ', true)) await setStatus(el.dataset.id, 'rejected', 'ปฏิเสธแล้ว'); };
  App.actions.suspendUser = async el => { if (await App.confirm('ระงับการใช้งานของ ' + el.dataset.id + ' ? (ใช้งานต่อไม่ได้ทันที)', 'ระงับ', true)) await setStatus(el.dataset.id, 'suspended', 'ระงับแล้ว'); };
  App.actions.deleteUser = async el => { if (await App.confirm('ลบผู้ใช้ ' + el.dataset.id + ' ออกจากระบบ ?', 'ลบ', true)) { await App.api('users.delete', { email: el.dataset.id }); App.toast('ลบแล้ว', 'success'); await refreshBadge(); App.render(); } };

  // ===================================================================== ข้อมูลหลัก + ตั้งค่า
  const MASTER_ORDER = ['funds', 'categories', 'planTypes', 'moph', 'mission', 'prov', 'hosp', 'departments', 'people'];
  App.pages.masters = async function (view) {
    view.innerHTML = App.skeleton();
    const m = await App.api('masters.get'); S.masters = m;
    const tab = S.masterTab || 'people';
    const tabs = MASTER_ORDER.map(k => '<button class="tab' + (k === tab ? ' on' : '') + '" data-act="masterTab" data-id="' + k + '">' + esc(m.schema[k].label) + '</button>').join('') + '<button class="tab' + (tab === 'settings' ? ' on' : '') + '" data-act="masterTab" data-id="settings">ตั้งค่าระบบ</button>';
    view.innerHTML = pageHead('ข้อมูลหลัก / ตั้งค่า', 'แก้ไขแล้วมีผลทันทีกับฟอร์มทุกหน้า (รายการที่ปิด "ใช้งาน" จะไม่แสดงในตัวเลือก แต่ข้อมูลเดิมไม่หาย)', '') + '<div class="tabs scroll">' + tabs + '</div><div id="master-body"></div>';
    if (tab === 'settings') return drawSettings(m);
    drawMasterTable(m, tab);
  };
  App.actions.masterTab = el => { S.masterTab = el.dataset.id; App.render(); };
  function drawMasterTable(m, key) {
    const sc = m.schema[key], rows = m.data[key], q = (S.masterQ || '').toLowerCase();
    const show = rows.filter(r => !q || JSON.stringify(r).toLowerCase().indexOf(q) >= 0);
    const cell = (c, v) => c.type === 'bool' ? (v ? '<span class="badge green">ใช้งาน</span>' : '<span class="badge gray">ปิด</span>') : esc(v);
    $('#master-body').innerHTML = '<div class="card table-card"><div class="table-tools"><input type="search" id="mq" placeholder="ค้นหา…" value="' + esc(S.masterQ || '') + '"><span class="muted">' + show.length + '/' + rows.length + ' รายการ</span><button class="btn primary" data-act="addMaster" data-id="' + key + '"><i class="fas fa-plus"></i> เพิ่ม</button></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr>' + sc.cols.map(c => '<th>' + esc(c.label) + '</th>').join('') + '<th></th></tr></thead><tbody>' +
      show.map(r => '<tr>' + sc.cols.map(c => '<td' + (c.type === 'number' ? ' class="num"' : '') + '>' + cell(c, r[c.name]) + '</td>').join('') + '<td class="act-cell"><button class="icon-btn" title="แก้ไข" data-act="editMaster" data-id="' + key + '" data-key="' + esc(r[sc.key]) + '"><i class="fas fa-pen"></i></button></td></tr>').join('') + '</tbody></table></div></div>';
    $('#mq').addEventListener('input', App.debounce(e => { S.masterQ = e.target.value; drawMasterTable(m, key); const i = $('#mq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 200));
  }
  function masterForm(key, row) {
    const sc = S.masters.schema[key], isNew = !row, r = row || { Active: true };
    const fields = sc.cols.map(c => {
      const f = { name: c.name, label: c.label, value: r[c.name], required: c.required };
      if (c.type === 'bool') { f.type = 'checkbox'; f.value = r[c.name] !== false; f.full = true; } else if (c.type === 'number') { f.type = 'number'; f.step = 'any'; } else if (c.type === 'select') { f.type = 'select'; f.options = c.options; f.noBlank = true; }
      if (c.name === sc.key && !isNew) f.readonly = true;
      if (c.name === 'MissionCode') { f.type = 'select'; f.options = S.masters.data.mission.map(x => ({ v: x.Code, l: x.Code + '. ' + x.Name })); }
      if (c.name === 'Department' && key === 'people') { f.type = 'select'; f.options = S.masters.data.departments.map(x => x.Name); }
      if (c.name === 'Mission' && key === 'departments') { f.type = 'text'; f.list = 'dl-missions'; }
      if (['Name', 'Mission'].indexOf(c.name) >= 0 && key !== 'funds') f.full = true;
      return f;
    });
    const missions = Array.from(new Set((S.masters.data.departments || []).map(d => d.Mission)));
    App.modal({ title: (isNew ? 'เพิ่ม' : 'แก้ไข') + ' ' + sc.label, html: '<datalist id="dl-missions">' + missions.map(x => '<option value="' + esc(x) + '">').join('') + '</datalist>' + App.formGrid(fields),
      onSubmit: async d => { await App.api('masters.save', { table: key, isNew: isNew, row: App.values(d) }); App.toast('บันทึกแล้ว', 'success'); await reloadMasters(); App.render(); } });
  }
  async function reloadMasters() { S.masters = await App.api('masters.get'); }
  App.actions.addMaster = el => masterForm(el.dataset.id, null);
  App.actions.editMaster = el => { const sc = S.masters.schema[el.dataset.id]; masterForm(el.dataset.id, S.masters.data[el.dataset.id].find(r => String(r[sc.key]) === el.dataset.key)); };
  function drawSettings(m) {
    const desc = { CurrentYear: 'ปีงบประมาณปัจจุบัน (พ.ศ.)', ExcludeCancelledFromRate: 'ร้อยละเบิกจ่าย: ไม่นับงบของกิจกรรมที่ยกเลิก/ไม่เบิก', UserEditScope: 'ขอบเขตการแก้ไขของเจ้าหน้าที่', SummaryGraceDays: 'จำนวนวันหลังกิจกรรมสุดท้ายสิ้นสุด ก่อนถือว่าค้างส่งสรุป', FileSharing: 'การแชร์ไฟล์หลักฐานบน Drive', ImportLocked: 'ล็อกการนำเข้าข้อมูลจากชีทเดิม', RequireReasonAfterApproval: 'แผนที่อนุมัติแล้ว: ต้องระบุเหตุผลเมื่อแก้งบ/สถานะ/ลบรายการ', LockClosedPlans: 'แผนสถานะ "ปิด": แก้ไขได้เฉพาะแอดมิน' };
    const sel = { ExcludeCancelledFromRate: ['TRUE', 'FALSE'], UserEditScope: [{ v: 'all', l: 'all — แก้ได้ทุกแผน' }, { v: 'own', l: 'own — เฉพาะแผนที่ตนเองรับผิดชอบ' }], FileSharing: [{ v: 'link', l: 'link — ใครมีลิงก์เปิดดูได้' }, { v: 'private', l: 'private — ไม่แชร์' }], ImportLocked: ['TRUE', 'FALSE'], RequireReasonAfterApproval: ['TRUE', 'FALSE'], LockClosedPlans: ['TRUE', 'FALSE'] };
    $('#master-body').innerHTML = '<div class="card"><div class="settings">' + Object.keys(desc).map(k => {
      const v = m.settings[k] === undefined ? '' : m.settings[k];
      const input = sel[k] ? '<select data-setting="' + k + '">' + sel[k].map(o => { const ov = typeof o === 'object' ? o.v : o, ol = typeof o === 'object' ? o.l : o; return '<option value="' + esc(ov) + '"' + (ov === v ? ' selected' : '') + '>' + esc(ol) + '</option>'; }).join('') + '</select>' : '<input data-setting="' + k + '" value="' + esc(v) + '">';
      return '<div class="setting"><div><b>' + esc(k) + '</b><div class="muted small">' + esc(desc[k]) + '</div></div>' + input + '<button class="btn sm" data-act="saveSetting" data-id="' + k + '">บันทึก</button></div>';
    }).join('') + '</div></div>';
  }
  App.actions.saveSetting = async el => {
    const k = el.dataset.id, inp = document.querySelector('[data-setting="' + k + '"]');
    await App.api('settings.save', { key: k, value: inp.value }); App.toast('บันทึกการตั้งค่าแล้ว', 'success');
    await reloadMasters(); if (k === 'CurrentYear') S.year = inp.value;
  };

  // ===================================================================== ประวัติการใช้งาน
  App.pages.audit = async function (view) {
    view.innerHTML = App.skeleton();
    const rows = await App.api('audit.list', { limit: 300 });
    view.innerHTML = pageHead('ประวัติการใช้งานระบบ', 'บันทึกทุกการเพิ่ม/แก้ไข/ลบ และการเข้าสู่ระบบ (ล่าสุด ' + rows.length + ' รายการ)', '') +
      '<div class="card table-card"><div class="table-wrap"><table class="table slim"><thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>รายการ</th><th>รายละเอียด</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td class="nowrap">' + App.dateTime(r.Time) + '</td><td>' + esc(r.Email) + '</td><td>' + esc(r.Action) + '</td><td class="muted">' + esc(r.Entity) + '</td><td class="muted">' + esc(r.Detail) + '</td></tr>').join('') + '</tbody></table></div></div>';
  };

  // ===================================================================== รายงาน / ส่งออก
  App.pages.reports = async function (view) {
    view.innerHTML = pageHead('รายงาน / ส่งออก', 'สร้างรายงานตามแหล่งเงินในรูปแบบใกล้เคียงชีท "สรุปแผนงาน+โครงการ" เดิม', '<label class="inline-field"><span>ปีงบประมาณ</span><select data-change="year">' + App.years().map(y => '<option' + (y === S.year ? ' selected' : '') + '>' + y + '</option>').join('') + '</select></label>') +
      '<div class="card"><h2>ส่งออกเป็นแท็บในชีตฐานข้อมูล</h2><p class="muted">สร้าง/อัปเดตแท็บ "รายงาน-&lt;แหล่งเงิน&gt;" ในชีตฐานข้อมูล (งบ เบิกจ่าย คงเหลือ ร้อยละ แยกรายหมวด) — แท็บเหล่านี้เป็นรายงานที่ระบบสร้างให้ ไม่ต้องกรอกข้อมูลในแท็บนี้</p>' +
      '<button class="btn primary" data-act="exportSheets">สร้างรายงานลงชีต</button><div id="export-result"></div></div>' +
      '<div class="card"><h2>ส่งออก CSV</h2><p class="muted">ไปที่หน้า "แผนงาน/โครงการ" แล้วกดปุ่ม <i class="fas fa-download"></i> CSV (ส่งออกตามตัวกรองที่เลือก)</p><a class="btn" href="#/plans">ไปหน้าแผนงาน</a></div>';
  };
  App.actions.exportSheets = async el => {
    el.disabled = true; el.textContent = 'กำลังสร้าง…';
    try {
      const r = await App.api('report.export', { year: S.year });
      $('#export-result').innerHTML = '<div class="alert info"><div><b>สร้างแล้ว ' + r.sheets.length + ' แท็บ:</b> ' + r.sheets.map(esc).join(', ') + '<div class="muted small">' + esc(r.note) + '</div></div><a target="_blank" rel="noopener" href="' + esc(r.url) + '">เปิดชีต →</a></div>';
      App.toast('สร้างรายงานแล้ว', 'success');
    } finally { el.disabled = false; el.textContent = 'สร้างรายงานลงชีต'; }
  };
})();
