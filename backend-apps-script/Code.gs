const SPREADSHEET_ID = "1jd2InJu0tGvC8K1GEXCtoKtmBfZtpf7ly75DQZrW-as";
const SHEET_NAME = "jobs";
const APPLICATIONS_SHEET_NAME = "applications";
const CONFIG_SHEET_NAME = "config";
const DRIVE_FOLDER_ID = "1UlYKIhsst8G3M7LAuaPXl0ueGmCu4k-f";
const ORG_DOMAIN = "gmail.com";
const DEFAULT_EMPLOYER_ACCESS_CODE = "empleador2026";
const APP_VERSION = "2026-03-24-auth-users-v2";
const JOB_HEADERS = [
  "id",
  "title",
  "region",
  "area",
  "province",
  "education",
  "skills",
  "description",
  "deadline",
  "applyUrl",
  "imageUrl",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
];

function doGet(e) {
  try {
    assertDomainAccess_();
    const action = String((e && e.parameter && e.parameter.action) || "listJobs");

    if (action === "status") {
      const users = getEmployerUsers_();
      return jsonOut({
        ok: true,
        version: APP_VERSION,
        authMode: Object.keys(users).length > 0 ? "users" : "global",
        usersConfigured: Object.keys(users).length
      });
    }

    if (action === "listJobs") {
      return jsonOut({ ok: true, jobs: listJobs_() });
    }

    return jsonOut({ ok: false, error: "Accion GET no soportada" });
  } catch (error) {
    return jsonOut({ ok: false, error: error.message || "Error interno" });
  }
}

function doPost(e) {
  try {
    const currentUser = assertDomainAccess_();
    const payload = getPayload_(e);
    const action = String(payload.action || "");

    if (action === "verifyEmployerAccess") {
      const authorized = verifyEmployerAccess_(
        String(payload.user || payload.username || ""),
        String(payload.code || "")
      );
      return jsonOut({ ok: true, authorized: authorized });
    }

    if (action === "createJob") {
      const job = createJob_(payload.job || {}, currentUser);
      return jsonOut({ ok: true, job: job });
    }

    if (action === "deleteJob") {
      const removed = deleteJob_(String(payload.id || ""), currentUser);
      return jsonOut({ ok: removed, removed: removed });
    }

    if (action === "updateJob") {
      const updated = updateJob_(payload.job || {}, currentUser);
      return jsonOut({ ok: true, job: updated });
    }

    if (action === "createApplication") {
      const application = createApplication_(payload.application || {}, currentUser);
      return jsonOut({ ok: true, application: application });
    }

    return jsonOut({ ok: false, error: "Accion POST no soportada" });
  } catch (error) {
    return jsonOut({ ok: false, error: error.message || "Error interno" });
  }
}

function getPayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  const raw = e.postData.contents;
  const type = String(e.postData.type || "").toLowerCase();

  if (type.indexOf("application/json") >= 0) {
    return JSON.parse(raw);
  }

  if (type.indexOf("application/x-www-form-urlencoded") >= 0) {
    const parsed = parseFormBody_(raw);
    return parsed.payload ? JSON.parse(parsed.payload) : parsed;
  }

  try {
    return JSON.parse(raw);
  } catch (_ignored) {
    return {};
  }
}

function parseFormBody_(raw) {
  const out = {};
  raw.split("&").forEach(function(pair) {
    if (!pair) {
      return;
    }
    const idx = pair.indexOf("=");
    const key = idx >= 0 ? pair.substring(0, idx) : pair;
    const val = idx >= 0 ? pair.substring(idx + 1) : "";
    out[decodeURIComponent(key)] = decodeURIComponent((val || "").replace(/\+/g, " "));
  });
  return out;
}

function jsonOut(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function assertDomainAccess_() {
  const email = String(Session.getActiveUser().getEmail() || "").trim();
  const allowed = String(ORG_DOMAIN || "").trim().toLowerCase();

  // In consumer Gmail deployments, Apps Script can return empty active user.
  if (!email) {
    if (allowed === "gmail.com") {
      return "usuario.gmail@no-identificado";
    }
    throw new Error("No se pudo validar el usuario de Google Workspace");
  }

  const emailDomain = email.split("@").pop().toLowerCase();

  if (!allowed || emailDomain !== allowed) {
    throw new Error("Acceso denegado por dominio");
  }

  return email;
}

function getSheet_() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = book.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(JOB_HEADERS);
  } else {
    ensureJobHeaders_(sheet);
  }

  return sheet;
}

