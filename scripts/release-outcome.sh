#!/usr/bin/env bash
# release-outcome.sh — THE RELEASE-BANNER TRUTH LAW: a release banner reports
# the ROLLOUT, never the push.
#
# The defect this file exists to kill (recon 2026-09-11): release.sh printed
#
#     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#       Released ai-matrx-admin 0.4.1858
#     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# unconditionally, the line after `git push --atomic` returned 0 — and its own
# header said "It never calls Vercel." A release whose Vercel build ERRORs, is
# CANCELED, or is skipped by scripts/vercel-ignore-build.sh printed the same
# green box as one that reached production. Nothing downstream ever looked: the
# reader of that banner is now the *Matrx frontend release watch* deploy agent,
# and the only escalation in
# common-docs/policies/deployment-is-the-deploy-agents-job.md (pushed work still
# not live after 60 minutes) depends on somebody noticing the gap the green box
# hid. Law 4: nothing fails silently; a screen is absent or honest, never a lie.
#
# The rule this file enforces:
#
#   Green means the build this release pushed reached READY on every Vercel
#   project the commit targets, AND that deployment is the one the live domain
#   serves. Every other outcome — skipped, ERROR, CANCELED, a wall we hit while
#   waiting, or no credential to look with — prints a loud non-green box that
#   names the project, the state, the Vercel URL, and the remedy.
#
# It also kills the SILENT WAIT (the aidream incident: 30 minutes of nothing on
# screen): every poll announces "waiting for Vercel: <project> <state>
# <elapsed>", and the wall is STATED up front, never discovered by hanging.
#
# Usage from release.sh:   source scripts/release-outcome.sh
#   release_outcome_report "<target>" "<commit message>" "<pushed sha>"
#     rc 0 → verified READY and serving on every targeted project (green box)
#     rc 1 → skipped / ERROR / CANCELED / timeout / built-but-not-serving (red)
#     rc 2 → UNVERIFIED: no Vercel credential on this machine (loud amber box;
#            the push itself succeeded, so release.sh nags instead of failing)
#
# Credentials — this file INVENTS NO AUTH. It uses, in order:
#   1. $VERCEL_TOKEN                       (the standard Vercel env var)
#   2. the Vercel CLI's own auth.json      (this machine is logged in via
#      `vercel login`; macOS: ~/Library/Application Support/com.vercel.cli,
#      Linux/XDG: ~/.local/share/com.vercel.cli or $XDG_DATA_HOME)
# No token → rc 2 and the amber box, never green, never a fabricated verdict.
#
# Knobs (values, not toggles — every one is announced when it matters):
#   RELEASE_OUTCOME_WAIT_SECONDS        build wall, default 1800 (30 min)
#   RELEASE_OUTCOME_POLL_SECONDS        poll interval, default 15
#   RELEASE_OUTCOME_SERVE_WAIT_SECONDS  promotion wall after READY, default 300
#   RELEASE_OUTCOME_FETCH_CMD           test seam: prints "STATE<TAB>uid<TAB>url"
#   RELEASE_OUTCOME_SERVED_CMD          test seam: prints the served deployment id
# The two *_CMD seams exist so the self-test drives the real banner logic with a
# stubbed deployment record instead of mocking the banner itself.
#
# Self-test (the guard, proven failing-then-passing on every run):
#   bash scripts/release-outcome.sh --self-test   (pnpm check:release-outcome:self-test)
# It reproduces the OLD unconditional banner against an ERROR deployment (green
# printed over a dead rollout — the defect), then drives release_outcome_report
# through READY / ERROR / CANCELED / ignored / timeout / not-yet-promoted and
# proves green appears for exactly one of them.

# ── Vercel identities (deployment split 2026-07 — one repo, three projects) ──
# Verified live 2026-09-11 against team_zWxJHqDHuRr1kpl9Hu9oON3g. The main
# project id is read from .vercel/project.json when that file is present, so the
# linked project always wins over the constant below.
RELEASE_OUTCOME_TEAM_ID="${RELEASE_OUTCOME_TEAM_ID:-team_zWxJHqDHuRr1kpl9Hu9oON3g}"

