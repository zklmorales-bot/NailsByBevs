const SHEET_NAME = 'Bookings';
const AVAILABILITY_SHEET_NAME = 'Availability';
const REFERENCE_FOLDER_NAME = 'Nails by Bevs Booking References';
const DAYS_AHEAD = 90;
const BASE_SERVICES = ['Soft Gel Nail Extensions', 'Gel Polish'];
const ADD_ON_SERVICES = [
  'Chrome / Cat Eye / Glitter',
  'French Tip',
  'Charms / Stones / Pearl',
  '3D Design / Embossed',
  'Aura / Ombre',
  'Nail Art'
];
const REMOVAL_SOURCES = ['My work', 'Not my work'];
const REMOVAL_SERVICES = ['Soft Gel', 'Gel'];
const BOOKING_HEADERS = [
  'Submitted at',
  'Full name',
  'Preferred date',
  'Preferred time',
  'Service',
  'Email',
  'Status',
  'Admin note',
  'Booking type',
  'Base service',
  'Add-ons',
  'Removal source',
  'Removal service',
  'Phone',
  'Confirmation sent at',
  'Reference image links'
];
const AVAILABILITY_HEADERS = ['Date', 'Time', 'Status', 'Admin note'];

function doGet(event) {
  const payload = JSON.stringify({ ok: true, days: getAvailability_() });
  const callback = event && event.parameter && event.parameter.callback;

  if (callback && /^[A-Za-z_$][\w$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + payload + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  const data = event.parameter || {};

  if (data.action !== 'booking') {
    return jsonResponse_({ ok: false, message: 'Unknown request.' });
  }

  const service = buildServiceSelection_(data);
  if (!service.ok) {
    return jsonResponse_({ ok: false, message: service.message });
  }

  const date = normalizeDate_(data.date);
  const time = normalizeTime_(data.time);
  const allowedTimes = getSlotLabels_(date);

  if (!date || allowedTimes.indexOf(time) === -1) {
    return jsonResponse_({ ok: false, message: 'That is not a valid appointment slot.' });
  }

  if (!isSlotAvailable_(date, time)) {
    return jsonResponse_({ ok: false, message: 'That appointment slot is no longer available.' });
  }

  const email = String(data.email || '').trim();
  if (!isValidEmail_(email)) {
    return jsonResponse_({ ok: false, message: 'Please provide a valid email address.' });
  }

  let referenceLinks = '';
  try {
    referenceLinks = saveReferenceImages_(data.referenceImages, data.name);
  } catch (error) {
    return jsonResponse_({ ok: false, message: 'Reference photos could not be uploaded. Please try again.' });
  }

  const sheet = getBookingsSheet_();
  sheet.appendRow([
    new Date(),
    data.name || '',
    date,
    time,
    service.summary,
    email,
    'PENDING',
    '',
    service.bookingType,
    service.baseService,
    service.addons,
    service.removalSource,
    service.removalService,
    data.phone || '',
    '',
    referenceLinks
  ]);

  return jsonResponse_({ ok: true });
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function authorizeMail_() {
  MailApp.getRemainingDailyQuota();
  DriveApp.getRootFolder().getName();
}

function setupBookingConfirmationTrigger_() {
  const spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'handleBookingStatusEdit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('handleBookingStatusEdit')
    .forSpreadsheet(spreadsheet)
    .onEdit()
    .create();
}

function sendConfirmationEmails_(data, service, date, time) {
  const customerEmail = String(data.email || '').trim();
  const adminEmail = Session.getEffectiveUser().getEmail();
  const phone = String(data.phone || '').trim() || 'Not provided';
  const details = [
    'Name: ' + (data.name || ''),
    'Email: ' + customerEmail,
    'Phone: ' + phone,
    'Date: ' + date,
    'Time: ' + time,
    'Service: ' + service.summary,
    'Status: CONFIRMED'
  ].join('\n');

  if (adminEmail) {
    MailApp.sendEmail(
      adminEmail,
      'Nails by Bevs booking confirmed',
      'A booking request was confirmed.\n\n' + details + '\n\nReference photo links:\n' + (data.referenceLinks || 'None')
    );
  }

  MailApp.sendEmail(
    customerEmail,
    'Your Nails by Bevs appointment is confirmed',
    'Hi ' + (data.name || 'there') + ',\n\nYour appointment has been confirmed.\n\n' + details + '\n\nNails by Bevs'
  );
}

function saveReferenceImages_(encodedImages, customerName) {
  if (!encodedImages) {
    return '';
  }

  const images = JSON.parse(String(encodedImages));
  if (!Array.isArray(images) || images.length > 3) {
    throw new Error('Invalid reference image list.');
  }

  const folder = getReferenceFolder_();
  return images.map(function(image, index) {
    if (!image || image.type !== 'image/jpeg' || !String(image.data || '').startsWith('data:image/jpeg;base64,')) {
      throw new Error('Invalid reference image.');
    }
    const base64 = String(image.data).split(',')[1];
    const bytes = Utilities.base64Decode(base64);
    const filename = sanitizeFilename_(customerName || 'customer') + '-' + Date.now() + '-' + (index + 1) + '.jpg';
    return folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', filename)).getUrl();
  }).join('\n');
}

function getReferenceFolder_() {
  const folders = DriveApp.getFoldersByName(REFERENCE_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(REFERENCE_FOLDER_NAME);
}

function sanitizeFilename_(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 50);
}

function buildServiceSelection_(data) {
  const baseService = String(data.baseService || '').trim();
  const removalSource = String(data.removalSource || '').trim();
  const removalService = String(data.removalService || '').trim();
  const addonResult = parseAddons_(data.addons);
  if (!addonResult.ok) {
    return { ok: false, message: addonResult.message };
  }
  const addons = addonResult.items;

  const hasBase = Boolean(baseService);
  const hasRemoval = Boolean(removalSource || removalService);
  if (!hasBase) {
    return { ok: false, message: 'Please choose a base service.' };
  }
  if (hasBase && BASE_SERVICES.indexOf(baseService) === -1) {
    return { ok: false, message: 'Please choose a valid base service.' };
  }
  if (addons.length && !hasBase) {
    return { ok: false, message: 'Add-ons require a base service.' };
  }
  if (hasRemoval && (REMOVAL_SOURCES.indexOf(removalSource) === -1 || REMOVAL_SERVICES.indexOf(removalService) === -1)) {
    return { ok: false, message: 'Please choose a valid removal source and type.' };
  }

  const bookingType = hasBase && hasRemoval
    ? 'BASE_AND_REMOVAL'
    : hasBase ? 'BASE' : 'REMOVAL';
  const summary = [];
  if (hasBase) {
    summary.push([baseService].concat(addons.map(function(addon) {
      return addon.name + ' x' + addon.quantity;
    })).join(' + '));
  }
  if (hasRemoval) {
    summary.push('Removal — ' + removalSource + ' — ' + removalService);
  }

  return {
    ok: true,
    bookingType: bookingType,
    baseService: baseService,
    addons: addons.map(function(addon) {
      return addon.name + ' x' + addon.quantity;
    }).join(', '),
    removalSource: removalSource,
    removalService: removalService,
    summary: summary.join(' + ')
  };
}

function parseAddons_(value) {
  if (!value) {
    return { ok: true, items: [] };
  }

  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) {
      return { ok: false, message: 'Add-ons must be a list.' };
    }
    const items = parsed.map(function(addon) {
      const name = String(addon.name || '').trim();
      const quantity = Number(addon.quantity);
      if (ADD_ON_SERVICES.indexOf(name) === -1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
        return null;
      }
      return { name: name, quantity: quantity };
    });
    if (items.some(function(item) { return !item; })) {
      return { ok: false, message: 'One or more selected add-ons are invalid.' };
    }
    return { ok: true, items: items };
  } catch (error) {
    const legacyItems = String(value)
      .split(',')
      .map(function(addon) { return addon.trim(); })
      .filter(Boolean)
      .map(function(name) { return { name: name, quantity: 1 }; });
    if (legacyItems.some(function(addon) { return ADD_ON_SERVICES.indexOf(addon.name) === -1; })) {
      return { ok: false, message: 'One or more selected add-ons are invalid.' };
    }
    return { ok: true, items: legacyItems };
  }
}

function handleBookingStatusEdit(event) {
  const range = event && event.range;
  if (!range || range.getSheet().getName() !== SHEET_NAME || range.getColumn() !== 7) {
    return;
  }

  if (String(range.getValue()).trim().toUpperCase() !== 'CONFIRMED') {
    return;
  }

  const row = range.getRow();
  const values = range.getSheet().getRange(row, 1, 1, BOOKING_HEADERS.length).getValues()[0];
  if (values[14]) {
    return;
  }
  if (!isSlotAvailable_(normalizeDate_(values[2]), normalizeTime_(values[3]), row)) {
    range.setValue('REJECTED');
    range.getSheet().getRange(row, 8).setValue('Slot is already confirmed or blocked.');
    return;
  }

  try {
    sendConfirmationEmails_(
      { name: values[1], email: values[5], phone: values[13], referenceLinks: values[15] },
      { summary: values[4] },
      normalizeDate_(values[2]),
      normalizeTime_(values[3])
    );
    range.getSheet().getRange(row, 15).setValue(new Date());
  } catch (error) {
    range.getSheet().getRange(row, 8).setValue('Confirmed, but email notification failed.');
  }
}

function getAvailability_() {
  const confirmed = getConfirmedSlots_();
  const blocked = getBlockedSlots_();
  const days = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  for (let offset = 0; offset <= DAYS_AHEAD; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const dateKey = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const slots = getSlotLabels_(dateKey).map(function(time) {
      const key = dateKey + '|' + time;
      return { time: time, available: !confirmed[key] && !blocked[key] && !blocked[dateKey + '|ALL'] };
    });

    days.push({
      date: dateKey,
      available: slots.some(function(slot) { return slot.available; }),
      slots: slots
    });
  }

  return days;
}

function getSlotLabels_(date) {
  if (!date) {
    return [];
  }

  const day = new Date(date + 'T12:00:00').getDay();
  return day === 0 || day === 6
    ? ['09:00', '11:00', '16:00', '18:00']
    : ['09:00', '21:00'];
}

function isSlotAvailable_(date, time, ignoredRow) {
  const confirmed = getConfirmedSlots_();
  const blocked = getBlockedSlots_();
  const key = date + '|' + time;
  const currentKey = ignoredRow ? date + '|' + time + '|' + ignoredRow : '';

  if (blocked[key] || blocked[date + '|ALL']) {
    return false;
  }

  if (confirmed[key] && confirmed[key] !== currentKey) {
    return false;
  }

  return true;
}

function getConfirmedSlots_() {
  const sheet = getBookingsSheet_();
  const rows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, BOOKING_HEADERS.length).getValues()
    : [];
  const confirmed = {};

  rows.forEach(function(row, index) {
    if (String(row[6] || '').trim().toUpperCase() === 'CONFIRMED') {
      const date = normalizeDate_(row[2]);
      const time = normalizeTime_(row[3]);
      if (date && time) {
        confirmed[date + '|' + time] = date + '|' + time + '|' + (index + 2);
      }
    }
  });

  return confirmed;
}

