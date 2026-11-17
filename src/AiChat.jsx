import React, { useState, useRef, useEffect } from "react";

import { askAssistant } from "./ai.js";

export default function AiChat({ incidents, dispatchQueue, activity }) {
  const [open, setOpen]     = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hi! I'm RescueGrid AI. I can help you analyze incidents, suggest dispatch priorities, or answer questions about your shift. What do you need?" }
  ]);
  const [input, setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text }]);
    setLoading(true);

    const context = `
Current active incidents: ${incidents?.slice(0,5).map(i => `${i.id}: ${i.type} at ${i.location} (${i.severity}, ${i.status})`).join("; ")}
Dispatch queue: ${dispatchQueue?.slice(0,5).map(d => `${d.id}: ${d.call} → ${d.asset} (${d.status})`).join("; ")}
Recent activity: ${activity?.slice(0,3).map(a => a.title).join("; ")}
`;

    // The server adds the system prompt and calls Gemini (login required).
    try {
      const reply = await askAssistant(text, context);
      setMessages(m => [...m, { role: "assistant", text: reply }]);
    } catch (err) {
      console.error("AI assistant error:", err);
      setMessages(m => [...m, { role: "assistant", text: err.message || "Connection error — try again." }]);
    }
    setLoading(false);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <>
      {/* Floating button */}
      <button className={`ai-chat-fab ${open ? "is-open" : ""}`} onClick={() => setOpen(o => !o)} aria-label="Open AI assistant">
        {open ? "✕" : "🤖"}
        {!open && <span className="ai-chat-fab-label">AI Assistant</span>}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="ai-chat-panel">
          <div className="ai-chat-header">
            <div>
              <strong>RescueGrid AI</strong>
              <span>Dispatch assistant · Powered by Gemini</span>
            </div>
            <button onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="ai-chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`ai-chat-msg ${m.role}`}>
                {m.role === "assistant" && <span className="ai-chat-avatar">🤖</span>}
                <div className="ai-chat-bubble">{m.text}</div>
              </div>
            ))}
            {loading && (
              <div className="ai-chat-msg assistant">
                <span className="ai-chat-avatar">🤖</span>
                <div className="ai-chat-bubble ai-chat-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="ai-chat-input-row">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about incidents, priorities, protocols…"
              rows={2}
              disabled={loading}
            />
            <button onClick={send} disabled={loading || !input.trim()} className="ai-chat-send">
              ➤
            </button>
          </div>

          <div className="ai-chat-suggestions">
            {["Prioritize current incidents", "Which units are available?", "Explain AI prank detection"].map(s => (
              <button key={s} onClick={() => { setInput(s); }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}