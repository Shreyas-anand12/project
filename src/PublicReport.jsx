import React, { useState, useRef } from "react";
import { supabase } from "./supabase.js";
import { analyzeSavedReport } from "./ai.js";

// Common emergencies shown in the dropdown. Picking one is faster than typing,
// and gives dispatch a type, category and starting urgency straight away.
// The AI then refines the classification on the server.
const COMMON_ISSUES = [
  { value: "fire",     label: "🔥 Fire or smoke",                                type: "Fire",              category: "Fire",     icon: "fire",    severity: "critical" },
  { value: "medical",  label: "🚑 Medical emergency (unconscious, chest pain, breathing)", type: "Medical emergency", category: "Medical", icon: "medical", severity: "critical" },
  { value: "injury",   label: "🩹 Injury or fall",                               type: "Injury",            category: "Medical",  icon: "medical", severity: "urgent" },
  { value: "accident", label: "🚗 Road accident",                                type: "Road accident",     category: "Traffic",  icon: "car",     severity: "urgent" },
  { value: "flood",    label: "🌊 Flooding or waterlogging",                     type: "Flooding",          category: "Natural",  icon: "cloud",   severity: "urgent" },
  { value: "collapse", label: "🌳 Fallen tree or building collapse",             type: "Collapse",          category: "Natural",  icon: "alert",   severity: "urgent" },
  { value: "electric", label: "⚡ Electrical hazard or live wire",               type: "Electrical hazard", category: "Hazmat",   icon: "alert",   severity: "urgent" },
  { value: "gas",      label: "☣️ Gas leak or chemical smell",                   type: "Gas / chemical leak", category: "Hazmat", icon: "alert",   severity: "critical" },
  { value: "crime",    label: "🚨 Violence, threat or crime in progress",        type: "Security threat",   category: "Security", icon: "alert",   severity: "critical" },
  { value: "other",    label: "❓ Something else",                                type: "General emergency", category: "General",  icon: "alert",   severity: "watch" }
];

const SEVERITY_RANK = { critical: 0, urgent: 1, watch: 2 };
const moreUrgent = (a, b) => (SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b);

const EMPTY_FORM = { issue: "", description: "", location: "", peopleAffected: "1", photo: null, photoName: null, lat: null, lng: null };

function classifyType(desc) {
  const t = desc.toLowerCase();
  if (t.includes("fire") || t.includes("smoke") || t.includes("burn")) return { type: "Structure fire", category: "Fire", icon: "fire" };
  if (t.includes("heart") || t.includes("breath") || t.includes("chest") || t.includes("unconscious") || t.includes("medical")) return { type: "Medical emergency", category: "Medical", icon: "medical" };
  if (t.includes("crash") || t.includes("collision") || t.includes("accident") || t.includes("vehicle")) return { type: "Vehicle collision", category: "Traffic", icon: "car" };
  if (t.includes("flood") || t.includes("water")) return { type: "Flooding", category: "Natural", icon: "cloud" };
  if (t.includes("gas") || t.includes("chemical") || t.includes("hazmat")) return { type: "Hazmat / Gas", category: "Hazmat", icon: "alert" };
  if (t.includes("shoot") || t.includes("gun") || t.includes("weapon")) return { type: "Armed threat", category: "Security", icon: "alert" };
  return { type: "General emergency", category: "General", icon: "alert" };
}

