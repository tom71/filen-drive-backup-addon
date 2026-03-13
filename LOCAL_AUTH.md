# Using Your Own Filen API Key

This project no longer uses OAuth credentials.

To connect the add-on, provide your own Filen API key:

1. Open Home Assistant -> Settings -> Add-ons -> Home Assistant Filen.io Backup.
2. Open the Configuration tab.
3. Set `filen_api_key` to your personal Filen API key.
4. Save and restart the add-on.

## Where to get your API key

Use Filen's official authentication flow described here:
https://docs.filen.io/docs/api/guides/authentication

In short:

1. Authenticate via Filen API flow.
2. Read the API key returned by `/v3/login`.
3. Paste it into Home Assistant add-on configuration as `filen_api_key`.
4. Restart the add-on.

If Filen exposes an API key directly in account settings, that key can also be used.

## Security notes

- Keep your API key private.
- Do not commit API keys to git.
- Rotate the key immediately if it was exposed.
