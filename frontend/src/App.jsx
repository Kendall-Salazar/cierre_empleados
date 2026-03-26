import { useEffect, useMemo, useState } from "react";
import "./app.css";

const API_URL = "";
const THEME_KEY = "cierre_theme";
const CRC_SYMBOL = "\u20A1";
const EDITABLE_STATUSES = ["submitted"];

const VOUCHER_FIELDS = [
  { keyQty: "bcr_qty", keyAmount: "bcr_monto", label: "BCR", accent: "#ff9f1a" },
  { keyQty: "bac_qty", keyAmount: "bac_monto", label: "BAC", accent: "#0f766e" },
  { keyQty: "bac_flotas_qty", keyAmount: "bac_flotas_monto", label: "BAC flotas", accent: "#2f6fed" },
  { keyQty: "versatec_qty", keyAmount: "versatec_monto", label: "Versatec", accent: "#d94b4b" },
  { keyQty: "fleet_bncr_qty", keyAmount: "fleet_bncr_monto", label: "Fleet BNCR", accent: "#6c63ff" },
  { keyQty: "fleet_dav_qty", keyAmount: "fleet_dav_monto", label: "Fleet DAV", accent: "#0ea5a4" },
];

const MOVEMENT_SECTIONS = [
  {
    key: "creditos",
    index: "04",
    title: "Creditos",
    subtitle: "",
    accent: "#6c63ff",
    layout: "detailed",
    addLabel: "Agregar credito",
    fields: [
      { key: "cliente", label: "Cliente", placeholder: "Nombre del cliente" },
      { key: "referencia", label: "Referencia", placeholder: "Factura, placa o nota" },
      { key: "monto_reportado", label: "Monto", kind: "money", span: 2 },
    ],
  },
  {
    key: "mercaderia_credito",
    index: "05",
    title: "Mercaderia a credito",
    subtitle: "Se suma al total de creditos",
    accent: "#7c3aed",
    layout: "detailed",
    addLabel: "Agregar mercaderia a credito",
    fields: [
      { key: "cliente", label: "Cliente", placeholder: "Nombre del cliente" },
      { key: "referencia", label: "Referencia", placeholder: "Factura o detalle" },
      { key: "monto_reportado", label: "Monto", kind: "money", span: 2 },
    ],
  },
  {
    key: "sinpes",
    index: "06",
    title: "SINPE movil",
    subtitle: "",
    accent: "#0f9d76",
    layout: "compact",
    addLabel: "Agregar SINPE",
    entryLabel: "Comprobante",
    entryPlaceholder: "Numero o referencia bancaria",
  },
  {
    key: "vales",
    index: "07",
    title: "Vales",
    subtitle: "",
    accent: "#d97706",
    layout: "compact",
    addLabel: "Agregar vale",
    entryLabel: "Comprobante o detalle",
    entryPlaceholder: "Numero de vale o referencia",
  },
  {
    key: "pagos",
    index: "08",
    title: "Pagos realizados",
    subtitle: "",
    accent: "#d94b4b",
    layout: "compact",
    addLabel: "Agregar pago",
    entryLabel: "Comprobante o motivo",
    entryPlaceholder: "Numero, motivo o referencia del pago",
  },
];

const STAFF_ROLE_OPTIONS = [
  { value: "supervisor", label: "Supervisor" },
  { value: "admin", label: "Administrador" },
  { value: "tienda", label: "Tienda" },
];

const ROLE_LABELS = {
  employee: "Pistero",
  supervisor: "Supervisor",
  admin: "Administrador",
  tienda: "Tienda",
};

const ITEM_NOTE_SECTION_KEYS = new Set(["depositos", "creditos", "mercaderia_credito", "sinpes", "vales", "pagos"]);
const SECTION_LABELS = {
  depositos: "Depositos",
  creditos: "Creditos",
  mercaderia_credito: "Mercaderia a credito",
  sinpes: "SINPE movil",
  vales: "Vales",
  pagos: "Pagos",
  vouchers: "Vouchers",
  mercaderia_contado: "Mercaderia de contado",
  observaciones: "Observaciones",
  resumen_ingresos: "Resumen de ingresos",
  detalle: "Detalle",
};

const STATUS_META = {
  submitted: { label: "Enviado", tone: "amber" },
  reviewed: { label: "Revisado", tone: "navy" },
  approved: { label: "Aprobado", tone: "emerald" },
  reconciled: { label: "Conciliado", tone: "indigo", strong: true },
  deleted: { label: "En papelera", tone: "rose" },
};

function normalizeStatusValue(status) {
  if (status === "observed") return "submitted";
  if (status === "document_reviewed") return "reviewed";
  if (status === "validated") return "approved";
  return status || "submitted";
}

function detailMessage(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const location = Array.isArray(item.loc)
          ? item.loc.filter((part) => part !== "body").join(" / ")
          : "";
        return [location, item.msg].filter(Boolean).join(": ");
      })
      .filter(Boolean)
      .join(". ");
  }
  if (typeof detail === "object") {
    return detail.message || detail.error || "";
  }
  return "";
}

async function api(path, options = {}, token = null) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    let message = "";

    if (contentType.includes("application/json")) {
      const errorPayload = await response.json().catch(() => null);
      message = detailMessage(errorPayload?.detail) || detailMessage(errorPayload);
    } else {
      message = (await response.text().catch(() => "")).trim();
    }

    throw new Error(message || `Error ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return response;
}

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function sanitizeAmountInput(value) {
  if (value === null || value === undefined) return "";
  const cleaned = String(value).replace(/[^\d.,]/g, "").replace(/,/g, "");
  if (!cleaned) return "";
  const [whole = "", ...decimals] = cleaned.split(".");
  if (!decimals.length) return whole;
  return `${whole}.${decimals.join("").slice(0, 2)}`;
}

function parseAmount(value) {
  const normalized = sanitizeAmountInput(value);
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

function money(value) {
  return new Intl.NumberFormat("es-CR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseAmount(value));
}

function formatCurrencyInput(value) {
  const normalized = sanitizeAmountInput(value);
  if (!normalized) return "";
  const [wholeRaw = "0", decimals = ""] = normalized.split(".");
  const whole = Number(wholeRaw || "0");
  const grouped = new Intl.NumberFormat("es-CR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(whole);

  if (normalized.endsWith(".") && !decimals) return `${CRC_SYMBOL} ${grouped}.`;
  if (decimals) return `${CRC_SYMBOL} ${grouped}.${decimals}`;
  return `${CRC_SYMBOL} ${grouped}`;
}

function movementAmountValue(item) {
  return item?.monto ?? item?.monto_reportado ?? "";
}

function movementComprobanteValue(item) {
  return [item?.comprobante, item?.referencia, item?.descripcion, item?.cliente].find(
    (value) => String(value || "").trim(),
  ) || "";
}

function movementDisplayLabel(item, fallbackLabel, index) {
  return item?.descripcion || item?.cliente || movementComprobanteValue(item) || `${fallbackLabel} ${index + 1}`;
}

function movementMetaLabel(item) {
  const parts = [item?.cliente, item?.referencia].filter((value) => String(value || "").trim());
  if (parts.length) return parts.join(" / ");
  return movementComprobanteValue(item) ? "Comprobante registrado" : "Sin detalle adicional";
}

function formatDateLabel(value) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTimeLabel(value) {
  if (!value) return "Sin registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function sectionLabel(sectionKey) {
  return SECTION_LABELS[sectionKey] || sectionKey || "Seccion";
}

function filterReviewNotes(reviewNotes = [], sectionKey, movementId = null) {
  return (reviewNotes || []).filter((note) => {
    if (note.section_key !== sectionKey) return false;
    if (movementId) return note.target_scope === "item" && note.movement_id === movementId;
    return note.target_scope === "section";
  });
}

function sumMovementItems(items = []) {
  return (items || []).reduce((acc, item) => acc + parseAmount(movementAmountValue(item)), 0);
}

function normalizeTiendaSummary(summary = {}) {
  return {
    totalResumen: parseAmount(summary.totalResumen ?? summary.total_resumen),
    totalDetalle: parseAmount(summary.totalDetalle ?? summary.total_detalle),
    diferencia: parseAmount(summary.diferencia),
  };
}

function isValidDateValue(value) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function canEditCierre(cierre) {
  if (!EDITABLE_STATUSES.includes(normalizeStatusValue(cierre?.status))) return false;
  if (cierre?.reviewed_at || cierre?.approved_at || cierre?.reconciled_at || cierre?.deleted_at) return false;
  if (!cierre?.editable_until) return false;

  const editableUntil = new Date(cierre.editable_until);
  if (Number.isNaN(editableUntil.getTime())) return false;
  return editableUntil.getTime() > Date.now();
}

function validateCierrePayload(payload, { requireEmployee = false } = {}) {
  if (!isValidDateValue(payload?.fecha)) return "Selecciona una fecha valida.";
  if (!String(payload?.turno || "").trim()) return "Indica el turno.";
  if (requireEmployee && !payload?.employee_id) return "Selecciona el empleado.";
  return "";
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

function emptyCompactMovement() {
  return {
    id: crypto.randomUUID(),
    comprobante: "",
    monto: "",
  };
}

function emptyForm(defaultTurno = "1") {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    turno: defaultTurno || "1",
    datafono: "",
    mercaderia_contado: "",
    vouchers: {
      bcr_qty: "",
      bcr_monto: "",
      bac_qty: "",
      bac_monto: "",
      bac_flotas_qty: "",
      bac_flotas_monto: "",
      versatec_qty: "",
      versatec_monto: "",
      fleet_bncr_qty: "",
      fleet_bncr_monto: "",
      fleet_dav_qty: "",
      fleet_dav_monto: "",
    },
    creditos: [],
    mercaderia_credito: [],
    sinpes: [],
    depositos: [],
    vales: [],
    pagos: [],
    observaciones: "",
    employee_id: null,
  };
}

function emptyUserDraft(role = "employee") {
  return {
    full_name: "",
    username: "",
    role,
    pin: "",
    password: "",
  };
}

function summarizePayload(payload) {
  const vouchers = VOUCHER_FIELDS.reduce(
    (total, voucher) => total + parseAmount(payload?.vouchers?.[voucher.keyAmount]),
    0,
  );
  const sumItems = (items) => (items || []).reduce((acc, item) => acc + parseAmount(movementAmountValue(item)), 0);

  const totalMercaderiaContado = parseAmount(payload?.mercaderia_contado);
  const totalCreditosDirectos = sumItems(payload?.creditos);
  const totalMercaderiaCredito = sumItems(payload?.mercaderia_credito);
  const totalCreditos = totalCreditosDirectos + totalMercaderiaCredito;
  const totalSinpes = sumItems(payload?.sinpes);
  const totalDepositos = sumItems(payload?.depositos);
  const totalVales = sumItems(payload?.vales);
  const totalPagos = sumItems(payload?.pagos);

  return {
    totalVouchers: vouchers,
    totalMercaderiaContado,
    totalCreditos,
    totalCreditosDirectos,
    totalMercaderiaCredito,
    totalSinpes,
    totalDepositos,
    totalVales,
    totalPagos,
    totalReportado:
      vouchers +
      totalMercaderiaContado +
      totalCreditos +
      totalSinpes +
      totalDepositos +
      totalVales +
      totalPagos,
  };
}

function normalizeSummary(summary) {
  if (!summary) return null;
  return {
    totalVouchers: parseAmount(summary.totalVouchers ?? summary.total_vouchers),
    totalMercaderiaContado: parseAmount(summary.totalMercaderiaContado ?? summary.total_mercaderia_contado),
    totalCreditos: parseAmount(summary.totalCreditos ?? summary.total_creditos),
    totalCreditosDirectos: parseAmount(summary.totalCreditosDirectos ?? summary.total_creditos_directos),
    totalMercaderiaCredito: parseAmount(summary.totalMercaderiaCredito ?? summary.total_mercaderia_credito),
    totalSinpes: parseAmount(summary.totalSinpes ?? summary.total_sinpes),
    totalDepositos: parseAmount(summary.totalDepositos ?? summary.total_depositos),
    totalVales: parseAmount(summary.totalVales ?? summary.total_vales),
    totalPagos: parseAmount(summary.totalPagos ?? summary.total_pagos),
    totalReportado: parseAmount(summary.totalReportado ?? summary.total_reportado),
  };
}

function voucherSnapshot(vouchers = {}) {
  return VOUCHER_FIELDS.map((field) => ({
    label: field.label,
    qty: parseAmount(vouchers[field.keyQty]),
    amount: parseAmount(vouchers[field.keyAmount]),
  })).filter((item) => item.qty > 0 || item.amount > 0);
}

function detectTheme() {
  if (typeof window === "undefined") return "light";

  const savedTheme = window.localStorage.getItem(THEME_KEY);
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function useTheme() {
  const [theme, setTheme] = useState(detectTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return {
    theme,
    isDark: theme === "dark",
    toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
  };
}

function useSession() {
  const [token, setToken] = useState(() => sessionStorage.getItem("cierre_token") || "");
  const [user, setUser] = useState(() => {
    try {
      const raw = sessionStorage.getItem("cierre_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const save = (nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
    if (nextToken) sessionStorage.setItem("cierre_token", nextToken);
    else sessionStorage.removeItem("cierre_token");
    if (nextUser) sessionStorage.setItem("cierre_user", JSON.stringify(nextUser));
    else sessionStorage.removeItem("cierre_user");
  };

  return { token, user, save, clear: () => save("", null) };
}

function Banner({ tone = "success", children }) {
  return <div className={cx("banner", `banner-${tone}`)}>{children}</div>;
}

function StatusPill({ status }) {
  const normalizedStatus = normalizeStatusValue(status);
  const meta = STATUS_META[normalizedStatus] || { label: normalizedStatus || "Sin estado", tone: "slate" };
  return <span className={cx("status-pill", `tone-${meta.tone}`, meta.strong && "status-pill-strong")}>{meta.label}</span>;
}

function ThemeToggle({ isDark, onToggle, floating = false }) {
  return (
    <button className={cx("theme-toggle", floating && "theme-toggle-floating")} type="button" onClick={onToggle}>
      <span className="theme-toggle-track">
        <span className={cx("theme-toggle-thumb", isDark && "is-dark")} />
      </span>
      <span>{isDark ? "Modo claro" : "Modo nocturno"}</span>
    </button>
  );
}

function Panel({ eyebrow, title, subtitle, accent = "#ff9f1a", action, className, children }) {
  return (
    <section className={cx("surface-panel", className)} style={{ "--panel-accent": accent }}>
      {(eyebrow || title || subtitle || action) && (
        <div className="panel-head">
          <div>
            {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
            {title ? <h2 className="panel-title">{title}</h2> : null}
            {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
          </div>
          {action ? <div className="panel-action">{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

function FormSection({ index, title, subtitle, accent = "#ff9f1a", extra, children }) {
  return (
    <section className="form-section" style={{ "--section-accent": accent }}>
      <div className="form-section-head">
        <div className="section-index">{index}</div>
        <div className="form-section-copy">
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {extra ? <div className="form-section-extra">{extra}</div> : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value, caption, accent = "#ff9f1a" }) {
  return (
    <div className="metric-card" style={{ "--metric-accent": accent }}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {caption ? <span className="metric-caption">{caption}</span> : null}
    </div>
  );
}

function FieldShell({ label, hint, children }) {
  return (
    <label className="field-shell">
      <span className="field-label">{label}</span>
      {hint ? <span className="field-hint">{hint}</span> : null}
      {children}
    </label>
  );
}

function TextField({ label, hint, value, onChange, placeholder = "", type = "text" }) {
  return (
    <FieldShell label={label} hint={hint}>
      <input
        className="field-input"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </FieldShell>
  );
}

function MoneyField({ label, hint, value, onChange, placeholder = "0.00" }) {
  return (
    <FieldShell label={label} hint={hint}>
      <div className="money-input">
        <span className="money-prefix">{CRC_SYMBOL}</span>
        <input
          className="field-input field-input-plain"
          type="text"
          inputMode="decimal"
          value={formatCurrencyInput(value)}
          onChange={(event) => onChange(sanitizeAmountInput(event.target.value))}
          placeholder={`${CRC_SYMBOL} ${placeholder}`}
        />
      </div>
    </FieldShell>
  );
}

function DepositListEditor({ deposits, setDeposits }) {
  const subtotal = useMemo(
    () => (deposits || []).reduce((acc, d) => acc + parseAmount(d.monto_reportado), 0),
    [deposits],
  );
  const addDeposit = () => setDeposits([...(deposits || []), { id: crypto.randomUUID(), referencia: "", monto_reportado: "" }]);
  const updateDeposit = (index, key, value) => setDeposits(deposits.map((d, i) => (i === index ? { ...d, [key]: value } : d)));
  const removeDeposit = (index) => setDeposits(deposits.filter((_, i) => i !== index));

  return (
    <div className="deposit-editor">
      {deposits.map((dep, index) => (
        <div key={dep.id || index} className="deposit-item">
          <TextField
            label={`Deposito #${index + 1}`}
            value={dep.referencia || ""}
            onChange={(v) => updateDeposit(index, "referencia", v)}
            placeholder="ID del comprobante"
          />
          <MoneyField
            label="Monto"
            value={dep.monto_reportado || ""}
            onChange={(v) => updateDeposit(index, "monto_reportado", v)}
          />
          <button className="btn btn-ghost-danger" type="button" onClick={() => removeDeposit(index)}>
            Quitar
          </button>
        </div>
      ))}
      <button className="btn-add-movement" type="button" onClick={addDeposit}>
        + Agregar deposito
      </button>
      {deposits.length > 0 && (
        <div className="inline-total inline-total-muted">
          <span>Subtotal depositos</span>
          <strong>CRC {money(subtotal)}</strong>
        </div>
      )}
    </div>
  );
}

