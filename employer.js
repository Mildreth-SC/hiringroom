const STORAGE_KEY = "hiring_room_jobs_v1";
const DEMO_ACCESS_CODE = "empleador2026";
const API_URL = (window.HIRING_API_URL || "").trim();
const ECUADOR_PROVINCES = [
  "Azuay",
  "Bolivar",
  "Canar",
  "Carchi",
  "Chimborazo",
  "Cotopaxi",
  "El Oro",
  "Esmeraldas",
  "Galapagos",
  "Guayas",
  "Imbabura",
  "Loja",
  "Los Rios",
  "Manabi",
  "Morona Santiago",
  "Napo",
  "Orellana",
  "Pastaza",
  "Pichincha",
  "Santa Elena",
  "Santo Domingo de los Tsachilas",
  "Sucumbios",
  "Tungurahua",
  "Zamora Chinchipe"
];
const AREA_OPTIONS = [
  "Administracion",
  "Logistica",
  "Tienda"
];

const gate = document.getElementById("gate");
const panel = document.getElementById("employerPanel");
const unlockBtn = document.getElementById("unlockBtn");
const logoutBtn = document.getElementById("logoutBtn");
const accessUser = document.getElementById("accessUser");
const accessCode = document.getElementById("accessCode");
const gateNotice = document.getElementById("gateNotice");

const form = document.getElementById("jobForm");
const provinceInput = document.getElementById("provinceInput");
const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const formNotice = document.getElementById("formNotice");
const employerJobList = document.getElementById("employerJobList");
const submitJobBtn = document.getElementById("submitJobBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const employerRegionFilter = document.getElementById("employerRegionFilter");
const employerProvinceFilter = document.getElementById("employerProvinceFilter");
const employerAreaFilter = document.getElementById("employerAreaFilter");

let selectedImageData = "";
let editingJobId = null;
let editingJobSnapshot = null;

init();

function init() {
  populateProvinceInputOptions();
  sanitizeAreaInputOptions();
  unlockBtn.addEventListener("click", handleUnlock);
  accessUser.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleUnlock();
    }
  });
  accessCode.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleUnlock();
    }
  });

  imageInput.addEventListener("change", handleImage);
  form.addEventListener("submit", saveJob);
  cancelEditBtn.addEventListener("click", resetEditMode);
  logoutBtn.addEventListener("click", handleLogout);
  employerRegionFilter.addEventListener("change", renderEmployerList);
  employerProvinceFilter.addEventListener("change", renderEmployerList);
  employerAreaFilter.addEventListener("change", renderEmployerList);

  if (sessionStorage.getItem("hiring_room_employer_auth") === "ok") {
    openPanel();
  }
}

async function handleUnlock() {
  const enteredUser = normalizeAccessUser_(accessUser.value);
  const enteredCode = normalizeAccessCode_(accessCode.value);
  const expectedCode = normalizeAccessCode_(DEMO_ACCESS_CODE);

  if (API_URL) {
    const remoteCheck = await verifyRemoteAccessCode(enteredUser, enteredCode);
    if (remoteCheck.authorized) {
      gateNotice.classList.add("hidden");
      sessionStorage.setItem("hiring_room_employer_auth", "ok");
      openPanel();
      return;
    }

    gateNotice.textContent = remoteCheck.reachable
      ? "Usuario o clave incorrectos. Revisa la hoja config en Excel."
      : "No se pudo validar con backend. Revisa Apps Script/API.";
    gateNotice.classList.remove("hidden");
    return;
  }

  if (enteredCode !== expectedCode) {
    gateNotice.classList.remove("hidden");
    return;
  }

  gateNotice.classList.add("hidden");
  sessionStorage.setItem("hiring_room_employer_auth", "ok");
  openPanel();
}

