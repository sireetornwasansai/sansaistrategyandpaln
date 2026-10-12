/* รูปประจำตัวผู้ใช้: เลือกรูป → ครอปเป็นสี่เหลี่ยมจัตุรัส ย่อเหลือ 192px (JPEG) ในเครื่องก่อนอัปโหลด → เก็บใน Users.Picture */
(function () {
  'use strict';
  const App = window.App, esc = App.esc, S = App.state;
  const SIZE = 192, MAX_FILE = 8 * 1024 * 1024;

  function toSquareDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.type) && !/^image\//.test(file.type)) return reject(new Error('กรุณาเลือกไฟล์รูปภาพ'));
      if (file.size > MAX_FILE) return reject(new Error('ไฟล์ใหญ่เกิน 8 MB'));
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        try {
          const s = Math.min(img.naturalWidth, img.naturalHeight), sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
          const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
          const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, SIZE, SIZE);
          cx.imageSmoothingQuality = 'high'; cx.drawImage(img, sx, sy, s, s, 0, 0, SIZE, SIZE);
          let q = 0.85, out = cv.toDataURL('image/jpeg', q);
          while (out.length > 40000 && q > 0.4) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
          URL.revokeObjectURL(url);
          out.length > 44000 ? reject(new Error('รูปซับซ้อนเกินไป ลองรูปอื่น')) : resolve(out);
        } catch (e) { reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดรูปนี้ไม่ได้ ลองไฟล์ JPG/PNG')); };
      img.src = url;
    });
  }

  App.actions.profile = () => {
    const u = S.user || {};
    let chosen;               // undefined = ไม่เปลี่ยน, '' = ลบรูป, 'data:...' = รูปใหม่
    const initial = esc((u.name || u.email || '?').charAt(0));
    const html = '<div class="avatar-edit"><div id="av-prev" class="avatar-preview">' + (u.picture ? '<img class="avatar-preview" src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">' : initial) + '</div>' +
      '<div class="btns"><label class="btn"><i class="fas fa-image"></i> เลือกรูป<input type="file" id="av-file" accept="image/*" hidden></label>' +
      '<button type="button" class="btn ghost" id="av-clear"><i class="fas fa-trash"></i> ลบรูป</button></div></div>' +
      '<p class="muted small" style="margin-top:14px">ระบบจะครอปกึ่งกลางเป็นสี่เหลี่ยมจัตุรัสและย่อรูปให้อัตโนมัติ · รูปที่อัปโหลดจะแทนรูปจาก Google · ถ้าลบรูป ระบบจะกลับไปใช้รูป Google ในการล็อกอินครั้งถัดไป</p>';
    App.modal({
      title: 'รูปประจำตัว — ' + (u.name || u.email || ''), html, submitLabel: 'บันทึกรูป',
      onOpen: d => {
        const prev = d.querySelector('#av-prev');
        d.querySelector('#av-file').addEventListener('change', async ev => {
          const f = ev.target.files && ev.target.files[0]; if (!f) return;
          try { chosen = await toSquareDataUrl(f); prev.innerHTML = '<img class="avatar-preview" src="' + chosen + '" alt="">'; d.showError(''); }
          catch (err) { d.showError(err.message); }
        });
        d.querySelector('#av-clear').addEventListener('click', () => { chosen = ''; prev.textContent = (u.name || u.email || '?').charAt(0); });
      },
      onSubmit: async () => {
        if (chosen === undefined) return true;
        const r = await App.api('me.avatar', { image: chosen });
        S.user.picture = r.picture || ''; App.saveSession(); App.buildNav();
        App.toast(chosen ? 'บันทึกรูปประจำตัวแล้ว' : 'ลบรูปประจำตัวแล้ว', 'success');
      }
    });
  };
})();
