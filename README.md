# JPO delivery ledger

Client-facing page that reads the **JPO Delivery Dashboard → Delivery Promises** database in Notion and shows it to JustPressOne. Anyone with the link can view it; it is kept out of search engines.

## How it works

- `public/index.html`: the page. It loads `/api/ledger` and renders the overview and both commitment tabs.
- `netlify/functions/ledger.mjs`: reads Notion with a read-only token and returns **only** rows with *Show on ledger* ticked, and **only** these fields: Promise or *Client title (optional)*, Agreement, Owed by, *Client status*, Client signal (EmergePH rows only), *Client: where it stands*, *Client: next step*, Next step date, What we promised, Clause, and Last reviewed (for the "Last updated" date). Nothing else leaves Notion.
- Rows without a Client status, Agreement or Owed by are skipped rather than shown half-filled.
- Edits in Notion appear on the page within about 5 minutes.

## Deploy (Netlify, free plan)

Netlify Drop (drag and drop) does not run functions, so use one of these:

**Option A: GitHub (recommended, every change is versioned)**
1. Create a private GitHub repo and upload the contents of this folder.
2. In Netlify: Add new site → Import an existing project → GitHub → pick the repo. Leave build settings as they are (netlify.toml sets them).
3. Add the environment variables below, then trigger a deploy.

**Option B: Netlify CLI**
1. Install Node.js, then run `npm install -g netlify-cli` and `netlify login`.
2. In this folder run `netlify init` (create a new site), add the environment variables below, then `netlify deploy --prod`.

## Environment variables

Site configuration → Environment variables:

| Name | Value |
|---|---|
| `NOTION_TOKEN` | The Installation access token from the Notion internal connection (Configuration tab). Mark it as secret. |
| `NOTION_DATA_SOURCE_ID` | `358c9895-f40c-4812-ad2a-8f4130744825` |

Redeploy after adding or changing them.

## Checks before sharing the link

1. Open `https://<your-site>.netlify.app/api/ledger`. Confirm it lists only ticked rows and contains no internal text (Next step, Evidence, Signal source, owners).
2. Untick *Show on ledger* on one row, wait 5 minutes, refresh: it should disappear.
3. If the page says it couldn't load: check the function log (Netlify → Logs → Functions). A 401 means the token is wrong; a 404 means the connection hasn't been added to the Delivery Promises database.

## Renaming fields in Notion

The function looks fields up by name. If you rename any field listed above, update the matching name in `ledger.mjs`.
Agreement start dates and descriptions shown on the page live in `AGREEMENTS` near the top of the script in `index.html`.
