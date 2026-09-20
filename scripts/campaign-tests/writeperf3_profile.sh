#!/bin/zsh
# WRITE-PERF-3 — the profile driver. See writeperf3_profile.sql for why the snapshots have to be
# outside the transaction. Writes its output to $1 (a directory that must already exist).
set -e
P="$(dirname $0)/../../binlocal/p.sh"
OUT="$1"
snap() { "$P" -Atc "select funcid, calls, self_time, total_time from pg_stat_user_functions" > "$OUT/$1.tsv"; }
snap s0
"$P" -v write=0 -f "$(dirname $0)/writeperf3_profile.sql" > "$OUT/pass_fixture.log" 2>&1
snap s1
"$P" -v write=1 -f "$(dirname $0)/writeperf3_profile.sql" > "$OUT/pass_write.log" 2>&1
snap s2
python3 - "$OUT" <<'PY'
import sys, os
d = sys.argv[1]
def load(n):
    m = {}
    for line in open(os.path.join(d, n)):
        f = line.rstrip("\n").split("|")
        if len(f) < 4: continue
        m[int(f[0])] = (int(f[1]), float(f[2]), float(f[3]))
    return m
s0, s1, s2 = load("s0.tsv"), load("s1.tsv"), load("s2.tsv")
rows = []
for oid in set(s1) | set(s2):
    a = s0.get(oid, (0, 0.0, 0.0)); b = s1.get(oid, (0, 0.0, 0.0)); c = s2.get(oid, (0, 0.0, 0.0))
    fix = tuple(b[i] - a[i] for i in range(3))          # the fixture alone
    both = tuple(c[i] - b[i] for i in range(3))         # the fixture plus the 2,000 rows
    net = tuple(both[i] - fix[i] for i in range(3))     # the 2,000 rows
    if net[0] > 0:
        rows.append((oid, net))
rows.sort(key=lambda r: -r[1][1])
with open(os.path.join(d, "fnprofile.txt"), "w") as f:
    for oid, n in rows[:40]:
        f.write("%d\t%.2f\t%.4f\t%.4f\n" % (oid, n[0] / 2000.0, n[1] / 2000.0, n[2] / 2000.0))
PY
# name the oids and print the table
OIDS=$(cut -f1 "$OUT/fnprofile.txt" | paste -sd, -)
"$P" -Atc "select p.oid, n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid = any('{$OIDS}'::oid[])" > "$OUT/names.tsv"
python3 - "$OUT" <<'PY'
import sys, os
d = sys.argv[1]
names = {}
for line in open(os.path.join(d, "names.tsv")):
    f = line.rstrip("\n").split("|")
    if len(f) == 2: names[int(f[0])] = f[1]
print("%-52s %9s %12s %12s" % ("function", "calls/row", "self ms/row", "total ms/row"))
tot = 0.0
for line in open(os.path.join(d, "fnprofile.txt")):
    oid, c, s, t = line.rstrip("\n").split("\t")
    tot += float(s)
    print("%-52s %9s %12s %12s" % (names.get(int(oid), oid), c, s, t))
print("%-52s %9s %12.4f" % ("-- sum of self time above", "", tot))
PY
