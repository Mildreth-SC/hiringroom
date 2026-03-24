const STORAGE_KEY = "hiring_room_jobs_v1";
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

const seedJobs = [
  {
    id: "seed-1",
    title: "Asistente de tienda",
    region: "Guayas",
    province: "Guayas",
    area: "Ventas",
    education: "Bachiller",
    skills: "Servicio al cliente, caja",
    description: "Atiende clientes, organiza productos y apoya en cajas durante turnos rotativos.",
    deadline: "2026-04-20",
    applyUrl: "https://forms.gle/ejemplo1",
    createdAt: "2026-03-18T10:10:00.000Z",
    imageData: ""
  },
  {
    id: "seed-2",
    title: "Analista de compras",
    region: "Pichincha",
    province: "Pichincha",
    area: "Administracion",
    education: "Universitario",
    skills: "Excel, negociacion",
    description: "Gestiona proveedores y reportes de compras con enfoque en costos y abastecimiento.",
    deadline: "2026-04-10",
    applyUrl: "https://forms.gle/ejemplo2",
    createdAt: "2026-03-20T14:30:00.000Z",
    imageData: ""
  },
  {
    id: "seed-3",
    title: "Supervisor de bodega",
    region: "Azuay",
    province: "Azuay",
    area: "Logistica",
    education: "Tecnico",
    skills: "Inventario, liderazgo",
    description: "Coordina recepcion, almacenamiento y despacho de mercaderia en centro de distribucion.",
    deadline: "2026-04-25",
    applyUrl: "https://forms.gle/ejemplo3",
    createdAt: "2026-03-17T09:00:00.000Z",
    imageData: ""
  }
];

const provinceFilter = document.getElementById("provinceFilter");
const areaFilter = document.getElementById("areaFilter");
const recentFilter = document.getElementById("recentFilter");
const jobGrid = document.getElementById("jobGrid");
const emptyState = document.getElementById("emptyState");
const resultCount = document.getElementById("resultCount");
const jobModal = document.getElementById("jobModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalJobHeader = document.getElementById("modalJobHeader");
const modalJobImage = document.getElementById("modalJobImage");
const modalJobDescription = document.getElementById("modalJobDescription");
const modalJobMeta = document.getElementById("modalJobMeta");
const modalJobSkills = document.getElementById("modalJobSkills");
const postularLink = document.getElementById("postularLink");
const postularHint = document.getElementById("postularHint");
const imagePreviewModal = document.getElementById("imagePreviewModal");
const imagePreviewElement = document.getElementById("imagePreviewElement");
const closeImagePreviewBtn = document.getElementById("closeImagePreviewBtn");

let jobs = [];

init();

async function init() {
  jobs = await loadJobs();
  populateSelect(provinceFilter, mergeValues(ECUADOR_PROVINCES, getUniqueValues("province")));
  populateSelect(areaFilter, getUniqueValues("area"));

  provinceFilter.addEventListener("change", render);
  areaFilter.addEventListener("change", render);
  recentFilter.addEventListener("change", render);

  window.addEventListener("storage", (event) => {
    if (!API_URL && event.key === STORAGE_KEY) {
      jobs = loadLocalJobs();
      populateSelect(provinceFilter, mergeValues(ECUADOR_PROVINCES, getUniqueValues("province")));
      populateSelect(areaFilter, getUniqueValues("area"));
      render();
    }
  });

  closeModalBtn.addEventListener("click", closeModal);
  jobModal.addEventListener("click", (event) => {
    if (event.target === jobModal) {
      closeModal();
    }
  });
  modalJobImage.addEventListener("click", () => {
    if (modalJobImage.src) {
      openImagePreview(modalJobImage.src);
    }
  });
  closeImagePreviewBtn.addEventListener("click", closeImagePreview);
  imagePreviewModal.addEventListener("click", (event) => {
    if (event.target === imagePreviewModal) {
      closeImagePreview();
    }
  });

  render();
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
      // If remote fails, keep local demo data as fallback.
    }
  }

  return loadLocalJobs();
}

function loadLocalJobs() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedJobs));
    return [...seedJobs];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("Formato invalido");
    }

    return parsed.map(normalizeJob);
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedJobs));
      return [...seedJobs];
  }
}

