#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Force fix line 1609 (0-indexed) - the else: at indent 20 -> 28
if len(lines) > 1609:
    line = lines[1609]
    stripped = line.lstrip()
    if stripped == 'else:':
        indent = len(line) - len(stripped)
        print(f'Current indent: {indent}')
        if indent == 20:
            lines[1609] = ' ' * 28 + 'else:\n'
            print("Fixed else indent to 28")
        else:
            print(f'Unexpected indent: {len(line) - len(line.lstrip())}')

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Done")