#!/usr/bin/env bash
set -euo pipefail

# Arranque nativo para macOS (incluido Apple Silicon). Ejecutar desde la raíz:
#   bash iniciar-sistema-mac.sh

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js no está instalado. Instálalo con: brew install node"
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "FFmpeg no está instalado. Instálalo con: brew install ffmpeg"
  exit 1
fi

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "yt-dlp no está instalado. Instálalo con: brew install yt-dlp"
  exit 1
fi

if [ ! -f "$ROOT_DIR/backend/.env" ]; then
  echo "Falta backend/.env. Copia tu configuración de API antes de arrancar."
  exit 1
fi

if [ ! -d "$ROOT_DIR/backend/node_modules" ]; then
  (cd "$ROOT_DIR/backend" && npm install)
fi
if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  (cd "$ROOT_DIR/frontend" && npm install)
fi

cleanup() {
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(cd "$ROOT_DIR/backend" && npm run dev) &
BACKEND_PID=$!
(cd "$ROOT_DIR/frontend" && npm run dev -- --host 0.0.0.0) &
FRONTEND_PID=$!

echo "Sistema disponible en http://localhost:5173"
wait "$BACKEND_PID" "$FRONTEND_PID"
