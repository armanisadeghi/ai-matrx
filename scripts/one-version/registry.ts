/**
 * THE ONE-VERSION REGISTRY — every canonical piece, its detector, its approved variants.
 *
 * Owner rule (Arman, 2026-10-05): only ONE version of anything may exist, except variants he
 * explicitly approved. A new piece is ONE entry in PIECES below: a name, the canonical file(s), a
 * detector that finds a second implementation, and (rarely) approved variants. An approved variant
 * needs a `reason` and the DATE OF ARMAN'S RULING — never an agent's opinion (law 6/12: organizations
 * decide, agents never do). Known duplicates that nobody has ruled on yet live in baseline.json
 * (shrink-only), NEVER here.
 */

export interface SourceFile {
  /** Repo-relative path, forward slashes. */
  file: string;
  /** As written. */
  raw: string;
  /** Comments blanked out (offsets and line numbers preserved). */
  code: string;
}

export interface Hit {
  line: number;
  reason: string;
}

export interface ApprovedVariant {
  /** Exact repo-relative file, or a directory prefix ending in "/". */
  path: string;
  reason: string;
  /** Date Arman ruled this a sanctioned variant (YYYY-MM-DD), or "canonical" ruling date for the piece's own files. */
  ruling: string;
}

export interface Piece {
  id: string;
  name: string;
  /** The ONE canonical implementation(s) — files or directory prefixes. Never reported. */
  canonical: string[];
  /** Variants Arman explicitly approved. */
  approved: ApprovedVariant[];
  /** Only files this returns true for are scanned. */
  scope: (file: string) => boolean;
  detect: (src: SourceFile) => Hit[];
}

const INPUTS = "../aidream/apps/shared/chat/src/agents/components/inputs/";
const SMART_INPUT = `${INPUTS}smart-input/`;
const RULED = "2026-10-05";

export function lineOf(text: string, index: number): number {
  return text.slice(0, Math.max(0, index)).split("\n").length;
}

function first(text: string, re: RegExp): number | null {
  const m = re.exec(text);
  return m ? m.index : null;
}

/** Sends a message to an agent. */
// Every door a typed message can take into an agent run — the conversation
// sends AND the headless / one-shot doors (2026-10-08: /make's describe box
// typed into a ProTextarea and sent through useHeadlessAgentJson, so it could
// not attach anything, and this guard saw neither half).
const SENDS_TO_AGENT =
  /\b(?:smartExecute|executeInstance|launchAgentExecution|startConversation|startHostedRun|composerKeyIntent|enterSendsHere|useHeadlessAgentJson|runHeadlessAgentJson|useLiveAgentRun|launchMandate|continueAgentConversation)\b/;
// A box a person writes in: a raw field, or the shared writing boxes
// (ProTextarea / ProInput / VoiceTextarea) used as a message box.
const OWN_TEXTAREA =
  /<\s*(?:textarea|Textarea|AutosizeTextarea|TextareaAutosize|ProTextarea|ProInput|VoiceTextarea)\b|contentEditable\b/;