_release_outcome_dir() { cd "$(dirname "${BASH_SOURCE[0]}")" && pwd; }

release_outcome_project_name() {
    case "$1" in
        main)  echo "ai-matrx" ;;
        admin) echo "ai-matrx-manage" ;;
        demos) echo "ai-matrx-demos" ;;
        *) return 1 ;;
    esac
}

release_outcome_project_id() {
    local bt="$1" linked=""
    if [[ "$bt" == "main" ]]; then
        local pj; pj="$(_release_outcome_dir)/../.vercel/project.json"
        if [[ -f "$pj" ]]; then
            linked="$(node -p "try{JSON.parse(require('fs').readFileSync('$pj','utf8')).projectId||''}catch(e){''}" 2>/dev/null || true)"
        fi
        [[ -n "$linked" ]] && { echo "$linked"; return 0; }
    fi
    case "$bt" in
        main)  echo "prj_ZIeMm2FW8RgOAO9BJgQ2YQcXpwrH" ;;
        admin) echo "prj_klDr3qdlD7Vc27DUMllCQlIUqBa3" ;;
        demos) echo "prj_wFKaTLiAUhsSsKNjmJXPjj8X9Zc6" ;;
        *) return 1 ;;
    esac
}

release_outcome_domain() {
    case "$1" in
        main)  echo "https://aimatrx.com" ;;
        admin) echo "https://manage.aimatrx.com" ;;
        demos) echo "https://demos.aimatrx.com" ;;
        *) return 1 ;;
    esac
}

# --target → the build targets whose projects should produce a deployment.
release_outcome_targets() {
    case "$1" in
        main)  echo "main" ;;
        admin) echo "admin" ;;
        demos) echo "demos" ;;
        all)   echo "main admin demos" ;;
        *) return 1 ;;
    esac
}

# The REAL production predicate, not a copy of it: run the same ignore script
# Vercel runs, with the same two inputs Vercel gives it.
# rc 0 → this project WILL build the commit. rc 1 → it will be skipped.
release_outcome_would_build() {
    local msg="$1" bt="$2"
    if MATRX_BUILD_TARGET="$bt" VERCEL_GIT_COMMIT_MESSAGE="$msg" \
        bash "$(_release_outcome_dir)/vercel-ignore-build.sh" >/dev/null 2>&1; then
        return 1   # ignore script exit 0 == SKIP the build
    fi
    return 0       # exit 1 == PROCEED with the build
}

# ── Credential ───────────────────────────────────────────────────────────────
release_outcome_token() {
    if [[ -n "${VERCEL_TOKEN:-}" ]]; then
        printf '%s' "$VERCEL_TOKEN"; return 0
    fi
    local candidates=(
        "${XDG_DATA_HOME:-$HOME/.local/share}/com.vercel.cli/auth.json"
        "$HOME/Library/Application Support/com.vercel.cli/auth.json"
        "$HOME/.local/share/com.vercel.cli/auth.json"
    )
    local f tok
    for f in "${candidates[@]}"; do
        [[ -f "$f" ]] || continue
        tok="$(node -e '
            const fs=require("fs");
            try{const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
                if(d.token) process.stdout.write(d.token);}catch(e){}
        ' "$f" 2>/dev/null || true)"
        [[ -n "$tok" ]] && { printf '%s' "$tok"; return 0; }
    done
    return 1
}

