// Browser-side calls to RescueGrid's server functions.
// The Gemini key lives only on the server (Netlify env var GEMINI_API_KEY).

import { supabase } from "./supabase.js";

const UNVERIFIED = {
  verdict: "unverified",
  confidence: null,
  reason: "AI check unavailable — needs manual review."
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post(name, body, { auth = false, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/.netlify/functions/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(auth ? await authHeader() : {}) },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// Public report flow: the report is already saved. This asks the server to
// check it and write the verdict back. Fire-and-forget — never blocks the user.
export async function analyzeSavedReport(incidentId, peopleAffected) {
  try {
    const { data } = await post("analyze", { incidentId, peopleAffected }, { timeoutMs: 20000 });
    return data?.verdict ? data : UNVERIFIED;
  } catch {
    return UNVERIFIED;
  }
}

// Dispatcher simulator: get a verdict before adding a report (login required).
export async function previewAnalysis({ description, location, peopleAffected, photo }) {
  try {
    const { data } = await post(
      "analyze",
      { description, location, peopleAffected, photo },
      { auth: true }
    );
    return data?.verdict ? data : { ...UNVERIFIED, reason: data?.error || UNVERIFIED.reason };
  } catch {
    return UNVERIFIED;
  }
}