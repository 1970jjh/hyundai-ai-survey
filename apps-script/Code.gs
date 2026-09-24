/**
 * AI 서베이랩 → 구글시트 실시간 쌓기 (Apps Script)
 *
 * 1) 구글시트를 새로 만든다.
 * 2) 확장 프로그램 › Apps Script 를 열고, 앱 «설정 › 구글시트 연결»에서 복사한 코드를 통째로 붙여 넣고 저장한다.
 *    (앱에서 복사한 코드에는 아래 SHEET_SECRET 에 이 앱 전용 비밀값이 들어 있다. 저장소의 원본 파일을 그대로 쓰면 동작하지 않는다.)
 * 3) 배포 › 새 배포 › 유형: 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → 배포 → 권한 허용.
 * 4) 나오는 웹 앱 주소(https://script.google.com/macros/s/.../exec)를 앱 «설정 › 구글시트 연결»에 붙여 넣는다.
 *
 * 앱이 보내는 형식: { secret, records: [{ type, tab?, action: 'upsert' | 'delete', id, row: { 열이름: 값 }, updatedAt }] }
 * type(변하지 않는 키)마다 시트 탭이 하나씩 생기고, 탭 이름은 tab(설문 제목)을 따른다. 첫 열은 항상 ID.
 * 비밀값이 다르거나 형식이 틀린 요청은 거부하고, = + - @ 로 시작하는 글자는 수식이 아닌 텍스트로 저장한다.
 */
var SHEET_SECRET = '__SHEET_SECRET__';
var UPDATED_COL = '갱신(ms)';
var FORMULA_START = /^[=+\-@\t\r]/;
var KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
var MAX_RECORDS = 500;

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply_({ ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  if (!body || typeof body !== 'object') return reply_({ ok: false, error: '요청 형식이 올바르지 않습니다.' });
  if (SHEET_SECRET === '__' + 'SHEET_SECRET__' || body.secret !== SHEET_SECRET) {
    return reply_({
      ok: false,
      error: '비밀값이 맞지 않습니다. 앱 «설정 › 구글시트 연결»에서 코드를 다시 복사해 붙여 넣고 새로 배포하세요.',
    });
  }
  if (body.action === 'ping') return reply_({ ok: true, message: 'AI 서베이랩 시트 연결 성공' });

  var invalid = validate_(body.records);
  if (invalid) return reply_({ ok: false, error: invalid });

  var lock = LockService.getScriptLock();
  // 앱은 15초 안에 응답을 기다린다 → 그보다 짧게 기다리고, 못 잡으면 앱이 잠시 뒤 다시 보낸다
  if (!lock.tryLock(12000)) return reply_({ ok: false, busy: true, error: '시트가 다른 요청을 처리 중입니다.' });
  try {
    var book = SpreadsheetApp.getActiveSpreadsheet();
    var skipped = 0;
    body.records.forEach(function (r) {
      if (!apply_(book, r)) skipped++;
    });
    SpreadsheetApp.flush();
    return reply_({ ok: true, count: body.records.length, skipped: skipped });
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return reply_({ ok: true, message: 'AI 서베이랩 시트 수신기가 동작 중입니다.' });
}

/** 형식 검사: 문제가 있으면 한국어 오류, 없으면 빈 문자열 */
function validate_(records) {
  if (!Array.isArray(records) || records.length === 0 || records.length > MAX_RECORDS) return 'records 형식이 올바르지 않습니다.';
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    var where = (i + 1) + '번째 레코드: ';
    if (!r || typeof r !== 'object') return where + '형식 오류';
    if (typeof r.type !== 'string' || !KEY_PATTERN.test(r.type)) return where + 'type 오류';
    if (r.tab !== undefined && (typeof r.tab !== 'string' || r.tab.length > 100)) return where + 'tab 오류';
    if (r.action !== 'upsert' && r.action !== 'delete') return where + 'action 오류';
    if (typeof r.id !== 'string' || !KEY_PATTERN.test(r.id)) return where + 'id 오류';
    if (typeof r.updatedAt !== 'string' || isNaN(Date.parse(r.updatedAt))) return where + 'updatedAt 오류';
    if (!r.row || typeof r.row !== 'object' || Array.isArray(r.row)) return where + 'row 오류';
    var keys = Object.keys(r.row);
    if (keys.length > 60) return where + '열이 너무 많습니다';
    for (var k = 0; k < keys.length; k++) {
      var v = r.row[keys[k]];
      if (keys[k].length > 400 || FORMULA_START.test(keys[k])) return where + '열 이름 오류';
      var okValue = (typeof v === 'string' && v.length <= 5000) || (typeof v === 'number' && isFinite(v));
      if (!okValue) return where + '«' + keys[k] + '» 값 오류';
    }
  }
  return '';
}

/** 수식으로 해석될 수 있는 글자는 앞에 ' 를 붙여 텍스트로 저장 */
function text_(v) {
  if (typeof v === 'number') return v;
  var s = String(v);
  return FORMULA_START.test(s) ? "'" + s : s;
}

/** 적용했으면 true, 시트에 더 최신 값이 있어 건너뛰었으면 false */
function apply_(book, r) {
  var sheet = sheetFor_(book, r);
  var headers = ensureHeaders_(sheet, Object.keys(r.row).concat([UPDATED_COL]));
  var rowIndex = findRow_(sheet, r.id);
  var incoming = Date.parse(r.updatedAt);
  if (rowIndex > 0) {
    var existing = Number(sheet.getRange(rowIndex, headers.indexOf(UPDATED_COL) + 1).getValue());
    if (existing > incoming) return false;
  }
  if (r.action === 'delete') {
    if (rowIndex > 0) sheet.deleteRow(rowIndex);
    return true;
  }
  var values = headers.map(function (h, i) {
    if (i === 0) return r.id;
    if (h === UPDATED_COL) return incoming;
    return r.row.hasOwnProperty(h) ? text_(r.row[h]) : '';
  });
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }
  return true;
}

/** type(변하지 않는 키) → 시트 ID 를 문서 속성에 기억. 탭 이름(tab)이 바뀌면 같은 탭의 이름만 바꾼다 */
function sheetFor_(book, r) {
  var props = PropertiesService.getDocumentProperties();
  var name = String(r.tab || r.type).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 100) || r.type;
  var savedId = props.getProperty('tab:' + r.type);
  var sheet = null;
  if (savedId) {
    sheet = book.getSheets().filter(function (s) {
      return String(s.getSheetId()) === savedId;
    })[0] || null;
  }
  if (!sheet) sheet = book.getSheetByName(name) || book.insertSheet(name);
  if (sheet.getName() !== name && !book.getSheetByName(name)) sheet.setName(name);
  props.setProperty('tab:' + r.type, String(sheet.getSheetId()));
  return sheet;
}

function ensureHeaders_(sheet, keys) {
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  if (headers.length === 0) headers = ['ID'];
  var missing = keys.filter(function (k, i) {
    return headers.indexOf(k) === -1 && keys.indexOf(k) === i;
  });
  if (missing.length || lastCol === 0) {
    headers = headers.concat(missing);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return headers;
}

function findRow_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
