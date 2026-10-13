/* v2.3 · 4 หน้าใหม่: แผนงานและกลยุทธ์ · งานและสิ่งที่ต้องทำ (กระดาน 3 คอลัมน์) · แผนเวลาโครงการ · หมุดหมายสำคัญ
   ข้อมูลมาจากชีตเดิม (Plans / Activities / BudgetLines / Disbursements) + คอลัมน์ใหม่ Activities.Progress */
(function () {
  'use strict';
  const App = window.App, esc = App.esc, S = App.state;

  const yearSelect = () => '<label class="inline-field"><span>ปีงบประมาณ</span><select data-change="year">' +
    App.years().map(y => '<option' + (String(y) === String(S.year) ? ' selected' : '') + '>' + y + '</option>').join('') + '</select></label>';
  const opts = (list, cur) => list.map(o => {
    const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o;
    return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>';
  }).join('');
  const initial = n => { const s = String(n || '?').replace(/^(น\.ส\.|นางสาว|นาย|นาง|นพ\.|พญ\.|ทพ\.|ภก\.|ภญ\.|พว\.|ดร\.)\s*/, ''); return s.charAt(0) || '?'; };
  const stat = (l, v, sub, cls) => '<div class="xstat ' + (cls || '') + '"><div class="xstat-label">' + l + '</div><div class="xstat-value">' + v + '</div><div class="xstat-sub">' + sub + '</div></div>';
  const $id = id => document.getElementById(id);
  const toast = (m, t) => App.toast(m, t);

  // จำค่าตัวกรองไว้ระหว่างสลับหน้า
  const memo = {
    strat: { q: '', status: '', fund: '', hosp: '' },
    task: { q: '', plan: '', fund: '', mine: false },
    tl: { q: '', fund: '', state: '', view: 'fy', open: {} },
    ms: { q: '', fund: '', state: '', kind: '' }
  };
  // วันที่ ISO <-> เลขวัน (UTC เพื่อตัดปัญหา timezone)
  const dnum = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null; };
  const iso = n => new Date(n * 86400000).toISOString().slice(0, 10);

  // ===================================================================== 1) แผนงานและกลยุทธ์
  App.pages.strategy = async function (view) {
    view.innerHTML = App.skeleton();
    const data = await App.api('plans.list', { year: S.year });
    const all = data.plans, f = memo.strat;
    const hosp = App.activeOpts('hosp').map(o => ({ v: o.v, l: o.v + '. ' + o.l }));
    view.innerHTML = App.pageHead('แผนงานและกลยุทธ์', 'ปีงบประมาณ ' + esc(S.year) + ' · เชื่อมแผนงานกับยุทธศาสตร์ ผู้รับผิดชอบ และกรอบงบประมาณ',
      yearSelect() + (App.can() ? '<a class="btn primary" href="#/plans"><i class="fas fa-plus"></i> เพิ่มแผนงาน</a>' : '')) +
      '<div class="xstats" id="sx-stats"></div>' +
      '<div class="xbar"><input type="search" id="sx-q" placeholder="ค้นหาชื่อแผน/ผู้รับผิดชอบ" value="' + esc(f.q) + '">' +
      '<select id="sx-status"><option value="">ทุกสถานะ</option>' + opts(App.masters().enums.planStatuses || [], f.status) + '</select>' +
      '<select id="sx-fund"><option value="">ทุกแหล่งเงิน</option>' + opts(App.activeOpts('funds', 'Code', 'Name'), f.fund) + '</select>' +
      '<select id="sx-hosp"><option value="">ทุกยุทธศาสตร์ รพ.</option>' + opts(hosp, f.hosp) +
      '<option value="__none"' + (f.hosp === '__none' ? ' selected' : '') + '>— ยังไม่ระบุยุทธศาสตร์ —</option></select></div>' +
      '<div class="xcount" id="sx-count"></div><div class="xcards" id="sx-cards"></div>';

    const card = x => {
      const p = x.plan, c = x.calc, sp = x.span || {}, fund = App.fund(p.FundCode), region = fund && fund.StrategySet === 'region';
      const hs = p.StrategyHosp ? (p.StrategyHosp + '. ' + (App.lookup('hosp', p.StrategyHosp) || '')) : '';
      const strat = region ? (p.StrategyRegion ? 'ยุทธศาสตร์เขต: ' + esc(p.StrategyRegion) : '') : (hs ? esc(hs) : '');
      return '<article class="xcard"><div class="xcard-top"><div class="xcard-line"><span class="tag">' + esc(App.fundName(p.FundCode)) + '</span>' + App.badge(p.Status) + '</div>' +
        '<h3><a href="#/plan/' + esc(p.PlanId) + '">' + (p.Seq ? '<span class="muted">#' + esc(p.Seq) + '</span> ' : '') + esc(p.Name) + '</a></h3>' +
        '<div class="xcard-desc' + (strat ? '' : ' muted') + '"><i class="fas fa-bullseye"></i> ' + (strat || 'ยังไม่ระบุยุทธศาสตร์') + '</div>' +
        '<div class="xcard-meta"><div><label>ผู้รับผิดชอบ</label><strong>' + esc(p.Owner || '—') + '</strong></div>' +
        '<div><label>วันสิ้นสุดแผน</label><strong>' + (sp.end ? App.date(sp.end) : '—') + '</strong></div>' +
        '<div><label>งบที่ใช้จริง</label><strong>฿' + App.money(c.activeBudget, 0) + '</strong></div>' +
        '<div><label>เบิกจ่ายสุทธิ</label><strong>฿' + App.money(c.netPaid, 0) + '</strong></div></div>' +
        '<div class="xprog"><div class="xprog-h"><span>กิจกรรมเสร็จ ' + (sp.done || 0) + '/' + (sp.acts || 0) + '</span><span>เบิก ' + App.pct(c.pct) + '</span></div>' + App.progress(c.pct) + '</div></div>' +
        '<div class="xcard-foot"><a class="btn subtle" href="#/plan/' + esc(p.PlanId) + '"><i class="fas fa-eye"></i> รายละเอียด</a>' +
        (x.overdue.is ? '<span class="badge red" title="' + esc(x.overdue.reason) + '">ค้างส่งสรุป</span>' : App.badge(c.execState)) + '</div></article>';
    };
    const draw = () => {
      const q = f.q.trim().toLowerCase();
      const rows = all.filter(x => {
        const p = x.plan;
        if (f.status && p.Status !== f.status) return false;
        if (f.fund && p.FundCode !== f.fund) return false;
        if (f.hosp === '__none' ? !!p.StrategyHosp : (f.hosp && String(p.StrategyHosp) !== f.hosp)) return false;
        return !q || (String(p.Name) + ' ' + String(p.Owner)).toLowerCase().indexOf(q) >= 0;
      });
      const run = all.filter(x => x.plan.Status === 'ดำเนินการ').length, od = all.filter(x => x.overdue.is).length;
      $id('sx-stats').innerHTML = stat('ทั้งหมด', all.length, 'แผนงานในระบบ', 'a') + stat('อยู่ระหว่างดำเนินการ', run, 'สถานะ "ดำเนินการ"', 'b') +
        stat('ค้างส่งสรุป', od, 'รายการที่ควรติดตาม', od ? 'c warn' : 'c');
      $id('sx-count').textContent = 'แสดง ' + rows.length + ' จาก ' + all.length + ' รายการ';
      $id('sx-cards').innerHTML = rows.length ? rows.map(card).join('') : '<div class="card empty" style="grid-column:1/-1">ไม่พบแผนงานตามเงื่อนไข</div>';
    };
    [['sx-q', 'q', 'input'], ['sx-status', 'status'], ['sx-fund', 'fund'], ['sx-hosp', 'hosp']].forEach(a => {
      const el = $id(a[0]); el.addEventListener(a[2] || 'change', () => { f[a[1]] = el.value; draw(); });
    });
    draw();
  };

  // ===================================================================== 2) งานและสิ่งที่ต้องทำ (กระดาน)
  const COLS = [{ k: 'todo', t: 'รอดำเนินการ', b: 'gray' }, { k: 'doing', t: 'กำลังทำ', b: 'blue' }, { k: 'done', t: 'เสร็จแล้ว', b: 'green' }];
  const SHOW = 30;
  App.pages.tasks = async function (view) {
    view.innerHTML = App.skeleton();
    const f = memo.task, linked = !!(S.user && S.user.personName);
    if (f.mine && !linked) f.mine = false;
    const d = await App.api('tasks.list', { year: S.year });
    const items = d.items, limit = { todo: SHOW, doing: SHOW, done: SHOW };
    const funds = Array.from(new Set(items.map(i => i.fund)));
    view.innerHTML = App.pageHead('งานและสิ่งที่ต้องทำ', 'ปีงบประมาณ ' + esc(S.year) + ' · กิจกรรมทุกแผน แบ่งตามความคืบหน้า (คำนวณจากวันที่และการเบิกจ่าย หรือตั้งเองได้ · ลากการ์ดข้ามคอลัมน์ได้)', yearSelect()) +
      '<div class="xstats" id="tk-stats"></div>' +
      '<div class="xbar"><input type="search" id="tk-q" placeholder="ค้นหากิจกรรม/แผน/ผู้รับผิดชอบ" value="' + esc(f.q) + '">' +
      '<select id="tk-plan"><option value="">ทุกแผนงาน</option>' + d.plans.map(p => '<option value="' + esc(p.planId) + '"' + (p.planId === f.plan ? ' selected' : '') + '>' + esc(String(p.name).substring(0, 80)) + '</option>').join('') + '</select>' +
      '<select id="tk-fund"><option value="">ทุกแหล่งเงิน</option>' + funds.map(c => '<option value="' + esc(c) + '"' + (c === f.fund ? ' selected' : '') + '>' + esc(App.fundName(c)) + '</option>').join('') + '</select>' +
      (linked ? '<label class="check"><input type="checkbox" id="tk-mine"' + (f.mine ? ' checked' : '') + '> เฉพาะงานของฉัน</label>' : '') + '</div>' +
      '<div class="kanban" id="tk-board"></div>';

    const match = i => (!f.plan || i.planId === f.plan) && (!f.fund || i.fund === f.fund) && (!f.mine || i.owner === S.user.personName) &&
      (!f.q.trim() || (i.name + ' ' + i.plan + ' ' + i.owner).toLowerCase().indexOf(f.q.trim().toLowerCase()) >= 0);
    const colName = k => COLS.find(c => c.k === k).t;
    const card = i => {
      const editable = i.canEdit && App.can();
      const flag = i.overdue ? '<span class="badge red">เลยกำหนด</span>' : i.status !== 'ปกติ' ? App.badge(i.status, i.status === 'เลื่อน' ? 'amber' : 'gray') : (i.budget > 0 ? '<span class="badge gray">฿' + App.money(i.budget, 0) + '</span>' : '');
      return '<article class="task-card' + (editable ? ' drag' : '') + '"' + (editable ? ' draggable="true"' : '') + ' data-id="' + esc(i.actId) + '">' +
        '<div class="flex-between"><span class="tag">' + esc(App.fundName(i.fund)) + '</span>' + flag + '</div>' +
        '<h3 title="' + esc(i.name) + '">' + esc(i.name) + '</h3><a class="tplan" href="#/plan/' + esc(i.planId) + '" title="' + esc(i.plan) + '">' + esc(i.plan) + '</a>' +
        '<div class="flex-between tmeta"><span class="who"><span class="avatar sm">' + esc(initial(i.owner)) + '</span><small>' + esc(i.owner) + '</small></span>' +
        '<small class="' + (i.overdue ? 'late' : 'muted') + '">' + (i.end ? App.date(i.end) : 'ไม่ระบุวันที่') + '</small></div>' +
        (i.budget > 0 ? '<div class="tpaid"><span>เบิก ฿' + App.money(i.paid, 0) + ' / ฿' + App.money(i.budget, 0) + '</span>' + App.progress(i.paid / i.budget * 100) + '</div>' : '') +
        (editable ? '<select data-id="' + esc(i.actId) + '" aria-label="เปลี่ยนสถานะงาน">' + COLS.map(c => '<option value="' + c.k + '"' + (c.k === i.progress ? ' selected' : '') + '>' + c.t + (i.manual && c.k === i.progress ? ' (ตั้งเอง)' : '') + '</option>').join('') + (i.manual ? '<option value="">↺ ใช้ค่าอัตโนมัติ</option>' : '') + '</select>'
          : '<span class="muted small">' + colName(i.progress) + '</span>') + '</article>';
    };
    const pending = new Set();
    const setProgress = async (it, value) => {
      if (!it || !it.canEdit || pending.has(it.actId) || (value === it.progress && it.manual)) return;
      pending.add(it.actId);
      const el = Array.prototype.find.call(document.querySelectorAll('#tk-board .task-card'), x => x.dataset.id === it.actId);
      if (el) { el.classList.add('busy'); el.setAttribute('aria-busy', 'true'); el.draggable = false; const s = el.querySelector('select'); if (s) s.disabled = true; }
      try {
        const r = await App.api('acts.progress', { actId: it.actId, progress: value });
        if (r.progress) { it.progress = r.progress; it.manual = true; toast('บันทึกสถานะงานแล้ว', 'success'); }
        else { const n = await App.api('tasks.list', { year: S.year }); items.splice(0, items.length, ...n.items); toast('กลับไปใช้ค่าอัตโนมัติแล้ว', 'success'); }
        it.overdue = it.progress !== 'done' && !!it.end && it.end < d.today;
      } catch (e) { App.fail(e); }
      finally { pending.delete(it.actId); }
      draw();
    };
    const draw = () => {
      const rows = items.filter(match), cnt = { todo: 0, doing: 0, done: 0 };
      rows.forEach(r => cnt[r.progress]++);
      const od = rows.filter(r => r.overdue).length;
      $id('tk-stats').innerHTML = stat('กิจกรรมทั้งหมด', rows.length, 'ไม่รวมที่ยกเลิก', 'a') +
        stat('เสร็จแล้ว', cnt.done, rows.length ? Math.round(cnt.done / rows.length * 100) + '% ของทั้งหมด' : '—', 'c') +
        stat('เลยกำหนด', od, 'ยังไม่เสร็จ', od ? 'b warn' : 'b');
      $id('tk-board').innerHTML = COLS.map(c => {
        const list = rows.filter(r => r.progress === c.k);
        return '<section class="kanban-col ' + c.k + '" data-col="' + c.k + '"><div class="kanban-title"><span>' + c.t + '</span><span class="badge ' + c.b + '">' + list.length + '</span></div>' +
          (list.length ? list.slice(0, limit[c.k]).map(card).join('') : '<div class="kempty">ไม่มีรายการ</div>') +
          (list.length > limit[c.k] ? '<button type="button" class="btn ghost sm more" data-more="' + c.k + '">แสดงเพิ่ม (' + (list.length - limit[c.k]) + ')</button>' : '') + '</section>';
      }).join('');
      document.querySelectorAll('#tk-board select[data-id]').forEach(sel => sel.addEventListener('change', async () => {
        await setProgress(items.find(x => x.actId === sel.dataset.id), sel.value);
      }));
      document.querySelectorAll('#tk-board [data-more]').forEach(b => b.addEventListener('click', () => { limit[b.dataset.more] += SHOW; draw(); }));
      // ลากวาง (เดสก์ท็อป)
      document.querySelectorAll('#tk-board .task-card.drag').forEach(el => {
        el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', el.dataset.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
        el.addEventListener('dragend', () => el.classList.remove('dragging'));
      });
      document.querySelectorAll('#tk-board .kanban-col').forEach(col => {
        col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
        col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
        col.addEventListener('drop', async e => {
          e.preventDefault(); col.classList.remove('over');
          const it = items.find(x => x.actId === e.dataTransfer.getData('text/plain'));
          if (it && it.progress !== col.dataset.col) await setProgress(it, col.dataset.col);
        });
      });
    };
    [['tk-q', 'q', 'input'], ['tk-plan', 'plan'], ['tk-fund', 'fund']].forEach(a => { const el = $id(a[0]); el.addEventListener(a[2] || 'change', () => { f[a[1]] = el.value; draw(); }); });
    const mine = $id('tk-mine'); if (mine) mine.addEventListener('change', () => { f.mine = mine.checked; draw(); });
    draw();
  };

  // ===================================================================== 3) แผนเวลาโครงการ (Gantt)
  App.pages.timeline = async function (view) {
    view.innerHTML = App.skeleton();
    const d = await App.api('tasks.list', { year: S.year });
    const f = memo.tl, today = dnum(d.today);
    const fy0 = dnum((+S.year - 544) + '-10-01'), fy1 = dnum((+S.year - 543) + '-09-30');
    // รวมเป็นแผน
    const pm = {}, order = [];
    d.items.forEach(i => {
      let p = pm[i.planId];
      if (!p) { p = pm[i.planId] = { id: i.planId, name: i.plan, fund: i.fund, owner: i.owner, status: i.planStatus, acts: [], s: null, e: null, done: 0, dated: 0 }; order.push(p); }
      p.acts.push(i); if (i.progress === 'done') p.done++;
      const s = dnum(i.start), e = dnum(i.end || i.start);
      if (s !== null) { p.dated++; p.s = p.s === null ? s : Math.min(p.s, s); p.e = p.e === null ? e : Math.max(p.e, e); }
    });
    order.forEach(p => { p.pct = p.acts.length ? Math.round(p.done / p.acts.length * 100) : 0; p.late = p.pct < 100 && p.e !== null && p.e < today; p.state = p.pct >= 100 ? 'done' : p.late ? 'late' : (p.s !== null && p.s <= today ? 'run' : 'wait'); });
    const funds = Array.from(new Set(order.map(p => p.fund)));
    view.innerHTML = App.pageHead('แผนเวลาโครงการ', 'ปีงบประมาณ ' + esc(S.year) + ' · ช่วงเวลาดำเนินการ ความคืบหน้ากิจกรรม และกำหนดสิ้นสุดของทุกแผนในมุมเดียว', yearSelect()) +
      '<div class="xstats" id="tl-stats"></div>' +
      '<div class="xbar"><input type="search" id="tl-q" placeholder="ค้นหาแผน/ผู้รับผิดชอบ" value="' + esc(f.q) + '">' +
      '<select id="tl-fund"><option value="">ทุกแหล่งเงิน</option>' + funds.map(c => '<option value="' + esc(c) + '"' + (c === f.fund ? ' selected' : '') + '>' + esc(App.fundName(c)) + '</option>').join('') + '</select>' +
      '<select id="tl-state"><option value="">ทุกสถานะ</option>' + opts([{ v: 'run', l: 'กำลังดำเนินการ' }, { v: 'late', l: 'เลยกำหนด' }, { v: 'wait', l: 'ยังไม่เริ่ม' }, { v: 'done', l: 'เสร็จแล้ว' }], f.state) + '</select>' +
      '<select id="tl-view"><option value="fy"' + (f.view === 'fy' ? ' selected' : '') + '>ทั้งปีงบประมาณ</option><option value="r6"' + (f.view === 'r6' ? ' selected' : '') + '>6 เดือน (รอบวันนี้)</option></select></div>' +
      '<div class="card tl-card"><div class="tl-head"><div><h2>ภาพรวมแผนงาน</h2><p class="muted small">แถบสีจาง = ช่วงเวลาตามแผน · แถบสีเข้ม = ความคืบหน้าของกิจกรรม · เส้นสีส้ม = วันนี้ · คลิกแถวเพื่อดูกิจกรรมในแผน</p></div>' +
      '<span class="tl-today">วันนี้ ' + esc(App.date(d.today)) + '</span></div><div class="tl-scroll"><div class="tl" id="tl-body"></div></div><div id="tl-undated" class="tl-undated"></div></div>';

    const draw = () => {
      const q = f.q.trim().toLowerCase();
      const rows = order.filter(p => (!f.fund || p.fund === f.fund) && (!f.state || p.state === f.state) && (!q || (p.name + ' ' + p.owner).toLowerCase().indexOf(q) >= 0));
      const cnt = { run: 0, late: 0, wait: 0, done: 0 }; rows.forEach(p => cnt[p.state]++);
      $id('tl-stats').innerHTML = stat('แผนที่แสดง', rows.length, 'จาก ' + order.length + ' แผนที่มีกิจกรรม', 'a') + stat('กำลังดำเนินการ', cnt.run, 'อยู่ในช่วงเวลาแผน', 'b') + stat('เลยกำหนด', cnt.late, 'ยังมีกิจกรรมไม่เสร็จ', cnt.late ? 'c warn' : 'c');
      // ช่วงเวลาที่แสดง
      let w0 = fy0, w1 = fy1;
      if (f.view === 'r6') { const t = new Date(Math.max(fy0, Math.min(fy1, today)) * 86400000); w0 = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1) / 86400000; w1 = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 5, 1) / 86400000 - 1; }
      const span = w1 - w0 + 1, pos = n => Math.max(0, Math.min(100, (n - w0) / span * 100));
      // หัวเดือน (กว้างตามจำนวนวัน)
      const months = []; let cur = new Date(w0 * 86400000);
      cur = Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), 1) / 86400000;
      while (cur <= w1) {
        const dt = new Date(cur * 86400000), nx = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) / 86400000;
        const a = Math.max(cur, w0), b = Math.min(nx - 1, w1);
        months.push({ l: App.date(iso(cur)).replace(/^\d+\s/, '').replace(/\s\d+$/, '') + ' ' + String(dt.getUTCFullYear() + 543).slice(-2), left: pos(a), width: (b - a + 1) / span * 100 });
        cur = nx;
      }
      const todayPct = today >= w0 && today <= w1 ? pos(today) : null;
      const grid = months.map(m => '<i class="tl-gl" style="left:' + m.left.toFixed(3) + '%"></i>').join('');
      const tline = todayPct === null ? '' : '<i class="tl-now" style="left:' + todayPct.toFixed(3) + '%"></i>';
      const bar = (s, e, pct, cls, label) => {
        if (s === null || e === null || e < w0 || s > w1) return '<span class="tl-out">ไม่อยู่ในช่วงที่แสดง</span>';
        const l = pos(Math.max(s, w0)), r = pos(Math.min(e, w1) + 1), wd = Math.max(r - l, 0.6);
        return '<div class="tl-bar ' + cls + '" style="left:' + l.toFixed(3) + '%;width:' + wd.toFixed(3) + '%" title="' + esc(label) + '"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i><b>' + (pct > 0 || cls !== 'wait' ? pct + '%' : '') + '</b></div>';
      };
      const dated = rows.filter(p => p.s !== null), undated = rows.filter(p => p.s === null);
      let html = '<div class="tl-row tl-hd"><div class="tl-name">แผนงาน</div><div class="tl-track">' + months.map(m => '<span style="left:' + m.left.toFixed(3) + '%;width:' + m.width.toFixed(3) + '%">' + esc(m.l) + '</span>').join('') + '</div></div>';
      dated.forEach(p => {
        const open = !!f.open[p.id];
        html += '<div class="tl-row tl-plan" data-plan="' + esc(p.id) + '"><div class="tl-name" title="' + esc(p.name) + '"><i class="fas fa-chevron-' + (open ? 'down' : 'right') + '"></i>' +
          '<span class="dot ' + p.state + '"></span><span class="t">' + esc(p.name) + '</span></div>' +
          '<div class="tl-track">' + grid + tline + bar(p.s, p.e, p.pct, p.state, p.name + ' · ' + App.date(iso(p.s)) + ' – ' + App.date(iso(p.e)) + ' · เสร็จ ' + p.done + '/' + p.acts.length) + '</div></div>';
        if (open) p.acts.slice().sort((a, b) => String(a.start).localeCompare(String(b.start))).forEach(a => {
          const s = dnum(a.start), e = dnum(a.end || a.start), st = a.progress === 'done' ? 'done' : a.overdue ? 'late' : a.progress === 'doing' ? 'run' : 'wait';
          html += '<div class="tl-row tl-act"><div class="tl-name" title="' + esc(a.name) + '"><span class="t">' + esc(a.name) + '</span></div><div class="tl-track">' + grid + tline +
            (s === null ? '<span class="tl-out">ไม่ระบุวันที่</span>' : bar(s, e, a.progress === 'done' ? 100 : (a.budget > 0 ? Math.min(100, Math.round(a.paid / a.budget * 100)) : 0), st, a.name + ' · ' + App.date(a.start) + ' – ' + App.date(a.end))) + '</div></div>';
        });
      });
      if (!dated.length) html += '<div class="kempty" style="padding:28px">ไม่พบแผนที่มีวันที่ตามเงื่อนไข</div>';
      $id('tl-body').innerHTML = html;
      $id('tl-undated').innerHTML = undated.length ? '<b><i class="fas fa-circle-info"></i> แผนที่ยังไม่ระบุวันที่กิจกรรม (' + undated.length + ')</b><div class="tl-chips">' + undated.slice(0, 40).map(p => '<a href="#/plan/' + esc(p.id) + '" title="' + esc(p.name) + '">' + esc(String(p.name).substring(0, 48)) + '</a>').join('') + '</div>' : '';
      document.querySelectorAll('#tl-body .tl-plan').forEach(r => r.addEventListener('click', () => { const id = r.dataset.plan; f.open[id] = !f.open[id]; draw(); }));
    };
    [['tl-q', 'q', 'input'], ['tl-fund', 'fund'], ['tl-state', 'state'], ['tl-view', 'view']].forEach(a => { const el = $id(a[0]); el.addEventListener(a[2] || 'change', () => { f[a[1]] = el.value; draw(); }); });
    draw();
  };

  // ===================================================================== 4) หมุดหมายสำคัญ
  const MS_STATE = { overdue: { t: 'เกินกำหนด', c: 'red' }, upcoming: { t: 'รอดำเนินการ', c: 'amber' }, done: { t: 'เสร็จแล้ว', c: 'green' }, nodate: { t: 'ไม่ระบุวันที่', c: 'gray' } };
  const IMP = { 'สูง': 'amber', 'กลาง': 'blue', 'ปกติ': 'gray' };
  App.pages.milestones = async function (view) {
    view.innerHTML = App.skeleton();
    const d = await App.api('milestones.list', { year: S.year });
    const f = memo.ms, items = d.items, c = d.counts; let limit = 36;
    const funds = Array.from(new Set(items.map(i => i.fund)));
    view.innerHTML = App.pageHead('หมุดหมายสำคัญ', 'ปีงบประมาณ ' + esc(S.year) + ' · วันสิ้นสุดกิจกรรมสุดท้าย และกำหนดส่งสรุปโครงการ (สิ้นสุด + ' + esc(d.grace) + ' วัน) ของทุกแผน', yearSelect()) +
      '<div class="xstats xstats4">' + stat('หมุดหมายทั้งหมด', c.total, 'จาก ' + (c.total / 2) + ' แผน', 'a') + stat('ใน 30 วันข้างหน้า', c.soon, 'ควรเตรียมการ', 'b') +
      stat('เกินกำหนด', c.overdue, 'รายการที่ควรติดตาม', c.overdue ? 'c warn' : 'c') + stat('เสร็จแล้ว', c.done, c.total ? Math.round(c.done / c.total * 100) + '% ของทั้งหมด' : '—', 'c') + '</div>' +
      '<div class="xbar"><input type="search" id="ms-q" placeholder="ค้นหาแผน/ผู้รับผิดชอบ" value="' + esc(f.q) + '">' +
      '<select id="ms-state"><option value="">ทุกสถานะ</option>' + opts(Object.keys(MS_STATE).map(k => ({ v: k, l: MS_STATE[k].t })), f.state) + '</select>' +
      '<select id="ms-kind"><option value="">ทุกประเภท</option>' + opts([{ v: 'end', l: 'กิจกรรมสุดท้ายสิ้นสุด' }, { v: 'summary', l: 'ส่งสรุปโครงการ' }], f.kind) + '</select>' +
      '<select id="ms-fund"><option value="">ทุกแหล่งเงิน</option>' + funds.map(x => '<option value="' + esc(x) + '"' + (x === f.fund ? ' selected' : '') + '>' + esc(App.fundName(x)) + '</option>').join('') + '</select></div>' +
      '<div class="xcount" id="ms-count"></div><div class="xcards" id="ms-cards"></div><div style="text-align:center;margin:16px 0" id="ms-more"></div>' +
      '<p class="muted small">ระดับความสำคัญคิดจากงบที่ใช้ของแผน: ≥ ' + App.money((d.thresholds || {}).high || 500000, 0) + ' บาท = สูง · ≥ ' + App.money((d.thresholds || {}).mid || 100000, 0) + ' บาท = กลาง · น้อยกว่านั้น = ปกติ (ปรับได้ที่ Script Properties)</p>';
    const card = e => {
      const st = MS_STATE[e.state], when = e.date ? App.date(e.date) : '—';
      const rel = e.state === 'overdue' && e.daysTo !== null ? ' · เกิน ' + Math.abs(e.daysTo) + ' วัน' : e.state === 'upcoming' && e.daysTo !== null ? ' · อีก ' + e.daysTo + ' วัน' : '';
      return '<article class="xcard ms ' + e.state + '"><div class="xcard-top"><div class="xcard-line"><span class="xsmall"><i class="fas fa-' + (e.kind === 'summary' ? 'file-signature' : 'flag-checkered') + '"></i> ' +
        esc(App.fundName(e.fund)) + '</span><span class="badge ' + st.c + '">' + st.t + '</span></div>' +
        '<h3>' + esc(e.title) + '</h3><div class="xcard-desc"><a href="#/plan/' + esc(e.planId) + '">' + esc(e.plan) + '</a></div>' + (e.note ? '<div class="small late" style="margin-top:6px"><i class="fas fa-circle-exclamation"></i> ' + esc(e.note) + '</div>' : '') +
        '<div class="xcard-meta"><div><label>ผู้รับผิดชอบ</label><strong>' + esc(e.owner || '—') + '</strong></div>' +
        '<div><label>' + (e.state === 'done' && e.kind === 'summary' ? 'ส่งเมื่อ' : 'กำหนด') + '</label><strong class="' + (e.state === 'overdue' ? 'late' : '') + '">' + when + esc(rel) + '</strong></div>' +
        '<div><label>กิจกรรมเสร็จ</label><strong>' + e.actsDone + '/' + e.acts + '</strong></div>' +
        '<div><label>ความสำคัญ</label><span class="badge ' + IMP[e.importance] + '">' + esc(e.importance) + '</span></div></div></div>' +
        '<div class="xcard-foot"><a class="btn subtle" href="#/plan/' + esc(e.planId) + '"><i class="fas fa-eye"></i> รายละเอียดแผน</a><span class="muted small">฿' + App.money(e.budget, 0) + '</span></div></article>';
    };
    const draw = () => {
      const q = f.q.trim().toLowerCase();
      const rows = items.filter(e => (!f.state || e.state === f.state) && (!f.kind || e.kind === f.kind) && (!f.fund || e.fund === f.fund) && (!q || (e.plan + ' ' + e.owner).toLowerCase().indexOf(q) >= 0));
      $id('ms-count').textContent = 'แสดง ' + Math.min(rows.length, limit) + ' จาก ' + rows.length + ' รายการ';
      $id('ms-cards').innerHTML = rows.length ? rows.slice(0, limit).map(card).join('') : '<div class="card empty" style="grid-column:1/-1">ไม่พบหมุดหมายตามเงื่อนไข</div>';
      $id('ms-more').innerHTML = rows.length > limit ? '<button type="button" class="btn ghost" id="ms-more-btn">แสดงเพิ่ม (' + (rows.length - limit) + ')</button>' : '';
      const mb = $id('ms-more-btn'); if (mb) mb.addEventListener('click', () => { limit += 36; draw(); });
    };
    [['ms-q', 'q', 'input'], ['ms-state', 'state'], ['ms-kind', 'kind'], ['ms-fund', 'fund']].forEach(a => { const el = $id(a[0]); el.addEventListener(a[2] || 'change', () => { f[a[1]] = el.value; limit = 36; draw(); }); });
    draw();
  };
})();
