import asyncio, asyncpg, json


TABLES = [
    "case_cooldowns",
    "claimed_achievements",
    "claimed_bp_tiers",
    "economy",
    "quest_progress",
    "redeemed_promo_codes",
    "unlocked_players",
]

async def main():
    conn = await asyncpg.connect(DSN)
    try:
        for table in TABLES:
            exists = await conn.fetchval(
                "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
                table,
            )
            if not exists:
                print(f"{table}: does not exist")
                continue

            count = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
            print(f"{table}: {count} rows")

            if count > 0:
                cols = await conn.fetch(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = $1
                    ORDER BY ordinal_position
                    """,
                    table,
                )
                col_names = [c["column_name"] for c in cols]
                select = ", ".join(col_names)
                rows = await conn.fetch(f"SELECT {select} FROM {table} LIMIT 5")
                print(f"  sample rows:")
                for r in rows:
                    print("   ", json.dumps(dict(r), default=str, ensure_ascii=False))
    finally:
        await conn.close()

asyncio.run(main())
