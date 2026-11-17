import React, { useEffect, useState, useRef } from "react";
import { supabase } from "./supabase.js";

const SEVERITY_COLOR = {
  critical: "#ef4444",
  urgent: "#f97316",
  watch: "#3b82f6",
  info: "#22c55e",
};

const SEVERITY_ORDER = { critical: 0, urgent: 1, watch: 2, info: 3 };

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function PublicMap() {
  const [incidents, setIncidents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markersRef = useRef({});

  /* ── Load Leaflet dynamically (already bundled by react-leaflet) ── */
  useEffect(() => {
    let L;
    let map;
    let sub;

    async function init() {
      // Dynamically import leaflet so this file doesn't break SSR/tree-shaking
      L = (await import("leaflet")).default;
      // Fix default icon paths broken by Vite
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (mapRef.current && !leafletMapRef.current) {
        map = L.map(mapRef.current, { zoomControl: true }).setView([12.9716, 77.5946], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);
        leafletMapRef.current = map;
      }

      // Fetch initial incidents
      const { data } = await supabase
        .from("incidents")
        .select("*")
        .order("created_at", { ascending: false });
      const list = (data || []).filter((i) => i.lat && i.lng);
      setIncidents(list);
      setLoading(false);
      renderMarkers(L, map, list);

      // Realtime subscription
      sub = supabase
        .channel("public-map-incidents")
        .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, (payload) => {
          setIncidents((prev) => {
            let next;
            if (payload.eventType === "INSERT") {
              next = [payload.new, ...prev];
            } else if (payload.eventType === "UPDATE") {
              next = prev.map((i) => (i.id === payload.new.id ? payload.new : i));
            } else {
              next = prev.filter((i) => i.id !== payload.old?.id);
            }
            renderMarkers(L, leafletMapRef.current, next.filter((i) => i.lat && i.lng));
            return next;
          });
        })
        .subscribe();
    }

    function renderMarkers(L, map, list) {
      if (!L || !map) return;
      // Remove old markers not in list
      const ids = new Set(list.map((i) => i.id));
      Object.keys(markersRef.current).forEach((id) => {
        if (!ids.has(id)) {
          markersRef.current[id].remove();
          delete markersRef.current[id];
        }
      });
      list.forEach((inc) => {
        const color = SEVERITY_COLOR[inc.severity] || "#64748b";
        const html = `<div style="
          width:18px;height:18px;border-radius:50%;
          background:${color};border:2.5px solid #fff;
          box-shadow:0 0 0 2px ${color}55;
          cursor:pointer;
        "></div>`;
        if (markersRef.current[inc.id]) {
          // update position if changed
          markersRef.current[inc.id].setLatLng([inc.lat, inc.lng]);
        } else {
          const marker = L.marker([inc.lat, inc.lng], {
            icon: L.divIcon({ html, className: "", iconSize: [18, 18], iconAnchor: [9, 9] }),
          })
            .addTo(map)
            .on("click", () => setSelected(inc));
          markersRef.current[inc.id] = marker;
        }
      });
    }

    init();

    return () => {
      if (sub) supabase.removeChannel(sub);
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  const sorted = [...incidents].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );

  function flyTo(inc) {
    setSelected(inc);
    if (leafletMapRef.current && inc.lat && inc.lng) {
      leafletMapRef.current.flyTo([inc.lat, inc.lng], 15, { duration: 1 });
    }
  }

  return (
    <div className="pub-map-root">
      {/* Header */}
      <header className="pub-map-header">
        <div className="pub-map-brand">
          <span className="pub-map-logo">🆘</span>
          <span className="pub-map-title">RescueGrid</span>
          <span className="pub-map-badge">LIVE MAP</span>
        </div>
        <div className="pub-map-actions">
          <a href="/report" className="pub-map-report-btn">+ Report Emergency</a>
        </div>
      </header>

      {/* Stats bar */}
      <div className="pub-map-stats">
        {["critical", "urgent", "watch"].map((s) => {
          const count = incidents.filter((i) => i.severity === s).length;
          return (
            <div key={s} className="pub-map-stat" style={{ borderColor: SEVERITY_COLOR[s] }}>
              <span className="pub-map-stat-count" style={{ color: SEVERITY_COLOR[s] }}>{count}</span>
              <span className="pub-map-stat-label">{s.charAt(0).toUpperCase() + s.slice(1)}</span>
            </div>
          );
        })}
        <div className="pub-map-stat" style={{ borderColor: "#64748b" }}>
          <span className="pub-map-stat-count">{incidents.length}</span>
          <span className="pub-map-stat-label">Total</span>
        </div>
      </div>

      <div className="pub-map-body">
        {/* Map */}
        <div className="pub-map-map-wrap">
          {loading && <div className="pub-map-loading">Loading map…</div>}
          <div ref={mapRef} className="pub-map-leaflet" />
          {selected && (
            <div className="pub-map-popup">
              <button className="pub-map-popup-close" onClick={() => setSelected(null)}>✕</button>
              <div className="pub-map-popup-sev" style={{ background: SEVERITY_COLOR[selected.severity] || "#64748b" }}>
                {selected.severity?.toUpperCase()}
              </div>
              <div className="pub-map-popup-id">{selected.id}</div>
              <div className="pub-map-popup-type">{selected.type}</div>
              <div className="pub-map-popup-loc">📍 {selected.location}</div>
              {selected.detail && <div className="pub-map-popup-detail">{selected.detail}</div>}
              <div className="pub-map-popup-status">Status: <b>{selected.status}</b></div>
              {selected.eta && <div className="pub-map-popup-eta">ETA: {selected.eta}</div>}
              {selected.is_submitted && (
                <a href={`/track/${selected.id}`} className="pub-map-popup-track">
                  Track this report →
                </a>
              )}
            </div>
          )}
        </div>

        {/* Sidebar list */}
        <div className="pub-map-sidebar">
          <div className="pub-map-sidebar-title">Active Incidents</div>
          {loading ? (
            <div className="pub-map-sidebar-loading">Fetching…</div>
          ) : sorted.length === 0 ? (
            <div className="pub-map-sidebar-empty">No active incidents</div>
          ) : (
            sorted.map((inc) => (
              <div
                key={inc.id}
                className={`pub-map-inc-row${selected?.id === inc.id ? " active" : ""}`}
                onClick={() => flyTo(inc)}
              >
                <div
                  className="pub-map-inc-dot"
                  style={{ background: SEVERITY_COLOR[inc.severity] || "#64748b" }}
                />
                <div className="pub-map-inc-info">
                  <div className="pub-map-inc-type">{inc.type}</div>
                  <div className="pub-map-inc-loc">{inc.location}</div>
                  <div className="pub-map-inc-meta">
                    <span>{inc.id}</span>
                    <span>{timeAgo(inc.created_at)}</span>
                  </div>
                </div>
                <div
                  className="pub-map-inc-sev"
                  style={{ color: SEVERITY_COLOR[inc.severity] || "#64748b" }}
                >
                  {inc.severity}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <footer className="pub-map-footer">
        <span>Data updates in real time · For emergencies call <b>112</b></span>
        <a href="/report" className="pub-map-footer-link">Submit a report</a>
      </footer>
    </div>
  );
}