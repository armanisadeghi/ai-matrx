# SOCIAL_BASELINE Backfill — Variant Rows Polluting User Tree

> **STATUS: 🟢 RESOLVED — Python team shipped both halves of the fix.**
> Kept as a historical record of the bug + the data we used to diagnose
> it. See [features/files/from_python/UPDATES.md §9](../features/files/from_python/UPDATES.md)
> (2026-05-16 "Phase 1d.3" entry) for the resolution:
>
> - Migration 012 added the `parent_file_id IS NULL` + `file_path NOT
>   LIKE 'system-files/%'` filters to `cld_get_user_file_tree`,
>   `cld_search_files`, and `cld_list_trash`.
> - Migration 013 backfilled `parent_file_id` + `derivation_kind` on
>   1,565 legit first-level variants and soft-deleted 6,152 cascade-
>   junk rows.
> - S3 cleanup CLI deleted 6,152 objects, reclaimed ~134 MB.
> - Write-path guards (`generate_thumbnail_for_file` + backfill
>   `_next_batch` filter) prevent the cascade from recurring.
>
> Verified live (2026-05-17): zero alive `system-files/` rows with
> NULL `parent_file_id` or `derivation_kind`.
>
> ---
>
> Original bug report follows.
>
> Self-contained: every claim is backed by a SQL query you can run
> against the production Postgres (`txzxabzwovsujtloxrus`, Matrx Main,
> us-west-1).
>
> **TL;DR:** The Phase 1b SOCIAL_BASELINE backfill (the script that ran
> 2026-05-16 23:52–00:20 UTC) writes one `cld_files` row per generated
> variant (`og.jpg` / `thumb.jpg` / `tiny.jpg` / `page1_url.jpg`) under
> `system-files/variants/<source_file_id>/`. Those rows are created
> with `parent_file_id = NULL`, `derivation_kind = NULL`, and
> `metadata = {}`. They have no in-band signal identifying them as
> variants, and `cld_get_user_file_tree` returns them, so they appear
> as files in the user's `/files` page. For an account with ~5k user
> uploads the script adds ~8k phantom tree entries (~62% noise).
>
> **The fix needs both halves:**
>
> 1. Stop the bleeding — `cld_get_user_file_tree` should exclude
>    `system-files/%` paths, OR the variant rows should not be written
>    into `cld_files` at all.
> 2. Make the data correct — backfill / forward writes need to set
>    `parent_file_id` + `derivation_kind` on every variant row so
>    consumers can identify them by data shape, not path string.
>
> **Reporter:** Frontend team (Arman + Cursor agent), 2026-05-16
> 17:55 PT.

---

## 1. What the backfill actually wrote

### 1a. Folder count

```sql
SELECT
  COUNT(*) FILTER (WHERE folder_path = 'system-files')              AS root_folder,
  COUNT(*) FILTER (WHERE folder_path = 'system-files/variants')     AS mid_folder,
  COUNT(*) FILTER (WHERE folder_path LIKE 'system-files/variants/%') AS leaf_folders
FROM cld_folders
WHERE owner_id = '4cf62e4e-2679-484f-b652-034e697418df'::uuid
  AND deleted_at IS NULL;
```

