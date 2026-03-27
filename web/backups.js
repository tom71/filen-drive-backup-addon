const listEl = document.getElementById("backup-list");
const metaEl = document.getElementById("meta");
const reloadButton = document.getElementById("reload");
const overviewEl = document.getElementById("overview");
const statusTextEl = document.getElementById("status-text");
const backupNowBtn = document.getElementById("backup-now");
const backupNowStatusEl = document.getElementById("backup-now-status");
const schedulerModeEl = document.getElementById("scheduler-mode");
const schedulerNextEl = document.getElementById("scheduler-next");
const schedulerLastEl = document.getElementById("scheduler-last");
const restoreTargetEl = document.getElementById("restore-target");
const restoreDirectoryEl = document.getElementById("restore-directory");
const restorePreviewBtn = document.getElementById("restore-preview");
const restoreRunBtn = document.getElementById("restore-run");
const restoreSelectableEl = document.getElementById("restore-selectable");
const restorePreviewOutputEl = document.getElementById("restore-preview-output");
const restoreStatusEl = document.getElementById("restore-status");
const fileActionStatusEl = document.getElementById("file-action-status");

let backupNowPollInterval = null;
let schedulerPollInterval = null;
let restorePollInterval = null;
let backupItems = [];

backupNowBtn.addEventListener("click", async () => {
  backupNowBtn.disabled = true;
  backupNowStatusEl.className = "backup-now-status running";
  backupNowStatusEl.textContent = "Backup wird gestartet ...";

  try {
    const res = await fetch("api/backup-now", { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 409) {
        backupNowStatusEl.textContent = "Backup laeuft bereits ...";
        startBackupNowPolling();
        return;
      }

      backupNowStatusEl.className = "backup-now-status error";
      backupNowStatusEl.textContent = "Fehler: " + (data.error || "Backup konnte nicht gestartet werden.");
      backupNowBtn.disabled = false;
      return;
    }

    backupNowStatusEl.textContent = "Backup laeuft ...";
    startBackupNowPolling();
  } catch (error) {
    backupNowStatusEl.className = "backup-now-status error";
    backupNowStatusEl.textContent = "Netzwerkfehler: " + error.message;
    backupNowBtn.disabled = false;
  }
});

restorePreviewBtn.addEventListener("click", async () => {
  const backupLocation = getSelectedRestoreLocation();

  if (!backupLocation) {
    restorePreviewOutputEl.textContent = "Bitte zuerst ein Backup auswaehlen.";
    return;
  }

  restorePreviewBtn.disabled = true;
  restorePreviewOutputEl.textContent = "Lade Inhaltsvorschau ...";

  try {
    const res = await fetch("api/restore-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backupLocation, maxEntries: 120 }),
    });
    const data = await res.json();

    if (!res.ok) {
      restorePreviewOutputEl.textContent = data.error || "Vorschau konnte nicht geladen werden.";
      return;
    }

    renderRestoreSelectableEntries(data.selectableEntries);
    restorePreviewOutputEl.textContent = renderRestorePreview(data);
  } catch (error) {
    restorePreviewOutputEl.textContent = "Netzwerkfehler: " + error.message;
  } finally {
    restorePreviewBtn.disabled = false;
  }
});
const restoreFullCheckbox = document.getElementById("restore-full-checkbox");

restoreRunBtn.addEventListener("click", async () => {
  const backupLocation = getSelectedRestoreLocation();

  if (!backupLocation) {
    setRestoreStatus("error", "Bitte zuerst ein Backup auswaehlen.");
    return;
  }

  restoreRunBtn.disabled = true;
  restorePreviewBtn.disabled = true;
  setRestoreStatus("running", "Restore wird gestartet ...");

  try {
    const restoreDirectory = String(restoreDirectoryEl.value || "").trim();
    let selectedEntries = getSelectedRestoreEntries();
    // Wenn Full-Checkbox aktiv, keine Einzelauswahl übergeben
    if (restoreFullCheckbox && restoreFullCheckbox.checked) {
      selectedEntries = undefined;
    }
    const res = await fetch("api/restore-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backupLocation, restoreDirectory, selectedEntries }),
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 409) {
        setRestoreStatus("running", "Restore laeuft bereits ...");
        startRestorePolling();
        return;
      }

      setRestoreStatus("error", data.error || "Restore konnte nicht gestartet werden.");
      restoreRunBtn.disabled = false;
      restorePreviewBtn.disabled = false;
      return;
    }

    setRestoreStatus("running", "Restore laeuft ...");
    startRestorePolling();
  } catch (error) {
    setRestoreStatus("error", "Netzwerkfehler: " + error.message);
    restoreRunBtn.disabled = false;
    restorePreviewBtn.disabled = false;
  }
});

