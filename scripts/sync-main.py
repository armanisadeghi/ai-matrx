#!/usr/bin/env python3
"""sync-main — make this checkout identical to GitHub's main, with all local work on top.

Run it from the repo root:   python3 scripts/sync-main.py
Options:                       --no-push   do everything locally, push nothing (for testing)

WHAT IT DOES (Arman's sequence, 2026-09-24)
  1. git add -A  +  git commit -m "local work not committed by agents who made them"
  2. git fetch + git merge origin/main          (this is `git pull --no-rebase`)
     clean  -> go to 4
  3. for every file git stops on:
     a. FAKE conflict: one side already contains the other (an agent pushed an early copy of the
        file, then kept editing it here) -> keep the fuller version, silently.
     b. .md/.txt file, or a clash made only of comments -> keep BOTH versions between marker
        lines, list it in .matrx/GIT-CONFLICTS.md.
     c. REAL conflict (or binary, or deleted on one side) -> GitHub's version goes live, our
        version is saved as _conflicts/<stamp>/<path>.held, listed in .matrx/GIT-CONFLICTS.md.
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
def resolve_fake(path, ours, theirs, mb):
    """Return resolved bytes when one side already contains the other, else None. Also returns
    the best base for later steps."""
    their_hist = versions("MERGE_HEAD", mb, path)
    b1 = closest(their_hist, ours)
    if b1 == theirs:
        return content(ours), b1          # ours = GitHub's latest + more work
    our_hist = versions("HEAD", mb, path)
    b2 = closest(our_hist, theirs)
    if b2 == ours:
        return content(theirs), b1        # GitHub's = ours + more work
    for base in (b1, b2):
        ok, out = merge3(ours, base, theirs)
        if ok:
            return out, b1                # grew from a newer version than the merge base
    return None, b1


HUNK = re.compile(rb"^<<<<<<< local\n(.*?)^=======\n(.*?)^>>>>>>> github\n", re.S | re.M)


def resolve_docs(path, ours, base, theirs):
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
    top = (write(DOCS_MARK + " — two versions follow: LOCAL first, then GITHUB. Keep the right text, "
                 "delete these three marker lines.") + "\n").encode()
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


def hold(path, ours, theirs, stamp, reason):
    """GitHub's version goes live; ours is saved under _conflicts/<stamp>/<path>.held."""
    held = os.path.join(HOLD_ROOT, stamp, path + ".held")
    os.makedirs(os.path.dirname(held), exist_ok=True)
    header = ("%s\n\nOriginal file: %s\nWhy it was held: %s\n"
              "GitHub's version is live in the repo. Below is the LOCAL version that conflicted with it.\n"
              "To resolve: merge what is worth keeping into %s, then delete this file and its line in %s.\n"
              "---------------- LOCAL VERSION BELOW ----------------\n"
              % (HELD_MARK, path, reason, path, LOG_REL)).encode()
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
        git("checkout", "--theirs", "--", path)
        git("add", "--", path)
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


def resolve_all(stamp):
    _, mb, _ = git("merge-base", "HEAD", "MERGE_HEAD")
    mb = mb.strip()
    _, out, _ = git("diff", "--name-only", "--diff-filter=U", "-z")
    files = [f for f in out.split("\0") if f]
    fixed, docs, held = [], [], []
    for path in files:
        st = stages(path)
        ours = st.get(2, (None, None))[1]
        theirs = st.get(3, (None, None))[1]
        mode = (st.get(2) or st.get(3))[0]
        if not ours or not theirs:
            held.append((path, hold(path, ours, theirs, stamp,
                                    "deleted on one side, changed on the other")))
            continue
        if mode == "120000" or is_binary(content(ours)) or is_binary(content(theirs)):
            held.append((path, hold(path, ours, theirs, stamp, "binary or symlink file")))
            continue
        data, base = resolve_fake(path, ours, theirs, mb)
        if data is not None:
            write_live(path, data, mode)
            fixed.append(path)
            continue
        data = resolve_docs(path, ours, base, theirs)
        if data is not None:
            write_live(path, data, mode)
            docs.append(path)
            continue
        held.append((path, hold(path, ours, theirs, stamp, "both sides changed the same code")))
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

1. **Find the sync's merge commit** (M below):
   `git log --merges --grep='sync-main' -1 --format='%h %ci'`
2. **Learn WHEN and WHY each side changed the file** — the newer change usually wins:
   - GitHub side: `git log -5 --format='%h %ci %s' M^2 -- <path>`
   - Local side:  `git log -5 --format='%h %ci %s' M^1 -- <path>`
     (if the only local entry is "local work not committed…", the edit was uncommitted; its time
     is roughly the time of that commit or earlier)
3. **Compare the two versions.** The live file is GitHub's. The `.held` file is ours (skip its
   header, everything above the `LOCAL VERSION BELOW` line):
   `diff <path> _conflicts/<stamp>/<path>.held`
4. **Check whether the NEWER side already contains the older side's change.** It often does —
   an agent pushed an early copy, then kept working. The change may have MOVED to another file:
   pick 2–3 distinctive lines the older side added and search for them:
   `git grep -n -F '<distinctive line>'`
5. **Decide:**
   - Newer side contains the older side's change (in this file or moved elsewhere) → take the newer side.
   - Newer side deliberately REWROTE the older side's lines (same purpose, new code) → take the newer side.
   - Both sides added different, unrelated things → combine them by hand.
   - Truly unclear → leave the item, add ONE line under "Needs Arman" saying what the choice is.
6. **Apply:** write the chosen content into the live file at `<path>` (without the `.held` header).
   Make sure it compiles: `pnpm type-check` (TypeScript) — fix anything your choice broke.
7. **Clean up:** delete the `.held` file, delete its line below, delete the empty folder + heading.
8. **Verify:** `python3 scripts/check-conflict-markers.py` must print `clean`.
9. **Finish:** `python3 scripts/sync-main.py` — it commits your fix and syncs with GitHub.

## How to resolve a docs/comments item

The file holds both versions between marker lines (LOCAL first, then GITHUB). Keep the right text
(usually the newer one, or both merged into one clean passage), delete all three marker lines,
delete the item's line below, then do steps 8–9 above.

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
        block = "\n### %s/%s/\n" % (HOLD_ROOT, stamp) + "".join("- %s\n" % p for p, _ in held)
        text = insert_in_section(text, HELD_H, block)
    if docs:
        text = insert_in_section(text, DOCS_H, "".join("- %s\n" % p for p in docs))
    with open(LOG_REL, "w") as f:
        f.write(text)
    git("add", "--", LOG_REL)


# ── main ────────────────────────────────────────────────────────────────────────────────────
def main():
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

    say("synced: %d local files committed, %d commits pulled from GitHub, %d fake conflicts auto-fixed, "
        "%d docs/comments flagged, %d held%s" % (total_local, pulled, len(fixed), len(docs), len(held),
                                                "" if push else "  (--no-push: nothing pushed)"))
    for p in docs:
        say("  docs/comments: " + p)
    for p, h in held:
        say("  held: %s  ->  %s" % (p, h))
    if docs or held:
        say("Listed in %s for agents to clear." % LOG_REL)


if __name__ == "__main__":
    main()
