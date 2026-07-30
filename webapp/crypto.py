from cryptography.fernet import Fernet


def encrypt_token(plaintext: str, fernet_key: str) -> str:
    if not plaintext or not fernet_key:
        return ""
    return Fernet(fernet_key.encode()).encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str, fernet_key: str) -> str:
    if not ciphertext or not fernet_key:
        return ""
    return Fernet(fernet_key.encode()).decrypt(ciphertext.encode()).decode()
