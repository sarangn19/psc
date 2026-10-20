# AGENTS.md — Database Safety Rules

## CRITICAL: Never lose data again

### What happened
On 2026-09-08, `prisma db push --force-reset` destroyed all database data (12k questions, taxonomy, user progress). The database could not be recovered.

### Rules

1. **NEVER use `--force-reset`** — it drops ALL tables and destroys data
2. **NEVER use `--accept-data-loss` without explicit user permission**
3. **ALWAYS backup before schema changes:**
   ```
   npm run db:backup
   ```
4. **Use safe scripts for schema changes:**
   ```
   npm run db:push      # applies schema changes safely
   npm run db:migrate    # runs pending migrations
   npm run db:status     # shows current DB counts
   ```
5. **If you must run prisma directly**, use:
   ```
   npx prisma db push --schema=backend/prisma/schema.prisma
   ```
   Never add `--force-reset`.
6. **Questions are NEVER deleted.** Ever. The only permitted mutations are
   `isActive = false` (deactivate) and repointing `chapterId` / `conceptId`
   (move). If a task seems to require deleting a question, stop and ask.
   Baseline: **45,385 questions** in `questions`, each with a non-null `exam`.

### Before any `db push`: check drift first

`db push` reconciles the *whole* public schema against `schema.prisma`, so it
will drop any table, column, index or constraint that exists in the database but
is not modelled — regardless of whether that is what you meant to change.

Inspect what it would actually do **without applying anything**:

```
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel backend/prisma/schema.prisma --script
```

Run it from `backend/` (or load `backend/.env` yourself — the CLI needs
`DIRECT_URL`). If the output contains any `DROP TABLE` / `DROP COLUMN`, stop.
Fix the drift (usually by modelling the missing object) rather than accepting
the loss.

### Landmine defused 2026-10-20

These existed in the database but not in `schema.prisma`, so a routine
`db push` would have dropped them:

- `questions.exam` — 45,385 non-null values
- `users.subscription_status` / `_plan` / `_ends_at` / `_granted_by` / `_granted_at`
- `current_affairs` (209), `ca_quiz_questions` (209), `ca_fetch_log` (2)

They are now modelled in `schema.prisma`. `exam` and the `subscription_*` fields
need explicit `@map` because the database uses snake_case column names while
Prisma keeps field names verbatim. The three `ca_*` tables are legacy output of
the retired current-affairs pipeline and are modelled with no relations (their
FK is `integer` -> `bigint`, which Prisma will not accept), so a future push may
drop that one constraint — a constraint on dead data, no rows affected.

### Backup location
Backups save to `backend/backups/YYYY-MM-DD/` as JSON files.

### Recovery if data is lost
- Question data: Re-import from `backend/backups/` or Desktop/scrap JSONL files
- Taxonomy: Re-import from `C:\Users\saran\Documents\taxonomy\data\taxonomy.db`
  ```
  node backend/prisma/import-taxonomy.js
  ```