reloadButton.addEventListener("click", () => {
  loadBackups().catch((error) => {
    renderError(error.message);
  });
});

loadBackups().catch((error) => {
  renderError(error.message);
});
loadSchedulerStatus().catch(() => {});
startSchedulerPolling();
bootstrapRunningStates().catch(() => {});

async function bootstrapRunningStates() {
  try {
    const backupRes = await fetch("api/backup-status");
    const backupStatus = await backupRes.json();
    if (backupStatus.status === "running") {
      backupNowBtn.disabled = true;
      backupNowStatusEl.className = "backup-now-status running";
      backupNowStatusEl.textContent = "Backup laeuft ...";
      startBackupNowPolling();
    }
  } catch {
    // ignore
  }

  try {
    const restoreRes = await fetch("api/restore-status");
    const restoreStatus = await restoreRes.json();
    if (restoreStatus.status === "running") {
      restoreRunBtn.disabled = true;
      restorePreviewBtn.disabled = true;
      setRestoreStatus("running", "Restore laeuft ...");
      startRestorePolling();
    }
  } catch {
    // ignore
  }
}

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
  backupItems = items;
  const note = payload.note ? String(payload.note) : "";
  const provider = String(payload.provider || "-");
  const baseDirectory = payload.baseDirectory ? String(payload.baseDirectory) : "";
  const baseDir = baseDirectory ? `, Verzeichnis: ${baseDirectory}` : "";
  const overview = payload.overview && typeof payload.overview === "object" ? payload.overview : null;
  const storage = payload.storage && typeof payload.storage === "object" ? payload.storage : null;

  metaEl.textContent = `Provider: ${provider}${baseDir}`;
  renderOverview(provider, overview, storage, baseDirectory);
  setStatus(note, storage);
  renderRestoreTargets(items);

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

    const itemActions = document.createElement("div");
    itemActions.className = "item-actions";

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "btn ghost";
    downloadBtn.textContent = "Download";
    downloadBtn.addEventListener("click", () => {
      const location = getBackupLocation(item);

      if (!location) {
        setFileActionStatus("error", "Fehler: Backup-Pfad fehlt.");
        return;
      }

      setFileActionStatus("running", `Download gestartet: ${item.name}`);
      window.location.href = `api/backup-download?location=${encodeURIComponent(location)}`;
      setTimeout(() => {
        setFileActionStatus("done", `Download angefordert: ${item.name}`);
      }, 400);
    });

    const placeBtn = document.createElement("button");
    placeBtn.type = "button";
    placeBtn.className = "btn ghost";
    placeBtn.textContent = "Nach /backup in HA";
    placeBtn.addEventListener("click", async () => {
      const location = getBackupLocation(item);

      if (!location) {
        setFileActionStatus("error", "Fehler: Backup-Pfad fehlt.");
        return;
      }

      downloadBtn.disabled = true;
      placeBtn.disabled = true;
      setFileActionStatus("running", `Lege Backup in /backup ab: ${item.name}`);

      try {
        const res = await fetch("api/place-backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backupLocation: location }),
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Backup konnte nicht nach /backup gelegt werden.");
        }

        setFileActionStatus(
          "done",
          `In /backup abgelegt: ${data.placedFileName || item.name}${data.placedPath ? `\nPfad: ${data.placedPath}` : ""}`,
        );
      } catch (error) {
        setFileActionStatus("error", error.message || "Unbekannter Fehler beim Platzieren.");
      } finally {
        downloadBtn.disabled = false;
        placeBtn.disabled = false;
      }
    });

    itemActions.appendChild(downloadBtn);
    itemActions.appendChild(placeBtn);
    node.appendChild(itemActions);

    if (remotePath.textContent) {
      node.appendChild(remotePath);
    }
    listEl.appendChild(node);
  }
}

function getBackupLocation(item) {
  if (item && typeof item.path === "string" && item.path.trim().length > 0) {
    return `filen:${item.path}`;
  }

  return "";
}

function setFileActionStatus(kind, message) {
  if (!fileActionStatusEl) {
    return;
  }

  fileActionStatusEl.className = `backup-now-status ${kind}`;
  fileActionStatusEl.textContent = message;
}

