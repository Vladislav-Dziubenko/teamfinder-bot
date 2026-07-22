import asyncio, asyncpg, json


async def main():
    conn = await asyncpg.connect(DSN)
    try:
        user_id = 5291782289
        print(f"Current Mini App tables for user {user_id}:")
        for table in ["user_currency", "mini_app_profiles", "user_battlepass", "daily_streaks", "referrals"]:
            exists = await conn.fetchval(
                "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
                table,
            )
            if not exists:
                print(f"  {table}: does not exist")
                continue
            rows = await conn.fetch(f"SELECT * FROM {table} WHERE user_id = $1", user_id)
            print(f"  {table}: {len(rows)} rows")
            for r in rows:
                print("   ", json.dumps(dict(r), default=str, ensure_ascii=False))
    finally:
        await conn.close()

asyncio.run(main())
