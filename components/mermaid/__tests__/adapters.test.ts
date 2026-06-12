/**
 * Adapter fidelity tests — the contract behind structural editing:
 *  1. serialize(parse(s)) ≡ s (normalized) for every supported document,
 *  2. unsupported syntax downgrades to code-only (never guesses),
 *  3. ops produce correct, minimal-diff output.
 */

import { flowchartAdapter } from "../adapters/flowchart";
import { mindmapAdapter } from "../adapters/mindmap";
import { pieAdapter } from "../adapters/pie";
import { sequenceAdapter } from "../adapters/sequence";
import { timelineAdapter } from "../adapters/timeline";
import type { MermaidAdapter } from "../model/adapter";
import { normalizeForComparison } from "../model/round-trip";
import type {
  FlowchartDoc,
  MermaidDoc,
  MindmapDoc,
  PieDoc,
  SequenceDoc,
  TimelineDoc,
} from "../model/types";

function expectRoundTrip<D extends MermaidDoc>(adapter: MermaidAdapter<D>, source: string): D {
  const outcome = adapter.parse(source);
  expect(outcome.status).toBe("ok");
  if (outcome.status !== "ok") throw new Error("unreachable");
  const serialized = adapter.serialize(outcome.doc as D);
  expect(normalizeForComparison(serialized)).toBe(normalizeForComparison(source));
  return outcome.doc as D;
}

describe("flowchart adapter", () => {
  const basic = `flowchart TD
  A[Start] --> B{Valid?}
  B -->|Yes| C[Done]
  B -->|No| A`;

  it("round-trips a basic flowchart", () => {
    expectRoundTrip(flowchartAdapter, basic);
  });

  it("round-trips frontmatter, comments, classDef, :::class, click", () => {
    expectRoundTrip(
      flowchartAdapter,
      `---
title: My Flow
---
flowchart LR
  %% a comment
  A[Start] --> B(Middle)
  B --> C([End])
  classDef hot fill:#f00
  C:::hot --> D{{Hex}}
  click A "https://x.com"`,
    );
  });

  it("round-trips fanout and chains", () => {
    const doc = expectRoundTrip(
      flowchartAdapter,
      `flowchart TD
  A & B --> C
  C --> D --> E`,
    );
    expect(doc.edges).toHaveLength(4); // A→C, B→C, C→D, D→E
  });

  it("round-trips one-level subgraphs", () => {
    expectRoundTrip(
      flowchartAdapter,
      `flowchart TD
  subgraph G1[Group One]
    A --> B
  end
  B --> C`,
    );
  });

  it("round-trips every edge label form", () => {
    expectRoundTrip(
      flowchartAdapter,
      `flowchart TD
  A -- label --> B
  B -. dotted .-> C
  C == thick ==> D
  D --- E`,
    );
  });

  it("downgrades nested subgraphs to code-only", () => {
    const outcome = flowchartAdapter.parse(
      `flowchart TD
  subgraph A1
    subgraph A2
      X --> Y
    end
  end`,
    );
    expect(outcome.status).toBe("code-only");
  });

  it("downgrades unrecognized statements to code-only (never guesses)", () => {
    const outcome = flowchartAdapter.parse(`flowchart TD
  A --> B
  weird ~~~ thing`);
    expect(outcome.status).toBe("code-only");
  });

  it("renameNode regenerates only the affected line", () => {
    const outcome = flowchartAdapter.parse(basic);
    if (outcome.status !== "ok") throw new Error("parse failed");
    const doc = flowchartAdapter.applyOp(outcome.doc as FlowchartDoc, {
      type: "renameNode",
      id: "C",
      label: "Finished!",
    });
    const serialized = flowchartAdapter.serialize(doc);
    expect(serialized).toContain("Finished!");
    expect(serialized).toContain("A[Start] --> B{Valid?}"); // untouched line verbatim
  });

  it("addNode with connectFrom appends declaration and edge", () => {
    const outcome = flowchartAdapter.parse(basic);
    if (outcome.status !== "ok") throw new Error("parse failed");
    const doc = flowchartAdapter.applyOp(outcome.doc as FlowchartDoc, {
      type: "addNode",
      label: "New Step",
      connectFrom: "C",
    });
    const serialized = flowchartAdapter.serialize(doc);
    expect(serialized).toMatch(/n\d+\[New Step\]/);
    expect(serialized).toMatch(/C --> n\d+/);
  });

  it("deleteNode cascades its edges", () => {
    const outcome = flowchartAdapter.parse(basic);
    if (outcome.status !== "ok") throw new Error("parse failed");
    const doc = flowchartAdapter.applyOp(outcome.doc as FlowchartDoc, {
      type: "deleteNode",
      id: "B",
    });
    const serialized = flowchartAdapter.serialize(doc);
    expect(serialized).not.toContain("B{");
    expect(serialized).not.toContain("-->|Yes|");
  });

  it("quotes labels containing special characters on regeneration", () => {
    const outcome = flowchartAdapter.parse(`flowchart TD\n  A[Plain] --> B[Other]`);
    if (outcome.status !== "ok") throw new Error("parse failed");
    const doc = flowchartAdapter.applyOp(outcome.doc as FlowchartDoc, {
      type: "renameNode",
      id: "A",
      label: "Step (one): start",
    });
    expect(flowchartAdapter.serialize(doc)).toContain('A["Step (one): start"]');
  });
});

