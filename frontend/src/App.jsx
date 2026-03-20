import { useState, useEffect } from "react";

// Rutas relativas — el frontend y el backend corren en el mismo servidor Railway
const API_URL = "";

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Error del servidor");
  }
  return res.json();
}

// ─── DIRECTORIO DE EMPLEADOS Y CÓDIGOS ────────────────────────────────────────
// Cada empleado tiene un código PIN de 4 dígitos único.
// El turno se llena automáticamente según la hora del día.
const EMPLOYEE_DIRECTORY = {
  "1001": { nombre: "Jeison",  turno_default: "1" },
  "1002": { nombre: "Eligio",  turno_default: "2" },
  "1003": { nombre: "Maikel",  turno_default: "3" },
  "1004": { nombre: "Jensy",   turno_default: "4" },
  "1005": { nombre: "Ileana",  turno_default: "5" },
  "1006": { nombre: "Steven",  turno_default: "6" },
  "1007": { nombre: "Randall", turno_default: "7" },
  "1008": { nombre: "Angel",   turno_default: "8" },
  "1009": { nombre: "Keilor",  turno_default: "9" },
  "1010": { nombre: "Tomas",   turno_default: "10" },
  "1011": { nombre: "Jensy B", turno_default: "11" },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);

function getAutoTurno() {
  const h = new Date().getHours();
  if (h >= 5 && h < 13) return "1";
  if (h >= 13 && h < 21) return "2";
  return "3";
}

const emptyForm = () => ({
  fecha: today(),
  nombre: "",
  turno: getAutoTurno(),
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
  deposito: "",
  vales: [],
  pagos: [],
  efectivo: "",
  observaciones: "",
});

// ─── COMPONENTES BASE ─────────────────────────────────────────────────────────
function SectionHeader({ icon, title, color = "#F59E0B" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", marginBottom: 2, background: `linear-gradient(90deg, ${color}22 0%, transparent 100%)`, borderLeft: `3px solid ${color}`, borderRadius: "0 8px 8px 0" }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 15, fontWeight: 600, color: "#F1F5F9", letterSpacing: 1, textTransform: "uppercase" }}>{title}</span>
    </div>
  );
}

function Subtotal({ label, value, color = "#F59E0B" }) {
  if (!value || value === 0) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: `${color}15`, borderRadius: 8, border: `1px solid ${color}33`, marginTop: 6 }}>
      <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 12, color, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 16, color, fontWeight: 700 }}>₡{value.toLocaleString("es-CR")}</span>
    </div>
  );
}

