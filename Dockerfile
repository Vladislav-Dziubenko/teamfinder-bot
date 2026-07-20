# ---------- Build stage: Next.js static export ----------
FROM node:20-alpine AS frontend
WORKDIR /app/web-src

# Use pnpm (lockfile is pnpm-lock.yaml)
RUN corepack enable

# Install dependencies
COPY web-src/package.json web-src/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build static site into web-src/out
COPY web-src/ ./
RUN pnpm build

# ---------- Runtime stage: Python bot + aiohttp static server ----------
FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend and remaining assets
COPY . .

# Replace the old static folder with the freshly built Mini App
RUN rm -rf /app/webapp/static/* && cp -r /app/web-src/out/* /app/webapp/static/

CMD ["python", "main.py"]
