import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── Table helpers ────────────────────────────────────────────────────────────

export async function fetchIncidents() {
  const { data, error } = await supabase
    .from("incidents")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { console.error("fetchIncidents:", error); return null; }
  return data;
}

export async function upsertIncident(incident) {
  const { error } = await supabase.from("incidents").upsert(incident);
  if (error) console.error("upsertIncident:", error);
}

export async function fetchDispatchQueue() {
  const { data, error } = await supabase
    .from("dispatch_queue")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { console.error("fetchDispatchQueue:", error); return null; }
  return data;
}

export async function upsertDispatch(item) {
  const { error } = await supabase.from("dispatch_queue").upsert(item);
  if (error) console.error("upsertDispatch:", error);
}

export async function fetchActivity() {
  const { data, error } = await supabase
    .from("activity")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) { console.error("fetchActivity:", error); return null; }
  return data;
}

export async function insertActivity(item) {
  const { error } = await supabase.from("activity").insert(item);
  if (error) console.error("insertActivity:", error);
}

export async function fetchSubmittedCount() {
  const { count, error } = await supabase
    .from("incidents")
    .select("*", { count: "exact", head: true })
    .eq("is_submitted", true);
  if (error) { console.error("fetchSubmittedCount:", error); return 0; }
  return count || 0;
}