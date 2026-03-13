#!/usr/bin/env python3
"""
Helper script to retrieve a Filen.io API key using email and password.

Usage:
    python3 get_filen_api_key.py

The script implements the official Filen authentication flow:
  1. POST /v3/auth/info  → receive salt and authVersion
  2. Derive password:    PBKDF2-HMAC-SHA512 (200 000 iterations, 64 bytes)
                         → hex string, split in half, take the second half
                         → SHA-512 hash of the second half
  3. POST /v3/login      → returns the API key

Copy the printed API key into the Home Assistant add-on configuration:
    filen_api_key: "<your-api-key>"
"""

import getpass
import hashlib
import json
import sys
import urllib.request
import urllib.error

GATEWAY = "https://gateway.filen.io"


def _post(path: str, payload: dict) -> dict:
    url = GATEWAY + path
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "hassio-filen-backup/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP {exc.code} from {path}: {body}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as exc:
        print(f"Network error reaching {url}: {exc.reason}", file=sys.stderr)
        sys.exit(1)


def derive_password(password: str, salt: str) -> str:
    """
    PBKDF2-HMAC-SHA512 key derivation as required by Filen auth v2/v3.

    - dkLen = 64 bytes  → 128 hex chars
    - Split hex string in half; left half = master key (unused here),
      right half = derived password candidate
    - SHA-512 hash the derived password candidate → final password for /v3/login
    """
    dk = hashlib.pbkdf2_hmac(
        hash_name="sha512",
        password=password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        iterations=200_000,
        dklen=64,
    )
    hex_key = dk.hex()                    # 128 hex chars
    derived_password = hex_key[64:]       # second half (right 64 chars)
    hashed = hashlib.sha512(derived_password.encode("utf-8")).hexdigest()
    return hashed


def get_api_key(email: str, password: str, two_factor_code: str = "XXXXXX") -> str:
    # Step 1 – fetch salt
    print("Fetching auth info …")
    info = _post("/v3/auth/info", {"email": email})
    if not info.get("status"):
        print(f"Error from /v3/auth/info: {info.get('message', info)}", file=sys.stderr)
        sys.exit(1)

    salt = info["data"]["salt"]
    auth_version = info["data"]["authVersion"]

    # Step 2 – derive password
    print("Deriving password …")
    hashed_password = derive_password(password, salt)

    # Step 3 – login
    print("Logging in …")
    login_payload = {
        "email": email,
        "password": hashed_password,
        "authVersion": auth_version,
        "twoFactorCode": two_factor_code,
    }
    result = _post("/v3/login", login_payload)
    if not result.get("status"):
        print(f"Login failed: {result.get('message', result)}", file=sys.stderr)
        sys.exit(1)

    return result["data"]["apiKey"]


def main() -> None:
    print("=" * 60)
    print("  Filen.io API Key Helper")
    print("  github.com/tom71/hassio-filen-drive-backup")
    print("=" * 60)
    print()

    email = input("Filen.io e-mail address: ").strip()
    if not email:
        print("E-mail address is required.", file=sys.stderr)
        sys.exit(1)

    password = getpass.getpass("Filen.io password (hidden): ")
    if not password:
        print("Password is required.", file=sys.stderr)
        sys.exit(1)

    two_factor = input(
        "Two-factor code (press Enter to skip if 2FA is disabled): "
    ).strip() or "XXXXXX"

    print()
    api_key = get_api_key(email, password, two_factor)

    print()
    print("=" * 60)
    print("  Your Filen.io API key:")
    print()
    print(f"  {api_key}")
    print()
    print("  Copy this value into your Home Assistant add-on")
    print("  configuration under 'filen_api_key'.")
    print("=" * 60)


if __name__ == "__main__":
    main()
