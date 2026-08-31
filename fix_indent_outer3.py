#!/usr/bin/env python3

with open(r'C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix lines 1787-1801 (0-indexed 1786-1800) from indent 4 to 12
# These lines should be inside the try block (which is at indent 8, so body should be >= 12)
# Currently at indent 4, need to add 8 spaces

for i in range(1786, 1802):  # 0-indexed: lines 1787-1802 (1-indexed)
    if i < len(lines):
        line = lines[i]
        stripped = line.lstrip()
        indent = len(line) - len(stripped)
        if indent == 4 and line.strip():  # Non-empty lines at indent 4
            lines[i] = ' ' * 12 + line.lstrip() + '\n'

with open(r'C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed outer indentation")