function normalizeAccessUser_(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

function normalizeAccessCode_(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

async function verifyRemoteAccessCode(user, code) {
  if (!API_URL || !code) {
    return { authorized: false, reachable: false };
  }

  try {
    const payload = encodeFormPayload({
      action: "verifyEmployerAccess",
      user: user,
      code: code
    });
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: payload
    });
    const data = await response.json();
    return {
      authorized: Boolean(data && data.ok && data.authorized),
      reachable: Boolean(data && data.ok)
    };
  } catch {
    return { authorized: false, reachable: false };
  }
}

function openPanel() {
  gate.classList.add("hidden");
  panel.classList.remove("hidden");
  renderEmployerList();
  if (!selectedImageData) {
    previewImage.removeAttribute("src");
  }
}

function handleLogout() {
  sessionStorage.removeItem("hiring_room_employer_auth");
  resetEditMode();
  panel.classList.add("hidden");
  gate.classList.remove("hidden");
  accessUser.value = "";
  accessCode.value = "";
  gateNotice.classList.add("hidden");
}

function handleImage(event) {
  const file = event.target.files?.[0];
  if (!file) {
    selectedImageData = "";
    previewImage.removeAttribute("src");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    selectedImageData = String(reader.result || "");
    previewImage.src = selectedImageData;
  };
  reader.readAsDataURL(file);
}

async function saveJob(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const now = new Date().toISOString();
  const selectedFile = imageInput.files?.[0] || null;
  let imageDataToSave = selectedImageData;
  const fallbackDeadline = editingJobSnapshot ? editingJobSnapshot.deadline : "";

  if (selectedFile) {
    try {
      imageDataToSave = await readFileAsDataURL(selectedFile);
      selectedImageData = imageDataToSave;
      previewImage.src = imageDataToSave;
    } catch {
      showNotice("No se pudo leer la imagen seleccionada.", true);
      return;
    }
  }

  const job = {
    id: editingJobId || `job-${Date.now()}`,
    title: String(formData.get("title") || "").trim(),
    region: String(formData.get("region") || "").trim(),
    province: String(formData.get("province") || "").trim(),
    area: normalizeArea_(formData.get("area")),
    education: String(formData.get("education") || "").trim(),
    skills: String(formData.get("skills") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    deadline: normalizeDeadlineValue_(formData.get("deadline") || fallbackDeadline),
    applyUrl: String(formData.get("applyUrl") || "").trim(),
    imageData: imageDataToSave,
    createdAt: now,
    updatedAt: now
  };

  if (!job.title || !job.region || !job.province || !job.area || !job.education || !job.description || !job.deadline || !job.applyUrl) {
    showNotice("Completa los campos obligatorios.", true);
    return;
  }

  if (API_URL) {
    const sent = editingJobId ? await updateRemoteJob(job) : await createRemoteJob(job);
    if (!sent) {
      showNotice("No se pudo guardar en backend. Revisa la URL de Apps Script.", true);
      return;
    }
  } else {
    const jobs = loadLocalJobs();
    if (editingJobId) {
      const index = jobs.findIndex((item) => item.id === editingJobId);
      if (index >= 0) {
        const previous = jobs[index];
        jobs[index] = {
          ...previous,
          ...job,
          createdAt: previous.createdAt || job.createdAt
        };
      }
    } else {
      jobs.push(job);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  }

  const wasEditing = Boolean(editingJobId);
  resetEditMode();
  showNotice(wasEditing ? "Oferta actualizada correctamente." : "Oferta publicada correctamente.", false);
  await renderEmployerList();
}

async function renderEmployerList() {
  const jobs = (await loadJobs())
    .map(normalizeJob)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  populateEmployerFilterOptions(employerRegionFilter, getUniqueValues(jobs, "region"));
  populateEmployerFilterOptions(employerProvinceFilter, mergeValues(ECUADOR_PROVINCES, getUniqueValues(jobs, "province")));
  populateEmployerFilterOptions(employerAreaFilter, AREA_OPTIONS);

  const filtered = jobs.filter((job) => {
    if (employerRegionFilter.value !== "all" && job.region !== employerRegionFilter.value) {
      return false;
    }
    if (employerProvinceFilter.value !== "all" && job.province !== employerProvinceFilter.value) {
      return false;
    }
    if (employerAreaFilter.value !== "all" && job.area !== employerAreaFilter.value) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    employerJobList.innerHTML = "<p>No hay ofertas aun.</p>";
    return;
  }

  employerJobList.innerHTML = filtered
    .map((job) => `
      <article class="job-list__item">
        <div>
          <strong>${escapeHtml(job.title)}</strong>
          <div>${escapeHtml(job.region)} · ${escapeHtml(job.province || "Sin provincia")} · ${escapeHtml(job.area)}</div>
        </div>
        <div class="job-list__actions">
          <button type="button" class="secondary-btn" data-edit-id="${escapeHtml(job.id)}">Editar</button>
          <button type="button" class="ghost-btn" data-id="${escapeHtml(job.id)}">Eliminar</button>
        </div>
      </article>
    `)
    .join("");

  employerJobList.querySelectorAll("button[data-edit-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await startEdit(button.dataset.editId);
    });
  });

  employerJobList.querySelectorAll("button[data-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await removeJob(button.dataset.id);
    });
  });
}

