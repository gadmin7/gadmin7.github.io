/**
 * Daily Notes — Short trail → Google Sheet
 *
 * SETUP (personal Google account):
 * 1. Create a new Google Sheet (e.g. "Daily Notes Short").
 * 2. Extensions → Apps Script → paste this file → Save.
 * 3. Project Settings → Script properties → add SYNC_TOKEN (any long random string).
 * 4. Run setupSheet once (authorize when prompted).
 * 5. Deploy → New deployment → Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    Copy the Web app URL into Daily Notes → Google Sheet settings.
 * 6. Paste the same SYNC_TOKEN into the Daily Notes page.
 */

const SHEET_NAME = "Short notes";

function getToken_() {
  const token = PropertiesService.getScriptProperties().getProperty("SYNC_TOKEN");
  if (!token) throw new Error("Set SYNC_TOKEN in Script properties");
  return token;
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function setupSheet() {
  const sheet = getSheet_();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "id",
      "day",
      "content",
      "created_at",
      "updated_at",
      "last_event",
      "char_count",
    ]);
    sheet.getRange(1, 1, 1, 7).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

function findRowById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return -1;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doGet(e) {
  try {
    if (e.parameter.token !== getToken_()) {
      return jsonResponse_({ ok: false, error: "unauthorized" });
    }
    if (e.parameter.action === "ping") {
      return jsonResponse_({ ok: true, pong: true });
    }
    return jsonResponse_({ ok: false, error: "unknown action" });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== getToken_()) {
      return jsonResponse_({ ok: false, error: "unauthorized" });
    }

    if (body.action === "ping") {
      return jsonResponse_({ ok: true, pong: true });
    }

    setupSheet();
    const sheet = getSheet_();

    if (body.action === "delete") {
      const row = findRowById_(sheet, body.id);
      if (row > 0) sheet.deleteRow(row);
      return jsonResponse_({ ok: true, deleted: body.id });
    }

    if (body.action === "create" || body.action === "update") {
      const row = [
        body.id,
        body.day,
        body.content,
        body.createdAt,
        body.updatedAt,
        body.action,
        body.charCount || (body.content ? body.content.length : 0),
      ];
      const existing = findRowById_(sheet, body.id);
      if (existing > 0) {
        sheet.getRange(existing, 1, 1, 7).setValues([row]);
        return jsonResponse_({ ok: true, updated: body.id });
      }
      sheet.appendRow(row);
      return jsonResponse_({ ok: true, created: body.id });
    }

    return jsonResponse_({ ok: false, error: "unknown action" });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}
