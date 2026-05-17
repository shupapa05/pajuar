const CFG = {
  TZ: Session.getScriptTimeZone() || 'Asia/Seoul',
  SHEETS: {
    SETTINGS: '설정',
    MEMBERS: '회원기본DB',
    YEARLY: '연도별회원정보',
    FEES: '회비관리',
    NOTICES: '공지사항',
    SCHOOLS: '학교목록',
    FEE_USES: '회비사용내역',
    EVENTS: '행사관리',
    ATTENDANCE: '행사참석'
  }
};

let SPREADSHEET_CACHE_ = null;

function getSpreadsheet_() {
  if (!SPREADSHEET_CACHE_) {
    SPREADSHEET_CACHE_ = SpreadsheetApp.getActiveSpreadsheet();
  }
  return SPREADSHEET_CACHE_;
}
  
function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('경인교대 파주동문회')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function ensureSheets_() {
  const ss = getSpreadsheet_();

  ensureSheet_(ss, CFG.SHEETS.SETTINGS, [
    'KEY','VALUE'
  ], [
    ['CURRENT_YEAR', String(new Date().getFullYear())],
    ['ALUMNI_NAME', '동문회'],
    ['ADMIN_PIN', '1234']
  ]);

  ensureSheet_(ss, CFG.SHEETS.MEMBERS, [
    'MEMBER_ID','이름','학번','기수','직위','현재학교','연락처','최초가입일','상태','대의원'
  ]);

  ensureSheet_(ss, CFG.SHEETS.YEARLY, [
    'YEAR','MEMBER_ID','이름','직위','현재학교','연락처','등록일','개인정보동의'
  ]);

  ensureSheet_(ss, CFG.SHEETS.FEES, [
    'YEAR','MEMBER_ID','이름','기수','납부여부','납부일','금액','비고'
  ]);

  ensureSheet_(ss, CFG.SHEETS.FEE_USES, [
  'ID','YEAR','날짜','관','항','목','수입','지출','비고','작성일'
]);

migrateFeeUseSheet_();

  ensureSheet_(ss, CFG.SHEETS.NOTICES, [
    'ID','YEAR','제목','내용','첨부파일명','첨부파일URL','첨부파일ID','작성일','중요공지','공개여부'
  ]);

  ensureSheet_(ss, CFG.SHEETS.SCHOOLS, [
    '학교명','사용여부','정렬'
  ], [
    ['파주초등학교', 'TRUE', 1],
    ['연풍초등학교', 'TRUE', 2]
  ]);

  // ✅ 추가
  ensureSheet_(ss, CFG.SHEETS.EVENTS, [
  'EVENT_ID','YEAR','행사명','행사일','장소','내용','PDF파일명','PDF파일URL','PDF파일ID','사용여부','정렬'
]);

  // ✅ 추가
  ensureSheet_(ss, CFG.SHEETS.ATTENDANCE, [
    'ID','YEAR','EVENT_ID','행사명','MEMBER_ID','이름','기수','현재학교','직위','참석여부','수정일'
  ]);
}

function getInitialData() {
  const currentYear = getSetting_('CURRENT_YEAR') || String(new Date().getFullYear());
  const alumniName = getSetting_('ALUMNI_NAME') || '경인교대 파주동문회';

  const notices = getPublicNotices_(currentYear);

  return {
    ok: true,
    currentYear,
    alumniName,
    notices
  };
}

function ensureSheet_(ss, name, headers, seedRows) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  if (lastRow === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  } else {
    const currentHeaders = sh.getRange(1, 1, 1, Math.max(lastCol, headers.length)).getValues()[0];
    let changed = false;
    headers.forEach((h, i) => {
      if (currentHeaders[i] !== h) {
        currentHeaders[i] = h;
        changed = true;
      }
    });
    if (changed) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  if (seedRows && seedRows.length && sh.getLastRow() === 1) {
    sh.getRange(2, 1, seedRows.length, seedRows[0].length).setValues(seedRows);
  }
}

function getAppData() {
  const currentYear = getSetting_('CURRENT_YEAR') || String(new Date().getFullYear());
  const alumniName = getSetting_('ALUMNI_NAME') || '경인교대 파주동문회';

  const notices = getPublicNotices_(currentYear);

  return {
    ok: true,
    currentYear,
    alumniName,
    notices
  };
}

