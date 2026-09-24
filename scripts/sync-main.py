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
        lines, list it in _conflicts/README.md.
     c. REAL conflict (or binary, or deleted on one side) -> GitHub's version goes live, our
        version is saved as _conflicts/<stamp>/<path>.held, listed in _conflicts/README.md,
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
LOG_REL = "_conflicts/README.md"
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


_DIFFS = {}


def side_changes(base, side):
    """(added, removed): substantial lines `side` really added / deleted relative to `base`.
    A line that appears on both lists only changed indentation or moved within the file, so it is
    dropped from both — it is neither new code nor deleted code."""
    key = (base, side)
    if key not in _DIFFS:
        _, out, _ = git("diff", "-U0", "--no-color", base or empty_blob(), side or empty_blob(), check=False)
        add = [l[1:].strip() for l in out.splitlines()
               if l.startswith("+") and not l.startswith("+++") and substantial(l[1:])]
        rem = [l[1:].strip() for l in out.splitlines()
               if l.startswith("-") and not l.startswith("---") and substantial(l[1:])]
        both = set(add) & set(rem)
        _DIFFS[key] = ([x for x in add if x not in both], [x for x in rem if x not in both])
    return _DIFFS[key]


def added_lines(base, side):
    return side_changes(base, side)[0]


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
    return side_changes(base, side)[1]


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


def side_history(ref, path):
    """[(sha, time, subject)] for every commit on ref's side that changed path, newest first."""
    _, out, _ = git("log", "--format=%H%x1f%ct%x1f%s", "%s..%s" % (CTX["mb"], ref), "--", path,
                    check=False)
    return [(r[0], int(r[1]), r[2]) for r in (x.split("\x1f") for x in out.splitlines()) if len(r) == 3]


def nlines(blob):
    return len(content(blob).splitlines()) if blob else 0


def quote(path):
    return "'" + path.replace("'", "'\\''") + "'"


