# DairyManager

Android app for a milk provider (milkman) who serves many households. For each customer it tracks the daily delivery, produces the month bill, and records payments and dues. English and Marathi.

Everything is stored in a local SQLite database on the phone. There is no server, no sync and no link to the household MilkDiary app. Data leaves the phone only through WhatsApp, PDF/image share and JSON backup.

## Screens

| Tab | Purpose |
|---|---|
| Today | Route list in delivery order. Tap to tick a delivery; edit the quantity or mark not delivered. Progress counter. |
| Customers | Add, edit, pause and deactivate customers. Plan, rate and route order per customer. |
| Bills | Month picker, per-customer bill, share as PDF, image or WhatsApp, "send all" stepper. |
| Dues | Total owed, per-customer outstanding, record payment (advance, part, multi-month, credit), receipt and reminder messages. |
| Setup | Business name and phone, language, milk types with default rate, bulk rate change, JSON backup and restore. |

## Requirements

- Node 22 or later
- Android device or emulator, with the Android SDK for local builds

## Commands

```
npm install
npm start            # Expo dev server
npm run android      # build and run on a device or emulator
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

## Identity

- Application ID: `app.milkdiary.provider`
- Scheme: `milkdiaryprovider`
- Display name: DairyManager

The household app uses `app.milkdiary`, so both can be installed side by side.

## Layout

```
App.tsx            tabs
src/db.ts          SQLite access
src/migrations.ts  append-only migrations
src/dataHelpers.ts pure data helpers
src/billHtml.ts    bill HTML for PDF/image
src/lib/           billing, ledger, money, dates, i18n, Marathi strings, message builders
src/ui/            theme and shared components
src/screens/       one folder per tab
test/              vitest suites
```

## Data rules

- Money is integer paise, milk is integer millilitres. No floats. Rupee rounding happens once per bill.
- Dates are `YYYY-MM-DD`, months `YYYY-MM`.
- Rates and plans are effective-dated. A change adds a row with a new `effective_from`; old rows are never edited.
- Only exceptions are stored per day. A quantity equal to the plan removes the row.
- Ticks record route progress only. They never change a bill.
- Rates are per customer. The milk-type default rate only seeds a new customer.
- Migrations are append-only. Add a new entry; never edit an old one.

## Backup

Setup, Backup exports all data as JSON. Restoring replaces the current data and applies the saved language.

## Origin of shared code

The billing engine, ledger, i18n and UI primitives are copied from the household app. There is no automatic sync. See `DEVELOPMENT.md` for provenance and `PLAN.md` for decisions and phases.
