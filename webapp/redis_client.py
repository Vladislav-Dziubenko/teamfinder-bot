"""Асинхронный Redis-клиент на базе redis.asyncio.

Подключение через единую строку REDIS_URL (формат, который выдаёт Render Key Value):
  redis://:password@host:port

Используется для:
  - Rate limiting (sorted set, ключ rate:{user_id})
  - Кэш ответов (string, GET/SETEX)

При недоступности Redis все операции молча возвращают None/False
и логируют WARNING — сервер при этом НЕ падает, просто пропускает
rate-limit/кэш для данного запроса.
"""

import asyncio
import json
import logging
import os
from collections import defaultdict
from time import time
from typing import Any

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None

# In-memory fallback rate limiter (per user_id) when Redis is unavailable
_fallback_rates: dict[str, list[float]] = defaultdict(list)


def get_redis() -> aioredis.Redis | None:
    """Возвращает инициализированный клиент или None если ещё не подключились."""
    return _redis


async def init_redis() -> None:
    """Создаёт пул соединений при старте приложения.
    Если REDIS_URL не задан — логирует WARNING и пропускает инициализацию.
    """
    global _redis
    url = os.getenv("REDIS_URL")
    if not url:
        logger.warning("[redis] REDIS_URL не задан — rate-limit и кэш работают без Redis")
        return
    try:
        client = aioredis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=3.0,
            socket_timeout=3.0,
            socket_keepalive=True,
        )
        await asyncio.wait_for(client.ping(), timeout=5)
        _redis = client
        logger.info("[redis] Подключение установлено: %s", url.split("@")[-1])
    except Exception as exc:
        logger.warning("[redis] Не удалось подключиться (%s) — продолжаем без Redis", exc)


async def close_redis() -> None:
    """Закрывает пул соединений при остановке приложения."""
    global _redis
    if _redis is not None:
        try:
            await _redis.aclose()
        except Exception:
            pass
        _redis = None


# ---------------------------------------------------------------------------
# Rate limiting helpers (sorted set)
# ---------------------------------------------------------------------------

async def rate_limit_check(user_id: int | str, limit: int, window: int) -> bool:
    """Проверяет и регистрирует запрос в Redis sorted set.

    Возвращает True если лимит превышен (запрос нужно заблокировать),
    False если запрос разрешён (и уже записан в sorted set).

    Если Redis недоступен — использует in-memory fallback.

    Алгоритм:
      - Ключ: rate:{user_id}
      - Score = текущий unix timestamp (float)
      - ZADD добавляет текущий запрос
      - ZCOUNT считает запросы за последние `window` секунд
      - EXPIRE сбрасывает TTL ключа на window секунд (Redis удалит сам)
    """
    return (await rate_limit_checks([(user_id, limit, window)]))[0]


async def rate_limit_checks(checks: list[tuple[str, int, int]]) -> list[bool]:
    """Проверяет несколько rate-limit ключей одним Redis pipeline.

    Каждый элемент: (ключ, лимит, окно). Возвращает список bool —
    True если соответствующий ключ превысил лимит.

    Это один RTT вместо N отдельных rate_limit_check — критично, потому
    что проверки выполняются для КАЖДОГО /api запроса (IP + global + user).
    """
    r = get_redis()
    if r is None:
        # In-memory fallback — напрямую, БЕЗ повторного вызова rate_limit_check,
        # иначе бесконечная рекурсия (check -> checks -> check -> ...) и
        # RecursionError на каждом /api-запросе (а Redis на проде не задан).
        out = []
        for key, limit, window in checks:
            mem_key = f"mem_rate:{key}"
            now = time()
            window_start = now - window
            _fallback_rates[mem_key] = [t for t in _fallback_rates[mem_key] if t > window_start]
            if len(_fallback_rates[mem_key]) >= limit:
                out.append(True)
            else:
                _fallback_rates[mem_key].append(now)
                out.append(False)
        return out
    try:
        now = time()
        pipe = r.pipeline()
        for key, limit, window in checks:
            pipe.zadd(f"rate:{key}", {str(now): now})
            pipe.zcount(f"rate:{key}", now - window, "+inf")
            pipe.expire(f"rate:{key}", window)
        results = await asyncio.wait_for(pipe.execute(), timeout=3.0)
        blocked = []
        for i, (key, limit, window) in enumerate(checks):
            count = results[i * 3 + 1]
            blocked.append(count > limit)
        return blocked
    except Exception as exc:
        logger.warning("[redis] rate_limit_checks error: %s", exc)

    # In-memory fallback when Redis is unavailable
    out = []
    for key, limit, window in checks:
        mem_key = f"mem_rate:{key}"
        now = time()
        window_start = now - window
        _fallback_rates[mem_key] = [t for t in _fallback_rates[mem_key] if t > window_start]
        if len(_fallback_rates[mem_key]) >= limit:
            out.append(True)
        else:
            _fallback_rates[mem_key].append(now)
            out.append(False)
    return out


async def counter_incr(key: str, ttl: int) -> int:
    """Атомарно инкрементирует счётчик с TTL и возвращает новое значение.

    Используется для антифрода (например, число выдач welcome-бонуса с IP
    за 24 часа): INCR + EXPIRE при первом инкременте — без гонок.
    При недоступности Redis возвращает 0 (никого не блокируем).
    """
    r = get_redis()
    if r is None:
        return 0
    try:
        val = await asyncio.wait_for(r.incr(key), timeout=3.0)
        if val == 1:
            await asyncio.wait_for(r.expire(key, ttl), timeout=3.0)
        return val
    except Exception as exc:
        logger.warning("[redis] counter_incr error key=%s: %s", key, exc)
        return 0


# ---------------------------------------------------------------------------
# Cache helpers (string JSON)
# ---------------------------------------------------------------------------

async def cache_get(key: str) -> Any | None:
    """Получает значение из кэша. Возвращает десериализованный объект или None."""
    r = get_redis()
    if r is None:
        return None
    try:
        raw = await asyncio.wait_for(r.get(f"cache:{key}"), timeout=3.0)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("[redis] cache_get error key=%s: %s", key, exc)
        return None


async def cache_set(key: str, data: Any, ttl: int = 2) -> None:
    """Сохраняет значение в кэш с TTL (по умолчанию 2 секунды)."""
    r = get_redis()
    if r is None:
        return
    try:
        await asyncio.wait_for(r.setex(f"cache:{key}", ttl, json.dumps(data)), timeout=3.0)
    except Exception as exc:
        logger.warning("[redis] cache_set error key=%s: %s", key, exc)


async def cache_delete_pattern(pattern: str) -> None:
    """Удаляет все ключи кэша, соответствующие glob-паттерну.

    Используется для инвалидации кэша команд при создании новой команды.
    Паттерн передаётся без префикса 'cache:' — он добавляется здесь.
    Пример: pattern='teams:*' → ищем ключи 'cache:teams:*'
    """
    r = get_redis()
    if r is None:
        return
    try:
        full_pattern = f"cache:{pattern}"
        keys = await asyncio.wait_for(r.keys(full_pattern), timeout=3.0)
        if keys:
            await asyncio.wait_for(r.delete(*keys), timeout=3.0)
    except Exception as exc:
        logger.warning("[redis] cache_delete_pattern error pattern=%s: %s", pattern, exc)
