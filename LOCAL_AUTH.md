# Using Your Own Filen API Key

This project no longer uses OAuth credentials.

To connect the add-on, provide your own Filen API key:

1. Open Home Assistant -> Settings -> Add-ons -> Home Assistant Filen.io Backup.
2. Open the Configuration tab.
3. Set `filen_api_key` to your personal Filen API key.
4. Save and restart the add-on.

## Where to get your API key

Create or copy an API key from your Filen account settings.

## Security notes

- Keep your API key private.
- Do not commit API keys to git.
- Rotate the key immediately if it was exposed.