# ── The deployment record ────────────────────────────────────────────────────
# Prints "STATE<TAB>deploymentId<TAB>inspectorUrl".
# STATE is Vercel's readyState, or MISSING when no deployment exists for the SHA
# yet (the GitHub webhook lag right after a push), or UNREACHABLE on an API
# error — both are distinct from a build verdict and are reported as themselves.
release_outcome_fetch() {
    local project_id="$1" sha="$2"
    if [[ -n "${RELEASE_OUTCOME_FETCH_CMD:-}" ]]; then
        "$RELEASE_OUTCOME_FETCH_CMD" "$project_id" "$sha"
        return $?
    fi
    local token body
    token="$(release_outcome_token)" || { printf 'NO_TOKEN\t\t\n'; return 0; }
    body="$(curl -sS -m 30 -H "Authorization: Bearer $token" \
        "https://api.vercel.com/v6/deployments?projectId=${project_id}&teamId=${RELEASE_OUTCOME_TEAM_ID}&sha=${sha}&limit=5" 2>/dev/null || true)"
    [[ -z "$body" ]] && { printf 'UNREACHABLE\t\t\n'; return 0; }
    node -e '
        let d; try { d = JSON.parse(process.argv[1]); } catch (e) { process.stdout.write("UNREACHABLE\t\t\n"); process.exit(0); }
        if (d.error) { process.stdout.write("UNREACHABLE\t\t" + (d.error.message || "") + "\n"); process.exit(0); }
        const list = d.deployments || [];
        if (!list.length) { process.stdout.write("MISSING\t\t\n"); process.exit(0); }
        // Newest first; prefer any non-terminal or READY record for this SHA.
        const pick = list.sort((a, b) => (b.created || 0) - (a.created || 0))[0];
        const url = pick.inspectorUrl || (pick.url ? "https://" + pick.url : "");
        process.stdout.write((pick.readyState || pick.state || "UNKNOWN") + "\t" + (pick.uid || "") + "\t" + url + "\n");
    ' "$body"
}

# What the live domain is actually serving (app/api/version → VERCEL_DEPLOYMENT_ID).
release_outcome_serving() {
    local domain="$1"
    if [[ -n "${RELEASE_OUTCOME_SERVED_CMD:-}" ]]; then
        "$RELEASE_OUTCOME_SERVED_CMD" "$domain"
        return $?
    fi
    local body
    body="$(curl -sS -m 20 -L "${domain}/api/version" 2>/dev/null || true)"
    node -e '
        try { const d = JSON.parse(process.argv[1]); process.stdout.write(String(d.deploymentId ?? "")); }
        catch (e) { process.stdout.write(""); }
    ' "$body" 2>/dev/null || true
    echo ""
}

# ── The banner ───────────────────────────────────────────────────────────────
_RO_RED='\033[0;31m'; _RO_GREEN='\033[0;32m'; _RO_YELLOW='\033[1;33m'
_RO_CYAN='\033[0;36m'; _RO_NC='\033[0m'

_ro_box() {  # _ro_box <color> <line...>
    local color="$1"; shift
    echo ""
    echo -e "${color}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${_RO_NC}"
    local l; for l in "$@"; do echo -e "${color}  ${l}${_RO_NC}"; done
    echo -e "${color}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${_RO_NC}"
    echo ""
}

# Poll one project to a terminal state. Announces every poll — the aidream
# incident was a SILENT 30-minute wait, and silence is the thing being fixed.
# Prints "VERDICT<TAB>state<TAB>deploymentId<TAB>url" on stdout; progress on stderr.
release_outcome_watch() {
    local bt="$1" sha="$2"
    local project_id project_name wall poll started elapsed
    project_id="$(release_outcome_project_id "$bt")"
    project_name="$(release_outcome_project_name "$bt")"
    wall="${RELEASE_OUTCOME_WAIT_SECONDS:-1800}"
    poll="${RELEASE_OUTCOME_POLL_SECONDS:-15}"
    started="$(date +%s)"

    echo -e "${_RO_CYAN}[INFO]${_RO_NC}  Watching Vercel ${project_name} for ${sha:0:10} — up to $((wall / 60)) min, polling every ${poll}s." >&2

    local state uid url record
    while :; do
        record="$(release_outcome_fetch "$project_id" "$sha")"
        IFS=$'\t' read -r state uid url <<< "$record"
        state="${state:-UNKNOWN}"
        elapsed=$(( $(date +%s) - started ))

        case "$state" in
            READY)
                echo -e "${_RO_GREEN}[OK]${_RO_NC}    Vercel ${project_name}: READY after ${elapsed}s (${uid})." >&2
                printf 'READY\t%s\t%s\t%s\n' "$state" "$uid" "$url"; return 0 ;;
            ERROR|CANCELED)
                echo -e "${_RO_RED}[FAIL]${_RO_NC}  Vercel ${project_name}: ${state} after ${elapsed}s." >&2
                printf 'DEAD\t%s\t%s\t%s\n' "$state" "$uid" "$url"; return 1 ;;
            NO_TOKEN)
                printf 'UNVERIFIED\t%s\t%s\t%s\n' "$state" "$uid" "$url"; return 2 ;;
        esac

        if (( elapsed >= wall )); then
            echo -e "${_RO_RED}[FAIL]${_RO_NC}  Vercel ${project_name}: still ${state} at the ${wall}s wall." >&2
            printf 'TIMEOUT\t%s\t%s\t%s\n' "$state" "$uid" "$url"; return 1
        fi
        echo "waiting for Vercel: ${project_name} ${state} ${elapsed}s (wall ${wall}s)" >&2
        sleep "$poll"
    done
}