function ensureJobHeaders_(sheet) {
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function(value) {
      return String(value || "").trim().toLowerCase();
    });

  JOB_HEADERS.forEach(function(header) {
    if (headers.indexOf(header.toLowerCase()) >= 0) {
      return;
    }
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
    headers.push(header.toLowerCase());
  });
}

function getHeaderMap_(headersRow) {
  const map = {};
  (headersRow || []).forEach(function(headerValue, index) {
    const key = String(headerValue || "").trim().toLowerCase();
    if (key) {
      map[key] = index;
    }
  });
  return map;
}

function getValueByHeader_(row, headerMap, headerName) {
  const index = headerMap[String(headerName || "").toLowerCase()];
  if (typeof index !== "number") {
    return "";
  }
  return String(row[index] || "");
}

function getRawValueByHeader_(row, headerMap, headerName) {
  const index = headerMap[String(headerName || "").toLowerCase()];
  if (typeof index !== "number") {
    return "";
  }
  return row[index];
}

function normalizeDeadlineValue_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || "Etc/UTC", "yyyy-MM-dd");
  }

  const clean = String(value || "").trim();
  if (!clean) {
    return "";
  }

  const ymd = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return ymd[1] + "-" + ymd[2] + "-" + ymd[3];
  }

  const parsed = new Date(clean);
  if (isNaN(parsed.getTime())) {
    return "";
  }

  return Utilities.formatDate(parsed, Session.getScriptTimeZone() || "Etc/UTC", "yyyy-MM-dd");
}

function buildRowByHeaders_(headersRow, job) {
  return (headersRow || []).map(function(headerValue) {
    const key = String(headerValue || "").trim();
    switch (key.toLowerCase()) {
      case "id":
        return job.id;
      case "title":
        return job.title;
      case "region":
        return job.region;
      case "area":
        return job.area;
      case "province":
        return job.province;
      case "education":
        return job.education;
      case "skills":
        return job.skills;
      case "description":
        return job.description;
      case "deadline":
        return job.deadline;
      case "applyurl":
        return job.applyUrl;
      case "imageurl":
      case "imagedata":
        return job.imageData;
      case "createdat":
        return job.createdAt;
      case "createdby":
        return job.createdBy;
      case "updatedat":
        return job.updatedAt;
      case "updatedby":
        return job.updatedBy;
      default:
        return "";
    }
  });
}

function listJobs_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const headersRow = values[0];
  const headerMap = getHeaderMap_(headersRow);
  const rows = values.slice(1);

  return rows
    .filter(function(row) {
      return getValueByHeader_(row, headerMap, "id");
    })
    .map(function(row) {
      const region = getValueByHeader_(row, headerMap, "region");
      const province = getValueByHeader_(row, headerMap, "province") || region;
      const hasApplyUrlColumn = row.length >= 11;
      return {
        id: getValueByHeader_(row, headerMap, "id"),
        title: getValueByHeader_(row, headerMap, "title"),
        region: region,
        area: getValueByHeader_(row, headerMap, "area"),
        education: getValueByHeader_(row, headerMap, "education"),
        skills: getValueByHeader_(row, headerMap, "skills"),
        description: getValueByHeader_(row, headerMap, "description"),
        deadline: normalizeDeadlineValue_(getRawValueByHeader_(row, headerMap, "deadline")),
        applyUrl: getValueByHeader_(row, headerMap, "applyurl") || (hasApplyUrlColumn ? String(row[8] || "") : ""),
        imageData: getValueByHeader_(row, headerMap, "imageurl") || getValueByHeader_(row, headerMap, "imagedata") || (hasApplyUrlColumn ? String(row[9] || "") : String(row[8] || "")),
        createdAt: getValueByHeader_(row, headerMap, "createdat") || (hasApplyUrlColumn ? String(row[10] || "") : String(row[9] || "")),
        createdBy: getValueByHeader_(row, headerMap, "createdby"),
        updatedAt: getValueByHeader_(row, headerMap, "updatedat"),
        updatedBy: getValueByHeader_(row, headerMap, "updatedby"),
        province: province
      };
    });
}

