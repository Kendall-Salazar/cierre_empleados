#!/bin/bash
# Railway ejecuta este script al hacer deploy
# 1. Instala dependencias de Python
# 2. Instala Node y compila el React
# 3. FastAPI queda listo para servir todo

set -e

echo "📦 Instalando dependencias Python..."
pip install -r requirements.txt

echo "🔨 Compilando frontend React..."
cd frontend
npm install
npm run build
cd ..

echo "✅ Build completo — frontend en frontend/dist/"
