from backup.filen import (decrypt_chunk, decrypt_string, encrypt_chunk,
                          encrypt_string, generate_file_key, generate_iv)


def test_chunk_roundtrip():
    key = generate_file_key()
    data = b"hello backup"
    iv, cipher = encrypt_chunk(data, key)

    plain = decrypt_chunk(cipher, key, iv)

    assert plain == data


def test_string_roundtrip():
    key = generate_file_key()
    value = "Home Assistant Backup"

    cipher = encrypt_string(value, key)
    plain = decrypt_string(cipher, key)

    assert plain == value


def test_custom_iv_is_respected():
    key = generate_file_key()
    iv = generate_iv()

    got_iv, cipher = encrypt_chunk(b"abc", key, iv=iv)

    assert got_iv == iv
    assert decrypt_chunk(cipher, key, iv) == b"abc"
