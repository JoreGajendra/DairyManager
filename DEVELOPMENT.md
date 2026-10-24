# Development notes

Guide for working in this repo.

## Status

Phases 0 to 6 are done and Phase 7 (polish and release) is in progress. `PLAN.md` holds the decisions, schema, screens and phases. Run `npm test` and `npm run typecheck` before every commit.

## What this is

DairyManager (provider side; the household app is "MilkDiary"): an Android app for a milk provider (milkman) who serves many households. Per customer it tracks the daily delivery, produces the month bill and records payments and dues. It is a standalone project. The household-side app lives at `E:\DairyManagementApp` and is not modified from here.

## Planned layout

```
E:\MilkDiary
  PLAN.md  DEVELOPMENT.md
  App.tsx            tabs: Today, Customers, Bills, Dues, Setup
  src/db.ts          SQLite + append-only migrations
  src/lib/           copied pure logic + sellerMessages.ts (vitest)
  src/ui/            theme.ts, ui.tsx (copied)
  src/screens/
  test/
```

Single Expo package (Expo ~57, React Native 0.86, React 19, TypeScript, expo-sqlite, vitest). Node 22 or later. Commands once scaffolded: `npm test`, `npm run typecheck`, `npm start`.

## Rules that must hold

- **Money is integer paise, milk is integer millilitres.** Never floats. Rupee rounding happens once per bill (`toRupee`).
- **Dates are `YYYY-MM-DD` strings, months `YYYY-MM`.** Use the helpers in `dates.ts`.
- **Rates and plans are effective-dated and never edited in place.** Add a row with a new `effective_from`; the engine uses the latest on or before each day (`inForce`).
- **Only exceptions are stored per day** (`day_entry`). A quantity equal to the plan deletes the row. `tick` rows are route progress and must never influence billing.
- **Rates live per customer.** `milk_type.default_paise_per_litre` only seeds a new customer; a bulk action writes rate rows. Do not add layered list-price lookups.
- **Migrations are append-only.** Add a new entry to `MIGRATIONS`; never edit an old one.
- **All user-visible text goes through `tr()`** with a Marathi entry in `mr.ts`. Bills and messages are written in the saved language.
- **Billing engine stays unchanged.** Call `monthBill` / `ledger` once per customer with that customer's rows. If a change to the engine seems necessary, raise it with the owner first.
- **No server, no sync, no link to the household app.** Data leaves only via WhatsApp, PDF/image share and JSON backup.
- Do not hold more than one SQLite connection; use `withExclusiveTransactionAsync` for multi-statement writes.

## Copied code provenance

Copied from `E:\DairyManagementApp\code` (copied 2026-10-24, Phase 1):

- `shared/src` to `src/lib`: `billing`, `ledger`, `money`, `quantity`, `dates`, `i18n`, `mr`, `templates` unchanged; `whatsappNumber`/`whatsappUrl` from `messages` into `whatsapp.ts` (buyer-voiced builders not copied). `mr.ts` still holds household-app entries; prune in later phases
- `shared/test` to `test/`: billing, i18n, templates, pause, sheet (i18n adapted: no message-builder test, no leftover-key test, scans this repo); wa.me cases in `whatsapp.test.ts`
- `mobile/src` to `src/ui`: `theme.ts`, `ui.tsx` (import paths only). `billHtml.ts` copied to `src/billHtml.ts` 2026-10-24 (Phase 5): billing/layout logic unchanged; header is business to customer via a local `BillHeader` type (no db dependency); builders set the bill's language and restore it
- `mobile/assets` (icons, fonts) copied as is

There is no automatic sync. A fix made in one project must be applied by hand to the other if it applies there.

## Open item

Application ID confirmed by the owner: `app.milkdiary.provider`, scheme `milkdiaryprovider`, display name "DairyManager" (renamed 2026-10-24, DairyDesk then DairyManager; ID and scheme unchanged) (household app uses `app.milkdiary` / `milkdiary`).

## Design tokens

Navy `#0F2A4A`, blue `#2563A8`, milk `#F7F5EE`, butter `#F2C14E`. Nunito 800 for headings, Hanken Grotesk for body. Phone frames in mockups are 390x844.
