/**
 * =====================================================================================
 *  ระบบบริหารจัดการแผนงาน/โครงการ รพ.สันทราย — BACKEND (Google Apps Script) v2
 *  ใช้เป็น JSON API ให้ frontend (Vercel/GitHub) เรียกผ่าน fetch (POST, Content-Type: text/plain)
 * -------------------------------------------------------------------------------------
 *  SCRIPT PROPERTIES (Project Settings > Script properties)
 *   จำเป็น:
 *     GOOGLE_CLIENT_ID   OAuth Client ID (Web application) ของ Google Sign-In  เช่น 123-abc.apps.googleusercontent.com
 *                        ต้องเป็นค่าเดียวกับที่ใส่ใน frontend/config.js
 *     ADMIN_EMAILS       อีเมลแอดมินคนแรก (คั่นด้วย ,) — ล็อกอินครั้งแรกจะได้สิทธิ์แอดมินอัตโนมัติ ไม่ต้องรออนุมัติ
 *   จำเป็น (ถ้าสคริปต์ไม่ได้ผูกกับ Google Sheet):
 *     SS_ID              Spreadsheet ID ของฐานข้อมูล (ถ้าสร้างสคริปต์จากเมนู Extensions > Apps Script ในชีต ไม่ต้องใส่)
 *   สร้างให้อัตโนมัติ (ไม่ต้องใส่เอง):
 *     TOKEN_SECRET       กุญแจลงลายเซ็น session — setupSheet() จะสร้างให้ถ้ายังไม่มี
 *   สร้างให้อัตโนมัติเมื่อรัน setupSheet() (แก้ค่าได้ภายหลัง — ใช้ค่าเริ่มต้นเดิมถ้าไม่ตั้ง):
 *     TIMEZONE · ORG_NAME · SESSION_HOURS · MAX_UPLOAD_MB · ALERT_SOON_DAYS · ALERT_PAY_DAYS · RISK_HIGH_SCORE · RISK_MID_SCORE
 *     IMPORTANCE_HIGH_BAHT · IMPORTANCE_MID_BAHT · MAINTENANCE_MODE(TRUE = ปิดปรับปรุง: อ่านได้ บันทึกไม่ได้ ยกเว้นแอดมิน)
 *     WEBAPP_URL · DEPLOYED_VERSION · LAST_SETUP_AT (บันทึกอัตโนมัติ ใช้ตรวจว่าโค้ดที่ Deploy ตรงกับที่ตั้งค่าไว้)
 *   ไม่บังคับ (ตั้งเองเมื่อต้องการ):
 *     APP_URL            ลิงก์หน้าเว็บระบบ (frontend) แนบในอีเมลแจ้งเตือน
 *     ALLOWED_EMAIL_DOMAINS  จำกัดโดเมนอีเมลของผู้ที่ "ขอสิทธิ์ใหม่" เช่น gmail.com,cmu.ac.th (ว่าง = ไม่จำกัด · ผู้ใช้เดิมและแอดมินไม่ถูกบล็อก)
 *     ADMIN_NOTIFY_EMAIL อีเมลรับแจ้งเมื่อมีผู้ขอสมัครใช้งาน (ถ้าไม่ใส่ จะส่งหาแอดมินทุกคน)
 *     DRIVE_FOLDER_ID    โฟลเดอร์ Drive เก็บไฟล์หลักฐาน (ถ้าไม่ใส่ จะสร้างโฟลเดอร์ให้เอง)
 *     SESSION_HOURS      อายุ session เป็นชั่วโมง (ค่าเริ่มต้น 12)
 *     PLAN_SHEET_ID      Spreadsheet ID ของชีทเดิม "สรุปแผนงาน+โครงการ ปีงบ 69" (ใช้เฉพาะตอนนำเข้า previewImport/runImport)
 *
 *  คำสั่งที่รันจากตัวแก้ไข Apps Script:
 *     setupSheet()    สร้าง/ซ่อมโครงสร้างชีตทั้งหมด + ข้อมูลตั้งต้น (รันซ้ำได้ ปลอดภัย ไม่ลบข้อมูล)
 *     checkConfig()   ตรวจว่าตั้งค่า Script Properties ครบหรือยัง
 *     previewImport() ตรวจก่อนนำเข้าข้อมูลปีงบ 69 (ไม่เขียนข้อมูล)
 *     runImport()     นำเข้าข้อมูลปีงบ 69 จากชีทเดิม
 *  Deploy: Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone
 * =====================================================================================
 */

var APP_VERSION = '2.6.0';
var TZ_ = (function () { try { return PropertiesService.getScriptProperties().getProperty('TIMEZONE') || 'Asia/Bangkok'; } catch (e) { return 'Asia/Bangkok'; } })();
/** ค่าตั้งต้นของ Script Properties ที่ปรับได้ (ไม่ตั้ง = ใช้ค่านี้) — setupSheet() จะเขียนค่าเหล่านี้ลง Script Properties ให้เห็นและแก้ได้ */
var PROP_DEFAULTS_ = { TIMEZONE: 'Asia/Bangkok', ORG_NAME: 'โรงพยาบาลสันทราย จังหวัดเชียงใหม่', SESSION_HOURS: '12', MAX_UPLOAD_MB: '10',
  ALERT_SOON_DAYS: '7', ALERT_PAY_DAYS: '30', RISK_HIGH_SCORE: '15', RISK_MID_SCORE: '8', IMPORTANCE_HIGH_BAHT: '500000', IMPORTANCE_MID_BAHT: '100000', MAINTENANCE_MODE: 'FALSE' };

// ---------------------------------------------------------------------------------
// โครงสร้างชีต (ชื่อชีต -> คอลัมน์) ลำดับคอลัมน์มีความสำคัญ ห้ามสลับตำแหน่ง ให้เพิ่มต่อท้ายเท่านั้น
// ---------------------------------------------------------------------------------
var SCHEMA_ = {
  Settings:       ['Key', 'Value', 'Description'],
  Users:          ['Email', 'Name', 'Role', 'Status', 'Department', 'PersonName', 'Picture', 'RequestedAt', 'ApprovedBy', 'ApprovedAt', 'LastLoginAt', 'Note'],
  Funds:          ['Code', 'Name', 'StrategySet', 'InHospitalKpi', 'SortOrder', 'Active'],
  Categories:     ['Code', 'Name', 'SortOrder', 'Active'],
  PlanTypes:      ['Code', 'Name', 'SortOrder', 'Active'],
  StrategyMoph:   ['Code', 'Name', 'SortOrder', 'Active'],
  StrategyMission:['Code', 'Name', 'SortOrder', 'Active'],
  StrategyProv:   ['Code', 'Name', 'MissionCode', 'SortOrder', 'Active'],
  StrategyHosp:   ['Code', 'Name', 'SortOrder', 'Active'],
  Departments:    ['Name', 'Mission', 'Active'],
  People:         ['Name', 'Department', 'Email', 'Active'],
  Plans:          ['PlanId', 'Year', 'FundCode', 'Seq', 'ProjectNo', 'ProjectTitle', 'Name', 'Owner', 'Department',
                   'StrategyMoph', 'StrategyMission', 'StrategyProv', 'StrategyHosp', 'StrategyRegion', 'PlanType',
                   'Status', 'ReturnDate', 'SummarySent', 'SummarySentDate', 'SummaryFileUrl', 'Note', 'IsDeleted', 'Source',
                   'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy'],
  Activities:     ['ActId', 'PlanId', 'No', 'Name', 'Status', 'PlanStart', 'PlanEnd', 'DateText', 'Note', 'SortOrder', 'IsDeleted', 'Source',
                   'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy', 'Progress'],
  BudgetLines:    ['LineId', 'ActId', 'PlanId', 'CategoryCode', 'Amount', 'Detail'],
  Disbursements:  ['DisbId', 'ActId', 'PlanId', 'Seq', 'ApproveDate', 'PayRequestDate', 'PaidDate', 'Amount', 'EvidenceUrl', 'Note', 'Source',
                   'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy'],
  Adjustments:    ['AdjId', 'PlanId', 'ActId', 'Type', 'Amount', 'Reason', 'Date', 'CreatedAt', 'CreatedBy', 'TransferId'],
  FixQueue:       ['FixId', 'Source', 'Ref', 'Issue', 'Detail', 'Resolved', 'ResolvedBy', 'ResolvedAt', 'CreatedAt', 'PlanId'],
  AuditLog:       ['Time', 'Email', 'Action', 'Entity', 'EntityId', 'Detail'],
  ChangeLog:      ['Time', 'Email', 'Entity', 'EntityId', 'PlanId', 'Field', 'Old', 'New', 'Reason'],
  Records:        ['RecId', 'Kind', 'PlanId', 'Title', 'Detail', 'Owner', 'Status', 'Priority', 'Date', 'Likelihood', 'Impact', 'Url',
                   'IsDeleted', 'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy']
};

// คอลัมน์ที่ต้องเก็บเป็น "ข้อความ" (กันชีตแปลงเป็นวันที่/ตัวเลขเอง) และคอลัมน์ตัวเลขเงิน
var TEXT_COLS_ = ['RecId', 'PlanId', 'ActId', 'LineId', 'DisbId', 'AdjId', 'FixId', 'Code', 'MissionCode', 'Seq', 'No', 'ProjectNo', 'FundCode',
  'StrategyMoph', 'StrategyMission', 'StrategyProv', 'StrategyHosp', 'ReturnDate', 'SummarySentDate', 'PlanStart', 'PlanEnd',
  'ApproveDate', 'PayRequestDate', 'PaidDate', 'Date', 'Year', 'Key', 'Value', 'CategoryCode', 'TransferId',
  'Time', 'CreatedAt', 'UpdatedAt', 'RequestedAt', 'ApprovedAt', 'LastLoginAt', 'ResolvedAt', 'Old', 'New'];
var TIME_COLS_ = ['Time', 'CreatedAt', 'UpdatedAt', 'RequestedAt', 'ApprovedAt', 'LastLoginAt', 'ResolvedAt'];
var MONEY_COLS_ = ['Amount'];

var ROLES_ = ['viewer', 'user', 'admin'];
var USER_STATUSES_ = ['pending', 'approved', 'rejected', 'suspended'];
var PLAN_STATUSES_ = ['ร่าง', 'อนุมัติ', 'ดำเนินการ', 'ส่งสรุปแล้ว', 'ปิด', 'ยกเลิก'];
var ACT_STATUSES_ = ['ปกติ', 'ไม่ใช้งบประมาณ', 'ไม่เบิก', 'ยกเลิก', 'เลื่อน'];
var ACT_EXCLUDED_ = ['ยกเลิก', 'ไม่เบิก', 'ไม่ใช้งบประมาณ']; // ไม่นับเป็นงบที่ต้องใช้จริง
var ADJ_TYPES_ = ['คืนเงิน', 'ปรับลดงบ', 'ปรับเพิ่มงบ'];

// ค่าตั้งต้นในชีต Settings (แก้ได้จากหน้าเว็บ: จัดการข้อมูลหลัก > ตั้งค่า)
var DEFAULT_SETTINGS_ = [
  ['CurrentYear', '2569', 'ปีงบประมาณปัจจุบัน (พ.ศ.)'],
  ['ExcludeCancelledFromRate', 'TRUE', 'TRUE = ร้อยละเบิกจ่ายไม่นับงบของกิจกรรมที่ยกเลิก/ไม่เบิก (แนะนำ)'],
  ['UserEditScope', 'all', 'all = เจ้าหน้าที่แก้ไขได้ทุกแผน | own = แก้ได้เฉพาะแผนที่ตนเองเป็นผู้รับผิดชอบ'],
  ['SummaryGraceDays', '30', 'จำนวนวันหลังกิจกรรมสุดท้ายสิ้นสุด ก่อนถือว่า "ค้างส่งสรุปโครงการ"'],
  ['FileSharing', 'link', 'link = แชร์ไฟล์หลักฐานแบบใครมีลิงก์เปิดดูได้ | private = ไม่แชร์'],
  ['ImportLocked', 'FALSE', 'TRUE = ล็อกไม่ให้รัน runImport ซ้ำ (ตั้งเป็น TRUE อัตโนมัติหลังนำเข้าเสร็จ)'],
  ['RequireReasonAfterApproval', 'TRUE', 'TRUE = แผนที่อนุมัติแล้ว ต้องระบุเหตุผลทุกครั้งที่แก้งบ/สถานะ/ลบรายการ (บันทึกในประวัติการแก้ไข)'],
  ['LockClosedPlans', 'TRUE', 'TRUE = แผนสถานะ "ปิด" แก้ไขได้เฉพาะแอดมิน']
];

var DEFAULT_FUNDS_ = [
  ['BAMRUNG', 'เงินบำรุง', 'hospital', true, 1, true],
  ['SSO', 'สสอ.สันทราย', 'hospital', true, 2, true],
  ['BUDGET', 'เงินงบประมาณ', 'hospital', true, 3, true],
  ['WELFARE', 'เงินสวัสดิการ', 'hospital', true, 4, true],
  ['PCU', 'งบท้องถิ่น PCU', 'hospital', true, 5, true],
  ['MAEJO', 'งบท้องถิ่น ทต.แม่โจ้', 'hospital', true, 6, true],
  ['REGION1', 'เขตสุขภาพที่ 1', 'region', false, 7, true],
  ['OFFPLAN', 'แผนงาน-โครงการ(นอกแผน)', 'hospital', true, 8, true]
];
var DEFAULT_CATEGORIES_ = [
  ['FOOD', 'อาหาร+อาหารว่าง', 1, true],
  ['MAT', 'ซื้อ+เช่าวัสดุอุปกรณ์', 2, true],
  ['VENDOR', 'วิทยากร+ของที่ระลึก+ของรางวัล+สถานที่', 3, true],
  ['MED', 'ค่าเวชภัณฑ์/ค่าตรวจ/สิ่งส่งตรวจ/ค่าชุดตรวจ', 4, true],
  ['LODG', 'ค่าลงทะเบียน / ค่าที่พัก', 5, true],
  ['TRAVEL', 'ค่าเบี้ยเลี้ยง ค่าพาหนะเดินทาง-น้ำมัน (จนท.-อสม.)', 6, true],
  ['PRINT', 'ค่าจ้างเหมาจัดทำสมุด/คู่มือ/เล่ม', 7, true],
  ['OTHER', 'อื่น ๆ', 8, true]
];
var DEFAULT_PLAN_TYPES_ = [
  ['MEET', 'ประชุม/อบรม/นิเทศ', 1, true],
  ['PROCURE', 'จัดซื้อ/ครุภัณฑ์/วัสดุ', 2, true],
  ['SERVICE', 'พัฒนาระบบบริการ/จัดตั้งหน่วย', 3, true],
  ['WELFARE', 'สวัสดิการ/ขวัญกำลังใจ', 4, true],
  ['OTHER', 'อื่น ๆ', 5, true]
];

var SEED_ = {
  moph: [
  {
    "Code": "1",
    "Name": "ส่งเสริมสุขภาพ ป้องกันโรคและคุ้มครองผู้บริโภคเป็นเลิศ (PP&P Excellence)"
  },
  {
    "Code": "2",
    "Name": "บริการเป็นเลิศ (Service Excellence)"
  },
  {
    "Code": "3",
    "Name": "บุคลากรเป็นเลิศ (People Excellence)"
  },
  {
    "Code": "4",
    "Name": "บริหารเป็นเลิศด้วยธรรมาภิบาล (Governance Excellence)"
  },
  {
    "Code": "5",
    "Name": "เศรษฐกิจสุขภาพเป็นเลิศ (Health Related Economy Excellence)"
  }
],
  mission: [
  {
    "Code": "1",
    "Name": "ส่งเสริม ป้องกัน ควบคุมโรค ภัยสุขภาพ และคุ้มครองผู้บริโภคด้านสุขภาพ"
  },
  {
    "Code": "2",
    "Name": "พัฒนาระบบริการสุขภาพให้มีคุณภาพ ประสิทธิภาพและเป็นธรรม"
  },
  {
    "Code": "3",
    "Name": "ส่งเสริมการมีส่วนร่วมทุกภาคส่วนในการดูแล และจัดการระบบสุขภาพ"
  },
  {
    "Code": "4",
    "Name": "พัฒนาระบบบริหารจัดการที่มุ่งเน้นผลสัมฤทธิ์"
  }
],
  prov: [
  {
    "Code": "M1-1",
    "Name": "สร้างเสริมสุขภาพ เฝ้าระวัง ป้องกันและควบคุมโรคให้มีประสิทธิภาพ",
    "MissionCode": "1"
  },
  {
    "Code": "M1-2",
    "Name": "ปรับเปลี่ยนพฤติกรรมของประชาชนที่เป็นภัยต่อสุขภาพ",
    "MissionCode": "1"
  },
  {
    "Code": "M1-3",
    "Name": "พัฒนาระบบงานคุ้มครองผู้บริโภคเพื่อให้ประชาชนได้รับบริการและใช้ผลิตภัณฑ์สุขภาพที่มีคุณภาพ",
    "MissionCode": "1"
  },
  {
    "Code": "M1-4",
    "Name": "มีระบบการจัดการด้านสิ่งแวดล้อมและกิจการที่เป็นอันตรายต่อสุขภาพได้อย่างมีประสิทธิภาพ",
    "MissionCode": "1"
  },
  {
    "Code": "M1-5",
    "Name": "ส่งเสริมภาคีเครือข่ายให้มีส่วนร่วมและมีความ เข้มแข็ง",
    "MissionCode": "1"
  },
  {
    "Code": "M2-1",
    "Name": "พัฒนาคุณภาพและเพิ่มศักยภาพระบบบริการสุขภาพทุกระดับ",
    "MissionCode": "2"
  },
  {
    "Code": "M2-2",
    "Name": "เพิ่มการเข้าถึงบริการ/ลด ความแออัดและจัดระบบบริการ ในเครือข่ายแบบไร้รอยต่อ",
    "MissionCode": "2"
  },
  {
    "Code": "M3-1",
    "Name": "จัดการความน่าเชื่อถือและความถูกต้องของข้อมูล",
    "MissionCode": "3"
  },
  {
    "Code": "M3-2",
    "Name": "พัฒนาประสิทธิภาพการบริหารจัดการด้านการเงินการคลังระดับจังหวัดและหน่วยบริการ",
    "MissionCode": "3"
  },
  {
    "Code": "M3-3",
    "Name": "ดำรงคุณธรรมและความโปร่งใสในการปฏิบัติงาน",
    "MissionCode": "3"
  },
  {
    "Code": "M4-1",
    "Name": "พัฒนาบุคลากรให้มีสมรรถนะ เหมาะสมในการปฏิบัติราชการ และมีความผาสุกในการทำงาน",
    "MissionCode": "4"
  },
  {
    "Code": "M4-2",
    "Name": "ขับเคลื่อนการสร้างนวัตกรรม และแหล่งเรียนรู้ด้วยองค์ความรู้ใหม่",
    "MissionCode": "4"
  }
],
  hosp: [
  {
    "Code": "1",
    "Name": "การจัดระบบบริการสุขภาพระดับอำเภอ เครือข่ายบริการแบบองค์รวม ที่มีคุณภาพมาตรฐาน และได้รับการยอมรับจากชุมชนโดยเคารพศักดิ์ศรีความเป็นมนุษย์"
  },
  {
    "Code": "2",
    "Name": "การพัฒนาบุคลากรให้มีศักยภาพและมีความพร้อมทั้งทางร่างกาย จิตใจ จิตวิญญาณในการให้บริการ พร้อมทั้งเสริมขวัญและกำลังใจ"
  },
  {
    "Code": "3",
    "Name": "การเสริมสร้างความเข้มแข็ง ให้กับชุมชนและภาคีเครือข่ายให้มีส่วนร่วมในการดูแลสุขภาพ"
  },
  {
    "Code": "4",
    "Name": "การเสริมสร้างบรรยากาศการทำงาน ร่วมกันแบบเชื่อมประสานและมีความสุข"
  },
  {
    "Code": "5",
    "Name": "การบริหารจัดการที่มีประสิทธิภาพและประสิทธิผล ภายใต้หลักธรรมาภิบาล"
  }
],
  departments: [
  {
    "Mission": "ภารกิจด้านอำนวยการ",
    "Name": "กลุ่มงานการเงิน"
  },
  {
    "Mission": "ภารกิจด้านอำนวยการ",
    "Name": "กลุ่มงานทรัพยากรบุคคล"
  },
  {
    "Mission": "ภารกิจด้านอำนวยการ",
    "Name": "กลุ่มงานบริหารทั่วไป"
  },
  {
    "Mission": "ภารกิจด้านอำนวยการ",
    "Name": "กลุ่มงานบัญชี"
  },
  {
    "Mission": "ภารกิจด้านอำนวยการ",
    "Name": "กลุ่มงานพัสดุ"
  },
  {
    "Mission": "ภารกิจด้านอำนวยการ",
    "Name": "กลุ่มงานโครงสร้างพื้นฐานและวิศวกรรมทางการแพทย์"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลจิตเวช"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลด้านการควบคุมและป้องกันการติดเชื้อ"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลตรวจรักษาพิเศษ"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลผู้คลอด"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลผู้ป่วยกุมารเวชกรรม"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลผู้ป่วยนอก"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลผู้ป่วยศัลยกรรม"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลผู้ป่วยสูติ - นรีเวช"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลผู้ป่วยหนัก"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลผู้ป่วยห้องผ่าตัด"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลผู้ป่วยออร์โธปิดิกส์"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลผู้ป่วยอายุกรรม"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลผู้ป่วยอายุรกรรม"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลผู้ป่วยอุบัติเหตุและฉุกเฉิน"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลผู้ป่วยโสต ศอ นาสิก จักษุ"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลผู้ป่วยใน"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานการพยาบาลวิสัญญี"
  },
  {
    "Mission": "ภารกิจด้านการพยาบาล",
    "Name": "กลุ่มงานวิสัญญีวิทยา"
  },
  {
    "Mission": "ภารกิจด้านบริการปฐมภูมิ",
    "Name": "กลุ่มงานการพยาบาลชุมชน"
  },
  {
    "Mission": "ภารกิจด้านบริการปฐมภูมิ",
    "Name": "กลุ่มงานการแพทย์"
  },
  {
    "Mission": "ภารกิจด้านบริการปฐมภูมิ",
    "Name": "กลุ่มงานการแพทย์แผนไทยและการแพทย์ทางเลือก"
  },
  {
    "Mission": "ภารกิจด้านบริการปฐมภูมิ",
    "Name": "กลุ่มงานผู้ป่วยนอก"
  },
  {
    "Mission": "ภารกิจด้านบริการปฐมภูมิ",
    "Name": "กลุ่มงานอาชีวเวชกรรม"
  },
  {
    "Mission": "ภารกิจด้านบริการปฐมภูมิ",
    "Name": "กลุ่มงานอายุรกรรม"
  },
  {
    "Mission": "ภารกิจด้านบริการปฐมภูมิ",
    "Name": "กลุ่มงานเวชกรรมสังคม"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานกุมารเวชกรรม"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานจักษุวิทยา"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานจิตเวชและยาเสพติด"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานทันตกรรม"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานผู้ป่วยนอก"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานพยาธิวิทยากายวิภาค"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานรังสีวิทยา"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานวิสัญญีวิทยา"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานศัลยกรรม"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานศัลยกรรมออร์โธปิดิกส์"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานสังคมสงเคราะห์"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานสูติ - นรีเวชกรรม"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานอายุรกรรม"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานเทคนิคการแพทย์และพยาธิวิทยาคลินิก"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานเภสัชกรรม"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานเวชกรรมฟื้นฟู"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานเวชกรรมสังคม"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานเวชศาสตร์ฉุกเฉิน"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานโภชนศาสตร์"
  },
  {
    "Mission": "ภารกิจด้านบริการทุติยภูมิและตติยภูมิ",
    "Name": "กลุ่มงานโสต ศอ นาสิก"
  },
  {
    "Mission": "ภารกิจด้านพัฒนาระบบบริการและสนับสนุนบริการสุขภาพ",
    "Name": "กลุ่มงานประกันสุขภาพ"
  },
  {
    "Mission": "ภารกิจด้านพัฒนาระบบบริการและสนับสนุนบริการสุขภาพ",
    "Name": "กลุ่มงานพัฒนาคุณภาพบริการและมาตรฐาน"
  },
  {
    "Mission": "ภารกิจด้านพัฒนาระบบบริการและสนับสนุนบริการสุขภาพ",
    "Name": "กลุ่มงานพัฒนาทรัพยากรบุคคล"
  },
  {
    "Mission": "ภารกิจด้านพัฒนาระบบบริการและสนับสนุนบริการสุขภาพ",
    "Name": "กลุ่มงานยุทธศาสตร์และแผนงานโครงการ"
  },
  {
    "Mission": "ภารกิจสุขภาพดิจิทัล",
    "Name": "กลุ่มงานสุขภาพดิจิทัล"
  },
  {
    "Mission": "ภารกิจสุขภาพดิจิทัล",
    "Name": "กลุ่มงานเทคโนโลยีสารสนเทศ"
  },
  {
    "Mission": "ภารกิจสุขภาพดิจิทัล",
    "Name": "กลุ่มงานเวชระเบียนและข้อมูลทางการแพทย์"
  }
]
};