function NumInput({ label, value, onChange, prefix = "₡", style = {} }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      {label && <label style={{ fontSize: 11, color: "#94A3B8", fontFamily: "'Oswald', sans-serif", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</label>}
      <div style={{ display: "flex", alignItems: "center", background: "#0F172A", borderRadius: 8, border: "1px solid #334155", overflow: "hidden" }}>
        {prefix && <span style={{ padding: "0 10px", color: "#64748B", fontSize: 14, fontWeight: 700 }}>{prefix}</span>}
        <input type="number" inputMode="numeric" placeholder="0" value={value} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#F1F5F9", fontSize: 16, padding: "12px 10px 12px 0", fontFamily: "'Barlow', sans-serif", fontWeight: 600 }} />
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder = "", readOnly = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <label style={{ fontSize: 11, color: "#94A3B8", fontFamily: "'Oswald', sans-serif", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</label>}
      <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} readOnly={readOnly}
        style={{ background: readOnly ? "#0a1628" : "#0F172A", border: `1px solid ${readOnly ? "#1E3A5F" : "#334155"}`, borderRadius: 8, color: readOnly ? "#60A5FA" : "#F1F5F9", fontSize: 15, padding: "12px 14px", fontFamily: "'Barlow', sans-serif", outline: "none", width: "100%", boxSizing: "border-box", cursor: readOnly ? "default" : "text" }} />
    </div>
  );
}

function VoucherRow({ label, qty, amount, onQtyChange, onAmountChange, color }) {
  return (
    <div style={{ background: "#0F172A", borderRadius: 10, padding: "12px 14px", border: `1px solid ${color}33` }}>
      <div style={{ fontSize: 12, color, fontFamily: "'Oswald', sans-serif", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
        <NumInput label="Cantidad" value={qty} onChange={onQtyChange} prefix="#" />
        <NumInput label="Monto Total" value={amount} onChange={onAmountChange} />
      </div>
    </div>
  );
}

function DynamicList({ items, onChange, fields, addLabel, color, showSubtotal = false, subtotalLabel }) {
  const addRow = () => onChange([...items, Object.fromEntries(fields.map(f => [f.key, ""]))]);
  const removeRow = i => onChange(items.filter((_, idx) => idx !== i));
  const updateRow = (i, key, val) => onChange(items.map((item, idx) => idx === i ? { ...item, [key]: val } : item));
  const subtotal = items.reduce((acc, it) => acc + (Number(it["monto"]) || 0), 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{ background: "#0F172A", borderRadius: 10, padding: "12px 14px", border: `1px solid ${color}33`, position: "relative" }}>
          <button onClick={() => removeRow(i)} style={{ position: "absolute", top: 8, right: 8, background: "#EF444422", border: "none", borderRadius: 6, color: "#EF4444", fontSize: 16, cursor: "pointer", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          <div style={{ display: "grid", gridTemplateColumns: fields.map(f => f.flex || "1fr").join(" "), gap: 10, paddingRight: 32 }}>
            {fields.map(f => f.type === "number"
              ? <NumInput key={f.key} label={f.label} value={item[f.key]} onChange={v => updateRow(i, f.key, v)} />
              : <TextInput key={f.key} label={f.label} value={item[f.key]} onChange={v => updateRow(i, f.key, v)} placeholder={f.placeholder || ""} />)}
          </div>
        </div>
      ))}
      <button onClick={addRow} style={{ background: `${color}18`, border: `1px dashed ${color}66`, borderRadius: 10, color, fontSize: 13, fontFamily: "'Oswald', sans-serif", letterSpacing: 0.5, padding: "10px 16px", cursor: "pointer", textTransform: "uppercase" }}>+ {addLabel}</button>
      {showSubtotal && items.length > 0 && <Subtotal label={subtotalLabel} value={subtotal} color={color} />}
    </div>
  );
}

function CreditosList({ items, onChange }) {
  const color = "#A78BFA";
  const addRow = () => onChange([...items, { cliente: "", monto: "" }]);
  const removeRow = i => onChange(items.filter((_, idx) => idx !== i));
  const updateRow = (i, key, val) => onChange(items.map((item, idx) => idx === i ? { ...item, [key]: val } : item));
  const subtotal = items.reduce((acc, it) => acc + (Number(it.monto) || 0), 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{ background: "#0F172A", borderRadius: 10, padding: "12px 14px", border: `1px solid ${color}33`, position: "relative" }}>
          <div style={{ fontSize: 11, color, fontFamily: "'Oswald', sans-serif", marginBottom: 6, letterSpacing: 0.5 }}>CRÉDITO #{i + 1}</div>
          <button onClick={() => removeRow(i)} style={{ position: "absolute", top: 8, right: 8, background: "#EF444422", border: "none", borderRadius: 6, color: "#EF4444", fontSize: 16, cursor: "pointer", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr", gap: 10, paddingRight: 32 }}>
            <TextInput label="Cliente / Empresa" value={item.cliente} onChange={v => updateRow(i, "cliente", v)} placeholder="Nombre del cliente" />
            <NumInput label="Monto" value={item.monto} onChange={v => updateRow(i, "monto", v)} />
          </div>
        </div>
      ))}
      <button onClick={addRow} style={{ background: `${color}18`, border: `1px dashed ${color}66`, borderRadius: 10, color, fontSize: 13, fontFamily: "'Oswald', sans-serif", letterSpacing: 0.5, padding: "10px 16px", cursor: "pointer", textTransform: "uppercase" }}>+ Agregar Crédito</button>
      {items.length > 0 && <Subtotal label={`Subtotal Créditos (${items.length})`} value={subtotal} color={color} />}
    </div>
  );
}

