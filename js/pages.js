/* หน้าหลัก: แดชบอร์ด, รายการแผนงาน, รายละเอียดแผน + ฟอร์มต่าง ๆ, ค้างส่งสรุป, คิวข้อมูลรอแก้ไข */
(function () {
  'use strict';
  const App = window.App, esc = App.esc, $ = App.$, $$ = App.$$;
  const S = App.state;
  const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '';

  App.charts = [];
  App.destroyCharts = () => { App.charts.forEach(c => { try { c.destroy(); } catch (e) { /* ignore */ } }); App.charts = []; };
  const mkChart = (id, cfg) => { if (typeof Chart !== 'undefined') { Chart.defaults.font.family = '"IBM Plex Sans Thai", Inter, sans-serif'; Chart.defaults.color = '#53627c'; Chart.defaults.borderColor = '#eceff7'; } const el = document.getElementById(id); if (!el || typeof Chart === 'undefined') return; App.charts.push(new Chart(el, cfg)); };

  const HEAD_ICON = { 'ภาพรวมแผนงาน/โครงการ': 'fa-chart-line', 'แผนงาน/โครงการ': 'fa-tasks', 'ค้างส่งสรุปโครงการ': 'fa-clock', 'งานของฉัน': 'fa-user-check', 'ข้อมูลรอแก้ไข': 'fa-screwdriver-wrench',
    'ผู้ใช้งาน': 'fa-users', 'ข้อมูลหลัก / ตั้งค่า': 'fa-gear', 'ประวัติการใช้งานระบบ': 'fa-shield-alt', 'รายงาน / ส่งออก': 'fa-print' };
  const pageHead = (title, sub, actions) => '<div class="page-head"><div><h1>' + (HEAD_ICON[title] ? '<i class="fas ' + HEAD_ICON[title] + '"></i>' : '') + '<span>' + esc(title) + '</span></h1>' + (sub ? '<p class="muted">' + sub + '</p>' : '') + '</div><div class="head-actions">' + (actions || '') + '</div></div>';
  const skeleton = () => '<div class="skeleton-wrap"><div class="skeleton sk-h"></div><div class="cards"><div class="skeleton sk-c"></div><div class="skeleton sk-c"></div><div class="skeleton sk-c"></div></div><div class="skeleton sk-b"></div></div>';
  const yearSelect = () => '<label class="inline-field"><span>ปีงบประมาณ</span><select data-change="year">' + App.years().map(y => '<option' + (String(y) === String(S.year) ? ' selected' : '') + '>' + y + '</option>').join('') + '</select></label>';
  App.skeleton = skeleton; App.pageHead = pageHead;

  document.addEventListener('change', e => {
    const el = e.target.closest('[data-change]'); if (!el) return;
    const k = el.getAttribute('data-change');
    if (k === 'year') { S.year = el.value; App.render(); }
    else if (k === 'scope') { S.scope = el.value; App.render(); }
    else if (k === 'stratLevel') { S.stratLevel = el.value; App.drawStrategy && App.drawStrategy(); }
    else if (App.changes && App.changes[k]) App.changes[k](el);
  });
  App.changes = App.changes || {};

  // ===================================================================== แดชบอร์ด
  App.pages.dashboard = async function (view) {
    view.innerHTML = skeleton();
    const d = await App.api('dashboard', { year: S.year, scope: S.scope || 'hospital' });
    const T = d.totals, C = d.completeness;
    const kpi = (label, val, sub, cls, ico) => '<div class="card kpi ' + (cls || '') + '"><div class="kpi-text"><span class="kpi-label">' + label + '</span><b class="kpi-val">' + val + '</b><span class="kpi-sub">' + (sub || '') + '</span></div><div class="icon-box"><i class="fas ' + (ico || 'fa-layer-group') + '"></i></div></div>';
    const alerts = [];
    if (d.overdue.count) alerts.push('<a class="alert warn" href="#/overdue"><b>' + d.overdue.count + '</b> แผนค้างส่งสรุปโครงการ <span>ดูรายการ →</span></a>');
    if (d.pendingUsers) alerts.push('<a class="alert info" href="#/admin/users"><b>' + d.pendingUsers + '</b> ผู้ใช้รออนุมัติ <span>อนุมัติ →</span></a>');
    if (C.fixOpen) alerts.push('<a class="alert gray" href="#/fix"><b>' + C.fixOpen + '</b> รายการข้อมูลรอแก้ไข <span>แก้ไข →</span></a>');
    if (C.actsNoDate) alerts.push('<div class="alert gray"><b>' + C.actsNoDate + '</b> กิจกรรม (งบ ' + App.money(C.actsNoDateBudget, 0) + ') ยังไม่ระบุวันที่ดำเนินการ — วางแผนกระแสเงินสดไม่ได้</div>');
    const hero = '<section class="hero"><div class="eyebrow"><i></i> YOUR PORTFOLIO, AT A GLANCE</div><h1>ทุกแผนงาน ชัดเจนในที่เดียว<span>.</span></h1><p>ปีงบประมาณ ' + esc(d.year) + ' · ' + (d.scope === 'hospital' ? 'เฉพาะงบของ รพ. (ไม่รวมเขตสุขภาพที่ 1)' : 'ทุกแหล่งเงิน') + ' · เบิกจ่ายแล้ว ' + App.pct(T.rate) + ' ของงบที่ใช้จริง</p><div class="hero-tools">' + yearSelect() + '<label class="inline-field"><span>ขอบเขต</span><select data-change="scope"><option value="hospital"' + (d.scope === 'hospital' ? ' selected' : '') + '>เฉพาะ รพ.</option><option value="all"' + (d.scope === 'all' ? ' selected' : '') + '>ทุกแหล่งเงิน</option></select></label></div></section>';
    view.innerHTML = hero +
      (alerts.length ? '<div class="alerts">' + alerts.join('') + '</div>' : '') +
      '<div class="cards kpis">' +
        kpi('งบตามแผน', App.money(T.plannedBudget, 0), T.plans + ' แผนงาน', '', 'fa-layer-group') +
        kpi('งบที่ใช้จริง', App.money(T.activeBudget, 0), 'ไม่นับกิจกรรมยกเลิก/ไม่เบิก', '', 'fa-wallet') +
        kpi('เบิกจ่ายสุทธิ', App.money(T.netPaid, 0), 'คงเหลือ ' + App.money(T.remaining, 0), 'accent', 'fa-money-bill-wave') +
        kpi('อัตราเบิกจ่าย', App.pct(T.rate) + App.progress(T.rate), d.settings.excludeCancelled ? 'ไม่นับงบกิจกรรมยกเลิก (รวม: ' + App.pct(T.rateGross) + ')' : 'นับงบทั้งหมด (ไม่รวมยกเลิก: ' + App.pct(T.rateNet) + ')', '', 'fa-chart-pie') +
        kpi('งบที่ปลดล็อกได้', App.money(T.released, 0), 'จากกิจกรรมยกเลิก/ไม่เบิก — พิจารณาโอนย้าย', 'warn', 'fa-unlock') +
      '</div>' +
      '<div class="grid2"><section class="card"><h2>กระแสเงินสดรายเดือน (ต.ค. → ก.ย.)</h2><div class="chart-box"><canvas id="ch-monthly"></canvas></div>' +
        '<p class="muted small">งบตามแผนนับตามวันเริ่มกิจกรรม · ยังไม่มีวันที่: ' + App.money(d.monthly.plannedNoDate, 0) + ' บาท · เบิกจ่ายยังไม่มีวันที่: ' + App.money(d.monthly.paidNoDate, 0) + ' บาท</p></section>' +
      '<section class="card"><h2>สถานะการเบิกจ่ายของแผน</h2><div class="chart-box sm"><canvas id="ch-exec"></canvas></div></section></div>' +
      '<div class="grid2"><section class="card"><h2>งบรายแหล่งเงิน</h2><div class="chart-box"><canvas id="ch-fund"></canvas></div></section>' +
      '<section class="card"><div class="card-head"><h2>ตามยุทธศาสตร์</h2><select data-change="stratLevel" class="compact"><option value="mission">พันธกิจ สสจ.</option><option value="prov">ยุทธศาสตร์ สสจ.</option><option value="moph">ยุทธศาสตร์กระทรวง</option><option value="hosp">ยุทธศาสตร์ รพ.</option></select></div><div class="chart-box"><canvas id="ch-strat"></canvas></div></section></div>' +
      '<div class="grid2"><section class="card"><h2>แผนงบสูงสุด</h2>' + (d.topPlans.length ? '<table class="table"><tbody>' + d.topPlans.map(p => '<tr><td><a href="#/plan/' + esc(p.planId) + '">' + esc(p.name) + '</a><div class="muted small">' + esc(p.owner) + ' · ' + esc(App.fundName(p.fund)) + '</div></td><td class="num">' + App.money(p.activeBudget, 0) + '<div class="muted small">' + App.pct(p.pct) + '</div></td></tr>').join('') + '</tbody></table>' : '<p class="muted">ไม่มีข้อมูล</p>') + '</section>' +
      '<section class="card"><div class="card-head"><h2>ค้างส่งสรุปโครงการ</h2><a href="#/overdue" class="link">ทั้งหมด (' + d.overdue.count + ')</a></div>' + (d.overdue.items.length ? '<table class="table"><tbody>' + d.overdue.items.map(p => '<tr><td><a href="#/plan/' + esc(p.planId) + '">' + esc(p.name) + '</a><div class="muted small">' + esc(p.owner) + ' — ' + esc(p.reason) + '</div></td><td class="num">' + (p.daysLate ? p.daysLate + ' วัน' : '') + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">ไม่มีรายการค้าง</p>') + '</section></div>' +
      '<section class="card"><h2>ความครบถ้วนของข้อมูล</h2><div class="completeness">' +
        '<div><b>' + C.plansNoStrategy + '/' + C.hospPlans + '</b><span>แผนที่ยังกรอกยุทธศาสตร์ไม่ครบ 4 ระดับ</span></div>' +
        '<div><b>' + C.plansNoType + '</b><span>แผนที่ยังไม่ระบุประเภท</span></div>' +
        '<div><b>' + C.actsNoDate + '</b><span>กิจกรรมมีงบแต่ไม่มีวันที่</span></div>' +
        '<div><b>' + C.disbNoEvidence + '</b><span>รายการเบิกที่ยังไม่แนบหลักฐาน</span></div></div></section>';

    mkChart('ch-monthly', { data: { labels: App.FY_MONTHS, datasets: [
      { type: 'bar', label: 'งบตามแผน', data: d.monthly.planned, backgroundColor: '#c4b5fd', order: 2 },
      { type: 'bar', label: 'เบิกจ่าย', data: d.monthly.paid, backgroundColor: '#4f46e5', order: 2 },
      { type: 'line', label: 'เบิกสะสม', data: d.monthly.cumulativePaid, borderColor: '#0891b2', backgroundColor: '#0891b2', yAxisID: 'y2', tension: .25, order: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { ticks: { callback: v => App.money(v, 0) } }, y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => App.money(v, 0) } } }, plugins: { legend: { position: 'bottom' } } } });
    const ex = d.execCount, exL = Object.keys(ex);
    mkChart('ch-exec', { type: 'doughnut', data: { labels: exL, datasets: [{ data: exL.map(k => ex[k]), backgroundColor: ['#059669', '#f59e0b', '#a5b4fc', '#e2e8f0'], borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
    mkChart('ch-fund', { type: 'bar', data: { labels: d.byFund.map(f => f.name), datasets: [{ label: 'งบที่ใช้จริง', data: d.byFund.map(f => f.activeBudget), backgroundColor: '#c4b5fd' }, { label: 'เบิกจ่าย', data: d.byFund.map(f => f.netPaid), backgroundColor: '#4f46e5' }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { callback: v => App.money(v, 0) } } }, plugins: { legend: { position: 'bottom' } } } });
    S.stratLevel = S.stratLevel || 'mission';
    App.drawStrategy = function () {
      const el = document.getElementById('ch-strat'); if (!el || typeof Chart === 'undefined') return;
      const old = App.charts.find(c => c.canvas === el); if (old) { old.destroy(); App.charts = App.charts.filter(c => c !== old); }
      const rows = d.strategy[S.stratLevel] || [];
      const sel = $('select[data-change="stratLevel"]'); if (sel) sel.value = S.stratLevel;
      mkChart('ch-strat', { type: 'bar', data: { labels: rows.map(r => (r.code ? r.code + ' ' : '') + String(r.name).slice(0, 26)), datasets: [{ label: 'งบที่ใช้จริง', data: rows.map(r => r.activeBudget), backgroundColor: '#c4b5fd' }, { label: 'เบิกจ่าย', data: rows.map(r => r.netPaid), backgroundColor: '#4f46e5' }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { callback: v => App.money(v, 0) } } }, plugins: { legend: { position: 'bottom' } } } });
    };
    App.drawStrategy();
  };

  // ===================================================================== รายการแผนงาน
  const PF = () => (S.pf = S.pf || { fund: '', status: '', exec: '', owner: '', q: '', onlyOverdue: false });
  App.pages.plans = async function (view) {
    view.innerHTML = skeleton();
    const data = await App.api('plans.list', { year: S.year });
    S.planList = data.plans; S.sel = new Set();
    const owners = Array.from(new Set(data.plans.map(p => p.plan.Owner).filter(Boolean))).sort();
    const f = PF();
    const opt = (list, cur) => list.map(o => { const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o; return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
    view.innerHTML = pageHead('แผนงาน/โครงการ', 'ปีงบประมาณ ' + esc(S.year) + ' · <span id="plan-count"></span>',
      yearSelect() + '<button class="btn ghost" data-act="exportCsv"><i class="fas fa-download"></i> CSV</button>' + (App.can() ? '<button class="btn primary" data-act="newPlan"><i class="fas fa-plus"></i> เพิ่มแผนงาน</button>' : '')) +
      '<div class="card filters"><input type="search" id="pf-q" placeholder="ค้นหาชื่อแผน/ผู้รับผิดชอบ" value="' + esc(f.q) + '">' +
      '<select id="pf-fund"><option value="">ทุกแหล่งเงิน</option>' + opt(App.activeOpts('funds', 'Code', 'Name'), f.fund) + '</select>' +
      '<select id="pf-status"><option value="">ทุกสถานะแผน</option>' + opt(App.masters().enums.planStatuses || [], f.status) + '</select>' +
      '<select id="pf-exec"><option value="">ทุกสถานะเบิกจ่าย</option>' + opt(['เบิกครบ', 'เบิกบางส่วน', 'ยังไม่เบิก', 'ไม่มีงบ'], f.exec) + '</select>' +
      '<select id="pf-owner"><option value="">ทุกผู้รับผิดชอบ</option>' + opt(owners, f.owner) + '</select>' +
      '<label class="check"><input type="checkbox" id="pf-od"' + (f.onlyOverdue ? ' checked' : '') + '> เฉพาะค้างส่งสรุป</label><button class="btn ghost sm" data-act="clearFilters">ล้างตัวกรอง</button></div>' +
      '<div id="bulk-bar" class="card bulk-bar" hidden></div><div class="card table-card"><div class="table-wrap"><table class="table plans"><thead><tr>' + (App.can() ? '<th class="chk"><input type="checkbox" id="sel-all" aria-label="เลือกทั้งหมด"></th>' : '') + '<th>#</th><th>แผนงาน / ผู้รับผิดชอบ</th><th class="num">งบที่ใช้จริง</th><th class="num">เบิกสุทธิ</th><th class="num">คงเหลือ</th><th>ความคืบหน้า</th><th>สถานะ</th></tr></thead><tbody id="plan-rows"></tbody><tfoot id="plan-foot"></tfoot></table></div></div>';
    const redraw = () => {
      const ff = PF(), q = ff.q.toLowerCase();
      const rows = S.planList.filter(x => (!ff.fund || x.plan.FundCode === ff.fund) && (!ff.status || x.plan.Status === ff.status) && (!ff.exec || x.calc.execState === ff.exec) &&
        (!ff.owner || x.plan.Owner === ff.owner) && (!ff.onlyOverdue || x.overdue.is) && (!q || (x.plan.Name + ' ' + x.plan.Owner + ' ' + x.plan.ProjectTitle).toLowerCase().indexOf(q) >= 0));
      S.planRows = rows;
      let a = 0, p = 0, r = 0;
      $('#plan-rows').innerHTML = rows.map(x => {
        a += x.calc.activeBudget; p += x.calc.netPaid; r += x.calc.remaining;
        const pl = x.plan;
        return '<tr class="click" data-href="#/plan/' + esc(pl.PlanId) + '">' + (App.can() ? '<td class="chk"><input type="checkbox" data-sel="' + esc(pl.PlanId) + '"' + (S.sel.has(pl.PlanId) ? ' checked' : '') + ' aria-label="เลือกแผน"></td>' : '') + '<td class="muted">' + esc(pl.Seq) + '</td><td><a href="#/plan/' + esc(pl.PlanId) + '" class="plan-link">' + esc(pl.Name) + '</a>' +
          '<div class="muted small"><span class="tag">' + esc(App.fundName(pl.FundCode)) + '</span> ' + esc(pl.Owner) + (x.calc.noDateCount ? ' · <span class="warn-text">' + x.calc.noDateCount + ' กิจกรรมไม่มีวันที่</span>' : '') + '</div></td>' +
          '<td class="num">' + App.money(x.calc.activeBudget, 0) + (x.calc.released ? '<div class="muted small">ปลดล็อก ' + App.money(x.calc.released, 0) + '</div>' : '') + '</td><td class="num">' + App.money(x.calc.netPaid, 0) + '</td><td class="num">' + App.money(x.calc.remaining, 0) + '</td>' +
          '<td class="prog-cell">' + App.progress(x.calc.pct) + '<small>' + App.pct(x.calc.pct) + '</small></td><td>' + App.badge(pl.Status) + ' ' + App.badge(x.calc.execState) + (x.overdue.is ? ' <span class="badge red" title="' + esc(x.overdue.reason) + '">ค้างสรุป</span>' : '') + '</td></tr>';
      }).join('') || '<tr><td colspan="8" class="empty">ไม่พบแผนงานตามเงื่อนไข</td></tr>';
      $('#plan-foot').innerHTML = rows.length ? '<tr><th colspan="' + (App.can() ? 3 : 2) + '">รวม ' + rows.length + ' แผน</th><th class="num">' + App.money(a, 0) + '</th><th class="num">' + App.money(p, 0) + '</th><th class="num">' + App.money(r, 0) + '</th><th colspan="2">' + (a > 0 ? App.pct(p / a * 100) : '') + '</th></tr>' : '';
      $('#plan-count').textContent = rows.length + ' จาก ' + S.planList.length + ' แผน';
      App.updateBulk();
    };
    App.redrawPlans = redraw;
    $('#pf-q').addEventListener('input', App.debounce(e => { PF().q = e.target.value; redraw(); }, 200));
    [['fund', '#pf-fund'], ['status', '#pf-status'], ['exec', '#pf-exec'], ['owner', '#pf-owner']].forEach(p => $(p[1]).addEventListener('change', e => { PF()[p[0]] = e.target.value; redraw(); }));
    $('#pf-od').addEventListener('change', e => { PF().onlyOverdue = e.target.checked; redraw(); });
    redraw();
  };
  document.addEventListener('click', e => { const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a,button,input,label')) location.hash = tr.getAttribute('data-href'); });
  App.actions.clearFilters = () => { S.pf = null; App.render(); };
  App.actions.exportCsv = () => {
    const rows = [['แหล่งเงิน', 'ลำดับ', 'ผู้รับผิดชอบ', 'แผนงาน', 'สถานะแผน', 'งบตามแผน', 'งบที่ใช้จริง', 'เบิกสุทธิ', 'คงเหลือ', 'ร้อยละ', 'ค้างส่งสรุป']];
    (S.planRows || []).forEach(x => rows.push([App.fundName(x.plan.FundCode), x.plan.Seq, x.plan.Owner, x.plan.Name, x.plan.Status, x.calc.plannedBudget, x.calc.activeBudget, x.calc.netPaid, x.calc.remaining, x.calc.pct, x.overdue.is ? 'ค้าง' : '']));
    const csv = '\ufeff' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'แผนงาน-' + S.year + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  };

  // ===================================================================== รายละเอียดแผน
  App.pages.plan = async function (view, id) {
    view.innerHTML = skeleton();
    const g = await App.api('plans.get', { planId: id });
    S.cur = g;
    const p = g.plan, c = g.calc, edit = g.canEdit && App.can();
    const strat = (label, table, code) => code ? '<div><span class="muted">' + label + '</span> ' + esc(code) + ' — ' + esc(App.lookup(table, code) || '') + '</div>' : '';
    const fund = App.fund(p.FundCode);
    const stratHtml = fund && fund.StrategySet === 'region' ? (p.StrategyRegion ? '<div><span class="muted">ยุทธศาสตร์ระดับเขต</span> ' + esc(p.StrategyRegion) + '</div>' : '') :
      strat('ยุทธศาสตร์กระทรวง', 'moph', p.StrategyMoph) + strat('พันธกิจ สสจ.', 'mission', p.StrategyMission) + strat('ยุทธศาสตร์ สสจ.', 'prov', p.StrategyProv) + strat('ยุทธศาสตร์ รพ.', 'hosp', p.StrategyHosp);
    const kp = (l, v, cls, ico) => '<div class="card kpi sm ' + (cls || '') + '"><div class="kpi-text"><span class="kpi-label">' + l + '</span><b class="kpi-val">' + v + '</b></div><div class="icon-box"><i class="fas ' + (ico || 'fa-coins') + '"></i></div></div>';
    view.innerHTML =
      '<a href="#/plans" class="back"><i class="fas fa-arrow-left"></i> กลับรายการแผนงาน</a>' +
      '<section class="card plan-head"><div class="ph-main"><div class="badges">' + '<span class="tag">' + esc(App.fundName(p.FundCode)) + '</span> ' + App.badge(p.Status) + ' ' + App.badge(c.execState) + (p.IsDeleted ? ' <span class="badge red">ถูกลบ</span>' : '') + '</div>' +
        '<h1>' + (p.Seq ? '<span class="muted">#' + esc(p.Seq) + '</span> ' : '') + esc(p.Name) + '</h1>' + (p.ProjectTitle ? '<p class="muted">โครงการ' + (p.ProjectNo ? ' ที่ ' + esc(p.ProjectNo) : '') + ': ' + esc(p.ProjectTitle) + '</p>' : '') +
        '<div class="meta"><div><span class="muted">ผู้รับผิดชอบ</span> ' + esc(p.Owner) + '</div><div><span class="muted">กลุ่มงาน</span> ' + esc(p.Department || '-') + '</div><div><span class="muted">ประเภทแผน</span> ' + esc(App.lookup('planTypes', p.PlanType) || '-') + '</div>' +
        (p.ReturnDate ? '<div><span class="muted">ส่งคืนแผนเมื่อ</span> ' + App.date(p.ReturnDate) + '</div>' : '') + '</div><div class="meta strat">' + stratHtml + '</div>' + (p.Note ? '<p class="note">📝 ' + esc(p.Note) + '</p>' : '') + '</div>' +
        '<div class="ph-actions">' + (edit ? '<button class="btn" data-act="editPlan"><i class="fas fa-pen"></i> แก้ไขแผน</button>' + '<button class="btn" data-act="summary">' + (p.SummarySent ? '✔ ส่งสรุปแล้ว ' + App.date(p.SummarySentDate) : '📄 ส่งสรุปโครงการ') + '</button>' : (p.SummarySent ? '<span class="badge green">ส่งสรุปแล้ว ' + App.date(p.SummarySentDate) + '</span>' : '')) +
        (p.SummaryFileUrl && safeUrl(p.SummaryFileUrl) ? '<a class="btn ghost" target="_blank" rel="noopener" href="' + esc(safeUrl(p.SummaryFileUrl)) + '">เปิดไฟล์สรุป</a>' : '') +
        '<button class="btn ghost" data-act="history"><i class="fas fa-clock-rotate-left"></i> ประวัติการแก้ไข</button>' + (edit ? '<button class="btn ghost" data-act="dupPlanOne">⧉ คัดลอกไปปีงบใหม่</button>' : '') +
        (App.isAdmin() ? (p.IsDeleted ? '<button class="btn" data-act="restorePlan">กู้คืน</button>' : '<button class="btn danger ghost" data-act="deletePlan"><i class="fas fa-trash"></i> ลบแผน</button>') : '') + '</div></section>' +
      (g.locked ? '<div class="alert warn"><b>🔒 แผนนี้อยู่ในสถานะ "ปิด"</b> ' + (App.isAdmin() ? 'แอดมินยังแก้ไขได้' : 'แก้ไขได้เฉพาะแอดมิน — ติดต่อแอดมินหากต้องการเปิดแก้ไข') + '</div>' : '') +
      (edit && g.reasonRequired ? '<div class="alert info">แผนนี้อนุมัติแล้ว — การแก้ไขงบ/สถานะ/ลบรายการ ต้องระบุเหตุผล และจะถูกบันทึกในประวัติการแก้ไข</div>' : '') +
      (g.overdue.is ? '<div class="alert warn"><b>ค้างส่งสรุปโครงการ</b> ' + esc(g.overdue.reason) + '</div>' : '') +
      (edit ? readyCard(g) : '') +
      '<div class="cards kpis">' + kp('งบตามแผน', App.money(c.plannedBudget, 0), '', 'fa-layer-group') + kp('งบที่ใช้จริง', App.money(c.activeBudget, 0), '', 'fa-wallet') + kp('เบิกจ่ายสุทธิ', App.money(c.netPaid, 0), 'accent', 'fa-money-bill-wave') + kp('คงเหลือ', App.money(c.remaining, 0), '', 'fa-piggy-bank') + kp('ปลดล็อกได้', App.money(c.released, 0), c.released ? 'warn' : '', 'fa-unlock') + kp('ร้อยละ', App.pct(c.pct) + App.progress(c.pct), '', 'fa-chart-pie') + '</div>' +
      '<div class="section-head"><h2>กิจกรรม (' + g.activities.length + ')</h2>' + (edit ? '<button class="btn primary" data-act="newAct"><i class="fas fa-plus"></i> เพิ่มกิจกรรม</button>' : '') + '</div>' +
      (g.activities.length ? g.activities.map(a => actCard(a, edit, g.activities.length <= 5)).join('') : '<div class="card empty">ยังไม่มีกิจกรรม' + (edit ? ' — กด "เพิ่มกิจกรรม" เพื่อเริ่มวางงบ' : '') + '</div>') +
      deletedPanel(g, edit) + planLevel(g, edit);
  };

  // ===================================================================== ตรวจความพร้อมของแผน (ฝั่งหน้าเว็บ)
  function readiness(g) {
    const p = g.plan, acts = g.activities || [], fund = App.fund(p.FundCode), out = [];
    const live = acts.filter(a => !(a.calc && a.calc.excluded));
    if (!acts.length) out.push(['bad', 'ยังไม่มีกิจกรรม', 'เพิ่มกิจกรรมอย่างน้อย 1 รายการ']);
    const nb = live.filter(a => a.act.Status === 'ปกติ' && !(a.calc.plannedBudget > 0));
    if (nb.length) out.push(['bad', nb.length + ' กิจกรรมสถานะ "ปกติ" แต่ไม่มีงบ', 'ใส่หมวดงบ หรือเปลี่ยนสถานะเป็น "ไม่ใช้งบประมาณ"']);
    const nd = live.filter(a => !a.act.PlanStart);
    if (nd.length) out.push(['warn', nd.length + ' กิจกรรมยังไม่มีวันที่', 'ระบบจะแจ้งเตือนใกล้กำหนดและแสดงในปฏิทินไม่ได้']);
    if (!p.Department) out.push(['warn', 'ยังไม่ระบุกลุ่มงาน', 'จำเป็นสำหรับรายงานรายกลุ่มงาน/ภารกิจ']);
    if (!p.PlanType) out.push(['warn', 'ยังไม่ระบุประเภทแผน', 'ใช้จัดกลุ่มรายงาน']);
    if (!(fund && fund.StrategySet === 'region')) {
      const miss = [['StrategyMoph', 'ยุทธศาสตร์กระทรวง'], ['StrategyMission', 'พันธกิจ สสจ.'], ['StrategyProv', 'ยุทธศาสตร์ สสจ.'], ['StrategyHosp', 'ยุทธศาสตร์ รพ.']].filter(x => !p[x[0]]).map(x => x[1]);
      if (miss.length) out.push(['warn', 'ยังไม่ระบุ: ' + miss.join(', '), 'ต้องครบทั้ง 4 ระดับตามแบบ สสจ.']);
    }
    const noPaidDate = (g.activities || []).reduce((n, a) => n + (a.disbs || []).filter(d => !d.PaidDate).length, 0);
    if (noPaidDate && p.Status !== 'ร่าง') out.push(['info', noPaidDate + ' งวดเบิกจ่ายยังไม่มีวันจ่ายจริง/หลักฐาน', 'ผู้รับผิดชอบควรยืนยันงวดและแนบหลักฐาน']);
    return out;
  }
  function readyCard(g) {
    const r = readiness(g), ico = { bad: 'fa-circle-xmark', warn: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    if (!r.length) return '<div class="card ready ok"><i class="fas fa-circle-check"></i><div><b>ข้อมูลแผนครบถ้วน</b><span class="muted small"> พร้อมใช้ออกรายงาน</span></div></div>';
    return '<details class="card ready" open><summary><b>ตรวจความพร้อมของแผน</b> <span class="badge ' + (r.some(x => x[0] === 'bad') ? 'red' : 'amber') + '">' + r.length + ' ประเด็น</span></summary><ul>' +
      r.map(x => '<li class="' + x[0] + '"><i class="fas ' + ico[x[0]] + '"></i><div><b>' + esc(x[1]) + '</b><span class="muted small">' + esc(x[2]) + '</span></div></li>').join('') + '</ul></details>';
  }
  function deletedPanel(g, edit) {
    const del = g.deletedActivities || [];
    if (!edit || !del.length) return '';
    return '<details class="card"><summary><b>กิจกรรมที่ถูกลบ (' + del.length + ')</b> <span class="muted small">— กู้คืนได้</span></summary><table class="table slim"><tbody>' +
      del.map(x => '<tr><td>' + esc(x.No) + '</td><td>' + esc(x.Name) + '</td><td class="act-cell"><button class="btn sm" data-act="restoreAct" data-id="' + esc(x.ActId) + '">↺ กู้คืน</button></td></tr>').join('') + '</tbody></table></details>';
  }

  function actCard(a, edit, open) {
    const ac = a.act, c = a.calc;
    const lines = a.lines.length ? '<table class="table slim"><thead><tr><th>หมวด</th><th>รายละเอียด</th><th class="num">จำนวน</th></tr></thead><tbody>' + a.lines.map(l => '<tr><td>' + esc(App.catName(l.CategoryCode)) + '</td><td class="muted">' + esc(l.Detail) + '</td><td class="num">' + App.money(l.Amount) + '</td></tr>').join('') + '<tr class="sum"><td colspan="2">รวมงบตามแผน</td><td class="num">' + App.money(c.budget) + '</td></tr></tbody></table>' : '<p class="muted small">ไม่มีรายการงบ</p>';
    const disb = '<div class="sub-head"><h4>การเบิกจ่ายรายครั้ง</h4>' + (edit ? '<button class="btn sm" data-act="newDisb" data-id="' + esc(ac.ActId) + '"><i class="fas fa-plus"></i> บันทึกเบิก</button>' : '') + '</div>' +
      (a.disbs.length ? '<div class="table-wrap"><table class="table slim"><thead><tr><th>ครั้งที่</th><th>ขออนุมัติ</th><th>ขอจ่าย</th><th>จ่ายจริง</th><th class="num">จำนวน</th><th>หลักฐาน</th><th></th></tr></thead><tbody>' + a.disbs.map(d =>
        '<tr><td>' + d.Seq + '</td><td>' + App.date(d.ApproveDate) + '</td><td>' + App.date(d.PayRequestDate) + '</td><td>' + App.date(d.PaidDate) + '</td><td class="num">' + App.money(d.Amount) + '</td><td>' +
        (safeUrl(d.EvidenceUrl) ? '<a target="_blank" rel="noopener" href="' + esc(safeUrl(d.EvidenceUrl)) + '">เปิดไฟล์</a>' : '<span class="muted">—</span>') + (d.Note ? '<div class="muted small">' + esc(d.Note) + '</div>' : '') + '</td><td class="act-cell">' +
        (edit ? '<button class="icon-btn" title="แก้ไข" data-act="editDisb" data-id="' + esc(d.DisbId) + '"><i class="fas fa-pen"></i></button><button class="icon-btn" title="ลบ" data-act="delDisb" data-id="' + esc(d.DisbId) + '"><i class="fas fa-trash"></i></button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted small">ยังไม่มีการเบิกจ่าย</p>');
    const adj = (a.adjs.length || edit) ? '<div class="sub-head"><h4>ปรับงบ / คืนเงิน</h4>' + (edit ? '<button class="btn sm ghost" data-act="newAdj" data-id="' + esc(ac.ActId) + '"><i class="fas fa-plus"></i> เพิ่ม</button>' : '') + '</div>' +
      (a.adjs.length ? '<table class="table slim"><tbody>' + a.adjs.map(j => '<tr><td>' + App.badge(j.Type, j.Type === 'ปรับเพิ่มงบ' ? 'green' : (j.Type === 'คืนเงิน' ? 'blue' : 'amber')) + '</td><td>' + App.date(j.Date) + '</td><td>' + esc(j.Reason) + '</td><td class="num">' + App.money(j.Amount) + '</td><td class="act-cell">' + (edit ? (j.TransferId ? '<span class="badge gray" title="รายการโอนย้ายงบ แก้ไขไม่ได้ — ลบแล้วโอนใหม่">โอนย้าย</span>' : '<button class="icon-btn" data-act="editAdj" data-id="' + esc(j.AdjId) + '"><i class="fas fa-pen"></i></button>') + '<button class="icon-btn" data-act="delAdj" data-id="' + esc(j.AdjId) + '" title="' + (j.TransferId ? 'ยกเลิกการโอนย้าย' : 'ลบ') + '"><i class="fas fa-trash"></i></button>' : '') + '</td></tr>').join('') + '</tbody></table>' : '') : '';
    return '<details class="card act' + (c.excluded ? ' excluded' : '') + '" id="act-' + esc(ac.ActId) + '"' + (open ? ' open' : '') + '><summary><div class="act-title"><b>' + esc(ac.No) + '</b> ' + esc(ac.Name) + ' ' + App.badge(ac.Status) +
      '<div class="muted small">' + (ac.PlanStart ? App.date(ac.PlanStart) + (ac.PlanEnd && ac.PlanEnd !== ac.PlanStart ? ' – ' + App.date(ac.PlanEnd) : '') : '<span class="warn-text">ยังไม่ระบุวันที่</span>') + (ac.Note ? ' · ' + esc(ac.Note) : '') + '</div></div>' +
      '<div class="act-nums"><span>งบ <b>' + App.money(c.plannedBudget, 0) + '</b></span><span>เบิก <b>' + App.money(c.netPaid, 0) + '</b></span><span>คงเหลือ <b>' + App.money(c.remaining, 0) + '</b></span></div></summary>' +
      '<div class="act-body">' + App.progress(c.pct) + lines + disb + adj + (edit ? '<div class="act-tools"><button class="btn sm" data-act="editAct" data-id="' + esc(ac.ActId) + '"><i class="fas fa-pen"></i> แก้ไขกิจกรรม/งบ</button><button class="btn sm" data-act="transferBudget" data-id="' + esc(ac.ActId) + '" title="โอนย้ายงบไปกิจกรรมอื่น">⇄ โอนย้ายงบ</button><button class="btn sm ghost" data-act="dupAct" data-id="' + esc(ac.ActId) + '">⧉ คัดลอก</button><button class="btn sm ghost" data-act="moveAct" data-id="' + esc(ac.ActId) + '">↪ ย้ายไปแผนอื่น</button><button class="btn sm ghost" data-act="actUp" data-id="' + esc(ac.ActId) + '" aria-label="เลื่อนขึ้น">▲</button><button class="btn sm ghost" data-act="actDown" data-id="' + esc(ac.ActId) + '" aria-label="เลื่อนลง">▼</button><button class="btn sm danger ghost" data-act="delAct" data-id="' + esc(ac.ActId) + '">ลบกิจกรรม</button></div>' : '') + '</div></details>';
  }
  function planLevel(g, edit) {
    const pd = g.planDisbs || [];
    let h = '';
    if (pd.length) h += '<section class="card"><h3>เบิกจ่ายระดับแผน (ไม่ผูกกับกิจกรรม)</h3><table class="table slim"><tbody>' + pd.map(d => '<tr><td>' + App.date(d.PayRequestDate || d.ApproveDate) + '</td><td>' + esc(d.Note) + '</td><td class="num">' + App.money(d.Amount) + '</td><td class="act-cell">' + (edit ? '<button class="icon-btn" data-act="editDisb" data-id="' + esc(d.DisbId) + '"><i class="fas fa-pen"></i></button><button class="icon-btn" data-act="delDisb" data-id="' + esc(d.DisbId) + '"><i class="fas fa-trash"></i></button>' : '') + '</td></tr>').join('') + '</tbody></table></section>';
    if (g.planAdjs.length || edit) h += '<section class="card"><div class="sub-head"><h3>ปรับงบ/คืนเงินระดับแผน</h3>' + (edit ? '<button class="btn sm ghost" data-act="newAdj" data-id=""><i class="fas fa-plus"></i> เพิ่ม</button>' : '') + '</div>' +
      (g.planAdjs.length ? '<table class="table slim"><tbody>' + g.planAdjs.map(j => '<tr><td>' + App.badge(j.Type, 'amber') + '</td><td>' + App.date(j.Date) + '</td><td>' + esc(j.Reason) + '</td><td class="num">' + App.money(j.Amount) + '</td><td class="act-cell">' + (edit ? '<button class="icon-btn" data-act="editAdj" data-id="' + esc(j.AdjId) + '"><i class="fas fa-pen"></i></button><button class="icon-btn" data-act="delAdj" data-id="' + esc(j.AdjId) + '"><i class="fas fa-trash"></i></button>' : '') + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted small">ไม่มี</p>') + '</section>';
    return h;
  }
  const findAct = id => (S.cur.activities.find(a => a.act.ActId === id) || {});
  const reload = () => App.render();

  // ---------------------------------------------------------------- ฟอร์มแผนงาน
  function planForm(plan) {
    const isNew = !plan; plan = plan || { Year: S.year, FundCode: '', Status: 'ร่าง' };
    const ppl = App.masters().data.people || [], depts = App.masters().data.departments || [];
    const missions = Array.from(new Set(depts.map(d => d.Mission)));
    const deptOpts = missions.map(m => '<optgroup label="' + esc(m) + '">' + depts.filter(d => d.Mission === m && d.Active !== false).map(d => '<option' + (d.Name === plan.Department ? ' selected' : '') + ' value="' + esc(d.Name) + '">' + esc(d.Name) + '</option>').join('') + '</optgroup>').join('');
    const html = '<datalist id="dl-people">' + ppl.filter(p => p.Active !== false).map(p => '<option value="' + esc(p.Name) + '">').join('') + '</datalist>' +
      '<div class="form-grid">' +
      App.field({ name: 'Year', label: 'ปีงบประมาณ', type: 'select', noBlank: true, options: App.years(), value: plan.Year, required: true }) +
      App.field({ name: 'FundCode', label: 'แหล่งเงิน', type: 'select', options: App.activeOpts('funds'), value: plan.FundCode, required: true }) +
      App.field({ name: 'Seq', label: 'ลำดับแผน', value: plan.Seq || '', hint: 'เว้นว่าง = ต่อจากเลขสูงสุดอัตโนมัติ' }) +
      App.field({ name: 'PlanType', label: 'ประเภทแผน', type: 'select', options: App.activeOpts('planTypes'), value: plan.PlanType }) +
      App.field({ name: 'Name', label: 'ชื่อแผนงาน', value: plan.Name || '', required: true, full: true }) +
      App.field({ name: 'ProjectNo', label: 'เลขที่โครงการ (ถ้ามี)', value: plan.ProjectNo || '' }) + App.field({ name: 'ProjectTitle', label: 'ชื่อโครงการ (ถ้ามี)', value: plan.ProjectTitle || '' }) +
      App.field({ name: 'Owner', label: 'ผู้รับผิดชอบ', value: plan.Owner || (isNew && S.user ? S.user.personName : ''), required: true, list: 'dl-people' }) +
      '<div class="field"><label for="f_Department">กลุ่มงาน</label><select id="f_Department" name="Department"><option value="">— เลือก —</option>' + deptOpts + '</select></div>' +
      '<div id="strat-hospital" class="full form-grid inner">' +
      App.field({ name: 'StrategyMoph', label: 'ยุทธศาสตร์กระทรวง สธ.', type: 'select', options: App.activeOpts('moph', 'Code', 'Name').map(o => ({ v: o.v, l: o.v + '. ' + o.l })), value: plan.StrategyMoph, full: true }) +
      App.field({ name: 'StrategyMission', label: 'พันธกิจ สสจ.เชียงใหม่', type: 'select', options: App.activeOpts('mission').map(o => ({ v: o.v, l: o.v + '. ' + o.l })), value: plan.StrategyMission, full: true }) +
      App.field({ name: 'StrategyProv', label: 'ยุทธศาสตร์ สสจ.เชียงใหม่', type: 'select', options: [], value: plan.StrategyProv, full: true, hint: 'แสดงเฉพาะข้อที่อยู่ภายใต้พันธกิจที่เลือก' }) +
      App.field({ name: 'StrategyHosp', label: 'ยุทธศาสตร์ รพ.สันทราย', type: 'select', options: App.activeOpts('hosp').map(o => ({ v: o.v, l: o.v + '. ' + o.l })), value: plan.StrategyHosp, full: true }) + '</div>' +
      '<div id="strat-region" class="full" hidden>' + App.field({ name: 'StrategyRegion', label: 'ยุทธศาสตร์ระดับเขต', value: plan.StrategyRegion || '', full: true }) + '</div>' +
      App.field({ name: 'Status', label: 'สถานะแผน', type: 'select', noBlank: true, options: App.masters().enums.planStatuses, value: plan.Status }) + App.field({ name: 'ReturnDate', label: 'วันที่ส่งคืนแผน (อนุมัติแล้ว)', type: 'date', value: plan.ReturnDate || '' }) +
      App.field({ name: 'Note', label: 'หมายเหตุ', type: 'textarea', value: plan.Note || '', full: true }) + '</div>';
    App.modal({ title: isNew ? 'เพิ่มแผนงาน' : 'แก้ไขแผนงาน', html: html, wide: true,
      onOpen: d => {
        const mis = d.querySelector('[name=StrategyMission]'), prov = d.querySelector('[name=StrategyProv]'), fund = d.querySelector('[name=FundCode]'), owner = d.querySelector('[name=Owner]'), dep = d.querySelector('[name=Department]');
        const fillProv = keep => {
          const list = (App.masters().data.prov || []).filter(p => p.Active !== false && (!mis.value || String(p.MissionCode) === mis.value));
          prov.innerHTML = '<option value="">— เลือก —</option>' + list.map(p => '<option value="' + esc(p.Code) + '"' + (p.Code === keep ? ' selected' : '') + '>' + esc(p.Code + ' ' + p.Name) + '</option>').join('');
        };
        fillProv(plan.StrategyProv);
        mis.addEventListener('change', () => fillProv(''));
        prov.addEventListener('change', () => { const pv = (App.masters().data.prov || []).find(p => p.Code === prov.value); if (pv) mis.value = String(pv.MissionCode); });
        const toggle = () => { const f = App.fund(fund.value), region = f && f.StrategySet === 'region'; d.querySelector('#strat-hospital').hidden = !!region; d.querySelector('#strat-region').hidden = !region; };
        fund.addEventListener('change', toggle); toggle();
        owner.addEventListener('change', () => { const pp = ppl.find(x => x.Name === owner.value); if (pp && pp.Department && !dep.value) dep.value = pp.Department; });
      },
      onSubmit: async d => {
        const v = App.values(d); if (!isNew) v.PlanId = plan.PlanId;
        const r = await App.apiReason('plans.save', { plan: v, expectedUpdatedAt: isNew ? undefined : plan.UpdatedAt });
        App.toast('บันทึกแผนงานแล้ว', 'success');
        if (isNew) location.hash = '#/plan/' + r.planId; else reload();
      } });
  }
  App.planForm = planForm;
  App.actions.newPlan = () => planForm(null);
  App.actions.editPlan = () => planForm(S.cur.plan);
  App.actions.deletePlan = async () => { if (await App.confirm('ลบแผน "' + S.cur.plan.Name + '" ? (กู้คืนได้โดยแอดมิน)', 'ลบแผน', true)) { await App.api('plans.delete', { planId: S.cur.plan.PlanId, reason: 'ลบโดยแอดมิน' }); App.toast('ลบแผนแล้ว', 'success'); location.hash = '#/plans'; } };
  App.actions.restorePlan = async () => { await App.api('plans.delete', { planId: S.cur.plan.PlanId, restore: true }); App.toast('กู้คืนแผนแล้ว', 'success'); reload(); };
  App.actions.summary = () => {
    const p = S.cur.plan;
    App.modal({ title: 'ส่งสรุปโครงการ', html: '<div class="form-grid">' + App.field({ name: 'sent', label: 'ส่งสรุปโครงการแล้ว', type: 'checkbox', value: p.SummarySent, full: true }) +
      App.field({ name: 'date', label: 'วันที่ส่งสรุป', type: 'date', value: p.SummarySentDate || App.today() }) + App.field({ name: 'fileUrl', label: 'ลิงก์ไฟล์สรุป (ถ้ามี)', value: p.SummaryFileUrl || '', placeholder: 'https://…' }) +
      '<div class="field full"><label>หรืออัปโหลดไฟล์</label><input type="file" id="sum-file"><small id="sum-file-msg"></small></div></div>',
      onOpen: d => d.querySelector('#sum-file').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; const m = d.querySelector('#sum-file-msg'); m.textContent = 'กำลังอัปโหลด…'; try { const r = await App.uploadFile(f); d.querySelector('[name=fileUrl]').value = r.url; m.textContent = '✔ อัปโหลดแล้ว'; } catch (er) { m.textContent = er.message; } }),
      onSubmit: async d => { const v = App.values(d); await App.api('plans.markSummary', { planId: p.PlanId, sent: v.sent, date: v.date, fileUrl: v.fileUrl }); App.toast('บันทึกแล้ว', 'success'); reload(); } });
  };

  // ---------------------------------------------------------------- ฟอร์มกิจกรรม + รายการงบ
  function actForm(planId, a) {
    const isNew = !a, ac = a ? a.act : { Status: 'ปกติ' }, lines = a ? a.lines : [];
    const cats = App.activeOpts('categories');
    const lineRow = l => '<div class="line-row"><select name="cat">' + '<option value="">— หมวด —</option>' + cats.map(o => '<option value="' + esc(o.v) + '"' + (o.v === l.CategoryCode ? ' selected' : '') + '>' + esc(o.l) + '</option>').join('') + '</select>' +
      '<input name="amt" type="number" min="0" step="0.01" inputmode="decimal" placeholder="จำนวนเงิน" value="' + (l.Amount || '') + '"><input name="det" placeholder="รายละเอียด (ถ้ามี)" value="' + esc(l.Detail || '') + '"><button type="button" class="icon-btn" data-rm aria-label="ลบรายการ">✕</button></div>';
    const html = '<div class="form-grid">' + App.field({ name: 'No', label: 'เลขที่กิจกรรม', value: ac.No || '', hint: 'เช่น 1.1 (เว้นว่าง = อัตโนมัติ)' }) + App.field({ name: 'Status', label: 'สถานะกิจกรรม', type: 'select', noBlank: true, options: App.masters().enums.actStatuses, value: ac.Status }) +
      App.field({ name: 'Name', label: 'ชื่อกิจกรรม', value: ac.Name || '', required: true, full: true }) + App.field({ name: 'PlanStart', label: 'วันที่เริ่ม', type: 'date', value: ac.PlanStart || '' }) + App.field({ name: 'PlanEnd', label: 'วันที่สิ้นสุด', type: 'date', value: ac.PlanEnd || '' }) +
      App.field({ name: 'Note', label: 'หมายเหตุ', value: ac.Note || '', full: true }) + '</div><h4 class="mt">รายการงบประมาณ</h4><div id="lines">' + (lines.length ? lines : [{}]).map(lineRow).join('') + '</div>' +
      '<div class="line-foot"><button type="button" class="btn sm ghost" id="add-line"><i class="fas fa-plus"></i> เพิ่มรายการ</button><b>รวม <span id="line-total">0.00</span> บาท</b></div><p class="muted small">สถานะ "ยกเลิก / ไม่เบิก / ไม่ใช้งบประมาณ" จะไม่นับงบกิจกรรมนี้เป็นงบที่ใช้จริง (ถือเป็นงบที่ปลดล็อกได้)</p>';
    App.modal({ title: isNew ? 'เพิ่มกิจกรรม' : 'แก้ไขกิจกรรม', html: html, wide: true,
      onOpen: d => {
        const box = d.querySelector('#lines'), tot = () => { let s = 0; $$('[name=amt]', box).forEach(i => { s += Number(i.value) || 0; }); d.querySelector('#line-total').textContent = App.money(s); };
        d.querySelector('#add-line').addEventListener('click', () => { box.insertAdjacentHTML('beforeend', lineRow({})); });
        box.addEventListener('click', e => { if (e.target.closest('[data-rm]')) { const r = e.target.closest('.line-row'); if (box.children.length > 1) r.remove(); else $$('input,select', r).forEach(x => { x.value = ''; }); tot(); } });
        box.addEventListener('input', tot); tot();
      },
      onSubmit: async d => {
        const v = App.values(d), ls = [];
        $$('.line-row', d).forEach(r => { const c = $('[name=cat]', r).value, am = Number($('[name=amt]', r).value) || 0; if (c || am) { if (!c) throw new Error('กรุณาเลือกหมวดของรายการงบทุกแถว'); ls.push({ CategoryCode: c, Amount: am, Detail: $('[name=det]', r).value }); } });
        const act = { PlanId: planId, No: v.No, Name: v.Name, Status: v.Status, PlanStart: v.PlanStart, PlanEnd: v.PlanEnd, Note: v.Note };
        if (!isNew) act.ActId = ac.ActId;
        const r = await App.apiReason('acts.save', { activity: act, lines: ls, expectedUpdatedAt: isNew ? undefined : ac.UpdatedAt });
        (r.warnings || []).forEach(w => App.toast(w, 'warn')); App.toast('บันทึกกิจกรรมแล้ว', 'success'); reload();
      } });
  }
  App.actions.newAct = () => actForm(S.cur.plan.PlanId, null);
  App.actions.editAct = el => actForm(S.cur.plan.PlanId, findAct(el.dataset.id));
  App.actions.delAct = async el => { const a = findAct(el.dataset.id); if (await App.confirm('ลบกิจกรรม "' + a.act.Name + '" ?', 'ลบ', true)) { await App.apiReason('acts.delete', { actId: a.act.ActId }); App.toast('ลบกิจกรรมแล้ว', 'success'); reload(); } };

  // ---------------------------------------------------------------- ฟอร์มเบิกจ่าย
  function disbForm(actId, d0) {
    const isNew = !d0, d = d0 || {};
    const html = '<div class="form-grid">' + App.field({ name: 'Amount', label: 'จำนวนเงินที่เบิก (บาท)', type: 'number', step: '0.01', value: d.Amount || '', required: true, attrs: ' min="0" inputmode="decimal"' }) + App.field({ name: 'ApproveDate', label: 'วันที่ขออนุมัติดำเนินการ', type: 'date', value: d.ApproveDate || '' }) +
      App.field({ name: 'PayRequestDate', label: 'วันที่ขออนุมัติจ่าย', type: 'date', value: d.PayRequestDate || '' }) + App.field({ name: 'PaidDate', label: 'วันที่จ่ายจริง', type: 'date', value: d.PaidDate || '' }) +
      App.field({ name: 'EvidenceUrl', label: 'ลิงก์หลักฐานการเบิกจ่าย', value: d.EvidenceUrl || '', placeholder: 'https://…', full: true }) +
      '<div class="field full"><label>หรืออัปโหลดไฟล์หลักฐาน (PDF/รูป/Word/Excel ≤ 10MB)</label><input type="file" id="ev-file"><small id="ev-msg"></small></div>' + App.field({ name: 'Note', label: 'หมายเหตุ', value: d.Note || '', full: true }) + '</div>';
    App.modal({ title: isNew ? 'บันทึกการเบิกจ่าย' : 'แก้ไขการเบิกจ่าย (ครั้งที่ ' + d.Seq + ')', html: html,
      onOpen: dlg => dlg.querySelector('#ev-file').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; const m = dlg.querySelector('#ev-msg'); m.textContent = 'กำลังอัปโหลด…'; try { const r = await App.uploadFile(f); dlg.querySelector('[name=EvidenceUrl]').value = r.url; m.textContent = '✔ อัปโหลดแล้ว: ' + r.name; } catch (er) { m.textContent = er.message; } }),
      onSubmit: async dlg => {
        const v = App.values(dlg), x = { Amount: v.Amount, ApproveDate: v.ApproveDate, PayRequestDate: v.PayRequestDate, PaidDate: v.PaidDate, EvidenceUrl: v.EvidenceUrl, Note: v.Note };
        if (isNew) { x.ActId = actId; x.PlanId = S.cur.plan.PlanId; } else x.DisbId = d.DisbId;
        const r = await App.apiReason('disb.save', { disb: x, expectedUpdatedAt: isNew ? undefined : d.UpdatedAt }); (r.warnings || []).forEach(w => App.toast(w, 'warn')); App.toast('บันทึกเบิกจ่ายแล้ว', 'success'); reload();
      } });
  }
  const findDisb = id => { for (const a of S.cur.activities) { const d = a.disbs.find(x => x.DisbId === id); if (d) return d; } return (S.cur.planDisbs || []).find(x => x.DisbId === id); };
  App.actions.newDisb = el => disbForm(el.dataset.id, null);
  App.actions.editDisb = el => { const d = findDisb(el.dataset.id); disbForm(d.ActId, d); };
  App.actions.delDisb = async el => { if (await App.confirm('ลบรายการเบิกจ่ายนี้ ?', 'ลบ', true)) { await App.apiReason('disb.delete', { disbId: el.dataset.id }); App.toast('ลบแล้ว', 'success'); reload(); } };

  // ---------------------------------------------------------------- ฟอร์มปรับงบ/คืนเงิน
  function adjForm(actId, j0) {
    const isNew = !j0, j = j0 || { Type: 'คืนเงิน', Date: App.today(), ActId: actId };
    const html = '<div class="form-grid">' + App.field({ name: 'Type', label: 'ประเภท', type: 'select', noBlank: true, options: App.masters().enums.adjTypes, value: j.Type }) + App.field({ name: 'Amount', label: 'จำนวนเงิน (บาท)', type: 'number', step: '0.01', value: j.Amount || '', required: true, attrs: ' min="0"' }) +
      App.field({ name: 'ActId', label: 'กิจกรรม', type: 'select', blank: '(ระดับแผน)', options: S.cur.activities.map(a => ({ v: a.act.ActId, l: a.act.No + ' ' + a.act.Name })), value: j.ActId || actId || '' }) + App.field({ name: 'Date', label: 'วันที่', type: 'date', value: j.Date || App.today() }) +
      App.field({ name: 'Reason', label: 'เหตุผล', type: 'textarea', value: j.Reason || '', required: true, full: true }) + '</div><p class="muted small"><b>คืนเงิน</b> ลดยอดเบิกสุทธิ · <b>ปรับลดงบ</b> ลดงบตามแผน · <b>ปรับเพิ่มงบ</b> เพิ่มงบตามแผน</p>';
    App.modal({ title: isNew ? 'บันทึกปรับงบ / คืนเงิน' : 'แก้ไขรายการ', html: html, onSubmit: async d => {
      const v = App.values(d), x = { Type: v.Type, Amount: v.Amount, ActId: v.ActId, Date: v.Date, Reason: v.Reason };
      if (isNew) x.PlanId = S.cur.plan.PlanId; else x.AdjId = j.AdjId;
      await App.api('adj.save', { adj: x }); App.toast('บันทึกแล้ว', 'success'); reload(); } });
  }
  const findAdj = id => { for (const a of S.cur.activities) { const j = a.adjs.find(x => x.AdjId === id); if (j) return j; } return S.cur.planAdjs.find(x => x.AdjId === id); };
  App.actions.newAdj = el => adjForm(el.dataset.id, null);
  App.actions.editAdj = el => adjForm('', findAdj(el.dataset.id));
  App.actions.delAdj = async el => { if (await App.confirm(((findAdj(el.dataset.id) || {}).TransferId) ? 'ยกเลิกการโอนย้ายงบนี้ ? (ระบบจะลบรายการทั้งฝั่งต้นทางและปลายทางพร้อมกัน)' : 'ลบรายการนี้ ?', 'ลบ', true)) { await App.apiReason('adj.delete', { adjId: el.dataset.id }); App.toast('ลบแล้ว', 'success'); reload(); } };

  // ===================================================================== ค้างส่งสรุป

  // ===================================================================== งานของฉัน
  App.pages.mywork = async function (view) {
    view.innerHTML = skeleton();
    const d = await App.api('mywork', { year: S.year });
    if (!d.linked) {
      view.innerHTML = pageHead('งานของฉัน', 'ปีงบประมาณ ' + esc(S.year), yearSelect()) +
        '<div class="card empty"><i class="fas fa-link-slash" style="font-size:28px;opacity:.5"></i><p><b>บัญชีนี้ยังไม่ผูกกับผู้รับผิดชอบ</b></p><p class="muted">' + esc(d.message) + '</p></div>';
      return;
    }
    const t = d.totals;
    const kp = (l, v, cls, ico) => '<div class="card kpi sm ' + (cls || '') + '"><div class="kpi-text"><span class="kpi-label">' + l + '</span><b class="kpi-val">' + v + '</b></div><div class="icon-box"><i class="fas ' + ico + '"></i></div></div>';
    const when = x => x.pastUnpaid ? '<span class="badge red">เลยกำหนด ' + x.lateDays + ' วัน</span>' : x.ongoing ? '<span class="badge green">กำลังดำเนินการ</span>' : '<span class="badge amber">อีก ' + x.inDays + ' วัน</span>';
    const actRow = x => '<tr><td><a href="#/plan/' + esc(x.planId) + '">' + esc(x.plan) + '</a><div class="muted small">' + esc(x.name) + '</div></td><td class="nowrap">' + App.date(x.start) + (x.end && x.end !== x.start ? ' – ' + App.date(x.end) : '') + '</td><td class="num">' + App.money(x.budget, 0) + '</td><td>' + when(x) + (x.unpaid && !x.pastUnpaid ? ' <span class="badge">ยังไม่เบิก</span>' : '') + '</td></tr>';
    const tbl = (head, rows, empty) => '<div class="card table-card"><div class="table-wrap"><table class="table slim"><thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + (rows.length ? rows.join('') : '<tr><td colspan="' + head.length + '" class="empty">' + empty + '</td></tr>') + '</tbody></table></div></div>';
    const todo = [];
    d.overdue.forEach(o => todo.push('<tr><td><a href="#/plan/' + esc(o.planId) + '">' + esc(o.name) + '</a></td><td>' + esc(o.reason) + (o.daysLate ? ' <span class="badge red">' + o.daysLate + ' วัน</span>' : '') + '</td></tr>'));
    view.innerHTML = pageHead('งานของฉัน', 'ผู้รับผิดชอบ: <b>' + esc(d.owner) + '</b> · ปีงบประมาณ ' + esc(d.year), yearSelect()) +
      '<div class="cards kpis">' + kp('แผนที่รับผิดชอบ', t.plans, '', 'fa-tasks') + kp('งบที่ใช้จริง', App.money(t.active, 0), '', 'fa-wallet') + kp('เบิกจ่ายสุทธิ', App.money(t.paid, 0), 'accent', 'fa-money-bill-wave') +
      kp('ร้อยละเบิกจ่าย', App.pct(t.pct) + App.progress(t.pct), '', 'fa-chart-pie') + kp('ค้างส่งสรุป', d.overdue.length, d.overdue.length ? 'warn' : '', 'fa-clock') + kp('รอแก้ไข', d.fixCount, d.fixCount ? 'warn' : '', 'fa-screwdriver-wrench') + '</div>' +
      '<div class="section-head"><h2>กิจกรรมที่ต้องติดตาม (30 วันข้างหน้า / เลยกำหนดยังไม่เบิก)</h2></div>' +
      tbl(['แผน / กิจกรรม', 'ช่วงเวลา', 'งบ (บาท)', 'สถานะ'], d.upcoming.map(actRow), 'ไม่มีกิจกรรมที่ต้องติดตามในช่วงนี้ 🎉') +
      (todo.length ? '<div class="section-head"><h2>ค้างส่งสรุปโครงการ</h2></div>' + tbl(['แผน', 'เหตุผล'], todo, '') : '') +
      (d.noDate.length ? '<details class="card"><summary><b>กิจกรรมที่ยังไม่มีวันที่ (' + d.noDate.length + ')</b> <span class="muted small">— เติมวันที่เพื่อให้ระบบเตือนได้</span></summary><table class="table slim"><tbody>' + d.noDate.map(x => '<tr><td><a href="#/plan/' + esc(x.planId) + '">' + esc(x.plan) + '</a></td><td class="muted">' + esc(x.name) + '</td></tr>').join('') + '</tbody></table></details>' : '') +
      (d.noBudget.length ? '<details class="card"><summary><b>กิจกรรมสถานะปกติแต่ไม่มีงบ (' + d.noBudget.length + ')</b></summary><table class="table slim"><tbody>' + d.noBudget.map(x => '<tr><td><a href="#/plan/' + esc(x.planId) + '">' + esc(x.plan) + '</a></td><td class="muted">' + esc(x.name) + '</td></tr>').join('') + '</tbody></table></details>' : '') +
      '<div class="section-head"><h2>แผนของฉัน (' + d.plans.length + ')</h2></div>' +
      tbl(['แผนงาน', 'แหล่งเงิน', 'งบที่ใช้จริง', 'เบิกสุทธิ', 'ความคืบหน้า', 'สถานะ'], d.plans.map(x => '<tr><td><a href="#/plan/' + esc(x.plan.PlanId) + '">' + esc(x.plan.Name) + '</a></td><td><span class="tag">' + esc(App.fundName(x.plan.FundCode)) + '</span></td><td class="num">' + App.money(x.calc.activeBudget, 0) + '</td><td class="num">' + App.money(x.calc.netPaid, 0) + '</td><td>' + App.pct(x.calc.pct) + App.progress(x.calc.pct) + '</td><td>' + App.badge(x.plan.Status) + '</td></tr>'), 'ยังไม่มีแผนงานในปีนี้');
  };
  App.pages.overdue = async function (view) {
    view.innerHTML = skeleton();
    const list = await App.api('overdue.list', { year: S.year });
    S.overdue = list;
    view.innerHTML = pageHead('ค้างส่งสรุปโครงการ', 'ระบบตรวจให้อัตโนมัติ: เบิกครบแล้ว / กิจกรรมสุดท้ายเกินกำหนด / สิ้นปีงบประมาณแล้ว ยังไม่ส่งสรุป', yearSelect()) +
      '<div class="card table-card"><div class="table-wrap"><table class="table"><thead><tr><th>แหล่งเงิน</th><th>แผนงาน</th><th>ผู้รับผิดชอบ</th><th class="num">เบิกสุทธิ</th><th>เหตุผล</th><th></th></tr></thead><tbody>' +
      (list.length ? list.map(x => '<tr><td><span class="tag">' + esc(App.fundName(x.fund)) + '</span></td><td><a href="#/plan/' + esc(x.planId) + '">' + esc(x.name) + '</a></td><td>' + esc(x.owner) + '</td><td class="num">' + App.money(x.netPaid, 0) + '</td><td>' + esc(x.reason) + (x.daysLate ? ' <span class="badge red">' + x.daysLate + ' วัน</span>' : '') + '</td><td>' + (App.can() ? '<button class="btn sm" data-act="quickSummary" data-id="' + esc(x.planId) + '">ส่งสรุปแล้ว</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="6" class="empty">ไม่มีรายการค้างส่งสรุป 🎉</td></tr>') + '</tbody></table></div></div>';
  };
  App.actions.quickSummary = async el => { if (await App.confirm('ทำเครื่องหมายว่าส่งสรุปโครงการแล้ว (วันนี้) ?', 'ยืนยัน')) { await App.api('plans.markSummary', { planId: el.dataset.id, sent: true }); App.toast('บันทึกแล้ว', 'success'); App.render(); } };

  // ===================================================================== คิวข้อมูลรอแก้ไข
  App.pages.fix = async function (view) {
    view.innerHTML = skeleton();
    const list = await App.api('fix.list', { resolved: !!S.fixAll });
    view.innerHTML = pageHead('ข้อมูลรอแก้ไข', 'รายการที่ระบบอ่านจากชีทเดิมไม่ได้/ไม่แน่ใจ จึงไม่เดาให้ — กรุณาตรวจและแก้ที่แผน/กิจกรรมนั้น แล้วกด "แก้แล้ว"', '<label class="check"><input type="checkbox" id="fix-all"' + (S.fixAll ? ' checked' : '') + '> แสดงที่แก้แล้ว</label>') +
      '<div class="card table-card"><div class="table-wrap"><table class="table"><thead><tr><th>ปัญหา</th><th>ตำแหน่งในชีทเดิม</th><th>รายละเอียด</th><th></th></tr></thead><tbody>' +
      (list.length ? list.map(x => '<tr class="' + (x.Resolved ? 'done' : '') + '"><td>' + App.badge(x.Issue, x.Resolved ? 'green' : 'amber') + '</td><td class="muted">' + esc(x.Ref) + '</td><td>' + esc(x.Detail) + '</td><td>' + (App.can() ? '<button class="btn sm ' + (x.Resolved ? 'ghost' : '') + '" data-act="fixToggle" data-id="' + esc(x.FixId) + '" data-r="' + (x.Resolved ? '0' : '1') + '">' + (x.Resolved ? 'เปิดอีกครั้ง' : 'แก้แล้ว ✓') + '</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="4" class="empty">ไม่มีรายการรอแก้ไข 🎉</td></tr>') + '</tbody></table></div></div>';
    $('#fix-all').addEventListener('change', e => { S.fixAll = e.target.checked; App.render(); });
  };
  App.actions.fixToggle = async el => { await App.api('fix.resolve', { fixId: el.dataset.id, resolved: el.dataset.r === '1' }); App.render(); };

  // ===================================================================== เครื่องมือแก้ไขเพิ่มเติม (v2.1)
  const sameYearPlans = async () => { const d = await App.api('plans.list', { year: S.cur.plan.Year }); return d.plans.map(x => x.plan).filter(p => !p.IsDeleted); };
  const planOpt = p => ({ v: p.PlanId, l: '#' + p.Seq + ' ' + App.fundName(p.FundCode) + ' — ' + p.Name });
  const reloadKeep = async (actId) => { const y = window.scrollY; await App.render(); window.scrollTo(0, y); const d = actId && document.getElementById('act-' + actId); if (d) d.open = true; };

  // ---- ประวัติการแก้ไข
  App.actions.history = async () => {
    const rows = await App.api('history.list', { planId: S.cur.plan.PlanId });
    const html = rows.length ? '<div class="table-wrap"><table class="table slim"><thead><tr><th>เวลา</th><th>ผู้แก้ไข</th><th>รายการ</th><th>เดิม</th><th>ใหม่</th><th>เหตุผล</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td class="nowrap">' + esc(App.dateTime(r.Time)) + '</td><td class="small">' + esc(r.Email) + '</td><td>' + esc(r.Field) + '</td><td class="muted">' + esc(r.Old) + '</td><td>' + esc(r.New) + '</td><td class="small">' + esc(r.Reason) + '</td></tr>').join('') + '</tbody></table></div>' :
      '<p class="muted">ยังไม่มีประวัติการแก้ไขของแผนนี้ (ระบบเริ่มบันทึกตั้งแต่เปิดใช้ฟีเจอร์นี้)</p>';
    App.modal({ title: 'ประวัติการแก้ไข (ล่าสุด ' + rows.length + ' รายการ)', html: html, wide: true, hideSubmit: true });
  };

  // ---- กิจกรรม: กู้คืน / จัดลำดับ / ย้าย / คัดลอก
  App.actions.restoreAct = async el => { await App.api('acts.restore', { actId: el.dataset.id }); App.toast('กู้คืนกิจกรรมแล้ว', 'success'); reload(); };
  const reorder = dir => async el => {
    const r = await App.api('acts.reorder', { actId: el.dataset.id, direction: dir });
    if (!r.moved) { App.toast('ขยับไม่ได้อีกแล้ว', 'info'); return; }
    await reloadKeep(el.dataset.id);
  };
  App.actions.actUp = reorder('up'); App.actions.actDown = reorder('down');
  App.actions.moveAct = async el => {
    const a = findAct(el.dataset.id), plans = (await sameYearPlans()).filter(p => p.PlanId !== S.cur.plan.PlanId);
    if (!plans.length) { App.toast('ไม่มีแผนอื่นในปีงบประมาณเดียวกัน', 'warn'); return; }
    App.modal({ title: 'ย้ายกิจกรรมไปแผนอื่น', submitLabel: 'ย้าย',
      html: '<p>กิจกรรม <b>' + esc(a.act.Name) + '</b> จะถูกย้ายพร้อมรายการงบ การเบิกจ่าย และการปรับงบทั้งหมด</p>' + App.field({ name: 'toPlanId', label: 'แผนปลายทาง (ปีงบประมาณ ' + esc(S.cur.plan.Year) + ')', type: 'select', noBlank: true, options: plans.map(planOpt), required: true }),
      onSubmit: async d => { await App.apiReason('acts.move', { actId: a.act.ActId, toPlanId: App.values(d).toPlanId }); App.toast('ย้ายกิจกรรมแล้ว', 'success'); reload(); } });
  };
  App.actions.dupAct = async el => {
    const a = findAct(el.dataset.id), plans = await sameYearPlans();
    App.modal({ title: 'คัดลอกกิจกรรม', submitLabel: 'คัดลอก',
      html: '<p>คัดลอก <b>' + esc(a.act.Name) + '</b> พร้อมรายการงบ (ไม่คัดลอกการเบิกจ่ายและการปรับงบ)</p>' + App.field({ name: 'toPlanId', label: 'คัดลอกไปยังแผน', type: 'select', noBlank: true, options: plans.map(planOpt), value: S.cur.plan.PlanId }),
      onSubmit: async d => { await App.apiReason('acts.duplicate', { actId: a.act.ActId, toPlanId: App.values(d).toPlanId }); App.toast('คัดลอกกิจกรรมแล้ว', 'success'); reload(); } });
  };

  // ---- โอนย้ายงบระหว่างกิจกรรม
  App.actions.transferBudget = async el => {
    const a = findAct(el.dataset.id), avail = Math.max(0, a.calc.plannedBudget - a.calc.netPaid), plans = await sameYearPlans(), cache = {};
    cache[S.cur.plan.PlanId] = S.cur.activities;
    if (avail <= 0) { App.toast('กิจกรรมนี้ไม่มีงบคงเหลือให้โอนย้าย', 'warn'); return; }
    const excluded = App.masters().enums.actExcluded || [];
    const actOpts = list => list.filter(x => x.act.ActId !== a.act.ActId && excluded.indexOf(x.act.Status) < 0).map(x => '<option value="' + esc(x.act.ActId) + '">' + esc(x.act.No + ' ' + x.act.Name + ' (คงเหลือ ' + App.money(x.calc.remaining, 0) + ')') + '</option>').join('');
    App.modal({ title: 'โอนย้ายงบระหว่างกิจกรรม', submitLabel: 'โอนย้ายงบ', wide: true,
      html: '<div class="alert info">ต้นทาง: <b>' + esc(a.act.No + ' ' + a.act.Name) + '</b> — โอนได้ไม่เกิน <b>' + App.money(avail) + '</b> บาท (งบตามแผน − เบิกสุทธิ)</div><div class="form-grid">' +
        App.field({ name: 'toPlan', label: 'แผนปลายทาง (ปีงบประมาณเดียวกัน)', type: 'select', noBlank: true, options: plans.map(planOpt), value: S.cur.plan.PlanId, full: true }) +
        '<div class="field full"><label for="f_toActId">กิจกรรมปลายทาง <span class="req">*</span></label><select id="f_toActId" name="toActId"></select></div>' +
        App.field({ name: 'amount', label: 'จำนวนเงินที่โอน (บาท)', type: 'number', step: '0.01', required: true, attrs: ' min="0.01" max="' + avail + '" inputmode="decimal"' }) + App.field({ name: 'date', label: 'วันที่', type: 'date', value: App.today() }) +
        App.field({ name: 'reason', label: 'เหตุผลการโอนย้าย', type: 'textarea', required: true, full: true }) + '</div>' +
        '<p class="muted small">ระบบจะบันทึกเป็น "ปรับลดงบ" ที่ต้นทาง และ "ปรับเพิ่มงบ" ที่ปลายทาง เชื่อมกันเป็นรายการเดียว (ยกเลิกได้ทั้งคู่พร้อมกัน) และลงประวัติการแก้ไขของทั้งสองแผน</p>',
      onOpen: d => {
        const sp = d.querySelector('[name=toPlan]'), sa = d.querySelector('[name=toActId]');
        const fill = async () => {
          sa.innerHTML = '<option value="">กำลังโหลด…</option>';
          try { if (!cache[sp.value]) cache[sp.value] = (await App.api('plans.get', { planId: sp.value })).activities; } catch (e) { sa.innerHTML = '<option value="">โหลดไม่สำเร็จ</option>'; return; }
          sa.innerHTML = '<option value="">— เลือกกิจกรรมปลายทาง —</option>' + actOpts(cache[sp.value]);
        };
        sp.addEventListener('change', fill); fill();
      },
      onSubmit: async d => {
        const v = App.values(d);
        if (!v.toActId) throw new Error('กรุณาเลือกกิจกรรมปลายทาง');
        if (!(Number(v.amount) > 0)) throw new Error('กรุณาระบุจำนวนเงินที่โอน');
        await App.api('budget.transfer', { fromActId: a.act.ActId, toActId: v.toActId, amount: v.amount, date: v.date, reason: v.reason });
        App.toast('โอนย้ายงบแล้ว', 'success'); reload();
      } });
  };

  // ---- แก้ไขหลายแผน / คัดลอกไปปีงบใหม่ (หน้ารายการแผน)
  App.updateBulk = () => {
    const bar = $('#bulk-bar'); if (!bar) return;
    const n = S.sel ? S.sel.size : 0;
    bar.hidden = n === 0;
    bar.innerHTML = '<b>เลือก ' + n + ' แผน</b><button class="btn sm" data-act="bulkEdit"><i class="fas fa-pen"></i> แก้ไขพร้อมกัน</button><button class="btn sm" data-act="bulkDup">⧉ คัดลอก/ยกไปปีงบใหม่</button><button class="btn sm ghost" data-act="bulkClear">ล้างที่เลือก</button>';
    const all = $('#sel-all'); if (all) { const rows = S.planRows || []; all.checked = rows.length > 0 && rows.every(x => S.sel.has(x.plan.PlanId)); }
  };
  document.addEventListener('change', e => {
    if (!S.sel) return;
    if (e.target.matches && e.target.matches('[data-sel]')) { const id = e.target.getAttribute('data-sel'); if (e.target.checked) S.sel.add(id); else S.sel.delete(id); App.updateBulk(); }
    else if (e.target.id === 'sel-all') { (S.planRows || []).forEach(x => { if (e.target.checked) S.sel.add(x.plan.PlanId); else S.sel.delete(x.plan.PlanId); }); App.$$('[data-sel]').forEach(c => { c.checked = e.target.checked; }); App.updateBulk(); }
  });
  App.actions.bulkClear = () => { S.sel = new Set(); App.$$('[data-sel]').forEach(c => { c.checked = false; }); App.updateBulk(); };
  App.actions.bulkEdit = () => {
    const ids = Array.from(S.sel || []); if (!ids.length) return;
    const M = App.masters().data, en = App.masters().enums;
    const keep = (name, label, opts, canClear) => '<div class="field"><label for="b_' + name + '">' + label + '</label><select id="b_' + name + '" name="' + name + '"><option value="__keep__">— ไม่เปลี่ยน —</option>' + (canClear ? '<option value="__clear__">(ล้างค่า)</option>' : '') + opts.map(o => '<option value="' + esc(o.v) + '">' + esc(o.l) + '</option>').join('') + '</select></div>';
    const act = (tbl, k) => App.activeOpts(tbl, 'Code', 'Name').map(o => ({ v: o.v, l: o.v + '. ' + o.l }));
    const html = '<p>แก้ไข <b>' + ids.length + '</b> แผนพร้อมกัน — เลือกเฉพาะช่องที่ต้องการเปลี่ยน (ช่องที่เป็น "ไม่เปลี่ยน" จะคงค่าเดิม)</p><div class="form-grid">' +
      keep('Status', 'สถานะแผน', (en.planStatuses || []).map(s => ({ v: s, l: s })), false) +
      keep('Owner', 'ผู้รับผิดชอบ', (M.people || []).filter(p => p.Active !== false).map(p => ({ v: p.Name, l: p.Name })), false) +
      keep('Department', 'กลุ่มงาน', (M.departments || []).filter(d => d.Active !== false).map(d => ({ v: d.Name, l: d.Name })), true) +
      keep('PlanType', 'ประเภทแผน', App.activeOpts('planTypes'), true) +
      keep('StrategyMoph', 'ยุทธศาสตร์กระทรวง', act('moph'), true) + keep('StrategyMission', 'พันธกิจ สสจ.', act('mission'), true) + keep('StrategyHosp', 'ยุทธศาสตร์ รพ.', act('hosp'), true) +
      App.field({ name: 'Note', label: 'หมายเหตุ (เว้นว่าง = ไม่เปลี่ยน)', value: '' }) +
      App.field({ name: 'reason', label: 'เหตุผลการแก้ไข', type: 'textarea', value: '', full: true, hint: 'จำเป็นเมื่อเปลี่ยนสถานะสำคัญของแผนที่อนุมัติแล้ว (เช่น ยกเลิก/กลับเป็นร่าง)' }) + '</div>';
    App.modal({ title: 'แก้ไขหลายแผนพร้อมกัน', html: html, wide: true, submitLabel: 'ใช้กับ ' + ids.length + ' แผน',
      onSubmit: async d => {
        const v = App.values(d), changes = {};
        ['Status', 'Owner', 'Department', 'PlanType', 'StrategyMoph', 'StrategyMission', 'StrategyHosp'].forEach(k => { if (v[k] && v[k] !== '__keep__') changes[k] = v[k]; });
        if (v.Note) changes.Note = v.Note;
        if (!Object.keys(changes).length) throw new Error('ยังไม่ได้เลือกช่องที่จะแก้ไข');
        if (!(await App.confirm('ยืนยันแก้ไข ' + ids.length + ' แผน: ' + Object.keys(changes).length + ' ช่อง ?', 'ยืนยัน'))) return false;
        const r = await App.api('plans.bulk', { planIds: ids, changes: changes, reason: v.reason });
        if (r.failed) { d.showError('สำเร็จ ' + r.updated + ' แผน · ไม่สำเร็จ ' + r.failed + ' แผน: ' + r.errors.map(x => String(x.name).substring(0, 40) + ' — ' + x.error).join(' | ')); S.sel = new Set(r.errors.map(x => x.planId)); App.render(); return false; }
        App.toast('แก้ไข ' + r.updated + ' แผนแล้ว', 'success'); S.sel = new Set(); App.render();
      } });
  };
  function dupModal(ids, fromYear) {
    const next = String((parseInt(fromYear, 10) || parseInt(S.year, 10)) + 1);
    App.modal({ title: 'คัดลอก/ยกแผนไปปีงบประมาณใหม่', submitLabel: 'คัดลอก ' + ids.length + ' แผน',
      html: '<p>คัดลอก <b>' + ids.length + '</b> แผน พร้อมกิจกรรมและรายการงบ (ไม่คัดลอกการเบิกจ่ายและการปรับงบ) สถานะเริ่มต้นเป็น "ร่าง" และเลขลำดับต่อจากปีปลายทางอัตโนมัติ</p><div class="form-grid">' +
        App.field({ name: 'toYear', label: 'ปีงบประมาณปลายทาง (พ.ศ.)', value: next, required: true, attrs: ' inputmode="numeric" maxlength="4"' }) +
        App.field({ name: 'shiftDates', label: 'เลื่อนวันที่กิจกรรมไปตามปีงบประมาณ', type: 'checkbox', value: true, full: true }) +
        App.field({ name: 'skipExcluded', label: 'ไม่คัดลอกกิจกรรมที่ยกเลิก/ไม่เบิก/ไม่ใช้งบประมาณ', type: 'checkbox', value: true, full: true }) + '</div>',
      onSubmit: async d => {
        const v = App.values(d);
        const r = await App.api('plans.duplicate', { planIds: ids, toYear: String(v.toYear).trim(), shiftDates: !!v.shiftDates, skipExcluded: !!v.skipExcluded });
        App.toast('คัดลอก ' + r.plans + ' แผน (' + r.activities + ' กิจกรรม) ไปปี ' + v.toYear + ' แล้ว', 'success');
        S.sel = new Set(); S.year = String(v.toYear).trim();
        if (location.hash === '#/plans') App.render(); else location.hash = '#/plans';
      } });
  }
  App.actions.bulkDup = () => { const ids = Array.from(S.sel || []); if (ids.length) dupModal(ids, S.year); };
  App.actions.dupPlanOne = () => dupModal([S.cur.plan.PlanId], S.cur.plan.Year);
})();
