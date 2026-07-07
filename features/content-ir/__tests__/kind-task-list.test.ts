/**
 * task_list / task_item kind — structural leg, legacy bridge, and the
 * `tasks_legacy_text` fence strategy, all proven against the REAL legacy
 * parser (`parseMarkdownChecklist`) — never a re-implementation.
 *
 * Also pins the migration ↔ code contract: the emitted fingerprints embedded
 * in migrations/kind_task_list_full.sql are recomputed here from the
 * canonical schemas through the real converters, so schema drift between the
 * TS source and the applied DB rows fails a test instead of hiding.
 */

import { parseMarkdownChecklist } from "@/components/mardown-display/blocks/tasks/tasklist-parser";
import { fingerprintText } from "../core/fingerprint";
import type { KindSchema } from "../core/kind-schema.types";
import { envelopeFromCompleteValue, normalizeJsonRegion } from "../core/normalize";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import {
  kindSchemaToStorage,
  storageToKindSchema,
} from "../registry/kind-storage-transform";
import {
  runKindDualGate,
  validateStructuralLeg,
} from "../registry/kind-dual-gate";
import {
  TASK_ITEM_KIND_SCHEMA,
  TASK_LIST_KIND_SCHEMA,
  TASK_LIST_KIND_DEFINITIONS,
  taskListMarkdownFromValue,
  taskListToChecklistMarkdown,
  tasksServerDataFromEnvelope,
} from "../kinds/task-list";
import { tasksLegacyTextToKindValue } from "../surfaces/tasks-legacy-text";

const SCHEMAS: Record<string, KindSchema> = {
  task_list: TASK_LIST_KIND_SCHEMA,
  task_item: TASK_ITEM_KIND_SCHEMA,
};
const resolveSchema = (kind: string) => SCHEMAS[kind];

// The exact canonical example seeded as the is_canonical kind_example row in
// migrations/kind_task_list_full.sql (validated for real by this suite).
const FULL_EXAMPLE = {
  __kind: "task_list",
  title: "Product release plan",
  items: [
    {
      __kind: "task_item",
      item_type: "section",
      title: "Planning",
      children: [
        { __kind: "task_item", item_type: "task", title: "Define scope", checked: true },
        { __kind: "task_item", item_type: "task", title: "Set the budget", checked: false },
      ],
    },
    {
      __kind: "task_item",
      item_type: "section",
      title: "Execution",
      children: [
        {
          __kind: "task_item",
          item_type: "task",
          title: "Kick off the work",
          checked: false,
          bold: true,
          children: [
            { __kind: "task_item", item_type: "subtask", title: "Assign owners", checked: true },
            { __kind: "task_item", item_type: "subtask", title: "Schedule the kickoff call", checked: false },
          ],
        },
        { __kind: "task_item", item_type: "task", title: "Track progress", checked: false },
      ],
    },
  ],
};

// The second seeded example — minimal form (item_type/title defaults).
const SIMPLE_EXAMPLE = {
  __kind: "task_list",
  items: [
    { __kind: "task_item", title: "Draft the project brief", checked: false },
    { __kind: "task_item", title: "Review with the team", checked: false },
    { __kind: "task_item", title: "Create the shared repository", checked: true },
  ],
};

// The seeded task_item canonical example.
const ITEM_EXAMPLE = {
  __kind: "task_item",
  item_type: "task",
  title: "Configure analytics",
  checked: false,
  bold: true,
  children: [
    { __kind: "task_item", item_type: "subtask", title: "Install the tracking snippet", checked: true },
  ],
};

const EXPECTED_FULL_CHECKLIST = [
  "## Planning",
  "- [x] Define scope",
  "- [ ] Set the budget",
  "",
  "## Execution",
  "- [ ] **Kick off the work**",
  "  - [x] Assign owners",
  "  - [ ] Schedule the kickoff call",
  "- [ ] Track progress",
].join("\n");

// The legacy parser carries a debug console.log on every parse — keep the
// suite output readable without hiding real errors.
let logSpy: jest.SpyInstance;
beforeAll(() => {
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
});
afterAll(() => {
  logSpy.mockRestore();
});