Result (Arman's account, 2026-05-16):

| root_folder | mid_folder | leaf_folders |
|---|---|---|
| 1 | 1 | 1,984 |

The script creates **one leaf folder per source file** (named after
the source file's UUID), under `system-files/variants/`.

### 1b. File count by variant name

```sql
SELECT file_name, COUNT(*)
FROM cld_files
WHERE owner_id = '4cf62e4e-2679-484f-b652-034e697418df'::uuid
  AND file_path LIKE 'system-files/%'
  AND deleted_at IS NULL
GROUP BY 1
ORDER BY 2 DESC;
```

Result:

| file_name | count |
|---|---|
| `og.jpg` | 1,983 |
| `thumb.jpg` | 1,980 |
| `tiny.jpg` | 1,979 |
| `page1_url.jpg` | 75 |
| **Total** | **6,017** |

The 3-way ~1,980 count means almost every image got the SOCIAL_BASELINE
trio. The 75 `page1_url.jpg` matches the number of `application/pdf`
files in the account.

### 1c. Path layout

```
system-files/
└── variants/
    └── <source_file_id_uuid>/
        ├── og.jpg
        ├── thumb.jpg
        ├── tiny.jpg
        └── page1_url.jpg     (PDF source files only)
```

Sample rows (raw SELECT from `cld_files`):

```sql
SELECT id, file_path, file_name, mime_type, parent_file_id,
       derivation_kind, metadata, size_bytes
FROM cld_files
WHERE owner_id = '4cf62e4e-2679-484f-b652-034e697418df'::uuid
  AND file_path LIKE 'system-files/%'
LIMIT 4;
```

| id | file_path | file_name | mime_type | parent_file_id | derivation_kind | metadata | size_bytes |
|---|---|---|---|---|---|---|---|
| `1fd8d821-…` | `system-files/variants/8b057674-…/thumb.jpg` | thumb.jpg | image/jpeg | **NULL** | **NULL** | `{}` | 4852 |
| `17690252-…` | `system-files/variants/8a79a79e-…/og.jpg` | og.jpg | image/jpeg | **NULL** | **NULL** | `{}` | 8607 |
| `8beab33a-…` | `system-files/variants/3f52707a-…/tiny.jpg` | tiny.jpg | image/jpeg | **NULL** | **NULL** | `{}` | 2238 |
| `e09b5063-…` | `system-files/variants/d4600dfe-…/thumb.jpg` | thumb.jpg | image/jpeg | **NULL** | **NULL** | `{}` | 14843 |

### 1d. Timeline

```sql
SELECT
  DATE_TRUNC('minute', created_at) AS minute,
  COUNT(*)
FROM cld_files
WHERE owner_id = '4cf62e4e-2679-484f-b652-034e697418df'::uuid
  AND file_path LIKE 'system-files/%'
GROUP BY 1
ORDER BY 1
LIMIT 5;
```

First minute the backfill ran was `2026-05-16 23:52 UTC`, last was
`2026-05-17 00:20 UTC` — ~28 minutes total for ~6k rows on this
account. Confirms it was a single script execution, not gradual
upload-triggered writes.

---

## 2. What's missing on every variant row

| Field | Current value | Expected value | Why |
|---|---|---|---|
| `parent_file_id` | `NULL` | source file's `cld_files.id` | So consumers can answer "which file is this a variant of?" without parsing the path string. |
| `derivation_kind` | `NULL` | `'og_image'` / `'thumbnail'` / `'tiny_placeholder'` / `'page1_preview'` | So consumers can filter / route by variant role. The string value is whatever your `DerivationKind` enum uses; the FE will adopt the same vocabulary. |
| `metadata` | `{}` | `{ kind: 'variant', source_file_id: '<uuid>', variant_role: 'og_image', dimensions: { width, height } }` (or similar) | Helpful but not strictly required if `parent_file_id` + `derivation_kind` are set. Dimensions specifically help the FE pick the right variant for a given render size without a separate fetch. |
| `visibility` | `'private'` (or inherited) | match the parent file | Today: a private source file's `og.jpg` is also `'private'`. That's correct — but should be explicit / documented. |
| `current_version` | `1` | `1` | OK as-is. |

The variant rows DO have correct values for `id`, `owner_id`,
`file_path`, `file_name`, `mime_type`, `size_bytes`, `created_at`,
`updated_at`, `storage_uri`, `canonical_storage_uri`, `checksum`,
`visibility` — only the relationship fields and metadata are blank.

---

## 3. Impact on the frontend

`cld_get_user_file_tree` (5-arg overload) returns these rows because
its file-leg `WHERE` clause matches anything owned by the user OR
public OR explicitly granted:

```sql
WHERE (p_include_deleted OR f.deleted_at IS NULL)
  AND (
      f.owner_id = p_user_id
      OR f.visibility = 'public'
      OR cld_get_effective_permission(f.id, p_user_id) IS NOT NULL
  )
```

Variant rows have `owner_id = p_user_id` so they pass.

For Arman's account, the wire response shape after pagination
(3 pages, `p_limit=5000`, `p_offset=0,5000,10000`):

```sql
WITH all_rows AS (
  SELECT (
    cld_get_user_file_tree('4cf62e4e-2679-484f-b652-034e697418df'::uuid, 5000, 0,     true, false) ||
    cld_get_user_file_tree('4cf62e4e-2679-484f-b652-034e697418df'::uuid, 5000, 5000,  true, false) ||
    cld_get_user_file_tree('4cf62e4e-2679-484f-b652-034e697418df'::uuid, 5000, 10000, true, false)
  ) AS rows
)
SELECT
  COUNT(*)                                                          AS total_rows,
  COUNT(*) FILTER (WHERE r->>'path' NOT LIKE 'system-files%')       AS visible_after_filter
FROM all_rows, jsonb_array_elements(all_rows.rows) r;
```

| total_rows | visible_after_filter |
|---|---|
| **14,238** | **5,158** |

In other words: **9,080 of the 14,238 wire rows (63.8%) are
backfill-generated infrastructure rows** that the user did not
upload and should never see.

---

## 4. What we shipped on the FE side as a workaround

We added a path-prefix filter at three boundaries — see
`features/files/utils/folder-conventions.ts` (`isSystemPath()`)
and the call sites in:

- `features/files/redux/thunks.ts` → `loadUserFileTree` (full-tree load)
- `features/files/redux/thunks.ts` → `loadFolderContents` (per-folder lazy load)
- `features/files/redux/realtime-middleware.ts` → `handleFilePayload` + `handleFolderPayload` (Postgres Changes INSERT/UPDATE)

The predicate is path-based (matches `system-files` exactly or any
descendant) because that's the only signal carried on the variant
rows today. Once you populate `parent_file_id` + `derivation_kind`,
we'll switch the filter to a data-shape signal and the path
convention becomes optional.

---

## 5. Recommended Python-side fix — three levers

Pick ONE of (A) / (B) / (C) for the read path, plus (D) for the
write path. Ideally (A) + (D), then (B) over time.

### A. Server-side path exclusion in `cld_get_user_file_tree` — fastest unblock

Add the path exclusion to both legs of the UNION. Single migration,
no script needed. After this, the wire response drops the variant
rows entirely and the FE's path filter becomes a defense-in-depth
safety net.

```sql
-- file leg
WHERE (p_include_deleted OR f.deleted_at IS NULL)
  AND f.file_path NOT LIKE 'system-files/%'
  AND f.file_path <> 'system-files'
  AND (
      f.owner_id = p_user_id
      OR cld_get_effective_permission(f.id, p_user_id) IS NOT NULL
  )

-- folder leg
WHERE p_include_folders
  AND (p_include_deleted OR d.deleted_at IS NULL)
  AND d.folder_path NOT LIKE 'system-files%'
  AND d.owner_id = p_user_id
```

(Note: I also dropped the `OR f.visibility = 'public'` clause from
the file leg — that's a separate but related bug tracked in
`features/files/for_python/REQUESTS.md` item 0a. Leave it alone if
you want to fix it separately, but the public-files leak and the
system-files leak should both be fixed before this RPC can be
trusted unchanged.)

### B. Backfill the missing fields on existing variant rows

A second pass over `cld_files` rows under `system-files/variants/`
to populate the relationship fields. SQL sketch:

```sql
-- Step 1: derive source_file_id from path
WITH parsed AS (
  SELECT
    f.id,
    f.file_path,
    f.file_name,
    -- file_path is `system-files/variants/<source_id>/<variant>.jpg`
    split_part(f.file_path, '/', 3)::uuid AS source_file_id,
    CASE f.file_name
      WHEN 'og.jpg'         THEN 'og_image'
      WHEN 'thumb.jpg'      THEN 'thumbnail'
      WHEN 'tiny.jpg'       THEN 'tiny_placeholder'
      WHEN 'page1_url.jpg'  THEN 'page1_preview'
    END AS derivation_kind
  FROM cld_files f
  WHERE f.file_path LIKE 'system-files/variants/%'
    AND f.parent_file_id IS NULL
)
UPDATE cld_files f
SET parent_file_id  = p.source_file_id,
    derivation_kind = p.derivation_kind,
    metadata        = jsonb_build_object(
                        'kind',            'variant',
                        'source_file_id',  p.source_file_id,
                        'variant_role',    p.derivation_kind,
                        'generated_by',    'phase1b_social_baseline_backfill',
                        'generated_at',    f.created_at
                      )
FROM parsed p
WHERE f.id = p.id
  AND EXISTS (SELECT 1 FROM cld_files s WHERE s.id = p.source_file_id);
```

(The `EXISTS` guard avoids orphans — if the source file was hard-deleted
the `source_file_id` won't resolve and we'd otherwise insert a dangling
FK.)

### C. (Long-term, structural) Move variant storage out of `cld_files`

Variants are not user-managed files. They're derived assets that
ride with a parent file's lifecycle (deleted when the parent is
deleted, permissioned the same as the parent, never independently
shared). Modeling them as `cld_files` rows means every code path
that reads `cld_files` has to know about the path convention. A
dedicated `cld_file_variants` table joined into the asset envelope
on the server side would be invisible to any tree query.

```sql
CREATE TABLE cld_file_variants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file_id    UUID NOT NULL REFERENCES cld_files(id) ON DELETE CASCADE,
  variant_role      TEXT NOT NULL,          -- 'og_image' / 'thumbnail' / 'tiny_placeholder' / 'page1_preview' / ...
  storage_uri       TEXT NOT NULL,
  canonical_storage_uri TEXT,
  mime_type         TEXT NOT NULL,
  size_bytes        BIGINT NOT NULL,
  width             INT,
  height            INT,
  checksum          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_file_id, variant_role)
);
```

Then `GET /assets/{file_id}` joins this table into `Asset.variants[]`
exactly like it does today (the FE already consumes that shape). The
backfill becomes a migration: `INSERT INTO cld_file_variants` from
the existing `system-files/variants/*` rows, then `DELETE FROM
cld_files WHERE file_path LIKE 'system-files/variants/%'`.

This is the design we'd suggest long-term; it's invasive enough to
do as Phase 1e and not block on it.

### D. Forward writes — never reproduce the bug

Whatever code path creates variants going forward (presumably
`features/cloud_files/services/variant_generation.py` or similar)
needs to set `parent_file_id` + `derivation_kind` at write time,
not as a separate backfill. If you go with (C) above this becomes
"INSERT INTO `cld_file_variants`" and the issue can't recur.

---

## 6. Verification — how the Python agent can confirm the fix worked

After applying (A) or (B), run these queries against any account
that had variants written:

### 6a. RPC no longer returns system-files rows (after fix A)

```sql
SELECT COUNT(*) FROM (
  SELECT jsonb_array_elements(
    cld_get_user_file_tree('4cf62e4e-2679-484f-b652-034e697418df'::uuid, 5000, 0, true, false)
  ) AS r
) t
WHERE r->>'path' LIKE 'system-files%';
-- Expected: 0
```

### 6b. Every variant row has a parent (after fix B)

```sql
SELECT COUNT(*) AS still_orphan
FROM cld_files
WHERE file_path LIKE 'system-files/variants/%'
  AND parent_file_id IS NULL;
-- Expected: 0
```

### 6c. Every variant row has a derivation_kind

```sql
SELECT derivation_kind, COUNT(*)
FROM cld_files
WHERE file_path LIKE 'system-files/variants/%'
GROUP BY 1
ORDER BY 1;
-- Expected: 4 rows (og_image, thumbnail, tiny_placeholder, page1_preview), no NULLs
```

### 6d. No dangling parent_file_id (after fix B)

```sql
SELECT COUNT(*) AS dangling
FROM cld_files v
LEFT JOIN cld_files s ON s.id = v.parent_file_id
WHERE v.file_path LIKE 'system-files/variants/%'
  AND v.parent_file_id IS NOT NULL
  AND s.id IS NULL;
-- Expected: 0
```

---

## 7. Per-account impact estimate (run before/after for scope sense)

```sql
SELECT
  owner_id,
  COUNT(*) FILTER (WHERE file_path LIKE 'system-files/%') AS system_files_count,
  COUNT(*) FILTER (WHERE file_path NOT LIKE 'system-files/%') AS user_files_count
FROM cld_files
WHERE deleted_at IS NULL
GROUP BY owner_id
HAVING COUNT(*) FILTER (WHERE file_path LIKE 'system-files/%') > 0
ORDER BY system_files_count DESC
LIMIT 20;
```

This tells you which accounts the script affected and by how much.

---

## 8. Cross-references

- `docs/PYTHON_UPDATES.md` — your team's documentation of the SOCIAL_BASELINE rollout. Phase 1b is where this script is documented from the Python side; Phase 1d.2 + 3c are the related backfill phases.
- `features/files/for_python/REQUESTS.md` item **0b** — running ledger entry for this issue (this `.md` is the detailed analysis behind that ledger item).
- `features/files/for_python/REQUESTS.md` item **0a** — the related "public-files leak in `cld_get_user_file_tree`" bug. Same RPC, separate issue, same opportunity to fix in one migration.
- `features/files/for_python/REQUESTS.md` item **0b** — the related "RPC caps `p_limit` at 5000 and orders alphabetically by name" UX issue. Separate from this one but came up during the same diagnostic session.
- `features/files/utils/folder-conventions.ts` — `isSystemPath()` predicate the FE uses as a defense-in-depth filter. Will become unnecessary (defense-only) once your fix lands.

---

## 9. Open questions for the Python agent

1. Which Python module owns the SOCIAL_BASELINE variant write path? (We want to point our forward-write filter at the same source of truth.)
2. Is there a reason the variants live as `cld_files` rows at all, vs. a dedicated `cld_file_variants` table? (i.e. is option C above structurally precluded for any reason we don't see?)
3. What's the canonical `DerivationKind` enum vocabulary on your side? We need to mirror exactly — please share the enum so the FE adapter / filter / UI labels match.
4. After fix (B) lands, can you publish a `from_python/UPDATES.md` entry confirming the migration ran and noting any rows skipped (e.g. orphan variants whose source was hard-deleted)?

---

## Appendix A — full RPC definition (for reference)

```sql
CREATE OR REPLACE FUNCTION public.cld_get_user_file_tree(
  p_user_id          uuid,
  p_limit            integer DEFAULT 200,
  p_offset           integer DEFAULT 0,
  p_include_folders  boolean DEFAULT true,
  p_include_deleted  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'forbidden: p_user_id does not match auth.uid()'
            USING ERRCODE = '42501';
    END IF;

    p_limit := LEAST(GREATEST(p_limit, 1), 5000);

    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT
            'file'::text AS kind, f.id, f.owner_id,
            f.file_path AS path, f.file_name AS name, f.parent_folder_id AS parent_id,
            f.mime_type, f.size_bytes, f.visibility, f.current_version, f.metadata,
            f.created_at, f.updated_at, f.deleted_at,
            CASE WHEN f.owner_id = p_user_id THEN 'admin'
                 ELSE cld_get_effective_permission(f.id, p_user_id)
            END AS effective_permission
        FROM cld_files f
        WHERE (p_include_deleted OR f.deleted_at IS NULL)
          AND (
              f.owner_id = p_user_id
              OR f.visibility = 'public'
              OR cld_get_effective_permission(f.id, p_user_id) IS NOT NULL
          )

        UNION ALL

        SELECT
            'folder'::text AS kind, d.id, d.owner_id,
            d.folder_path AS path, d.folder_name AS name, d.parent_id,
            NULL::text AS mime_type, NULL::bigint AS size_bytes, d.visibility,
            NULL::int AS current_version, d.metadata,
            d.created_at, d.updated_at, d.deleted_at,
            CASE WHEN d.owner_id = p_user_id THEN 'admin' ELSE NULL END
              AS effective_permission
        FROM cld_folders d
        WHERE p_include_folders
          AND (p_include_deleted OR d.deleted_at IS NULL)
          AND d.owner_id = p_user_id
        ORDER BY 5
        LIMIT p_limit OFFSET p_offset
    ) t;

    RETURN v_result;
END;
$function$;
```

---

*Generated 2026-05-16 by the FE diagnostic session. Every query in
this doc was run live against `txzxabzwovsujtloxrus`; the numbers in
the result tables are the actual values, not estimates.*