function remainingEditTime(cierre) {
  if (!cierre?.editable_until) return null;
  const until = new Date(cierre.editable_until);
  if (Number.isNaN(until.getTime())) return null;
  const remaining = until.getTime() - Date.now();
  if (remaining <= 0) return null;
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m restantes`;
  return `${minutes}m restantes`;
}

function SelectField({ label, hint, value, onChange, children }) {
  return (
    <FieldShell label={label} hint={hint}>
      <select className="field-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </FieldShell>
  );
}

function TextAreaField({ label, hint, value, onChange, placeholder = "", disabled = false, readOnly = false }) {
  return (
    <FieldShell label={label} hint={hint}>
      <textarea
        className="field-input field-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
      />
    </FieldShell>
  );
}

function EmptyState({ title, body }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="history-list">
      {[1, 2, 3].map((i) => (
        <div key={i} className="history-card history-card-skeleton">
          <div className="skeleton-block" style={{ width: "60%", height: "14px" }} />
          <div className="skeleton-block" style={{ width: "40%", height: "12px", marginTop: "8px" }} />
        </div>
      ))}
    </div>
  );
}

function SummaryBoard({ payload, summary, compact = false }) {
  const totals = normalizeSummary(summary) || summarizePayload(payload || emptyForm());
  const rows = [
    { label: "Vouchers", value: totals.totalVouchers, tone: "amber" },
    { label: "Mercaderia contado", value: totals.totalMercaderiaContado, tone: "teal" },
    { label: "Creditos", value: totals.totalCreditosDirectos || 0, tone: "indigo", indent: false },
    { label: "Mercaderia a credito", value: totals.totalMercaderiaCredito || 0, tone: "violet", indent: false },
    { label: "Total creditos", value: totals.totalCreditos, tone: "indigo", isSub: true },
    { label: "SINPE movil", value: totals.totalSinpes, tone: "emerald" },
    { label: "Depositos", value: totals.totalDepositos, tone: "navy" },
    { label: "Vales", value: totals.totalVales, tone: "rust" },
    { label: "Pagos", value: totals.totalPagos, tone: "rose" },
  ];

  return (
    <div className={cx("summary-board", compact && "summary-board-compact")}>
      <div className="summary-list">
        {rows.map((row) => (
          <div key={row.label} className={cx("summary-row", row.isSub && "summary-row-sub")}>
            <div className="summary-row-copy">
              <span className={cx("summary-dot", `summary-${row.tone}`)} />
              <span>{row.label}</span>
            </div>
            <strong className="summary-row-value">
              CRC {money(row.value)}
            </strong>
          </div>
        ))}
      </div>
      <div className="summary-total">
        <span>Total reportado</span>
        <strong>CRC {money(totals.totalReportado)}</strong>
      </div>
    </div>
  );
}

function VoucherGrid({ vouchers, setVoucher }) {
  const totalVouchers = VOUCHER_FIELDS.reduce(
    (total, voucher) => total + parseAmount(vouchers[voucher.keyAmount]),
    0,
  );

  return (
    <>
      <div className="voucher-table-wrap">
        <table className="voucher-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Monto (CRC)</th>
            </tr>
          </thead>
          <tbody>
            {VOUCHER_FIELDS.map((voucher) => (
              <tr key={voucher.keyAmount}>
                <td>
                  <div className="voucher-name-cell">
                    <span className="voucher-type-dot" style={{ background: voucher.accent }} />
                    {voucher.label}
                  </div>
                </td>
                <td>
                  <input
                    className="field-input voucher-cell-input"
                    type="text"
                    inputMode="numeric"
                    value={vouchers[voucher.keyQty] || ""}
                    onChange={(e) => setVoucher(voucher.keyQty, e.target.value.replace(/\D/g, ""))}
                    placeholder="0"
                  />
                </td>
                <td>
                  <input
                    className="field-input voucher-cell-input"
                    type="text"
                    inputMode="decimal"
                    value={formatCurrencyInput(vouchers[voucher.keyAmount] || "")}
                    onChange={(e) => setVoucher(voucher.keyAmount, sanitizeAmountInput(e.target.value))}
                    placeholder={`${CRC_SYMBOL} 0.00`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="inline-total">
        <span>Subtotal vouchers</span>
        <strong>CRC {money(totalVouchers)}</strong>
      </div>
    </>
  );
}

function MovementListEditor({ config, items, setItems }) {
  const subtotal = useMemo(
    () => (items || []).reduce((acc, item) => acc + parseAmount(movementAmountValue(item)), 0),
    [items],
  );

  const updateItem = (index, key, value) => {
    setItems(items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
  };

  const removeItem = (index) => {
    setItems(items.filter((_, itemIndex) => itemIndex !== index));
  };

  const addItem = () => {
    setItems([...(items || []), emptyMovement()]);
  };

  return (
    <FormSection
      index={config.index}
      title={config.title}
      subtitle={config.subtitle}
      accent={config.accent}
      extra={items.length > 0 ? <span className="section-chip">{items.length} registros</span> : null}
    >
      {items.length === 0 ? (
        <div className="empty-state-action">
          <p>No hay {config.title.toLowerCase()} en este turno.</p>
          <button className="btn-add-movement" type="button" onClick={addItem}>
            + {config.addLabel}
          </button>
        </div>
      ) : (
        <>
          <div className="movement-stack">
            {items.map((item, index) => (
              <div className="movement-card" key={item.id || index} style={{ "--section-accent": config.accent }}>
                <div className="movement-card-head">
                  <div>
                    <strong>{config.title} #{index + 1}</strong>
                    <span>Completa el detalle y el monto reportado.</span>
                  </div>
                  <button className="btn btn-ghost-danger" type="button" onClick={() => removeItem(index)}>
                    Quitar
                  </button>
                </div>
                <div className="movement-grid">
                  {config.fields.map((field) => (
                    <div className={cx("movement-field", field.span === 2 && "movement-field-span-2")} key={field.key}>
                      {field.kind === "money" ? (
                        <MoneyField
                          label={field.label}
                          value={item[field.key] || ""}
                          onChange={(value) => updateItem(index, field.key, value)}
                        />
                      ) : (
                        <TextField
                          label={field.label}
                          value={item[field.key] || ""}
                          onChange={(value) => updateItem(index, field.key, value)}
                          placeholder={field.placeholder}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="section-actions">
            <button className="btn-add-movement" type="button" onClick={addItem}>
              + {config.addLabel}
            </button>
            <div className="inline-total inline-total-muted">
              <span>Subtotal</span>
              <strong>CRC {money(subtotal)}</strong>
            </div>
          </div>
        </>
      )}
    </FormSection>
  );
}

function CompactMovementListEditor({ config, items, setItems }) {
  const subtotal = useMemo(
    () => (items || []).reduce((acc, item) => acc + parseAmount(movementAmountValue(item)), 0),
    [items],
  );

  const addItem = () => {
    setItems([...(items || []), emptyCompactMovement()]);
  };

  const updateItem = (index, key, value) => {
    setItems(
      items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (key === "comprobante") {
          return { ...item, comprobante: value, referencia: value };
        }
        if (key === "monto") {
          return { ...item, monto: value, monto_reportado: value };
        }
        return { ...item, [key]: value };
      }),
    );
  };

  const removeItem = (index) => {
    setItems(items.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <FormSection
      index={config.index}
      title={config.title}
      subtitle={config.subtitle}
      accent={config.accent}
      extra={items.length > 0 ? <span className="section-chip">{items.length} registros</span> : null}
    >
      {items.length === 0 ? (
        <div className="empty-state-action">
          <p>No hay {config.title.toLowerCase()} registrados en este turno.</p>
          <button className="btn-add-movement" type="button" onClick={addItem}>
            + {config.addLabel}
          </button>
        </div>
      ) : (
        <>
          <div className="movement-stack">
            {items.map((item, index) => (
              <div className="movement-card movement-card-compact" key={item.id || index} style={{ "--section-accent": config.accent }}>
                <div className="movement-card-head">
                  <div>
                    <strong>{config.title} #{index + 1}</strong>
                    <span>Se guarda como comprobante y monto para exportacion.</span>
                  </div>
                  <button className="btn btn-ghost-danger" type="button" onClick={() => removeItem(index)}>
                    Quitar
                  </button>
                </div>

                <div className="movement-grid movement-grid-compact">
                  <div className="movement-field movement-field-span-2">
                    <TextField
                      label={config.entryLabel}
                      value={movementComprobanteValue(item)}
                      onChange={(value) => updateItem(index, "comprobante", value)}
                      placeholder={config.entryPlaceholder}
                    />
                  </div>
                  <div className="movement-field movement-field-span-2">
                    <MoneyField
                      label="Monto"
                      value={movementAmountValue(item)}
                      onChange={(value) => updateItem(index, "monto", value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="section-actions">
            <button className="btn-add-movement" type="button" onClick={addItem}>
              + {config.addLabel}
            </button>
            <div className="inline-total inline-total-muted">
              <span>Subtotal</span>
              <strong>CRC {money(subtotal)}</strong>
            </div>
          </div>
        </>
      )}
    </FormSection>
  );
}

function DetailList({ title, accent = "#ff9f1a", items }) {
  if (!items.length) return null;

  return (
    <div className="detail-card" style={{ "--detail-accent": accent }}>
      <div className="detail-card-head">
        <strong>{title}</strong>
        <span>{items.length} registros</span>
      </div>
      <div className="detail-list">
        {items.map((item, index) => (
          <div className="detail-row" key={item.id || `${title}-${index}`}>
            <div>
              <strong>{item.title}</strong>
              {item.meta ? <span>{item.meta}</span> : null}
            </div>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function CierreSnapshot({ payload, reportadoSummary, validadoSummary, auditNotes }) {
  if (!payload) {
    return <EmptyState title="Sin detalle disponible" body="Selecciona un cierre para ver su resumen." />;
  }

  const vouchers = voucherSnapshot(payload.vouchers).map((item) => ({
    title: item.label,
    meta: item.qty > 0 ? `${item.qty} movimientos` : "Sin cantidad reportada",
    value: `CRC ${money(item.amount)}`,
  }));

  const depositos = (payload.depositos || []).map((item, index) => ({
    id: item.id || `dep-${index}`,
    title: item.referencia || `Deposito ${index + 1}`,
    meta: item.referencia ? `ID: ${item.referencia}` : "Sin ID",
    value: `CRC ${money(item.monto_reportado)}`,
  }));

  const movementGroups = [
    { title: "Creditos", accent: "#6c63ff", items: payload.creditos || [] },
    { title: "Mercaderia a credito", accent: "#7c3aed", items: payload.mercaderia_credito || [] },
    { title: "SINPE movil", accent: "#0f9d76", items: payload.sinpes || [] },
    { title: "Vales", accent: "#d97706", items: payload.vales || [] },
    { title: "Pagos", accent: "#d94b4b", items: payload.pagos || [] },
  ]
    .map((group) => ({
      ...group,
      items: group.items.map((item, index) => ({
        id: item.id || `${group.title}-${index}`,
        title: movementDisplayLabel(item, group.title, index),
        meta: movementMetaLabel(item),
        value: `CRC ${money(movementAmountValue(item))}`,
      })),
    }))
    .filter((group) => group.items.length > 0);

  const reportado = normalizeSummary(reportadoSummary) || summarizePayload(payload);
  const validado = normalizeSummary(validadoSummary) || reportado;
  const delta = validado.totalReportado - reportado.totalReportado;

  return (
    <div className="snapshot-stack">
      <div className="metric-grid metric-grid-tight">
        <MetricCard
          label="Reportado"
          value={`CRC ${money(reportado.totalReportado)}`}
          caption={`Fecha ${formatDateLabel(payload.fecha)}`}
          accent="#ff9f1a"
        />
        <MetricCard
          label="Validado"
          value={`CRC ${money(validado.totalReportado)}`}
          caption={`Turno ${payload.turno || "Sin turno"}`}
          accent="#0f9d76"
        />
        <MetricCard
          label="Diferencia"
          value={`CRC ${money(delta)}`}
          caption={payload.datafono ? `Datafono ${payload.datafono}` : "Sin datafono"}
          accent={delta === 0 ? "#13315c" : "#d94b4b"}
        />
      </div>

      <SummaryBoard payload={payload} summary={reportadoSummary} compact />

      <div className="detail-grid">
        {parseAmount(payload.mercaderia_contado) > 0 && (
          <DetailList title="Mercaderia de contado" accent="#0f766e" items={[{
            id: "merc-contado",
            title: "Mercaderia de contado",
            meta: "Venta directa",
            value: `CRC ${money(payload.mercaderia_contado)}`,
          }]} />
        )}
        <DetailList title="Vouchers" accent="#ff9f1a" items={vouchers} />
        {depositos.length > 0 && <DetailList title="Depositos" accent="#13315c" items={depositos} />}
        {movementGroups.map((group) => (
          <DetailList key={group.title} title={group.title} accent={group.accent} items={group.items} />
        ))}
      </div>

      {payload.observaciones ? (
        <div className="note-card">
          <strong>Observaciones del empleado</strong>
          <p>{payload.observaciones}</p>
        </div>
      ) : null}

      {auditNotes ? (
        <div className="note-card note-card-alt">
          <strong>Notas de revision</strong>
          <p>{auditNotes}</p>
        </div>
      ) : null}
    </div>
  );
}

function ReviewNotesThread({ label, notes = [], onCreate, onToggleResolved }) {
  const [open, setOpen] = useState(() => notes.some((note) => !note.resolved));
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    if (notes.some((note) => !note.resolved)) {
      setOpen(true);
    }
  }, [notes]);

  const unresolved = notes.filter((note) => !note.resolved);
  const resolved = notes.filter((note) => note.resolved);

  const submit = async () => {
    const body = draft.trim();
    if (!body || !onCreate) return;
    setSubmitting(true);
    try {
      await onCreate(body);
      setDraft("");
      setOpen(true);
    } catch {
      // The parent already surfaces the error banner.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="qa-thread">
      <button className="qa-thread-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <span>{label}</span>
        <strong>{notes.length}</strong>
      </button>

      {open ? (
        <div className="qa-thread-body">
          {onCreate ? (
            <div className="qa-note-composer">
              <textarea
                className="field-input field-textarea qa-note-textarea"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Escribe una nota breve, clara y accionable."
              />
              <div className="qa-note-actions">
                <button className="btn btn-secondary btn-sm" type="button" onClick={submit} disabled={submitting || !draft.trim()}>
                  {submitting ? "Guardando..." : "Agregar nota"}
                </button>
              </div>
            </div>
          ) : null}

          {unresolved.length > 0 ? (
            <div className="qa-note-list">
              {unresolved.map((note) => (
                <div className="qa-note-card" key={note.id}>
                  <div className="qa-note-head">
                    <div>
                      <strong>{note.author_name}</strong>
                      <span>{ROLE_LABELS[note.author_role] || note.author_role} / {formatDateTimeLabel(note.created_at)}</span>
                    </div>
                    <div className="qa-note-head-actions">
                      <span className="qa-note-status">Pendiente</span>
                      {onToggleResolved ? (
                        <button className="qa-note-toggle" type="button" onClick={() => onToggleResolved(note, true)}>
                          <span className="qa-check-icon" />
                          Resolver
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p>{note.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="qa-note-empty">Sin notas pendientes.</div>
          )}

          {resolved.length > 0 ? (
            <div className="qa-note-resolved">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowResolved((value) => !value)}>
                {showResolved ? "Ocultar resueltas" : `Ver resueltas (${resolved.length})`}
              </button>
              {showResolved ? (
                <div className="qa-note-list qa-note-list-resolved">
                  {resolved.map((note) => (
                    <div className="qa-note-card qa-note-card-resolved" key={note.id}>
                      <div className="qa-note-head">
                        <div>
                          <strong>{note.author_name}</strong>
                          <span>{ROLE_LABELS[note.author_role] || note.author_role} / {formatDateTimeLabel(note.created_at)}</span>
                        </div>
                        <div className="qa-note-head-actions">
                          <span className="qa-note-status qa-note-status-resolved">Resuelta</span>
                          {onToggleResolved ? (
                            <button className="qa-note-toggle qa-note-toggle-resolved" type="button" onClick={() => onToggleResolved(note, false)}>
                              <span className="qa-check-icon qa-check-icon-resolved" />
                              Reabrir
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <p>{note.body}</p>
                      {note.resolved_at ? (
                        <small>
                          Resuelta por {note.resolved_by_name || "equipo"} el {formatDateTimeLabel(note.resolved_at)}.
                        </small>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function QaSectionCard({ title, accent, count, total, children, sectionNotes, onCreateNote, onToggleNote }) {
  return (
    <div className="qa-section-card" style={{ "--qa-accent": accent }}>
      <div className="qa-section-head">
        <div>
          <strong>{title}</strong>
          <span>{count} registro{count !== 1 ? "s" : ""}</span>
        </div>
        <div className="qa-section-total">CRC {money(total)}</div>
      </div>
      <div className="qa-section-body">{children}</div>
      <ReviewNotesThread
        label={`Notas de ${title.toLowerCase()}`}
        notes={sectionNotes}
        onCreate={onCreateNote}
        onToggleResolved={onToggleNote}
      />
    </div>
  );
}

function QaItemRow({ title, meta, value, itemNotes, onCreateNote, onToggleNote }) {
  return (
    <div className="qa-item-card">
      <div className="qa-item-row">
        <div className="qa-item-copy">
          <strong>{title}</strong>
          {meta ? <span>{meta}</span> : null}
        </div>
        <strong className="qa-item-value">CRC {money(value)}</strong>
      </div>
      <ReviewNotesThread
        label="Notas de este movimiento"
        notes={itemNotes}
        onCreate={onCreateNote}
        onToggleResolved={onToggleNote}
      />
    </div>
  );
}

function QaReviewDetail({ cierre, onCreateNote, onToggleNote }) {
  if (!cierre) return null;

  const reviewNotes = cierre.review_notes || [];
  const payload = cierre.reportado_json || {};
  const sectionNoteCreator = onCreateNote
    ? (sectionKey) => (body) => onCreateNote(sectionKey, body)
    : null;
  const itemNoteCreator = onCreateNote
    ? (sectionKey, movementId) => (body) => onCreateNote(sectionKey, body, movementId)
    : null;

  if (cierre.tipo === "tienda") {
    const summary = normalizeTiendaSummary(cierre.resumen_reportado || {});
    return (
      <div className="qa-review-stack">
        <div className="qa-review-header">
          <div>
            <div className="eyebrow">Revision QA</div>
            <h3 className="qa-review-title">Detalle resumido de tienda</h3>
            <p className="qa-review-copy">Resumen corto para revisar importes, diferencias y observaciones sin perder contexto.</p>
          </div>
        </div>

        <div className="qa-review-grid">
          <QaSectionCard
            title="Resumen de ingresos"
            accent="#0f766e"
            count={TIENDA_RESUMEN_FIELDS.length}
            total={summary.totalResumen}
            sectionNotes={filterReviewNotes(reviewNotes, "resumen_ingresos")}
            onCreateNote={sectionNoteCreator ? sectionNoteCreator("resumen_ingresos") : null}
            onToggleNote={onToggleNote}
          >
            <div className="qa-flat-list">
              {TIENDA_RESUMEN_FIELDS.map((field) => (
                <div className="qa-flat-row" key={field.key}>
                  <span>{field.label}</span>
                  <strong>CRC {money(payload[field.key])}</strong>
                </div>
              ))}
            </div>
          </QaSectionCard>

          <QaSectionCard
            title="Detalle"
            accent="#ff9f1a"
            count={TIENDA_DETALLE_FIELDS.length}
            total={summary.totalDetalle}
            sectionNotes={filterReviewNotes(reviewNotes, "detalle")}
            onCreateNote={sectionNoteCreator ? sectionNoteCreator("detalle") : null}
            onToggleNote={onToggleNote}
          >
            <div className="qa-flat-list">
              {TIENDA_DETALLE_FIELDS.map((field) => (
                <div className="qa-flat-row" key={field.key}>
                  <span>{field.label}</span>
                  <strong>CRC {money(payload[field.key])}</strong>
                </div>
              ))}
              <div className={cx("qa-flat-row", summary.diferencia !== 0 && "qa-flat-row-warning")}>
                <span>Diferencia</span>
                <strong>CRC {money(summary.diferencia)}</strong>
              </div>
            </div>
          </QaSectionCard>
        </div>

        <QaSectionCard
          title="Observaciones"
          accent="#475569"
          count={payload.observaciones ? 1 : 0}
          total={0}
          sectionNotes={filterReviewNotes(reviewNotes, "observaciones")}
          onCreateNote={sectionNoteCreator ? sectionNoteCreator("observaciones") : null}
          onToggleNote={onToggleNote}
        >
          <div className="qa-observation-copy">{payload.observaciones || "Sin observaciones del dependiente."}</div>
        </QaSectionCard>
      </div>
    );
  }

  const vouchers = voucherSnapshot(payload.vouchers);
  const sections = [
    {
      key: "depositos",
      title: "Depositos",
      accent: "#13315c",
      items: (payload.depositos || []).map((item, index) => ({
        id: item.id || `dep-${index}`,
        title: item.referencia || `Deposito ${index + 1}`,
        meta: item.referencia ? `Referencia ${item.referencia}` : "Sin referencia",
        value: movementAmountValue(item),
      })),
    },
    {
      key: "creditos",
      title: "Creditos",
      accent: "#6c63ff",
      items: (payload.creditos || []).map((item, index) => ({
        id: item.id || `credito-${index}`,
        title: item.cliente || `Credito ${index + 1}`,
        meta: item.referencia ? `Ref. ${item.referencia}` : "Sin referencia",
        value: movementAmountValue(item),
      })),
    },
    {
      key: "mercaderia_credito",
      title: "Mercaderia a credito",
      accent: "#7c3aed",
      items: (payload.mercaderia_credito || []).map((item, index) => ({
        id: item.id || `mcredito-${index}`,
        title: item.cliente || `Mercaderia ${index + 1}`,
        meta: item.referencia ? `Ref. ${item.referencia}` : "Sin referencia",
        value: movementAmountValue(item),
      })),
    },
    {
      key: "sinpes",
      title: "SINPE movil",
      accent: "#0f9d76",
      items: (payload.sinpes || []).map((item, index) => ({
        id: item.id || `sinpe-${index}`,
        title: movementComprobanteValue(item) || `SINPE ${index + 1}`,
        meta: "Comprobante bancario",
        value: movementAmountValue(item),
      })),
    },
    {
      key: "vales",
      title: "Vales",
      accent: "#d97706",
      items: (payload.vales || []).map((item, index) => ({
        id: item.id || `vale-${index}`,
        title: movementComprobanteValue(item) || `Vale ${index + 1}`,
        meta: "Referencia del vale",
        value: movementAmountValue(item),
      })),
    },
    {
      key: "pagos",
      title: "Pagos",
      accent: "#d94b4b",
      items: (payload.pagos || []).map((item, index) => ({
        id: item.id || `pago-${index}`,
        title: movementComprobanteValue(item) || `Pago ${index + 1}`,
        meta: "Comprobante o motivo",
        value: movementAmountValue(item),
      })),
    },
  ].filter((section) => section.items.length > 0);

  return (
    <div className="qa-review-stack">
      <div className="qa-review-header">
        <div>
          <div className="eyebrow">Revision QA</div>
          <h3 className="qa-review-title">Detalle operativo del cierre</h3>
          <p className="qa-review-copy">Cada bloque resume lo esencial para detectar errores de digitacion, montos fuera de lugar o referencias dudosas.</p>
        </div>
      </div>

      <div className="qa-review-grid">
        <QaSectionCard
          title="Vouchers"
          accent="#ff9f1a"
          count={vouchers.length}
          total={vouchers.reduce((sum, item) => sum + item.amount, 0)}
          sectionNotes={filterReviewNotes(reviewNotes, "vouchers")}
          onCreateNote={sectionNoteCreator ? sectionNoteCreator("vouchers") : null}
          onToggleNote={onToggleNote}
        >
          <div className="qa-flat-list">
            {vouchers.length > 0 ? vouchers.map((item) => (
              <div className="qa-flat-row" key={item.label}>
                <span>{item.label}</span>
                <strong>CRC {money(item.amount)}</strong>
              </div>
            )) : <div className="qa-note-empty">Sin vouchers reportados.</div>}
          </div>
        </QaSectionCard>

        <QaSectionCard
          title="Mercaderia de contado"
          accent="#0f766e"
          count={parseAmount(payload.mercaderia_contado) > 0 ? 1 : 0}
          total={payload.mercaderia_contado || 0}
          sectionNotes={filterReviewNotes(reviewNotes, "mercaderia_contado")}
          onCreateNote={sectionNoteCreator ? sectionNoteCreator("mercaderia_contado") : null}
          onToggleNote={onToggleNote}
        >
          <div className="qa-flat-list">
            <div className="qa-flat-row">
              <span>Venta directa</span>
              <strong>CRC {money(payload.mercaderia_contado)}</strong>
            </div>
          </div>
        </QaSectionCard>

        {sections.map((section) => (
          <QaSectionCard
            key={section.key}
            title={section.title}
            accent={section.accent}
            count={section.items.length}
            total={sumMovementItems(payload[section.key])}
            sectionNotes={filterReviewNotes(reviewNotes, section.key)}
            onCreateNote={sectionNoteCreator ? sectionNoteCreator(section.key) : null}
            onToggleNote={onToggleNote}
          >
            <div className="qa-item-list">
              {section.items.map((item) => (
                <QaItemRow
                  key={item.id}
                  title={item.title}
                  meta={item.meta}
                  value={item.value}
                  itemNotes={filterReviewNotes(reviewNotes, section.key, item.id)}
                  onCreateNote={itemNoteCreator ? itemNoteCreator(section.key, item.id) : null}
                  onToggleNote={onToggleNote}
                />
              ))}
            </div>
          </QaSectionCard>
        ))}
      </div>

      <QaSectionCard
        title="Observaciones"
        accent="#475569"
        count={payload.observaciones ? 1 : 0}
        total={0}
        sectionNotes={filterReviewNotes(reviewNotes, "observaciones")}
        onCreateNote={sectionNoteCreator ? sectionNoteCreator("observaciones") : null}
        onToggleNote={onToggleNote}
      >
        <div className="qa-observation-copy">{payload.observaciones || "Sin observaciones del empleado."}</div>
      </QaSectionCard>
    </div>
  );
}

function AppShell({ user, title, subtitle, onLogout, isDark, onToggleTheme, children }) {
  return (
    <div className="app-shell">
      <div className="shell-frame">
        <header className="shell-topbar">
          <div className="topbar-brand-area">
            <img src="/logo-lamarina.jpeg" alt="Servicentro La Marina" className="brand-logo logo-contain" />
          </div>

          <div className="topbar-center">
            <div className="topbar-identity">
              <span className="topbar-kicker">Servicentro La Marina</span>
              <h1 className="topbar-name">{user.full_name}</h1>
              <div className="topbar-context">
                <span className="user-role">{ROLE_LABELS[user.role] || user.role}</span>
                <span className="topbar-divider" />
                <span className="topbar-page">{title}</span>
              </div>
            </div>
          </div>

          <div className="topbar-actions">
            <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
            <button className="btn btn-ghost btn-sm" type="button" onClick={onLogout}>
              Cerrar sesion
            </button>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, isDark, onToggleTheme }) {
  const [mode, setMode] = useState("employee");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const today = useMemo(() => formatDateLabel(new Date().toISOString().slice(0, 10)), []);

  const submit = async (event) => {
    event.preventDefault();
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
    <div className="auth-shell">
      <ThemeToggle isDark={isDark} onToggle={onToggleTheme} floating />

      <div className="auth-grid">
        <section className="auth-brand">
          <div className="auth-brand-hero">
            <img src="/logo-lamarina.jpeg" alt="Servicentro La Marina" className="auth-logo logo-contain" />
            <h1>Cierre de Caja</h1>
            <p className="auth-brand-subtitle">Servicentro La Marina</p>
          </div>

          <div className="auth-brand-panel">
            <span>Hoy</span>
            <strong>{today}</strong>
          </div>
        </section>

        <section className="auth-card">
          <div className="eyebrow">Iniciar sesion</div>
          <h2>Bienvenido</h2>
          <p>Selecciona tu tipo de acceso para continuar.</p>

          <div className="segmented-control segmented-control-3">
            <button className={cx("segmented-button", mode === "employee" && "is-active")} type="button" onClick={() => setMode("employee")}>
              Pistero (PIN)
            </button>
            <button className={cx("segmented-button", mode === "staff" && "is-active")} type="button" onClick={() => setMode("staff")}>
              Admin / Supervisor
            </button>
            <button className={cx("segmented-button", mode === "tienda" && "is-active")} type="button" onClick={() => setMode("tienda")}>
              Tienda
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "employee" ? (
              <>
                <FieldShell label="PIN de pistero" hint="Ingresa el PIN que te asigno el administrador">
                  <input
                    className="field-input"
                    type="password"
                    value={pin}
                    onChange={(event) => setPin(event.target.value)}
                    placeholder="Tu PIN de acceso"
                  />
                </FieldShell>
              </>
            ) : mode === "tienda" ? (
              <>
                <TextField label="Usuario de tienda" value={username} onChange={setUsername} placeholder="usuario de tienda" />
                <TextField label="Contrasena" type="password" value={password} onChange={setPassword} placeholder="Ingresa tu contrasena" />
              </>
            ) : (
              <>
                <TextField label="Usuario" value={username} onChange={setUsername} placeholder="admin o supervisor" />
                <TextField label="Contrasena" type="password" value={password} onChange={setPassword} placeholder="Ingresa tu contrasena" />
              </>
            )}

            {error ? <Banner tone="error">{error}</Banner> : null}

            <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar al sistema"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function CierreForm({
  form,
  setForm,
  onSave,
  employees = [],
  canChooseEmployee = false,
  defaultTurno = "1",
  editing = false,
  saving = false,
  limitReached = false,
}) {
  const summary = useMemo(() => summarizePayload(form), [form]);
  const movementCount = useMemo(
    () =>
      ["creditos", "mercaderia_credito", "sinpes", "depositos", "vales", "pagos"].reduce(
        (total, key) => total + (form[key] || []).length,
        0,
      ) + (parseAmount(form.mercaderia_contado) > 0 ? 1 : 0),
    [form],
  );

  const setVoucher = (key, value) => {
    setForm((previous) => ({
      ...previous,
      vouchers: { ...previous.vouchers, [key]: value },
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    onSave(form);
  };

  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="form-progress-bar">
        <span>{movementCount} movimientos</span>
        <strong>CRC {money(summary.totalReportado)}</strong>
      </div>

      <div className="form-status-bar">
        <span className="form-status-bar-title">
          {editing ? "Editando cierre" : "Nuevo cierre"} — {movementCount} movimiento{movementCount !== 1 ? "s" : ""}
        </span>
        <span className="form-status-total">CRC {money(summary.totalReportado)}</span>
      </div>

      <FormSection
        index="01"
        title="Contexto del turno"
        accent="#ea580c"
      >
        <div className="field-grid field-grid-3">
          <TextField label="Fecha" type="date" value={form.fecha} onChange={(value) => setForm({ ...form, fecha: value })} />
          <TextField label="Turno" value={form.turno} onChange={(value) => setForm({ ...form, turno: value })} placeholder="1, 2 o 3" />
          <TextField label="Datafono" value={form.datafono} onChange={(value) => setForm({ ...form, datafono: value })} placeholder="Codigo o referencia" />
          {canChooseEmployee ? (
            <SelectField
              label="Empleado"
              value={form.employee_id || ""}
              onChange={(value) => setForm({ ...form, employee_id: value ? Number(value) : null })}
            >
              <option value="">Selecciona un empleado</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </SelectField>
          ) : (
            <div className="context-card">
              <span>Turno base</span>
              <strong>{form.turno || defaultTurno}</strong>
              <small>Puedes cambiarlo si hace falta.</small>
            </div>
          )}
        </div>
        <DepositListEditor
          deposits={form.depositos || []}
          setDeposits={(depositos) => setForm({ ...form, depositos })}
        />
      </FormSection>

      <FormSection
        index="02"
        title="Mercaderia de contado"
        accent="#0f766e"
      >
        <div className="field-grid field-grid-3">
          <MoneyField
            label="Monto mercaderia de contado"
            value={form.mercaderia_contado || ""}
            onChange={(value) => setForm({ ...form, mercaderia_contado: value })}
          />
        </div>
      </FormSection>

      <FormSection
        index="03"
        title="Vouchers y tarjetas"
        accent="#ff9f1a"
      >
        <VoucherGrid vouchers={form.vouchers} setVoucher={setVoucher} />
      </FormSection>

      {MOVEMENT_SECTIONS.map((section) => (
        section.layout === "compact" ? (
        <CompactMovementListEditor
          key={section.key}
          config={section}
          items={form[section.key] || []}
          setItems={(items) => setForm({ ...form, [section.key]: items })}
        />
        ) : (
        <MovementListEditor
          key={section.key}
          config={section}
          items={form[section.key] || []}
          setItems={(items) => setForm({ ...form, [section.key]: items })}
        />
        )
      ))}

      <FormSection
        index="09"
        title="Observaciones"
        accent="#475569"
      >
        <TextAreaField
          label="Notas del cierre"
          value={form.observaciones}
          onChange={(value) => setForm({ ...form, observaciones: value })}
          placeholder="Describe ajustes, faltantes, aclaraciones o contexto importante."
        />
      </FormSection>

      <div className="form-submit-row">
        <button className="btn btn-ghost" type="button" onClick={() => setForm(emptyForm(defaultTurno))} disabled={saving}>
          Limpiar
        </button>
        <button className="btn btn-primary" type="submit" disabled={saving || limitReached}>
          {saving ? "Guardando..." : limitReached ? "Limite alcanzado" : editing ? "Guardar cambios" : "Guardar cierre"}
        </button>
      </div>
    </form>
  );
}

function EmployeeDashboard({ token, user, onLogout, isDark, onToggleTheme }) {
  const [cierres, setCierres] = useState([]);
  const [draft, setDraft] = useState(() => emptyForm(user.default_turno));
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [cierreCountForDate, setCierreCountForDate] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api("/api/cierres", {}, token);
      setCierres(data);
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  useEffect(() => {
    if (draft.fecha && /^\d{4}-\d{2}-\d{2}$/.test(draft.fecha)) {
      api(`/api/cierres/count?fecha=${draft.fecha}`, {}, token)
        .then(data => setCierreCountForDate(data.count))
        .catch(() => setCierreCountForDate(0));
    }
  }, [draft.fecha, token]);

  const startNew = () => {
    setEditing(null);
    setDraft(emptyForm(user.default_turno));
    setMessage(null);
  };

  const startEdit = (cierre) => {
    setEditing(cierre);
    const payload = cierre.reportado_json || {};
    setDraft({
      ...emptyForm(user.default_turno),
      ...payload,
      mercaderia_contado: payload.mercaderia_contado || "",
      mercaderia_credito: payload.mercaderia_credito || [],
      depositos: payload.depositos || [],
      employee_id: cierre.employee_id || null,
    });
    setMessage(null);
  };

  const save = async (payload) => {
    const validationError = validateCierrePayload(payload);
    if (validationError) {
      setMessage({ tone: "error", text: validationError });
      return;
    }

    if (!editing && cierreCountForDate >= 3) {
      setMessage({ tone: "error", text: "Ya existen 3 cierres para esta fecha. No se pueden crear mas." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      if (editing?.id) {
        await api(`/api/cierres/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) }, token);
        setMessage({ tone: "success", text: "El cierre se actualizo correctamente." });
      } else {
        await api("/api/cierres", { method: "POST", body: JSON.stringify(payload) }, token);
        setMessage({ tone: "success", text: "El cierre se guardo correctamente." });
      }
      setEditing(null);
      setDraft(emptyForm(user.default_turno));
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => summarizePayload(draft), [draft]);
  const statusCounts = useMemo(
    () =>
      cierres.reduce(
        (acc, cierre) => {
          acc.total += 1;
          if (normalizeStatusValue(cierre.status) === "reconciled") acc.reconciled += 1;
          if (["submitted", "reviewed", "approved"].includes(normalizeStatusValue(cierre.status))) acc.pending += 1;
          return acc;
        },
        { total: 0, reconciled: 0, pending: 0 },
      ),
    [cierres],
  );

  return (
    <AppShell
      user={user}
      title="Panel de empleado"
      onLogout={onLogout}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
    >
      <div className="metric-grid">
        <MetricCard label="Cierres" value={statusCounts.total} caption="Tu historial" accent="#13315c" />
        <MetricCard label="Pendientes" value={statusCounts.pending} caption="Aun abiertos" accent="#ff9f1a" />
        <MetricCard label="Conciliados" value={statusCounts.reconciled} caption="Listos" accent="#0f9d76" />
        <MetricCard label="En pantalla" value={`CRC ${money(summary.totalReportado)}`} caption={`Turno ${draft.turno || user.default_turno || "-"}`} accent="#2f6fed" />
      </div>

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      {!editing && cierreCountForDate >= 3 ? (
        <Banner tone="warning">Ya tienes 3 cierres registrados para {formatDateLabel(draft.fecha)}. No puedes crear mas en esta fecha.</Banner>
      ) : null}

      <div className="dashboard-grid">
        <div className="stack">
          <Panel
            eyebrow="Formulario"
            title={editing ? "Editar cierre" : "Nuevo cierre"}
            subtitle="Captura directa."
            accent="#ff9f1a"
            action={
              <button className="btn btn-secondary" type="button" onClick={startNew} disabled={saving}>
                {editing ? "Cancelar edicion" : "Nuevo cierre"}
              </button>
            }
          >
            <CierreForm
              form={draft}
              setForm={setDraft}
              onSave={save}
              defaultTurno={user.default_turno || "1"}
              editing={Boolean(editing)}
              saving={saving}
              limitReached={!editing && cierreCountForDate >= 3}
            />
          </Panel>
        </div>

        <div className="stack">
          <Panel eyebrow="Resumen" title="Turno actual" accent="#0f766e" className="sticky-panel">
            <SummaryBoard payload={draft} summary={summary} />
            <div className="mini-context-grid">
              <div className="mini-context-card">
                <span>Fecha</span>
                <strong>{formatDateLabel(draft.fecha)}</strong>
              </div>
              <div className="mini-context-card">
                <span>Turno</span>
                <strong>{draft.turno || user.default_turno || "-"}</strong>
              </div>
              <div className="mini-context-card">
                <span>Datafono</span>
                <strong>{draft.datafono || "Sin dato"}</strong>
              </div>
            </div>
          </Panel>

          <Panel
            eyebrow="Historial"
            title="Mis cierres"
            accent="#13315c"
            action={<button className="btn btn-ghost" type="button" onClick={load}>Actualizar</button>}
          >
            {loading ? (
              <HistorySkeleton />
            ) : cierres.length === 0 ? (
              <EmptyState title="Sin cierres" body="Aun no hay registros." />
            ) : (
              <div className="history-list">
                {cierres.map((cierre) => {
                  const canEdit = canEditCierre(cierre);
                  const editTime = remainingEditTime(cierre);
                  return (
                    <div className="history-card" key={cierre.id}>
                      <div className="history-card-main">
                        <div className="history-card-top">
                          <strong>{formatDateLabel(cierre.fecha)}</strong>
                          <StatusPill status={cierre.status} />
                        </div>
                        <p>
                          Turno {cierre.turno || "-"}
                          {cierre.audit_notes ? ` / ${cierre.audit_notes}` : ""}
                        </p>
                        <span className="history-total">CRC {money(cierre.resumen_reportado?.total_reportado)}</span>
                        {editTime ? <span className="edit-time-badge">{editTime}</span> : null}
                        {!canEdit && !editTime ? <span className="edit-time-expired">Edicion cerrada</span> : null}
                      </div>
                      {canEdit ? <button className="btn btn-secondary" type="button" onClick={() => startEdit(cierre)}>Editar</button> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function AdminCierreEditor({ cierre, token, onSaved }) {
  const [editPayload, setEditPayload] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const ADMIN_SECTIONS = [
    { key: "depositos", title: "Depositos", fields: ["referencia", "monto_reportado"], accent: "#13315c" },
    { key: "creditos", title: "Creditos", fields: ["cliente", "referencia", "monto_reportado"], accent: "#6c63ff" },
    { key: "mercaderia_credito", title: "Mercaderia a credito", fields: ["cliente", "referencia", "monto_reportado"], accent: "#7c3aed" },
    { key: "sinpes", title: "SINPE movil", fields: ["comprobante", "monto"], accent: "#0f9d76" },
    { key: "vales", title: "Vales", fields: ["comprobante", "monto", "cliente"], accent: "#d97706" },
    { key: "pagos", title: "Pagos", fields: ["comprobante", "monto", "cliente"], accent: "#d94b4b" },
  ];

  useEffect(() => {
    if (!cierre) { setEditPayload(null); return; }
    const p = cierre.reportado_json || {};
    const ensureIds = (arr) => (arr || []).map((item) => ({ ...item, id: item.id || crypto.randomUUID() }));
    setEditPayload({
      ...p,
      fecha: p.fecha || "",
      turno: p.turno || "",
      datafono: p.datafono || "",
      observaciones: p.observaciones || "",
      mercaderia_contado: p.mercaderia_contado || "",
      vouchers: { ...emptyForm().vouchers, ...(p.vouchers || {}) },
      creditos: ensureIds(p.creditos),
      mercaderia_credito: ensureIds(p.mercaderia_credito),
      sinpes: ensureIds(p.sinpes),
      depositos: ensureIds(p.depositos),
      vales: ensureIds(p.vales),
      pagos: ensureIds(p.pagos),
    });
    setMessage(null);
  }, [cierre?.id]);

  if (!editPayload) return null;

  const updateField = (key, value) => setEditPayload((prev) => ({ ...prev, [key]: value }));

  const updateVoucher = (key, value) => setEditPayload((prev) => ({
    ...prev,
    vouchers: { ...prev.vouchers, [key]: value },
  }));

  const updateItem = (sectionKey, index, fieldKey, value) => {
    setEditPayload((prev) => ({
      ...prev,
      [sectionKey]: prev[sectionKey].map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [fieldKey]: value };
        if (fieldKey === "monto") updated.monto_reportado = value;
        if (fieldKey === "comprobante") updated.referencia = value;
        return updated;
      }),
    }));
  };

  const removeItem = (sectionKey, index) => {
    setEditPayload((prev) => ({
      ...prev,
      [sectionKey]: prev[sectionKey].filter((_, i) => i !== index),
    }));
  };

  const addItem = (sectionKey) => {
    const section = ADMIN_SECTIONS.find((s) => s.key === sectionKey);
    const isCompact = section?.fields.includes("comprobante");
    setEditPayload((prev) => ({
      ...prev,
      [sectionKey]: [...(prev[sectionKey] || []), isCompact ? { ...emptyCompactMovement(), cliente: "" } : emptyMovement()],
    }));
  };

  const moveItem = (fromSection, index, toSection) => {
    if (fromSection === toSection) return;
    setEditPayload((prev) => {
      const item = prev[fromSection][index];
      const moved = { ...item, id: crypto.randomUUID() };
      return {
        ...prev,
        [fromSection]: prev[fromSection].filter((_, i) => i !== index),
        [toSection]: [...(prev[toSection] || []), moved],
      };
    });
  };

  const saveEdits = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api(`/api/cierres/${cierre.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...editPayload,
          employee_id: cierre.employee_id,
        }),
      }, token);
      setMessage({ tone: "success", text: "Cierre actualizado correctamente." });
      onSaved?.();
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const fieldLabel = (key) => {
    const labels = { cliente: "Cliente", referencia: "Referencia", monto_reportado: "Monto", comprobante: "Comprobante", monto: "Monto" };
    return labels[key] || key;
  };

  return (
    <div className="admin-editor-stack">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      {/* --- Meta fields --- */}
      <div className="admin-editor-section" style={{ "--editor-accent": "#475569" }}>
        <div className="admin-editor-section-head">
          <strong>Datos generales</strong>
        </div>
        <div className="admin-editor-fields">
          <div className="admin-editor-field">
            <TextField label="Fecha" value={editPayload.fecha || ""} onChange={(v) => updateField("fecha", v)} placeholder="YYYY-MM-DD" />
          </div>
          <div className="admin-editor-field">
            <SelectField label="Turno" value={editPayload.turno || ""} onChange={(v) => updateField("turno", v)}>
              <option value="1">Turno 1</option>
              <option value="2">Turno 2</option>
              <option value="3">Turno 3</option>
            </SelectField>
          </div>
          <div className="admin-editor-field">
            <TextField label="Datafono" value={editPayload.datafono || ""} onChange={(v) => updateField("datafono", v)} placeholder="Numero de datafono" />
          </div>
        </div>
        <div className="admin-editor-fields" style={{ marginTop: 8 }}>
          <div className="admin-editor-field" style={{ flex: "1 1 100%" }}>
            <TextAreaField label="Observaciones" value={editPayload.observaciones || ""} onChange={(v) => updateField("observaciones", v)} placeholder="Notas u observaciones" />
          </div>
        </div>
      </div>

      {/* --- Mercaderia contado --- */}
      <div className="admin-editor-section" style={{ "--editor-accent": "#0f766e" }}>
        <div className="admin-editor-section-head">
          <strong>Mercaderia de contado</strong>
        </div>
        <div className="admin-editor-fields">
          <div className="admin-editor-field-money">
            <MoneyField
              label="Monto mercaderia de contado"
              value={editPayload.mercaderia_contado || ""}
              onChange={(v) => updateField("mercaderia_contado", v)}
            />
          </div>
        </div>
      </div>

      {/* --- Vouchers --- */}
      <div className="admin-editor-section" style={{ "--editor-accent": "#ff9f1a" }}>
        <div className="admin-editor-section-head">
          <strong>Vouchers y tarjetas</strong>
        </div>
        <VoucherGrid vouchers={editPayload.vouchers || {}} setVoucher={updateVoucher} />
      </div>

      {/* --- Movement sections --- */}
      {ADMIN_SECTIONS.map((section) => {
        const items = editPayload[section.key] || [];
        return (
          <div key={section.key} className="admin-editor-section" style={{ "--editor-accent": section.accent }}>
            <div className="admin-editor-section-head">
              <strong>{section.title}</strong>
              <span className="section-chip">{items.length} registros</span>
            </div>
            {items.map((item, index) => (
              <div key={item.id || index} className="admin-editor-item">
                <div className="admin-editor-item-head">
                  <strong>{section.title} #{index + 1}</strong>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <select
                      className="field-input admin-move-select"
                      value=""
                      onChange={(e) => { if (e.target.value) moveItem(section.key, index, e.target.value); }}
                    >
                      <option value="">Mover a...</option>
                      {ADMIN_SECTIONS.filter((s) => s.key !== section.key).map((s) => (
                        <option key={s.key} value={s.key}>{s.title}</option>
                      ))}
                    </select>
                    <button className="btn btn-ghost-danger btn-sm" type="button" onClick={() => removeItem(section.key, index)}>
                      Quitar
                    </button>
                  </div>
                </div>
                <div className="admin-editor-fields">
                  {section.fields.map((fieldKey) => (
                    <div key={fieldKey} className={fieldKey.includes("monto") ? "admin-editor-field-money" : "admin-editor-field"}>
                      {fieldKey.includes("monto") ? (
                        <MoneyField
                          label={fieldLabel(fieldKey)}
                          value={movementAmountValue(item)}
                          onChange={(v) => updateItem(section.key, index, fieldKey, v)}
                        />
                      ) : (
                        <TextField
                          label={fieldLabel(fieldKey)}
                          value={item[fieldKey] || ""}
                          onChange={(v) => updateItem(section.key, index, fieldKey, v)}
                          placeholder={fieldLabel(fieldKey)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button className="btn-add-movement" type="button" onClick={() => addItem(section.key)}>
              + Agregar {section.title.toLowerCase()}
            </button>
          </div>
        );
      })}

      <div className="form-submit-row">
        <button className="btn btn-primary" type="button" onClick={saveEdits} disabled={saving}>
          {saving ? "Guardando..." : "Guardar cambios al cierre"}
        </button>
      </div>
    </div>
  );
}

function SupervisorDepositEditor({ cierre, token, onSaved }) {
  const [deposits, setDeposits] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!cierre) { setDeposits([]); return; }
    const p = cierre.reportado_json || {};
    setDeposits((p.depositos || []).map((item) => ({ ...item, id: item.id || crypto.randomUUID() })));
    setMessage(null);
  }, [cierre?.id]);

  const updateDeposit = (index, key, value) => setDeposits((prev) => prev.map((d, i) => (i === index ? { ...d, [key]: value } : d)));
  const removeDeposit = (index) => setDeposits((prev) => prev.filter((_, i) => i !== index));
  const addDeposit = () => setDeposits((prev) => [...prev, { id: crypto.randomUUID(), referencia: "", monto_reportado: "" }]);

  const saveEdits = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = { ...(cierre.reportado_json || {}), depositos: deposits, employee_id: cierre.employee_id };
      await api(`/api/cierres/${cierre.id}`, { method: "PUT", body: JSON.stringify(payload) }, token);
      setMessage({ tone: "success", text: "Depositos actualizados correctamente." });
      onSaved?.();
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-editor-stack">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <div className="admin-editor-section" style={{ "--editor-accent": "#13315c" }}>
        <div className="admin-editor-section-head">
          <strong>Depositos</strong>
          <span className="section-chip">{deposits.length} registros</span>
        </div>
        {deposits.map((dep, index) => (
          <div key={dep.id || index} className="admin-editor-item">
            <div className="admin-editor-item-head">
              <strong>Deposito #{index + 1}</strong>
              <button className="btn btn-ghost-danger btn-sm" type="button" onClick={() => removeDeposit(index)}>Quitar</button>
            </div>
            <div className="admin-editor-fields">
              <div className="admin-editor-field">
                <TextField label="Referencia" value={dep.referencia || ""} onChange={(v) => updateDeposit(index, "referencia", v)} placeholder="ID del comprobante" />
              </div>
              <div className="admin-editor-field-money">
                <MoneyField label="Monto" value={dep.monto_reportado || ""} onChange={(v) => updateDeposit(index, "monto_reportado", v)} />
              </div>
            </div>
          </div>
        ))}
        <button className="btn-add-movement" type="button" onClick={addDeposit}>+ Agregar deposito</button>
      </div>
      <div className="form-submit-row">
        <button className="btn btn-primary" type="button" onClick={saveEdits} disabled={saving}>
          {saving ? "Guardando..." : "Guardar depositos"}
        </button>
      </div>
    </div>
  );
}

function AdminTiendaEditor({ cierre, token, onSaved }) {
  const [editPayload, setEditPayload] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!cierre) {
      setEditPayload(null);
      return;
    }
    setEditPayload({ ...emptyTiendaForm(), ...(cierre.reportado_json || {}) });
    setMessage(null);
  }, [cierre?.id]);

  if (!editPayload) return null;

  const saveEdits = async (payload) => {
    setSaving(true);
    setMessage(null);
    try {
      await api(`/api/cierres/tienda/${cierre.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }, token);
      setMessage({ tone: "success", text: "Cierre de tienda actualizado correctamente." });
      onSaved?.();
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-editor-stack">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <CierreTiendaForm
        form={editPayload}
        setForm={setEditPayload}
        onSave={saveEdits}
        editing
        saving={saving}
      />
    </div>
  );
}

function ReviewPanel({ token, user, employees = [] }) {
  const [cierres, setCierres] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [summaryNotes, setSummaryNotes] = useState("");
  const [query, setQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [message, setMessage] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [viewTrash, setViewTrash] = useState(false);
  const isAdmin = user?.role === "admin";
  const visibleStatusOptions = Object.entries(STATUS_META).filter(([value]) => value !== "deleted" && (isAdmin || value !== "deleted"));

  const load = async () => {
    setLoading(true);
    try {
      const data = await api(`/api/cierres?include_deleted=${isAdmin ? "true" : "false"}`, {}, token);
      setCierres(data);
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (cierreId) => {
    if (!cierreId) {
      setSelectedDetail(null);
      return;
    }
    setLoadingDetail(true);
    try {
      const data = await api(`/api/cierres/${cierreId}`, {}, token);
      setSelectedDetail(data);
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, isAdmin]);

  const trashCount = useMemo(() => cierres.filter((c) => normalizeStatusValue(c.status) === "deleted").length, [cierres]);

  const filtered = useMemo(
    () =>
      cierres.filter((cierre) => {
        const normalizedStatus = normalizeStatusValue(cierre.status);
        const isDeleted = normalizedStatus === "deleted";
        if (viewTrash) return isDeleted;
        if (isDeleted) return false;
        const matchesName =
          !query || cierre.empleado?.toLowerCase().includes(query.toLowerCase());
        const matchesDate =
          !dateQuery || String(cierre.fecha).includes(dateQuery);
        const matchesStatus = statusFilter === "all" || normalizedStatus === statusFilter;
        const matchesEmployee = employeeFilter === "all" || String(cierre.employee_id) === employeeFilter;
        return matchesName && matchesDate && matchesStatus && matchesEmployee;
      }),
    [cierres, query, dateQuery, statusFilter, employeeFilter, isAdmin, viewTrash],
  );

  const employeeStats = useMemo(() => {
    if (employeeFilter === "all") return null;
    const empCierres = cierres.filter((c) => String(c.employee_id) === employeeFilter && normalizeStatusValue(c.status) !== "deleted");
    const total = empCierres.length;
    const totalReportado = empCierres.reduce((sum, c) => sum + (c.resumen_reportado?.total_reportado || 0), 0);
    const pending = empCierres.filter((c) => ["submitted", "reviewed", "approved"].includes(normalizeStatusValue(c.status))).length;
    const reconciled = empCierres.filter((c) => normalizeStatusValue(c.status) === "reconciled").length;
    return { total, totalReportado, pending, reconciled };
  }, [cierres, employeeFilter]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((item) => item.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }
    loadDetail(selectedId);
  }, [selectedId, token]);

  useEffect(() => {
    if (selectedDetail) {
      setSummaryNotes(selectedDetail.audit_notes || "");
      setEditMode(false);
    }
  }, [selectedDetail]);

  const selectedStatus = normalizeStatusValue(selectedDetail?.status);
  const unresolvedNotes = (selectedDetail?.review_notes || []).filter((note) => !note.resolved).length;
  const canMarkReviewed = user?.role === "supervisor" && selectedStatus === "submitted";
  const canApprove = isAdmin && selectedStatus === "reviewed";
  const canReconcile = isAdmin && selectedDetail?.tipo !== "tienda" && selectedStatus === "approved";
  const canWriteSharedSummary = selectedStatus !== "deleted" && (canMarkReviewed || canApprove);
  const reconcileLabel = selectedDetail?.gaspro_import_id && selectedStatus === "approved" ? "Reconciliar de nuevo" : "Conciliar con Gaspro";

  const refreshCurrent = async (cierreId = selectedId) => {
    await load();
    if (cierreId) {
      await loadDetail(cierreId);
    }
  };

  const submitReview = async (nextStatus) => {
    if (!selectedDetail) return;
    setSaving(true);
    setMessage(null);
    try {
      await api(
        `/api/cierres/${selectedDetail.id}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            validado_json: selectedDetail.validado_json || selectedDetail.reportado_json,
            audit_notes: summaryNotes,
            status: nextStatus,
          }),
        },
        token,
      );
      setMessage({ tone: "success", text: nextStatus === "reviewed" ? "El cierre quedó revisado." : "El cierre quedó aprobado." });
      await refreshCurrent(selectedDetail.id);
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const reconcileSelected = async () => {
    if (!selectedDetail || !canReconcile) return;
    setReconciling(true);
    setMessage(null);
    try {
      await api(`/api/cierres/${selectedDetail.id}/reconcile`, { method: "POST" }, token);
      setMessage({ tone: "success", text: "La conciliacion con Gaspro se aplico correctamente." });
      await refreshCurrent(selectedDetail.id);
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setReconciling(false);
    }
  };

  const createNote = async (sectionKey, body, movementId = null) => {
    if (!selectedDetail) return;
    setMessage(null);
    try {
      await api(
        `/api/cierres/${selectedDetail.id}/notes`,
        {
          method: "POST",
          body: JSON.stringify({
            target_scope: movementId ? "item" : "section",
            section_key: sectionKey,
            movement_id: movementId,
            body,
          }),
        },
        token,
      );
      await refreshCurrent(selectedDetail.id);
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
      throw err;
    }
  };

  const toggleNoteResolved = async (note, resolved) => {
    if (!selectedDetail) return;
    setMessage(null);
    try {
      await api(
        `/api/cierres/${selectedDetail.id}/notes/${note.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ resolved }),
        },
        token,
      );
      await refreshCurrent(selectedDetail.id);
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    }
  };

  const deleteSelected = async () => {
    if (!selectedDetail || !isAdmin) return;
    if (!window.confirm("Este cierre se movera a la papelera. ¿Deseas continuar?")) return;
    const reason = window.prompt("Motivo de papelera (opcional):", "") || "";
    setSaving(true);
    setMessage(null);
    try {
      await api(
        `/api/cierres/${selectedDetail.id}`,
        {
          method: "DELETE",
          body: JSON.stringify({ reason }),
        },
        token,
      );
      setMessage({ tone: "success", text: "El cierre fue enviado a la papelera. Usa el boton 'Papelera' para verlo o restaurarlo." });
      await refreshCurrent(selectedDetail.id);
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const restoreSelected = async () => {
    if (!selectedDetail || !isAdmin) return;
    setSaving(true);
    setMessage(null);
    try {
      await api(`/api/cierres/${selectedDetail.id}/restore`, { method: "POST" }, token);
      setMessage({ tone: "success", text: "El cierre fue restaurado." });
      await refreshCurrent(selectedDetail.id);
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-grid review-dashboard-grid">
      <Panel
        eyebrow={viewTrash ? "Papelera" : "Listado"}
        title={viewTrash ? "Cierres eliminados" : "Cierres registrados"}
        subtitle={viewTrash ? "Cierres que fueron enviados a la papelera. Puedes restaurarlos desde el detalle." : "Busca por nombre o fecha y selecciona el cierre que necesitas revisar."}
        accent={viewTrash ? "#e11d48" : "#13315c"}
      >
        {isAdmin ? (
          <div className="trash-toggle-row">
            <button className={cx("btn btn-sm", !viewTrash && "btn-primary")} type="button" onClick={() => setViewTrash(false)}>
              Cierres
            </button>
            <button className={cx("btn btn-sm", viewTrash && "btn-ghost-danger")} type="button" onClick={() => setViewTrash(true)}>
              Papelera{trashCount > 0 ? ` (${trashCount})` : ""}
            </button>
          </div>
        ) : null}

        {!viewTrash ? (
          <div className="toolbar-grid">
            <TextField label="Nombre" value={query} onChange={setQuery} placeholder="Buscar por nombre del empleado" />
            <TextField label="Fecha" value={dateQuery} onChange={setDateQuery} placeholder="Ej: 2026-03-25" />
            <SelectField label="Estado" value={statusFilter} onChange={setStatusFilter}>
              <option value="all">Todos los estados</option>
              {visibleStatusOptions.map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </SelectField>
            {employees.length > 0 ? (
              <SelectField label="Empleado" value={employeeFilter} onChange={setEmployeeFilter}>
                <option value="all">Todos</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={String(emp.id)}>
                    {emp.full_name}
                  </option>
                ))}
              </SelectField>
            ) : null}
          </div>
        ) : null}

        {!viewTrash && employeeStats ? (
          <div className="employee-stats-row">
            <span className="meta-chip">Cierres: {employeeStats.total}</span>
            <span className="meta-chip">Pendientes: {employeeStats.pending}</span>
            <span className="meta-chip">Conciliados: {employeeStats.reconciled}</span>
            <span className="meta-chip">Total: CRC {money(employeeStats.totalReportado)}</span>
          </div>
        ) : null}

        {loading ? (
          <EmptyState title="Cargando" body="Consultando cierres." />
        ) : filtered.length === 0 ? (
          <EmptyState title={viewTrash ? "Papelera vacia" : "Sin coincidencias"} body={viewTrash ? "No hay cierres eliminados." : "Ajusta la busqueda."} />
        ) : (
          <div className="selectable-list">
            {filtered.map((cierre) => (
              <button
                className={cx("selectable-card selectable-card-qa", selectedId === cierre.id && "is-active")}
                key={cierre.id}
                type="button"
                onClick={() => setSelectedId(cierre.id)}
              >
                <div className="selectable-card-copy">
                  <strong>{cierre.empleado}</strong>
                  <span>{formatDateLabel(cierre.fecha)} / {cierre.tipo === "tienda" ? "Tienda" : `Turno ${cierre.turno || "-"}`}</span>
                  <small>
                    {viewTrash
                      ? (cierre.audit_notes || "Sin motivo registrado")
                      : (cierre.unresolved_note_count ? `${cierre.unresolved_note_count} nota(s) pendiente(s)` : "Sin notas pendientes")}
                  </small>
                </div>
                <div className="selectable-card-meta">
                  {viewTrash ? null : <StatusPill status={cierre.status} />}
                  <strong>CRC {money(cierre.resumen_reportado?.total_reportado)}</strong>
                </div>
              </button>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        eyebrow="Detalle"
        title={selectedDetail ? selectedDetail.empleado : "Selecciona un cierre"}
        subtitle={selectedDetail ? `${formatDateLabel(selectedDetail.fecha)} / ${selectedDetail.tipo === "tienda" ? "Cierre de tienda" : `Turno ${selectedDetail.turno || "-"}`}` : "Selecciona un cierre de la lista para ver su contenido."}
        accent="#ff9f1a"
      >
        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

        {selectedDetail ? (
          <div className="stack">
            <div className="detail-meta-row detail-meta-row-spaced">
              <StatusPill status={selectedDetail.status} />
              <span className="meta-chip">Total reportado: CRC {money(selectedDetail.resumen_reportado?.total_reportado)}</span>
              <span className="meta-chip">Notas pendientes: {unresolvedNotes}</span>
              {selectedDetail.gaspro_mode ? <span className="meta-chip">Gaspro: {selectedDetail.gaspro_mode}</span> : null}
            </div>

            <div className="qa-action-bar">
              {user?.role === "supervisor" && (
                <button className="btn btn-primary" type="button" onClick={() => submitReview("reviewed")} disabled={!canMarkReviewed || saving || reconciling}>
                  {saving && canMarkReviewed ? "Guardando..." : "Marcar revisado"}
                </button>
              )}
              {isAdmin && (
                <button className="btn btn-primary" type="button" onClick={() => submitReview("approved")} disabled={!canApprove || saving || reconciling}>
                  {saving && canApprove ? "Guardando..." : "Aprobar"}
                </button>
              )}
              {(isAdmin || user?.role === "supervisor") ? (
                <button className="btn btn-secondary" type="button" onClick={() => setEditMode((value) => !value)} disabled={selectedStatus === "deleted"}>
                  {editMode ? "Cancelar edicion" : (isAdmin ? "Editar cierre" : "Editar depositos")}
                </button>
              ) : null}
              {isAdmin && canReconcile ? (
                <button className="btn btn-secondary" type="button" onClick={reconcileSelected} disabled={saving || reconciling}>
                  {reconciling ? "Conciliando..." : reconcileLabel}
                </button>
              ) : null}
              {isAdmin && selectedStatus !== "deleted" ? (
                <button className="btn btn-ghost-danger" type="button" onClick={deleteSelected} disabled={saving || reconciling}>
                  Enviar a papelera
                </button>
              ) : null}
              {isAdmin && selectedStatus === "deleted" ? (
                <button className="btn btn-secondary" type="button" onClick={restoreSelected} disabled={saving || reconciling}>
                  Restaurar
                </button>
              ) : null}
            </div>

            <div className="qa-shared-note">
              <TextAreaField
                label="Notas del cierre"
                value={summaryNotes}
                onChange={setSummaryNotes}
                placeholder={canWriteSharedSummary ? "Escribe observaciones generales sobre este cierre." : "Las observaciones se bloquean cuando no hay cambios de estado pendientes."}
                disabled={!canWriteSharedSummary}
                readOnly={!canWriteSharedSummary}
              />
              <p>
                {canWriteSharedSummary
                  ? "Estas observaciones acompañan el cierre completo. Tambien puedes agregar notas dentro de cada seccion."
                  : "Las observaciones se bloquean cuando no hay cambios pendientes. Puedes seguir usando las notas por seccion."}
              </p>
            </div>

            {loadingDetail ? <EmptyState title="Cargando detalle" body="Preparando el cierre seleccionado." /> : null}

            {editMode && isAdmin ? (
              selectedDetail.tipo === "tienda" ? (
                <AdminTiendaEditor
                  cierre={selectedDetail}
                  token={token}
                  onSaved={async () => {
                    setEditMode(false);
                    await refreshCurrent(selectedDetail.id);
                  }}
                />
              ) : (
                <AdminCierreEditor
                  cierre={selectedDetail}
                  token={token}
                  onSaved={async () => {
                    setEditMode(false);
                    await refreshCurrent(selectedDetail.id);
                  }}
                />
              )
            ) : editMode && user?.role === "supervisor" && selectedDetail.tipo !== "tienda" ? (
              <SupervisorDepositEditor
                cierre={selectedDetail}
                token={token}
                onSaved={async () => {
                  setEditMode(false);
                  await refreshCurrent(selectedDetail.id);
                }}
              />
            ) : (
              <>
                <CierreSnapshot
                  payload={selectedDetail.reportado_json}
                  reportadoSummary={selectedDetail.resumen_reportado}
                  validadoSummary={selectedDetail.resumen_validado}
                  auditNotes={selectedDetail.audit_notes}
                />
                <QaReviewDetail
                  cierre={selectedDetail}
                  onCreateNote={selectedStatus === "deleted" ? null : createNote}
                  onToggleNote={selectedStatus === "deleted" ? null : toggleNoteResolved}
                />
              </>
            )}
          </div>
        ) : (
          <EmptyState title="Sin seleccion" body="Elige un cierre." />
        )}
      </Panel>
    </div>
  );
}

function GasproPanel({ token }) {
  const today = new Date().toISOString().slice(0, 10);
  const [imports, setImports] = useState([]);
  const [file, setFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [mode, setMode] = useState("general");
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api("/api/gaspro/imports", {}, token);
      setImports(data);
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    if (!file) return;
    if (!isValidDateValue(dateFrom) || !isValidDateValue(dateTo) || dateFrom > dateTo) {
      setMessage({ tone: "error", text: "Revisa el rango de fechas." });
      return;
    }

    const form = new FormData();
    form.append("import_mode", mode);
    form.append("date_from", dateFrom);
    form.append("date_to", dateTo);
    form.append("file", file);

    setUploading(true);
    setMessage(null);
    try {
      const data = await api("/api/gaspro/import", { method: "POST", body: form }, token);
      setMessage({
        tone: "success",
        text: `Importacion ${data.import_id}: ${data.matched_cierres} conciliados, ${data.skipped_cierres || 0} omitidos y ${data.already_reconciled || 0} ya conciliados.`,
      });
      setFile(null);
      setFileInputKey((current) => current + 1);
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="dashboard-grid">
      <Panel
        eyebrow="Carga"
        title="Importar Gaspro"
        subtitle="Archivo y rango."
        accent="#0f766e"
      >
        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

        <form className="form-stack" onSubmit={submit}>
          <div className="field-grid field-grid-3">
            <SelectField label="Modo" value={mode} onChange={setMode}>
              <option value="general">General</option>
              <option value="detailed">Detallado</option>
            </SelectField>
            <TextField label="Desde" type="date" value={dateFrom} onChange={setDateFrom} />
            <TextField label="Hasta" type="date" value={dateTo} onChange={setDateTo} />
          </div>

          <label className="upload-card">
            <input
              key={fileInputKey}
              className="upload-input"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <span className="upload-kicker">Archivo fuente</span>
            <strong>{file ? file.name : "Selecciona un CSV o XLSX para importar"}</strong>
            <p>CSV o XLSX.</p>
          </label>

          <div className="form-submit-row">
            <button className="btn btn-primary" type="submit" disabled={!file || uploading}>
              {uploading ? "Importando..." : "Importar archivo"}
            </button>
          </div>
        </form>
      </Panel>

      <Panel
        eyebrow="Historial"
        title="Importaciones recientes"
        accent="#13315c"
        action={<button className="btn btn-ghost" type="button" onClick={load}>Actualizar</button>}
      >
        {loading ? (
          <EmptyState title="Cargando" body="Consultando historial." />
        ) : imports.length === 0 ? (
          <EmptyState title="Sin importaciones" body="Aun no hay archivos cargados." />
        ) : (
          <div className="timeline-list">
            {imports.map((item) => (
              <div className="timeline-card" key={item.id}>
                <div className="timeline-card-copy">
                  <strong>{item.original_name}</strong>
                  <span>{formatDateLabel(item.date_from)} / {formatDateLabel(item.date_to)}</span>
                  <small>{formatDateTimeLabel(item.created_at)}</small>
                </div>
                <div className="timeline-card-meta">
                  <span className="meta-chip">{item.import_mode}</span>
                  <strong>{item.matched_cierres} cierres</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function UserAdminPanel({ token, onRosterChange }) {
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(() => emptyUserDraft("employee"));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = async (nextSelectedId = selectedId) => {
    setLoading(true);
    try {
      const data = await api("/api/users", {}, token);
      setUsers(data);
      if (nextSelectedId && data.some((item) => item.id === nextSelectedId)) {
        setSelectedId(nextSelectedId);
      } else if (nextSelectedId && !data.some((item) => item.id === nextSelectedId)) {
        setSelectedId(null);
      }
      await onRosterChange?.();
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const employees = useMemo(() => users.filter((item) => item.role === "employee"), [users]);
  const staff = useMemo(() => users.filter((item) => item.role !== "employee"), [users]);
  const selectedUser = useMemo(() => users.find((item) => item.id === selectedId) || null, [users, selectedId]);

  useEffect(() => {
    if (!selectedUser) return;
    setDraft({
      full_name: selectedUser.full_name || "",
      username: selectedUser.username || "",
      role: selectedUser.role || "employee",
      pin: "",
      password: "",
    });
  }, [selectedUser]);

  const startNew = (role = "employee") => {
    setSelectedId(null);
    setDraft(emptyUserDraft(role));
    setMessage(null);
  };

  const save = async () => {
    if (!draft.full_name.trim()) {
      setMessage({ tone: "error", text: "Escribe el nombre completo." });
      return;
    }
    if (!selectedUser && draft.role === "employee" && !draft.pin.trim()) {
      setMessage({ tone: "error", text: "Define la clave del colaborador." });
      return;
    }
    if (!selectedUser && draft.role !== "employee" && !draft.password.trim()) {
      setMessage({ tone: "error", text: "Define la contrasena del usuario." });
      return;
    }

    const payload = {
      full_name: draft.full_name.trim(),
      username: draft.username.trim() || undefined,
      role: draft.role,
    };

    if (draft.role === "employee") {
      if (draft.pin.trim()) payload.pin = draft.pin.trim();
    } else if (draft.password.trim()) {
      payload.password = draft.password.trim();
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = selectedUser
        ? await api(`/api/users/${selectedUser.id}`, { method: "PATCH", body: JSON.stringify(payload) }, token)
        : await api("/api/users", { method: "POST", body: JSON.stringify(payload) }, token);

      await load(response.id);
      setMessage({
        tone: "success",
        text: selectedUser ? "El usuario se actualizo correctamente." : "El usuario se creo correctamente.",
      });
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedUser) return;
    if (!window.confirm(`Se desactivara a ${selectedUser.full_name}. Puedes volver a crearlo despues si hace falta.`)) {
      return;
    }

    setRemoving(true);
    setMessage(null);
    try {
      await api(`/api/users/${selectedUser.id}`, { method: "DELETE" }, token);
      startNew(selectedUser.role === "employee" ? "employee" : "supervisor");
      await load();
      setMessage({ tone: "success", text: "El usuario se quito correctamente." });
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="dashboard-grid">
      <Panel
        eyebrow="Control"
        title="Personal y accesos"
        subtitle="Gestiona pisteros, supervisores y administradores."
        accent="#13315c"
        action={<button className="btn btn-ghost" type="button" onClick={() => load()} disabled={loading}>Actualizar</button>}
      >
        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

        <div className="user-admin-toolbar">
          <button className="btn btn-primary" type="button" onClick={() => startNew("employee")}>
            Nuevo pistero
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => startNew("supervisor")}>
            Nuevo acceso staff
          </button>
        </div>

        <div className="user-admin-groups">
          <div className="stack">
            <div className="list-section-head">
              <strong>Pisteros</strong>
              <span>{employees.length}</span>
            </div>
            {loading ? (
              <EmptyState title="Cargando" body="Consultando personal operativo." />
            ) : employees.length === 0 ? (
              <EmptyState title="Sin pisteros" body="Agrega el primer colaborador." />
            ) : (
              <div className="selectable-list">
                {employees.map((item) => (
                  <button
                    className={cx("selectable-card", selectedId === item.id && "is-active")}
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="selectable-card-copy">
                      <strong>{item.full_name}</strong>
                      <span>@{item.username}</span>
                    </div>
                    <div className="selectable-card-meta">
                      <span className="meta-chip">Turno {item.default_turno || "-"}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="stack">
            <div className="list-section-head">
              <strong>Supervision y admin</strong>
              <span>{staff.length}</span>
            </div>
            {loading ? (
              <EmptyState title="Cargando" body="Consultando accesos administrativos." />
            ) : staff.length === 0 ? (
              <EmptyState title="Sin staff" body="Crea un supervisor o administrador." />
            ) : (
              <div className="selectable-list">
                {staff.map((item) => (
                  <button
                    className={cx("selectable-card", selectedId === item.id && "is-active")}
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="selectable-card-copy">
                      <strong>{item.full_name}</strong>
                      <span>@{item.username}</span>
                    </div>
                    <div className="selectable-card-meta">
                      <span className="meta-chip">{ROLE_LABELS[item.role] || item.role}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        eyebrow="Editor"
        title={selectedUser ? selectedUser.full_name : draft.role === "employee" ? "Nuevo pistero" : "Nuevo acceso staff"}
        subtitle={selectedUser ? `Edita ${ROLE_LABELS[selectedUser.role] || selectedUser.role}` : "Crea un usuario con su rol y credenciales."}
        accent="#ff9f1a"
      >
        <div className="form-stack">
          <SelectField
            label="Rol"
            value={draft.role}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                role: value,
                password: value === "employee" ? "" : current.password,
                pin: value === "employee" ? current.pin : "",
              }))
            }
          >
            <option value="employee">Pistero</option>
            {STAFF_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Nombre completo"
            value={draft.full_name}
            onChange={(value) => setDraft((current) => ({ ...current, full_name: value }))}
            placeholder="Nombre de la persona"
          />

          <TextField
            label="Usuario"
            hint="Si lo dejas vacio se genera automaticamente."
            value={draft.username}
            onChange={(value) => setDraft((current) => ({ ...current, username: value }))}
            placeholder="usuario"
          />

          {draft.role === "employee" ? (
            <>
              <TextField
                label={selectedUser ? "Nueva clave del colaborador" : "Clave del colaborador"}
                hint={selectedUser ? "Deja vacio para conservar la actual." : "Esta clave reemplaza el PIN numerico."}
                type="password"
                value={draft.pin}
                onChange={(value) => setDraft((current) => ({ ...current, pin: value }))}
                placeholder="Clave segura"
              />
              <div className="context-card">
                <span>Turno asignado</span>
                <strong>{selectedUser?.default_turno || "Automatico al guardar"}</strong>
                <small>Cuando quitas a alguien, los turnos activos se reordenan solos para tapar huecos.</small>
              </div>
            </>
          ) : (
            <>
              <TextField
                label={selectedUser ? "Nueva contrasena" : "Contrasena"}
                hint={selectedUser ? "Deja vacio para conservar la actual." : "Necesaria para entrar al panel staff."}
                type="password"
                value={draft.password}
                onChange={(value) => setDraft((current) => ({ ...current, password: value }))}
                placeholder="Contrasena segura"
              />
              <div className="context-card">
                <span>Acceso de respaldo</span>
                <strong>Resuelto desde servidor</strong>
                <small>Existe una via de recuperacion admin por variables de entorno para no depender de una sola persona.</small>
              </div>
            </>
          )}

          <div className="form-submit-row">
            <button className="btn btn-primary" type="button" onClick={save} disabled={saving || removing}>
              {saving ? "Guardando..." : selectedUser ? "Guardar usuario" : "Crear usuario"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => startNew(draft.role)} disabled={saving || removing}>
              Limpiar
            </button>
            {selectedUser ? (
              <button className="btn btn-ghost-danger" type="button" onClick={remove} disabled={saving || removing}>
                {removing ? "Quitando..." : "Quitar usuario"}
              </button>
            ) : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ─── Tienda ─────────────────────────────────────────── */

const TIENDA_RESUMEN_FIELDS = [
  { key: "mercaderia_contado", label: "Mercaderia contado" },
  { key: "abonos_cxc_transferencia", label: "Abonos CxC (trans/sinpe/tarj)" },
  { key: "abonos_cxc_efectivo", label: "Abonos CxC efectivo" },
  { key: "mercaderia_credito", label: "Mercaderia a credito" },
  { key: "mercaderia_credito_roco", label: "Merca credito Roco" },
  { key: "mercaderia_credito_ltj", label: "Merca credito LTJ" },
  { key: "mercaderia_credito_jema", label: "Merca credito JEMA" },
  { key: "t_nelson", label: "T. Nelson" },
  { key: "iva_nelson", label: "IVA Nelson" },
  { key: "v_finca", label: "V. Finca" },
];

const TIENDA_DETALLE_FIELDS = [
  { key: "transf_sinpe_bcr", label: "Transf. y SINPE BCR" },
  { key: "transferencias_bn_bac", label: "Transferencias BN y BAC" },
  { key: "sinpe", label: "SINPE" },
  { key: "tarjeta_bac", label: "Tarjeta BAC" },
  { key: "tarjeta_bn", label: "Tarjeta BN (datafono oficina)" },
  { key: "tarjeta_bcr", label: "Tarjeta BCR" },
  { key: "credito_detalle", label: "Credito" },
  { key: "mercaderia_emilio", label: "Mercaderia Emilio" },
  { key: "vales_tienda", label: "Vales tienda" },
  { key: "salidas_efectivo", label: "Salidas de efectivo" },
  { key: "nota_credito", label: "Nota de credito" },
  { key: "deposito", label: "Deposito" },
];

function emptyTiendaForm() {
  const form = { fecha: new Date().toISOString().slice(0, 10), litros_finca: "", observaciones: "" };
  for (const f of TIENDA_RESUMEN_FIELDS) form[f.key] = "";
  for (const f of TIENDA_DETALLE_FIELDS) form[f.key] = "";
  return form;
}

function summarizeTienda(form) {
  let totalResumen = 0;
  let totalDetalle = 0;
  for (const f of TIENDA_RESUMEN_FIELDS) totalResumen += parseAmount(form[f.key]);
  for (const f of TIENDA_DETALLE_FIELDS) totalDetalle += parseAmount(form[f.key]);
  return { totalResumen, totalDetalle, diferencia: totalResumen - totalDetalle };
}

function CierreTiendaForm({ form, setForm, onSave, editing, saving }) {
  const summary = useMemo(() => summarizeTienda(form), [form]);
  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave(form);
  };

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <FormSection index="01" title="Datos generales" accent="#13315c">
        <div className="field-grid-3">
          <FieldShell label="Fecha">
            <input className="field-input" type="date" value={form.fecha} onChange={(e) => setField("fecha", e.target.value)} />
          </FieldShell>
        </div>
      </FormSection>

      <FormSection index="02" title="Resumen de ingresos" accent="#0f9d76">
        <div className="tienda-field-grid">
          {TIENDA_RESUMEN_FIELDS.map((f) => (
            <MoneyField key={f.key} label={f.label} value={form[f.key]} onChange={(v) => setField(f.key, v)} />
          ))}
        </div>
        <div className="field-grid-3" style={{ marginTop: 10 }}>
          <TextField label="Litros Finca" value={form.litros_finca || ""} onChange={(v) => setField("litros_finca", v)} placeholder="Cantidad de litros" />
        </div>
        <div className="inline-total">
          <span>Total resumen</span>
          <strong>CRC {money(summary.totalResumen)}</strong>
        </div>
      </FormSection>

      <FormSection index="03" title="Detalle" accent="#ff9f1a">
        <div className="tienda-field-grid">
          {TIENDA_DETALLE_FIELDS.map((f) => (
            <MoneyField key={f.key} label={f.label} value={form[f.key]} onChange={(v) => setField(f.key, v)} />
          ))}
        </div>
        <div className="inline-total">
          <span>Total detalle</span>
          <strong>CRC {money(summary.totalDetalle)}</strong>
        </div>
      </FormSection>

      <FormSection index="04" title="Observaciones" accent="#6c63ff">
        <TextAreaField label="Comentarios" value={form.observaciones || ""} onChange={(v) => setField("observaciones", v)} placeholder="Observaciones del cierre" />
      </FormSection>

      <div className="tienda-summary-bar">
        <div className="tienda-summary-item">
          <span>Total resumen</span>
          <strong>CRC {money(summary.totalResumen)}</strong>
        </div>
        <div className="tienda-summary-item">
          <span>Total detalle</span>
          <strong>CRC {money(summary.totalDetalle)}</strong>
        </div>
        <div className={cx("tienda-summary-item", summary.diferencia !== 0 && "tienda-diff-warning")}>
          <span>Diferencia</span>
          <strong>CRC {money(summary.diferencia)}</strong>
        </div>
      </div>

      <div className="form-submit-row">
        <button className="btn btn-ghost" type="button" onClick={() => setForm(emptyTiendaForm())} disabled={saving}>
          Limpiar
        </button>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Guardando..." : editing ? "Guardar cambios" : "Guardar cierre"}
        </button>
      </div>
    </form>
  );
}

function TiendaDashboard({ token, user, onLogout, isDark, onToggleTheme }) {
  const [cierres, setCierres] = useState([]);
  const [draft, setDraft] = useState(() => emptyTiendaForm());
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api("/api/cierres", {}, token);
      setCierres(data);
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const startNew = () => {
    setEditing(null);
    setDraft(emptyTiendaForm());
    setMessage(null);
  };

  const startEdit = (cierre) => {
    setEditing(cierre);
    const payload = cierre.reportado_json || {};
    setDraft({ ...emptyTiendaForm(), ...payload });
    setMessage(null);
  };

  const save = async (payload) => {
    if (!payload.fecha) {
      setMessage({ tone: "error", text: "Selecciona una fecha." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (editing?.id) {
        await api(`/api/cierres/tienda/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) }, token);
        setMessage({ tone: "success", text: "El cierre de tienda se actualizo correctamente." });
      } else {
        await api("/api/cierres/tienda", { method: "POST", body: JSON.stringify(payload) }, token);
        setMessage({ tone: "success", text: "El cierre de tienda se guardo correctamente." });
      }
      setEditing(null);
      setDraft(emptyTiendaForm());
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => summarizeTienda(draft), [draft]);

  return (
    <AppShell
      user={user}
      title="Cierre de tienda"
      onLogout={onLogout}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
    >
      <div className="metric-grid">
        <MetricCard label="Cierres" value={cierres.length} caption="Tu historial" accent="#13315c" />
        <MetricCard label="Resumen" value={`CRC ${money(summary.totalResumen)}`} caption="Ingresos" accent="#0f9d76" />
        <MetricCard label="Detalle" value={`CRC ${money(summary.totalDetalle)}`} caption="Desglose" accent="#ff9f1a" />
        <MetricCard label="Diferencia" value={`CRC ${money(summary.diferencia)}`} caption={summary.diferencia === 0 ? "Cuadra" : "Revisar"} accent={summary.diferencia === 0 ? "#0f9d76" : "#d94b4b"} />
      </div>

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <div className="dashboard-grid">
        <div className="stack">
          <Panel
            eyebrow="Formulario"
            title={editing ? "Editar cierre" : "Nuevo cierre de tienda"}
            subtitle="Registro diario."
            accent="#ff9f1a"
            action={
              <button className="btn btn-secondary" type="button" onClick={startNew} disabled={saving}>
                {editing ? "Cancelar edicion" : "Nuevo cierre"}
              </button>
            }
          >
            <CierreTiendaForm
              form={draft}
              setForm={setDraft}
              onSave={save}
              editing={Boolean(editing)}
              saving={saving}
            />
          </Panel>
        </div>

        <div className="stack">
          <Panel eyebrow="Resumen" title="Cierre actual" accent="#0f766e" className="sticky-panel">
            <div className="tienda-summary-board">
              <div className="summary-list">
                <div className="summary-section-title">Resumen de ingresos</div>
                {TIENDA_RESUMEN_FIELDS.map((f) => (
                  <div key={f.key} className="summary-row">
                    <span>{f.label}</span>
                    <strong className="summary-row-value">CRC {money(parseAmount(draft[f.key]))}</strong>
                  </div>
                ))}
                {draft.litros_finca ? (
                  <div className="summary-row">
                    <span>Litros Finca</span>
                    <strong className="summary-row-value">{draft.litros_finca}</strong>
                  </div>
                ) : null}
                <div className="summary-total">
                  <span>Total resumen</span>
                  <strong>CRC {money(summary.totalResumen)}</strong>
                </div>
                <div className="summary-section-title" style={{ marginTop: 12 }}>Detalle</div>
                {TIENDA_DETALLE_FIELDS.map((f) => (
                  <div key={f.key} className="summary-row">
                    <span>{f.label}</span>
                    <strong className="summary-row-value">CRC {money(parseAmount(draft[f.key]))}</strong>
                  </div>
                ))}
                <div className="summary-total">
                  <span>Total detalle</span>
                  <strong>CRC {money(summary.totalDetalle)}</strong>
                </div>
              </div>
              <div className={cx("tienda-diferencia", summary.diferencia !== 0 && "tienda-diff-warning")}>
                <span>Diferencia</span>
                <strong>CRC {money(summary.diferencia)}</strong>
              </div>
            </div>
          </Panel>

          <Panel
            eyebrow="Historial"
            title="Mis cierres"
            accent="#13315c"
            action={<button className="btn btn-ghost" type="button" onClick={load}>Actualizar</button>}
          >
            {loading ? (
              <HistorySkeleton />
            ) : cierres.length === 0 ? (
              <EmptyState title="Sin cierres" body="Aun no hay registros." />
            ) : (
              <div className="history-list">
                {cierres.map((cierre) => {
                  const resumen = cierre.resumen_reportado || {};
                  return (
                    <div className="history-card" key={cierre.id}>
                      <div className="history-card-main">
                        <div className="history-card-top">
                          <strong>{formatDateLabel(cierre.fecha)}</strong>
                          <StatusPill status={cierre.status} />
                        </div>
                        <span className="history-total">CRC {money(resumen.total_resumen || resumen.total_reportado)}</span>
                        {resumen.diferencia ? (
                          <span className={resumen.diferencia === 0 ? "edit-time-badge" : "edit-time-expired"}>
                            Dif: CRC {money(resumen.diferencia)}
                          </span>
                        ) : null}
                      </div>
                      <button className="btn btn-secondary" type="button" onClick={() => startEdit(cierre)}>Editar</button>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function StaffDashboard({ token, user, onLogout, isDark, onToggleTheme }) {
  const [tab, setTab] = useState("review");
  const [employees, setEmployees] = useState([]);
  const canAccessGaspro = user.role === "admin";
  const canAccessAdmin = user.role === "admin";

  const loadEmployees = async () => {
    try {
      const data = await api("/api/users?role=employee", {}, token);
      setEmployees(data);
    } catch {
      setEmployees([]);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [token]);

  const currentViewLabel =
    tab === "review" ? "Cierres" : tab === "gaspro" ? "Gaspro" : "Personal";

  return (
    <AppShell
      user={user}
      title={user.role === "admin" ? "Centro de control" : "Panel de supervision"}
      subtitle=""
      onLogout={onLogout}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
    >
      <div className="metric-grid">
        <MetricCard label="Equipo" value={employees.length} caption="Empleados activos" accent="#13315c" />
        <MetricCard label="Vista" value={currentViewLabel} caption="Panel actual" accent="#ff9f1a" />
        <MetricCard label="Rol" value={user.role} caption="Sesion actual" accent="#0f766e" />
      </div>

      <div className="segmented-control segmented-control-inline">
        <button className={cx("segmented-button", tab === "review" && "is-active")} type="button" onClick={() => setTab("review")}>
          Revision
        </button>
        {canAccessGaspro ? (
          <button className={cx("segmented-button", tab === "gaspro" && "is-active")} type="button" onClick={() => setTab("gaspro")}>
            Gaspro
          </button>
        ) : null}
        {canAccessAdmin ? (
          <button className={cx("segmented-button", tab === "admin" && "is-active")} type="button" onClick={() => setTab("admin")}>
            Personal
          </button>
        ) : null}
      </div>

      {tab === "review" ? <ReviewPanel token={token} user={user} employees={employees} /> : null}
      {tab === "gaspro" ? <GasproPanel token={token} /> : null}
      {tab === "admin" ? <UserAdminPanel token={token} onRosterChange={loadEmployees} /> : null}
    </AppShell>
  );
}

export default function App() {
  const session = useSession();
  const theme = useTheme();

  const logout = async () => {
    if (session.token) {
      try {
        await api("/api/auth/logout", { method: "POST" }, session.token);
      } catch {
        // If the session already expired we still clear the local state.
      }
    }

    session.clear();
  };

  if (!session.token || !session.user) {
    return <LoginScreen onLogin={session.save} isDark={theme.isDark} onToggleTheme={theme.toggleTheme} />;
  }

  const dashboardProps = {
    token: session.token,
    user: session.user,
    onLogout: logout,
    isDark: theme.isDark,
    onToggleTheme: theme.toggleTheme,
  };

  if (session.user.role === "tienda") {
    return <TiendaDashboard {...dashboardProps} />;
  }
  if (session.user.role === "employee") {
    return <EmployeeDashboard {...dashboardProps} />;
  }
  return <StaffDashboard {...dashboardProps} />;
}
