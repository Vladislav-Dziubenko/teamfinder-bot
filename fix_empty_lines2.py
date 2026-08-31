#!/usr/bin/env python3

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace empty lines that have spaces with empty lines
# Pattern: lines that contain only spaces/tabs followed by newline
import re
# Replace lines that contain only whitespace (spaces/tabs) followed by newline
content = re.sub(r'^[ \t]+\n', '\n', content, flags=re.MULTILINE)

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed empty lines")