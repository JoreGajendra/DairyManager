/**
 * The schema, as an append-only list. Step `n` takes the file from
 * `user_version` n to n + 1. Never edit an entry that has shipped; add a new one.
 * Pure data (no expo-sqlite), so tests can run it against an in-memory SQLite.
 */
export const MIGRATIONS: string[] = [
  `CREATE TABLE milk_type (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     sort INTEGER NOT NULL DEFAULT 0,
     active INTEGER NOT NULL DEFAULT 1,
     default_paise_per_litre INTEGER NOT NULL DEFAULT 0 CHECK (default_paise_per_litre >= 0)
   );
   CREATE TABLE customer (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     phone TEXT NOT NULL DEFAULT '',
     address TEXT NOT NULL DEFAULT '',
     route_order INTEGER NOT NULL DEFAULT 0,
     active INTEGER NOT NULL DEFAULT 1,
     created_on TEXT NOT NULL
   );
   CREATE TABLE rate (
     customer_id INTEGER NOT NULL REFERENCES customer(id),
     milk_type_id INTEGER NOT NULL REFERENCES milk_type(id),
     effective_from TEXT NOT NULL,
     paise_per_litre INTEGER NOT NULL CHECK (paise_per_litre >= 0),
     PRIMARY KEY (customer_id, milk_type_id, effective_from)
   );
   CREATE TABLE plan (
     customer_id INTEGER NOT NULL REFERENCES customer(id),
     milk_type_id INTEGER NOT NULL REFERENCES milk_type(id),
     effective_from TEXT NOT NULL,
     qty_ml INTEGER NOT NULL CHECK (qty_ml >= 0),
     PRIMARY KEY (customer_id, milk_type_id, effective_from)
   );
   CREATE TABLE day_entry (
     customer_id INTEGER NOT NULL REFERENCES customer(id),
     date TEXT NOT NULL,
     milk_type_id INTEGER NOT NULL REFERENCES milk_type(id),
     qty_ml INTEGER NOT NULL CHECK (qty_ml >= 0),
     PRIMARY KEY (customer_id, date, milk_type_id)
   );
   CREATE TABLE pause (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     customer_id INTEGER NOT NULL REFERENCES customer(id),
     from_date TEXT NOT NULL,
     resume_on TEXT,
     CHECK (resume_on IS NULL OR resume_on > from_date)
   );
   CREATE TABLE payment (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     customer_id INTEGER NOT NULL REFERENCES customer(id),
     paid_on TEXT NOT NULL,
     amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
     note TEXT NOT NULL DEFAULT ''
   );
   CREATE TABLE payment_month (
     payment_id INTEGER NOT NULL REFERENCES payment(id) ON DELETE CASCADE,
     month TEXT NOT NULL,
     amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
     PRIMARY KEY (payment_id, month)
   );
   CREATE TABLE credit_use (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     customer_id INTEGER NOT NULL REFERENCES customer(id),
     month TEXT NOT NULL,
     amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
     used_on TEXT NOT NULL
   );
   CREATE TABLE tick (
     customer_id INTEGER NOT NULL REFERENCES customer(id),
     date TEXT NOT NULL,
     PRIMARY KEY (customer_id, date)
   );
   CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE INDEX day_entry_date ON day_entry (date);
   CREATE INDEX payment_customer ON payment (customer_id);`,
]
