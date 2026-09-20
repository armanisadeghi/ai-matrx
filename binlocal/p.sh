#!/bin/zsh
# MAIN database psql. Reads the five SUPABASE_MATRIX_* vars from matrx-frontend/.env.local.
set -e
ENVF=/Users/armanisadeghi/code/aidream/.env
g() { grep -m1 "^$1=" "$ENVF" | sed -e "s/^$1=//" -e "s/^['\"]//" -e "s/['\"]$//"; }
export PGPASSWORD="$(g SUPABASE_MATRIX_PASSWORD)"
exec /opt/homebrew/opt/libpq/bin/psql \
  -h "$(g SUPABASE_MATRIX_HOST)" -p "$(g SUPABASE_MATRIX_PORT)" \
  -U "$(g SUPABASE_MATRIX_USER)" -d "$(g SUPABASE_MATRIX_DATABASE_NAME)" \
  -v ON_ERROR_STOP=1 "$@"
