#!/usr/bin/env python3
"""sync-main — make this checkout identical to GitHub's main, with all local work on top.

Run it from the repo root:   python3 scripts/sync-main.py
Options:                       --no-push   do everything locally, push nothing (for testing)
Replay a past sync (for re-testing how conflicts get resolved; commits locally, never pushes):
    python3 scripts/sync-main.py --replay <sync merge commit> <path> [<path> ...]

WHAT IT DOES (Arman's sequence, 2026-09-24)
  1. git add -A  +  git commit -m "local work not committed by agents who made them"
  2. git fetch + git merge origin/main          (this is `git pull --no-rebase`)
     clean  -> go to 4
  3. for every file git stops on:
     a. FAKE conflict: one side already contains the other (an agent pushed an early copy of the
        file, then kept editing it here) -> keep the fuller version, silently. ONLY when the kept
        version provably holds every line the other side added (or that line moved to another
        file the same side changed). Anything less is held.
     b. .md/.txt file, or a clash made only of comments -> keep BOTH versions between marker
        lines, list it in .matrx/GIT-CONFLICTS.md.
     c. REAL conflict (or binary, or deleted on one side) -> GitHub's version goes live, our
        version is saved as _conflicts/<stamp>/<path>.held, listed in .matrx/GIT-CONFLICTS.md,
        with FACTS: when each side last changed it, its commit message, which side is newer, and
        exactly which lines each side has that the other lacks. Facts only; never a decision.
  4. commit the merge, git push. If someone pushed in the meantime, start again at 1.

Nothing is ever lost: every local byte is inside the step-1 commit, forever.
Leftover check: scripts/check-conflict-markers.py.
"""
import datetime
import os
import re
import subprocess
import sys
import tempfile
import time

REMOTE, BRANCH = "origin", "main"
LOCAL_MSG = "local work not committed by agents who made them"
HELD_MARK = "matrx-auto-git-conflict-file-work-delete-this-when-resolved"
DOCS_MARK = "matrx-auto-git-docs-resolution-needed-delete-this-when-resolved"
LOG_REL = ".matrx/GIT-CONFLICTS.md"
HOLD_ROOT = "_conflicts"
MAX_ATTEMPTS = 5

DOC_EXTS = {".md", ".mdx", ".txt", ".rst"}
# comment style per extension: (line prefixes that make a line a comment, how to write one line)
SLASH = (("//", "/*", "*", "*/", "{/*"), lambda s: "// " + s)
HASH = (("#",), lambda s: "# " + s)
DASH = (("--",), lambda s: "-- " + s)
HTML = (("<!--",), lambda s: "<!-- " + s + " -->")
STYLE = {}
for e in ".ts .tsx .js .jsx .mjs .cjs .css .scss .go .rs .java .c .h .cpp .swift .kt .dart".split():
    STYLE[e] = SLASH
for e in ".py .sh .bash .zsh .yaml .yml .toml .rb .env .ini .cfg .txt .rst".split():
    STYLE[e] = HASH
STYLE[".sql"] = DASH
for e in ".md .mdx .html .xml .svg".split():
    STYLE[e] = HTML
for name in ("Makefile", "Dockerfile"):
    STYLE[name] = HASH


def say(msg):
    print(msg, flush=True)


def die(msg):
    print("SYNC STOPPED: " + msg, file=sys.stderr, flush=True)
    print("Nothing was pushed.", file=sys.stderr, flush=True)
    sys.exit(1)


def git(*args, check=True, raw=False, stdin=None):
    """Run git. Retries briefly when another process holds index.lock."""
    for i in range(40):
        r = subprocess.run(["git", *args], capture_output=True, input=stdin)
        err = r.stderr.decode("utf-8", "replace")
        if r.returncode != 0 and "index.lock" in err and i < 39:
            time.sleep(0.25)
            continue
        break
    out = r.stdout if raw else r.stdout.decode("utf-8", "replace")
    if check and r.returncode != 0:
        die("git %s failed:\n%s%s" % (" ".join(args), r.stdout.decode("utf-8", "replace"), err))
    return r.returncode, out, err


