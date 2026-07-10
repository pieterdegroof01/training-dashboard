## Backup-verificatielog

- 2026-07-10: Railway Postgres backup geverifieerd via pg_dump -Fc → wegwerp-container (PG 18.4, backup-verify/railway-20260710-100154.dump, 4.5M). Restore-diff (rijaantallen 10 tabellen, activities mmp/streams/max(start_date), activity_streams raw-grootte, users jsonb-checks) tegen productie: leeg. Backup is inhoudelijk compleet.

## Voortgangsregel

PROGRESS.md in de repo-root is het statusoverzicht van alle handoff-clusters. Elke commit die een item (deels) uitvoert MOET in dezelfde commit de bijbehorende regel in PROGRESS.md bijwerken: status en datum. Nieuwe clusters uit toekomstige handoffs worden bij hun eerste uitvoering toegevoegd.
