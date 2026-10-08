#!/usr/bin/env python3
"""check-lockfile-keys — a lockfile that no package manager can read never reaches main or a release.

WHY (2026-10-08, v0.4.3013): merge 406bfce877 textually kept two identical
`'@ai-matrx/records@0.84.4':` blocks in pnpm-lock.yaml (both sides added the same block at
adjacent positions, so git saw no conflict). pnpm refuses such a file outright —
`ERR_PNPM_BROKEN_LOCKFILE ... duplicated mapping key` — and all four Vercel projects failed. Nothing
before Vercel read the lockfile as YAML.

WHAT IT CHECKS (offline, stdlib only, ~0.1 s on a 27k-line lockfile):
  pnpm-lock.yaml / *.yaml   every mapping has unique keys; no merge-conflict marker lines
  package-lock.json / *.json   parses as JSON; no object has a duplicated key

THE REPAIR (--fix): the ONE deterministic case — every duplicate block is byte-identical to the
first one under that key — keeps the first and drops the rest. Two blocks that DIFFER under one key
are never guessed at: that is "unrepairable" and the caller must regenerate the lockfile
(`pnpm install --lockfile-only`) or resolve it by hand.

USAGE
  python3 scripts/check-lockfile-keys.py [file ...]          check (default: pnpm-lock.yaml, package-lock.json)
  python3 scripts/check-lockfile-keys.py --fix [file ...]    repair identical duplicates in place
  python3 scripts/check-lockfile-keys.py --stdin NAME [--fix] read stdin (NAME picks yaml/json);
                                                              --fix writes the repaired bytes to stdout
  python3 scripts/check-lockfile-keys.py --self-test
EXIT  0 clean · 3 repaired (--fix only) · 1 broken (unrepairable, or found while only checking)
      2 usage error

Callers: scripts/sync-main.py (repairs after every merge, refuses to push an unrepairable one) and
scripts/release.sh (repairs inside the release tree, refuses to push an unrepairable one).
"""
import json
import os
import re
import sys

DEFAULT_FILES = ("pnpm-lock.yaml", "package-lock.json")
CONFLICT = re.compile(r"^(<{7}|={7}|>{7})( |$)")


def _key_of(stripped):
    """The mapping key a block-YAML line opens, or None when the line is not `key:` / `key: value`."""
    if not stripped or stripped[0] in "#-[{":
        return None
    if stripped[0] in "'\"":
        q = stripped[0]
        i = 1
        while i < len(stripped):
            if stripped[i] == q:
                if q == "'" and stripped[i + 1:i + 2] == "'":   # '' is an escaped quote
                    i += 2
                    continue
                break
            if q == '"' and stripped[i] == "\\":
                i += 1
            i += 1
        rest = stripped[i + 1:]
        if rest == ":" or rest.startswith(": "):
            return stripped[:i + 1]
        return None
    m = re.match(r"^([^:#]+?|[^ ][^:]*?):( |$)", stripped)
    return m.group(1) if m else None


def _block_end(lines, start, indent):
    """Index after the block that the key on `start` opens (its deeper lines; trailing blanks excluded)."""
    end = start + 1
    last = start + 1
    while end < len(lines):
        s = lines[end].strip()
        if s:
            if len(lines[end]) - len(lines[end].lstrip(" ")) <= indent:
                break
            last = end + 1
        end += 1
    return last


def yaml_duplicates(text):
    """[(line_no, key, first_line_no, identical, (start, end))] for every duplicated mapping key,
    plus conflict-marker lines as (line_no, marker, None, False, None)."""
    lines = text.split("\n")
    found = []
    scopes = {}          # indent -> {key: (line index, block text)}
    literal_indent = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if CONFLICT.match(line):
            found.append((i + 1, line[:7], None, False, None))
            continue
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if literal_indent is not None:
            if indent > literal_indent:
                continue
            literal_indent = None
        for d in [d for d in scopes if d > indent]:
            del scopes[d]
        if stripped.startswith("- "):
            # a new sequence item opens fresh mappings for everything nested under it
            for d in [d for d in scopes if d >= indent]:
                del scopes[d]
            continue
        key = _key_of(stripped)
        if key is None:
            continue
        end = _block_end(lines, i, indent)
        block = "\n".join(lines[i:end])
        scope = scopes.setdefault(indent, {})
        if key in scope:
            first_i, first_block = scope[key]
            found.append((i + 1, key, first_i + 1, block == first_block, (i, end)))
        else:
            scope[key] = (i, block)
        value = stripped[len(key) + 1:].strip()
        if value[:1] in ("|", ">"):
            literal_indent = indent
    return found


def yaml_repair(text):
    """(new_text, repaired_count) when every duplicate is identical, else (None, 0)."""
    dups = yaml_duplicates(text)
    if not dups:
        return text, 0
    if any(not ident for _, _, _, ident, _ in dups):
        return None, 0
    lines = text.split("\n")
    drop = set()
    for _, _, _, _, (start, end) in dups:
        # take the block plus the blank separator lines that follow it, so spacing stays as pnpm writes it
        stop = end
        while stop < len(lines) and not lines[stop].strip() and stop + 1 < len(lines):
            stop += 1
        drop.update(range(start, stop))
    new = "\n".join(l for j, l in enumerate(lines) if j not in drop)
    return new, len(dups)


def json_duplicates(text):
    """[(key, path)] for duplicated object keys; raises ValueError when it is not JSON at all."""
    found = []

    def hook(pairs):
        seen = set()
        for k, _ in pairs:
            if k in seen:
                found.append(k)
            seen.add(k)
        return dict(pairs)

    json.loads(text, object_pairs_hook=hook)
    return found