def style_for(path):
    base = os.path.basename(path)
    return STYLE.get(base) or STYLE.get(os.path.splitext(base)[1].lower())


# ── run context: which commits are "local" and "github" ──────────────────────────────────────
CTX = {"ours": "HEAD", "theirs": "MERGE_HEAD", "mb": None}
MTIMES = {}  # path -> local edit time, recorded BEFORE the step-1 commit erases it


def record_mtimes():
    _, out, _ = git("status", "--porcelain", "-z", "--untracked-files=all")
    recs = out.split("\0")
    i = 0
    while i < len(recs):
        rec = recs[i]
        i += 1
        if len(rec) < 4:
            continue
        code, path = rec[:2], rec[3:]
        if "R" in code or "C" in code:
            i += 1  # -z puts the original name in the next record
        if path not in MTIMES and os.path.isfile(path):
            MTIMES[path] = os.path.getmtime(path)


# ── step 1 ──────────────────────────────────────────────────────────────────────────────────
def commit_all():
    git("add", "-A")
    rc, _, _ = git("diff", "--cached", "--quiet", check=False)
    if rc == 0:
        return 0
    _, names, _ = git("diff", "--cached", "--name-only")
    n = len([x for x in names.splitlines() if x])
    git("commit", "--no-verify", "-q", "-m", LOCAL_MSG)
    return n


# ── blob helpers ────────────────────────────────────────────────────────────────────────────
_EMPTY = None


def empty_blob():
    global _EMPTY
    if _EMPTY is None:
        _, out, _ = git("hash-object", "-w", "-t", "blob", "--stdin", stdin=b"")
        _EMPTY = out.strip()
    return _EMPTY


def blob_at(commit, path):
    rc, out, _ = git("rev-parse", "-q", "--verify", "%s:%s" % (commit, path), check=False)
    return out.strip() if rc == 0 else None


def content(sha):
    _, out, _ = git("cat-file", "blob", sha, raw=True)
    return out


def is_binary(data):
    if b"\0" in data[:8000]:
        return True
    try:
        data.decode("utf-8")
        return False
    except UnicodeDecodeError:
        return True


def distance(a, b):
    a, b = a or empty_blob(), b or empty_blob()
    if a == b:
        return 0
    _, out, _ = git("diff", "--numstat", a, b, check=False)
    n = 0
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            n += (1 if parts[0] == "-" else int(parts[0])) + (1 if parts[1] == "-" else int(parts[1]))
    return n


def versions(tip, base, path):
    """Blob of `path` at every commit in base..tip that touched it (newest first), then at base."""
    _, out, _ = git("log", "--format=%H", "%s..%s" % (base, tip), "--", path, check=False)
    shas = [blob_at(c, path) for c in out.split()]
    shas.append(blob_at(base, path))
    seen, result = set(), []
    for s in shas:
        if s not in seen:
            seen.add(s)
            result.append(s)
    return result


def closest(candidates, target):
    best, bestd = None, None
    for c in candidates:  # newest first; ties keep the newer one
        d = distance(c, target)
        if bestd is None or d < bestd:
            best, bestd = c, d
    return best


def merge3(ours, base, theirs):
    """git merge-file on three blobs. Returns (clean, bytes)."""
    with tempfile.TemporaryDirectory() as d:
        paths = []
        for name, sha in (("local", ours), ("base", base), ("github", theirs)):
            p = os.path.join(d, name)
            with open(p, "wb") as f:
                f.write(content(sha or empty_blob()))
            paths.append(p)
        args = ["merge-file", "-p", "-L", "local", "-L", "base", "-L", "github"] + paths
        rc, out, _ = git(*args, check=False, raw=True)
        return rc == 0, out


