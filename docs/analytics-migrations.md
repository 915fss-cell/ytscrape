# Analytics database migration

The canonical fresh-database migration is `migrations/001_analytics_schema.sql`. It creates the eight analytics tables, enums, constraints, foreign keys, defaults, and indexes used by `ytscrape.persistence`.

Apply it only to a fresh or explicitly approved database, using a PostgreSQL client with `DATABASE_URL` configured:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_analytics_schema.sql
```

The migration is intentionally not an automatic startup action. Before applying it to an existing database, inspect the live schema and take a backup; do not re-run it against a database that already contains these objects unless the migration is made idempotent as a separate, reviewed change.

## Statistics limitation

The current InnerTube `player` response reliably exposes `viewCount`. This version of the scraper does not expose reliable numeric like or comment counts in `VideoDetails`; those snapshot columns therefore remain `NULL`. A missing or hidden metric must not be represented as zero. Comments are available through the separate comments endpoint, but the aggregate count is not treated as a reliable player metric here.