const ENTER_KEY = /\bkey\s*===?\s*["']Enter["']|\bkeyCode\s*===?\s*13\b|\bcode\s*===?\s*["']Enter["']/;

const notTest = (f: string) =>
  /\.(?:ts|tsx)$/.test(f) &&
  !/(?:^|\/)(?:__tests__|node_modules|\.next|scripts)\//.test(f) &&
  !/\.(?:test|spec)\.tsx?$/.test(f) &&
  !f.endsWith(".d.ts");

export const PIECES: Piece[] = [
  {
    id: "chat-input",
    name: "The chat input (SmartAgentInput)",
    canonical: [SMART_INPUT],
    approved: [],
    scope: notTest,
    detect: ({ code }) => {
      if (!SENDS_TO_AGENT.test(code)) return [];
      const at = first(code, OWN_TEXTAREA);
      if (at === null) return [];
      return [
        {
          line: lineOf(code, at),
          reason: "renders its own textarea AND sends to an agent — a second chat input; render SmartAgentInput",
        },
      ];
    },
  },
  {
    id: "enter-to-send",
    name: "Enter-to-send (composerKeyIntent)",
    canonical: ["../aidream/apps/shared/kit/src/composer-keys.ts"],
    approved: [],
    scope: notTest,
    detect: ({ code }) => {
      if (/\bcomposerKeyIntent\b/.test(code)) return [];
      const at = first(code, ENTER_KEY);
      if (at === null) return [];
      if (!SENDS_TO_AGENT.test(code)) return [];
      return [
        {
          line: lineOf(code, at),
          reason: "hand-rolled Enter-to-send; use composerKeyIntent",
        },
      ];
    },
  },
  {
    id: "paste-to-upload",
    name: "Paste-to-upload (paste attaches once)",
    canonical: [`${SMART_INPUT}SmartInputFileDropTarget.tsx`],
    approved: [],
    scope: notTest,
    detect: ({ code }) => {
      const dz = first(code, /\buseDropzone\s*\(/);
      if (dz === null) return [];
      const ownPaste = /\bonPaste\b|addEventListener\s*\(\s*["']paste["']/.test(code);
      if (!ownPaste || /\bnoPaste\s*:\s*true\b/.test(code)) return [];
      return [
        {
          line: lineOf(code, dz),
          reason: "useDropzone plus its own paste handler without noPaste: true — one paste attaches twice",
        },
      ];
    },
  },
  {
    id: "agent-variables",
    name: "Agent variables rendering",
    canonical: [
      `${INPUTS}AgentVariablesInline.tsx`,
      `${INPUTS}variable-input-variations/`,
      `${INPUTS}input-components/`,
    ],
    approved: [],
    scope: notTest,
    detect: ({ code, file }) => {
      // Maps agent variable definitions straight to form controls.
      const map = /\b(?:variableDefinitions|variableDefs|agentVariables|variable_definitions|definitions)\s*(?:\?\.|\.)\s*map\s*\(/;
      const at = first(code, map);
      if (at === null) return [];
      // bare `definitions` is only an agent-variable list in a file named for variables
      if (/\bdefinitions\s*(?:\?\.|\.)\s*map/.test(code.slice(at, at + 40)) && !/variable/i.test(file)) return [];
      if (!/<\s*(?:input|textarea|select|Input|Textarea|Select|Switch|Slider|Checkbox)\b/.test(code)) return [];
      return [
        {
          line: lineOf(code, at),
          reason: "maps agent variable definitions to inputs itself; use AgentVariablesInline / variable-input-variations",
        },
      ];
    },
  },
  {
    id: "composer-chips",
    name: "Chips around the input (ComposerChip)",
    canonical: [`${SMART_INPUT}ComposerChip.tsx`],
    approved: [],
    scope: (f) => notTest(f) && f.startsWith(INPUTS),
    detect: ({ code }) => {
      const re =
        /(?:\bh-6\b[^"'`\n]*\brounded-full\b[^"'`\n]*\bborder\b|\brounded-full\b[^"'`\n]*\bh-6\b[^"'`\n]*\bborder\b|\bh-6\b[^"'`\n]*\bborder\b[^"'`\n]*\brounded-full\b)/;
      const at = first(code, re);
      if (at === null) return [];
      return [
        {
          line: lineOf(code, at),
          reason: "hand-written pill classes (h-6 rounded-full border); use ComposerChip / composerPillClass",
        },
      ];
    },
  },
  {
    id: "context-chips",
    name: "Context values chip + scope control",
    canonical: [`${SMART_INPUT}ConversationContextChip.tsx`, "../aidream/apps/shared/chat/src/context/sources/scopes.tsx"],
    approved: [],
    scope: notTest,
    detect: ({ code, file }) => {
      const out: Hit[] = [];
      // Deleted on 2026-10-05 — if either reappears it is a second version.
      const dead = /\b(?:function|const|class)\s+(ActiveContextButton|ContextLensBar)\b/.exec(code);
      if (dead) {
        out.push({ line: lineOf(code, dead.index), reason: `${dead[1]} was deleted and must not return; use ActiveContextLensChip` });
      }
      // The ONE definition of each is its own canonical file (found by name).
      const dup = /\b(?:function|const|class)\s+(ConversationContextChip|ActiveContextLensChip)\b/.exec(code);
      if (dup && !file.endsWith(`/${dup[1]}.tsx`)) {
        out.push({ line: lineOf(code, dup.index), reason: `second definition of ${dup[1]}` });
      }
      return out;
    },
  },
  {
    id: "mac-detection",
    name: "Mac/modifier detection (isMacLike)",
    canonical: ["../aidream/apps/shared/chat/src/agents/hooks/useAgentUndoRedo.ts"],
    approved: [],
    scope: notTest,
    detect: ({ code }) => {
      const re =
        /(?:navigator[^;\n]{0,80}platform|userAgentData)[\s\S]{0,300}?(?:\/[^/\n]*(?:mac|iphone|ipad)|["'](?:Mac|iPhone|iPad))|\/[^/\n]*\b(?:Mac|iPhone|iPad)[^/\n]*\/[a-z]*\s*\.\s*test\s*\(\s*(?:navigator|window\.navigator|ua\b|platform\b|userAgent\b)|(?:navigator\.(?:platform|userAgent)|userAgentData\??\.platform)[^;\n]{0,60}(?:Mac|iPhone|iPad)|(?:Mac|iPhone|iPad)[^;\n]{0,60}navigator\.(?:platform|userAgent)/;
      const at = first(code, re);
      if (at === null) return [];
      return [{ line: lineOf(code, at), reason: "own Mac/iOS detection; import isMacLike from useAgentUndoRedo" }];
    },
  },
];