function createJob_(job, currentUser) {
  const now = new Date().toISOString();
  const province = String(job.province || "").trim();
  const region = String(job.region || province || "").trim();
  const clean = {
    id: "job-" + Date.now(),
    title: String(job.title || "").trim(),
    region: region,
    province: province,
    area: String(job.area || "").trim(),
    education: String(job.education || "").trim(),
    skills: String(job.skills || "").trim(),
    description: String(job.description || "").trim(),
    deadline: normalizeDeadlineValue_(job.deadline),
    applyUrl: String(job.applyUrl || "").trim(),
    imageData: "",
    createdAt: now,
    createdBy: currentUser,
    updatedAt: now,
    updatedBy: currentUser
  };

  if (!clean.title || !clean.province || !clean.area || !clean.education || !clean.description || !clean.deadline || !clean.applyUrl) {
    throw new Error("Campos obligatorios incompletos");
  }

  if (job.imageData) {
    clean.imageData = saveImageToDrive_(String(job.imageData), clean.id);
  }

  const sheet = getSheet_();
  const headersRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(buildRowByHeaders_(headersRow, clean));

  return clean;
}

function deleteJob_(id, currentUser) {
  if (!id) {
    throw new Error("ID requerido");
  }

  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const headersRow = values[0] || [];
  const headerMap = getHeaderMap_(headersRow);
  const idIndex = headerMap.id;

  if (typeof idIndex !== "number") {
    throw new Error("No se encontro la columna id");
  }

  for (let i = values.length - 1; i >= 1; i -= 1) {
    if (String(values[i][idIndex] || "") === id) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }

  return false;
}

function updateJob_(job, currentUser) {
  const id = String(job.id || "").trim();
  if (!id) {
    throw new Error("ID requerido para editar");
  }

  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const headersRow = values[0] || [];
  const headerMap = getHeaderMap_(headersRow);
  const idIndex = headerMap.id;

  if (typeof idIndex !== "number") {
    throw new Error("No se encontro la columna id");
  }

  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][idIndex] || "") !== id) {
      continue;
    }

    const previousRegion = getValueByHeader_(values[i], headerMap, "region");
    const previousImage = getValueByHeader_(values[i], headerMap, "imageurl") || getValueByHeader_(values[i], headerMap, "imagedata");
    const previousCreatedAt = getValueByHeader_(values[i], headerMap, "createdat");
    const previousCreatedBy = getValueByHeader_(values[i], headerMap, "createdby");
    const previousProvince = getValueByHeader_(values[i], headerMap, "province") || previousRegion;
    const previousDeadline = normalizeDeadlineValue_(getRawValueByHeader_(values[i], headerMap, "deadline"));
    const now = new Date().toISOString();
    const imageCandidate = String(job.imageData || "").trim();
    const uploadedImage = imageCandidate.startsWith("data:")
      ? saveImageToDrive_(imageCandidate, id)
      : "";
    const imageData = uploadedImage || imageCandidate || previousImage;

    const clean = {
      id: id,
      title: String(job.title || "").trim(),
      province: String(job.province || previousProvince || "").trim(),
      region: String(job.region || previousRegion || "").trim(),
      area: String(job.area || "").trim(),
      education: String(job.education || "").trim(),
      skills: String(job.skills || "").trim(),
      description: String(job.description || "").trim(),
      deadline: normalizeDeadlineValue_(job.deadline) || previousDeadline,
      applyUrl: String(job.applyUrl || "").trim(),
      imageData: imageData,
      createdAt: previousCreatedAt || now,
      createdBy: previousCreatedBy || currentUser,
      updatedAt: now,
      updatedBy: currentUser
    };

    if (!clean.region) {
      clean.region = clean.province;
    }

    if (!clean.title || !clean.province || !clean.area || !clean.education || !clean.description || !clean.deadline || !clean.applyUrl) {
      throw new Error("Campos obligatorios incompletos");
    }

    sheet.getRange(i + 1, 1, 1, headersRow.length).setValues([
      buildRowByHeaders_(headersRow, clean)
    ]);

    return clean;
  }

  throw new Error("No se encontro la oferta a editar");
}

function saveImageToDrive_(dataUrl, nameHint) {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    return "";
  }

  const mimeType = match[1] || "image/png";
  const base64 = match[2] || "";
  const bytes = Utilities.base64Decode(base64);
  const ext = mimeType.split("/")[1] || "png";
  const blob = Utilities.newBlob(bytes, mimeType, nameHint + "." + ext);

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return "https://drive.google.com/uc?export=view&id=" + file.getId();
}

