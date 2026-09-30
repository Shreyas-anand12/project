import React, { useState } from "react";
import { supabase } from "./supabase.js";

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [mode, setMode]         = useState("login"); // "login" | "signup"

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      let result;
      if (mode === "login") {
        result = await supabase.auth.signInWithPassword({ email, password });
      } else {
        result = await supabase.auth.signUp({ email, password });
      }

      if (result.error) throw result.error;

      if (mode === "signup" && !result.data.session) {
        setError("Check your email to confirm your account, then log in.");
        setMode("login");
      } else {
        onLogin(result.data.session);
      }
    } catch (err) {
      setError(err.message || "Authentication failed.");
    }
    setLoading(false);
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">🚨</div>
        <h1>RescueGrid</h1>
        <p className="login-sub">Dispatcher Operations Platform</p>

        <div className="login-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Sign in</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); }}>Create account</button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-field">
            <span>Email</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="dispatcher@rescuegrid.ops" required autoFocus />
          </label>
          <label className="login-field">
            <span>Password</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Sign in to dispatch" : "Create dispatcher account"}
          </button>
        </form>

        <p className="login-note">
          🔒 Restricted access — authorized dispatchers only.
        </p>

        <div className="login-divider">or</div>

        <a href="/report" target="_blank" className="login-report-btn">
          🚨 Submit a public emergency report
        </a>
      </div>
    </div>
  );
}