# ── step 3: one conflicted file ─────────────────────────────────────────────────────────────
def substantial(line):
    t = line.strip()
    return len(t) >= 12 and any(ch.isalnum() for ch in t)


def added_lines(base, side):
    """Substantial lines `side` added relative to `base` (blob shas; None = absent)."""
    _, out, _ = git("diff", "-U0", "--no-color", base or empty_blob(), side or empty_blob(), check=False)
    return [l[1:].strip() for l in out.splitlines()
            if l.startswith("+") and not l.startswith("+++") and substantial(l[1:])]


_CHANGED = {}


def changed_files(ref):
    """Files `ref` changed since the merge base (where moved code could have gone)."""
    if ref not in _CHANGED:
        _, out, _ = git("diff", "--name-only", "-z", CTX["mb"], ref, check=False)
        _CHANGED[ref] = [f for f in out.split("\0") if f]
    return _CHANGED[ref]


def moved_to(line, path):
    """Other files (changed on either side) that contain `line`, as 'file' names."""
    hits = []
    for ref in (CTX["ours"], CTX["theirs"]):
        files = [f for f in changed_files(ref) if f != path]
        if not files:
            continue
        _, out, _ = git("grep", "-l", "-F", "-e", line, ref, "--", *files[:2000], check=False)
        for h in out.splitlines():
            name = h.split(":", 1)[1] if ":" in h else h
            if name not in hits:
                hits.append(name)
    return hits


def containment(path, holder_bytes, base, side):
    """How many substantial lines `side` added (vs base) are present in `holder_bytes`.
    Returns (added_count, missing_list, moved_file). Missing lines count as MOVED only when every
    one of them is found together in ONE other changed file — that is what a real move looks like
    (content-splitter-v2.ts -> content-splitter-core.ts). Scattered look-alikes in unrelated files
    never count."""
    added = added_lines(base, side)
    have = set(l.strip() for l in holder_bytes.decode("utf-8", "replace").splitlines())
    missing = [a for a in added if a not in have]
    if not missing or len(missing) > 300:
        return len(added), missing, None
    common = None
    for m in missing:
        where = set(moved_to(m, path))
        common = where if common is None else common & where
        if not common:
            return len(added), missing, None
    return len(added), [], sorted(common)[0]


def also_found_in(lines, path):
    found = []
    for m in lines[:15]:
        for f in moved_to(m, path):
            if f not in found:
                found.append(f)
    return found


def removed_lines(base, side):
    """Substantial lines `side` deliberately deleted relative to `base`."""
    _, out, _ = git("diff", "-U0", "--no-color", base or empty_blob(), side or empty_blob(), check=False)
    return [l[1:].strip() for l in out.splitlines()
            if l.startswith("-") and not l.startswith("---") and substantial(l[1:])]


def resolve_fake(path, ours, theirs, mb):
    """Return resolved bytes when one version provably covers both sides, else None. Also returns
    the best base for later steps.

    A candidate (ours as-is, GitHub's as-is, or a clean three-way merge from a newer base) is
    accepted ONLY when, measured against the true merge base:
      - every substantial line EITHER side added is in it (or moved to another changed file), and
      - no substantial line EITHER side deliberately deleted is back in it (unless the other side
        added that same line itself).
    Anything less is not a fake conflict and goes on to the docs rule or gets held."""
    base_blob = blob_at(mb, path)
    added = {"o": set(added_lines(base_blob, ours)), "t": set(added_lines(base_blob, theirs))}
    removed = {"o": set(removed_lines(base_blob, ours)), "t": set(removed_lines(base_blob, theirs))}

    def acceptable(result):
        have = set(l.strip() for l in result.decode("utf-8", "replace").splitlines())
        for side, blob in (("o", ours), ("t", theirs)):
            _, missing, _ = containment(path, result, base_blob, blob)
            if missing:
                return False
            other = "t" if side == "o" else "o"
            if any(l in have and l not in added[other] for l in removed[side]):
                return False          # the result would undo a deliberate deletion
        return True

    b1 = closest(versions(CTX["theirs"], mb, path), ours)
    b2 = closest(versions(CTX["ours"], mb, path), theirs)
    candidates = [content(ours), content(theirs)]
    for base in (b1, b2):
        ok, out = merge3(ours, base, theirs)
        if ok:
            candidates.append(out)
    for c in candidates:
        if acceptable(c):
            return c, b1
    return None, b1


