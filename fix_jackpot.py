#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix jackpot_item at line 1614 (0-indexed) from indent 32 to 16
if len(lines) > 1614:
    line = lines[1614]
    stripped = line.lstrip()
    indent = len(line) - len(stripped)
    if 'jackpot_item = next' in stripped and indent == 32:
        lines[1614] = ' ' * 16 + stripped + '\n'
        print("Fixed jackpot_item indent to 16")

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed jackpot_item indent")