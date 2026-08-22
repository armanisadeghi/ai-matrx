// features/masterwork/intake/approachRelevance.ts
//
// THE POINT OF THE QUALIFYING QUESTIONS (Arman, 2026-08-21).
//
// The four intake questions are not a form to survive before the real screen —
// they build a configuration object, and the FIRST job of that object is to
// decide which Approaches are relevant to this Expert. "Where does the
// knowledge live today?" is the router: knowledge in a head is got out by
// talking; knowledge in AI chats is got out by importing them.
//
// TWO RULES, both his, both load-bearing:
//
//   1. NEVER CORNER THEM. A filter picks what goes ON TOP, never what exists.
//      Every other Approach stays on the same screen, one section below. The
//      Expert who knows better than our guess is never blocked by it.
//   2. COMING SOON RIDES ALONG. If an unbuilt Approach is the best fit for
//      what they just told us, it belongs in the top row saying "Coming soon"
//      — we are not in production, and seeing it wanted is what gets it built.
//
// Knowledge is MULTI-SELECT (expertise rarely lives in one place), so the
// relevant set is the union over their answers, in registry order.

/** The `knowledge` answers, verbatim — these strings are persisted on
 *  `platform.rulebook.metadata.intake.knowledge` and read by the Scout. */
export const KNOWLEDGE_OPTIONS = [
  "In my head",
  "Split across people",
  "Written down (docs, SOPs, past work)",
  "In my AI chats",
  "In my meetings and calls",
  "In my email and messages",
  "Someone else's material (a book, a course)",
  "Nothing yet — just an idea",
] as const;

export type KnowledgeAnswer = (typeof KNOWLEDGE_OPTIONS)[number];

/**
 * Where knowledge lives -> the Approach keys that get it out of there.
 * Order within a list is preference: the first is the strongest fit.
 * Keys are `platform.approach.key` — a key that is not in the registry is
 * simply skipped, so this map can name a lane before its row exists.
 */
const RELEVANCE: Record<KnowledgeAnswer, string[]> = {
  "In my head": [
    "interview",
    "monologue",
    "bad_example_probe",
    "triad_game",
    "red_pen",
    "prediction_ledger",
  ],
  "Split across people": [
    "meeting_scavenger",
    "oracle_tap",
    "interview",
    "dump",
  ],
  "Written down (docs, SOPs, past work)": [
    "source",
    "file",
    "dump",
    "exemplar",
    "body_of_work",
  ],
  "In my AI chats": ["chat_import", "matrx_conversations"],
  "In my meetings and calls": ["meeting_scavenger", "file", "monologue"],
  "In my email and messages": ["shadow_inbox", "oracle_tap"],
  "Someone else's material (a book, a course)": [
    "source",
    "file",
    "body_of_work",
  ],
  "Nothing yet — just an idea": ["vision_interview", "interview"],
};

/** Below this, a "best for you" row reads as a thin guess rather than help —
 *  so we top it up from the universal lanes instead of showing three cards. */
const MIN_TOP_ROW = 4;

/** Above this the "best for you" row stops reading as a shortlist and starts
 *  reading as the whole catalog again — the rest still render one section
 *  below, so nothing is hidden, only de-emphasised. */
const MAX_TOP_ROW = 6;

/** Lanes that fit almost any Expert; used only to top up a thin top row. */
const UNIVERSAL = ["interview", "dump", "file", "source"];

/**
 * The Approach keys to show FIRST, given what the Expert told us.
 * Never a whitelist — the caller renders everything else below.
 */
export function relevantApproachKeys(knowledge: readonly string[]): string[] {
  const ranked: string[] = [];
  const push = (key: string) => {
    if (!ranked.includes(key)) ranked.push(key);
  };
  // Round-robin across their answers so a second answer is not buried under
  // the whole of the first.
  const lists = knowledge
    .map((k) => RELEVANCE[k as KnowledgeAnswer])
    .filter((l): l is string[] => Array.isArray(l));
  const depth = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < depth; i += 1) {
    for (const list of lists) if (list[i]) push(list[i]);
  }
  for (const key of UNIVERSAL) {
    if (ranked.length >= MIN_TOP_ROW) break;
    push(key);
  }
  return ranked.slice(0, MAX_TOP_ROW);
}
