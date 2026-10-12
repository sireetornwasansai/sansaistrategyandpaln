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
  function busy(d) { busyN += d; const el = $('#busybar'); if (el) el.classList.toggle('on', busyN > 0); }
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

  // ---------- Toast ----------
  App.toast = function (msg, type) {
    let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + (type || 'info'); t.setAttribute('role', 'status'); t.textContent = msg; box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, type === 'error' ? 6500 : 3500);
  };
  App.fail = e => { console.error(e); App.toast(e && e.message ? e.message : String(e), 'error'); };

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
      if (btn) { btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = 'กำลังบันทึก…'; }
      try { const r = await o.onSubmit(d); if (r !== false) closeDialog(d); }
      catch (err) { d.showError(err && err.message ? err.message : String(err)); }
      finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = btn.dataset.t; } }
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
      if (file.size > 10 * 1024 * 1024) return reject(new Error('ไฟล์ใหญ่เกิน 10MB'));
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
    if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).catch(App.fail); }
  });

  App.CATS_COLORS = ['#0e7c7b', '#f0ad4e', '#5b8def', '#e0607e', '#8e6bd8', '#3fb68b', '#9aa5b1', '#d97a3a'];
})();
