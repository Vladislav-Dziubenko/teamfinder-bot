#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix else: at line 1609 (0-indexed) from indent 20 to 28
if len(lines) > 1609:
    line = lines[1609]
    stripped = line.lstrip()
    if stripped.rstrip() == 'else:' and len(line) - len(line.lstrip()) == 20:
        lines[1609] = ' ' * 28 + 'else:\n'
        print("Fixed else indent to 28")
    else:
        print(f"Did not match: stripped={repr(stripped.rstrip())}, indent={len(lines[1609]) - len(lines[1609].lstrip())}")

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Done")