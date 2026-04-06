// Vercel catch-all: forwards all /api/* requests to the Express app.
// NOTE: in-memory Maps (bundles, inboxes) are instance-local.
// For production persistence, replace with Supabase / Redis.
// Socket.IO realtime requires a separate persistent server (Railway / Fly.io).
import { app } from "../backend/src/index.js";

export default app;
