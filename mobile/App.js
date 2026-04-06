import React, { useEffect, useMemo, useState } from "react";
import Constants from "expo-constants";
import { SafeAreaView, View, Text, TextInput, Pressable, FlatList } from "react-native";
import { io } from "socket.io-client";
import { APP_NAME, buildAlias } from "@void/shared";
import { registerBundle, createEncryptedOutgoing, decryptIncoming } from "./src/crypto/protocol";

const API_URL = Constants.expoConfig?.extra?.apiUrl || "http://localhost:3500";

export default function App() {
  const [alias] = useState(() => buildAlias(Math.random().toString(36).slice(2, 8)));
  const [peerAlias, setPeerAlias] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("Initializing…");

  useEffect(() => {
    registerBundle(API_URL, alias)
      .then(() => setStatus("Identity ready"))
      .catch((err) => setStatus(`Bundle registration failed: ${err.message}`));

    const s = io(API_URL, { transports: ["websocket", "polling"] });
    s.emit("join-alias", alias);

    s.on("encrypted-message", async (entry) => {
      try {
        const plaintext = await decryptIncoming(entry.fromAlias, entry.payload);
        setMessages((prev) => [
          ...prev,
          {
            id: entry.id,
            sender: entry.fromAlias,
            text: plaintext,
            fromMe: false
          }
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: entry.id,
            sender: entry.fromAlias,
            text: `[decrypt failed: ${err.message}]`,
            fromMe: false
          }
        ]);
      }
    });

    return () => s.close();
  }, [alias]);

  const send = async () => {
    if (!peerAlias.trim() || !text.trim()) return;

    try {
      setStatus("Encrypting…");
      const payload = await createEncryptedOutgoing(API_URL, alias, peerAlias.trim(), text.trim());

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

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          sender: alias,
          text: text.trim(),
          fromMe: true
        }
      ]);
      setText("");
      setStatus("Encrypted send complete");
    } catch (err) {
      setStatus(err.message);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0b0d" }}>
      <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: "#222" }}>
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>{APP_NAME}</Text>
        <Text style={{ color: "#aaa", marginTop: 6 }}>{alias}</Text>
      </View>

      <View style={{ padding: 16, gap: 10 }}>
        <Text style={{ color: "#bbb" }}>Peer alias</Text>
        <TextInput
          value={peerAlias}
          onChangeText={setPeerAlias}
          placeholder="@peer-alias"
          placeholderTextColor="#777"
          style={{
            backgroundColor: "#121218",
            color: "#fff",
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12
          }}
        />
        <Text style={{ color: "#7dd3fc" }}>{status}</Text>
      </View>

      <FlatList
        style={{ flex: 1, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingVertical: 12 }}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const mine = item.fromMe;
          return (
            <View style={{ alignItems: mine ? "flex-end" : "flex-start", marginBottom: 10 }}>
              <View style={{
                maxWidth: "78%",
                backgroundColor: mine ? "#2563eb" : "#1f2937",
                padding: 12,
                borderRadius: 16
              }}>
                <Text style={{ color: "#cbd5e1", fontSize: 12, marginBottom: 4 }}>
                  {mine ? "You" : item.sender}
                </Text>
                <Text style={{ color: "#fff", fontSize: 16 }}>{item.text}</Text>
              </View>
            </View>
          );
        }}
      />

      <View style={{ flexDirection: "row", gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: "#222" }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type an encrypted message"
          placeholderTextColor="#777"
          style={{
            flex: 1,
            backgroundColor: "#121218",
            color: "#fff",
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12
          }}
        />
        <Pressable
          onPress={send}
          style={{
            backgroundColor: "#2563eb",
            borderRadius: 14,
            justifyContent: "center",
            paddingHorizontal: 18
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Send</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
