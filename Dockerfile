# ---------- Build stage: Next.js static export ----------
FROM node:20-alpine AS frontend
WORKDIR /app/web-src

COPY web-src/package.json web-src/package-lock.json ./
RUN npm ci

COPY web-src/ ./
RUN npm run build

# ---------- Runtime stage: Python bot + aiohttp static server ----------
FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend and remaining assets
COPY . .

# Replace the old static folder with the freshly built Mini App
COPY --from=frontend /app/web-src/out /app/webapp/static

CMD ["python", "main.py"]
