/* แกนกลางของหน้าเว็บ: เรียก API, state, ตัวช่วยจัดรูปแบบ, โมดอล/ฟอร์ม, toast */
(function () {
  'use strict';
  const cfg = window.APP_CONFIG || {};
  const App = window.App = { cfg: cfg, state: { user: null, token: null, expiresAt: 0, masters: null, year: null }, actions: {}, pages: {} };
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  App.$ = $; App.$$ = $$;

  // ---------- จัดรูปแบบ ----------
  App.esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = App.esc;
  App.money = (n, d) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d === undefined ? 2 : d, maximumFractionDigits: d === undefined ? 2 : d });
  App.int = n => Number(n || 0).toLocaleString('en-US');
  App.pct = n => (Number(n || 0)).toFixed(1) + '%';
  const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  App.FY_MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
  App.date = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? (+m[3]) + ' ' + TH_M[+m[2] - 1] + ' ' + String(+m[1] + 543).slice(-2) : ''; };
  App.dateTime = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/); return m ? App.date(m[1] + '-' + m[2] + '-' + m[3]) + ' ' + m[4] + ':' + m[5] : String(s || ''); };
  App.today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  App.debounce = (fn, ms) => { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms || 250); }; };

  // ---------- สถานะ/สี ----------
  App.STATUS_CLASS = { 'ร่าง': 'gray', 'อนุมัติ': 'blue', 'ดำเนินการ': 'amber', 'ส่งสรุปแล้ว': 'green', 'ปิด': 'dark', 'ยกเลิก': 'red',
    'เบิกครบ': 'green', 'เบิกบางส่วน': 'amber', 'ยังไม่เบิก': 'gray', 'ไม่มีงบ': 'gray',
    'ปกติ': 'blue', 'ไม่ใช้งบประมาณ': 'gray', 'ไม่เบิก': 'gray', 'เลื่อน': 'amber' };
  App.badge = (text, cls) => '<span class="badge ' + (cls || App.STATUS_CLASS[text] || 'gray') + '">' + esc(text) + '</span>';
  App.progress = pct => { const p = Math.max(0, Math.min(100, Number(pct) || 0)); return '<div class="progress" title="' + p.toFixed(1) + '%"><i style="width:' + p + '%"></i></div>'; };

  // ---------- ข้อมูลหลัก (lookup) ----------
  const M = () => App.state.masters || { data: {}, settings: {}, enums: {}, schema: {} };
  App.masters = M;
  App.lookup = (table, code, field) => { const r = (M().data[table] || []).find(x => String(x[(M().schema[table] || {}).key || 'Code']) === String(code)); return r ? r[field || 'Name'] : ''; };
  App.fundName = c => App.lookup('funds', c) || c;
  App.fund = c => (M().data.funds || []).find(f => f.Code === c);
  App.catName = c => App.lookup('categories', c) || c;
  App.activeOpts = (table, valueField, labelField) => (M().data[table] || []).filter(r => r.Active !== false).map(r => ({ v: r[valueField || 'Code'], l: r[labelField || 'Name'] }));
  App.can = () => !!App.state.user && ['user', 'admin'].indexOf(App.state.user.role) >= 0;
  App.isAdmin = () => !!App.state.user && App.state.user.role === 'admin';
  App.years = () => { const cur = +(M().settings.CurrentYear || 2569), a = []; for (let y = cur + 1; y >= cur - 3; y--) a.push(String(y)); return a; };

  // ---------- เรียก API ----------
  let busyN = 0;
  let busyTimer = null;
  function busyHint(on) {
    let h = document.getElementById('busyhint');
    if (!h) { h = document.createElement('div'); h.id = 'busyhint'; h.setAttribute('role', 'status'); h.setAttribute('aria-live', 'polite'); h.innerHTML = '<span class="spinner sm"></span><span>กำลังประมวลผล… เซิร์ฟเวอร์อาจใช้เวลาสักครู่ (โดยเฉพาะการเรียกครั้งแรก) กรุณาอย่าปิดหน้านี้</span>'; document.body.appendChild(h); }
    h.classList.toggle('on', on);
  }
  function busy(d) {
    busyN = Math.max(0, busyN + d); const el = $('#busybar'); if (el) el.classList.toggle('on', busyN > 0);
    document.body.classList.toggle('is-busy', busyN > 0);
    if (busyN > 0 && !busyTimer) busyTimer = setTimeout(() => busyHint(true), 5000);
    if (busyN === 0) { clearTimeout(busyTimer); busyTimer = null; busyHint(false); }
  }
  App.api = async function (action, params, opts) {
    opts = opts || {};
    if (!cfg.API_URL || /YOUR_DEPLOYMENT_ID/.test(cfg.API_URL)) throw new Error('ยังไม่ได้ตั้งค่า API_URL ในไฟล์ config.js');
    busy(1);
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const to = setTimeout(() => { if (ctrl) ctrl.abort(); }, 90000);
    try {
      const res = await fetch(cfg.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow',
        body: JSON.stringify({ action: action, params: params || {}, token: App.state.token }), signal: ctrl ? ctrl.signal : undefined });
      const text = await res.text();
      let out; try { out = JSON.parse(text); } catch (e) { throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง — ตรวจสอบ API_URL และว่า Deploy เป็น "Anyone"'); }
      if (!out.ok) {
        const err = new Error(out.error || 'เกิดข้อผิดพลาด'); err.code = out.code;
        if (out.code === 'AUTH' && App.state.token && !opts.noLogout) App.logout('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        throw err;
      }
      return out.data;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('หมดเวลาการเชื่อมต่อ กรุณาลองใหม่');
      if (e instanceof TypeError) throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ตและ API_URL');
      throw e;
    } finally { clearTimeout(to); busy(-1); }
  };
  // ลองใหม่อัตโนมัติ (สูงสุด 2 ครั้ง) เฉพาะคำสั่ง "อ่านข้อมูล" เมื่อเครือข่ายหลุด/หมดเวลา — คำสั่งเขียนข้อมูลไม่ลองซ้ำเอง กันบันทึกซ้ำ
  const apiOnce = App.api, READ_RE = /(\.list|\.get|\.summary|\.recent)$|^(me|dashboard|mywork|overdue|ping)$/;
  App.api = async function (action, params, opts) {
    for (let i = 0; ; i++) {
      try { return await apiOnce(action, params, opts); }
      catch (e) { if (READ_RE.test(action) && i < 2 && /เชื่อมต่อเซิร์ฟเวอร์ไม่ได้|หมดเวลา/.test((e && e.message) || '')) { await new Promise(r => setTimeout(r, 900 * (i + 1))); continue; } throw e; }
    }
  };
  // แถบแจ้งเมื่อไม่มีอินเทอร์เน็ต
  (function () {
    const bar = document.createElement('div'); bar.id = 'offline-banner'; bar.setAttribute('role', 'alert'); bar.hidden = true;
    bar.textContent = 'ไม่มีสัญญาณอินเทอร์เน็ต — ข้อมูลที่เห็นอาจไม่ล่าสุด และจะบันทึกไม่ได้จนกว่าจะเชื่อมต่อใหม่';
    const sync = () => { bar.hidden = navigator.onLine !== false; if (!bar.isConnected && document.body) document.body.appendChild(bar); };
    window.addEventListener('online', sync); window.addEventListener('offline', sync); document.addEventListener('DOMContentLoaded', sync);
  })();

  // ---------- Toast ----------
  App.toast = function (msg, type) {
    let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + (type || 'info'); t.setAttribute('role', 'status'); t.textContent = msg; box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, type === 'error' ? 6500 : 3500);
  };
  App.fail = e => { if (e && e.silent) return; console.error(e); App.toast(e && e.message ? e.message : String(e), 'error'); };

  // ---------- โมดอล / ฟอร์ม ----------
  function openDialog(d) { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); }
  function closeDialog(d) { if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); d.remove(); }
  /** modal({title, html, wide, submitLabel, hideSubmit, onOpen(dlg), onSubmit(dlg) -> false เพื่อไม่ปิด}) */
  App.modal = function (o) {
    const d = document.createElement('dialog'); d.className = 'modal' + (o.wide ? ' wide' : '');
    d.innerHTML = '<form method="dialog" class="modal-box" novalidate><header><h3>' + esc(o.title || '') + '</h3><button type="button" class="icon-btn" data-close aria-label="ปิด">✕</button></header>' +
      '<div class="modal-body">' + (o.html || '') + '</div><div class="form-error" role="alert" hidden></div>' +
      '<footer>' + (o.hideSubmit ? '' : '<button type="button" class="btn ghost" data-close>ยกเลิก</button><button type="submit" class="btn primary" data-submit>' + esc(o.submitLabel || 'บันทึก') + '</button>') +
      (o.hideSubmit ? '<button type="button" class="btn ghost" data-close>ปิด</button>' : '') + '</footer></form>';
    document.body.appendChild(d);
    d.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === d) closeDialog(d); });
    d.addEventListener('cancel', e => { e.preventDefault(); closeDialog(d); });
    const form = d.querySelector('form'), errBox = d.querySelector('.form-error');
    d.showError = m => { errBox.textContent = m; errBox.hidden = !m; };
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (!o.onSubmit) return;
      const btn = d.querySelector('[data-submit]'); d.showError('');
      d.querySelectorAll('.invalid').forEach(x => { x.classList.remove('invalid'); x.removeAttribute('aria-invalid'); });
      const bad = Array.prototype.slice.call(d.querySelectorAll('[required]')).find(el => !String(el.value || '').trim());
      if (bad) { // ตรวจช่องที่จำเป็นก่อนส่ง (ฝั่งเซิร์ฟเวอร์ตรวจซ้ำเสมอ)
        const lb = d.querySelector('label[for="' + bad.id + '"]'); bad.classList.add('invalid'); bad.setAttribute('aria-invalid', 'true');
        d.showError('กรุณากรอก "' + (lb ? lb.textContent.replace('*', '').trim() : bad.name) + '"'); try { bad.focus(); } catch (e2) { /* ignore */ } return;
      }
      if (btn) { btn.classList.add('loading'); btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = 'กำลังบันทึก…'; }
      try { const r = await o.onSubmit(d); if (r !== false) closeDialog(d); }
      catch (err) { d.showError(err && err.message ? err.message : String(err)); }
      finally { if (btn && btn.isConnected) { btn.classList.remove('loading'); btn.disabled = false; btn.textContent = btn.dataset.t; } }
    });
    d.close_ = () => closeDialog(d);
    openDialog(d); if (o.onOpen) o.onOpen(d);
    const first = d.querySelector('input:not([type=hidden]):not([readonly]),select,textarea'); if (first) { try { first.focus(); } catch (e) { /* ignore */ } }
    return d;
  };
  App.confirm = function (msg, okLabel, danger) {
    return new Promise(res => {
      let settled = false;
      const d = App.modal({ title: 'ยืนยัน', html: '<p class="confirm-msg">' + esc(msg) + '</p>', submitLabel: okLabel || 'ยืนยัน',
        onSubmit: () => { settled = true; res(true); } });
      if (danger) d.querySelector('[data-submit]').classList.replace('primary', 'danger');
      const obs = new MutationObserver(() => { if (!d.isConnected) { obs.disconnect(); if (!settled) res(false); } });
      obs.observe(document.body, { childList: true });
    });
  };
  /** ขอเหตุผลการแก้ไข -> Promise<string|null> (null = ผู้ใช้ยกเลิก) */
  App.askReason = function (msg) {
    return new Promise(res => {
      let settled = false;
      const d = App.modal({ title: 'ระบุเหตุผลการแก้ไข', submitLabel: 'ยืนยันและบันทึก',
        html: '<p class="confirm-msg">' + esc(msg || 'กรุณาระบุเหตุผล') + '</p><div class="field"><label for="f_reason">เหตุผล <span class="req">*</span></label><textarea id="f_reason" name="reason" rows="3" maxlength="400" placeholder="เช่น ปรับตามหนังสือสั่งการ / ปรับแผนตามงบที่ได้รับจริง"></textarea></div><p class="muted small">เหตุผลจะถูกบันทึกในประวัติการแก้ไขของแผนนี้</p>',
        onSubmit: dlg => { const v = dlg.querySelector('[name=reason]').value.trim(); if (v.length < 3) throw new Error('กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร'); settled = true; res(v); } });
      const obs = new MutationObserver(() => { if (!d.isConnected) { obs.disconnect(); if (!settled) res(null); } });
      obs.observe(document.body, { childList: true });
    });
  };
  /** เรียก API; ถ้าเซิร์ฟเวอร์ตอบ REASON_REQUIRED ให้ถามเหตุผลแล้วส่งซ้ำ (ผู้ใช้กดยกเลิก = ไม่ทำรายการ ไม่แสดงข้อผิดพลาด) */
  App.apiReason = async function (action, params, opts) {
    try { return await App.api(action, params, opts); }
    catch (e) {
      if (!e || e.code !== 'REASON_REQUIRED') throw e;
      const r = await App.askReason(e.message);
      if (r === null) { const c = new Error(''); c.silent = true; throw c; }
      return App.api(action, Object.assign({}, params, { reason: r }), opts);
    }
  };
  /** สร้างช่องฟอร์ม: field({name,label,type,options,value,required,hint,full,attrs}) */
  App.field = function (f) {
    const v = f.value === undefined || f.value === null ? '' : f.value, id = 'f_' + f.name, req = f.required ? ' required' : '';
    let input;
    if (f.type === 'select') {
      input = '<select id="' + id + '" name="' + f.name + '"' + req + (f.attrs || '') + '>' + (f.noBlank ? '' : '<option value="">' + esc(f.blank || '— เลือก —') + '</option>') +
        (f.options || []).map(o => { const ov = typeof o === 'object' ? o.v : o, ol = typeof o === 'object' ? o.l : o; return '<option value="' + esc(ov) + '"' + (String(ov) === String(v) ? ' selected' : '') + '>' + esc(ol) + '</option>'; }).join('') + '</select>';
    } else if (f.type === 'textarea') input = '<textarea id="' + id + '" name="' + f.name + '" rows="' + (f.rows || 3) + '"' + req + '>' + esc(v) + '</textarea>';
    else if (f.type === 'checkbox') return '<label class="check ' + (f.full ? 'full' : '') + '"><input type="checkbox" name="' + f.name + '"' + (v ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
    else input = '<input id="' + id + '" name="' + f.name + '" type="' + (f.type || 'text') + '" value="' + esc(v) + '"' + req + (f.readonly ? ' readonly' : '') + (f.list ? ' list="' + f.list + '"' : '') + (f.step ? ' step="' + f.step + '"' : '') + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + (f.attrs || '') + '>';
    return '<div class="field ' + (f.full ? 'full' : '') + '"><label for="' + id + '">' + esc(f.label) + (f.required ? ' <b class="req">*</b>' : '') + '</label>' + input + (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '</div>';
  };
  App.formGrid = fields => '<div class="form-grid">' + fields.map(App.field).join('') + '</div>';
  App.values = function (dlg) {
    const o = {};
    App.$$('[name]', dlg).forEach(el => { if (el.type === 'checkbox') o[el.name] = el.checked; else o[el.name] = el.value; });
    return o;
  };

  // ---------- ไฟล์ ----------
  const EXT_OK = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'doc', 'docx', 'xls', 'xlsx'];
  App.uploadFile = function (file) {
    return new Promise((resolve, reject) => {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (EXT_OK.indexOf(ext) < 0) return reject(new Error('รองรับเฉพาะไฟล์ PDF, รูปภาพ, Word, Excel'));
      const mb = ((M().limits || {}).maxUploadMb) || 10; if (file.size > mb * 1024 * 1024) return reject(new Error('ไฟล์ใหญ่เกิน ' + mb + 'MB'));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
      fr.onload = () => App.api('file.upload', { name: file.name, data: String(fr.result) }).then(resolve, reject);
      fr.readAsDataURL(file);
    });
  };

  // ---------- เซสชัน ----------
  const LS = 'sansai_plan_session_v2';
  App.saveSession = function () { try { localStorage.setItem(LS, JSON.stringify({ token: App.state.token, expiresAt: App.state.expiresAt, user: App.state.user })); } catch (e) { /* ignore */ } };
  App.loadSession = function () { try { const s = JSON.parse(localStorage.getItem(LS) || 'null'); if (s && s.token && s.expiresAt > Date.now()) return s; } catch (e) { /* ignore */ } return null; };
  App.clearSession = function () { try { localStorage.removeItem(LS); } catch (e) { /* ignore */ } App.state.token = null; App.state.user = null; };
  App.logout = function (msg) {
    App.clearSession();
    try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
    if (App.showLogin) App.showLogin(msg);
  };

  // ---------- Delegated actions ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const fn = App.actions[el.getAttribute('data-act')];
    if (!fn) return;
    e.preventDefault();
    if (el.classList.contains('loading')) return; // กำลังทำงานอยู่ — กันกดซ้ำ
    let r; try { r = fn(el, e); } catch (err) { App.fail(err); return; }
    if (r && typeof r.then === 'function') { // ปุ่มที่ทำงานแบบ async: แสดงสถานะกำลังทำงานจนเสร็จ (สากลทุกปุ่ม data-act)
      const isBtn = el.tagName === 'BUTTON', styled = isBtn || el.classList.contains('btn');
      if (styled) { el.classList.add('loading'); el.setAttribute('aria-busy', 'true'); if (isBtn) el.disabled = true; }
      Promise.resolve(r).catch(App.fail).finally(() => { el.classList.remove('loading'); el.removeAttribute('aria-busy'); if (isBtn && el.isConnected) el.disabled = false; });
    }
  });

  App.CATS_COLORS = ['#1d4f91', '#0e7c7b', '#3f6ea8', '#059669', '#f59e0b', '#e11d48', '#64748b', '#2bb3b0'];
})();