function registerMember(payload) {
  return withLock_(() => {
    payload = payload || {};

  const name = clean_(payload.name);
  const studentNo = normalizeStudentNo_(payload.studentNo);
  const position = clean_(payload.position);
  const phone = normalizePhone_(payload.phone);
  const school = clean_(payload.school);
  const agreed = payload.agreed === true || payload.agreed === 'true';

  if (!name) throw new Error('이름을 입력해주세요.');
  if (!studentNo) throw new Error('학번을 입력해주세요.');
  if (!position) throw new Error('직위를 선택해주세요.');
  if (!phone) throw new Error('연락처를 입력해주세요.');
  if (!school) throw new Error('현재학교를 입력해주세요.');
  if (!agreed) throw new Error('개인정보 동의가 필요합니다.');

  const generation = calcGeneration_(studentNo);
  if (!generation) throw new Error('학번으로 기수를 계산할 수 없습니다.');

  const year = getSetting_('CURRENT_YEAR') || String(new Date().getFullYear());
  const now = new Date();

  const membersSh = getSheet_(CFG.SHEETS.MEMBERS);
  const yearlySh = getSheet_(CFG.SHEETS.YEARLY);

  const members = getDataRows_(membersSh);

  let member = members.find(r =>
    clean_(r['이름']) === name &&
    normalizeStudentNo_(r['학번']) === studentNo
  );

  let memberId = '';

  if (!member) {
  memberId = 'M' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
  membersSh.getRange(membersSh.getLastRow() + 1, 1, 1, 10).setValues([[
    memberId,
    name,
    studentNo,
    generation,
    position,
    school,
    phone,
    formatDateTime_(now), // 최초가입일
    '활동',               // 상태
    ''                    // 대의원
  ]]);

  } else {
    memberId = clean_(member['MEMBER_ID']);
    updateMemberInfo_(memberId, {
      name,
      studentNo,
      position,
      school,
      phone
    });
  }

  const yearlyRows = getDataRows_(yearlySh);
  const yearlyIndex = yearlyRows.findIndex(r =>
    String(r['YEAR']) === String(year) &&
    clean_(r['MEMBER_ID']) === memberId
  );

  if (yearlyIndex > -1) {
    yearlySh.getRange(yearlyIndex + 2, 1, 1, 8).setValues([[
      year,
      memberId,
      name,
      position,
      school,
      phone,
      formatDateTime_(now),
      '동의'
    ]]);
  } else {
    yearlySh.getRange(yearlySh.getLastRow() + 1, 1, 1, 8).setValues([[
      year,
      memberId,
      name,
      position,
      school,
      phone,
      formatDateTime_(now),
      '동의'
    ]]);
  }

  ensureFeeRow_(year, memberId, name, generation);

  return {
      ok: true,
      message: '회원 등록이 완료되었습니다.',
      memberId,
      generation
    };
  });
}

function getRegisterSchools() {
  return {
    ok: true,
    schools: getSchoolList()
  };
}

function adminLogin(pin) {
  const savedPin = getSetting_('ADMIN_PIN') || '';
  if (String(pin || '').trim() !== String(savedPin).trim()) {
    return { ok: false, message: '관리자 PIN이 올바르지 않습니다.' };
  }
  return { ok: true };
}

function getAdminDashboard(pin) {
  const login = adminLogin(pin);
  if (!login.ok) throw new Error(login.message);

  const currentYear = getSetting_('CURRENT_YEAR') || String(new Date().getFullYear());

  const yearly = getDataRows_(getSheet_(CFG.SHEETS.YEARLY))
    .filter(r => String(r['YEAR']) === String(currentYear));

  const baseMembers = getDataRows_(getSheet_(CFG.SHEETS.MEMBERS));
  const baseMap = {};
  baseMembers.forEach(r => {
    baseMap[clean_(r['MEMBER_ID'])] = r;
  });

  const members = yearly.map(r => {
    const base = baseMap[clean_(r['MEMBER_ID'])] || {};
    return {
      memberId: clean_(r['MEMBER_ID']),
      org: clean_(r['현재학교']),
      position: clean_(r['직위']),
      name: clean_(r['이름']),
      generation: clean_(base['기수']),
      studentNo: clean_(base['학번']),
      phone: clean_(r['연락처']),
      delegate: clean_(base['대의원']) || ''
    };
  });

  // ✅ 추가: 회비정보 합치기
  const membersWithFees = getFeesForAdmin_(members, currentYear);

  const notices = getDataRows_(getSheet_(CFG.SHEETS.NOTICES))
    .filter(r => String(r['YEAR']) === String(currentYear))
    .sort((a, b) => String(b['작성일']).localeCompare(String(a['작성일'])))
    .map(r => ({
      id: clean_(r['ID']),
      year: clean_(r['YEAR']),
      title: clean_(r['제목']),
      content: clean_(r['내용']),
      fileName: clean_(r['첨부파일명']),
      fileUrl: clean_(r['첨부파일URL']),
      fileId: clean_(r['첨부파일ID']),
      createdAt: clean_(r['작성일']),
      important: clean_(r['중요공지']),
      isPublic: clean_(r['공개여부'])
    }));

  return {
    ok: true,
    currentYear,
    members: membersWithFees, // ✅ 수정
    notices
  };
}

function getSpreadsheetUrl() {
  return getSpreadsheet_().getUrl();
}

function saveNotice(pin, payload) {
  return withLock_(() => {
 
  const login = adminLogin(pin);
  if (!login.ok) throw new Error(login.message);

  payload = payload || {};
  const title = clean_(payload.title);
  const content = clean_(payload.content);
  const fileName = clean_(payload.fileName);
  const fileUrl = clean_(payload.fileUrl);
  const fileId = clean_(payload.fileId);
  const important = payload.important ? 'Y' : 'N';
  const isPublic = payload.isPublic === false ? 'N' : 'Y';

  if (!title) throw new Error('공지 제목을 입력해주세요.');
  if (!content) throw new Error('공지 내용을 입력해주세요.');

  const sh = getSheet_(CFG.SHEETS.NOTICES);
  sh.appendRow([
    'N' + new Date().getTime(),
    getSetting_('CURRENT_YEAR'),
    title,
    content,
    fileName,
    fileUrl,
    fileId,
    formatDateTime_(new Date()),
    important,
    isPublic
  ]);

  return { ok: true, message: '공지가 저장되었습니다.' };
});
}

