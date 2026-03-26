# Agent Notes - Filen Drive Backup Add-on

## Ziel

Dieses Add-on erstellt Home-Assistant-Backups, verschluesselt sie mit AES-256-GCM und laedt sie nach Filen hoch.

## Aktueller Produktstand

- Storage-Provider ist auf `filen` festgelegt (kein `local` mehr).
- UI unter `/setup.html` und `/backups.html` mit `Backup Now`-Funktion.
- `Backup Now` erstellt ein HA-Backup ueber die Supervisor API.
- Optionales Loeschen des HA-Backups nach erfolgreichem Upload (`delete_after_upload`).
- Fehler werden als Home-Assistant Persistent Notification gemeldet (`send_error_reports`).
- Verschluesselung/Entschluesselung laeuft als Stream (funktioniert auch mit sehr grossen Backups).

## Wichtige Konfigurationsfelder

- `storage_provider`: `filen`
- `backup_name`
- `exclude_folders`
- `exclude_addons`
- `delete_after_upload`
- `send_error_reports`
- `filen_email`, `filen_password`, `filen_2fa_code`, `filen_target_folder`, `filen_auth_state_path`

## Noch nicht voll implementiert

Folgende Felder sind bereits im Schema vorhanden, aber noch nicht mit einer automatischen Engine verbunden:

- `days_between_backups`
- `backup_time_of_day`
- `max_backups_in_filen_drive`
- `generational_days`
- `generational_weeks`

## Naechste Schritte

1. Scheduler fuer automatische Backup-Laeufe (Intervall + Tageszeit).
2. Retention-Logik in Filen (max count + generational).
3. Policy-UI in der Setup-Seite (Erklaertexte, Validierung, Statusanzeigen).
4. Optional: zusaetzliche Push-Integration ueber konkreten Home-Assistant Notify-Service.
