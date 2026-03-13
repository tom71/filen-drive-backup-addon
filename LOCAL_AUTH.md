# Using Your Own Filen API Key

This project no longer uses OAuth credentials.

To connect the add-on, provide your own Filen API key:

1. Open Home Assistant -> Settings -> Add-ons -> Home Assistant Filen.io Backup.
2. Open the Configuration tab.
3. Set `filen_api_key` to your personal Filen API key.
4. Save and restart the add-on.

## Getting your API key — the easy way (helper script)

A small helper script is included that implements the official Filen login flow
and prints your API key:

```bash
python3 hassio-filen-drive-backup/dev/get_filen_api_key.py
```

The script will ask for your Filen.io e-mail address and password, derive the
authentication credentials as required by the Filen API, log in, and print the
returned API key. No extra dependencies are needed — it only uses Python's
standard library.

> **Tip:** If you have two-factor authentication (2FA) enabled on your Filen
> account, enter the current TOTP code when prompted.

Copy the printed key into the add-on **Configuration** tab:

```yaml
filen_api_key: "<paste key here>"
```

## Getting your API key — manual flow

For reference, the underlying flow is documented here:
https://docs.filen.io/docs/api/guides/authentication

In short:

1. `POST /v3/auth/info` with your e-mail → receive `salt` and `authVersion`.
2. Derive the password using PBKDF2-HMAC-SHA512 (200 000 iterations, 64 bytes),
   take the second half of the resulting hex string, then SHA-512 hash it.
3. `POST /v3/login` with email, derived password, authVersion → response contains `apiKey`.

## Security notes

- Keep your API key private — it grants full access to your Filen account.
- Do not commit API keys to git.
- Rotate the key immediately if it was exposed.
