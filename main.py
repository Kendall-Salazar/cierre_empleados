import csv
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import unicodedata
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, List, Optional

import openpyxl
import psycopg2.extras
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from database import get_db, init_db

APP_TITLE = "Cierre de Caja API"
TOKEN_TTL_HOURS = int(os.environ.get("TOKEN_TTL_HOURS", "24"))
EMPLOYEE_EDIT_HOURS = int(os.environ.get("EMPLOYEE_EDIT_HOURS", "24"))
UPLOAD_ROOT = Path(os.environ.get("UPLOAD_ROOT", "uploads"))
EXPORT_TEMPLATE_PATH = Path(os.environ.get("CIERRE_TEMPLATE_PATH", "templates/cierre_template.xlsx"))

ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
if ALLOWED_ORIGINS == ["*"]:
    ALLOW_CREDENTIALS = False
else:
    ALLOW_CREDENTIALS = True

VOUCHER_AMOUNT_KEYS = [
    "bcr_monto",
    "bac_monto",
    "bac_flotas_monto",
    "versatec_monto",
    "fleet_bncr_monto",
    "fleet_dav_monto",
    "bncr_monto",
]
MOVEMENT_FIELDS = ("creditos", "sinpes", "transferencias", "vales", "pagos")
EDITABLE_EMPLOYEE_STATUSES = {"draft", "submitted", "observed"}
PRODUCT_ALIASES = {
    "s": "super",
    "super": "super",
    "superior": "super",
    "regular": "regular",
    "reg": "regular",
    "r": "regular",
    "diesel": "diesel",
    "d": "diesel",
    "glp": "glp",
    "gas": "glp",
}
HEADER_ALIASES = {
    "fecha": {"fecha", "dia", "date"},
    "empleado": {"empleado", "nombre", "operador", "usuario", "despachador"},
    "turno": {"turno", "shift"},
    "producto": {"producto", "combustible", "fuel", "tipo", "articulo"},
    "litros": {"litros", "cantidad", "lts", "lt", "volumen"},
    "monto": {"monto", "importe", "total", "venta", "valor"},
    "ppu": {"ppu", "precio", "precioxunidad", "preciounitario", "price"},
}

app = FastAPI(title=APP_TITLE)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=ALLOW_CREDENTIALS,
)


class LoginRequest(BaseModel):
    pin: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None


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


class MovementItem(BaseModel):
    id: Optional[str] = None
    descripcion: Optional[str] = ""
    cliente: Optional[str] = ""
    referencia: Optional[str] = ""
    monto_reportado: Optional[str] = ""
    monto_validado: Optional[str] = None
    estado: Optional[str] = "reportado"
    observacion_empleado: Optional[str] = ""
    observacion_supervisor: Optional[str] = ""
    soporte_requerido: Optional[bool] = False
    validado_por: Optional[str] = None
    validado_at: Optional[str] = None


class CierrePayload(BaseModel):
    fecha: str
    turno: str
    datafono: Optional[str] = ""
    vouchers: VouchersModel = Field(default_factory=VouchersModel)
    creditos: List[MovementItem] = Field(default_factory=list)
    sinpes: List[MovementItem] = Field(default_factory=list)
    transferencias: List[MovementItem] = Field(default_factory=list)
    deposito: Optional[str] = ""
    vales: List[MovementItem] = Field(default_factory=list)
    pagos: List[MovementItem] = Field(default_factory=list)
    efectivo: Optional[str] = ""
    observaciones: Optional[str] = ""
    employee_id: Optional[int] = None


class ReviewPayload(BaseModel):
    validado_json: Dict[str, Any]
    status: str = "document_reviewed"
    audit_notes: Optional[str] = ""


class UserCreate(BaseModel):
    username: str
    full_name: str
    role: str
    default_turno: Optional[str] = None
    pin: Optional[str] = None
    password: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    default_turno: Optional[str] = None
    pin: Optional[str] = None
    password: Optional[str] = None
    active: Optional[bool] = None


class GasproImportResponse(BaseModel):
    import_id: int
    matched_cierres: int
    import_mode: str


def utcnow() -> datetime:
    return datetime.utcnow()


def normalize_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def parse_decimal(value: Any) -> Decimal:
    if value in (None, "", "None"):
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    text = str(value).strip().replace("₡", "").replace(",", "")
    if not text:
        return Decimal("0")
    try:
        return Decimal(text)
    except InvalidOperation:
        return Decimal("0")


def decimal_to_float(value: Any) -> float:
    return float(parse_decimal(value))


