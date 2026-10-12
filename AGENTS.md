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

### Backup location
Backups save to `backend/backups/YYYY-MM-DD/` as JSON files.

### Recovery if data is lost
- Question data: Re-import from `backend/backups/` or Desktop/scrap JSONL files
- Taxonomy: Re-import from `C:\Users\saran\Documents\taxonomy\data\taxonomy.db`
  ```
  node backend/prisma/import-taxonomy.js
  ```
