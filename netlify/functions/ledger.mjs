// GET /api/ledger        cached for up to 5 minutes (normal page loads)
// GET /api/ledger-fresh  read from Notion right now (the page's Refresh button)
// Reads the Delivery Promises database in Notion and returns the client ledger as JSON.
//
// Safety: only rows with "Show on ledger" ticked are returned, and only the fields
// listed in toItem() below ever leave this function. Internal fields (Next step,
// Evidence, Signal source, Owner, Gaps, Issues, Status, ...) are never read into the output.
//
// Environment variables (set in Netlify, never in code):
//   NOTION_TOKEN           Installation access token of the read-only internal connection
//   NOTION_DATA_SOURCE_ID  Data source ID of Delivery Promises

const NOTION_VERSION = "2025-09-03";

const AGREEMENT = { "Retainer": "retainer", "Fractional L&D": "ld", "Carried & related": "carried" };
const STATUS = {
  "Behind": "behind",
  "Needs action": "risk",
  "In progress": "progress",
  "On track": "ontrack",
  "Upcoming": "upcoming",
  "Done": "done"
};
const SIGNAL = { "Happy": "happy", "Neutral": "neutral", "Concerned": "concerned" }; // Unsure or empty -> unknown

const text = p => {
  if (!p) return "";
  const parts = p.type === "title" ? p.title : p.type === "rich_text" ? p.rich_text : [];
  return (parts || []).map(t => t.plain_text).join("").trim();
};
const select = p => (p && p.type === "select" && p.select ? p.select.name : null);
const checkbox = p => !!(p && p.type === "checkbox" && p.checkbox);
const dateOnly = p => (p && p.type === "date" && p.date && p.date.start ? p.date.start.slice(0, 10) : null);

function toItem(page) {
  const p = page.properties || {};
  if (!checkbox(p["Show on ledger"])) return null;          // belt and braces: the query also filters this
  const status = STATUS[select(p["Client status"])];
  const a = AGREEMENT[select(p["Agreement"])];
  const owedBy = select(p["Owed by"]);
  if (!status || !a || !owedBy) return null;                // incomplete rows are skipped, never shown half-filled

  const item = {
    a,
    title: text(p["Client title (optional)"]) || text(p["Promise"]),
    status,
    stands: text(p["Client: where it stands"]),
    next: text(p["Client: next step"]),
    date: dateOnly(p["Next step date"]),
    promise: text(p["What we promised"]),
    clause: text(p["Clause"])
  };
  if (owedBy === "EmergePH") item.signal = SIGNAL[select(p["Client signal"])] || "unknown";
  return { owedBy, item, reviewed: dateOnly(p["Last reviewed"]) };
}

async function queryAll(token, dataSourceId) {
  const pages = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        filter: { property: "Show on ledger", checkbox: { equals: true } },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {})
      })
    });
    if (!res.ok) {
      let detail = {};
      try { detail = await res.json(); } catch (e) {}
      const err = new Error(`Notion ${res.status}: ${detail.code || ""} ${detail.message || ""}`);
      err.notion = { status: res.status, code: detail.code || null, message: detail.message || null };
      throw err;
    }
    const json = await res.json();
    pages.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return pages;
}

export function buildLedger(pages) {
  const ours = [], theirs = [];
  let updated = null;
  for (const page of pages) {
    const row = toItem(page);
    if (!row) continue;
    (row.owedBy === "JPO" ? theirs : ours).push(row.item);
    if (row.reviewed && (!updated || row.reviewed > updated)) updated = row.reviewed;
  }
  return { updated, ours, theirs };
}

export default async (req) => {
  const fresh = new URL(req.url).pathname.endsWith("/ledger-fresh");
  const token = process.env.NOTION_TOKEN;
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID;
  if (!token || !dataSourceId) {
    console.error("Missing NOTION_TOKEN or NOTION_DATA_SOURCE_ID");
    return Response.json({ error: "Ledger is not configured." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const ledger = buildLedger(await queryAll(token, dataSourceId));
    return Response.json(ledger, {
      headers: fresh ? {
        // Refresh button: read Notion now and never cache this copy.
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex"
      } : {
        // Normal visits: browsers re-check every minute; Netlify's CDN serves a cached copy for up
        // to 5 minutes, and keeps serving the last good copy for a day if Notion is briefly unreachable.
        "Cache-Control": "public, max-age=60",
        "Netlify-CDN-Cache-Control": "public, durable, s-maxage=300, stale-while-revalidate=86400",
        "X-Robots-Tag": "noindex"
      }
    });
  } catch (err) {
    console.error(err);
    // Diagnostic detail for setup problems. Never includes the token: for Notion errors it's
    // Notion's own status, code and message; for anything else, only the kind of error.
    const diagnostic = err.notion
      ? { notion_status: err.notion.status, notion_code: err.notion.code, notion_message: err.notion.message }
      : { problem: err.name === "TypeError" && /header|ByteString/i.test(err.message)
            ? "NOTION_TOKEN contains characters that can't be sent (a space, line break, quote mark or the wrong text). Paste the token again."
            : err.name };
    return Response.json({ error: "Could not load the ledger.", ...diagnostic }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
};

export const config = { path: ["/api/ledger", "/api/ledger-fresh"] };
