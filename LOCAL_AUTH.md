# Using Your Own Filen API Key

This project no longer uses OAuth credentials.

To connect the add-on, provide your own Filen API key:

1. Open Home Assistant -> Settings -> Add-ons -> Home Assistant Filen.io Backup.
2. Open the Configuration tab.
3. Set `filen_api_key` to your personal Filen API key.
4. Save and restart the add-on.

## Where to get your API key

Use these steps:

1. Sign in to Filen in your browser.
2. Open account settings.
3. Find `API Keys` (sometimes listed under `Developer`).
4. Create a new key for Home Assistant backup usage.
5. Copy the key.

Then paste it into Home Assistant add-on configuration as `filen_api_key` and restart the add-on.

## Security notes

- Keep your API key private.
- Do not commit API keys to git.
- Rotate the key immediately if it was exposed.
