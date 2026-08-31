#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix empty lines inside indented blocks - they should have no spaces or proper indentation
new_lines = []
for line in lines:
    stripped = line.lstrip()
    indent = len(line) - len(stripped)
    
    # If line is empty (only whitespace/newline) but has spaces, make it truly empty
    if not stripped and indent > 0:
        new_lines.append('\n')
    else:
        new_lines.append(line)

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Fixed empty lines")