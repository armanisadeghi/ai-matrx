#!/usr/bin/env python3
"""check-conflict-markers — find every leftover sync-main marker in this repo.

Run it from the repo root:   python3 scripts/check-conflict-markers.py

It looks ONLY for the two markers sync-main writes, in tracked and untracked files, and compares
them with .matrx/GIT-CONFLICTS.md:
  - a marker that is not listed there  -> "NOT LISTED" (someone deleted the line but not the work)
  - a listed item whose marker is gone -> "FIXED, DELETE ITS LINE"
Exit 0 when the repo holds zero markers, 1 otherwise.
"""
import os
import subprocess
import sys

HELD_MARK = "matrx-auto-git-conflict-file-work-delete-this-when-resolved"
DOCS_MARK = "matrx-auto-git-docs-resolution-needed-delete-this-when-resolved"
LOG_REL = ".matrx/GIT-CONFLICTS.md"
# the two scripts themselves spell the markers out
SELF = {"scripts/sync-main.py", "scripts/check-conflict-markers.py"}


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True).stdout


def main():
    top = git("rev-parse", "--show-toplevel").strip()
    if not top:
        print("not inside a git repository")
        sys.exit(2)
    os.chdir(top)

    found = {}  # path -> set of kinds
    for kind, mark in (("held", HELD_MARK), ("docs", DOCS_MARK)):
        for path in git("grep", "-l", "--untracked", "-F", "-e", mark).splitlines():
            if path and path not in SELF:
                found.setdefault(path, set()).add(kind)

    listed_held, listed_docs = set(), set()
    if os.path.exists(LOG_REL):
        section, folder = None, ""
        for line in open(LOG_REL):
            if line.startswith("## Held files"):
                section = "held"
            elif line.startswith("## Docs and comments"):
                section = "docs"
            elif line.startswith("## Needs"):
                section = "needs"          # escalated: the line carries the full path
            elif line.startswith("## "):
                section = None
            elif line.startswith("### "):
                folder = line[4:].strip().rstrip("/") + "/"
            elif line.startswith("- ") and section:
                item = line[2:].split(" — ")[0].strip()
                if section == "held":
                    listed_held.add(folder + item + ".held")
                elif section == "docs":
                    listed_docs.add(item)
                elif item.endswith(".held"):
                    listed_held.add(item)
                else:
                    listed_docs.add(item)

    problems = 0
    # a "### _conflicts/<stamp>/" heading with no items under it is a leftover: delete it
    if os.path.exists(LOG_REL):
        rows = open(LOG_REL).read().splitlines()
        for i, row in enumerate(rows):
            if row.startswith("### "):
                nxt = next((r for r in rows[i + 1:] if r.strip()), "")
                if not nxt.startswith("- "):
                    print("EMPTY HEADING, DELETE IT in %s: %s" % (LOG_REL, row))
                    problems += 1
    for path in sorted(found):
        kinds = found[path]
        held_note = path.endswith(".held-note.txt")
        key = path[: -len("-note.txt")] if held_note else path
        listed = (("held" in kinds and key in listed_held) or ("docs" in kinds and path in listed_docs))
        print("%-5s %s%s" % ("/".join(sorted(kinds)), path, "" if listed else "   <- NOT LISTED in " + LOG_REL))
        problems += 1
    live = set(found) | {p[: -len("-note.txt")] for p in found if p.endswith(".held-note.txt")}
    for item in sorted(listed_held - live):
        print("FIXED, DELETE ITS LINE in %s: %s" % (LOG_REL, item))
        problems += 1
    for item in sorted(listed_docs - set(found)):
        print("FIXED, DELETE ITS LINE in %s: %s" % (LOG_REL, item))
        problems += 1

    if problems:
        print("\n%d item(s) need attention." % problems)
        sys.exit(1)
    print("clean: zero sync-main markers in this repo.")


if __name__ == "__main__":
    main()