function getBlockedSlots_() {
  const sheet = getAvailabilitySheet_();
  const rows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, AVAILABILITY_HEADERS.length).getValues()
    : [];
  const blocked = {};

  rows.forEach(function(row) {
    const date = normalizeDate_(row[0]);
    const time = String(row[1] || '').trim().toUpperCase() === 'ALL'
      ? 'ALL'
      : normalizeTime_(row[1]);
    const status = String(row[2] || '').trim().toUpperCase();
    if (date && time && status === 'BLOCKED') {
      blocked[date + '|' + time] = true;
    }
  });

  return blocked;
}

function getBookingsSheet_() {
  const sheet = getOrCreateSheet_(SHEET_NAME, BOOKING_HEADERS);
  ensureHeaders_(sheet, BOOKING_HEADERS);
  return sheet;
}

function getAvailabilitySheet_() {
  return getOrCreateSheet_(AVAILABILITY_SHEET_NAME, AVAILABILITY_HEADERS);
}

function getOrCreateSheet_(name, headers) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  ensureHeaders_(sheet, headers);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  headers.forEach(function(header, index) {
    if (header === 'Email' && currentHeaders[index] === 'Phone or email') {
      sheet.getRange(1, index + 1).setValue(header);
    } else if (!currentHeaders[index]) {
      sheet.getRange(1, index + 1).setValue(header);
    }
  });
}

function normalizeDate_(value) {
  if (!value) {
    return '';
  }
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value).trim().slice(0, 10);
}

function normalizeTime_(value) {
  if (!value) {
    return '';
  }
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  return match ? ('0' + match[1]).slice(-2) + ':' + match[2] : text;
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
