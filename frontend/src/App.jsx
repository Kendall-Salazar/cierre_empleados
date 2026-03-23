import { useEffect, useMemo, useState } from "react";
import "./app.css";

const API_URL = "";
const THEME_KEY = "cierre_theme";
const EDITABLE_STATUSES = ["draft", "submitted", "observed"];

const VOUCHER_FIELDS = [
  { keyQty: "bcr_qty", keyAmount: "bcr_monto", label: "BCR", accent: "#ff9f1a" },
  { keyQty: "bac_qty", keyAmount: "bac_monto", label: "BAC", accent: "#0f766e" },
  { keyQty: "bac_flotas_qty", keyAmount: "bac_flotas_monto", label: "BAC flotas", accent: "#2f6fed" },
  { keyQty: "versatec_qty", keyAmount: "versatec_monto", label: "Versatec", accent: "#d94b4b" },
  { keyQty: "fleet_bncr_qty", keyAmount: "fleet_bncr_monto", label: "Fleet BNCR", accent: "#6c63ff" },
  { keyQty: "fleet_dav_qty", keyAmount: "fleet_dav_monto", label: "Fleet DAV", accent: "#0ea5a4" },
  { keyQty: "bncr_qty", keyAmount: "bncr_monto", label: "BNCR", accent: "#475569" },
];

const MOVEMENT_SECTIONS = [
  {
    key: "creditos",
    index: "03",
    title: "Creditos",
    subtitle: "",
    accent: "#6c63ff",
    addLabel: "Agregar credito",
    fields: [
      { key: "descripcion", label: "Detalle", placeholder: "ej. venta a credito", span: 2 },
      { key: "cliente", label: "Cliente", placeholder: "Nombre del cliente" },
      { key: "referencia", label: "Referencia", placeholder: "Factura, placa o nota" },
      { key: "monto_reportado", label: "Monto", kind: "money", span: 2 },
    ],
  },
  {
    key: "sinpes",
    index: "04",
    title: "SINPE movil",
    subtitle: "",
    accent: "#0f9d76",
    addLabel: "Agregar SINPE",
    fields: [
      { key: "descripcion", label: "Detalle", placeholder: "ej. SINPE cliente", span: 2 },
      { key: "cliente", label: "Cliente", placeholder: "Nombre del cliente" },
      { key: "referencia", label: "Comprobante", placeholder: "Numero o referencia" },
      { key: "monto_reportado", label: "Monto", kind: "money", span: 2 },
    ],
  },
  {
    key: "transferencias",
    index: "05",
    title: "Transferencias",
    subtitle: "",
    accent: "#2f6fed",
    addLabel: "Agregar transferencia",
    fields: [
      { key: "descripcion", label: "Detalle", placeholder: "ej. transferencia bancaria", span: 2 },
      { key: "cliente", label: "Cliente", placeholder: "Nombre del cliente" },
      { key: "referencia", label: "Referencia", placeholder: "Banco o comprobante" },
      { key: "monto_reportado", label: "Monto", kind: "money", span: 2 },
    ],
  },
  {
    key: "vales",
    index: "06",
    title: "Vales",
    subtitle: "",
    accent: "#d97706",
    addLabel: "Agregar vale",
    fields: [
      { key: "descripcion", label: "Detalle", placeholder: "ej. combustible interno", span: 2 },
      { key: "cliente", label: "Beneficiario", placeholder: "Persona o cuenta" },
      { key: "referencia", label: "Referencia", placeholder: "Placa, finca o nota" },
      { key: "monto_reportado", label: "Monto", kind: "money", span: 2 },
    ],
  },
  {
    key: "pagos",
    index: "07",
    title: "Pagos realizados",
    subtitle: "",
    accent: "#d94b4b",
    addLabel: "Agregar pago",
    fields: [
      { key: "descripcion", label: "Detalle", placeholder: "ej. pago de proveedor", span: 2 },
      { key: "cliente", label: "A quien", placeholder: "Nombre o empresa" },
      { key: "referencia", label: "Referencia", placeholder: "Motivo o comprobante" },
      { key: "monto_reportado", label: "Monto", kind: "money", span: 2 },
    ],
  },
];

