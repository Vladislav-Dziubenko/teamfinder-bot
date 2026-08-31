#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix line 1605 (0-indexed): total_cost = case_config["costCoins"] * count
# should be indented 32 (under elif at 28)
if len(lines) > 1605:
    line = lines[1605]
    stripped = line.lstrip()
    if stripped.startswith('total_cost = case_config["costCoins"] * count'):
        lines[1605] = ' ' * 32 + stripped + '\n'

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed elif body indent")