# ── facts for a human or agent (never a decision) ───────────────────────────────────────────
def fmt_time(t):
    return datetime.datetime.fromtimestamp(t).strftime("%Y-%m-%d %H:%M")


def fmt_gap(sec):
    sec = int(abs(sec))
    d, h, m = sec // 86400, sec % 86400 // 3600, sec % 3600 // 60
    return ("%dd %dh" % (d, h)) if d else ("%dh %dm" % (h, m)) if h else ("%dm" % m)


def last_change(ref, path):
    """(time, 'sha "subject"', approximate?) for the newest real change to path on ref's side."""
    _, out, _ = git("log", "--format=%H%x1f%ct%x1f%s", "%s..%s" % (CTX["mb"], ref), "--", path,
                    check=False)
    rows = [r.split("\x1f") for r in out.splitlines() if r.count("\x1f") == 2]
    real = [r for r in rows if r[2] != LOCAL_MSG]
    if real:
        return int(real[0][1]), '%s "%s"' % (real[0][0][:10], real[0][2]), False
    if rows:
        return int(rows[0][1]), '%s "%s" (uncommitted edit; the real edit time is at or before this)' % (
            rows[0][0][:10], rows[0][2]), True
    return None, "(no change on this side)", False


def facts(path, ours, theirs):
    """Plain facts about one conflicted file. Returns (block for the .held file, one-line summary)."""
    lt, lwhat, lapprox = last_change(CTX["ours"], path)
    if path in MTIMES:
        lt, lwhat, lapprox = MTIMES[path], "uncommitted edit (file saved on disk at this time)", False
    gt, gwhat, _ = last_change(CTX["theirs"], path)
    lines = ["FACTS (computed by sync-main from git; trust these over your own reading)",
             "LOCAL  last changed: %s  %s" % (fmt_time(lt) if lt else "unknown", lwhat),
             "GITHUB last changed: %s  %s" % (fmt_time(gt) if gt else "unknown", gwhat)]
    if lt and gt:
        if lapprox and lt > gt:
            newer = "UNSURE: local was saved after GitHub's change, but the real edit time is unknown"
        elif lt > gt:
            newer = "LOCAL is newer, by %s" % fmt_gap(lt - gt)
        elif gt > lt:
            newer = "GITHUB is newer, by %s" % fmt_gap(gt - lt)
        else:
            newer = "same time"
    else:
        newer = "unknown"
    lines.append("NEWER: " + newer)
    base_blob = blob_at(CTX["mb"], path)
    summary = [newer.split(",")[0]]
    for holder, hname, side, sname in ((ours, "LOCAL", theirs, "GITHUB"), (theirs, "GITHUB", ours, "LOCAL")):
        if not holder or not side:
            continue
        n, missing, moved = containment(path, content(holder), base_blob, side)
        if n == 0:
            lines.append("%s added no substantial lines of its own." % sname)
            continue
        line = "%s already has %d of the %d lines %s added" % (hname, n - len(missing), n, sname)
        if moved:
            line += " (the rest were MOVED, all together, into %s)" % moved
        lines.append(line + ".")
        summary.append("%s has %d/%d of %s's new lines%s" % (
            hname.lower(), n - len(missing), n, sname.lower(), " (rest moved to %s)" % moved if moved else ""))
        if missing:
            lines.append("  Lines %s added that %s does NOT have:" % (sname, hname))
            lines += ["    | " + m[:140] for m in missing[:15]]
            if len(missing) > 15:
                lines.append("    | ... and %d more" % (len(missing) - 15))
            elsewhere = also_found_in(missing, path)
            if elsewhere:
                lines.append("    (some of these lines also appear in other changed files, which may be a "
                             "coincidence: %s)" % ", ".join(elsewhere[:4]))
    return "\n".join(lines) + "\n", "; ".join(summary)


