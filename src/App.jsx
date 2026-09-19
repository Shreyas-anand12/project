import React, { useMemo, useRef, useState } from "react";
import MapView from "./MapView";
import LocationPicker from "./LocationPicker";
import LanguageSelector from "./LanguageSelector";
import { LanguageProvider, useLanguage } from "./i18n/LanguageContext";
import "./map.css";

const navItems = [
  { key: "navCommandCenter", icon: "grid" },
  { key: "navLiveMap", icon: "map" },
  { key: "navDispatchQueue", icon: "radio" },
  { key: "navResources", icon: "users" },
  { key: "navReports", icon: "archive" }
];

// Placeholder city center — swap for wherever RescueGrid is actually
// deployed. All incident lat/lng below are jittered around this point.
const MAP_CENTER = [12.9716, 77.5946];

const initialIncidents = [
  {
    id: "RG-1048",
    type: "Structure fire",
    category: "Fire",
    location: "Westhaven Market",
    detail: "South entrance, smoke visible from roofline",
    distance: "0.8 mi",
    severity: "critical",
    status: "Awaiting engine",
    eta: "04:12",
    units: "E-14, T-06",
    lat: 12.9762,
    lng: 77.5993,
    icon: "fire"
  },
  {
    id: "RG-1051",
    type: "Cardiac response",
    category: "Medical",
    location: "Northpoint Apartments",
    detail: "Adult patient, third-floor unit",
    distance: "1.4 mi",
    severity: "urgent",
    status: "Medic en route",
    eta: "02:18",
    units: "M-07",
    lat: 12.9850,
    lng: 77.6050,
    icon: "medical"
  },
  {
    id: "RG-1043",
    type: "Vehicle collision",
    category: "Traffic",
    location: "Cedar & 8th Avenue",
    detail: "Two vehicles, possible entrapment",
    distance: "2.1 mi",
    severity: "urgent",
    status: "Scene secured",
    eta: "07:46",
    units: "P-22, M-03",
    lat: 12.9700,
    lng: 77.6100,
    icon: "car"
  },
  {
    id: "RG-1038",
    type: "Gas odor",
    category: "Hazmat",
    location: "Edison Row",
    detail: "Commercial block evacuation in progress",
    distance: "3.0 mi",
    severity: "watch",
    status: "Utility notified",
    eta: "11:30",
    units: "H-02",
    lat: 12.9650,
    lng: 77.6150,
    icon: "alert"
  }
];

const initialDispatchQueue = [
  {
    id: "D-204",
    call: "Cardiac response",
    area: "Northpoint",
    asset: "Medic 07",
    lead: "A. Monroe",
    priority: "Priority 1",
    status: "En route",
    time: "02:18"
  },
  {
    id: "D-203",
    call: "Structure fire",
    area: "Westhaven",
    asset: "Engine 14",
    lead: "S. Patel",
    priority: "Priority 1",
    status: "Dispatching",
    time: "04:12"
  },
  {
    id: "D-201",
    call: "Vehicle collision",
    area: "Cedar District",
    asset: "Patrol 22",
    lead: "J. Ellis",
    priority: "Priority 2",
    status: "On scene",
    time: "07:46"
  },
  {
    id: "D-199",
    call: "Gas odor",
    area: "Edison Row",
    asset: "Hazmat 02",
    lead: "K. Reyes",
    priority: "Priority 2",
    status: "Monitoring",
    time: "11:30"
  }
];

const resources = [
  {
    label: "Engine companies",
    value: "14 / 16",
    percent: 88,
    detail: "2 units offline",
    tone: "orange"
  },
  {
    label: "Medic units",
    value: "9 / 10",
    percent: 90,
    detail: "1 unit restocking",
    tone: "green"
  },
  {
    label: "Patrol vehicles",
    value: "22 / 24",
    percent: 92,
    detail: "Coverage nominal",
    tone: "blue"
  },
  {
    label: "Special operations",
    value: "5 / 6",
    percent: 83,
    detail: "1 hazmat unit active",
    tone: "red"
  }
];

