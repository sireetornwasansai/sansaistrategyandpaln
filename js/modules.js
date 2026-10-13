/* v2.4 · เมนูเพิ่มเติมตามระบบตัวอย่าง NEXA:
   งบประมาณ · ค่าใช้จ่าย · คำขออนุมัติ · บริหารความเสี่ยง · ปัญหาและอุปสรรค · ทรัพยากร · ทีมและผู้รับผิดชอบ ·
   เอกสารโครงการ · การประชุม · รายงานผู้บริหาร · ศูนย์แจ้งเตือน · ประวัติการทำรายการ · คลังโครงการ */
(function () {
  'use strict';
  const App = window.App, esc = App.esc, S = App.state;
  Object.assign(App.STATUS_CLASS, { 'เฝ้าระวัง': 'amber', 'กำลังจัดการ': 'blue', 'ปิดความเสี่ยง': 'green', 'เปิด': 'red', 'กำลังแก้ไข': 'amber', 'แก้ไขแล้ว': 'green', 'วางแผน': 'gray', 'จัดสรรแล้ว': 'blue', 'ใช้งานอยู่': 'green', 'คืนแล้ว': 'gray', 'นัดหมาย': 'amber', 'จัดแล้ว': 'green', 'ฉบับร่าง': 'gray', 'ใช้งาน': 'green' });
  const $id = id => document.getElementById(id);
  const yearSelect = () => '<label class="inline-field"><span>ปีงบประมาณ</span><select data-change="year">' + App.years().map(y => '<option' + (String(y) === String(S.year) ? ' selected' : '') + '>' + y + '</option>').join('') + '</select></label>';
  const opts = (list, cur) => list.map(o => { const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o; return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
  const stat = (l, v, sub, cls) => '<div class="xstat ' + (cls || '') + '"><div class="xstat-label">' + l + '</div><div class="xstat-value">' + v + '</div><div class="xstat-sub">' + sub + '</div></div>';
  const baht = n => '฿' + App.money(n, 0);
  const planLink = (id, name) => id ? '<a href="#/plan/' + esc(id) + '" title="' + esc(name) + '">' + esc(String(name).length > 70 ? String(name).substring(0, 70) + '…' : name) + '</a>' : '<span class="muted">—</span>';
  const bind = (list, f, draw) => list.forEach(a => { const el = $id(a[0]); if (el) el.addEventListener(a[2] || 'change', () => { f[a[1]] = el.type === 'checkbox' ? el.checked : el.value; draw(); }); });
  const chart = (id, cfg) => { const el = $id(id); if (!el) return; if (typeof Chart === 'undefined') { el.parentNode.innerHTML = '<p class="muted" style="padding:30px 0;text-align:center">โหลดกราฟไม่สำเร็จ (ไม่มีอินเทอร์เน็ตหรือเครือข่ายบล็อกไลบรารีกราฟ) ตัวเลขในตารางยังใช้ได้ตามปกติ</p>'; return; } Chart.defaults.font.family = '"IBM Plex Sans Thai", Inter, sans-serif'; App.charts = App.charts || []; App.charts.push(new Chart(el, cfg)); };
  const PAL = ['#1d4f91', '#0e7c7b', '#3f6ea8', '#059669', '#f59e0b', '#e11d48', '#64748b', '#2bb3b0', '#7aa7d9', '#a16207'];
  const memo = { scope: 'hospital', exp: { q: '', fund: '', stage: '' }, appr: { q: '' }, team: { q: '', all: false }, alert: { sev: '', q: '' }, hist: { q: '' }, arch: { q: '', year: '', status: '' }, doc: { q: '', type: '' } };
  const safe = u => /^https?:\/\//i.test(String(u || '')) ? u : '#';
  const empty = t => '<div class="card empty" style="grid-column:1/-1">' + esc(t) + '</div>';

  const scopeSelect = () => '<label class="inline-field"><span>ขอบเขต</span><select id="bd-scope"><option value="hospital"' + (memo.scope === 'hospital' ? ' selected' : '') + '>เฉพาะแหล่งเงินที่นับใน KPI รพ. (เหมือนหน้าภาพรวม)</option><option value="all"' + (memo.scope === 'all' ? ' selected' : '') + '>ทุกแหล่งเงิน</option></select></label>';
  const bindScope = () => { const el = $id('bd-scope'); if (el) el.addEventListener('change', () => { memo.scope = el.value; App.render(); }); };
  // ===================================================================== งบประมาณ
  App.pages.budget = async function (view) {
    view.innerHTML = App.skeleton();
    const d = await App.api('budget.summary', { year: S.year, scope: memo.scope }), t = d.totals;
    view.innerHTML = App.pageHead('งบประมาณ', 'ปีงบประมาณ ' + esc(S.year) + ' · กรอบงบที่ใช้จริง การเบิกจ่ายสุทธิ และงบคงเหลือ แยกตามแหล่งเงินและหมวดค่าใช้จ่าย', yearSelect() + scopeSelect()) +
      '<div class="xstats xstats4">' + stat('งบที่ใช้จริง', baht(t.active), 'จาก ' + t.plans + ' แผน (ไม่นับที่ยกเลิก/ไม่เบิก)', 'a') + stat('เบิกจ่ายสุทธิ', baht(t.paid), 'ร้อยละ ' + App.pct(t.pct), 'b') +
      stat('งบคงเหลือ', baht(t.remaining), 'ยังไม่เบิกจ่าย', 'c') + stat('งบที่ปล่อยคืน', baht(t.released), 'จากกิจกรรมที่ยกเลิก/ไม่เบิก', 'c') + '</div>' +
      '<div class="grid2"><section class="card"><h2>งบ เทียบ เบิกจ่าย ตามแหล่งเงิน</h2><div class="chart-box"><canvas id="bd-fund"></canvas></div></section>' +
      '<section class="card"><h2>งบตามหมวดค่าใช้จ่าย</h2><div class="chart-box"><canvas id="bd-cat"></canvas></div></section></div>' +
      '<section class="card"><h2>ยอดจ่ายรายเดือน (ตามวันที่จ่ายจริง)</h2><div class="chart-box short"><canvas id="bd-mon"></canvas></div>' +
      (d.undatedPaid > 0 ? '<p class="muted small">ยอด ' + baht(d.undatedPaid) + ' ยังไม่ระบุวันที่จ่ายจึงไม่อยู่ในกราฟนี้</p>' : '') + '</section>' +
      '<section class="card table-card"><div class="table-wrap"><table class="table"><thead><tr><th>แหล่งเงิน</th><th class="num">แผน</th><th class="num">งบที่ใช้จริง</th><th class="num">เบิกจ่ายสุทธิ</th><th class="num">คงเหลือ</th><th style="min-width:150px">ร้อยละเบิก</th></tr></thead><tbody>' +
      d.funds.map(f => '<tr><td><b>' + esc(f.name) + '</b></td><td class="num">' + f.plans + '</td><td class="num">' + App.money(f.active) + '</td><td class="num">' + App.money(f.paid) + '</td><td class="num">' + App.money(f.remaining) + '</td><td>' + App.progress(f.pct) + '<small class="muted">' + App.pct(f.pct) + '</small></td></tr>').join('') +
      '<tr class="sum"><td><b>รวม</b></td><td class="num">' + t.plans + '</td><td class="num">' + App.money(t.active) + '</td><td class="num">' + App.money(t.paid) + '</td><td class="num">' + App.money(t.remaining) + '</td><td>' + App.pct(t.pct) + '</td></tr></tbody></table></div></section>';
    bindScope();
    const ax = { ticks: { callback: v => v >= 1e6 ? (v / 1e6) + 'M' : v >= 1e3 ? (v / 1e3) + 'k' : v } };
    chart('bd-fund', { type: 'bar', data: { labels: d.funds.map(f => f.name), datasets: [{ label: 'งบที่ใช้จริง', data: d.funds.map(f => f.active), backgroundColor: '#7aa7d9' }, { label: 'เบิกจ่ายสุทธิ', data: d.funds.map(f => f.paid), backgroundColor: '#0e7c7b' }] }, options: { maintainAspectRatio: false, scales: { y: ax } } });
    chart('bd-cat', { type: 'doughnut', data: { labels: d.categories.map(c => c.name), datasets: [{ data: d.categories.map(c => c.amount), backgroundColor: d.categories.map((c, i) => PAL[i % PAL.length]) }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } });
    chart('bd-mon', { type: 'bar', data: { labels: App.FY_MONTHS, datasets: [{ label: 'ยอดจ่าย (บาท)', data: d.months, backgroundColor: '#1d4f91' }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: ax } } });
  };

  // ===================================================================== ค่าใช้จ่าย
  const STAGE_CLS = { 'รออนุมัติ': 'gray', 'อนุมัติแล้ว': 'blue', 'ขอเบิกแล้ว': 'amber', 'จ่ายแล้ว': 'green' };
  App.pages.expenses = async function (view) {
    view.innerHTML = App.skeleton();
    const d = await App.api('expenses.list', { year: S.year }), f = memo.exp; let limit = 100;
    const funds = Array.from(new Set(d.rows.map(r => r.fund)));
    view.innerHTML = App.pageHead('ค่าใช้จ่าย', 'ปีงบประมาณ ' + esc(S.year) + ' · งวดเบิกจ่ายทั้งหมดและสถานะตามวันที่อนุมัติ/ขอเบิก/จ่ายจริง', yearSelect()) +
      '<div class="xstats xstats4">' + ['จ่ายแล้ว', 'ขอเบิกแล้ว', 'อนุมัติแล้ว', 'รออนุมัติ'].map((k, i) => stat(k, baht(d.sums[k]), d.counts[k] + ' งวด', ['c', 'b', 'a', 'a'][i])).join('') + '</div>' +
      '<div class="xbar"><input type="search" id="ex-q" placeholder="ค้นหาแผน/กิจกรรม/ผู้รับผิดชอบ" value="' + esc(f.q) + '"><select id="ex-fund"><option value="">ทุกแหล่งเงิน</option>' + opts(funds.map(c => ({ v: c, l: App.fundName(c) })), f.fund) + '</select>' +
      '<select id="ex-stage"><option value="">ทุกสถานะ</option>' + opts(Object.keys(STAGE_CLS), f.stage) + '</select></div>' +
      '<div class="xcount" id="ex-count"></div><section class="card table-card"><div class="table-wrap"><table class="table"><thead><tr><th>แผน / กิจกรรม</th><th>งวด</th><th>สถานะ</th><th>อนุมัติ</th><th>ขอเบิก</th><th>จ่ายจริง</th><th class="num">จำนวนเงิน</th><th>หลักฐาน</th></tr></thead><tbody id="ex-body"></tbody></table></div></section>' +
      '<div style="text-align:center;margin:14px 0" id="ex-more"></div>' + (d.refunds ? '<p class="muted small">คืนเงินรวมในปีนี้ ' + baht(d.refunds) + ' (หักออกจากเบิกจ่ายสุทธิแล้ว)</p>' : '') + (d.truncated ? '<p class="muted small">แสดงสูงสุด 3,000 งวดล่าสุด</p>' : '');
    const draw = () => {
      const q = f.q.trim().toLowerCase(), rows = d.rows.filter(r => (!f.fund || r.fund === f.fund) && (!f.stage || r.stage === f.stage) && (!q || (r.plan + ' ' + r.act + ' ' + r.owner).toLowerCase().indexOf(q) >= 0));
      $id('ex-count').textContent = 'แสดง ' + Math.min(rows.length, limit) + ' จาก ' + rows.length + ' งวด';
      $id('ex-body').innerHTML = rows.slice(0, limit).map(r => '<tr><td>' + planLink(r.planId, r.plan) + '<div class="muted small">' + (r.actNo ? r.actNo + '. ' : '') + esc(String(r.act).substring(0, 90)) + '</div></td><td>' + r.seq + '</td><td>' + App.badge(r.stage, STAGE_CLS[r.stage]) + '</td><td class="nowrap">' + (r.approveDate ? App.date(r.approveDate) : '—') +
        '</td><td class="nowrap">' + (r.requestDate ? App.date(r.requestDate) : '—') + '</td><td class="nowrap">' + (r.paidDate ? App.date(r.paidDate) : '—') + '</td><td class="num">' + App.money(r.amount) + '</td><td>' + (r.evidence ? '<a href="' + esc(safe(r.evidence)) + '" target="_blank" rel="noopener"><i class="fas fa-paperclip"></i> เปิด</a>' : '<span class="muted">—</span>') + '</td></tr>').join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:22px">ไม่พบรายการ</td></tr>';
      $id('ex-more').innerHTML = rows.length > limit ? '<button type="button" class="btn ghost" id="ex-more-btn">แสดงเพิ่ม (' + (rows.length - limit) + ')</button>' : '';
      const mb = $id('ex-more-btn'); if (mb) mb.addEventListener('click', () => { limit += 100; draw(); });
    };
    bind([['ex-q', 'q', 'input'], ['ex-fund', 'fund'], ['ex-stage', 'stage']], f, () => { limit = 100; draw(); }); draw();
  };

  // ===================================================================== คำขออนุมัติ
  App.pages.approvals = async function (view) {
    view.innerHTML = App.skeleton();
    const d = await App.api('expenses.list', { year: S.year }), f = memo.appr;
    view.innerHTML = App.pageHead('คำขออนุมัติ', 'ปีงบประมาณ ' + esc(S.year) + ' · ติดตามงวดเบิกจ่ายที่ยังไม่จ่าย แยกตามขั้นตอน และแผนที่ยังเป็นร่าง (แก้ไขสถานะได้ในหน้ารายละเอียดแผน)', yearSelect()) +
      '<div class="xstats">' + stat('รออนุมัติ', d.counts['รออนุมัติ'], baht(d.sums['รออนุมัติ']), 'a') + stat('รอขอเบิก/รอจ่าย', d.counts['อนุมัติแล้ว'] + d.counts['ขอเบิกแล้ว'], baht(d.sums['อนุมัติแล้ว'] + d.sums['ขอเบิกแล้ว']), 'b') + stat('แผนร่างรออนุมัติ', d.pendingPlans.length, 'สถานะ "ร่าง"', d.pendingPlans.length ? 'c warn' : 'c') + '</div>' +
      '<div class="xbar"><input type="search" id="ap-q" placeholder="ค้นหาแผน/กิจกรรม/ผู้รับผิดชอบ" value="' + esc(f.q) + '"></div><div class="kanban" id="ap-board"></div>' +
      '<section class="card" style="margin-top:18px"><h2>แผนที่ยังเป็นร่าง (รออนุมัติแผน)</h2><div id="ap-plans"></div></section>';
    const COLS = [['รออนุมัติ', 'todo'], ['อนุมัติแล้ว', 'doing'], ['ขอเบิกแล้ว', 'done']], hint = { 'รออนุมัติ': 'ยังไม่มีวันที่อนุมัติ', 'อนุมัติแล้ว': 'อนุมัติแล้ว รอขอเบิก', 'ขอเบิกแล้ว': 'ขอเบิกแล้ว รอจ่ายเงิน' };
    const draw = () => {
      const q = f.q.trim().toLowerCase(), rows = d.rows.filter(r => r.stage !== 'จ่ายแล้ว' && (!q || (r.plan + ' ' + r.act + ' ' + r.owner).toLowerCase().indexOf(q) >= 0));
      $id('ap-board').innerHTML = COLS.map(c => { const list = rows.filter(r => r.stage === c[0]);
        return '<section class="kanban-col ' + c[1] + '"><div class="kanban-title"><span>' + c[0] + '<small class="muted"> · ' + hint[c[0]] + '</small></span><span class="badge ' + STAGE_CLS[c[0]] + '">' + list.length + '</span></div>' +
          (list.length ? list.slice(0, 40).map(r => '<article class="task-card"><div class="flex-between"><span class="tag">' + esc(App.fundName(r.fund)) + '</span><b>' + baht(r.amount) + '</b></div><h3>' + esc((r.actNo ? r.actNo + '. ' : '') + r.act) + '</h3><a class="tplan" href="#/plan/' + esc(r.planId) + '">' + esc(r.plan) + '</a>' +
            '<div class="flex-between tmeta"><small class="muted">งวดที่ ' + r.seq + ' · ' + esc(r.owner || '') + '</small><small>' + (r.requestDate ? 'ขอเบิก ' + App.date(r.requestDate) : r.approveDate ? 'อนุมัติ ' + App.date(r.approveDate) : '') + '</small></div></article>').join('') : '<div class="kempty">ไม่มีรายการ</div>') +
          (list.length > 40 ? '<div class="muted small" style="text-align:center">แสดง 40 จาก ' + list.length + ' — กรองด้วยช่องค้นหา</div>' : '') + '</section>'; }).join('');
    };
    $id('ap-plans').innerHTML = d.pendingPlans.length ? '<div class="tl-chips">' + d.pendingPlans.map(p => '<a href="#/plan/' + esc(p.planId) + '" title="' + esc(p.name) + '">' + esc(String(p.name).substring(0, 60)) + '</a>').join('') + '</div>' : '<p class="muted">ไม่มีแผนที่เป็นร่าง</p>';
    bind([['ap-q', 'q', 'input']], f, draw); draw();
  };

  // ===================================================================== ความเสี่ยง / ปัญหา / ทรัพยากร / ประชุม / เอกสาร (ชีต Records)
  const REC = {
    risk: { title: 'บริหารความเสี่ยง', sub: 'ทะเบียนความเสี่ยงของแผน ประเมินโอกาสเกิด × ผลกระทบ (1–5) และแผนรับมือ', add: 'เพิ่มความเสี่ยง', date: 'วันที่ติดตาม', owner: 'ผู้รับผิดชอบ', ico: 'triangle-exclamation' },
    issue: { title: 'ปัญหาและอุปสรรค', sub: 'บันทึกปัญหาที่เกิดระหว่างดำเนินงาน ระดับความสำคัญ และสถานะการแก้ไข', add: 'เพิ่มปัญหา', date: 'กำหนดแก้ไข', owner: 'ผู้รับผิดชอบ', ico: 'circle-exclamation' },
    resource: { title: 'ทรัพยากร', sub: 'ทรัพยากรที่แผนต้องใช้ เช่น บุคลากร ยานพาหนะ ห้องประชุม ครุภัณฑ์ และสถานะการจัดสรร', add: 'เพิ่มทรัพยากร', date: 'วันที่ต้องใช้', owner: 'ผู้ดูแล/ผู้ขอใช้', ico: 'boxes-stacked' },
    meeting: { title: 'การประชุม', sub: 'นัดหมายและบันทึกการประชุมที่เกี่ยวกับแผนงาน (วาระ/มติ)', add: 'เพิ่มการประชุม', date: 'วันที่ประชุม', owner: 'ประธาน/ผู้บันทึก', ico: 'calendar-check' },
    document: { title: 'เอกสารโครงการ', sub: 'เอกสารที่แนบด้วยตนเอง (ลิงก์ Google Drive) รวมกับไฟล์ที่ระบบรวบรวมให้จากการเบิกจ่ายและสรุปโครงการ', add: 'เพิ่มเอกสาร', date: 'วันที่เอกสาร', owner: 'ผู้จัดทำ', ico: 'file-lines' }
  };
  const RISK = { high: 15, mid: 8 }; // ปรับได้ที่ Script Properties: RISK_HIGH_SCORE / RISK_MID_SCORE (ค่าจริงมากับ records.list)
  const scoreInfo = s => s >= RISK.high ? { t: 'สูง', c: 'red' } : s >= RISK.mid ? { t: 'กลาง', c: 'amber' } : { t: 'ต่ำ', c: 'green' };
  const PRI_CLS = { 'วิกฤต': 'red', 'สูง': 'amber', 'ปานกลาง': 'blue', 'ต่ำ': 'gray' };
  const memoRec = {};
  function recPage(kind) {
    const C = REC[kind];
    App.pages[{ risk: 'risks', issue: 'issues', resource: 'resources', meeting: 'meetings', document: 'documents' }[kind]] = async function (view) {
      view.innerHTML = App.skeleton();
      const reqs = [App.api('records.list', { kind: kind, year: S.year })]; if (kind === 'document') reqs.push(App.api('documents.list', { year: S.year }));
      const res = await Promise.all(reqs), d = res[0]; if (d.riskHigh) { RISK.high = d.riskHigh; RISK.mid = d.riskMid || RISK.mid; } const auto = res[1] ? res[1].items : [], f = memoRec[kind] || (memoRec[kind] = { q: '', status: '', type: '' }), today = App.today();
      const can = App.can(), items = d.items;
      const kpis = {
        risk: () => { const open = items.filter(r => r.Status !== 'ปิดความเสี่ยง'); return stat('ความเสี่ยงที่เปิดอยู่', open.length, 'จากทั้งหมด ' + items.length, 'a') + stat('ระดับสูง (≥' + RISK.high + ')', open.filter(r => r.score >= RISK.high).length, 'ควรมีแผนรับมือ', open.some(r => r.score >= RISK.high) ? 'c warn' : 'c') + stat('ปิดแล้ว', items.length - open.length, 'ความเสี่ยง', 'c'); },
        issue: () => { const open = items.filter(r => r.Status !== 'แก้ไขแล้ว'); return stat('ปัญหาที่ยังเปิดอยู่', open.length, 'จากทั้งหมด ' + items.length, 'a') + stat('สูง/วิกฤต', open.filter(r => ['สูง', 'วิกฤต'].indexOf(r.Priority) >= 0).length, 'ต้องเร่งแก้ไข', open.some(r => r.Priority === 'วิกฤต') ? 'c warn' : 'c') + stat('แก้ไขแล้ว', items.length - open.length, 'รายการ', 'c'); },
        resource: () => stat('ทั้งหมด', items.length, 'รายการทรัพยากร', 'a') + stat('จัดสรรแล้ว/ใช้งานอยู่', items.filter(r => ['จัดสรรแล้ว', 'ใช้งานอยู่'].indexOf(r.Status) >= 0).length, 'พร้อมใช้งาน', 'b') + stat('รอวางแผน', items.filter(r => r.Status === 'วางแผน').length, 'ยังไม่จัดสรร', 'c'),
        meeting: () => stat('ทั้งหมด', items.length, 'การประชุม', 'a') + stat('กำลังจะถึง', items.filter(r => r.Status === 'นัดหมาย' && r.Date >= today).length, 'สถานะ "นัดหมาย"', 'b') + stat('จัดแล้ว', items.filter(r => r.Status === 'จัดแล้ว').length, 'ครั้ง', 'c'),
        document: () => stat('เอกสารที่แนบเอง', items.length, 'ลิงก์', 'a') + stat('ไฟล์อัตโนมัติ', auto.length, 'หลักฐานเบิกจ่าย/สรุปโครงการ', 'b') + stat('รวม', items.length + auto.length, 'เอกสารในปีนี้', 'c')
      }[kind]();
      const heat = kind !== 'risk' ? '' : (() => { const open = items.filter(r => r.Status !== 'ปิดความเสี่ยง'); let h = '<section class="card"><h2>แผนที่ความเสี่ยง (โอกาสเกิด × ผลกระทบ)</h2><div class="heat">';
        for (let i = 5; i >= 1; i--) { h += '<b class="hl">' + i + '</b>'; for (let l = 1; l <= 5; l++) { const n = open.filter(r => r.Likelihood === l && r.Impact === i).length, sc = l * i; h += '<div class="hc ' + scoreInfo(sc).c + '" title="โอกาส ' + l + ' × ผลกระทบ ' + i + ' = ' + sc + '">' + (n || '') + '</div>'; } }
        return h + '<span></span>' + [1, 2, 3, 4, 5].map(l => '<b class="hl">' + l + '</b>').join('') + '</div><p class="muted small">แนวตั้ง = ผลกระทบ · แนวนอน = โอกาสเกิด · นับเฉพาะความเสี่ยงที่ยังไม่ปิด</p></section>'; })();
      view.innerHTML = App.pageHead(C.title, 'ปีงบประมาณ ' + esc(S.year) + ' · ' + C.sub, yearSelect() + (can ? '<button class="btn primary" id="rc-add"><i class="fas fa-plus"></i> ' + C.add + '</button>' : '')) +
        '<div class="xstats">' + kpis + '</div>' + heat +
        '<div class="xbar"><input type="search" id="rc-q" placeholder="ค้นหา" value="' + esc(f.q) + '"><select id="rc-status"><option value="">ทุกสถานะ</option>' + opts(d.statuses, f.status) + '</select></div>' +
        '<div class="xcount" id="rc-count"></div><div class="xcards" id="rc-cards"></div>' +
        (kind === 'document' ? '<section class="card table-card" style="margin-top:20px"><div class="card-head" style="padding:18px 22px 0"><h2>ไฟล์ที่ระบบรวบรวมให้อัตโนมัติ</h2></div><div class="xbar" style="padding:0 22px"><select id="dc-type"><option value="">ทุกประเภท</option>' + opts(['สรุปโครงการ', 'หลักฐานเบิกจ่าย'], f.type) + '</select></div><div class="table-wrap"><table class="table"><thead><tr><th>เอกสาร</th><th>ประเภท</th><th>แผน</th><th>วันที่</th><th></th></tr></thead><tbody id="dc-body"></tbody></table></div></section>' : '');
      const badgeFor = r => kind === 'risk' ? '<span class="badge ' + scoreInfo(r.score).c + '">คะแนน ' + r.score + ' · ' + scoreInfo(r.score).t + '</span>' : kind === 'issue' ? '<span class="badge ' + PRI_CLS[r.Priority] + '">' + esc(r.Priority) + '</span>' : '';
      const card = r => {
        const meta = [['ผู้รับผิดชอบ', esc(r.Owner || '—')], [C.date, r.Date ? App.date(r.Date) : '—']];
        if (kind === 'risk') meta.push(['โอกาส × ผลกระทบ', r.Likelihood + ' × ' + r.Impact]); if (kind === 'meeting' && r.Status === 'นัดหมาย' && r.Date >= today) meta.push(['สถานะ', '<span class="badge amber">กำลังจะถึง</span>']);
        return '<article class="xcard rec"><div class="xcard-top"><div class="xcard-line"><span class="xsmall"><i class="fas fa-' + C.ico + '"></i> ' + (r.plan ? esc(String(r.plan).substring(0, 40)) : 'ทั่วไป (ไม่ผูกแผน)') + '</span><span class="badge ' + (App.STATUS_CLASS[r.Status] || 'gray') + '">' + esc(r.Status) + '</span></div>' +
          '<h3>' + esc(r.Title) + '</h3>' + (badgeFor(r) ? '<div style="margin:0 0 8px">' + badgeFor(r) + '</div>' : '') + (r.Detail ? '<div class="xcard-desc pre">' + esc(r.Detail) + '</div>' : '') +
          '<div class="xcard-meta">' + meta.map(m => '<div><label>' + m[0] + '</label><strong>' + m[1] + '</strong></div>').join('') + '</div></div>' +
          '<div class="xcard-foot">' + (r.Url ? '<a class="btn subtle" href="' + esc(safe(r.Url)) + '" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i> เปิดเอกสาร</a>' : r.PlanId ? '<a class="btn subtle" href="#/plan/' + esc(r.PlanId) + '"><i class="fas fa-eye"></i> ดูแผน</a>' : '<span></span>') +
          (can && r.canEdit ? '<span class="xactions"><button class="icon-btn" data-edit="' + esc(r.RecId) + '" aria-label="แก้ไข" title="แก้ไข"><i class="fas fa-pen"></i></button><button class="icon-btn" data-del="' + esc(r.RecId) + '" aria-label="ลบ" title="ลบ"><i class="fas fa-trash"></i></button></span>' : '') + '</div></article>';
      };
      const draw = () => {
        const q = f.q.trim().toLowerCase(), rows = items.filter(r => (!f.status || r.Status === f.status) && (!q || (r.Title + ' ' + r.Detail + ' ' + r.Owner + ' ' + r.plan).toLowerCase().indexOf(q) >= 0));
        $id('rc-count').textContent = 'แสดง ' + rows.length + ' จาก ' + items.length + ' รายการ';
        $id('rc-cards').innerHTML = rows.length ? rows.map(card).join('') : empty('ยังไม่มีรายการ' + (can ? ' — กดปุ่ม "' + C.add + '" เพื่อเริ่มบันทึก' : ''));
        view.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => form(items.find(r => r.RecId === b.dataset.edit))));
        view.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { const r = items.find(x => x.RecId === b.dataset.del); if (!await App.confirm('ลบ "' + r.Title + '" ?', 'ลบ', true)) return; try { await App.api('records.delete', { recId: r.RecId }); App.toast('ลบแล้ว', 'success'); App.render(); } catch (e) { App.fail(e); } }));
        const dcb = $id('dc-body'); if (dcb) { const rr = auto.filter(a => (!f.type || a.type === f.type) && (!q || (a.title + ' ' + a.plan).toLowerCase().indexOf(q) >= 0)).slice(0, 200);
          dcb.innerHTML = rr.map(a => '<tr><td>' + esc(a.title) + '</td><td>' + App.badge(a.type, a.type === 'สรุปโครงการ' ? 'green' : 'blue') + '</td><td>' + planLink(a.planId, a.plan) + '</td><td class="nowrap">' + (a.date ? App.date(a.date) : '—') + '</td><td><a href="' + esc(safe(a.url)) + '" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i> เปิด</a></td></tr>').join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:20px">ไม่พบเอกสาร</td></tr>'; }
      };
      const form = r => {
        const v = r || {}, fields = [
          { name: 'planId', label: 'ผูกกับแผนงาน', type: 'select', blank: 'ทั่วไป (ไม่ผูกแผน)', options: d.plans.map(p => ({ v: p.planId, l: (p.seq ? '#' + p.seq + ' ' : '') + String(p.name).substring(0, 90) })), value: v.PlanId, full: true },
          { name: 'title', label: 'หัวข้อ', required: true, value: v.Title, full: true }, { name: 'detail', label: kind === 'meeting' ? 'วาระ / มติที่ประชุม' : kind === 'risk' ? 'รายละเอียด / แผนรับมือ' : 'รายละเอียด', type: 'textarea', rows: 4, value: v.Detail, full: true },
          { name: 'owner', label: C.owner, value: v.Owner, list: 'rec_people' }, { name: 'status', label: 'สถานะ', type: 'select', noBlank: true, options: d.statuses, value: v.Status || d.statuses[0] },
          { name: 'date', label: C.date, type: 'date', value: v.Date, required: kind === 'meeting' }];
        if (kind === 'risk') fields.push({ name: 'likelihood', label: 'โอกาสเกิด (1–5)', type: 'select', noBlank: true, options: [1, 2, 3, 4, 5], value: v.Likelihood || 3 }, { name: 'impact', label: 'ผลกระทบ (1–5)', type: 'select', noBlank: true, options: [1, 2, 3, 4, 5], value: v.Impact || 3 });
        if (kind === 'issue') fields.push({ name: 'priority', label: 'ระดับความสำคัญ', type: 'select', noBlank: true, options: d.priorities, value: v.Priority || 'ปานกลาง' });
        if (kind === 'document' || kind === 'meeting') fields.push({ name: 'url', label: kind === 'document' ? 'ลิงก์เอกสาร (https://…)' : 'ลิงก์รายงานการประชุม (ถ้ามี)', type: 'url', required: kind === 'document', value: v.Url, full: true });
        App.modal({ title: (r ? 'แก้ไข' : C.add) + ' — ' + C.title, wide: true, html: App.formGrid(fields) + '<datalist id="rec_people">' + d.people.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>',
          onSubmit: async dlg => { await App.api('records.save', Object.assign({ kind: kind, recId: r ? r.RecId : '' }, App.values(dlg))); App.toast('บันทึกแล้ว', 'success'); App.render(); } });
      };
      bind([['rc-q', 'q', 'input'], ['rc-status', 'status'], ['dc-type', 'type']], f, draw);
      const add = $id('rc-add'); if (add) add.addEventListener('click', () => form(null)); draw();
    };
  }
  ['risk', 'issue', 'resource', 'meeting', 'document'].forEach(recPage);

  // ===================================================================== ทีมและผู้รับผิดชอบ
  App.pages.team = async function (view) {
    view.innerHTML = App.skeleton();
    const d = await App.api('team.list', { year: S.year }), f = memo.team;
    view.innerHTML = App.pageHead('ทีมและผู้รับผิดชอบ', 'ปีงบประมาณ ' + esc(S.year) + ' · ภาระงานของผู้รับผิดชอบแต่ละคน: จำนวนแผน งบ กิจกรรมที่เสร็จ/เลยกำหนด', yearSelect()) +
      '<div class="xstats">' + stat('บุคลากรในระบบ', d.members.length, 'จากทะเบียนผู้รับผิดชอบ', 'a') + stat('มีแผนรับผิดชอบ', d.withPlans, 'คน', 'b') + stat('มีกิจกรรมเลยกำหนด', d.members.filter(m => m.late > 0).length, 'คน', d.members.some(m => m.late > 0) ? 'c warn' : 'c') + '</div>' +
      '<div class="xbar"><input type="search" id="tm-q" placeholder="ค้นหาชื่อ/กลุ่มงาน" value="' + esc(f.q) + '"><label class="check"><input type="checkbox" id="tm-all"' + (f.all ? ' checked' : '') + '> แสดงผู้ที่ยังไม่มีแผนด้วย</label></div><div class="xcount" id="tm-count"></div><div class="xcards" id="tm-cards"></div>';
    const ini = n => String(n || '?').replace(/^(น\.ส\.|นางสาว|นาย|นาง|นพ\.|พญ\.|ทพ\.|ภก\.|ภญ\.|พว\.|ดร\.)\s*/, '').charAt(0) || '?';
    const draw = () => {
      const q = f.q.trim().toLowerCase(), rows = d.members.filter(m => (f.all || m.plans > 0) && (!q || (m.name + ' ' + m.department).toLowerCase().indexOf(q) >= 0));
      $id('tm-count').textContent = 'แสดง ' + rows.length + ' จาก ' + d.members.length + ' คน';
      $id('tm-cards').innerHTML = rows.length ? rows.map(m => { const pct = m.acts ? Math.round(m.done / m.acts * 100) : 0;
        return '<article class="xcard"><div class="xcard-top"><div class="member"><span class="avatar">' + esc(ini(m.name)) + '</span><div><h3 style="margin:0">' + esc(m.name) + '</h3><div class="muted small">' + esc(m.department || '—') + (m.email ? ' · ' + esc(m.email) : '') + '</div></div></div>' +
          '<div class="xcard-meta"><div><label>แผนที่รับผิดชอบ</label><strong>' + m.plans + '</strong></div><div><label>งบที่ดูแล</label><strong>' + baht(m.planned) + '</strong></div><div><label>เบิกจ่ายสุทธิ</label><strong>' + baht(m.paid) + '</strong></div><div><label>ค้างส่งสรุป</label><strong class="' + (m.overdueSummary ? 'late' : '') + '">' + m.overdueSummary + ' แผน</strong></div></div>' +
          '<div class="xprog"><div class="xprog-h"><span>กิจกรรมเสร็จ ' + m.done + '/' + m.acts + '</span><span class="' + (m.late ? 'late' : '') + '">' + (m.late ? 'เลยกำหนด ' + m.late : 'ตรงเวลา') + '</span></div>' + App.progress(pct) + '</div></div></article>'; }).join('') : empty('ไม่พบบุคลากรตามเงื่อนไข');
    };
    bind([['tm-q', 'q', 'input'], ['tm-all', 'all']], f, draw); draw();
  };

  // ===================================================================== ศูนย์แจ้งเตือน
  const SEV = { high: { t: 'ด่วน', c: 'red', i: 'circle-exclamation' }, medium: { t: 'ควรติดตาม', c: 'amber', i: 'triangle-exclamation' }, low: { t: 'แจ้งให้ทราบ', c: 'blue', i: 'circle-info' } };
  App.pages.alerts = async function (view) {
    view.innerHTML = App.skeleton();
    const d = await App.api('alerts.list', { year: S.year }), f = memo.alert; let limit = 60;
    view.innerHTML = App.pageHead('ศูนย์แจ้งเตือน', 'ปีงบประมาณ ' + esc(S.year) + ' · สิ่งที่ควรติดตามวันนี้ คำนวณจากข้อมูลจริง: ค้างส่งสรุป กิจกรรมเลยกำหนด งวดเบิกค้าง ความเสี่ยง/ปัญหา และการประชุม', yearSelect()) +
      '<div class="xstats">' + stat('ด่วน', d.counts.high, 'ต้องดำเนินการ', d.counts.high ? 'c warn' : 'c') + stat('ควรติดตาม', d.counts.medium, 'รายการ', 'b') + stat('แจ้งให้ทราบ', d.counts.low, 'รายการ', 'a') + '</div>' +
      '<div class="xbar"><input type="search" id="al-q" placeholder="ค้นหา" value="' + esc(f.q) + '"><select id="al-sev"><option value="">ทุกระดับ</option>' + opts(Object.keys(SEV).map(k => ({ v: k, l: SEV[k].t })), f.sev) + '</select></div><div class="xcount" id="al-count"></div><div class="alist" id="al-list"></div><div style="text-align:center;margin:14px 0" id="al-more"></div>';
    const draw = () => {
      const q = f.q.trim().toLowerCase(), rows = d.items.filter(a => (!f.sev || a.sev === f.sev) && (!q || (a.title + ' ' + a.detail).toLowerCase().indexOf(q) >= 0));
      $id('al-count').textContent = 'แสดง ' + Math.min(rows.length, limit) + ' จาก ' + rows.length + ' รายการ' + (d.total > d.items.length ? ' (ระบบแสดงสูงสุด ' + d.items.length + ')' : '');
      $id('al-list').innerHTML = rows.length ? rows.slice(0, limit).map(a => { const s = SEV[a.sev];
        return '<div class="aitem ' + a.sev + '"><i class="fas fa-' + s.i + '"></i><div class="ab"><b>' + esc(a.title) + '</b><div class="muted small">' + esc(a.detail) + (a.date ? ' · ' + App.date(a.date) : '') + '</div></div><span class="badge ' + s.c + '">' + s.t + '</span>' +
          (a.planId ? '<a class="btn subtle" href="#/plan/' + esc(a.planId) + '">ดูแผน</a>' : a.type === 'fix' ? '<a class="btn subtle" href="#/fix">ไปที่รายการ</a>' : '') + '</div>'; }).join('') : '<div class="card empty">ไม่มีการแจ้งเตือน — ทุกอย่างเรียบร้อย <i class="fas fa-circle-check" style="color:#059669"></i></div>';
      $id('al-more').innerHTML = rows.length > limit ? '<button type="button" class="btn ghost" id="al-more-btn">แสดงเพิ่ม (' + (rows.length - limit) + ')</button>' : '';
      const mb = $id('al-more-btn'); if (mb) mb.addEventListener('click', () => { limit += 60; draw(); });
    };
    bind([['al-q', 'q', 'input'], ['al-sev', 'sev']], f, () => { limit = 60; draw(); }); draw();
  };

  // ===================================================================== ประวัติการทำรายการ
  App.pages.activity = async function (view) {
    view.innerHTML = App.skeleton();
    const rows0 = await App.api('history.recent', { limit: 400 }), f = memo.hist;
    view.innerHTML = App.pageHead('ประวัติการทำรายการ', 'การแก้ไขข้อมูลแผน กิจกรรม การเบิกจ่าย และรายการต่าง ๆ ล่าสุด ' + rows0.length + ' รายการ (ทุกปีงบประมาณ)', '') +
      '<div class="xbar"><input type="search" id="hs-q" placeholder="ค้นหาผู้ทำรายการ/แผน/ฟิลด์" value="' + esc(f.q) + '"></div><div class="xcount" id="hs-count"></div>' +
      '<section class="card table-card"><div class="table-wrap"><table class="table"><thead><tr><th>เวลา</th><th>ผู้ทำรายการ</th><th>แผน</th><th>รายการ</th><th>จาก</th><th>เป็น</th><th>เหตุผล</th></tr></thead><tbody id="hs-body"></tbody></table></div></section>';
    const draw = () => {
      const q = f.q.trim().toLowerCase(), rows = rows0.filter(r => !q || (r.who + ' ' + r.plan + ' ' + r.field + ' ' + r.newV + ' ' + r.reason).toLowerCase().indexOf(q) >= 0).slice(0, 200);
      $id('hs-count').textContent = 'แสดง ' + rows.length + ' รายการ';
      $id('hs-body').innerHTML = rows.map(r => '<tr><td class="nowrap">' + esc(App.dateTime(r.time)) + '</td><td>' + esc(r.who) + '</td><td>' + (r.planId ? planLink(r.planId, r.plan || r.planId) : '—') + '</td><td>' + esc(r.field) + '</td><td class="small">' + esc(String(r.oldV).substring(0, 80)) + '</td><td class="small">' + esc(String(r.newV).substring(0, 80)) + '</td><td class="small muted">' + esc(r.reason) + '</td></tr>').join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:22px">ไม่พบรายการ</td></tr>';
    };
    bind([['hs-q', 'q', 'input']], f, draw); draw();
  };

  // ===================================================================== คลังโครงการ
  App.pages.archive = async function (view) {
    view.innerHTML = App.skeleton();
    const d = await App.api('archive.list', {}), f = memo.arch;
    view.innerHTML = App.pageHead('คลังโครงการ', 'แผนที่ปิดแล้ว ส่งสรุปแล้ว หรือยกเลิก ของทุกปีงบประมาณ — ค้นย้อนหลังและเปิดไฟล์สรุป', '') +
      '<div class="xbar"><input type="search" id="ar-q" placeholder="ค้นหาแผน/ผู้รับผิดชอบ" value="' + esc(f.q) + '"><select id="ar-year"><option value="">ทุกปี</option>' + opts(d.years, f.year) + '</select><select id="ar-status"><option value="">ทุกสถานะ</option>' + opts(['ส่งสรุปแล้ว', 'ปิด', 'ยกเลิก'], f.status) + '</select></div>' +
      '<div class="xcount" id="ar-count"></div><section class="card table-card"><div class="table-wrap"><table class="table"><thead><tr><th>ปี</th><th>แผน</th><th>ผู้รับผิดชอบ</th><th>สถานะ</th><th class="num">งบที่ใช้จริง/เบิก</th><th>ส่งสรุป</th></tr></thead><tbody id="ar-body"></tbody></table></div></section><div style="text-align:center;margin:14px 0" id="ar-more"></div>';
    let limit = 100;
    const draw = () => {
      const q = f.q.trim().toLowerCase(), rows = d.plans.filter(p => (!f.year || p.year === f.year) && (!f.status || p.status === f.status) && (!q || (p.name + ' ' + p.owner).toLowerCase().indexOf(q) >= 0));
      $id('ar-count').textContent = 'แสดง ' + Math.min(rows.length, limit) + ' จาก ' + rows.length + ' แผน';
      $id('ar-body').innerHTML = rows.slice(0, limit).map(p => '<tr><td>' + esc(p.year) + '</td><td><span class="tag">' + esc(App.fundName(p.fund)) + '</span> ' + planLink(p.planId, p.name) + '</td><td>' + esc(p.owner || '—') + '</td><td>' + App.badge(p.status) + '</td><td class="num">' + App.money(p.paid, 0) + ' / ' + App.money(p.planned, 0) + '<div class="muted small">' + App.pct(p.pct) + '</div></td><td class="nowrap">' + (p.sentDate ? App.date(p.sentDate) : '—') + (p.summaryUrl ? ' <a href="' + esc(safe(p.summaryUrl)) + '" target="_blank" rel="noopener" title="เปิดไฟล์สรุป"><i class="fas fa-file-lines"></i></a>' : '') + '</td></tr>').join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:22px">ไม่พบแผนในคลัง</td></tr>';
      $id('ar-more').innerHTML = rows.length > limit ? '<button type="button" class="btn ghost" id="ar-more-btn">แสดงเพิ่ม (' + (rows.length - limit) + ')</button>' : '';
      const mb = $id('ar-more-btn'); if (mb) mb.addEventListener('click', () => { limit += 100; draw(); });
    };
    bind([['ar-q', 'q', 'input'], ['ar-year', 'year'], ['ar-status', 'status']], f, () => { limit = 100; draw(); }); draw();
  };

  // ===================================================================== รายงานผู้บริหาร (พิมพ์/บันทึกเป็น PDF ได้)
  App.pages.report = async function (view) {
    view.innerHTML = App.skeleton();
    const miss = [], soft = (a, p, dflt, label) => App.api(a, p).catch(() => { miss.push(label); return dflt; });
    const [b, pl, al, ms] = await Promise.all([App.api('budget.summary', { year: S.year, scope: memo.scope }), soft('plans.list', { year: S.year }, { plans: [] }, 'สถานะแผน'), soft('alerts.list', { year: S.year }, { items: [], counts: { high: 0 } }, 'ประเด็นเร่งด่วน'), soft('milestones.list', { year: S.year }, { items: [] }, 'หมุดหมาย')]);
    const t = b.totals, byStatus = {}; pl.plans.forEach(x => { byStatus[x.plan.Status] = (byStatus[x.plan.Status] || 0) + 1; });
    const od = pl.plans.filter(x => x.overdue.is), high = al.items.filter(a => a.sev === 'high').slice(0, 10);
    const soon = ms.items.filter(e => e.state === 'upcoming' && e.daysTo !== null && e.daysTo <= 30).slice(0, 10), late = ms.items.filter(e => e.state === 'overdue').slice(0, 10);
    const org = esc((window.APP_CONFIG || {}).ORG_NAME || 'โรงพยาบาลสันทราย');
    const sec = (h, body) => '<section class="card rpt-sec"><h2>' + h + '</h2>' + body + '</section>';
    view.innerHTML = App.pageHead('รายงานผู้บริหาร', 'สรุปผลการดำเนินงานแผนงาน/โครงการ ปีงบประมาณ ' + esc(S.year), yearSelect() + scopeSelect() + '<button class="btn primary" onclick="window.print()"><i class="fas fa-print"></i> พิมพ์ / บันทึก PDF</button>') +
      (miss.length ? '<div class="xnote warn" role="alert"><i class="fas fa-triangle-exclamation"></i> โหลดบางส่วนไม่สำเร็จ: ' + esc(miss.join(', ')) + ' — รีเฟรชหน้านี้เพื่อลองใหม่</div>' : '') + '<div class="rpt"><div class="rpt-head"><h2>' + org + '</h2><p>รายงานผู้บริหาร · แผนงานและยุทธศาสตร์ ปีงบประมาณ ' + esc(S.year) + ' · ข้อมูล ณ วันที่ ' + esc(App.date(App.today())) + '</p></div>' +
      '<div class="xstats xstats4">' + stat('แผนงานทั้งหมด', t.plans, Object.keys(byStatus).map(k => k + ' ' + byStatus[k]).join(' · ') || '—', 'a') + stat('งบที่ใช้จริง', baht(t.active), 'งบที่ปล่อยคืน ' + baht(t.released), 'b') + stat('เบิกจ่ายสุทธิ', baht(t.paid), 'ร้อยละ ' + App.pct(t.pct), 'c') + stat('ค้างส่งสรุป', od.length, 'แผน', od.length ? 'c warn' : 'c') + '</div>' +
      sec('งบประมาณและการเบิกจ่ายตามแหล่งเงิน', '<div class="table-wrap"><table class="table"><thead><tr><th>แหล่งเงิน</th><th class="num">แผน</th><th class="num">งบที่ใช้จริง</th><th class="num">เบิกจ่ายสุทธิ</th><th class="num">คงเหลือ</th><th class="num">ร้อยละ</th></tr></thead><tbody>' + b.funds.map(f => '<tr><td>' + esc(f.name) + '</td><td class="num">' + f.plans + '</td><td class="num">' + App.money(f.active) + '</td><td class="num">' + App.money(f.paid) + '</td><td class="num">' + App.money(f.remaining) + '</td><td class="num">' + App.pct(f.pct) + '</td></tr>').join('') + '</tbody></table></div>') +
      sec('ประเด็นเร่งด่วน (' + al.counts.high + ' รายการ)', high.length ? '<ul class="rpt-list">' + high.map(a => '<li><b>' + esc(a.title) + '</b> — ' + esc(a.detail) + '</li>').join('') + '</ul>' : '<p class="muted">ไม่มีประเด็นเร่งด่วน</p>') +
      sec('หมุดหมายที่เกินกำหนด', late.length ? '<ul class="rpt-list">' + late.map(e => '<li>' + esc(e.title) + ' — ' + esc(e.plan) + ' (กำหนด ' + App.date(e.date) + ', เกิน ' + Math.abs(e.daysTo) + ' วัน)</li>').join('') + '</ul>' : '<p class="muted">ไม่มี</p>') +
      sec('หมุดหมายใน 30 วันข้างหน้า', soon.length ? '<ul class="rpt-list">' + soon.map(e => '<li>' + esc(e.title) + ' — ' + esc(e.plan) + ' (' + App.date(e.date) + ', อีก ' + e.daysTo + ' วัน)</li>').join('') + '</ul>' : '<p class="muted">ไม่มี</p>') +
      (od.length ? sec('แผนที่ค้างส่งสรุปโครงการ', '<ul class="rpt-list">' + od.slice(0, 15).map(x => '<li>' + esc(x.plan.Name) + ' — ' + esc(x.plan.Owner || '') + ' · ' + esc(x.overdue.reason) + '</li>').join('') + '</ul>') : '') + '</div>';
    bindScope();
  };
})();
