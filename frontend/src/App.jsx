import { useMemo, useState } from "react";
import "./styles/luxury.css";
import LuxSidebar from "./components/LuxSidebar.jsx";
import LuxHeader from "./components/LuxHeader.jsx";
import LuxMessages from "./components/LuxMessages.jsx";
import LuxComposer from "./components/LuxComposer.jsx";

/**
 * Replace this temporary alias helper with your project's real alias helper if needed.
 */
function buildAlias(seed = "void") {
  const words = ["ghost", "echo", "shadow", "cipher", "nova", "void"];
  const a = words[seed.length % words.length];
  const b = words[(seed.charCodeAt(0) || 0) % words.length];
  return `@${a}-${b}-${seed.slice(0, 4)}`;
}

export default function App() {
  const [me] = useState(() => buildAlias(Math.random().toString(36).slice(2, 8)));
  const [peerAlias, setPeerAlias] = useState("");
  const [status, setStatus] = useState("Luxury channel ready");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([
    {
      id: "seed-1",
      sender: "@cipher-nova-demo",
      text: "Welcome back to VØID. This interface is designed to feel calmer, richer, and more premium than the older layout.",
      fromMe: false,
      meta: "Preview message"
    }
  ]);

  const contacts = useMemo(() => {
    const items = [
      { id: "c1", name: "@cipher-nova-demo", meta: "Verified secure contact" }
    ];

    if (peerAlias.trim()) {
      items.unshift({
        id: "typed-peer",
        name: peerAlias.trim(),
        meta: "Direct encrypted peer"
      });
    }

    return items;
  }, [peerAlias]);

  const currentContact = contacts[0];

  const handleSelectContact = (contact) => {
    setPeerAlias(contact.name);
    setStatus(`Selected ${contact.name}`);
  };

  const handleSend = async () => {
    if (!peerAlias.trim() || !text.trim()) {
      setStatus("Enter a peer alias and message first");
      return;
    }

    /**
     * Replace this block with your existing encrypted transport call, for example:
     * await sendEncryptedMessage({ toAlias: peerAlias.trim(), text: text.trim() })
     */
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: me,
        text: text.trim(),
        fromMe: true,
        meta: "Sent"
      }
    ]);
    setText("");
    setStatus(`Sent to ${peerAlias.trim()}`);
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
        />

        <main className="lux-main">
          <LuxHeader currentContact={currentContact} />
          <LuxMessages messages={messages} />
          <LuxComposer
            value={text}
            onChange={setText}
            onSend={handleSend}
            disabled={!peerAlias.trim()}
            status={status}
          />
        </main>
      </div>
    </div>
  );
}