function getApplicationsSheet_() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = book.getSheetByName(APPLICATIONS_SHEET_NAME);

  if (!sheet) {
    sheet = book.insertSheet(APPLICATIONS_SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "id",
      "jobId",
      "firstName",
      "lastName",
      "email",
      "phone",
      "message",
      "createdAt",
      "createdBy"
    ]);
  }

  return sheet;
}

function getConfigSheet_() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = book.getSheetByName(CONFIG_SHEET_NAME);

  if (!sheet) {
    sheet = book.insertSheet(CONFIG_SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["key", "value"]);
    sheet.appendRow(["employerAccessCode", DEFAULT_EMPLOYER_ACCESS_CODE]);
  }

  return sheet;
}

function getEmployerAccessCode_() {
  const sheet = getConfigSheet_();
  const values = sheet.getDataRange().getValues();
  const acceptedKeys = {
    employeraccesscode: true,
    employeraccess: true
  };

  for (let i = 1; i < values.length; i += 1) {
    const key = String(values[i][0] || "").trim().toLowerCase();
    if (acceptedKeys[key]) {
      const value = String(values[i][1] || "").trim();
      return value || DEFAULT_EMPLOYER_ACCESS_CODE;
    }
  }

  sheet.appendRow(["employerAccessCode", DEFAULT_EMPLOYER_ACCESS_CODE]);
  return DEFAULT_EMPLOYER_ACCESS_CODE;
}

function getEmployerUsers_() {
  const sheet = getConfigSheet_();
  const values = sheet.getDataRange().getValues();
  const users = {};
  const reservedKeys = {
    employeraccesscode: true,
    employeraccess: true,
    employerusers: true
  };

  for (let i = 1; i < values.length; i += 1) {
    const key = String(values[i][0] || "").trim();
    const value = String(values[i][1] || "").trim();
    if (!key || !value) {
      continue;
    }

    const lowerKey = key.toLowerCase();

    if (lowerKey.indexOf("employeruser.") === 0) {
      const username = key.substring("employerUser.".length).trim().toLowerCase();
      if (username) {
        users[username] = value;
      }
      continue;
    }

    if (lowerKey === "employeruser") {
      const idx = value.indexOf(":");
      if (idx > 0) {
        const username = value.substring(0, idx).trim().toLowerCase();
        const password = value.substring(idx + 1).trim();
        if (username && password) {
          users[username] = password;
        }
      }
      continue;
    }

    if (lowerKey === "employerusers") {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          Object.keys(parsed).forEach(function(username) {
            const normalized = String(username || "").trim().toLowerCase();
            const password = String(parsed[username] || "").trim();
            if (normalized && password) {
              users[normalized] = password;
            }
          });
        }
      } catch (_ignored) {
        // Ignore malformed JSON in employerUsers and continue with other rows.
      }
      continue;
    }

    // Generic mode: any non-reserved key/value row works as username/password.
    if (!reservedKeys[lowerKey]) {
      users[lowerKey] = value;
    }
  }

  return users;
}

function verifyEmployerAccess_(user, code) {
  const enteredUser = String(user || "").trim().toLowerCase();
  const entered = String(code || "").trim().toLowerCase();
  const users = getEmployerUsers_();
  const userKeys = Object.keys(users);

  if (userKeys.length > 0) {
    if (!enteredUser) {
      return false;
    }
    const expectedUserCode = String(users[enteredUser] || "").trim().toLowerCase();
    return Boolean(expectedUserCode) && Boolean(entered) && expectedUserCode === entered;
  }

  const expected = String(getEmployerAccessCode_() || "").trim().toLowerCase();
  return Boolean(entered) && entered === expected;
}

function createApplication_(application, currentUser) {
  const clean = {
    id: "app-" + Date.now(),
    jobId: String(application.jobId || "").trim(),
    firstName: String(application.firstName || "").trim(),
    lastName: String(application.lastName || "").trim(),
    email: String(application.email || "").trim(),
    phone: String(application.phone || "").trim(),
    message: String(application.message || "").trim(),
    createdAt: new Date().toISOString(),
    createdBy: currentUser
  };

  if (!clean.jobId || !clean.firstName || !clean.lastName || !clean.email || !clean.phone) {
    throw new Error("Campos de postulacion incompletos");
  }

  const sheet = getApplicationsSheet_();
  sheet.appendRow([
    clean.id,
    clean.jobId,
    clean.firstName,
    clean.lastName,
    clean.email,
    clean.phone,
    clean.message,
    clean.createdAt,
    clean.createdBy
  ]);

  return clean;
}
