import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./styles/luxury.css";
import LuxSidebar from "./components/LuxSidebar.jsx";
import LuxHeader from "./components/LuxHeader.jsx";
import LuxMessages from "./components/LuxMessages.jsx";
import LuxComposer from "./components/LuxComposer.jsx";
import {
  registerBundle,
  createEncryptedOutgoing,
  decryptIncoming,
  ensureIdentity
} from "./crypto/protocol.js";

const API_URL = import.meta.env.VITE_API_URL || "";

function buildAlias(seed = "void") {
  const words = ["ghost", "echo", "shadow", "cipher", "nova", "void"];
  const a = words[seed.length % words.length];
  const b = words[(seed.charCodeAt(0) || 0) % words.length];
  return `@${a}-${b}-${seed.slice(0, 4)}`;
}

export default function App() {
  const [me] = useState(() => {
    const stored = sessionStorage.getItem("void.alias");
    if (stored) return stored;
    const alias = buildAlias(Math.random().toString(36).slice(2, 8));
    sessionStorage.setItem("void.alias", alias);
    return alias;
  });

  const [peerAlias, setPeerAlias] = useState("");
  const [status, setStatus] = useState("Initializing secure channel…");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [registered, setRegistered] = useState(false);
  const socketRef = useRef(null);

  // ── E2EE bootstrap ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await ensureIdentity();
        await registerBundle(API_URL, me);
        if (!cancelled) {
          setRegistered(true);
          setStatus("Secure identity registered. Ready.");
        }
      } catch (err) {
        if (!cancelled) setStatus("Identity registration failed — check server.");
      }
    }

    init();
    return () => { cancelled = true; };
  }, [me]);

  // ── Socket.IO connection ─────────────────────────────────
  useEffect(() => {
    const socket = io(API_URL || window.location.origin, {
      transports: ["websocket", "polling"],
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });
    socketRef.current = socket;

    socket.on("connect", () => setStatus("Connected to VØID relay."));
    socket.on("disconnect", () => setStatus("Disconnected — reconnecting…"));
    socket.on("connect_error", () => setStatus("Relay connection error."));

    // Receive encrypted envelope via Socket.IO relay
    socket.on("encrypted-message", async (entry) => {
      if (entry.toAlias !== me) return;
      try {
        const plaintext = await decryptIncoming(entry.fromAlias, entry.payload);
        setMessages((prev) => [
          ...prev,
          {
            id: entry.id,
            sender: entry.fromAlias,
            text: plaintext,
            fromMe: false,
            meta: "E2EE decrypted"
          }
        ]);
      } catch {
        // Never log decryption errors with content — omega §12
        setMessages((prev) => [
          ...prev,
          {
            id: entry.id,
            sender: entry.fromAlias,
            text: "[Encrypted message — unable to decrypt]",
            fromMe: false,
            meta: "Decryption failed"
          }
        ]);
      }
    });

    // Subscribe to alias room for delivery
    socket.emit("joinAliasRoom", { alias: me });

    return () => { socket.disconnect(); };
  }, [me]);

  // ── Contacts ────────────────────────────────────────────
  const contacts = useMemo(() => {
    const items = [];
    if (peerAlias.trim()) {
      items.push({ id: "typed-peer", name: peerAlias.trim(), meta: "Direct encrypted peer" });
    }
    return items;
  }, [peerAlias]);

  const currentContact = contacts[0] ?? null;

  const handleSelectContact = (contact) => {
    setPeerAlias(contact.name);
    setStatus(`Peer set to ${contact.name}`);
  };

  const handleBroadcast = (broadcastText) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: "⬡ SYSTEM",
        text: broadcastText,
        fromMe: false,
        meta: "Admin broadcast"
      }
    ]);
    setStatus("Broadcast sent");
  };

  const handleClearMessages = () => {
    setMessages([]);
    setStatus("Messages cleared by admin");
  };

  // ── Encrypted send ───────────────────────────────────────
  const handleSend = async () => {
    const peer = peerAlias.trim();
    const body = text.trim();

    if (!peer) { setStatus("Enter a peer alias first"); return; }
    if (!body)  { setStatus("Message cannot be empty"); return; }
    if (!registered) { setStatus("Waiting for identity registration…"); return; }

    const localId = crypto.randomUUID();
    // Optimistic insert
    setMessages((prev) => [
      ...prev,
      { id: localId, sender: me, text: body, fromMe: true, meta: "Sending…" }
    ]);
    setText("");

    try {
      const { header, envelope } = await createEncryptedOutgoing(API_URL, me, peer, body);

      const res = await fetch(`${API_URL}/api/encrypted/direct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAlias: me, toAlias: peer, payload: { header, envelope } })
      });

      if (!res.ok) throw new Error(`relay ${res.status}`);

      // Update meta to confirmed
      setMessages((prev) =>
        prev.map((m) => (m.id === localId ? { ...m, meta: "Delivered (E2EE)" } : m))
      );
      setStatus(`Sent to ${peer} — end-to-end encrypted`);
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.id === localId ? { ...m, meta: "Send failed" } : m))
      );
      setStatus(`Send failed — ${err.message}`);
    }
  };

  return (
    <div className="lux-shell">
      <div className="lux-app">
        <LuxSidebar
          me={me}
          peerAlias={peerAlias}
          setPeerAlias={setPeerAlias}
          contacts={contacts}
          currentContact={currentContact}
          onSelectContact={handleSelectContact}
          onBroadcast={handleBroadcast}
          onClearMessages={handleClearMessages}
          connectedAliases={contacts.map((c) => c.name)}
        />

        <main className="lux-main">
          <LuxHeader currentContact={currentContact} />
          <LuxMessages messages={messages} />
          <LuxComposer
            value={text}
            onChange={setText}
            onSend={handleSend}
            disabled={!peerAlias.trim() || !registered}
            status={status}
          />
        </main>
      </div>
    </div>
  );
}
