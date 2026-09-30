"""Одноразовая установка Telegram webhook на Vercel (или любой URL).

Использование:
    BOT_TOKEN=123:ABC python scripts/set_webhook.py https://my-app.vercel.app

Ставит https://<domain>/webhook/<sha256(token)> с secret_token.
Только стандартная библиотека — зависимостей не требует.
"""
import hashlib
import json
import os
import sys
import urllib.request


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: BOT_TOKEN=... python scripts/set_webhook.py https://<vercel-domain>")
        return 2
    token = (os.environ.get("BOT_TOKEN", "") or "").strip()
    if not token:
        print("BOT_TOKEN не задан")
        return 2
    base = sys.argv[1].rstrip("/")
    secret = hashlib.sha256(token.encode()).hexdigest()
    url = f"{base}/webhook/{secret}"
    payload = json.dumps({
        "url": url,
        "drop_pending_updates": True,
        "secret_token": secret,
    }).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/setWebhook",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode()
    except Exception as e:
        print(f"setWebhook failed: {e}")
        return 1
    print(body)
    try:
        ok = json.loads(body).get("ok", False)
    except Exception:
        ok = False
    if not ok:
        return 1
    # Проверка
    info_req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/getWebhookInfo",
        method="GET",
    )
    try:
        with urllib.request.urlopen(info_req, timeout=30) as resp:
            print(resp.read().decode())
    except Exception as e:
        print(f"getWebhookInfo failed: {e}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