HUNK = re.compile(rb"^<<<<<<< local\n(.*?)^=======\n(.*?)^>>>>>>> github\n", re.S | re.M)


def resolve_docs(path, ours, base, theirs, when=""):
    """Keep both sides of every clash when the file is a doc, or every clash is comments only."""
    style = style_for(path)
    if style is None:
        return None
    ok, merged = merge3(ours, base, theirs)
    if ok:
        return merged
    hunks = list(HUNK.finditer(merged))
    if not hunks:
        return None
    prefixes, write = style
    is_doc = os.path.splitext(path)[1].lower() in DOC_EXTS
    if not is_doc:
        for h in hunks:
            for side in (h.group(1), h.group(2)):
                for line in side.decode("utf-8").splitlines():
                    s = line.strip()
                    if s and not s.startswith(prefixes):
                        return None       # real code in the clash
    top = (write(DOCS_MARK + " — two versions follow: LOCAL first, then GITHUB. " + when +
                 " Keep the right text, delete these three marker lines.") + "\n").encode()
    mid = (write(DOCS_MARK + " — GITHUB version below") + "\n").encode()
    end = (write(DOCS_MARK + " — end of both versions") + "\n").encode()
    out = HUNK.sub(lambda h: top + h.group(1) + mid + h.group(2) + end, merged)
    if b"<<<<<<< local" in out:
        return None
    return out


def write_live(path, data, mode):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    if mode == "100755":
        os.chmod(path, 0o755)
    git("add", "--", path)


def hold(path, ours, theirs, stamp, reason, fact_block, theirs_mode):
    """GitHub's version goes live; ours is saved under _conflicts/<stamp>/<path>.held."""
    held = os.path.join(HOLD_ROOT, stamp, path + ".held")
    os.makedirs(os.path.dirname(held), exist_ok=True)
    header = ("%s\n\nOriginal file: %s\nWhy it was held: %s\n"
              "GitHub's version is live in the repo. Below is the LOCAL version that conflicted with it.\n"
              "To resolve: follow the steps at the top of %s.\n\n%s"
              "---------------- LOCAL VERSION BELOW ----------------\n"
              % (HELD_MARK, path, reason, LOG_REL, fact_block)).encode()
    body = b"(the local side deleted this file)\n"
    binary = False
    if ours:
        body = content(ours)
        binary = is_binary(body)
    if binary:
        with open(held, "wb") as f:
            f.write(body)
        with open(held + "-note.txt", "wb") as f:
            f.write(header.replace(b"Below is", b"Next to this note (" + os.path.basename(held).encode()
                                   + b") is"))
    else:
        with open(held, "wb") as f:
            f.write(header + body)
    if theirs:
        write_live(path, content(theirs), theirs_mode)
    else:
        git("rm", "-q", "--cached", "--ignore-unmatch", "--", path)
        if os.path.lexists(path):
            os.remove(path)
    return held


def stages(path):
    _, out, _ = git("ls-files", "-u", "-z", "--", path)
    st = {}
    for rec in out.split("\0"):
        if not rec:
            continue
        meta, _ = rec.split("\t", 1)
        mode, sha, n = meta.split()
        st[int(n)] = (mode, sha)
    return st


