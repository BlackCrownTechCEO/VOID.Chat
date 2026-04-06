import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);

const PORT = Number(process.env.PORT || 3500);
const WEB_ORIGIN = process.env.PUBLIC_WEB_ORIGIN || "http://localhost:5173";

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "128kb" }));
app.use(morgan("dev"));

const io = new Server(server, {
  cors: { origin: true, credentials: true }
});

const bundles = new Map();      // alias -> public prekey bundle
const inboxes = new Map();      // alias -> encrypted envelopes[]

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "void-backend", time: new Date().toISOString() });
});

app.post("/api/keys/register", (req, res) => {
  const alias = String(req.body?.alias || "").trim();
  const bundle = req.body?.bundle;

  if (!alias || !bundle?.identityAgreementPublic || !bundle?.identitySigningPublic || !bundle?.signedPrekeyPublic || !bundle?.signedPrekeySignature || !bundle?.oneTimePrekeyPublic) {
    return res.status(400).json({ error: "Invalid bundle payload" });
  }

  bundles.set(alias, bundle);
  if (!inboxes.has(alias)) inboxes.set(alias, []);
  res.status(201).json({ ok: true, alias });
});

app.get("/api/keys/:alias", (req, res) => {
  const alias = String(req.params.alias || "");
  const bundle = bundles.get(alias);
  if (!bundle) return res.status(404).json({ error: "Alias not found" });
  res.json({ alias, bundle });
});

app.post("/api/encrypted/direct", (req, res) => {
  const fromAlias = String(req.body?.fromAlias || "").trim();
  const toAlias = String(req.body?.toAlias || "").trim();
  const payload = req.body?.payload;

  if (!fromAlias || !toAlias || !payload?.header || !payload?.envelope) {
    return res.status(400).json({ error: "Invalid encrypted payload" });
  }

  const entry = {
    id: crypto.randomUUID(),
    fromAlias,
    toAlias,
    payload,
    createdAt: new Date().toISOString()
  };

  const list = inboxes.get(toAlias) || [];
  list.push(entry);
  inboxes.set(toAlias, list);

  io.to(`alias:${toAlias}`).emit("encrypted-message", entry);

  res.status(201).json({ ok: true, id: entry.id });
});

app.get("/api/encrypted/inbox/:alias", (req, res) => {
  const alias = String(req.params.alias || "");
  res.json(inboxes.get(alias) || []);
});

io.on("connection", (socket) => {
  socket.on("join-alias", (alias) => {
    if (typeof alias === "string" && alias.length < 120) {
      socket.join(`alias:${alias}`);
    }
  });
});

// Export for Vercel serverless / test environments
export { app, server };

// Only bind the port when run directly (not imported by Vercel Functions)
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain || process.env.VOID_STANDALONE === "1") {
  server.listen(PORT, () => {
    console.log(`VØID encrypted backend running on http://localhost:${PORT}`);
  });
}
