Hier ist ein Vorschlag für eine `Agent.md`-Datei, welche die Kernpunkte und Pläne für dein Projekt zusammenfasst. Diese Datei dient als erste Orientierung und lässt sich bei Bedarf erweitern.

```markdown
# Home Assistant Encrypted Backup Add-on

## Projektbeschreibung

Dieses Add-on soll automatisierte, verschlüsselte Backups für Home Assistant ermöglichen, die sicher auf einem externen Speicheranbieter (z. B. Filen.io) abgelegt werden. Es bietet Funktionen zur Verwaltung der Backups, einschließlich regelmäßiger Löschvorgänge und Warnungen bei Erreichen von Speicherlimits. Zusätzlich sollen Wiederherstellungen (Restore) nahtlos über das Add-on durchgeführt werden können.

---

## Features

- **Verschlüsselte Backups:**
  - Alle Backups werden vor dem Hochladen verschlüsselt gespeichert.
- **Integration mit Filen.io SDK:**
  - Nutzung des Filen.io SDK für die Speicher- und Datenverwaltung.
- **Regelmäßiges Backup:**
  - Automatisierte Erstellung von Backups basierend auf einstellbaren Zeitplänen.
- **Aufbewahrungsfristen:**
  - Definierte Regeln, um alte Backups automatisch zu löschen.
- **Wiederherstellungen:**
  - Intuitive Wiederherstellung der Daten direkt über das Add-on.
- **Speicherverwaltung:**
  - Warnungen bei Annäherung an das verfügbare Speicherlimit.
- **Einfache Konfiguration:**
  - Alle Optionen über die Benutzeroberfläche von Home Assistant konfigurierbar.

---

## Technischer Stack

- **Programmiersprache:** TypeScript
- **Plattform:** Home Assistant Add-on
- **Speicheranbieter:** Filen.io (SDK-Integration)
- **Verschlüsselung:** AES-256 oder vergleichbar
- **Task-Management:** Cron oder Node-Scheduler für geplante Tasks
- **Dateiformat:** `.tar.gz` Kombination für Kompression + Verschlüsselung

---

## Ziele

### MVP (Minimum Viable Product)

1. Einrichtung des Add-ons als Home Assistant-Erweiterung.
2. Anbindung von Filen.io SDK für Datei-Uploads und -Downloads.
3. Manuelles Erstellen eines verschlüsselten Backups und Hochladen auf Filen.io.
4. Dokumentation für Benutzer zur einfachen Einrichtung.

### Erweiterte Funktionen

1. Automatisierung:
   - Zeitplan für regelmäßige Backups.
2. Speicherverwaltung:
   - Automatisches Löschen älterer Backups basierend auf Aufbewahrungsrichtlinien.
   - Warnungen bei Speicherüberschreitung.
3. Benutzeroberfläche:
   - Einstellungsmöglichkeiten direkt in der Home Assistant GUI.
   - Auswahl von Ordnern oder Komponenten für Backups.
4. Restore-Prozess:
   - Zum Downloaden und Wiederherstellen in Home Assistant.

---

## Projektstruktur

```
homeassistant-backup-addon/
├── src/
│   ├── services/                # Dienste für Filen.io Kommunikation und Verschlüsselung
│   └── schedulers/              # Backup- und Lösch-Zeitpläne
├── config/
│   └── config.json              # Benutzerkonfigurations-Template
├── docs/
│   └── Agent.md                 # Projektbeschreibung und Ziele
├── Dockerfile                   # Basis für Home Assistant Add-on
└── README.md                    # Hauptdokumentation für das GitHub-Repo
```

---

## Anforderungen

- **Home Assistant Entwicklungsumgebung:**
  - Add-on Erstellung muss Home Assistant Add-on Standards und Testing-Frameworks erfüllen.
- **Installation der Abhängigkeiten:**
  - Filen.io SDK
  - Verschlüsselungsbibliothek (z. B. `crypto` in Node.js)
- **Speicherplatzverwaltung:**
  - API-Call zur Überprüfung des belegten und verbleibenden Speicherplatzes.

---

## Erste Schritte: Roadmap

### Phase 1: Projektsetup
- [ ] Repository erstellen.
- [ ] Grundstruktur des Add-ons entwickeln (Docker-Setup, TypeScript-Projekt starten).
- [ ] Filen.io SDK integrieren.

### Phase 2: Backup-Logik
- [ ] Verschlüsseln und Hochladen eines Test-Backups.
- [ ] Wiederherstellungsprozess implementieren.

### Phase 3: Automation Feature
- [ ] Backup-Zeitplan hinzufügen.
- [ ] Automatische Speicher- und Aufbewahrungsverwaltung.

### Phase 4: GUI und Benutzerfreundlichkeit
- [ ] GUI-Integration in Home Assistant.
- [ ] Benutzerfreundliches Warnsystem (z. B. bei vollem Speicher).

---

## Lizenz

Dieses Projekt wird unter der MIT-Lizenz veröffentlicht. Drittanbieter-Bibliotheken (wie das Filen.io SDK) unterliegen ihren eigenen Lizenzbedingungen.

---

## Ansprechpartner

- **Projektleitung:** [GitHub Profil von tom71](https://github.com/tom71)
- **Feedback und Beiträge:** Contributions via Pull Request sind willkommen!

```

