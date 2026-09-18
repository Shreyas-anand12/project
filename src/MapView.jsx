import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const SEVERITY_COLOR = {
  critical: "#ef4444",
  urgent: "#f59e0b",
  watch: "#3b82f6"
};

// Leaflet needs actual DOM/CSS for markers rather than an emoji or default
// pin, so we build a small pulsing dot per incident using a divIcon. This
// avoids the classic "broken marker image" issue with bundlers like Vite.
function createMarkerIcon(severity, isSelected) {
  const color = SEVERITY_COLOR[severity] || "#64748b";
  return L.divIcon({
    className: "",
    html: `
      <div class="leaflet-incident-marker ${isSelected ? "is-selected" : ""}" style="--marker-color:${color}">
        <span class="marker-pulse"></span>
        <span class="marker-dot"></span>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

// Distinct icon for the viewer's own live position, so it never gets
// confused with an incident pin.
function createUserIcon() {
  return L.divIcon({
    className: "",
    html: `
      <div class="leaflet-user-marker">
        <span class="user-marker-pulse"></span>
        <span class="user-marker-dot"></span>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

// Recenters/pans the map whenever the selected incident changes, so picking
// an incident in the list (or a new "simulated emergency") flies the map to
// it automatically.
function FlyToSelected({ incident }) {
  const map = useMap();

  useEffect(() => {
    if (!incident) return;
    map.flyTo([incident.lat, incident.lng], Math.max(map.getZoom(), 14), {
      duration: 0.6
    });
  }, [incident, map]);

  return null;
}

// Watches the browser's geolocation and returns the latest fix, plus a
// status so the UI can show "locating..." instead of just hanging with no
// feedback (which is what silently failing looks like to a user).
function useLiveLocation(enabled) {
  const [position, setPosition] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | locating | active | error
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setPosition(null);
      setError(null);
      return;
    }

    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Geolocation isn't available in this browser/environment.");
      return;
    }

    setStatus("locating");

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus("active");
        setError(null);
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      (err) => {
        setStatus("error");
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location permission denied. Allow it in your browser's site settings, then try again.");
        } else if (err.code === err.TIMEOUT) {
          setError("Location request timed out. This often happens inside an embedded preview — open the app in its own browser tab and try again.");
        } else {
          setError("Your location is currently unavailable.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  return { position, status, error };
}

export default function MapView({
  incidents,
  selectedIncident,
  onSelectIncident,
  center,
  showUserLocation = false,
  onLocationStatusChange
}) {
  const active = incidents.find((incident) => incident.id === selectedIncident);
  const { position: userPosition, status: locationStatus, error: locationError } =
    useLiveLocation(showUserLocation);

  useEffect(() => {
    if (onLocationStatusChange) onLocationStatusChange(locationStatus, locationError);
  }, [locationStatus, locationError, onLocationStatusChange]);

  return (
    <MapContainer
      center={center}
      zoom={13}
      scrollWheelZoom
      className="live-map-container"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {incidents.map((incident) => (
        <Marker
          key={incident.id}
          position={[incident.lat, incident.lng]}
          icon={createMarkerIcon(incident.severity, incident.id === selectedIncident)}
          eventHandlers={{
            click: () => onSelectIncident(incident.id)
          }}
        >
          <Popup>
            <strong>{incident.type}</strong>
            <br />
            {incident.location}
            <br />
            <span style={{ textTransform: "capitalize" }}>{incident.severity}</span>{" "}
            · {incident.status}
          </Popup>
        </Marker>
      ))}

      {userPosition && (
        <>
          <Marker
            position={[userPosition.lat, userPosition.lng]}
            icon={createUserIcon()}
            zIndexOffset={1000}
          >
            <Popup>You are here</Popup>
          </Marker>
          <Circle
            center={[userPosition.lat, userPosition.lng]}
            radius={userPosition.accuracy}
            pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.08, weight: 1 }}
          />
        </>
      )}

      <FlyToSelected incident={active} />
    </MapContainer>
  );
}

/*
  HOOKING UP TRUE SERVER-PUSH REAL-TIME
  --------------------------------------
  Right now the map re-renders live whenever `incidents` state changes in
  App.jsx (e.g. from the "Simulate emergency" form). To pull updates from a
  backend instead of local state, poll or subscribe in App.jsx and call
  setIncidents() with the fresh list — MapView will pick it up automatically
  since it just renders whatever `incidents` it's given.

  Polling example:
    useEffect(() => {
      const id = setInterval(async () => {
        const res = await fetch("/api/incidents");
        setIncidents(await res.json());
      }, 5000);
      return () => clearInterval(id);
    }, []);

  WebSocket example:
    useEffect(() => {
      const ws = new WebSocket("wss://your-server/incidents");
      ws.onmessage = (event) => setIncidents(JSON.parse(event.data));
      return () => ws.close();
    }, []);
*/