def hash_secret(secret: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt.encode("utf-8"), 200_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_secret(secret: str, stored: Optional[str]) -> bool:
    if not stored:
        return False
    try:
        algorithm, salt, digest_hex = stored.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt.encode("utf-8"), 200_000)
    return hmac.compare_digest(digest.hex(), digest_hex)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def parse_json_field(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return default
    return default


def normalize_movement(item: Dict[str, Any], movement_type: str) -> Dict[str, Any]:
    return {
        "id": item.get("id") or str(uuid.uuid4()),
        "tipo": movement_type,
        "descripcion": item.get("descripcion", "") or item.get("detalle", ""),
        "cliente": item.get("cliente", "") or item.get("empresa", ""),
        "referencia": item.get("referencia", "") or item.get("numero", ""),
        "monto_reportado": str(item.get("monto_reportado", item.get("monto", "")) or ""),
        "monto_validado": item.get("monto_validado"),
        "estado": item.get("estado", "reportado"),
        "observacion_empleado": item.get("observacion_empleado", item.get("observacion", "")) or "",
        "observacion_supervisor": item.get("observacion_supervisor", "") or "",
        "soporte_requerido": bool(item.get("soporte_requerido", movement_type in {"sinpes", "transferencias", "vales"})),
        "validado_por": item.get("validado_por"),
        "validado_at": item.get("validado_at"),
    }


def default_payload() -> Dict[str, Any]:
    return {
        "fecha": date.today().isoformat(),
        "turno": "1",
        "datafono": "",
        "vouchers": {
            "bcr_qty": "", "bcr_monto": "",
            "bac_qty": "", "bac_monto": "",
            "bac_flotas_qty": "", "bac_flotas_monto": "",
            "versatec_qty": "", "versatec_monto": "",
            "fleet_bncr_qty": "", "fleet_bncr_monto": "",
            "fleet_dav_qty": "", "fleet_dav_monto": "",
            "bncr_qty": "", "bncr_monto": "",
        },
        "creditos": [],
        "sinpes": [],
        "transferencias": [],
        "deposito": "",
        "vales": [],
        "pagos": [],
        "efectivo": "",
        "observaciones": "",
    }


def normalize_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    if data is None:
        data = {}
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="Formato de cierre invalido")

    payload = default_payload()

    raw_fecha = data.get("fecha") or payload["fecha"]
    try:
        payload["fecha"] = parse_date_value(raw_fecha).isoformat()
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Fecha invalida") from exc

    payload["turno"] = str(data.get("turno", payload["turno"]) or payload["turno"]).strip() or payload["turno"]
    payload["datafono"] = str(data.get("datafono", payload["datafono"]) or "").strip()
    payload["deposito"] = str(data.get("deposito", payload["deposito"]) or "").strip()
    payload["efectivo"] = str(data.get("efectivo", payload["efectivo"]) or "").strip()
    payload["observaciones"] = str(data.get("observaciones", payload["observaciones"]) or "").strip()

    vouchers = data.get("vouchers") or {}
    if not isinstance(vouchers, dict):
        raise HTTPException(status_code=422, detail="Formato de vouchers invalido")
    payload["vouchers"] = {**default_payload()["vouchers"], **vouchers}

    for field in MOVEMENT_FIELDS:
        items = data.get(field) or []
        if not isinstance(items, list):
            raise HTTPException(status_code=422, detail=f"Formato invalido en {field}")
        payload[field] = [normalize_movement(item, field) for item in items]
    return payload


def compute_summary(payload: Dict[str, Any], validated: bool = False) -> Dict[str, float]:
    vouchers = payload.get("vouchers", {})
    total_vouchers = sum(parse_decimal(vouchers.get(key)) for key in VOUCHER_AMOUNT_KEYS)
    totals = {}
    for field in MOVEMENT_FIELDS:
        subtotal = Decimal("0")
        for item in payload.get(field, []):
            if validated and item.get("monto_validado") not in (None, "", "None"):
                amount = parse_decimal(item.get("monto_validado"))
            else:
                amount = parse_decimal(item.get("monto_reportado", 0))
            subtotal += amount
        totals[field] = subtotal
    deposito = parse_decimal(payload.get("deposito"))
    efectivo = parse_decimal(payload.get("efectivo"))
    total_reportado = total_vouchers + totals["creditos"] + totals["sinpes"] + totals["transferencias"] + deposito + efectivo - totals["vales"] - totals["pagos"]
    return {
        "total_vouchers": decimal_to_float(total_vouchers),
        "total_creditos": decimal_to_float(totals["creditos"]),
        "total_sinpes": decimal_to_float(totals["sinpes"]),
        "total_transferencias": decimal_to_float(totals["transferencias"]),
        "total_vales": decimal_to_float(totals["vales"]),
        "total_pagos": decimal_to_float(totals["pagos"]),
        "deposito": decimal_to_float(deposito),
        "efectivo": decimal_to_float(efectivo),
        "total_reportado": decimal_to_float(total_reportado),
    }


