import asyncpg
from datetime import datetime, timedelta

from data.games import DEFAULT_PROMO_CODES


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
    is_premium INTEGER DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS user_inventory (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    item_key TEXT NOT NULL,
    item_name TEXT NOT NULL,
    item_rarity TEXT NOT NULL,
    sell_price INTEGER NOT NULL,
    grants_premium INTEGER DEFAULT 0,
    acquired_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS case_opens (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    case_id TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    item_key TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS user_quests (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    quest_id TEXT NOT NULL,
    progress_minutes INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, quest_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS user_currency (
    user_id BIGINT PRIMARY KEY,
    coins INTEGER DEFAULT 0,
    stars INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS mini_app_profiles (
    user_id BIGINT PRIMARY KEY,
    avatar TEXT,
    nick TEXT,
    bio TEXT,
    deco TEXT DEFAULT 'orange',
    unlocked_decos TEXT DEFAULT 'orange',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS user_battlepass (
    user_id BIGINT PRIMARY KEY,
    bp_premium INTEGER DEFAULT 0,
    bp_xp INTEGER DEFAULT 0,
    claimed_tiers TEXT DEFAULT '[]',
    claimed_count INTEGER DEFAULT 0,
    last_claim_at TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS promo_codes (
    code TEXT PRIMARY KEY,
    reward_json TEXT NOT NULL,
    max_uses INTEGER NOT NULL,
    uses INTEGER DEFAULT 0,
    created_by_user_id BIGINT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
    user_id BIGINT NOT NULL,
    code TEXT NOT NULL,
    redeemed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, code),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS referrals (
    user_id BIGINT PRIMARY KEY,
    referral_code TEXT NOT NULL UNIQUE,
    invited_count INTEGER DEFAULT 0,
    referral_earned_coins INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS daily_streaks (
    user_id BIGINT PRIMARY KEY,
    streak_day INTEGER DEFAULT 0,
    last_streak_at TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS user_achievements (
    user_id BIGINT NOT NULL,
    achievement_id TEXT NOT NULL,
    claimed INTEGER DEFAULT 0,
    claimed_at TEXT,
    PRIMARY KEY (user_id, achievement_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
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
            await self.seed_default_promo_codes(conn)

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

    async def _column_exists(self, conn: asyncpg.Connection, table: str, column: str) -> bool:
        row = await conn.fetchrow(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_name = $1 AND column_name = $2
            """,
            table, column,
        )
        return row is not None

    async def _migrate(self, conn: asyncpg.Connection) -> None:
        # Legacy columns added during previous deploys
        try:
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_until TEXT")
        except asyncpg.PostgresError:
            pass

        try:
            await conn.execute("ALTER TABLE team_applications ADD COLUMN IF NOT EXISTS is_premium INTEGER DEFAULT 0")
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

        # ---------- Mini App / Nexus tables ----------
        # If these tables were created by an earlier version that lacked some
        # columns, ADD COLUMN IF NOT EXISTS brings them up to the current schema.
        column_migrations = [
            ("user_inventory", "user_id", "BIGINT"),
            ("user_inventory", "item_key", "TEXT NOT NULL DEFAULT ''"),
            ("user_inventory", "item_name", "TEXT NOT NULL DEFAULT ''"),
            ("user_inventory", "item_rarity", "TEXT NOT NULL DEFAULT ''"),
            ("user_inventory", "sell_price", "INTEGER NOT NULL DEFAULT 0"),
            ("user_inventory", "grants_premium", "INTEGER NOT NULL DEFAULT 0"),
            ("user_inventory", "acquired_at", "TEXT NOT NULL DEFAULT ''"),

            ("case_opens", "user_id", "BIGINT"),
            ("case_opens", "case_id", "TEXT NOT NULL DEFAULT ''"),
            ("case_opens", "opened_at", "TEXT NOT NULL DEFAULT ''"),
            ("case_opens", "item_key", "TEXT NOT NULL DEFAULT ''"),

            ("user_quests", "user_id", "BIGINT"),
            ("user_quests", "quest_id", "TEXT NOT NULL DEFAULT ''"),
            ("user_quests", "progress_minutes", "INTEGER NOT NULL DEFAULT 0"),
            ("user_quests", "completed", "INTEGER NOT NULL DEFAULT 0"),
            ("user_quests", "updated_at", "TEXT NOT NULL DEFAULT ''"),

            ("user_currency", "coins", "INTEGER NOT NULL DEFAULT 0"),
            ("user_currency", "stars", "INTEGER NOT NULL DEFAULT 0"),
            ("user_currency", "points", "INTEGER NOT NULL DEFAULT 0"),
            ("user_currency", "updated_at", "TEXT NOT NULL DEFAULT ''"),

            ("mini_app_profiles", "avatar", "TEXT"),
            ("mini_app_profiles", "nick", "TEXT"),
            ("mini_app_profiles", "bio", "TEXT"),
            ("mini_app_profiles", "deco", "TEXT NOT NULL DEFAULT 'orange'"),
            ("mini_app_profiles", "unlocked_decos", "TEXT NOT NULL DEFAULT 'orange'"),
            ("mini_app_profiles", "updated_at", "TEXT NOT NULL DEFAULT ''"),

            ("user_battlepass", "bp_premium", "INTEGER NOT NULL DEFAULT 0"),
            ("user_battlepass", "bp_xp", "INTEGER NOT NULL DEFAULT 0"),
            ("user_battlepass", "claimed_tiers", "TEXT NOT NULL DEFAULT '[]'"),
            ("user_battlepass", "claimed_count", "INTEGER NOT NULL DEFAULT 0"),
            ("user_battlepass", "last_claim_at", "TEXT"),
            ("user_battlepass", "updated_at", "TEXT NOT NULL DEFAULT ''"),

            ("promo_codes", "reward_json", "TEXT NOT NULL DEFAULT '{}'"),
            ("promo_codes", "max_uses", "INTEGER NOT NULL DEFAULT 0"),
            ("promo_codes", "uses", "INTEGER NOT NULL DEFAULT 0"),
            ("promo_codes", "created_by_user_id", "BIGINT"),
            ("promo_codes", "created_at", "TEXT NOT NULL DEFAULT ''"),

            ("promo_redemptions", "user_id", "BIGINT"),
            ("promo_redemptions", "code", "TEXT NOT NULL DEFAULT ''"),
            ("promo_redemptions", "redeemed_at", "TEXT NOT NULL DEFAULT ''"),

            ("referrals", "referral_code", "TEXT NOT NULL DEFAULT ''"),
            ("referrals", "invited_count", "INTEGER NOT NULL DEFAULT 0"),
            ("referrals", "referral_earned_coins", "INTEGER NOT NULL DEFAULT 0"),
            ("referrals", "updated_at", "TEXT NOT NULL DEFAULT ''"),

            ("daily_streaks", "streak_day", "INTEGER NOT NULL DEFAULT 0"),
            ("daily_streaks", "last_streak_at", "TEXT"),
            ("daily_streaks", "updated_at", "TEXT NOT NULL DEFAULT ''"),

            ("user_achievements", "user_id", "BIGINT"),
            ("user_achievements", "achievement_id", "TEXT NOT NULL DEFAULT ''"),
            ("user_achievements", "claimed", "INTEGER NOT NULL DEFAULT 0"),
            ("user_achievements", "claimed_at", "TEXT"),
        ]

        for table, column, col_type in column_migrations:
            try:
                await conn.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}")
            except asyncpg.PostgresError as e:
                print(f"Migration warning for {table}.{column}: {e}")

        # Safety check: per-user tables that received a new user_id column may
        # contain pre-existing rows with NULL user_id. The rows are not deleted,
        # but they become invisible to user-scoped SELECTs. Log a warning so it
        # can be investigated if it ever happens.
        user_scoped_tables = [
            "user_inventory", "case_opens", "user_quests", "promo_redemptions",
            "user_achievements", "user_battlepass", "daily_streaks", "referrals",
            "mini_app_profiles", "user_currency",
        ]
        for table in user_scoped_tables:
            if await self._column_exists(conn, table, "user_id"):
                try:
                    count = await conn.fetchval(f"SELECT COUNT(*) FROM {table} WHERE user_id IS NULL")
                    if count:
                        print(f"Migration warning: {table} has {count} rows with NULL user_id")
                except asyncpg.PostgresError as e:
                    print(f"Migration warning while checking {table}.user_id: {e}")

        # Data migration: older promo_codes tables used column name `reward` instead of `reward_json`
        if await self._column_exists(conn, "promo_codes", "reward") and await self._column_exists(conn, "promo_codes", "reward_json"):
            try:
                await conn.execute(
                    "UPDATE promo_codes SET reward_json = reward::text WHERE reward_json = '{}' OR reward_json IS NULL"
                )
            except asyncpg.PostgresError as e:
                print(f"Promo reward data migration warning: {e}")

        # promo_codes is the only table that could have had real production rows
        # before this migration. If any row still has no reward data, fail loudly
        # so we don't silently serve broken promo codes.
        if await self._column_exists(conn, "promo_codes", "reward_json"):
            try:
                bad = await conn.fetchval(
                    "SELECT COUNT(*) FROM promo_codes WHERE reward_json IS NULL OR reward_json = '{}'"
                )
                if bad:
                    raise RuntimeError(
                        f"promo_codes contains {bad} rows with empty reward_json after migration. "
                        "Manual cleanup is required because these rows existed before the migration and have no reward data."
                    )
            except asyncpg.PostgresError as e:
                print(f"Migration warning while checking promo_codes.reward_json: {e}")

    async def ensure_user(self, user_id: int, username: str | None, first_name: str | None) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO users (user_id, username, first_name, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO NOTHING",
                user_id, username or "", first_name or "", datetime.utcnow().isoformat(),
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
                data["user_id"], data["game"], data["nickname"], data["rank"], data["role"],
                data["playtime"], data["looking_for"], data.get("region", ""),
                data.get("language", "RU"), data["contact"], int(data.get("has_mic", True)),
                data.get("description", ""), now,
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
                user_id, product_key, stars, charge_id, datetime.utcnow().isoformat(),
            )

    async def unlock_content(self, user_id: int, content_id: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO unlocked_content (user_id, content_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                user_id, content_id, datetime.utcnow().isoformat(),
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
                user_id, game, uses, datetime.utcnow().isoformat(),
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

    async def set_pro_status(self, user_id: int, days: int = 30, conn: asyncpg.Connection | None = None) -> None:
        until = (datetime.utcnow() + timedelta(days=days)).isoformat()
        sql = "UPDATE users SET pro_until = $1 WHERE user_id = $2"
        params = (until, user_id)
        if conn is None:
            async with self.pool.acquire() as conn:
                await conn.execute(sql, *params)
        else:
            await conn.execute(sql, *params)

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
                user_id, profile_id, datetime.utcnow().isoformat(),
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
                captain_id, game, name, description, max_players, datetime.utcnow().isoformat(),
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

    async def apply_to_team(self, team_id: int, user_id: int, message: str, is_premium: bool = False) -> int:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "INSERT INTO team_applications (team_id, user_id, message, status, is_premium, created_at) VALUES ($1, $2, $3, 'pending', $4, $5) RETURNING id",
                team_id, user_id, message, int(is_premium), datetime.utcnow().isoformat(),
            )
            return row["id"]

    async def get_team_applications(self, team_id: int, status: str | None = None) -> list[dict]:
        async with self.pool.acquire() as conn:
            if status:
                rows = await conn.fetch(
                    "SELECT * FROM team_applications WHERE team_id = $1 AND status = $2 ORDER BY is_premium DESC, created_at DESC",
                    team_id, status,
                )
            else:
                rows = await conn.fetch(
                    "SELECT * FROM team_applications WHERE team_id = $1 ORDER BY is_premium DESC, created_at DESC",
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

    async def add_premium_application_credit(self, user_id: int, credits: int = 1) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_app_credits INTEGER DEFAULT 0"
            )
            await conn.execute(
                "UPDATE users SET premium_app_credits = COALESCE(premium_app_credits, 0) + $1 WHERE user_id = $2",
                credits, user_id,
            )

    async def consume_premium_application_credit(self, user_id: int) -> bool:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_app_credits INTEGER DEFAULT 0"
            )
            row = await conn.fetchrow(
                "SELECT premium_app_credits FROM users WHERE user_id = $1",
                user_id,
            )
            if not row or not row["premium_app_credits"]:
                return False
            await conn.execute(
                "UPDATE users SET premium_app_credits = premium_app_credits - 1 WHERE user_id = $1",
                user_id,
            )
            return True

    # Currency methods
    async def get_currency(self, user_id: int) -> dict:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT coins, stars, points FROM user_currency WHERE user_id = $1",
                user_id,
            )
            if not row:
                return {"coins": 0, "stars": 0, "points": 0}
            return {"coins": row["coins"], "stars": row["stars"], "points": row["points"]}

    async def add_coins(self, user_id: int, amount: int) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO user_currency (user_id, coins, stars, points, updated_at)
                VALUES ($1, $2, 0, 0, $3)
                ON CONFLICT (user_id) DO UPDATE SET
                    coins = user_currency.coins + $2,
                    updated_at = $3
                """,
                user_id, amount, datetime.utcnow().isoformat(),
            )

    async def spend_stars(self, user_id: int, amount: int) -> bool:
        return await self.adjust_currency(user_id, stars=-amount)

    # Case methods
    async def get_case_opens_today(self, user_id: int, case_id: str) -> int:
        async with self.pool.acquire() as conn:
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            row = await conn.fetchrow(
                """
                SELECT COUNT(*) as count FROM case_opens
                WHERE user_id = $1 AND case_id = $2 AND opened_at >= $3
                """,
                user_id, case_id, today_start,
            )
            return row["count"] if row else 0

    async def record_case_open(self, user_id: int, case_id: str, item_key: str, conn: asyncpg.Connection | None = None) -> None:
        now = datetime.utcnow().isoformat()
        sql = "INSERT INTO case_opens (user_id, case_id, opened_at, item_key) VALUES ($1, $2, $3, $4)"
        params = (user_id, case_id, now, item_key)
        if conn is None:
            async with self.pool.acquire() as conn:
                await conn.execute(sql, *params)
        else:
            await conn.execute(sql, *params)

    # Inventory methods
    async def add_to_inventory(self, user_id: int, item_key: str, item_name: str,
                                 item_rarity: str, sell_price: int, grants_premium: bool = False,
                                 conn: asyncpg.Connection | None = None) -> None:
        now = datetime.utcnow().isoformat()
        sql = """
            INSERT INTO user_inventory (user_id, item_key, item_name, item_rarity, sell_price, grants_premium, acquired_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        """
        params = (user_id, item_key, item_name, item_rarity, sell_price, int(grants_premium), now)
        if conn is None:
            async with self.pool.acquire() as conn:
                await conn.execute(sql, *params)
        else:
            await conn.execute(sql, *params)

    async def get_inventory(self, user_id: int) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM user_inventory WHERE user_id = $1 ORDER BY acquired_at DESC",
                user_id,
            )
            return [dict(r) for r in rows]

    async def remove_from_inventory(self, item_id: int, user_id: int) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM user_inventory WHERE id = $1 AND user_id = $2",
                item_id, user_id,
            )
            return result == "DELETE 1"

    # Quests methods
    async def get_all_quests_progress(self, user_id: int) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM user_quests WHERE user_id = $1",
                user_id,
            )
            return [dict(r) for r in rows]

    async def update_quest_progress(self, user_id: int, quest_id: str, minutes: int) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO user_quests (user_id, quest_id, progress_minutes, completed, updated_at)
                VALUES ($1, $2, $3, 0, $4)
                ON CONFLICT (user_id, quest_id) DO UPDATE SET
                    progress_minutes = user_quests.progress_minutes + $3,
                    updated_at = $4
                """,
                user_id, quest_id, minutes, datetime.utcnow().isoformat(),
            )

    async def complete_quest(self, user_id: int, quest_id: int) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE user_quests SET completed = 1, updated_at = $1 WHERE id = $2 AND user_id = $3",
                datetime.utcnow().isoformat(), quest_id, user_id,
            )
            return result == "UPDATE 1"

    # Leaderboard method
    async def get_leaderboard(self, limit: int = 10) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT 
                    u.user_id,
                    u.username,
                    u.first_name,
                    COALESCE(uc2.coins, 0) as coins,
                    COALESCE(uc2.stars, 0) as stars,
                    u.pro_until IS NOT NULL AND u.pro_until > $2 as is_premium
                FROM users u
                LEFT JOIN user_currency uc2 ON u.user_id = uc2.user_id
                ORDER BY COALESCE(uc2.coins, 0) DESC, COALESCE(uc2.stars, 0) DESC
                LIMIT $1
            """, limit, datetime.utcnow().isoformat())
            return [dict(r) for r in rows]

    # ---------- Mini App profile / customization ----------

    async def get_mini_app_profile(self, user_id: int) -> dict:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM mini_app_profiles WHERE user_id = $1", user_id)
            if not row:
                return {
                    "avatar": None,
                    "nick": None,
                    "bio": None,
                    "deco": "orange",
                    "unlocked_decos": ["orange"],
                }
            return {
                "avatar": row["avatar"],
                "nick": row["nick"],
                "bio": row["bio"],
                "deco": row["deco"],
                "unlocked_decos": row["unlocked_decos"].split(",") if row["unlocked_decos"] else ["orange"],
            }

    async def save_mini_app_profile(self, user_id: int, data: dict, conn: asyncpg.Connection | None = None) -> None:
        now = datetime.utcnow().isoformat()
        unlocked_decos = data.get("unlocked_decos")
        if isinstance(unlocked_decos, list):
            unlocked_decos = ",".join(unlocked_decos)
        elif not unlocked_decos:
            unlocked_decos = "orange"
        sql = """
            INSERT INTO mini_app_profiles (user_id, avatar, nick, bio, deco, unlocked_decos, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (user_id) DO UPDATE SET
                avatar = COALESCE(EXCLUDED.avatar, mini_app_profiles.avatar),
                nick = COALESCE(EXCLUDED.nick, mini_app_profiles.nick),
                bio = COALESCE(EXCLUDED.bio, mini_app_profiles.bio),
                deco = COALESCE(EXCLUDED.deco, mini_app_profiles.deco),
                unlocked_decos = COALESCE(EXCLUDED.unlocked_decos, mini_app_profiles.unlocked_decos),
                updated_at = EXCLUDED.updated_at
        """
        params = (
            user_id,
            data.get("avatar"),
            data.get("nick"),
            data.get("bio"),
            data.get("deco"),
            unlocked_decos,
            now,
        )
        if conn is None:
            async with self.pool.acquire() as conn:
                await conn.execute(sql, *params)
        else:
            await conn.execute(sql, *params)

    async def _unlock_decoration_conn(self, conn: asyncpg.Connection, user_id: int, deco_id: str) -> None:
        row = await conn.fetchrow("SELECT unlocked_decos FROM mini_app_profiles WHERE user_id = $1", user_id)
        unlocked = set(row["unlocked_decos"].split(",") if row and row["unlocked_decos"] else ["orange"])
        if deco_id in unlocked:
            return
        unlocked.add(deco_id)
        await self.save_mini_app_profile(user_id, {"unlocked_decos": sorted(unlocked)}, conn)

    async def unlock_decoration(self, user_id: int, deco_id: str) -> None:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await self._unlock_decoration_conn(conn, user_id, deco_id)

    # ---------- Currency (transaction-safe) ----------

    async def _adjust_currency_conn(self, conn: asyncpg.Connection, user_id: int, coins: int = 0, stars: int = 0, points: int = 0) -> bool:
        """Atomically adjust currency using an existing connection/transaction."""
        if coins == 0 and stars == 0 and points == 0:
            return True
        now = datetime.utcnow().isoformat()
        row = await conn.fetchrow(
            "SELECT coins, stars, points FROM user_currency WHERE user_id = $1 FOR UPDATE",
            user_id,
        )
        if not row:
            if coins < 0 or stars < 0 or points < 0:
                return False
            await conn.execute(
                "INSERT INTO user_currency (user_id, coins, stars, points, updated_at) VALUES ($1, $2, $3, $4, $5)",
                user_id, max(0, coins), max(0, stars), max(0, points), now,
            )
            return True
        new_coins = row["coins"] + coins
        new_stars = row["stars"] + stars
        new_points = row["points"] + points
        if new_coins < 0 or new_stars < 0 or new_points < 0:
            return False
        await conn.execute(
            "UPDATE user_currency SET coins = $1, stars = $2, points = $3, updated_at = $4 WHERE user_id = $5",
            new_coins, new_stars, new_points, now, user_id,
        )
        return True

    async def adjust_currency(self, user_id: int, coins: int = 0, stars: int = 0, points: int = 0) -> bool:
        """Atomically adjust currency. Negative values mean spend. Returns False if insufficient."""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                return await self._adjust_currency_conn(conn, user_id, coins, stars, points)

    async def spend_coins(self, user_id: int, amount: int) -> bool:
        return await self.adjust_currency(user_id, coins=-amount)

    async def get_last_case_open(self, user_id: int, case_id: str, conn: asyncpg.Connection | None = None) -> str | None:
        sql = "SELECT opened_at FROM case_opens WHERE user_id = $1 AND case_id = $2 ORDER BY opened_at DESC LIMIT 1"
        if conn is None:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(sql, user_id, case_id)
        else:
            row = await conn.fetchrow(sql, user_id, case_id)
        return row["opened_at"] if row else None

    # ---------- Battle Pass ----------

    async def get_battlepass(self, user_id: int) -> dict:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM user_battlepass WHERE user_id = $1", user_id)
            if not row:
                return {
                    "bp_premium": False,
                    "bp_xp": 0,
                    "claimed_tiers": [],
                    "claimed_count": 0,
                    "last_claim_at": None,
                }
            import json
            return {
                "bp_premium": bool(row["bp_premium"]),
                "bp_xp": row["bp_xp"],
                "claimed_tiers": json.loads(row["claimed_tiers"]) if row["claimed_tiers"] else [],
                "claimed_count": row["claimed_count"],
                "last_claim_at": row["last_claim_at"],
            }

    async def buy_battlepass_premium(self, user_id: int, price_stars: int) -> bool:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT bp_premium FROM user_battlepass WHERE user_id = $1 FOR UPDATE",
                    user_id,
                )
                if row and row["bp_premium"]:
                    return False
                if not await self._adjust_currency_conn(conn, user_id, stars=-price_stars):
                    return False
                now = datetime.utcnow().isoformat()
                await conn.execute(
                    """
                    INSERT INTO user_battlepass (user_id, bp_premium, bp_xp, claimed_tiers, claimed_count, last_claim_at, updated_at)
                    VALUES ($1, 1, 0, '[]', 0, NULL, $2)
                    ON CONFLICT (user_id) DO UPDATE SET bp_premium = 1, updated_at = EXCLUDED.updated_at
                    """,
                    user_id, now,
                )
                return True

    async def _apply_reward_conn(self, conn: asyncpg.Connection, user_id: int, reward: dict | None) -> None:
        """Grant a battle-pass / case reward inside an existing transaction."""
        if not reward:
            return
        rtype = reward.get("type")
        if rtype == "coins":
            await self._adjust_currency_conn(conn, user_id, coins=reward.get("amount", 0))
        elif rtype == "stars":
            await self._adjust_currency_conn(conn, user_id, stars=reward.get("amount", 0))
        elif rtype == "premium":
            await self.set_pro_status(user_id, days=1, conn=conn)
        elif rtype == "decoration":
            name = reward.get("name", "")
            deco_map = {"Cyber": "cyan", "Blood": "crimson", "Gold": "gold", "Neon": "orange"}
            for ru, en in deco_map.items():
                if ru in name:
                    await self._unlock_decoration_conn(conn, user_id, en)
                    break
            await self.set_pro_status(user_id, days=1, conn=conn)
        elif rtype == "item":
            await self.add_to_inventory(
                user_id,
                reward["key"],
                reward["name"],
                reward.get("rarity", "rare"),
                40,
                reward.get("rarity") in ("premium", "epic"),
                conn=conn,
            )
            if reward.get("rarity") in ("premium", "epic"):
                await self.set_pro_status(user_id, days=1, conn=conn)

    async def claim_battlepass_tier(self, user_id: int, tier: dict, is_premium: bool) -> bool:
        import json
        reward = tier["premium"] if is_premium else tier["free"]
        if not reward:
            return False
        tier_key = reward["key"]
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT bp_premium, bp_xp, claimed_tiers FROM user_battlepass WHERE user_id = $1 FOR UPDATE",
                    user_id,
                )
                bp_premium = bool(row["bp_premium"]) if row else False
                bp_xp = row["bp_xp"] if row else 0
                claimed_tiers = json.loads(row["claimed_tiers"]) if row and row["claimed_tiers"] else []
                if bp_xp < tier["xp"]:
                    return False
                if is_premium and not bp_premium:
                    return False
                if tier_key in claimed_tiers:
                    return False
                claimed_tiers.append(tier_key)
                await conn.execute(
                    "UPDATE user_battlepass SET claimed_tiers = $1, updated_at = $2 WHERE user_id = $3",
                    json.dumps(claimed_tiers), now, user_id,
                )
                await self._apply_reward_conn(conn, user_id, reward)
                return True

    async def claim_next_battlepass_tier(self, user_id: int) -> dict:
        import json
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT bp_premium, bp_xp, claimed_count, last_claim_at FROM user_battlepass WHERE user_id = $1 FOR UPDATE",
                    user_id,
                )
                if not row:
                    bp_premium = False
                    bp_xp = 0
                    claimed_count = 0
                    last_claim_at = None
                else:
                    bp_premium = bool(row["bp_premium"])
                    bp_xp = row["bp_xp"]
                    claimed_count = row["claimed_count"]
                    last_claim_at = row["last_claim_at"]

                from data.games import BATTLE_PASS_TIERS, BATTLE_PASS_XP_PER_LEVEL
                if claimed_count >= len(BATTLE_PASS_TIERS):
                    return {"ok": False, "error": "Все награды сезона собраны"}

                if last_claim_at:
                    last = datetime.fromisoformat(last_claim_at)
                    if (datetime.utcnow() - last).total_seconds() < 24 * 3600:
                        return {"ok": False, "error": "Следующая награда откроется позже"}

                tier = BATTLE_PASS_TIERS[claimed_count]
                new_claimed_count = claimed_count + 1
                new_bp_xp = bp_xp + BATTLE_PASS_XP_PER_LEVEL

                await conn.execute(
                    """
                    INSERT INTO user_battlepass (user_id, bp_premium, bp_xp, claimed_tiers, claimed_count, last_claim_at, updated_at)
                    VALUES ($1, $2, $3, '[]', $4, $5, $6)
                    ON CONFLICT (user_id) DO UPDATE SET
                        bp_premium = EXCLUDED.bp_premium,
                        bp_xp = EXCLUDED.bp_xp,
                        claimed_count = EXCLUDED.claimed_count,
                        last_claim_at = EXCLUDED.last_claim_at,
                        updated_at = EXCLUDED.updated_at
                    """,
                    user_id, int(bp_premium), new_bp_xp, new_claimed_count, now, now,
                )
                await self._apply_reward_conn(conn, user_id, tier["free"])
                if bp_premium:
                    await self._apply_reward_conn(conn, user_id, tier["premium"])
                return {"ok": True, "tier": tier, "bp_premium": bp_premium, "bp_xp": new_bp_xp}

    async def add_battlepass_xp(self, user_id: int, xp: int, conn: asyncpg.Connection | None = None) -> None:
        now = datetime.utcnow().isoformat()
        sql = """
            INSERT INTO user_battlepass (user_id, bp_premium, bp_xp, claimed_tiers, claimed_count, last_claim_at, updated_at)
            VALUES ($1, 0, $2, '[]', 0, NULL, $3)
            ON CONFLICT (user_id) DO UPDATE SET bp_xp = user_battlepass.bp_xp + $2, updated_at = EXCLUDED.updated_at
        """
        params = (user_id, xp, now)
        if conn is None:
            async with self.pool.acquire() as conn:
                await conn.execute(sql, *params)
        else:
            await conn.execute(sql, *params)

    async def seed_default_promo_codes(self, conn: asyncpg.Connection) -> None:
        import json
        now = datetime.utcnow().isoformat()
        for promo in DEFAULT_PROMO_CODES:
            await conn.execute(
                """
                INSERT INTO promo_codes (code, reward_json, max_uses, uses, created_by_user_id, created_at)
                VALUES ($1, $2, $3, 0, NULL, $4)
                ON CONFLICT (code) DO NOTHING
                """,
                promo["code"], json.dumps(promo["reward"]), promo["max_uses"], now,
            )

    async def get_promo_codes_with_redemption(self, user_id: int) -> dict:
        import json
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM promo_codes ORDER BY created_at DESC")
            codes = []
            for row in rows:
                codes.append({
                    "code": row["code"],
                    "reward": json.loads(row["reward_json"]),
                    "maxUses": row["max_uses"],
                    "uses": row["uses"],
                    "createdByUser": row["created_by_user_id"] == user_id,
                })
            redeemed_rows = await conn.fetch("SELECT code FROM promo_redemptions WHERE user_id = $1", user_id)
            return {"codes": codes, "redeemed": [r["code"] for r in redeemed_rows]}

    # ---------- Promo codes ----------

    async def create_promo_code(self, code: str, reward: dict, max_uses: int, created_by_user_id: int | None = None) -> bool:
        import json
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            try:
                await conn.execute(
                    "INSERT INTO promo_codes (code, reward_json, max_uses, uses, created_by_user_id, created_at) VALUES ($1, $2, $3, 0, $4, $5)",
                    code.upper(), json.dumps(reward), max(1, max_uses), created_by_user_id, now,
                )
                return True
            except asyncpg.UniqueViolationError:
                return False

    async def get_promo_code(self, code: str) -> dict | None:
        import json
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM promo_codes WHERE code = $1", code.upper())
            if not row:
                return None
            return {
                "code": row["code"],
                "reward": json.loads(row["reward_json"]),
                "max_uses": row["max_uses"],
                "uses": row["uses"],
                "created_by_user_id": row["created_by_user_id"],
            }

    async def count_user_created_promos_today(self, user_id: int) -> int:
        async with self.pool.acquire() as conn:
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            row = await conn.fetchrow(
                "SELECT COUNT(*) FROM promo_codes WHERE created_by_user_id = $1 AND created_at >= $2",
                user_id, today_start,
            )
            return row["count"] if row else 0

    async def redeem_promo_code(self, user_id: int, code: str) -> dict | None:
        import json
        code = code.upper()
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                redemption = await conn.fetchrow(
                    "SELECT 1 FROM promo_redemptions WHERE user_id = $1 AND code = $2",
                    user_id, code,
                )
                if redemption:
                    return None
                promo_row = await conn.fetchrow(
                    "SELECT reward_json, max_uses, uses FROM promo_codes WHERE code = $1 FOR UPDATE",
                    code,
                )
                if not promo_row:
                    return None
                if promo_row["uses"] >= promo_row["max_uses"]:
                    return None
                reward = json.loads(promo_row["reward_json"])
                await conn.execute(
                    "UPDATE promo_codes SET uses = uses + 1 WHERE code = $1",
                    code,
                )
                await conn.execute(
                    "INSERT INTO promo_redemptions (user_id, code, redeemed_at) VALUES ($1, $2, $3)",
                    user_id, code, now,
                )
                await self._adjust_currency_conn(
                    conn,
                    user_id,
                    coins=reward.get("coins", 0),
                    stars=reward.get("stars", 0),
                    points=reward.get("xp", 0),
                )
                return reward

    # ---------- Referrals ----------

    async def get_or_create_referral(self, user_id: int, code: str | None = None) -> dict:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM referrals WHERE user_id = $1", user_id)
            if row:
                return {
                    "referral_code": row["referral_code"],
                    "invited_count": row["invited_count"],
                    "referral_earned_coins": row["referral_earned_coins"],
                }
            now = datetime.utcnow().isoformat()
            if not code:
                code = "NX" + str(user_id) + datetime.utcnow().strftime("%H%M%S")
            try:
                await conn.execute(
                    "INSERT INTO referrals (user_id, referral_code, invited_count, referral_earned_coins, updated_at) VALUES ($1, $2, 0, 0, $3)",
                    user_id, code.upper(), now,
                )
                return {"referral_code": code.upper(), "invited_count": 0, "referral_earned_coins": 0}
            except asyncpg.UniqueViolationError:
                row = await conn.fetchrow("SELECT * FROM referrals WHERE user_id = $1", user_id)
                return {
                    "referral_code": row["referral_code"],
                    "invited_count": row["invited_count"],
                    "referral_earned_coins": row["referral_earned_coins"],
                }

    async def claim_referral_reward(self, referrer_user_id: int, referred_user_id: int, referral_reward: dict) -> bool:
        if referrer_user_id == referred_user_id:
            return False
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                already = await conn.fetchrow(
                    "SELECT 1 FROM referrals WHERE user_id = $1 AND invited_count > 0",
                    referred_user_id,
                )
                if already:
                    return False
                await conn.execute(
                    "UPDATE referrals SET invited_count = invited_count + 1, referral_earned_coins = referral_earned_coins + $1, updated_at = $2 WHERE user_id = $3",
                    referral_reward.get("coins", 0), now, referrer_user_id,
                )
                await self._adjust_currency_conn(
                    conn,
                    referrer_user_id,
                    coins=referral_reward.get("coins", 0),
                    stars=referral_reward.get("stars", 0),
                )
                await self._adjust_currency_conn(
                    conn,
                    referred_user_id,
                    coins=referral_reward.get("coins", 0),
                    stars=referral_reward.get("stars", 0),
                )
                return True

    # ---------- Daily streak ----------

    async def get_daily_streak(self, user_id: int) -> dict:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM daily_streaks WHERE user_id = $1", user_id)
            if not row:
                return {"streak_day": 0, "last_streak_at": None}
            return {"streak_day": row["streak_day"], "last_streak_at": row["last_streak_at"]}

    async def claim_daily_streak(self, user_id: int, rewards: list[dict]) -> dict:
        """Rewards is a list indexed by day-1 (0..6). Logic: <24h reject, <48h continue, else reset to 1."""
        now = datetime.utcnow()
        now_iso = now.isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT streak_day, last_streak_at FROM daily_streaks WHERE user_id = $1 FOR UPDATE",
                    user_id,
                )
                streak_day = row["streak_day"] if row else 0
                last_streak_at = row["last_streak_at"] if row else None

                if last_streak_at:
                    last = datetime.fromisoformat(last_streak_at)
                    since = (now - last).total_seconds()
                    if since < 24 * 3600:
                        return {"ok": False, "error": "Уже забрано — возвращайся завтра"}
                    if since < 48 * 3600:
                        next_day = min(7, streak_day + 1)
                    else:
                        next_day = 1
                else:
                    next_day = 1

                reward = rewards[next_day - 1] if next_day - 1 < len(rewards) else {"coins": 0}
                coins = reward.get("coins", 0)

                await conn.execute(
                    """
                    INSERT INTO daily_streaks (user_id, streak_day, last_streak_at, updated_at)
                    VALUES ($1, $2, $3, $3)
                    ON CONFLICT (user_id) DO UPDATE SET
                        streak_day = EXCLUDED.streak_day,
                        last_streak_at = EXCLUDED.last_streak_at,
                        updated_at = EXCLUDED.updated_at
                    """,
                    user_id, next_day, now_iso,
                )
                if coins > 0:
                    await self._adjust_currency_conn(conn, user_id, coins=coins)
                return {"ok": True, "day": next_day, "coins": coins}

    # ---------- Achievements ----------

    async def get_user_achievements(self, user_id: int) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM user_achievements WHERE user_id = $1", user_id)
            return [dict(r) for r in rows]

    async def claim_achievement(self, user_id: int, achievement_id: str, points: int, coins: int) -> bool:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT claimed FROM user_achievements WHERE user_id = $1 AND achievement_id = $2 FOR UPDATE",
                    user_id, achievement_id,
                )
                if row and row["claimed"]:
                    return False
                await conn.execute(
                    """
                    INSERT INTO user_achievements (user_id, achievement_id, claimed, claimed_at)
                    VALUES ($1, $2, 1, $3)
                    ON CONFLICT (user_id, achievement_id) DO UPDATE SET
                        claimed = 1,
                        claimed_at = EXCLUDED.claimed_at
                    WHERE user_achievements.claimed = 0
                    """,
                    user_id, achievement_id, now,
                )
                if await self._adjust_currency_conn(conn, user_id, coins=coins, points=points):
                    return True
                return False