# After READY, the deployment still has to become the one the domain serves.
# rc 0 → serving; rc 1 → READY but a different deployment is still live.
release_outcome_await_serving() {
    local bt="$1" uid="$2"
    local domain project_name wall poll started elapsed served
    domain="$(release_outcome_domain "$bt")"
    project_name="$(release_outcome_project_name "$bt")"
    wall="${RELEASE_OUTCOME_SERVE_WAIT_SECONDS:-300}"
    poll="${RELEASE_OUTCOME_POLL_SECONDS:-15}"
    started="$(date +%s)"
    while :; do
        served="$(release_outcome_serving "$domain" | tr -d '[:space:]')"
        elapsed=$(( $(date +%s) - started ))
        if [[ -n "$uid" && "$served" == "$uid" ]]; then
            echo -e "${_RO_GREEN}[OK]${_RO_NC}    ${domain} is serving ${uid} (${elapsed}s after READY)." >&2
            return 0
        fi
        if (( elapsed >= wall )); then
            echo -e "${_RO_RED}[FAIL]${_RO_NC}  ${domain} still serves ${served:-<unknown>}, not ${uid}, at the ${wall}s wall." >&2
            return 1
        fi
        echo "waiting for Vercel: ${project_name} promotion — ${domain} serves ${served:-<unknown>} ${elapsed}s (wall ${wall}s)" >&2
        sleep "$poll"
    done
}

