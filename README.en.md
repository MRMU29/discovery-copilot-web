English | [简体中文](./README.md)

# Discovery Copilot (Web)

An account-free, local-first (IndexedDB), BYOK product discovery workspace that migrates across devices via `.dcopilot` files.
Live: <https://discovery-copilot-web.pages.dev>

## Features

- **Projects**: create / edit / delete (30-day recycle bin) / one-click sample project
- **Key assumptions**: eight risk categories, Impact × Risk × (1 − Confidence) prioritization, Recharts priority matrix (with an equivalent table view)
- **Experiments**: generate from assumptions → review → save → status & result write-back
- **Opportunity solution tree (OST)**: drag & drop + pinch zoom + keyboard equivalents + table view + viewport culling
- **AI Copilot**: BYOK direct calls (OpenAI-compatible / Gemini) and Prompt Relay (zero-setup copy & paste); identify / experiment / report tasks; review-first workflow (preview / apply / reject / regenerate / cancel)
- **Cost guardrails**: pre-request token & cost estimates, budget circuit breakers (per-request + monthly), daily usage view
- **Discovery reports**: AI-generated or hand-written, AI vs. user-confirmed content distinguished; HTML (faithful, recommended) / PNG (best-effort) export
- **Backup & migration**: `.dcopilot` export (all / single project), import (six-scenario validation, conflict strategies, rollback on failure), automatic pre-overwrite snapshots (3 kept)
- **Appearance & language**: light / dark / follow-system themes (no first-frame flash), launch-screen animation, 8 interface languages (zh-Hans / zh-Hant / en / ja / ko / ru / de / fr, migrating with `.dcopilot`)
- **Privacy & observability**: data stays local, de-identified diagnostics export

## Tech stack

React 18 + TypeScript + Vite · Tailwind CSS 4 (single-source design tokens in `src/styles/tokens.css`) · Dexie + IndexedDB · React Router · Zustand (UI state only) · dnd-kit · Recharts · Zod · marked + DOMPurify · html-to-image · Vitest + fake-indexeddb

## Development

```bash
pnpm install
pnpm dev              # dev server (add --host to test from a phone)
pnpm build            # type check + production build
pnpm test             # full Vitest suite (includes a 20 MB import stress probe)
pnpm test:coverage    # coverage gate (schemas/db/ai lines >= 80%)
pnpm lint && pnpm typecheck
pnpm preview          # preview the production build locally
pnpm probe:provider-cors   # provider direct-call CORS matrix (no key needed)
```

- Token preview: `/dev/tokens`; PNG fidelity probe: `/dev/export-probe` (dev mode only)

## How it is built

One human owner (requirements, architecture decisions, per-command acceptance) working with orchestrated AI agents:

| Role | Responsibility |
| ------------------------------------- | ------------------------ |
| MRMU29 | Product decisions, architecture, command-by-command acceptance |
| GLM-5.3-Flash (ZCode) | Command-driven development & deployment |
| DeepSeek V4.1-Flash (DeepSeek Harness) | Code review & testing |
| GPT-5.6-Luna (Codex) | Project planning |

"Command-driven development": the human issues one command at a time; the AI completes it, reports in five sections (file tree / key code / run & debug / acceptance results / open questions), and waits for the next command.

## Asset provenance

- App icon & brand imagery: original project artwork (`public/brand-icon.jpg`)
- Interface icons: hand-drawn inline SVGs (`src/components/ui/icons.tsx`), no third-party icon assets
- All runtime dependencies are open-source libraries; see `package.json` / `pnpm-lock.yaml`

## Deployment

The build output is fully static (`pnpm build` → `dist/`) and works on any static host. This repository deploys to **Cloudflare Pages** (connected to GitHub; every push to `main` auto-builds):

1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect `MRMU29/discovery-copilot-web`
2. Build command `pnpm build`, output directory `dist`
3. Recommended env vars: `NODE_VERSION=24`, `PNPM_VERSION=12.6` (the Cloudflare build image may ship older defaults)
4. `public/_redirects` (SPA deep-link fallback) and `public/_headers` (CSP and other security headers) take effect automatically with each build

