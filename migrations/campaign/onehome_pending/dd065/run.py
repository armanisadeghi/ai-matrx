import sys, time, hashlib, psycopg
from aidream.testing.clone_database import clone_database_url
mode, path = sys.argv[1], sys.argv[2]
sql = open(path).read()
with psycopg.connect(clone_database_url(), connect_timeout=20, autocommit=False) as c:
    c.add_notice_handler(lambda d: print("NOTICE:", d.message_primary))
    ident = c.execute("select current_setting('cluster_name', true), (select count(*) from cron.job where active), (select count(*) from pg_extension where extname='pg_net')").fetchone()
    print("target check (cluster, active_cron, pg_net):", ident)
    if ident[1] != 0 or ident[2] != 0:
        sys.exit("refusing: not the quarantined clone")
    t = time.time()
    if mode == "apply":
        for attempt in range(1, 21):
            try:
                c.execute(sql); c.commit(); break
            except psycopg.errors.LockNotAvailable as e:
                c.rollback(); print(f"attempt {attempt}: 55P03 lock timeout — retry in 5s"); time.sleep(5)
        else:
            sys.exit("gave up after 20 lock timeouts")
        print(f"attempts={attempt}", end=" ")
        print(f"APPLIED {path.split('/')[-1]} sha256={hashlib.sha256(sql.encode()).hexdigest()[:12]} in {time.time()-t:.1f}s")
    else:
        cur = c.execute(sql)
        cols = [d.name for d in cur.description] if cur.description else []
        print("\t".join(cols))
        for r in cur.fetchall():
            print("\t".join("" if v is None else str(v) for v in r))
        c.rollback()