describe("task_list structural leg (converter-emitted, migration parity)", () => {
  it("storage transform round-trips both kinds exactly", () => {
    for (const schema of [TASK_LIST_KIND_SCHEMA, TASK_ITEM_KIND_SCHEMA]) {
      const stored = kindSchemaToStorage(schema);
      expect(storageToKindSchema(schema.kind, stored)).toEqual(schema);
    }
  });

  it("task_item recursion emits cycle-safe $refs", () => {
    const listExport = kindSchemaToJsonSchema("task_list", resolveSchema, {
      strict: true,
      injectKind: true,
    });
    expect(listExport).not.toBeNull();
    expect(listExport?.unresolved).toEqual([]);
    const defs = (listExport?.schema as { $defs: Record<string, unknown> }).$defs;
    const taskItem = defs.task_item as {
      properties: { children: { items: { $ref: string } } };
    };
    expect(taskItem.properties.children.items.$ref).toBe("#/$defs/task_item");

    const itemExport = kindSchemaToJsonSchema("task_item", resolveSchema, {
      strict: true,
      injectKind: true,
    });
    const rootChildren = (
      itemExport?.schema as {
        properties: { children: { items: { $ref: string } } };
      }
    ).properties.children.items.$ref;
    expect(rootChildren).toBe("#");
  });

  it("recomputed fingerprints match the constants applied by kind_task_list_full.sql", () => {
    const listBlock = kindSchemaToJsonSchema("task_list", resolveSchema, {
      strict: true,
      injectKind: true,
    })?.schema;
    const itemBlock = kindSchemaToJsonSchema("task_item", resolveSchema, {
      strict: true,
      injectKind: true,
    })?.schema;
    expect(fingerprintText(JSON.stringify(listBlock))).toBe("jt-198ecyprauqjf");
    expect(fingerprintText(JSON.stringify(itemBlock))).toBe("av-dmjjii1t4pyn0");
  });

  it("both seeded task_list examples pass the structural leg for real", () => {
    const emittedJsonSchema = kindSchemaToJsonSchema("task_list", resolveSchema, {
      strict: true,
      injectKind: false,
    })?.schema;
    expect(validateStructuralLeg(FULL_EXAMPLE, emittedJsonSchema)).toEqual({
      ok: true,
    });
    expect(validateStructuralLeg(SIMPLE_EXAMPLE, emittedJsonSchema)).toEqual({
      ok: true,
    });
  });

  it("the seeded task_item example passes its structural leg", () => {
    const emittedJsonSchema = kindSchemaToJsonSchema("task_item", resolveSchema, {
      strict: true,
      injectKind: false,
    })?.schema;
    expect(validateStructuralLeg(ITEM_EXAMPLE, emittedJsonSchema)).toEqual({
      ok: true,
    });
  });

  it("the full dual gate goes green for the canonical example", () => {
    const emittedJsonSchema = kindSchemaToJsonSchema("task_list", resolveSchema, {
      strict: true,
      injectKind: false,
    })?.schema;
    const result = runKindDualGate({
      kind: "task_list",
      sample: FULL_EXAMPLE,
      emittedJsonSchema,
      definition: TASK_LIST_KIND_DEFINITIONS[0],
    });
    expect(result.structural).toEqual({ ok: true });
    expect(result.render.ok).toBe(true);
    expect(result.isActive).toBe(true);
  });
});

