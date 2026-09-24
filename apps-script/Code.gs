/**
 * AI 서베이랩 → 구글시트 실시간 쌓기 (Apps Script)
 *
 * 1) 구글시트를 새로 만든다.
 * 2) 확장 프로그램 › Apps Script 를 열고, 이 코드를 통째로 붙여 넣고 저장한다.
 * 3) 배포 › 새 배포 › 유형: 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → 배포 → 권한 허용.
 * 4) 나오는 웹 앱 주소(https://script.google.com/.../exec)를 앱 «설정 › 구글시트 연결»에 붙여 넣는다.
 *
 * 앱이 보내는 형식: { type, action: 'upsert' | 'delete', id, row: { 열이름: 값 } }
 *   또는 여러 건을 한 번에: { records: [ ...위 형식 ] }
 * type 마다 시트 탭이 하나씩 생긴다(설문별 응답 탭 + 'surveys' 탭). 첫 열은 항상 ID.
 */
function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply_({ ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  if (body.action === 'ping') return reply_({ ok: true, message: 'AI 서베이랩 시트 연결 성공' });

  var records = body.records || [body];
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var book = SpreadsheetApp.getActiveSpreadsheet();
    records.forEach(function (r) {
      apply_(book, r);
    });
    SpreadsheetApp.flush();
    return reply_({ ok: true, count: records.length });
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return reply_({ ok: true, message: 'AI 서베이랩 시트 수신기가 동작 중입니다.' });
}

function apply_(book, r) {
  if (!r || !r.type || !r.id) return;
  var sheet = book.getSheetByName(r.type) || book.insertSheet(String(r.type).slice(0, 100));
  var headers = ensureHeaders_(sheet, Object.keys(r.row || {}));
  var rowIndex = findRow_(sheet, r.id);

  if (r.action === 'delete') {
    if (rowIndex > 0) sheet.deleteRow(rowIndex);
    return;
  }
  var values = headers.map(function (h, i) {
    if (i === 0) return r.id;
    var v = r.row[h];
    return v === undefined || v === null ? '' : v;
  });
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }
}

function ensureHeaders_(sheet, keys) {
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  if (headers.length === 0) headers = ['ID'];
  var missing = keys.filter(function (k) {
    return headers.indexOf(k) === -1;
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
