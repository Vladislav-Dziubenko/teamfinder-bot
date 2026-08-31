#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix else: at line 1609 (0-indexed 1609) from indent 20 to 28
if len(lines) > 1609:
    line = lines[1609]
    stripped = line.lstrip()
    if stripped == 'else:' and len(line) - len(line.lstrip()) == 20:
        lines[1609] = ' ' * 28 + lines[1609].lstrip()
        print("Fixed else indent to 28")

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed else indent")