// ---------------------------------------------------------------------------------
// ตัวช่วยทั่วไป
// ---------------------------------------------------------------------------------
function prop_(key, def) {
  var v = null; try { v = PropertiesService.getScriptProperties().getProperty(key); } catch (e) { v = null; }
  return (v === null || v === undefined || v === '') ? def : v;
}
function cfgNum_(key) { var d = parseFloat(PROP_DEFAULTS_[key]), v = parseFloat(prop_(key, PROP_DEFAULTS_[key])); return (isNaN(v) || v < 0) ? d : v; }
function orgName_() { return prop_('ORG_NAME', PROP_DEFAULTS_.ORG_NAME); }
function appLink_() { var u = prop_('APP_URL', ''); return u ? '\n\nเปิดระบบ: ' + u : ''; }
function maintenanceOn_() { return bool_(prop_('MAINTENANCE_MODE', 'FALSE')); }
function maxUploadBytes_() { return Math.max(1, cfgNum_('MAX_UPLOAD_MB')) * 1024 * 1024; }
function str_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function num_(v) {
  if (v === null || v === undefined || v === '' || v === '-') return 0;
  var n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
function bool_(v) { return v === true || String(v).toUpperCase() === 'TRUE' || String(v) === '1'; }
function round2_(n) { return Math.round((n + 1e-9) * 100) / 100; }
function nowIso_() { return Utilities.formatDate(new Date(), TZ_, "yyyy-MM-dd'T'HH:mm:ss"); }
function todayIso_() { return Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd'); }
function newId_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').substring(0, 10); }

/** แปลงค่าวันที่ (Date | 'yyyy-mm-dd' | 'yyyy-mm-ddThh:mm') เป็น 'yyyy-mm-dd' คืน '' ถ้าไม่ใช่วันที่ที่ถูกต้อง */
function dstr_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, TZ_, 'yyyy-MM-dd');
  }
  var m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  var y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return '';
  return m[1] + '-' + m[2] + '-' + m[3];
}
function dateObj_(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function daysBetween_(aIso, bIso) { var a = dateObj_(aIso), b = dateObj_(bIso); return (a && b) ? Math.round((b - a) / 86400000) : null; }
/** วันสิ้นสุดปีงบประมาณ (30 ก.ย. ของปี ค.ศ. = พ.ศ.-543) */
function fyEndIso_(yearBE) { return (yearBE - 543) + '-09-30'; }
function fyStartIso_(yearBE) { return (yearBE - 543 - 1) + '-10-01'; }
/** ลำดับเดือนในปีงบ (ต.ค.=0 ... ก.ย.=11) จาก ISO date */
function fyMonthIdx_(iso) { var m = parseInt(String(iso).substring(5, 7), 10); return (m + 2) % 12; }

function ApiError_(code, message) { var e = new Error(message); e.apiCode = code; return e; }
function fail_(code, message) { throw ApiError_(code, message); }

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------------
// ชั้นฐานข้อมูล (Google Sheets)
// ---------------------------------------------------------------------------------
var CACHE_ = {}; // แคชต่อการเรียก 1 ครั้ง (ล้างเมื่อมีการเขียน)

function ss_() {
  if (CACHE_.__ss) return CACHE_.__ss;
  var id = prop_('SS_ID', '');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('ไม่พบ Spreadsheet: กรุณาตั้ง Script property SS_ID');
  CACHE_.__ss = ss;
  return ss;
}
function sheet_(name) {
  if (!SCHEMA_[name]) throw new Error('ไม่รู้จักชีต ' + name);
  var sh = ss_().getSheetByName(name);
  if (!sh && name === 'Records') { sh = ensureSheet_(name, { created: [], fixed: [], warnings: [] }); } // v2.4: ชีตใหม่สร้างให้เอง
  if (!sh) throw new Error('ยังไม่มีชีต "' + name + '" กรุณารัน setupSheet() ก่อน');
  var mk = 'm_' + name;
  if (!CACHE_[mk]) { // v2.3: ชีตเดิมที่ยังไม่มีคอลัมน์ใหม่ (เช่น Activities.Progress) -> ขยายและเติมหัวตารางให้เอง
    CACHE_[mk] = true;
    var need = SCHEMA_[name].length;
    if (sh.getMaxColumns() < need) sh.insertColumnsAfter(sh.getMaxColumns(), need - sh.getMaxColumns());
    if (sh.getLastColumn() < need || String(sh.getRange(1, need).getValue()).trim() === '') sh.getRange(1, need).setValue(SCHEMA_[name][need - 1]);
  }
  return sh;
}
function invalidate_(name) {
  if (name) { delete CACHE_['t_' + name]; if (name === 'Settings') delete CACHE_.settings; }
  else CACHE_ = { __ss: CACHE_.__ss };
}

/** อ่านทั้งชีตเป็น array ของ object (มี _row = เลขแถวจริง) */
function readAll_(name) {
  var key = 't_' + name;
  if (CACHE_[key]) return CACHE_[key];
  var sh = sheet_(name), cols = SCHEMA_[name];
  var last = sh.getLastRow();
  var out = [];
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, cols.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var row = vals[i], empty = true, o = { _row: i + 2 };
      for (var c = 0; c < cols.length; c++) {
        var cell = row[c];
        // กันชีตแปลงข้อความเวลา/วันที่เป็น Date เอง: คืนเป็นข้อความ ISO เสมอ
        if (Object.prototype.toString.call(cell) === '[object Date]' && TEXT_COLS_.indexOf(cols[c]) >= 0 && !isNaN(cell.getTime())) {
          cell = Utilities.formatDate(cell, TZ_, TIME_COLS_.indexOf(cols[c]) >= 0 ? "yyyy-MM-dd'T'HH:mm:ss" : 'yyyy-MM-dd');
        }
        o[cols[c]] = cell;
        if (cell !== '' && cell !== null) empty = false;
      }
      if (!empty) out.push(o);
    }
  }
  CACHE_[key] = out;
  return out;
}
/** กันการฉีดสูตรเข้าชีต: ข้อความที่ขึ้นต้นด้วย = + @ (หรือ - ตามด้วยตัวเลข/สูตร) จะถูกบังคับเป็นข้อความธรรมดา */
function safeCell_(v) {
  if (typeof v !== 'string' || !v) return v;
  return (/^[=+@]/.test(v) || /^-\s*[\d=+@(]/.test(v)) ? "'" + v : v;
}
function safeUrl_(u) { u = str_(u); return /^https?:\/\//i.test(u) ? u : ''; }
function toRow_(name, obj) {
  return SCHEMA_[name].map(function (c) { var v = obj[c]; return (v === undefined || v === null) ? '' : safeCell_(v); });
}
function insert_(name, obj) {
  var sh = sheet_(name);
  sh.appendRow(toRow_(name, obj));
  invalidate_(name);
  return obj;
}
function insertMany_(name, objs) {
  if (!objs.length) return;
  var sh = sheet_(name), cols = SCHEMA_[name];
  var rows = objs.map(function (o) { return toRow_(name, o); });
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, cols.length).setValues(rows);
  invalidate_(name);
}
function update_(name, rowNum, obj) {
  var sh = sheet_(name), cols = SCHEMA_[name];
  sh.getRange(rowNum, 1, 1, cols.length).setValues([toRow_(name, obj)]);
  invalidate_(name);
}
function removeRows_(name, rowNums) {
  var sh = sheet_(name);
  rowNums.slice().sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
  invalidate_(name);
}
function findBy_(name, col, val) {
  var rows = readAll_(name), v = String(val);
  for (var i = 0; i < rows.length; i++) if (String(rows[i][col]) === v) return rows[i];
  return null;
}
function stripRow_(o) { var c = {}; for (var k in o) if (k !== '_row') c[k] = o[k]; return c; }

function audit_(email, action, entity, entityId, detail) {
  try {
    insert_('AuditLog', { Time: nowIso_(), Email: email || '', Action: action, Entity: entity || '', EntityId: entityId || '',
      Detail: String(detail || '').substring(0, 800) });
  } catch (e) { /* บันทึก audit ล้มเหลวต้องไม่ทำให้งานหลักพัง */ }
}

function getSettings_() {
  if (CACHE_.settings) return CACHE_.settings;
  var s = {};
  readAll_('Settings').forEach(function (r) { s[r.Key] = String(r.Value); });
  DEFAULT_SETTINGS_.forEach(function (d) { if (s[d[0]] === undefined) s[d[0]] = d[1]; });
  CACHE_.settings = s;
  return s;
}

// ---------------------------------------------------------------------------------
// การยืนยันตัวตน: Google Sign-In (ID token) + แอดมินอนุมัติก่อนใช้งาน
// ---------------------------------------------------------------------------------
function tokenSecret_() {
  var s = prop_('TOKEN_SECRET', '');
  if (!s) throw new Error('ยังไม่ได้ตั้ง TOKEN_SECRET กรุณารัน setupSheet() ก่อน');
  return s;
}
function b64urlStr_(s) { return Utilities.base64EncodeWebSafe(s, Utilities.Charset.UTF_8); }
function hmac_(data) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(data, tokenSecret_())); }
function safeEq_(a, b) {
  if (a.length !== b.length) return false;
  var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function sessionHours_() { var h = parseFloat(prop_('SESSION_HOURS', '12')); return (isNaN(h) || h <= 0) ? 12 : h; }

function signToken_(email) {
  var exp = Math.floor(Date.now() / 1000 + sessionHours_() * 3600);
  var payload = b64urlStr_(JSON.stringify({ e: email, x: exp }));
  return { token: payload + '.' + hmac_(payload), expiresAt: exp * 1000 };
}
function verifyToken_(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  var parts = token.split('.');
  if (parts.length !== 2 || !safeEq_(hmac_(parts[0]), parts[1])) return null;
  try {
    var p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (!p.e || !p.x || p.x < Date.now() / 1000) return null;
    return p;
  } catch (e) { return null; }
}

/** ตรวจ Google ID token ผ่าน tokeninfo ของ Google และเทียบ aud กับ GOOGLE_CLIENT_ID */
function verifyGoogleIdToken_(idToken) {
  var clientId = prop_('GOOGLE_CLIENT_ID', '');
  if (!clientId) fail_('CONFIG', 'ยังไม่ได้ตั้ง GOOGLE_CLIENT_ID ใน Script properties');
  if (!idToken) fail_('AUTH', 'ไม่พบ ID token');
  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) fail_('AUTH', 'ยืนยันตัวตนกับ Google ไม่สำเร็จ กรุณาลองเข้าสู่ระบบใหม่');
  var c = JSON.parse(resp.getContentText());
  if (c.aud !== clientId) fail_('AUTH', 'Client ID ไม่ตรงกับระบบ (ตรวจ GOOGLE_CLIENT_ID)');
  if (c.iss !== 'accounts.google.com' && c.iss !== 'https://accounts.google.com') fail_('AUTH', 'ผู้ออก token ไม่ถูกต้อง');
  if (String(c.email_verified) !== 'true') fail_('AUTH', 'อีเมลนี้ยังไม่ได้รับการยืนยันจาก Google');
  if (Number(c.exp) < Date.now() / 1000) fail_('AUTH', 'token หมดอายุ กรุณาเข้าสู่ระบบใหม่');
  return c;
}

