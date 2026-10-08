/**
 * Platform-record sources are scoped to the Applet's organization on every save (CONTRACTS v2.11):
 * a `{ alias, entity }` source without one spans every organization the viewer belongs to, which is how
 * a client's contacts page listed platform test contacts (bug desk, 2026-10-08).
 */
import { coerceBuildAnswer, scopeEntitySources, type BuilderSource } from "./build-applet";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("scopeEntitySources", () => {
  it("writes the Applet's organization on every entity source and leaves table/new sources alone", () => {
    const sources: BuilderSource[] = [
      { alias: "contacts", entity: "party" },
      { alias: "tasks", entity: "task", organization_id: OTHER },
      { alias: "posts", table_id: "t1", organization_id: OTHER },
      { alias: "notes", new_table: { name: "Notes", fields: [{ key: "body", label: "Body", type: "text" }] } },
    ];
    expect(scopeEntitySources(sources, ORG)).toEqual([
      { alias: "contacts", entity: "party", organization_id: ORG },
      { alias: "tasks", entity: "task", organization_id: ORG },
      { alias: "posts", table_id: "t1", organization_id: OTHER },
      sources[3],
    ]);
  });

  it("keeps a stored entity source's organization when the record is read back", () => {
    const { applet } = coerceBuildAnswer({
      applet: {
        name: "Contacts",
        entry: "App.tsx",
        files: [{ name: "App.tsx", source: "export default function App() { return null; }" }],
        pages: [{ path: "/", title: "Home", file: "App.tsx" }],
        sources: [{ alias: "contacts", entity: "party", organization_id: ORG }],
        mandates: [],
      },
      note: "",
    });
    expect(applet.sources).toEqual([{ alias: "contacts", entity: "party", organization_id: ORG }]);
  });
});