def row_to_user(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "username": row["username"],
        "full_name": row["full_name"],
        "role": row["role"],
        "default_turno": row.get("default_turno"),
        "active": row["active"],
    }


def fetch_user_by_id(db, user_id: int) -> Optional[dict]:
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM users WHERE id = %s LIMIT 1", (user_id,))
    row = cur.fetchone()
    return dict(row) if row else None


def get_current_user(authorization: Optional[str] = Header(default=None), db=Depends(get_db)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Falta autenticación")
    token = authorization.split(" ", 1)[1].strip()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT u.*, s.id AS session_id
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = %s
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
          AND u.active = TRUE
        LIMIT 1
        """,
        (token_hash(token),),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Sesión inválida o vencida")
    return dict(row)


def require_roles(*roles):
    def dependency(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="No autorizado")
        return user
    return dependency


def save_audit_log(db, cierre_id: Optional[int], actor_id: int, action: str, details: Dict[str, Any]):
    cur = db.cursor()
    cur.execute(
        "INSERT INTO cierre_audit_log (cierre_id, actor_id, action, details_json) VALUES (%s, %s, %s, %s::jsonb)",
        (cierre_id, actor_id, action, json.dumps(details)),
    )


def hydrate_cierre(row: Dict[str, Any]) -> Dict[str, Any]:
    cierre = dict(row)
    reportado = parse_json_field(cierre.get("reportado_json"), {})
    validado = parse_json_field(cierre.get("validado_json"), {})
    cierre["reportado_json"] = normalize_payload(reportado)
    cierre["validado_json"] = normalize_payload(validado if validado else reportado)
    cierre["resumen_reportado"] = parse_json_field(cierre.get("resumen_reportado"), {})
    cierre["resumen_validado"] = parse_json_field(cierre.get("resumen_validado"), {})
    cierre["gaspro_summary"] = parse_json_field(cierre.get("gaspro_summary"), {})
    return cierre


def can_employee_edit(cierre: Dict[str, Any], user: Dict[str, Any]) -> bool:
    if user["role"] != "employee":
        return False
    if cierre.get("employee_id") != user["id"]:
        return False
    if cierre.get("status") not in EDITABLE_EMPLOYEE_STATUSES:
        return False
    if cierre.get("document_reviewed_at") or cierre.get("reconciled_at"):
        return False
    editable_until = cierre.get("editable_until")
    if not editable_until:
        return False
    if isinstance(editable_until, str):
        editable_until = datetime.fromisoformat(editable_until)
    return utcnow() <= editable_until


def assert_can_view_cierre(cierre: Dict[str, Any], user: Dict[str, Any]):
    if user["role"] in {"admin", "supervisor"}:
        return
    if cierre.get("employee_id") != user["id"]:
        raise HTTPException(status_code=403, detail="No podés ver este cierre")


def assert_can_edit_cierre(cierre: Dict[str, Any], user: Dict[str, Any]):
    if user["role"] in {"admin", "supervisor"}:
        return
    if not can_employee_edit(cierre, user):
        raise HTTPException(status_code=403, detail="El cierre ya no puede ser modificado")


def get_cierre_or_404(db, cierre_id: int) -> Dict[str, Any]:
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM cierres WHERE id = %s", (cierre_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Cierre no encontrado")
    return hydrate_cierre(row)


def persist_cierre_payload(db, payload: Dict[str, Any], validado_payload: Dict[str, Any], current_user: Dict[str, Any], cierre_id: Optional[int] = None, employee_id: Optional[int] = None, status: str = "submitted") -> int:
    reportado_payload = normalize_payload(payload)
    validado_payload = normalize_payload(validado_payload or payload)
    resumen_reportado = compute_summary(reportado_payload, validated=False)
    resumen_validado = compute_summary(validado_payload, validated=True)
    employee_id = employee_id or current_user["id"]
    employee = fetch_user_by_id(db, employee_id)
    if not employee:
        raise HTTPException(status_code=400, detail="Empleado inválido")
    editable_until = utcnow() + timedelta(hours=EMPLOYEE_EDIT_HOURS)
    cur = db.cursor()
    v = reportado_payload["vouchers"]
    creditos_text = json.dumps(reportado_payload["creditos"])
    sinpes_text = json.dumps(reportado_payload["sinpes"])
    vales_text = json.dumps(reportado_payload["vales"])
    pagos_text = json.dumps(reportado_payload["pagos"])
    if cierre_id is None:
        cur.execute(
            """
            INSERT INTO cierres (
                fecha, empleado, employee_id, turno, datafono, observaciones,
                status, reportado_json, validado_json, resumen_reportado, resumen_validado,
                created_by_user_id, edited_by_user_id, submitted_at, editable_until, updated_at,
                voucher_bcr, voucher_bac, voucher_bac_flotas, voucher_versatec,
                voucher_fleet_bncr, voucher_fleet_dav, voucher_bncr,
                creditos_json, sinpes_json, deposito, vales_json, pagos_json, efectivo, total_reportado, enviado_at
            ) VALUES (
                %s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,
                %s,%s,%s,%s,%s,
                %s,%s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s,%s,%s,%s,%s
            ) RETURNING id
            """,
            (
                reportado_payload["fecha"], employee["full_name"], employee["id"], reportado_payload["turno"], reportado_payload["datafono"], reportado_payload["observaciones"],
                status, json.dumps(reportado_payload), json.dumps(validado_payload), json.dumps(resumen_reportado), json.dumps(resumen_validado),
                current_user["id"], current_user["id"], utcnow(), editable_until, utcnow(),
                decimal_to_float(v.get("bcr_monto")), decimal_to_float(v.get("bac_monto")), decimal_to_float(v.get("bac_flotas_monto")), decimal_to_float(v.get("versatec_monto")),
                decimal_to_float(v.get("fleet_bncr_monto")), decimal_to_float(v.get("fleet_dav_monto")), decimal_to_float(v.get("bncr_monto")),
                creditos_text, sinpes_text, decimal_to_float(reportado_payload["deposito"]), vales_text, pagos_text, decimal_to_float(reportado_payload["efectivo"]), resumen_reportado["total_reportado"], utcnow(),
            ),
        )
        cierre_id = cur.fetchone()[0]
        save_audit_log(db, cierre_id, current_user["id"], "created", {"status": status})
    else:
        cur.execute(
            """
            UPDATE cierres
            SET fecha = %s,
                empleado = %s,
                employee_id = %s,
                turno = %s,
                datafono = %s,
                observaciones = %s,
                status = %s,
                reportado_json = %s::jsonb,
                validado_json = %s::jsonb,
                resumen_reportado = %s::jsonb,
                resumen_validado = %s::jsonb,
                edited_by_user_id = %s,
                editable_until = %s,
                updated_at = %s,
                voucher_bcr = %s,
                voucher_bac = %s,
                voucher_bac_flotas = %s,
                voucher_versatec = %s,
                voucher_fleet_bncr = %s,
                voucher_fleet_dav = %s,
                voucher_bncr = %s,
                creditos_json = %s,
                sinpes_json = %s,
                deposito = %s,
                vales_json = %s,
                pagos_json = %s,
                efectivo = %s,
                total_reportado = %s
            WHERE id = %s
            """,
            (
                reportado_payload["fecha"], employee["full_name"], employee["id"], reportado_payload["turno"], reportado_payload["datafono"], reportado_payload["observaciones"],
                status, json.dumps(reportado_payload), json.dumps(validado_payload), json.dumps(resumen_reportado), json.dumps(resumen_validado),
                current_user["id"], editable_until, utcnow(),
                decimal_to_float(v.get("bcr_monto")), decimal_to_float(v.get("bac_monto")), decimal_to_float(v.get("bac_flotas_monto")), decimal_to_float(v.get("versatec_monto")),
                decimal_to_float(v.get("fleet_bncr_monto")), decimal_to_float(v.get("fleet_dav_monto")), decimal_to_float(v.get("bncr_monto")),
                creditos_text, sinpes_text, decimal_to_float(reportado_payload["deposito"]), vales_text, pagos_text, decimal_to_float(reportado_payload["efectivo"]), resumen_reportado["total_reportado"], cierre_id,
            ),
        )
        save_audit_log(db, cierre_id, current_user["id"], "updated", {"status": status})
    db.commit()
    return cierre_id


def save_upload(file: UploadFile, subdir: str) -> Dict[str, Any]:
    content = file.file.read()
    digest = hashlib.sha256(content).hexdigest()
    target_dir = UPLOAD_ROOT / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "archivo").suffix
    filename = f"{uuid.uuid4().hex}{suffix}"
    target_path = target_dir / filename
    target_path.write_bytes(content)
    return {
        "path": str(target_path),
        "sha256": digest,
        "size_bytes": len(content),
        "mime_type": file.content_type or "application/octet-stream",
        "original_name": file.filename or filename,
    }


def infer_headers(row: List[Any]) -> Dict[str, int]:
    mapping = {}
    for idx, value in enumerate(row):
        key = normalize_text(value)
        for canonical, aliases in HEADER_ALIASES.items():
            if key in aliases and canonical not in mapping:
                mapping[canonical] = idx
    return mapping


def parse_date_value(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"No pude interpretar la fecha: {value}")


def normalize_product(value: Any) -> str:
    key = normalize_text(value)
    return PRODUCT_ALIASES.get(key, str(value or "").strip().lower())


def read_tabular_upload(path: Path) -> List[Dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            reader = csv.reader(fh)
            rows = list(reader)
    else:
        wb = openpyxl.load_workbook(path, data_only=True)
        ws = wb[wb.sheetnames[0]]
        rows = list(ws.iter_rows(values_only=True))
    header_map = None
    parsed: List[Dict[str, Any]] = []
    for row in rows:
        if not any(cell not in (None, "") for cell in row):
            continue
        if header_map is None:
            candidate = infer_headers(list(row))
            if {"fecha", "empleado", "producto", "litros", "monto"}.issubset(candidate.keys()):
                header_map = candidate
            continue
        entry = {key: row[idx] if idx < len(row) else None for key, idx in header_map.items()}
        try:
            parsed.append(
                {
                    "fecha": parse_date_value(entry.get("fecha")),
                    "empleado": str(entry.get("empleado") or "").strip(),
                    "turno": str(entry.get("turno") or "").strip(),
                    "producto": normalize_product(entry.get("producto")),
                    "litros": decimal_to_float(entry.get("litros")),
                    "monto": decimal_to_float(entry.get("monto")),
                    "ppu": decimal_to_float(entry.get("ppu")),
                    "raw_row": {k: (str(v) if isinstance(v, (datetime, date)) else v) for k, v in entry.items()},
                }
            )
        except Exception:
            continue
    return parsed


def summarize_gaspro_rows(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_employee: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        date_key = row["fecha"].isoformat()
        employee_key = normalize_text(row["empleado"])
        entity = by_employee.setdefault(date_key, {}).setdefault(employee_key, {"employee_name": row["empleado"], "products": {}, "price_change": False})
        product = entity["products"].setdefault(row["producto"], {"litros": 0.0, "monto": 0.0, "ppus": set()})
        product["litros"] += row["litros"]
        product["monto"] += row["monto"]
        if row["ppu"]:
            product["ppus"].add(round(row["ppu"], 4))
        if len(product["ppus"]) > 1:
            entity["price_change"] = True
    for date_key, employees in by_employee.items():
        for employee_key, summary in employees.items():
            for product_name, info in list(summary["products"].items()):
                summary["products"][product_name] = {
                    "litros": round(info["litros"], 3),
                    "monto": round(info["monto"], 2),
                    "ppus": sorted(info["ppus"]),
                }
    return by_employee


def apply_gaspro_to_cierre(db, cierre: Dict[str, Any], summary: Dict[str, Any], import_id: int, actor_id: int):
    mode = "price_change" if summary.get("price_change") else "normal"
    cur = db.cursor()
    cur.execute(
        """
        UPDATE cierres
        SET gaspro_summary = %s::jsonb,
            gaspro_import_id = %s,
            gaspro_mode = %s,
            reconciled_at = %s,
            status = %s,
            updated_at = %s
        WHERE id = %s
        """,
        (json.dumps(summary), import_id, mode, utcnow(), "reconciled", utcnow(), cierre["id"]),
    )
    save_audit_log(db, cierre["id"], actor_id, "gaspro_reconciled", {"import_id": import_id, "mode": mode})


def find_day_sheet(workbook, day_number: int):
    candidates = [name for name in workbook.sheetnames if str(name).strip().startswith(str(day_number))]
    return workbook[candidates[0]] if candidates else None


def fill_cierre_in_sheet(ws, cierre: Dict[str, Any], validated: bool = True):
    payload = cierre["validado_json"] if validated else cierre["reportado_json"]
    summary = cierre["resumen_validado"] if validated else cierre["resumen_reportado"]
    gaspro = cierre.get("gaspro_summary") or {}
    turno = max(1, int(cierre.get("turno") or 1))
    base = 9 + (turno - 1) * 17
    products = gaspro.get("products", {})
    ws[f"C{base}"] = products.get("super", {}).get("litros", 0)
    ws[f"C{base+1}"] = products.get("regular", {}).get("litros", 0)
    ws[f"C{base+2}"] = products.get("diesel", {}).get("litros", 0)
    ws[f"C{base+3}"] = products.get("glp", {}).get("litros", 0)
    ws[f"J{base+8}"] = summary.get("total_creditos", 0)
    ws[f"J{base+9}"] = summary.get("deposito", 0)
    ws[f"J{base+10}"] = summary.get("total_sinpes", 0) + summary.get("total_transferencias", 0)
    ws[f"J{base+11}"] = summary.get("total_pagos", 0)
    ws[f"J{base+12}"] = summary.get("total_vales", 0)
    ws[f"D{base+13}"] = cierre.get("empleado")
    ws[f"J{base+13}"] = summary.get("total_reportado", 0)


@app.on_event("startup")
def startup_event():
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(payload: LoginRequest, db=Depends(get_db)):
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    if payload.pin:
        cur.execute("SELECT * FROM users WHERE active = TRUE AND role = 'employee'")
        for row in cur.fetchall():
            if verify_secret(payload.pin, row.get("pin_hash")):
                token = secrets.token_urlsafe(48)
                db.cursor().execute(
                    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (%s, %s, %s)",
                    (row["id"], token_hash(token), utcnow() + timedelta(hours=TOKEN_TTL_HOURS)),
                )
                db.commit()
                return {"token": token, "user": row_to_user(row)}
        raise HTTPException(status_code=401, detail="PIN incorrecto")
    if payload.username and payload.password:
        cur.execute("SELECT * FROM users WHERE active = TRUE AND username = %s LIMIT 1", (payload.username,))
        row = cur.fetchone()
        if not row or row["role"] not in {"supervisor", "admin"} or not verify_secret(payload.password, row.get("password_hash")):
            raise HTTPException(status_code=401, detail="Credenciales incorrectas")
        token = secrets.token_urlsafe(48)
        db.cursor().execute(
            "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (%s, %s, %s)",
            (row["id"], token_hash(token), utcnow() + timedelta(hours=TOKEN_TTL_HOURS)),
        )
        db.commit()
        return {"token": token, "user": row_to_user(row)}
    raise HTTPException(status_code=400, detail="Faltan credenciales")


@app.post("/api/auth/logout")
def logout(user=Depends(get_current_user), db=Depends(get_db)):
    db.cursor().execute("UPDATE sessions SET revoked_at = NOW() WHERE id = %s", (user["session_id"],))
    db.commit()
    return {"ok": True}


@app.get("/api/me")
def me(user=Depends(get_current_user)):
    return row_to_user(user)


@app.get("/api/users")
def list_users(role: Optional[str] = None, _: dict = Depends(require_roles("admin", "supervisor")), db=Depends(get_db)):
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    if role:
        cur.execute("SELECT * FROM users WHERE role = %s ORDER BY full_name ASC", (role,))
    else:
        cur.execute("SELECT * FROM users ORDER BY role, full_name ASC")
    return [row_to_user(row) for row in cur.fetchall()]


@app.post("/api/users")
def create_user(payload: UserCreate, _: dict = Depends(require_roles("admin")), db=Depends(get_db)):
    pin_hash = hash_secret(payload.pin) if payload.pin else None
    password_hash = hash_secret(payload.password) if payload.password else None
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        INSERT INTO users (username, full_name, role, default_turno, pin_hash, password_hash, active)
        VALUES (%s, %s, %s, %s, %s, %s, TRUE)
        RETURNING *
        """,
        (payload.username, payload.full_name, payload.role, payload.default_turno, pin_hash, password_hash),
    )
    row = cur.fetchone()
    db.commit()
    return row_to_user(row)


