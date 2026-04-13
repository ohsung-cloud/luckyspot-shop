const ORDER_REQUESTS_SHEET_NAME = 'order_requests';
const ORDER_API_SECRET = 'SET_ME_TO_THE_SAME_VALUE_AS_GAS_SECRET';
const ORDER_REQUESTS_HEADERS = [
  'order_id',
  'created_at',
  'name',
  'phone',
  'fulfillment_type',
  'pickup_location',
  'address',
  'items_json',
  'item_text',
  'total_price',
];

function doPost(e) {
  try {
    const payload = parseRequestBody_(e);

    if (
      !ORDER_API_SECRET ||
      ORDER_API_SECRET === 'SET_ME_TO_THE_SAME_VALUE_AS_GAS_SECRET'
    ) {
      throw new Error('Set ORDER_API_SECRET in the script file first');
    }

    if (payload.secret !== ORDER_API_SECRET) {
      throw new Error('Invalid secret');
    }

    validatePayload_(payload);

    const sheet = getOrderRequestsSheet_();
    ensureHeaders_(sheet);

    sheet.appendRow([
      payload.order_id,
      payload.created_at,
      payload.name,
      payload.phone,
      payload.fulfillment_type,
      payload.pickup_location,
      payload.address,
      payload.items_json,
      payload.item_text,
      payload.total_price,
    ]);

    return jsonResponse_({
      ok: true,
      orderId: payload.order_id,
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

function parseRequestBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Missing POST body');
  }

  return JSON.parse(e.postData.contents);
}

function validatePayload_(payload) {
  const requiredFields = [
    'order_id',
    'created_at',
    'name',
    'phone',
    'fulfillment_type',
    'pickup_location',
    'address',
    'items_json',
    'item_text',
    'total_price',
  ];

  requiredFields.forEach((fieldName) => {
    if (!(fieldName in payload)) {
      throw new Error(`Missing field: ${fieldName}`);
    }
  });
}

function getOrderRequestsSheet_() {
  const spreadsheetId =
    PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const normalizedSpreadsheetId =
    spreadsheetId && spreadsheetId !== 'OPTIONAL_IF_THIS_IS_A_BOUND_SCRIPT'
      ? spreadsheetId
      : '';

  if (normalizedSpreadsheetId) {
    return SpreadsheetApp.openById(normalizedSpreadsheetId).getSheetByName(
      ORDER_REQUESTS_SHEET_NAME,
    );
  }

  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!activeSpreadsheet) {
    throw new Error('No active spreadsheet. Set SPREADSHEET_ID script property.');
  }

  return (
    activeSpreadsheet.getSheetByName(ORDER_REQUESTS_SHEET_NAME) ||
    activeSpreadsheet.insertSheet(ORDER_REQUESTS_SHEET_NAME)
  );
}

function ensureHeaders_(sheet) {
  if (!sheet) {
    throw new Error(`Sheet not found: ${ORDER_REQUESTS_SHEET_NAME}`);
  }

  const headerRange = sheet.getRange(1, 1, 1, ORDER_REQUESTS_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const shouldWriteHeaders = ORDER_REQUESTS_HEADERS.some(
    (header, index) => currentHeaders[index] !== header,
  );

  if (shouldWriteHeaders) {
    headerRange.setValues([ORDER_REQUESTS_HEADERS]);
  }
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