const initialActivity = [
  {
    time: "10:42:18",
    title: "Medic 07 accepted dispatch",
    detail: "Northpoint Apartments",
    icon: "medical",
    tone: "green"
  },
  {
    time: "10:41:56",
    title: "Traffic control requested",
    detail: "Cedar & 8th Avenue",
    icon: "car",
    tone: "blue"
  },
  {
    time: "10:40:13",
    title: "Engine 14 assigned",
    detail: "Westhaven Market",
    icon: "fire",
    tone: "orange"
  },
  {
    time: "10:36:02",
    title: "Weather advisory updated",
    detail: "Visibility reduced in east sector",
    icon: "cloud",
    tone: "slate"
  }
];

// Looks at the free-text description someone types into the simulator and
// guesses a reasonable category/icon for it, so submitted reports slot into
// the same visual language as the seeded incidents.
function classifyReport(description) {
  const text = description.toLowerCase();

  if (/(fire|smoke|blaze|burn)/.test(text)) {
    return { icon: "fire", category: "Fire", type: "Reported fire" };
  }
  if (/(cardiac|medical|injur|hurt|unconscious|bleeding|collapsed)/.test(text)) {
    return { icon: "medical", category: "Medical", type: "Medical emergency" };
  }
  if (/(crash|collision|accident|vehicle|car)/.test(text)) {
    return { icon: "car", category: "Traffic", type: "Vehicle incident" };
  }
  if (/(gas|hazmat|chemical|leak|odor|spill)/.test(text)) {
    return { icon: "alert", category: "Hazmat", type: "Hazard report" };
  }

  return { icon: "alert", category: "General", type: "Reported emergency" };
}

function severityFromPeopleAffected(count) {
  if (count >= 5) return "critical";
  if (count >= 1) return "urgent";
  return "watch";
}

function formatClockTime(date) {
  return date.toLocaleTimeString("en-US", { hour12: false });
}

// Jitters a point a small random distance from the map center so simulated
// reports land somewhere plausible on the live map instead of stacking.
function jitterAroundCenter([lat, lng], spreadKm = 4) {
  const kmPerDegLat = 111;
  const kmPerDegLng = 111 * Math.cos((lat * Math.PI) / 180);
  const dLat = (Math.random() - 0.5) * (spreadKm / kmPerDegLat) * 2;
  const dLng = (Math.random() - 0.5) * (spreadKm / kmPerDegLng) * 2;
  return { lat: lat + dLat, lng: lng + dLng };
}

