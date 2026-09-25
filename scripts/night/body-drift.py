#!/usr/bin/env python3
"""body-drift.py — the differ behind body-drift.sh. No database; reads two TSVs.

WHY (lane BRANCH-REFRESH-4, 2026-09-24): the clone catch-up and the branch refresh compare
LEDGERS, and a ledger row says what ran, not what stands. `platform.knob_archive` sat on both the
clone and the branch holding its pre-knobguard2 body while both ledgers said knobguard2 was
applied; S6 hit the same thing on `custom.portal_public`. Nothing disagreed, so nothing reported.
This compares the BODIES.

Each TSV row is `kind<TAB>key<TAB>sha256`, kind in {function, view, matview}, key
`schema.name(identity args)` for a function and `schema.name` for a relation.

  body-drift.py diff <source.tsv> <copy.tsv>
      prints `MISMATCH<TAB>kind<TAB>key<TAB>differs|absent` for every object the SOURCE holds whose
      body the COPY does not hold byte-for-byte, then `COPYONLY<TAB><n>` (objects only the copy
      holds: the campaign building on its copy, reported, never counted). Exit 0 always on a
      readable pair; exit 2 on a source too small to be a catalogue (a hollow green refused).
  body-drift.py --self-test
      proves the rules on fixtures, RED cases first.

ONE DIRECTION, like check:branch-schema-drift: the copy BEHIND the source is the defect.
"""
import sys

SOURCE_FLOOR = 200  # production carries thousands in the campaign schemas; under 200 is a failed read


def load(path):
    rows = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) != 3:
                raise ValueError(f"{path}: malformed row {line[:120]!r}")
            kind, key, h = parts
            rows[(kind, key)] = h
    return rows


def diff(src, cpy, floor=SOURCE_FLOOR):
    if len(src) < floor:
        raise ValueError(
            f"the source answered {len(src)} object(s), under the floor of {floor}: that is a failed "
            f"read, not a level copy. Refusing to report zero mismatches."
        )
    out = []
    for (kind, key), h in sorted(src.items()):
        got = cpy.get((kind, key))
        if got is None:
            out.append((kind, key, "absent"))
        elif got != h:
            out.append((kind, key, "differs"))
    copy_only = sum(1 for k in cpy if k not in src)
    return out, copy_only


def self_test():
    ok = True

    def check(name, cond):
        nonlocal ok
        print(("PASS " if cond else "FAIL ") + name)
        ok = ok and cond

    base = {("function", f"platform.f{i}()"): f"{i:064x}" for i in range(250)}
    base[("view", "platform.v")] = "a" * 64
    # RED 1: the knob_archive shape — present on both, different body.
    cpy = dict(base); cpy[("function", "platform.f7()")] = "b" * 64
    m, _ = diff(base, cpy)
    check("RED  a body that differs is a mismatch", m == [("function", "platform.f7()", "differs")])
    # RED 2: absent on the copy.
    cpy = dict(base); del cpy[("view", "platform.v")]
    m, _ = diff(base, cpy)
    check("RED  an object absent from the copy is a mismatch", m == [("view", "platform.v", "absent")])
    # RED 3: a hollow source (a failed read) cannot print zero.
    try:
        diff({("function", "platform.x()"): "c" * 64}, {})
        check("RED  a source under the floor is refused", False)
    except ValueError:
        check("RED  a source under the floor is refused", True)
    # GREEN: identical, plus a copy-only object that is NOT counted.
    cpy = dict(base); cpy[("function", "platform.lane_only()")] = "d" * 64
    m, co = diff(base, cpy)
    check("GREEN identical bodies, a copy-only object reported not counted", m == [] and co == 1)
    # An overload is its own object: same name, other args.
    cpy = dict(base); del cpy[("function", "platform.f3()")]; cpy[("function", "platform.f3(integer)")] = base[("function", "platform.f3()")]
    m, _ = diff(base, cpy)
    check("RED  an overload with other arguments is not the same function", m == [("function", "platform.f3()", "absent")])
    print("self-test:", "GREEN" if ok else "RED")
    return 0 if ok else 1


def main(argv):
    if argv[1:2] == ["--self-test"]:
        return self_test()
    if len(argv) == 4 and argv[1] == "diff":
        try:
            m, co = diff(load(argv[2]), load(argv[3]))
        except ValueError as e:
            print(f"REFUSED\t{e}")
            return 2
        for kind, key, why in m:
            print(f"MISMATCH\t{kind}\t{key}\t{why}")
        print(f"COPYONLY\t{co}")
        return 0
    print(__doc__)
    return 64


if __name__ == "__main__":
    sys.exit(main(sys.argv))
