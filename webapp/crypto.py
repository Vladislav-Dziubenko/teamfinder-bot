import base64
import hashlib

from cryptography.fernet import Fernet


def _derive_key(bot_token: str) -> bytes:
    return base64.urlsafe_b64encode(hashlib.sha256(bot_token.encode()).digest())


def encrypt_token(plaintext: str, bot_token: str) -> str:
    if not plaintext:
        return ""
    return Fernet(_derive_key(bot_token)).encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str, bot_token: str) -> str:
    if not ciphertext:
        return ""
    return Fernet(_derive_key(bot_token)).decrypt(ciphertext.encode()).decode()