function Icon({ name, size = 18, stroke = 1.8 }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };

  switch (name) {
    case "grid":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "map":
      return (
        <svg {...props}>
          <path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" />
          <path d="M9 3v15M15 6v15" />
        </svg>
      );
    case "radio":
      return (
        <svg {...props}>
          <path d="M4 8.5a8 8 0 0 1 16 0" />
          <path d="M7 11a5 5 0 0 1 10 0" />
          <circle cx="12" cy="15" r="2.2" />
          <path d="M12 17.2V21M5 21h14" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "archive":
      return (
        <svg {...props}>
          <path d="M4 7h16v13H4z" />
          <path d="M3 4h18v3H3zM9 11h6" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.3a2 2 0 1 1-4 0v-.2A2 2 0 0 0 5.8 18l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A2 2 0 0 0 1.6 12H1.4a2 2 0 1 1 0-4h.2a2 2 0 0 0 1.4-3.4l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A2 2 0 0 0 9.2.4V.2a2 2 0 1 1 4 0v.2A2 2 0 0 0 16.6 4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A2 2 0 0 0 20.8 10h.2a2 2 0 1 1 0 4h-.2a2 2 0 0 0-1.4 1Z" />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
      );
    case "bell":
      return (
        <svg {...props}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
        </svg>
      );
    case "clock":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...props}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    case "arrow-up":
      return (
        <svg {...props}>
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
      );
    case "arrow-down":
      return (
        <svg {...props}>
          <path d="M12 5v14M18 13l-6 6-6-6" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg {...props}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "fire":
      return (
        <svg {...props}>
          <path d="M12.5 21c4.2-.3 7-3.1 7-7 0-3.5-2-6.2-5.5-8.7.2 2.4-.7 4-2.3 4.8.1-3.7-1.8-6.1-4.2-7.8C8 6.8 4.5 9.8 4.5 14c0 3.6 2.8 6.7 8 7Z" />
          <path d="M10.2 16.4c0-1.5.8-2.7 2.2-3.8.8 1 1.4 2 1.4 3.3 0 1.2-.6 2.1-1.8 2.6-1-.3-1.8-1-1.8-2.1Z" />
        </svg>
      );
    case "medical":
      return (
        <svg {...props}>
          <path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case "car":
      return (
        <svg {...props}>
          <path d="m5 17-1 2v2M19 17l1 2v2M4 17h16l-1.5-6h-13L4 17Z" />
          <path d="m7 11 1.5-4h7l1.5 4M7 17h.01M17 17h.01" />
        </svg>
      );
    case "alert":
      return (
        <svg {...props}>
          <path d="m12 3 9 17H3L12 3Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
    case "plus":
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "more":
      return (
        <svg {...props}>
          <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "pulse":
      return (
        <svg {...props}>
          <path d="M3 12h4l2-6 4 12 2-6h6" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 3 20 6v5c0 5-3.3 8.5-8 10-4.7-1.5-8-5-8-10V6l8-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "cloud":
      return (
        <svg {...props}>
          <path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 4.5 4.5 0 0 0 7 18Z" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

/**
 * TiltCard wraps a panel in a lightweight 3D tilt effect that follows the
 * pointer. It only rotates while the pointer is over the card, and resets
 * smoothly on leave, so it never fires on page load or scroll.
 */
// Tilt-on-hover was removed: it fired on any mouse movement inside a panel,
// including over buttons and the interactive map, which felt broken rather
// than nice. TiltCard now just renders a plain panel with the same classes
// (so existing styling/spacing is untouched), with no rotation behavior.
function TiltCard({ as: Tag = "div", className = "", children, ...rest }) {
  return (
    <Tag className={`tilt-card ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

const emptyReportForm = {
  description: "",
  location: "",
  peopleAffected: "1",
  lat: null,
  lng: null,
  photo: null,
  photoName: null
};

function Dashboard() {
  const { language, hasChosenLanguage, setLanguage, t, languages } = useLanguage();
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(!hasChosenLanguage);
  const [activeNav, setActiveNav] = useState("navCommandCenter");
  const [incidents, setIncidents] = useState(initialIncidents);
  const [dispatchQueue, setDispatchQueue] = useState(initialDispatchQueue);
  const [activity, setActivity] = useState(initialActivity);
  const [selectedIncident, setSelectedIncident] = useState("RG-1048");
  const [incidentFilter, setIncidentFilter] = useState("All");
  const [queueSearch, setQueueSearch] = useState("");
  const [acknowledged, setAcknowledged] = useState([]);
  const [notice, setNotice] = useState("");
  const [showUserLocation, setShowUserLocation] = useState(false);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState(emptyReportForm);
  const [reportError, setReportError] = useState("");
  const noticeTimer = useRef(null);
  const nextReportNumber = useRef(1052);

  const activeIncident =
    incidents.find((incident) => incident.id === selectedIncident) ||
    incidents[0];

  const visibleIncidents = useMemo(() => {
    if (incidentFilter === "All") return incidents;
    if (incidentFilter === "Critical") {
      return incidents.filter((incident) => incident.severity === "critical");
    }

    return incidents.filter(
      (incident) => incident.category === incidentFilter
    );
  }, [incidents, incidentFilter]);

  const visibleQueue = useMemo(() => {
    const query = queueSearch.trim().toLowerCase();

    if (!query) return dispatchQueue;

    return dispatchQueue.filter((item) =>
      [item.id, item.call, item.area, item.asset, item.lead, item.status]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [dispatchQueue, queueSearch]);

  function flashNotice(message) {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 3200);
  }

  function toggleUserLocation() {
    setShowUserLocation((current) => {
      const next = !current;
      flashNotice(
        next
          ? "Requesting your location..."
          : "Stopped sharing your location."
      );
      return next;
    });
  }

  function handleLocationStatusChange(status, message) {
    setLocationStatus(status);
    if (status === "error" && message) {
      flashNotice(message);
    }
  }

  function acknowledgeIncident(id) {
    if (!acknowledged.includes(id)) {
      setAcknowledged((current) => [...current, id]);
      flashNotice(`Nice work — ${id} is acknowledged and logged.`);
    }
  }

  function openReportModal() {
    setReportForm(emptyReportForm);
    setReportError("");
    setIsReportOpen(true);
  }

  function closeReportModal() {
    setIsReportOpen(false);
  }

  function updateReportField(field, value) {
    setReportForm((current) => ({ ...current, [field]: value }));
  }

  function updateReportFields(patch) {
    setReportForm((current) => ({ ...current, ...patch }));
  }

  function handlePhotoChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setReportError("Please choose an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateReportFields({ photo: reader.result, photoName: file.name });
    };
    reader.readAsDataURL(file);

    // Allow re-selecting the same file later after removing it.
    event.target.value = "";
  }

  function removePhoto() {
    updateReportFields({ photo: null, photoName: null });
  }

  function submitReport(event) {
    event.preventDefault();

    const description = reportForm.description.trim();
    const location = reportForm.location.trim();
    const peopleAffected = Math.max(
      0,
      parseInt(reportForm.peopleAffected, 10) || 0
    );

    if (!description) {
      setReportError("Add a description so units know what's happening.");
      return;
    }

    if (reportForm.lat == null || reportForm.lng == null) {
      setReportError("Set a location using your live position or by tapping the map — it can't be typed in.");
      return;
    }

    if (!reportForm.photo) {
      setReportError("Attach a photo of the emergency to submit the report.");
      return;
    }

    const number = nextReportNumber.current;
    nextReportNumber.current += 1;

    const id = `RG-${number}`;
    const dispatchId = `D-${number}`;
    const { icon, category, type } = classifyReport(description);
    const severity = severityFromPeopleAffected(peopleAffected);
    const now = new Date();

    // Prefer the exact coordinates from live location / search / map click.
    // Only fall back to a random jitter if the reporter typed a location
    // but never actually picked a point, so the pin stays honest instead of
    // silently landing somewhere unrelated to the text.
    const hasPreciseLocation = reportForm.lat != null && reportForm.lng != null;
    const { lat, lng } = hasPreciseLocation
      ? { lat: reportForm.lat, lng: reportForm.lng }
      : jitterAroundCenter(MAP_CENTER);

    const newIncident = {
      id,
      type,
      category,
      location,
      detail: description,
      distance: hasPreciseLocation ? "Pinpointed" : "Approx. location",
      severity,
      status: "Pending dispatch",
      eta: "--:--",
      units: "Unassigned",
      lat,
      lng,
      icon,
      photoUrl: reportForm.photo || null,
      photoName: reportForm.photoName || null
    };

    const newDispatchItem = {
      id: dispatchId,
      call: type,
      area: location,
      asset: "Unassigned",
      lead: "Unassigned",
      priority: severity === "critical" ? "Priority 1" : "Priority 2",
      status: "Reported",
      time: "--:--"
    };

    const newActivityItem = {
      time: formatClockTime(now),
      title: `New report: ${type}`,
      detail: `${location} · ${peopleAffected} affected`,
      icon,
      tone: severity === "critical" ? "red" : "orange"
    };

    setIncidents((current) => [newIncident, ...current]);
    setDispatchQueue((current) => [newDispatchItem, ...current]);
    setActivity((current) => [newActivityItem, ...current]);
    setSelectedIncident(id);
    setIncidentFilter("All");
    setIsReportOpen(false);
    flashNotice(`${id} submitted and added to the incident queue.`);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <div className="brand-copy">
            <strong>RescueGrid</strong>
            <span>Response operations</span>
          </div>
        </div>

        <div className="sidebar-section-label">Workspace</div>

        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              className={`nav-item ${
                activeNav === item.key ? "is-active" : ""
              }`}
              key={item.key}
              onClick={() => {
                setActiveNav(item.key);
                flashNotice(`You're viewing ${t(item.key).toLowerCase()}.`);
              }}
            >
              <Icon name={item.icon} size={18} />
              <span>{t(item.key)}</span>
              {item.key === "navDispatchQueue" && (
                <span className="nav-count">{dispatchQueue.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="system-card">
          <div className="system-card-top">
            <span className="status-dot" />
            <span>Network status</span>
          </div>
          <strong>All systems nominal</strong>
          <span>Last sync 10:42:18</span>
        </div>

        <button
          className="nav-item sidebar-settings"
          onClick={() => flashNotice("Settings are ready when you are.")}
        >
          <Icon name="settings" size={18} />
          <span>Settings</span>
        </button>

        <div className="operator">
          <div className="operator-avatar">AM</div>
          <div className="operator-copy">
            <strong>Alex Monroe</strong>
            <span>Shift commander</span>
          </div>
          <button
            className="operator-more"
            aria-label="Open operator menu"
            onClick={() => flashNotice("Operator menu opened.")}
          >
            <Icon name="more" size={17} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>RescueGrid</span>
            <Icon name="chevron" size={14} />
            <strong>{t(activeNav)}</strong>
          </div>

          <div className="topbar-actions">
            <label className="search-box">
              <Icon name="search" size={17} />
              <input
                type="search"
                placeholder="Search calls, units..."
                value={queueSearch}
                onChange={(event) => setQueueSearch(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </label>

            <button
              className="icon-button notification-button"
              aria-label="View notifications"
              onClick={() => flashNotice("You have 3 unread notifications.")}
            >
              <Icon name="bell" size={18} />
              <span className="notification-dot" />
            </button>

            <button
              className="date-pill language-pill"
              onClick={() => setIsLanguageModalOpen(true)}
            >
              <Icon name="map" size={16} />
              <span>{languages.find((l) => l.code === language)?.nativeName || "English"}</span>
            </button>

            <div className="date-pill">
              <Icon name="clock" size={16} />
              <span>Sun, Sep 13</span>
            </div>
          </div>
        </header>

        <div className="content-wrap">
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="live-pulse" />
                {t("heroEyebrow")}
              </div>
              <h1>
                {t("heroTitleLine1")}
                <br />
                <em>{t("heroTitleEm")}</em>
              </h1>
              <p>{t("heroDesc")}</p>
            </div>

            <div className="hero-actions">
              <div className="hero-note">
                <Icon name="pulse" size={17} />
                <span>
                  <strong>12.4 min</strong>
                  <small>avg. response time</small>
                </span>
              </div>
              <button
                className="primary-button"
                onClick={() =>
                  flashNotice("Broadcast channel opened for dispatch.")
                }
              >
                {t("broadcastUpdate")}
                <Icon name="arrow-right" size={16} />
              </button>
              <button className="simulate-button" onClick={openReportModal}>
                <Icon name="plus" size={16} />
                {t("simulateEmergency")}
              </button>
            </div>
          </section>

          <section className="metric-grid" aria-label="Operational metrics">
            <TiltCard as="article" className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">{t("metricOperationalUnits")}</span>
                <span className="metric-icon green">
                  <Icon name="shield" size={17} />
                </span>
              </div>
              <div className="metric-value">50</div>
              <div className="metric-bottom">
                <span className="metric-trend positive">
                  <Icon name="arrow-up" size={13} />
                  8.2%
                </span>
                <span>vs. last shift</span>
              </div>
            </TiltCard>

            <TiltCard as="article" className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">{t("metricResponseTime")}</span>
                <span className="metric-icon blue">
                  <Icon name="clock" size={17} />
                </span>
              </div>
              <div className="metric-value">12:24</div>
              <div className="metric-bottom">
                <span className="metric-trend positive">
                  <Icon name="arrow-down" size={13} />
                  1:18
                </span>
                <span>faster today</span>
              </div>
            </TiltCard>

            <TiltCard as="article" className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">{t("metricOpenIncidents")}</span>
                <span className="metric-icon orange">
                  <Icon name="alert" size={17} />
                </span>
              </div>
              <div className="metric-value">18</div>
              <div className="metric-bottom">
                <span className="metric-trend neutral">4 active</span>
                <span>requiring dispatch</span>
              </div>
            </TiltCard>

            <TiltCard as="article" className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">{t("metricCityCoverage")}</span>
                <span className="metric-icon violet">
                  <Icon name="map" size={17} />
                </span>
              </div>
              <div className="metric-value">96.8%</div>
              <div className="metric-bottom">
                <span className="metric-trend positive">
                  <Icon name="arrow-up" size={13} />
                  2.4%
                </span>
                <span>coverage stable</span>
              </div>
            </TiltCard>
          </section>

          <section className="section-heading">
            <div>
              <span className="section-kicker">Situational awareness</span>
              <h2>{t("sectionLivePicture")}</h2>
            </div>
            <button
              className="text-button"
              onClick={() => flashNotice("Full map view selected.")}
            >
              {t("openFullMap")}
              <Icon name="arrow-right" size={15} />
            </button>
          </section>

          <section className="operations-grid">
            <TiltCard as="article" className="map-card panel-card">
              <div className="panel-heading">
                <div>
                  <div className="panel-title-row">
                    <span className="live-pulse small" />
                    <span className="panel-overline">City grid / live view</span>
                  </div>
                  <h3>Downtown response zone</h3>
                </div>

                <div className="map-controls">
                  <button className="map-control active">{t("mapLive")}</button>
                  <button
                    className="map-control"
                    onClick={() => flashNotice("Historical playback selected.")}
                  >
                    {t("mapPlayback")}
                  </button>
                  <button
                    className={`map-control ${showUserLocation ? "active" : ""}`}
                    onClick={toggleUserLocation}
                  >
                    {t("mapMyLocation")}
                  </button>
                  {showUserLocation && locationStatus === "locating" && (
                    <span className="location-status-note">Locating…</span>
                  )}
                  {showUserLocation && locationStatus === "error" && (
                    <span className="location-status-note is-error">Location failed</span>
                  )}
                </div>
              </div>

              <div className="map-surface">
                <MapView
                  incidents={incidents}
                  selectedIncident={selectedIncident}
                  onSelectIncident={setSelectedIncident}
                  center={MAP_CENTER}
                  showUserLocation={showUserLocation}
                  onLocationStatusChange={handleLocationStatusChange}
                />

                <div className="map-legend">
                  <span>
                    <i className="legend-dot critical" />
                    {t("legendCritical")}
                  </span>
                  <span>
                    <i className="legend-dot urgent" />
                    {t("legendActive")}
                  </span>
                  <span>
                    <i className="legend-dot watch" />
                    {t("legendMonitoring")}
                  </span>
                </div>
              </div>

              <div className="map-footer">
                <div>
                  <span className="footer-stat-label">Last update</span>
                  <strong>10:42:18</strong>
                </div>
                <div>
                  <span className="footer-stat-label">Tracked assets</span>
                  <strong>50 active</strong>
                </div>
                <div>
                  <span className="footer-stat-label">Map layers</span>
                  <strong>6 visible</strong>
                </div>
              </div>
            </TiltCard>

            <TiltCard as="article" className="incident-card panel-card">
              <div className="panel-heading">
                <div>
                  <span className="panel-overline">{t("priorityQueue")}</span>
                  <h3>{t("activeIncidents")}</h3>
                </div>
                <span className="count-badge">{visibleIncidents.length}</span>
              </div>

              <div className="filter-row">
                {["All", "Critical", "Medical", "Fire"].map((filter) => (
                  <button
                    key={filter}
                    className={`filter-button ${
                      incidentFilter === filter ? "is-active" : ""
                    }`}
                    onClick={() => setIncidentFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <div className="incident-list">
                {visibleIncidents.map((incident) => {
                  const isSelected = incident.id === selectedIncident;
                  const isAcknowledged = acknowledged.includes(incident.id);

                  return (
                    <button
                      key={incident.id}
                      className={`incident-item ${
                        isSelected ? "is-selected" : ""
                      }`}
                      onClick={() => setSelectedIncident(incident.id)}
                    >
                      <span className={`incident-icon ${incident.severity}`}>
                        <Icon name={incident.icon} size={17} />
                      </span>

                      <span className="incident-copy">
                        <span className="incident-title">
                          {incident.type}
                        </span>
                        <span className="incident-location">
                          {incident.location}
                        </span>
                      </span>

                      <span className="incident-meta">
                        <strong>{incident.eta}</strong>
                        <small>
                          {isAcknowledged ? "Acknowledged" : incident.status}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="incident-detail">
                <div className="detail-header">
                  <div>
                    <span className={`severity-label ${activeIncident.severity}`}>
                      {activeIncident.severity === "critical"
                        ? "Critical incident"
                        : activeIncident.severity === "urgent"
                        ? "Active incident"
                        : "Monitoring"}
                    </span>
                    <h4>{activeIncident.type}</h4>
                  </div>
                  <span className="incident-id">{activeIncident.id}</span>
                </div>

                <p>{activeIncident.detail}</p>

                {activeIncident.photoUrl && (
                  <div className="incident-photo">
                    <img src={activeIncident.photoUrl} alt={`Photo evidence for ${activeIncident.id}`} />
                  </div>
                )}

                <div className="detail-location">
                  <span className="location-marker">
                    <Icon name="map" size={15} />
                  </span>
                  <span>{activeIncident.location}</span>
                  <strong>{activeIncident.distance}</strong>
                </div>

                <div className="detail-actions">
                  <button
                    className="secondary-button"
                    onClick={() =>
                      flashNotice(`Dispatch channel opened for ${activeIncident.id}.`)
                    }
                  >
                    {t("viewDispatch")}
                    <Icon name="arrow-right" size={15} />
                  </button>
                  <button
                    className="ack-button"
                    disabled={acknowledged.includes(activeIncident.id)}
                    onClick={() => acknowledgeIncident(activeIncident.id)}
                  >
                    <Icon
                      name={
                        acknowledged.includes(activeIncident.id)
                          ? "check"
                          : "shield"
                      }
                      size={15}
                    />
                    {acknowledged.includes(activeIncident.id)
                      ? t("acknowledged")
                      : t("acknowledge")}
                  </button>
                </div>
              </div>
            </TiltCard>

            <TiltCard as="article" className="dispatch-card panel-card">
              <div className="panel-heading">
                <div>
                  <span className="panel-overline">Current shift</span>
                  <h3>{t("dispatchQueueTitle")}</h3>
                </div>
                <button
                  className="icon-button subtle"
                  aria-label="Add dispatch"
                  onClick={() => flashNotice("New dispatch form opened.")}
                >
                  <Icon name="plus" size={17} />
                </button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Call</th>
                      <th>Area</th>
                      <th>Assigned asset</th>
                      <th>Lead</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>ETA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleQueue.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="call-cell">
                            <span className="call-id">{item.id}</span>
                            <strong>{item.call}</strong>
                          </div>
                        </td>
                        <td>{item.area}</td>
                        <td>
                          <span className="asset-pill">
                            <span className="asset-dot" />
                            {item.asset}
                          </span>
                        </td>
                        <td>{item.lead}</td>
                        <td>
                          <span
                            className={`priority-tag ${
                              item.priority === "Priority 1"
                                ? "priority-one"
                                : "priority-two"
                            }`}
                          >
                            {item.priority}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`status-tag ${item.status
                              .toLowerCase()
                              .replace(" ", "-")}`}
                          >
                            <i />
                            {item.status}
                          </span>
                        </td>
                        <td>
                          <strong className="eta-value">{item.time}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {visibleQueue.length === 0 && (
                  <div className="empty-state">
                    No dispatches match "{queueSearch}".
                  </div>
                )}
              </div>

              <div className="table-footer">
                <span>
                  Showing {visibleQueue.length} of {dispatchQueue.length} active
                  dispatches
                </span>
                <button
                  className="text-button"
                  onClick={() => flashNotice("All dispatches view selected.")}
                >
                  View all
                  <Icon name="arrow-right" size={15} />
                </button>
              </div>
            </TiltCard>

            <TiltCard as="article" className="resource-card panel-card">
              <div className="panel-heading">
                <div>
                  <span className="panel-overline">Availability</span>
                  <h3>{t("resourceReadiness")}</h3>
                </div>
                <button
                  className="text-button compact"
                  onClick={() => flashNotice("Resource roster opened.")}
                >
                  Roster
                  <Icon name="arrow-right" size={14} />
                </button>
              </div>

              <div className="resource-list">
                {resources.map((resource) => (
                  <div className="resource-row" key={resource.label}>
                    <div className="resource-row-top">
                      <span>{resource.label}</span>
                      <strong>{resource.value}</strong>
                    </div>
                    <div className="progress-track">
                      <span
                        className={`progress-fill ${resource.tone}`}
                        style={{ width: `${resource.percent}%` }}
                      />
                    </div>
                    <span className="resource-detail">{resource.detail}</span>
                  </div>
                ))}
              </div>
            </TiltCard>

            <TiltCard as="article" className="activity-card panel-card">
              <div className="panel-heading">
                <div>
                  <span className="panel-overline">System stream</span>
                  <h3>{t("recentActivity")}</h3>
                </div>
                <span className="stream-live">
                  <span className="live-pulse small" />
                  Live
                </span>
              </div>

              <div className="activity-list">
                {activity.map((item) => (
                  <div className="activity-row" key={`${item.time}-${item.title}`}>
                    <span className={`activity-icon ${item.tone}`}>
                      <Icon name={item.icon} size={15} />
                    </span>
                    <div className="activity-copy">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <time>{item.time}</time>
                  </div>
                ))}
              </div>

              <button
                className="activity-footer"
                onClick={() => flashNotice("Activity archive opened.")}
              >
                Open activity archive
                <Icon name="arrow-right" size={14} />
              </button>
            </TiltCard>
          </section>

          <footer className="page-footer">
            <span>RescueGrid Operations Platform</span>
            <span>Secure channel / RG-OPS-01</span>
          </footer>
        </div>

        {notice && (
          <div className="toast" role="status">
            <span className="toast-check">
              <Icon name="check" size={15} />
            </span>
            {notice}
          </div>
        )}

        {isLanguageModalOpen && (
          <LanguageSelector
            languages={languages}
            currentLanguage={language}
            allowClose={hasChosenLanguage}
            onClose={() => setIsLanguageModalOpen(false)}
            onSelect={(code) => {
              setLanguage(code);
              setIsLanguageModalOpen(false);
            }}
          />
        )}

        {isReportOpen && (
          <div
            className="modal-overlay"
            role="presentation"
            onClick={closeReportModal}
          >
            <div
              className="modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-heading">
                <h3 id="report-modal-title">{t("reportModalTitle")}</h3>
                <button
                  className="modal-close"
                  aria-label="Close"
                  onClick={closeReportModal}
                >
                  <Icon name="plus" size={16} />
                </button>
              </div>

              <form className="modal-form" onSubmit={submitReport}>
                <label className="modal-field">
                  <span>{t("fieldDescription")}</span>
                  <textarea
                    rows={3}
                    placeholder="Smoke coming from 4th floor..."
                    value={reportForm.description}
                    onChange={(event) =>
                      updateReportField("description", event.target.value)
                    }
                  />
                </label>

                <label className="modal-field">
                  <span>{t("fieldLocation")} *</span>
                  <LocationPicker
                    value={reportForm.location}
                    lat={reportForm.lat}
                    lng={reportForm.lng}
                    mapCenter={MAP_CENTER}
                    onChange={updateReportFields}
                  />
                  <small className="field-note">
                    Location can't be typed — it's set from your live position or by tapping the map, to keep reports verifiable.
                  </small>
                </label>

                <div className="modal-field">
                  <span>{t("fieldPhoto")} *</span>
                  {reportForm.photo ? (
                    <div className="photo-preview">
                      <img src={reportForm.photo} alt="Disaster evidence preview" />
                      <div className="photo-preview-meta">
                        <span>{reportForm.photoName}</span>
                        <button type="button" className="photo-remove" onClick={removePhoto}>
                          {t("removePhoto")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="photo-upload-button">
                      <Icon name="plus" size={16} />
                      {t("addPhoto")}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoChange}
                        hidden
                      />
                    </label>
                  )}
                </div>

                <label className="modal-field">
                  <span>{t("fieldPeopleAffected")}</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="6"
                    value={reportForm.peopleAffected}
                    onChange={(event) =>
                      updateReportField("peopleAffected", event.target.value)
                    }
                  />
                </label>

                {reportError && (
                  <p className="modal-error">{reportError}</p>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closeReportModal}
                  >
                    {t("cancel")}
                  </button>
                  <button type="submit" className="primary-button">
                    {t("submitReport")}
                    <Icon name="arrow-right" size={15} />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <Dashboard />
    </LanguageProvider>
  );
}