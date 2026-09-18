import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Free OpenStreetMap geocoder. No API key needed, but it's rate-limited and
// browsers can't send a custom User-Agent header (Nominatim's usage policy
// asks for one) — fine for development/low traffic, but for production
// traffic you'd want to proxy these calls through your own backend with a
// proper User-Agent, or switch to a paid geocoder (Mapbox, Google, etc).
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

async function searchPlaces(query, biasCenter) {
  const params = new URLSearchParams({
    format: "json",
    q: query,
    limit: "5",
    addressdetails: "0"
  });

  if (biasCenter) {
    const [lat, lng] = biasCenter;
    const delta = 0.4;
    params.set("viewbox", `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`);
  }

  try {
    const res = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`
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

// Lets the reporter click/tap anywhere on the mini map to drop the pin at
// that exact spot, for when a searched address isn't precise enough.
function ClickToPick({ onPick }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    }
  });
  return null;
}

// Keeps the mini map centered on whatever coordinates are currently chosen
// (from search, live location, or a map click), without fighting the user
// while they're panning around manually.
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

export default function LocationPicker({ value, lat, lng, mapCenter, onChange }) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState(null);
  const debounceRef = useRef(null);
  const triedAutoLocate = useRef(false);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  function handleQueryChange(text) {
    setQuery(text);
    onChange({ location: text });
    window.clearTimeout(debounceRef.current);

    if (text.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      setIsSearching(true);
      const results = await searchPlaces(text, mapCenter);
      setIsSearching(false);
      setSuggestions(results);
      setShowSuggestions(true);
    }, 400);
  }

  function selectSuggestion(place) {
    const newLat = parseFloat(place.lat);
    const newLng = parseFloat(place.lon);
    setQuery(place.display_name);
    setSuggestions([]);
    setShowSuggestions(false);
    onChange({ location: place.display_name, lat: newLat, lng: newLng });
  }

  async function handleMapPick(pickedLat, pickedLng) {
    onChange({ lat: pickedLat, lng: pickedLng });
    const address = await reverseGeocode(pickedLat, pickedLng);
    if (address) {
      setQuery(address);
      onChange({ location: address, lat: pickedLat, lng: pickedLng });
    }
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
        const address = await reverseGeocode(latitude, longitude);
        const label = address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        setIsLocating(false);
        setQuery(label);
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
  // mounts (i.e. when the report modal opens), so it defaults to "here"
  // rather than requiring an extra click every time.
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
        <input
          type="text"
          placeholder="Search for a place or address..."
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
        />
        <button
          type="button"
          className="use-location-button"
          onClick={useCurrentLocation}
          disabled={isLocating}
        >
          {isLocating ? "Locating…" : "Use my location"}
        </button>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <ul className="location-suggestions">
          {suggestions.map((place) => (
            <li key={place.place_id}>
              <button type="button" onMouseDown={() => selectSuggestion(place)}>
                {place.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {isSearching && <div className="location-hint">Searching…</div>}
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
          <ClickToPick onPick={handleMapPick} />
          <RecenterOnChange lat={lat} lng={lng} />
        </MapContainer>
        <div className="location-picker-map-hint">Click the map to pinpoint the exact spot</div>
      </div>
    </div>
  );
}