describe("task_list legacy bridge — serverData the REAL parser accepts", () => {
  it("serializes the canonical value into the exact checklist grammar", () => {
    const envelope = envelopeFromCompleteValue(FULL_EXAMPLE, "task_list");
    const serverData = tasksServerDataFromEnvelope(envelope);
    expect(serverData).toEqual({ content: EXPECTED_FULL_CHECKLIST });
  });

  it("the real parseMarkdownChecklist accepts the bridge content 1:1", () => {
    const envelope = envelopeFromCompleteValue(FULL_EXAMPLE, "task_list");
    const content = tasksServerDataFromEnvelope(envelope)?.content;
    if (typeof content !== "string") throw new Error("bridge produced no content");

    const parsed = parseMarkdownChecklist(content);
    expect(parsed).toHaveLength(2);

    const [planning, execution] = parsed;
    expect(planning.type).toBe("section");
    expect(planning.title).toBe("Planning");
    expect(planning.children?.map((t) => [t.title, t.checked])).toEqual([
      ["Define scope", true],
      ["Set the budget", false],
    ]);

    expect(execution.type).toBe("section");
    expect(execution.title).toBe("Execution");
    const kickoff = execution.children?.[0];
    expect(kickoff?.title).toBe("Kick off the work");
    expect(kickoff?.bold).toBe(true);
    expect(kickoff?.checked).toBe(false);
    expect(kickoff?.children?.map((s) => [s.type, s.title, s.checked])).toEqual([
      ["subtask", "Assign owners", true],
      ["subtask", "Schedule the kickoff call", false],
    ]);
    expect(execution.children?.[1]?.title).toBe("Track progress");
  });

  it("round-trips: strategy(bridge(value)) reproduces the canonical items", () => {
    const envelope = envelopeFromCompleteValue(FULL_EXAMPLE, "task_list");
    const content = tasksServerDataFromEnvelope(envelope)?.content;
    if (typeof content !== "string") throw new Error("bridge produced no content");

    const reparsed = tasksLegacyTextToKindValue(content);
    expect(reparsed?.items).toEqual(FULL_EXAMPLE.items);
  });

  it("gates on completeness and declines empty lists", () => {
    const streaming = envelopeFromCompleteValue(FULL_EXAMPLE, "task_list");
    const partial = {
      ...streaming,
      root: { ...streaming.root, status: "streaming" as const },
    };
    expect(tasksServerDataFromEnvelope(partial)).toBeUndefined();

    const empty = envelopeFromCompleteValue(
      { __kind: "task_list", items: [] },
      "task_list",
    );
    expect(tasksServerDataFromEnvelope(empty)).toBeUndefined();
  });

  it("legacy-surface flattening: deep nesting and orphan subtasks stay renderable", () => {
    const value = {
      __kind: "task_list",
      items: [
        // Top-level subtask would be DROPPED by the parser as an orphan
        // indented line — the serializer promotes it to a task line.
        { __kind: "task_item", item_type: "subtask", title: "Promoted orphan", checked: false },
        {
          __kind: "task_item",
          item_type: "task",
          title: "Parent",
          checked: false,
          children: [
            {
              __kind: "task_item",
              item_type: "subtask",
              title: "Level one",
              checked: true,
              // Deeper than the grammar carries — flattens to subtask lines.
              children: [
                { __kind: "task_item", item_type: "subtask", title: "Level two", checked: false },
              ],
            },
          ],
        },
      ],
    };
    expect(taskListToChecklistMarkdown(value)).toBe(
      ["- [ ] Promoted orphan", "- [ ] Parent", "  - [x] Level one", "  - [ ] Level two"].join("\n"),
    );

    const parsed = parseMarkdownChecklist(taskListToChecklistMarkdown(value));
    expect(parsed.map((i) => i.title)).toEqual(["Promoted orphan", "Parent"]);
    expect(parsed[1].children?.map((s) => s.title)).toEqual([
      "Level one",
      "Level two",
    ]);
  });

  it("toMarkdown exports heading + checklist and preserves unknown keys", () => {
    const markdown = taskListMarkdownFromValue({
      ...FULL_EXAMPLE,
      source_note: "sprint review",
    });
    expect(markdown.startsWith("# Product release plan\n")).toBe(true);
    expect(markdown).toContain("- [x] Define scope");
    expect(markdown).toContain("## Additional details");
    expect(markdown).toContain("source_note");
  });
});

