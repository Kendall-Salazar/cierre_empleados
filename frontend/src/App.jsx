import { useEffect, useMemo, useState } from "react";

const API_URL = "";

async function api(path, options = {}, token = null) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Error del servidor");
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return res;
}

function emptyMovement() {
  return {
    id: crypto.randomUUID(),
    descripcion: "",
    cliente: "",
    referencia: "",
    monto_reportado: "",
    estado: "reportado",
    observacion_empleado: "",
  };
}

function emptyForm(defaultTurno = "1") {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    turno: defaultTurno || "1",
    datafono: "",
    vouchers: {
      bcr_qty: "", bcr_monto: "",
      bac_qty: "", bac_monto: "",
      bac_flotas_qty: "", bac_flotas_monto: "",
      versatec_qty: "", versatec_monto: "",
      fleet_bncr_qty: "", fleet_bncr_monto: "",
      fleet_dav_qty: "", fleet_dav_monto: "",
      bncr_qty: "", bncr_monto: "",
    },
    creditos: [],
    sinpes: [],
    transferencias: [],
    deposito: "",
    vales: [],
    pagos: [],
    efectivo: "",
    observaciones: "",
  };
}

function money(n) {
  return Number(n || 0).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function useSession() {
  const [token, setToken] = useState(localStorage.getItem("cierre_token") || "");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("cierre_user");
    return raw ? JSON.parse(raw) : null;
  });

  const save = (nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
    if (nextToken) localStorage.setItem("cierre_token", nextToken); else localStorage.removeItem("cierre_token");
    if (nextUser) localStorage.setItem("cierre_user", JSON.stringify(nextUser)); else localStorage.removeItem("cierre_user");
  };

  return { token, user, save, clear: () => save("", null) };
}

function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("employee");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("supervisor");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = mode === "employee" ? { pin } : { username, password };
      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.pageCenter}>
      <div style={styles.card}>
        <h1 style={styles.title}>Cierre de Caja</h1>
        <div style={styles.segmented}>
          <button style={mode === "employee" ? styles.segmentActive : styles.segment} onClick={() => setMode("employee")}>Empleado</button>
          <button style={mode === "staff" ? styles.segmentActive : styles.segment} onClick={() => setMode("staff")}>Supervisor / Admin</button>
        </div>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          {mode === "employee" ? (
            <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN de empleado" style={styles.input} />
          ) : (
            <>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuario" style={styles.input} />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" type="password" style={styles.input} />
            </>
          )}
          {error && <div style={styles.error}>{error}</div>}
          <button disabled={loading} style={styles.primaryButton}>{loading ? "Entrando..." : "Entrar"}</button>
        </form>
      </div>
    </div>
  );
}

function DynamicList({ title, items, setItems }) {
  const update = (idx, key, value) => setItems(items.map((item, i) => i === idx ? { ...item, [key]: value } : item));
  const remove = (idx) => setItems(items.filter((_, i) => i !== idx));
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <strong>{title}</strong>
        <button type="button" style={styles.secondaryButton} onClick={() => setItems([...items, emptyMovement()])}>+ Agregar</button>
      </div>
      {items.length === 0 && <div style={styles.muted}>Sin registros.</div>}
      {items.map((item, idx) => (
        <div key={item.id || idx} style={styles.rowCard}>
          <div style={styles.grid2}>
            <input style={styles.input} value={item.descripcion || ""} onChange={(e) => update(idx, "descripcion", e.target.value)} placeholder="Descripción" />
            <input style={styles.input} value={item.cliente || ""} onChange={(e) => update(idx, "cliente", e.target.value)} placeholder="Cliente" />
            <input style={styles.input} value={item.referencia || ""} onChange={(e) => update(idx, "referencia", e.target.value)} placeholder="Referencia" />
            <input style={styles.input} value={item.monto_reportado || ""} onChange={(e) => update(idx, "monto_reportado", e.target.value)} placeholder="Monto" />
          </div>
          <button type="button" style={styles.linkDanger} onClick={() => remove(idx)}>Eliminar</button>
        </div>
      ))}
    </div>
  );
}

