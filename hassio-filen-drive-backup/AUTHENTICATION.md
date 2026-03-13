# Authentication with Filen.io

This add-on authenticates against Filen.io using an API key.

## How it works
1. You create a Filen.io API key in your Filen account.
2. You paste that API key into the add-on UI.
3. The add-on stores the key locally in Home Assistant and uses it for Filen gateway requests.

## Security model
- The add-on never needs your Filen account password.
- Only your configured API key is used for requests.
- Credentials are stored locally on your Home Assistant instance.

## Troubleshooting
- If authentication fails, generate a new API key and update the add-on settings.
- Verify outbound connectivity to the configured Filen gateway endpoint.
