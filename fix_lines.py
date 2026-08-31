#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix specific lines by index (0-indexed)
# Based on current state:
# Line 1586: if free_opens >= count: at 32
# Line 1587: await conn.execute at 24 -> should be 36
# Line 1593: return at 32 -> should be 40
# Line 1594: else: at 32
# Line 1594: remaining at 36 (correct)
# Line 1596: if free_opens > 0: at 32
# Line 1597: await conn.execute at 24 -> should be 40
# Line 1600: total_cost at 32 -> should be 36
# Line 1602: if not await at 36 (correct)
# Line 1604: return at 32 -> should be 40
# Line 1607: if not await at 24 -> should be 28
# Line 1608: return at 28 -> should be 32
# Line 1610: total_cost at 24 -> should be 24 (inside else of costCoins)
# Line 1611: if not await at 24 -> should be 28
# Line 1608: return at 28 -> should be 32

# Fix specific lines by index
fixes = {
    1586: 36,  # await conn.execute after if free_opens >= count
    1592: 40,  # return inside if free_opens >= count
    1600: 36,  # total_cost = case_config["costStars"] * remaining
    1602: 36,  # if not await (already correct)
    1604: 40,  # return inside if not await
    1607: 28,  # if not await in costCoins block
    1608: 32,  # return in costCoins block
    1610: 36,  # total_cost in else block
    1611: 28,  # if not await in else block
    1614: 32,  # return in else block
}

for i, line in enumerate(lines):
    if i in fixes:
        target_indent = fixes[i]
        stripped = lines[i].lstrip()
        lines[i] = ' ' * fixes[i] + stripped

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed specific line indents")