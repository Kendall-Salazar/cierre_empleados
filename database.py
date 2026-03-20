import os

import psycopg2


def connect_db():
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        return psycopg2.connect(database_url)

    pg_config = {
        "host": os.environ.get("PGHOST"),
        "port": os.environ.get("PGPORT"),
        "user": os.environ.get("PGUSER"),
        "password": os.environ.get("PGPASSWORD"),
        "dbname": os.environ.get("PGDATABASE"),
    }
    if all(pg_config.values()):
        return psycopg2.connect(**pg_config)

    raise RuntimeError(
        "Base de datos no configurada. Defini DATABASE_URL o las variables "
        "PGHOST, PGPORT, PGUSER, PGPASSWORD y PGDATABASE."
    )


def get_db():
    conn = connect_db()
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    conn = connect_db()
    cur = conn.cursor()
    cur.execute(
        """
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
        """
    )
    conn.commit()
    cur.close()
    conn.close()
    print("Base de datos lista")