function updateFee(pin, payload) {
  const login = adminLogin(pin);
  if (!login.ok) throw new Error(login.message);

  payload = payload || {};
  const memberId = clean_(payload.memberId);
  const paid = clean_(payload.paid) || '미납';
  const amount = clean_(payload.amount);
  const paidAt = clean_(payload.paidAt);
  const note = clean_(payload.note);

  if (!memberId) throw new Error('회원 ID가 없습니다.');

  const year = getSetting_('CURRENT_YEAR');
  const sh = getSheet_(CFG.SHEETS.FEES);
  const rows = getDataRows_(sh);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r['YEAR']) === String(year) && clean_(r['MEMBER_ID']) === memberId) {
      const rowIndex = i + 2;
      sh.getRange(rowIndex, 5, 1, 4).setValues([[
        paid,
        paidAt,
        amount,
        note
      ]]);
      return { ok: true, message: '회비 정보가 수정되었습니다.' };
    }
  }

  throw new Error('회비 행을 찾을 수 없습니다.');
}

function uploadAttachment(payload) {
  ensureSheets_();
  payload = payload || {};

  const fileName = clean_(payload.fileName);
  const mimeType = clean_(payload.mimeType);
  const base64Data = clean_(payload.base64Data);

  if (!fileName || !base64Data) {
    throw new Error('첨부파일 정보가 올바르지 않습니다.');
  }

  const folder = getOrCreateUploadFolder_();
  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(
    bytes,
    mimeType || 'application/octet-stream',
    fileName
  );
  const file = folder.createFile(blob);

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    ok: true,
    fileId: file.getId(),
    fileName: file.getName(),
    fileUrl: file.getUrl(),
    viewUrl: toDrivePreviewUrl_(file.getId())
  };
}

function deleteDriveFile_(fileId) {
  const id = clean_(fileId);
  if (!id) return false;

  try {
    DriveApp.getFileById(id).setTrashed(true);
    return true;
  } catch (err) {
    console.warn('Drive file delete skipped: ' + err.message);
    return false;
  }
}

function extractDriveFileId_(url) {
  const value = clean_(url);
  if (!value) return '';

  const patterns = [
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = value.match(patterns[i]);
    if (match && match[1]) return match[1];
  }

  return '';
}

function deleteUploadedFile_(fileId, fileUrl, fileName) {
  const id = clean_(fileId) || extractDriveFileId_(fileUrl);
  if (deleteDriveFile_(id)) return true;

  const name = clean_(fileName);
  if (!name) return false;

  try {
    const folder = getOrCreateUploadFolder_();
    const files = folder.getFilesByName(name);
    let deleted = false;

    while (files.hasNext()) {
      files.next().setTrashed(true);
      deleted = true;
    }

    return deleted;
  } catch (err) {
    console.warn('Drive file delete by name skipped: ' + err.message);
    return false;
  }
}
/* ===== helpers ===== */

function withLock_(fn) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);

  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function getPublicNotices_(year) {
  return getDataRows_(getSheet_(CFG.SHEETS.NOTICES))
    .filter(r => String(r['YEAR']) === String(year) && clean_(r['공개여부']) !== 'N')
    .sort((a, b) => {
      const ia = clean_(a['중요공지']) === 'Y' ? 1 : 0;
      const ib = clean_(b['중요공지']) === 'Y' ? 1 : 0;
      if (ib !== ia) return ib - ia;
      return String(b['작성일']).localeCompare(String(a['작성일']));
    })
    .map(r => ({
      id: clean_(r['ID']),
      title: clean_(r['제목']),
      content: clean_(r['내용']),
      createdAt: clean_(r['작성일']),
      important: clean_(r['중요공지']),
      fileName: clean_(r['첨부파일명']),
      fileUrl: clean_(r['첨부파일URL']),
      fileId: clean_(r['첨부파일ID']),
      viewUrl: clean_(r['첨부파일ID']) ? toDrivePreviewUrl_(clean_(r['첨부파일ID'])) : clean_(r['첨부파일URL'])
    }));
}

function updateMemberInfo_(memberId, payload) {
  const sh = getSheet_(CFG.SHEETS.MEMBERS);
  const rows = getDataRows_(sh);

  const name = clean_(payload.name);
  const studentNo = normalizeStudentNo_(payload.studentNo);
  const generation = calcGeneration_(studentNo);
  const position = clean_(payload.position);
  const school = clean_(payload.school);
  const phone = normalizePhone_(payload.phone);

  for (let i = 0; i < rows.length; i++) {
    if (clean_(rows[i]['MEMBER_ID']) === memberId) {
      const rowIndex = i + 2;
      sh.getRange(rowIndex, 2, 1, 6).setValues([[
        name,
        studentNo,
        generation,
        position,
        school,
        phone
      ]]);
      return;
    }
  }
}

function ensureFeeRow_(year, memberId, name, generation) {
  const sh = getSheet_(CFG.SHEETS.FEES);
  const rows = getDataRows_(sh);
  const exists = rows.some(r =>
    String(r['YEAR']) === String(year) && clean_(r['MEMBER_ID']) === memberId
  );
  if (exists) return;

  sh.appendRow([
    year,
    memberId,
    name,
    generation,
    '미납',
    '',
    '',
    ''
  ]);
}

function updateMemberPhone_(memberId, phone) {
  const sh = getSheet_(CFG.SHEETS.MEMBERS);
  const rows = getDataRows_(sh);
  for (let i = 0; i < rows.length; i++) {
    if (clean_(rows[i]['MEMBER_ID']) === memberId) {
      sh.getRange(i + 2, 7).setValue(phone);
      return;
    }
  }
}

function calcGeneration_(studentNo) {
  const yy = Number(String(studentNo).replace(/\D/g, '').slice(-2));
  if (isNaN(yy)) return '';
  return yy >= 62 ? String(yy - 61) : String(yy + 39);
}

function normalizeStudentNo_(v) {
  const s = String(v || '').replace(/\D/g, '');
  if (!s) return '';
  return s.slice(-2).padStart(2, '0');
}

