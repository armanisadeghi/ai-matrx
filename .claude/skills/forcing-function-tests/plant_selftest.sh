#!/bin/zsh
# Self-test for plant.py: proves each guarantee can fail. Needs a python with pytest importable
# (PLANT_PYTHON=/path/to/python). Runs entirely in a throwaway git repo; touches no real repo.
# Exit 0 = every guarantee held.
set -u
HERE=${0:A:h}
PY=${PLANT_PYTHON:-python3}
$PY -m pytest --version >/dev/null 2>&1 || { echo "SELFTEST NEEDS pytest: set PLANT_PYTHON"; exit 2; }
T=$(mktemp -d)
export PLANT_STATE_DIR=$T/state
cd $T && git init -q && git config user.email t@t && git config user.name t
cat > sut.py <<'EOF'
def accept(duration_ms, site_id):
    out = {"Accept": "json"}
    out["X-Site-Id"] = site_id
    if duration_ms <= 0:
        return None
    return out
def pad(): return 1
EOF
cat > test_sut.py <<'EOF'
from sut import accept
def test_zero_duration_is_refused():
    assert accept(0, "s") is None
def test_site_header_is_sent():
    assert accept(5, "abc") == {"Accept": "json", "X-Site-Id": "abc"}
EOF
git add . && git commit -qm base
fails=0
check() { if [[ "$2" == "$3" ]]; then echo "ok   $1"; else echo "FAIL $1 (got $2, want $3)"; fails=$((fails+1)); fi; }
P=(python3 $HERE/plant.py)
PT=($PY -m pytest -q -p no:cacheprovider test_sut.py)
PTS="$PY -m pytest -q -p no:cacheprovider test_sut.py"
q() { "$@" >/dev/null 2>&1; echo $?; }

# 1 a named red counts
check "named RED counts" "$(q $P --file sut.py --old 'if duration_ms <= 0:' --new 'if duration_ms < 0:' --expect red --must-mention test_zero_duration_is_refused -- $PT)" 0
# 2 a red for the wrong reason is refused
check "unnamed RED refused" "$(q $P --file sut.py --old 'if duration_ms <= 0:' --new 'if duration_ms < 0:' --expect red --must-mention no_such_test -- $PT)" 1
# 3 a survivor is reported as a survivor
check "survivor is not a kill" "$(q $P --file sut.py --old 'def pad(): return 1' --new 'def pad(): return 2' --expect red -- $PT)" 1
# 4 deletion mutation + a peer edit during the window: peer edit kept, deleted line restored
print -r -- "#!/bin/zsh
python3 -c \"p='sut.py'; s=open(p).read(); open(p,'w').write('# peer\\n'+s)\"
$PTS" > peer.sh && chmod +x peer.sh
rc=$(q $P --file sut.py --old '    out["X-Site-Id"] = site_id
' --new '' --expect red --must-mention test_site_header_is_sent -- ./peer.sh)
check "deletion+peer edit restores" "$rc/$(grep -c '# peer' sut.py)/$(grep -c 'X-Site-Id' sut.py)" "0/1/1"
git checkout -q -- sut.py
# 5 same-size mutation right after compiling the original: RED, and the real code is green right after
$PY -c "import sut"
check "no stale bytecode (red)" "$(q $P --file sut.py --old 'if duration_ms <= 0:' --new 'if duration_ms >= 0:' --expect red --must-mention test_site_header_is_sent -- $PT)" 0
check "no stale bytecode (green after)" "$(q $PT)" 0
# 6 concurrent plants on one file serialize; both succeed; file intact
( $P --file sut.py --old 'def pad(): return 1' --new 'def pad(): return 2' --expect green -- python3 -c "import time; time.sleep(3)" >/dev/null 2>&1; echo $? > bg.rc ) &
sleep 0.7
rc=$(q $P --file sut.py --old '"Accept": "json"' --new '"Accept": "xml"' --expect red --must-mention test_site_header_is_sent -- $PT)
wait
check "lock serializes, both plants ok, file intact" "$rc/$(cat bg.rc)/$(git status --short sut.py | wc -l | tr -d ' ')" "0/0/0"
# 7 a peer sweep commits the live mutation: exit 5 and logged
print -r -- "#!/bin/zsh
git add sut.py && git commit -qm 'wip: peer sweep' >/dev/null
$PTS" > sweep.sh && chmod +x sweep.sh
check "captured mutation detected" "$(q $P --file sut.py --old 'if duration_ms <= 0:' --new 'if duration_ms < 0:' --expect red --must-mention test_zero_duration_is_refused -- ./sweep.sh)" 5
check "captured mutation logged" "$(grep -c 'MUTATION COMMITTED' $PLANT_STATE_DIR/COMMITTED_MUTATIONS.log 2>/dev/null)" 1
rm -rf $T
[[ $fails -eq 0 ]] && echo "SELFTEST PASSED" || echo "SELFTEST FAILED ($fails)"
exit $fails
