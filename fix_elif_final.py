#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix elif case_config.get("costCoins"): at line 1604 (0-indexed) from indent 20 to 28
# Fix else: at line 1609 (0-indexed 1609) from indent 20 to 28
# Fix total_cost = case_config["costCoins"] * count at line 1605 - indent 32 (should be 32 under elif at 28)
# Fix else: at line 1609 (0-indexed 1609)

if len(lines) > 1604:
    line = lines[1604]
    stripped = line.lstrip()
    if stripped.startswith('elif case_config.get("costCoins"):') and len(line) - len(stripped) == 20:
        lines[1604] = ' ' * 28 + lines[1604].lstrip()
        print("Fixed elif indent")

if len(lines) > 1609:
    line = lines[1609]
    stripped = line.lstrip()
    if stripped == 'else:' and len(line) - len(line.lstrip()) == 20:
        lines[1609] = ' ' * 28 + lines[1609].lstrip()
        print("Fixed else indent")

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed elif/else indentation")