// client_meetings.mjs
// Requiere Node 18+ (fetch nativo)
// Ejecuta: node client_meetings.mjs

import { randomUUID } from "node:crypto";

// ==============================
// CONFIG
// ==============================
const USE_FUNCTIONS = false; 

// --- Firestore REST ---
const PROJECT_ID = process.env.PROJECT_ID || "smart-meeting-assistant-1a3c8";
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/meetings`;
const FIRESTORE_BEARER_TOKEN = process.env.FIRESTORE_TOKEN || null; 


// ==============================
// HELPERS
// ==============================
function isoUtc(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === "number") return { doubleValue: v };
  if (v instanceof Date) return { timestampValue: isoUtc(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, toFsValue(val)])) } };
  }
  return { stringValue: String(v) };
}

function toFsFields(doc) {
  return { fields: Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, toFsValue(v)])) };
}

function headersJSON(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  if (!USE_FUNCTIONS && FIRESTORE_BEARER_TOKEN) h.Authorization = `Bearer ${FIRESTORE_BEARER_TOKEN}`;
  return h;
}

async function http(method, url, body = undefined, headers = {}) {
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${url} -> ${res.status} ${res.statusText}\n${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : undefined;
}

// ==============================
// FIRESTORE REST (POST/GET/PATCH/DELETE)
// ==============================
async function fsCreateMeeting(meetingId, data) {
  const url = meetingId ? `${FS_BASE}?documentId=${encodeURIComponent(meetingId)}` : FS_BASE;
  return http("POST", url, toFsFields(data), headersJSON());
}

async function fsGetMeeting(meetingId) {
  return http("GET", `${FS_BASE}/${encodeURIComponent(meetingId)}`, undefined, headersJSON());
}

async function fsGetMeetings() {
  return http("GET", `${FS_BASE}`, undefined, headersJSON());
}

async function fsPatchMeeting(meetingId, data, { replaceAll = true, fields = [] } = {}) {
  let url = `${FS_BASE}/${encodeURIComponent(meetingId)}`;
  if (!replaceAll && fields.length) {
    const masks = fields.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join("&");
    url = `${url}?${masks}`;
  }
  return http("PATCH", url, toFsFields(data), headersJSON());
}

async function fsDeleteMeeting(meetingId) {
  await http("DELETE", `${FS_BASE}/${encodeURIComponent(meetingId)}`, undefined, headersJSON());
}


// ==============================
// DEMO
// ==============================
async function main() {
  // payload coherente con tu colección "meetings"
  const sample = {
    title: "Demo reunión",
    datetime: isoUtc(new Date()), // puedes enviar stringValue o mapearlo a timestamp en toFsValue
    duration: 45,
    ownerUid: "user_001",
    participants: ["ana@x.com", "josh@x.com"],
    status: "scheduled",
    location: "Google Meet",
  };

    console.log("== MODO Firestore REST (POST/GET/PATCH/DELETE) ==");
    const meetingId = `mtg_${randomUUID().slice(0, 8)}`;

    const created = await fsCreateMeeting(meetingId, sample);
    console.log("CREATED name:", created.name);

    const got = await fsGetMeeting(meetingId);
    console.log("GET:", JSON.stringify(got, null, 2));

    const gall = await fsGetMeetings();
    console.log("GET ALL:", JSON.stringify(gall, null, 2));

    // PATCH reemplazo total (≈ PUT)
    const updatedFull = { ...sample, title: "Demo reunión (PATCH full)", status: "completed" };
    const patchedFull = await fsPatchMeeting(meetingId, updatedFull, { replaceAll: true });
    console.log("PATCH full:", JSON.stringify(patchedFull, null, 2));

    // PATCH parcial (solo status)
    const patchedPartial = await fsPatchMeeting(meetingId, { status: "rescheduled" }, { replaceAll: false, fields: ["status"] });
    console.log("PATCH parcial:", JSON.stringify(patchedPartial, null, 2));

    await fsDeleteMeeting(meetingId);
    console.log("DELETE ok");

    const gall2 = await fsGetMeetings();
    console.log("GET ALL AFTER DELETE:", JSON.stringify(gall2, null, 2));
  }


main().catch(err => {
  console.error(err);
  process.exit(1);
});

