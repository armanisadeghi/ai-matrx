#!/usr/bin/env bash
# THE LIVE HALF OF THE DEEP-LINK RULE, AT RELEASE TIME.
#
# 🚨 TAILS-3, 2026-09-21: a person arriving COLD — from an email, a text, or a chip in a
# fresh session — lands on "Select an organization first" instead of the thing the link
# names. The remedy is that nobody BUILDS such a link by hand: every one arrives at a
# BEFORE trigger (communication.notification, platform.assists,
# communication.dm_messages) or goes through the one helper that calls the one rule
# (lib/organizations/linkCarriesItsOrganization.ts here,
# services/notifications/organization_links.py in aidream).
#
# The guard itself lives in aidream, because that is where the rule's Python caller and
# the migrations are, and it censuses BOTH repos. This wrapper is how the release gate
# reaches it. It runs the LIVE half — the three triggers, the rule's own answers on
# sixteen cases, and the census read against the database's own organization-free list.
# aidream CI runs the census half alone (`--no-live`), because a CI job holds no
# Postgres credentials and a check that cannot measure must never report a green.
#
# UNMEASURED IS NOT GREEN. With no aidream checkout beside this repo, or no `uv`, this
# exits 2 and says which — never 0. That is the rule MANIFEST-SEAT wrote for
# check:route-manifest:live on 2026-09-21, for the same reason: the eight days of
# silently rewritten links were eight days of nothing being red.
set -u

AIDREAM="$(cd "$(dirname "$0")/../.." && pwd)/aidream"
GUARD="$AIDREAM/scripts/check_links_carry_their_organization.py"

if [ ! -f "$GUARD" ]; then
  echo "UNMEASURED: no aidream checkout beside this repo, so $GUARD could not be run."
  echo "  Nothing below was measured about what a notice, chip or DM link carries."
  exit 2
fi
if ! command -v uv >/dev/null 2>&1; then
  echo "UNMEASURED: \`uv\` is not on PATH, so the guard in aidream could not be run."
  exit 2
fi

cd "$AIDREAM" || exit 2
uv run python scripts/check_links_carry_their_organization.py --strict "$@"
