# Runbook: Princess Bhadrakitiyabha Blessing Site

Last checked: 2026-06-12, Asia/Bangkok

## Current State

This project is a static condolence signing site built with plain HTML, CSS, and JavaScript.

Working tree status at the time of this runbook:

- Modified: `index.html`
- Modified: `css/style.css`
- Unchanged from the committed baseline: `js/app.js`, `apps-script/Code.gs`, `README.md`
- No `docs/` directory existed before this runbook.
- Git remote exists: `origin` points to `https://github.com/cottoart/Princess-Bhadrakitiyabha-Blessing-20260612.git`
- No Vercel/Sites deployment config was found in the repo (`.vercel`, `vercel.json`, `.openai/hosting.json` were absent).

## What Is Already Done

### Visual/background work

- `css/style.css` now has a layered black/gray memorial background.
- The page uses:
  - fixed layered gradients on `body`
  - `body::before` for subtle Thai pattern texture
  - `body::after` for top light, center glow, and dark edge vignette
  - darker gradient panels for signing entries
- The royal name in `index.html` was split into short `<span>` segments so mobile layout can wrap cleanly.
- Mobile CSS now forces each royal-name segment onto its own line.

### Local signing flow

- `js/app.js` still runs in local prototype mode because:

```js
const API_URL = "";
```

- In this mode, entries are saved to each browser's `localStorage`.
- This is suitable for preview only. Different users/devices will not see each other's signatures.

### Google Sheets backend preparation

- `apps-script/Code.gs` exists and contains a Google Apps Script Web App backend.
- It supports:
  - `doGet()` to read rows from a Google Sheet tab named `entries`
  - `doPost(e)` to append a new signature row
  - a script lock to reduce write collisions
- It expects the Google Sheet to have a tab named `entries` with headers:

```text
at | name | phrase
```

### README guidance

- `README.md` already explains:
  - how to run the static site locally
  - that the current default is `localStorage`
  - how to set up Google Sheets via `apps-script/Code.gs`
  - how to deploy the static site to Vercel or GitHub Pages

## What Claude Claimed vs What I Verified

| Topic | Verified status |
| --- | --- |
| Thai background/pattern visible | Background and pattern work exists in `css/style.css`. I verified the CSS markers and rendered desktop/mobile screenshots with Chrome headless. |
| Database currently localStorage | Correct. `API_URL` is still blank in `js/app.js`. |
| Google Sheets is recommended for the short 3-month/1,000-entry use case | Reflected in `README.md` and supported by `apps-script/Code.gs`. |
| Google Sheets backend code prepared | Correct. `apps-script/Code.gs` exists and passed a JavaScript syntax check through Node stdin. |
| Production database already connected | Not done. No `/exec` Web App URL has been inserted into `js/app.js`. |
| Hosted on Vercel | Not verified/done in this repo. No Vercel config was found. |
| Local signing flow tested | The static page renders, and `js/app.js` passes syntax check. A full click/submit browser automation test has not been run in this handoff. |

## Verification Performed

Commands run:

```powershell
rtk git status --short
rtk git diff --stat
rtk rg -n "API_URL|localStorage|Google Sheets|Apps Script|Vercel|GitHub Pages|background|thai-pattern|body::before|body::after" README.md js/app.js apps-script/Code.gs css/style.css index.html
rtk node --check js/app.js
rtk powershell -NoProfile -Command 'Get-Content -Raw -Encoding UTF8 -LiteralPath "apps-script\Code.gs" | node --check --input-type=commonjs -'
```

Chrome headless screenshots were also generated for:

- Desktop: `1365x1200`
- Mobile: `390x1200`

Temporary screenshot files were removed after inspection.

## Remaining Work

### Required before real public use

1. Create the production Google Sheet.
2. Add a tab named `entries`.
3. Add row 1 headers exactly:

```text
at | name | phrase
```

4. Open Extensions -> Apps Script.
5. Paste `apps-script/Code.gs`.
6. Deploy as Web App:
   - Execute as: `Me`
   - Who has access: `Anyone`
7. Copy the deployed Web App URL ending in `/exec`.
8. Paste that URL into `js/app.js`:

```js
const API_URL = "https://script.google.com/macros/s/.../exec";
```

9. Test a real submission against Google Sheets.
10. Deploy the static site to Vercel or GitHub Pages.

### Recommended checks before publishing

- Run `rtk node --check js/app.js`.
- Render desktop and mobile again after setting `API_URL`.
- Submit one test signature and confirm:
  - it appears on the web page
  - it appears in Google Sheets
  - refresh still loads it from Google Sheets
- Remove any test row from Google Sheets before public launch.
- Confirm the official image and wording are approved by the responsible unit.

## Quick Local Preview

Open `index.html` directly, or run:

```powershell
rtk npx -y serve -l 4173 .
```

Then open:

```text
http://localhost:4173
```

## Handoff Summary

The design/background pass is mostly in place. The site is still a prototype until the Google Apps Script `/exec` URL is inserted into `js/app.js` and tested with a real Google Sheet. Hosting is not evidenced in the repo yet, although a GitHub remote is configured.
