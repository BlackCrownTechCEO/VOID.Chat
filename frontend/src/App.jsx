import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import MessageBubble from "./components/MessageBubble.jsx";
import { APP_NAME, buildAlias } from "@void/shared";
import { createEncryptedOutgoing, decryptIncoming, registerBundle } from "./crypto/protocol.js";

// Empty string = same origin (works on Vercel). Set VITE_API_URL for a separate backend host.
const API_URL = import.meta.env.VITE_API_URL || "";

export default function App() {
  const [alias] = useState(() => buildAlias(Math.random().toString(36).slice(2, 8)));
  const [peerAlias, setPeerAlias] = useState("");
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("Initializing…");

  useEffect(() => {
    registerBundle(API_URL, alias)
      .then(() => setStatus("Identity ready"))
      .catch((err) => setStatus(`Bundle registration failed: ${err.message}`));

    const s = io(API_URL);
    s.emit("join-alias", alias);
    s.on("encrypted-message", async (entry) => {
      try {
        const plaintext = await decryptIncoming(entry.fromAlias, {
          ...entry.payload,
          senderBundle: entry.payload.senderBundle
        });
        setMessages((prev) => [...prev, {
          id: entry.id,
          sender: entry.fromAlias,
          text: plaintext,
          fromMe: false
        }]);
      } catch (err) {
        setMessages((prev) => [...prev, {
          id: entry.id,
          sender: entry.fromAlias,
          text: `[decrypt failed: ${err.message}]`,
          fromMe: false
        }]);
      }
    });
    setSocket(s);
    return () => s.close();
  }, [alias]);

  const send = async () => {
    if (!peerAlias.trim() || !text.trim()) return;

    try {
      setStatus("Encrypting…");
      const payload = await createEncryptedOutgoing(API_URL, alias, peerAlias.trim(), text.trim());
      payload.senderBundle = (await (await fetch(`${API_URL}/api/keys/${encodeURIComponent(alias)}`)).json()).bundle;

      const res = await fetch(`${API_URL}/api/encrypted/direct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAlias: alias,
          toAlias: peerAlias.trim(),
          payload
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Send failed" }));
        throw new Error(data.error || "Send failed");
      }

      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        sender: alias,
        text: text.trim(),
        fromMe: true
      }]);
      setText("");
      setStatus("Encrypted send complete");
    } catch (err) {
      setStatus(err.message);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", height: "100vh" }}>
      <aside style={{ padding: 20, borderRight: "1px solid #222", background: "#0f0f14" }}>
        <h1 style={{ marginTop: 0 }}>{APP_NAME}</h1>
        <div style={{ marginBottom: 10, opacity: 0.8 }}>Your alias</div>
        <div style={{ padding: 12, background: "#121218", borderRadius: 16 }}>{alias}</div>

        <div style={{ marginTop: 20, marginBottom: 10, opacity: 0.8 }}>Peer alias</div>
        <input
          value={peerAlias}
          onChange={(e) => setPeerAlias(e.target.value)}
          placeholder="@peer-alias"
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid #333",
            background: "#121218",
            color: "white"
          }}
        />

        <div style={{ marginTop: 20, padding: 12, background: "#121218", borderRadius: 16, fontSize: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Protocol status</div>
          <div>{status}</div>
        </div>
      </aside>

      <main style={{ display: "flex", flexDirection: "column" }}>
        <header style={{ padding: 20, borderBottom: "1px solid #222", fontWeight: 700 }}>
          Encrypted direct message
        </header>

        <section style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {messages.map((item) => (
            <MessageBubble key={item.id} item={item} />
          ))}
        </section>

        <footer style={{ padding: 16, borderTop: "1px solid #222", display: "flex", gap: 12 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type an encrypted message"
            style={{
              flex: 1,
              padding: "14px 16px",
              borderRadius: 14,
              border: "1px solid #333",
              background: "#121218",
              color: "white"
            }}
          />
          <button
            onClick={send}
            style={{
              padding: "14px 18px",
              borderRadius: 14,
              border: 0,
              background: "#2563eb",
              color: "white",
              fontWeight: 700
            }}
          >
            Encrypt + Send
          </button>
        </footer>
      </main>
    </div>
  );
}
