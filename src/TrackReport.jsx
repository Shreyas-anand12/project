import React, { useEffect, useState } from "react";
import { supabase } from "./supabase.js";

const STEPS = [
  { key: "submitted",    label: "Report Received",   icon: "📥", desc: "Your emergency report has been received by our system." },
  { key: "acknowledged", label: "Acknowledged",       icon: "👁️", desc: "A dispatcher has reviewed your report." },
  { key: "dispatched",   label: "Units Dispatched",   icon: "🚒", desc: "Emergency units are on their way." },
  { key: "resolved",     label: "Resolved",           icon: "✅", desc: "The incident has been resolved. Thank you." },
];

function getStepIndex(status) {
  if (!status) return 0;
  const s = status.toLowerCase();
  if (s.includes("resolv")) return 3;
  if (s.includes("dispatch") || s.includes("en route") || s.includes("respond")) return 2;
  if (s.includes("acknowledg") || s.includes("review") || s.includes("medic") || s.includes("engine") || s.includes("unit")) return 1;
  return 0;
}

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  return `${Math.floor(diff / 3600)} hours ago`;
}

const SEVERITY_COLOR = {
  critical: "#ef4444",
  urgent: "#f97316",
  watch: "#3b82f6",
  info: "#22c55e",
};

export default function TrackReport() {
  // Extract ID from /track/RG-xxxx
  const pathParts = window.location.pathname.split("/");
  const reportId = pathParts[pathParts.length - 1]?.toUpperCase();

  const [incident, setIncident] = useState(null);
  const [dispatch, setDispatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notifGranted, setNotifGranted] = useState(
    typeof Notification !== "undefined" ? Notification.permission === "granted" : false
  );

  useEffect(() => {
    if (!reportId) { setError("No report ID found in URL."); setLoading(false); return; }

    async function load() {
      const { data: inc, error: e1 } = await supabase
        .from("incidents")
        .select("*")
        .eq("id", reportId)
        .single();

      if (e1 || !inc) {
        setError(`Report "${reportId}" not found. Please check the link.`);
        setLoading(false);
        return;
      }
      setIncident(inc);

      const { data: dq } = await supabase
        .from("dispatch_queue")
        .select("*")
        .eq("incident_id", reportId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (dq && dq.length > 0) setDispatch(dq[0]);

      setLoading(false);
    }

    load();

    // Realtime: watch for status changes
    const sub = supabase
      .channel(`track-${reportId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "incidents", filter: `id=eq.${reportId}` },
        (payload) => {
          setIncident((prev) => {
            const updated = { ...prev, ...payload.new };
            // Fire push notification if status changed to acknowledged
            if (
              prev &&
              notifGranted &&
              payload.new.status !== prev.status &&
              payload.new.status?.toLowerCase().includes("acknowledg")
            ) {
              new Notification("RescueGrid Update 🚨", {
                body: `Your report ${reportId} has been acknowledged by a dispatcher.`,
                icon: "/favicon.ico",
              });
            }
            return updated;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispatch_queue", filter: `incident_id=eq.${reportId}` },
        (payload) => {
          if (payload.new) setDispatch(payload.new);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  async function requestNotifications() {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifGranted(perm === "granted");
  }

  if (loading) {
    return (
      <div className="track-root">
        <div className="track-loading">
          <div className="track-spinner" />
          <p>Looking up your report…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="track-root">
        <div className="track-error-card">
          <div className="track-error-icon">🔍</div>
          <h2>Report Not Found</h2>
          <p>{error}</p>
          <a href="/report" className="track-btn-primary">Submit a new report</a>
          <a href="/map" className="track-btn-secondary">View live map</a>
        </div>
      </div>
    );
  }

  const stepIndex = getStepIndex(incident.status);
  const sevColor = SEVERITY_COLOR[incident.severity] || "#64748b";

  return (
    <div className="track-root">
      <header className="track-header">
        <div className="track-brand">
          <span className="track-logo">🆘</span>
          <span className="track-title">RescueGrid</span>
        </div>
        <a href="/map" className="track-map-link">View Live Map</a>
      </header>

      <div className="track-card">
        {/* Report ID + severity */}
        <div className="track-top">
          <div>
            <div className="track-report-id">{incident.id}</div>
            <div className="track-type">{incident.type}</div>
          </div>
          <div className="track-severity-badge" style={{ background: sevColor }}>
            {incident.severity?.toUpperCase()}
          </div>
        </div>

        {/* Location + time */}
        <div className="track-meta">
          <span>📍 {incident.location}</span>
          <span>🕐 Submitted {timeAgo(incident.created_at)}</span>
        </div>

        {/* AI verdict if present */}
        {incident.ai_verdict && (
          <div className={`track-ai-verdict ${incident.ai_verdict === "PRANK" ? "prank" : "real"}`}>
            <span className="track-ai-icon">{incident.ai_verdict === "PRANK" ? "⚠️" : "✅"}</span>
            <span>
              AI assessment: <b>{incident.ai_verdict}</b>
              {incident.ai_confidence ? ` (${incident.ai_confidence}% confidence)` : ""}
            </span>
          </div>
        )}

        {/* Progress stepper */}
        <div className="track-stepper">
          {STEPS.map((step, i) => {
            const done = i < stepIndex;
            const current = i === stepIndex;
            return (
              <div key={step.key} className="track-step-wrap">
                <div className={`track-step ${done ? "done" : current ? "current" : "pending"}`}>
                  <div className="track-step-circle">
                    {done ? "✓" : current ? <span className="track-step-pulse" /> : i + 1}
                  </div>
                  <div className="track-step-content">
                    <div className="track-step-label">{step.icon} {step.label}</div>
                    {current && <div className="track-step-desc">{step.desc}</div>}
                    {done && <div className="track-step-desc done-text">{step.desc}</div>}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`track-step-line ${done ? "done" : ""}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Current status text */}
        <div className="track-status-box">
          <span className="track-status-label">Current status</span>
          <span className="track-status-value">{incident.status || "Received"}</span>
        </div>

        {/* Dispatch info */}
        {dispatch && (
          <div className="track-dispatch-box">
            <div className="track-dispatch-title">🚒 Dispatch Details</div>
            <div className="track-dispatch-rows">
              {dispatch.asset && <div><b>Unit:</b> {dispatch.asset}</div>}
              {dispatch.lead && <div><b>Lead:</b> {dispatch.lead}</div>}
              {dispatch.area && <div><b>Area:</b> {dispatch.area}</div>}
              {dispatch.time && <div><b>ETA:</b> {dispatch.time}</div>}
              {dispatch.priority && <div><b>Priority:</b> {dispatch.priority}</div>}
            </div>
          </div>
        )}

        {/* Push notification opt-in */}
        {!notifGranted && typeof Notification !== "undefined" && Notification.permission !== "denied" && (
          <button className="track-notif-btn" onClick={requestNotifications}>
            🔔 Get notified when status changes
          </button>
        )}
        {notifGranted && (
          <div className="track-notif-active">🔔 Push notifications enabled for this report</div>
        )}
      </div>

      {/* Photo if uploaded */}
      {incident.photo_url && (
        <div className="track-photo-card">
          <div className="track-photo-title">Submitted Photo</div>
          <img src={incident.photo_url} alt="Incident" className="track-photo-img" />
        </div>
      )}

      <div className="track-links">
        <a href="/map">← View all incidents</a>
        <a href="/report">Submit another report</a>
      </div>

      <footer className="track-footer">
        For life-threatening emergencies call <b>112</b> · Powered by RescueGrid
      </footer>
    </div>
  );
}