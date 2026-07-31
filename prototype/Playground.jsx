/**
 * Original single-file prototype, preserved for reference.
 *
 * It is NOT the shipped implementation and is excluded from lint/build:
 *  - its XML path uses `DOMParser`, which is browser-only; the real
 *    `fhir-xml` parser uses `fast-xml-parser` so the library also runs in Node.
 *  - the real core lives in `packages/fhir-normalize/src`.
 *
 * The `playground/` Next.js app is the port of this file that imports the
 * real package, so the demo can never drift from the library.
 */
import React, { useState, useMemo } from "react";
import { Activity, ArrowRight, AlertTriangle, Check, Copy, Stethoscope } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  fhir-normalize — core (a minimal, real implementation of the       */
/*  architecture from DESIGN.md: FormatParser adapters + registry).    */
/*  This is the same shape the published package would expose.         */
/* ------------------------------------------------------------------ */

function detectFormat(raw) {
  const s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith("<")) return "fhir-xml";
  if (s.startsWith("{") || s.startsWith("[")) return "fhir-json";
  return null;
}

function wrapInBundle(resourceOrBundle) {
  if (resourceOrBundle && resourceOrBundle.resourceType === "Bundle") return resourceOrBundle;
  return {
    resourceType: "Bundle",
    type: "collection",
    entry: [{ resource: resourceOrBundle }],
  };
}

const fhirJsonParser = {
  format: "fhir-json",
  canParse(raw) {
    try {
      const o = typeof raw === "string" ? JSON.parse(raw) : raw;
      return !!o && typeof o === "object" && ("resourceType" in o || Array.isArray(o));
    } catch {
      return false;
    }
  },
  parse(raw) {
    const warnings = [];
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") throw new Error("Input is not a JSON object.");
    if (!("resourceType" in obj)) warnings.push('No "resourceType" on root — wrapped as a bare entry.');
    const bundle = wrapInBundle(obj);
    return {
      bundle,
      meta: { sourceFormat: "fhir-json", parsedAt: new Date().toISOString(), warnings },
    };
  },
};

/* XML -> object walker. Simplified: leaf elements read their `value`
   attribute; repeated tags collapse into arrays. Good enough to show
   the concept; fidelity gaps surface as warnings, never as throws.   */
