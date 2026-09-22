#!/usr/bin/env bash
# Activate matrx-frontend's versioned git hooks (scripts/githooks) for this checkout.
# Idempotent. core.hooksPath is local config: every fresh clone must run this once.
#
# Byte-for-byte the mechanism aidream already uses (aidream/scripts/install_githooks.sh)
# — one way to install a hook across the estate, not two.
#
# Refuses (never silently overrides) when core.hooksPath already points elsewhere.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
WANT="scripts/githooks"
cd "$ROOT"

if [ ! -f "$WANT/pre-commit" ] || [ ! -f "$WANT/prepare-commit-msg" ]; then
    echo "install_githooks: $ROOT/$WANT is missing its hooks — is this checkout current?" >&2
    exit 1
fi
chmod +x "$WANT/pre-commit" "$WANT/prepare-commit-msg"

CURRENT=$(git config --local --get core.hooksPath || true)
# `.git/hooks` — absolute or relative — is git's OWN default written out longhand, not a
# competing mechanism. This checkout carried exactly that. Overriding it is safe because
# the hooks below chain whatever is actually executable in there.
DEFAULT_DIR="$(cd "$(git rev-parse --git-common-dir)" && pwd)/hooks"
if [ "$CURRENT" = "$DEFAULT_DIR" ] || [ "$CURRENT" = ".git/hooks" ]; then
    CURRENT=""
fi
if [ -n "$CURRENT" ] && [ "$CURRENT" != "$WANT" ]; then
    echo "install_githooks: core.hooksPath is already '$CURRENT', not '$WANT'." >&2
    echo "Refusing to override it. Chain those hooks from $WANT (or remove the setting) deliberately, then rerun." >&2
    exit 1
fi

if [ "$CURRENT" = "$WANT" ]; then
    echo "install_githooks: already active (core.hooksPath=$WANT)."
else
    git config --local core.hooksPath "$WANT"
    echo "install_githooks: activated (core.hooksPath=$WANT)."
fi

for h in pre-commit prepare-commit-msg; do
    if [ -x "$(git rev-parse --git-common-dir)/hooks/$h" ]; then
        echo "install_githooks: note — existing .git/hooks/$h is chained and still runs."
    fi
done