function GrandTotal({ vouchers, creditos, sinpes, deposito, vales, pagos, efectivo }) {
  const V_KEYS = ["bcr_monto","bac_monto","bac_flotas_monto","versatec_monto","fleet_bncr_monto","fleet_dav_monto","bncr_monto"];
  const sumObj = keys => keys.reduce((a, k) => a + (Number(vouchers?.[k]) || 0), 0);
  const sumList = (arr, key) => (arr || []).reduce((a, it) => a + (Number(it[key]) || 0), 0);
  const tV = sumObj(V_KEYS), tC = sumList(creditos, "monto"), tS = sumList(sinpes, "monto");
  const tDep = Number(deposito || 0), tEf = Number(efectivo || 0);
  const tVales = sumList(vales, "monto"), tPagos = sumList(pagos, "monto");
  const grand = tV + tC + tS + tDep + tEf - tVales - tPagos;
  const rows = [
    ["💳 Tarjetas / Vouchers", tV, "#F59E0B"], ["🧾 Créditos", tC, "#A78BFA"],
    ["📱 SINPE Móvil", tS, "#34D399"], ["🏦 Depósito", tDep, "#60A5FA"],
    ["💵 Efectivo", tEf, "#10B981"], ["📄 Vales (−)", -tVales, "#EF4444"],
    ["💸 Pagos (−)", -tPagos, "#F87171"],
  ].filter(r => r[1] !== 0);
  return (
    <div style={{ background: "linear-gradient(135deg, #0F172A, #1a0a00)", borderRadius: 16, padding: "18px 16px", border: "2px solid #F59E0B55", marginBottom: 14 }}>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, color: "#F59E0B", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>📊 Resumen del Turno</div>
      {rows.map(([label, val, color]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid #1E293B" }}>
          <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: 13, color: "#94A3B8" }}>{label}</span>
          <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: 14, fontWeight: 700, color: val < 0 ? "#EF4444" : color }}>{val < 0 ? "−" : ""}₡{Math.abs(val).toLocaleString("es-CR")}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 6 }}>
        <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 15, color: "#F1F5F9", letterSpacing: 1 }}>TOTAL REPORTADO</span>
        <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, color: grand >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>₡{grand.toLocaleString("es-CR")}</span>
      </div>
    </div>
  );
}

