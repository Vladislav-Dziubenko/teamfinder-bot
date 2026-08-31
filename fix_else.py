#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix else: at line 1608 (0-indexed 1608) from indent 20 to 28
if len(lines) > 1608:
    line = lines[1608]
    stripped = line.lstrip()
    if stripped == 'else:' and len(line) - len(stripped) == 20:
        lines[1608] = ' ' * 28 + lines[1608].lstrip()

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed else indent")