function normalizePhone_(v) {
  const s = String(v || '').replace(/\D/g, '');
  if (s.length < 10) return '';
  if (s.length === 11) {
    return s.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  }
  return s;
}

function getSetting_(key) {
  const sh = getSheet_(CFG.SHEETS.SETTINGS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === key) return String(values[i][1]).trim();
  }
  return '';
}

function getSheet_(name) {
  const sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('시트를 찾을 수 없습니다: ' + name);
  return sh;
}

function getDataRows_(sh) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  if (lastRow < 2 || lastCol < 1) return [];

  const values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0];

  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function formatDate_(value) {
  if (!value) return '';

  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);

  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function clean_(v) {
  return String(v == null ? '' : v).trim();
}

function getOrCreateUploadFolder_() {
  const folderName = '동문회_첨부파일';
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(folderName);
}

function toDrivePreviewUrl_(fileId) {
  return fileId ? ('https://drive.google.com/file/d/' + fileId + '/preview') : '';
}

function toDriveViewUrl_(fileId) {
  return fileId ? ('https://drive.google.com/file/d/' + fileId + '/view') : '';
}


function getSchoolList() {
  const sh = getSheet_('학교목록');
  const rows = getDataRows_(sh);

  const list = rows
    .filter(r => String(r['사용여부']) !== 'FALSE')
    .sort((a, b) => {
      const aSort = isNaN(a['정렬']) ? 999 : Number(a['정렬']);
      const bSort = isNaN(b['정렬']) ? 999 : Number(b['정렬']);
      return aSort - bSort;
    })
    .map(r => String(r['학교명']).trim());

  return list;
}

function updateNotice(pin, payload) {
  return withLock_(() => {

  const login = adminLogin(pin);
  if (!login.ok) throw new Error(login.message);

  payload = payload || {};
  const id = clean_(payload.id);
  const title = clean_(payload.title);
  const content = clean_(payload.content);
  const fileName = clean_(payload.fileName);
  const fileUrl = clean_(payload.fileUrl);
  const fileId = clean_(payload.fileId);
  const important = payload.important ? 'Y' : 'N';
  const isPublic = payload.isPublic === false ? 'N' : 'Y';

  if (!id) throw new Error('공지 ID가 없습니다.');
  if (!title) throw new Error('공지 제목을 입력해주세요.');
  if (!content) throw new Error('공지 내용을 입력해주세요.');

  const sh = getSheet_(CFG.SHEETS.NOTICES);
  const rows = getDataRows_(sh);

  for (let i = 0; i < rows.length; i++) {
    if (clean_(rows[i]['ID']) === id) {
      sh.getRange(i + 2, 2, 1, 9).setValues([[
        getSetting_('CURRENT_YEAR'),
        title,
        content,
        fileName,
        fileUrl,
        fileId,
        formatDateTime_(new Date()),
        important,
        isPublic
      ]]);
      return { ok: true, message: '공지가 수정되었습니다.' };
    }
  }

  throw new Error('수정할 공지를 찾을 수 없습니다.');
});
}

function deleteNotice(pin, noticeId) {
  return withLock_(() => {

  const login = adminLogin(pin);
  if (!login.ok) throw new Error(login.message);

  const id = clean_(noticeId);
  if (!id) throw new Error('공지 ID가 없습니다.');

  const sh = getSheet_(CFG.SHEETS.NOTICES);
  const rows = getDataRows_(sh);

  for (let i = 0; i < rows.length; i++) {
    if (clean_(rows[i]['ID']) === id) {
      sh.deleteRow(i + 2);
      return { ok: true, message: '공지가 삭제되었습니다.' };
    }
  }

  throw new Error('삭제할 공지를 찾을 수 없습니다.');
});
}

function getFeeAmountByPosition_(position) {
  const p = String(position || '').trim();

  if (p === '교사') return 60000;
  if (p === '늘봄실장') return 60000;
  if (p === '장학사') return 80000;
  if (p === '교감') return 80000;
  if (p === '교장') return 100000;
  if (p === '장학관') return 100000;

  return 60000;
}

function getFeesForAdmin_(members, currentYear) {
  const sh = getSheet_(CFG.SHEETS.FEES);
  const rows = getDataRows_(sh);

  const feeMap = {};

  rows.forEach(r => {
    const rowYear = String(r['YEAR'] || '').trim();
    const memberId = clean_(r['MEMBER_ID']);

    if (rowYear === String(currentYear) && memberId) {
      feeMap[memberId] = {
        paid: clean_(r['납부여부']) || '미납',
        paidAt: normalizeFeeDate_(r['납부일']),
        amount: Number(r['금액'] || 0),
        note: clean_(r['비고'])
      };
    }
  });

  return members.map(m => {
    const fee = feeMap[m.memberId] || {};
    const defaultAmount = getFeeAmountByPosition_(m.position);

    return {
      ...m,
      feePaid: fee.paid || '미납',
      feeDate: fee.paidAt || '',
      feeAmount: fee.amount || defaultAmount,
      feeNote: fee.note || ''
    };
  });
}

function normalizeFeeDate_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  const s = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  return s;
}

