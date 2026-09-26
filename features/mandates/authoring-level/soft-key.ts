// features/mandates/authoring-level/soft-key.ts
//
// THE KEY IS MADE FOR YOU (review 2026-09-25). A soft mandate is found by its
// name; nobody's code calls it, so the key is built from the name and stays
// editable under Advanced. Pure — exported for tests.
//
// 🚨 THE NAMESPACE IS THE SEAT, NEVER `custom.` (2026-09-26). The first made key
// was `custom.<words>`, and aidream's `validate_mandate_identity`
// (aidream/services/mandates/service.py) refuses `custom` as a generic
// namespace — so EVERY personal and organization create failed with "namespace
// 'custom' is generic". The server rule is right: the first segment must say
// whose job this is. So:
//   · a personal mandate → `personal.<words>`
//   · an organization's  → `organization.<words>`
// Both are accepted by the server (aidream test
// `test_soft_mandate_seat_namespaces_are_accepted` pins it). The namespace is
// also what the lists show as the mandate's Feature ("Personal", "Organization"),
// which is why it is not the organization's name (a first cut made
// `org_<name>.` and the Feature column read "Org Alex Hart S Workspace"). Keys
// are global, so two organizations' "Weekly recap" meet: the create page tries
// the next number on a 409, and the key is never shown unless asked for.
//
// The server also refuses a job segment that ENDS in a Holder word ("Research
// assistant" → `research_assistant`), so a made key drops such trailing words.

/** The server's Holder words (`_FORBIDDEN_HOLDER_JOB_WORDS`). */
const HOLDER_WORDS = new Set([
  "agent",
  "assistant",
  "bot",
  "model",
  "worker",
  "runner",
  "handler",
  "processor",
  "manager",
  "service",
  "task",
  "job",
  "helper",
]);

/** Lowercase snake_case words of a phrase; "internal" is dropped (the server refuses it anywhere). */
function snakeWords(phrase: string): string[] {
  return phrase
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && word !== "internal");
}

function capped(words: string[], max: number): string {
  let out = "";
  for (const word of words) {
    const next = out ? `${out}_${word}` : word;
    if (next.length > max) break;
    out = next;
  }
  return out || (words[0] ?? "").slice(0, max);
}

/** Whose job this is — the key's first segment. */
export function softMandateNamespace(level: "user" | "organization"): string {
  return level === "organization" ? "organization" : "personal";
}

export function keyFromName(name: string, attempt = 1, namespace = "personal"): string {
  const words = snakeWords(name);
  while (words.length > 0 && HOLDER_WORDS.has(words[words.length - 1])) words.pop();
  const body0 = capped(words, 60);
  if (!body0) return "";
  const body = /^[a-z]/.test(body0) ? body0 : `mandate_${body0}`;
  return attempt > 1 ? `${namespace}.${body}_${attempt}` : `${namespace}.${body}`;
}