def decide(path, ours, theirs, ours_mode, theirs_mode, stamp, mb):
    """Resolve ONE conflicted file. Returns ('fixed'|'docs'|'held', held_path_or_None, summary)."""
    def held(reason):
        block, summary = facts(path, ours, theirs)
        return "held", hold(path, ours, theirs, stamp, reason, block, theirs_mode), summary

    if not ours or not theirs:
        return held("deleted on one side, changed on the other")
    mode = ours_mode or theirs_mode
    if mode == "120000" or is_binary(content(ours)) or is_binary(content(theirs)):
        return held("binary or symlink file")
    data, base = resolve_fake(path, ours, theirs, mb)
    if data is not None:
        write_live(path, data, mode)
        return "fixed", None, ""
    _, summary = facts(path, ours, theirs)
    data = resolve_docs(path, ours, base, theirs, when="(" + summary + ")")
    if data is not None:
        write_live(path, data, mode)
        return "docs", None, summary
    return held("both sides changed the same code")


def resolve_all(stamp):
    _, mb, _ = git("merge-base", "HEAD", "MERGE_HEAD")
    mb = mb.strip()
    CTX.update(ours="HEAD", theirs="MERGE_HEAD", mb=mb)
    _CHANGED.clear()
    _, out, _ = git("diff", "--name-only", "--diff-filter=U", "-z")
    files = [f for f in out.split("\0") if f]
    fixed, docs, held = [], [], []
    for path in files:
        st = stages(path)
        ours_mode, ours = st.get(2, (None, None))
        theirs_mode, theirs = st.get(3, (None, None))
        kind, held_path, summary = decide(path, ours, theirs, ours_mode, theirs_mode, stamp, mb)
        if kind == "fixed":
            fixed.append(path)
        elif kind == "docs":
            docs.append((path, summary))
        else:
            held.append((path, held_path, summary))
    return fixed, docs, held


# ── the to-do file ──────────────────────────────────────────────────────────────────────────
LOG_HEADER = """# Git conflicts — goal: ZERO items

Written automatically by `scripts/sync-main.py` whenever it syncs this repo with GitHub and hits
something it cannot safely decide alone. Nothing here is lost: every local byte is also inside the
sync's "local work not committed by agents who made them" commit.

**Agents: your job is to make this file empty.** Fix an item, then DELETE its line. When a
`_conflicts/<stamp>/` folder has no files left, delete the folder and its heading. Never keep
history here — a fixed item is deleted, never ticked, annotated or moved to a "done" list.

## How to resolve a held file (do these in order)

1. **Open the `.held` file and read its FACTS block first.** The sync computed them from git:
   when each side last changed the file, the commit message on each side, which side is NEWER,
   and exactly which lines each side has that the other does not. Trust these facts over your own
   reading of dates — do not recompute them.
2. **Compare the two versions.** The live file at `<path>` is GitHub's. The `.held` file is ours
   (everything below the `LOCAL VERSION BELOW` line):
   `diff <path> _conflicts/<stamp>/<path>.held`
3. **Decide, using the facts:**
   - The NEWER side usually wins. Take it, then check the lines the facts say it does NOT have:
     if the newer side rewrote them on purpose (same job, new code), drop them; if they are a
     separate feature, add them to the newer side.
   - Both sides added different, unrelated things → combine them by hand.
   - The facts say UNSURE, or you truly cannot tell → leave the item, add ONE line under
     "Needs Arman" saying what the choice is.
4. **Apply:** write the chosen content into the live file at `<path>` (without the `.held`
   header). Make sure it compiles: `pnpm type-check` for TypeScript — fix anything your choice broke.
5. **Clean up:** delete the `.held` file, delete its line below, delete the empty folder + heading.
6. **Verify:** `python3 scripts/check-conflict-markers.py` must print `clean`.
7. **Finish:** `python3 scripts/sync-main.py` — it commits your fix and syncs with GitHub.

(History if you need more than the facts: the sync's merge commit is
`git log --merges --grep='sync-main' -1`; its `^1` is the local side, `^2` is GitHub's.)

## How to resolve a docs/comments item

The file holds both versions between marker lines (LOCAL first, then GITHUB). Keep the right text
(usually the newer one, or both merged into one clean passage), delete all three marker lines,
delete the item's line below, then do steps 6–7 above.

## Held files — real conflicts

## Needs Arman

## Docs and comments — both versions kept
"""
HELD_H = "## Held files"
DOCS_H = "## Docs and comments"