export default function PublicReport() {
  const [step, setStep] = useState(1); // 1=form, 2=submitting, 3=done, 4=error
  const [form, setForm] = useState(EMPTY_FORM);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [reportId, setReportId] = useState("");
  const fileRef = useRef(null);

  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, photo: reader.result, photoName: file.name }));
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function getLocation() {
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, lat: pos.coords.latitude, lng: pos.coords.longitude,
          location: f.location || `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` }));
        setLocating(false);
      },
      () => { setLocError("Couldn't get location. Type it manually."); setLocating(false); }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const issue = COMMON_ISSUES.find(i => i.value === form.issue);
    if (!issue) { setSubmitError("Please choose what kind of emergency it is."); return; }
    if (issue.value === "other" && !form.description.trim()) { setSubmitError("Please describe the emergency."); return; }
    if (!form.location.trim()) { setSubmitError("Please provide a location."); return; }

    setStep(2);
    setSubmitError("");

    // "Something else" falls back to keyword guessing on the description.
    const { type, category, icon } = issue.value === "other" ? classifyType(form.description) : issue;
    const fromPeople = parseInt(form.peopleAffected) >= 5 ? "critical" : parseInt(form.peopleAffected) >= 2 ? "urgent" : "watch";
    const severity = moreUrgent(issue.severity, fromPeople);
    // Description is optional for listed issues; fall back to the issue name.
    const detail = form.description.trim() || type;
    // Timestamp + random suffix so two reports in the same millisecond can't clash.
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
    const id = `RG-${Date.now().toString().slice(-6)}${suffix}`;
    const now = new Date().toISOString();

    // Saved straight away with ai_verdict "pending". The AI check runs on the
    // server afterwards, so a slow or failed AI never delays the report.
    const incident = {
      id,
      type,
      category,
      location: form.location,
      detail,
      distance: form.lat ? "Pinpointed" : "Approx. location",
      severity,
      status: "Pending dispatch",
      eta: "--:--",
      units: "Unassigned",
      lat: form.lat || 12.9716,
      lng: form.lng || 77.5946,
      icon,
      photo_url: form.photo || null,
      ai_verdict: "pending",
      ai_confidence: null,
      ai_reason: "AI check in progress…",
      is_potential_prank: false,
      is_submitted: true,
      created_at: now
    };

    const dispatch = {
      id: `D-${Date.now().toString().slice(-6)}${suffix}`,
      call: type,
      area: form.location,
      asset: "Unassigned",
      lead: "Unassigned",
      priority: severity === "critical" ? "Priority 1" : "Priority 2",
      status: "Reported",
      time: "--:--",
      incident_id: id,
      created_at: now
    };

    const activityItem = {
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      title: `New public report: ${type}`,
      detail: `${form.location} · ${form.peopleAffected} affected`,
      icon,
      tone: severity === "critical" ? "red" : "orange",
      created_at: now
    };

    // Supabase returns { error } instead of throwing, so check it explicitly —
    // otherwise a failed save would still show "Report received".
    const { error: incidentError } = await supabase.from("incidents").insert(incident);
    if (incidentError) {
      console.error(incidentError);
      setSubmitError("Failed to submit. Please call 911 directly.");
      setStep(4);
      return;
    }

    const results = await Promise.all([
      supabase.from("dispatch_queue").insert(dispatch),
      supabase.from("activity").insert(activityItem)
    ]);
    results.forEach(r => r.error && console.error(r.error));

    setReportId(id);
    setStep(3);

    // Fire-and-forget: the server checks the saved report and updates it.
    analyzeSavedReport(id, form.peopleAffected);
  }

  // ── Step 3: Success screen
  if (step === 3) return (
    <div className="public-report-wrap">
      <div className="public-success">
        <div className="public-success-icon">✅</div>
        <h2>Report received</h2>
        <p>Emergency services have been notified. Your report ID is <strong>{reportId}</strong>.</p>
        <p className="public-success-note">If this is life-threatening, call <strong>911</strong> immediately.</p>
        <button className="pub-btn-primary" onClick={() => { setStep(1); setForm(EMPTY_FORM); }}>
          Submit another report
        </button>
      </div>
    </div>
  );

  // ── Step 2: Submitting / AI analyzing
  if (step === 2) return (
    <div className="public-report-wrap">
      <div className="public-success">
        <div className="public-spinner" />
        <h2>Submitting…</h2>
        <p>Sending your report to emergency services.</p>
      </div>
    </div>
  );

  // ── Step 4: Error
  if (step === 4) return (
    <div className="public-report-wrap">
      <div className="public-success">
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h2>Submission failed</h2>
        <p>{submitError}</p>
        <p style={{ fontWeight: 700, fontSize: 18 }}>Please call <a href="tel:911">911</a> directly.</p>
        <button className="pub-btn-primary" onClick={() => setStep(1)}>Try again</button>
      </div>
    </div>
  );

  // ── Step 1: Form
  return (
    <div className="public-report-wrap">
      <div className="public-report-card">
        {/* Header */}
        <div className="public-header">
          <div className="public-logo">🚨</div>
          <div>
            <h1>Report an Emergency</h1>
            <p>Submit directly to dispatch — no account needed</p>
          </div>
        </div>

        <div className="public-911-banner">
          If someone's life is in immediate danger — <strong>call 911 now</strong>
        </div>

        <form onSubmit={handleSubmit} className="public-form">
          {/* Emergency type — quick pick */}
          <label className="pub-field">
            <span>What's happening? <em>*</em></span>
            <select
              value={form.issue}
              onChange={e => setForm(f => ({ ...f, issue: e.target.value }))}
              required
            >
              <option value="" disabled>Choose the type of emergency</option>
              {COMMON_ISSUES.map(i => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </label>

          {/* Details — optional unless "Something else" */}
          {form.issue && (
            <label className="pub-field">
              <span>
                {form.issue === "other" ? <>Describe the emergency <em>*</em></> : <>Anything else dispatch should know? <em style={{ color: "#999", fontStyle: "normal" }}>(optional)</em></>}
              </span>
              <textarea
                rows={3}
                placeholder={form.issue === "other"
                  ? "Describe what is happening"
                  : "e.g. 2nd floor, child trapped, smoke from kitchen"}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                required={form.issue === "other"}
              />
            </label>
          )}

          {/* Location */}
          <label className="pub-field">
            <span>Location <em>*</em></span>
            <div className="pub-location-row">
              <input
                type="text"
                placeholder="Street address, landmark, or area"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                required
              />
              <button type="button" className="pub-loc-btn" onClick={getLocation} disabled={locating}>
                {locating ? "…" : "📍 Use my location"}
              </button>
            </div>
            {form.lat && <span className="pub-loc-note">✅ GPS coordinates captured ({form.lat.toFixed(4)}, {form.lng.toFixed(4)})</span>}
            {locError && <span className="pub-loc-error">{locError}</span>}
          </label>

          {/* People affected */}
          <label className="pub-field">
            <span>People affected</span>
            <input
              type="number"
              min="1"
              max="999"
              value={form.peopleAffected}
              onChange={e => setForm(f => ({ ...f, peopleAffected: e.target.value }))}
            />
          </label>

          {/* Photo — optional */}
          <div className="pub-field">
            <span>Photo <em style={{ color: "#999", fontStyle: "normal" }}>(optional but helps AI verification)</em></span>
            {form.photo ? (
              <div className="pub-photo-preview">
                <img src={form.photo} alt="Emergency" />
                <button type="button" className="pub-photo-remove" onClick={() => setForm(f => ({ ...f, photo: null, photoName: null }))}>
                  ✕ Remove
                </button>
              </div>
            ) : (
              <button type="button" className="pub-photo-btn" onClick={() => fileRef.current?.click()}>
                📷 Attach a photo
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhoto} onClick={e => e.target.value = ""} />
          </div>

          {submitError && <div className="pub-error">{submitError}</div>}

          <button type="submit" className="pub-btn-primary pub-btn-submit">
            🚨 Submit emergency report
          </button>

          <p className="pub-disclaimer">
            False reports are a criminal offense. This report is reviewed by AI and human dispatchers.
          </p>
        </form>
      </div>
    </div>
  );
}