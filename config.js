// ตั้งค่าหน้าเว็บ (แก้ไฟล์นี้ก่อน deploy) — ไม่มีข้อมูลลับ ใส่ค่าสาธารณะเท่านั้น
window.APP_CONFIG = {
  // URL ของ Apps Script Web app (Deploy > Manage deployments > Web app URL ลงท้ายด้วย /exec)
  API_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
  // OAuth Client ID (Web application) จาก Google Cloud Console — ต้องตรงกับ Script property GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  APP_NAME: 'ระบบบริหารแผนงาน/โครงการ',
  ORG_NAME: 'โรงพยาบาลสันทราย จังหวัดเชียงใหม่'
};
