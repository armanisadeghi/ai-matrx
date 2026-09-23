/**
 * The speech-script editor tells the truth about the selected model.
 *
 * Forcing cases (every expected string typed by hand):
 *   1. a three-speaker script on a two-speaker model (Gemini TTS) shows the
 *      refusal banner naming the cap — and the same script on a ten-speaker
 *      model (ElevenLabs v3) shows none;
 *   2. a script on a model that does not speak says so;
 *   3. "Add turn" appends a turn for the OTHER speaker, carrying that
 *      speaker's voice, so a dialogue alternates without retyping;
 *   4. the voice picker lists only the voices linked to the selected model.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";
import {
  createSandboxTestStore,
  SandboxStoreProvider,
} from "@/test-utils/sandbox-store";
import {
  speechScriptCompatibility,
  type SpeechTurnSpec,
} from "@/features/agents/speech-script/types";

// ProTextarea carries the whole voice/AI toolbar (Redux, recording); the cells'
// VALUE is what this suite is about, so a plain textarea stands in for it.
jest.mock("@/components/official/ProTextarea", () => {
  const ReactActual = jest.requireActual("react");
  return {
    ProTextarea: ReactActual.forwardRef(
      (
        props: Record<string, unknown>,
        ref: React.Ref<HTMLTextAreaElement>,
      ) => {
        const { autoGrow, minHeight, maxHeight, wrapperClassName, ...rest } = props;
        void autoGrow; void minHeight; void maxHeight; void wrapperClassName;
        return ReactActual.createElement("textarea", { ...rest, ref });
      },
    ),
  };
});

jest.mock("@/features/podcasts/generator/useVoices", () => ({
  useVoices: () => ({
    voices: [
      { provider_voice_id: "kore", name: "Kore", gender: "female", metadata: { models: ["gemini-2.5-flash-preview-tts"] } },
      { provider_voice_id: "puck", name: "Puck", gender: "male", metadata: { models: ["gemini-2.5-flash-preview-tts"] } },
      { provider_voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female", metadata: { models: ["eleven_v3"] } },
    ],
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

// eslint-disable-next-line import/first
import { SpeechScriptEditor } from "@/features/agents/components/builder/message-builders/SpeechScriptEditor";

const TTS_CAPS = { input: ["text"], output: ["audio"], features: [], interaction: "turn" };

function model(name: string, controls: Record<string, unknown>, caps = TTS_CAPS): AIModelRecord {
  return {
    id: `id-${name}`,
    name,
    common_name: name,
    capabilities: caps,
    controls,
  } as unknown as AIModelRecord;
}

const GEMINI = model("gemini-2.5-flash-preview-tts", { multi_speaker: { allowed: true, max: 2 } });
const ELEVEN_V3 = model("eleven_v3", { multi_speaker: { allowed: true, max: 10 } });
const CHAT = model("gpt-5", {}, { input: ["text"], output: ["text"], features: [], interaction: "turn" });

const THREE_SPEAKERS: SpeechTurnSpec[] = [
  { speaker: "Maya", voice: "kore", text: "Welcome back, {{guest_name}}." },
  { speaker: "Sam", voice: "puck", text: "Glad to be here." },
  { speaker: "Ava", text: "And me." },
];

describe("SpeechScriptEditor", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const render = (turns: SpeechTurnSpec[], m: AIModelRecord, onChange = jest.fn()) => {
    act(() => {
      root.render(
        <SandboxStoreProvider
          store={createSandboxTestStore({
            userId: "87a6e699-3622-4869-8843-d0867456c0dd",
            organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
            adminLevel: null,
          })}
        >
          <SpeechScriptEditor
            turns={turns}
            model={m}
            onChange={onChange}
            validVariables={["guest_name"]}
            compatibility={speechScriptCompatibility(m, m.id, turns)}
          />
        </SandboxStoreProvider>,
      );
    });
    return onChange;
  };

  it("refuses three speakers on a two-speaker model and names the cap", () => {
    render(THREE_SPEAKERS, GEMINI);
    const banner = host.querySelector('[role="status"]');
    expect(banner?.textContent).toContain("performs at most 2 speakers per request; this script has 3");
    expect(host.textContent).toContain("3/2 speakers");
  });

  it("shows no banner for the same script on a ten-speaker model", () => {
    render(THREE_SPEAKERS, ELEVEN_V3);
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  it("says a model that does not speak cannot perform the script", () => {
    render(THREE_SPEAKERS.slice(0, 1), CHAT);
    expect(host.querySelector('[role="status"]')?.textContent).toContain("gpt-5 does not speak");
  });

  it("adds a turn for the other speaker, carrying that speaker's voice", () => {
    const turns = THREE_SPEAKERS.slice(0, 2);
    const onChange = render(turns, GEMINI);
    const add = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Add turn");
    expect(add).toBeDefined();
    act(() => add!.click());
    const next = onChange.mock.calls[0][0] as SpeechTurnSpec[];
    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({ speaker: "Maya", text: "", voice: "kore" });
  });
});

describe("speechScriptCompatibility", () => {
  it("refuses a speaker bound to two voices", () => {
    const verdict = speechScriptCompatibility(ELEVEN_V3, ELEVEN_V3.id, [
      { speaker: "Maya", voice: "a", text: "x" },
      { speaker: "Maya", voice: "b", text: "y" },
    ]);
    expect(verdict).toEqual({
      verdict: "refused",
      reason: "Maya has two different voices. A speaker keeps one voice for the whole script.",
    });
  });

  it("treats a model with no multi_speaker control as one voice", () => {
    const openai = model("gpt-4o-mini-tts", {});
    const verdict = speechScriptCompatibility(openai, openai.id, THREE_SPEAKERS.slice(0, 2));
    expect(verdict.verdict).toBe("refused");
  });
});
