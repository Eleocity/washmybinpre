// server.js (ESM) — Express + MySQL (Railway-ready)
// Requires: npm i express mysql2 dotenv helmet cors express-rate-limit

import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { initDb, db } from "./db.js";

const app = express();

const PORT = Number(process.env.PORT || 3000);

// Comma-separated list of allowed origins, e.g.
// ALLOWED_ORIGINS=https://washmybinwi.com,https://www.washmybinwi.com,http://localhost:5173
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ---- Middleware ----
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
    origin: (origin, cb) => {
      // allow server-to-server / curl / same-origin (no Origin header)
      if (!origin) return cb(null, true);

      // if you didn't set ALLOWED_ORIGINS, allow all (dev-friendly)
      if (ALLOWED_ORIGINS.length === 0) return cb(null, true);

      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Basic health + root routes (prevents "Cannot GET /")
app.get("/", (req, res) => {
  res.type("text").send("WashMyBin backend is running ✅");
});

app.get("/health", async (req, res) => {
  try {
    await db().query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "db_unreachable" });
  }
});

// ---- Helpers ----
function getClientIp(req) {
  // Railway/Proxies: trust x-forwarded-for when present
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.ip || null;
}

function isValidEmail(email) {
  if (!email) return true; // optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

// ---- API ----
app.post("/api/waitlist", async (req, res) => {
  try {
    const {
      name,
      zip,
      phone,
      email = null,
      plan_interest,
      note = null,
    } = req.body || {};

    // Basic validation (keep it simple)
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ ok: false, error: "name_required" });
    }
    if (!zip || String(zip).trim().length < 3) {
      return res.status(400).json({ ok: false, error: "zip_required" });
    }
    if (!phone || String(phone).trim().length < 7) {
      return res.status(400).json({ ok: false, error: "phone_required" });
    }
    if (!plan_interest || String(plan_interest).trim().length < 2) {
      return res.status(400).json({ ok: false, error: "plan_interest_required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: "email_invalid" });
    }

    const createdAt = new Date();
    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] || null;

    const [result] = await db().execute(
      `
      INSERT INTO waitlist
        (name, zip, phone, email, plan_interest, note, ip, user_agent, created_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        String(name).trim(),
        String(zip).trim(),
        String(phone).trim(),
        email ? String(email).trim() : null,
        String(plan_interest).trim(),
        note ? String(note).trim() : null,
        ip,
        userAgent ? String(userAgent).slice(0, 5000) : null,
        createdAt,
      ]
    );

    // mysql2 result has insertId
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    console.error("POST /api/waitlist error:", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// (Optional) Admin list endpoint (protect it with a token)
app.get("/api/admin/waitlist", async (req, res) => {
  const token = req.headers["x-admin-token"] || "";
  const expected = process.env.ADMIN_TOKEN || "";

  if (!expected || token !== expected) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const limit = Math.min(Number(req.query.limit || 50), 500);
    const [rows] = await db().query(
      `
      SELECT id, name, zip, phone, email, plan_interest, note, ip, user_agent, created_at
      FROM waitlist
      ORDER BY created_at DESC
      LIMIT ?
      `,
      [limit]
    );

    res.json({ ok: true, rows });
  } catch (e) {
    console.error("GET /api/admin/waitlist error:", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ---- Boot ----
async function start() {
  await initDb(); // creates table + indexes if needed
  app.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
    if (ALLOWED_ORIGINS.length) console.log("Allowed origins:", ALLOWED_ORIGINS);
  });
}

start().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
