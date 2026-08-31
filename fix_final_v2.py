#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix the specific lines with wrong indentation
# Line numbers are 0-indexed
# Fix await conn.execute at line 1587 (0-indexed) - indent 44 -> 36
# Fix return at line 1593 -> indent 40
# Fix total_cost line at 1600 (32 -> 36)
# Fix if not await at 1602 (36 -> keep 36, it's correct)
# Fix return at 1604 (32 -> 36)
# Fix if not await at 1607 (24 -> 28)
# Fix return at 1608 (28 -> 32)
# Fix total_cost at 1610 (24 -> 24, correct)
# Fix if not await at 1611 (24 -> 28)
# Fix return at 1608 (28 -> 32)

# Let's fix line by line based on current state
# Line 1587 (0-indexed): await conn.execute at indent 44 -> should be 36
# Line 1593: return at 32 -> should be 40
# Line 1600: total_cost at 32 -> should be 36
# Line 1602: if not await at 36 (correct)
# Line 1587 (0-indexed): await conn.execute at indent 44 -> should be 36

# Check current state
with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix specific lines by replacing the exact patterns
# Fix: await conn.execute at 44 spaces -> 36 spaces (inside if free_opens >= count)
content = content.replace(
    '                                            await conn.execute(',
    '                        await conn.execute('
)

# Fix return at 32 -> 36 inside if free_opens >= count
content = content.replace(
    '                                return web.json_response({"error": "not enough stars"})',
    '                        return web.json_response({"error": "not enough stars"})'
)

# Fix total_cost line at 32 -> 36
content = content.replace(
    '                                total_cost = case_config["costStars"] * remaining',
    '                        total_cost = case_config["costStars"] * remaining'
)

# Fix if not await at 36 (correct, keep)
# return at 32 -> 36
content = content.replace(
    '                                return web.json_response({"error": "not enough stars"})',
    '                        return web.json_response({"error": "not enough stars"})'
)

# Fix if not await at 24 -> 28 (in costCoins block)
content = content.replace(
    '                        if not await db._adjust_currency_conn(conn, user["id"], ',
    '                            if not await db._adjust_currency_conn(conn, user["id"], '
)

# Fix return at 28 -> 32
content = content.replace(
    '                            return web.json_response({"error": "not enough coins"})',
    '                                return web.json_response({"error": "not enough coins"})'
)

# Fix else block total_cost
content = content.replace(
    '                        total_cost = case_config["costStars"] * count',
    '                            total_cost = case_config["costStars"] * count'
)

# Fix if not await in else block
content = content.replace(
    '                        if not await db._adjust_currency_conn(conn, user["id"], ',
    '                            if not await db._adjust_currency_conn(conn, user["id"], '
)

# Fix return in else
content = content.replace(
    '                            return web.json_response({"error": "not enough stars"})',
    '                                return web.json_response({"error": "not enough stars"})'
)

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed all indentation")