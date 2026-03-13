# Authentication with Filen.io

This add-on authenticates against Filen.io using an API key.

## How it works
1. You authenticate using Filen's official API authentication flow.
2. The API key is returned from `/v3/login`.
3. You paste that key into the add-on UI.
4. The add-on stores the key locally in Home Assistant and uses it for Filen gateway requests.

Official reference:
https://docs.filen.io/docs/api/guides/authentication

## Security model
- The add-on never needs your Filen account password.
- Only your configured API key is used for requests.
- Credentials are stored locally on your Home Assistant instance.

## Troubleshooting
- If authentication fails, generate a new API key and update the add-on settings.
- Verify outbound connectivity to the configured Filen gateway endpoint.