function CierreForm({ initial, onSave, employees = [], canChooseEmployee = false }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);

  const setVoucher = (key, value) => setForm((prev) => ({ ...prev, vouchers: { ...prev.vouchers, [key]: value } }));
  const total = useMemo(() => {
    const voucherKeys = ["bcr_monto","bac_monto","bac_flotas_monto","versatec_monto","fleet_bncr_monto","fleet_dav_monto","bncr_monto"];
    const vouchers = voucherKeys.reduce((acc, key) => acc + Number(form.vouchers[key] || 0), 0);
    const listTotal = (arr) => arr.reduce((acc, item) => acc + Number(item.monto_reportado || 0), 0);
    return vouchers + listTotal(form.creditos) + listTotal(form.sinpes) + listTotal(form.transferencias) + Number(form.deposito || 0) + Number(form.efectivo || 0) - listTotal(form.vales) - listTotal(form.pagos);
  }, [form]);

  const submit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
      <div style={styles.grid2}>
        <input type="date" style={styles.input} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
        <input style={styles.input} value={form.turno} onChange={(e) => setForm({ ...form, turno: e.target.value })} placeholder="Turno" />
        <input style={styles.input} value={form.datafono} onChange={(e) => setForm({ ...form, datafono: e.target.value })} placeholder="Datafono" />
        <input style={styles.input} value={form.efectivo} onChange={(e) => setForm({ ...form, efectivo: e.target.value })} placeholder="Efectivo" />
        <input style={styles.input} value={form.deposito} onChange={(e) => setForm({ ...form, deposito: e.target.value })} placeholder="Depósito" />
        {canChooseEmployee ? (
          <select style={styles.input} value={form.employee_id || ""} onChange={(e) => setForm({ ...form, employee_id: Number(e.target.value) || null })}>
            <option value="">Empleado</option>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
          </select>
        ) : null}
      </div>
      <div style={styles.section}>
        <strong>Vouchers</strong>
        <div style={styles.grid2}>
          {[
            ["bcr_monto", "BCR"], ["bac_monto", "BAC"], ["bac_flotas_monto", "BAC Flotas"],
            ["versatec_monto", "Versatec"], ["fleet_bncr_monto", "Fleet BNCR"], ["fleet_dav_monto", "Fleet DAV"], ["bncr_monto", "BNCR"]
          ].map(([key, label]) => (
            <input key={key} style={styles.input} value={form.vouchers[key] || ""} onChange={(e) => setVoucher(key, e.target.value)} placeholder={label} />
          ))}
        </div>
      </div>
      <DynamicList title="Créditos" items={form.creditos} setItems={(creditos) => setForm({ ...form, creditos })} />
      <DynamicList title="SINPE móvil" items={form.sinpes} setItems={(sinpes) => setForm({ ...form, sinpes })} />
      <DynamicList title="Transferencias" items={form.transferencias} setItems={(transferencias) => setForm({ ...form, transferencias })} />
      <DynamicList title="Vales" items={form.vales} setItems={(vales) => setForm({ ...form, vales })} />
      <DynamicList title="Pagos" items={form.pagos} setItems={(pagos) => setForm({ ...form, pagos })} />
      <textarea style={styles.textarea} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} placeholder="Observaciones" />
      <div style={styles.totalBox}>Total reportado: ₡{money(total)}</div>
      <button style={styles.primaryButton}>Guardar cierre</button>
    </form>
  );
}

