import sys, os, shutil, subprocess, re
D = os.path.dirname(os.path.abspath(__file__))
def make(repo, edits, out):
    root = f"/Users/armanisadeghi/code/{repo}"
    work = os.path.join(D, "work", repo)
    shutil.rmtree(work, ignore_errors=True)
    patch = []
    for path, subs in edits.items():
        src = open(os.path.join(root, path)).read()
        new = src
        for old, rep, cnt in subs:
            n = new.count(old) if not old.startswith("re:") else len(re.findall(old[3:], new))
            if n != cnt:
                sys.exit(f"{repo}/{path}: expected {cnt} of {old!r}, found {n}")
            new = new.replace(old, rep) if not old.startswith("re:") else re.sub(old[3:], rep, new)
        a = os.path.join(work, "a", path); b = os.path.join(work, "b", path)
        os.makedirs(os.path.dirname(a), exist_ok=True); os.makedirs(os.path.dirname(b), exist_ok=True)
        open(a, "w").write(src); open(b, "w").write(new)
        r = subprocess.run(["diff", "-u", "--label", f"a/{path}", "--label", f"b/{path}", a, b], capture_output=True, text=True)
        patch.append(r.stdout)
    open(os.path.join(D, out), "w").write("".join(patch))
    print(out, sum(p.count("\n+") for p in patch), "added-ish lines,", len(edits), "files")