<details>
<summary>Self-hosting (nginx example)</summary>

```nginx
location / {
  try_files $uri $uri/ /index.html;   # SPA fallback
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src *; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

</details>

### A note on CSP

`script-src 'self'` is the injection defense; `connect-src *` is **intentionally open** — BYOK users configure their own AI provider base URLs (any domain), which the app cannot know in advance. The app itself loads no third-party scripts.

## Security model

- **The API Key lives in session memory only** (gone when the page closes): never written to IndexedDB or localStorage, never exported with `.dcopilot`, never placed in URLs or logs; there is no "remember key" feature. Re-enter the key after importing a backup on a new device.
- Backup files (`.dcopilot`) and diagnostics contain no secrets; diagnostics hold only de-identified metadata (versions, browser environment, storage overview, last 50 AI request metadata records) with a full preview before export.
- AI output (including report Markdown) is sanitized with DOMPurify both for in-app rendering and exported files (protocol allow-list, XSS defense).
- The app ships a full Privacy Policy and Terms of Use (with a disclaimer) in-app under Settings → About → Product & documents.

## Privacy & data retention

- Project data lives only in your current browser (IndexedDB); clearing site data or uninstalling the browser = unrecoverable loss, so export backups first.
- When you call AI, the relevant input is sent to the AI service **you configured** and handled under its privacy policy; in Prompt Relay mode the content is handed to the external AI by you and never passes through any server of this app.
- No account, no telemetry, no server, no tracking cookies; static pages are served by the hosting platform.
- Settings → About → Reset app deletes all local data and returns the storage space.

## Pre-release security checks

Run before releasing or contributing:

```bash
pnpm security:check
```

The script (`scripts/security-check.mjs`) fails on any of three checks:

1. `git ls-files` must not contain sensitive paths (`.env*`, `*.pem`, `*.key`, `*.dcopilot`, …)
2. All text sources must not match real credential shapes (length-gated patterns for OpenAI/GitHub/AWS/Google/Anthropic keys)
3. The release repository must not include internal workspace docs (AGENTS/HANDOFF/acceptance records, etc.)

A second gate runs before local release builds: `scripts/prepare-release.mjs` rebuilds the release tree and aborts if it contains any internal material, user data, or credential shapes.

On the GitHub side: Secret Scanning, Push Protection, Dependabot alerts and `.github/dependabot.yml` (weekly npm / GitHub Actions checks) are enabled. `.env.example` documents naming conventions only — the app needs no environment variables at runtime.

## Browser support baseline

- **P0**: Windows Chrome / Edge (latest two major versions); Android Chrome (latest)
- **Best effort**: Safari 16+, iOS Safari 16+, Firefox (latest two major versions)
- **Known differences**: tighter storage quota on iOS Safari, background tabs may interrupt long transactions, higher memory peaks on large imports

## Known limitations

1. Score audit trail (score_events) does not migrate with `.dcopilot` (no key in the §7.2 format); current assumption scores migrate fully.
2. PNG report export is best-effort (html-to-image may drift on complex gradients/custom fonts) — **use HTML export for faithful sharing**.
3. Session-memory API keys mean re-entry after every refresh / browser restart (use "save for this session" in Settings).
4. Capacity limits (§5.4): <= 50 local projects, <= 200 assumptions / 300 OST nodes / 100 experiments / 20 reports per project; imports <= 20 MB per file.
5. BYOK direct calls depend on each provider's CORS policy — use a compatible proxy for providers that block browsers (`pnpm probe:provider-cors` probes without a key).
6. No auto-sync: **local data is the only copy** — export `.dcopilot` backups regularly (deleted projects are restorable from the recycle bin for 30 days).

## Tests

229 unit + integration tests (Vitest, fake-indexeddb covering IndexedDB transactions and migrations); dedicated tests for all six import scenarios (valid / invalid / corrupted / legacy / conflict / rollback); coverage gate at schemas/db/ai lines >= 80%.

## License

[MIT](./LICENSE)
