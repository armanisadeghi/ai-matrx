# Admin custom tables

**Status:** Live. **Page:** `/administration/database/custom-tables`.

Lists EVERY organization's tables through one call, `custom.admin_all_tables()` (client door `adminAllTables` in `@ai-matrx/records`). The store's own walls admit a platform admin only to system organizations, so `dataHomeTables`/`tableList` could never list the rest. The function answers only when the request rides the admin lane for a platform admin; anyone else is refused with 42501, never an empty list. Archive still goes through the store's `tableArchive` and the store's refusal for an organization the admin is not a member of is shown per table.