function adminEmails_() {
  return prop_('ADMIN_EMAILS', '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
}
function userRow_(email) {
  var e = String(email).toLowerCase(), rows = readAll_('Users');
  for (var i = 0; i < rows.length; i++) if (String(rows[i].Email).toLowerCase() === e) return rows[i];
  return null;
}
function publicUser_(u) {
  return { email: u.Email, name: u.Name, role: u.Role, status: u.Status, department: u.Department || '', personName: u.PersonName || '', picture: u.Picture || '' };
}
function linkPersonName_(email) {
  var e = String(email).toLowerCase(), ppl = readAll_('People');
  for (var i = 0; i < ppl.length; i++) if (ppl[i].Email && String(ppl[i].Email).toLowerCase() === e) return ppl[i];
  return null;
}

function sendMailSafe_(to, subject, body) {
  try { if (to) MailApp.sendEmail({ to: to, subject: subject, body: body }); } catch (e) { /* โควตา/สิทธิ์อีเมล ไม่ควรทำให้ล็อกอินพัง */ }
}
function notifyAdminsNewUser_(u) {
  var to = prop_('ADMIN_NOTIFY_EMAIL', '');
  if (!to) {
    to = readAll_('Users').filter(function (r) { return r.Role === 'admin' && r.Status === 'approved'; })
      .map(function (r) { return r.Email; }).join(',');
  }
  sendMailSafe_(to, 'มีผู้ขอสิทธิ์เข้าใช้งานระบบแผนงานโครงการ ' + orgName_(),
    'ผู้ใช้ ' + (u.Name || '-') + ' <' + u.Email + '> ขอสิทธิ์เข้าใช้งานระบบ\nกรุณาเข้าสู่ระบบ > เมนู "ผู้ใช้งาน" เพื่ออนุมัติหรือปฏิเสธ' + appLink_());
}

/** ล็อกอินด้วย Google: คืน status = approved | pending | rejected | suspended */
function loginGoogle_(p) {
  var claims = verifyGoogleIdToken_(p.idToken);
  var email = String(claims.email).toLowerCase();
  var u = userRow_(email);
  var isBootAdmin = adminEmails_().indexOf(email) >= 0;
  var now = nowIso_();
  var allowedDomains = prop_('ALLOWED_EMAIL_DOMAINS', '').toLowerCase().split(',').map(function (s) { return s.trim(); }).filter(String);
  if (!u && !isBootAdmin && allowedDomains.length && allowedDomains.indexOf(email.split('@')[1] || '') < 0) fail_('AUTH', 'อีเมลนี้ไม่อยู่ในโดเมนที่ระบบอนุญาต (' + allowedDomains.join(', ') + ') กรุณาใช้อีเมลหน่วยงาน');

  if (!u) {
    u = {
      Email: email, Name: claims.name || email, Role: isBootAdmin ? 'admin' : 'user', Status: isBootAdmin ? 'approved' : 'pending',
      Department: '', PersonName: '', Picture: claims.picture || '', RequestedAt: now,
      ApprovedBy: isBootAdmin ? '(ADMIN_EMAILS)' : '', ApprovedAt: isBootAdmin ? now : '', LastLoginAt: '', Note: ''
    };
    insert_('Users', u);
    u = userRow_(email);
    audit_(email, isBootAdmin ? 'สร้างบัญชีแอดมินแรก' : 'ขอสิทธิ์เข้าใช้งาน', 'User', email, claims.name || '');
    if (!isBootAdmin) notifyAdminsNewUser_(u);
  } else if (isBootAdmin && (u.Role !== 'admin' || u.Status !== 'approved')) {
    // อีเมลที่อยู่ใน ADMIN_EMAILS ต้องเข้าได้เสมอ (กันแอดมินล็อกตัวเองออก)
    u.Role = 'admin'; u.Status = 'approved'; u.ApprovedBy = '(ADMIN_EMAILS)'; u.ApprovedAt = now;
  }

  if (u.Status !== 'approved') {
    u.Picture = keepAvatar_(u, claims); update_('Users', u._row, u);
    var msg = u.Status === 'pending' ? 'บัญชีของท่านอยู่ระหว่างรอผู้ดูแลระบบอนุมัติ'
      : u.Status === 'rejected' ? 'คำขอของท่านไม่ได้รับอนุมัติ กรุณาติดต่อผู้ดูแลระบบ'
      : 'บัญชีของท่านถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ';
    return { status: u.Status, message: msg, email: email, name: u.Name };
  }

  u.LastLoginAt = now; u.Picture = keepAvatar_(u, claims);
  if (!u.Name) u.Name = claims.name || email;
  if (!u.PersonName) { var pp = linkPersonName_(email); if (pp) { u.PersonName = pp.Name; if (!u.Department) u.Department = pp.Department; } }
  update_('Users', u._row, u);
  var t = signToken_(email);
  audit_(email, 'เข้าสู่ระบบ', 'User', email, '');
  return { status: 'approved', token: t.token, expiresAt: t.expiresAt, user: publicUser_(u) };
}

/** ตรวจ token และสิทธิ์ผู้ใช้ปัจจุบันจากชีต (สิทธิ์เปลี่ยนมีผลทันที) */
function requireUser_(token, minRole) {
  var p = verifyToken_(token);
  if (!p) fail_('AUTH', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  var u = userRow_(p.e);
  if (!u || u.Status !== 'approved') fail_('AUTH', 'บัญชีนี้ไม่มีสิทธิ์เข้าใช้งาน');
  if (minRole && ROLES_.indexOf(u.Role) < ROLES_.indexOf(minRole)) fail_('FORBIDDEN', 'ท่านไม่มีสิทธิ์ดำเนินการนี้');
  return u;
}

// ---------------------------------------------------------------------------------
// จัดการผู้ใช้ (เฉพาะแอดมิน)
// ---------------------------------------------------------------------------------
function usersList_(admin) {
  return readAll_('Users').map(function (r) {
    var o = stripRow_(r);
    o.RequestedAt = String(o.RequestedAt); o.ApprovedAt = String(o.ApprovedAt); o.LastLoginAt = String(o.LastLoginAt);
    return o;
  });
}

function usersUpdate_(admin, p) {
  var u = userRow_(p.email);
  if (!u) fail_('NOT_FOUND', 'ไม่พบผู้ใช้');
  var before = u.Status + '/' + u.Role;
  var isSelf = String(u.Email).toLowerCase() === String(admin.Email).toLowerCase();

  if (p.status !== undefined) {
    if (USER_STATUSES_.indexOf(p.status) < 0) fail_('VALIDATION', 'สถานะไม่ถูกต้อง');
    if (isSelf && p.status !== 'approved') fail_('VALIDATION', 'ไม่สามารถระงับ/ปฏิเสธบัญชีของตนเองได้');
    var wasApproved = u.Status === 'approved';
    u.Status = p.status;
    if (p.status === 'approved' && !wasApproved) {
      u.ApprovedBy = admin.Email; u.ApprovedAt = nowIso_();
      sendMailSafe_(u.Email, 'บัญชีของท่านได้รับอนุมัติแล้ว - ระบบแผนงานโครงการ ' + orgName_(),
        'สวัสดีคุณ ' + (u.Name || '') + '\nผู้ดูแลระบบอนุมัติสิทธิ์เข้าใช้งานแล้ว สามารถเข้าสู่ระบบด้วยบัญชี Google นี้ได้ทันที' + appLink_());
    }
  }
  if (p.role !== undefined) {
    if (ROLES_.indexOf(p.role) < 0) fail_('VALIDATION', 'บทบาทไม่ถูกต้อง');
    if (isSelf && p.role !== 'admin') fail_('VALIDATION', 'ไม่สามารถลดสิทธิ์แอดมินของตนเองได้');
    u.Role = p.role;
  }
  if (p.name !== undefined) u.Name = str_(p.name);
  if (p.department !== undefined) u.Department = str_(p.department);
  if (p.personName !== undefined) u.PersonName = str_(p.personName);
  if (p.note !== undefined) u.Note = str_(p.note);
  update_('Users', u._row, u);
  audit_(admin.Email, 'แก้ไขผู้ใช้', 'User', u.Email, before + ' -> ' + u.Status + '/' + u.Role);
  return stripRow_(u);
}

function usersDelete_(admin, p) {
  var u = userRow_(p.email);
  if (!u) fail_('NOT_FOUND', 'ไม่พบผู้ใช้');
  if (String(u.Email).toLowerCase() === String(admin.Email).toLowerCase()) fail_('VALIDATION', 'ไม่สามารถลบบัญชีของตนเองได้');
  removeRows_('Users', [u._row]);
  audit_(admin.Email, 'ลบผู้ใช้', 'User', u.Email, '');
  return { deleted: true };
}

// ---------------------------------------------------------------------------------
// ข้อมูลหลัก (Masters) + ตั้งค่า
// ---------------------------------------------------------------------------------
var MASTERS_ = {
  funds:      { sheet: 'Funds', key: 'Code', label: 'แหล่งเงิน', cols: [
    { name: 'Code', label: 'รหัส', type: 'text', required: true }, { name: 'Name', label: 'ชื่อแหล่งเงิน', type: 'text', required: true },
    { name: 'StrategySet', label: 'ชุดยุทธศาสตร์', type: 'select', options: ['hospital', 'region'], required: true },
    { name: 'InHospitalKpi', label: 'นับใน KPI รพ.', type: 'bool' }, { name: 'SortOrder', label: 'ลำดับ', type: 'number' }, { name: 'Active', label: 'ใช้งาน', type: 'bool' }] },
  categories: { sheet: 'Categories', key: 'Code', label: 'หมวดค่าใช้จ่าย', cols: [
    { name: 'Code', label: 'รหัส', type: 'text', required: true }, { name: 'Name', label: 'ชื่อหมวด', type: 'text', required: true },
    { name: 'SortOrder', label: 'ลำดับ', type: 'number' }, { name: 'Active', label: 'ใช้งาน', type: 'bool' }] },
  planTypes:  { sheet: 'PlanTypes', key: 'Code', label: 'ประเภทแผน', cols: [
    { name: 'Code', label: 'รหัส', type: 'text', required: true }, { name: 'Name', label: 'ชื่อประเภท', type: 'text', required: true },
    { name: 'SortOrder', label: 'ลำดับ', type: 'number' }, { name: 'Active', label: 'ใช้งาน', type: 'bool' }] },
  moph:       { sheet: 'StrategyMoph', key: 'Code', label: 'ยุทธศาสตร์กระทรวง สธ.', cols: [
    { name: 'Code', label: 'รหัส', type: 'text', required: true }, { name: 'Name', label: 'ชื่อ', type: 'text', required: true },
    { name: 'SortOrder', label: 'ลำดับ', type: 'number' }, { name: 'Active', label: 'ใช้งาน', type: 'bool' }] },
  mission:    { sheet: 'StrategyMission', key: 'Code', label: 'พันธกิจ สสจ.เชียงใหม่', cols: [
    { name: 'Code', label: 'รหัส', type: 'text', required: true }, { name: 'Name', label: 'ชื่อ', type: 'text', required: true },
    { name: 'SortOrder', label: 'ลำดับ', type: 'number' }, { name: 'Active', label: 'ใช้งาน', type: 'bool' }] },
  prov:       { sheet: 'StrategyProv', key: 'Code', label: 'ยุทธศาสตร์ สสจ.เชียงใหม่', cols: [
    { name: 'Code', label: 'รหัส', type: 'text', required: true }, { name: 'Name', label: 'ชื่อ', type: 'text', required: true },
    { name: 'MissionCode', label: 'พันธกิจแม่ (รหัส)', type: 'text', required: true },
    { name: 'SortOrder', label: 'ลำดับ', type: 'number' }, { name: 'Active', label: 'ใช้งาน', type: 'bool' }] },
  hosp:       { sheet: 'StrategyHosp', key: 'Code', label: 'ยุทธศาสตร์ รพ.สันทราย', cols: [
    { name: 'Code', label: 'รหัส', type: 'text', required: true }, { name: 'Name', label: 'ชื่อ', type: 'text', required: true },
    { name: 'SortOrder', label: 'ลำดับ', type: 'number' }, { name: 'Active', label: 'ใช้งาน', type: 'bool' }] },
  departments:{ sheet: 'Departments', key: 'Name', label: 'กลุ่มงาน', cols: [
    { name: 'Name', label: 'ชื่อกลุ่มงาน', type: 'text', required: true }, { name: 'Mission', label: 'กลุ่มภารกิจ', type: 'text', required: true },
    { name: 'Active', label: 'ใช้งาน', type: 'bool' }] },
  people:     { sheet: 'People', key: 'Name', label: 'ผู้รับผิดชอบ/บุคลากร', cols: [
    { name: 'Name', label: 'ชื่อ-สกุล', type: 'text', required: true }, { name: 'Department', label: 'กลุ่มงาน', type: 'text' },
    { name: 'Email', label: 'อีเมล Gmail (ผูกกับบัญชีผู้ใช้)', type: 'text' }, { name: 'Active', label: 'ใช้งาน', type: 'bool' }] }
};

function mastersGet_() {
  var out = { schema: {}, data: {}, limits: { maxUploadMb: cfgNum_('MAX_UPLOAD_MB') }, settings: getSettings_(), enums: { planStatuses: PLAN_STATUSES_, actStatuses: ACT_STATUSES_, adjTypes: ADJ_TYPES_, roles: ROLES_, userStatuses: USER_STATUSES_, actExcluded: ACT_EXCLUDED_ } };
  Object.keys(MASTERS_).forEach(function (k) {
    var m = MASTERS_[k];
    out.schema[k] = { label: m.label, key: m.key, cols: m.cols };
    out.data[k] = readAll_(m.sheet).map(function (r) {
      var o = {}; m.cols.forEach(function (c) { o[c.name] = (c.type === 'bool') ? (r[c.name] === '' ? true : bool_(r[c.name])) : (c.type === 'number' ? num_(r[c.name]) : String(r[c.name] === null ? '' : r[c.name])); });
      return o;
    }).sort(function (a, b) { return (a.SortOrder || 0) - (b.SortOrder || 0); });
  });
  return out;
}

function coerceMaster_(m, row) {
  var o = {};
  m.cols.forEach(function (c) {
    var v = row[c.name];
    if (c.type === 'bool') o[c.name] = (v === undefined || v === '') ? true : bool_(v);
    else if (c.type === 'number') o[c.name] = num_(v);
    else o[c.name] = str_(v);
    if (c.required && (o[c.name] === '' || o[c.name] === undefined)) fail_('VALIDATION', 'กรุณากรอก "' + c.label + '"');
    if (c.type === 'select' && c.options.indexOf(o[c.name]) < 0) fail_('VALIDATION', '"' + c.label + '" ไม่ถูกต้อง');
  });
  return o;
}

function mastersSave_(admin, p) {
  var m = MASTERS_[p.table];
  if (!m) fail_('VALIDATION', 'ไม่รู้จักตารางข้อมูลหลัก');
  var obj = coerceMaster_(m, p.row || {});
  var existing = findBy_(m.sheet, m.key, obj[m.key]);
  if (p.isNew && existing) fail_('VALIDATION', 'มี "' + obj[m.key] + '" อยู่แล้ว');
  if (!p.isNew && !existing) fail_('NOT_FOUND', 'ไม่พบรายการที่จะแก้ไข');
  if (p.table === 'prov' && !findBy_('StrategyMission', 'Code', obj.MissionCode)) fail_('VALIDATION', 'ไม่พบพันธกิจรหัส ' + obj.MissionCode);
  if (p.table === 'people' && obj.Email) {
    var dup = readAll_('People').filter(function (r) { return r.Name !== obj.Name && String(r.Email).toLowerCase() === obj.Email.toLowerCase(); });
    if (dup.length) fail_('VALIDATION', 'อีเมลนี้ผูกกับ "' + dup[0].Name + '" อยู่แล้ว');
  }
  if (existing) update_(m.sheet, existing._row, obj); else insert_(m.sheet, obj);
  audit_(admin.Email, p.isNew ? 'เพิ่มข้อมูลหลัก' : 'แก้ไขข้อมูลหลัก', m.label, obj[m.key], '');
  return obj;
}

function settingsSave_(admin, p) {
  var key = str_(p.key), val = str_(p.value);
  var def = DEFAULT_SETTINGS_.filter(function (d) { return d[0] === key; })[0];
  if (!def) fail_('VALIDATION', 'ไม่รู้จักการตั้งค่า ' + key);
  if (key === 'CurrentYear' && !/^25\d\d$/.test(val)) fail_('VALIDATION', 'ปีงบประมาณต้องเป็น พ.ศ. 4 หลัก เช่น 2569');
  if ((key === 'ExcludeCancelledFromRate' || key === 'ImportLocked' || key === 'RequireReasonAfterApproval' || key === 'LockClosedPlans') && ['TRUE', 'FALSE'].indexOf(val.toUpperCase()) < 0) fail_('VALIDATION', 'ค่าต้องเป็น TRUE หรือ FALSE');
  if (key === 'UserEditScope' && ['all', 'own'].indexOf(val) < 0) fail_('VALIDATION', 'ค่าต้องเป็น all หรือ own');
  if (key === 'FileSharing' && ['link', 'private'].indexOf(val) < 0) fail_('VALIDATION', 'ค่าต้องเป็น link หรือ private');
  if (key === 'SummaryGraceDays' && !(num_(val) >= 0)) fail_('VALIDATION', 'จำนวนวันต้องเป็นตัวเลข');
  if (/^(TRUE|FALSE)$/i.test(val)) val = val.toUpperCase();
  var row = findBy_('Settings', 'Key', key);
  if (row) { row.Value = val; update_('Settings', row._row, row); } else insert_('Settings', { Key: key, Value: val, Description: def[2] });
  delete CACHE_.settings;
  audit_(admin.Email, 'แก้ไขตั้งค่า', 'Settings', key, val);
  return { key: key, value: val };
}

// ---------------------------------------------------------------------------------
// การคำนวณงบ/เบิกจ่าย (คำนวณเสมอ ไม่ให้ผู้ใช้พิมพ์ยอดรวม)
// ---------------------------------------------------------------------------------
function groupBy_(rows, col) {
  var m = {};
  rows.forEach(function (r) { var k = String(r[col]); (m[k] = m[k] || []).push(r); });
  return m;
}
function fundMap_() { var m = {}; readAll_('Funds').forEach(function (f) { m[f.Code] = f; }); return m; }

function calcActivity_(act, lines, disbs, adjs) {
  var budget = 0; lines.forEach(function (l) { budget += num_(l.Amount); });
  var paid = 0; disbs.forEach(function (d) { paid += num_(d.Amount); });
  var inc = 0, cut = 0, refund = 0;
  adjs.forEach(function (a) {
    var amt = num_(a.Amount);
    if (a.Type === 'ปรับเพิ่มงบ') inc += amt; else if (a.Type === 'ปรับลดงบ') cut += amt; else if (a.Type === 'คืนเงิน') refund += amt;
  });
  var netPaid = paid - refund;
  var planned = Math.max(0, budget + inc - cut);
  var excluded = ACT_EXCLUDED_.indexOf(act.Status) >= 0;
  var active = excluded ? Math.max(0, netPaid) : planned;
  return {
    budget: round2_(budget), adjInc: round2_(inc), adjCut: round2_(cut), refund: round2_(refund), paid: round2_(paid), netPaid: round2_(netPaid),
    plannedBudget: round2_(planned), activeBudget: round2_(active), released: round2_(excluded ? Math.max(0, planned - netPaid) : 0),
    remaining: round2_(active - netPaid), pct: active > 0 ? round2_(netPaid / active * 100) : 0, excluded: excluded
  };
}

function execState_(c) {
  if (c.activeBudget <= 0 && c.netPaid <= 0) return 'ไม่มีงบ';
  if (c.netPaid <= 0) return 'ยังไม่เบิก';
  if (c.netPaid >= c.activeBudget - 0.5) return 'เบิกครบ';
  return 'เบิกบางส่วน';
}

/** ประกอบโมเดลทั้งปี: คืน {plans:[{plan, acts:[{act, lines, disbs, adjs, calc}], planAdjs, calc, overdue}] } */
function buildModel_(year, opts) {
  opts = opts || {};
  var settings = getSettings_();
  var grace = num_(settings.SummaryGraceDays), today = todayIso_();
  var plans = readAll_('Plans').filter(function (p) { return String(p.Year) === String(year) && (opts.includeDeleted || !bool_(p.IsDeleted)); });
  var planIds = {}; plans.forEach(function (p) { planIds[p.PlanId] = true; });
  var acts = readAll_('Activities').filter(function (a) { return planIds[a.PlanId] && !bool_(a.IsDeleted); });
  var actIds = {}; acts.forEach(function (a) { actIds[a.ActId] = true; });
  var linesBy = groupBy_(readAll_('BudgetLines').filter(function (l) { return actIds[l.ActId]; }), 'ActId');
  var disbBy = groupBy_(readAll_('Disbursements').filter(function (d) { return planIds[d.PlanId]; }), 'ActId');
  var adjAll = readAll_('Adjustments').filter(function (a) { return planIds[a.PlanId]; });
  var adjByAct = groupBy_(adjAll.filter(function (a) { return a.ActId; }), 'ActId');
  var planAdjBy = groupBy_(adjAll.filter(function (a) { return !a.ActId; }), 'PlanId');
  var actsBy = groupBy_(acts, 'PlanId');
  var planLevelDisbBy = groupBy_(readAll_('Disbursements').filter(function (d) { return planIds[d.PlanId] && !d.ActId; }), 'PlanId');
  var fy = fyEndIso_(parseInt(year, 10));

  var out = plans.map(function (p) {
    var list = (actsBy[p.PlanId] || []).slice().sort(function (a, b) { return (num_(a.SortOrder) - num_(b.SortOrder)) || String(a.No).localeCompare(String(b.No)); });
    var items = list.map(function (a) {
      var l = linesBy[a.ActId] || [], d = (disbBy[a.ActId] || []).slice().sort(function (x, y) { return num_(x.Seq) - num_(y.Seq); }), j = adjByAct[a.ActId] || [];
      return { act: a, lines: l, disbs: d, adjs: j, calc: calcActivity_(a, l, d, j) };
    });
    var pl = planLevelDisbBy[p.PlanId] || [];
    var pAdj = planAdjBy[p.PlanId] || [];
    var t = { plannedBudget: 0, activeBudget: 0, netPaid: 0, paid: 0, released: 0, refund: 0, adjInc: 0, adjCut: 0, budget: 0 };
    items.forEach(function (x) { ['plannedBudget', 'activeBudget', 'netPaid', 'paid', 'released', 'refund', 'adjInc', 'adjCut', 'budget'].forEach(function (k) { t[k] += x.calc[k]; }); });
    pl.forEach(function (d) { t.paid += num_(d.Amount); t.netPaid += num_(d.Amount); });
    pAdj.forEach(function (a) {
      var amt = num_(a.Amount);
      if (a.Type === 'คืนเงิน') { t.refund += amt; t.netPaid -= amt; } else if (a.Type === 'ปรับลดงบ') { t.adjCut += amt; t.plannedBudget -= amt; t.activeBudget -= amt; }
      else if (a.Type === 'ปรับเพิ่มงบ') { t.adjInc += amt; t.plannedBudget += amt; t.activeBudget += amt; }
    });
    if (p.Status === 'ยกเลิก') { t.released = Math.max(0, t.plannedBudget - t.netPaid); t.activeBudget = Math.max(0, t.netPaid); }
    Object.keys(t).forEach(function (k) { t[k] = round2_(t[k]); });
    t.remaining = round2_(t.activeBudget - t.netPaid);
    t.pct = t.activeBudget > 0 ? round2_(t.netPaid / t.activeBudget * 100) : 0;
    t.grossPct = t.plannedBudget > 0 ? round2_(t.netPaid / t.plannedBudget * 100) : 0;
    t.execState = execState_(t);
    t.actCount = items.length;
    t.activeActCount = items.filter(function (x) { return !x.calc.excluded; }).length;
    t.noDateCount = items.filter(function (x) { return !x.calc.excluded && x.calc.plannedBudget > 0 && !dstr_(x.act.PlanStart); }).length;
    t.noEvidenceCount = items.reduce(function (n, x) { return n + x.disbs.filter(function (d) { return !str_(d.EvidenceUrl); }).length; }, 0);
    var od = overdueInfo_(p, items, t, today, grace, fy);
    return { plan: p, items: items, planAdjs: pAdj, calc: t, overdue: od };
  });
  return out;
}

/** กติกา "ค้างส่งสรุปโครงการ" (คำนวณอัตโนมัติ แทนแท็บที่ลอกมือ) */
function overdueInfo_(p, items, t, today, grace, fyEnd) {
  var none = { is: false, reason: '', daysLate: 0 };
  if (bool_(p.SummarySent) || ['ยกเลิก', 'ร่าง', 'ส่งสรุปแล้ว', 'ปิด'].indexOf(p.Status) >= 0) return none;
  var active = items.filter(function (x) { return !x.calc.excluded; });
  if (!active.length && t.netPaid <= 0) return none;
  var budgeted = active.filter(function (x) { return x.calc.plannedBudget > 0; });
  var allPaid = budgeted.length > 0 && budgeted.every(function (x) { return x.calc.netPaid >= x.calc.plannedBudget - 0.5; });
  var lastEnd = '';
  active.forEach(function (x) { var e = dstr_(x.act.PlanEnd) || dstr_(x.act.PlanStart); if (e && e > lastEnd) lastEnd = e; });
  if (allPaid) return { is: true, reason: 'เบิกจ่ายครบทุกกิจกรรมแล้ว แต่ยังไม่ส่งสรุปโครงการ', daysLate: lastEnd ? Math.max(0, daysBetween_(lastEnd, today) || 0) : 0 };
  if (lastEnd) {
    var late = daysBetween_(lastEnd, today);
    if (late !== null && late > grace) return { is: true, reason: 'กิจกรรมสุดท้ายสิ้นสุดแล้ว ' + late + ' วัน (เกินกำหนด ' + grace + ' วัน) ยังไม่ส่งสรุป', daysLate: late };
  }
  if (today > fyEnd && t.netPaid > 0) return { is: true, reason: 'สิ้นสุดปีงบประมาณแล้ว แต่ยังไม่ส่งสรุปโครงการ', daysLate: Math.max(0, daysBetween_(fyEnd, today) || 0) };
  return none;
}

function planBrief_(m) {
  var p = stripRow_(m.plan);
  p.IsDeleted = bool_(p.IsDeleted); p.SummarySent = bool_(p.SummarySent);
  ['ReturnDate', 'SummarySentDate'].forEach(function (k) { p[k] = dstr_(p[k]); });
  p.Year = String(p.Year); p.Seq = String(p.Seq); p.ProjectNo = String(p.ProjectNo);
  p.CreatedAt = String(p.CreatedAt); p.UpdatedAt = String(p.UpdatedAt);
  var today = todayIso_(), span = { start: '', end: '', acts: 0, done: 0 };
  (m.items || []).forEach(function (x) {
    if (x.act.Status === 'ยกเลิก') return;
    span.acts++; if (actProgress_(x, today, m.plan.Status) === 'done') span.done++;
    var s = dstr_(x.act.PlanStart), e = dstr_(x.act.PlanEnd) || s;
    if (s && (!span.start || s < span.start)) span.start = s;
    if (e && e > span.end) span.end = e;
  });
  return { plan: p, calc: m.calc, overdue: m.overdue, span: span };
}
function actFull_(x) {
  var a = stripRow_(x.act);
  a.PlanStart = dstr_(a.PlanStart); a.PlanEnd = dstr_(a.PlanEnd); a.No = String(a.No); a.IsDeleted = false;
  a.CreatedAt = String(a.CreatedAt); a.UpdatedAt = String(a.UpdatedAt);
  return {
    act: a,
    lines: x.lines.map(function (l) { return { LineId: l.LineId, CategoryCode: String(l.CategoryCode), Amount: num_(l.Amount), Detail: String(l.Detail || '') }; }),
    disbs: x.disbs.map(disbOut_),
    adjs: x.adjs.map(adjOut_), calc: x.calc
  };
}
function disbOut_(d) {
  var o = stripRow_(d);
  ['ApproveDate', 'PayRequestDate', 'PaidDate'].forEach(function (k) { o[k] = dstr_(o[k]); });
  o.Seq = num_(o.Seq); o.Amount = num_(o.Amount); o.CreatedAt = String(o.CreatedAt); o.UpdatedAt = String(o.UpdatedAt);
  return o;
}
function adjOut_(a) { var o = stripRow_(a); o.Date = dstr_(o.Date); o.Amount = num_(o.Amount); o.CreatedAt = String(o.CreatedAt); return o; }

// ---------------------------------------------------------------------------------
// แผนงาน (Plans)
// ---------------------------------------------------------------------------------
function planOrder_(a, b, fm) {
  var fa = fm[a.plan.FundCode] ? num_(fm[a.plan.FundCode].SortOrder) : 99, fb = fm[b.plan.FundCode] ? num_(fm[b.plan.FundCode].SortOrder) : 99;
  return (fa - fb) || (num_(a.plan.Seq) - num_(b.plan.Seq)) || String(a.plan.Name).localeCompare(String(b.plan.Name));
}

function plansList_(user, p) {
  var year = p.year || getSettings_().CurrentYear, fm = fundMap_();
  var model = buildModel_(year, { includeDeleted: !!p.includeDeleted && user.Role === 'admin' });
  var q = str_(p.q).toLowerCase();
  var res = model.filter(function (m) {
    if (p.fund && m.plan.FundCode !== p.fund) return false;
    if (p.status && m.plan.Status !== p.status) return false;
    if (p.exec && m.calc.execState !== p.exec) return false;
    if (p.owner && String(m.plan.Owner) !== p.owner) return false;
    if (p.onlyOverdue && !m.overdue.is) return false;
    if (q && (String(m.plan.Name) + ' ' + String(m.plan.Owner) + ' ' + String(m.plan.ProjectTitle)).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort(function (a, b) { return planOrder_(a, b, fm); });
  return { year: String(year), plans: res.map(planBrief_) };
}

function plansGet_(user, p) {
  var pl = findBy_('Plans', 'PlanId', p.planId);
  if (!pl) fail_('NOT_FOUND', 'ไม่พบแผนงาน');
  var m = buildModel_(pl.Year, { includeDeleted: true }).filter(function (x) { return x.plan.PlanId === p.planId; })[0];
  var brief = planBrief_(m);
  var planDisbs = readAll_('Disbursements').filter(function (d) { return d.PlanId === p.planId && !d.ActId; }).map(disbOut_);
  return { plan: brief.plan, calc: brief.calc, overdue: brief.overdue, activities: m.items.map(actFull_), planAdjs: m.planAdjs.map(adjOut_),
    planDisbs: planDisbs,
    canEdit: canEditPlan_(user, pl) && !(pl.Status === 'ปิด' && user.Role !== 'admin' && getSettings_().LockClosedPlans === 'TRUE'),
    locked: pl.Status === 'ปิด' && getSettings_().LockClosedPlans === 'TRUE',
    reasonRequired: reasonRequired_(pl),
    deletedActivities: readAll_('Activities').filter(function (a) { return a.PlanId === p.planId && bool_(a.IsDeleted); }).map(function (a) { return { ActId: a.ActId, No: String(a.No), Name: a.Name }; }) };
}

function canEditPlan_(user, plan) {
  if (user.Role === 'admin') return true;
  if (user.Role !== 'user') return false;
  if (getSettings_().UserEditScope !== 'own') return true;
  return !!user.PersonName && String(plan.Owner) === String(user.PersonName);
}
function mustEditPlan_(user, planId) {
  var pl = findBy_('Plans', 'PlanId', planId);
  if (!pl || bool_(pl.IsDeleted)) fail_('NOT_FOUND', 'ไม่พบแผนงาน');
  if (!canEditPlan_(user, pl)) fail_('FORBIDDEN', 'ท่านแก้ไขได้เฉพาะแผนที่ตนเองเป็นผู้รับผิดชอบ');
  if (pl.Status === 'ปิด' && user.Role !== 'admin' && getSettings_().LockClosedPlans === 'TRUE') fail_('LOCKED', 'แผนนี้อยู่ในสถานะ "ปิด" แก้ไขได้เฉพาะแอดมิน');
  return pl;
}

// ---------------------------------------------------------------------------------
// การควบคุมการแก้ไข: เหตุผลหลังอนุมัติ / กันแก้ชนกัน / ประวัติการแก้ไขรายฟิลด์ (ChangeLog)
// ---------------------------------------------------------------------------------
var APPROVED_SET_ = ['อนุมัติ', 'ดำเนินการ', 'ส่งสรุปแล้ว'];
function reasonRequired_(plan) {
  return getSettings_().RequireReasonAfterApproval === 'TRUE' && APPROVED_SET_.indexOf(plan.Status) >= 0;
}
/** ถ้าแผน (ตัวใดตัวหนึ่ง) อนุมัติแล้ว ต้องมีเหตุผลอย่างน้อย 3 ตัวอักษร */
function reasonOk_(plans, reason) {
  var need = [].concat(plans).some(reasonRequired_), r = str_(reason);
  if (need && r.length < 3) fail_('REASON_REQUIRED', 'กรุณาระบุเหตุผลการแก้ไข (แผนที่อนุมัติแล้วต้องมีเหตุผลทุกครั้งที่แก้งบ/สถานะ/ลบรายการ)');
  return r;
}
/** ถ้าผู้ใช้ส่งเวลาแก้ไขล่าสุดที่เห็นมา (expectedUpdatedAt) แล้วข้อมูลถูกคนอื่นแก้ไปแล้ว -> ปฏิเสธ */
function checkExpected_(row, expected, label) {
  if (expected === undefined || expected === null || expected === '') return;
  if (String(row.UpdatedAt) !== String(expected)) fail_('CONFLICT', label + 'นี้ถูกแก้ไขโดย ' + (row.UpdatedBy || 'ผู้อื่น') + ' เมื่อ ' + String(row.UpdatedAt).replace('T', ' ') + ' — กรุณาโหลดข้อมูลใหม่ก่อนแก้ไข');
}
var FIELD_LABELS_ = { Name: 'ชื่อ', Owner: 'ผู้รับผิดชอบ', Department: 'กลุ่มงาน', FundCode: 'แหล่งเงิน', Year: 'ปีงบประมาณ', Seq: 'ลำดับ', ProjectNo: 'เลขที่โครงการ', ProjectTitle: 'ชื่อโครงการ',
  StrategyMoph: 'ยุทธศาสตร์กระทรวง', StrategyMission: 'พันธกิจ', StrategyProv: 'ยุทธศาสตร์ สสจ.', StrategyHosp: 'ยุทธศาสตร์ รพ.', StrategyRegion: 'ยุทธศาสตร์เขต',
  PlanType: 'ประเภทแผน', Status: 'สถานะ', ReturnDate: 'วันส่งคืนแผน', Note: 'หมายเหตุ', No: 'เลขที่', PlanStart: 'วันเริ่ม', PlanEnd: 'วันสิ้นสุด', Amount: 'จำนวนเงิน',
  ApproveDate: 'วันขออนุมัติ', PayRequestDate: 'วันขอจ่าย', PaidDate: 'วันจ่ายจริง', EvidenceUrl: 'หลักฐาน', SummarySent: 'ส่งสรุปโครงการ' };
var PLAN_FIELDS_ = ['Name', 'Owner', 'Department', 'FundCode', 'Year', 'Seq', 'ProjectNo', 'ProjectTitle', 'StrategyMoph', 'StrategyMission', 'StrategyProv', 'StrategyHosp', 'StrategyRegion', 'PlanType', 'Status', 'ReturnDate', 'Note'];
function chgVal_(v) {
  if (v === true) return 'ใช่';
  if (v === false) return 'ไม่';
  if (Object.prototype.toString.call(v) === '[object Date]') return dstr_(v);
  return String(v === null || v === undefined ? '' : v).substring(0, 250);
}
function chgRow_(user, entity, entityId, planId, field, oldV, newV, reason) {
  return { Time: nowIso_(), Email: user.Email, Entity: entity, EntityId: entityId, PlanId: planId, Field: field, Old: chgVal_(oldV), New: chgVal_(newV), Reason: str_(reason).substring(0, 400) };
}
function diffRows_(user, entity, entityId, planId, prefix, oldObj, newObj, fields, reason) {
  var rows = [];
  fields.forEach(function (f) {
    var a = chgVal_(oldObj[f]), b = chgVal_(newObj[f]);
    if (a !== b) rows.push(chgRow_(user, entity, entityId, planId, (prefix || '') + (FIELD_LABELS_[f] || f), a, b, reason));
  });
  return rows;
}
function writeChanges_(rows) {
  try { if (rows && rows.length) insertMany_('ChangeLog', rows); } catch (e) { /* ประวัติล้มเหลวต้องไม่ทำให้งานหลักพัง */ }
}
function catMap_() { var m = {}; readAll_('Categories').forEach(function (c) { m[c.Code] = c.Name; }); return m; }
function linesSig_(lines) {
  var acc = {};
  (lines || []).forEach(function (l) { acc[l.CategoryCode] = round2_((acc[l.CategoryCode] || 0) + num_(l.Amount)); });
  return Object.keys(acc).sort().map(function (k) { return k + ':' + acc[k]; }).join(';');
}
function linesText_(lines) {
  var cm = catMap_(), acc = {};
  (lines || []).forEach(function (l) { acc[l.CategoryCode] = round2_((acc[l.CategoryCode] || 0) + num_(l.Amount)); });
  var t = Object.keys(acc).sort().map(function (k) { return String(cm[k] || k).substring(0, 24) + ' ' + acc[k]; }).join('; ');
  return t || '(ไม่มี)';
}
function historyList_(user, p) {
  var rows = readAll_('ChangeLog').filter(function (r) { return String(r.PlanId) === String(p.planId); });
  return rows.slice(-300).reverse().map(function (r) { var o = stripRow_(r); o.Time = String(o.Time); return o; });
}
function validDate_(v, label) {
  if (v === undefined || v === null || v === '') return '';
  var d = dstr_(v);
  if (!d) fail_('VALIDATION', label + ' ไม่ใช่วันที่ที่ถูกต้อง (รูปแบบ ปปปป-ดด-วว)');
  return d;
}
function nextSeq_(year, fund) {
  var mx = 0;
  readAll_('Plans').forEach(function (p) { if (String(p.Year) === String(year) && p.FundCode === fund) mx = Math.max(mx, num_(p.Seq)); });
  return String(mx + 1);
}

function checkStrategies_(o, fund) {
  if (fund.StrategySet === 'region') { o.StrategyMoph = o.StrategyMission = o.StrategyProv = o.StrategyHosp = ''; return; }
  o.StrategyRegion = '';
  var chk = function (val, sheet, label) { if (val && !findBy_(sheet, 'Code', val)) fail_('VALIDATION', label + ' ไม่ถูกต้อง'); };
  chk(o.StrategyMoph, 'StrategyMoph', 'ยุทธศาสตร์กระทรวง'); chk(o.StrategyMission, 'StrategyMission', 'พันธกิจ');
  chk(o.StrategyProv, 'StrategyProv', 'ยุทธศาสตร์ สสจ.'); chk(o.StrategyHosp, 'StrategyHosp', 'ยุทธศาสตร์ รพ.');
  if (o.StrategyProv) {
    var pv = findBy_('StrategyProv', 'Code', o.StrategyProv);
    if (o.StrategyMission && String(pv.MissionCode) !== String(o.StrategyMission)) fail_('VALIDATION', 'ยุทธศาสตร์ สสจ. ที่เลือกไม่อยู่ภายใต้พันธกิจที่เลือก');
    if (!o.StrategyMission) o.StrategyMission = String(pv.MissionCode);
  }
}

function plansSave_(user, p) {
  var d = p.plan || {};
  var isNew = !d.PlanId, old = null;
  if (!isNew) { old = mustEditPlan_(user, d.PlanId); checkExpected_(old, p.expectedUpdatedAt, 'แผนงาน'); }
  else if (user.Role === 'viewer') fail_('FORBIDDEN', 'ท่านไม่มีสิทธิ์สร้างแผนงาน');

  var year = str_(d.Year !== undefined ? d.Year : (old && old.Year));
  if (!/^25\d\d$/.test(year)) fail_('VALIDATION', 'ปีงบประมาณต้องเป็น พ.ศ. 4 หลัก');
  var pick = function (k) { return d[k] !== undefined ? d[k] : (old ? old[k] : ''); };
  var fundCode = str_(pick('FundCode'));
  var fund = findBy_('Funds', 'Code', fundCode);
  if (!fund) fail_('VALIDATION', 'กรุณาเลือกแหล่งเงิน');
  var name = str_(pick('Name')), owner = str_(pick('Owner'));
  if (!name) fail_('VALIDATION', 'กรุณากรอกชื่อแผนงาน/โครงการ');
  if (!owner) fail_('VALIDATION', 'กรุณาระบุผู้รับผิดชอบ');
  var dept = str_(pick('Department'));
  if (!dept) { var pr = readAll_('People').filter(function (x) { return String(x.Name).trim() === owner && x.Department; })[0]; if (pr) dept = String(pr.Department); }
  if (dept && !findBy_('Departments', 'Name', dept)) fail_('VALIDATION', 'ไม่พบกลุ่มงานนี้ในข้อมูลหลัก');
  var type = str_(pick('PlanType'));
  if (type && !findBy_('PlanTypes', 'Code', type)) fail_('VALIDATION', 'ประเภทแผนไม่ถูกต้อง');
  var status = str_(pick('Status')) || 'ร่าง';
  if (PLAN_STATUSES_.indexOf(status) < 0) fail_('VALIDATION', 'สถานะแผนไม่ถูกต้อง');

  var now = nowIso_();
  var o = isNew ? { PlanId: newId_('P'), CreatedAt: now, CreatedBy: user.Email, IsDeleted: false, Source: '', SummarySent: false, SummarySentDate: '', SummaryFileUrl: '' } : stripRow_(old);
  o.Year = year; o.FundCode = fundCode; o.Name = name; o.Owner = owner; o.Department = dept; o.PlanType = type; o.Status = status;
  o.Seq = str_(pick('Seq')) || nextSeq_(year, fundCode);
  o.ProjectNo = str_(pick('ProjectNo')); o.ProjectTitle = str_(pick('ProjectTitle')); o.Note = str_(pick('Note'));
  o.StrategyMoph = str_(pick('StrategyMoph')); o.StrategyMission = str_(pick('StrategyMission')); o.StrategyProv = str_(pick('StrategyProv'));
  o.StrategyHosp = str_(pick('StrategyHosp')); o.StrategyRegion = str_(pick('StrategyRegion'));
  o.ReturnDate = validDate_(pick('ReturnDate'), 'วันส่งคืนแผน');
  checkStrategies_(o, fund);

  // การแก้ที่กระทบงบ/สถานะสำคัญ ของแผนที่อนุมัติแล้ว ต้องมีเหตุผล
  var reason = str_(p.reason);
  if (!isNew) {
    var sensitive = o.FundCode !== old.FundCode || o.Year !== String(old.Year) || (o.Status === 'ยกเลิก' && old.Status !== 'ยกเลิก') || (old.Status !== 'ร่าง' && o.Status === 'ร่าง');
    if (sensitive) reason = reasonOk_(old, p.reason);
  }
  o.UpdatedAt = now; o.UpdatedBy = user.Email;
  if (isNew) insert_('Plans', o); else update_('Plans', old._row, o);
  if (isNew) writeChanges_([chgRow_(user, 'Plan', o.PlanId, o.PlanId, '(สร้างแผนงาน)', '', name, '')]);
  else writeChanges_(diffRows_(user, 'Plan', o.PlanId, o.PlanId, '', old, o, PLAN_FIELDS_, reason));
  audit_(user.Email, isNew ? 'สร้างแผนงาน' : 'แก้ไขแผนงาน', 'Plan', o.PlanId, name);
  return { planId: o.PlanId, updatedAt: now };
}

/** แก้ไขหลายแผนพร้อมกัน: changes ใช้ '__keep__' = ไม่เปลี่ยน, '__clear__' = ล้างค่า */
function plansBulk_(user, p) {
  var ids = (p.planIds || []).slice(0, 200), ch = p.changes || {};
  var allowed = ['Owner', 'Department', 'PlanType', 'Status', 'StrategyMoph', 'StrategyMission', 'StrategyProv', 'StrategyHosp', 'StrategyRegion', 'Note'];
  var patch = {}, n = 0;
  allowed.forEach(function (k) {
    if (ch[k] === undefined || ch[k] === null || ch[k] === '__keep__') return;
    patch[k] = ch[k] === '__clear__' ? '' : ch[k]; n++;
  });
  if (!ids.length) fail_('VALIDATION', 'ยังไม่ได้เลือกแผนงาน');
  if (!n) fail_('VALIDATION', 'ยังไม่ได้เลือกฟิลด์ที่จะแก้ไข');
  var done = 0, errors = [];
  ids.forEach(function (id) {
    try {
      var pp = {}; for (var k in patch) pp[k] = patch[k];
      pp.PlanId = id;
      if (pp.StrategyMission !== undefined && pp.StrategyProv === undefined) {
        var cur = findBy_('Plans', 'PlanId', id), pv = cur && cur.StrategyProv ? findBy_('StrategyProv', 'Code', cur.StrategyProv) : null;
        if (pv && String(pv.MissionCode) !== String(pp.StrategyMission)) pp.StrategyProv = '';
      }
      plansSave_(user, { plan: pp, reason: p.reason });
      done++;
    } catch (e) {
      var pl = findBy_('Plans', 'PlanId', id);
      errors.push({ planId: id, name: pl ? pl.Name : id, error: e.message });
    }
  });
  audit_(user.Email, 'แก้ไขหลายแผน', 'Plan', String(ids.length), 'สำเร็จ ' + done + ' / ' + ids.length + ' ฟิลด์: ' + Object.keys(patch).join(','));
  return { updated: done, failed: errors.length, errors: errors };
}

function addYears_(iso, n) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  var d = +m[3];
  if (m[2] === '02' && d === 29) d = 28;
  return (+m[1] + n) + '-' + m[2] + '-' + ('0' + d).slice(-2);
}

/** คัดลอกแผน / ยกแผนไปปีงบประมาณใหม่ (คัดลอกกิจกรรมและรายการงบ ไม่คัดลอกเบิกจ่าย/ปรับงบ; สถานะเริ่มที่ "ร่าง") */
function plansDuplicate_(user, p) {
  if (user.Role === 'viewer') fail_('FORBIDDEN', 'ท่านไม่มีสิทธิ์สร้างแผนงาน');
  var toYear = str_(p.toYear);
  if (!/^25\d\d$/.test(toYear)) fail_('VALIDATION', 'ปีงบประมาณปลายทางต้องเป็น พ.ศ. 4 หลัก');
  var ids = (p.planIds || []).slice(0, 100);
  if (!ids.length) fail_('VALIDATION', 'ยังไม่ได้เลือกแผนงาน');
  var shift = p.shiftDates !== false, skipX = p.skipExcluded !== false, now = nowIso_();
  var allActs = readAll_('Activities'), allLines = readAll_('BudgetLines');
  var P = [], A = [], L = [], logs = [], seqNext = {};
  ids.forEach(function (id) {
    var pl = findBy_('Plans', 'PlanId', id);
    if (!pl || bool_(pl.IsDeleted)) return;
    var key = pl.FundCode;
    seqNext[key] = seqNext[key] === undefined ? num_(nextSeq_(toYear, pl.FundCode)) : seqNext[key] + 1;
    var o = stripRow_(pl);
    o.PlanId = newId_('P'); o.Year = toYear; o.Seq = String(seqNext[key]); o.Status = 'ร่าง'; o.ReturnDate = '';
    o.SummarySent = false; o.SummarySentDate = ''; o.SummaryFileUrl = ''; o.IsDeleted = false; o.Source = 'COPY';
    o.Note = ((pl.Note ? pl.Note + ' | ' : '') + 'คัดลอกจากปี ' + pl.Year + ' ลำดับ ' + pl.Seq).substring(0, 500);
    o.CreatedAt = now; o.CreatedBy = user.Email; o.UpdatedAt = now; o.UpdatedBy = user.Email;
    P.push(o);
    var dy = parseInt(toYear, 10) - parseInt(pl.Year, 10), na = 0;
    allActs.filter(function (a) { return a.PlanId === pl.PlanId && !bool_(a.IsDeleted); })
      .sort(function (a, b) { return num_(a.SortOrder) - num_(b.SortOrder); })
      .forEach(function (a) {
        if (skipX && ACT_EXCLUDED_.indexOf(a.Status) >= 0) return;
        var n = stripRow_(a);
        n.ActId = newId_('A'); n.PlanId = o.PlanId; n.Status = 'ปกติ'; n.SortOrder = ++na; n.DateText = ''; n.Progress = ''; n.Source = 'COPY';
        n.PlanStart = shift ? addYears_(dstr_(a.PlanStart), dy) : dstr_(a.PlanStart);
        n.PlanEnd = shift ? addYears_(dstr_(a.PlanEnd), dy) : dstr_(a.PlanEnd);
        n.CreatedAt = now; n.CreatedBy = user.Email; n.UpdatedAt = now; n.UpdatedBy = user.Email; n.IsDeleted = false;
        A.push(n);
        allLines.filter(function (l) { return l.ActId === a.ActId; }).forEach(function (l) {
          L.push({ LineId: newId_('L'), ActId: n.ActId, PlanId: o.PlanId, CategoryCode: l.CategoryCode, Amount: num_(l.Amount), Detail: l.Detail });
        });
      });
    logs.push(chgRow_(user, 'Plan', o.PlanId, o.PlanId, '(คัดลอกแผน)', 'ปี ' + pl.Year + ' #' + pl.Seq, 'ปี ' + toYear + ' #' + o.Seq, ''));
  });
  if (!P.length) fail_('NOT_FOUND', 'ไม่พบแผนงานที่เลือก');
  insertMany_('Plans', P);
  if (A.length) insertMany_('Activities', A);
  if (L.length) insertMany_('BudgetLines', L);
  writeChanges_(logs);
  audit_(user.Email, 'คัดลอก/ยกแผนไปปีงบ ' + toYear, 'Plan', String(P.length), 'กิจกรรม ' + A.length);
  return { created: P.map(function (x) { return x.PlanId; }), plans: P.length, activities: A.length };
}

function plansMarkSummary_(user, p) {
  var pl = mustEditPlan_(user, p.planId);
  var o = stripRow_(pl), sent = !!p.sent;
  o.SummarySent = sent;
  o.SummarySentDate = sent ? (validDate_(p.date, 'วันที่ส่งสรุป') || todayIso_()) : '';
  o.SummaryFileUrl = sent ? str_(p.fileUrl) : '';
  if (o.SummaryFileUrl && !/^https?:\/\//i.test(o.SummaryFileUrl)) fail_('VALIDATION', 'ลิงก์ไฟล์สรุปต้องขึ้นต้นด้วย http(s)://');
  if (sent && ['อนุมัติ', 'ดำเนินการ', 'ร่าง'].indexOf(o.Status) >= 0) o.Status = 'ส่งสรุปแล้ว';
  if (!sent && o.Status === 'ส่งสรุปแล้ว') o.Status = 'ดำเนินการ';
  o.UpdatedAt = nowIso_(); o.UpdatedBy = user.Email;
  update_('Plans', pl._row, o);
  writeChanges_(diffRows_(user, 'Plan', o.PlanId, o.PlanId, '', pl, o, ['SummarySent', 'Status'], ''));
  audit_(user.Email, sent ? 'ส่งสรุปโครงการ' : 'ยกเลิกการส่งสรุป', 'Plan', o.PlanId, o.Name);
  return { ok: true };
}

function plansDelete_(admin, p) {
  var pl = findBy_('Plans', 'PlanId', p.planId);
  if (!pl) fail_('NOT_FOUND', 'ไม่พบแผนงาน');
  var o = stripRow_(pl); o.IsDeleted = !p.restore; o.UpdatedAt = nowIso_(); o.UpdatedBy = admin.Email;
  update_('Plans', pl._row, o);
  writeChanges_([chgRow_(admin, 'Plan', o.PlanId, o.PlanId, p.restore ? '(กู้คืนแผนงาน)' : '(ลบแผนงาน)', '', o.Name, p.reason)]);
  audit_(admin.Email, p.restore ? 'กู้คืนแผนงาน' : 'ลบแผนงาน', 'Plan', o.PlanId, o.Name);
  return { ok: true };
}

// ---------------------------------------------------------------------------------
// กิจกรรม + รายการงบ (BudgetLines)
// ---------------------------------------------------------------------------------
function cleanLines_(lines) {
  var out = [];
  (lines || []).forEach(function (l) {
    var amt = num_(l.Amount), code = str_(l.CategoryCode);
    if (!code && !amt) return;
    if (!findBy_('Categories', 'Code', code)) fail_('VALIDATION', 'ไม่พบหมวดค่าใช้จ่าย "' + code + '"');
    if (amt < 0) fail_('VALIDATION', 'จำนวนเงินต้องไม่ติดลบ');
    if (amt > 0) out.push({ CategoryCode: code, Amount: round2_(amt), Detail: str_(l.Detail).substring(0, 300) });
  });
  return out;
}
function replaceLines_(actId, planId, lines) {
  var rows = readAll_('BudgetLines').filter(function (l) { return l.ActId === actId; }).map(function (l) { return l._row; });
  if (rows.length) removeRows_('BudgetLines', rows);
  insertMany_('BudgetLines', lines.map(function (l, i) { return { LineId: newId_('L'), ActId: actId, PlanId: planId, CategoryCode: l.CategoryCode, Amount: l.Amount, Detail: l.Detail }; }));
}
function actCalcById_(actId) {
  var act = findBy_('Activities', 'ActId', actId);
  var lines = readAll_('BudgetLines').filter(function (l) { return l.ActId === actId; });
  var disbs = readAll_('Disbursements').filter(function (d) { return d.ActId === actId; });
  var adjs = readAll_('Adjustments').filter(function (a) { return a.ActId === actId; });
  return calcActivity_(act, lines, disbs, adjs);
}

function actsSave_(user, p) {
  var d = p.activity || {}, isNew = !d.ActId, old = null, planId, plan;
  if (isNew) { planId = d.PlanId; plan = mustEditPlan_(user, planId); }
  else {
    old = findBy_('Activities', 'ActId', d.ActId);
    if (!old || bool_(old.IsDeleted)) fail_('NOT_FOUND', 'ไม่พบกิจกรรม');
    planId = old.PlanId; plan = mustEditPlan_(user, planId);
    checkExpected_(old, p.expectedUpdatedAt, 'กิจกรรม');
  }
  var pick = function (k) { return d[k] !== undefined ? d[k] : (old ? old[k] : ''); };
  var name = str_(pick('Name'));
  if (!name) fail_('VALIDATION', 'กรุณากรอกชื่อกิจกรรม');
  var status = str_(pick('Status')) || 'ปกติ';
  if (ACT_STATUSES_.indexOf(status) < 0) fail_('VALIDATION', 'สถานะกิจกรรมไม่ถูกต้อง');
  var start = validDate_(pick('PlanStart'), 'วันที่เริ่ม'), end = validDate_(pick('PlanEnd'), 'วันที่สิ้นสุด');
  if (start && end && end < start) fail_('VALIDATION', 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
  var lines = (p.lines !== undefined) ? cleanLines_(p.lines) : null;

  var oldLines = old ? readAll_('BudgetLines').filter(function (l) { return l.ActId === old.ActId; }) : [];
  var oldSig = linesSig_(oldLines), newSig = lines ? linesSig_(lines) : oldSig;
  var excl = function (s) { return ACT_EXCLUDED_.indexOf(s) >= 0; };
  var sensitive = isNew ? !!(lines && lines.length) : (newSig !== oldSig || excl(old.Status) !== excl(status));
  var reason = sensitive ? reasonOk_(plan, p.reason) : str_(p.reason);

  var siblings = readAll_('Activities').filter(function (a) { return a.PlanId === planId && !bool_(a.IsDeleted); });
  var now = nowIso_();
  var o = isNew ? { ActId: newId_('A'), PlanId: planId, IsDeleted: false, Source: '', CreatedAt: now, CreatedBy: user.Email,
      SortOrder: siblings.reduce(function (m, a) { return Math.max(m, num_(a.SortOrder)); }, 0) + 1 } : stripRow_(old);
  o.No = str_(pick('No')) || String(siblings.length + 1);
  o.Name = name; o.Status = status; o.PlanStart = start; o.PlanEnd = end; o.Note = str_(pick('Note'));
  o.DateText = d.DateText !== undefined ? str_(d.DateText) : (old ? old.DateText : '');
  o.UpdatedAt = now; o.UpdatedBy = user.Email;
  if (isNew) insert_('Activities', o); else update_('Activities', old._row, o);
  if (lines) replaceLines_(o.ActId, planId, lines);

  var prefix = '[' + o.No + '] ';
  var logs = isNew
    ? [chgRow_(user, 'Activity', o.ActId, planId, '(เพิ่มกิจกรรม) ' + prefix + name.substring(0, 60), '', linesText_(lines || []), reason)]
    : diffRows_(user, 'Activity', o.ActId, planId, prefix, old, o, ['No', 'Name', 'Status', 'PlanStart', 'PlanEnd', 'Note'], reason);
  if (!isNew && lines && newSig !== oldSig) logs.push(chgRow_(user, 'Activity', o.ActId, planId, prefix + 'รายการงบ', linesText_(oldLines), linesText_(lines), reason));
  writeChanges_(logs);

  var warnings = [], c = actCalcById_(o.ActId);
  if (ACT_EXCLUDED_.indexOf(status) >= 0 && c.plannedBudget > 0 && c.netPaid === 0) warnings.push('กิจกรรมสถานะ "' + status + '" มีงบ ' + c.plannedBudget.toLocaleString() + ' บาท ซึ่งจะถูกนับเป็นงบที่ปลดล็อกได้ (โอนย้ายไปกิจกรรมอื่นได้)');
  audit_(user.Email, isNew ? 'เพิ่มกิจกรรม' : 'แก้ไขกิจกรรม', 'Activity', o.ActId, name);
  return { actId: o.ActId, updatedAt: now, warnings: warnings };
}

function actsDelete_(user, p) {
  var a = findBy_('Activities', 'ActId', p.actId);
  if (!a || bool_(a.IsDeleted)) fail_('NOT_FOUND', 'ไม่พบกิจกรรม');
  var plan = mustEditPlan_(user, a.PlanId), reason = reasonOk_(plan, p.reason);
  var hasDisb = readAll_('Disbursements').some(function (d) { return d.ActId === a.ActId; });
  if (hasDisb) fail_('VALIDATION', 'กิจกรรมนี้มีรายการเบิกจ่ายแล้ว ลบไม่ได้ — ให้เปลี่ยนสถานะเป็น "ยกเลิก" แทน');
  var o = stripRow_(a); o.IsDeleted = true; o.UpdatedAt = nowIso_(); o.UpdatedBy = user.Email;
  update_('Activities', a._row, o);
  writeChanges_([chgRow_(user, 'Activity', a.ActId, a.PlanId, '(ลบกิจกรรม) [' + a.No + ']', a.Name, '', reason)]);
  audit_(user.Email, 'ลบกิจกรรม', 'Activity', a.ActId, a.Name);
  return { ok: true };
}

function actsRestore_(user, p) {
  var a = findBy_('Activities', 'ActId', p.actId);
  if (!a || !bool_(a.IsDeleted)) fail_('NOT_FOUND', 'ไม่พบกิจกรรมที่ถูกลบ');
  mustEditPlan_(user, a.PlanId);
  var o = stripRow_(a); o.IsDeleted = false; o.UpdatedAt = nowIso_(); o.UpdatedBy = user.Email;
  update_('Activities', a._row, o);
  writeChanges_([chgRow_(user, 'Activity', a.ActId, a.PlanId, '(กู้คืนกิจกรรม) [' + a.No + ']', '', a.Name, '')]);
  audit_(user.Email, 'กู้คืนกิจกรรม', 'Activity', a.ActId, a.Name);
  return { ok: true };
}

function sortedActs_(planId) {
  return readAll_('Activities').filter(function (a) { return a.PlanId === planId && !bool_(a.IsDeleted); })
    .sort(function (a, b) { return (num_(a.SortOrder) - num_(b.SortOrder)) || String(a.No).localeCompare(String(b.No)); });
}

/** ขยับกิจกรรมขึ้น/ลงในแผนเดียวกัน */
function actsReorder_(user, p) {
  var a = findBy_('Activities', 'ActId', p.actId);
  if (!a || bool_(a.IsDeleted)) fail_('NOT_FOUND', 'ไม่พบกิจกรรม');
  mustEditPlan_(user, a.PlanId);
  var list = sortedActs_(a.PlanId), i = -1;
  list.forEach(function (x, k) { if (x.ActId === a.ActId) i = k; });
  var j = p.direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { moved: false };
  var t = list[i]; list[i] = list[j]; list[j] = t;
  list.forEach(function (x, k) {
    if (num_(x.SortOrder) !== k + 1) { var o = stripRow_(x); o.SortOrder = k + 1; o.UpdatedAt = nowIso_(); o.UpdatedBy = user.Email; update_('Activities', x._row, o); }
  });
  return { moved: true };
}

/** ย้ายกิจกรรม (พร้อมรายการงบ/เบิกจ่าย/ปรับงบ) ไปแผนอื่นในปีงบประมาณเดียวกัน */
function actsMove_(user, p) {
  var a = findBy_('Activities', 'ActId', p.actId);
  if (!a || bool_(a.IsDeleted)) fail_('NOT_FOUND', 'ไม่พบกิจกรรม');
  if (a.PlanId === p.toPlanId) fail_('VALIDATION', 'เลือกแผนปลายทางที่ต่างจากเดิม');
  var from = mustEditPlan_(user, a.PlanId), to = mustEditPlan_(user, p.toPlanId);
  if (String(from.Year) !== String(to.Year)) fail_('VALIDATION', 'ย้ายได้เฉพาะแผนในปีงบประมาณเดียวกัน');
  var reason = reasonOk_([from, to], p.reason);
  var now = nowIso_(), o = stripRow_(a);
  o.PlanId = to.PlanId;
  o.SortOrder = sortedActs_(to.PlanId).reduce(function (m, x) { return Math.max(m, num_(x.SortOrder)); }, 0) + 1;
  o.UpdatedAt = now; o.UpdatedBy = user.Email;
  update_('Activities', a._row, o);
  ['BudgetLines', 'Disbursements', 'Adjustments'].forEach(function (sheet) {
    readAll_(sheet).filter(function (r) { return r.ActId === a.ActId; }).forEach(function (r) { var x = stripRow_(r); x.PlanId = to.PlanId; update_(sheet, r._row, x); });
  });
  writeChanges_([
    chgRow_(user, 'Activity', a.ActId, from.PlanId, '(ย้ายกิจกรรมออก) [' + a.No + '] ' + a.Name.substring(0, 50), 'แผน: ' + from.Name.substring(0, 60), 'ย้ายไป: ' + to.Name.substring(0, 60), reason),
    chgRow_(user, 'Activity', a.ActId, to.PlanId, '(ย้ายกิจกรรมเข้า) ' + a.Name.substring(0, 50), 'จากแผน: ' + from.Name.substring(0, 60), '', reason)]);
  audit_(user.Email, 'ย้ายกิจกรรมไปแผนอื่น', 'Activity', a.ActId, a.Name);
  return { ok: true };
}

/** คัดลอกกิจกรรม (พร้อมรายการงบ ไม่คัดลอกเบิกจ่าย) ไปแผนเดิมหรือแผนอื่น */
function actsDuplicate_(user, p) {
  var a = findBy_('Activities', 'ActId', p.actId);
  if (!a || bool_(a.IsDeleted)) fail_('NOT_FOUND', 'ไม่พบกิจกรรม');
  var toPlan = mustEditPlan_(user, p.toPlanId || a.PlanId);
  var lines = readAll_('BudgetLines').filter(function (l) { return l.ActId === a.ActId; });
  var reason = lines.length ? reasonOk_(toPlan, p.reason) : str_(p.reason);
  var now = nowIso_(), sib = sortedActs_(toPlan.PlanId);
  var o = stripRow_(a);
  o.ActId = newId_('A'); o.PlanId = toPlan.PlanId; o.Name = (a.Name + ' (สำเนา)').substring(0, 300); o.Status = 'ปกติ';
  o.No = String(sib.length + 1);
  o.SortOrder = sib.reduce(function (m, x) { return Math.max(m, num_(x.SortOrder)); }, 0) + 1;
  o.DateText = ''; o.Progress = ''; o.Source = 'COPY'; o.CreatedAt = now; o.CreatedBy = user.Email; o.UpdatedAt = now; o.UpdatedBy = user.Email; o.IsDeleted = false;
  insert_('Activities', o);
  if (lines.length) insertMany_('BudgetLines', lines.map(function (l) { return { LineId: newId_('L'), ActId: o.ActId, PlanId: toPlan.PlanId, CategoryCode: l.CategoryCode, Amount: num_(l.Amount), Detail: l.Detail }; }));
  writeChanges_([chgRow_(user, 'Activity', o.ActId, toPlan.PlanId, '(คัดลอกกิจกรรม) ' + a.Name.substring(0, 60), '', linesText_(lines), reason)]);
  audit_(user.Email, 'คัดลอกกิจกรรม', 'Activity', o.ActId, a.Name);
  return { actId: o.ActId };
}

// ---------------------------------------------------------------------------------
// การเบิกจ่ายรายครั้ง (Disbursements) + การปรับงบ/คืนเงิน/โอนย้ายงบ (Adjustments)
// ---------------------------------------------------------------------------------
function checkUrl_(u, label) {
  u = str_(u);
  if (u && !/^https?:\/\//i.test(u)) fail_('VALIDATION', label + ' ต้องขึ้นต้นด้วย http:// หรือ https://');
  return u;
}
var DISB_FIELDS_ = ['Amount', 'ApproveDate', 'PayRequestDate', 'PaidDate', 'EvidenceUrl', 'Note'];

function disbSave_(user, p) {
  var d = p.disb || {}, isNew = !d.DisbId, old = null, act = null, planId;
  if (!isNew) {
    old = findBy_('Disbursements', 'DisbId', d.DisbId);
    if (!old) fail_('NOT_FOUND', 'ไม่พบรายการเบิกจ่าย');
    planId = old.PlanId;
    checkExpected_(old, p.expectedUpdatedAt, 'รายการเบิกจ่าย');
  }
  var actId = str_(d.ActId !== undefined ? d.ActId : (old ? old.ActId : ''));
  if (actId) {
    act = findBy_('Activities', 'ActId', actId);
    if (!act || bool_(act.IsDeleted)) fail_('NOT_FOUND', 'ไม่พบกิจกรรม');
    planId = act.PlanId;
  } else if (isNew) planId = d.PlanId;
  var plan = mustEditPlan_(user, planId);

  var amt = num_(d.Amount !== undefined ? d.Amount : (old ? old.Amount : 0));
  if (!(amt > 0)) fail_('VALIDATION', 'จำนวนเงินที่เบิกต้องมากกว่า 0');
  var reason = (!isNew && round2_(amt) !== round2_(num_(old.Amount))) ? reasonOk_(plan, p.reason) : str_(p.reason);
  var pick = function (k) { return d[k] !== undefined ? d[k] : (old ? old[k] : ''); };
  var now = nowIso_();
  var siblings = readAll_('Disbursements').filter(function (x) { return x.PlanId === planId && String(x.ActId) === actId; });
  var o = isNew ? { DisbId: newId_('D'), ActId: actId, PlanId: planId, Source: '', CreatedAt: now, CreatedBy: user.Email,
      Seq: siblings.reduce(function (m, x) { return Math.max(m, num_(x.Seq)); }, 0) + 1 } : stripRow_(old);
  o.ActId = actId; o.PlanId = planId;
  if (!isNew && d.Seq !== undefined && num_(d.Seq) > 0) o.Seq = num_(d.Seq);
  o.ApproveDate = validDate_(pick('ApproveDate'), 'วันที่ขออนุมัติดำเนินการ');
  o.PayRequestDate = validDate_(pick('PayRequestDate'), 'วันที่ขออนุมัติจ่าย');
  o.PaidDate = validDate_(pick('PaidDate'), 'วันที่จ่ายจริง');
  var seqDates = [['ApproveDate', 'วันที่ขออนุมัติดำเนินการ'], ['PayRequestDate', 'วันที่ขออนุมัติจ่าย'], ['PaidDate', 'วันที่จ่ายจริง']].filter(function (x) { return o[x[0]]; });
  for (var si = 1; si < seqDates.length; si++) if (o[seqDates[si][0]] < o[seqDates[si - 1][0]]) fail_('VALIDATION', seqDates[si][1] + ' ต้องไม่ก่อน' + seqDates[si - 1][1]);
  o.Amount = round2_(amt); o.EvidenceUrl = checkUrl_(pick('EvidenceUrl'), 'ลิงก์หลักฐาน'); o.Note = str_(pick('Note')).substring(0, 500);
  o.UpdatedAt = now; o.UpdatedBy = user.Email;
  if (isNew) insert_('Disbursements', o); else update_('Disbursements', old._row, o);
  writeChanges_(isNew
    ? [chgRow_(user, 'Disbursement', o.DisbId, planId, '(บันทึกเบิกจ่าย) ' + (act ? '[' + act.No + '] ' : 'ระดับแผน '), '', o.Amount, '')]
    : diffRows_(user, 'Disbursement', o.DisbId, planId, '[เบิกครั้งที่ ' + o.Seq + '] ', old, o, DISB_FIELDS_, reason));

  var warnings = [];
  if (o.PaidDate && o.PaidDate > todayIso_()) warnings.push('วันที่จ่ายจริงเป็นวันในอนาคต โปรดตรวจสอบ');
  if (actId) { var c = actCalcById_(actId); if (c.netPaid > c.activeBudget + 0.5 && !c.excluded) warnings.push('เบิกจ่ายสะสม ' + c.netPaid.toLocaleString() + ' บาท เกินงบของกิจกรรม ' + c.plannedBudget.toLocaleString() + ' บาท'); }
  audit_(user.Email, isNew ? 'บันทึกเบิกจ่าย' : 'แก้ไขเบิกจ่าย', 'Disbursement', o.DisbId, String(o.Amount));
  return { disbId: o.DisbId, updatedAt: now, warnings: warnings };
}
function disbDelete_(user, p) {
  var d = findBy_('Disbursements', 'DisbId', p.disbId);
  if (!d) fail_('NOT_FOUND', 'ไม่พบรายการเบิกจ่าย');
  var plan = mustEditPlan_(user, d.PlanId), reason = reasonOk_(plan, p.reason);
  removeRows_('Disbursements', [d._row]);
  writeChanges_([chgRow_(user, 'Disbursement', d.DisbId, d.PlanId, '(ลบเบิกจ่าย) ครั้งที่ ' + d.Seq, d.Amount, '', reason)]);
  audit_(user.Email, 'ลบเบิกจ่าย', 'Disbursement', d.DisbId, String(d.Amount));
  return { ok: true };
}

function adjSave_(user, p) {
  var d = p.adj || {}, isNew = !d.AdjId, old = null, planId;
  if (!isNew) {
    old = findBy_('Adjustments', 'AdjId', d.AdjId);
    if (!old) fail_('NOT_FOUND', 'ไม่พบรายการปรับงบ');
    planId = old.PlanId;
    if (old.TransferId) fail_('VALIDATION', 'รายการโอนย้ายงบแก้ไขไม่ได้ — ให้ลบรายการโอนแล้วโอนใหม่');
  } else planId = d.PlanId;
  mustEditPlan_(user, planId);
  var pick = function (k) { return d[k] !== undefined ? d[k] : (old ? old[k] : ''); };
  var type = str_(pick('Type'));
  if (ADJ_TYPES_.indexOf(type) < 0) fail_('VALIDATION', 'ประเภทรายการไม่ถูกต้อง');
  var amt = num_(pick('Amount'));
  if (!(amt > 0)) fail_('VALIDATION', 'จำนวนเงินต้องมากกว่า 0');
  var reason = str_(pick('Reason'));
  if (!reason) fail_('VALIDATION', 'กรุณาระบุเหตุผล');
  var actId = str_(pick('ActId'));
  if (actId) { var a = findBy_('Activities', 'ActId', actId); if (!a || a.PlanId !== planId) fail_('VALIDATION', 'กิจกรรมไม่ได้อยู่ในแผนงานนี้'); }
  var o = isNew ? { AdjId: newId_('J'), PlanId: planId, CreatedAt: nowIso_(), CreatedBy: user.Email, TransferId: '' } : stripRow_(old);
  o.ActId = actId; o.Type = type; o.Amount = round2_(amt); o.Reason = reason.substring(0, 500); o.Date = validDate_(pick('Date'), 'วันที่') || todayIso_();
  if (isNew) insert_('Adjustments', o); else update_('Adjustments', old._row, o);
  writeChanges_(isNew
    ? [chgRow_(user, 'Adjustment', o.AdjId, planId, '(' + type + ')', '', o.Amount, reason)]
    : diffRows_(user, 'Adjustment', o.AdjId, planId, '[' + type + '] ', old, o, ['Amount', 'ActId'], reason));
  audit_(user.Email, isNew ? 'บันทึกปรับงบ/คืนเงิน' : 'แก้ไขปรับงบ/คืนเงิน', 'Adjustment', o.AdjId, type + ' ' + o.Amount);
  return { adjId: o.AdjId };
}
function adjDelete_(user, p) {
  var a = findBy_('Adjustments', 'AdjId', p.adjId);
  if (!a) fail_('NOT_FOUND', 'ไม่พบรายการ');
  var rows = a.TransferId ? readAll_('Adjustments').filter(function (x) { return x.TransferId === a.TransferId; }) : [a];
  var plans = rows.map(function (x) { return mustEditPlan_(user, x.PlanId); });
  var reason = reasonOk_(plans, p.reason);
  removeRows_('Adjustments', rows.map(function (x) { return x._row; }));
  writeChanges_(rows.map(function (x) { return chgRow_(user, 'Adjustment', x.AdjId, x.PlanId, a.TransferId ? '(ยกเลิกการโอนย้ายงบ)' : '(ลบ' + x.Type + ')', x.Amount, '', reason); }));
  audit_(user.Email, a.TransferId ? 'ยกเลิกการโอนย้ายงบ' : 'ลบปรับงบ/คืนเงิน', 'Adjustment', a.AdjId, a.Type);
  return { ok: true, removed: rows.length };
}

/** โอนย้ายงบระหว่างกิจกรรม (ภายในปีงบเดียวกัน) = ปรับลดงบต้นทาง + ปรับเพิ่มงบปลายทาง เชื่อมกันด้วย TransferId */
function budgetTransfer_(user, p) {
  var from = findBy_('Activities', 'ActId', p.fromActId), to = findBy_('Activities', 'ActId', p.toActId);
  if (!from || bool_(from.IsDeleted) || !to || bool_(to.IsDeleted)) fail_('NOT_FOUND', 'ไม่พบกิจกรรมต้นทางหรือปลายทาง');
  if (from.ActId === to.ActId) fail_('VALIDATION', 'ต้นทางและปลายทางต้องเป็นคนละกิจกรรม');
  var fp = mustEditPlan_(user, from.PlanId), tp = mustEditPlan_(user, to.PlanId);
  if (String(fp.Year) !== String(tp.Year)) fail_('VALIDATION', 'โอนย้ายงบได้เฉพาะภายในปีงบประมาณเดียวกัน');
  var amt = round2_(num_(p.amount)), reason = str_(p.reason);
  if (!(amt > 0)) fail_('VALIDATION', 'จำนวนเงินต้องมากกว่า 0');
  if (reason.length < 3) fail_('REASON_REQUIRED', 'กรุณาระบุเหตุผลการโอนย้ายงบ');
  if (ACT_EXCLUDED_.indexOf(to.Status) >= 0) fail_('VALIDATION', 'กิจกรรมปลายทางต้องไม่เป็นสถานะ ยกเลิก/ไม่เบิก/ไม่ใช้งบประมาณ');
  var c = actCalcById_(from.ActId), avail = round2_(c.plannedBudget - c.netPaid);
  if (amt > avail + 0.5) fail_('VALIDATION', 'โอนเกินยอดคงเหลือของกิจกรรมต้นทาง (โอนได้ไม่เกิน ' + avail.toLocaleString() + ' บาท)');
  var tid = newId_('T'), date = validDate_(p.date, 'วันที่') || todayIso_(), now = nowIso_();
  var out = { AdjId: newId_('J'), PlanId: from.PlanId, ActId: from.ActId, Type: 'ปรับลดงบ', Amount: amt, Reason: ('[โอนย้ายไป ' + to.Name.substring(0, 60) + '] ' + reason).substring(0, 500), Date: date, CreatedAt: now, CreatedBy: user.Email, TransferId: tid };
  var inn = { AdjId: newId_('J'), PlanId: to.PlanId, ActId: to.ActId, Type: 'ปรับเพิ่มงบ', Amount: amt, Reason: ('[โอนย้ายจาก ' + from.Name.substring(0, 60) + '] ' + reason).substring(0, 500), Date: date, CreatedAt: now, CreatedBy: user.Email, TransferId: tid };
  insertMany_('Adjustments', [out, inn]);
  writeChanges_([
    chgRow_(user, 'Adjustment', out.AdjId, from.PlanId, '(โอนย้ายงบออก) [' + from.No + '] ' + from.Name.substring(0, 40), amt, '', reason),
    chgRow_(user, 'Adjustment', inn.AdjId, to.PlanId, '(โอนย้ายงบเข้า) [' + to.No + '] ' + to.Name.substring(0, 40), '', amt, reason)]);
  audit_(user.Email, 'โอนย้ายงบ', 'Transfer', tid, amt + ' บาท');
  return { transferId: tid };
}

// ---------------------------------------------------------------------------------
// คิวข้อมูลรอแก้ไข / Audit / ไฟล์แนบ
// ---------------------------------------------------------------------------------
function fixList_(user, p) {
  var rows = readAll_('FixQueue').filter(function (r) { return p.resolved ? true : !bool_(r.Resolved); });
  return rows.slice(0, 1000).map(function (r) { var o = stripRow_(r); o.Resolved = bool_(o.Resolved); o.CreatedAt = String(o.CreatedAt); o.ResolvedAt = String(o.ResolvedAt); return o; });
}
function fixResolve_(user, p) {
  var r = findBy_('FixQueue', 'FixId', p.fixId);
  if (!r) fail_('NOT_FOUND', 'ไม่พบรายการ');
  var o = stripRow_(r); o.Resolved = p.resolved !== false; o.ResolvedBy = o.Resolved ? user.Email : ''; o.ResolvedAt = o.Resolved ? nowIso_() : '';
  update_('FixQueue', r._row, o);
  return { ok: true };
}
function auditList_(admin, p) {
  var rows = readAll_('AuditLog'), n = Math.min(num_(p.limit) || 200, 1000);
  return rows.slice(-n).reverse().map(function (r) { var o = stripRow_(r); o.Time = String(o.Time); return o; });
}


var UPLOAD_TYPES_ = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
/** ตรวจเลขมหัศจรรย์ต้นไฟล์ให้ตรงกับประเภท (กันการเปลี่ยนนามสกุลไฟล์) bytes เป็น signed byte แบบ Apps Script */
function magicOk_(bytes, mime) {
  if (!bytes || bytes.length < 4) return false;
  var b = bytes.slice(0, 4).map(function (x) { return x & 0xFF; });
  if (mime === 'application/pdf') return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  if (mime === 'image/jpeg') return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
  if (mime === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  if (mime === 'image/gif') return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;
  if (mime.indexOf('openxmlformats') >= 0) return b[0] === 0x50 && b[1] === 0x4B;
  if (mime === 'application/msword' || mime === 'application/vnd.ms-excel') return b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0;
  return false;
}
function appFolder_() {
  var id = prop_('DRIVE_FOLDER_ID', '');
  if (id) return DriveApp.getFolderById(id);
  var name = 'ระบบแผนงานโครงการ รพ.สันทราย (ไฟล์แนบ)';
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
function fileUpload_(user, p) {
  var name = String(p.name || '').replace(/[\\\/:*?"<>|\r\n]+/g, '_').substring(0, 120) || 'file';
  var ext = (name.split('.').pop() || '').toLowerCase();
  var mime = UPLOAD_TYPES_[ext];
  if (!mime) fail_('VALIDATION', 'รองรับเฉพาะไฟล์ PDF, รูปภาพ, Word, Excel');
  var raw = String(p.data || ''); if (raw.indexOf(',') >= 0) raw = raw.split(',').pop();
  if (!raw) fail_('VALIDATION', 'ไม่พบข้อมูลไฟล์');
  var bytes = Utilities.base64Decode(raw);
  if (bytes.length > maxUploadBytes_()) fail_('VALIDATION', 'ไฟล์ใหญ่เกิน ' + cfgNum_('MAX_UPLOAD_MB') + 'MB');
  if (!magicOk_(bytes, mime)) fail_('VALIDATION', 'เนื้อหาไฟล์ไม่ตรงกับประเภทไฟล์ หรือไฟล์เสียหาย');
  var file = appFolder_().createFile(Utilities.newBlob(bytes, mime, name));
  if (getSettings_().FileSharing === 'link') { try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* นโยบายโดเมนอาจไม่อนุญาต */ } }
  audit_(user.Email, 'อัปโหลดไฟล์', 'File', file.getId(), name);
  return { url: file.getUrl(), id: file.getId(), name: name };
}

// ---------------------------------------------------------------------------------
// แดชบอร์ด / ค้างส่งสรุป / ส่งออกรายงาน
// ---------------------------------------------------------------------------------
function dashboard_(user, p) {
  var settings = getSettings_(), year = p.year || settings.CurrentYear, scope = p.scope === 'all' ? 'all' : 'hospital';
  var fm = fundMap_(), model = buildModel_(year), excl = bool_(settings.ExcludeCancelledFromRate);
  var inScope = model.filter(function (m) { return scope === 'all' || !fm[m.plan.FundCode] || bool_(fm[m.plan.FundCode].InHospitalKpi); });
  var active = inScope.filter(function (m) { return m.plan.Status !== 'ยกเลิก' || m.calc.netPaid > 0; });

  var T = { plans: inScope.length, plannedBudget: 0, activeBudget: 0, netPaid: 0, released: 0, remaining: 0 };
  inScope.forEach(function (m) { T.plannedBudget += m.calc.plannedBudget; T.activeBudget += m.calc.activeBudget; T.netPaid += m.calc.netPaid; T.released += m.calc.released; T.remaining += m.calc.remaining; });
  Object.keys(T).forEach(function (k) { if (k !== 'plans') T[k] = round2_(T[k]); });
  var denom = excl ? T.activeBudget : T.plannedBudget;
  T.rate = denom > 0 ? round2_(T.netPaid / denom * 100) : 0;
  T.rateGross = T.plannedBudget > 0 ? round2_(T.netPaid / T.plannedBudget * 100) : 0;
  T.rateNet = T.activeBudget > 0 ? round2_(T.netPaid / T.activeBudget * 100) : 0;

  // รายแหล่งเงิน (แสดงทุกแหล่ง พร้อมธงว่านับใน KPI รพ. หรือไม่)
  var byFund = readAll_('Funds').sort(function (a, b) { return num_(a.SortOrder) - num_(b.SortOrder); }).map(function (f) {
    var r = { code: f.Code, name: f.Name, kpi: bool_(f.InHospitalKpi), plans: 0, plannedBudget: 0, activeBudget: 0, netPaid: 0, released: 0 };
    model.forEach(function (m) { if (m.plan.FundCode === f.Code) { r.plans++; r.plannedBudget += m.calc.plannedBudget; r.activeBudget += m.calc.activeBudget; r.netPaid += m.calc.netPaid; r.released += m.calc.released; } });
    ['plannedBudget', 'activeBudget', 'netPaid', 'released'].forEach(function (k) { r[k] = round2_(r[k]); });
    r.pct = r.activeBudget > 0 ? round2_(r.netPaid / r.activeBudget * 100) : 0;
    return r;
  }).filter(function (r) { return r.plans > 0; });

  // สถานะกิจกรรม / สถานะการเบิกของแผน
  var actStatus = {}; ACT_STATUSES_.forEach(function (s) { actStatus[s] = { count: 0, budget: 0 }; });
  var execCount = { 'เบิกครบ': 0, 'เบิกบางส่วน': 0, 'ยังไม่เบิก': 0, 'ไม่มีงบ': 0 };
  var planStatus = {}; PLAN_STATUSES_.forEach(function (s) { planStatus[s] = 0; });
  inScope.forEach(function (m) {
    execCount[m.calc.execState]++; planStatus[m.plan.Status] = (planStatus[m.plan.Status] || 0) + 1;
    m.items.forEach(function (x) { var s = actStatus[x.act.Status] || (actStatus[x.act.Status] = { count: 0, budget: 0 }); s.count++; s.budget = round2_(s.budget + x.calc.plannedBudget); });
  });

  // ตามยุทธศาสตร์ 4 ระดับ
  var strat = {};
  [['moph', 'StrategyMoph', 'StrategyMoph'], ['mission', 'StrategyMission', 'StrategyMission'], ['prov', 'StrategyProv', 'StrategyProv'], ['hosp', 'StrategyHosp', 'StrategyHosp']].forEach(function (s) {
    var names = {}; readAll_(s[2]).forEach(function (r) { names[String(r.Code)] = r.Name; });
    var acc = {};
    inScope.forEach(function (m) {
      if (fm[m.plan.FundCode] && fm[m.plan.FundCode].StrategySet === 'region') return;
      var code = String(m.plan[s[1]] || ''), k = code || '(ไม่ระบุ)';
      var a = acc[k] || (acc[k] = { code: code, name: code ? (names[code] || code) : '(ยังไม่ระบุ)', plans: 0, activeBudget: 0, netPaid: 0 });
      a.plans++; a.activeBudget += m.calc.activeBudget; a.netPaid += m.calc.netPaid;
    });
    strat[s[0]] = Object.keys(acc).map(function (k) { var a = acc[k]; a.activeBudget = round2_(a.activeBudget); a.netPaid = round2_(a.netPaid); return a; })
      .sort(function (a, b) { return String(a.code || 'zzz').localeCompare(String(b.code || 'zzz')); });
  });

  // กระแสเงินสดรายเดือนของปีงบ (ต.ค. -> ก.ย.)
  var planned = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], paid = planned.slice(), plannedNoDate = 0, paidNoDate = 0;
  inScope.forEach(function (m) {
    m.items.forEach(function (x) {
      if (!x.calc.excluded && x.calc.plannedBudget > 0) {
        var sd = dstr_(x.act.PlanStart); if (sd) planned[fyMonthIdx_(sd)] += x.calc.plannedBudget; else plannedNoDate += x.calc.plannedBudget;
      }
      x.disbs.forEach(function (d) {
        var dd = dstr_(d.PaidDate) || dstr_(d.PayRequestDate) || dstr_(d.ApproveDate);
        if (dd) paid[fyMonthIdx_(dd)] += num_(d.Amount); else paidNoDate += num_(d.Amount);
      });
    });
  });
  var cum = [], run = 0; paid.forEach(function (v) { run += v; cum.push(round2_(run)); });
  var monthly = { planned: planned.map(round2_), paid: paid.map(round2_), cumulativePaid: cum, plannedNoDate: round2_(plannedNoDate), paidNoDate: round2_(paidNoDate) };

  var top = inScope.slice().sort(function (a, b) { return b.calc.activeBudget - a.calc.activeBudget; }).slice(0, 8).map(function (m) {
    return { planId: m.plan.PlanId, name: m.plan.Name, owner: m.plan.Owner, fund: m.plan.FundCode, activeBudget: m.calc.activeBudget, netPaid: m.calc.netPaid, pct: m.calc.pct };
  });
  var overdueAll = inScope.filter(function (m) { return m.overdue.is; }).sort(function (a, b) { return b.overdue.daysLate - a.overdue.daysLate; });
  var overdue = { count: overdueAll.length, items: overdueAll.slice(0, 8).map(function (m) { return { planId: m.plan.PlanId, name: m.plan.Name, owner: m.plan.Owner, reason: m.overdue.reason, daysLate: m.overdue.daysLate }; }) };

  var hospPlans = inScope.filter(function (m) { return !fm[m.plan.FundCode] || fm[m.plan.FundCode].StrategySet !== 'region'; });
  var noDateActs = 0, noDateBudget = 0, noEvid = 0;
  inScope.forEach(function (m) {
    noEvid += m.calc.noEvidenceCount;
    m.items.forEach(function (x) { if (!x.calc.excluded && x.calc.plannedBudget > 0 && !dstr_(x.act.PlanStart)) { noDateActs++; noDateBudget += x.calc.plannedBudget; } });
  });
  var completeness = {
    plansNoStrategy: hospPlans.filter(function (m) { return !(m.plan.StrategyMoph && m.plan.StrategyMission && m.plan.StrategyProv && m.plan.StrategyHosp); }).length,
    hospPlans: hospPlans.length,
    plansNoType: inScope.filter(function (m) { return !m.plan.PlanType; }).length,
    actsNoDate: noDateActs, actsNoDateBudget: round2_(noDateBudget), disbNoEvidence: noEvid,
    fixOpen: readAll_('FixQueue').filter(function (r) { return !bool_(r.Resolved); }).length
  };
  var out = { year: String(year), scope: scope, settings: { excludeCancelled: excl }, totals: T, byFund: byFund, actStatus: actStatus, execCount: execCount,
    planStatus: planStatus, strategy: strat, monthly: monthly, topPlans: top, overdue: overdue, completeness: completeness };
  if (user.Role === 'admin') out.pendingUsers = readAll_('Users').filter(function (u) { return u.Status === 'pending'; }).length;
  return out;
}

function overdueList_(user, p) {
  var year = p.year || getSettings_().CurrentYear, fm = fundMap_();
  return buildModel_(year).filter(function (m) { return m.overdue.is; }).sort(function (a, b) { return planOrder_(a, b, fm); }).map(function (m) {
    return { planId: m.plan.PlanId, fund: m.plan.FundCode, seq: String(m.plan.Seq), name: m.plan.Name, owner: m.plan.Owner, department: m.plan.Department,
      plannedBudget: m.calc.plannedBudget, netPaid: m.calc.netPaid, pct: m.calc.pct, reason: m.overdue.reason, daysLate: m.overdue.daysLate };
  });
}


// ---------------------------------------------------------------------------------
// v2.3 กระดานงาน / แผนเวลา / หมุดหมาย — สร้างจากกิจกรรมในชีตเดิม (Activities.Progress = ค่าที่ผู้ใช้ตั้งเอง ชนะค่าที่คำนวณ)
// ---------------------------------------------------------------------------------
var PROGRESS_ = ['todo', 'doing', 'done'];
function addDaysIso_(iso, n) {
  var d = dateObj_(iso); if (!d) return '';
  d.setDate(d.getDate() + n);
  var p = function (x) { return ('0' + x).slice(-2); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
/** สถานะงานของกิจกรรม: ค่าที่ตั้งเอง > คำนวณจากการเบิกจ่ายและวันที่ */
function actProgress_(x, today, planStatus) {
  var set = str_(x.act.Progress);
  if (PROGRESS_.indexOf(set) >= 0) return set;
  if (planStatus === 'ส่งสรุปแล้ว' || planStatus === 'ปิด') return 'done'; // แผนที่ส่งสรุป/ปิดแล้ว ถือว่ากิจกรรมเสร็จ
  var c = x.calc, s = dstr_(x.act.PlanStart), e = dstr_(x.act.PlanEnd) || s;
  if (c.plannedBudget > 0 && c.netPaid >= c.plannedBudget - 0.5) return 'done';
  if (c.plannedBudget <= 0 && e && e < today) return 'done';
  if (c.netPaid > 0 || (s && s <= today)) return 'doing';
  return 'todo';
}
function planEditable_(user, plan) {
  var locked = plan.Status === 'ปิด' && user.Role !== 'admin' && getSettings_().LockClosedPlans === 'TRUE';
  return canEditPlan_(user, plan) && !locked;
}

/** เลยกำหนดหรือไม่: ยังไม่เสร็จ + มีวันสิ้นสุดที่ผ่านมาแล้ว + ไม่ใช่กิจกรรมที่ "เลื่อน" (วันที่เดิมไม่ใช้แล้ว) */
function actOverdue_(x, pr, today) {
  var e = dstr_(x.act.PlanEnd) || dstr_(x.act.PlanStart);
  return pr !== 'done' && !!e && e < today && x.act.Status !== 'เลื่อน';
}
/** tasks.list: กิจกรรมทั้งหมดของปี (ไม่รวมกิจกรรม/แผนที่ยกเลิก) ใช้ทั้งกระดานงานและแผนเวลา */
function tasksList_(user, p) {
  var year = p.year || getSettings_().CurrentYear, today = todayIso_(), q = str_(p.q).toLowerCase(), fm = fundMap_();
  var mineOwner = p.mine ? str_(user.PersonName) : '';
  var model = buildModel_(year).sort(function (a, b) { return planOrder_(a, b, fm); });
  var items = [], plans = [];
  model.forEach(function (m) {
    if (m.plan.Status === 'ยกเลิก') return;
    if (p.owner && String(m.plan.Owner) !== String(p.owner)) return;
    if (mineOwner && String(m.plan.Owner) !== mineOwner) return;
    if (p.fund && m.plan.FundCode !== p.fund) return;
    var can = planEditable_(user, m.plan), n = 0;
    m.items.forEach(function (x) {
      if (x.act.Status === 'ยกเลิก') return;
      var name = String(x.act.Name);
      if (q && (name + ' ' + m.plan.Name + ' ' + m.plan.Owner).toLowerCase().indexOf(q) < 0) return;
      var pr = actProgress_(x, today, m.plan.Status), s = dstr_(x.act.PlanStart), e = dstr_(x.act.PlanEnd) || s;
      n++;
      items.push({ actId: x.act.ActId, planId: m.plan.PlanId, plan: m.plan.Name, planStatus: m.plan.Status, fund: m.plan.FundCode, owner: m.plan.Owner,
        no: String(x.act.No), name: name, status: x.act.Status, start: s, end: e, budget: x.calc.plannedBudget, paid: x.calc.netPaid,
        progress: pr, manual: PROGRESS_.indexOf(str_(x.act.Progress)) >= 0, overdue: actOverdue_(x, pr, today), canEdit: can });
    });
    if (n) plans.push({ planId: m.plan.PlanId, name: m.plan.Name, seq: String(m.plan.Seq), fund: m.plan.FundCode, owner: m.plan.Owner, status: m.plan.Status });
  });
  var cnt = { todo: 0, doing: 0, done: 0, overdue: 0 };
  items.forEach(function (i) { cnt[i.progress]++; if (i.overdue) cnt.overdue++; });
  return { year: String(year), today: today, items: items, plans: plans, counts: cnt };
}

/** acts.progress: เปลี่ยนสถานะงานบนกระดาน (ว่าง = กลับไปใช้ค่าอัตโนมัติ) — ตรวจสิทธิ์และค่าที่ฝั่งเซิร์ฟเวอร์ */
function actsProgress_(user, p) {
  var a = findBy_('Activities', 'ActId', p.actId);
  if (!a || bool_(a.IsDeleted)) fail_('NOT_FOUND', 'ไม่พบกิจกรรม');
  mustEditPlan_(user, a.PlanId);
  if (a.Status === 'ยกเลิก') fail_('VALIDATION', 'กิจกรรมที่ยกเลิกแล้วไม่สามารถเปลี่ยนความคืบหน้าได้');
  var v = str_(p.progress);
  if (v && PROGRESS_.indexOf(v) < 0) fail_('VALIDATION', 'สถานะงานไม่ถูกต้อง');
  var o = stripRow_(a); o.Progress = v; o.UpdatedAt = nowIso_(); o.UpdatedBy = user.Email;
  update_('Activities', a._row, o);
  audit_(user.Email, 'เปลี่ยนความคืบหน้ากิจกรรม', 'Activity', a.ActId, (str_(a.Progress) || '(อัตโนมัติ)') + ' → ' + (v || '(อัตโนมัติ)'));
  return { actId: a.ActId, progress: v };
}

/** milestones.list: หมุดหมายระดับแผน 2 จุด/แผน — (1) กิจกรรมสุดท้ายสิ้นสุด (2) ครบกำหนดส่งสรุปโครงการ (= วันสิ้นสุด + SummaryGraceDays) */
function milestonesList_(user, p) {
  var year = p.year || getSettings_().CurrentYear, today = todayIso_(), grace = num_(getSettings_().SummaryGraceDays), fm = fundMap_();
  var q = str_(p.q).toLowerCase();
  var model = buildModel_(year).sort(function (a, b) { return planOrder_(a, b, fm); });
  var items = [];
  model.forEach(function (m) {
    var pl = m.plan;
    if (['ยกเลิก', 'ร่าง'].indexOf(pl.Status) >= 0) return;
    if (p.fund && pl.FundCode !== p.fund) return;
    if (q && (String(pl.Name) + ' ' + String(pl.Owner)).toLowerCase().indexOf(q) < 0) return;
    var act = m.items.filter(function (x) { return x.act.Status !== 'ยกเลิก' && !x.calc.excluded; });
    var lastEnd = '', n = act.length, nDone = 0;
    act.forEach(function (x) {
      var e = dstr_(x.act.PlanEnd) || dstr_(x.act.PlanStart); if (e && e > lastEnd) lastEnd = e;
      if (actProgress_(x, today, pl.Status) === 'done') nDone++;
    });
    var planned = m.calc.plannedBudget, imp = planned >= cfgNum_('IMPORTANCE_HIGH_BAHT') ? 'สูง' : (planned >= cfgNum_('IMPORTANCE_MID_BAHT') ? 'กลาง' : 'ปกติ');
    var sumDone = bool_(pl.SummarySent) || ['ส่งสรุปแล้ว', 'ปิด'].indexOf(pl.Status) >= 0;
    var base = { planId: pl.PlanId, plan: pl.Name, seq: String(pl.Seq), fund: pl.FundCode, owner: pl.Owner, planStatus: pl.Status, budget: planned, paid: m.calc.netPaid, importance: imp, acts: n, actsDone: nDone };
    var endDone = n > 0 && nDone === n;
    var e1 = Object.assign({}, base, { id: pl.PlanId + ':end', kind: 'end', title: 'กิจกรรมสุดท้ายของแผนสิ้นสุด', date: lastEnd,
      state: !lastEnd ? 'nodate' : (endDone ? 'done' : (lastEnd < today ? 'overdue' : 'upcoming')) });
    if (!endDone && e1.state === 'overdue' && act.every(function (x) { return x.act.Status === 'เลื่อน'; })) e1.state = 'upcoming';
    var due = lastEnd ? addDaysIso_(lastEnd, grace) : '';
    var sdate = dstr_(pl.SummarySentDate);
    var e2 = Object.assign({}, base, { id: pl.PlanId + ':sum', kind: 'summary', title: 'ส่งสรุปผลการดำเนินงานโครงการ', date: sumDone ? (sdate || due) : due,
      state: sumDone ? 'done' : (m.overdue.is ? 'overdue' : (!due ? 'nodate' : (due < today ? 'overdue' : 'upcoming'))) });
    if (e2.state === 'overdue' && m.overdue.is) e2.note = m.overdue.reason;
    [e1, e2].forEach(function (e) { e.daysTo = e.date ? daysBetween_(today, e.date) : null; items.push(e); });
  });
  var order = { overdue: 0, upcoming: 1, nodate: 2, done: 3 };
  items.sort(function (a, b) {
    if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
    var d = String(a.date).localeCompare(String(b.date)); return a.state === 'done' ? -d : d;
  });
  var cnt = { total: items.length, done: 0, overdue: 0, upcoming: 0, nodate: 0, soon: 0 };
  items.forEach(function (e) { cnt[e.state]++; if (e.state === 'upcoming' && e.daysTo !== null && e.daysTo <= 30) cnt.soon++; });
  return { year: String(year), today: today, grace: grace, thresholds: { high: cfgNum_('IMPORTANCE_HIGH_BAHT'), mid: cfgNum_('IMPORTANCE_MID_BAHT') }, items: items, counts: cnt };
}

// ---------------------------------------------------------------------------------
// v2.4 โมดูลเพิ่มเติม: งบประมาณ · ค่าใช้จ่าย · คำขออนุมัติ · ความเสี่ยง/ปัญหา/ทรัพยากร/การประชุม/เอกสาร (ชีต Records)
//      ทีม · เอกสารอัตโนมัติ · ศูนย์แจ้งเตือน · ประวัติรวม · คลังโครงการ
// ---------------------------------------------------------------------------------
var REC_KINDS_ = {
  risk: { th: 'ความเสี่ยง', status: ['เฝ้าระวัง', 'กำลังจัดการ', 'ปิดความเสี่ยง'] },
  issue: { th: 'ปัญหาและอุปสรรค', status: ['เปิด', 'กำลังแก้ไข', 'แก้ไขแล้ว'] },
  resource: { th: 'ทรัพยากร', status: ['วางแผน', 'จัดสรรแล้ว', 'ใช้งานอยู่', 'คืนแล้ว'] },
  meeting: { th: 'การประชุม', status: ['นัดหมาย', 'จัดแล้ว', 'ยกเลิก'] },
  document: { th: 'เอกสาร', status: ['ฉบับร่าง', 'ใช้งาน', 'ยกเลิก'] }
};
var REC_PRIORITIES_ = ['ต่ำ', 'ปานกลาง', 'สูง', 'วิกฤต'];
function riskScore_(r) { return num_(r.Likelihood) * num_(r.Impact); }

function recOut_(r, plan, user) {
  var o = stripRow_(r); o.IsDeleted = false; o.Date = dstr_(o.Date); o.CreatedAt = String(o.CreatedAt); o.UpdatedAt = String(o.UpdatedAt);
  o.Likelihood = num_(o.Likelihood); o.Impact = num_(o.Impact); o.score = riskScore_(r);
  o.plan = plan ? plan.Name : ''; o.planYear = plan ? String(plan.Year) : '';
  o.canEdit = plan ? planEditable_(user, plan) : (user.Role === 'admin' || (user.Role === 'user' && String(r.CreatedBy) === user.Email));
  delete o.CreatedBy; delete o.UpdatedBy;
  return o;
}
function planMapAll_() { var m = {}; readAll_('Plans').forEach(function (p) { if (!bool_(p.IsDeleted)) m[p.PlanId] = p; }); return m; }
/** รายการ Records ของปีที่เลือก (ผูกแผนของปีนั้น หรือไม่ผูกแผน) */
function recordsForYear_(kind, year) {
  var pm = planMapAll_(), out = [];
  readAll_('Records').forEach(function (r) {
    if (r.Kind !== kind || bool_(r.IsDeleted)) return;
    var pl = r.PlanId ? pm[r.PlanId] : null;
    if (r.PlanId && (!pl || String(pl.Year) !== String(year))) return;
    if (!r.PlanId && dstr_(r.Date)) { var dd = dstr_(r.Date); if (String(+dd.substring(0, 4) + 543 + (+dd.substring(5, 7) >= 10 ? 1 : 0)) !== String(year)) return; }
    out.push({ r: r, plan: pl });
  });
  return out;
}
function recordsList_(user, p) {
  var kind = str_(p.kind); if (!REC_KINDS_[kind]) fail_('VALIDATION', 'ประเภทรายการไม่ถูกต้อง');
  var year = p.year || getSettings_().CurrentYear;
  var items = recordsForYear_(kind, year).map(function (x) { return recOut_(x.r, x.plan, user); });
  items.sort(function (a, b) { return String(b.Date || b.CreatedAt).localeCompare(String(a.Date || a.CreatedAt)); });
  var plans = readAll_('Plans').filter(function (pl) { return String(pl.Year) === String(year) && !bool_(pl.IsDeleted) && pl.Status !== 'ยกเลิก'; })
    .map(function (pl) { return { planId: pl.PlanId, name: pl.Name, seq: String(pl.Seq) }; });
  var people = readAll_('People').filter(function (x) { return bool_(x.Active) || x.Active === ''; }).map(function (x) { return x.Name; });
  return { year: String(year), kind: kind, riskHigh: cfgNum_('RISK_HIGH_SCORE'), riskMid: cfgNum_('RISK_MID_SCORE'), items: items, plans: plans, people: people, statuses: REC_KINDS_[kind].status, priorities: REC_PRIORITIES_ };
}
function recordsSave_(user, p) {
  var kind = str_(p.kind), K = REC_KINDS_[kind]; if (!K) fail_('VALIDATION', 'ประเภทรายการไม่ถูกต้อง');
  var old = p.recId ? findBy_('Records', 'RecId', p.recId) : null;
  if (p.recId && (!old || bool_(old.IsDeleted) || old.Kind !== kind)) fail_('NOT_FOUND', 'ไม่พบรายการ');
  var planId = str_(p.planId);
  if (old && str_(old.PlanId)) mustEditPlan_(user, old.PlanId);
  if (old && !str_(old.PlanId) && user.Role !== 'admin' && String(old.CreatedBy) !== user.Email) fail_('FORBIDDEN', 'แก้ไขได้เฉพาะผู้สร้างรายการหรือแอดมิน');
  if (planId) mustEditPlan_(user, planId);
  var title = str_(p.title); if (!title) fail_('VALIDATION', 'กรุณากรอกหัวข้อ'); if (title.length > 200) fail_('VALIDATION', 'หัวข้อยาวเกิน 200 ตัวอักษร');
  var detail = str_(p.detail); if (detail.length > 2000) fail_('VALIDATION', 'รายละเอียดยาวเกิน 2,000 ตัวอักษร');
  var owner = str_(p.owner); if (owner.length > 120) fail_('VALIDATION', 'ชื่อผู้รับผิดชอบยาวเกินไป');
  var status = str_(p.status) || K.status[0]; if (K.status.indexOf(status) < 0) fail_('VALIDATION', 'สถานะไม่ถูกต้อง');
  var date = validDate_(p.date, 'วันที่'); if (kind === 'meeting' && !date) fail_('VALIDATION', 'กรุณาระบุวันที่ประชุม');
  var url = str_(p.url); if (url.length > 500) fail_('VALIDATION', 'ลิงก์ยาวเกินไป');
  if (url && !/^https?:\/\//i.test(url)) fail_('VALIDATION', 'ลิงก์ต้องขึ้นต้นด้วย http(s)://');
  if (kind === 'document' && !url) fail_('VALIDATION', 'กรุณาใส่ลิงก์เอกสาร');
  var lik = '', imp = '', pri = '';
  if (kind === 'risk') {
    lik = Math.round(num_(p.likelihood)); imp = Math.round(num_(p.impact));
    if (lik < 1 || lik > 5 || imp < 1 || imp > 5) fail_('VALIDATION', 'โอกาสเกิดและผลกระทบต้องเป็น 1–5');
  }
  if (kind === 'issue') { pri = str_(p.priority) || 'ปานกลาง'; if (REC_PRIORITIES_.indexOf(pri) < 0) fail_('VALIDATION', 'ระดับความสำคัญไม่ถูกต้อง'); }
  var now = nowIso_();
  if (!old) { // กันกดบันทึกซ้ำ/ส่งซ้ำจากเครือข่ายช้า: รายการเหมือนกันที่สร้างโดยผู้ใช้เดียวกันภายใน 20 วินาที ให้คืนรายการเดิม
    var dup = readAll_('Records').filter(function (r) { return !bool_(r.IsDeleted) && r.Kind === kind && String(r.PlanId) === planId && r.Title === title && String(r.CreatedBy) === user.Email && Math.abs(new Date(now) - new Date(String(r.CreatedAt))) < 20000; })[0];
    if (dup) return recOut_(dup, planId ? findBy_('Plans', 'PlanId', planId) : null, user);
  }
  var o = old ? stripRow_(old) : { RecId: newId_('R'), Kind: kind, IsDeleted: false, CreatedAt: now, CreatedBy: user.Email };
  o.PlanId = planId; o.Title = title; o.Detail = detail; o.Owner = owner; o.Status = status; o.Priority = pri; o.Date = date;
  o.Likelihood = lik; o.Impact = imp; o.Url = url; o.UpdatedAt = now; o.UpdatedBy = user.Email;
  if (old) update_('Records', old._row, o); else insert_('Records', o);
  if (planId) writeChanges_([chgRow_(user, 'Record', o.RecId, planId, (old ? '(แก้ไข' : '(เพิ่ม') + K.th + ')', old ? old.Title : '', title, '')]);
  audit_(user.Email, (old ? 'แก้ไข' : 'เพิ่ม') + K.th, 'Record', o.RecId, title);
  var pl = planId ? findBy_('Plans', 'PlanId', planId) : null;
  return recOut_(o, pl, user);
}
function recordsDelete_(user, p) {
  var r = findBy_('Records', 'RecId', p.recId);
  if (!r || bool_(r.IsDeleted)) fail_('NOT_FOUND', 'ไม่พบรายการ');
  if (str_(r.PlanId)) mustEditPlan_(user, r.PlanId);
  else if (user.Role !== 'admin' && String(r.CreatedBy) !== user.Email) fail_('FORBIDDEN', 'ลบได้เฉพาะผู้สร้างรายการหรือแอดมิน');
  var o = stripRow_(r); o.IsDeleted = true; o.UpdatedAt = nowIso_(); o.UpdatedBy = user.Email;
  update_('Records', r._row, o);
  if (str_(r.PlanId)) writeChanges_([chgRow_(user, 'Record', r.RecId, r.PlanId, '(ลบ' + (REC_KINDS_[r.Kind] ? REC_KINDS_[r.Kind].th : 'รายการ') + ')', r.Title, '', '')]);
  audit_(user.Email, 'ลบรายการ', 'Record', r.RecId, r.Title);
  return { ok: true };
}

/** budget.summary: งบตามแหล่งเงิน/หมวดค่าใช้จ่าย และยอดจ่ายรายเดือน (ตามวันที่จ่ายจริง) */
function budgetSummary_(user, p) {
  var year = p.year || getSettings_().CurrentYear, fm = fundMap_(), cm = catMap_(), scope = p.scope === 'all' ? 'all' : 'hospital';
  var model = buildModel_(year).filter(function (m) { return scope === 'all' || !fm[m.plan.FundCode] || bool_(fm[m.plan.FundCode].InHospitalKpi); });
  var byFund = {}, byCat = {}, ids = {}, tot = { plans: 0, planned: 0, active: 0, paid: 0, released: 0, remaining: 0 };
  model.forEach(function (m) {
    ids[m.plan.PlanId] = true;
    if (m.plan.Status === 'ยกเลิก' && m.calc.netPaid <= 0) return;
    var code = m.plan.FundCode, f = byFund[code] || (byFund[code] = { fund: code, name: fm[code] ? fm[code].Name : code, sort: fm[code] ? num_(fm[code].SortOrder) : 99, plans: 0, planned: 0, active: 0, paid: 0, released: 0 });
    f.plans++; f.planned += m.calc.plannedBudget; f.active += m.calc.activeBudget; f.paid += m.calc.netPaid; f.released += m.calc.released;
    tot.plans++; tot.planned += m.calc.plannedBudget; tot.active += m.calc.activeBudget; tot.paid += m.calc.netPaid; tot.released += m.calc.released;
    if (m.plan.Status !== 'ยกเลิก') m.items.forEach(function (x) {
      if (x.calc.excluded) return;
      x.lines.forEach(function (l) { var k = String(l.CategoryCode); byCat[k] = (byCat[k] || 0) + num_(l.Amount); });
    });
  });
  var funds = Object.keys(byFund).map(function (k) { var f = byFund[k]; f.remaining = round2_(f.active - f.paid); f.pct = f.active > 0 ? round2_(f.paid / f.active * 100) : 0;
    ['planned', 'active', 'paid', 'released'].forEach(function (c) { f[c] = round2_(f[c]); }); return f; }).sort(function (a, b) { return a.sort - b.sort; });
  var cats = Object.keys(byCat).map(function (k) { return { code: k, name: cm[k] || k, amount: round2_(byCat[k]) }; }).sort(function (a, b) { return b.amount - a.amount; });
  var months = []; for (var i = 0; i < 12; i++) months.push(0);
  var undated = 0;
  readAll_('Disbursements').forEach(function (d) {
    if (!ids[d.PlanId]) return;
    var pd = dstr_(d.PaidDate), amt = num_(d.Amount);
    if (!pd) { undated += amt; return; }
    var mo = +pd.substring(5, 7); months[(mo + 2) % 12] += amt;
  });
  ['planned', 'active', 'paid', 'released'].forEach(function (c) { tot[c] = round2_(tot[c]); });
  tot.remaining = round2_(tot.active - tot.paid); tot.pct = tot.active > 0 ? round2_(tot.paid / tot.active * 100) : 0;
  return { year: String(year), scope: scope, totals: tot, funds: funds, categories: cats, months: months.map(round2_), undatedPaid: round2_(undated) };
}

function disbStage_(d) {
  if (dstr_(d.PaidDate)) return 'จ่ายแล้ว';
  if (dstr_(d.PayRequestDate)) return 'ขอเบิกแล้ว';
  if (dstr_(d.ApproveDate)) return 'อนุมัติแล้ว';
  return 'รออนุมัติ';
}
/** expenses.list: งวดเบิกจ่ายทั้งหมดของปี + สถานะตามวันที่ (ใช้ทั้งหน้า ค่าใช้จ่าย และ คำขออนุมัติ) */
function expensesList_(user, p) {
  var year = p.year || getSettings_().CurrentYear, pm = {}, am = {};
  readAll_('Plans').forEach(function (pl) { if (String(pl.Year) === String(year) && !bool_(pl.IsDeleted)) pm[pl.PlanId] = pl; });
  readAll_('Activities').forEach(function (a) { if (pm[a.PlanId] && !bool_(a.IsDeleted)) am[a.ActId] = a; });
  var rows = [], cnt = { 'รออนุมัติ': 0, 'อนุมัติแล้ว': 0, 'ขอเบิกแล้ว': 0, 'จ่ายแล้ว': 0 }, sum = { 'รออนุมัติ': 0, 'อนุมัติแล้ว': 0, 'ขอเบิกแล้ว': 0, 'จ่ายแล้ว': 0 };
  readAll_('Disbursements').forEach(function (d) {
    var pl = pm[d.PlanId]; if (!pl) return;
    var a = d.ActId ? am[d.ActId] : null, st = disbStage_(d), amt = num_(d.Amount);
    cnt[st]++; sum[st] += amt;
    rows.push({ id: d.DisbId, planId: d.PlanId, plan: pl.Name, fund: pl.FundCode, owner: pl.Owner, actNo: a ? String(a.No) : '', act: a ? a.Name : '(ระดับแผน)', seq: num_(d.Seq),
      approveDate: dstr_(d.ApproveDate), requestDate: dstr_(d.PayRequestDate), paidDate: dstr_(d.PaidDate), amount: amt, evidence: safeUrl_(d.EvidenceUrl), note: str_(d.Note), stage: st });
  });
  var refunds = 0; readAll_('Adjustments').forEach(function (j) { if (pm[j.PlanId] && j.Type === 'คืนเงิน') refunds += num_(j.Amount); });
  rows.sort(function (a, b) { return String(b.paidDate || b.requestDate || b.approveDate).localeCompare(String(a.paidDate || a.requestDate || a.approveDate)); });
  Object.keys(sum).forEach(function (k) { sum[k] = round2_(sum[k]); });
  return { year: String(year), rows: rows.slice(0, 3000), truncated: rows.length > 3000, counts: cnt, sums: sum, refunds: round2_(refunds),
    pendingPlans: Object.keys(pm).filter(function (k) { return pm[k].Status === 'ร่าง'; }).map(function (k) { return { planId: k, name: pm[k].Name, owner: pm[k].Owner, fund: pm[k].FundCode }; }) };
}

/** team.list: ผู้รับผิดชอบ/บุคลากร พร้อมภาระงานของปี */
function teamList_(user, p) {
  var year = p.year || getSettings_().CurrentYear, today = todayIso_(), model = buildModel_(year), S = {};
  var get = function (n, dept) { return S[n] || (S[n] = { name: n, department: dept || '', plans: 0, planned: 0, paid: 0, overdueSummary: 0, acts: 0, done: 0, late: 0, email: '' }); };
  var ppl = readAll_('People'); ppl.forEach(function (x) { if (x.Active === false || String(x.Active).toUpperCase() === 'FALSE') return; var s = get(String(x.Name), x.Department); if (user.Role === 'admin') s.email = str_(x.Email); });
  model.forEach(function (m) {
    if (m.plan.Status === 'ยกเลิก') return;
    var s = get(str_(m.plan.Owner) || '(ไม่ระบุผู้รับผิดชอบ)', m.plan.Department); if (!s.department) s.department = str_(m.plan.Department);
    s.plans++; s.planned += m.calc.plannedBudget; s.paid += m.calc.netPaid; if (m.overdue.is) s.overdueSummary++;
    m.items.forEach(function (x) {
      if (x.act.Status === 'ยกเลิก' || x.calc.excluded) return;
      s.acts++; var pr = actProgress_(x, today, m.plan.Status);
      if (pr === 'done') s.done++; else if (actOverdue_(x, pr, today)) s.late++;
    });
  });
  var list = Object.keys(S).map(function (k) { var s = S[k]; s.planned = round2_(s.planned); s.paid = round2_(s.paid); return s; })
    .sort(function (a, b) { return (b.plans - a.plans) || (b.planned - a.planned) || a.name.localeCompare(b.name); });
  return { year: String(year), members: list, withPlans: list.filter(function (s) { return s.plans > 0; }).length };
}

/** documents.list: เอกสารที่ระบบรวบรวมให้อัตโนมัติ (ไฟล์สรุปโครงการ + หลักฐานการเบิกจ่าย) */
function documentsList_(user, p) {
  var year = p.year || getSettings_().CurrentYear, pm = {}, items = [];
  readAll_('Plans').forEach(function (pl) { if (String(pl.Year) === String(year) && !bool_(pl.IsDeleted)) pm[pl.PlanId] = pl; });
  Object.keys(pm).forEach(function (k) {
    var pl = pm[k]; if (safeUrl_(pl.SummaryFileUrl)) items.push({ type: 'สรุปโครงการ', title: 'สรุปผลการดำเนินงาน: ' + pl.Name, planId: k, plan: pl.Name, owner: pl.Owner, url: safeUrl_(pl.SummaryFileUrl), date: dstr_(pl.SummarySentDate) });
  });
  readAll_('Disbursements').forEach(function (d) {
    var pl = pm[d.PlanId]; if (!pl || !safeUrl_(d.EvidenceUrl)) return;
    items.push({ type: 'หลักฐานเบิกจ่าย', title: 'หลักฐานการเบิกจ่าย งวดที่ ' + num_(d.Seq), planId: d.PlanId, plan: pl.Name, owner: pl.Owner, url: safeUrl_(d.EvidenceUrl), date: dstr_(d.PaidDate) || dstr_(d.PayRequestDate) || dstr_(d.ApproveDate) });
  });
  items.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  return { year: String(year), items: items.slice(0, 1500) };
}

/** alerts.list: ศูนย์แจ้งเตือน — คำนวณจากข้อมูลจริงทุกครั้ง */
function alertsList_(user, p) {
  var year = p.year || getSettings_().CurrentYear, today = todayIso_(), model = buildModel_(year), out = [], pm = {};
  var add = function (sev, type, title, detail, planId, date) { out.push({ id: type + ':' + out.length, sev: sev, type: type, title: title, detail: detail, planId: planId || '', date: date || '' }); };
  model.forEach(function (m) {
    pm[m.plan.PlanId] = m.plan;
    if (m.plan.Status === 'ยกเลิก') return;
    if (m.calc.remaining < -0.5) add('high', 'over', 'เบิกจ่ายเกินงบ ' + Math.abs(round2_(m.calc.remaining)).toLocaleString('en-US') + ' บาท', m.plan.Name + ' — ตรวจสอบรายการเบิก หรือขอปรับเพิ่มงบ', m.plan.PlanId, '');
    if (m.overdue.is) add('high', 'summary', 'ค้างส่งสรุปโครงการ', m.plan.Name + ' — ' + m.overdue.reason, m.plan.PlanId, '');
    var late = 0, soon = [], nodate = 0, badDates = 0;
    m.items.forEach(function (x) {
      if (x.act.Status === 'ยกเลิก') return;
      var pr = actProgress_(x, today, m.plan.Status), e = dstr_(x.act.PlanEnd) || dstr_(x.act.PlanStart), s0 = dstr_(x.act.PlanStart);
      if (!e) { if (pr !== 'done' && !x.calc.excluded) nodate++; return; }
      if (s0 && e < s0) badDates++;
      if (pr === 'done') return;
      if (actOverdue_(x, pr, today)) late++; else if (x.act.Status === 'เลื่อน') return; else { var dd = daysBetween_(today, e); if (dd !== null && dd <= cfgNum_('ALERT_SOON_DAYS')) soon.push({ x: x, e: e, dd: dd }); }
    });
    if (badDates) add('medium', 'dates', 'วันที่สิ้นสุดก่อนวันเริ่ม ' + badDates + ' กิจกรรม', m.plan.Name + ' — ตรวจสอบและแก้ไขวันที่', m.plan.PlanId, '');
    if (nodate && ['ดำเนินการ', 'อนุมัติ'].indexOf(m.plan.Status) >= 0) add('low', 'nodate', 'กิจกรรมยังไม่ระบุวันที่ ' + nodate + ' รายการ', m.plan.Name + ' — แผนเวลาและหมุดหมายจะไม่แสดงกิจกรรมเหล่านี้', m.plan.PlanId, '');
    if (late) add(late >= 3 ? 'high' : 'medium', 'late', 'กิจกรรมเลยกำหนด ' + late + ' รายการ', m.plan.Name, m.plan.PlanId, '');
    soon.forEach(function (s) { add('low', 'soon', 'ครบกำหนดใน ' + s.dd + ' วัน', String(s.x.act.Name) + ' · ' + m.plan.Name, m.plan.PlanId, s.e); });
  });
  readAll_('Disbursements').forEach(function (d) {
    var pl = pm[d.PlanId]; if (!pl || pl.Status === 'ยกเลิก') return;
    var ap = dstr_(d.ApproveDate); if (!ap || dstr_(d.PaidDate)) return;
    var dd = daysBetween_(ap, today); if (dd !== null && dd > cfgNum_('ALERT_PAY_DAYS')) add('medium', 'payment', 'อนุมัติแล้วแต่ยังไม่จ่าย ' + dd + ' วัน', pl.Name + ' · งวดที่ ' + num_(d.Seq) + ' · ฿' + round2_(num_(d.Amount)), d.PlanId, ap);
  });
  recordsForYear_('risk', year).forEach(function (x) {
    var sc = riskScore_(x.r); if (sc >= cfgNum_('RISK_HIGH_SCORE') && x.r.Status !== 'ปิดความเสี่ยง') add('high', 'risk', 'ความเสี่ยงสูง (คะแนน ' + sc + '/25)', String(x.r.Title) + (x.plan ? ' · ' + x.plan.Name : ''), x.r.PlanId, dstr_(x.r.Date));
  });
  recordsForYear_('issue', year).forEach(function (x) {
    if (x.r.Status === 'แก้ไขแล้ว' || ['สูง', 'วิกฤต'].indexOf(x.r.Priority) < 0) return;
    add(x.r.Priority === 'วิกฤต' ? 'high' : 'medium', 'issue', 'ปัญหาระดับ' + x.r.Priority + 'ยังไม่แก้ไข', String(x.r.Title) + (x.plan ? ' · ' + x.plan.Name : ''), x.r.PlanId, dstr_(x.r.Date));
  });
  recordsForYear_('meeting', year).forEach(function (x) {
    var dt = dstr_(x.r.Date), dd = dt ? daysBetween_(today, dt) : null;
    if (x.r.Status === 'นัดหมาย' && dd !== null && dd >= 0 && dd <= cfgNum_('ALERT_SOON_DAYS')) add('low', 'meeting', 'การประชุมใน ' + dd + ' วัน', String(x.r.Title), x.r.PlanId, dt);
  });
  if (user.Role === 'admin') { var pend = readAll_('Users').filter(function (u) { return u.Status === 'pending'; }).length; if (pend) add('medium', 'users', 'ผู้ใช้รออนุมัติสิทธิ์ ' + pend + ' คน', 'ไปที่เมนู ผู้ใช้งาน เพื่ออนุมัติหรือปฏิเสธ', '', ''); }
  var fix = readAll_('FixQueue').filter(function (f) { return !bool_(f.Resolved); }).length;
  if (fix) add('low', 'fix', 'ข้อมูลรอแก้ไข ' + fix + ' รายการ', 'ตรวจที่เมนู "ข้อมูลรอแก้ไข"', '', '');
  var ord = { high: 0, medium: 1, low: 2 };
  out.sort(function (a, b) { return (ord[a.sev] - ord[b.sev]) || String(a.date || '9').localeCompare(String(b.date || '9')); });
  var cnt = { high: 0, medium: 0, low: 0 }; out.forEach(function (a) { cnt[a.sev]++; });
  return { year: String(year), today: today, items: out.slice(0, 400), counts: cnt, total: out.length };
}

/** archive.list: คลังโครงการ — แผนที่ปิด/ส่งสรุปแล้ว/ยกเลิก ทุกปี */
function archiveList_(user, p) {
  var years = {}; readAll_('Plans').forEach(function (pl) { if (!bool_(pl.IsDeleted)) years[String(pl.Year)] = true; });
  var fm = fundMap_(), out = [];
  Object.keys(years).sort().reverse().forEach(function (y) {
    buildModel_(y).sort(function (a, b) { return planOrder_(a, b, fm); }).forEach(function (m) {
      var pl = m.plan; if (['ปิด', 'ส่งสรุปแล้ว', 'ยกเลิก'].indexOf(pl.Status) < 0 && !bool_(pl.SummarySent)) return;
      out.push({ planId: pl.PlanId, year: y, fund: pl.FundCode, seq: String(pl.Seq), name: pl.Name, owner: pl.Owner, status: pl.Status, planned: m.calc.plannedBudget, paid: m.calc.netPaid, pct: m.calc.pct, sentDate: dstr_(pl.SummarySentDate), summaryUrl: safeUrl_(pl.SummaryFileUrl) });
    });
  });
  return { plans: out.slice(0, 2000), years: Object.keys(years).sort().reverse() };
}

/** history.recent: ประวัติการทำรายการล่าสุดของทุกแผน (ผู้ที่ไม่ใช่แอดมินเห็นเฉพาะชื่อ ไม่เห็นอีเมล) */
function historyRecent_(user, p) {
  var n = Math.min(num_(p.limit) || 300, 800), pm = planMapAll_(), nm = {};
  if (user.Role !== 'admin') readAll_('Users').forEach(function (u) { nm[String(u.Email).toLowerCase()] = u.Name; });
  var rows = readAll_('ChangeLog');
  if (p.planId) rows = rows.filter(function (r) { return String(r.PlanId) === String(p.planId); });
  return rows.slice(-n).reverse().map(function (r) {
    var pl = pm[r.PlanId], who = user.Role === 'admin' ? String(r.Email) : (nm[String(r.Email).toLowerCase()] || 'ผู้ใช้ระบบ');
    return { time: String(r.Time), who: who, entity: String(r.Entity), planId: String(r.PlanId), plan: pl ? pl.Name : '', year: pl ? String(pl.Year) : '', field: String(r.Field), oldV: String(r.Old), newV: String(r.New), reason: String(r.Reason) };
  });
}

/** งานของฉัน: แผน/กิจกรรมของผู้ใช้ที่ล็อกอิน (ผูกด้วย Users.PersonName) — แอดมินระบุ p.owner เพื่อดูของผู้อื่นได้ */
function myWork_(user, p) {
  var year = p.year || getSettings_().CurrentYear;
  var owner = (user.Role === 'admin' && str_(p.owner)) ? str_(p.owner) : str_(user.PersonName);
  if (!owner) return { linked: false, owner: '', year: String(year), message: 'บัญชีนี้ยังไม่ได้ผูกกับชื่อผู้รับผิดชอบ — แจ้งแอดมินให้ใส่อีเมลของท่านในข้อมูลหลัก › ผู้รับผิดชอบ' };
  var fm = fundMap_(), today = todayIso_();
  var mine = buildModel_(year).filter(function (m) { return String(m.plan.Owner) === owner; }).sort(function (a, b) { return planOrder_(a, b, fm); });
  var ids = {}; mine.forEach(function (m) { ids[m.plan.PlanId] = true; });
  var upcoming = [], noDate = [], noBudget = [], tot = { planned: 0, active: 0, paid: 0 };
  mine.forEach(function (m) {
    tot.planned += m.calc.plannedBudget; tot.active += m.calc.activeBudget; tot.paid += m.calc.netPaid;
    var done = bool_(m.plan.SummarySent) || ['ยกเลิก', 'ปิด'].indexOf(m.plan.Status) >= 0;
    m.items.forEach(function (x) {
      if (x.calc.excluded) return;
      var base = { planId: m.plan.PlanId, plan: m.plan.Name, actId: x.act.ActId, no: String(x.act.No), name: x.act.Name, budget: x.calc.plannedBudget, paid: x.calc.netPaid };
      var s = dstr_(x.act.PlanStart), e = dstr_(x.act.PlanEnd) || s;
      if (!s) { if (!done) noDate.push(base); }
      else if (!done) {
        var toStart = daysBetween_(today, s), toEnd = daysBetween_(today, e);
        if (toEnd >= 0 && toStart <= 30) { base.start = s; base.end = e; base.inDays = toStart; base.ongoing = toStart <= 0; base.unpaid = x.calc.plannedBudget > 0 && x.calc.netPaid < x.calc.plannedBudget - 0.5; upcoming.push(base); }
        else if (toEnd < 0 && x.calc.plannedBudget > 0 && x.calc.netPaid < x.calc.plannedBudget - 0.5) { base.start = s; base.end = e; base.lateDays = -toEnd; base.pastUnpaid = true; upcoming.push(base); }
      }
      if (x.act.Status === 'ปกติ' && x.calc.plannedBudget <= 0 && !done) noBudget.push(base);
    });
  });
  upcoming.sort(function (a, b) { return (b.pastUnpaid ? 1 : 0) - (a.pastUnpaid ? 1 : 0) || String(a.start).localeCompare(String(b.start)); });
  var fix = readAll_('FixQueue').filter(function (f) { return !bool_(f.Resolved) && f.PlanId && ids[f.PlanId]; }).length;
  return {
    linked: true, owner: owner, year: String(year), today: today,
    totals: { plans: mine.length, planned: round2_(tot.planned), active: round2_(tot.active), paid: round2_(tot.paid), pct: tot.active > 0 ? round2_(tot.paid / tot.active * 100) : 0 },
    plans: mine.map(planBrief_),
    overdue: mine.filter(function (m) { return m.overdue.is; }).map(function (m) { return { planId: m.plan.PlanId, name: m.plan.Name, reason: m.overdue.reason, daysLate: m.overdue.daysLate }; }),
    upcoming: upcoming.slice(0, 60), noDate: noDate.slice(0, 60), noBudget: noBudget.slice(0, 60), fixCount: fix
  };
}

/** เติมกลุ่มงานของแผนที่ยังว่าง จากชีต People (รันมือใน Apps Script หลังกรอก People.Department แล้ว) */
function fillPlanDepartments() {
  CACHE_ = {};
  var ppl = {}; readAll_('People').forEach(function (x) { if (x.Name && x.Department) ppl[String(x.Name).trim()] = x.Department; });
  var n = 0, miss = [];
  readAll_('Plans').forEach(function (pl) {
    if (str_(pl.Department) || bool_(pl.IsDeleted)) return;
    var d = ppl[String(pl.Owner).trim()];
    if (d) { pl.Department = d; update_('Plans', pl._row, pl); n++; } else miss.push(pl.Owner);
  });
  invalidate_('Plans');
  Logger.log('เติมกลุ่มงานให้ ' + n + ' แผน · ไม่พบกลุ่มงานของ: ' + Array.from(new Set(miss)).join(', '));
  return n;
}

/** ส่งออกรายงานเป็นแท็บในชีตฐานข้อมูล หน้าตาใกล้เคียงชีทเดิม (แยกตามแหล่งเงิน) */
function reportExport_(admin, p) {
  var year = p.year || getSettings_().CurrentYear, fm = fundMap_(), model = buildModel_(year);
  var cats = readAll_('Categories').filter(function (c) { return bool_(c.Active) || c.Active === ''; }).sort(function (a, b) { return num_(a.SortOrder) - num_(b.SortOrder); });
  var made = [];
  Object.keys(fm).forEach(function (code) {
    var plans = model.filter(function (m) { return m.plan.FundCode === code; }).sort(function (a, b) { return planOrder_(a, b, fm); });
    if (!plans.length) return;
    var catSum = {}; plans.forEach(function (m) { m.items.forEach(function (x) { x.lines.forEach(function (l) { catSum[l.CategoryCode] = (catSum[l.CategoryCode] || 0) + num_(l.Amount); }); }); });
    var useCats = cats.filter(function (c) { return catSum[c.Code]; });
    var head = ['ลำดับ', 'ผู้รับผิดชอบ', 'แผน/โครงการ/กิจกรรม'].concat(useCats.map(function (c) { return c.Name; })).concat(['งบตามแผน', 'งบที่ใช้จริง*', 'เบิกจ่าย', 'คงเหลือ', 'ร้อยละ', 'สถานะ/หมายเหตุ']);
    var rows = [head], bold = [], gP = 0, gA = 0, gN = 0;
    plans.forEach(function (m) {
      bold.push(rows.length + 1);
      var cs = {}; m.items.forEach(function (x) { x.lines.forEach(function (l) { cs[l.CategoryCode] = (cs[l.CategoryCode] || 0) + num_(l.Amount); }); });
      rows.push([m.plan.Seq, m.plan.Owner, m.plan.Name].concat(useCats.map(function (c) { return cs[c.Code] || ''; }))
        .concat([m.calc.plannedBudget, m.calc.activeBudget, m.calc.netPaid, m.calc.remaining, m.calc.pct, [m.plan.Status, m.overdue.is ? 'ค้างส่งสรุป' : ''].filter(String).join(' / ')]));
      gP += m.calc.plannedBudget; gA += m.calc.activeBudget; gN += m.calc.netPaid;
      m.items.forEach(function (x) {
        var xs = {}; x.lines.forEach(function (l) { xs[l.CategoryCode] = (xs[l.CategoryCode] || 0) + num_(l.Amount); });
        rows.push(['', '', '   ' + x.act.Name].concat(useCats.map(function (c) { return xs[c.Code] || ''; }))
          .concat([x.calc.plannedBudget, x.calc.activeBudget, x.calc.netPaid, x.calc.remaining, x.calc.pct, [x.act.Status !== 'ปกติ' ? x.act.Status : '', x.act.Note].filter(String).join(' | ')]));
      });
    });
    rows.push(['', '', 'รวมทั้งสิ้น'].concat(useCats.map(function () { return ''; })).concat([round2_(gP), round2_(gA), round2_(gN), round2_(gA - gN), gA > 0 ? round2_(gN / gA * 100) : 0, '']));
    var name = ('รายงาน-' + fm[code].Name).replace(/[\[\]*?:\/\\]/g, '_').substring(0, 90);
    var sh = ss_().getSheetByName(name) || ss_().insertSheet(name);
    sh.clear();
    sh.getRange(1, 1, rows.length, head.length).setValues(rows);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#0e7c7b').setFontColor('#ffffff');
    bold.forEach(function (r) { sh.getRange(r, 1, 1, head.length).setFontWeight('bold').setBackground('#e8f5f4'); });
    sh.getRange(2, 4, rows.length - 1, head.length - 4).setNumberFormat('#,##0.00');
    sh.setFrozenRows(1);
    made.push(name);
  });
  audit_(admin.Email, 'ส่งออกรายงานลงชีต', 'Report', String(year), made.join(', '));
  return { sheets: made, url: ss_().getUrl(), note: '* งบที่ใช้จริง = ไม่นับงบของกิจกรรมที่ยกเลิก/ไม่เบิก' };
}

// ---------------------------------------------------------------------------------
// ตัวรับคำขอ API (doGet / doPost) — frontend ส่ง POST แบบ text/plain เพื่อเลี่ยง CORS preflight
// ---------------------------------------------------------------------------------
var ACTIONS_ = {
  'me':               { role: 'viewer', fn: function (u) { return meInfo_(u); } },
  'me.avatar':        { role: 'viewer', write: true, fn: meAvatar_ },
  'masters.get':      { role: 'viewer', fn: function () { return mastersGet_(); } },
  'plans.list':       { role: 'viewer', fn: plansList_ },
  'plans.get':        { role: 'viewer', fn: plansGet_ },
  'dashboard':        { role: 'viewer', fn: dashboard_ },
  'overdue.list':     { role: 'viewer', fn: overdueList_ },
  'mywork':           { role: 'viewer', fn: myWork_ },
  'tasks.list':       { role: 'viewer', fn: tasksList_ },
  'milestones.list':  { role: 'viewer', fn: milestonesList_ },
  'budget.summary':   { role: 'viewer', fn: budgetSummary_ },
  'expenses.list':    { role: 'viewer', fn: expensesList_ },
  'records.list':     { role: 'viewer', fn: recordsList_ },
  'team.list':        { role: 'viewer', fn: teamList_ },
  'documents.list':   { role: 'viewer', fn: documentsList_ },
  'alerts.list':      { role: 'viewer', fn: alertsList_ },
  'archive.list':     { role: 'viewer', fn: archiveList_ },
  'history.recent':   { role: 'viewer', fn: historyRecent_ },
  'fix.list':         { role: 'viewer', fn: fixList_ },
  'history.list':     { role: 'viewer', fn: historyList_ },

  'plans.save':       { role: 'user', write: true, fn: plansSave_ },
  'acts.progress':    { role: 'user', write: true, fn: actsProgress_ },
  'records.save':     { role: 'user', write: true, fn: recordsSave_ },
  'records.delete':   { role: 'user', write: true, fn: recordsDelete_ },
  'plans.markSummary':{ role: 'user', write: true, fn: plansMarkSummary_ },
  'acts.save':        { role: 'user', write: true, fn: actsSave_ },
  'acts.delete':      { role: 'user', write: true, fn: actsDelete_ },
  'disb.save':        { role: 'user', write: true, fn: disbSave_ },
  'disb.delete':      { role: 'user', write: true, fn: disbDelete_ },
  'adj.save':         { role: 'user', write: true, fn: adjSave_ },
  'adj.delete':       { role: 'user', write: true, fn: adjDelete_ },
  'file.upload':      { role: 'user', write: true, fn: fileUpload_ },
  'fix.resolve':      { role: 'user', write: true, fn: fixResolve_ },
  'plans.bulk':       { role: 'user', write: true, fn: plansBulk_ },
  'plans.duplicate':  { role: 'user', write: true, fn: plansDuplicate_ },
  'acts.reorder':     { role: 'user', write: true, fn: actsReorder_ },
  'acts.move':        { role: 'user', write: true, fn: actsMove_ },
  'acts.duplicate':   { role: 'user', write: true, fn: actsDuplicate_ },
  'acts.restore':     { role: 'user', write: true, fn: actsRestore_ },
  'budget.transfer':  { role: 'user', write: true, fn: budgetTransfer_ },

  'plans.delete':     { role: 'admin', write: true, fn: plansDelete_ },
  'masters.save':     { role: 'admin', write: true, fn: mastersSave_ },
  'settings.save':    { role: 'admin', write: true, fn: settingsSave_ },
  'users.list':       { role: 'admin', fn: usersList_ },
  'users.update':     { role: 'admin', write: true, fn: usersUpdate_ },
  'users.delete':     { role: 'admin', write: true, fn: usersDelete_ },
  'audit.list':       { role: 'admin', fn: auditList_ },
  'report.export':    { role: 'admin', write: true, fn: reportExport_ }
};


/** รูปที่ผู้ใช้อัปโหลดเอง (data URL) ต้องไม่ถูกทับด้วยรูป Google ตอนล็อกอิน */
function keepAvatar_(u, claims) {
  return String(u.Picture || '').indexOf('data:image/') === 0 ? u.Picture : (claims.picture || u.Picture || '');
}
/** me.avatar: ตั้ง/ลบรูปประจำตัวของตนเอง (รับ data URL ที่ย่อแล้วจากหน้าเว็บ ≤ 45,000 อักขระ ตามข้อจำกัดเซลล์ชีต) */
function meAvatar_(user, p) {
  var img = String(p.image || '');
  if (img) {
    if (img.length > 45000) fail_('VALIDATION', 'รูปใหญ่เกินไป');
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(img)) fail_('VALIDATION', 'รูปแบบรูปภาพไม่ถูกต้อง');
  }
  var u = userRow_(user.Email);
  if (!u) fail_('NOT_FOUND', 'ไม่พบบัญชีผู้ใช้');
  u.Picture = img; update_('Users', u._row, u);
  audit_(user.Email, img ? 'เปลี่ยนรูปประจำตัว' : 'ลบรูปประจำตัว', 'User', user.Email, '');
  return { picture: img };
}

function meInfo_(u) {
  var s = getSettings_(), out = { user: publicUser_(u), version: APP_VERSION, currentYear: s.CurrentYear };
  out.maintenance = maintenanceOn_(); out.org = orgName_();
  if (u.Role === 'admin') out.pendingUsers = readAll_('Users').filter(function (x) { return x.Status === 'pending'; }).length;
  return out;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** ประมวลผลคำขอ 1 รายการ คืน {ok, data} หรือ {ok:false, code, error} (แยกออกมาเพื่อให้ทดสอบได้) */
function handle_(req) {
  CACHE_ = {};
  try {
    var action = str_(req && req.action), params = (req && req.params) || {};
    if (action === 'ping') return { ok: true, data: { service: 'sansai-plan-api', version: APP_VERSION, time: nowIso_() } };
    if (action === 'loginGoogle') return { ok: true, data: withLock_(function () { return loginGoogle_(params); }) };
    var def = ACTIONS_[action];
    if (!def) fail_('BAD_REQUEST', 'ไม่รู้จักคำสั่ง ' + action);
    var user = requireUser_(req.token, def.role);
    if (def.write && maintenanceOn_() && user.Role !== 'admin') fail_('MAINTENANCE', 'ระบบปิดปรับปรุงชั่วคราว — ดูข้อมูลได้ แต่บันทึกไม่ได้ กรุณาลองใหม่ภายหลัง');
    var data = def.write ? withLock_(function () { return def.fn(user, params); }) : def.fn(user, params);
    return { ok: true, data: data };
  } catch (err) {
    if (err && err.apiCode) return { ok: false, code: err.apiCode, error: err.message };
    Logger.log('SERVER ERROR: ' + (err && err.stack ? err.stack : err));
    return { ok: false, code: 'SERVER', error: 'เกิดข้อผิดพลาดของระบบ: ' + (err && err.message ? err.message : err) };
  }
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return jsonOut_({ ok: false, code: 'BAD_REQUEST', error: 'รูปแบบคำขอไม่ถูกต้อง' }); }
  return jsonOut_(handle_(req));
}
function doGet() { return jsonOut_(handle_({ action: 'ping' })); }

// ---------------------------------------------------------------------------------
// setupSheet(): สร้าง/ซ่อมโครงสร้างฐานข้อมูล (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
// ---------------------------------------------------------------------------------
function randomSecret_() { return (Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }

function ensureSheet_(name, report) {
  var cols = SCHEMA_[name], ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); report.created.push(name); }
  var width = Math.max(sh.getLastColumn(), cols.length);
  var head = sh.getRange(1, 1, 1, width).getValues()[0];
  cols.forEach(function (c, i) {
    var cur = String(head[i] === undefined ? '' : head[i]).trim();
    if (cur === '') { sh.getRange(1, i + 1).setValue(c); if (sh.getLastRow() > 1 || report.created.indexOf(name) < 0) report.fixed.push(name + '.' + c); }
    else if (cur !== c) report.warnings.push('ชีต ' + name + ' คอลัมน์ที่ ' + (i + 1) + ' เป็น "' + cur + '" แต่ระบบคาดหวัง "' + c + '" (ไม่ได้แก้ให้ ตรวจสอบเอง)');
  });
  var hdr = sh.getRange(1, 1, 1, cols.length);
  hdr.setFontWeight('bold').setBackground('#0e7c7b').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  cols.forEach(function (c, i) {
    if (TEXT_COLS_.indexOf(c) >= 0) sh.getRange(2, i + 1, rows, 1).setNumberFormat('@');
    else if (MONEY_COLS_.indexOf(c) >= 0) sh.getRange(2, i + 1, rows, 1).setNumberFormat('#,##0.00');
  });
  return sh;
}

function applyList_(name, col, list) {
  try {
    var sh = ss_().getSheetByName(name), idx = SCHEMA_[name].indexOf(col) + 1;
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
    sh.getRange(2, idx, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  } catch (e) { /* ไม่ใส่ dropdown ก็ใช้งานได้ */ }
}

function seedIfEmpty_(name, objs, report) {
  if (readAll_(name).length) return;
  insertMany_(name, objs);
  report.seeded.push(name + ' (' + objs.length + ')');
}

/** เก็บค่าตั้งต้นที่ปรับได้ลง Script Properties (เติมเฉพาะคีย์ที่ยังไม่มี ไม่ทับค่าที่ตั้งไว้) + ค่าที่ระบบรู้เอง */
function seedScriptProps_(p, report) {
  var have = p.getProperties(), addP = {}, added = [];
  Object.keys(PROP_DEFAULTS_).forEach(function (k) { if (have[k] === undefined || have[k] === '') { addP[k] = PROP_DEFAULTS_[k]; added.push(k); } });
  try { var wurl = ScriptApp.getService().getUrl(); if (wurl && have.WEBAPP_URL !== wurl) { addP.WEBAPP_URL = wurl; added.push('WEBAPP_URL'); } } catch (e) { /* ยังไม่ได้ Deploy */ }
  addP.DEPLOYED_VERSION = APP_VERSION; addP.LAST_SETUP_AT = nowIso_();
  p.setProperties(addP, false);
  if (added.length) report.props.push('เติมค่าตั้งต้นใน Script Properties: ' + added.join(', '));
  return added;
}

function setupSheet() {
  var report = { created: [], fixed: [], seeded: [], warnings: [], props: [] };
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('TOKEN_SECRET')) { p.setProperty('TOKEN_SECRET', randomSecret_()); report.props.push('สร้าง TOKEN_SECRET ให้แล้ว'); }
  seedScriptProps_(p, report);
  CACHE_ = {};
  Object.keys(SCHEMA_).forEach(function (n) { ensureSheet_(n, report); });
  var def = ss_().getSheetByName('Sheet1') || ss_().getSheetByName('ชีต1');
  if (def && def.getLastRow() <= 1 && Object.keys(SCHEMA_).length) { try { ss_().deleteSheet(def); } catch (e) { /* ลบไม่ได้ก็ข้าม */ } }
  CACHE_ = {};

  // ตั้งค่า: เติมเฉพาะคีย์ที่ยังไม่มี
  var have = {}; readAll_('Settings').forEach(function (r) { have[r.Key] = true; });
  var missing = DEFAULT_SETTINGS_.filter(function (d) { return !have[d[0]]; });
  if (missing.length) { insertMany_('Settings', missing.map(function (d) { return { Key: d[0], Value: d[1], Description: d[2] }; })); report.seeded.push('Settings (+' + missing.length + ')'); }

  var T = function (rows, cols) { return rows.map(function (r) { var o = {}; cols.forEach(function (c, i) { o[c] = r[i]; }); return o; }); };
  seedIfEmpty_('Funds', T(DEFAULT_FUNDS_, ['Code', 'Name', 'StrategySet', 'InHospitalKpi', 'SortOrder', 'Active']), report);
  seedIfEmpty_('Categories', T(DEFAULT_CATEGORIES_, ['Code', 'Name', 'SortOrder', 'Active']), report);
  seedIfEmpty_('PlanTypes', T(DEFAULT_PLAN_TYPES_, ['Code', 'Name', 'SortOrder', 'Active']), report);
  var withOrder = function (arr) { return arr.map(function (r, i) { var o = {}; for (var k in r) o[k] = r[k]; o.SortOrder = i + 1; o.Active = true; return o; }); };
  seedIfEmpty_('StrategyMoph', withOrder(SEED_.moph), report);
  seedIfEmpty_('StrategyMission', withOrder(SEED_.mission), report);
  seedIfEmpty_('StrategyProv', withOrder(SEED_.prov), report);
  seedIfEmpty_('StrategyHosp', withOrder(SEED_.hosp), report);
  seedIfEmpty_('Departments', SEED_.departments.map(function (d) { return { Name: d.Name, Mission: d.Mission, Active: true }; }), report);

  applyList_('Users', 'Role', ROLES_); applyList_('Users', 'Status', USER_STATUSES_);
  applyList_('Plans', 'Status', PLAN_STATUSES_); applyList_('Activities', 'Status', ACT_STATUSES_);
  applyList_('Adjustments', 'Type', ADJ_TYPES_); applyList_('Funds', 'StrategySet', ['hospital', 'region']);

  var cfg = checkConfig();
  Logger.log('=== setupSheet เสร็จสิ้น ===');
  Logger.log('สร้างชีตใหม่: ' + (report.created.join(', ') || '-'));
  Logger.log('เติมหัวคอลัมน์: ' + (report.fixed.join(', ') || '-'));
  Logger.log('ข้อมูลตั้งต้น: ' + (report.seeded.join(', ') || '(มีอยู่แล้ว)'));
  report.props.forEach(function (x) { Logger.log(x); });
  report.warnings.forEach(function (w) { Logger.log('⚠ ' + w); });
  Logger.log('ขั้นต่อไป: ' + (cfg.ok ? 'Deploy เป็น Web app แล้วนำ URL ไปใส่ frontend/config.js' : 'ตั้ง Script properties ที่ขาดให้ครบ (ดูบรรทัดด้านบน) แล้วรัน checkConfig() ซ้ำ'));
  report.config = cfg;
  return report;
}

/** ตรวจ Script properties และการเข้าถึงชีต */
function checkConfig() {
  var p = PropertiesService.getScriptProperties(), res = { ok: true, missing: [], items: [] };
  var need = [['GOOGLE_CLIENT_ID', true], ['ADMIN_EMAILS', true], ['TOKEN_SECRET', true], ['SS_ID', false], ['ADMIN_NOTIFY_EMAIL', false], ['DRIVE_FOLDER_ID', false], ['PLAN_SHEET_ID', false], ['APP_URL', false], ['ALLOWED_EMAIL_DOMAINS', false]]
    .concat(Object.keys(PROP_DEFAULTS_).map(function (k) { return [k, false]; })).concat([['WEBAPP_URL', false], ['DEPLOYED_VERSION', false], ['LAST_SETUP_AT', false]]);
  var SECRET = { TOKEN_SECRET: 1, GOOGLE_CLIENT_ID: 1 };
  need.forEach(function (n) {
    var has = !!p.getProperty(n[0]);
    var needed = n[1];
    if (n[0] === 'SS_ID') { var bound = false; try { bound = !!SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { bound = false; } needed = !bound; }
    res.items.push((has ? '✔ ' : (needed ? '✘ ' : '○ ')) + n[0] + (has ? (SECRET[n[0]] || /EMAIL|FOLDER|SHEET|SS_ID/.test(n[0]) ? '' : ' = ' + p.getProperty(n[0])) : (needed ? '  ← จำเป็น ยังไม่ได้ตั้ง' : '  (ไม่บังคับ' + (PROP_DEFAULTS_[n[0]] !== undefined ? ' ใช้ค่าเริ่มต้น ' + PROP_DEFAULTS_[n[0]] + ' · รัน setupSheet() เพื่อเติมให้' : '') + ')')));
    if (needed && !has) { res.ok = false; res.missing.push(n[0]); }
  });
  try { res.spreadsheet = ss_().getName(); res.items.push('✔ เชื่อมต่อ Spreadsheet: ' + res.spreadsheet); }
  catch (e) { res.ok = false; res.items.push('✘ เชื่อมต่อ Spreadsheet ไม่ได้: ' + e.message); }
  res.items.forEach(function (x) { Logger.log(x); });
  return res;
}

// =====================================================================================
//  นำเข้าข้อมูลปีงบ 69 จากชีทเดิม "สรุปแผนงาน+โครงการ รพ.สันทราย ปีงบ 69"  (รันจากตัวแก้ไข Apps Script)
//   1) ตั้ง Script property PLAN_SHEET_ID = ID ของชีทเดิม   2) รัน setupSheet()   3) รัน previewImport()   4) รัน runImport()
//  สิ่งที่ตัวนำเข้าทำ: แตก "งวดการเบิกจ่าย" ออกจากสูตรบวก, แยกสถานะจากช่องหมายเหตุ, ข้ามแถวหัวข้อที่ไม่ใช่แผน,
//  แปลงวันที่ข้อความเป็นวันที่จริง และส่งสิ่งที่อ่านไม่ได้เข้า "คิวข้อมูลรอแก้ไข" (ไม่เดาให้)
// =====================================================================================
var IMPORT_YEAR_ = '2569';
var IMPORT_TAG_ = 'IMPORT-2569';
var TAB_FUND_ = { 'เงินบำรุง': 'BAMRUNG', 'สสอ.สันทราย': 'SSO', 'เงินงบประมาณ': 'BUDGET', 'เงินสวัสดิการ': 'WELFARE', 'งบท้องถิ่น PCU': 'PCU',
  'งบท้องถิ่น ทต.แม่โจ้': 'MAEJO', 'เขตสุขภาพที่ 1': 'REGION1', 'แผนงาน-โครงการ(นอกแผน)': 'OFFPLAN' };
var TH_MON_ = { 'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
  'มกราคม': 1, 'กุมภาพันธ์': 2, 'มีนาคม': 3, 'เมษายน': 4, 'พฤษภาคม': 5, 'มิถุนายน': 6, 'กรกฎาคม': 7, 'สิงหาคม': 8, 'กันยายน': 9, 'ตุลาคม': 10, 'พฤศจิกายน': 11, 'ธันวาคม': 12 };

function sq_(v) { return (v === null || v === undefined) ? '' : String(v).replace(/\s+/g, ' ').trim(); }
function isNumLike_(v) { return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))); }
function cellText_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return v.getDate() + '/' + (v.getMonth() + 1) + '/' + (v.getFullYear() + 543);
  return sq_(v);
}
function catCode_(label) {
  var t = sq_(label);
  if (/อาหาร/.test(t)) return 'FOOD';
  if (/เวชภัณฑ์|ค่าตรวจ|ชุดตรวจ/.test(t)) return 'MED';
  if (/วิทยากร|ของที่ระลึก|สถานที่/.test(t)) return 'VENDOR';
  if (/ลงทะเบียน|ที่พัก/.test(t)) return 'LODG';
  if (/เบี้ยเลี้ยง|พาหนะ|น้ำมัน/.test(t)) return 'TRAVEL';
  if (/จ้างเหมา|สมุด|คู่มือ/.test(t)) return 'PRINT';
  if (/ซื้อ|เช่า|วัสดุ|อุปกรณ์/.test(t)) return 'MAT';
  return 'OTHER';
}
/** สูตรบวกล้วน เช่น =2450+2450+1750 -> [2450,2450,1750] ไม่ใช่สูตรแบบนั้นคืน null */
function formulaParts_(f) {
  if (typeof f !== 'string' || f.charAt(0) !== '=') return null;
  var body = f.substring(1);
  if (!/^[\d\.\+\s]+$/.test(body)) return null;
  return body.split('+').map(function (x) { return parseFloat(x); }).filter(function (x) { return !isNaN(x); });
}

/** ดึงวันที่ทั้งหมดจากข้อความ -> {dates:['yyyy-mm-dd'], invalid:['...']}  (รองรับ พ.ศ./ปีย่อ/พิมพ์ผิดเล็กน้อย เช่น 02569, 18/02//2569) */
function findDates_(text) {
  var t = String(text || ''), res = { dates: [], invalid: [] }, re;
  var push = function (d, mo, y, raw) {
    d = +d; mo = +mo; y = +String(y).replace(/^0+/, '');
    if (y < 100) y += 2500;
    else if (y >= 1900 && y <= 2200) y += 543;
    if (y < 2560 || y > 2575 || mo < 1 || mo > 12 || d < 1 || d > 31) { res.invalid.push(raw); return; }
    var g = y - 543;
    res.dates.push(g + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2));
  };
  re = /(\d{1,2})\s*[\/\.\-]+\s*(\d{1,2})\s*[\/\.\-]+\s*(\d{2,5})/g;
  var m; var used = [];
  while ((m = re.exec(t)) !== null) { push(m[1], m[2], m[3], m[0]); used.push([m.index, m.index + m[0].length]); }
  re = /(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*(\d{2,4})/g;
  while ((m = re.exec(t)) !== null) push(m[1], TH_MON_[m[2]], m[3], m[0]);
  return res;
}
/** แยก "ครั้งที่ n" ออกเป็นรอบ ๆ: [{date, noClaim}] */
function parseSessions_(text) {
  var t = String(text || ''), out = { sessions: [], all: [], invalid: [] };
  if (!t.trim()) return out;
  var fd = findDates_(t); out.all = fd.dates.slice().sort(); out.invalid = fd.invalid;
  var parts = t.split(/ครั้งที่\s*\d+/);
  var segs = parts.length > 1 ? parts.slice(1) : [t];
  segs.forEach(function (s) {
    var d = findDates_(s).dates;
    if (d.length) out.sessions.push({ date: d[0], noClaim: /ไม่เบิก/.test(s) });
  });
  return out;
}

function actStatusFromNote_(note, nodash) {
  var n = String(note || '');
  if (/ยกเลิก/.test(n)) return 'ยกเลิก';
  if (/ไม่ใช้งบ|ไม่่ใช้งบ|ไม่ใช้้งบ/.test(n) || nodash) return 'ไม่ใช้งบประมาณ';
  if (/ไม่เบิก|ไม่ได้เบิก/.test(n)) return 'ไม่เบิก';
  if (/เลื่อน|ขยายเวลา/.test(n)) return 'เลื่อน';
  return 'ปกติ';
}

/** แปลงแท็บหนึ่งแท็บ -> {plans:[...], skipped:[...]} จาก values + formulas (array 2 มิติ) */
function parsePlanTab_(values, formulas, tab) {
  var out = { tab: tab, plans: [], skipped: [], warnings: [] };
  var hr = -1, r, c;
  for (r = 0; r < Math.min(values.length, 10) && hr < 0; r++) for (c = 0; c < values[r].length; c++) if (sq_(values[r][c]) === 'ผู้รับผิดชอบ') { hr = r; break; }
  if (hr < 0) { out.warnings.push('ไม่พบหัวตาราง'); return out; }
  var H = values[hr].map(sq_);
  var find = function (re) { for (var i = 0; i < H.length; i++) if (H[i] && re.test(H[i])) return i; return -1; };
  var col = { resp: find(/^ผู้รับผิดชอบ$/), name: find(/^แผน\/โครงการ$/), total: find(/^รวม$/), paid: find(/^เบิกจ่าย$/), pdate: find(/^วันที่ขออนุมัติดำเนินแผน/),
    paydate: find(/^วันที่ขออนุมัติจ่ายเงิน/), note: find(/^หมายเหตุ/), ret: find(/^วันที่ส่งคืน/), summ: find(/^ส่งสรุป/), first: find(/อาหาร/) };
  if (col.name < 0 || col.total < 0 || col.first < 0) { out.warnings.push('หัวตารางไม่ครบ (แผน/โครงการ, อาหาร, รวม)'); return out; }
  var cats = [];
  for (c = col.first; c < col.total; c++) if (H[c]) cats.push({ idx: c, code: catCode_(H[c]), label: H[c] });
  var isRegion = (TAB_FUND_[tab] === 'REGION1');
  var cur = null, seenAct = false;
  var F = function (rr, cc) { var f = formulas && formulas[rr] ? formulas[rr][cc] : ''; return f; };

  for (r = hr + 1; r < values.length; r++) {
    var row = values[r], rowNo = r + 1, text = sq_(row[col.name]);
    if (!text || text === 'โครงการ' || text === 'แผนงาน') continue;
    var A = row[0], B = row[1];
    if (isNumLike_(A) || isNumLike_(B)) {
      var tot = num_(row[col.total]);
      // แถวหัวข้อแหล่งเงินที่ใส่เลขลำดับ (ไม่ใช่แผนจริง)
      if (tot === 0 && (/^(เงินบำรุง|เงินงบประมาณ|เงินสวัสดิการ|สสอ\.?\s*สันทราย|งบท้องถิ่น.*|เขตสุขภาพที่\s*1)$/.test(text))) { out.skipped.push({ row: rowNo, name: text }); cur = null; continue; }
      cur = { row: rowNo, seq: String(isNumLike_(B) ? Math.round(Number(B)) : Math.round(Number(A))), projectNo: (isNumLike_(A) && isNumLike_(B)) ? String(Math.round(Number(A))) : '',
        owner: sq_(row[col.resp]), name: text, projectTitle: '', total: tot, paid: num_(row[col.paid]), note: col.note >= 0 ? sq_(row[col.note]) : '',
        ret: col.ret >= 0 ? sq_(row[col.ret]) : '', summarySent: col.summ >= 0 && (row[col.summ] === true || /^(true|ใช่)$/i.test(sq_(row[col.summ]))), strat: [], acts: [] };
      var sc = []; for (c = 4; c < col.first; c++) sc.push(sq_(row[c]));
      cur.strat = sc;
      out.plans.push(cur); seenAct = false; continue;
    }
    if (!cur) continue;
    var amounts = [], hasAmt = false, nodash = true, catSum = 0;
    cats.forEach(function (ct) {
      var v = row[ct.idx], n = num_(v);
      if (n) { amounts.push({ code: ct.code, amount: n, detail: (function () { var p = formulaParts_(F(r, ct.idx)); return (p && p.length > 1) ? p.join('+') : ''; })() }); catSum += n; hasAmt = true; }
      if (sq_(v) !== '' && sq_(v) !== '-') nodash = false;
    });
    var total = num_(row[col.total]) || catSum, paid = num_(row[col.paid]);
    if (total || paid) { hasAmt = true; }
    if (sq_(row[col.total]) !== '' && sq_(row[col.total]) !== '-') nodash = false;
    if (!hasAmt && !seenAct && /^โครงการ/.test(text)) { cur.projectTitle = text; continue; }
    var next = ''; for (var q = r + 1; q < values.length; q++) { var t2 = sq_(values[q][col.name]); if (t2) { next = t2; break; } }
    if (!hasAmt && /^กิจกรรมที่\s*\d+/.test(text) && /^\d+\.\d+/.test(next)) { seenAct = true; continue; }
    seenAct = true;
    var note = col.note >= 0 ? sq_(row[col.note]) : '';
    cur.acts.push({ row: rowNo, name: text, amounts: amounts, total: total, paid: paid, paidParts: col.paid >= 0 ? formulaParts_(F(r, col.paid)) : null,
      note: note, status: actStatusFromNote_(note, nodash && !paid),
      sText: col.pdate >= 0 ? cellText_(row[col.pdate]) : '', tText: col.paydate >= 0 ? cellText_(row[col.paydate]) : '' });
  }
  return out;
}

function matchCode_(text, kind) {
  var t = sq_(text); if (!t) return '';
  var m;
  if (kind === 'moph' || kind === 'mission') { m = t.match(/^(\d)\s*\./); return m ? m[1] : ''; }
  if (kind === 'prov') { m = t.match(/^M(\d)\s*ประเด็นยุทธศาสตร์ที่\s*(\d)/); return m ? 'M' + m[1] + '-' + m[2] : ''; }
  if (kind === 'hosp') { m = t.match(/ที่\s*(\d)/); return m ? m[1] : ''; }
  return '';
}

/** สร้างแถวพร้อมเขียนลงชีตจากผลแยกวิเคราะห์ (ฟังก์ชันล้วน ทดสอบได้) */
function buildImportRows_(parsedTabs, now) {
  var R = { plans: [], acts: [], lines: [], disbs: [], fixes: [], people: {}, stats: { skipped: [] } };
  var fix = function (ref, issue, detail) { R.fixes.push({ FixId: newId_('X'), Source: IMPORT_TAG_, Ref: ref, Issue: issue, Detail: String(detail).substring(0, 400), Resolved: false, ResolvedBy: '', ResolvedAt: '', CreatedAt: now }); };
  parsedTabs.forEach(function (tab) {
    var fundCode = TAB_FUND_[tab.tab], used = {};
    (tab.skipped || []).forEach(function (s) { R.stats.skipped.push(tab.tab + ' แถว ' + s.row + ' "' + s.name + '"'); });
    tab.plans.forEach(function (p) {
      var planId = 'P' + IMPORT_YEAR_ + '-' + fundCode + '-' + p.seq;
      if (used[planId]) planId += '-r' + p.row; used[planId] = true;
      var ref = tab.tab + ' แถว ' + p.row;
      var st = p.strat, strat = { moph: '', mission: '', prov: '', hosp: '', region: '' };
      if (fundCode === 'REGION1') strat.region = st.filter(String).join(' / ');
      else { strat.moph = matchCode_(st[0], 'moph'); strat.mission = matchCode_(st[1], 'mission'); strat.prov = matchCode_(st[2], 'prov'); strat.hosp = matchCode_(st[3], 'hosp');
        if (strat.prov && strat.mission && strat.prov.charAt(1) !== strat.mission) fix(ref, 'ยุทธศาสตร์ไม่สอดคล้อง', 'พันธกิจ ' + strat.mission + ' แต่ยุทธศาสตร์ สสจ. คือ ' + strat.prov + ' (แผน: ' + p.name.substring(0, 60) + ')'); }
      var retDate = findDates_(p.ret).dates[0] || '';
      var allNote = [p.note].concat(p.acts.map(function (a) { return a.note; })).join(' ');
      var budgeted = p.acts.filter(function (a) { return a.total > 0; });
      var cancelled = /ยกเลิกแผน|ยกเลิกโครงการ/.test(p.note) || (budgeted.length > 0 && budgeted.every(function (a) { return a.status === 'ยกเลิก'; }));
      var anyPaid = p.acts.some(function (a) { return a.paid > 0; }) || p.paid > 0;
      var status = cancelled ? 'ยกเลิก' : (p.summarySent ? 'ส่งสรุปแล้ว' : (anyPaid ? 'ดำเนินการ' : 'อนุมัติ'));
      var type = /ประชุม|อบรม|นิเทศ|ศึกษาดูงาน|สัมมนา/.test(p.name) ? 'MEET' : '';
      R.plans.push({ PlanId: planId, Year: IMPORT_YEAR_, FundCode: fundCode, Seq: p.seq, ProjectNo: p.projectNo, ProjectTitle: p.projectTitle, Name: p.name, Owner: p.owner,
        Department: '', StrategyMoph: strat.moph, StrategyMission: strat.mission, StrategyProv: strat.prov, StrategyHosp: strat.hosp, StrategyRegion: strat.region, PlanType: type,
        Status: status, ReturnDate: retDate, SummarySent: !!p.summarySent, SummarySentDate: '', SummaryFileUrl: '', Note: p.note, IsDeleted: false, Source: IMPORT_TAG_,
        CreatedAt: now, CreatedBy: 'import', UpdatedAt: now, UpdatedBy: 'import' });
      if (p.owner) R.people[p.owner] = true;

      var sumPaid = 0;
      p.acts.forEach(function (a, ai) {
        var actId = planId + '-A' + a.row, aref = tab.tab + ' แถว ' + a.row;
        var S = parseSessions_(a.sText), T = parseSessions_(a.tText);
        S.invalid.concat(T.invalid).forEach(function (bad) { fix(aref, 'วันที่อ่านไม่ได้/ปีผิดปกติ', bad + ' (กิจกรรม: ' + a.name.substring(0, 50) + ')'); });
        R.acts.push({ ActId: actId, PlanId: planId, No: (a.name.match(/^(\d+\.\d+)/) || [])[1] || String(ai + 1), Name: a.name, Status: a.status,
          PlanStart: S.all.length ? S.all[0] : '', PlanEnd: S.all.length ? S.all[S.all.length - 1] : '',
          DateText: ('S: ' + a.sText + (a.tText ? ' | T: ' + a.tText : '')).substring(0, 480), Note: a.note, SortOrder: ai + 1, IsDeleted: false, Source: IMPORT_TAG_,
          CreatedAt: now, CreatedBy: 'import', UpdatedAt: now, UpdatedBy: 'import' });
        a.amounts.forEach(function (x) { R.lines.push({ LineId: actId + '-' + x.code, ActId: actId, PlanId: planId, CategoryCode: x.code, Amount: x.amount, Detail: x.detail }); });
        if (a.paid > 0) {
          var parts = (a.paidParts && a.paidParts.length > 1 && Math.abs(a.paidParts.reduce(function (s, v) { return s + v; }, 0) - a.paid) < 0.5) ? a.paidParts : [a.paid];
          if (a.paidParts && a.paidParts.length > 1 && parts.length === 1) fix(aref, 'ผลรวมงวดจ่ายไม่ตรงยอดเบิกจ่าย', a.paidParts.join('+') + ' ≠ ' + a.paid);
          var n = parts.length, sClaim = S.sessions.filter(function (s) { return !s.noClaim; }), tClaim = T.sessions.filter(function (s) { return !s.noClaim; }), anyDate = false;
          parts.forEach(function (amt, i) {
            var approve = '', pay = '';
            // จับคู่ "ครั้งที่ n" กับงวดจ่าย: จำนวนเท่ากัน -> ตามลำดับ | มีรอบเดียว -> ใช้วันนั้นทุกงวด | ไม่แน่ใจ -> เว้นว่างและส่งเข้าคิว (ไม่เดา)
            var pickDate = function (arr) { return arr.length === n ? arr[i].date : (arr.length === 1 ? arr[0].date : ''); };
            approve = pickDate(sClaim); pay = pickDate(tClaim);
            if (approve || pay) anyDate = true;
            sumPaid += amt;
            R.disbs.push({ DisbId: actId + '-D' + (i + 1), ActId: actId, PlanId: planId, Seq: i + 1, ApproveDate: approve, PayRequestDate: pay, PaidDate: '', Amount: amt,
              EvidenceUrl: '', Note: n > 1 ? 'งวดที่ ' + (i + 1) + '/' + n + ' (แยกจากสูตรในชีทเดิม)' : '', Source: IMPORT_TAG_, CreatedAt: now, CreatedBy: 'import', UpdatedAt: now, UpdatedBy: 'import' });
          });
          if (!anyDate && (S.sessions.length || T.sessions.length)) fix(aref, 'จับคู่วันที่กับงวดเบิกจ่ายไม่ได้', n + ' งวด แต่พบวันที่ขออนุมัติ ' + sClaim.length + ' ครั้ง / วันที่ขอจ่าย ' + tClaim.length + ' ครั้ง (' + a.name.substring(0, 40) + ')');
        }
      });
      var diff = p.paid - sumPaid;
      if (diff > 0.5) {
        R.disbs.push({ DisbId: planId + '-DP', ActId: '', PlanId: planId, Seq: 1, ApproveDate: '', PayRequestDate: '', PaidDate: '', Amount: round2_(diff), EvidenceUrl: '', Note: 'ส่วนต่างเบิกจ่ายระดับแผน (ยกยอดจากชีทเดิม)', Source: IMPORT_TAG_, CreatedAt: now, CreatedBy: 'import', UpdatedAt: now, UpdatedBy: 'import' });
        fix(ref, 'เบิกจ่ายระดับแผนมากกว่าผลรวมกิจกรรม', 'ส่วนต่าง ' + diff + ' บาท');
      }
    });
  });
  return R;
}

function readSourceTabs_() {
  var id = prop_('PLAN_SHEET_ID', '');
  if (!id) throw new Error('ยังไม่ได้ตั้ง Script property PLAN_SHEET_ID (ID ของชีท "สรุปแผนงาน+โครงการ ปีงบ 69")');
  var src = SpreadsheetApp.openById(id), out = [];
  src.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (!TAB_FUND_[name]) return;
    var rng = sh.getDataRange();
    out.push(parsePlanTab_(rng.getValues(), rng.getFormulas(), name));
  });
  return out;
}

function summarizeImport_(R, tabs) {
  var tot = 0, paid = 0;
  R.lines.forEach(function (l) { tot += l.Amount; }); R.disbs.forEach(function (d) { paid += d.Amount; });
  return { plans: R.plans.length, activities: R.acts.length, budgetLines: R.lines.length, disbursements: R.disbs.length, fixes: R.fixes.length,
    people: Object.keys(R.people).length, budget: round2_(tot), paid: round2_(paid), skipped: R.stats.skipped,
    warnings: tabs.reduce(function (a, t) { return a.concat(t.warnings.map(function (w) { return t.tab + ': ' + w; })); }, []) };
}

/** ตรวจก่อนนำเข้า: ไม่เขียนข้อมูลใด ๆ */
function previewImport() {
  var tabs = readSourceTabs_(), R = buildImportRows_(tabs, nowIso_()), s = summarizeImport_(R, tabs);
  tabs.forEach(function (t) {
    var a = t.plans.reduce(function (n, p) { return n + p.acts.length; }, 0);
    Logger.log('[' + t.tab + '] แผน ' + t.plans.length + ' | กิจกรรม ' + a);
  });
  Logger.log('รวม: แผน ' + s.plans + ' | กิจกรรม ' + s.activities + ' | รายการงบ ' + s.budgetLines + ' | งวดเบิกจ่าย ' + s.disbursements + ' | งบรวม ' + s.budget + ' | เบิกจ่ายรวม ' + s.paid);
  Logger.log('ข้ามแถวหัวข้อ: ' + (s.skipped.join('; ') || '-'));
  Logger.log('ข้อมูลที่จะเข้าคิว "รอแก้ไข": ' + s.fixes + ' รายการ | ผู้รับผิดชอบ ' + s.people + ' คน');
  s.warnings.forEach(function (w) { Logger.log('⚠ ' + w); });
  return s;
}

/** เขียนชีตใหม่โดยเก็บเฉพาะแถวที่ keep(row) = true (เร็วกว่าลบทีละแถว) */
function rewriteKeeping_(name, keep) {
  var sh = sheet_(name), cols = SCHEMA_[name], last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, 1, last - 1, cols.length).getValues(), kept = [];
  vals.forEach(function (row) { var o = {}; cols.forEach(function (c, i) { o[c] = row[i]; }); if (keep(o)) kept.push(row); });
  sh.getRange(2, 1, last - 1, cols.length).clearContent();
  if (kept.length) sh.getRange(2, 1, kept.length, cols.length).setValues(kept);
  invalidate_(name);
  return vals.length - kept.length;
}

/** นำเข้าจริง (ล็อกอัตโนมัติหลังเสร็จ เพื่อกันเขียนทับข้อมูลที่ผู้ใช้แก้ในเว็บแล้ว) */
function runImport() {
  CACHE_ = {};
  if (getSettings_().ImportLocked === 'TRUE') throw new Error('การนำเข้าถูกล็อกแล้ว (Settings > ImportLocked = TRUE). หากต้องการนำเข้าซ้ำ ให้ตั้งเป็น FALSE โดยทราบว่าแผนที่นำเข้าจะถูกเขียนทับ (แถวที่สร้างจากหน้าเว็บไม่ถูกแตะ)');
  var tabs = readSourceTabs_(), now = nowIso_(), R = buildImportRows_(tabs, now), s = summarizeImport_(R, tabs);
  var isImp = function (o) { return String(o.Source).indexOf('IMPORT-') === 0; };
  var removed = rewriteKeeping_('Plans', function (o) { return !isImp(o); }) + rewriteKeeping_('Activities', function (o) { return !isImp(o); }) +
    rewriteKeeping_('Disbursements', function (o) { return !isImp(o); }) + rewriteKeeping_('FixQueue', function (o) { return !isImp(o); }) +
    rewriteKeeping_('BudgetLines', function (o) { return String(o.PlanId).indexOf('P' + IMPORT_YEAR_ + '-') !== 0; }) +
    rewriteKeeping_('Adjustments', function (o) { return String(o.PlanId).indexOf('P' + IMPORT_YEAR_ + '-') !== 0; });
  insertMany_('Plans', R.plans); insertMany_('Activities', R.acts); insertMany_('BudgetLines', R.lines);
  insertMany_('Disbursements', R.disbs); insertMany_('FixQueue', R.fixes);

  var have = {}; readAll_('People').forEach(function (p) { have[p.Name] = true; });
  var newPeople = Object.keys(R.people).filter(function (n) { return !have[n]; }).sort().map(function (n) { return { Name: n, Department: '', Email: '', Active: true }; });
  insertMany_('People', newPeople);

  var lock = findBy_('Settings', 'Key', 'ImportLocked');
  if (lock) { lock.Value = 'TRUE'; update_('Settings', lock._row, lock); } else insert_('Settings', { Key: 'ImportLocked', Value: 'TRUE', Description: DEFAULT_SETTINGS_[5][2] });
  delete CACHE_.settings;
  audit_('import', 'นำเข้าข้อมูลปีงบ ' + IMPORT_YEAR_, 'Import', IMPORT_TAG_, JSON.stringify({ plans: s.plans, activities: s.activities, disbursements: s.disbursements, budget: s.budget, paid: s.paid }));
  Logger.log('นำเข้าเสร็จ: แผน ' + s.plans + ' | กิจกรรม ' + s.activities + ' | งวดเบิกจ่าย ' + s.disbursements + ' | งบรวม ' + s.budget + ' | เบิกจ่ายรวม ' + s.paid +
    ' | ผู้รับผิดชอบใหม่ ' + newPeople.length + ' | คิวรอแก้ไข ' + s.fixes + ' | ลบของเดิมที่นำเข้าก่อนหน้า ' + removed + ' แถว');
  Logger.log('ตั้ง ImportLocked = TRUE แล้ว');
  return s;
}
