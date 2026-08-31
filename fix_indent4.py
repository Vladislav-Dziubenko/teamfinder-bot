#!/usr/bin/env python3
import re

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the if free_opens >= count: block - add 4 spaces to the body
# Pattern: 32 spaces + if free_opens >= count: + newline + empty line + 32 spaces + await
content = re.sub(
    r'(^ {32}if free_opens >= count:\r?\n)(?:\r?\n)( {32})(await conn\.execute\()',
    r'\1\2    await conn.execute(',
    content,
    flags=re.MULTILINE
)

# Fix the else block
content = re.sub(
    r'(^ {32}else:\r?\n)(?:\r?\n)( {32})(remaining = count - free_opens)',
    r'\1\2    remaining = count - free_opens',
    content,
    flags=re.MULTILINE
)

# Fix the inner if free_opens > 0:
content = re.sub(
    r'(^ {32}if free_opens > 0:\r?\n)(?:\r?\n)( {32})(await conn\.execute\()',
    r'\1\2    await conn.execute(',
    content,
    flags=re.MULTILINE
)

# Fix the inner await conn.execute indentation (should be 40 spaces)
content = re.sub(
    r'(^ {36}await conn\.execute\()',
    r'        \1',
    content,
    flags=re.MULTILINE
)

# Fix the inner UPDATE statement indentation
content = re.sub(
    r'(^ {36}"UPDATE users SET free_gold_opens = 0)',
    r'        \1',
    content,
    flags=re.MULTILINE
)

# Fix the closing parenthesis indentation
content = re.sub(
    r'(^ {36}\)\r?\n)( {32})(total_cost = )',
    r'\1\2    total_cost = ',
    content,
    flags=re.MULTILINE
)

# Fix total_cost line indentation
content = re.sub(
    r'(^ {32}total_cost = case_config\["costStars"\] \* remaining\r?\n)',
    r'\1',
    content,
    flags=re.MULTILINE
)

# Fix the if not await db._adjust_currency_conn indentation
content = re.sub(
    r'(^ {32}if not await db\._adjust_currency_conn\()',
    r'        \1',
    content,
    flags=re.MULTILINE
)

# Fix the return statement inside the if - escape the parentheses and braces
content = re.sub(
    r'(^ {32}return web\.json_response\(\{"error": "not enough stars"\}\)',
    r'        \1',
    content,
    flags=re.MULTILINE
)

with open('C:/Users/Admin/OneDrive/Документы/Default Project/teamfinder-bot/webapp/server.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed indentation")