"""Проверка подписи initData, которую Telegram WebApp передаёт фронтенду."""

import hashlib
import hmac
import json
import logging
import os
import re
import time
from urllib.parse import parse_qsl


def _default_max_age() -> int:
    try:
        val = int(os.getenv("WEBAPP_AUTH_MAX_AGE_SECONDS", "172800"))
        return val if val > 0 else 172800
    except (TypeError, ValueError):
        return 172800


def _debug_log(msg: str) -> None:
    logging.warning(f"[auth_debug] {msg}")


def validate_init_data(init_data: str, bot_token: str, max_age_seconds: int | None = None) -> dict | None:
    if not init_data:
        _debug_log("пустой init_data")
        return None

    try:
        parsed = dict(parse_qsl(init_data))
        _debug_log(f"распарсено ключей: {len(parsed)}")
    except ValueError as e:
        _debug_log(f"parse_qsl ошибка: {e}")
        return None

    received_hash = parsed.pop("hash", None)
    if not received_hash:
        _debug_log("нет hash")
        return None

    parsed.pop("signature", None)

    auth_date_str = parsed.pop("auth_date", None)
    if not auth_date_str:
        return None
    try:
        auth_date = int(auth_date_str)
    except (ValueError, TypeError):
        return None

    if max_age_seconds is None:
        max_age_seconds = _default_max_age()
    if max_age_seconds > 0 and time.time() - auth_date > max_age_seconds:
        _debug_log(f"auth_date просрочен")
        return None

    # Несколько вариантов data_check_string
    dcs_a = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))

    # B: raw url-enc, сортированные
    raw = []
    for pair in init_data.split("&"):
        if "=" in pair:
            k, v = pair.split("=", 1)
            if k not in ("hash", "signature", "auth_date"):
                raw.append((k, v))
    dcs_b = "\n".join(f"{k}={v}" for k, v in sorted(raw))

    # C: декод. с auth_date
    parsed_c = dict(parse_qsl(init_data))
    parsed_c.pop("hash", None)
    parsed_c.pop("signature", None)
    dcs_c = "\n".join(f"{k}={v}" for k, v in sorted(parsed_c.items()))

    # D: без date, с sig
    parsed_d = dict(parse_qsl(init_data))
    parsed_d.pop("hash", None)
    parsed_d.pop("auth_date", None)
    dcs_d = "\n".join(f"{k}={v}" for k, v in sorted(parsed_d.items()))

    # E: raw url-enc, БЕЗ сортировки (порядок как в init_data)
    raw_unsorted = []
    for pair in init_data.split("&"):
        if "=" in pair:
            k, v = pair.split("=", 1)
            if k not in ("hash", "signature", "auth_date"):
                raw_unsorted.append((k, v))
    dcs_e = "\n".join(f"{k}={v}" for k, v in raw_unsorted)

    # F: декодированные, БЕЗ сортировки
    parsed_f = dict(parse_qsl(init_data))
    parsed_f.pop("hash", None)
    parsed_f.pop("signature", None)
    parsed_f.pop("auth_date", None)
    dcs_f = "\n".join(f"{k}={v}" for k, v in parsed_f.items())

    # G: сырая строка init_data без hash (вообще без изменений, кроме удаления hash)
    import re
    dcs_g = re.sub(r'&?hash=[a-f0-9]+', '', init_data)

    secret = hmac.new(bot_token.encode(), b"WebAppData", hashlib.sha256).digest()
    secret_swapped = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()

    variants = {
        "A": dcs_a, "B": dcs_b, "C": dcs_c, "D": dcs_d,
        "E": dcs_e, "F": dcs_f, "G": dcs_g,
    }

    _debug_log(f"BOT_TOKEN начало={bot_token[:8]}... конец=...{bot_token[-4:]}")
    _debug_log(f"hash received={received_hash}")

    match = None
    for label, dcs in variants.items():
        h = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
        _debug_log(f"hash {label}={h}")
        if hmac.compare_digest(h, received_hash):
            match = label
            _debug_log(f"--> СОВПАДЕНИЕ: {label}")
            break
        # ещё раз с переставленным secret
        h2 = hmac.new(secret_swapped, dcs.encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(h2, received_hash):
            match = f"{label}(swapped)"
            _debug_log(f"--> СОВПАДЕНИЕ: {label}(swapped)")
            break

    if match is None:
        _debug_log("НИ ОДИН ВАРИАНТ НЕ СОВПАЛ")
        return None

    if "user" in parsed:
        try:
            parsed["user"] = json.loads(parsed["user"])
        except json.JSONDecodeError:
            _debug_log("user не JSON")
            return None

    return parsed