function renderRestoreTargets(items) {
  const selected = getSelectedRestoreLocation();
  restoreTargetEl.innerHTML = "";

  if (!Array.isArray(items) || items.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Keine Backups verfuegbar";
    restoreTargetEl.appendChild(option);
    restoreTargetEl.disabled = true;
    restorePreviewBtn.disabled = true;
    restoreRunBtn.disabled = true;
    renderRestoreSelectableEntries([]);
    return;
  }

  restoreTargetEl.disabled = false;
  restorePreviewBtn.disabled = false;
  restoreRunBtn.disabled = false;

  for (const item of items) {
    const location = item.path ? `filen:${item.path}` : item.name;
    const option = document.createElement("option");
    option.value = location;
    option.textContent = `${item.name} (${new Date(item.modifiedAt).toLocaleString("de-DE")})`;
    restoreTargetEl.appendChild(option);
  }

  if (selected) {
    const stillExists = items.some((item) => (item.path ? `filen:${item.path}` : item.name) === selected);
    if (stillExists) {
      restoreTargetEl.value = selected;
    }
  }
}

function getSelectedRestoreLocation() {
  return String(restoreTargetEl.value || "").trim();
}

function getSelectedRestoreEntries() {
  if (!restoreSelectableEl) {
    return [];
  }

  return Array.from(restoreSelectableEl.querySelectorAll('input[type="checkbox"]:checked'))
    .map((checkbox) => String(checkbox.value || "").trim())
    .filter((entry) => entry.length > 0);
}

function renderRestoreSelectableEntries(entries) {
  if (!restoreSelectableEl) {
    return;
  }

  const validEntries = Array.isArray(entries) ? entries.filter((entry) => typeof entry === "string" && entry.trim().length > 0) : [];

  restoreSelectableEl.innerHTML = "";

  if (validEntries.length === 0) {
    restoreSelectableEl.className = "restore-selectable hidden";
    return;
  }

  restoreSelectableEl.className = "restore-selectable";

  const title = document.createElement("p");
  title.className = "hint";
  title.textContent = "Optional: einzelne Bereiche auswaehlen. Ohne Auswahl wird das komplette Backup wiederhergestellt.";

  const grid = document.createElement("div");
  grid.className = "restore-selectable-grid";

  for (const entry of validEntries) {
    const label = document.createElement("label");
    label.className = "restore-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = entry;

    const text = document.createElement("span");
    text.textContent = entry;

    label.appendChild(checkbox);
    label.appendChild(text);
    grid.appendChild(label);
  }

  restoreSelectableEl.appendChild(title);
  restoreSelectableEl.appendChild(grid);
}

async function loadSchedulerStatus() {
  const response = await fetch("api/scheduler-status");
  const payload = await response.json();

  if (!response.ok) {
    schedulerModeEl.textContent = "Fehler";
    schedulerNextEl.textContent = payload.error || "Status nicht verfuegbar";
    schedulerLastEl.textContent = "-";
    return;
  }

  const enabled = Boolean(payload.enabled);
  const intervalDays = Number(payload.intervalDays || 0);
  const timeOfDay = String(payload.timeOfDay || "");
  const nextRunAt = payload.nextRunAt ? new Date(payload.nextRunAt) : null;
  const lastRunStartedAt = payload.lastRunStartedAt ? new Date(payload.lastRunStartedAt) : null;
  const lastRunFinishedAt = payload.lastRunFinishedAt ? new Date(payload.lastRunFinishedAt) : null;
  const lastRunStatus = String(payload.lastRunStatus || "idle");
  const lastError = String(payload.lastError || "");

  schedulerModeEl.textContent = enabled
    ? `Aktiv (alle ${intervalDays} Tag(e) um ${timeOfDay})`
    : "Deaktiviert (days_between_backups/backup_time_of_day setzen)";
  schedulerNextEl.textContent = nextRunAt ? nextRunAt.toLocaleString("de-DE") : "-";

  if (!lastRunStartedAt) {
    schedulerLastEl.textContent = "Noch kein Lauf";
    return;
  }

  const finished = lastRunFinishedAt ? `, beendet ${lastRunFinishedAt.toLocaleString("de-DE")}` : "";
  const error = lastRunStatus === "error" && lastError ? `, Fehler: ${lastError}` : "";
  schedulerLastEl.textContent = `${lastRunStatus} seit ${lastRunStartedAt.toLocaleString("de-DE")}${finished}${error}`;
}

function startSchedulerPolling() {
  if (schedulerPollInterval) {
    clearInterval(schedulerPollInterval);
  }

  schedulerPollInterval = setInterval(() => {
    loadSchedulerStatus().catch(() => {});
  }, 30000);
}