function populateEmployerFilterOptions(select, values) {
  const current = select.value || "all";
  const firstOption = select.querySelector("option")?.outerHTML || "<option value=\"all\">Todas</option>";
  select.innerHTML = firstOption + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");

  if (["all", ...values].includes(current)) {
    select.value = current;
  } else {
    select.value = "all";
  }
}

function getUniqueValues(jobs, field) {
  return [...new Set(jobs.map((job) => job[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

async function startEdit(id) {
  const jobs = await loadJobs();
  const job = jobs.find((item) => String(item.id) === String(id));

  if (!job) {
    showNotice("No se encontro la oferta para editar.", true);
    return;
  }

  editingJobId = job.id;
  form.elements.title.value = job.title || "";
  form.elements.region.value = job.region || "";
  form.elements.province.value = job.province || "";
  const normalizedArea = normalizeArea_(job.area);
  ensureSelectHasOption_(form.elements.area, normalizedArea);
  form.elements.area.value = normalizedArea;
  form.elements.education.value = job.education || "";
  form.elements.skills.value = job.skills || "";
  form.elements.description.value = job.description || "";
  const normalizedDeadline = normalizeDeadlineValue_(job.deadline);
  form.elements.deadline.value = normalizedDeadline;
  form.elements.applyUrl.value = job.applyUrl || "";
  editingJobSnapshot = {
    ...job,
    deadline: normalizedDeadline
  };

  selectedImageData = job.imageData || "";
  if (selectedImageData) {
    previewImage.src = selectedImageData;
  } else {
    previewImage.removeAttribute("src");
  }

  submitJobBtn.textContent = "Guardar cambios";
  cancelEditBtn.classList.remove("hidden");
  showNotice("Editando oferta seleccionada.", false);
}

function resetEditMode() {
  editingJobId = null;
  editingJobSnapshot = null;
  form.reset();
  selectedImageData = "";
  previewImage.removeAttribute("src");
  submitJobBtn.textContent = "Enviar oferta";
  cancelEditBtn.classList.add("hidden");
}

async function removeJob(id) {
  if (API_URL) {
    const removed = await deleteRemoteJob(id);
    if (!removed) {
      showNotice("No se pudo eliminar en backend.", true);
      return;
    }
  } else {
    const jobs = loadLocalJobs();
    const updated = jobs.filter((job) => job.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  await renderEmployerList();
  showNotice("Oferta eliminada.", false);
}

async function loadJobs() {
  if (API_URL) {
    try {
      const response = await fetch(`${API_URL}?action=listJobs`, {
        method: "GET"
      });
      const data = await response.json();
      if (data && data.ok && Array.isArray(data.jobs)) {
        return data.jobs.map(normalizeJob);
      }
    } catch {
      return [];
    }
    return [];
  }

  return loadLocalJobs();
}

function loadLocalJobs() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeJob) : [];
  } catch {
    return [];
  }
}

function populateProvinceInputOptions() {
  const firstOption = provinceInput.querySelector("option")?.outerHTML || "<option value=\"\">Selecciona</option>";
  provinceInput.innerHTML = firstOption + ECUADOR_PROVINCES.map((province) => `
    <option value="${escapeHtml(province)}">${escapeHtml(province)}</option>
  `).join("");
}

async function createRemoteJob(job) {
  try {
    const payload = encodeFormPayload({ action: "createJob", job: job });
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: payload
    });

    const data = await response.json();
    return Boolean(data && data.ok);
  } catch {
    return false;
  }
}

async function updateRemoteJob(job) {
  try {
    const payload = encodeFormPayload({ action: "updateJob", job: job });
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: payload
    });

    const data = await response.json();
    return Boolean(data && data.ok);
  } catch {
    return false;
  }
}

