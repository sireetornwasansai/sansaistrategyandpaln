/* เอกสารแนบของแผนงาน/โครงการ (v2.8)
   - ไฟล์ทุกชนิด (ลากวาง/เลือกหลายไฟล์) อัปโหลดเข้า Drive ของระบบ + แนบลิงก์ (รวมลิงก์ Google Drive/Docs ที่แชร์ไว้แล้ว)
   - ดูออนไลน์ในหน้าต่างของระบบได้โดยไม่ต้องดาวน์โหลด (Google preview) · คัดลอกลิงก์ · เปลี่ยนชื่อ · ลบ
   - ฟอร์ม "เพิ่มแผนงาน": รายการจะรอ (staged) แล้วแนบให้อัตโนมัติหลังบันทึกแผน · หน้าแผน/แก้ไขแผน: แนบทันที
   ฝั่งเซิร์ฟเวอร์ตรวจซ้ำทุกอย่าง (ชนิดไฟล์ ขนาด จำนวน สิทธิ์แก้ไขแผน ลิงก์) */
(function () {
  'use strict';
  const App = window.App, esc = App.esc;
  const FALLBACK_BLOCK = ['exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'msp', 'dll', 'sys', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'ps1', 'psm1', 'jar', 'apk', 'app', 'dmg', 'sh', 'bash', 'lnk', 'reg', 'hta', 'cpl', 'scf', 'pif', 'iso', 'crx', 'html', 'htm', 'xhtml', 'svg', 'docm', 'xlsm', 'pptm', 'dotm', 'xltm', 'potm', 'ppam', 'xlam'];
  const lim = () => { try { return App.masters().limits || {}; } catch (e) { return {}; } };
  const maxMb = () => lim().maxAttachMb || 20, maxN = () => lim().maxAttachPerPlan || 50, blocked = () => lim().blockedExt || FALLBACK_BLOCK;
  const extOf = n => { const i = String(n).lastIndexOf('.'); return i < 0 ? '' : String(n).slice(i + 1).toLowerCase(); };
  const fmtSize = b => !b ? '' : b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
  const DRIVE_RE = /^https:\/\/(docs|drive)\.google\.com\//i;
  const GOOGLE_PREVIEW_RE = /^https:\/\/(docs|drive)\.google\.com\//;
  const ORIGIN = { upload: 'อัปโหลดแล้ว', drive: 'Google Drive', link: 'ลิงก์ภายนอก' };

  function icon(name, mime, origin) {
    const e = extOf(name), m = String(mime || '');
    if (origin === 'drive' && !e && !m) return ['fab fa-google-drive', 'drive'];
    if (m === 'application/pdf' || e === 'pdf') return ['fas fa-file-pdf', 'pdf'];
    if (/^image\//.test(m) || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].indexOf(e) >= 0) return ['fas fa-file-image', 'img'];
    if (/word|document/.test(m) && !/spreadsheet|presentation/.test(m) || ['doc', 'docx', 'odt', 'rtf'].indexOf(e) >= 0) return ['fas fa-file-word', 'word'];
    if (/sheet|excel/.test(m) || ['xls', 'xlsx', 'ods', 'csv'].indexOf(e) >= 0) return ['fas fa-file-excel', 'excel'];
    if (/presentation|powerpoint/.test(m) || ['ppt', 'pptx', 'odp'].indexOf(e) >= 0) return ['fas fa-file-powerpoint', 'ppt'];
    if (/zip|rar|7z/.test(m) || ['zip', 'rar', '7z'].indexOf(e) >= 0) return ['fas fa-file-zipper', 'zip'];
    if (/^video\//.test(m) || ['mp4', 'mov'].indexOf(e) >= 0) return ['fas fa-file-video', 'video'];
    if (/^audio\//.test(m) || ['mp3', 'm4a', 'wav'].indexOf(e) >= 0) return ['fas fa-file-audio', 'video'];
    if (m === 'application/vnd.google-apps.folder') return ['fas fa-folder-open', 'drive'];
    if (origin === 'drive') return ['fab fa-google-drive', 'drive'];
    if (origin === 'link') return ['fas fa-link', 'link'];
    return ['fas fa-file', 'file'];
  }
  function normUrl(u) {
    u = String(u || '').replace(/\s+/g, '');
    if (!u) throw new Error('กรุณาวางลิงก์เอกสาร');
    if (!/^https?:\/\//i.test(u)) { if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(u)) u = 'https://' + u; else throw new Error('ลิงก์ต้องขึ้นต้นด้วย https://'); }
    if (u.length > 2000) throw new Error('ลิงก์ยาวเกินไป (สูงสุด 2,000 ตัวอักษร)');
    let x; try { x = new URL(u); } catch (e) { throw new Error('ลิงก์ไม่ถูกต้อง'); }
    if (!/^https?:$/.test(x.protocol) || x.hostname.indexOf('.') < 0) throw new Error('ลิงก์ไม่ถูกต้อง');
    return u;
  }
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  const readB64 = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error('อ่านไฟล์ไม่สำเร็จ: ' + f.name)); fr.readAsDataURL(f); });
  const copyText = async t => { try { await navigator.clipboard.writeText(t); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e2) { /* ignore */ } ta.remove(); } };

  // ---------------------------------------------------------------- ดูออนไลน์
  function preview(a) {
    if (!GOOGLE_PREVIEW_RE.test(a.previewUrl || '')) { window.open(a.url, '_blank', 'noopener'); return; }
    const d = document.createElement('dialog'); d.className = 'att-prev';
    d.innerHTML = '<div class="att-prev-box"><header><b title="' + esc(a.title) + '">' + esc(a.title) + '</b><span><a class="btn sm ghost" target="_blank" rel="noopener noreferrer" href="' + esc(a.url) + '"><i class="fas fa-up-right-from-square"></i> เปิดในแท็บใหม่</a>' +
      '<button type="button" class="btn sm" data-x>ปิด</button></span></header><div class="att-prev-frame"><div class="att-prev-load"><div class="spinner"></div></div>' +
      '<iframe title="' + esc(a.title) + '" src="' + esc(a.previewUrl) + '" allow="autoplay; fullscreen" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"></iframe></div>' +
      '<p class="muted small">หากหน้าต่างว่างหรือขอสิทธิ์เข้าถึง แสดงว่าไฟล์ยังไม่ได้แชร์ให้ท่าน — กด “เปิดในแท็บใหม่” หรือติดต่อเจ้าของไฟล์</p></div>';
    document.body.appendChild(d);
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-x]')) d.close(); });
    d.addEventListener('close', () => d.remove());
    d.querySelector('iframe').addEventListener('load', () => { const l = d.querySelector('.att-prev-load'); if (l) l.remove(); });
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }

  // ---------------------------------------------------------------- วิดเจ็ต
  function mount(host, o) {
    o = o || {};
    const live = !!o.planId, canEdit = o.canEdit !== false;
    let saved = (o.items || []).slice(), staged = [], busy = [], msgs = [], seq = 0, loading = live && !o.items;
    host.classList.add('att');
    host.innerHTML = (canEdit ?
      '<div class="att-drop" tabindex="0" role="button" aria-label="เลือกไฟล์ หรือลากไฟล์มาวางที่นี่"><i class="fas fa-cloud-arrow-up" aria-hidden="true"></i>' +
      '<div><b>ลากไฟล์มาวางที่นี่ หรือ <u>เลือกไฟล์</u></b><small>ไฟล์ทุกประเภท (ยกเว้นไฟล์โปรแกรม/สคริปต์/มาโคร) · ไม่เกิน ' + maxMb() + ' MB ต่อไฟล์ · สูงสุด ' + maxN() + ' รายการต่อแผน</small></div>' +
      '<input type="file" multiple hidden tabindex="-1"></div>' +
      '<div class="att-link"><input type="text" inputmode="url" class="att-url" autocomplete="off" placeholder="วางลิงก์ Google Drive / Docs / Sheets / Slides หรือเว็บอื่น (https://…)" aria-label="ลิงก์เอกสาร">' +
      '<input type="text" class="att-ttl" maxlength="120" autocomplete="off" placeholder="ชื่อเอกสาร (ไม่บังคับ)" aria-label="ชื่อเอกสาร"><button type="button" class="btn" data-do="addlink"><i class="fas fa-link"></i> เพิ่มลิงก์</button></div>' +
      '<p class="att-hint"><i class="fas fa-circle-info"></i> ลิงก์ Google Drive: ตั้งสิทธิ์แชร์เป็น “ทุกคนที่มีลิงก์ (ผู้ดู)” หรือแชร์ให้ผู้เกี่ยวข้อง เพื่อให้เปิดดูออนไลน์ได้ · ไฟล์ใหญ่เกิน ' + maxMb() + ' MB ให้อัปโหลดขึ้น Drive ก่อนแล้วแนบเป็นลิงก์</p>' : '') +
      '<div class="att-msg" role="status" aria-live="polite"></div><ul class="att-list"></ul>';
    const list = host.querySelector('.att-list'), msgBox = host.querySelector('.att-msg');
    const urlIn = host.querySelector('.att-url'), ttlIn = host.querySelector('.att-ttl'), fileIn = host.querySelector('input[type=file]'), drop = host.querySelector('.att-drop');
    const count = () => saved.length + staged.length + busy.length;
    const notify = () => { if (o.onChange) o.onChange(saved.length + staged.length); };
    const setMsg = a => { msgs = a || []; msgBox.innerHTML = msgs.map(m => '<div class="att-note ' + m.t + '"><i class="fas ' + (m.t === 'err' ? 'fa-circle-exclamation' : m.t === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-check') + '"></i><span>' + esc(m.m) + '</span></div>').join(''); };

    function savedRow(a) {
      const ic = icon(a.fileName || a.title, a.mime, a.origin), canPrev = GOOGLE_PREVIEW_RE.test(a.previewUrl || '');
      return '<li class="att-item" data-id="' + esc(a.id) + '"><span class="att-ico ' + ic[1] + '"><i class="' + ic[0] + '" aria-hidden="true"></i></span><div class="att-body">' +
        '<button type="button" class="att-title" data-do="' + (canPrev ? 'preview' : 'open') + '" title="' + (canPrev ? 'ดูออนไลน์' : 'เปิดลิงก์') + '">' + esc(a.title) + '</button>' +
        '<div class="att-meta"><span class="att-chip ' + esc(a.origin) + '">' + esc(ORIGIN[a.origin] || a.origin) + '</span>' + (fmtSize(a.size) ? ' <span>' + fmtSize(a.size) + '</span>' : '') +
        (a.fileName && a.fileName !== a.title ? ' <span class="att-fn">' + esc(a.fileName) + '</span>' : (a.origin === 'link' ? ' <span class="att-fn">' + esc(hostOf(a.url)) + '</span>' : '')) +
        (a.createdAt ? ' <span>' + esc(App.dateTime(a.createdAt)) + '</span>' : '') + '</div>' + (a.note ? '<div class="att-note-txt">' + esc(a.note) + '</div>' : '') + (a.warn ? '<div class="att-warn"><i class="fas fa-triangle-exclamation"></i> ' + esc(a.warn) + '</div>' : '') + '</div>' +
        '<div class="att-act">' + (canPrev ? '<button type="button" class="icon-btn" data-do="preview" title="ดูออนไลน์" aria-label="ดูออนไลน์"><i class="fas fa-eye"></i></button>' : '') +
        '<a class="icon-btn" target="_blank" rel="noopener noreferrer" href="' + esc(a.url) + '" title="เปิดในแท็บใหม่" aria-label="เปิดในแท็บใหม่"><i class="fas fa-up-right-from-square"></i></a>' +
        '<button type="button" class="icon-btn" data-do="copy" title="คัดลอกลิงก์" aria-label="คัดลอกลิงก์"><i class="fas fa-copy"></i></button>' +
        (canEdit ? '<button type="button" class="icon-btn" data-do="edit" title="เปลี่ยนชื่อ/หมายเหตุ" aria-label="เปลี่ยนชื่อ"><i class="fas fa-pen"></i></button><button type="button" class="icon-btn danger" data-do="del" title="ลบ" aria-label="ลบ"><i class="fas fa-trash"></i></button>' : '') + '</div></li>';
    }
    function stagedRow(s) {
      const isFile = s.kind === 'file', name = isFile ? s.file.name : (s.title || hostOf(s.url)), ic = isFile ? icon(s.file.name, s.file.type, 'upload') : icon(s.url, '', s.drive ? 'drive' : 'link');
      const st = s.state === 'busy' ? '<span class="att-state busy"><span class="spinner sm"></span> กำลังแนบ…</span>' : s.state === 'ok' ? '<span class="att-state ok"><i class="fas fa-check"></i> แนบแล้ว</span>' :
        s.state === 'err' ? '<span class="att-state err"><i class="fas fa-circle-exclamation"></i> ไม่สำเร็จ: ' + esc(s.error) + '</span>' : '<span class="att-state wait"><i class="fas fa-hourglass-half"></i> จะแนบเมื่อกดบันทึกแผน</span>';
      return '<li class="att-item staged" data-key="' + s.key + '"><span class="att-ico ' + ic[1] + '"><i class="' + ic[0] + '" aria-hidden="true"></i></span><div class="att-body"><span class="att-title static">' + esc(name) + '</span>' +
        '<div class="att-meta"><span class="att-chip ' + (isFile ? 'upload' : s.drive ? 'drive' : 'link') + '">' + (isFile ? 'ไฟล์' : s.drive ? 'Google Drive' : 'ลิงก์ภายนอก') + '</span>' + (isFile ? ' <span>' + fmtSize(s.file.size) + '</span>' : ' <span class="att-fn">' + esc(hostOf(s.url)) + '</span>') + ' ' + st + '</div></div>' +
        '<div class="att-act">' + (s.state === 'pending' || s.state === 'err' ? '<button type="button" class="icon-btn danger" data-do="rm" title="เอาออก" aria-label="เอาออก"><i class="fas fa-xmark"></i></button>' : '') + '</div></li>';
    }
    function render() {
      list.innerHTML = loading ? '<li class="att-empty"><span class="spinner sm"></span> กำลังโหลดเอกสารแนบ…</li>' :
        saved.map(savedRow).join('') + busy.map(b => '<li class="att-item staged"><span class="att-ico file"><span class="spinner sm"></span></span><div class="att-body"><span class="att-title static">' + esc(b.name) + '</span><div class="att-meta"><span class="att-state busy">กำลังอัปโหลด… (ไฟล์ใหญ่อาจใช้เวลาสักครู่ อย่าปิดหน้านี้)</span></div></div></li>').join('') + staged.map(stagedRow).join('') ||
        '<li class="att-empty">' + (canEdit ? 'ยังไม่มีเอกสารแนบ' : 'ไม่มีเอกสารแนบ') + '</li>';
      notify();
    }
    const dupFile = f => saved.some(a => a.fileName === f.name && a.size === f.size) || staged.some(s => s.kind === 'file' && s.file.name === f.name && s.file.size === f.size);

    async function liveRun(label, fn, errs) {
      const b = { name: label }; busy.push(b); render();
      try { const r = await fn(); const att = r.att; if (r.warning) { att.warn = r.warning; errs.push({ t: 'warn', m: att.title + ': ' + r.warning }); } saved.push(att); }
      catch (e) { errs.push({ t: 'err', m: label + ': ' + (e && e.message ? e.message : e) }); }
      finally { busy.splice(busy.indexOf(b), 1); }
    }
    async function addFiles(files) {
      const errs = [];
      for (const f of files) {
        const e = extOf(f.name);
        if (blocked().indexOf(e) >= 0) { errs.push({ t: 'err', m: f.name + ': ไม่อนุญาตไฟล์ .' + e + ' (ไฟล์โปรแกรม/สคริปต์/มาโคร/เว็บ เสี่ยงต่อความปลอดภัย)' }); continue; }
        if (!f.size) { errs.push({ t: 'err', m: f.name + ': ไฟล์ว่างเปล่า' }); continue; }
        if (f.size > maxMb() * 1048576) { errs.push({ t: 'err', m: f.name + ': ใหญ่เกิน ' + maxMb() + ' MB — อัปโหลดขึ้น Google Drive แล้วแนบเป็นลิงก์แทน' }); continue; }
        if (count() >= maxN()) { errs.push({ t: 'err', m: 'แนบได้สูงสุด ' + maxN() + ' รายการต่อแผน' }); break; }
        if (dupFile(f)) { errs.push({ t: 'warn', m: f.name + ': มีไฟล์ชื่อและขนาดเดียวกันแนบไว้แล้ว (ข้าม)' }); continue; }
        if (live) { await liveRun(f.name, async () => App.api('att.upload', { planId: o.planId, name: f.name, data: await readB64(f) }, { timeout: 300000 }), errs); }
        else { staged.push({ key: ++seq, kind: 'file', file: f, title: '', state: 'pending' }); }
        setMsg(errs); render();
      }
      setMsg(errs); render();
    }
    async function addLink() {
      const errs = []; let url;
      try { url = normUrl(urlIn.value); } catch (e) { setMsg([{ t: 'err', m: e.message }]); urlIn.focus(); return; }
      const title = String(ttlIn.value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (saved.some(a => a.url === url) || staged.some(s => s.kind === 'link' && s.url === url)) { setMsg([{ t: 'warn', m: 'ลิงก์นี้ถูกแนบไว้แล้ว' }]); return; }
      if (count() >= maxN()) { setMsg([{ t: 'err', m: 'แนบได้สูงสุด ' + maxN() + ' รายการต่อแผน' }]); return; }
      if (live) await liveRun(title || hostOf(url), () => App.api('att.addLink', { planId: o.planId, url: url, title: title }), errs);
      else staged.push({ key: ++seq, kind: 'link', url: url, title: title, drive: DRIVE_RE.test(url), state: 'pending' });
      if (!errs.some(m => m.t === 'err')) { urlIn.value = ''; ttlIn.value = ''; if (!live) errs.push({ t: 'ok', m: 'เพิ่มลิงก์แล้ว — จะแนบเมื่อบันทึกแผน' }); }
      setMsg(errs); render();
    }

    host.addEventListener('click', async e => {
      const el = e.target.closest('[data-do]'); if (!el || !host.contains(el)) return;
      const act = el.dataset.do, li = el.closest('li'), id = li && li.dataset.id, a = id ? saved.find(x => x.id === id) : null;
      if (act === 'addlink') { addLink(); return; }
      if (act === 'preview' && a) preview(a);
      else if (act === 'open' && a) window.open(a.url, '_blank', 'noopener');
      else if (act === 'copy' && a) { await copyText(a.url); App.toast('คัดลอกลิงก์แล้ว', 'success'); }
      else if (act === 'rm' && li) { staged = staged.filter(s => String(s.key) !== li.dataset.key); render(); }
      else if (act === 'edit' && a) {
        App.modal({ title: 'แก้ไขเอกสารแนบ', html: '<div class="form-grid">' + App.field({ name: 'title', label: 'ชื่อเอกสาร', value: a.title, required: true, full: true }) + App.field({ name: 'note', label: 'หมายเหตุ', value: a.note || '', full: true }) + '</div>',
          onSubmit: async d => { const v = App.values(d); const r = await App.api('att.update', { id: a.id, title: v.title, note: v.note }); Object.assign(a, r.att, { warn: a.warn }); render(); App.toast('บันทึกแล้ว', 'success'); } });
      } else if (act === 'del' && a) {
        if (await App.confirm('ลบเอกสารแนบ “' + a.title + '” ออกจากแผน ?\n(ไฟล์ใน Google Drive ยังคงอยู่ ผู้ดูแลระบบกู้คืนได้)', 'ลบ', true)) {
          await App.api('att.delete', { id: a.id }); saved = saved.filter(x => x.id !== a.id); render(); App.toast('ลบเอกสารแนบแล้ว', 'success');
        }
      }
    });
    if (canEdit) {
      drop.addEventListener('click', e => { if (e.target !== fileIn) fileIn.click(); });
      drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
      fileIn.addEventListener('change', () => { const fs = Array.from(fileIn.files || []); fileIn.value = ''; if (fs.length) addFiles(fs); });
      ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', e => { const fs = Array.from((e.dataTransfer && e.dataTransfer.files) || []); if (fs.length) addFiles(fs); });
      [urlIn, ttlIn].forEach(x => x.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addLink(); } }));
    }
    render();
    if (loading) App.api('att.list', { planId: o.planId }).then(r => { saved = r; loading = false; render(); }, e => { loading = false; setMsg([{ t: 'err', m: e.message }]); render(); });

    return {
      count: () => saved.length + staged.length,
      hasStaged: () => staged.length > 0,
      /** แนบรายการที่รอไว้ให้แผนที่เพิ่งบันทึก — ไม่โยน error (กันบันทึกแผนซ้ำ) */
      async flush(planId, onProgress) {
        const failed = []; let done = 0; const n = staged.length;
        for (const s of staged) {
          s.state = 'busy'; render(); if (onProgress) onProgress(done + 1, n);
          try {
            if (s.kind === 'file') await App.api('att.upload', { planId: planId, name: s.file.name, data: await readB64(s.file), title: s.title }, { timeout: 300000 });
            else await App.api('att.addLink', { planId: planId, url: s.url, title: s.title });
            s.state = 'ok'; done++;
          } catch (e) { s.state = 'err'; s.error = e && e.message ? e.message : String(e); failed.push({ label: s.kind === 'file' ? s.file.name : s.url, error: s.error }); }
          render();
        }
        return { total: n, done: done, failed: failed };
      }
    };
  }

  /** การ์ด "เอกสารแนบ" บนหน้ารายละเอียดแผน */
  function mountCard(el, g, edit) {
    if (!el) return;
    const items = g.attachments || [];
    if (!edit && !items.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<section class="card att-card"><div class="att-head"><h2><i class="fas fa-paperclip"></i> เอกสารแนบ <span class="count" id="att-count">' + items.length + '</span></h2>' +
      '<span class="muted small">ไฟล์และลิงก์ประกอบแผน/โครงการ — กดชื่อเพื่อดูออนไลน์</span></div><div id="att-card-body"></div></section>';
    mount(el.querySelector('#att-card-body'), { planId: g.plan.PlanId, items: items, canEdit: edit, onChange: n => { const c = el.querySelector('#att-count'); if (c) c.textContent = n; } });
  }

  App.attach = { mount: mount, mountCard: mountCard, preview: preview };
})();