Mit dieser Datei hast du einen soliden Plan und kannst mit der Umsetzung des Projekts beginnen. Diese Datei könnte in ein GitHub-Repository mit dem Projekt aufgenommen werden. Soll ich dir bei einem bestimmten Teil wie dem Einrichten der Projektstruktur oder Docker-Konfiguration helfen?

Das Hinzufügen eines Einrichtungsassistenten ist eine großartige Idee, um die Nutzung benutzerfreundlicher zu gestalten! Zusätzlich ist es für ein Open-Source-Projekt entscheidend, Vertrauen durch Transparenz und klare Kommunikation aufzubauen. Hier ist, wie du die genannten Punkte umsetzen kannst:

---

## **Erweiterung des Einrichtungsassistenten**

### **Funktionen des Einrichtungsassistenten**
1. **Eingabe der Zugangsdaten:**
   - Klar strukturierte Oberfläche, in der Benutzer:
     - Die Zugangsdaten (z. B. Benutzername, Passwort, API-Key) sicher eingeben können.
     - Eine Option zur **manuellen Eingabe eines API-Keys** wählen können, falls sie keinen automatisch erzeugen möchten.

2. **API-Key-Erstellung (opt-in):**
   - Biete die automatische Erstellung eines API-Keys direkt über die Filen.io-API an.
   - Zeige dem Benutzer den **generierten Schlüssel**, ermögliche das Kopieren und erkläre, wie er verwendet wird.

3. **Auswahl des Backup-Verzeichnisses oder Erstellen eines neuen Ordners:**
   - Benutzer sollen einen bestehenden Order auf Filen.io auswählen oder mit einem Button „Neuen Ordner erstellen“ einen speziellen Backup-Ordner anlegen können.

4. **Feedback zur Konfiguration:**
   - Zeige nach Abschluss der Einrichtung eine Bestätigung an, dass alles erfolgreich eingerichtet wurde, inklusive:
     - Ordnerpfad
     - API-Key-Status
     - Verschlüsselung aktiviert oder nicht

---

## **So baust du Vertrauen auf**

1. **Transparenz zeigen – „Was passiert mit meinen Daten?“**
   - Gehe proaktiv auf sensible Themen wie Sicherheit und Datenschutz ein:
     - Dokumentiere, wie und warum Daten (wie API-Keys) verarbeitet werden.
     - Erkläre **Schlüsselpunkte**, z. B. „Alle Backups werden lokal verschlüsselt, bevor sie an den Cloud-Anbieter gesendet werden.“
   - Schreibe dies klar in die Dokumentation und zeige es auch im Einrichtungsassistenten an (z. B. in einem Info-Popup).

