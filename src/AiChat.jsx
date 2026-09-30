import React, { useState, useRef, useEffect } from "react";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

const SYSTEM_PROMPT = `You are RescueGrid AI, an intelligent assistant for emergency dispatch operations. 
You help dispatchers with:
- Analyzing incidents and suggesting priority levels
- Recommending which units to dispatch
- Providing guidance on emergency protocols
- Answering questions about the current shift
- Helping with report writing
- Explaining AI prank detection results

Be concise, professional, and focused on emergency operations. 
Use clear language. Always prioritize life safety in your advice.`;

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

    // Only include actual back-and-forth (skip the initial assistant greeting)
    // Gemini requires alternating user/model roles, starting with user
    const priorExchanges = [];
    const humanMessages = messages.filter(m => m.role === "user");
    const aiMessages = messages.filter(m => m.role === "assistant");
    // Interleave: user first, then model
    for (let i = 0; i < humanMessages.length; i++) {
      priorExchanges.push({ role: "user",  parts: [{ text: humanMessages[i].text }] });
      if (aiMessages[i + 1]) { // skip the greeting (index 0)
        priorExchanges.push({ role: "model", parts: [{ text: aiMessages[i + 1].text }] });
      }
    }

    // Final user message includes system prompt + context
    const contents = [
      {
        role: "user",
        parts: [{ text: `${SYSTEM_PROMPT}\n\nDashboard context:\n${context}\n\nQuestion: ${text}` }]
      }
    ];

    // If there were prior exchanges, prepend them (skip the very first since it's now our new message)
    // For simplicity just send the enriched single message — keeps it clean
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents })
        }
      );
      const data = await res.json();
      if (data.error) {
        console.error("Gemini error:", data.error);
        setMessages(m => [...m, { role: "assistant", text: `API error: ${data.error.message}` }]);
      } else {
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response from AI.";
        setMessages(m => [...m, { role: "assistant", text: reply }]);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setMessages(m => [...m, { role: "assistant", text: "Connection error — check console for details." }]);
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