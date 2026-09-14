import { ANON_COLUMN_SURFACE } from "@/lib/security/public-exposure";
import {
  PC_ARTICLE_PUBLIC_COLUMNS,
  PC_ARTICLE_PUBLIC_SELECT,
  PC_EPISODE_PUBLIC_COLUMNS,
  PC_EPISODE_PUBLIC_SELECT,
  PC_EPISODE_WITH_SHOW_PUBLIC_SELECT,
  PC_SHOW_PUBLIC_COLUMNS,
  PC_SHOW_PUBLIC_SELECT,
} from "./publicColumns";

/**
 * WHAT THIS TEST IS FOR (DD-230, 2026-09-14).
 *
 * The public podcast routes used `select("*")`. `anon` holds a COLUMN grant on
 * these three tables, PostgREST expands `*` to EVERY column, and the request
 * therefore came back 42501 — so /podcast rendered "No shows published yet"
 * with four published shows in the table and feed.xml answered 404 "Podcast not
 * found". A list of column names is only a fix while it still MATCHES the grant,
 * and nothing in a type system says it does.
 *
 * So this test pins the lists to the one canonical declaration. Add a column to
 * the table without granting it, revoke one, or reach for `*`, and it fails here
 * instead of on a public page nobody is watching.
 */
describe("anonymous podcast projections", () => {
  const declared = (relation: string) => {
    const entry = ANON_COLUMN_SURFACE.find((e) => e.relation === relation);
    expect(entry).toBeDefined();
    return entry!.columns;
  };

  it.each([
    ["podcast.pc_shows", PC_SHOW_PUBLIC_COLUMNS, PC_SHOW_PUBLIC_SELECT],
    ["podcast.pc_episodes", PC_EPISODE_PUBLIC_COLUMNS, PC_EPISODE_PUBLIC_SELECT],
    ["podcast.pc_articles", PC_ARTICLE_PUBLIC_COLUMNS, PC_ARTICLE_PUBLIC_SELECT],
  ])("derives the %s query from the canonical declaration", (relation, columns, select) => {
    expect([...columns]).toEqual(declared(relation));
    // The select string is written out as a literal so supabase-js can infer the
    // row type; this is what keeps the literal honest.
    expect(select.split(",")).toEqual(declared(relation));
    expect(select).not.toContain("*");
  });

  it("keeps the embedded show inside the show's own declared bound", () => {
    const showColumns = new Set(declared("podcast.pc_shows"));
    const embed = PC_EPISODE_WITH_SHOW_PUBLIC_SELECT.match(
      /show:pc_shows\(([^)]*)\)/,
    )?.[1];
    expect(embed).toBeDefined();
    // An embed is refused for exactly the same reason a top-level `*` is.
    for (const column of embed!.split(",")) {
      expect(showColumns.has(column.trim())).toBe(true);
    }
    expect(PC_EPISODE_WITH_SHOW_PUBLIC_SELECT).not.toContain("*");
  });

  it("never lets a public podcast reader ask for a wildcard", () => {
    for (const select of [
      PC_SHOW_PUBLIC_SELECT,
      PC_EPISODE_PUBLIC_SELECT,
      PC_ARTICLE_PUBLIC_SELECT,
      PC_EPISODE_WITH_SHOW_PUBLIC_SELECT,
    ]) {
      expect(select).not.toMatch(/(^|[,(])\s*\*/);
    }
  });
});
