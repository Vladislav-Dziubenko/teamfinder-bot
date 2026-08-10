import random

import asyncpg
from datetime import datetime, timedelta
from urllib.parse import urlparse

from data.games import DEFAULT_PROMO_CODES


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at TEXT NOT NULL,
    pro_until TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
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
    UNIQUE (user_id, game),
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
    quest_date TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, quest_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS user_currency (
    user_id BIGINT PRIMARY KEY,
    coins BIGINT DEFAULT 0,
    stars BIGINT DEFAULT 0,
    points BIGINT DEFAULT 0,
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
    games TEXT DEFAULT '',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS discord_connections (
    user_id BIGINT PRIMARY KEY,
    discord_id TEXT NOT NULL UNIQUE,
    discord_username TEXT,
    discord_global_name TEXT,
    discord_avatar TEXT,
    access_token TEXT,
    refresh_token TEXT,
    access_token_enc TEXT,
    refresh_token_enc TEXT,
    token_expires_at TEXT,
    connected_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_daily_claim_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS voice_sessions (
    id SERIAL PRIMARY KEY,
    telegram_user_id BIGINT,
    discord_user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    game_activity TEXT,
    joined_at TEXT NOT NULL,
    left_at TEXT,
    session_start TEXT NOT NULL,
    FOREIGN KEY (telegram_user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL,
    created_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
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
    referred_by BIGINT,
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

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    chat_id TEXT NOT NULL,
    sender_id BIGINT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_blocks (
    blocker_id BIGINT NOT NULL,
    blocked_id BIGINT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS chat_mutes (
    user_id BIGINT NOT NULL,
    chat_id TEXT NOT NULL,
    muted_at TEXT NOT NULL,
    PRIMARY KEY (user_id, chat_id)
);

CREATE TABLE IF NOT EXISTS global_messages (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id BIGINT PRIMARY KEY,
    role TEXT NOT NULL,
    granted_by BIGINT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS global_bans (
    user_id BIGINT PRIMARY KEY,
    banned_by BIGINT,
    reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS match_predictions (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    match_id TEXT,
    side TEXT,
    amount INTEGER NOT NULL,
    odds REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payout INTEGER DEFAULT 0,
    label TEXT DEFAULT '',
    team TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS pvp_challenges (
    id SERIAL PRIMARY KEY,
    creator_id BIGINT NOT NULL,
    creator_nick TEXT DEFAULT '',
    opponent_id BIGINT,
    opponent_nick TEXT DEFAULT '',
    condition TEXT NOT NULL,
    stake INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    winner_id BIGINT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (creator_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS user_stats (
    user_id BIGINT PRIMARY KEY,
    search_count INTEGER DEFAULT 0,
    contact_count INTEGER DEFAULT 0,
    team_app_count INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS user_friends (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    friend_id BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, friend_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (friend_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id BIGINT,
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS limited_models (
    model_id TEXT NOT NULL DEFAULT 'nexus-model',
    token_id INTEGER NOT NULL,
    owner_id BIGINT NOT NULL,
    acquired_at TEXT NOT NULL DEFAULT '',
    sale_price_stars INTEGER NOT NULL DEFAULT 0,
    listed_at TEXT,
    last_income_at TEXT,
    PRIMARY KEY (model_id, token_id)
);

CREATE TABLE IF NOT EXISTS case_open_requests (
    request_id TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    case_id TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_ad_watches (
    user_id BIGINT PRIMARY KEY,
    watch_count INTEGER NOT NULL DEFAULT 0,
    rewarded INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS user_activity_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    event TEXT NOT NULL,
    ts TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_ts ON user_activity_log (user_id, ts);

CREATE TABLE IF NOT EXISTS beta_state (
    user_id BIGINT PRIMARY KEY,
    case_balance INTEGER NOT NULL DEFAULT 0,
    last_grant TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS bot_reviews (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    rating INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    pros TEXT NOT NULL DEFAULT '',
    cons TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS user_last_message (
    user_id BIGINT PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    message_id BIGINT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);
"""

SCHEMA_STATEMENTS = [
    stmt.strip()
    for stmt in SCHEMA.split(";")
    if stmt.strip() and stmt.strip().startswith("CREATE TABLE")
]


class Database:
    def __init__(self, database_url: str, bot_token: str = "", fernet_key: str = ""):
        self.database_url = database_url
        self._bot_token = bot_token
        self._fernet_key = fernet_key or bot_token
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        # SSL включается для всех внешних хостов (Neon, Render, Supabase, Railway…).
        # Для локальной разработки (localhost / 127.0.0.1 / ::1) SSL не нужен.
        # Такой подход убирает хрупкую проверку по строке "render.com" и
        # автоматически покрывает Neon-хосты (*.neon.tech) и любые другие облачные БД.
        _host = urlparse(self.database_url).hostname or ""
        _local = {"localhost", "127.0.0.1", "::1"}
        ssl_arg: str | None = None if _host in _local else "require"

        self._pool = await asyncpg.create_pool(
            self.database_url,
            ssl=ssl_arg,
            min_size=2,
            max_size=10,
            command_timeout=30,
            timeout=15,
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
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'ru'")
        except asyncpg.PostgresError:
            pass

        try:
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT")
        except asyncpg.PostgresError:
            pass

        try:
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_searches_bonus INTEGER DEFAULT 0")
        except asyncpg.PostgresError:
            pass

        try:
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS free_gold_opens INTEGER DEFAULT 0")
        except asyncpg.PostgresError:
            pass

        try:
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_version INTEGER DEFAULT 0")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_at TEXT")
        except asyncpg.PostgresError:
            pass

        try:
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_claimed INTEGER DEFAULT 0")
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS free_contact_opens INTEGER DEFAULT 0")
        except asyncpg.PostgresError:
            pass

        try:
            await conn.execute("ALTER TABLE team_applications ADD COLUMN IF NOT EXISTS is_premium INTEGER DEFAULT 0")
        except asyncpg.PostgresError:
            pass

        try:
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_app_credits INTEGER DEFAULT 0")
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
        #
        # Security note: `table`, `column`, `col_type` in column_migrations are
        # compile-time constants defined in this source file — not user input.
        # Dynamic f-string SQL below is safe: no user-controlled data reaches
        # these identifiers. If you add a new entry, values must come from this
        # constant list, never from request bodies, query params, or DB reads.
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
            ("user_quests", "quest_date", "TEXT NOT NULL DEFAULT ''"),
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

            ("profiles", "searching_since", "TEXT"),
            ("user_achievements", "claimed", "INTEGER NOT NULL DEFAULT 0"),
            ("user_achievements", "claimed_at", "TEXT"),

            ("users", "last_active_at", "TEXT"),
            ("chat_messages", "read_at", "TEXT"),
            ("global_messages", "kind", "TEXT NOT NULL DEFAULT 'user'"),

            ("user_roles", "is_beta", "INTEGER NOT NULL DEFAULT 0"),

            ("beta_state", "user_id", "BIGINT"),
            ("beta_state", "case_balance", "INTEGER NOT NULL DEFAULT 0"),
            ("beta_state", "last_grant", "TEXT NOT NULL DEFAULT ''"),

            ("bot_reviews", "user_id", "BIGINT"),
            ("bot_reviews", "rating", "INTEGER NOT NULL DEFAULT 5"),
            ("bot_reviews", "text", "TEXT NOT NULL DEFAULT ''"),
            ("bot_reviews", "pros", "TEXT NOT NULL DEFAULT ''"),
            ("bot_reviews", "cons", "TEXT NOT NULL DEFAULT ''"),
            ("bot_reviews", "created_at", "TEXT NOT NULL DEFAULT ''"),
        ]

        for table, column, col_type in column_migrations:
            try:
                await conn.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}")
            except asyncpg.PostgresError as e:
                print(f"Migration warning for {table}.{column}: {e}")

        # Migrate existing beta_tester role -> is_beta flag (separate from staff role)
        try:
            await conn.execute(
                "UPDATE user_roles SET is_beta = 1, role = '' WHERE role = 'beta_tester'"
            )
        except asyncpg.PostgresError as e:
            print(f"Migration warning while converting beta_tester role: {e}")

        # Большие суммы не должны переполнять 32-битный INTEGER (лимит ~2.1 млрд).
        # Колонки уже существуют, поэтому нужен ALTER COLUMN TYPE (идемпотентно:
        # повторный прогон на BIGINT-колонке — no-op).
        for table, col in [
            ("user_currency", "coins"),
            ("user_currency", "stars"),
            ("user_currency", "points"),
            ("limited_models", "sale_price_stars"),
        ]:
            try:
                await conn.execute(f"ALTER TABLE {table} ALTER COLUMN {col} TYPE BIGINT")
            except asyncpg.PostgresError as e:
                print(f"Migration warning for {table}.{col} -> BIGINT: {e}")

        # Ежедневные задания: строки без quest_date (созданные до этой версии)
        # привязываем к сегодняшнему дню один раз, чтобы текущий прогресс не
        # обнулился сразу, а сброс начался со следующего дня.
        try:
            await conn.execute(
                "UPDATE user_quests SET quest_date = $1 WHERE quest_date = ''",
                datetime.utcnow().strftime("%Y-%m-%d"),
            )
        except asyncpg.PostgresError as e:
            print(f"Migration warning while backfilling user_quests.quest_date: {e}")

        # Safety check: per-user tables that received a new user_id column may
        # contain pre-existing rows with NULL user_id. The rows are not deleted,
        # but they become invisible to user-scoped SELECTs. Log a warning so it
        # can be investigated if it ever happens.
        #
        # Security note: `table` iterates over the constant `user_scoped_tables`
        # defined above — not user input. Dynamic SQL here is safe.
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

        # Discord OAuth: oauth_states table for PKCE/state storage
        try:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS oauth_states (
                    state TEXT PRIMARY KEY,
                    telegram_user_id BIGINT NOT NULL,
                    created_at TEXT NOT NULL,
                    used INTEGER NOT NULL DEFAULT 0
                )
            """)
        except asyncpg.PostgresError as e:
            print(f"Migration warning for oauth_states table: {e}")

        # Discord: add encrypted token columns to existing table
        for col, col_type in [
            ("access_token_enc", "TEXT"),
            ("refresh_token_enc", "TEXT"),
            ("last_daily_claim_at", "TEXT"),
        ]:
            try:
                await conn.execute(f"ALTER TABLE discord_connections ADD COLUMN IF NOT EXISTS {col} {col_type}")
            except asyncpg.PostgresError as e:
                print(f"Migration warning for discord_connections.{col}: {e}")

        # Discord: one-time welcome reward flag lives on users (survives unlink)
        try:
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_welcome_at TEXT")
        except asyncpg.PostgresError as e:
            print(f"Migration warning for users.discord_welcome_at: {e}")

        # Data migration: older promo_codes tables used column name `reward` instead of `reward_json`
        if await self._column_exists(conn, "promo_codes", "reward") and await self._column_exists(conn, "promo_codes", "reward_json"):
            try:
                await conn.execute(
                    "UPDATE promo_codes SET reward_json = reward::text WHERE reward_json = '{}' OR reward_json IS NULL"
                )
            except asyncpg.PostgresError as e:
                print(f"Promo reward data migration warning: {e}")

        # Older promo_codes schema stored created_at as a BIGINT millisecond
        # timestamp. The current schema expects TEXT (ISO 8601). Convert existing
        # values instead of dropping them.
        try:
            row = await conn.fetchrow(
                """
                SELECT data_type FROM information_schema.columns
                WHERE table_name = 'promo_codes' AND column_name = 'created_at'
                """
            )
            if row and row["data_type"] != "text":
                await conn.execute(
                    """
                    ALTER TABLE promo_codes
                    ALTER COLUMN created_at TYPE TEXT
                    USING to_char(
                        to_timestamp(created_at / 1000.0) AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US'
                    )
                    """
                )
                print("Migrated promo_codes.created_at from numeric timestamp to TEXT")
        except asyncpg.PostgresError as e:
            print(f"Migration warning for promo_codes.created_at: {e}")

        # promo_codes is the only table that could have had real production rows
        # before this migration. We run the strict check only once — on the first
        # startup after the migration — and then record that it passed. After that,
        # a future bug that creates a promo with an empty reward will not block
        # service restarts; it will be handled by normal API validation.
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS applied_migrations (
                name TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL
            )
            """
        )
        migration_name = "mini_app_promo_codes_reward_json_check_v1"
        already_applied = await conn.fetchval(
            "SELECT 1 FROM applied_migrations WHERE name = $1",
            migration_name,
        )
        # Multiple profiles per user: drop UNIQUE(user_id), add UNIQUE(user_id, game)
        try:
            await conn.execute("ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_key")
        except asyncpg.PostgresError as e:
            print(f"Migration warning dropping profiles_user_id_key: {e}")
        try:
            await conn.execute(
                "ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_game_key UNIQUE (user_id, game)"
            )
        except asyncpg.PostgresError as e:
            print(f"Migration warning adding profiles_user_id_game_key: {e}")

        # games column for mini_app_profiles — favorite games for profile card display
        try:
            await conn.execute("ALTER TABLE mini_app_profiles ADD COLUMN IF NOT EXISTS games TEXT DEFAULT ''")
        except asyncpg.PostgresError as e:
            print(f"Migration warning adding mini_app_profiles.games: {e}")

        # referred_by column for referrals — track who referred whom
        try:
            await conn.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_by BIGINT")
        except asyncpg.PostgresError as e:
            print(f"Migration warning adding referrals.referred_by: {e}")

        # referred_at + referral_reward_paid — отложенная выплата награды рефереру
        # (антифрод: награда не уходит мгновенно за ввод кода альт-аккаунтом)
        try:
            await conn.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_at TEXT DEFAULT ''")
        except asyncpg.PostgresError as e:
            print(f"Migration warning adding referrals.referred_at: {e}")
        try:
            await conn.execute("ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referral_reward_paid BOOLEAN DEFAULT FALSE")
        except asyncpg.PostgresError as e:
            print(f"Migration warning adding referrals.referral_reward_paid: {e}")

        # expires_at для global_bans — срок бана (пусто = навсегда)
        try:
            await conn.execute("ALTER TABLE global_bans ADD COLUMN IF NOT EXISTS expires_at TEXT DEFAULT ''")
        except asyncpg.PostgresError as e:
            print(f"Migration warning adding global_bans.expires_at: {e}")

        if not already_applied:
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
            await conn.execute(
                "INSERT INTO applied_migrations (name, applied_at) VALUES ($1, $2)",
                migration_name,
                datetime.utcnow().isoformat(),
            )

        # Legacy: старые экземпляры Mini Boss bro выпадали в user_inventory как
        # обычные предметы (sell_price=0) до внедрения limited_models. Переносим
        # их в limited_models с новыми токенами — тогда они появятся в тираже,
        # дают ежедневный доход и их можно продать за LIMITED_MODEL_SELL_PRICE.
        migration_name = "legacy_nexus_model_to_limited_v1"
        already_applied = await conn.fetchval(
            "SELECT 1 FROM applied_migrations WHERE name = $1",
            migration_name,
        )
        if not already_applied:
            try:
                async with conn.transaction():
                    await conn.execute("SELECT pg_advisory_xact_lock(hashtext('nexus-limited-model-claim'))")
                    old_rows = await conn.fetch(
                        "SELECT id, user_id, acquired_at FROM user_inventory WHERE item_key = 'nexus-model' ORDER BY id"
                    )
                    for r in old_rows:
                        count = await conn.fetchval(
                            "SELECT COUNT(*) FROM limited_models WHERE model_id = $1",
                            self.LIMITED_MODEL_ID,
                        )
                        if count >= self.LIMITED_MODEL_SUPPLY:
                            break
                        mx = await conn.fetchval(
                            "SELECT COALESCE(MAX(token_id), 0) FROM limited_models WHERE model_id = $1",
                            self.LIMITED_MODEL_ID,
                        )
                        token_id = mx + 1
                        await conn.execute(
                            "INSERT INTO limited_models (model_id, token_id, owner_id, acquired_at) VALUES ($1, $2, $3, $4)",
                            self.LIMITED_MODEL_ID, token_id, r["user_id"], r["acquired_at"],
                        )
                        await conn.execute("DELETE FROM user_inventory WHERE id = $1", r["id"])
                await conn.execute(
                    "INSERT INTO applied_migrations (name, applied_at) VALUES ($1, $2)",
                    migration_name,
                    datetime.utcnow().isoformat(),
                )
            except asyncpg.PostgresError as e:
                print(f"Migration warning legacy_nexus_model_to_limited: {e}")

        # Normalize old asymmetric dm-{id} chat_ids to symmetric dm-{a}-{b}
        try:
            await conn.execute("""
                WITH old_ids AS (
                    SELECT DISTINCT chat_id FROM chat_messages WHERE chat_id ~ '^dm-\\d+$'
                )
                UPDATE chat_messages cm
                SET chat_id = 'dm-' || LEAST(cm.sender_id, CAST(REPLACE(oi.chat_id, 'dm-', '') AS BIGINT))
                              || '-' || GREATEST(cm.sender_id, CAST(REPLACE(oi.chat_id, 'dm-', '') AS BIGINT))
                FROM old_ids oi
                WHERE cm.chat_id = oi.chat_id
            """)
        except asyncpg.PostgresError as e:
            print(f"Chat migration warning: {e}")

        # Performance indexes for frequent queries
        perf_indexes = [
            "CREATE INDEX IF NOT EXISTS idx_profiles_game_active ON profiles (game, is_active)",
            "CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_teams_game ON teams (game)",
            "CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_inventory_user ON user_inventory (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_team_applications_team ON team_applications (team_id)",
            "CREATE INDEX IF NOT EXISTS idx_case_opens_user ON case_opens (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_currency_user ON user_currency (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_battlepass_user ON user_battlepass (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_daily_streaks_user ON daily_streaks (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages (chat_id)",
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages (chat_id, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages (sender_id, chat_id)",
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages (chat_id, id DESC)",
            "CREATE INDEX IF NOT EXISTS idx_mini_app_profiles_user ON mini_app_profiles (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_limited_models_owner ON limited_models (owner_id)",
            "CREATE INDEX IF NOT EXISTS idx_match_predictions_user ON match_predictions (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_pvp_challenges_creator ON pvp_challenges (creator_id)",
            "CREATE INDEX IF NOT EXISTS idx_pvp_challenges_status ON pvp_challenges (status)",
            "CREATE INDEX IF NOT EXISTS idx_voice_sessions_discord_user ON voice_sessions (discord_user_id)",
            "CREATE INDEX IF NOT EXISTS idx_voice_sessions_channel ON voice_sessions (channel_id)",
            "CREATE INDEX IF NOT EXISTS idx_voice_sessions_telegram_user ON voice_sessions (telegram_user_id)",
        ]
        for idx_sql in perf_indexes:
            try:
                await conn.execute(idx_sql)
            except asyncpg.PostgresError as e:
                print(f"Index creation warning: {e}")

    async def ensure_user(self, user_id: int, username: str | None, first_name: str | None, avatar: str | None = None, last_name: str | None = None) -> None:
        now = datetime.utcnow().isoformat()
        default_avatar = f"/player-{((user_id % 4) + 1)}.webp"
        effective_avatar = avatar or default_avatar
        async with self.pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO users (user_id, username, first_name, last_name, created_at) VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (user_id) DO UPDATE SET
                       username = COALESCE(NULLIF(EXCLUDED.username, ''), users.username),
                       first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), users.first_name),
                       last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), users.last_name),
                       last_active_at = EXCLUDED.created_at""",
                user_id, username or "", first_name or "", last_name or "", now,
            )
            # Создаём mini_app_profiles запись, если её нет (для ника/аватарки в чате и списке друзей).
            # Реальный photo_url из Telegram должен заменять плейсхолдер /player-N.webp,
            # но не перетирать аватар, загруженный пользователем вручную.
            await conn.execute(
                """
                INSERT INTO mini_app_profiles (user_id, nick, avatar, updated_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id) DO UPDATE SET
                    nick = COALESCE(mini_app_profiles.nick, EXCLUDED.nick),
                    avatar = CASE
                        WHEN mini_app_profiles.avatar IS NULL
                          OR mini_app_profiles.avatar LIKE '/player-%'
                          THEN EXCLUDED.avatar
                        ELSE mini_app_profiles.avatar
                    END,
                    updated_at = $4
                """,
                user_id, first_name or username or f"User{user_id}", effective_avatar, now,
            )

    async def set_last_message(self, user_id: int, chat_id: int, message_id: int) -> None:
        """Запоминает последнее сообщение юзера боту — для forward_message админу."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO user_last_message (user_id, chat_id, message_id, updated_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id) DO UPDATE SET
                    chat_id = EXCLUDED.chat_id,
                    message_id = EXCLUDED.message_id,
                    updated_at = EXCLUDED.updated_at
                """,
                user_id, chat_id, message_id, datetime.utcnow().isoformat(),
            )

    async def get_last_message(self, user_id: int) -> dict | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT chat_id, message_id FROM user_last_message WHERE user_id = $1",
                user_id,
            )
        if not row:
            return None
        return {"chat_id": row["chat_id"], "message_id": row["message_id"]}

    async def get_user_language(self, user_id: int) -> str:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT language FROM users WHERE user_id = $1", user_id)
            return row["language"] if row and row["language"] else "ru"

    async def set_user_language(self, user_id: int, lang: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO users (user_id, username, first_name, created_at, language) VALUES ($1, '', '', $2, $3) ON CONFLICT (user_id) DO UPDATE SET language = EXCLUDED.language",
                user_id, datetime.utcnow().isoformat(), lang,
            )

    async def get_consent(self, user_id: int) -> int:
        """Версия принятого соглашения (0 — не принимал)."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT consent_version FROM users WHERE user_id = $1", user_id)
            return int(row["consent_version"] or 0) if row else 0

    async def set_consent(self, user_id: int, version: int) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE users SET consent_version = $1, consent_at = $2 WHERE user_id = $3",
                version, datetime.utcnow().isoformat(), user_id,
            )

    # Welcome-бонус: выдаётся один раз при первом входе в Mini App.
    # 500 звёзд + 10 бесплатных открытий премиум-кейса + 10 бесплатных
    # открытий анкет (контактов). Идемпотентно: флаг welcome_claimed.
    WELCOME_STARS = 500
    WELCOME_GOLD_OPENS = 10
    WELCOME_CONTACT_OPENS = 10

    async def claim_welcome_bonus(self, user_id: int) -> bool:
        """Начисляет приветственный бонус, если ещё не начислен. True — бонус выдан."""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                claimed = await conn.fetchval(
                    "UPDATE users SET welcome_claimed = 1, free_gold_opens = free_gold_opens + $1, free_contact_opens = free_contact_opens + $2 WHERE user_id = $3 AND welcome_claimed = 0 RETURNING 1",
                    self.WELCOME_GOLD_OPENS, self.WELCOME_CONTACT_OPENS, user_id,
                )
                if not claimed:
                    return False
                await conn.execute(
                    "INSERT INTO user_currency (user_id, coins, stars, points, updated_at) VALUES ($1, 0, $2, 0, $3) ON CONFLICT (user_id) DO UPDATE SET stars = stars + $2, updated_at = EXCLUDED.updated_at",
                    user_id, self.WELCOME_STARS, datetime.utcnow().isoformat(),
                )
                return True

    async def welcome_claimed(self, user_id: int) -> bool:
        """True если welcome-бонус этому юзеру уже выдан (быстрый SELECT по PK)."""
        async with self.pool.acquire() as conn:
            return bool(await conn.fetchval(
                "SELECT welcome_claimed FROM users WHERE user_id = $1", user_id
            ))

    async def consume_free_contact_open(self, user_id: int, conn: asyncpg.Connection | None = None) -> bool:
        """Списывает одно бесплатное открытие анкеты, если есть. True — списано."""
        async def _exec(c: asyncpg.Connection) -> bool:
            return await c.fetchval(
                "UPDATE users SET free_contact_opens = free_contact_opens - 1 WHERE user_id = $1 AND free_contact_opens > 0 RETURNING free_contact_opens",
                user_id,
            ) is not None
        if conn:
            return await _exec(conn)
        async with self.pool.acquire() as c:
            return await _exec(c)

    async def save_profile(self, data: dict) -> None:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO profiles (
                    user_id, game, nickname, rank, role, playtime, looking_for,
                    region, language, contact, has_mic, description, is_active, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1, $13)
                ON CONFLICT (user_id, game) DO UPDATE SET
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

            existing = await conn.fetchrow(
                "SELECT games FROM mini_app_profiles WHERE user_id = $1", data["user_id"]
            )
            current_games = set()
            if existing and existing["games"]:
                current_games = set(existing["games"].split(","))
            current_games.add(data["game"])
            await conn.execute(
                """
                INSERT INTO mini_app_profiles (user_id, nick, games, updated_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id) DO UPDATE SET
                    nick = EXCLUDED.nick,
                    games = EXCLUDED.games,
                    updated_at = EXCLUDED.updated_at
                """,
                data["user_id"], data["nickname"], ",".join(sorted(current_games)), now,
            )

    async def get_profile(self, user_id: int) -> dict | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM profiles WHERE user_id = $1 AND is_active = 1 ORDER BY updated_at DESC LIMIT 1",
                user_id,
            )
            return dict(row) if row else None

    async def get_user_profiles(self, user_id: int) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM profiles WHERE user_id = $1 AND is_active = 1 ORDER BY updated_at DESC",
                user_id,
            )
            return [dict(r) for r in rows]

    async def delete_profile(self, user_id: int) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM profiles WHERE user_id = $1",
                user_id,
            )
            return result != "DELETE 0"

    async def deactivate_profile(self, user_id: int) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE profiles SET is_active = 0 WHERE user_id = $1",
                user_id,
            )

    async def list_profiles_by_game(self, game: str, exclude_user_id: int | None = None) -> list[dict]:
        async with self.pool.acquire() as conn:
            like_pattern = f"%{game}%"
            if exclude_user_id:
                rows = await conn.fetch(
                    """SELECT p.*, COALESCE(mp.games, '') AS fav_games
                       FROM profiles p
                       LEFT JOIN mini_app_profiles mp ON p.user_id = mp.user_id
                       WHERE (p.game = $1 OR mp.games LIKE $2) AND p.is_active = 1 AND p.user_id != $3""",
                    game, like_pattern, exclude_user_id,
                )
            else:
                rows = await conn.fetch(
                    """SELECT p.*, COALESCE(mp.games, '') AS fav_games
                       FROM profiles p
                       LEFT JOIN mini_app_profiles mp ON p.user_id = mp.user_id
                       WHERE (p.game = $1 OR mp.games LIKE $2) AND p.is_active = 1""",
                    game, like_pattern,
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
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT id, uses_left FROM search_boosts WHERE user_id = $1 AND game = $2 AND uses_left > 0 ORDER BY id DESC LIMIT 1 FOR UPDATE",
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

    async def grant_jet_bonuses(self, user_id: int, bonuses: dict, conn: asyncpg.Connection | None = None) -> None:
        """Применяет бонусы от jet-предмета: stars, coins, searches, highlight_hours, premium_days, free_gold_opens."""
        async def _exec(c: asyncpg.Connection):
            if bonuses.get("stars"):
                await self._adjust_currency_conn(c, user_id, stars=bonuses["stars"])
            if bonuses.get("coins"):
                await self._adjust_currency_conn(c, user_id, coins=bonuses["coins"])
            if bonuses.get("searches"):
                await c.execute(
                    "UPDATE users SET daily_searches_bonus = daily_searches_bonus + $1 WHERE user_id = $2",
                    bonuses["searches"], user_id,
                )
            if bonuses.get("highlight_hours"):
                until = (datetime.utcnow() + timedelta(hours=bonuses["highlight_hours"])).isoformat()
                await c.execute("UPDATE profiles SET highlighted_until = $1 WHERE user_id = $2", until, user_id)
            if bonuses.get("premium_days"):
                until_val = await c.fetchval("SELECT pro_until FROM users WHERE user_id = $1", user_id)
                base = datetime.utcnow() if not until_val or datetime.fromisoformat(until_val) < datetime.utcnow() else datetime.fromisoformat(until_val)
                new_until = (base + timedelta(days=bonuses["premium_days"])).isoformat()
                await c.execute("UPDATE users SET pro_until = $1 WHERE user_id = $2", new_until, user_id)
            if bonuses.get("free_gold_opens"):
                await c.execute(
                    "UPDATE users SET free_gold_opens = free_gold_opens + $1 WHERE user_id = $2",
                    bonuses["free_gold_opens"], user_id,
                )
        if conn:
            await _exec(conn)
        else:
            async with self.pool.acquire() as c:
                await _exec(c)

    async def consume_free_gold_open(self, user_id: int, conn: asyncpg.Connection | None = None) -> bool:
        """Использует одно бесплатное открытие Nexus Premium. Возвращает True если успешно."""
        async def _exec(c: asyncpg.Connection) -> bool:
            return await c.fetchval(
                "UPDATE users SET free_gold_opens = free_gold_opens - 1 WHERE user_id = $1 AND free_gold_opens > 0 RETURNING free_gold_opens",
                user_id,
            ) is not None
        if conn:
            return await _exec(conn)
        async with self.pool.acquire() as c:
            return await _exec(c)

    async def get_free_gold_opens(self, user_id: int) -> int:
        async with self.pool.acquire() as conn:
            return await conn.fetchval(
                "SELECT COALESCE(free_gold_opens, 0) FROM users WHERE user_id = $1", user_id,
            ) or 0

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

    async def save_discord_connection(self, user_id: int, data: dict) -> None:
        import importlib
        crypto = importlib.import_module("webapp.crypto")
        now = datetime.utcnow().isoformat()
        access_enc = crypto.encrypt_token(data["access_token"], self._fernet_key) if self._fernet_key else ""
        refresh_enc = crypto.encrypt_token(data["refresh_token"], self._fernet_key) if self._fernet_key else ""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO discord_connections (user_id, discord_id, discord_username, discord_global_name,
                    discord_avatar, access_token, refresh_token, access_token_enc, refresh_token_enc, token_expires_at, connected_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (user_id) DO UPDATE SET
                    discord_id=EXCLUDED.discord_id, discord_username=EXCLUDED.discord_username,
                    discord_global_name=EXCLUDED.discord_global_name, discord_avatar=EXCLUDED.discord_avatar,
                    access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token,
                    access_token_enc=EXCLUDED.access_token_enc, refresh_token_enc=EXCLUDED.refresh_token_enc,
                    token_expires_at=EXCLUDED.token_expires_at, updated_at=EXCLUDED.updated_at
                """,
                user_id, data["discord_id"], data.get("discord_username"),
                data.get("discord_global_name"), data.get("discord_avatar"),
                "", "",  # plain columns left empty
                access_enc, refresh_enc,
                data.get("token_expires_at"), now, now,
            )

    async def get_discord_connection(self, user_id: int) -> dict | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM discord_connections WHERE user_id = $1", user_id)
            if not row:
                return None
            data = dict(row)
            if self._fernet_key:
                import importlib
                crypto = importlib.import_module("webapp.crypto")
                try:
                    at = data.get("access_token_enc")
                    rt = data.get("refresh_token_enc")
                    if at:
                        data["access_token"] = crypto.decrypt_token(at, self._fernet_key)
                    if rt:
                        data["refresh_token"] = crypto.decrypt_token(rt, self._fernet_key)
                except Exception:
                    pass
            return data

    async def remove_discord_connection(self, user_id: int) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute("DELETE FROM discord_connections WHERE user_id = $1", user_id)

    async def claim_discord_welcome_reward(self, user_id: int) -> dict:
        """Одноразовая награда за первую связку Discord: 300 монет + 24ч про."""
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT discord_welcome_at FROM users WHERE user_id = $1 FOR UPDATE",
                    user_id,
                )
                if not row or row["discord_welcome_at"]:
                    return {"claimed": False, "reason": "already"}
                ok = await self._adjust_currency_conn(conn, user_id, coins=300)
                if not ok:
                    return {"claimed": False, "reason": "no_user"}
                pro_until = await conn.fetchval(
                    "SELECT pro_until FROM users WHERE user_id = $1 FOR UPDATE", user_id
                )
                base = datetime.utcnow()
                if pro_until and datetime.fromisoformat(pro_until) > base:
                    base = datetime.fromisoformat(pro_until)
                await conn.execute(
                    "UPDATE users SET pro_until = $1, discord_welcome_at = $2 WHERE user_id = $3",
                    (base + timedelta(days=1)).isoformat(), now, user_id,
                )
                return {"claimed": True}

    async def claim_discord_daily_reward(self, user_id: int) -> dict:
        """Ежедневная награда за активную связку Discord: +10 ⭐ раз в 24ч."""
        now = datetime.utcnow()
        now_iso = now.isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT last_daily_claim_at FROM discord_connections WHERE user_id = $1 FOR UPDATE",
                    user_id,
                )
                if not row:
                    return {"claimed": False, "reason": "not_linked"}
                if row["last_daily_claim_at"]:
                    last = datetime.fromisoformat(row["last_daily_claim_at"])
                    if (now - last).total_seconds() < 24 * 3600:
                        return {
                            "claimed": False,
                            "reason": "cooldown",
                            "next_in_ms": max(0, int(24 * 3600 * 1000 - (now - last).total_seconds() * 1000)),
                        }
                await conn.execute(
                    "UPDATE discord_connections SET last_daily_claim_at = $1, updated_at = $1 WHERE user_id = $2",
                    now_iso, user_id,
                )
                ok = await self._adjust_currency_conn(conn, user_id, stars=10)
                if not ok:
                    return {"claimed": False, "reason": "no_user"}
                return {"claimed": True, "stars": 10}

    async def find_user_by_discord_id(self, discord_id: int) -> int | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT user_id FROM discord_connections WHERE discord_id = $1", str(discord_id))
            return row["user_id"] if row else None

    async def create_oauth_state(self, state: str, telegram_user_id: int) -> None:
        async with self.pool.acquire() as conn:
            now = datetime.utcnow().isoformat()
            await conn.execute(
                "INSERT INTO oauth_states (state, telegram_user_id, created_at, used) VALUES ($1, $2, $3, 0) ON CONFLICT (state) DO NOTHING",
                state, telegram_user_id, datetime.utcnow().isoformat(),
            )

    async def get_oauth_state(self, state: str) -> dict | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM oauth_states WHERE state = $1", state)
            return dict(row) if row else None

    async def mark_oauth_state_used(self, state: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute("UPDATE oauth_states SET used = 1 WHERE state = $1", state)

    async def cleanup_oauth_states(self) -> None:
        async with self.pool.acquire() as conn:
            cutoff = (datetime.utcnow() - timedelta(minutes=15)).isoformat()
            await conn.execute("DELETE FROM oauth_states WHERE created_at < $1", cutoff)

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
                "UPDATE users SET premium_app_credits = COALESCE(premium_app_credits, 0) + $1 WHERE user_id = $2",
                credits, user_id,
            )

    async def consume_premium_application_credit(self, user_id: int) -> bool:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT premium_app_credits FROM users WHERE user_id = $1 FOR UPDATE",
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

    async def add_stars(self, user_id: int, amount: int) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO user_currency (user_id, coins, stars, points, updated_at)
                VALUES ($1, 0, $2, 0, $3)
                ON CONFLICT (user_id) DO UPDATE SET
                    stars = user_currency.stars + $2,
                    updated_at = $3
                """,
                user_id, amount, datetime.utcnow().isoformat(),
            )

    async def spend_stars(self, user_id: int, amount: int) -> bool:
        return await self.adjust_currency(user_id, stars=-amount)

    # ---------- Limited 3D model (Nexus Premium jackpot) ----------
    # Лимитированная 3D-модель из золотого кейса. Тираж ограничен
    # LIMITED_MODEL_SUPPLY экземплярами, владение/продажа/передача — внутренняя
    # система (реальный ончейн-TON подключается отдельным этапом).
    LIMITED_MODEL_ID = "nexus-model"
    LIMITED_MODEL_SUPPLY = 20
    LIMITED_MODEL_WIN_STARS = 10000
    # Комиссия с продажи, уходящая разработчику (комиссия платформы + роялти 1-5%).
    LIMITED_MODEL_SALE_CUT = 0.05
    # Фиксированная плата (в звёздах) за передачу модели другому пользователю.
    LIMITED_MODEL_TRANSFER_FEE = 5
    # Выкуп модели разработчиком: владелец получает эту сумму звёзд на баланс, модель удаляется.
    LIMITED_MODEL_SELL_PRICE = 55000

    async def next_limited_token(self, conn: asyncpg.Connection) -> int | None:
        """Выдаёт следующий свободный номер экземпляра (1..SUPPLY) или None, если тираж распродан.
        Требует активной транзакции на conn (advisory lock исключает гонки)."""
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext('nexus-limited-model-claim'))")
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM limited_models WHERE model_id = $1",
            self.LIMITED_MODEL_ID,
        )
        if count >= self.LIMITED_MODEL_SUPPLY:
            return None
        mx = await conn.fetchval(
            "SELECT COALESCE(MAX(token_id), 0) FROM limited_models WHERE model_id = $1",
            self.LIMITED_MODEL_ID,
        )
        return mx + 1

    async def grant_limited_model(self, conn: asyncpg.Connection, user_id: int, token_id: int, dev_id: int | None) -> str:
        """Внутри текущей транзакции: владение моделью + 10 000 ⭐ + роль модератор/админ + пожизненный премиум.
        Возвращает выданную роль."""
        now = datetime.utcnow().isoformat()
        await conn.execute(
            "INSERT INTO limited_models (model_id, token_id, owner_id, acquired_at) VALUES ($1, $2, $3, $4)",
            self.LIMITED_MODEL_ID, token_id, user_id, now,
        )
        await self._adjust_currency_conn(conn, user_id, stars=self.LIMITED_MODEL_WIN_STARS)
        role = random.choice(["moderator", "admin"])
        await conn.execute(
            """INSERT INTO user_roles (user_id, role, granted_by, created_at)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (user_id) DO UPDATE SET role = $2, granted_by = $3, created_at = $4""",
            user_id, role, dev_id, now,
        )
        await conn.execute(
            "UPDATE users SET pro_until = $1 WHERE user_id = $2",
            "2100-01-01T00:00:00", user_id,
        )
        return role

    async def get_limited_models_state(self, user_id: int) -> dict:
        async with self.pool.acquire() as conn:
            mine_rows = await conn.fetch(
                "SELECT token_id, acquired_at, sale_price_stars, last_income_at FROM limited_models "
                "WHERE model_id = $1 AND owner_id = $2 ORDER BY token_id",
                self.LIMITED_MODEL_ID, user_id,
            )
            market_rows = await conn.fetch(
                """SELECT lm.token_id, lm.sale_price_stars, lm.listed_at,
                          COALESCE(mp.nick, '') AS seller_nick, mp.avatar
                   FROM limited_models lm
                   LEFT JOIN mini_app_profiles mp ON mp.user_id = lm.owner_id
                   WHERE lm.model_id = $1 AND lm.sale_price_stars > 0
                   ORDER BY lm.sale_price_stars ASC""",
                self.LIMITED_MODEL_ID,
            )
            claimed = await conn.fetchval(
                "SELECT COUNT(*) FROM limited_models WHERE model_id = $1",
                self.LIMITED_MODEL_ID,
            )
            return {
                "mine": [dict(r) for r in mine_rows],
                "market": [dict(r) for r in market_rows],
                "claimed": claimed,
                "remaining": max(0, self.LIMITED_MODEL_SUPPLY - claimed),
                "supply": self.LIMITED_MODEL_SUPPLY,
            }

    async def list_limited_model(self, owner_id: int, token_id: int, price: int) -> bool:
        if price <= 0:
            return False
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT 1 FROM limited_models WHERE model_id = $1 AND token_id = $2 AND owner_id = $3",
                    self.LIMITED_MODEL_ID, token_id, owner_id,
                )
                if not row:
                    return False
                await conn.execute(
                    "UPDATE limited_models SET sale_price_stars = $1, listed_at = $2 WHERE model_id = $3 AND token_id = $4",
                    price, now, self.LIMITED_MODEL_ID, token_id,
                )
                return True

    async def unlist_limited_model(self, owner_id: int, token_id: int) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE limited_models SET sale_price_stars = 0, listed_at = NULL "
                "WHERE model_id = $1 AND token_id = $2 AND owner_id = $3",
                self.LIMITED_MODEL_ID, token_id, owner_id,
            )
            return result == "UPDATE 1"

    async def buy_limited_model(self, buyer_id: int, token_id: int, dev_id: int | None) -> tuple[bool, str, int]:
        """Покупка выставленной модели. Покупатель платит цену, продавец получает цену-комиссию,
        разработчику уходит LIMITED_MODEL_SALE_CUT (комиссия + роялти)."""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT owner_id, sale_price_stars FROM limited_models "
                    "WHERE model_id = $1 AND token_id = $2 FOR UPDATE",
                    self.LIMITED_MODEL_ID, token_id,
                )
                if not row or row["sale_price_stars"] <= 0:
                    return False, "not listed", 0
                if row["owner_id"] == buyer_id:
                    return False, "own model", 0
                price = row["sale_price_stars"]
                if not await self._adjust_currency_conn(conn, buyer_id, stars=-price):
                    return False, "not enough stars", price
                seller_cut = int(price * (1 - self.LIMITED_MODEL_SALE_CUT))
                dev_cut = price - seller_cut
                await self._adjust_currency_conn(conn, row["owner_id"], stars=seller_cut)
                if dev_id:
                    await self._adjust_currency_conn(conn, dev_id, stars=dev_cut)
                now = datetime.utcnow().isoformat()
                await conn.execute(
                    "UPDATE limited_models SET owner_id = $1, sale_price_stars = 0, listed_at = NULL, acquired_at = $2 "
                    "WHERE model_id = $3 AND token_id = $4",
                    buyer_id, now, self.LIMITED_MODEL_ID, token_id,
                )
                return True, "ok", price

    async def transfer_limited_model(self, from_id: int, to_id: int, token_id: int, dev_id: int | None) -> tuple[bool, str]:
        """Прямая передача модели другому пользователю. Отправитель платит небольшую комиссию в звёздах."""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT owner_id FROM limited_models WHERE model_id = $1 AND token_id = $2 FOR UPDATE",
                    self.LIMITED_MODEL_ID, token_id,
                )
                if not row or row["owner_id"] != from_id:
                    return False, "not owner"
                if from_id == to_id:
                    return False, "same user"
                if not await self._adjust_currency_conn(conn, from_id, stars=-self.LIMITED_MODEL_TRANSFER_FEE):
                    return False, "not enough stars"
                if dev_id:
                    await self._adjust_currency_conn(conn, dev_id, stars=self.LIMITED_MODEL_TRANSFER_FEE)
                now = datetime.utcnow().isoformat()
                await conn.execute(
                    "UPDATE limited_models SET owner_id = $1, sale_price_stars = 0, listed_at = NULL, acquired_at = $2 "
                    "WHERE model_id = $3 AND token_id = $4",
                    to_id, now, self.LIMITED_MODEL_ID, token_id,
                )
                return True, "ok"

    async def sell_limited_model(self, owner_id: int, token_id: int) -> tuple[bool, str, int]:
        """Продажа модели разработчику: владелец получает LIMITED_MODEL_SELL_PRICE звёзд на баланс, модель удаляется."""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT owner_id FROM limited_models WHERE model_id = $1 AND token_id = $2 FOR UPDATE",
                    self.LIMITED_MODEL_ID, token_id,
                )
                if not row or row["owner_id"] != owner_id:
                    return False, "not owner", 0
                await self._adjust_currency_conn(conn, owner_id, stars=self.LIMITED_MODEL_SELL_PRICE)
                await conn.execute(
                    "DELETE FROM limited_models WHERE model_id = $1 AND token_id = $2",
                    self.LIMITED_MODEL_ID, token_id,
                )
                return True, "ok", self.LIMITED_MODEL_SELL_PRICE

    async def pay_limited_model_income(self) -> int:
        """Ежедневный доход владельцу модели: 50-100 ⭐ за каждый экземпляр, раз в сутки (UTC)."""
        today = datetime.utcnow().strftime("%Y-%m-%d")
        now = datetime.utcnow().isoformat()
        paid = 0
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                rows = await conn.fetch(
                    "SELECT owner_id, token_id FROM limited_models "
                    "WHERE model_id = $1 AND (last_income_at IS NULL OR SUBSTRING(last_income_at, 1, 10) <> $2) FOR UPDATE",
                    self.LIMITED_MODEL_ID, today,
                )
                for r in rows:
                    amount = random.randint(50, 100)
                    await self._adjust_currency_conn(conn, r["owner_id"], stars=amount)
                    await conn.execute(
                        "UPDATE limited_models SET last_income_at = $1 WHERE model_id = $2 AND token_id = $3",
                        now, self.LIMITED_MODEL_ID, r["token_id"],
                    )
                    paid += 1
        return paid

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
    # Ежедневные задания: прогресс и флаг completed сбрасываются при смене
    # календарного дня (quest_date хранит день в формате YYYY-MM-DD, UTC).
    async def get_all_quests_progress(self, user_id: int) -> list[dict]:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        now_iso = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE user_quests
                SET progress_minutes = 0, completed = 0, quest_date = $2, updated_at = $3
                WHERE user_id = $1 AND quest_date <> $2
                """,
                user_id, today, now_iso,
            )
            rows = await conn.fetch(
                "SELECT * FROM user_quests WHERE user_id = $1",
                user_id,
            )
            return [dict(r) for r in rows]

    async def update_quest_progress(self, user_id: int, quest_id: str, minutes: int) -> None:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO user_quests (user_id, quest_id, progress_minutes, completed, quest_date, updated_at)
                VALUES ($1, $2, $3, 0, $4, $5)
                ON CONFLICT (user_id, quest_id) DO UPDATE SET
                    progress_minutes = CASE WHEN user_quests.quest_date = $4
                        THEN user_quests.progress_minutes + $3
                        ELSE $3 END,
                    completed = CASE WHEN user_quests.quest_date = $4
                        THEN user_quests.completed
                        ELSE 0 END,
                    quest_date = $4,
                    updated_at = $5
                """,
                user_id, quest_id, minutes, today, datetime.utcnow().isoformat(),
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
                    COALESCE(mp.nick, u.first_name, u.username, ('User' || u.user_id)) AS nick,
                    mp.avatar AS avatar,
                    COALESCE(uc2.coins, 0) AS coins,
                    COALESCE(uc2.stars, 0) AS stars,
                    u.pro_until IS NOT NULL AND u.pro_until > $2 AS is_premium
                FROM users u
                LEFT JOIN user_currency uc2 ON u.user_id = uc2.user_id
                LEFT JOIN mini_app_profiles mp ON u.user_id = mp.user_id
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
                    "games": [],
                }
            return {
                "avatar": row["avatar"],
                "nick": row["nick"],
                "bio": row["bio"],
                "deco": row["deco"],
                "unlocked_decos": row["unlocked_decos"].split(",") if row["unlocked_decos"] else ["orange"],
                "games": row["games"].split(",") if row["games"] else [],
            }

    async def save_mini_app_profile(self, user_id: int, data: dict, conn: asyncpg.Connection | None = None) -> None:
        now = datetime.utcnow().isoformat()
        unlocked_decos = data.get("unlocked_decos")
        if isinstance(unlocked_decos, list):
            unlocked_decos = ",".join(unlocked_decos)
        elif not unlocked_decos:
            unlocked_decos = "orange"
        games = data.get("games")
        if isinstance(games, list):
            games = ",".join(games)
        sql = """
            INSERT INTO mini_app_profiles (user_id, avatar, nick, bio, deco, unlocked_decos, games, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (user_id) DO UPDATE SET
                avatar = COALESCE(EXCLUDED.avatar, mini_app_profiles.avatar),
                nick = COALESCE(EXCLUDED.nick, mini_app_profiles.nick),
                bio = COALESCE(EXCLUDED.bio, mini_app_profiles.bio),
                deco = COALESCE(EXCLUDED.deco, mini_app_profiles.deco),
                unlocked_decos = COALESCE(EXCLUDED.unlocked_decos, mini_app_profiles.unlocked_decos),
                games = CASE WHEN $7::TEXT IS NULL THEN mini_app_profiles.games ELSE $7::TEXT END,
                updated_at = EXCLUDED.updated_at
        """
        params = (
            user_id,
            data.get("avatar"),
            data.get("nick"),
            data.get("bio"),
            data.get("deco"),
            unlocked_decos,
            games,
            now,
        )
        if conn is None:
            async with self.pool.acquire() as conn:
                await conn.execute(sql, *params)
        else:
            await conn.execute(sql, *params)

    async def update_searching_since(self, user_id: int) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE profiles SET searching_since = $1 WHERE user_id = $2",
                datetime.utcnow().isoformat(), user_id,
            )

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

    async def get_case_cooldowns(self, user_id: int) -> dict[str, str | None]:
        """Batch-fetch last open time for all case types in one query."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT DISTINCT ON (case_id) case_id, opened_at "
                "FROM case_opens WHERE user_id = $1 ORDER BY case_id, opened_at DESC",
                user_id,
            )
            return {r["case_id"]: r["opened_at"] for r in rows}

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
        elif rtype == "model":
            # Владение лимитированной 3D-моделью (тираж 20 шт) — без джекпот-бонусов
            # кейса (роль админа, 10 000 ⭐, пожизненный премиум), только сама модель.
            token = await self.next_limited_token(conn)
            if token is not None:
                await conn.execute(
                    "INSERT INTO limited_models (model_id, token_id, owner_id, acquired_at) VALUES ($1, $2, $3, $4)",
                    self.LIMITED_MODEL_ID, token, user_id, datetime.utcnow().isoformat(),
                )
            else:
                # Тираж распродан — компенсация вместо модели.
                await self._adjust_currency_conn(conn, user_id, coins=1000)

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
                    "UPDATE user_battlepass SET claimed_tiers = $1, claimed_count = claimed_count + 1, updated_at = $2 WHERE user_id = $3",
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
                    "SELECT bp_premium, bp_xp, claimed_tiers, claimed_count, last_claim_at FROM user_battlepass WHERE user_id = $1 FOR UPDATE",
                    user_id,
                )
                if not row:
                    bp_premium = False
                    bp_xp = 0
                    claimed_tiers = []
                    claimed_count = 0
                    last_claim_at = None
                else:
                    bp_premium = bool(row["bp_premium"])
                    bp_xp = row["bp_xp"]
                    claimed_tiers = json.loads(row["claimed_tiers"]) if row["claimed_tiers"] else []
                    claimed_count = row["claimed_count"]
                    last_claim_at = row["last_claim_at"]

                from data.games import BATTLE_PASS_TIERS, BATTLE_PASS_XP_PER_LEVEL
                if claimed_count >= len(BATTLE_PASS_TIERS):
                    return {"ok": False, "error": "Все награды сезона собраны"}

                if last_claim_at:
                    last = datetime.fromisoformat(last_claim_at)
                    if (datetime.utcnow() - last).total_seconds() < 48 * 3600:
                        return {"ok": False, "error": "Следующая награда откроется позже"}

                tier = BATTLE_PASS_TIERS[claimed_count]
                tier_key = (tier["premium"] or tier["free"])["key"]
                claimed_tiers.append(tier_key)
                new_claimed_count = claimed_count + 1
                new_bp_xp = bp_xp + BATTLE_PASS_XP_PER_LEVEL

                await conn.execute(
                    """
                    INSERT INTO user_battlepass (user_id, bp_premium, bp_xp, claimed_tiers, claimed_count, last_claim_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (user_id) DO UPDATE SET
                        bp_premium = EXCLUDED.bp_premium,
                        bp_xp = EXCLUDED.bp_xp,
                        claimed_tiers = EXCLUDED.claimed_tiers,
                        claimed_count = EXCLUDED.claimed_count,
                        last_claim_at = EXCLUDED.last_claim_at,
                        updated_at = EXCLUDED.updated_at
                    """,
                    user_id, int(bp_premium), new_bp_xp, json.dumps(claimed_tiers), new_claimed_count, now, now,
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
        """Привязывает реферала к рефереру и сразу платит награду ТОЛЬКО рефералу.

        Награда реферера выплачивается позже — settle_referral_reward, когда
        приглашённый проявил реальную активность (заполнил анкету и прошло ≥24ч).
        Это блокирует мгновенный фрод «альт ввёл код → оба получили награду».
        """
        if referrer_user_id == referred_user_id:
            return False
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                already = await conn.fetchrow(
                    "SELECT 1 FROM referrals WHERE user_id = $1 AND referred_by IS NOT NULL",
                    referred_user_id,
                )
                if already:
                    return False
                await conn.execute(
                    "UPDATE referrals SET referred_by = $1, referred_at = $2, updated_at = $2 WHERE user_id = $3",
                    referrer_user_id, now, referred_user_id,
                )
                await conn.execute(
                    "UPDATE referrals SET invited_count = invited_count + 1, updated_at = $1 WHERE user_id = $2",
                    now, referrer_user_id,
                )
                await self._adjust_currency_conn(
                    conn,
                    referred_user_id,
                    coins=referral_reward.get("coins", 0),
                    stars=referral_reward.get("stars", 0),
                )
                return True

    async def settle_referral_reward(self, referred_user_id: int, referral_reward: dict) -> bool:
        """Выплачивает награду рефереру, если реферал «созрел» (антифрод).

        Условия зрелости:
          - у реферала заполнена анкета (mini_app_profiles.games не пуст) —
            фермерские альты обычно анкеты не заполняют;
          - с момента ввода кода прошло ≥24 часов — фарм «за день» не окупается.
        Идемпотентно: выплата ровно один раз (флаг referral_reward_paid).
        """
        now = datetime.utcnow()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    SELECT r.referred_by, r.referred_at, r.referral_reward_paid,
                           COALESCE(NULLIF(mp.games, ''), '') <> '' AS has_profile
                    FROM referrals r
                    LEFT JOIN mini_app_profiles mp ON mp.user_id = r.user_id
                    WHERE r.user_id = $1 AND r.referred_by IS NOT NULL
                    FOR UPDATE OF r
                    """,
                    referred_user_id,
                )
                if not row or row["referral_reward_paid"] or not row["referred_by"]:
                    return False
                if not row["has_profile"]:
                    return False
                try:
                    referred_at = datetime.fromisoformat(row["referred_at"]) if row["referred_at"] else None
                except (ValueError, TypeError):
                    referred_at = None
                if not referred_at or (now - referred_at).total_seconds() < 24 * 3600:
                    return False
                await conn.execute(
                    "UPDATE referrals SET referral_reward_paid = TRUE, updated_at = $1 WHERE user_id = $2",
                    now.isoformat(), referred_user_id,
                )
                await conn.execute(
                    "UPDATE referrals SET referral_earned_coins = referral_earned_coins + $1, updated_at = $2 WHERE user_id = $3",
                    referral_reward.get("coins", 0), now.isoformat(), row["referred_by"],
                )
                await self._adjust_currency_conn(
                    conn,
                    row["referred_by"],
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

    # ---------- Rewarded Ads ----------

    async def get_ad_watch_state(self, user_id: int) -> dict:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT watch_count, rewarded FROM user_ad_watches WHERE user_id = $1",
                user_id,
            )
            return {
                "watch_count": row["watch_count"] if row else 0,
                "rewarded": row["rewarded"] if row else 0,
            }

    async def record_ad_watch(self, user_id: int) -> dict:
        """Инкрементит счётчик просмотренных реклам. При достижении 15 начисляет
        +20 звёзд один раз (rewarded). Возвращает новый счётчик и приз."""
        now = datetime.utcnow().isoformat()
        AD_REWARD_THRESHOLD = 15
        AD_REWARD_STARS = 20
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT watch_count, rewarded FROM user_ad_watches WHERE user_id = $1 FOR UPDATE",
                    user_id,
                )
                count = (row["watch_count"] if row else 0) + 1
                rewarded = row["rewarded"] if row else 0
                reward_stars = 0
                if rewarded == 0 and count >= AD_REWARD_THRESHOLD:
                    rewarded = 1
                    reward_stars = AD_REWARD_STARS
                await conn.execute(
                    """
                    INSERT INTO user_ad_watches (user_id, watch_count, rewarded, updated_at)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (user_id) DO UPDATE SET
                        watch_count = EXCLUDED.watch_count,
                        rewarded = EXCLUDED.rewarded,
                        updated_at = EXCLUDED.updated_at
                    """,
                    user_id, count, rewarded, now,
                )
                if reward_stars > 0:
                    await self._adjust_currency_conn(conn, user_id, stars=reward_stars)
                return {"watch_count": count, "rewarded": rewarded, "reward_stars": reward_stars}

    # ---------- Chat ----------

    async def can_access_chat(self, chat_id: str, user_id: int) -> bool:
        async with self.pool.acquire() as conn:
            parts = chat_id.replace("dm-", "").split("-")
            numeric_parts = [int(p) for p in parts if p.isdigit()]
            if user_id in numeric_parts:
                return True
            row = await conn.fetchval(
                "SELECT 1 FROM chat_messages WHERE chat_id = $1 AND sender_id = $2 LIMIT 1",
                chat_id, user_id,
            )
            return row == 1

    async def send_message(self, chat_id: str, sender_id: int, text: str) -> dict:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "INSERT INTO chat_messages (chat_id, sender_id, text, created_at) VALUES ($1, $2, $3, $4) RETURNING id",
                chat_id, sender_id, text, now,
            )
            return {"id": str(row["id"]), "chat_id": chat_id, "sender_id": sender_id, "text": text, "created_at": now, "read_at": None}

    async def mark_chat_read(self, chat_id: str, user_id: int) -> None:
        """Mark all incoming messages (from the other party) as read."""
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE chat_messages SET read_at = $1 WHERE chat_id = $2 AND sender_id != $3 AND read_at IS NULL",
                now, chat_id, user_id,
            )

    async def get_chat_messages(self, chat_id: str, limit: int = 5000) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, chat_id, sender_id, text, created_at, read_at FROM chat_messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT $2",
                chat_id, limit,
            )
            return [dict(r) for r in reversed(rows)]

    async def get_chat_status(self, chat_id: str, user_id: int) -> dict:
        """Возвращает состояние чата для пользователя: muted, blocked (я/собеседник)."""
        other_ids = [i for i in self._chat_participants(chat_id) if i != user_id]
        other_id = other_ids[0] if other_ids else None
        async with self.pool.acquire() as conn:
            muted_row = await conn.fetchval(
                "SELECT 1 FROM chat_mutes WHERE user_id = $1 AND chat_id = $2 LIMIT 1",
                user_id, chat_id,
            )
            blocked_row = None
            if other_id is not None:
                blocked_row = await conn.fetchval(
                    "SELECT 1 FROM chat_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1",
                    user_id, other_id,
                )
            blocked_by_other = False
            if other_id is not None and blocked_row:
                by_me = await conn.fetchval(
                    "SELECT 1 FROM chat_blocks WHERE blocker_id = $1 AND blocked_id = $2 LIMIT 1",
                    user_id, other_id,
                )
                if not by_me:
                    blocked_by_other = True
            return {
                "other_id": other_id,
                "muted": bool(muted_row),
                "blocked": bool(blocked_row),
                "blocked_by_other": blocked_by_other,
            }

    async def get_user_chats(self, user_id: int) -> list[dict]:
        async with self.pool.acquire() as conn:
            # Один проход по таблице: для каждого чата сразу берём последнее
            # сообщение (MAX(id)) и число непрочитанных (FILTER). Индексы
            # idx_chat_messages_sender + idx_chat_messages_chat_id делают
            # сканирование быстрым, без коррелированных подзапросов.
            rows = await conn.fetch(
                """WITH my_chats AS (
                       SELECT chat_id,
                              MAX(id) AS last_id,
                              COUNT(*) FILTER (WHERE sender_id != $1 AND read_at IS NULL) AS unread
                       FROM chat_messages
                       WHERE chat_id LIKE 'dm-%'
                         AND (sender_id = $1 OR chat_id LIKE $2 OR chat_id LIKE $3)
                       GROUP BY chat_id
                   )
                   SELECT mc.chat_id, m.text, m.created_at, mc.unread
                   FROM my_chats mc
                   JOIN chat_messages m ON m.id = mc.last_id
                   ORDER BY m.created_at DESC""",
                user_id,
                f"dm-{user_id}-%",
                f"dm-%-{user_id}",
            )
            other_ids = set()
            chat_meta = {}
            for r in rows:
                cid = r["chat_id"]
                if not cid or not isinstance(cid, str) or not cid.startswith("dm-"):
                    continue
                parts = cid.replace("dm-", "").split("-")
                numeric_parts = [int(p) for p in parts if p.isdigit()]
                if len(numeric_parts) == 2:
                    a, b = numeric_parts
                    other_id = a if b == user_id else b
                elif len(numeric_parts) == 1:
                    other_id = numeric_parts[0]
                else:
                    continue
                if other_id == user_id:
                    continue
                other_ids.add(other_id)
                chat_meta[cid] = (other_id, r["text"], r["created_at"], r["unread"] or 0)

            profiles = {}
            if other_ids:
                profile_rows = await conn.fetch(
                    """SELECT mp.user_id, COALESCE(mp.nick, '') AS nick, mp.avatar, u.last_active_at
                       FROM mini_app_profiles mp
                       LEFT JOIN users u ON u.user_id = mp.user_id
                       WHERE mp.user_id = ANY($1::BIGINT[])""",
                    list(other_ids),
                )
                for pr in profile_rows:
                    profiles[pr["user_id"]] = pr

            role_rows = {}
            if other_ids:
                role_rows = await conn.fetch(
                    "SELECT user_id, role FROM user_roles WHERE user_id = ANY($1::BIGINT[])",
                    list(other_ids),
                )

            role_by_user = {rr["user_id"]: rr["role"] for rr in role_rows}

            results = []
            for cid, (other_id, last_text, last_ts, unread) in chat_meta.items():
                profile = profiles.get(other_id)
                other_avatar = profile["avatar"] if profile else f"/player-{((other_id % 4) + 1)}.webp"
                other_online = profile and profile["last_active_at"] and (datetime.utcnow() - datetime.fromisoformat(profile["last_active_at"])).total_seconds() < 300
                results.append({
                    "chat_id": cid,
                    "other_id": other_id,
                    "other_nick": (profile["nick"] if profile else "") or str(other_id),
                    "other_avatar": other_avatar,
                    "other_online": bool(other_online),
                    "other_last_seen": profile["last_active_at"] if profile else None,
                    "other_role": role_by_user.get(other_id, ""),
                    "last_text": last_text,
                    "last_ts": last_ts,
                    "unread": unread,
                })
            return sorted(results, key=lambda x: x["last_ts"], reverse=True)

    # ---------- Chat: moderation & global ----------

    def _chat_participants(self, chat_id: str) -> list[int]:
        parts = chat_id.replace("dm-", "").split("-")
        return [int(p) for p in parts if p.isdigit()]

    async def block_user(self, user_id: int, other_id: int) -> None:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO chat_blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                user_id, other_id, now,
            )

    async def unblock_user(self, user_id: int, other_id: int) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM chat_blocks WHERE blocker_id = $1 AND blocked_id = $2",
                user_id, other_id,
            )

    async def is_blocked(self, user_id: int, other_id: int) -> bool:
        """True если хоть одна из сторон заблокировала другую."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchval(
                "SELECT 1 FROM chat_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1",
                user_id, other_id,
            )
            return row == 1

    async def mute_chat(self, user_id: int, chat_id: str) -> None:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO chat_mutes (user_id, chat_id, muted_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                user_id, chat_id, now,
            )

    async def unmute_chat(self, user_id: int, chat_id: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM chat_mutes WHERE user_id = $1 AND chat_id = $2",
                user_id, chat_id,
            )

    async def is_chat_muted(self, user_id: int, chat_id: str) -> bool:
        async with self.pool.acquire() as conn:
            row = await conn.fetchval(
                "SELECT 1 FROM chat_mutes WHERE user_id = $1 AND chat_id = $2 LIMIT 1",
                user_id, chat_id,
            )
            return row == 1

    async def clear_chat(self, chat_id: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM chat_messages WHERE chat_id = $1",
                chat_id,
            )

    async def get_global_messages(self, limit: int = 50) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT gm.id, gm.user_id, gm.text, gm.created_at, gm.kind,
                          COALESCE(mp.nick, '') AS nick, mp.avatar,
                          COALESCE(ur.role, '') AS role, mp.deco
                   FROM global_messages gm
                   LEFT JOIN mini_app_profiles mp ON mp.user_id = gm.user_id
                   LEFT JOIN user_roles ur ON ur.user_id = gm.user_id
                   ORDER BY gm.id DESC LIMIT $1""",
                limit,
            )
            return [dict(r) for r in reversed(rows)]

    async def send_global_message(self, user_id: int, text: str, kind: str = "user", conn: asyncpg.Connection | None = None) -> dict:
        now = datetime.utcnow().isoformat()
        if conn is not None:
            row = await conn.fetchrow(
                "INSERT INTO global_messages (user_id, text, created_at, kind) VALUES ($1, $2, $3, $4) RETURNING id",
                user_id, text, now, kind,
            )
            return {"id": str(row["id"]), "user_id": user_id, "text": text, "created_at": now, "kind": kind}
        async with self.pool.acquire() as c:
            row = await c.fetchrow(
                "INSERT INTO global_messages (user_id, text, created_at, kind) VALUES ($1, $2, $3, $4) RETURNING id",
                user_id, text, now, kind,
            )
            return {"id": str(row["id"]), "user_id": user_id, "text": text, "created_at": now, "kind": kind}

    async def delete_global_message(self, message_id: int) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM global_messages WHERE id = $1",
                message_id,
            )
            return result == "DELETE 1"

    async def get_global_message_author(self, message_id: int) -> int | None:
        async with self.pool.acquire() as conn:
            return await conn.fetchval(
                "SELECT user_id FROM global_messages WHERE id = $1",
                message_id,
            )

    # ---------- Roles & moderation ----------

    ROLE_RANK = {"moderator": 1, "admin": 2, "developer": 3}

    async def get_role(self, user_id: int) -> str:
        async with self.pool.acquire() as conn:
            role = await conn.fetchval(
                "SELECT role FROM user_roles WHERE user_id = $1",
                user_id,
            )
            return role or ""

    async def get_beta(self, user_id: int) -> bool:
        async with self.pool.acquire() as conn:
            row = await conn.fetchval(
                "SELECT is_beta FROM user_roles WHERE user_id = $1",
                user_id,
            )
            return bool(row)

    async def set_role(self, user_id: int, role: str | None, granted_by: int) -> None:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            if not role:
                # Preserve is_beta flag, just clear staff role
                await conn.execute(
                    "UPDATE user_roles SET role = '' WHERE user_id = $1",
                    user_id,
                )
            else:
                await conn.execute(
                    """INSERT INTO user_roles (user_id, role, granted_by, created_at)
                       VALUES ($1, $2, $3, $4)
                       ON CONFLICT (user_id) DO UPDATE SET role = $2, granted_by = $3, created_at = $4""",
                    user_id, role, granted_by, now,
                )

    async def set_beta(self, user_id: int, enabled: bool, granted_by: int) -> None:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO user_roles (user_id, role, is_beta, granted_by, created_at)
                   VALUES ($1, '', $2, $3, $4)
                   ON CONFLICT (user_id) DO UPDATE SET is_beta = $2, granted_by = $3, created_at = $4""",
                user_id, int(enabled), granted_by, now,
            )
            # If enabling beta, grant daily bonus immediately
            if enabled:
                await self._grant_beta_daily_conn(conn, user_id)

    async def get_roles_batch(self, user_ids: list[int]) -> dict[int, str]:
        if not user_ids:
            return {}
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT user_id, role FROM user_roles WHERE user_id = ANY($1::BIGINT[])",
                user_ids,
            )
            return {r["user_id"]: r["role"] for r in rows}

    async def get_beta_batch(self, user_ids: list[int]) -> dict[int, bool]:
        if not user_ids:
            return {}
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT user_id, is_beta FROM user_roles WHERE user_id = ANY($1::BIGINT[])",
                user_ids,
            )
            return {r["user_id"]: bool(r["is_beta"]) for r in rows}

    async def ban_global(self, user_id: int, banned_by: int, reason: str = "", expires_at: str = "") -> None:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO global_bans (user_id, banned_by, reason, expires_at, created_at)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (user_id) DO UPDATE SET banned_by = $2, reason = $3, expires_at = $4, created_at = $5""",
                user_id, banned_by, reason, expires_at, now,
            )

    async def unban_global(self, user_id: int) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM global_bans WHERE user_id = $1",
                user_id,
            )

    async def is_globally_banned(self, user_id: int) -> bool:
        async with self.pool.acquire() as conn:
            row = await conn.fetchval(
                "SELECT 1 FROM global_bans WHERE user_id = $1 LIMIT 1",
                user_id,
            )
            return row == 1

    async def get_global_ban(self, user_id: int) -> dict | None:
        """Возвращает активный бан юзера: reason + expires_at + created_at, или None.

        Ленивый авто-разбан: если срок истёк — запись удаляется и бан считается
        снятым (без фоновых задач).
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT reason, expires_at, created_at FROM global_bans WHERE user_id = $1 LIMIT 1",
                user_id,
            )
            if not row:
                return None
            expires_at = row["expires_at"] or ""
            if expires_at:
                try:
                    expires = datetime.fromisoformat(expires_at)
                    if datetime.utcnow() >= expires:
                        await conn.execute("DELETE FROM global_bans WHERE user_id = $1", user_id)
                        return None
                except (ValueError, TypeError):
                    pass
            return {"reason": row["reason"] or "", "expires_at": expires_at, "created_at": row["created_at"] or ""}

    async def search_users_with_roles(self, query: str, limit: int = 20) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT u.user_id, COALESCE(mp.nick, '') AS nick, mp.avatar,
                          COALESCE(u.username, '') AS username,
                          COALESCE(u.first_name, '') AS first_name,
                          COALESCE(u.last_name, '') AS last_name,
                          COALESCE(ur.role, '') AS role,
                          COALESCE(ur.is_beta, 0) AS is_beta,
                          (gb.user_id IS NOT NULL) AS banned
                   FROM users u
                   LEFT JOIN mini_app_profiles mp ON mp.user_id = u.user_id
                   LEFT JOIN user_roles ur ON ur.user_id = u.user_id
                   LEFT JOIN global_bans gb ON gb.user_id = u.user_id
                   WHERE (LOWER(u.username) LIKE $1 OR LOWER(mp.nick) LIKE $1)
                   ORDER BY (ur.role IS NOT NULL) DESC, u.user_id
                   LIMIT $2""",
                f"%{query}%", limit,
            )
            return [dict(r) for r in rows]

    # ---------- Beta tester ----------
    # Роль «бета-тестер»: 200 премиум-кейсов в день (накапливаются до 6000),
    # 10 000 ⭐ каждый день, бесконечные анкеты, доступ к новым фичям.
    BETA_DAILY_CASES = 200
    BETA_MAX_CASES = 6000
    BETA_DAILY_STARS = 10_000

    async def _beta_role(self, user_id: int) -> bool:
        return await self.get_beta(user_id)

    async def get_beta_state(self, user_id: int) -> dict | None:
        """Состояние бета-тестера: накопленный баланс кейсов и отметка гранта."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT case_balance, last_grant FROM beta_state WHERE user_id = $1",
                user_id,
            )
            if row is None:
                return None
            return {"case_balance": row["case_balance"], "last_grant": row["last_grant"]}

    async def grant_beta_daily(self, user_id: int) -> dict | None:
        """Ежедневная выдача бета-тестеру: +200 премиум-кейсов (копятся до 6000)
        и 10 000 ⭐. Если роль снята — вернёт None и ничего не начислит.
        Идемпотентно: раз в календарный день (UTC)."""
        async with self.pool.acquire() as conn:
            return await self._grant_beta_daily_conn(conn, user_id)

    async def _grant_beta_daily_conn(self, conn: asyncpg.Connection, user_id: int) -> dict | None:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        row = await conn.fetchrow(
            "SELECT case_balance, last_grant FROM beta_state WHERE user_id = $1",
            user_id,
        )
        balance = row["case_balance"] if row else 0
        last_grant = row["last_grant"] if row else ""
        if last_grant >= today:
            return {"case_balance": balance, "last_grant": last_grant}
        new_balance = min(self.BETA_MAX_CASES, balance + self.BETA_DAILY_CASES)
        await conn.execute(
            """INSERT INTO beta_state (user_id, case_balance, last_grant)
               VALUES ($1, $2, $3)
               ON CONFLICT (user_id) DO UPDATE SET case_balance = $2, last_grant = $3""",
            user_id, new_balance, today,
        )
        await self._adjust_currency_conn(conn, user_id, stars=self.BETA_DAILY_STARS)
        return {"case_balance": new_balance, "last_grant": today}

    async def consume_beta_case(self, user_id: int, count: int, conn: asyncpg.Connection) -> bool:
        """Списывает count из накопленных бесплатных премиум-кейсов."""
        result = await conn.execute(
            "UPDATE beta_state SET case_balance = case_balance - $2 WHERE user_id = $1 AND case_balance >= $2",
            user_id, count,
        )
        return result == "UPDATE 1"

    # ---------- Reviews ----------

    async def submit_review(self, user_id: int, rating: int, text: str, pros: str, cons: str) -> dict:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO bot_reviews (user_id, rating, text, pros, cons, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6)""",
                user_id, rating, text, pros, cons, now,
            )
            return {"id": 0, "rating": rating, "text": text, "pros": pros, "cons": cons, "created_at": now}

    async def get_my_review(self, user_id: int) -> dict | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, rating, text, pros, cons, created_at FROM bot_reviews WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
                user_id,
            )
            return dict(row) if row else None

    async def get_reviews(self, limit: int = 50) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT r.id, r.user_id, r.rating, r.text, r.pros, r.cons, r.created_at,
                          COALESCE(mp.nick, '') AS nick
                   FROM bot_reviews r
                   LEFT JOIN mini_app_profiles mp ON mp.user_id = r.user_id
                   ORDER BY r.id DESC
                   LIMIT $1""",
                limit,
            )
            return [dict(r) for r in rows]

    # ---------- Friends ----------

    async def send_friend_request(self, user_id: int, friend_id: int) -> dict:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            # Проверяем, нет ли уже принятой дружбы в любую сторону
            existing = await conn.fetchrow(
                "SELECT status FROM user_friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)",
                user_id, friend_id,
            )
            if existing:
                if existing["status"] == "accepted":
                    return {"ok": False, "error": "already friends"}
                if existing["status"] == "pending":
                    # Запрос уже отправлен — не дублируем
                    return {"ok": True, "already_sent": True}
            row = await conn.fetchrow(
                "INSERT INTO user_friends (user_id, friend_id, status, created_at, updated_at) VALUES ($1, $2, 'pending', $3, $3) RETURNING id",
                user_id, friend_id, now,
            )
            return {"ok": True, "id": row["id"]}

    async def accept_friend_request(self, user_id: int, friend_id: int) -> bool:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                result = await conn.execute(
                    "UPDATE user_friends SET status = 'accepted', updated_at = $1 WHERE user_id = $2 AND friend_id = $3 AND status = 'pending'",
                    now, friend_id, user_id,
                )
                if result != "UPDATE 1":
                    return False
                await conn.execute(
                    "INSERT INTO user_friends (user_id, friend_id, status, created_at, updated_at) VALUES ($1, $2, 'accepted', $3, $3) ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted', updated_at = $3",
                    user_id, friend_id, now,
                )
                return True

    async def decline_friend_request(self, user_id: int, friend_id: int) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM user_friends WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'",
                friend_id, user_id,
            )
            return result != "DELETE 0"

    async def remove_friend(self, user_id: int, friend_id: int) -> bool:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                r1 = await conn.execute(
                    "DELETE FROM user_friends WHERE user_id = $1 AND friend_id = $2 AND status = 'accepted'",
                    user_id, friend_id,
                )
                r2 = await conn.execute(
                    "DELETE FROM user_friends WHERE user_id = $1 AND friend_id = $2 AND status = 'accepted'",
                    friend_id, user_id,
                )
                return r1 != "DELETE 0" or r2 != "DELETE 0"

    async def get_friends(self, user_id: int) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT uf.friend_id, mp.nick, mp.avatar,
                          EXISTS(SELECT 1 FROM users u2 WHERE u2.user_id = uf.friend_id AND u2.last_active_at IS NOT NULL AND u2.last_active_at > $2) AS online
                   FROM user_friends uf
                   LEFT JOIN mini_app_profiles mp ON mp.user_id = uf.friend_id
                   WHERE uf.user_id = $1 AND uf.status = 'accepted'
                   ORDER BY uf.updated_at DESC""",
                user_id, (datetime.utcnow() - timedelta(minutes=5)).isoformat(),
            )
            return [dict(r) for r in rows]

    async def get_friend_requests(self, user_id: int) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT uf.user_id AS requester_id, mp.nick, mp.avatar
                   FROM user_friends uf
                   LEFT JOIN mini_app_profiles mp ON mp.user_id = uf.user_id
                   WHERE uf.friend_id = $1 AND uf.status = 'pending'
                   ORDER BY uf.created_at DESC""",
                user_id,
            )
            return [dict(r) for r in rows]

    async def get_friend_status(self, user_id: int, other_id: int) -> str | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT status FROM user_friends WHERE user_id = $1 AND friend_id = $2",
                user_id, other_id,
            )
            return row["status"] if row else None

    # ---------- Predictions ----------

    async def place_prediction(self, user_id: int, match_id: str, side: str, amount: int, odds: float, label: str, team: str) -> dict | None:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                if not await self._adjust_currency_conn(conn, user_id, coins=-amount):
                    return None
                row = await conn.fetchrow(
                    "INSERT INTO match_predictions (user_id, match_id, side, amount, odds, status, payout, label, team, created_at) VALUES ($1, $2, $3, $4, $5, 'pending', 0, $6, $7, $8) RETURNING id",
                    user_id, match_id, side, amount, odds, label, team, now,
                )
                return dict(row)

    async def get_user_predictions(self, user_id: int) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM match_predictions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
                user_id,
            )
            return [dict(r) for r in rows]

    async def settle_match_predictions(self, match_id: str, winner: str) -> dict:
        """Расчёт киберспортивных ставок: победители получают amount*odds, проигравшие теряют ставку."""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                rows = await conn.fetch(
                    "SELECT id, user_id, side, amount, odds, status FROM match_predictions WHERE match_id = $1 AND status = 'pending' FOR UPDATE",
                    match_id,
                )
                winners = 0
                total_payout = 0
                for r in rows:
                    if r["side"] == winner:
                        payout = int(round(r["amount"] * r["odds"]))
                        await self._adjust_currency_conn(conn, r["user_id"], coins=payout)
                        await conn.execute(
                            "UPDATE match_predictions SET status = 'won', payout = $1 WHERE id = $2",
                            payout, r["id"],
                        )
                        winners += 1
                        total_payout += payout
                    else:
                        await conn.execute(
                            "UPDATE match_predictions SET status = 'lost', payout = 0 WHERE id = $1",
                            r["id"],
                        )
                return {"settled": len(rows), "winners": winners, "total_payout": total_payout}

    async def create_pvp_challenge(self, creator_id: int, creator_nick: str, condition: str, stake: int) -> dict | None:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                if not await self._adjust_currency_conn(conn, creator_id, coins=-stake):
                    return None
                row = await conn.fetchrow(
                    "INSERT INTO pvp_challenges (creator_id, creator_nick, condition, stake, status, created_at) VALUES ($1, $2, $3, $4, 'open', $5) RETURNING id",
                    creator_id, creator_nick, condition, stake, now,
                )
                return dict(row)

    async def get_open_challenges(self) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM pvp_challenges WHERE status = 'open' ORDER BY created_at DESC LIMIT 20")
            return [dict(r) for r in rows]

    async def get_user_challenges(self, user_id: int) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM pvp_challenges WHERE creator_id = $1 OR opponent_id = $1 ORDER BY created_at DESC LIMIT 20",
                user_id,
            )
            return [dict(r) for r in rows]

    async def accept_pvp_challenge(self, challenge_id: int, opponent_id: int, opponent_nick: str) -> bool:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT creator_id, stake, status FROM pvp_challenges WHERE id = $1 FOR UPDATE",
                    challenge_id,
                )
                if not row or row["status"] != "open":
                    return False
                if row["creator_id"] == opponent_id:
                    return False
                stake = row["stake"]
                if not await self._adjust_currency_conn(conn, opponent_id, coins=-stake):
                    return False
                await conn.execute(
                    "UPDATE pvp_challenges SET status = 'active', opponent_id = $1, opponent_nick = $2 WHERE id = $3",
                    opponent_id, opponent_nick, challenge_id,
                )
                return True

    async def resolve_pvp_challenge(self, challenge_id: int, caller_id: int, winner_id: int) -> bool:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT creator_id, opponent_id, stake, status FROM pvp_challenges WHERE id = $1 FOR UPDATE",
                    challenge_id,
                )
                if not row or row["status"] != "active":
                    return False
                if row["creator_id"] != caller_id:
                    return False
                if winner_id not in (row["creator_id"], row["opponent_id"]):
                    return False
                payout = row["stake"] * 2
                if not await self._adjust_currency_conn(conn, winner_id, coins=payout):
                    return False
                await conn.execute(
                    "UPDATE pvp_challenges SET status = 'finished', winner_id = $1 WHERE id = $2",
                    winner_id, challenge_id,
                )
                return True

    async def get_user_stats(self, user_id: int) -> dict:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM user_stats WHERE user_id = $1", user_id)
            if not row:
                return {"search_count": 0, "contact_count": 0, "team_app_count": 0, "games_played": 0, "wins": 0}
            return dict(row)

    async def increment_user_stat(self, user_id: int, stat: str, amount: int = 1) -> None:
        ALLOWED = {"search_count", "contact_count", "team_app_count", "games_played", "wins"}
        if stat not in ALLOWED:
            raise ValueError(f"Invalid stat column: {stat}")
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            await conn.execute(
                f"""
                INSERT INTO user_stats (user_id, {stat}, updated_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (user_id) DO UPDATE SET
                    {stat} = user_stats.{stat} + $2,
                    updated_at = EXCLUDED.updated_at
                """,
                user_id, amount, now,
            )

    async def audit_log(self, user_id: int | None, action: str, details: str | None = None, ip: str | None = None) -> None:
        now = datetime.utcnow().isoformat()
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO audit_log (user_id, action, details, ip, created_at) VALUES ($1, $2, $3, $4, $5)",
                user_id, action, details, ip, now,
            )

    async def log_activity(self, user_id: int, event: str) -> None:
        try:
            now = datetime.utcnow().isoformat()
            async with self.pool.acquire() as conn:
                await conn.execute(
                    "INSERT INTO user_activity_log (user_id, event, ts) VALUES ($1, $2, $3)",
                    user_id, event, now,
                )
        except Exception:
            pass  # non-critical, silently ignore

    async def get_general_stats(self, user_id: int, days: int) -> dict:
        """Return aggregated stats for the given period."""
        now = datetime.utcnow()
        since = (now - timedelta(days=days)).isoformat()

        async with self.pool.acquire() as conn:
            # Active days & total events
            rows = await conn.fetch(
                "SELECT ts::date AS d, COUNT(*) AS cnt FROM user_activity_log "
                "WHERE user_id = $1 AND ts >= $2 GROUP BY ts::date ORDER BY d",
                user_id, since,
            )
            active_days = len(rows)
            total_events = sum(r["cnt"] for r in rows)

            # Events by type
            event_rows = await conn.fetch(
                "SELECT event, COUNT(*) AS cnt FROM user_activity_log "
                "WHERE user_id = $1 AND ts >= $2 GROUP BY event",
                user_id, since,
            )
            events = {r["event"]: r["cnt"] for r in event_rows}

            # Searches & contacts from user_stats (cumulative)
            stats_row = await conn.fetchrow(
                "SELECT search_count, contact_count, team_app_count FROM user_stats WHERE user_id = $1",
                user_id,
            )
            searches_total = stats_row["search_count"] if stats_row else 0
            contacts_total = stats_row["contact_count"] if stats_row else 0
            team_apps_total = stats_row["team_app_count"] if stats_row else 0

            # Case opens in period
            case_opens = await conn.fetchval(
                "SELECT COUNT(*) FROM case_opens WHERE user_id = $1 AND opened_at >= $2",
                user_id, since,
            ) or 0

            # Ad watches total
            ad_watches = await conn.fetchval(
                "SELECT COALESCE(watch_count, 0) FROM user_ad_watches WHERE user_id = $1",
                user_id,
            ) or 0

            # Achievements claimed in period, grouped by game
            try:
                ach_rows = await conn.fetch(
                    "SELECT achievement_id, claimed_at FROM user_achievements "
                    "WHERE user_id = $1 AND claimed = TRUE AND claimed_at IS NOT NULL AND claimed_at >= $2",
                    user_id, since,
                )
            except Exception:
                ach_rows = []

            ACH_GAME_MAP = {
                "a1": "CS:GO", "a2": "War Thunder", "a3": "Roblox",
            }
            ach_by_game: dict[str, int] = {}
            for r in ach_rows:
                game = ACH_GAME_MAP.get(r["achievement_id"], "Другое")
                ach_by_game[game] = ach_by_game.get(game, 0) + 1

            # Current coins
            coins_row = await conn.fetchrow(
                "SELECT coins FROM user_currency WHERE user_id = $1", user_id,
            )
            current_coins = coins_row["coins"] if coins_row else 0

            # Referrals
            ref_count = await conn.fetchval(
                "SELECT COUNT(*) FROM referrals WHERE referred_by = $1",
                user_id,
            ) or 0

            return {
                "activeDays": active_days,
                "totalEvents": total_events,
                "searches": searches_total,
                "contacts": contacts_total,
                "teamApps": team_apps_total,
                "caseOpens": case_opens,
                "adWatches": ad_watches,
                "achievementsByGame": ach_by_game,
                "totalAchievements": len(ach_rows),
                "referrals": ref_count,
                "currentCoins": current_coins,
                "eventsByType": events,
            }

            return {
                "activeDays": active_days,
                "totalEvents": total_events,
                "searches": searches_total,
                "contacts": contacts_total,
                "teamApps": team_apps_total,
                "caseOpens": case_opens or 0,
                "adWatches": ad_watches or 0,
                "achievementsByGame": ach_by_game,
                "totalAchievements": len(ach_rows),
                "referrals": ref_count or 0,
                "currentCoins": current_coins,
                "eventsByType": events,
            }