import os
import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL no está configurado")

def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cierres (
            id                   SERIAL PRIMARY KEY,
            fecha                DATE NOT NULL,
            empleado             TEXT NOT NULL,
            turno                TEXT NOT NULL,
            datafono             TEXT DEFAULT '',
            voucher_bcr          NUMERIC DEFAULT 0,
            voucher_bac          NUMERIC DEFAULT 0,
            voucher_bac_flotas   NUMERIC DEFAULT 0,
            voucher_versatec     NUMERIC DEFAULT 0,
            voucher_fleet_bncr   NUMERIC DEFAULT 0,
            voucher_fleet_dav    NUMERIC DEFAULT 0,
            voucher_bncr         NUMERIC DEFAULT 0,
            creditos_json        TEXT DEFAULT '[]',
            sinpes_json          TEXT DEFAULT '[]',
            deposito             NUMERIC DEFAULT 0,
            vales_json           TEXT DEFAULT '[]',
            pagos_json           TEXT DEFAULT '[]',
            efectivo             NUMERIC DEFAULT 0,
            total_reportado      NUMERIC DEFAULT 0,
            observaciones        TEXT DEFAULT '',
            enviado_at           TIMESTAMP DEFAULT NOW()
        );
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("✅ Base de datos lista")