@app.patch("/api/users/{user_id}")
def update_user(user_id: int, payload: UserUpdate, _: dict = Depends(require_roles("admin")), db=Depends(get_db)):
    row = fetch_user_by_id(db, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    cur = db.cursor()
    full_name = payload.full_name if payload.full_name is not None else row["full_name"]
    default_turno = payload.default_turno if payload.default_turno is not None else row.get("default_turno")
    active = payload.active if payload.active is not None else row["active"]
    pin_hash = hash_secret(payload.pin) if payload.pin else row.get("pin_hash")
    password_hash = hash_secret(payload.password) if payload.password else row.get("password_hash")
    cur.execute(
        """
        UPDATE users
        SET full_name = %s,
            default_turno = %s,
            active = %s,
            pin_hash = %s,
            password_hash = %s,
            updated_at = NOW()
        WHERE id = %s
        """,
        (full_name, default_turno, active, pin_hash, password_hash, user_id),
    )
    db.commit()
    return row_to_user(fetch_user_by_id(db, user_id))


@app.post("/api/cierres")
def create_cierre(payload: CierrePayload, user=Depends(get_current_user), db=Depends(get_db)):
    employee_id = payload.employee_id if user["role"] in {"admin", "supervisor"} and payload.employee_id else user["id"]
    cierre_id = persist_cierre_payload(db, payload.model_dump(), payload.model_dump(), user, employee_id=employee_id, status="submitted")
    return {"id": cierre_id, "status": "ok"}


@app.get("/api/cierres")
def list_cierres(
    fecha: Optional[str] = None,
    employee_id: Optional[int] = None,
    status: Optional[str] = None,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    query = "SELECT * FROM cierres WHERE 1=1"
    params: List[Any] = []
    if user["role"] == "employee":
        query += " AND employee_id = %s"
        params.append(user["id"])
    if fecha:
        query += " AND fecha = %s"
        params.append(fecha)
    if employee_id and user["role"] in {"admin", "supervisor"}:
        query += " AND employee_id = %s"
        params.append(employee_id)
    if status:
        query += " AND status = %s"
        params.append(status)
    query += " ORDER BY fecha DESC, id DESC"
    cur.execute(query, params)
    return [hydrate_cierre(row) for row in cur.fetchall()]


@app.get("/api/cierres/{cierre_id}")
def get_cierre(cierre_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    cierre = get_cierre_or_404(db, cierre_id)
    assert_can_view_cierre(cierre, user)
    return cierre


@app.put("/api/cierres/{cierre_id}")
def update_cierre(cierre_id: int, payload: CierrePayload, user=Depends(get_current_user), db=Depends(get_db)):
    cierre = get_cierre_or_404(db, cierre_id)
    assert_can_edit_cierre(cierre, user)
    employee_id = payload.employee_id if user["role"] in {"admin", "supervisor"} and payload.employee_id else cierre.get("employee_id")
    persist_cierre_payload(db, payload.model_dump(), payload.model_dump(), user, cierre_id=cierre_id, employee_id=employee_id, status=cierre["status"] if user["role"] == "employee" else "submitted")
    return {"ok": True, "id": cierre_id}


@app.post("/api/cierres/{cierre_id}/review")
def review_cierre(cierre_id: int, payload: ReviewPayload, user=Depends(require_roles("admin", "supervisor")), db=Depends(get_db)):
    cierre = get_cierre_or_404(db, cierre_id)
    validado_payload = normalize_payload(payload.validado_json)
    resumen_validado = compute_summary(validado_payload, validated=True)
    cur = db.cursor()
    cur.execute(
        """
        UPDATE cierres
        SET validado_json = %s::jsonb,
            resumen_validado = %s::jsonb,
            status = %s,
            audit_notes = %s,
            document_reviewed_at = NOW(),
            edited_by_user_id = %s,
            updated_at = NOW()
        WHERE id = %s
        """,
        (json.dumps(validado_payload), json.dumps(resumen_validado), payload.status, payload.audit_notes or "", user["id"], cierre_id),
    )
    save_audit_log(db, cierre_id, user["id"], "document_reviewed", {"status": payload.status, "notes": payload.audit_notes or ""})
    db.commit()
    return {"ok": True}


@app.post("/api/cierres/{cierre_id}/attachments")
def upload_attachment(
    cierre_id: int,
    category: str = Form(...),
    movement_id: Optional[str] = Form(default=None),
    file: UploadFile = File(...),
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    cierre = get_cierre_or_404(db, cierre_id)
    assert_can_view_cierre(cierre, user)
    saved = save_upload(file, f"cierres/{cierre_id}")
    cur = db.cursor()
    cur.execute(
        """
        INSERT INTO cierre_attachments (cierre_id, uploaded_by_user_id, category, movement_id, original_name, storage_path, mime_type, size_bytes, sha256)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
        """,
        (cierre_id, user["id"], category, movement_id, saved["original_name"], saved["path"], saved["mime_type"], saved["size_bytes"], saved["sha256"]),
    )
    attachment_id = cur.fetchone()[0]
    save_audit_log(db, cierre_id, user["id"], "attachment_uploaded", {"attachment_id": attachment_id, "category": category})
    db.commit()
    return {"id": attachment_id, **saved}


@app.get("/api/cierres/{cierre_id}/attachments")
def list_attachments(cierre_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    cierre = get_cierre_or_404(db, cierre_id)
    assert_can_view_cierre(cierre, user)
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM cierre_attachments WHERE cierre_id = %s ORDER BY created_at DESC", (cierre_id,))
    return [dict(row) for row in cur.fetchall()]


@app.post("/api/gaspro/import", response_model=GasproImportResponse)
def import_gaspro(
    import_mode: str = Form(...),
    date_from: str = Form(...),
    date_to: str = Form(...),
    file: UploadFile = File(...),
    user=Depends(require_roles("admin", "supervisor")),
    db=Depends(get_db),
):
    saved = save_upload(file, "gaspro")
    rows = read_tabular_upload(Path(saved["path"]))
    summary_by_date = summarize_gaspro_rows(rows)
    cur = db.cursor()
    cur.execute(
        """
        INSERT INTO gaspro_imports (uploaded_by_user_id, import_mode, original_name, storage_path, mime_type, size_bytes, sha256, date_from, date_to)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
        """,
        (user["id"], import_mode, saved["original_name"], saved["path"], saved["mime_type"], saved["size_bytes"], saved["sha256"], date_from, date_to),
    )
    import_id = cur.fetchone()[0]
    for row in rows:
        cur.execute(
            """
            INSERT INTO gaspro_rows (gaspro_import_id, fecha, empleado, turno, producto, litros, monto, ppu, raw_row)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
            """,
            (import_id, row["fecha"], row["empleado"], row["turno"], row["producto"], row["litros"], row["monto"], row["ppu"], json.dumps(row["raw_row"])),
        )
    matched = 0
    cur_dict = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur_dict.execute("SELECT * FROM cierres WHERE fecha BETWEEN %s AND %s", (date_from, date_to))
    for cierre in [hydrate_cierre(row) for row in cur_dict.fetchall()]:
        date_key = cierre["fecha"].isoformat() if isinstance(cierre["fecha"], date) else str(cierre["fecha"])
        employee_key = normalize_text(cierre.get("empleado"))
        summary = summary_by_date.get(date_key, {}).get(employee_key)
        if not summary:
            continue
        apply_gaspro_to_cierre(db, cierre, summary, import_id, user["id"])
        matched += 1
    cur.execute("UPDATE gaspro_imports SET matched_cierres = %s, reconciled_at = NOW() WHERE id = %s", (matched, import_id))
    db.commit()
    return GasproImportResponse(import_id=import_id, matched_cierres=matched, import_mode=import_mode)


@app.get("/api/gaspro/imports")
def list_gaspro_imports(user=Depends(require_roles("admin", "supervisor")), db=Depends(get_db)):
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM gaspro_imports ORDER BY created_at DESC")
    return [dict(row) for row in cur.fetchall()]


@app.get("/api/export/csv")
def export_csv(fecha_inicio: Optional[str] = None, fecha_fin: Optional[str] = None, user=Depends(require_roles("admin", "supervisor")), db=Depends(get_db)):
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    query = "SELECT * FROM cierres WHERE 1=1"
    params = []
    if fecha_inicio:
        query += " AND fecha >= %s"
        params.append(fecha_inicio)
    if fecha_fin:
        query += " AND fecha <= %s"
        params.append(fecha_fin)
    query += " ORDER BY fecha ASC, id ASC"
    cur.execute(query, params)
    rows = [hydrate_cierre(row) for row in cur.fetchall()]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "fecha", "empleado", "turno", "status", "total_reportado", "total_validado", "gaspro_mode"])
    for row in rows:
        writer.writerow([
            row["id"],
            row["fecha"],
            row["empleado"],
            row["turno"],
            row["status"],
            row["resumen_reportado"].get("total_reportado", 0),
            row["resumen_validado"].get("total_reportado", 0),
            row.get("gaspro_mode") or "",
        ])
    output.seek(0)
    return StreamingResponse(output, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=cierres_{date.today().isoformat()}.csv"})


@app.get("/api/export/monthly.xlsx")
def export_monthly_excel(month: str, validated: bool = True, user=Depends(require_roles("admin", "supervisor")), db=Depends(get_db)):
    try:
        month_start = datetime.strptime(month, "%Y-%m").date().replace(day=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de mes inválido. Usá YYYY-MM")
    next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM cierres WHERE fecha >= %s AND fecha < %s ORDER BY fecha, turno", (month_start, next_month))
    cierres = [hydrate_cierre(row) for row in cur.fetchall()]
    if EXPORT_TEMPLATE_PATH.exists():
        wb = openpyxl.load_workbook(EXPORT_TEMPLATE_PATH)
    else:
        wb = openpyxl.Workbook()
        wb.active.title = month_start.strftime("%m")
    for cierre in cierres:
        ws = find_day_sheet(wb, int(cierre["fecha"].day))
        if ws:
            fill_cierre_in_sheet(ws, cierre, validated=validated)
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=cierres_{month}.xlsx"},
    )


FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(FRONTEND_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")

    @app.get("/")
    def serve_root():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = os.path.join(FRONTEND_DIR, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