def insert_in_section(text, heading, block):
    """Insert `block` at the end of the section that starts with `heading` (before the next ## )."""
    i = text.index(heading)
    j = text.find("\n## ", i + len(heading))
    if j == -1:
        return text.rstrip("\n") + "\n" + block
    return text[:j].rstrip("\n") + "\n" + block + "\n" + text[j + 1:]


def update_log(stamp, docs, held):
    if not docs and not held:
        return
    os.makedirs(os.path.dirname(LOG_REL), exist_ok=True)
    text = open(LOG_REL).read() if os.path.exists(LOG_REL) else LOG_HEADER
    for h in (HELD_H, DOCS_H):
        if h not in text:
            text = text.rstrip("\n") + "\n\n" + h + "\n"
    if held:
        block = "\n### %s/%s/\n" % (HOLD_ROOT, stamp) + "".join(
            "- %s — %s\n" % (p, s) if s else "- %s\n" % p for p, _, s in held)
        text = insert_in_section(text, HELD_H, block)
    if docs:
        text = insert_in_section(text, DOCS_H, "".join(
            "- %s — %s\n" % (p, s) if s else "- %s\n" % p for p, s in docs))
    with open(LOG_REL, "w") as f:
        f.write(text)
    git("add", "--", LOG_REL)


# ── main ────────────────────────────────────────────────────────────────────────────────────
def replay(args):
    """Recreate the state right after a past sync for the given files, using TODAY's rules."""
    if len(args) < 2:
        die("usage: python3 scripts/sync-main.py --replay <sync merge commit> <path> [<path> ...]")
    m = args[0]
    rc, ours_ref, _ = git("rev-parse", "-q", "--verify", m + "^1", check=False)
    rc2, theirs_ref, _ = git("rev-parse", "-q", "--verify", m + "^2", check=False)
    if rc or rc2:
        die("%s is not a merge commit (it needs two parents)." % m)
    ours_ref, theirs_ref = ours_ref.strip(), theirs_ref.strip()
    _, mb, _ = git("merge-base", ours_ref, theirs_ref)
    CTX.update(ours=ours_ref, theirs=theirs_ref, mb=mb.strip())
    stamp = "replay-" + datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S")
    fixed, docs, held = [], [], []
    for path in args[1:]:
        def tree_entry(ref):
            _, out, _ = git("ls-tree", ref, "--", path)
            parts = out.split()
            return (parts[0], parts[2]) if len(parts) >= 3 else (None, None)
        ours_mode, ours = tree_entry(ours_ref)
        theirs_mode, theirs = tree_entry(theirs_ref)
        kind, held_path, summary = decide(path, ours, theirs, ours_mode, theirs_mode, stamp, CTX["mb"])
        if kind == "fixed":
            fixed.append(path)
        elif kind == "docs":
            docs.append((path, summary))
        else:
            held.append((path, held_path, summary))
    update_log(stamp, docs, held)
    if held:
        git("add", "--", HOLD_ROOT)
    git("add", "--", *args[1:])
    git("commit", "--no-verify", "-q", "-m", "sync-main --replay %s: %d auto-fixed, %d docs/comments flagged, "
        "%d held (recreated for a re-test)" % (m[:10], len(fixed), len(docs), len(held)), "--",
        LOG_REL, *([HOLD_ROOT] if held else []), *args[1:])
    report(fixed, docs, held, "replayed %s with today's rules (committed locally, not pushed)" % m[:10])


