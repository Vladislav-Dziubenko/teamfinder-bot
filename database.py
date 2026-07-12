import asyncpg
from datetime import datetime, timedelta

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    created_at TEXT NOT NULL,
    pro_until TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    game TEXT NOT NULL,
    nickname TEXT NOT NULL,
    rank TEXT NOT NULL,
    role TEXT NOT NULL,
    playtime TEXT NOT NULL,
    looking_for TEXT NOT NULL,
    region TEXT DEFAULT '',
    language TEXT DEFAULT 'RU',
    contact TEXT NOT NULL,
    has_mic INTEGER DEFAULT 1,
    description TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    highlighted_until TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    product_key TEXT NOT NULL,
    stars_amount INTEGER NOT NULL,
    charge_id TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS unlocked_content (
    user_id BIGINT NOT NULL,
    content_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, content_id)
);

CREATE TABLE IF NOT EXISTS search_boosts (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    game TEXT NOT NULL,
    uses_left INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    captain_id BIGINT NOT NULL,
    game TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    max_players INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (captain_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS team_applications (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL,
    user_id BIGINT NOT NULL,
    message TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS contact_unlocks (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    profile_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, profile_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
"""

SCHEMA_STATEMENTS = [
    stmt.strip()
    for stmt in SCHEMA.split(";")
    if stmt.strip() and stmt.strip().startswith("CREATE TABLE")
]


class Database:
    def __init__(self, database_url: str):
        self.database_url = database_url
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(
            self.database_url,
            ssl="require" if "render.com" in self.database_url else None,
        )
        async with self._pool.acquire() as conn:
            await self._init_schema(conn)
            await self._migrate(conn)

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()

    @property
    def pool(self) -> asyncpg.Pool:
        if not self._pool:
            raise RuntimeError("Database not connected")
        return self._pool

    async def _init_schema(self, conn: asyncpg.Connection) -> None:
        for table_sql in SCHEMA_STATEMENTS:
            try:
                await conn.execute(table_sql)
            except asyncpg.DuplicateTableError:
                pass

    async def _migrate(self, conn: asyncpg.Connection) -> None:
        try:
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_until TEXT")
        except asyncpg.PostgresError:
            pass

        try:
            await conn.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS contact_unlocks_user_profile_idx
                ON contact_unlocks (user_id, profile_id)
                """
            )
        except asyncpg.PostgresError:
            pass

    async def ensure_user(self, user_id: int, username: str | None, first_name: str | None) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO users (user_id, username, first_name, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO NOTHING",
                (user_id, username or "", first_name or "", datetime.utcnow().isoformat()),
            )

    async def save_profile(self, data: dict) -> None:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO profiles (
                    user_id, game, nickname, rank, role, playtime, looking_for,
                    region, language, contact, has_mic, description, is_active, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1, $13)
                ON CONFLICT (user_id) DO UPDATE SET
                    game=EXCLUDED.game, nickname=EXCLUDED.nickname, rank=EXCLUDED.rank,
                    role=EXCLUDED.role, playtime=EXCLUDED.playtime, looking_for=EXCLUDED.looking_for,
                    region=EXCLUDED.region, language=EXCLUDED.language, contact=EXCLUDED.contact,
                    has_mic=EXCLUDED.has_mic, description=EXCLUDED.description, is_active=1,
                    updated_at=EXCLUDED.updated_at
                """,
                (
                    data["user_id"], data["game"], data["nickname"], data["rank"], data["role"],
                    data["playtime"], data["looking_for"], data.get("region", ""),
                    data.get("language", "RU"), data["contact"], int(data.get("has_mic", True)),
                    data.get("description", ""), now,
                ),
            )

    async def get_profile(self, user_id: int) -> dict | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM profiles WHERE user_id = $1 AND is_active = 1", user_id)
            return dict(row) if row else None

    async def deactivate_profile(self, user_id: int) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute("UPDATE profiles SET is_active = 0 WHERE user_id = $1", user_id)

    async def list_profiles_by_game(self, game: str, exclude_user_id: int | None = None) -> list[dict]:
        async with self.pool.acquire() as conn:
            if exclude_user_id:
                rows = await conn.fetch(
                    "SELECT * FROM profiles WHERE game = $1 AND is_active = 1 AND user_id != $2",
                    game, exclude_user_id,
                )
            else:
                rows = await conn.fetch(
                    "SELECT * FROM profiles WHERE game = $1 AND is_active = 1",
                    game,
                )
            return [dict(r) for r in rows]

    async def record_purchase(self, user_id: int, product_key: str, stars: int, charge_id: str | None) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO purchases (user_id, product_key, stars_amount, charge_id, created_at) VALUES ($1, $2, $3, $4, $5)",
                (user_id, product_key, stars, charge_id, datetime.utcnow().isoformat()),
            )

    async def unlock_content(self, user_id: int, content_id: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO unlocked_content (user_id, content_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                (user_id, content_id, datetime.utcnow().isoformat()),
            )

    async def has_unlocked(self, user_id: int, content_id: str) -> bool:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT 1 FROM unlocked_content WHERE user_id = $1 AND content_id = $2",
                user_id, content_id,
            )
            return row is not None

    async def add_search_boost(self, user_id: int, game: str, uses: int = 3) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO search_boosts (user_id, game, uses_left, created_at) VALUES ($1, $2, $3, $4)",
                (user_id, game, uses, datetime.utcnow().isoformat()),
            )

    async def consume_search_boost(self, user_id: int, game: str) -> bool:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, uses_left FROM search_boosts WHERE user_id = $1 AND game = $2 AND uses_left > 0 ORDER BY id DESC LIMIT 1",
                user_id, game,
            )
            if not row:
                return False
            await conn.execute("UPDATE search_boosts SET uses_left = uses_left - 1 WHERE id = $1", row["id"])
            return True

    async def has_search_boost(self, user_id: int, game: str) -> bool:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT 1 FROM search_boosts WHERE user_id = $1 AND game = $2 AND uses_left > 0 LIMIT 1",
                user_id, game,
            )
            return row is not None

    async def highlight_profile(self, user_id: int, hours: int = 24) -> None:
        until = (datetime.utcnow() + timedelta(hours=hours)).isoformat()
        async with self.pool.acquire() as conn:
            await conn.execute("UPDATE profiles SET highlighted_until = $1 WHERE user_id = $2", until, user_id)

    async def stats(self) -> dict:
        async with self.pool.acquire() as conn:
            return {
                "users": await conn.fetchval("SELECT COUNT(*) FROM users"),
                "profiles": await conn.fetchval("SELECT COUNT(*) FROM profiles WHERE is_active = 1"),
                "purchases": await conn.fetchval("SELECT COUNT(*) FROM purchases"),
                "stars": await conn.fetchval("SELECT COALESCE(SUM(stars_amount), 0) FROM purchases"),
            }

    async def set_pro_status(self, user_id: int, days: int = 30) -> None:
        until = (datetime.utcnow() + timedelta(days=days)).isoformat()
        async with self.pool.acquire() as conn:
            await conn.execute("UPDATE users SET pro_until = $1 WHERE user_id = $2", until, user_id)

    async def is_pro(self, user_id: int) -> bool:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT pro_until FROM users WHERE user_id = $1", user_id)
            if not row or not row["pro_until"]:
                return False
            return datetime.fromisoformat(row["pro_until"]) > datetime.utcnow()

    async def unlock_contact(self, user_id: int, profile_id: int) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO contact_unlocks (user_id, profile_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                (user_id, profile_id, datetime.utcnow().isoformat()),
            )

    async def has_unlocked_contact(self, user_id: int, profile_id: int) -> bool:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT 1 FROM contact_unlocks WHERE user_id = $1 AND profile_id = $2",
                user_id, profile_id,
            )
            return row is not None

    async def create_team(self, captain_id: int, game: str, name: str, description: str, max_players: int) -> int:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "INSERT INTO teams (captain_id, game, name, description, max_players, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                (captain_id, game, name, description, max_players, datetime.utcnow().isoformat()),
            )
            return row["id"]

    async def get_team(self, team_id: int) -> dict | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM teams WHERE id = $1", team_id)
            return dict(row) if row else None

    async def list_teams(self, game: str | None = None) -> list[dict]:
        async with self.pool.acquire() as conn:
            if game:
                rows = await conn.fetch("SELECT * FROM teams WHERE game = $1", game)
            else:
                rows = await conn.fetch("SELECT * FROM teams")
            return [dict(r) for r in rows]

    async def apply_to_team(self, team_id: int, user_id: int, message: str) -> int:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "INSERT INTO team_applications (team_id, user_id, message, status, created_at) VALUES ($1, $2, $3, 'pending', $4) RETURNING id",
                (team_id, user_id, message, datetime.utcnow().isoformat()),
            )
            return row["id"]

    async def get_team_applications(self, team_id: int, status: str | None = None) -> list[dict]:
        async with self.pool.acquire() as conn:
            if status:
                rows = await conn.fetch(
                    "SELECT * FROM team_applications WHERE team_id = $1 AND status = $2 ORDER BY created_at DESC",
                    team_id, status,
                )
            else:
                rows = await conn.fetch(
                    "SELECT * FROM team_applications WHERE team_id = $1 ORDER BY created_at DESC",
                    team_id,
                )
            return [dict(r) for r in rows]

    async def update_application_status(self, app_id: int, status: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute("UPDATE team_applications SET status = $1 WHERE id = $2", status, app_id)

    async def get_user_applications(self, user_id: int) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM team_applications WHERE user_id = $1 ORDER BY created_at DESC",
                user_id,
            )
            return [dict(r) for r in rows]
