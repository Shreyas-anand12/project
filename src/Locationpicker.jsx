import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Free OpenStreetMap geocoder, forced to English results. No API key
// needed, but it's rate-limited — fine for development/low traffic, but
// for production traffic proxy this through your own backend, or switch
// to a paid geocoder (Mapbox, Google, etc).
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0&accept-language=en`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}

function createPinIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="leaflet-pick-marker"><span class="pick-marker-dot"></span></div>`,
    iconSize: [20, 26],
    iconAnchor: [10, 24]
  });
}

// Distinct "you are here" dot — kept separate from the report pin, so if
// the reporter taps the map to adjust the exact spot, they can still see
// where they actually are relative to it.
function createLiveDotIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="leaflet-user-marker"><span class="user-marker-pulse"></span><span class="user-marker-dot"></span></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

// Lets the reporter click/tap anywhere on the mini map to drop the pin at
// that exact spot, for when live location isn't precise enough (e.g.
// reporting on behalf of somewhere else nearby).
function ClickToPick({ onPick }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    }
  });
  return null;
}

// Keeps the mini map centered on whatever coordinates are currently chosen
// (from live location or a map click), without fighting the user while
// they're panning around manually.
function RecenterOnChange({ lat, lng }) {
  const map = useMap();
  const lastCenter = useRef(null);

  useEffect(() => {
    if (lat == null || lng == null) return;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (lastCenter.current === key) return;
    lastCenter.current = key;
    map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [lat, lng, map]);

  return null;
}

// NOTE: there is deliberately no free-text address field here. Letting
// reporters type an arbitrary address made it trivial to phone in a fake
// emergency at a location nobody could verify. Instead the location can
// only come from the device's live GPS position or from tapping an exact
// point on the map — both give real, checkable coordinates.
export default function LocationPicker({ value, lat, lng, mapCenter, onChange }) {
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState(null);
  const [liveLocation, setLiveLocation] = useState(null);
  const triedAutoLocate = useRef(false);

  async function handleMapPick(pickedLat, pickedLng) {
    onChange({ lat: pickedLat, lng: pickedLng, location: "Locating address..." });
    const address = await reverseGeocode(pickedLat, pickedLng);
    onChange({
      location: address || `${pickedLat.toFixed(5)}, ${pickedLng.toFixed(5)}`,
      lat: pickedLat,
      lng: pickedLng
    });
  }

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setLocateError("Geolocation isn't available in this browser.");
      return;
    }

    setIsLocating(true);
    setLocateError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLiveLocation({ lat: latitude, lng: longitude });
        const address = await reverseGeocode(latitude, longitude);
        const label = address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        setIsLocating(false);
        onChange({ location: label, lat: latitude, lng: longitude });
      },
      (err) => {
        setIsLocating(false);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — allow it in your browser's site settings."
            : err.code === err.TIMEOUT
            ? "Location request timed out. Try again, or open the app in its own browser tab."
            : "Couldn't get your current location."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Pre-fill with the reporter's live location the first time this picker
  // mounts (i.e. when the report modal opens).
  useEffect(() => {
    if (!triedAutoLocate.current && lat == null && lng == null) {
      triedAutoLocate.current = true;
      useCurrentLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pinPosition = lat != null && lng != null ? [lat, lng] : null;
  const defaultCenter = pinPosition || mapCenter;

  return (
    <div className="location-picker">
      <div className="location-picker-input-row">
        <div className="location-display" title={value || ""}>
          {value || "No location set yet — use your live location or tap the map"}
        </div>
        <button
          type="button"
          className="use-location-button"
          onClick={useCurrentLocation}
          disabled={isLocating}
        >
          {isLocating ? "Locating…" : "Use my location"}
        </button>
      </div>

      {locateError && <div className="location-hint is-error">{locateError}</div>}

      <div className="location-picker-map">
        <MapContainer
          center={defaultCenter}
          zoom={pinPosition ? 15 : 12}
          scrollWheelZoom={false}
          className="location-picker-map-container"
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {pinPosition && <Marker position={pinPosition} icon={createPinIcon()} />}
          {liveLocation && (
            <Marker
              position={[liveLocation.lat, liveLocation.lng]}
              icon={createLiveDotIcon()}
              zIndexOffset={-100}
            />
          )}
          <ClickToPick onPick={handleMapPick} />
          <RecenterOnChange lat={lat} lng={lng} />
        </MapContainer>
        <div className="location-picker-map-hint">Tap the map to adjust the exact spot</div>
      </div>
    </div>
  );
}