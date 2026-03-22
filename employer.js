const STORAGE_KEY = "hiring_room_jobs_v1";
const DEMO_ACCESS_CODE = "empleador2026";
const API_URL = (window.HIRING_API_URL || "").trim();

const gate = document.getElementById("gate");
const panel = document.getElementById("employerPanel");
const unlockBtn = document.getElementById("unlockBtn");
const logoutBtn = document.getElementById("logoutBtn");
const accessCode = document.getElementById("accessCode");
const gateNotice = document.getElementById("gateNotice");

const form = document.getElementById("jobForm");
const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const formNotice = document.getElementById("formNotice");
const employerJobList = document.getElementById("employerJobList");
const submitJobBtn = document.getElementById("submitJobBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const employerRegionFilter = document.getElementById("employerRegionFilter");
const employerAreaFilter = document.getElementById("employerAreaFilter");

let selectedImageData = "";
let editingJobId = null;

init();

function init() {
  unlockBtn.addEventListener("click", handleUnlock);
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
  employerAreaFilter.addEventListener("change", renderEmployerList);

  if (sessionStorage.getItem("hiring_room_employer_auth") === "ok") {
    openPanel();
  }
}

async function handleUnlock() {
  const enteredCode = normalizeAccessCode_(accessCode.value);
  const expectedCode = normalizeAccessCode_(DEMO_ACCESS_CODE);

  if (API_URL) {
    const remoteCheck = await verifyRemoteAccessCode(enteredCode);
    if (remoteCheck.authorized) {
      gateNotice.classList.add("hidden");
      sessionStorage.setItem("hiring_room_employer_auth", "ok");
      openPanel();
      return;
    }

    gateNotice.textContent = remoteCheck.reachable
      ? "Clave incorrecta. Revisa la hoja config en Excel."
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

function normalizeAccessCode_(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

async function verifyRemoteAccessCode(code) {
  if (!API_URL || !code) {
    return { authorized: false, reachable: false };
  }

  try {
    const payload = encodeFormPayload({
      action: "verifyEmployerAccess",
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
    area: String(formData.get("area") || "").trim(),
    education: String(formData.get("education") || "").trim(),
    skills: String(formData.get("skills") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    deadline: String(formData.get("deadline") || "").trim(),
    applyUrl: String(formData.get("applyUrl") || "").trim(),
    imageData: imageDataToSave,
    createdAt: now,
    updatedAt: now
  };

  if (!job.title || !job.region || !job.area || !job.education || !job.description || !job.deadline || !job.applyUrl) {
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
  const jobs = (await loadJobs()).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  populateEmployerFilterOptions(employerRegionFilter, getUniqueValues(jobs, "region"));
  populateEmployerFilterOptions(employerAreaFilter, getUniqueValues(jobs, "area"));

  const filtered = jobs.filter((job) => {
    if (employerRegionFilter.value !== "all" && job.region !== employerRegionFilter.value) {
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
          <div>${escapeHtml(job.region)} · ${escapeHtml(job.area)}</div>
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
  form.elements.area.value = job.area || "";
  form.elements.education.value = job.education || "";
  form.elements.skills.value = job.skills || "";
  form.elements.description.value = job.description || "";
  form.elements.deadline.value = job.deadline || "";
  form.elements.applyUrl.value = job.applyUrl || "";

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
        return data.jobs;
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
