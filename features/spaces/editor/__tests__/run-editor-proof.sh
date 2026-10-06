#!/usr/bin/env bash
# Runs round-trip.editor-proof.mts against the real BlockNote editor (bundled: Jest and tsx cannot load
# BlockNote's ESM from this repo's CJS context). Exit 0 = every stored construct round-trips unchanged.
set -euo pipefail
cd "$(dirname "$0")/../../../.."
out="$(mktemp -d)/proof.mjs"
node_modules/.bin/esbuild features/spaces/editor/__tests__/round-trip.editor-proof.mts --bundle --platform=node --format=esm \
  --jsx=automatic --alias:@=. --outfile="$out" --loader:.css=empty --loader:.webp=empty --loader:.png=empty --loader:.jpg=empty --loader:.svg=empty --external:canvas --external:jsdom --log-level=error \
  --banner:js="import{createRequire as __cr}from'module';const require=__cr(import.meta.url);"
cp "$out" ./.spaces-editor-proof.mjs
trap 'rm -f ./.spaces-editor-proof.mjs' EXIT
NEXT_PUBLIC_SUPABASE_URL=https://db.example.test NEXT_PUBLIC_SUPABASE_ANON_KEY=proof NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=proof \
  node --no-warnings ./.spaces-editor-proof.mjs
