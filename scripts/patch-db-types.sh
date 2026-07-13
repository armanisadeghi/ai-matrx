#!/bin/bash
# scripts/patch-db-types.sh
#
# Patches Supabase-generated database type files after every `pnpm types` run.
# Replaces the narrow recursive Json union with `unknown` so typed objects are
# assignable to JSONB columns without casts everywhere in the codebase.

patch_file() {
  local FILE="$1"

  if [ ! -f "$FILE" ]; then
    echo "Skipping $FILE — not found"
    return 0
  fi

  if grep -q "export type Json = unknown" "$FILE"; then
    echo "Json type already patched in $FILE — skipping."
    return 0
  fi

  perl -0777 -i -pe '
    s{(export type Json =\s*\n(?:\s+\|[^\n]+\n)+)}{
      my $orig = $1;
      $orig =~ s/^/\/\/ /mg;
      "// Original generated type (replaced by patch-db-types.sh):\n" . $orig . "export type Json = unknown\n"
    }e
  ' "$FILE"

  echo "✅ Patched Json type in $FILE"
}

patch_file "types/database.types.ts"
