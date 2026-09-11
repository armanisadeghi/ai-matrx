/**
 * THE RUN BOX TELLS THE TRUTH.
 *
 * 2026-09-11, Masterwork "Verification Desk": six nodes failed the server's
 * compile gate, `GET /workflows/{id}/run-form` answered 400, and the box said
 *
 *     Could not read what this asks for
 *     Bad request. Please check your input. The fields below are the fallback
 *     pair, not this Masterwork's own declared inputs…
 *
 * The reader had typed nothing. "Check your input" blamed them for a workflow
 * that does not compile, and the server's six named, node-addressed reasons —
 * which it HAD sent — were shown nowhere.
 *
 * A screen is absent or honest, never wearing a false sentence. These tests
 * stand on the shared layer (`describeRunFormFailure`, which every consumer of
 * `useServedRunForm` inherits) and on the Masterwork box's own rendering.
 */

import { renderToStaticMarkup } from "react-dom/server";

import {
  describeRunFormFailure,
  GENERIC_REFUSAL_FALLBACK,
  runFormScreamProps,
} from "../run-form-refusal";
import { ServedFormScream } from "../ServedInputFields";

/** The exact envelope the run-form endpoint answers a compile failure with. */
const COMPILE_FAILURE = {
  detail: {
    error: "definition_does_not_compile",
    user_message:
      "This workflow does not compile, so there is nothing to ask you for " +
      "yet. 6 problem(s) must be fixed in the workflow itself — open it in " +
      "Workflow Studio (or ask the Conductor) and fix the steps named below.",
    details: [
      {
        field: "nodes[manip_open].type",
        node_id: "manip_open",
        message:
          "Node renderer type 'custom' and executable spec_type 'plan.step' " +
          "disagree about whether this is a Plan anchor.",
      },
      {
        field: "nodes[lens_open].type",
        node_id: "lens_open",
        message:
          "Node renderer type 'custom' and executable spec_type 'plan.step' " +
          "disagree about whether this is a Plan anchor.",
      },
    ],
    definition_id: "aa3e6306-dc2a-485b-b656-3fff9b790b26",
  },
};

const BLAMING_SENTENCE = "Bad request. Please check your input.";

describe("describeRunFormFailure — the server's reason always wins", () => {
  it("carries every issue the server named", () => {
    const failure = describeRunFormFailure({
      status: 400,
      message: BLAMING_SENTENCE,
      serverDetail: COMPILE_FAILURE,
    });

    expect(failure.issues).toHaveLength(2);
    expect(failure.issues[0]).toContain("manip_open");
    expect(failure.issues[0]).toContain("Plan anchor");
    expect(failure.issues[1]).toContain("lens_open");
  });

  it("says the workflow does not compile and where to fix it", () => {
    const failure = describeRunFormFailure({
      status: 400,
      message: BLAMING_SENTENCE,
      serverDetail: COMPILE_FAILURE,
    });

    expect(failure.serverExplained).toBe(true);
    expect(failure.doesNotCompile).toBe(true);
    expect(failure.message).toContain("does not compile");
    expect(failure.message).toMatch(/Workflow Studio|Conductor/);
  });

  it("never repeats a sentence that blames the reader's input", () => {
    const failure = describeRunFormFailure({
      status: 400,
      message: BLAMING_SENTENCE,
      serverDetail: COMPILE_FAILURE,
    });

    expect(failure.message).not.toContain("check your input");
    expect(failure.message).not.toBe(BLAMING_SENTENCE);
  });

  it("falls back honestly when the server sent no reason at all", () => {
    // Not a licence to invent one: the missing reason IS the defect and the
    // sentence says so.
    const failure = describeRunFormFailure({
      status: 400,
      message: "",
      serverDetail: undefined,
    });

    expect(failure.serverExplained).toBe(false);
    expect(failure.issues).toEqual([]);
    expect(failure.message).toBe(GENERIC_REFUSAL_FALLBACK);
    expect(failure.message).not.toContain("check your input");
  });

  it("passes a non-compile server message through untouched", () => {
    const failure = describeRunFormFailure({
      status: 403,
      message: "You do not have access to this workflow.",
      serverDetail: { detail: "You do not have access to this workflow." },
    });

    expect(failure.serverExplained).toBe(true);
    expect(failure.doesNotCompile).toBe(false);
    expect(failure.message).toBe("You do not have access to this workflow.");
  });
});

describe("ServedFormScream renders the named issues", () => {
  it("shows every issue line, not just a summary", () => {
    const failure = describeRunFormFailure({
      status: 400,
      message: BLAMING_SENTENCE,
      serverDetail: COMPILE_FAILURE,
    });

    const html = renderToStaticMarkup(
      <ServedFormScream
        title="This workflow cannot run yet"
        body={failure.message}
        issues={failure.issues}
      />,
    );

    expect(html).toContain("manip_open");
    expect(html).toContain("lens_open");
    expect(html).toContain("does not compile");
    expect(html).not.toMatch(/check your input/i);
  });

  it("renders nothing extra when there are no issues", () => {
    const html = renderToStaticMarkup(
      <ServedFormScream title="Kind registry gap" body="no kind" />,
    );
    expect(html).toContain("no kind");
  });
});

describe("runFormScreamProps — one refusal, one story on every surface", () => {
  const failure = () =>
    describeRunFormFailure({
      status: 400,
      message: BLAMING_SENTENCE,
      serverDetail: COMPILE_FAILURE,
    });

  it("drops the surface's own note when the workflow does not compile", () => {
    // The Masterwork box's note claims "the fields below are the fallback
    // pair". With a workflow that does not compile there are no usable fields
    // at all, so the note is a second false sentence.
    const props = runFormScreamProps(failure(), {
      title: "Could not read what this asks for",
      surfaceNote:
        "The fields below are the fallback pair, not this Masterwork's own declared inputs.",
    });

    expect(props.title).toBe("This workflow cannot run yet");
    expect(props.body).not.toContain("fallback pair");
    expect(props.body).toContain("does not compile");
    expect(props.issues).toHaveLength(2);
  });

  it("keeps the surface's note for any other refusal", () => {
    const other = describeRunFormFailure({
      status: 403,
      message: "You do not have access to this workflow.",
      serverDetail: { detail: "You do not have access to this workflow." },
    });
    const props = runFormScreamProps(other, {
      title: "Could not load the run form",
      surfaceNote: "The run form is SERVED — without it there is nothing to render.",
    });

    expect(props.title).toBe("Could not load the run form");
    expect(props.body).toContain("do not have access");
    expect(props.body).toContain("nothing to render");
  });
});

/**
 * EVERY surface that renders a run-form refusal goes through the shared
 * reader. A new one that hand-builds `body={`${state.message} …`}` would
 * reintroduce the generic sentence on exactly one screen, which is how this
 * class survives a point fix.
 */
describe("no surface builds its own refusal sentence", () => {
  const SURFACES = [
    "features/masterwork/components/masterworks/TryMasterworkBox.tsx",
    "features/workflow-runtime/served-form/ServedRunForm.tsx",
    "features/workflow-runtime/triggers/components/TriggerDefaultInputs.tsx",
    "features/workflow-runtime/bakeoff/reimagine-2/CommissionPage.tsx",
  ];

  it.each(SURFACES)("%s reads its refusal through runFormScreamProps", (file) => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const source = fs.readFileSync(
      path.join(process.cwd(), file),
      "utf8",
    );

    expect(source).toContain("runFormScreamProps");
    // The hand-rolled shape this replaced.
    expect(source).not.toMatch(/body=\{`\$\{(?:served|state)\.message\}/);
  });
});
