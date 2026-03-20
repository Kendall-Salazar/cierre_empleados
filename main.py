from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import os
import json
from datetime import datetime
from database import get_db, init_db
import psycopg2.extras

app = FastAPI(title="Cierre de Caja API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── MODELOS ──────────────────────────────────────────────────────────────────

class VouchersModel(BaseModel):
    bcr_qty: Optional[str] = ""
    bcr_monto: Optional[str] = ""
    bac_qty: Optional[str] = ""
    bac_monto: Optional[str] = ""
    bac_flotas_qty: Optional[str] = ""
    bac_flotas_monto: Optional[str] = ""
    versatec_qty: Optional[str] = ""
    versatec_monto: Optional[str] = ""
    fleet_bncr_qty: Optional[str] = ""
    fleet_bncr_monto: Optional[str] = ""
    fleet_dav_qty: Optional[str] = ""
    fleet_dav_monto: Optional[str] = ""
    bncr_qty: Optional[str] = ""
    bncr_monto: Optional[str] = ""

class ItemMonto(BaseModel):
    descripcion: Optional[str] = ""
    cliente: Optional[str] = ""
    monto: Optional[str] = ""

class CierreCreate(BaseModel):
    fecha: str
    nombre: str
    turno: str
    datafono: Optional[str] = ""
    vouchers: VouchersModel
    creditos: List[ItemMonto] = []
    sinpes: List[ItemMonto] = []
    deposito: Optional[str] = ""
    vales: List[ItemMonto] = []
    pagos: List[ItemMonto] = []
    efectivo: Optional[str] = ""
    observaciones: Optional[str] = ""

class EmpleadoLogin(BaseModel):
    pin: str

# ─── EMPLEADOS ────────────────────────────────────────────────────────────────

EMPLOYEE_DIRECTORY = {
    "1001": {"nombre": "Jeison",  "turno_default": "1"},
    "1002": {"nombre": "Eligio",  "turno_default": "2"},
    "1003": {"nombre": "Maikel",  "turno_default": "3"},
    "1004": {"nombre": "Jensy",   "turno_default": "4"},
    "1005": {"nombre": "Ileana",  "turno_default": "5"},
    "1006": {"nombre": "Steven",  "turno_default": "6"},
    "1007": {"nombre": "Randall", "turno_default": "7"},
    "1008": {"nombre": "Angel",   "turno_default": "8"},
    "1009": {"nombre": "Keilor",  "turno_default": "9"},
    "1010": {"nombre": "Tomas",   "turno_default": "10"},
    "1011": {"nombre": "Jensy B", "turno_default": "11"},
}

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "marina2024")

# ─── STARTUP ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    init_db()

# ─── API ENDPOINTS ────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.post("/api/login")
def login(req: EmpleadoLogin):
    emp = EMPLOYEE_DIRECTORY.get(req.pin)
    if not emp:
        raise HTTPException(status_code=401, detail="Código incorrecto")
    return {"nombre": emp["nombre"], "turno_default": emp["turno_default"]}

@app.post("/api/admin/login")
def admin_login(body: dict):
    if body.get("password") != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    return {"ok": True}