function updateFeeStatus(pin, payload) {
  return withLock_(() => {
    const login = adminLogin(pin);
    if (!login.ok) throw new Error(login.message);

  payload = payload || {};

  const memberId = clean_(payload.memberId);
  const paid = clean_(payload.paid) || '미납';
  const paidAt = clean_(payload.paidAt);

  if (!memberId) throw new Error('회원 ID가 없습니다.');

  const currentYear = getSetting_('CURRENT_YEAR') || String(new Date().getFullYear());

  const yearly = getDataRows_(getSheet_(CFG.SHEETS.YEARLY))
    .filter(r => String(r['YEAR']) === String(currentYear));

  const baseMembers = getDataRows_(getSheet_(CFG.SHEETS.MEMBERS));
  const baseMap = {};
  baseMembers.forEach(r => {
    baseMap[clean_(r['MEMBER_ID'])] = r;
  });

  const yearlyMember = yearly.find(r => clean_(r['MEMBER_ID']) === memberId);
  if (!yearlyMember) throw new Error('올해 회원 정보를 찾을 수 없습니다.');

  const base = baseMap[memberId] || {};
  const name = clean_(yearlyMember['이름']);
  const position = clean_(yearlyMember['직위']);
  const generation = clean_(base['기수']);

  const amount = paid === '납부' ? getFeeAmountByPosition_(position) : '';

  const sh = getSheet_(CFG.SHEETS.FEES);
  const rows = getDataRows_(sh);

  let targetRow = -1;

  for (let i = 0; i < rows.length; i++) {
    if (
      String(rows[i]['YEAR']) === String(currentYear) &&
      clean_(rows[i]['MEMBER_ID']) === memberId
    ) {
      targetRow = i + 2;
      break;
    }
  }

  const rowData = [
    currentYear,
    memberId,
    name,
    generation,
    paid,
    paid === '납부' ? paidAt : '',
    amount,
    ''
  ];

  if (targetRow > 0) {
    sh.getRange(targetRow, 1, 1, 8).setValues([rowData]);
  } else {
    sh.appendRow(rowData);
  }

  return {
    ok: true,
    message: paid === '납부' ? '납부 처리되었습니다.' : '미납 처리되었습니다.'
  };
 });
}

function getFeeUseData(pin) {
  const login = adminLogin(pin);
  if (!login.ok) throw new Error(login.message);

  const currentYear = getSetting_('CURRENT_YEAR') || String(new Date().getFullYear());

  const feeRows = getDataRows_(getSheet_(CFG.SHEETS.FEES))
    .filter(r => String(r['YEAR']) === String(currentYear));

  const totalPaid = feeRows
    .filter(r => clean_(r['납부여부']) === '납부')
    .reduce((sum, r) => sum + Number(r['금액'] || 0), 0);

  const useRows = getDataRows_(getSheet_(CFG.SHEETS.FEE_USES))
    .filter(r => String(r['YEAR']) === String(currentYear));

  let carry = 0;
  let totalIncome = 0;
  let totalExpense = 0;

  useRows.forEach(r => {
    const gwan = clean_(r['관']);
    const hang = clean_(r['항']);
    const income = Number(r['수입'] || 0);
    const expense = Number(r['지출'] || 0);

    if (gwan === '수입' && hang === '이월금') {
      carry += income;
    } else {
      totalIncome += income;
      totalExpense += expense;
    }
  });

  let runningBalance = totalPaid + carry;

  const list = useRows
  .sort((a, b) => String(normalizeFeeDate_(a['날짜'])).localeCompare(String(normalizeFeeDate_(b['날짜']))))
    .map(r => {
      const income = Number(r['수입'] || 0);
      const expense = Number(r['지출'] || 0);

      runningBalance = runningBalance + income - expense;

      return {
        id: clean_(r['ID']),
        date: normalizeFeeDate_(r['날짜']),
        gwan: clean_(r['관']),
        hang: clean_(r['항']),
        mok: clean_(r['목']),
        income,
        expense,
        balance: runningBalance,
        note: clean_(r['비고'])
      };
    });

  list.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return {
    ok: true,
    totalPaid,
    carry,
    totalIncome,
    totalExpense,
    balance: totalPaid + carry + totalIncome - totalExpense,
    list
  };
}

function rDate_(value) {
  return normalizeFeeDate_(value) || '';
}

function saveFeeUse(pin, payload) {
  return withLock_(() => {
    const login = adminLogin(pin);
    if (!login.ok) throw new Error(login.message);

    payload = payload || {};

    const date = clean_(payload.date);
    const gwan = clean_(payload.gwan);
    const hang = clean_(payload.hang);
    const mok = clean_(payload.mok);
    const income = Number(payload.income || 0);
    const expense = Number(payload.expense || 0);
    const note = clean_(payload.note);

    if (!date) throw new Error('날짜를 입력해주세요.');
    if (!gwan) throw new Error('관을 입력해주세요.');
    if (!hang) throw new Error('항을 입력해주세요.');
    if (!mok) throw new Error('목을 입력해주세요.');
    if (!income && !expense) throw new Error('수입 또는 지출금액을 입력해주세요.');

    const currentYear = getSetting_('CURRENT_YEAR') || String(new Date().getFullYear());
    const sh = getSheet_(CFG.SHEETS.FEE_USES);

    sh.appendRow([
      'F' + new Date().getTime(),
      currentYear,
      date,
      gwan,
      hang,
      mok,
      income || '',
      expense || '',
      note,
      formatDateTime_(new Date())
    ]);

    return {
      ok: true,
      message: '사용내역이 추가되었습니다.'
    };
  });
}

function deleteFeeUse(pin, id) {
  return withLock_(() => {
  const login = adminLogin(pin);
  if (!login.ok) throw new Error(login.message);

  const sh = getSheet_(CFG.SHEETS.FEE_USES);
  const rows = getDataRows_(sh);

  for (let i = 0; i < rows.length; i++) {
    if (clean_(rows[i]['ID']) === clean_(id)) {
      sh.deleteRow(i + 2);
      return {
        ok: true,
        message: '사용내역이 삭제되었습니다.'
      };
    }
  }

  throw new Error('삭제할 사용내역을 찾을 수 없습니다.');
    });
}

