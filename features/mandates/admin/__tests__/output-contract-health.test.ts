/**
 * ── ONE SCREEN, ONE VERDICT ABOUT ONE HOLDER ────────────────────────────────
 *
 * 🚨 THE DEFECT (independent Sonnet walk of v0.4.1720, on
 * `/administration/mandates/research_client.output_slides`): the page printed,
 * three inches apart, about the SAME agent —
 *
 *   red   "Research → Slides Generator declares no structured output, but this
 *          job requires `title` and `slides` … the assignment fails at run time."
 *   green "Healthy — System agent, tracking the latest version."
 *
 * The health model simply did not know about the OUTPUT half of the contract,
 * which `enforced_holder_contract` (aidream) keeps in force ALWAYS: a holder
 * that does not produce the required keys is dropped at resolution. So a
 * mandate whose assignment cannot run reported `ok`.
 *
 * `buildRow` now takes the holder's declared `output_schema` when the caller
 * has read it, and judges it with the SHARED mirror of the server's rule
 * (`missingOutputKeys`) so this console and the binding pre-flight cannot
 * disagree. **Absent means UNKNOWN, never "fine"** — a caller that has not read
 * it gets exactly the verdict it got before.
 */
import { buildRow } from "../mandate-health";
import type { MandateConsoleData } from "../service";

const AGENT_ID = "8f0bbfc2-85d9-4913-8cea-b09a50c62be6";

/** `research_client.output_slides` and its holder, as production holds them. */
const MANDATE = {
  id: "59325dc2-4df9-4eb1-8d77-d4dd0d93a160",
  mandate_key: "research_client.output_slides",
  label: "Research Output: Slides",
  description: null,
  organization_id: "39c38960-d30c-4840-b0c1-c9960de95582",
  is_enabled: true,
  output_kind: "presentation_deck",
  required_output_keys: ["title", "slides"],
  default_holder_type: "agent",
  default_holder_id: AGENT_ID,
  default_holder_version_id: null,
  metadata: null,
  updated_at: null,
} as unknown as Parameters<typeof buildRow>[0];

const DATA = {
  mandates: [MANDATE],
  agentsById: {
    [AGENT_ID]: {
      id: AGENT_ID,
      name: "Research → Slides Generator",
      agentType: "builtin",
      isArchived: false,
      version: 6,
      variableNames: [],
      contextPolicyKeys: [],
      autoContextDisabled: false,
    },
  },
  versionsById: {},
  bindingsByMandateId: {},
} as unknown as MandateConsoleData;

describe("a holder that cannot produce the job's required output is not healthy", () => {
  it("with NO schema read at all, the verdict is unchanged (unknown is not a guess)", () => {
    // A console load that carries no `outputSchemas` — the shape that produced
    // "Healthy" beside "the assignment fails at run time". Absent stays UNKNOWN
    // rather than becoming an accusation.
    expect(buildRow(MANDATE, DATA).health).toBe("ok");
  });

  it("GREEN — given the holder's schema, the row says what is actually wrong", () => {
    // The live agent declares NO output_schema at all.
    const row = buildRow(MANDATE, DATA, undefined, { [AGENT_ID]: null });
    expect(row.health).toBe("output contract unmet");
    expect(row.requiredOutputKeys).toEqual(["title", "slides"]);
  });

  it("a holder that declares the keys is healthy again", () => {
    const schema = {
      type: "object",
      properties: { title: { type: "string" }, slides: { type: "array" } },
      required: ["title", "slides"],
    };
    expect(buildRow(MANDATE, DATA, undefined, { [AGENT_ID]: schema }).health).toBe(
      "ok",
    );
  });

  it("an UNREADABLE holder is not accused — absent from the map means unknown", () => {
    // The read succeeded but returned nothing for this agent (RLS, deleted).
    expect(buildRow(MANDATE, DATA, undefined, {}).health).toBe("ok");
  });

  it("a job that promises no structured output cannot fail this way", () => {
    const noPromise = {
      ...(MANDATE as unknown as Record<string, unknown>),
      required_output_keys: [],
    } as unknown as Parameters<typeof buildRow>[0];
    expect(
      buildRow(noPromise, DATA, undefined, { [AGENT_ID]: null }).health,
    ).toBe("ok");
  });
});

/**
 * ── AND THE LIST SAYS THE SAME THING (FIX-R5) ───────────────────────────────
 *
 * FIX-R4 taught `buildRow` how to judge the output half and then NAMED what it
 * did not close: the LIST still reported `ok`, because the console load did not
 * read `output_schema` and only an explicit fourth argument could reach the new
 * verdict. One screen, two verdicts about one holder — the same defect one
 * level up.
 *
 * `fetchMandateConsoleData` now reads the column on the by-id agent query it was
 * already making, and `buildRow` uses `data.outputSchemas` when no explicit map
 * is passed. Every list caller inherits the verdict without changing a line, and
 * "absent means UNKNOWN" survives: absent from the map is still unknown, and a
 * load with no map at all still judges nothing.
 *
 * The SQL half of the same list — `public.mnd_list_scoped`, which computes
 * `health` in the database for `/mandates` — is fixed in the same breath and
 * proven live (RED `health='ok'` → GREEN `health='output contract unmet'` on
 * `research_client.output_slides`), because a TypeScript guard cannot judge a
 * verdict Postgres produces.
 */
describe("the LIST judges the output half too, not just the single-mandate page", () => {
  const DATA_WITH_SCHEMAS = {
    ...(DATA as unknown as Record<string, unknown>),
    outputSchemas: { [AGENT_ID]: null },
  } as unknown as MandateConsoleData;

  it("a list row for research_client.output_slides must not read `ok`", () => {
    // The three-argument call every list surface makes — MandatesConsole and
    // the mandates window both pass (mandate, data, codeTruth).
    expect(buildRow(MANDATE, DATA_WITH_SCHEMAS, undefined).health).toBe(
      "output contract unmet",
    );
  });

  it("an explicit map still wins — a fresher read of one holder", () => {
    const declares = {
      type: "object",
      properties: { title: {}, slides: {} },
      required: ["title", "slides"],
    };
    expect(
      buildRow(MANDATE, DATA_WITH_SCHEMAS, undefined, { [AGENT_ID]: declares })
        .health,
    ).toBe("ok");
  });

  it("an agent the load could not read stays UNKNOWN, never accused", () => {
    const emptyMap = {
      ...(DATA as unknown as Record<string, unknown>),
      outputSchemas: {},
    } as unknown as MandateConsoleData;
    expect(buildRow(MANDATE, emptyMap, undefined).health).toBe("ok");
  });
});