def report(fixed, docs, held, headline):
    say(headline + ": %d auto-fixed, %d docs/comments flagged, %d held" % (len(fixed), len(docs), len(held)))
    for p in fixed:
        say("  auto-fixed: " + p)
    for p, s in docs:
        say("  docs/comments: %s  (%s)" % (p, s))
    for p, h, s in held:
        say("  held: %s  ->  %s\n        %s" % (p, h, s))
    if docs or held:
        say("Listed in %s for agents to clear." % LOG_REL)


def main():
    if sys.argv[1:2] == ["--replay"]:
        _, top, _ = git("rev-parse", "--show-toplevel")
        os.chdir(top.strip())
        replay(sys.argv[2:])
        return
    push = "--no-push" not in sys.argv[1:]
    _, top, _ = git("rev-parse", "--show-toplevel")
    os.chdir(top.strip())
    # Show where we started, so the terminal holds the before-state if anything goes wrong.
    say("==================== git status (before sync) ====================")
    subprocess.run(["git", "status"])
    _, start, _ = git("rev-parse", "HEAD")
    say("==================== starting point: %s ====================" % start.strip())
    say("(to see this exact state again later: git log %s)\n" % start.strip()[:10])
    _, br, _ = git("symbolic-ref", "-q", "--short", "HEAD", check=False)
    if br.strip() != BRANCH:
        die("this checkout is on '%s', not %s." % (br.strip() or "a detached HEAD", BRANCH))
    _, gd, _ = git("rev-parse", "--git-dir")
    gd = gd.strip()
    for leftover in ("MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD"):
        if os.path.exists(os.path.join(gd, leftover)):
            die("a %s is already in progress here. Finish it, or undo it with `git merge --abort` "
                "/ `git rebase --abort`, then run this again." % leftover)

    stamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S")
    total_local = pulled = 0
    fixed, docs, held = [], [], []
    for attempt in range(1, MAX_ATTEMPTS + 1):
        record_mtimes()
        total_local += commit_all()
        rc, _, err = git("fetch", "-q", REMOTE, BRANCH, check=False)
        if rc != 0:
            die("could not reach GitHub:\n" + err)
        _, n, _ = git("rev-list", "--count", "HEAD..%s/%s" % (REMOTE, BRANCH))
        pulled += int(n.strip())
        rc, out, err = git("merge", "--no-edit", "--no-verify", "-q", "%s/%s" % (REMOTE, BRANCH),
                           check=False)
        if rc != 0:
            if not os.path.exists(os.path.join(gd, "MERGE_HEAD")):
                if "overwritten" in out + err:   # an agent wrote a file between step 1 and now
                    continue
                die("git merge failed:\n" + out + err)
            f, d, h = resolve_all(stamp)
            fixed += f
            docs += d
            held += h
            update_log(stamp, d, h)
            if h:
                git("add", "--", HOLD_ROOT)
            _, left, _ = git("diff", "--name-only", "--diff-filter=U")
            if left.strip():
                die("these files are still unresolved (this is a bug in sync-main; the merge is "
                    "left open so you can see it):\n" + left)
            msg = "Merge %s/%s (sync-main): %d auto-fixed, %d docs/comments flagged, %d held" % (
                REMOTE, BRANCH, len(f), len(d), len(h))
            git("commit", "--no-verify", "-q", "-m", msg)
        if not push:
            break
        rc, _, err = git("push", "-q", REMOTE, "HEAD:%s" % BRANCH, check=False)
        if rc == 0:
            break
        if attempt == MAX_ATTEMPTS or not re.search(r"non-fast-forward|fetch first|rejected", err):
            die("git push failed:\n" + err)
        say("GitHub moved while syncing; going again (attempt %d)." % (attempt + 1))

    report(fixed, docs, held,
           "synced: %d local files committed, %d commits pulled from GitHub%s" % (
               total_local, pulled, "" if push else " (--no-push: nothing pushed)"))


if __name__ == "__main__":
    main()
