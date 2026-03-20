# Cierre de Caja — Servicentro La Marina

Un solo servidor Railway sirve todo: backend FastAPI + frontend React + PostgreSQL.

## Estructura

```
cierre-caja/
├── main.py          ← FastAPI (API + sirve el frontend)
├── database.py      ← Conexión PostgreSQL
├── requirements.txt
├── railway.json     ← Configuración Railway
├── Procfile
└── frontend/        ← React (se compila durante el deploy)
    ├── src/
    │   ├── App.jsx
    │   └── main.jsx
    ├── index.html
    ├── package.json
    └── vite.config.js
```

## Deploy en Railway (todo en un solo lugar)

### 1. Subir a GitHub
- Crear repo en github.com → subir todos los archivos

### 2. Crear proyecto en Railway
1. railway.app → "New Project" → "Deploy from GitHub repo"
2. Seleccioná el repo `cierre-caja`
3. **NO** configurés Root Directory — dejalo vacío (raíz del repo)
4. Railway lee `railway.json` automáticamente

### 3. Agregar PostgreSQL
1. En el proyecto Railway → "New Service" → "Database" → "PostgreSQL"
2. Railway conecta `DATABASE_URL` automáticamente

### 4. Variable de entorno
En Railway → Variables:
- `ADMIN_PASSWORD` = la contraseña que quieras para el panel supervisor

### 5. Listo ✅
Railway ejecuta:
1. `pip install -r requirements.txt`
2. `cd frontend && npm install && npm run build`
3. `uvicorn main:app --host 0.0.0.0 --port $PORT`

Te da una URL tipo: `https://cierre-caja-production.railway.app`
Esa URL es todo — la misma para empleados y supervisor.

---

## Desarrollo local

```bash
# Terminal 1 — Backend
pip install -r requirements.txt
export DATABASE_URL="postgresql://user:pass@localhost/cierres"
uvicorn main:app --reload

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev   # abre en localhost:5173, conecta a :8000 via proxy
```

---

## Códigos PIN de empleados

| Empleado | PIN  |
|----------|------|
| Jeison   | 1001 |
| Eligio   | 1002 |
| Maikel   | 1003 |
| Jensy    | 1004 |
| Ileana   | 1005 |
| Steven   | 1006 |
| Randall  | 1007 |
| Angel    | 1008 |
| Keilor   | 1009 |
| Tomas    | 1010 |

Cambiar PINs: editá `EMPLOYEE_DIRECTORY` en `main.py`

---

## Exportar datos a tu portal local

Panel admin → "Exportar CSV", o vía URL:
```
GET https://tu-app.railway.app/api/export/csv?fecha_inicio=2025-03-01&fecha_fin=2025-03-31
```