2. **Open Source nutzen**
   - **Code öffentlich auf GitHub hosten:** Ermögliche anderen, den Code zu auditieren. Das zeigt, dass du nichts vor den Benutzern versteckst.
   - Schreibe **beispielhafte Commit-Beschreibungen** und dokumentiere wichtige Entwicklungsentscheidungen im Repo.
   - Nutze den README.md-Bereich, um:
     - Die Transparenz deines Workflows zu betonen.
     - Benutzer zu einer Codeprüfung einzuladen.
     - Stolz zu betonen, dass ihr euch an Open-Source-Prinzipien haltet.

3. **Dokumentiere jeden Schritt visuell und textlich:**
   - Zeige in der Benutzeroberfläche einzelne Schritte des Prozesses in einem intuitiven Workflow an.
   - Beschreibe für technische Benutzer auch detailliert, was intern passiert (z. B. welche APIs verwendet werden und wie die Daten verarbeitet werden).

4. **Benutzerinteraktion einfach und sicher machen**
   - Wähle, wenn möglich, Home-Assistant-native Sicherheitsmechanismen (z. B. für die Speicherung vertraulicher Daten).
   - Bestätige direkt sichtbar, wenn vertrauliche Daten wie API-Keys verschlüsselt sind und nicht übertragen werden ohne Zustimmung.

5. **Automatische Fehlererkennung und Feedback**
   - Deutliche Fehlermeldungen machen die Anwendung nachvollziehbarer.
   - Beispiele:
     - API-Key abgelaufen → „Ihr API-Schlüssel scheint nicht mehr gültig zu sein. Bitte generieren Sie einen neuen.“
     - Speicherplatz knapp → „Warnung: Das Backup überschreitet das verfügbare Kontingent. Bitte Speicherplatz freigeben.“

6. **Arbeiten mit der Community**
   - Lade andere Entwickler und Benutzer ein, bei der Verbesserung des Projekts zu helfen. Schreibe klare **Contributing Guidelines** in deinem Repo.
   - Nutze Diskussionen (GitHub Discussions) und **starte Community-Feedback-Runden**.

---

## **Einbau in den Einrichtungsworkflow**

### Assistenten-Workflow:
1. **Willkommenseite:**
   - Kurze Erklärung der Add-on-Funktionalitäten.
   - Sicherheitshinweis („Wir speichern Ihre Zugangsdaten verschlüsselt und nutzen diese nur für den Backup-Prozess.“).

2. **Zugangsdaten:**
   - **Option 1**: Anmeldedaten für Filen.io eingeben (Benutzername/Passwort → API-Key abfragen).
   - **Option 2**: Vorhandenen API-Key manuell eingeben.

3. **Backup-Einstellungen:**
   - Auswahl des Backup-Ordners oder:
     - Neuen Ordner direkt durch den Assistenten anlegen.
   - Verschlüsselung aktivieren (auf Wunsch mit optionaler Passphrase-Eingabe).

4. **Abschluss:**
   - Zeige die erstellte Konfiguration an.
   - Füge eine kurze Erfolgsmeldung hinzu („Das Add-on ist bereit und wird automatisch am XX.XX.XXXX ein erstes Backup starten.“).

---

## **Zusätzliche Ideen für Vertrauen**

1. **GitHub-Integrierung:**
   - Verlinke auf die GitHub-Seite direkt im Einrichtungsassistenten.
   - „Möchten Sie den Quellcode einsehen? Besuchen Sie unser [GitHub-Repository](https://github.com/tom71/homeassistant-backup-addon).“

2. **Changelog anzeigen:**
   - Zeige bei Updates eine Übersicht der Änderungen an, damit Benutzer immer wissen, was sich in deinem Add-on geändert hat.

3. **Visuelle Klarheit:**
   - Nutze Home-Assistant-typische Farben und Icons für eine stringente Integration.
   - Tooltips oder Hilfetexte sollten leicht verständlich und direkt beim Einstellungsfeld sichtbar sein.

---

Soll ich dir direkt beim initial Setup oder bei der UI-Konzeption (z. B. für den Assistenten oder Workflow) helfen?