function startBackupNowPolling() {
  if (backupNowPollInterval) {
    clearInterval(backupNowPollInterval);
  }

  backupNowPollInterval = setInterval(async () => {
    try {
      const res = await fetch("api/backup-status");
      const data = await res.json();

      if (data.status === "running") {
        const elapsed = Math.round((Date.now() - new Date(data.startedAt).getTime()) / 1000);
        backupNowStatusEl.className = "backup-now-status running";
        backupNowStatusEl.textContent = `Backup laeuft ... (${elapsed}s)`;
        return;
      }

      clearInterval(backupNowPollInterval);
      backupNowPollInterval = null;
      backupNowBtn.disabled = false;

      if (data.status === "done") {
        const r = data.result || {};
        backupNowStatusEl.className = "backup-now-status done";
        backupNowStatusEl.textContent =
          `Backup abgeschlossen: ${r.archiveName || "-"}` +
          (r.uploadedTo ? `\nGespeichert: ${r.uploadedTo}` : "") +
          (r.sizeBytes ? `\nGroesse: ${formatSize(r.sizeBytes)}` : "");
        loadBackups().catch(() => {});
        loadSchedulerStatus().catch(() => {});
      } else if (data.status === "error") {
        backupNowStatusEl.className = "backup-now-status error";
        backupNowStatusEl.textContent = "Backup fehlgeschlagen: " + (data.error || "Unbekannter Fehler");
        loadSchedulerStatus().catch(() => {});
      }
    } catch {
      // ignore while polling
    }
  }, 2000);
}

function startRestorePolling() {
  if (restorePollInterval) {
    clearInterval(restorePollInterval);
  }

  restorePollInterval = setInterval(async () => {
    try {
      const res = await fetch("api/restore-status");
      const data = await res.json();

      if (data.status === "running") {
        const elapsed = Math.round((Date.now() - new Date(data.startedAt).getTime()) / 1000);
        setRestoreStatus("running", `Restore laeuft ... (${elapsed}s)`);
        return;
      }

      clearInterval(restorePollInterval);
      restorePollInterval = null;
      restoreRunBtn.disabled = false;
      restorePreviewBtn.disabled = false;

      if (data.status === "done") {
        const result = data.result || {};
        setRestoreStatus(
          "done",
          `Restore abgeschlossen\nQuelle: ${data.backupLocation || "-"}\nZiel: ${result.restoredTo || data.restoreDirectory || "-"}` +
            (Array.isArray(result.selectedEntries) && result.selectedEntries.length > 0
              ? `\nAuswahl: ${result.selectedEntries.join(", ")}`
              : "\nAuswahl: komplettes Backup"),
        );
      } else if (data.status === "error") {
        setRestoreStatus("error", "Restore fehlgeschlagen: " + (data.error || "Unbekannter Fehler"));
      }
    } catch {
      // ignore while polling
    }
  }, 2000);
}

function setRestoreStatus(kind, message) {
  restoreStatusEl.className = `backup-now-status ${kind}`;
  restoreStatusEl.textContent = message;
}

function renderRestorePreview(payload) {
  const backupLocation = String(payload.backupLocation || "-");
  const totalEntries = Number(payload.totalEntries || 0);
  const topLevelEntries = Array.isArray(payload.topLevelEntries) ? payload.topLevelEntries : [];
  const entriesPreview = Array.isArray(payload.entriesPreview) ? payload.entriesPreview : [];

  return [
    `Backup: ${backupLocation}`,
    `Eintraege gesamt: ${totalEntries}`,
    "",
    "Top-Level Inhalte:",
    ...(topLevelEntries.length > 0 ? topLevelEntries.map((entry) => `- ${entry}`) : ["- (keine)"]),
    "",
    "Vorschau der Archiv-Eintraege:",
    ...(entriesPreview.length > 0 ? entriesPreview.map((entry) => `- ${entry}`) : ["- (keine)"]),
  ].join("\n");
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

  if (storage && isKnownByteValue(storage.availableBytes)) {
    cards.push({
      label: "Verfuegbar",
      value: formatSize(Number(storage.availableBytes)),
      detail: isKnownByteValue(storage.capacityBytes)
        ? `Kapazitaet ${formatSize(Number(storage.capacityBytes))}`
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

  if (!storage || !isKnownByteValue(storage.availableBytes) || !isKnownByteValue(storage.capacityBytes)) {
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

function isKnownByteValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
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

// Footer-Version dynamisch setzen
fetch("/info")
  .then((res) => res.json())
  .then((info) => {
    const footer = document.getElementById("footer-version");
    if (footer && info) {
      const version = info.version || "0.1.26";
      const released = info.released || "27.03.2026";
      footer.textContent = `Version ${version} · Release: ${released}`;
    }
  })
  .catch(() => {
    const footer = document.getElementById("footer-version");
    if (footer) footer.textContent = "Version unbekannt";
  });