describe("tasks_legacy_text strategy — wraps the REAL fence parser", () => {
  const FENCE_BODY = [
    "## Sprint 12",
    "- [x] Ship the auth fix",
    "- [ ] **Write the postmortem**",
    "  - [x] Collect the timeline",
    "  - [ ] Draft the doc",
    "* [ ] Update the changelog",
    "- [X] Uppercase marker line",
    "- [ ]No space after checkbox",
    "- plain bullet without a checkbox",
    "# single-hash heading",
    "- [ ] Final review",
  ].join("\n");
  const FENCED = "```tasks\n" + FENCE_BODY + "\n```";

  it("converts a real fence body (sections, nesting, checked state, bold)", () => {
    const value = tasksLegacyTextToKindValue(FENCED);
    expect(value).not.toBeNull();
    expect(value?.__kind).toBe("task_list");
    expect(value?.title).toBeUndefined(); // the fence carries no title

    const items = value?.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    const section = items[0];
    expect(section.__kind).toBe("task_item");
    expect(section.item_type).toBe("section");
    expect(section.title).toBe("Sprint 12");
    expect(section.checked).toBeUndefined(); // sections carry no checkbox

    const tasks = section.children as Array<Record<string, unknown>>;
    expect(tasks.map((t) => t.title)).toEqual([
      "Ship the auth fix",
      "Write the postmortem",
      "Update the changelog",
      "Final review",
    ]);
    expect(tasks[0].checked).toBe(true);
    expect(tasks[1].bold).toBe(true);
    expect(tasks[1].checked).toBe(false);
    expect(
      (tasks[1].children as Array<Record<string, unknown>>).map((s) => [
        s.item_type,
        s.title,
        s.checked,
      ]),
    ).toEqual([
      ["subtask", "Collect the timeline", true],
      ["subtask", "Draft the doc", false],
    ]);
  });

  it("encodes the real parser failure modes: uppercase-X and missing space DROP the line", () => {
    const value = tasksLegacyTextToKindValue(FENCED);
    const flat = JSON.stringify(value);
    expect(flat).not.toContain("Uppercase marker line");
    expect(flat).not.toContain("No space after checkbox");
    expect(flat).not.toContain("plain bullet");
    expect(flat).not.toContain("single-hash heading");
  });

  it("accepts BOTH host framings — full fence and inner body converge identically", () => {
    expect(tasksLegacyTextToKindValue(FENCE_BODY)).toEqual(
      tasksLegacyTextToKindValue(FENCED),
    );
  });

  it("returns null (loud fallback) when nothing checkable survives", () => {
    expect(tasksLegacyTextToKindValue("```tasks\njust prose here\n```")).toBeNull();
    expect(tasksLegacyTextToKindValue("```tasks\n## Headers only\n```")).toBeNull();
    expect(tasksLegacyTextToKindValue("")).toBeNull();
  });

  it("strategy output is schema-valid against the converter-emitted schema", () => {
    const emittedJsonSchema = kindSchemaToJsonSchema("task_list", resolveSchema, {
      strict: true,
      injectKind: false,
    })?.schema;
    const value = tasksLegacyTextToKindValue(FENCED);
    if (!value) throw new Error("strategy declined a valid fence");
    expect(validateStructuralLeg(value, emittedJsonSchema)).toEqual({ ok: true });
  });
});

describe("keystone parity — fence strategy and __kind JSON meet at one envelope shape", () => {
  it("the REAL kind parser resolves the recursive schema from raw JSON", () => {
    const envelope = normalizeJsonRegion(JSON.stringify(FULL_EXAMPLE), {
      schemas: SCHEMAS,
    });
    expect(envelope.root.kind).toBe("task_list");
    expect(envelope.root.status).toBe("complete");
    expect(envelope.root.kindState).toBe("resolved");
    expect(envelope.root.value).toEqual(FULL_EXAMPLE);
  });

  it("bridge derives identical serverData from the parsed and the constructed envelope", () => {
    const parsed = normalizeJsonRegion(JSON.stringify(FULL_EXAMPLE), {
      schemas: SCHEMAS,
    });
    const constructed = envelopeFromCompleteValue(FULL_EXAMPLE, "task_list");
    expect(tasksServerDataFromEnvelope(parsed)).toEqual(
      tasksServerDataFromEnvelope(constructed),
    );
  });
});