function formatDateTime_(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function updateDelegate(pin, payload) {
  return withLock_(() => {
    const login = adminLogin(pin);
    if (!login.ok) throw new Error(login.message);

    const memberId = clean_(payload.memberId);
    const delegate = clean_(payload.delegate);

    if (!memberId) throw new Error('회원 ID가 없습니다.');

    const sh = getSheet_(CFG.SHEETS.MEMBERS);
    const rows = getDataRows_(sh);

    for (let i = 0; i < rows.length; i++) {
      if (clean_(rows[i]['MEMBER_ID']) === memberId) {
        sh.getRange(i + 2, 10).setValue(delegate);
        return { ok: true, message: '대의원 상태가 변경되었습니다.' };
      }
    }

    throw new Error('회원을 찾을 수 없습니다.');
  });
}

function getAttendanceData() {
  ensureSheets_();

  const currentYear = getSetting_('CURRENT_YEAR') || String(new Date().getFullYear());

  return {
    ok: true,
    currentYear,
    events: getActiveEvents_(currentYear),
    members: getAttendanceMembers_(currentYear)
  };
}

function getActiveEvents_(year) {
  return getDataRows_(getSheet_(CFG.SHEETS.EVENTS))
    .filter(r =>
      String(r['YEAR']) === String(year) &&
      clean_(r['사용여부']) !== 'N'
    )
    .sort((a, b) => Number(a['정렬'] || 999) - Number(b['정렬'] || 999))
    .map(r => ({
      eventId: clean_(r['EVENT_ID']),
      title: clean_(r['행사명']),
      date: normalizeFeeDate_(r['행사일']),
      place: clean_(r['장소']),
      content: clean_(r['내용'])
    }));
}

function getAttendanceMembers_(year) {
  const yearly = getDataRows_(getSheet_(CFG.SHEETS.YEARLY))
    .filter(r => String(r['YEAR']) === String(year));

  const baseRows = getDataRows_(getSheet_(CFG.SHEETS.MEMBERS));
  const baseMap = {};

  baseRows.forEach(r => {
    baseMap[clean_(r['MEMBER_ID'])] = r;
  });

  return yearly.map(r => {
    const memberId = clean_(r['MEMBER_ID']);
    const base = baseMap[memberId] || {};

    return {
      memberId,
      name: clean_(r['이름']),
      generation: clean_(base['기수']),
      school: clean_(r['현재학교']),
      position: clean_(r['직위'])
    };
  }).filter(m => m.memberId && m.name);
}

function saveEventAttendance(payload) {
  return withLock_(() => {
    ensureSheets_();

  payload = payload || {};

  const eventId = clean_(payload.eventId);
  const name = clean_(payload.name);
  const school = clean_(payload.school);
  const status = clean_(payload.status);

  if (!eventId) throw new Error('행사 정보가 없습니다.');
  if (!name) throw new Error('이름을 입력해주세요.');
  if (!status) throw new Error('참석여부를 선택해주세요.');

  const currentYear = getSetting_('CURRENT_YEAR') || String(new Date().getFullYear());
  const nowText = formatDateTime_(new Date());

  const events = getActiveEvents_(currentYear);
  const event = events.find(e => String(e.eventId) === String(eventId));
  if (!event) throw new Error('현재 사용 중인 행사 정보를 찾을 수 없습니다.');

  const members = getAttendanceMembers_(currentYear);
  let candidates = members.filter(m => String(m.name || '').trim() === name);

  if (!candidates.length) {
    throw new Error('회원명단에서 이름을 찾을 수 없습니다. 먼저 회원등록을 해주세요.');
  }

  if (candidates.length > 1) {
    if (!school) {
      return {
        ok: false,
        duplicate: true,
        message: '동명이인이 있습니다. 현재학교를 선택해주세요.',
        candidates: candidates.map(m => ({
          memberId: m.memberId,
          name: m.name,
          generation: m.generation,
          school: m.school,
          position: m.position
        }))
      };
    }

    candidates = candidates.filter(m => String(m.school || '').trim() === school);

    if (candidates.length !== 1) {
      throw new Error('동명이인 확인에 실패했습니다. 학교를 다시 선택해주세요.');
    }
  }

  const member = candidates[0];

  const sh = getSheet_(CFG.SHEETS.ATTENDANCE);
  const rows = getDataRows_(sh);

  const rowData = [
    'A' + new Date().getTime(),
    currentYear,
    event.eventId,
    event.title,
    member.memberId,
    member.name,
    member.generation,
    member.school,
    member.position,
    status,
    nowText
  ];

  for (let i = 0; i < rows.length; i++) {
    if (
      String(rows[i]['YEAR']) === String(currentYear) &&
      clean_(rows[i]['EVENT_ID']) === event.eventId &&
      clean_(rows[i]['MEMBER_ID']) === member.memberId
    ) {
      sh.getRange(i + 2, 1, 1, rowData.length).setValues([rowData]);
      return {
        ok: true,
        message: member.name + '님의 참석 정보가 수정되었습니다.'
      };
    }
  }

  sh.appendRow(rowData);

  return {
    ok: true,
    message: member.name + '님의 참석 정보가 저장되었습니다.'
  };
});
}

function getAttendanceAdminData(pin, eventId) {
  const login = adminLogin(pin);
  if (!login.ok) throw new Error(login.message);

  const currentYear = getSetting_('CURRENT_YEAR') || String(new Date().getFullYear());
  const events = getActiveEvents_(currentYear);

  const selectedEventId = clean_(eventId) || (events[0] ? events[0].eventId : '');
  const members = getAttendanceMembers_(currentYear);

  const attendRows = getDataRows_(getSheet_(CFG.SHEETS.ATTENDANCE))
    .filter(r =>
      String(r['YEAR']) === String(currentYear) &&
      clean_(r['EVENT_ID']) === selectedEventId
    );

  const attendMap = {};
  attendRows.forEach(r => {
    attendMap[clean_(r['MEMBER_ID'])] = r;
  });

  const list = members.map(m => {
    const r = attendMap[m.memberId] || {};

    return {
      memberId: m.memberId,
      name: m.name,
      generation: m.generation,
      school: m.school,
      position: m.position,
      status: clean_(r['참석여부']) || '미응답',
      updatedAt: clean_(r['수정일']) || ''
    };
  });

  const summary = {
    total: list.length,
    attend: list.filter(x => x.status === '참석').length,
    absent: list.filter(x => x.status === '불참').length,
    unknown: list.filter(x => x.status === '미정').length,
    none: list.filter(x => x.status === '미응답').length
  };

  return {
    ok: true,
    currentYear,
    events,
    selectedEventId,
    summary,
    list
  };
}

function getEventManageData(pin) {
  const login = adminLogin(pin);
  if (!login.ok) throw new Error(login.message);

  ensureSheets_();

  const currentYear = getSetting_('CURRENT_YEAR') || String(new Date().getFullYear());

  const events = getDataRows_(getSheet_(CFG.SHEETS.EVENTS))
    .filter(r => String(r['YEAR']) === String(currentYear))
    .sort((a, b) => Number(a['정렬'] || 999) - Number(b['정렬'] || 999))
    .map(r => ({
      eventId: clean_(r['EVENT_ID']),
      year: clean_(r['YEAR']),
      title: clean_(r['행사명']),
      date: normalizeFeeDate_(r['행사일']),
      place: clean_(r['장소']),
      content: clean_(r['내용']),
      pdfFileName: clean_(r['PDF파일명']),
      pdfFileUrl: clean_(r['PDF파일URL']),
      pdfFileId: clean_(r['PDF파일ID']),
      active: clean_(r['사용여부']) || 'Y',
      sort: clean_(r['정렬']) || '1'
    }));

  return {
    ok: true,
    currentYear,
    events
  };
}

function saveEventManage(pin, payload) {
  return withLock_(() => {
    const login = adminLogin(pin);
    if (!login.ok) throw new Error(login.message);

    ensureSheets_();

    payload = payload || {};

    const eventId = clean_(payload.eventId);
    const title = clean_(payload.title);
    const date = clean_(payload.date);
    const place = clean_(payload.place);
    const content = clean_(payload.content);
    const sort = Number(payload.sort || 1);
    const currentYear = getSetting_('CURRENT_YEAR') || String(new Date().getFullYear());

    const active =
      payload.active === true ||
      payload.active === 'Y' ||
      payload.active === 'true'
        ? 'Y'
        : 'N';

    if (!title) throw new Error('행사명을 입력해주세요.');
    if (!date) throw new Error('행사일을 입력해주세요.');

    const sh = getSheet_(CFG.SHEETS.EVENTS);
    const rows = getDataRows_(sh);

    const newId = eventId || ('E' + new Date().getTime());

    let oldPdfName = '';
    let oldPdfUrl = '';
    let oldPdfId = '';
    const shouldRemovePdf =
      payload.removePdf === true ||
      payload.removePdf === 'Y' ||
      payload.removePdf === 'true';

    if (eventId) {
      const old = rows.find(r => clean_(r['EVENT_ID']) === eventId);
      if (old) {
        oldPdfName = clean_(old['PDF파일명']);
        oldPdfUrl = clean_(old['PDF파일URL']);
        oldPdfId = clean_(old['PDF파일ID']);
      }
    }

    const rowData = [
      newId,
      currentYear,
      title,
      date,
      place,
      content,
      shouldRemovePdf ? '' : (clean_(payload.pdfFileName) || oldPdfName),
      shouldRemovePdf ? '' : (clean_(payload.pdfFileUrl) || oldPdfUrl),
      shouldRemovePdf ? '' : (clean_(payload.pdfFileId) || oldPdfId),
      active,
      sort
    ];

    if (eventId) {
      for (let i = 0; i < rows.length; i++) {
        if (clean_(rows[i]['EVENT_ID']) === eventId) {
          sh.getRange(i + 2, 1, 1, rowData.length).setValues([rowData]);
          if (shouldRemovePdf || (clean_(payload.pdfFileId) && clean_(payload.pdfFileId) !== oldPdfId)) {
            deleteUploadedFile_(oldPdfId, oldPdfUrl, oldPdfName);
          }
          return { ok: true, message: '행사가 수정되었습니다.' };
        }
      }
    }

    sh.appendRow(rowData);

    return { ok: true, message: '행사가 저장되었습니다.' };
  });
}

function deleteEventPdf(pin, eventId) {
  return withLock_(() => {
    const login = adminLogin(pin);
    if (!login.ok) throw new Error(login.message);

    const id = clean_(eventId);
    if (!id) throw new Error('행사 ID가 없습니다.');

    const sh = getSheet_(CFG.SHEETS.EVENTS);
    const rows = getDataRows_(sh);

    for (let i = 0; i < rows.length; i++) {
      if (clean_(rows[i]['EVENT_ID']) === id) {
        const fileId = clean_(rows[i]['PDF파일ID']);
        const fileUrl = clean_(rows[i]['PDF파일URL']);
        const fileName = clean_(rows[i]['PDF파일명']);
        sh.getRange(i + 2, 7, 1, 3).clearContent();
        const deleted = deleteUploadedFile_(fileId, fileUrl, fileName);
        return {
          ok: true,
          message: deleted
            ? '첨부파일이 삭제되었습니다.'
            : '목록에서는 삭제되었습니다. Drive 파일은 직접 확인이 필요합니다.'
        };
      }
    }

    throw new Error('행사를 찾을 수 없습니다.');
  });
}

function deleteEventManage(pin, eventId) {
  return withLock_(() => {
    const login = adminLogin(pin);
    if (!login.ok) throw new Error(login.message);

    const id = clean_(eventId);
    if (!id) throw new Error('행사 ID가 없습니다.');

    const sh = getSheet_(CFG.SHEETS.EVENTS);
    const rows = getDataRows_(sh);

    for (let i = 0; i < rows.length; i++) {
      if (clean_(rows[i]['EVENT_ID']) === id) {
        sh.getRange(i + 2, 10).setValue('N');
        return { ok: true, message: '행사가 숨김 처리되었습니다.' };
      }
    }

    throw new Error('행사를 찾을 수 없습니다.');
  });
}

function updateFeeUse(pin, payload) {
  return withLock_(() => {
    const login = adminLogin(pin);
    if (!login.ok) throw new Error(login.message);

    payload = payload || {};

    const id = clean_(payload.id);
    const date = clean_(payload.date);
    const gwan = clean_(payload.gwan);
    const hang = clean_(payload.hang);
    const mok = clean_(payload.mok);
    const income = Number(payload.income || 0);
    const expense = Number(payload.expense || 0);
    const note = clean_(payload.note);

    if (!id) throw new Error('수정할 사용내역 ID가 없습니다.');
    if (!date) throw new Error('날짜를 입력해주세요.');
    if (!gwan) throw new Error('관을 입력해주세요.');
    if (!hang) throw new Error('항을 입력해주세요.');
    if (!mok) throw new Error('목을 입력해주세요.');
    if (!income && !expense) throw new Error('수입 또는 지출금액을 입력해주세요.');

    const sh = getSheet_(CFG.SHEETS.FEE_USES);
    const rows = getDataRows_(sh);

    for (let i = 0; i < rows.length; i++) {
      if (clean_(rows[i]['ID']) === id) {
        sh.getRange(i + 2, 3, 1, 7).setValues([[
          date,
          gwan,
          hang,
          mok,
          income || '',
          expense || '',
          note
        ]]);

        return {
          ok: true,
          message: '사용내역이 수정되었습니다.'
        };
      }
    }

    throw new Error('수정할 사용내역을 찾을 수 없습니다.');
  });
}

function migrateFeeUseSheet_() {
  const sh = getSheet_(CFG.SHEETS.FEE_USES);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  if (lastRow < 1) return;

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  // 이미 새 구조면 종료
  if (
    headers[3] === '관' &&
    headers[4] === '항' &&
    headers[5] === '목'
  ) {
    return;
  }

  // 기존 구조: ID,YEAR,날짜,항목,수입,지출,비고,작성일
  if (headers[3] !== '항목') return;

  const values = lastRow >= 2
    ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues()
    : [];

  const newRows = values.map(row => {
    const id = row[0];
    const year = row[1];
    const date = row[2];
    const oldItem = row[3];
    const income = row[4];
    const expense = row[5];
    const note = row[6];
    const createdAt = row[7];

    const isIncome = Number(income || 0) > 0;
    const isExpense = Number(expense || 0) > 0;

    let gwan = '';
    let hang = '';
    let mok = oldItem || '';

    if (isIncome) {
      gwan = '수입';

      if (oldItem === '이월금') hang = '이월금';
      else if (oldItem === '이자') hang = '이자수입';
      else if (String(oldItem || '').includes('회비')) hang = '회비';
      else hang = '기타수입';

    } else if (isExpense) {
      gwan = '운영비';
      hang = oldItem || '기타지출';
    }

    return [
      id,
      year,
      date,
      gwan,
      hang,
      mok,
      income,
      expense,
      note,
      createdAt
    ];
  });

  sh.clearContents();

  sh.getRange(1, 1, 1, 10).setValues([[
    'ID','YEAR','날짜','관','항','목','수입','지출','비고','작성일'
  ]]);

  if (newRows.length) {
    sh.getRange(2, 1, newRows.length, 10).setValues(newRows);
  }
}

function getActiveEventGuidePdf() {
  ensureSheets_();

  const currentYear = getSetting_('CURRENT_YEAR') || String(new Date().getFullYear());
  const rows = getDataRows_(getSheet_(CFG.SHEETS.EVENTS))
    .filter(r =>
      String(r['YEAR']) === String(currentYear) &&
      clean_(r['사용여부']) !== 'N' &&
      (clean_(r['PDF파일ID']) || clean_(r['PDF파일URL']))
    )
    .sort((a, b) => Number(a['정렬'] || 999) - Number(b['정렬'] || 999));

  if (!rows.length) {
    return { ok: false, url: '', message: '행사안내가 없습니다.' };
  }

  const item = rows[0];
  const fileUrl = clean_(item['PDF파일URL']);
  const fileId = clean_(item['PDF파일ID']) || extractDriveFileId_(fileUrl);

  return {
    ok: true,
    url: fileId ? toDrivePreviewUrl_(fileId) : fileUrl
  };
}

function getEventGuidePdf() {
  return getActiveEventGuidePdf();
}