def facts(path, ours, theirs):
    """Plain, exact facts about one conflicted file. Returns (block for the .held file, one-line
    summary for the to-do list). Facts only; the reasoning is the reader's job."""
    mb = CTX["mb"]
    base_blob = blob_at(mb, path)
    _, mbt, _ = git("log", "-1", "--format=%ct", mb)
    L = ["FACTS (computed by sync-main from git)", "",
         "THE TWO VERSIONS",
         "  LOCAL  = the version that was on this Mac. It is saved below, in this .held file.",
         "  GITHUB = the version from GitHub. It is LIVE in the repo right now, at %s" % path,
         "  Both grew from the same COMMON version: commit %s, %s." % (mb[:10], fmt_time(int(mbt))), ""]

    L.append("WHEN EACH SIDE CHANGED THIS FILE (newest first)")
    latest = {}
    for name, ref in (("LOCAL", CTX["ours"]), ("GITHUB", CTX["theirs"])):
        L.append("  %s:" % name)
        rows = side_history(ref, path)
        if name == "LOCAL" and path in MTIMES:
            L.append("    %s  (uncommitted edit; the time the file was last saved on this Mac)" % fmt_time(MTIMES[path]))
            latest[name] = MTIMES[path]
        for sha, t, subj in rows:
            if subj == LOCAL_MSG:
                L.append("    %s  %s  collected by the sync; the edit itself happened at or before this time"
                         % (fmt_time(t), sha[:10]))
            else:
                L.append('    %s  %s  "%s"' % (fmt_time(t), sha[:10], subj))
        if not rows and name not in latest:
            L.append("    (no change on this side)")
        if name not in latest:
            real = [r for r in rows if r[2] != LOCAL_MSG]
            if real:
                latest[name] = real[0][1]
    if "LOCAL" in latest and "GITHUB" in latest:
        gap = latest["LOCAL"] - latest["GITHUB"]
        if gap > 0:
            L.append("  LOCAL's latest change is %s AFTER GITHUB's latest change." % fmt_gap(gap))
        elif gap < 0:
            L.append("  GITHUB's latest change is %s AFTER LOCAL's latest change." % fmt_gap(gap))
        else:
            L.append("  Both sides' latest changes have the same time.")
    else:
        L.append("  Which side changed it last is UNKNOWN (the local edit was never committed and its "
                 "save time was not recorded).")
    L += ["", "SIZE: common version %d lines, LOCAL %d lines, GITHUB %d lines"
          % (nlines(base_blob), nlines(ours), nlines(theirs)), ""]

    L.append("WHAT EACH SIDE DID, compared with the common version")
    for name, blob in (("LOCAL", ours), ("GITHUB", theirs)):
        if not blob:
            L.append("  %s deleted the whole file." % name)
            continue
        L.append("  %s added %d lines and removed %d lines." % (
            name, len(added_lines(base_blob, blob)), len(removed_lines(base_blob, blob))))
    L.append("")

    L.append("CODE ONE SIDE HAS THAT THE OTHER DOES NOT")
    summary = []
    for holder, hname, side, sname in ((ours, "LOCAL", theirs, "GITHUB"), (theirs, "GITHUB", ours, "LOCAL")):
        if not holder or not side:
            continue
        n, missing, moved = containment(path, content(holder), base_blob, side)
        if n == 0:
            L.append("  %s added no lines of its own." % sname)
            continue
        line = "  %s has %d of the %d lines %s added" % (hname, n - len(missing), n, sname)
        if moved:
            line += "; the rest were MOVED, all together, into %s" % moved
        L.append(line + ".")
        summary.append("%s lacks %d of %s's %d new lines%s" % (
            hname, len(missing), sname, n, " (moved to %s)" % moved if moved else ""))
        if missing:
            L.append("    Lines %s added that %s does NOT have:" % (sname, hname))
            L += ["      | " + m[:140] for m in missing[:15]]
            if len(missing) > 15:
                L.append("      | ... and %d more" % (len(missing) - 15))
            elsewhere = also_found_in(missing, path)
            if elsewhere:
                L.append("    (some of those lines also appear in other changed files, which may be a "
                         "coincidence: %s)" % ", ".join(elsewhere[:4]))
        have = set(l.strip() for l in content(holder).decode("utf-8", "replace").splitlines())
        undone = [r for r in removed_lines(base_blob, side) if r in have]
        if undone:
            L.append("    Lines %s deliberately REMOVED that %s still has: %d" % (sname, hname, len(undone)))
            L += ["      | " + m[:140] for m in undone[:10]]
    lt = "LOCAL latest %s" % (fmt_time(latest["LOCAL"]) if "LOCAL" in latest else "unknown")
    gt = "GITHUB latest %s" % (fmt_time(latest["GITHUB"]) if "GITHUB" in latest else "unknown")
    L += ["", "COMPARE THEM (the labels are correct; '-' lines are GITHUB, '+' lines are LOCAL):",
          "  diff -u --label 'GITHUB (live)' --label 'LOCAL (held)' <(git show %s:%s) <(git show %s:%s)"
          % (CTX["theirs"][:12], quote(path), CTX["ours"][:12], quote(path)), "",
          "RECOVER EITHER VERSION FOREVER (works even after this .held file is deleted):",
          "  LOCAL : git show %s:%s" % (CTX["ours"][:12], quote(path)),
          "  GITHUB: git show %s:%s" % (CTX["theirs"][:12], quote(path)), ""]
    one_line = "%s; %s; %s; recover: git show %s:%s / %s:%s" % (
        lt, gt, "; ".join(summary) or "no line differences", CTX["ours"][:10], quote(path),
        CTX["theirs"][:10], quote(path))
    return "\n".join(L) + "\n", one_line


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
                 " Delete these three marker lines when resolved.") + "\n").encode()
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
    header = ("%s\n\n"
              "HELD CONFLICT, written by scripts/sync-main.py\n"
              "File:      %s\n"
              "Why held:  %s\n"
              "GITHUB's version is live in the repo at the path above. LOCAL's version is at the bottom\n"
              "of this file, below the FACTS.\n"
              "Done with it: the final code is in the live file, this .held file is deleted, and its line\n"
              "in %s is deleted. The list of open items is %s.\n\n%s"
              "---------------- LOCAL VERSION BELOW ----------------\n"
              % (HELD_MARK, path, reason, LOG_REL, LOG_REL, fact_block)).encode()
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
    _, o, _ = git("rev-parse", "HEAD")
    _, t, _ = git("rev-parse", "MERGE_HEAD")
    CTX.update(ours=o.strip(), theirs=t.strip(), mb=mb)
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
LOG_HEADER = """# Merge conflicts from scripts/sync-main.py

This folder is permanent. When every list below is empty, nothing from `scripts/sync-main.py` is
open in this repo. (`scripts/sync-main.py` removes empty folders left inside it on every run.)

## What the items are
- **Held file** — `_conflicts/<stamp>/<path>.held`. LOCAL and GITHUB changed the same code.
  GITHUB's version is live in the repo at `<path>`; LOCAL's version is inside the `.held` file,
  below a FACTS block computed from git. Both versions stay in git permanently; each `.held` file
  has the `git show` commands that print either one.
- **Docs/comments, both versions kept** — a file in the repo where a clashing passage now holds
  both versions between three marker lines (LOCAL first, then GITHUB).

## Marking an item done
- Held file: the final code is in `<path>`, the `.held` file is deleted, its line below is deleted.
- Docs/comments: the passage is edited, the three marker lines are deleted, its line below is deleted.
- `python3 scripts/check-conflict-markers.py` lists everything still open, or prints `clean`.
- `python3 scripts/sync-main.py` commits and syncs.

## Escalation
An item is passed up by moving its line to the next section (Needs a manager -> Needs the boss
agent -> Needs Arman) with ` — <question> — <what was checked> — <who>` added to the end of it.
Its files stay as they are.

## Held files

## Needs a manager

## Needs the boss agent

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
    os.makedirs(HOLD_ROOT, exist_ok=True)
    text = open(LOG_REL).read() if os.path.exists(LOG_REL) else LOG_HEADER
    for h in (HELD_H, DOCS_H):
        if h not in text:
            text = text.rstrip("\n") + "\n\n" + h + "\n"
    if held:
        text = insert_in_section(text, HELD_H, "".join(
            "- %s — %s\n" % (hp, s) if s else "- %s\n" % hp for _, hp, s in held))
    if docs:
        text = insert_in_section(text, DOCS_H, "".join(
            "- %s — %s\n" % (p, s) if s else "- %s\n" % p for p, s in docs))
    with open(LOG_REL, "w") as f:
        f.write(text)
    git("add", "--", LOG_REL)


def listed_items(log_path):
    """Items listed under the item sections of the tracker (Held files, Needs *, Docs and
    comments). Bullets in the explanatory sections at the top are not items."""
    items, in_items = [], False
    if not os.path.exists(log_path):
        return items
    for line in open(log_path):
        if line.startswith("## "):
            in_items = line.startswith(("## Held files", "## Needs", "## Docs and comments"))
        elif in_items and line.startswith("- "):
            items.append(line[2:].split(" — ")[0].strip())
    return items


def prune():
    """Housekeeping, announced: delete empty folders under _conflicts/ (git does not track empty
    folders, so they are pure leftovers), and create _conflicts/README.md if it is missing. The
    folder and its README are permanent: an empty list means nothing is open."""
    if os.path.isdir(HOLD_ROOT):
        removed = 0
        for root, dirs, files in os.walk(HOLD_ROOT, topdown=False):
            if root != HOLD_ROOT and not os.listdir(root):
                os.rmdir(root)
                removed += 1
        if removed:
            say("pruned %d empty folder(s) left under %s/" % (removed, HOLD_ROOT))
    if not os.path.exists(LOG_REL):
        os.makedirs(HOLD_ROOT, exist_ok=True)
        with open(LOG_REL, "w") as f:
            f.write(LOG_HEADER)
        say("created %s" % LOG_REL)


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
    if held or docs:
        git("add", "--", HOLD_ROOT)
    git("add", "--", *args[1:])
    git("commit", "--no-verify", "-q", "-m", "sync-main --replay %s: %d auto-fixed, %d docs/comments flagged, "
        "%d held (recreated for a re-test)" % (m[:10], len(fixed), len(docs), len(held)), "--",
        *([HOLD_ROOT] if (held or docs) else []), *args[1:])
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
        say("Listed in %s." % LOG_REL)


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
                "/ `git rebase --abort`, then run this again. BEFORE undoing, run "
                "`git diff --cached --name-only`: undoing resets every STAGED edit (unstaged edits "
                "survive), so commit or note anything staged that is real work." % leftover)

    stamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S")
    total_local = pulled = 0
    fixed, docs, held = [], [], []
    for attempt in range(1, MAX_ATTEMPTS + 1):
        prune()
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
            if h or d:
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
