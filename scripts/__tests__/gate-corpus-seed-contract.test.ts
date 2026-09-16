/**
 * ATTACK-8 findings 1 and 3 — the gate corpus and the graph copy must be able to
 * coexist, in the order BUILD-BOOK dispatches them (`W0-DATA`, then `W0-CORPUS`).
 *
 * The RED proof is the previous revision of the two files. At matrx-frontend
 * `3027f152d5`, `checkSeedContract` + `checkRunnerContract` return five
 * violations for `seed.sql` / `run.ts` as they stood:
 *
 *   teardown-deletes-by-shared-type  (platform.reachability, by 'scope'/'rulebook'/'seo_starter_pack')
 *   teardown-deletes-by-shared-type  (platform.shareable_resource_registry)
 *   teardown-deletes-by-shared-type  (platform.entity_types)
 *   guard-demands-an-empty-branch
 *   guard-does-not-refuse-production-by-identity
 *   derivation-is-not-corpus-scoped
 *   runner-judges-by-hostname-substring
 *
 * Reinstate any one of them in the live files and the first test below goes RED.
 *
 * No database, no credential, no connection.
 */
import { resolve } from "node:path";
import {
  checkFiles,
  checkRunnerContract,
  checkSeedContract,
  deleteStatements,
} from "../gate-corpus/seed-contract";

const HERE = resolve(__dirname, "..", "gate-corpus");
const SEED = resolve(HERE, "seed.sql");
const RUN = resolve(HERE, "run.ts");

describe("the live gate-corpus files keep their contract with the restored graph", () => {
  it("has no violation at all", () => {
    expect(checkFiles(SEED, RUN)).toEqual([]);
  });
});

describe("the RED half — the shapes that broke wave zero are all detected", () => {
  it("catches a teardown keyed on a type production owns", () => {
    const v = checkSeedContract(`
      do $$ begin
        perform 1 from pg_control_system();
        perform count(*) from platform.reachability;
        if false then raise exception 'x'; end if;
      end $$;
      delete from platform.reachability
       where container_type like 'corpus%' or item_type like 'corpus%'
          or container_type in ('scope','rulebook','seo_starter_pack');
      insert into platform.reachability (container_type) select ce.container_id
        from platform.containment_edges ce where ce.container_id::text like 'b0000000-%';
    `);
    expect(v.map((x) => x.code)).toEqual(["teardown-deletes-by-shared-type"]);
    expect(v[0]!.detail).toContain("'scope'");
  });

  it("catches the empty-branch guard, which is the state W0-DATA creates", () => {
    const v = checkSeedContract(`
      do $$ declare v_orgs bigint; begin
        select count(*) into v_orgs from iam.organizations where id not in ('c0000000-1');
        if v_orgs > 0 then raise exception 'REFUSED'; end if;
        perform 1 from pg_control_system();
        perform count(*) from platform.reachability;
      end $$;
      insert into platform.reachability (container_type) select ce.container_id
        from platform.containment_edges ce where ce.container_id::text like 'b0000000-%';
    `);
    expect(v.map((x) => x.code)).toContain("guard-demands-an-empty-branch");
  });

  it("catches a guard that never asks the server who it is", () => {
    const v = checkSeedContract(`
      do $$ begin
        perform count(*) from platform.reachability;
        if false then raise exception 'x'; end if;
      end $$;
      insert into platform.reachability (container_type) select ce.container_id
        from platform.containment_edges ce where ce.container_id::text like 'b0000000-%';
    `);
    expect(v.map((x) => x.code)).toContain("guard-does-not-refuse-production-by-identity");
  });

  it("catches a pair-cache rebuild that walks production's whole graph", () => {
    const v = checkSeedContract(`
      do $$ begin
        perform 1 from pg_control_system();
        perform count(*) from platform.reachability;
        if false then raise exception 'x'; end if;
      end $$;
      insert into platform.reachability (container_type, container_id)
      select c.container_type, c.container_id
      from (select distinct ce.container_type, ce.container_id from platform.containment_edges ce) c;
    `);
    expect(v.map((x) => x.code)).toContain("derivation-is-not-corpus-scoped");
  });

  it("catches a runner that judges the database by a hostname substring", () => {
    const v = checkRunnerContract(`
      const FORBIDDEN_HOSTS = ["aws-0-us-east-1.pooler.supabase.com"];
      await assertServerMatchesTarget(q, "branch", ref, "run.ts");
    `);
    expect(v.map((x) => x.code)).toEqual(["runner-judges-by-hostname-substring"]);
  });

  it("catches a runner that never reads the server's own identity", () => {
    expect(checkRunnerContract(`const client = new Client({});`).map((x) => x.code)).toEqual([
      "runner-does-not-read-the-server-identity",
    ]);
  });
});

describe("the statement parser the judgment rests on", () => {
  it("does not read a commented-out delete as a delete", () => {
    expect(
      checkSeedContract(`
        -- delete from platform.entity_types where token in ('scope','rulebook');
        do $$ begin
          perform 1 from pg_control_system();
          perform count(*) from platform.reachability;
          if false then raise exception 'x'; end if;
        end $$;
        insert into platform.reachability (container_type) select ce.container_id
          from platform.containment_edges ce where ce.container_id::text like 'b0000000-%';
      `),
    ).toEqual([]);
  });

  it("splits one statement per delete", () => {
    expect(
      deleteStatements("delete from a where x; delete from b where y;").length,
    ).toBe(2);
  });
});
