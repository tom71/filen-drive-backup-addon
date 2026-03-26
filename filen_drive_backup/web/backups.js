const listEl = document.getElementById("backup-list");
const metaEl = document.getElementById("meta");
const reloadButton = document.getElementById("reload");
const overviewEl = document.getElementById("overview");
const statusTextEl = document.getElementById("status-text");

reloadButton.addEventListener("click", () => {
  loadBackups().catch((error) => {
    renderError(error.message);
  });
});

loadBackups().catch((error) => {
  renderError(error.message);
});

async function loadBackups() {
  listEl.innerHTML = "";
  metaEl.textContent = "Lade Backups ...";
  overviewEl.innerHTML = "";
  statusTextEl.className = "hint";
  statusTextEl.textContent = "Lade Status ...";

  const response = await fetch("api/backups");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Backups konnten nicht geladen werden.");
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  const note = payload.note ? String(payload.note) : "";
  const provider = String(payload.provider || "-");
  const baseDirectory = payload.baseDirectory ? String(payload.baseDirectory) : "";
  const baseDir = baseDirectory ? `, Verzeichnis: ${baseDirectory}` : "";
  const overview = payload.overview && typeof payload.overview === "object" ? payload.overview : null;
  const storage = payload.storage && typeof payload.storage === "object" ? payload.storage : null;

  metaEl.textContent = `Provider: ${provider}${baseDir}`;
  renderOverview(provider, overview, storage, baseDirectory);
  setStatus(note, storage);

  if (note) {
    const info = document.createElement("p");
    info.className = "hint";
    info.textContent = note;
    listEl.appendChild(info);
  }

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Keine Backups gefunden.";
    listEl.appendChild(empty);
    return;
  }

  for (const item of items) {
    const node = document.createElement("article");
    node.className = "item";

    const name = document.createElement("strong");
    name.textContent = item.name;

    const details = document.createElement("span");
    details.textContent = `${formatSize(item.sizeBytes)} • ${new Date(item.modifiedAt).toLocaleString("de-DE")}`;

    const remotePath = document.createElement("small");
    remotePath.className = "item-path";
    remotePath.textContent = item.path ? String(item.path) : "";

    node.appendChild(name);
    node.appendChild(details);
    if (remotePath.textContent) {
      node.appendChild(remotePath);
    }
    listEl.appendChild(node);
  }
}

function renderOverview(provider, overview, storage, baseDirectory) {
  const totalCount = Number(overview?.totalCount || 0);
  const totalSizeBytes = Number(overview?.totalSizeBytes || 0);
  const newestModifiedAt = overview?.newestModifiedAt ? new Date(overview.newestModifiedAt) : null;

  overviewEl.innerHTML = "";

  const cards = [
    {
      label: "Backups",
      value: `${totalCount}`,
      detail: `Gesamtgroesse ${formatSize(totalSizeBytes)}`,
    },
    {
      label: "Speicherort",
      value: provider === "filen" ? "Filen" : "Lokal",
      detail: baseDirectory || (provider === "filen" ? "/Home Assistant Backups" : "Lokales Verzeichnis"),
    },
    {
      label: "Letztes Backup",
      value: newestModifiedAt ? formatRelativeTime(newestModifiedAt) : "-",
      detail: newestModifiedAt ? newestModifiedAt.toLocaleString("de-DE") : "Noch kein Backup gefunden",
    },
  ];

  if (storage && Number.isFinite(Number(storage.availableBytes))) {
    cards.push({
      label: "Verfuegbar",
      value: formatSize(Number(storage.availableBytes || 0)),
      detail: Number.isFinite(Number(storage.capacityBytes))
        ? `Kapazitaet ${formatSize(Number(storage.capacityBytes || 0))}`
        : "",
    });
  }

  for (const card of cards) {
    const article = document.createElement("article");
    article.className = "stat-card";

    const label = document.createElement("p");
    label.className = "stat-label";
    label.textContent = card.label;

    const value = document.createElement("strong");
    value.className = "stat-value";
    value.textContent = card.value;

    const detail = document.createElement("span");
    detail.className = "stat-detail";
    detail.textContent = card.detail;

    article.appendChild(label);
    article.appendChild(value);
    if (card.detail) {
      article.appendChild(detail);
    }

    overviewEl.appendChild(article);
  }
}

function setStatus(note, storage) {
  if (note) {
    statusTextEl.className = "bad";
    statusTextEl.textContent = note;
    return;
  }

  if (!storage || !Number.isFinite(Number(storage.availableBytes)) || !Number.isFinite(Number(storage.capacityBytes))) {
    statusTextEl.className = "good";
    statusTextEl.textContent = "Synchronisierung aktiv. Keine kritischen Hinweise.";
    return;
  }

  const available = Number(storage.availableBytes);
  const capacity = Number(storage.capacityBytes);
  const ratio = capacity > 0 ? available / capacity : 1;

  if (ratio <= 0.1) {
    statusTextEl.className = "bad";
    statusTextEl.textContent = `Achtung: Speicher fast voll (${formatSize(available)} verfuegbar).`;
    return;
  }

  statusTextEl.className = "good";
  statusTextEl.textContent = `Speicher in Ordnung (${formatSize(available)} verfuegbar).`;
}

function formatSize(sizeBytes) {
  if (typeof sizeBytes !== "number" || Number.isNaN(sizeBytes)) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = sizeBytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function renderError(message) {
  listEl.innerHTML = "";
  overviewEl.innerHTML = "";
  metaEl.textContent = "Fehler";
  statusTextEl.className = "bad";
  statusTextEl.textContent = message;

  const error = document.createElement("p");
  error.className = "bad";
  error.textContent = message;

  listEl.appendChild(error);
}

function formatRelativeTime(date) {
  const deltaMs = Date.now() - date.getTime();

  if (deltaMs < 60 * 1000) {
    return "gerade eben";
  }

  const minutes = Math.floor(deltaMs / (60 * 1000));
  if (minutes < 60) {
    return `vor ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `vor ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  return `vor ${days} d`;
}