# THE BANNER. rc 0 green / rc 1 loud red / rc 2 loud amber (unverifiable).
release_outcome_report() {
    local target="$1" msg="$2" sha="$3"
    local version="${4:-}"
    local targets bt
    if [[ -z "$sha" ]]; then
        _ro_box "$_RO_RED" "RELEASE OUTCOME: no commit SHA was given to verify." \
            "Nothing was checked, and nothing here says this release is live." \
            "Remedy: bash scripts/release-outcome.sh --report <target> \"<msg>\" \$(git rev-parse HEAD)"
        return 1
    fi
    targets="$(release_outcome_targets "$target")" || {
        _ro_box "$_RO_RED" "RELEASE OUTCOME: unknown --target '${target}'." \
            "Nothing could be verified. Use main, admin, demos, or all."
        return 1
    }

    # (1) Would anything build at all?
    local will_build=() skipped=()
    for bt in $targets; do
        if release_outcome_would_build "$msg" "$bt"; then
            will_build+=("$bt")
        else
            skipped+=("$bt")
        fi
    done
    if [[ ${#will_build[@]} -eq 0 ]]; then
        _ro_box "$_RO_RED" \
            "SKIPPED — nothing will deploy." \
            "" \
            "The commit was pushed, but scripts/vercel-ignore-build.sh skips it on" \
            "every project this release targets (${target}):" \
            "  message : ${msg%%$'\n'*}" \
            "  projects: $(for bt in $targets; do printf '%s ' "$(release_outcome_project_name "$bt")"; done)" \
            "" \
            "Vercel builds ONLY commits whose first line starts with release: /" \
            "release-admin: / release-demos: / release-all:, and the prefix must" \
            "match each project's MATRX_BUILD_TARGET. This message matches none," \
            "so production stays on the previous build — no user sees this release." \
            "" \
            "Remedy: re-release through ./ship.sh (it writes the prefix), or fix" \
            "the prefix/--target pairing, then release again."
        return 1
    fi
    if [[ ${#skipped[@]} -gt 0 ]]; then
        echo -e "${_RO_YELLOW}[WARN]${_RO_NC}  Not built by this release (prefix does not target them): $(for bt in "${skipped[@]}"; do printf '%s ' "$(release_outcome_project_name "$bt")"; done)" >&2
    fi

    # (2) Poll each targeted project to a terminal state.
    local verdict state uid url line
    local dead=() unverified=() good=() good_ids=()
    for bt in "${will_build[@]}"; do
        line="$(release_outcome_watch "$bt" "$sha")" || true
        IFS=$'\t' read -r verdict state uid url <<< "$line"
        case "$verdict" in
            READY)
                if release_outcome_await_serving "$bt" "$uid"; then
                    good+=("$bt"); good_ids+=("$(release_outcome_project_name "$bt")=$uid")
                else
                    dead+=("$(release_outcome_project_name "$bt")|READY-NOT-SERVING|${url}")
                fi ;;
            UNVERIFIED) unverified+=("$(release_outcome_project_name "$bt")") ;;
            *)          dead+=("$(release_outcome_project_name "$bt")|${state}|${url}") ;;
        esac
    done

    # (3) The verdict. Green ONLY when every targeted project is READY + serving.
    if [[ ${#dead[@]} -gt 0 ]]; then
        local lines=("ROLLOUT FAILED — this release is NOT live." "")
        local d name st u
        for d in "${dead[@]}"; do
            IFS='|' read -r name st u <<< "$d"
            lines+=("  ${name}: ${st}")
            [[ -n "$u" ]] && lines+=("    ${u}")
        done
        lines+=("" "  commit : ${sha}" "  message: ${msg%%$'\n'*}" "")
        lines+=("The push succeeded and the tag exists, so git looks fine — but the")
        lines+=("Vercel build above did not reach production. Users are still on the")
        lines+=("previous build.")
        lines+=("")
        lines+=("Remedy: open the Vercel URL above, read the build log, fix the cause,")
        lines+=("then release again. READY-NOT-SERVING means the build succeeded but")
        lines+=("the domain still serves an older deployment — check promotion /")
        lines+=("deployment protection on that project.")
        _ro_box "$_RO_RED" "${lines[@]}"
        return 1
    fi
    if [[ ${#unverified[@]} -gt 0 ]]; then
        _ro_box "$_RO_YELLOW" \
            "UNVERIFIED — the push landed; the rollout was NOT checked." \
            "" \
            "  projects: ${unverified[*]}" \
            "  commit  : ${sha}" \
            "" \
            "No Vercel credential on this machine, so this script refuses to claim" \
            "anything about the build. It is NOT a green release." \
            "" \
            "Remedy: \`vercel login\` (the CLI's auth.json is read automatically)," \
            "or export VERCEL_TOKEN, then check the deployment for ${sha:0:10}."
        return 2
    fi

    local glines=("Released and LIVE${version:+ — v$version}" "" "  commit: ${sha}")
    local g
    for g in "${good_ids[@]}"; do glines+=("  READY + serving: ${g}"); done
    _ro_box "$_RO_GREEN" "${glines[@]}"
    return 0
}

# ── Self-test — the guard, proven failing-then-passing on every run ──────────
# The RED half is not a re-creation of the old banner: it EXTRACTS the real
# "── Done ──" block from scripts/release.sh as it stood at the defect commit
# (e30f034c9f) and executes it in a harness whose deployment record says ERROR.
# The old block prints its green box anyway, because nothing in it ever looked.
_release_outcome_self_test() {
    set -uo pipefail
    local failures=0
    pass()  { echo "  [ok]   $*"; }
    failt() { echo "  [FAIL] $*" >&2; failures=$((failures + 1)); }

    _RO_TMP="$(mktemp -d)"; trap 'rm -rf "$_RO_TMP"' EXIT
    local tmp="$_RO_TMP"
    local here; here="$(_release_outcome_dir)"
    local SHA="0123456789abcdef0123456789abcdef01234567"
    local BASELINE="${RELEASE_OUTCOME_BASELINE_REF:-e30f034c9f}"

    # Stubs for the two IO seams only — the banner logic under test is the real one.
    mk_fetch() {   # <state> <uid>
        printf '#!/usr/bin/env bash\nprintf "%%s\\t%%s\\t%%s\\n" "%s" "%s" "https://vercel.com/armani-sadeghis-projects/ai-matrx/stub"\n' "$1" "$2" > "$tmp/fetch.sh"
        chmod +x "$tmp/fetch.sh"
    }
    mk_served() {  # <deployment id the live domain serves>
        printf '#!/usr/bin/env bash\necho "%s"\n' "$1" > "$tmp/served.sh"
        chmod +x "$tmp/served.sh"
    }
    RO_OUT=""; RO_ERR=""; RO_RC=0
    RO_WALL=1; RO_POLL=0   # per-case overrides; reset by every caller that cares
    run_case() {  # <state> <uid> <served> <target> <msg> [version]
        mk_fetch "$1" "$2"; mk_served "$3"
        RO_OUT="$(
            export RELEASE_OUTCOME_FETCH_CMD="$tmp/fetch.sh" RELEASE_OUTCOME_SERVED_CMD="$tmp/served.sh"
            export RELEASE_OUTCOME_POLL_SECONDS="$RO_POLL" RELEASE_OUTCOME_WAIT_SECONDS="$RO_WALL"
            export RELEASE_OUTCOME_SERVE_WAIT_SECONDS="$RO_WALL"
            release_outcome_report "$4" "$5" "$SHA" "${6:-}" 2>"$tmp/err"
        )"
        RO_RC=$?
        RO_ERR="$(cat "$tmp/err")"
    }

    echo "release-outcome self-test"

    # ── 1. RED: the REAL old banner, executed, over an ERRORed deployment ───
    local old_src="" red_ok=false
    old_src="$(git -C "$here/.." show "${BASELINE}:scripts/release.sh" 2>/dev/null || true)"
    if [[ -z "$old_src" ]]; then
        failt "could not read scripts/release.sh at ${BASELINE} — the RED baseline is unavailable, so this guard proves nothing (set RELEASE_OUTCOME_BASELINE_REF)"
    else
        # The block between "── Done ──" and the advisory-gates section: the
        # entire outcome reporting the script had after a successful push.
        awk '/^# ── Done ─/{f=1} /^# ── Advisory quality gates/{f=0} f' <<< "$old_src" > "$tmp/legacy-banner.sh"
        if [[ ! -s "$tmp/legacy-banner.sh" ]]; then
            failt "could not extract the old '── Done ──' block from ${BASELINE}"
        else
            # Executed, not quoted. The stub says the deployment ERRORed.
            mk_fetch ERROR dpl_dead
            local legacy_out
            legacy_out="$(
                export RELEASE_OUTCOME_FETCH_CMD="$tmp/fetch.sh"
                GREEN='' CYAN='' NC='' PROJECT_NAME="ai-matrx-admin" NEW_VERSION="0.4.9999" \
                GITHUB_REPO="armanisadeghi/ai-matrx" bash "$tmp/legacy-banner.sh" 2>&1
            )"
            if grep -q "Released ai-matrx-admin 0.4.9999" <<< "$legacy_out"; then
                red_ok=true
                pass "RED reproduced: release.sh@${BASELINE} prints 'Released ai-matrx-admin 0.4.9999' while the deployment record says ERROR"
            else
                failt "RED did not reproduce — extracted block printed: $legacy_out"
            fi
            if grep -qiE 'vercel|deployment|readyState' "$tmp/legacy-banner.sh"; then
                failt "the old block does reference the deployment — the defect statement is wrong"
            else
                $red_ok && pass "RED root cause: the old block contains zero references to Vercel or the deployment state"
            fi
        fi
    fi

    # ── 2. GREEN: the identical ERROR scenario through the new banner ───────
    run_case ERROR dpl_dead dpl_dead main "release: v0.4.9999 - t" 0.4.9999
    if [[ $RO_RC -ne 0 ]] && grep -q "ROLLOUT FAILED" <<< "$RO_OUT" && ! grep -q "Released and LIVE" <<< "$RO_OUT"; then
        pass "GREEN: same ERROR record → loud red 'ROLLOUT FAILED', no green box, rc=$RO_RC"
    else
        failt "ERROR produced rc=$RO_RC and: $RO_OUT"
    fi
    grep -q "ai-matrx: ERROR" <<< "$RO_OUT" && pass "red box names the project and the state" || failt "red box does not name project+state"
    grep -q "vercel.com" <<< "$RO_OUT" && pass "red box carries the Vercel URL" || failt "red box has no Vercel URL"
    grep -q "Remedy" <<< "$RO_OUT" && pass "red box carries a remedy" || failt "red box has no remedy"

    # ── 3. CANCELED is just as dead ─────────────────────────────────────────
    run_case CANCELED dpl_dead dpl_dead main "release: v0.4.9999 - t"
    [[ $RO_RC -ne 0 ]] && grep -q "ai-matrx: CANCELED" <<< "$RO_OUT" && pass "CANCELED → loud red, rc=$RO_RC" \
        || failt "CANCELED produced rc=$RO_RC and: $RO_OUT"

    # ── 4. A build that never finishes hits a STATED, ANNOUNCED wall ────────
    # A 3s wall at a 1s poll, so the announcement has room to actually print —
    # the point of this case is that the wait is NOT silent while it runs.
    RO_WALL=3; RO_POLL=1
    run_case BUILDING dpl_x dpl_x main "release: v0.4.9999 - t"
    RO_WALL=1; RO_POLL=0
    [[ $RO_RC -ne 0 ]] && grep -q "ai-matrx: BUILDING" <<< "$RO_OUT" && pass "timeout → loud red naming the stuck state, rc=$RO_RC" \
        || failt "timeout produced rc=$RO_RC and: $RO_OUT"
    grep -q "waiting for Vercel: ai-matrx BUILDING" <<< "$RO_ERR" \
        && pass "the wait ANNOUNCES itself every poll (no silent 30-minute wait)" \
        || failt "the wait was silent: $RO_ERR"
    grep -q "up to .* min, polling every" <<< "$RO_ERR" \
        && pass "the wall is stated up front" || failt "the wall was not stated: $RO_ERR"

    # ── 5. READY, but the domain still serves the old build ─────────────────
    run_case READY dpl_new dpl_old main "release: v0.4.9999 - t"
    [[ $RO_RC -ne 0 ]] && grep -q "READY-NOT-SERVING" <<< "$RO_OUT" && ! grep -q "Released and LIVE" <<< "$RO_OUT" \
        && pass "READY but not promoted → non-green (the served deploymentId must match)" \
        || failt "READY-not-serving produced rc=$RO_RC and: $RO_OUT"

    # ── 6. The ONE green case ───────────────────────────────────────────────
    run_case READY dpl_new dpl_new main "release: v0.4.9999 - t" 0.4.9999
    if [[ $RO_RC -eq 0 ]] && grep -q "Released and LIVE" <<< "$RO_OUT" && grep -q "dpl_new" <<< "$RO_OUT" && grep -q "$SHA" <<< "$RO_OUT"; then
        pass "READY + serving → green, naming the deployment id and the SHA, rc=0"
    else
        failt "the green case produced rc=$RO_RC and: $RO_OUT"
    fi

    # ── 7. A commit Vercel will ignore never prints green ───────────────────
    # Decided by the REAL scripts/vercel-ignore-build.sh, not a copy of its rules.
    run_case READY dpl_new dpl_new main "fix: a plain non-release commit"
    if [[ $RO_RC -ne 0 ]] && grep -q "SKIPPED — nothing will deploy" <<< "$RO_OUT" && ! grep -q "Released and LIVE" <<< "$RO_OUT"; then
        pass "ignored commit → loud 'SKIPPED — nothing will deploy', rc=$RO_RC"
    else
        failt "the ignored-commit case produced rc=$RO_RC and: $RO_OUT"
    fi
    run_case READY dpl_new dpl_new main "release-demos: v0.4.9999 - t"
    [[ $RO_RC -ne 0 ]] && grep -q "SKIPPED" <<< "$RO_OUT" \
        && pass "prefix that targets another project → SKIPPED, never green" \
        || failt "prefix/target mismatch produced rc=$RO_RC and: $RO_OUT"

    # ── 8. No credential is UNVERIFIED, never green ─────────────────────────
    run_case NO_TOKEN "" "" main "release: v0.4.9999 - t"
    if [[ $RO_RC -eq 2 ]] && grep -q "UNVERIFIED" <<< "$RO_OUT" && ! grep -q "Released and LIVE" <<< "$RO_OUT"; then
        pass "no Vercel credential → loud amber UNVERIFIED with rc=2, never green"
    else
        failt "the no-credential case produced rc=$RO_RC and: $RO_OUT"
    fi

    # ── 9. --target all watches all three projects ──────────────────────────
    [[ "$(release_outcome_targets all)" == "main admin demos" ]] \
        && pass "--target all watches all three projects" || failt "--target all resolves wrong"
    run_case READY dpl_new dpl_new all "release-all: v0.4.9999 - t"
    if [[ $RO_RC -eq 0 ]] && grep -q "ai-matrx-manage=dpl_new" <<< "$RO_OUT" && grep -q "ai-matrx-demos=dpl_new" <<< "$RO_OUT"; then
        pass "release-all: green names every project it verified"
    else
        failt "--target all green case produced rc=$RO_RC and: $RO_OUT"
    fi

    # ── 9b. A missing SHA is refused, never assumed green ───────────────────
    run_case READY dpl_new dpl_new main "release: v0.4.9999 - t"
    mk_fetch READY dpl_new; mk_served dpl_new
    local nosha_rc=0 nosha_out
    nosha_out="$(
        export RELEASE_OUTCOME_FETCH_CMD="$tmp/fetch.sh" RELEASE_OUTCOME_SERVED_CMD="$tmp/served.sh"
        export RELEASE_OUTCOME_POLL_SECONDS=0 RELEASE_OUTCOME_WAIT_SECONDS=1 RELEASE_OUTCOME_SERVE_WAIT_SECONDS=1
        release_outcome_report main "release: v0.4.9999 - t" "" 0.4.9999 2>/dev/null
    )" || nosha_rc=$?
    [[ $nosha_rc -ne 0 ]] && grep -q "no commit SHA" <<< "$nosha_out" && ! grep -q "Released and LIVE" <<< "$nosha_out" \
        && pass "an empty SHA is refused loudly, never green" \
        || failt "empty SHA produced rc=$nosha_rc and: $nosha_out"

    # ── 10. The project identities resolve ──────────────────────────────────
    [[ "$(release_outcome_project_id admin)" == "prj_klDr3qdlD7Vc27DUMllCQlIUqBa3" ]] \
        && pass "admin project id resolves" || failt "admin project id wrong"
    [[ "$(release_outcome_project_id demos)" == "prj_wFKaTLiAUhsSsKNjmJXPjj8X9Zc6" ]] \
        && pass "demos project id resolves" || failt "demos project id wrong"
    [[ "$(release_outcome_project_id main)" == prj_* ]] \
        && pass "main project id resolves (.vercel/project.json wins when present)" || failt "main project id wrong"

    if (( failures > 0 )); then
        echo "release-outcome self-test: $failures failure(s)" >&2
        return 1
    fi
    echo "release-outcome self-test: all checks passed"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    case "${1:-}" in
        --self-test) _release_outcome_self_test ;;
        --report)
            shift
            release_outcome_report "$@" ;;
        *) echo "Usage: source $0   |   bash $0 --self-test   |   bash $0 --report <target> <msg> <sha> [version]" >&2; exit 2 ;;
    esac
fi