@app.post("/api/cierres")
def crear_cierre(cierre: CierreCreate, db=Depends(get_db)):
    cur = db.cursor()
    v = cierre.vouchers
    v_keys = ["bcr_monto","bac_monto","bac_flotas_monto","versatec_monto",
               "fleet_bncr_monto","fleet_dav_monto","bncr_monto"]
    total_vouchers = sum(float(getattr(v, k) or 0) for k in v_keys)
    total_creditos = sum(float(c.monto or 0) for c in cierre.creditos)
    total_sinpes   = sum(float(s.monto or 0) for s in cierre.sinpes)
    total_deposito = float(cierre.deposito or 0)
    total_efectivo = float(cierre.efectivo or 0)
    total_vales    = sum(float(x.monto or 0) for x in cierre.vales)
    total_pagos    = sum(float(x.monto or 0) for x in cierre.pagos)
    total_reportado = (total_vouchers + total_creditos + total_sinpes +
                       total_deposito + total_efectivo - total_vales - total_pagos)

    cur.execute("""
        INSERT INTO cierres (
            fecha, empleado, turno, datafono,
            voucher_bcr, voucher_bac, voucher_bac_flotas,
            voucher_versatec, voucher_fleet_bncr, voucher_fleet_dav, voucher_bncr,
            creditos_json, sinpes_json, deposito,
            vales_json, pagos_json, efectivo,
            total_reportado, observaciones, enviado_at
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (
        cierre.fecha, cierre.nombre, cierre.turno, cierre.datafono or "",
        float(v.bcr_monto or 0), float(v.bac_monto or 0), float(v.bac_flotas_monto or 0),
        float(v.versatec_monto or 0), float(v.fleet_bncr_monto or 0),
        float(v.fleet_dav_monto or 0), float(v.bncr_monto or 0),
        json.dumps([c.dict() for c in cierre.creditos]),
        json.dumps([s.dict() for s in cierre.sinpes]),
        total_deposito,
        json.dumps([x.dict() for x in cierre.vales]),
        json.dumps([x.dict() for x in cierre.pagos]),
        total_efectivo, total_reportado,
        cierre.observaciones or "",
        datetime.utcnow().isoformat(),
    ))
    new_id = cur.fetchone()[0]
    db.commit()
    return {"status": "ok", "id": new_id}

@app.get("/api/cierres")
def listar_cierres(fecha: Optional[str] = None, empleado: Optional[str] = None, db=Depends(get_db)):
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    query = "SELECT * FROM cierres WHERE 1=1"
    params = []
    if fecha:
        query += " AND fecha = %s"; params.append(fecha)
    if empleado:
        query += " AND empleado ILIKE %s"; params.append(f"%{empleado}%")
    query += " ORDER BY enviado_at DESC"
    cur.execute(query, params)
    rows = cur.fetchall()
    result = []
    for r in rows:
        row = dict(r)
        for field in ["creditos_json","sinpes_json","vales_json","pagos_json"]:
            row[field] = json.loads(row[field] or "[]")
        result.append(row)
    return result

@app.get("/api/cierres/{cierre_id}")
def obtener_cierre(cierre_id: int, db=Depends(get_db)):
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM cierres WHERE id = %s", (cierre_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="No encontrado")
    row = dict(row)
    for field in ["creditos_json","sinpes_json","vales_json","pagos_json"]:
        row[field] = json.loads(row[field] or "[]")
    return row

@app.get("/api/export/csv")
def exportar_csv(fecha_inicio: Optional[str] = None, fecha_fin: Optional[str] = None, db=Depends(get_db)):
    from fastapi.responses import StreamingResponse
    import io, csv
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    query = "SELECT * FROM cierres WHERE 1=1"
    params = []
    if fecha_inicio:
        query += " AND fecha >= %s"; params.append(fecha_inicio)
    if fecha_fin:
        query += " AND fecha <= %s"; params.append(fecha_fin)
    query += " ORDER BY fecha ASC"
    cur.execute(query, params)
    rows = cur.fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id","fecha","empleado","turno","datafono",
                     "voucher_bcr","voucher_bac","voucher_bac_flotas",
                     "voucher_versatec","voucher_fleet_bncr","voucher_fleet_dav","voucher_bncr",
                     "creditos_json","sinpes_json","deposito","vales_json","pagos_json",
                     "efectivo","total_reportado","observaciones","enviado_at"])
    for r in rows:
        writer.writerow([r["id"],r["fecha"],r["empleado"],r["turno"],r["datafono"],
                         r["voucher_bcr"],r["voucher_bac"],r["voucher_bac_flotas"],
                         r["voucher_versatec"],r["voucher_fleet_bncr"],r["voucher_fleet_dav"],r["voucher_bncr"],
                         r["creditos_json"],r["sinpes_json"],r["deposito"],r["vales_json"],r["pagos_json"],
                         r["efectivo"],r["total_reportado"],r["observaciones"],r["enviado_at"]])
    output.seek(0)
    filename = f"cierres_{datetime.utcnow().strftime('%Y%m%d')}.csv"
    return StreamingResponse(output, media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={filename}"})

# ─── SERVIR FRONTEND (React build) ───────────────────────────────────────────
# Después de hacer `npm run build` en /frontend, los archivos quedan en /frontend/dist
# FastAPI los sirve igual que tu portal Chronos

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend", "dist")

if os.path.exists(FRONTEND_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")

    @app.get("/")
    def serve_root():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Para rutas que no son /api, devuelve index.html (SPA routing)
        file_path = os.path.join(FRONTEND_DIR, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
