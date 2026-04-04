#!/usr/bin/env bash
# Script para iniciar Rick con el emulador localmente.
# Levanta bridge + node-client (modo emulador) + frontend React.
#
# Uso:
#   ./scripts/start-emulator.sh
#
# Prerequisitos:
#   - Node.js >= 20
#   - Variables de entorno configuradas en apps/bridge/.env y apps/node-client/.env

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== Rick Emulator — Inicio local ==="
echo ""

# 1. Instalar dependencias si faltan
if [ ! -d "node_modules" ]; then
  echo "[1/3] Instalando dependencias..."
  npm install
else
  echo "[1/3] Dependencias OK"
fi

# 2. Verificar archivos .env
if [ ! -f "apps/bridge/.env" ]; then
  echo ""
  echo "ERROR: Falta apps/bridge/.env"
  echo "Copia apps/bridge/.env.example y configura DEEPGRAM_API_KEY, OPENAI_API_KEY, INTERNAL_TOKEN"
  exit 1
fi

if [ ! -f "apps/node-client/.env" ]; then
  echo ""
  echo "WARN: Falta apps/node-client/.env — creando copia desde .env.example..."
  cp apps/node-client/.env.example apps/node-client/.env
  echo "Edita apps/node-client/.env para ajustar TOKEN y BRIDGE_WS_URL si es necesario."
fi

# 3. Asegurar PLATFORM=emulator en el .env del client
if ! grep -q "PLATFORM=emulator" apps/node-client/.env 2>/dev/null; then
  echo ""
  echo "NOTA: Seteando PLATFORM=emulator en apps/node-client/.env"
  if grep -q "^PLATFORM=" apps/node-client/.env 2>/dev/null; then
    sed -i 's/^PLATFORM=.*/PLATFORM=emulator/' apps/node-client/.env
  else
    echo "PLATFORM=emulator" >> apps/node-client/.env
  fi
fi

echo ""
echo "[2/3] Iniciando servicios..."
echo "  - Bridge:            http://localhost:3000"
echo "  - Node Client (emu): ws://localhost:3001 (frontend WS)"
echo "  - Emulator UI:       http://localhost:5173"
echo ""
echo "[3/3] Abrí http://localhost:5173 en Chrome para usar el emulador."
echo "       Ctrl+C para detener todo."
echo ""

# Iniciar los tres procesos concurrentemente
npx concurrently -k -p "{name}" -c "cyan,magenta,yellow" \
  -n "bridge,client,frontend" \
  "npm run dev:bridge" \
  "cross-env PLATFORM=emulator npm run dev:client" \
  "npm run dev:emulator-frontend"
