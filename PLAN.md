# MilkDiary (milk provider app): Plan

Status: **approved. Implementation follows the phase order below.**

## 1. Context

An existing household app (`E:\DairyManagementApp`, "MilkDiary" for households) lets one household record the milk a milkman delivers each day and produces the month-end bill. It is single-tenant, stores everything in local SQLite and has no server.

This project is the other side: an app for the **milk provider (milkman)** who serves many households. It is a separate, standalone project. It shares no workspace with the household app; the logic it needs is copied in (see section 5).

### Decisions confirmed with the owner

| Topic | Decision |
|---|---|
| v1 jobs | Customer list + rates, daily delivery tick-off, monthly bills for all customers, payments + dues |
| Data link to household app | None. Standalone. Bills and messages leave the app only through WhatsApp / PDF |
| Backend | None. Local SQLite on the phone, JSON backup |
| Project | Standalone project at `E:\MilkDiary`, single Expo package, not a monorepo |
| Shared code | Copied from the household app, not linked |
| Languages | English and Marathi |
| Platform | Android only for v1 |
| App name | DairyManager (first called MilkDiary) |
| Pricing | Per customer; milk-type default rate seeds a new customer; bulk "change rate from date" action |

### Open item

The household app already uses package `app.milkdiary` and scheme `milkdiary`. Installing two apps with one application ID overwrites the first. Proposed for this app: package/bundle `app.milkdiary.provider`, scheme `milkdiaryprovider`, display name "MilkDiary Provider". Confirmed; the display name was later changed to "DairyManager".

### Pricing note

A layered "price list + per-customer override" does not fit the billing engine. `inForce` picks the record with the latest `effective_from`, so a later list-price change would silently beat an older customer override. Rates are therefore stored per customer only. `milk_type.default_paise_per_litre` seeds a new customer's first rate, and a bulk action writes new rate rows for all or selected customers from a date.

## 2. Key insight

`monthBill()` (`billing.ts`) and `ledger()` (`ledger.ts`) are pure functions that take `types / rates / plans / entries / pauses / payments`. The provider app calls them once per customer with that customer's rows. **No change to the engine.**

## 3. Data model (SQLite `milkdiary-provider.db`)

Append-only `MIGRATIONS` array keyed on `PRAGMA user_version`, same pattern as the household app's `db.ts`. Money is whole paise, milk is whole millilitres, dates are `YYYY-MM-DD` strings.

- `milk_type(id, name, sort, active, default_paise_per_litre)`
- `customer(id, name, phone, address, route_order, active, created_on)`
- `rate(customer_id, milk_type_id, effective_from, paise_per_litre)`, PK on all three
- `plan(customer_id, milk_type_id, effective_from, qty_ml)`, PK on all three
- `day_entry(customer_id, date, milk_type_id, qty_ml)`: exceptions only; a quantity equal to the plan deletes the row
- `pause(id, customer_id, from_date, resume_on)`
- `payment(id, customer_id, paid_on, amount_paise, note)`, `payment_month(payment_id, month, amount_paise)`, `credit_use(id, customer_id, month, amount_paise, used_on)`
- `tick(customer_id, date)`: route progress only, **never affects billing** (a bill assumes the plan was delivered unless an exception exists)
- `setting(key, value)`: business name, phone, language

Tables are small; loaders read whole tables, as the household app does.

## 4. Screens (bottom tabs)

1. **Today**: date header with previous/next day, customers in `route_order` with planned quantity. Tap to tick delivered. Edit sheet to change quantity or mark not delivered, plus a note. Progress counter ("12/40 done").
2. **Customers**: list with search. Add/edit customer (name, phone, address, milks, quantity, rate seeded from default, start date, route order). Pause, deactivate. Customer detail: month calendar, bill, payments.
3. **Bills**: month picker, per-customer bill from `monthBill`, share as PDF/image/WhatsApp, "send all" stepper.
4. **Dues**: total owed, per-customer outstanding from `outstanding(ledger(...))`, record payment (advance, part, multi-month, credit), receipt and reminder via WhatsApp.
5. **Setup**: business name/phone, language, milk types with default rate, bulk rate change, JSON backup.

## 5. Reuse: copy, do not rewrite

Copy from `E:\DairyManagementApp\code\shared\src` into `src/lib` together with their vitest tests from `code/shared/test`:
`billing`, `ledger`, `money`, `quantity`, `dates`, `i18n`, `mr`, `templates`, and the wa.me helpers (`whatsappNumber`, `whatsappUrl`) from `messages`.

Copy from `E:\DairyManagementApp\code\mobile\src` into `src/ui`: `theme.ts`, `ui.tsx`. Adapt `billHtml.ts` rather than forking its logic: change the header from household/milkman to business/customer.

Record provenance (source path and date copied) in `DEVELOPMENT.md`. Fixes to copied code are made here and noted; there is no automatic sync with the household app.

New code in `src/lib`: `sellerMessages.ts` with seller-voiced `customerBillMessage`, `receiptMessage`, `dueReminderMessage` (the household `messages.ts` is written from buyer to milkman). Marathi strings go in `mr.ts`.

## 6. Phases

Each phase ends in a runnable, verified state. Stop for owner review between phases.

### Phase 0: Documentation and design review
`PLAN.md`, `DEVELOPMENT.md`, then a presentation with every UI flow as phone frames (390x844, styled with the household design tokens: navy `#0F2A4A`, blue `#2563A8`, milk `#F7F5EE`, butter `#F2C14E`, Nunito 800 / Hanken Grotesk). Exit: owner approves flows.

### Phase 1: Foundation
Scaffold the Expo project, set package/scheme (section 1, open item), copy `src/lib` and `src/ui`, run the copied tests green, render five empty tabs. Exit: `npm test` and `npm run typecheck` green; app starts on an Android device or emulator.

### Phase 2: Data layer
`src/db.ts` with migrations, settings and language. Loaders: setup, customer, month, ledger, all-dues. Writers: customers, milk types, per-customer rate and plan, day entries, pauses (with overlap check), payments, credit, ticks, bulk rate change, export. Exit: typecheck green; pure helpers tested.

### Phase 3: Setup and Customers
Setup tab and customer list/add/edit/deactivate with route order. Exit: add three customers, restart the app, data persists.

### Phase 4: Today (delivery tick-off)
Route list, tick, edit sheet, progress counter, pause from customer detail. Exit: an edited day changes the bill; a tick does not.

### Phase 5: Bills
Month picker, per-customer bill, generalised bill HTML, PDF/image export, WhatsApp share, "send all". `sellerMessages.ts` with tests. Exit: totals equal the household app's for identical inputs (unit test).

### Phase 6: Payments and Dues
Dues overview, customer ledger, record payment with `splitPayment`, advance and credit, receipt and reminder messages, bulk rate change UI. Exit: part payment, advance and credit flows match the copied `ledger` tests.

### Phase 7: Polish and release
Marathi pass over all new strings, empty and error states, backup check, Android build, README. Exit: full manual run-through of section 8.

## 7. Out of scope (v1)

Backend or sync, linking with household app data, iOS, multi-user or delivery-boy accounts, inventory or procurement, online payments.

## 8. Verification

- `npm test` and `npm run typecheck` green, including the new seller-message tests.
- Unit test: two customers with different rates, plans and pauses produce independent bills and dues, equal to household-app output for the same inputs.
- Device run (Android): add three customers, tick one day and edit another, change a rate mid-month, generate a bill PDF, record a part payment, check Dues totals, switch to Marathi, export and re-check the backup.
