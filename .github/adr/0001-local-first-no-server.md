# ADR 0001 — Local-first, no server, no account

- Status: accepted
- Date: 2026-11-24

## Context

The product records assumptions, experiments and reports for a single user. The
audit asked why there is no sync backend; the alternative (accounts + server
storage) would be the conventional answer for a SaaS workbench.

## Decision

The browser is the only data store (IndexedDB via Dexie). There is no account, no
server, no telemetry and no service worker. `.dcopilot` files are the only
cross-device boundary.

## Consequences

- Adding any server-backed feature breaks the security model in one step, so it is
  a product decision, not an implementation detail.
- "Local data is the only copy" makes export health a first-class UI concern: the
  dashboard nudges when no `.dcopilot` export has been made for 30 days.
- No sync means no conflict resolution; the import pipeline instead offers
  duplicate / conflict / rollback handling and pre-import snapshots.
- Offline use is best-effort (browser cache only) and is documented as such rather
  than promised.