function EmployeeDashboard({ token, user, onLogout }) {
  const [cierres, setCierres] = useState([]);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    const data = await api("/api/cierres", {}, token);
    setCierres(data);
  };
  useEffect(() => { load(); }, []);

  const save = async (payload) => {
    setMessage("");
    if (editing?.id) {
      await api(`/api/cierres/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) }, token);
      setMessage("Cierre actualizado.");
    } else {
      await api("/api/cierres", { method: "POST", body: JSON.stringify(payload) }, token);
      setMessage("Cierre creado.");
    }
    setEditing(null);
    load();
  };

  return (
    <div style={styles.page}>
      <Header user={user} onLogout={onLogout} title="Panel de empleado" />
      {message && <div style={styles.success}>{message}</div>}
      <div style={styles.columns}>
        <div style={styles.panel}>
          <h3>{editing ? "Editar cierre" : "Nuevo cierre"}</h3>
          <CierreForm initial={editing?.reportado_json || emptyForm(user.default_turno)} onSave={save} />
          {editing && <button style={styles.linkButton} onClick={() => setEditing(null)}>Cancelar edición</button>}
        </div>
        <div style={styles.panel}>
          <h3>Mis cierres</h3>
          {cierres.map((cierre) => (
            <div key={cierre.id} style={styles.listItem}>
              <div>
                <strong>{cierre.fecha}</strong> · turno {cierre.turno}<br />
                <span style={styles.muted}>{cierre.status}</span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <span>₡{money(cierre.resumen_reportado?.total_reportado || 0)}</span>
                {cierre.status === "submitted" || cierre.status === "observed" || cierre.status === "draft" ? (
                  <button style={styles.secondaryButton} onClick={() => setEditing(cierre)}>Editar</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({ token, employees }) {
  const [cierres, setCierres] = useState([]);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("document_reviewed");

  const load = async () => {
    const data = await api("/api/cierres", {}, token);
    setCierres(data);
  };
  useEffect(() => { load(); }, []);

  const submitReview = async () => {
    await api(`/api/cierres/${selected.id}/review`, {
      method: "POST",
      body: JSON.stringify({ validado_json: selected.validado_json || selected.reportado_json, audit_notes: notes, status }),
    }, token);
    setSelected(null);
    setNotes("");
    load();
  };

  return (
    <div style={styles.columns}>
      <div style={styles.panel}>
        <h3>Cierres para revisión</h3>
        {cierres.map((cierre) => (
          <div key={cierre.id} style={styles.listItem} onClick={() => { setSelected(cierre); setNotes(cierre.audit_notes || ""); setStatus(cierre.status || "document_reviewed"); }}>
            <div>
              <strong>{cierre.empleado}</strong><br />
              <span style={styles.muted}>{cierre.fecha} · turno {cierre.turno}</span>
            </div>
            <div>{cierre.status}</div>
          </div>
        ))}
      </div>
      <div style={styles.panel}>
        {selected ? (
          <>
            <h3>Revisión de {selected.empleado}</h3>
            <pre style={styles.codeBox}>{JSON.stringify(selected.reportado_json, null, 2)}</pre>
            <textarea style={styles.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas de auditoría" />
            <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="document_reviewed">Documental revisado</option>
              <option value="observed">Observado</option>
              <option value="approved">Aprobado</option>
            </select>
            <button style={styles.primaryButton} onClick={submitReview}>Guardar revisión</button>
          </>
        ) : <div style={styles.muted}>Selecciona un cierre.</div>}
      </div>
    </div>
  );
}

function GasproPanel({ token }) {
  const [imports, setImports] = useState([]);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("general");
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState("");

  const load = async () => setImports(await api("/api/gaspro/imports", {}, token));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    const form = new FormData();
    form.append("import_mode", mode);
    form.append("date_from", dateFrom);
    form.append("date_to", dateTo);
    form.append("file", file);
    const data = await api("/api/gaspro/import", { method: "POST", body: form }, token);
    setMessage(`Importación ${data.import_id} aplicada a ${data.matched_cierres} cierres.`);
    setFile(null);
    load();
  };

  return (
    <div style={styles.columns}>
      <div style={styles.panel}>
        <h3>Subir Gaspro</h3>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <select style={styles.input} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="general">General</option>
            <option value="detailed">Detallado</option>
          </select>
          <input type="date" style={styles.input} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" style={styles.input} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <input type="file" style={styles.input} onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button disabled={!file} style={styles.primaryButton}>Importar</button>
        </form>
        {message && <div style={styles.success}>{message}</div>}
      </div>
      <div style={styles.panel}>
        <h3>Historial de importaciones</h3>
        {imports.map((imp) => (
          <div key={imp.id} style={styles.listItem}>
            <div>
              <strong>{imp.original_name}</strong><br />
              <span style={styles.muted}>{imp.date_from} → {imp.date_to}</span>
            </div>
            <div>{imp.matched_cierres} cierres</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaffDashboard({ token, user, onLogout }) {
  const [tab, setTab] = useState("review");
  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    api("/api/users?role=employee", {}, token).then(setEmployees).catch(() => setEmployees([]));
  }, []);
  return (
    <div style={styles.page}>
      <Header user={user} onLogout={onLogout} title={`Panel ${user.role}`} />
      <div style={styles.segmented}>
        <button style={tab === "review" ? styles.segmentActive : styles.segment} onClick={() => setTab("review")}>Revisión</button>
        <button style={tab === "gaspro" ? styles.segmentActive : styles.segment} onClick={() => setTab("gaspro")}>Gaspro</button>
      </div>
      {tab === "review" ? <ReviewPanel token={token} employees={employees} /> : <GasproPanel token={token} />}
    </div>
  );
}

function Header({ user, onLogout, title }) {
  return (
    <div style={styles.header}>
      <div>
        <div style={styles.muted}>{title}</div>
        <h2 style={{ margin: 0 }}>{user.full_name}</h2>
      </div>
      <button style={styles.secondaryButton} onClick={onLogout}>Salir</button>
    </div>
  );
}

export default function App() {
  const session = useSession();
  if (!session.token || !session.user) return <LoginScreen onLogin={session.save} />;
  return session.user.role === "employee"
    ? <EmployeeDashboard token={session.token} user={session.user} onLogout={session.clear} />
    : <StaffDashboard token={session.token} user={session.user} onLogout={session.clear} />;
}

const styles = {
  pageCenter: { minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f172a", padding: 24, color: "#e2e8f0" },
  page: { minHeight: "100vh", background: "#0f172a", padding: 24, color: "#e2e8f0" },
  card: { width: "min(460px, 100%)", background: "#111827", borderRadius: 16, padding: 24, boxShadow: "0 20px 50px rgba(0,0,0,.25)" },
  panel: { background: "#111827", borderRadius: 16, padding: 20, display: "grid", gap: 16 },
  title: { marginTop: 0, marginBottom: 16 },
  input: { width: "100%", padding: 12, borderRadius: 10, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", boxSizing: "border-box" },
  textarea: { width: "100%", minHeight: 100, padding: 12, borderRadius: 10, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", boxSizing: "border-box" },
  primaryButton: { padding: "12px 16px", borderRadius: 10, border: 0, background: "#f59e0b", color: "#111827", fontWeight: 700, cursor: "pointer" },
  secondaryButton: { padding: "10px 14px", borderRadius: 10, border: "1px solid #475569", background: "#1e293b", color: "#e2e8f0", cursor: "pointer" },
  linkButton: { background: "transparent", border: 0, color: "#f59e0b", cursor: "pointer", padding: 0 },
  linkDanger: { background: "transparent", border: 0, color: "#f87171", cursor: "pointer", padding: 0, justifySelf: "start" },
  segmented: { display: "flex", gap: 8, marginBottom: 16 },
  segment: { flex: 1, padding: 10, borderRadius: 999, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", cursor: "pointer" },
  segmentActive: { flex: 1, padding: 10, borderRadius: 999, border: "1px solid #f59e0b", background: "#f59e0b", color: "#111827", cursor: "pointer", fontWeight: 700 },
  columns: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  section: { display: "grid", gap: 12, padding: 16, borderRadius: 12, background: "#0b1220" },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  rowCard: { display: "grid", gap: 10, padding: 12, borderRadius: 12, background: "#111827", border: "1px solid #1f2937" },
  listItem: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: 12, borderRadius: 12, background: "#0b1220", cursor: "pointer" },
  grid2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  totalBox: { padding: 14, borderRadius: 12, background: "#0b1220", fontWeight: 700 },
  muted: { color: "#94a3b8", fontSize: 14 },
  error: { color: "#fecaca", background: "#7f1d1d", padding: 12, borderRadius: 10 },
  success: { color: "#dcfce7", background: "#14532d", padding: 12, borderRadius: 10, marginBottom: 16 },
  codeBox: { background: "#020617", padding: 12, borderRadius: 12, overflowX: "auto", fontSize: 12 },
};