const REVIEW_STATUS_OPTIONS = [
  { value: "document_reviewed", label: "Revisado" },
  { value: "observed", label: "Observado" },
  { value: "approved", label: "Aprobado" },
];

const STATUS_META = {
  draft: { label: "Borrador", tone: "slate" },
  submitted: { label: "Enviado", tone: "amber" },
  observed: { label: "Observado", tone: "rose" },
  document_reviewed: { label: "Revisado", tone: "teal" },
  approved: { label: "Aprobado", tone: "emerald" },
  reconciled: { label: "Conciliado", tone: "indigo" },
};

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

function parseAmount(value) {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = String(value).replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat("es-CR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseAmount(value));
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

function isValidDateValue(value) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function canEditCierre(cierre) {
  if (!EDITABLE_STATUSES.includes(cierre?.status)) return false;
  if (cierre?.document_reviewed_at || cierre?.reconciled_at) return false;
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

function emptyForm(defaultTurno = "1") {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    turno: defaultTurno || "1",
    datafono: "",
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
      bncr_qty: "",
      bncr_monto: "",
    },
    creditos: [],
    sinpes: [],
    transferencias: [],
    deposito: "",
    vales: [],
    pagos: [],
    efectivo: "",
    observaciones: "",
    employee_id: null,
  };
}

function summarizePayload(payload) {
  const vouchers = VOUCHER_FIELDS.reduce(
    (total, voucher) => total + parseAmount(payload?.vouchers?.[voucher.keyAmount]),
    0,
  );
  const sumItems = (items) => (items || []).reduce((acc, item) => acc + parseAmount(item.monto_reportado), 0);

  const totalCreditos = sumItems(payload?.creditos);
  const totalSinpes = sumItems(payload?.sinpes);
  const totalTransferencias = sumItems(payload?.transferencias);
  const totalVales = sumItems(payload?.vales);
  const totalPagos = sumItems(payload?.pagos);
  const deposito = parseAmount(payload?.deposito);
  const efectivo = parseAmount(payload?.efectivo);

  return {
    totalVouchers: vouchers,
    totalCreditos,
    totalSinpes,
    totalTransferencias,
    totalVales,
    totalPagos,
    deposito,
    efectivo,
    totalReportado:
      vouchers +
      totalCreditos +
      totalSinpes +
      totalTransferencias +
      deposito +
      efectivo -
      totalVales -
      totalPagos,
  };
}

function normalizeSummary(summary) {
  if (!summary) return null;
  return {
    totalVouchers: parseAmount(summary.totalVouchers ?? summary.total_vouchers),
    totalCreditos: parseAmount(summary.totalCreditos ?? summary.total_creditos),
    totalSinpes: parseAmount(summary.totalSinpes ?? summary.total_sinpes),
    totalTransferencias: parseAmount(summary.totalTransferencias ?? summary.total_transferencias),
    totalVales: parseAmount(summary.totalVales ?? summary.total_vales),
    totalPagos: parseAmount(summary.totalPagos ?? summary.total_pagos),
    deposito: parseAmount(summary.deposito),
    efectivo: parseAmount(summary.efectivo),
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
  const [token, setToken] = useState(() => localStorage.getItem("cierre_token") || "");
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("cierre_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const save = (nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
    if (nextToken) localStorage.setItem("cierre_token", nextToken);
    else localStorage.removeItem("cierre_token");
    if (nextUser) localStorage.setItem("cierre_user", JSON.stringify(nextUser));
    else localStorage.removeItem("cierre_user");
  };

  return { token, user, save, clear: () => save("", null) };
}

function Banner({ tone = "success", children }) {
  return <div className={cx("banner", `banner-${tone}`)}>{children}</div>;
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || { label: status || "Sin estado", tone: "slate" };
  return <span className={cx("status-pill", `tone-${meta.tone}`)}>{meta.label}</span>;
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
        <span className="money-prefix">CRC</span>
        <input
          className="field-input field-input-plain"
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </div>
    </FieldShell>
  );
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

function TextAreaField({ label, hint, value, onChange, placeholder = "" }) {
  return (
    <FieldShell label={label} hint={hint}>
      <textarea
        className="field-input field-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
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

function SummaryBoard({ payload, summary, compact = false }) {
  const totals = normalizeSummary(summary) || summarizePayload(payload || emptyForm());
  const rows = [
    { label: "Vouchers", value: totals.totalVouchers, tone: "amber" },
    { label: "Creditos", value: totals.totalCreditos, tone: "indigo" },
    { label: "SINPE movil", value: totals.totalSinpes, tone: "emerald" },
    { label: "Transferencias", value: totals.totalTransferencias, tone: "sky" },
    { label: "Deposito", value: totals.deposito, tone: "navy" },
    { label: "Efectivo", value: totals.efectivo, tone: "teal" },
    { label: "Vales", value: totals.totalVales, tone: "rust", negative: true },
    { label: "Pagos", value: totals.totalPagos, tone: "rose", negative: true },
  ];

  return (
    <div className={cx("summary-board", compact && "summary-board-compact")}>
      <div className="summary-list">
        {rows.map((row) => (
          <div key={row.label} className="summary-row">
            <div className="summary-row-copy">
              <span className={cx("summary-dot", `summary-${row.tone}`)} />
              <span>{row.label}</span>
            </div>
            <strong className={cx("summary-row-value", row.negative && row.value > 0 && "summary-negative")}>
              {row.negative && row.value > 0 ? "-" : ""}
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
      <div className="voucher-grid">
        {VOUCHER_FIELDS.map((voucher) => (
          <div className="voucher-card" key={voucher.keyAmount} style={{ "--voucher-accent": voucher.accent }}>
            <div className="voucher-card-head">
              <strong>{voucher.label}</strong>
              <span>Monto y cantidad</span>
            </div>
            <div className="voucher-card-fields">
              <TextField
                label="Cantidad"
                value={vouchers[voucher.keyQty] || ""}
                onChange={(value) => setVoucher(voucher.keyQty, value)}
                placeholder="0"
              />
              <MoneyField
                label="Monto"
                value={vouchers[voucher.keyAmount] || ""}
                onChange={(value) => setVoucher(voucher.keyAmount, value)}
              />
            </div>
          </div>
        ))}
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
    () => (items || []).reduce((acc, item) => acc + parseAmount(item.monto_reportado), 0),
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
      extra={<span className="section-chip">{items.length} registros</span>}
    >
      {items.length === 0 ? (
        <EmptyState
          title={`Sin ${config.title.toLowerCase()}`}
          body="Puedes dejar la seccion vacia o agregar movimientos conforme aparezcan."
        />
      ) : (
        <div className="movement-stack">
          {items.map((item, index) => (
            <div className="movement-card" key={item.id || index}>
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
      )}

      <div className="section-actions">
        <button className="btn btn-secondary" type="button" onClick={addItem}>
          {config.addLabel}
        </button>
        <div className="inline-total inline-total-muted">
          <span>Subtotal</span>
          <strong>CRC {money(subtotal)}</strong>
        </div>
      </div>
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

  const movementGroups = [
    { title: "Creditos", accent: "#6c63ff", items: payload.creditos || [] },
    { title: "SINPE movil", accent: "#0f9d76", items: payload.sinpes || [] },
    { title: "Transferencias", accent: "#2f6fed", items: payload.transferencias || [] },
    { title: "Vales", accent: "#d97706", items: payload.vales || [] },
    { title: "Pagos", accent: "#d94b4b", items: payload.pagos || [] },
  ]
    .map((group) => ({
      ...group,
      items: group.items.map((item, index) => ({
        id: item.id || `${group.title}-${index}`,
        title: item.descripcion || item.cliente || `${group.title} ${index + 1}`,
        meta: [item.cliente, item.referencia].filter(Boolean).join(" / ") || "Sin detalle adicional",
        value: `CRC ${money(item.monto_reportado)}`,
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
        <DetailList title="Vouchers" accent="#ff9f1a" items={vouchers} />
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

function AppShell({ user, title, subtitle, onLogout, isDark, onToggleTheme, children }) {
  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="ambient ambient-c" />

      <div className="shell-frame">
        <header className="shell-topbar">
          <div className="brand-lockup">
            <div className="brand-mark">LM</div>
            <div>
              <div className="brand-kicker">Servicentro La Marina</div>
              <div className="brand-title">Cierre central</div>
            </div>
          </div>

          <div className="shell-copy">
            <div className="eyebrow">{title}</div>
            <h1>{user.full_name}</h1>
            <p>{subtitle}</p>
          </div>

          <div className="shell-actions">
            <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
            <div className="shell-user-card">
              <span className="user-role">{user.role}</span>
              <button className="btn btn-secondary" type="button" onClick={onLogout}>
                Cerrar sesion
              </button>
            </div>
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
  const [username, setUsername] = useState("supervisor");
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
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <ThemeToggle isDark={isDark} onToggle={onToggleTheme} floating />

      <div className="auth-grid">
        <section className="auth-brand">
          <div className="brand-lockup brand-lockup-large">
            <div className="brand-mark">LM</div>
            <div>
              <div className="brand-kicker">Servicentro La Marina</div>
              <div className="brand-title">Cierre central</div>
            </div>
          </div>

          <div className="auth-brand-copy">
            <div className="eyebrow">Acceso rapido</div>
            <h1>Captura clara, moderna y sin ruido.</h1>
            <p>Entra y empieza a trabajar.</p>
          </div>

          <div className="auth-brand-panel">
            <span>Hoy</span>
            <strong>{today}</strong>
            <small>Lista para escritorio y movil.</small>
          </div>
        </section>

        <section className="auth-card">
          <div className="eyebrow">Acceso</div>
          <h2>Entra a tu panel</h2>
          <p>Elige tu acceso y continua.</p>

          <div className="segmented-control">
            <button className={cx("segmented-button", mode === "employee" && "is-active")} type="button" onClick={() => setMode("employee")}>
              Empleado
            </button>
            <button className={cx("segmented-button", mode === "staff" && "is-active")} type="button" onClick={() => setMode("staff")}>
              Supervisor o admin
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "employee" ? (
              <>
                <FieldShell label="PIN" hint="4 digitos">
                  <input
                    className="field-input pin-input"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="0000"
                  />
                </FieldShell>
                <div className="hint-card">Acceso directo al cierre.</div>
              </>
            ) : (
              <>
                <TextField label="Usuario" value={username} onChange={setUsername} placeholder="supervisor" />
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
}) {
  const summary = useMemo(() => summarizePayload(form), [form]);
  const movementCount = useMemo(
    () =>
      ["creditos", "sinpes", "transferencias", "vales", "pagos"].reduce(
        (total, key) => total + (form[key] || []).length,
        0,
      ),
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
      <div className="form-hero">
        <div>
          <div className="eyebrow">{editing ? "Editando" : "Nuevo cierre"}</div>
          <h3>{editing ? "Actualiza y guarda" : "Registra el turno"}</h3>
          <p>Completa, revisa el total y guarda.</p>
        </div>
        <div className="form-hero-card">
          <span>Total reportado</span>
          <strong>CRC {money(summary.totalReportado)}</strong>
          <small>{movementCount} movimientos registrados</small>
        </div>
      </div>

      <FormSection
        index="01"
        title="Contexto del turno"
        accent="#13315c"
      >
        <div className="field-grid field-grid-3">
          <TextField label="Fecha" type="date" value={form.fecha} onChange={(value) => setForm({ ...form, fecha: value })} />
          <TextField label="Turno" value={form.turno} onChange={(value) => setForm({ ...form, turno: value })} placeholder="Numero de turno" />
          <TextField label="Datafono" value={form.datafono} onChange={(value) => setForm({ ...form, datafono: value })} placeholder="Codigo o referencia" />
          <MoneyField label="Efectivo" value={form.efectivo} onChange={(value) => setForm({ ...form, efectivo: value })} />
          <MoneyField label="Deposito" value={form.deposito} onChange={(value) => setForm({ ...form, deposito: value })} />
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
      </FormSection>

      <FormSection
        index="02"
        title="Vouchers y tarjetas"
        accent="#ff9f1a"
      >
        <VoucherGrid vouchers={form.vouchers} setVoucher={setVoucher} />
      </FormSection>

      {MOVEMENT_SECTIONS.map((section) => (
        <MovementListEditor
          key={section.key}
          config={section}
          items={form[section.key] || []}
          setItems={(items) => setForm({ ...form, [section.key]: items })}
        />
      ))}

      <FormSection
        index="08"
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
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Guardando..." : editing ? "Guardar cambios" : "Guardar cierre"}
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
    setDraft(emptyForm(user.default_turno));
    setMessage(null);
  };

  const startEdit = (cierre) => {
    setEditing(cierre);
    setDraft({
      ...emptyForm(user.default_turno),
      ...cierre.reportado_json,
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
          if (cierre.status === "approved") acc.approved += 1;
          if (["draft", "submitted", "observed", "document_reviewed"].includes(cierre.status)) acc.pending += 1;
          return acc;
        },
        { total: 0, approved: 0, pending: 0 },
      ),
    [cierres],
  );

  return (
    <AppShell
      user={user}
      title="Panel de empleado"
      subtitle="Tu cierre y tu historial, en una sola vista."
      onLogout={onLogout}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
    >
      <div className="metric-grid">
        <MetricCard label="Cierres" value={statusCounts.total} caption="Tu historial" accent="#13315c" />
        <MetricCard label="Pendientes" value={statusCounts.pending} caption="Aun abiertos" accent="#ff9f1a" />
        <MetricCard label="Aprobados" value={statusCounts.approved} caption="Listos" accent="#0f9d76" />
        <MetricCard label="En pantalla" value={`CRC ${money(summary.totalReportado)}`} caption={`Turno ${draft.turno || user.default_turno || "-"}`} accent="#2f6fed" />
      </div>

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

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
              <EmptyState title="Cargando" body="Consultando cierres." />
            ) : cierres.length === 0 ? (
              <EmptyState title="Sin cierres" body="Aun no hay registros." />
            ) : (
              <div className="history-list">
                {cierres.map((cierre) => {
                  const canEdit = canEditCierre(cierre);
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

function ReviewPanel({ token }) {
  const [cierres, setCierres] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("document_reviewed");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const filtered = useMemo(
    () =>
      cierres.filter((cierre) => {
        const matchesQuery =
          !query ||
          cierre.empleado?.toLowerCase().includes(query.toLowerCase()) ||
          String(cierre.fecha).includes(query);
        const matchesStatus = statusFilter === "all" || cierre.status === statusFilter;
        return matchesQuery && matchesStatus;
      }),
    [cierres, query, statusFilter],
  );

  useEffect(() => {
    if (!filtered.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((item) => item.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selected = useMemo(() => cierres.find((cierre) => cierre.id === selectedId) || null, [cierres, selectedId]);

  useEffect(() => {
    if (selected) {
      setNotes(selected.audit_notes || "");
      setStatus(
        REVIEW_STATUS_OPTIONS.some((option) => option.value === selected.status) ? selected.status : "document_reviewed",
      );
    }
  }, [selected]);

  const submitReview = async () => {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    try {
      await api(
        `/api/cierres/${selected.id}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            validado_json: selected.validado_json || selected.reportado_json,
            audit_notes: notes,
            status,
          }),
        },
        token,
      );
      setMessage({ tone: "success", text: "La revision se guardo correctamente." });
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-grid">
      <Panel
        eyebrow="Bandeja"
        title="Cierres"
        subtitle="Busca y selecciona."
        accent="#13315c"
      >
        <div className="toolbar-grid">
          <TextField label="Buscar" value={query} onChange={setQuery} placeholder="Empleado o fecha" />
          <SelectField label="Estado" value={statusFilter} onChange={setStatusFilter}>
            <option value="all">Todos los estados</option>
            {Object.entries(STATUS_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </SelectField>
        </div>

        {loading ? (
          <EmptyState title="Cargando" body="Consultando cierres." />
        ) : filtered.length === 0 ? (
          <EmptyState title="Sin coincidencias" body="Ajusta la busqueda." />
        ) : (
          <div className="selectable-list">
            {filtered.map((cierre) => (
              <button
                className={cx("selectable-card", selectedId === cierre.id && "is-active")}
                key={cierre.id}
                type="button"
                onClick={() => setSelectedId(cierre.id)}
              >
                <div className="selectable-card-copy">
                  <strong>{cierre.empleado}</strong>
                  <span>{formatDateLabel(cierre.fecha)} / Turno {cierre.turno || "-"}</span>
                </div>
                <div className="selectable-card-meta">
                  <StatusPill status={cierre.status} />
                  <strong>CRC {money(cierre.resumen_reportado?.total_reportado)}</strong>
                </div>
              </button>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        eyebrow="Detalle"
        title={selected ? selected.empleado : "Selecciona un cierre"}
        subtitle={selected ? `${formatDateLabel(selected.fecha)} / Turno ${selected.turno || "-"}` : "El detalle aparece aqui."}
        accent="#ff9f1a"
      >
        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

        {selected ? (
          <div className="stack">
            <div className="detail-meta-row">
              <StatusPill status={selected.status} />
              <span className="meta-chip">Total reportado: CRC {money(selected.resumen_reportado?.total_reportado)}</span>
              {selected.gaspro_mode ? <span className="meta-chip">Gaspro: {selected.gaspro_mode}</span> : null}
            </div>

            <CierreSnapshot
              payload={selected.reportado_json}
              reportadoSummary={selected.resumen_reportado}
              validadoSummary={selected.resumen_validado}
              auditNotes={selected.audit_notes}
            />

            <div className="review-form-grid">
              <SelectField label="Nuevo estado" value={status} onChange={setStatus}>
                {REVIEW_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>

              <TextAreaField
                label="Notas"
                value={notes}
                onChange={setNotes}
                placeholder="Observaciones del cierre"
              />
            </div>

            <div className="form-submit-row">
              <button className="btn btn-primary" type="button" onClick={submitReview} disabled={saving}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
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
      setMessage({ tone: "success", text: `Importacion ${data.import_id} aplicada a ${data.matched_cierres} cierres.` });
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

function StaffDashboard({ token, user, onLogout, isDark, onToggleTheme }) {
  const [tab, setTab] = useState("review");
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    api("/api/users?role=employee", {}, token)
      .then((data) => setEmployees(data))
      .catch(() => setEmployees([]));
  }, [token]);

  return (
    <AppShell
      user={user}
      title={user.role === "admin" ? "Centro de control" : "Panel de supervision"}
      subtitle="Revision y conciliacion desde un solo lugar."
      onLogout={onLogout}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
    >
      <div className="metric-grid">
        <MetricCard label="Equipo" value={employees.length} caption="Empleados activos" accent="#13315c" />
        <MetricCard label="Vista" value={tab === "review" ? "Cierres" : "Gaspro"} caption="Panel actual" accent="#ff9f1a" />
        <MetricCard label="Rol" value={user.role} caption="Sesion actual" accent="#0f766e" />
      </div>

      <div className="segmented-control segmented-control-inline">
        <button className={cx("segmented-button", tab === "review" && "is-active")} type="button" onClick={() => setTab("review")}>
          Revision
        </button>
        <button className={cx("segmented-button", tab === "gaspro" && "is-active")} type="button" onClick={() => setTab("gaspro")}>
          Gaspro
        </button>
      </div>

      {tab === "review" ? <ReviewPanel token={token} /> : <GasproPanel token={token} />}
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

  return session.user.role === "employee" ? (
    <EmployeeDashboard
      token={session.token}
      user={session.user}
      onLogout={logout}
      isDark={theme.isDark}
      onToggleTheme={theme.toggleTheme}
    />
  ) : (
    <StaffDashboard
      token={session.token}
      user={session.user}
      onLogout={logout}
      isDark={theme.isDark}
      onToggleTheme={theme.toggleTheme}
    />
  );
}
