import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_KEY_BYTES = 32
_IV_BYTES = 12


def generate_file_key() -> bytes:
    return os.urandom(_KEY_BYTES)


def generate_iv() -> bytes:
    return os.urandom(_IV_BYTES)


def encrypt_chunk(data: bytes, key: bytes, iv: bytes = None) -> tuple[bytes, bytes]:
    if iv is None:
        iv = generate_iv()
    cipher = AESGCM(key).encrypt(iv, data, None)
    return iv, cipher


def decrypt_chunk(cipher: bytes, key: bytes, iv: bytes) -> bytes:
    return AESGCM(key).decrypt(iv, cipher, None)


def encrypt_string(value: str, key: bytes) -> str:
    iv, cipher = encrypt_chunk(value.encode("utf-8"), key)
    payload = iv + cipher
    return base64.urlsafe_b64encode(payload).decode("ascii")


def decrypt_string(value: str, key: bytes) -> str:
    payload = base64.urlsafe_b64decode(value.encode("ascii"))
    iv = payload[:_IV_BYTES]
    cipher = payload[_IV_BYTES:]
    return decrypt_chunk(cipher, key, iv).decode("utf-8")
