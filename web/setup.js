const form = document.getElementById("setup-form");
const providerSelect = document.getElementById("storage_provider");
const localFields = document.getElementById("local-fields");
const filenFields = document.getElementById("filen-fields");
const statusEl = document.getElementById("status");
const setupAuthButton = document.getElementById("setup-auth");

init().catch((error) => {
  setStatus(`Fehler beim Laden: ${error.message}`, true);
});

providerSelect.addEventListener("change", toggleProviderFields);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = collectFormData(form);

  try {
    setStatus("Speichere Konfiguration ...");
    const response = await fetch("/api/options", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error || "Konfiguration konnte nicht gespeichert werden.");
    }

    setStatus(json.message || "Gespeichert.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

setupAuthButton.addEventListener("click", async () => {
  try {
    setStatus("Starte setup-filen-auth ...");
    const savePayload = collectFormData(form);

    const saveResponse = await fetch("/api/options", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(savePayload),
    });

    const saveJson = await saveResponse.json();

    if (!saveResponse.ok) {
      throw new Error(saveJson.error || "Konfiguration konnte nicht gespeichert werden.");
    }

    const response = await fetch("/api/setup-filen-auth", {
      method: "POST",
    });
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error || "setup-filen-auth fehlgeschlagen.");
    }

    setStatus(`${json.message}\nPfad: ${json.authStatePath}\nUser: ${json.userId}`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

async function init() {
  const response = await fetch("/api/options");
  const options = await response.json();

  if (!response.ok) {
    throw new Error(options.error || "Optionen konnten nicht geladen werden.");
  }

  for (const [key, value] of Object.entries(options)) {
    const field = form.elements.namedItem(key);

    if (!field) {
      continue;
    }

    field.value = typeof value === "string" ? value : String(value ?? "");
  }

  toggleProviderFields();
}

function collectFormData(formElement) {
  const data = new FormData(formElement);
  const payload = {};

  for (const [key, value] of data.entries()) {
    payload[key] = String(value ?? "").trim();
  }

  return payload;
}

function toggleProviderFields() {
  const provider = providerSelect.value;
  localFields.style.display = provider === "local" ? "grid" : "none";
  filenFields.style.display = provider === "filen" ? "grid" : "none";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("bad", isError);
  statusEl.classList.toggle("good", !isError);
}
