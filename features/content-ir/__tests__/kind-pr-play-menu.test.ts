/**
 * pr_play_menu — the PR Director's menu of plays (BRIEFS-STRATEGY-AND-ORG-CHART §2 Output).
 *
 * The menu is data for BUTTONS: the bridge must read plays + actions, the reader must never see field
 * names, and the kind must route to its block.
 */

import {
  envelopeFromCompleteValue,
  KIND_KEY,
  kindSchemaToJsonSchema,
  validateStructuralLeg,
  type KindSchema,
} from "@ai-matrx/content-ir";

import {
  BLOCK_DISPATCH_CLASSIFICATION,
  resolveBlockDispatch,
} from "@/components/mardown-display/chat-markdown/block-registry/block-dispatch";
import { playRequestText, surfaceHref } from "@/features/marketing/pr/director/PrPlayMenuView";

import {
  PR_DIAGNOSIS_KIND,
  PR_PEG_CHECK_KIND,
  PR_PLAY_ACTION_KIND,
  PR_PLAY_KIND,
  PR_PLAY_MENU_BLOCK_TYPE,
  PR_PLAY_MENU_KIND,
  prDiagnosisKindSchema,
  prPegCheckKindSchema,
  prPlayActionKindSchema,
  prPlayKindSchema,
  prPlayMenuKindSchema,
  prPlayMenuMarkdownFromValue,
  prPlayMenuServerDataFromEnvelope,
} from "../kinds/pr-play-menu";
import { SYSTEM_KIND_DEFINITIONS } from "../registry/system-kinds";

const SCHEMAS: Record<string, KindSchema> = {
  [PR_PLAY_MENU_KIND]: prPlayMenuKindSchema,
  [PR_PLAY_KIND]: prPlayKindSchema,
  [PR_PLAY_ACTION_KIND]: prPlayActionKindSchema,
  [PR_DIAGNOSIS_KIND]: prDiagnosisKindSchema,
  [PR_PEG_CHECK_KIND]: prPegCheckKindSchema,
};

const MENU = {
  [KIND_KEY]: PR_PLAY_MENU_KIND,
  plays: [
    {
      [KIND_KEY]: PR_PLAY_KIND,
      title: "Own the data-destruction story",
      why_this_founder: "You hold certified destruction records nobody else publishes.",
      first_move: "Pull last year's destruction volumes into one chart.",
      trap: "Turning it into a brochure.",
      effort: "one_or_two_moves",
      action: { [KIND_KEY]: PR_PLAY_ACTION_KIND, type: "run_member", target: "angles", inputs: { mode: "peg" } },
    },
    {
      [KIND_KEY]: PR_PLAY_KIND,
      title: "Set up the reactive desk",
      why_this_founder: "Reporters ask about e-waste weekly.",
      first_move: "Answer one request this week.",
      trap: "Answering everything.",
      effort: "program",
      action: { [KIND_KEY]: PR_PLAY_ACTION_KIND, type: "open_surface", target: "/marketing/x/pr", inputs: {} },
    },
    { [KIND_KEY]: PR_PLAY_KIND, title: "", why_this_founder: "", first_move: "", trap: "", effort: "program" },
  ],
  diagnosis: {
    [KIND_KEY]: PR_DIAGNOSIS_KIND,
    audience: "IT buyers",
    goal: "pipeline",
    nearest_moment: "",
    buyer: "",
    confidence: "inferred",
  },
  peg: {
    [KIND_KEY]: PR_PEG_CHECK_KIND,
    text: "Destruction volumes",
    passes_new: true,
    passes_timely: false,
    passes_others_care: true,
  },
  next_move: "Pick one and I will start it.",
};

describe("pr_play_menu — structural leg", () => {
  it("a full menu passes the converter-emitted schema", () => {
    const exported = kindSchemaToJsonSchema(PR_PLAY_MENU_KIND, (k) => SCHEMAS[k], {
      strict: true,
      injectKind: false,
    });
    expect(exported?.unresolved).toEqual([]);
    const result = validateStructuralLeg(MENU as Record<string, unknown>, exported!.schema as Record<string, unknown>);
    expect(result.detail).toBeUndefined();
    expect(result.ok).toBe(true);
  });
});

describe("pr_play_menu — the bridge reads plays as buttons", () => {
  it("reads each titled play and its action; drops untitled plays", () => {
    const data = prPlayMenuServerDataFromEnvelope(envelopeFromCompleteValue(MENU, PR_PLAY_MENU_KIND));
    expect(data?.plays).toHaveLength(2);
    expect(data?.plays[0].action).toEqual({ type: "run_member", target: "angles", inputs: { mode: "peg" } });
    expect(data?.plays[1].action?.type).toBe("open_surface");
    expect(data?.nextMove).toBe("Pick one and I will start it.");
  });

  it("declines a payload with no plays list", () => {
    expect(
      prPlayMenuServerDataFromEnvelope(
        envelopeFromCompleteValue({ [KIND_KEY]: PR_PLAY_MENU_KIND, next_move: "x" }, PR_PLAY_MENU_KIND),
      ),
    ).toBeUndefined();
  });

  it("the words a pressed play sends never carry machinery", () => {
    const data = prPlayMenuServerDataFromEnvelope(envelopeFromCompleteValue(MENU, PR_PLAY_MENU_KIND))!;
    const text = playRequestText(data.plays[0]);
    expect(text).toContain("Own the data-destruction story");
    for (const machinery of ["run_member", "angles", "pr_play", "__kind", "target"]) {
      expect(text).not.toContain(machinery);
    }
  });

  it("only an in-app route is navigable", () => {
    expect(surfaceHref("/marketing/x/pr")).toBe("/marketing/x/pr");
    expect(surfaceHref("//evil.test/x")).toBeNull();
    expect(surfaceHref("https://evil.test")).toBeNull();
    expect(surfaceHref("media list")).toBeNull();
  });

  it("markdown never prints field names", () => {
    const md = prPlayMenuMarkdownFromValue(MENU as Record<string, unknown>);
    expect(md).toContain("Own the data-destruction story");
    for (const field of ["why_this_founder", "first_move", "run_member", "next_move"]) {
      expect(md).not.toContain(field);
    }
  });
});

describe("pr_play_menu — registration", () => {
  it("is compiled in with the render key the dispatch table resolves as a shape", () => {
    const def = SYSTEM_KIND_DEFINITIONS.find((d) => d.kind === PR_PLAY_MENU_KIND);
    expect(def?.legacyBlockType).toBe(PR_PLAY_MENU_BLOCK_TYPE);
    for (const child of [PR_PLAY_KIND, PR_PLAY_ACTION_KIND, PR_DIAGNOSIS_KIND, PR_PEG_CHECK_KIND]) {
      expect(SYSTEM_KIND_DEFINITIONS.some((d) => d.kind === child)).toBe(true);
    }
    expect(resolveBlockDispatch(PR_PLAY_MENU_BLOCK_TYPE)).not.toBeNull();
    expect(BLOCK_DISPATCH_CLASSIFICATION.shape).toContain(PR_PLAY_MENU_BLOCK_TYPE);
  });
});
