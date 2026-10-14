/* ขออนุญาตเข้าใช้งาน (v2.7): ล็อกอิน Google -> แบบขออนุญาต 3 ขั้นตอน -> รอแอดมินอนุมัติ
   หน้าจอสถานะ: new/ต้องกรอกเพิ่ม -> ฟอร์ม | pending -> ไทม์ไลน์ | rejected -> เหตุผล + ยื่นใหม่ | suspended
   ฝั่งเซิร์ฟเวอร์ตรวจซ้ำทุกช่อง (access.request) — การตรวจที่นี่เพื่อให้ผู้ใช้แก้ได้ทันทีเท่านั้น */
(function () {
  'use strict';
  const App = window.App, esc = App.esc, $ = App.$;
  const NAME_RE = /^[\u0E01-\u0E3A\u0E40-\u0E4Ea-zA-Z][\u0E01-\u0E3A\u0E40-\u0E4Ea-zA-Z .'\-]*$/;
  const OTHER = '__other__';
  const ROLE_ICON = ['fa-star', 'fa-user-group', 'fa-handshake', 'fa-user-tie'];
  const ROLE_HINT = {
    'ผู้รับผิดชอบหลัก': 'แอดมินมักกำหนดสิทธิ์ “เจ้าหน้าที่ (แก้ไขได้)” เพื่อบันทึกความคืบหน้าและการเบิกจ่าย',
    'ผู้รับผิดชอบร่วม': 'แอดมินมักกำหนดสิทธิ์ “เจ้าหน้าที่ (แก้ไขได้)” ตามแผนงาน/โครงการที่ร่วมรับผิดชอบ',
    'ผู้ประสานงาน': 'แอดมินมักกำหนดสิทธิ์ “เจ้าหน้าที่ (แก้ไขได้)” เพื่อติดตามและจัดเตรียมเอกสาร',
    'หัวหน้าหน่วยงาน': 'แอดมินมักกำหนดสิทธิ์ “ผู้ดูข้อมูล (อ่านอย่างเดียว)” หากต้องการสิทธิ์แก้ไขให้ระบุในหมายเหตุ'
  };
  const ac = { opts: null, cred: '', r: null, step: 1, d: {}, hint: {} };

  function screen() {
    let el = $('#access-screen');
    if (!el) { el = document.createElement('section'); el.id = 'access-screen'; el.hidden = true; document.body.appendChild(el); }
    return el;
  }
  function frame(inner) {
    const el = screen();
    el.innerHTML = '<div class="ac-wrap"><div class="ac-brand"><img src="assets/logo-mark.png" alt=""><span><b>SANSAI Hospital Strategy &amp; Plan</b><small>' + esc(ac.opts ? ac.opts.org : 'โรงพยาบาลสันทราย') + '</small></span></div>' +
      '<div class="ac-card">' + inner + '</div>' +
      '<p class="ac-foot"><a href="privacy" target="_blank" rel="noopener">นโยบายความเป็นส่วนตัว</a><a href="terms" target="_blank" rel="noopener">เงื่อนไขการใช้งาน</a></p></div>';
    $('#login-screen').hidden = true; $('#app').hidden = true; el.hidden = false; el.scrollTop = 0;
    return el;
  }
  const userBox = () => {
    const r = ac.r || {}, nm = r.name || r.email || '';
    return '<div class="ac-user">' + (r.picture && /^(https:|data:image\/)/.test(r.picture) ? '<img src="' + esc(r.picture) + '" alt="" referrerpolicy="no-referrer">' : '<span class="av">' + esc(String(nm).charAt(0).toUpperCase()) + '</span>') +
      '<div><b>' + esc(nm) + '</b><small>' + esc(r.email || '') + '</small></div><button type="button" class="btn sm ghost" id="ac-other">ใช้บัญชีอื่น</button></div>';
  };
  function bindOther() {
    const b = $('#ac-other'); if (!b) return;
    b.addEventListener('click', () => { try { google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ } ac.d = {}; App.showLogin(''); });
  }
  const steps = n => '<ol class="ac-steps" aria-label="ขั้นตอน">' + ['ข้อมูลผู้ขอ', 'หน้าที่ต่อแผนงาน', 'ตรวจสอบและยืนยัน'].map((t, i) =>
    '<li class="' + (i + 1 < n ? 'done' : i + 1 === n ? 'on' : '') + '"' + (i + 1 === n ? ' aria-current="step"' : '') + '><span>' + (i + 1 < n ? '<i class="fas fa-check"></i>' : i + 1) + '</span><b>' + t + '</b></li>').join('') + '</ol>';

  // ---------------------------------------------------------------- ตัวช่วยฟอร์ม
  const fld = (id, label, ctl, extra) => '<div class="field"><label for="' + id + '">' + label + ' <span class="req">*</span></label>' + ctl + (extra || '') + '<div class="ac-err" id="e_' + id + '" role="alert" hidden></div></div>';
  function setErr(id, msg) {
    const el = $('#' + id), er = $('#e_' + id); if (!er) return !msg;
    er.hidden = !msg; er.innerHTML = msg ? '<i class="fas fa-circle-exclamation"></i><span>' + esc(msg) + '</span>' : '';
    if (el) { if (msg) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'e_' + id); } else { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); } }
    return !msg;
  }
  const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  function note(kind, html) { return '<div class="ac-note ' + kind + '" role="' + (kind === 'err' ? 'alert' : 'status') + '"><i class="fas ' + (kind === 'err' ? 'fa-circle-exclamation' : kind === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-info') + '"></i><div>' + html + '</div></div>'; }

  // ---------------------------------------------------------------- ขั้น 1: ข้อมูลผู้ขอ
  function step1() {
    const o = ac.opts, d = ac.d;
    const orgVal = d.organization === undefined ? (o.organizations[0] || '') : d.organization;
    const orgIsList = o.organizations.indexOf(orgVal) >= 0, orgSel = orgIsList ? orgVal : (orgVal ? OTHER : o.organizations[0]);
    const fn = d.firstName !== undefined ? d.firstName : (ac.hint.firstName || ''), ln = d.lastName !== undefined ? d.lastName : (ac.hint.lastName || '');
    const re = ac.r && ac.r.status === 'rejected';
    const el = frame(userBox() + steps(1) + '<h2>ข้อมูลผู้ขอเข้าใช้งาน</h2><p class="muted">กรอกข้อมูลตามจริงเพื่อให้ผู้ดูแลระบบตรวจสอบและกำหนดสิทธิ์ได้ถูกต้อง</p>' +
      (re ? note('warn', '<b>คำขอครั้งก่อนไม่ได้รับอนุมัติ:</b> ' + esc(ac.r.reason || 'ไม่ระบุเหตุผล') + '<br>กรุณาแก้ไขข้อมูลแล้วยื่นคำขอใหม่') : '') +
      (ac.r && ac.r.needsProfile && ac.r.status === 'pending' ? note('info', 'บัญชีของท่านอยู่ระหว่างรออนุมัติ แต่ยังไม่มีข้อมูลประกอบ กรุณากรอกเพิ่มเติม') : '') +
      '<form id="ac-f1" novalidate><fieldset><legend>ชื่อ-สกุล (ตามบัตรประจำตัว/ทะเบียนบุคลากร)</legend><div class="ac-grid">' +
      fld('a_prefix', 'คำนำหน้า', '<select id="a_prefix" autocomplete="honorific-prefix"><option value="">เลือก…</option>' + o.prefixes.map(p => '<option' + (p === d.prefix ? ' selected' : '') + '>' + esc(p) + '</option>').join('') + '</select>') +
      fld('a_first', 'ชื่อ', '<input id="a_first" maxlength="60" autocomplete="given-name" value="' + esc(fn) + '" placeholder="เช่น สมชาย">') +
      fld('a_last', 'นามสกุล', '<input id="a_last" maxlength="60" autocomplete="family-name" value="' + esc(ln) + '" placeholder="เช่น ใจดี">') +
      '</div><p class="ac-hint"><i class="fas fa-lightbulb"></i> ไม่ต้องใส่คำนำหน้าในช่องชื่อ · ใช้ตัวอักษรไทย/อังกฤษเท่านั้น (ไม่มีตัวเลขหรือสัญลักษณ์) · ชื่อจะใช้แสดงเป็นผู้รับผิดชอบในแผนงาน</p></fieldset>' +
      '<fieldset><legend>หน่วยงานที่สังกัด</legend><div class="ac-grid two">' +
      fld('a_orgsel', 'หน่วยงาน', '<select id="a_orgsel">' + o.organizations.map(x => '<option value="' + esc(x) + '"' + (x === orgSel ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '<option value="' + OTHER + '"' + (orgSel === OTHER ? ' selected' : '') + '>หน่วยงานอื่น (ระบุ)</option></select>') +
      '<div id="a_orgbox"' + (orgSel === OTHER ? '' : ' hidden') + '>' + fld('a_org', 'ระบุชื่อหน่วยงาน', '<input id="a_org" maxlength="120" value="' + esc(orgIsList ? '' : orgVal) + '" placeholder="เช่น รพ.สต.บ้านใหม่ / สสอ.สันทราย">') + '</div>' +
      fld('a_dept', 'กลุ่มงาน / ฝ่าย / งาน', '<input id="a_dept" list="a_deptlist" maxlength="120" autocomplete="off" value="' + esc(d.department || '') + '" placeholder="พิมพ์เพื่อค้นหา หรือเลือกจากรายการ">' +
        '<datalist id="a_deptlist">' + o.departments.map(x => '<option value="' + esc(x) + '"></option>').join('') + '</datalist>', '<small>เลือกจากรายการเพื่อให้ตรงกับทะเบียน หากไม่พบให้พิมพ์ชื่อเอง</small>') +
      '</div></fieldset><div class="ac-actions"><span class="muted small">ขั้นตอน 1 จาก 3</span><button type="submit" class="btn primary">ถัดไป <i class="fas fa-arrow-right"></i></button></div></form>');
    bindOther();
    const sel = $('#a_orgsel'), box = $('#a_orgbox');
    sel.addEventListener('change', () => { box.hidden = sel.value !== OTHER; if (sel.value === OTHER) $('#a_org').focus(); });
    ['a_prefix', 'a_first', 'a_last', 'a_org', 'a_dept'].forEach(id => { const x = $('#' + id); if (x) x.addEventListener('input', () => setErr(id, '')); });
    $('#ac-f1').addEventListener('submit', e => {
      e.preventDefault();
      const prefix = $('#a_prefix').value, first = clean($('#a_first').value, 60), last = clean($('#a_last').value, 60);
      const org = sel.value === OTHER ? clean($('#a_org').value, 120) : sel.value, dept = clean($('#a_dept').value, 120);
      const errs = [
        ['a_prefix', prefix ? '' : 'กรุณาเลือกคำนำหน้า'],
        ['a_first', !first ? 'กรุณากรอกชื่อ' : !NAME_RE.test(first) ? 'ใช้ได้เฉพาะตัวอักษรไทย/อังกฤษ (ห้ามมีตัวเลขหรือสัญลักษณ์)' : ''],
        ['a_last', !last ? 'กรุณากรอกนามสกุล' : !NAME_RE.test(last) ? 'ใช้ได้เฉพาะตัวอักษรไทย/อังกฤษ (ห้ามมีตัวเลขหรือสัญลักษณ์)' : ''],
        ['a_org', sel.value === OTHER && org.length < 2 ? 'กรุณาระบุชื่อหน่วยงาน' : ''],
        ['a_dept', dept.length < 2 ? 'กรุณากรอกกลุ่มงาน' : '']
      ];
      let bad = null; errs.forEach(x => { if (!setErr(x[0], x[1]) && !bad) bad = x[0]; });
      if (bad) { $('#' + bad).focus(); return; }
      // ถ้าพิมพ์ชื่อหน่วยงานอื่นที่ตรงกับรายการ ให้ใช้ค่าตามรายการ
      Object.assign(ac.d, { prefix: prefix, firstName: first, lastName: last, organization: org, department: dept });
      ac.step = 2; step2();
    });
  }

  // ---------------------------------------------------------------- ขั้น 2: หน้าที่ต่อแผนงาน
  function step2() {
    const o = ac.opts, d = ac.d;
    frame(userBox() + steps(2) + '<h2>หน้าที่ต่อแผนงานและโครงการ</h2><p class="muted">เลือกบทบาทที่ตรงกับหน้าที่จริงของท่านมากที่สุด 1 ข้อ</p>' +
      '<form id="ac-f2" novalidate><fieldset><legend class="sr-only" style="position:absolute;left:-9999px">หน้าที่ต่อแผนงานและโครงการ</legend><div class="ac-roles" role="radiogroup" aria-label="หน้าที่ต่อแผนงานและโครงการ">' +
      o.planRoles.map((r, i) => '<label class="ac-role' + (r.value === d.planRole ? ' on' : '') + '"><input type="radio" name="planRole" value="' + esc(r.value) + '"' + (r.value === d.planRole ? ' checked' : '') + '><span class="ico"><i class="fas ' + (ROLE_ICON[i] || 'fa-user') + '"></i></span><span><b>' + esc(r.value) + '</b><small>' + esc(r.desc) + '</small></span></label>').join('') +
      '</div><div class="ac-err" id="e_a_role" role="alert" hidden></div><p class="ac-hint" id="a_rolehint"' + (d.planRole ? '' : ' hidden') + '>' + esc(ROLE_HINT[d.planRole] || '') + '</p></fieldset>' +
      '<div class="field"><label for="a_note">หมายเหตุถึงผู้ดูแลระบบ <small>(ไม่บังคับ)</small></label><textarea id="a_note" rows="3" maxlength="300" placeholder="เช่น รับผิดชอบโครงการ… / ขอสิทธิ์แก้ไขแผนของกลุ่มงาน…">' + esc(d.note || '') + '</textarea><small><span id="a_cnt">' + String(d.note || '').length + '</span>/300 · อย่าใส่ข้อมูลผู้ป่วยหรือข้อมูลลับ</small></div>' +
      '<div class="ac-actions"><button type="button" class="btn ghost" id="ac-back"><i class="fas fa-arrow-left"></i> ย้อนกลับ</button><button type="submit" class="btn primary">ถัดไป <i class="fas fa-arrow-right"></i></button></div></form>');
    bindOther();
    const radios = document.querySelectorAll('#ac-f2 input[name=planRole]');
    radios.forEach(r => r.addEventListener('change', () => {
      document.querySelectorAll('.ac-role').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
      const h = $('#a_rolehint'); h.hidden = false; h.textContent = ROLE_HINT[r.value] || ''; setErr('a_role', '');
    }));
    $('#a_note').addEventListener('input', e => { $('#a_cnt').textContent = e.target.value.length; });
    $('#ac-back').addEventListener('click', () => { keep2(); ac.step = 1; step1(); });
    function keep2() { const c = document.querySelector('#ac-f2 input[name=planRole]:checked'); d.planRole = c ? c.value : ''; d.note = clean($('#a_note').value, 300); }
    $('#ac-f2').addEventListener('submit', e => {
      e.preventDefault(); keep2();
      if (!d.planRole) { const er = $('#e_a_role'); er.hidden = false; er.innerHTML = '<i class="fas fa-circle-exclamation"></i><span>กรุณาเลือกหน้าที่ต่อแผนงานและโครงการ</span>'; radios[0].focus(); return; }
      ac.step = 3; step3();
    });
  }

  // ---------------------------------------------------------------- ขั้น 3: ตรวจสอบ + ยินยอม
  function step3(msg) {
    const d = ac.d, o = ac.opts, row = (k, v) => '<tr><th scope="row">' + k + '</th><td>' + (v ? esc(v) : '<span class="muted">-</span>') + '</td></tr>';
    frame(userBox() + steps(3) + '<h2>ตรวจสอบและยืนยัน</h2><p class="muted">โปรดตรวจสอบความถูกต้องก่อนส่ง — ผู้ดูแลระบบจะใช้ข้อมูลนี้พิจารณาสิทธิ์</p>' +
      (msg ? note('err', esc(msg)) : '') +
      '<table class="ac-sum"><tbody>' + row('ชื่อ-สกุล', d.prefix + d.firstName + ' ' + d.lastName) + row('อีเมล Google', ac.r.email) + row('หน่วยงาน', d.organization) + row('กลุ่มงาน', d.department) + row('หน้าที่ต่อแผนงาน/โครงการ', d.planRole) + row('หมายเหตุ', d.note) + '</tbody></table>' +
      '<div class="ac-note info"><i class="fas fa-circle-info"></i><div>หากข้อมูลไม่ถูกต้อง กดย้อนกลับเพื่อแก้ไข ท่านยังแก้ไขคำขอได้ระหว่างรออนุมัติ</div></div>' +
      '<label class="ac-consent" for="a_consent"><input type="checkbox" id="a_consent"' + (d.consent ? ' checked' : '') + '><span>' + esc(o.consent) + '</span></label>' +
      '<div class="ac-err" id="e_a_consent" role="alert" hidden></div>' +
      '<p class="ac-consent-links">อ่านรายละเอียด: <a href="privacy" target="_blank" rel="noopener">นโยบายความเป็นส่วนตัว</a> · <a href="terms" target="_blank" rel="noopener">เงื่อนไขการใช้งาน</a></p>' +
      '<div class="ac-next"><b>หลังส่งคำขอ</b><ol><li>ผู้ดูแลระบบได้รับแจ้งทางอีเมลและตรวจสอบคำขอ</li><li>เมื่ออนุมัติ ท่านจะได้รับอีเมลแจ้งผล</li><li>กลับมาเข้าสู่ระบบด้วยบัญชี Google เดิมได้ทันที</li></ol></div>' +
      '<div class="ac-actions"><button type="button" class="btn ghost" id="ac-back"><i class="fas fa-arrow-left"></i> ย้อนกลับ</button><button type="button" class="btn primary" id="ac-send"><i class="fas fa-paper-plane"></i> ส่งคำขอ</button></div>');
    bindOther();
    $('#ac-back').addEventListener('click', () => { d.consent = $('#a_consent').checked; ac.step = 2; step2(); });
    $('#a_consent').addEventListener('change', e => { const er = $('#e_a_consent'); if (e.target.checked) er.hidden = true; });
    $('#ac-send').addEventListener('click', async e => {
      const btn = e.currentTarget, cb = $('#a_consent'), er = $('#e_a_consent');
      if (!cb.checked) { er.hidden = false; er.innerHTML = '<i class="fas fa-circle-exclamation"></i><span>กรุณาติ๊กยืนยันและยินยอมก่อนส่งคำขอ</span>'; cb.focus(); return; }
      d.consent = true; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังส่ง…';
      try {
        const r = await App.api('access.request', Object.assign({ idToken: ac.cred }, d), { noLogout: true });
        if (r.status === 'approved') { ac.r = Object.assign(ac.r, { status: 'approved', message: r.message }); approvedNote(r.message); return; }
        ac.r = Object.assign(ac.r, r, { status: 'pending', needsProfile: false }); ac.d = {}; ac.step = 1; pending(true);
      } catch (err) {
        if (err.code === 'AUTH' || /token|หมดอายุ/.test(err.message || '')) { expired(); return; }
        if (err.code === 'VALIDATION') { ac.step = 1; step3(err.message); const b = $('#ac-back'); if (b) b.focus(); return; }
        step3(err.message);
      }
    });
  }

  // ---------------------------------------------------------------- หน้าสถานะ
  function tl(cur) {
    const items = [['fa-paper-plane', 'ส่งคำขอแล้ว', 'ระบบบันทึกข้อมูลของท่านเรียบร้อย'], ['fa-user-check', 'ผู้ดูแลระบบกำลังตรวจสอบ', 'ปกติใช้เวลา 1–2 วันทำการ'], ['fa-door-open', 'เข้าใช้งานระบบ', 'เข้าสู่ระบบด้วยบัญชี Google เดิมเมื่อได้รับอีเมลอนุมัติ']];
    return '<ol class="ac-tl">' + items.map((x, i) => '<li class="' + (i < cur ? 'done' : i === cur ? 'on' : '') + '"><i class="fas ' + (i < cur ? 'fa-check' : x[0]) + '"></i><b>' + x[1] + '</b><small>' + x[2] + '</small></li>').join('') + '</ol>';
  }
  function profileTable(p) {
    if (!p || !p.firstName) return '';
    const row = (k, v) => v ? '<tr><th scope="row">' + k + '</th><td>' + esc(v) + '</td></tr>' : '';
    return '<table class="ac-sum"><tbody>' + row('ชื่อ-สกุล', p.prefix + p.firstName + ' ' + p.lastName) + row('หน่วยงาน', p.organization) + row('กลุ่มงาน', p.department) + row('หน้าที่ต่อแผนงาน', p.planRole) + row('หมายเหตุ', p.note) + '</tbody></table>';
  }
  function pending(justSent) {
    const r = ac.r;
    frame(userBox() + '<div class="ac-status amber"><div class="big"><i class="fas fa-hourglass-half"></i></div><h2>' + (justSent ? 'ส่งคำขอเรียบร้อยแล้ว' : 'คำขออยู่ระหว่างรออนุมัติ') + '</h2><p>รอผู้ดูแลระบบตรวจสอบและอนุมัติสิทธิ์</p></div>' +
      tl(1) + profileTable(r.profile) +
      '<div class="ac-actions"><button type="button" class="btn ghost" id="ac-edit"><i class="fas fa-pen"></i> แก้ไขข้อมูลคำขอ</button><button type="button" class="btn primary" id="ac-recheck"><i class="fas fa-rotate"></i> ตรวจสอบสถานะ</button></div>' +
      '<div class="ac-note info" style="margin-top:16px"><i class="fas fa-circle-info"></i><div>หากเร่งด่วน กรุณาติดต่อผู้ดูแลระบบของหน่วยงานโดยตรง (ระบุอีเมลที่ใช้ขอสิทธิ์) · การแก้ไขคำขอไม่ทำให้ลำดับคิวเปลี่ยน</div></div>');
    bindOther();
    $('#ac-edit').addEventListener('click', () => { const p = r.profile || {}; ac.d = { prefix: p.prefix, firstName: p.firstName, lastName: p.lastName, organization: p.organization, department: p.department, planRole: p.planRole, note: p.note }; ac.step = 1; step1(); });
    $('#ac-recheck').addEventListener('click', recheck);
  }
  function rejected() {
    const r = ac.r;
    frame(userBox() + '<div class="ac-status red"><div class="big"><i class="fas fa-circle-xmark"></i></div><h2>คำขอไม่ได้รับอนุมัติ</h2><p>ท่านสามารถแก้ไขข้อมูลและยื่นคำขอใหม่ได้</p></div>' +
      note('warn', '<b>เหตุผลจากผู้ดูแลระบบ:</b> ' + esc(r.reason || 'ไม่ระบุเหตุผล')) + profileTable(r.profile) +
      '<div class="ac-actions center"><button type="button" class="btn primary" id="ac-reapply"><i class="fas fa-pen-to-square"></i> แก้ไขและยื่นคำขอใหม่</button></div>');
    bindOther();
    $('#ac-reapply').addEventListener('click', () => { const p = r.profile || {}; ac.d = { prefix: p.prefix, firstName: p.firstName, lastName: p.lastName, organization: p.organization, department: p.department, planRole: p.planRole, note: '' }; ac.step = 1; step1(); });
  }
  function suspended() {
    frame(userBox() + '<div class="ac-status dark"><div class="big"><i class="fas fa-ban"></i></div><h2>บัญชีถูกระงับการใช้งาน</h2><p>' + esc(ac.r.message || 'กรุณาติดต่อผู้ดูแลระบบ') + '</p></div>' +
      '<div class="ac-actions center"><button type="button" class="btn" id="ac-recheck"><i class="fas fa-rotate"></i> ตรวจสอบสถานะ</button></div>');
    bindOther(); $('#ac-recheck').addEventListener('click', recheck);
  }
  function approvedNote(msg) {
    frame(userBox() + '<div class="ac-status"><div class="big" style="background:var(--green-soft);color:var(--green)"><i class="fas fa-circle-check"></i></div><h2>' + esc(msg || 'บัญชีนี้ได้รับอนุมัติแล้ว') + '</h2></div>' +
      '<div class="ac-actions center"><button type="button" class="btn primary" id="ac-recheck"><i class="fas fa-right-to-bracket"></i> เข้าสู่ระบบ</button></div>');
    bindOther(); $('#ac-recheck').addEventListener('click', recheck);
  }
  function expired() {
    frame('<div class="ac-status amber"><div class="big"><i class="fas fa-clock"></i></div><h2>เซสชันการยืนยันตัวตนหมดอายุ</h2><p>ข้อมูลที่กรอกยังไม่ถูกส่ง กรุณาเข้าสู่ระบบด้วย Google อีกครั้งแล้วกรอกใหม่</p></div>' +
      '<div class="ac-actions center"><button type="button" class="btn primary" id="ac-relogin"><i class="fas fa-right-to-bracket"></i> เข้าสู่ระบบอีกครั้ง</button></div>');
    $('#ac-relogin').addEventListener('click', () => App.showLogin(''));
  }
  async function recheck(e) {
    const btn = e.currentTarget, html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังตรวจสอบ…';
    try {
      const r = await App.api('loginGoogle', { idToken: ac.cred }, { noLogout: true });
      if (r.status === 'approved') { await App.completeLogin(r); return; }
      await App.access.show(r, ac.cred);
      if (r.status === 'pending') App.toast('ยังอยู่ระหว่างรออนุมัติ', 'info');
    } catch (err) { btn.disabled = false; btn.innerHTML = html; if (err.code === 'AUTH') expired(); else App.toast(err.message, 'error'); }
  }

  // ---------------------------------------------------------------- จุดเข้า
  App.access = {
    async show(r, cred) {
      ac.r = r; ac.cred = cred; ac.hint = r.hint || {};
      if (!ac.opts) {
        try { ac.opts = await App.api('access.options', {}, { noLogout: true }); }
        catch (e) { App.toast(e.message, 'error'); return; }
      }
      if (r.status === 'new' || r.needsProfile) { if (!Object.keys(ac.d).length && r.profile && r.profile.firstName) ac.d = { prefix: r.profile.prefix, firstName: r.profile.firstName, lastName: r.profile.lastName, organization: r.profile.organization, department: r.profile.department, planRole: r.profile.planRole, note: r.profile.note }; ac.step = 1; step1(); }
      else if (r.status === 'pending') pending(false);
      else if (r.status === 'rejected') rejected();
      else suspended();
    }
  };
})();
