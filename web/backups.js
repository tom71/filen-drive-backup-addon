const listEl = document.getElementById("backup-list");
const metaEl = document.getElementById("meta");
const reloadButton = document.getElementById("reload");

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

  const response = await fetch("/api/backups");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Backups konnten nicht geladen werden.");
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  const note = payload.note ? String(payload.note) : "";
  const provider = String(payload.provider || "-");
  const baseDir = payload.baseDirectory ? `, Verzeichnis: ${payload.baseDirectory}` : "";

  metaEl.textContent = `Provider: ${provider}${baseDir}`;

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

    node.appendChild(name);
    node.appendChild(details);
    listEl.appendChild(node);
  }
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
  metaEl.textContent = "Fehler";

  const error = document.createElement("p");
  error.className = "bad";
  error.textContent = message;

  listEl.appendChild(error);
}
