# ADR 0002 — API keys live in session memory only

- Status: accepted (supersedes a short-lived opt-in persistence experiment)
- Date: 2026-11-24

## Context

BYOK requires a provider key. Persisting it in localStorage would save one re-entry
per browser restart. An opt-in "remember this key" implementation was built, then
removed.

## Decision

Keys stay in module memory (`src/ai/session.ts`) and die with the page. They are
never written to IndexedDB, localStorage, `.dcopilot` exports, diagnostics, URLs or
logs. `settingsRowSchema` is strict and `updateSettings` rejects secret-shaped
fields, so a key cannot leak into settings by accident.

## Consequences

- Users re-enter the key after a reload; that is the accepted cost.
- A long-lived plaintext credential (readable by same-origin XSS, extensions, other
  local accounts and sync tools) is no longer on disk. WebCrypto-wrapping it would
  not help: the decryption key would be same-origin too.
- Migration to persistent storage would require editing the README security model,
  the privacy policy, the terms and 8 dictionaries — i.e. it is a product decision.
