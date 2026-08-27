#!/bin/bash
# Target defaults to the real file, but `pnpm db-types` passes the staging temp file so the
# committed types are never left half-written. See package.json → db-types.
FILE="${1:-types/database.types.ts}"

# Check if the file contains invalid UTF-8
if ! iconv -f UTF-8 -t UTF-8 "$FILE" > /dev/null 2>&1; then
    echo "Fixing encoding for $FILE"
    iconv -f UTF-8 -t UTF-8 "$FILE" -o "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
else
    echo "Encoding is already correct."
fi