function getUniqueValues(field) {
  return [...new Set(jobs.map((job) => job[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function populateSelect(select, values) {
  const current = select.value;
  const firstOption = select.querySelector("option")?.outerHTML || "<option value=\"all\">Todas</option>";
  select.innerHTML = firstOption + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");

  if (["all", ...values].includes(current)) {
    select.value = current;
  }
}

function render() {
  const filtered = applyFilters(jobs)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  resultCount.textContent = `${filtered.length} oferta${filtered.length === 1 ? "" : "s"}`;
  emptyState.hidden = filtered.length > 0;

  jobGrid.innerHTML = filtered.map((job, index) => buildCard(job, index)).join("");
  jobGrid.querySelectorAll("button[data-job-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openJobModal(button.dataset.jobId || "");
    });
  });
  jobGrid.querySelectorAll("img[data-job-image-id]").forEach((image) => {
    setupImageFallback(image, image.getAttribute("src"));
    image.addEventListener("click", () => {
      openJobModal(image.dataset.jobImageId || "");
    });
  });
}

function applyFilters(list) {
  const province = provinceFilter.value;
  const area = areaFilter.value;
  const recentDays = recentFilter.value;

  return list.filter((job) => {
    if (area !== "all" && job.area !== area) {
      return false;
    }

    if (province !== "all" && job.province !== province) {
      return false;
    }

    if (recentDays !== "all") {
      const created = new Date(job.createdAt || 0);
      const limit = new Date();
      limit.setDate(limit.getDate() - Number(recentDays));
      if (created < limit) {
        return false;
      }
    }

    return true;
  });
}

function buildCard(job, index) {
  const imageSource = getImageSources(job.imageData)[0] || "";
  const provinceLabel = job.province || "Sin provincia";
  const image = imageSource
    ? `<img class="job-card__image" src="${imageSource}" alt="Imagen de ${escapeHtml(job.title)}" data-job-image-id="${escapeHtml(job.id)}">`
    : '<div class="job-card__fallback" aria-hidden="true"></div>';

  return `
    <article class="job-card" style="animation-delay:${Math.min(index * 70, 280)}ms">
      ${image}
      <div class="job-card__body">
        <h3>${escapeHtml(job.title)}</h3>
        <p class="meta">${escapeHtml(provinceLabel)} · ${escapeHtml(job.area)}</p>
        <p class="job-card__desc">${escapeHtml(job.description || "Sin descripcion")}</p>
        <div class="badges">
          <span class="badge">Limite: ${formatDate(job.deadline)}</span>
          <span class="badge">Publicado: ${daysAgo(job.createdAt)}</span>
        </div>
        <div class="job-card__actions">
          <button class="text-btn" type="button" data-job-id="${escapeHtml(job.id)}">Ver y postular</button>
        </div>
      </div>
    </article>
  `;
}

function openJobModal(jobId) {
  const job = jobs.find((item) => String(item.id) === String(jobId));

  if (!job) {
    return;
  }

  const provinceLabel = job.province || "Sin provincia";
  modalJobHeader.innerHTML = `<h2>${escapeHtml(job.title)}</h2><p class="meta">${escapeHtml(provinceLabel)} · ${escapeHtml(job.area)}</p>`;
  if (job.imageData) {
    const imageSource = getImageSources(job.imageData)[0] || "";
    modalJobImage.src = imageSource;
    setupImageFallback(modalJobImage, imageSource);
    modalJobImage.hidden = false;
  } else {
    modalJobImage.removeAttribute("src");
    modalJobImage.onerror = null;
    modalJobImage.hidden = true;
  }

  modalJobDescription.textContent = job.description || "Sin descripcion.";
  modalJobMeta.innerHTML = [
    `Educacion: ${escapeHtml(job.education || "No especificada")}`,
    `Limite de postulacion: ${escapeHtml(formatDate(job.deadline))}`
  ].map((line) => `<li>${line}</li>`).join("");
  modalJobSkills.textContent = formatSkills(job.skills || "No especificadas");

  const applyUrl = String(job.applyUrl || "").trim();
  if (applyUrl) {
    postularLink.href = applyUrl;
    postularLink.classList.remove("hidden");
    postularHint.classList.add("hidden");
  } else {
    postularLink.href = "#";
    postularLink.classList.add("hidden");
    postularHint.classList.remove("hidden");
  }

  if (typeof jobModal.showModal === "function") {
    jobModal.showModal();
  }
}

function closeModal() {
  if (typeof jobModal.close === "function") {
    jobModal.close();
  }
}

function openImagePreview(src) {
  imagePreviewElement.src = src;
  if (typeof imagePreviewModal.showModal === "function") {
    imagePreviewModal.showModal();
  }
}

function closeImagePreview() {
  if (typeof imagePreviewModal.close === "function") {
    imagePreviewModal.close();
  }
}

function setupImageFallback(imageElement, source) {
  const candidates = getImageSources(source);
  if (candidates.length === 0) {
    imageElement.onerror = null;
    return;
  }

  let currentIndex = 0;
  imageElement.onerror = () => {
    currentIndex += 1;
    if (currentIndex >= candidates.length) {
      imageElement.onerror = null;
      return;
    }
    imageElement.src = candidates[currentIndex];
  };
}

function getImageSources(value) {
  const clean = String(value || "").trim();
  if (!clean) {
    return [];
  }

  const fileId = extractDriveFileId(clean);
  const candidates = [clean];

  if (fileId) {
    candidates.push(`https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`);
    candidates.push(`https://drive.google.com/uc?export=download&id=${fileId}`);
    candidates.push(`https://lh3.googleusercontent.com/d/${fileId}`);
  }

  return [...new Set(candidates)];
}

function extractDriveFileId(url) {
  const fromQuery = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fromQuery && fromQuery[1]) {
    return fromQuery[1];
  }

  const fromPath = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fromPath && fromPath[1]) {
    return fromPath[1];
  }

  return "";
}

function normalizeJob(job) {
  const normalized = {
    ...job
  };

  normalized.province = String(job.province || job.region || "").trim();
  return normalized;
}

function mergeValues(first, second) {
  return [...new Set([...(first || []), ...(second || [])].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function formatDate(value) {
  if (!value) {
    return "No definida";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "No definida";
  }

  return date.toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function daysAgo(isoDate) {
  const date = new Date(isoDate || 0);
  if (Number.isNaN(date.getTime())) {
    return "hoy";
  }

  const diff = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));

  if (diff === 0) {
    return "hoy";
  }

  return `hace ${diff} dia${diff === 1 ? "" : "s"}`;
}

function formatSkills(value) {
  return String(value)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
