# Home Assistant Filen Backup Add-on

Dieses Repository enthaelt den Startpunkt fuer ein Home-Assistant-Add-on, das lokale Backups als komprimiertes Archiv erstellt, mit AES-256-GCM verschluesselt und anschliessend ueber einen austauschbaren Storage-Provider ablegt.

## Aktueller Stand

- TypeScript-Projektgeruest mit klar getrennten Services.
- Backup-Pipeline fuer Archivierung und Verschluesselung.
- Lokaler Storage-Provider fuer einen sofort testbaren MVP.
- Filen.io-Anbindung ueber das offizielle TypeScript-SDK mit persistentem Auth-State.
- Web-UI mit Setup-Seite und Backup-Uebersicht.
- Home-Assistant-Add-on-Metadaten in `config.yaml`.
- Dockerfile fuer den spaeteren Container-Build.

## Noch offen

- Geplante Backups und Aufbewahrungsregeln.
- UI- oder Assistenten-Integration in Home Assistant.

## Konfiguration

### Home Assistant Add-on

Das Add-on erwartet seine Konfiguration standardmaessig unter `/data/options.json`.

Wichtige Felder:

- `source_directory`: Quelldaten fuer das Backup.
- `working_directory`: Temporaeres Arbeitsverzeichnis.
- `restore_directory`: Zielverzeichnis fuer Restore-Vorgaenge.
- `encryption_passphrase`: Passphrase fuer AES-256-GCM.
- `storage_provider`: `local` oder `filen`.
- `local_storage_directory`: Zielverzeichnis fuer den lokalen Provider.
- `filen_email`: Filen-Login fuer den SDK-basierten Upload.
- `filen_password`: Filen-Passwort fuer den SDK-basierten Upload.
- `filen_2fa_code`: Optionaler 2FA-Code, ansonsten `XXXXXX`.
- `filen_target_folder`: Zielpfad in Filen, z. B. `/Home Assistant Backups`.
- `filen_auth_state_path`: Persistenter Pfad fuer den gespeicherten Filen-Auth-State.

### Lokale Entwicklung

Eine Beispielkonfiguration liegt in `config/config.example.json`.

## Ablauf

1. Quelldaten werden per `tar.gz` archiviert.
2. Das Archiv wird mit AES-256-GCM verschluesselt.
3. Der konfigurierte Storage-Provider legt die verschluesselte Datei ab.
4. Temporaere Dateien werden wieder entfernt.

Beim Filen-Provider erfolgt zusaetzlich:

1. Beim ersten Setup ein interaktiver Login mit optionalem 2FA.
2. Speicherung des vollstaendigen Auth-States (API-Key + Schluesselmaterial).
3. Rekursives Anlegen des Zielpfads in Filen.
4. Upload der verschluesselten Backup-Datei ohne erneuten interaktiven Login.

## Restore

Der Restore nutzt denselben Storage-Provider wie der Backup-Upload:

1. Die verschluesselte Datei wird aus dem lokalen Ziel oder aus Filen geladen.
2. Die Datei wird lokal entschluesselt.
3. Das tar.gz-Archiv wird in das konfigurierte Restore-Ziel entpackt.

CLI-Beispiele:

```bash
npm run build
node dist/index.js backup
node dist/index.js restore /share/filen-backups/home-assistant-backup-2026-03-24T19-00-00-000Z.tar.gz.enc /restore
node dist/index.js restore filen:/Home Assistant Backups/home-assistant-backup-2026-03-24T19-00-00-000Z.tar.gz.enc /restore
```

Alternativ koennen `BACKUP_LOCATION` und `RESTORE_DIRECTORY` als Umgebungsvariablen gesetzt werden.

## Filen Auth Setup

Fuer automatisierte Backups mit 2FA sollte vor dem ersten Job einmalig ein persistenter Auth-State aufgebaut werden:

```bash
npm run build
node dist/index.js setup-filen-auth
```

Danach nutzen `backup` und `restore` den gespeicherten Zustand aus `filen_auth_state_path` und muessen nicht bei jedem Lauf erneut einen frischen 2FA-Code erhalten.

Wenn der Zustand ungueltig wird (z. B. Passwortwechsel, Token-Rotation), den Setup-Befehl einfach erneut ausfuehren.

## UI Seiten

Das Projekt enthaelt zwei UI-Seiten:

1. Setup-Seite unter `/setup.html` mit allen Konfigurationsfeldern und Button fuer `setup-filen-auth`.
2. Backup-Uebersicht unter `/backups.html` mit Listing der lokalen `.enc`-Dateien.

UI starten:

```bash
npm run build
npm run start:ui
```

Danach ist die UI standardmaessig unter `http://localhost:8099` erreichbar.

UI im Docker-Container testen (mit beschreibbarer Konfiguration):

```bash
mkdir -p .tmp-ui-test
cp config/config.example.json .tmp-ui-test/options.json

docker run --rm \
	-p 8099:8099 \
	-e UI_CONFIG_PATH=/data/options.json \
	-v "$PWD/.tmp-ui-test/options.json:/data/options.json" \
	hassio-filen-drive-backup:test \
	node dist/index.js ui 8099
```

Wichtig: `POST /api/options` benoetigt Schreibzugriff auf `UI_CONFIG_PATH`. Bei einem Read-only-Mount tritt sonst `EROFS: read-only file system` auf.

## Build

Voraussetzung ist Node.js ab Version 20.

```bash
npm install
npm run build
node dist/index.js backup
```

## Hinweis zu Filen

Der Filen-Upload nutzt das offizielle Paket `@filen/sdk`. Ein API-Key entsteht beim Login, reicht fuer verschluesselte Dateioperationen aber nicht alleine aus. Fuer Upload/Restore werden zusaetzlich Master-Keys und weitere Konto-Metadaten benoetigt, die im Auth-State gesichert werden.