// ─── PANTALLA DE LOGIN CON PIN ─────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const handleKey = (k) => {
    if (k === "del") { setPin(p => p.slice(0, -1)); setError(""); return; }
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) {
      const emp = EMPLOYEE_DIRECTORY[next];
      if (emp) {
        setTimeout(() => onLogin(emp.nombre, emp.turno_default), 200);
      } else {
        setShake(true);
        setError("Código incorrecto");
        setTimeout(() => { setPin(""); setShake(false); setError(""); }, 900);
      }
    }
  };

  const dots = Array.from({ length: 4 }, (_, i) => i < pin.length);

  return (
    <div style={{ minHeight: "100vh", background: "#020818", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: "#F59E0B", letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>Servicentro La Marina</div>
      <div style={{ fontSize: 36, marginBottom: 4 }}>⛽</div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, color: "#F1F5F9", marginBottom: 6 }}>Cierre de Caja</div>
      <div style={{ color: "#475569", fontSize: 13, fontFamily: "'Barlow', sans-serif", marginBottom: 32 }}>Ingresá tu código de empleado</div>

      {/* PIN dots */}
      <div style={{
        display: "flex", gap: 16, marginBottom: 12,
        animation: shake ? "shake 0.4s ease-in-out" : "none",
      }}>
        {dots.map((filled, i) => (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: "50%",
            background: filled ? "#F59E0B" : "transparent",
            border: `2px solid ${filled ? "#F59E0B" : "#334155"}`,
            transition: "all 0.15s"
          }} />
        ))}
      </div>
      {error && <div style={{ color: "#EF4444", fontSize: 13, fontFamily: "'Barlow', sans-serif", marginBottom: 12 }}>{error}</div>}

      {/* Keypad */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 72px)", gap: 12 }}>
        {["1","2","3","4","5","6","7","8","9","","0","del"].map((k, i) => (
          k === "" ? <div key={i} /> :
          <button key={i} onClick={() => handleKey(k)} style={{
            height: 72, borderRadius: 14,
            background: k === "del" ? "#1E293B" : "#0F172A",
            border: `1px solid ${k === "del" ? "#334155" : "#1E293B"}`,
            color: k === "del" ? "#64748B" : "#F1F5F9",
            fontSize: k === "del" ? 18 : 24,
            fontFamily: "'Oswald', sans-serif",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.1s",
            WebkitTapHighlightColor: "transparent",
          }}>
            {k === "del" ? "⌫" : k}
          </button>
        ))}
      </div>
      <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }`}</style>
    </div>
  );
}

// ─── PANTALLA DE ÉXITO ─────────────────────────────────────────────────────────
function SuccessScreen({ nombre, fecha, onNew }) {
  return (
    <div style={{ minHeight: "100vh", background: "#020818", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontFamily: "'Oswald', sans-serif", color: "#10B981", fontSize: 28, marginBottom: 8 }}>Cierre Enviado</h2>
        <p style={{ color: "#64748B", fontFamily: "'Barlow', sans-serif", fontSize: 15, marginBottom: 32 }}>{nombre} — {fecha}</p>
        <button onClick={onNew} style={{ background: "linear-gradient(135deg, #F59E0B, #EF4444)", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontFamily: "'Oswald', sans-serif", letterSpacing: 1, padding: "14px 32px", cursor: "pointer", textTransform: "uppercase" }}>Nuevo Cierre</button>
      </div>
    </div>
  );
}

// ─── PANEL ADMINISTRADOR ───────────────────────────────────────────────────────
function AdminView({ onBack }) {
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const keys = await window.storage.list("cierre:");
        const all = await Promise.all(keys.keys.map(async k => {
          try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; }
        }));
        setRecords(all.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp));
      } catch { setRecords([]); }
    })();
  }, []);

  const sumList = (arr, key) => (arr || []).reduce((a, it) => a + (Number(it[key]) || 0), 0);
  const V_KEYS = ["bcr_monto","bac_monto","bac_flotas_monto","versatec_monto","fleet_bncr_monto","fleet_dav_monto","bncr_monto"];

  const calcTotal = d => {
    const tV = V_KEYS.reduce((a, k) => a + (Number(d.vouchers?.[k]) || 0), 0);
    const tC = sumList(d.creditos, "monto"), tS = sumList(d.sinpes, "monto");
    const tDep = Number(d.deposito || 0), tEf = Number(d.efectivo || 0);
    return tV + tC + tS + tDep + tEf - sumList(d.vales, "monto") - sumList(d.pagos, "monto");
  };

  const exportCSV = () => {
    const header = ["fecha","empleado","turno","total_tarjetas","total_creditos","total_sinpe","deposito","efectivo","total_vales","total_pagos","total_reportado","observaciones","timestamp"];
    const rows = records.map(d => {
      const tV = V_KEYS.reduce((a, k) => a + (Number(d.vouchers?.[k]) || 0), 0);
      return [d.fecha, d.nombre, d.turno, tV, sumList(d.creditos,"monto"), sumList(d.sinpes,"monto"), d.deposito||0, d.efectivo||0, sumList(d.vales,"monto"), sumList(d.pagos,"monto"), calcTotal(d), d.observaciones||"", new Date(d.timestamp).toISOString()].map(v => `"${v}"`).join(",");
    });
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `cierres_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  const filtered = records.filter(r => !filter || r.nombre?.toLowerCase().includes(filter.toLowerCase()) || r.fecha?.includes(filter));

  if (selected) {
    const d = selected;
    const grand = calcTotal(d);
    return (
      <div style={{ minHeight: "100vh", background: "#020818", padding: "20px 16px", fontFamily: "'Barlow', sans-serif" }}>
        <button onClick={() => setSelected(null)} style={{ background: "#1E293B", border: "none", color: "#94A3B8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", marginBottom: 16, fontSize: 13 }}>← Volver</button>
        <div style={{ background: "#0F172A", borderRadius: 14, padding: 20, border: "1px solid #1E293B" }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 20, color: "#F59E0B", marginBottom: 4 }}>{d.nombre}</div>
          <div style={{ color: "#64748B", fontSize: 13, marginBottom: 16 }}>{d.fecha} — Turno {d.turno} {d.datafono ? `· ${d.datafono}` : ""}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#CBD5E1" }}><tbody>
            {[["BCR",d.vouchers?.bcr_monto],["BAC",d.vouchers?.bac_monto],["BAC Flotas",d.vouchers?.bac_flotas_monto],["Versatec",d.vouchers?.versatec_monto],["Fleet BNCR",d.vouchers?.fleet_bncr_monto],["Fleet DAV",d.vouchers?.fleet_dav_monto],["BNCR",d.vouchers?.bncr_monto]].map(([l,v]) => v > 0 ? <tr key={l}><td style={{ padding: "3px 0", color: "#64748B" }}>{l}</td><td style={{ textAlign: "right" }}>₡{Number(v).toLocaleString()}</td></tr> : null)}
            {V_KEYS.reduce((a, k) => a + (Number(d.vouchers?.[k]) || 0), 0) > 0 && <tr><td style={{ padding: "6px 0 4px", fontWeight: 700, color: "#F1F5F9" }}>Vouchers</td><td style={{ textAlign: "right", fontWeight: 700, color: "#F59E0B" }}>₡{V_KEYS.reduce((a, k) => a + (Number(d.vouchers?.[k]) || 0), 0).toLocaleString()}</td></tr>}
            {(d.creditos || []).map((c, i) => <tr key={i}><td style={{ color: "#64748B", paddingLeft: 8 }}>{c.cliente || `Crédito ${i+1}`}</td><td style={{ textAlign: "right", color: "#A78BFA" }}>₡{Number(c.monto).toLocaleString()}</td></tr>)}
            {sumList(d.creditos,"monto") > 0 && <tr><td style={{ fontWeight: 700, color: "#F1F5F9", padding: "4px 0" }}>Créditos ({(d.creditos||[]).length})</td><td style={{ textAlign: "right", fontWeight: 700, color: "#A78BFA" }}>₡{sumList(d.creditos,"monto").toLocaleString()}</td></tr>}
            {(d.sinpes || []).map((s, i) => <tr key={i}><td style={{ color: "#64748B", paddingLeft: 8 }}>{s.descripcion || `SINPE ${i+1}`}</td><td style={{ textAlign: "right", color: "#34D399" }}>₡{Number(s.monto).toLocaleString()}</td></tr>)}
            {sumList(d.sinpes,"monto") > 0 && <tr><td style={{ fontWeight: 700, color: "#F1F5F9", padding: "4px 0" }}>SINPE</td><td style={{ textAlign: "right", fontWeight: 700, color: "#34D399" }}>₡{sumList(d.sinpes,"monto").toLocaleString()}</td></tr>}
            {Number(d.deposito||0) > 0 && <tr><td style={{ color: "#64748B" }}>Depósito</td><td style={{ textAlign: "right", color: "#60A5FA" }}>₡{Number(d.deposito).toLocaleString()}</td></tr>}
            {Number(d.efectivo||0) > 0 && <tr><td style={{ color: "#64748B" }}>Efectivo</td><td style={{ textAlign: "right", color: "#10B981" }}>₡{Number(d.efectivo).toLocaleString()}</td></tr>}
            {sumList(d.vales,"monto") > 0 && <tr><td style={{ color: "#EF4444" }}>Vales (−)</td><td style={{ textAlign: "right", color: "#EF4444" }}>₡{sumList(d.vales,"monto").toLocaleString()}</td></tr>}
            {sumList(d.pagos,"monto") > 0 && <tr><td style={{ color: "#EF4444" }}>Pagos (−)</td><td style={{ textAlign: "right", color: "#EF4444" }}>₡{sumList(d.pagos,"monto").toLocaleString()}</td></tr>}
            <tr><td colSpan={2} style={{ borderTop: "1px solid #334155", padding: "8px 0" }}></td></tr>
            <tr><td style={{ fontFamily: "'Oswald', sans-serif", fontSize: 16, color: "#F1F5F9" }}>TOTAL</td><td style={{ textAlign: "right", fontFamily: "'Oswald', sans-serif", fontSize: 20, color: grand >= 0 ? "#10B981" : "#EF4444" }}>₡{grand.toLocaleString()}</td></tr>
          </tbody></table>
          {d.observaciones && <div style={{ marginTop: 14, padding: 12, background: "#1E293B", borderRadius: 8, color: "#94A3B8", fontSize: 13 }}><strong style={{ color: "#F1F5F9" }}>Obs:</strong> {d.observaciones}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#020818", padding: "20px 16px", fontFamily: "'Barlow', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "#1E293B", border: "none", color: "#94A3B8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>← Salir</button>
        <button onClick={exportCSV} style={{ background: "#10B98122", border: "1px solid #10B98144", color: "#10B981", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontFamily: "'Oswald', sans-serif" }}>⬇ CSV</button>
      </div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, color: "#F59E0B", marginBottom: 12 }}>📋 Cierres — {records.length} registros</div>
      <input placeholder="Filtrar por nombre o fecha..." value={filter} onChange={e => setFilter(e.target.value)}
        style={{ width: "100%", background: "#0F172A", border: "1px solid #334155", borderRadius: 8, color: "#F1F5F9", fontSize: 14, padding: "10px 14px", outline: "none", marginBottom: 14, boxSizing: "border-box" }} />
      {filtered.length === 0
        ? <div style={{ color: "#475569", textAlign: "center", padding: 40 }}>No hay cierres.</div>
        : filtered.map((r, i) => (
          <div key={i} onClick={() => setSelected(r)} style={{ background: "#0F172A", borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid #1E293B", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 15 }}>{r.nombre}</div>
              <div style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>{r.fecha} · Turno {r.turno}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#10B981", fontFamily: "'Oswald', sans-serif", fontSize: 14 }}>₡{calcTotal(r).toLocaleString()}</div>
              <span style={{ color: "#475569", fontSize: 18 }}>›</span>
            </div>
          </div>
        ))}
    </div>
  );
}

