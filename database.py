import os
from typing import Iterable, Tuple

import psycopg2


LEGACY_EMPLOYEE_DIRECTORY = {
    "1001": {"nombre": "Jeison", "turno_default": "1"},
    "1002": {"nombre": "Eligio", "turno_default": "2"},
    "1003": {"nombre": "Maikel", "turno_default": "3"},
    "1004": {"nombre": "Jensy", "turno_default": "4"},
    "1005": {"nombre": "Ileana", "turno_default": "5"},
    "1006": {"nombre": "Steven", "turno_default": "6"},
    "1007": {"nombre": "Randall", "turno_default": "7"},
    "1008": {"nombre": "Angel", "turno_default": "8"},
    "1009": {"nombre": "Keilor", "turno_default": "9"},
    "1010": {"nombre": "Tomas", "turno_default": "10"},
    "1011": {"nombre": "Jensy B", "turno_default": "11"},
}


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


def hash_secret(secret: str) -> str:
    import hashlib
    import secrets

    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt.encode("utf-8"), 200_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def slugify(value: str) -> str:
    import re
    import unicodedata

    text = unicodedata.normalize("NFKD", value)
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "usuario"


def execute_statements(cur, statements: Iterable[str]):
    for statement in statements:
        cur.execute(statement)


def ensure_column(cur, table: str, column: str, definition: str):
    cur.execute(
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = %s
          AND column_name = %s
        """,
        (table, column),
    )
    if cur.fetchone():
        return
    cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def ensure_jsonb_column(cur, table: str, column: str, default_sql: str):
    cur.execute(
        """
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = %s
          AND column_name = %s
        """,
        (table, column),
    )
    row = cur.fetchone()
    if not row:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} JSONB NOT NULL DEFAULT {default_sql}")
        return

    if row[0] == "jsonb":
        return

    cur.execute(
        f"""
        ALTER TABLE {table}
        ALTER COLUMN {column} TYPE JSONB
        USING CASE
            WHEN {column} IS NULL OR trim({column}::text) = '' THEN {default_sql}
            ELSE {column}::jsonb
        END
        """
    )
    cur.execute(f"ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT {default_sql}")
    cur.execute(f"UPDATE {table} SET {column} = {default_sql} WHERE {column} IS NULL")
    cur.execute(f"ALTER TABLE {table} ALTER COLUMN {column} SET NOT NULL")


def seed_users(cur):
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin1234")
    supervisor_password = os.environ.get("SUPERVISOR_PASSWORD", admin_password)
    default_staff = [
        ("admin", "Administrador", "admin", None, None, hash_secret(admin_password)),
        ("supervisor", "Supervisor", "supervisor", None, None, hash_secret(supervisor_password)),
    ]
    for username, full_name, role, default_turno, pin_hash, password_hash in default_staff:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cur.fetchone():
            continue
        cur.execute(
            """
            INSERT INTO users (username, full_name, role, default_turno, pin_hash, password_hash, active)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE)
            """,
            (username, full_name, role, default_turno, pin_hash, password_hash),
        )

    for pin, data in LEGACY_EMPLOYEE_DIRECTORY.items():
        username = slugify(data["nombre"])
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cur.fetchone():
            continue
        cur.execute(
            """
            INSERT INTO users (username, full_name, role, default_turno, pin_hash, password_hash, active)
            VALUES (%s, %s, 'employee', %s, %s, NULL, TRUE)
            """,
            (username, data["nombre"], data["turno_default"], hash_secret(pin)),
        )


def init_db():
    conn = connect_db()
    cur = conn.cursor()
    execute_statements(
        cur,
        [
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('employee', 'supervisor', 'admin')),
                default_turno TEXT,
                pin_hash TEXT,
                password_hash TEXT,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                revoked_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS gaspro_imports (
                id SERIAL PRIMARY KEY,
                uploaded_by_user_id INTEGER NOT NULL REFERENCES users(id),
                import_mode TEXT NOT NULL CHECK (import_mode IN ('general', 'detailed')),
                original_name TEXT NOT NULL,
                storage_path TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes BIGINT NOT NULL DEFAULT 0,
                sha256 TEXT NOT NULL,
                date_from DATE NOT NULL,
                date_to DATE NOT NULL,
                matched_cierres INTEGER NOT NULL DEFAULT 0,
                reconciled_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS cierres (
                id SERIAL PRIMARY KEY,
                fecha DATE NOT NULL,
                empleado TEXT,
                employee_id INTEGER REFERENCES users(id),
                turno TEXT NOT NULL DEFAULT '',
                datafono TEXT NOT NULL DEFAULT '',
                observaciones TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft',
                audit_notes TEXT NOT NULL DEFAULT '',
                reportado_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                validado_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                resumen_reportado JSONB NOT NULL DEFAULT '{}'::jsonb,
                resumen_validado JSONB NOT NULL DEFAULT '{}'::jsonb,
                gaspro_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
                gaspro_import_id INTEGER REFERENCES gaspro_imports(id),
                gaspro_mode TEXT,
                created_by_user_id INTEGER REFERENCES users(id),
                edited_by_user_id INTEGER REFERENCES users(id),
                submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
                editable_until TIMESTAMP,
                document_reviewed_at TIMESTAMP,
                reconciled_at TIMESTAMP,
                locked_at TIMESTAMP,
                locked_reason TEXT,
                updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

                voucher_bcr NUMERIC DEFAULT 0,
                voucher_bac NUMERIC DEFAULT 0,
                voucher_bac_flotas NUMERIC DEFAULT 0,
                voucher_versatec NUMERIC DEFAULT 0,
                voucher_fleet_bncr NUMERIC DEFAULT 0,
                voucher_fleet_dav NUMERIC DEFAULT 0,
                voucher_bncr NUMERIC DEFAULT 0,
                creditos_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                sinpes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                deposito NUMERIC DEFAULT 0,
                vales_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                pagos_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                efectivo NUMERIC DEFAULT 0,
                total_reportado NUMERIC DEFAULT 0,
                enviado_at TIMESTAMP DEFAULT NOW()
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS cierre_attachments (
                id SERIAL PRIMARY KEY,
                cierre_id INTEGER NOT NULL REFERENCES cierres(id) ON DELETE CASCADE,
                uploaded_by_user_id INTEGER NOT NULL REFERENCES users(id),
                category TEXT NOT NULL,
                movement_id TEXT,
                original_name TEXT NOT NULL,
                storage_path TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes BIGINT NOT NULL DEFAULT 0,
                sha256 TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS cierre_audit_log (
                id SERIAL PRIMARY KEY,
                cierre_id INTEGER REFERENCES cierres(id) ON DELETE CASCADE,
                actor_id INTEGER NOT NULL REFERENCES users(id),
                action TEXT NOT NULL,
                details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS gaspro_rows (
                id SERIAL PRIMARY KEY,
                gaspro_import_id INTEGER NOT NULL REFERENCES gaspro_imports(id) ON DELETE CASCADE,
                fecha DATE NOT NULL,
                empleado TEXT NOT NULL,
                turno TEXT NOT NULL DEFAULT '',
                producto TEXT NOT NULL DEFAULT '',
                litros NUMERIC NOT NULL DEFAULT 0,
                monto NUMERIC NOT NULL DEFAULT 0,
                ppu NUMERIC NOT NULL DEFAULT 0,
                raw_row JSONB NOT NULL DEFAULT '{}'::jsonb
            );
            """,
        ],
    )

    legacy_columns: Tuple[Tuple[str, str], ...] = (
        ("employee_id", "INTEGER REFERENCES users(id)"),
        ("reportado_json", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
        ("validado_json", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
        ("resumen_reportado", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
        ("resumen_validado", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
        ("status", "TEXT NOT NULL DEFAULT 'draft'"),
        ("created_by_user_id", "INTEGER REFERENCES users(id)"),
        ("edited_by_user_id", "INTEGER REFERENCES users(id)"),
        ("submitted_at", "TIMESTAMP NOT NULL DEFAULT NOW()"),
        ("enviado_at", "TIMESTAMP DEFAULT NOW()"),
        ("editable_until", "TIMESTAMP"),
        ("document_reviewed_at", "TIMESTAMP"),
        ("reconciled_at", "TIMESTAMP"),
        ("audit_notes", "TEXT NOT NULL DEFAULT ''"),
        ("updated_at", "TIMESTAMP NOT NULL DEFAULT NOW()"),
        ("gaspro_summary", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
        ("gaspro_import_id", "INTEGER REFERENCES gaspro_imports(id)"),
        ("gaspro_mode", "TEXT"),
        ("locked_at", "TIMESTAMP"),
        ("locked_reason", "TEXT"),
        ("voucher_bcr", "NUMERIC DEFAULT 0"),
        ("voucher_bac", "NUMERIC DEFAULT 0"),
        ("voucher_bac_flotas", "NUMERIC DEFAULT 0"),
        ("voucher_versatec", "NUMERIC DEFAULT 0"),
        ("voucher_fleet_bncr", "NUMERIC DEFAULT 0"),
        ("voucher_fleet_dav", "NUMERIC DEFAULT 0"),
        ("voucher_bncr", "NUMERIC DEFAULT 0"),
        ("creditos_json", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
        ("sinpes_json", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
        ("deposito", "NUMERIC DEFAULT 0"),
        ("vales_json", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
        ("pagos_json", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
        ("efectivo", "NUMERIC DEFAULT 0"),
        ("total_reportado", "NUMERIC DEFAULT 0"),
    )
    for column, definition in legacy_columns:
        ensure_column(cur, "cierres", column, definition)

    jsonb_columns: Tuple[Tuple[str, str], ...] = (
        ("reportado_json", "'{}'::jsonb"),
        ("validado_json", "'{}'::jsonb"),
        ("resumen_reportado", "'{}'::jsonb"),
        ("resumen_validado", "'{}'::jsonb"),
        ("gaspro_summary", "'{}'::jsonb"),
        ("creditos_json", "'[]'::jsonb"),
        ("sinpes_json", "'[]'::jsonb"),
        ("vales_json", "'[]'::jsonb"),
        ("pagos_json", "'[]'::jsonb"),
    )
    for column, default_sql in jsonb_columns:
        ensure_jsonb_column(cur, "cierres", column, default_sql)

    seed_users(cur)
    cur.execute(
        """
        UPDATE cierres c
        SET employee_id = u.id,
            empleado = COALESCE(c.empleado, u.full_name)
        FROM users u
        WHERE c.employee_id IS NULL
          AND c.empleado IS NOT NULL
          AND lower(u.full_name) = lower(c.empleado)
        """
    )

    conn.commit()
    cur.close()
    conn.close()
    print("Base de datos lista")