async function deleteRemoteJob(id) {
  try {
    const payload = encodeFormPayload({ action: "deleteJob", id: id });
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: payload
    });
    const data = await response.json();
    return Boolean(data && data.ok);
  } catch {
    return false;
  }
}

function encodeFormPayload(value) {
  return `payload=${encodeURIComponent(JSON.stringify(value))}`;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

function normalizeJob(job) {
  return {
    ...job,
    province: String(job.province || job.region || "").trim(),
    area: normalizeArea_(job.area),
    deadline: normalizeDeadlineValue_(job.deadline)
  };
}

function normalizeDeadlineValue_(value) {
  const clean = String(value || "").trim();
  if (!clean) {
    return "";
  }

  const ymd = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  }

  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeArea_(value) {
  const clean = String(value || "").trim();
  if (!clean) {
    return "";
  }

  const lower = clean.toLowerCase();
  if (lower === "finanzas" || lower === "tiendas" || lower === "tienda" || lower === "ventas") {
    return "Tienda";
  }

  if (lower === "logistica") {
    return "Logistica";
  }

  if (lower === "administracion" || lower === "tecnologia" || lower === "recursos humanos") {
    return "Administracion";
  }

  return "Administracion";
}

function sanitizeAreaInputOptions() {
  const areaSelect = form?.elements?.area;
  if (!areaSelect || !areaSelect.options) {
    return;
  }

  const seen = new Set();
  const normalizedOptions = [];
  Array.from(areaSelect.options).forEach((option) => {
    const raw = String(option.value || option.textContent || "").trim();
    if (!raw) {
      normalizedOptions.push({ value: "", label: option.textContent || "Selecciona" });
      return;
    }

    const normalized = normalizeArea_(raw);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    normalizedOptions.push({ value: normalized, label: normalized });
  });

  AREA_OPTIONS.forEach((area) => {
    if (seen.has(area)) {
      return;
    }
    seen.add(area);
    normalizedOptions.push({ value: area, label: area });
  });

  areaSelect.innerHTML = normalizedOptions
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
}

function ensureSelectHasOption_(select, value) {
  const normalized = normalizeArea_(value);
  if (!select || !normalized) {
    return;
  }

  const exists = Array.from(select.options || []).some((option) => option.value === normalized);
  if (exists) {
    return;
  }

  const option = document.createElement("option");
  option.value = normalized;
  option.textContent = normalized;
  select.appendChild(option);
}

function mergeValues(first, second) {
  return [...new Set([...(first || []), ...(second || [])].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function showNotice(message, isError) {
  formNotice.textContent = message;
  formNotice.classList.remove("hidden", "notice--ok", "notice--error");
  formNotice.classList.add(isError ? "notice--error" : "notice--ok");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