function xmlNodeToValue(el) {
  const kids = Array.from(el.children);
  if (kids.length === 0) {
    const v = el.getAttribute("value");
    if (v !== null) return v;
    const t = (el.textContent || "").trim();
    return t || null;
  }
  const out = {};
  for (const child of kids) {
    const key = child.localName;
    const val = xmlNodeToValue(child);
    if (key in out) {
      if (!Array.isArray(out[key])) out[key] = [out[key]];
      out[key].push(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

const fhirXmlParser = {
  format: "fhir-xml",
  canParse(raw) {
    return String(raw).trim().startsWith("<");
  },
  parse(raw) {
    const warnings = [
      "XML mapping is simplified: values are read as strings and single elements aren't force-arrayed.",
    ];
    const doc = new DOMParser().parseFromString(String(raw), "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) throw new Error("Malformed XML — check tags are balanced and properly closed.");
    const root = doc.documentElement;
    if (!root) throw new Error("No root element found in XML.");
    const resource = { resourceType: root.localName, ...xmlNodeToValue(root) };
    return {
      bundle: wrapInBundle(resource),
      meta: { sourceFormat: "fhir-xml", parsedAt: new Date().toISOString(), warnings },
    };
  },
};

class Normalizer {
  constructor() {
    this.parsers = [];
  }
  register(p) {
    this.parsers.push(p);
    return this;
  }
  parse(raw, format) {
    const parser = format
      ? this.parsers.find((p) => p.format === format)
      : this.parsers.find((p) => p.canParse(raw));
    if (!parser) {
      const e = new Error(
        format ? `No parser registered for "${format}".` : "Could not auto-detect the input format."
      );
      e.name = "UnsupportedFormatError";
      throw e;
    }
    return parser.parse(raw);
  }
}

const normalizer = new Normalizer().register(fhirJsonParser).register(fhirXmlParser);

/* ------------------------------------------------------------------ */
/*  "Simplified view" — pull human-readable facts out of the           */
/*  canonical resources, the payoff of having one standard shape.      */
/* ------------------------------------------------------------------ */

function humanName(name) {
  if (!name) return null;
  const n = Array.isArray(name) ? name[0] : name;
  if (!n) return null;
  const given = Array.isArray(n.given) ? n.given.join(" ") : n.given || "";
  return [given, n.family].filter(Boolean).join(" ").trim() || null;
}

function summarize(resource) {
  if (!resource || typeof resource !== "object") return { type: "Unknown", fields: [] };
  const type = resource.resourceType || "Unknown";
  const f = [];
  const push = (label, value) => value != null && value !== "" && f.push({ label, value: String(value) });

  switch (type) {
    case "Patient":
      push("Name", humanName(resource.name));
      push("Gender", resource.gender);
      push("Born", resource.birthDate);
      push("Contact", resource.telecom?.[0]?.value);
      break;
    case "Observation": {
      const q = resource.valueQuantity;
      push("Measure", resource.code?.text || resource.code?.coding?.[0]?.display);
      push("Value", q ? `${q.value} ${q.unit || ""}`.trim() : resource.valueString);
      push("Status", resource.status);
      push("When", resource.effectiveDateTime);
      push("Subject", resource.subject?.reference);
      break;
    }
    case "Encounter":
      push("Status", resource.status);
      push("Class", resource.class?.code || resource.class?.display);
      push("When", resource.period?.start);
      break;
    case "MedicationRequest":
      push("Medication", resource.medicationCodeableConcept?.text);
      push("Status", resource.status);
      push("Intent", resource.intent);
      break;
    case "Practitioner":
      push("Name", humanName(resource.name));
      push("Qualification", resource.qualification?.[0]?.code?.text);
      break;
    default:
      Object.entries(resource).forEach(([k, v]) => {
        if (k === "resourceType") return;
        if (typeof v === "string" || typeof v === "number") push(k, v);
      });
  }
  push("id", resource.id);
  return { type, fields: f };
}

/* ------------------------------------------------------------------ */
/*  JSON syntax highlighting for the dark "standard shape" console.    */
/* ------------------------------------------------------------------ */

function highlightJson(obj) {
  const json = JSON.stringify(obj, null, 2)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (m) => {
      let cls = "num";
      if (/^"/.test(m)) cls = /:$/.test(m) ? "key" : "str";
      else if (/true|false/.test(m)) cls = "bool";
      else if (/null/.test(m)) cls = "nul";
      return `<span class="tok-${cls}">${m}</span>`;
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Samples                                                            */
/* ------------------------------------------------------------------ */

const SAMPLES = {
  Patient: JSON.stringify(
    {
      resourceType: "Patient",
      id: "example-1",
      name: [{ use: "official", family: "Khan", given: ["Ali"] }],
      gender: "male",
      birthDate: "1996-04-12",
      telecom: [{ system: "email", value: "ali@example.com" }],
    },
    null,
    2
  ),
  Observation: JSON.stringify(
    {
      resourceType: "Observation",
      id: "obs-weight",
      status: "final",
      code: {
        text: "Body Weight",
        coding: [{ system: "http://loinc.org", code: "29463-7", display: "Body Weight" }],
      },
      subject: { reference: "Patient/example-1" },
      effectiveDateTime: "2026-07-20T09:30:00Z",
      valueQuantity: { value: 74.5, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" },
    },
    null,
    2
  ),
  Bundle: JSON.stringify(
    {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "Patient",
            id: "example-1",
            name: [{ family: "Khan", given: ["Ali"] }],
            gender: "male",
            birthDate: "1996-04-12",
          },
        },
        {
          resource: {
            resourceType: "Observation",
            id: "obs-weight",
            status: "final",
            code: { text: "Body Weight" },
            subject: { reference: "Patient/example-1" },
            valueQuantity: { value: 74.5, unit: "kg" },
          },
        },
      ],
    },
    null,
    2
  ),
  "Patient (XML)": `<Patient xmlns="http://hl7.org/fhir">
  <id value="example-xml"/>
  <name>
    <use value="official"/>
    <family value="Ahmed"/>
    <given value="Sara"/>
  </name>
  <gender value="female"/>
  <birthDate value="1991-11-03"/>
</Patient>`,
};

/* ------------------------------------------------------------------ */
/*  UI                                                                 */
/* ------------------------------------------------------------------ */

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace';

const C = {
  bg: "#F5F8F8",
  panel: "#FFFFFF",
  ink: "#0F1E2A",
  soft: "#5C6E78",
  faint: "#8A9AA3",
  line: "#E2EAEB",
  brand: "#0C7C84",
  brandTint: "#E4F1F1",
  warn: "#9A5B0C",
  warnTint: "#FBF0DC",
  console: "#0A1620",
};

function Eyebrow({ children }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.14em", color: C.faint, textTransform: "uppercase" }}>
      {children}
    </span>
  );
}

export default function App() {
  const [input, setInput] = useState(SAMPLES.Patient);
  const [mode, setMode] = useState("auto");
  const [tab, setTab] = useState("standard");
  const [copied, setCopied] = useState(false);

  const detected = useMemo(() => detectFormat(input), [input]);

  const result = useMemo(() => {
    const trimmed = input.trim();
    if (!trimmed) return { state: "empty" };
    try {
      const fmt = mode === "auto" ? undefined : mode;
      const r = normalizer.parse(trimmed, fmt);
      return { state: "ok", ...r };
    } catch (e) {
      return { state: "error", message: e.message, name: e.name };
    }
  }, [input, mode]);

  const resources =
    result.state === "ok" ? (result.bundle.entry || []).map((e) => e.resource).filter(Boolean) : [];

  const copy = () => {
    if (result.state !== "ok") return;
    navigator.clipboard?.writeText(JSON.stringify(result.bundle, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const modeBtn = (val, label) => {
    const active = mode === val;
    return (
      <button
        key={val}
        onClick={() => setMode(val)}
        style={{
          fontFamily: MONO,
          fontSize: 11.5,
          padding: "5px 11px",
          borderRadius: 7,
          border: `1px solid ${active ? C.brand : C.line}`,
          background: active ? C.brand : C.panel,
          color: active ? "#fff" : C.soft,
          cursor: "pointer",
          transition: "all .15s ease",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ background: C.bg, minHeight: "100%", fontFamily: SANS, color: C.ink, padding: "22px 20px 40px" }}>
      <style>{`
        .tok-key{color:#68d5c9}.tok-str{color:#b5d98a}.tok-num{color:#e6ab7c}
        .tok-bool{color:#c79be3}.tok-nul{color:#c79be3}
        .fn-fade{animation:fnfade .28s ease}
        @keyframes fnfade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        .fn-scroll::-webkit-scrollbar{width:9px;height:9px}
        .fn-scroll::-webkit-scrollbar-thumb{background:#26384a;border-radius:6px}
        .fn-scroll-l::-webkit-scrollbar{width:9px;height:9px}
        .fn-scroll-l::-webkit-scrollbar-thumb{background:#cfdadc;border-radius:6px}
        textarea::placeholder{color:#a7b6bd}
        @media (prefers-reduced-motion: reduce){.fn-fade{animation:none}}
      `}</style>

      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div
            style={{
              width: 34, height: 34, borderRadius: 9, background: C.brand,
              display: "grid", placeItems: "center", flexShrink: 0,
            }}
          >
            <Stethoscope size={18} color="#fff" strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" }}>
              fhir-normalize
            </div>
            <div style={{ fontSize: 12.5, color: C.soft, marginTop: 1 }}>
              Paste any supported format — get one standard shape back.
            </div>
          </div>
        </div>

        {/* Pipeline / signature strip */}
        <div
          className="fn-scroll-l"
          style={{
            display: "flex", alignItems: "center", gap: 10, overflowX: "auto",
            padding: "12px 14px", background: C.panel, border: `1px solid ${C.line}`,
            borderRadius: 12, margin: "16px 0 18px",
          }}
        >
          <Stage label="raw input" active />
          <Arrow />
          <Stage
            label="detect"
            active={!!detected}
            badge={detected ? (detected === "fhir-xml" ? "FHIR XML" : "FHIR JSON") : "—"}
          />
          <Arrow />
          <Stage label="normalize" active={result.state === "ok"} icon />
          <Arrow />
          <Stage label="standard shape" active={result.state === "ok"} strong />
        </div>

        {/* Two panes */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }} className="fn-grid">
          <style>{`@media(min-width:900px){.fn-grid{grid-template-columns:1fr 1fr !important}}`}</style>

          {/* INPUT */}
          <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Eyebrow>input · raw</Eyebrow>
              <div style={{ display: "flex", gap: 6 }}>
                {modeBtn("auto", "auto")}
                {modeBtn("fhir-json", "json")}
                {modeBtn("fhir-xml", "xml")}
              </div>
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              placeholder="Paste a FHIR resource, Bundle, or XML document…"
              className="fn-scroll-l"
              style={{
                width: "100%", minHeight: 340, resize: "vertical", border: "none", outline: "none",
                padding: "14px 16px", fontFamily: MONO, fontSize: 12.5, lineHeight: 1.65,
                color: C.ink, background: C.panel, boxSizing: "border-box",
              }}
            />

            <div style={{ padding: "11px 16px", borderTop: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint, marginRight: 2 }}>load:</span>
              {Object.keys(SAMPLES).map((k) => (
                <button
                  key={k}
                  onClick={() => setInput(SAMPLES[k])}
                  style={{
                    fontFamily: MONO, fontSize: 11, padding: "4px 10px", borderRadius: 20,
                    border: `1px solid ${C.line}`, background: C.brandTint, color: C.brand, cursor: "pointer",
                  }}
                >
                  {k}
                </button>
              ))}
              <button
                onClick={() => setInput("")}
                style={{ fontFamily: MONO, fontSize: 11, padding: "4px 10px", borderRadius: 20, border: `1px solid ${C.line}`, background: C.panel, color: C.soft, cursor: "pointer", marginLeft: "auto" }}
              >
                clear
              </button>
            </div>
          </section>

          {/* OUTPUT */}
          <section style={{ background: C.console, border: `1px solid #16232f`, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* meta strip */}
            <div style={{ padding: "13px 16px", borderBottom: "1px solid #16232f", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.14em", color: "#5f7385", textTransform: "uppercase" }}>
                  output · standard
                </span>
                {result.state === "ok" && (
                  <>
                    <Pill>{result.meta.sourceFormat}</Pill>
                    <Pill>{resources.length} resource{resources.length === 1 ? "" : "s"}</Pill>
                  </>
                )}
              </div>
              <button
                onClick={copy}
                disabled={result.state !== "ok"}
                style={{
                  display: "flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 11,
                  padding: "5px 9px", borderRadius: 7, border: "1px solid #21323f",
                  background: "transparent", color: result.state === "ok" ? "#9fb2bf" : "#3f505d",
                  cursor: result.state === "ok" ? "pointer" : "default",
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "copied" : "copy"}
              </button>
            </div>

            {/* tabs */}
            <div style={{ display: "flex", gap: 2, padding: "0 10px", borderBottom: "1px solid #16232f" }}>
              {[
                ["standard", "Standard shape"],
                ["extracted", "Extracted"],
                ["warnings", `Warnings${result.state === "ok" && result.meta.warnings.length ? ` (${result.meta.warnings.length})` : ""}`],
              ].map(([id, label]) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    style={{
                      fontFamily: MONO, fontSize: 11.5, padding: "10px 12px", background: "transparent",
                      border: "none", borderBottom: `2px solid ${active ? C.brand : "transparent"}`,
                      color: active ? "#dfe9ee" : "#6c8090",
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* body */}
            <div className="fn-scroll" style={{ flex: 1, overflow: "auto", minHeight: 300, maxHeight: 460 }}>
              {result.state === "empty" && (
                <Empty />
              )}

              {result.state === "error" && (
                <div style={{ padding: 20 }}>
                  <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "#2a1a10", border: "1px solid #4a2f18", borderRadius: 10, padding: "13px 14px" }}>
                    <AlertTriangle size={16} color="#e6ab7c" style={{ marginTop: 1, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: "#e6ab7c", marginBottom: 3 }}>
                        {result.name || "ParseError"}
                      </div>
                      <div style={{ fontSize: 12.5, color: "#c8b6a6", lineHeight: 1.5 }}>{result.message}</div>
                    </div>
                  </div>
                </div>
              )}

              {result.state === "ok" && tab === "standard" && (
                <pre
                  key={input + mode}
                  className="fn-fade"
                  style={{ margin: 0, padding: "16px 18px", fontFamily: MONO, fontSize: 12, lineHeight: 1.65, color: "#8aa0ad" }}
                  dangerouslySetInnerHTML={{ __html: highlightJson(result.bundle) }}
                />
              )}

              {result.state === "ok" && tab === "extracted" && (
                <div className="fn-fade" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  {resources.map((r, i) => {
                    const s = summarize(r);
                    return (
                      <div key={i} style={{ background: "#0f2029", border: "1px solid #1c2f3b", borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ padding: "9px 13px", borderBottom: "1px solid #1c2f3b", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 6, background: C.brand }} />
                          <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#dfe9ee", fontWeight: 600 }}>{s.type}</span>
                        </div>
                        <div style={{ padding: "6px 13px 11px" }}>
                          {s.fields.length === 0 && (
                            <div style={{ fontSize: 12, color: "#6c8090", padding: "6px 0" }}>No summarizable fields.</div>
                          )}
                          {s.fields.map((f, j) => (
                            <div key={j} style={{ display: "flex", gap: 12, padding: "5px 0", borderBottom: j < s.fields.length - 1 ? "1px solid #16262f" : "none" }}>
                              <span style={{ fontFamily: MONO, fontSize: 11, color: "#6c8090", minWidth: 92, flexShrink: 0 }}>{f.label}</span>
                              <span style={{ fontFamily: MONO, fontSize: 12, color: "#cddbe2", wordBreak: "break-word" }}>{f.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {result.state === "ok" && tab === "warnings" && (
                <div className="fn-fade" style={{ padding: 16 }}>
                  {result.meta.warnings.length === 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#7fae9b", fontFamily: MONO, fontSize: 12.5 }}>
                      <Check size={15} /> Clean parse — no warnings.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                      {result.meta.warnings.map((w, i) => (
                        <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "#2a1a10", border: "1px solid #3d2814", borderRadius: 9, padding: "11px 12px" }}>
                          <AlertTriangle size={14} color="#e6ab7c" style={{ marginTop: 1, flexShrink: 0 }} />
                          <span style={{ fontSize: 12.5, color: "#d3c2b2", lineHeight: 1.5 }}>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        <div style={{ marginTop: 16, textAlign: "center", fontFamily: MONO, fontSize: 10.5, color: C.faint }}>
          canonical target · FHIR R4 &nbsp;·&nbsp; adapters registered: fhir-json, fhir-xml
        </div>
      </div>
    </div>
  );
}

function Stage({ label, badge, active, strong, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
      {icon && <Activity size={13} color={active ? C.brand : C.faint} />}
      <span
        style={{
          fontFamily: MONO, fontSize: 11, letterSpacing: "0.02em",
          color: active ? (strong ? C.brand : C.ink) : C.faint,
          fontWeight: strong ? 600 : 500,
        }}
      >
        {label}
      </span>
      {badge && (
        <span
          style={{
            fontFamily: MONO, fontSize: 10, padding: "2px 7px", borderRadius: 5,
            background: badge === "—" ? "transparent" : C.brandTint,
            color: badge === "—" ? C.faint : C.brand,
            border: `1px solid ${badge === "—" ? C.line : "transparent"}`,
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function Arrow() {
  return <ArrowRight size={14} color="#c2cfd2" style={{ flexShrink: 0 }} />;
}

function Pill({ children }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: 10.5, padding: "2px 8px", borderRadius: 5, background: "#13232f", color: "#7fa0b0", border: "1px solid #1e3341" }}>
      {children}
    </span>
  );
}

function Empty() {
  return (
    <div style={{ padding: "40px 24px", textAlign: "center", color: "#5f7484" }}>
      <div style={{ display: "inline-grid", placeItems: "center", width: 46, height: 46, borderRadius: 12, background: "#0f2029", border: "1px solid #1c2f3b", marginBottom: 14 }}>
        <Activity size={20} color="#3f6b73" />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: "#8aa0ad" }}>Nothing to normalize yet</div>
      <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.55 }}>
        Paste a FHIR resource on the left, or load a sample to watch it become the standard shape.
      </div>
    </div>
  );
}
