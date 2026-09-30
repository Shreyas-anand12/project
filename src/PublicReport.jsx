import React, { useState, useRef } from "react";
import { supabase } from "./supabase.js";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

async function analyzeWithGemini({ description, location, peopleAffected, photoBase64 }) {
  if (!GEMINI_API_KEY) return { verdict: "real", confidence: null, reason: "AI check skipped." };
  const parts = [];
  if (photoBase64) {
    const base64Data = photoBase64.split(",")[1] || photoBase64;
    parts.push({ inline_data: { mime_type: "image/jpeg", data: base64Data } });
  }
  parts.push({
    text: `You are a 911 dispatch AI. Analyze this emergency report.
Description: "${description}"
Location: "${location}"
People affected: ${peopleAffected}
${photoBase64 ? "Photo attached." : "No photo."}
Respond ONLY with JSON: {"verdict":"real"or"prank","confidence":0-100,"reason":"one sentence"}`
  });
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }] }) }
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(text.trim());
    return { verdict: parsed.verdict === "prank" ? "prank" : "real", confidence: parsed.confidence ?? null, reason: parsed.reason ?? "" };
  } catch {
    return { verdict: "real", confidence: null, reason: "AI check failed." };
  }
}

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
  const [form, setForm] = useState({ description: "", location: "", peopleAffected: "1", photo: null, photoName: null, lat: null, lng: null });
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [reportId, setReportId] = useState("");
  const [aiVerdict, setAiVerdict] = useState(null);
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
    if (!form.description.trim()) { setSubmitError("Please describe the emergency."); return; }
    if (!form.location.trim()) { setSubmitError("Please provide a location."); return; }

    setStep(2);
    setSubmitError("");

    // Run AI analysis
    const analysis = await analyzeWithGemini({
      description: form.description,
      location: form.location,
      peopleAffected: form.peopleAffected,
      photoBase64: form.photo
    });
    setAiVerdict(analysis);

    const { type, category, icon } = classifyType(form.description);
    const severity = parseInt(form.peopleAffected) >= 5 ? "critical" : parseInt(form.peopleAffected) >= 2 ? "urgent" : "watch";
    const id = `RG-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();

    const incident = {
      id,
      type,
      category,
      location: form.location,
      detail: form.description,
      distance: form.lat ? "Pinpointed" : "Approx. location",
      severity,
      status: analysis.verdict === "prank" ? "⚠️ Verify — possible prank" : "Pending dispatch",
      eta: "--:--",
      units: "Unassigned",
      lat: form.lat || 12.9716,
      lng: form.lng || 77.5946,
      icon,
      photo_url: form.photo || null,
      ai_verdict: analysis.verdict,
      ai_confidence: analysis.confidence,
      ai_reason: analysis.reason,
      is_potential_prank: analysis.verdict === "prank",
      is_submitted: true,
      created_at: now
    };

    const dispatch = {
      id: `D-${Date.now().toString().slice(-6)}`,
      call: type,
      area: form.location,
      asset: "Unassigned",
      lead: "Unassigned",
      priority: analysis.verdict === "prank" ? "⚠️ Verify" : severity === "critical" ? "Priority 1" : "Priority 2",
      status: analysis.verdict === "prank" ? "Flagged" : "Reported",
      time: "--:--",
      incident_id: id,
      created_at: now
    };

    const activityItem = {
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      title: analysis.verdict === "prank" ? `⚠️ Flagged report: ${type}` : `New public report: ${type}`,
      detail: `${form.location} · ${form.peopleAffected} affected`,
      icon,
      tone: analysis.verdict === "prank" ? "red" : severity === "critical" ? "red" : "orange",
      created_at: now
    };

    try {
      await Promise.all([
        supabase.from("incidents").insert(incident),
        supabase.from("dispatch_queue").insert(dispatch),
        supabase.from("activity").insert(activityItem)
      ]);
      setReportId(id);
      setStep(3);
    } catch (err) {
      console.error(err);
      setSubmitError("Failed to submit. Please call 911 directly.");
      setStep(4);
    }
  }

  // ── Step 3: Success screen
  if (step === 3) return (
    <div className="public-report-wrap">
      <div className="public-success">
        <div className="public-success-icon">✅</div>
        <h2>Report received</h2>
        <p>Emergency services have been notified. Your report ID is <strong>{reportId}</strong>.</p>
        {aiVerdict?.verdict === "prank" && (
          <div className="public-prank-warning">
            ⚠️ Our AI flagged this report for verification. A dispatcher will review it shortly.
          </div>
        )}
        <p className="public-success-note">If this is life-threatening, call <strong>911</strong> immediately.</p>
        <button className="pub-btn-primary" onClick={() => { setStep(1); setForm({ description: "", location: "", peopleAffected: "1", photo: null, photoName: null, lat: null, lng: null }); setAiVerdict(null); }}>
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
        <h2>Analyzing &amp; submitting…</h2>
        <p>AI is verifying your report. This takes a few seconds.</p>
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
          {/* Description */}
          <label className="pub-field">
            <span>What's happening? <em>*</em></span>
            <textarea
              rows={4}
              placeholder="Describe the emergency clearly — fire, injury, accident…"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              required
            />
          </label>

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