// ─── APP PRINCIPAL ─────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("login"); // login | form | success | admin
  const [form, setForm] = useState(emptyForm());
  const [submittedData, setSubmittedData] = useState(null);
  const [adminPass, setAdminPass] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleLogin = (nombre, turnoDefault) => {
    setForm(f => ({ ...f, nombre, turno: turnoDefault }));
    setScreen("form");
  };

  const setV = (k, v) => setForm(f => ({ ...f, vouchers: { ...f.vouchers, [k]: v } }));
  const vTot = ["bcr_monto","bac_monto","bac_flotas_monto","versatec_monto","fleet_bncr_monto","fleet_dav_monto","bncr_monto"].reduce((a, k) => a + (Number(form.vouchers[k]) || 0), 0);

  const handleSubmit = async () => {
    if (!form.nombre || !form.fecha) return alert("Falta información básica.");
    const data = { ...form, timestamp: Date.now() };
    try { await window.storage.set(`cierre:${data.timestamp}`, JSON.stringify(data)); } catch {}
    setSubmittedData(data);
    setScreen("success");
  };

  if (screen === "login") return (<><link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Barlow:wght@400;600;700&display=swap" rel="stylesheet" /><LoginScreen onLogin={handleLogin} /></>);
  if (screen === "success") return (<><link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Barlow:wght@400;600;700&display=swap" rel="stylesheet" /><SuccessScreen nombre={submittedData.nombre} fecha={submittedData.fecha} onNew={() => setScreen("login")} /></>);
  if (screen === "admin") return (<><link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Barlow:wght@400;600;700&display=swap" rel="stylesheet" /><AdminView onBack={() => setScreen("login")} /></>);

  const s = (ex = {}) => ({ background: "#0D1B2A", borderRadius: 14, padding: "16px 14px", border: "1px solid #1E293B", marginBottom: 12, ...ex });

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Barlow:wght@400;600;700&display=swap" rel="stylesheet" />
      <div style={{ minHeight: "100vh", background: "#020818", paddingBottom: 40 }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #0F172A 0%, #1a0a00 100%)", padding: "20px 20px 16px", borderBottom: "2px solid #F59E0B44", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: "#F59E0B", letterSpacing: 3, textTransform: "uppercase", marginBottom: 2 }}>Servicentro La Marina</div>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 20, color: "#F1F5F9", fontWeight: 700 }}>Cierre de Caja</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, color: "#F59E0B" }}>{form.nombre}</div>
              <button onClick={() => setScreen("login")} style={{ background: "none", border: "none", color: "#475569", fontSize: 11, cursor: "pointer", fontFamily: "'Barlow', sans-serif" }}>← cambiar</button>
            </div>
          </div>
        </div>

        <div style={{ padding: "0 14px" }}>

          {/* Fecha y Turno (solo lectura nombre, editable fecha y turno) */}
          <div style={s()}>
            <SectionHeader icon="📝" title="Información del Turno" color="#6366F1" />
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "#94A3B8", fontFamily: "'Oswald', sans-serif", letterSpacing: 0.5, textTransform: "uppercase" }}>Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                    style={{ background: "#0F172A", border: "1px solid #334155", borderRadius: 8, color: "#F1F5F9", fontSize: 15, padding: "12px 10px", fontFamily: "'Barlow', sans-serif", outline: "none" }} />
                </div>
                <TextInput label="# de Turno" value={form.turno} onChange={v => setForm(f => ({ ...f, turno: v }))} />
              </div>
              <TextInput label="ID del Datafono (opcional)" value={form.datafono} onChange={v => setForm(f => ({ ...f, datafono: v }))} placeholder="ej. TER-001" />
            </div>
          </div>

          {/* Vouchers */}
          <div style={s()}>
            <SectionHeader icon="💳" title="Vouchers / Tarjetas" color="#F59E0B" />
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <VoucherRow label="BCR" qty={form.vouchers.bcr_qty} amount={form.vouchers.bcr_monto} onQtyChange={v => setV("bcr_qty",v)} onAmountChange={v => setV("bcr_monto",v)} color="#3B82F6" />
              <VoucherRow label="BAC" qty={form.vouchers.bac_qty} amount={form.vouchers.bac_monto} onQtyChange={v => setV("bac_qty",v)} onAmountChange={v => setV("bac_monto",v)} color="#8B5CF6" />
              <VoucherRow label="BAC Flotas" qty={form.vouchers.bac_flotas_qty} amount={form.vouchers.bac_flotas_monto} onQtyChange={v => setV("bac_flotas_qty",v)} onAmountChange={v => setV("bac_flotas_monto",v)} color="#7C3AED" />
              <VoucherRow label="Versatec" qty={form.vouchers.versatec_qty} amount={form.vouchers.versatec_monto} onQtyChange={v => setV("versatec_qty",v)} onAmountChange={v => setV("versatec_monto",v)} color="#10B981" />
              <VoucherRow label="Fleetmagic BNCR" qty={form.vouchers.fleet_bncr_qty} amount={form.vouchers.fleet_bncr_monto} onQtyChange={v => setV("fleet_bncr_qty",v)} onAmountChange={v => setV("fleet_bncr_monto",v)} color="#06B6D4" />
              <VoucherRow label="Fleetmagic DAV" qty={form.vouchers.fleet_dav_qty} amount={form.vouchers.fleet_dav_monto} onQtyChange={v => setV("fleet_dav_qty",v)} onAmountChange={v => setV("fleet_dav_monto",v)} color="#0EA5E9" />
              <VoucherRow label="BNCR" qty={form.vouchers.bncr_qty} amount={form.vouchers.bncr_monto} onQtyChange={v => setV("bncr_qty",v)} onAmountChange={v => setV("bncr_monto",v)} color="#EAB308" />
              <Subtotal label="Subtotal Tarjetas" value={vTot} color="#F59E0B" />
            </div>
          </div>

          {/* Créditos */}
          <div style={s()}>
            <SectionHeader icon="🧾" title="Créditos" color="#A78BFA" />
            <div style={{ marginTop: 4, marginBottom: 10, color: "#475569", fontSize: 12, fontFamily: "'Barlow', sans-serif" }}>Agregá cada crédito por separado</div>
            <CreditosList items={form.creditos} onChange={v => setForm(f => ({ ...f, creditos: v }))} />
          </div>

          {/* SINPE */}
          <div style={s()}>
            <SectionHeader icon="📱" title="SINPE Móvil" color="#34D399" />
            <div style={{ marginTop: 12 }}>
              <DynamicList items={form.sinpes} onChange={v => setForm(f => ({ ...f, sinpes: v }))}
                fields={[{ key: "descripcion", label: "Descripción / Ref.", placeholder: "ej. SINPE cliente", flex: "2fr" }, { key: "monto", label: "Monto", type: "number", flex: "1.5fr" }]}
                addLabel="Agregar SINPE" color="#34D399" showSubtotal subtotalLabel="Subtotal SINPE" />
            </div>
          </div>

          {/* Depósito */}
          <div style={s()}>
            <SectionHeader icon="🏦" title="Depósito Bancario" color="#60A5FA" />
            <div style={{ marginTop: 12 }}>
              <NumInput label="Monto Depositado" value={form.deposito} onChange={v => setForm(f => ({ ...f, deposito: v }))} />
            </div>
          </div>

          {/* Vales */}
          <div style={s()}>
            <SectionHeader icon="📄" title="Vales" color="#FBBF24" />
            <div style={{ marginTop: 4, marginBottom: 10, color: "#475569", fontSize: 12 }}>Combustible sin cobro inmediato (dueño, finca, etc.)</div>
            <DynamicList items={form.vales} onChange={v => setForm(f => ({ ...f, vales: v }))}
              fields={[{ key: "descripcion", label: "Descripción", placeholder: "ej. Don Carlos", flex: "2fr" }, { key: "monto", label: "Monto", type: "number", flex: "1.5fr" }]}
              addLabel="Agregar Vale" color="#FBBF24" showSubtotal subtotalLabel="Subtotal Vales" />
          </div>

          {/* Pagos */}
          <div style={s()}>
            <SectionHeader icon="💸" title="Pagos Realizados" color="#F87171" />
            <div style={{ marginTop: 4, marginBottom: 10, color: "#475569", fontSize: 12 }}>Pagos a empleados u otros desde la caja</div>
            <DynamicList items={form.pagos} onChange={v => setForm(f => ({ ...f, pagos: v }))}
              fields={[{ key: "descripcion", label: "A quién / Motivo", placeholder: "ej. salario semanal", flex: "2fr" }, { key: "monto", label: "Monto", type: "number", flex: "1.5fr" }]}
              addLabel="Agregar Pago" color="#F87171" showSubtotal subtotalLabel="Subtotal Pagos" />
          </div>

          {/* Efectivo */}
          <div style={s({ border: "1px solid #10B98144" })}>
            <SectionHeader icon="💵" title="Efectivo en Caja" color="#10B981" />
            <div style={{ marginTop: 12 }}>
              <NumInput label="Total efectivo recogido en el turno" value={form.efectivo} onChange={v => setForm(f => ({ ...f, efectivo: v }))} />
            </div>
          </div>

          {/* Observaciones */}
          <div style={s()}>
            <SectionHeader icon="💬" title="Observaciones" color="#94A3B8" />
            <div style={{ marginTop: 12 }}>
              <textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                placeholder="Notas adicionales..."
                style={{ width: "100%", minHeight: 80, background: "#0F172A", border: "1px solid #334155", borderRadius: 10, color: "#F1F5F9", fontSize: 14, padding: "12px 14px", fontFamily: "'Barlow', sans-serif", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Resumen total */}
          <GrandTotal vouchers={form.vouchers} creditos={form.creditos} sinpes={form.sinpes} deposito={form.deposito} vales={form.vales} pagos={form.pagos} efectivo={form.efectivo} />

          {/* Submit */}
          <button onClick={handleSubmit} style={{ width: "100%", padding: "16px 20px", background: "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)", border: "none", borderRadius: 14, color: "#fff", fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", boxShadow: "0 8px 32px #F59E0B44", marginBottom: 12 }}>
            Enviar Cierre ›
          </button>

          {/* Acceso supervisor oculto */}
          <div style={{ textAlign: "center", paddingBottom: 20 }}>
            {!showPass
              ? <button onClick={() => setShowPass(true)} style={{ background: "none", border: "none", color: "#1E293B", fontSize: 12, cursor: "pointer" }}>···</button>
              : <div style={{ display: "flex", gap: 8 }}>
                <input type="password" placeholder="Contraseña supervisor" value={adminPass} onChange={e => setAdminPass(e.target.value)}
                  style={{ flex: 1, background: "#0F172A", border: "1px solid #334155", borderRadius: 8, color: "#F1F5F9", fontSize: 13, padding: "10px 12px", outline: "none" }} />
                <button onClick={() => { if (adminPass === "marina2024") { setScreen("admin"); setShowPass(false); setAdminPass(""); } else alert("Contraseña incorrecta"); }}
                  style={{ background: "#1E293B", border: "none", color: "#94A3B8", borderRadius: 8, padding: "0 16px", cursor: "pointer", fontSize: 13 }}>Entrar</button>
              </div>}
          </div>
        </div>
      </div>
    </>
  );
}
