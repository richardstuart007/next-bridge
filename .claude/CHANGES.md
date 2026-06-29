# Changes — next-bridge, "version": "0.1.2"

## nextjs-shared — table_copy_data.ts
- After INSERT, query `information_schema.columns` for identity columns in the destination table and call `setval(pg_get_serial_sequence(...), MAX(...))` for each — fixes duplicate PK errors when cron runs after a table copy