describe("mindmap adapter", () => {
  const basic = `mindmap
  root((Main Idea))
    Topic One
      Detail A
    Topic Two`;

  it("round-trips a basic mindmap", () => {
    expectRoundTrip(mindmapAdapter, basic);
  });

  it("round-trips shapes and ::icon decorators", () => {
    expectRoundTrip(
      mindmapAdapter,
      `mindmap
  root((Idea))
    A[Square]
    ::icon(fa fa-bolt)
    B(Rounded)`,
    );
  });

  it("addChild regenerates the tree with all content preserved", () => {
    const outcome = mindmapAdapter.parse(basic);
    if (outcome.status !== "ok") throw new Error("parse failed");
    const doc = outcome.doc as MindmapDoc;
    const next = mindmapAdapter.applyOp(doc, {
      type: "addChild",
      parentId: doc.root.children[0].id,
      label: "New Child",
    });
    const serialized = mindmapAdapter.serialize(next);
    expect(serialized).toContain("New Child");
    expect(serialized).toContain("root((Main Idea))");
    expect(serialized).toContain("Topic Two");
  });

  it("downgrades multiple roots to code-only", () => {
    expect(mindmapAdapter.parse(`mindmap\n  rootA\n  rootB`).status).toBe("code-only");
  });
});

describe("sequence adapter", () => {
  const basic = `sequenceDiagram
  participant U as User
  participant S as System
  U->>S: Request
  S-->>U: Response
  note over U,S: a note
  loop Retry
    U->>S: Again
  end`;

  it("round-trips messages and locked blocks", () => {
    expectRoundTrip(sequenceAdapter, basic);
  });

  it("editMessage regenerates one line, preserves notes/loops verbatim", () => {
    const outcome = sequenceAdapter.parse(basic);
    if (outcome.status !== "ok") throw new Error("parse failed");
    const doc = outcome.doc as SequenceDoc;
    const message = doc.items.find((i) => i.kind === "message");
    if (!message || message.kind !== "message") throw new Error("no message");
    const next = sequenceAdapter.applyOp(doc, {
      type: "editMessage",
      id: message.id,
      text: "Changed!",
    });
    const serialized = sequenceAdapter.serialize(next);
    expect(serialized).toContain("U->>S: Changed!");
    expect(serialized).toContain("note over U,S: a note");
    expect(serialized).toContain("loop Retry");
  });

  it("blocks deleting a participant that still has messages", () => {
    const outcome = sequenceAdapter.parse(basic);
    if (outcome.status !== "ok") throw new Error("parse failed");
    expect(() =>
      sequenceAdapter.applyOp(outcome.doc as SequenceDoc, {
        type: "deleteParticipant",
        id: "U",
      }),
    ).toThrow();
  });
});

describe("pie adapter", () => {
  it("round-trips header-title form", () => {
    expectRoundTrip(pieAdapter, `pie title Breakdown\n  "A" : 45\n  "B" : 30`);
  });

  it("round-trips showData + title-line form", () => {
    expectRoundTrip(pieAdapter, `pie showData\n  title My Title\n  "X" : 10`);
  });

  it("addSlice appends a quoted slice line", () => {
    const outcome = pieAdapter.parse(`pie title Breakdown\n  "A" : 45`);
    if (outcome.status !== "ok") throw new Error("parse failed");
    const next = pieAdapter.applyOp(outcome.doc as PieDoc, {
      type: "addSlice",
      label: "C",
      value: 25,
    });
    expect(pieAdapter.serialize(next)).toContain('"C" : 25');
  });
});

describe("timeline adapter", () => {
  it("round-trips sections and multi-event rows", () => {
    expectRoundTrip(
      timelineAdapter,
      `timeline
  title History
  section Early
    2020 : Started
    2021 : Grew : Expanded
  section Late
    2022 : Won`,
    );
  });

  it("round-trips continuation-line events and merges them on edit", () => {
    const source = `timeline\n  2020 : A\n       : B\n       : C`;
    const doc = expectRoundTrip(timelineAdapter, source) as TimelineDoc;
    const row = doc.sections[0].rows[0];
    expect(row.events).toEqual(["A", "B", "C"]);
    const next = timelineAdapter.applyOp(doc, {
      type: "editEvent",
      rowId: row.id,
      eventIndex: 1,
      text: "B2",
    });
    expect(timelineAdapter.serialize(next)).toContain("2020 : A : B2 : C");
  });
});