def check_text(name, text, fix):
    """(status, repaired_text_or_None, messages). status: 0 clean, 3 repaired, 1 broken."""
    msgs = []
    if name.endswith(".json"):
        try:
            dups = json_duplicates(text)
        except ValueError as e:
            return 1, None, ["%s: not valid JSON (%s) — regenerate it" % (name, e)]
        if not dups:
            return 0, None, []
        # JSON duplicates are not repaired: json has no "identical block" notion worth guessing at.
        return 1, None, ["%s: duplicated key %r — regenerate it (npm install --package-lock-only)" % (name, k)
                         for k in dups[:20]]
    dups = yaml_duplicates(text)
    if not dups:
        return 0, None, []
    for ln, key, first, ident, _ in dups[:20]:
        if first is None:
            msgs.append("%s:%d: merge-conflict marker %s — resolve, then pnpm install --lockfile-only" % (name, ln, key))
        else:
            msgs.append("%s:%d: duplicated mapping key %s (first at line %d; %s)"
                        % (name, ln, key, first, "identical block — repairable" if ident else "DIFFERENT block"))
    if len(dups) > 20:
        msgs.append("%s: ... and %d more" % (name, len(dups) - 20))
    if not fix:
        return 1, None, msgs
    new, n = yaml_repair(text)
    if new is None:
        msgs.append("%s: UNREPAIRABLE — the duplicates differ (or a conflict marker); regenerate with "
                    "`pnpm install --lockfile-only` and commit it" % name)
        return 1, None, msgs
    if yaml_duplicates(new):   # never hand back a "repair" that is still broken
        msgs.append("%s: repair left duplicates behind — refusing it" % name)
        return 1, None, msgs
    msgs.append("%s: REPAIRED — dropped %d identical duplicate block(s)" % (name, n))
    return 3, new, msgs


def self_test():
    block = ("  '@ai-matrx/records@0.84.4':\n"
             "    resolution: {integrity: sha512-abc}\n"
             "    peerDependencies:\n"
             "      react: '>=18.0.0'\n")
    head = "lockfileVersion: '9.0'\n\npackages:\n\n"
    tail = "  '@ai-matrx/rich-content@0.2.55':\n    resolution: {integrity: sha512-def}\n"
    clean = head + block + "\n" + tail
    dup = head + block + "\n" + block + "\n" + tail
    differ = head + block + "\n" + block.replace("abc", "xyz") + "\n" + tail
    # the same key under two DIFFERENT parents is legal and must stay green
    nested_ok = ("importers:\n  .:\n    dependencies:\n      react:\n        specifier: ^19\n"
                 "    devDependencies:\n      react:\n        specifier: ^19\n")
    results = []

    def expect(label, got, want):
        ok = got == want
        results.append(ok)
        print("  %s %-58s got %r want %r" % ("PASS" if ok else "FAIL", label, got, want))

    expect("clean lockfile is green", check_text("pnpm-lock.yaml", clean, False)[0], 0)
    expect("RED: duplicated identical block (check only)", check_text("pnpm-lock.yaml", dup, False)[0], 1)
    st, new, _ = check_text("pnpm-lock.yaml", dup, True)
    expect("--fix repairs the identical duplicate", st, 3)
    expect("GREEN after: repaired text re-checks clean", check_text("pnpm-lock.yaml", new or "", False)[0], 0)
    expect("repair is byte-identical to the never-broken file", new == clean, True)
    expect("RED: differing duplicate is unrepairable", check_text("pnpm-lock.yaml", differ, True)[0], 1)
    expect("same key under different parents stays green", check_text("pnpm-lock.yaml", nested_ok, False)[0], 0)
    marker = clean.replace(tail, "<<<<<<< HEAD\n" + tail + "=======\n>>>>>>> origin/main\n")
    expect("RED: conflict marker is unrepairable", check_text("pnpm-lock.yaml", marker, True)[0], 1)
    expect("RED: package-lock.json duplicate key", check_text("package-lock.json", '{"a":1,"a":2}', False)[0], 1)
    expect("package-lock.json clean is green", check_text("package-lock.json", '{"a":1,"b":{"a":2}}', False)[0], 0)
    expect("RED: package-lock.json that is not JSON", check_text("package-lock.json", '{"a":', False)[0], 1)
    ok = all(results)
    print("check-lockfile-keys self-test: %s (%d/%d)" % ("PASS" if ok else "FAIL", sum(results), len(results)))
    return 0 if ok else 1


def main(argv):
    if "--self-test" in argv:
        return self_test()
    fix = "--fix" in argv
    args = [a for a in argv if a != "--fix"]
    if args[:1] == ["--stdin"]:
        if len(args) < 2:
            print("usage: --stdin NAME [--fix]", file=sys.stderr)
            return 2
        text = sys.stdin.read()
        st, new, msgs = check_text(args[1], text, fix)
        for m in msgs:
            print(m, file=sys.stderr)
        if fix:
            sys.stdout.write(new if st == 3 else text)
        return st
    files = args or [f for f in DEFAULT_FILES if os.path.isfile(f)]
    worst = 0
    for path in files:
        try:
            with open(path, encoding="utf-8", newline="") as f:
                text = f.read()
        except OSError as e:
            print("%s: unreadable (%s)" % (path, e), file=sys.stderr)
            worst = 1
            continue
        st, new, msgs = check_text(os.path.basename(path), text, fix)
        for m in msgs:
            print(m, file=sys.stderr)
        if st == 3:
            with open(path, "w", encoding="utf-8", newline="") as f:
                f.write(new)
        if st == 1:
            worst = 1
        elif st == 3 and worst == 0:
            worst = 3
    return worst


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
