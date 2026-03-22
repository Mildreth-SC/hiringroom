const SPREADSHEET_ID = "1jd2InJu0tGvC8K1GEXCtoKtmBfZtpf7ly75DQZrW-as";
const SHEET_NAME = "jobs";
const APPLICATIONS_SHEET_NAME = "applications";
const CONFIG_SHEET_NAME = "config";
const DRIVE_FOLDER_ID = "1UlYKIhsst8G3M7LAuaPXl0ueGmCu4k-f";
const ORG_DOMAIN = "gmail.com";
const DEFAULT_EMPLOYER_ACCESS_CODE = "empleador2026";

function doGet(e) {
  try {
    assertDomainAccess_();
    const action = String((e && e.parameter && e.parameter.action) || "listJobs");

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
      const authorized = verifyEmployerAccess_(String(payload.code || ""));
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
    sheet.appendRow([
      "id",
      "title",
      "region",
      "area",
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
    ]);
  }

  return sheet;
}

function listJobs_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const rows = values.slice(1);

  return rows
    .filter(function(row) {
      return row[0];
    })
    .map(function(row) {
      const hasApplyUrlColumn = row.length >= 11;
      const hasAuditColumns = row.length >= 14;
      return {
        id: String(row[0] || ""),
        title: String(row[1] || ""),
        region: String(row[2] || ""),
        area: String(row[3] || ""),
        education: String(row[4] || ""),
        skills: String(row[5] || ""),
        description: String(row[6] || ""),
        deadline: String(row[7] || ""),
        applyUrl: hasApplyUrlColumn ? String(row[8] || "") : "",
        imageData: hasApplyUrlColumn ? String(row[9] || "") : String(row[8] || ""),
        createdAt: hasApplyUrlColumn ? String(row[10] || "") : String(row[9] || ""),
        createdBy: hasAuditColumns ? String(row[11] || "") : "",
        updatedAt: hasAuditColumns ? String(row[12] || "") : "",
        updatedBy: hasAuditColumns ? String(row[13] || "") : ""
      };
    });
}

function createJob_(job, currentUser) {
  const now = new Date().toISOString();
  const clean = {
    id: "job-" + Date.now(),
    title: String(job.title || "").trim(),
    region: String(job.region || "").trim(),
    area: String(job.area || "").trim(),
    education: String(job.education || "").trim(),
    skills: String(job.skills || "").trim(),
    description: String(job.description || "").trim(),
    deadline: String(job.deadline || "").trim(),
    applyUrl: String(job.applyUrl || "").trim(),
    imageData: "",
    createdAt: now,
    createdBy: currentUser,
    updatedAt: now,
    updatedBy: currentUser
  };

  if (!clean.title || !clean.region || !clean.area || !clean.education || !clean.description || !clean.deadline || !clean.applyUrl) {
    throw new Error("Campos obligatorios incompletos");
  }

  if (job.imageData) {
    clean.imageData = saveImageToDrive_(String(job.imageData), clean.id);
  }

  const sheet = getSheet_();
  sheet.appendRow([
    clean.id,
    clean.title,
    clean.region,
    clean.area,
    clean.education,
    clean.skills,
    clean.description,
    clean.deadline,
    clean.applyUrl,
    clean.imageData,
    clean.createdAt,
    clean.createdBy,
    clean.updatedAt,
    clean.updatedBy
  ]);

  return clean;
}

function deleteJob_(id, currentUser) {
  if (!id) {
    throw new Error("ID requerido");
  }

  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();

  for (let i = values.length - 1; i >= 1; i -= 1) {
    if (String(values[i][0]) === id) {
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

  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][0] || "") !== id) {
      continue;
    }

    const hasApplyUrlColumn = values[i].length >= 11;
    const hasAuditColumns = values[i].length >= 14;
    const previousImage = hasApplyUrlColumn ? String(values[i][9] || "") : String(values[i][8] || "");
    const previousCreatedAt = hasApplyUrlColumn ? String(values[i][10] || "") : String(values[i][9] || "");
    const previousCreatedBy = hasAuditColumns ? String(values[i][11] || "") : "";
    const now = new Date().toISOString();
    const imageCandidate = String(job.imageData || "").trim();
    const imageData = imageCandidate.startsWith("data:")
      ? saveImageToDrive_(imageCandidate, id)
      : (imageCandidate || previousImage);

    const clean = {
      id: id,
      title: String(job.title || "").trim(),
      region: String(job.region || "").trim(),
      area: String(job.area || "").trim(),
      education: String(job.education || "").trim(),
      skills: String(job.skills || "").trim(),
      description: String(job.description || "").trim(),
      deadline: String(job.deadline || "").trim(),
      applyUrl: String(job.applyUrl || "").trim(),
      imageData: imageData,
      createdAt: previousCreatedAt || now,
      createdBy: previousCreatedBy || currentUser,
      updatedAt: now,
      updatedBy: currentUser
    };

    if (!clean.title || !clean.region || !clean.area || !clean.education || !clean.description || !clean.deadline || !clean.applyUrl) {
      throw new Error("Campos obligatorios incompletos");
    }

    if (hasAuditColumns) {
      sheet.getRange(i + 1, 1, 1, 14).setValues([[
        clean.id,
        clean.title,
        clean.region,
        clean.area,
        clean.education,
        clean.skills,
        clean.description,
        clean.deadline,
        clean.applyUrl,
        clean.imageData,
        clean.createdAt,
        clean.createdBy,
        clean.updatedAt,
        clean.updatedBy
      ]]);
    } else if (hasApplyUrlColumn) {
      sheet.getRange(i + 1, 1, 1, 11).setValues([[
        clean.id,
        clean.title,
        clean.region,
        clean.area,
        clean.education,
        clean.skills,
        clean.description,
        clean.deadline,
        clean.applyUrl,
        clean.imageData,
        clean.createdAt
      ]]);
    } else {
      sheet.getRange(i + 1, 1, 1, 10).setValues([[
        clean.id,
        clean.title,
        clean.region,
        clean.area,
        clean.education,
        clean.skills,
        clean.description,
        clean.deadline,
        clean.imageData,
        clean.createdAt
      ]]);
    }

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

function verifyEmployerAccess_(code) {
  const entered = String(code || "").trim().toLowerCase();
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
