/**
 * topicFromIdea — flatten a chosen `topic_idea` value into the topic textarea
 * text. Pure module (no component imports) so TopicIdeaHelper and the parser
 * tests share the ONE implementation.
 *
 * 🚨 FOUND_DEFECTS D151 — this used to keep `title` and `hook` and silently
 * drop EVERY other field the generator wrote (angle, audience, why-now, the
 * suggested segments…). The user picked an idea and got a third of it. Now the
 * whole idea comes across: title and hook lead, and every other field the
 * agent emitted follows as a labeled line.
 */

/** Fields we never echo into the topic box — plumbing, not the idea. */
const IDEA_META_FIELDS = new Set(["__kind", "id", "index", "selected"]);

/** Turn a field name into a human label ("why_now" → "Why now"). */
function labelFor(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function topicFromIdea(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const o = value as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const hook = typeof o.hook === "string" ? o.hook.trim() : "";

  const rest: string[] = [];
  for (const [key, raw] of Object.entries(o)) {
    if (key === "title" || key === "hook" || IDEA_META_FIELDS.has(key)) continue;
    const text =
      typeof raw === "string"
        ? raw.trim()
        : Array.isArray(raw)
          ? raw.filter((x) => typeof x === "string").join("; ")
          : typeof raw === "number" || typeof raw === "boolean"
            ? String(raw)
            : "";
    if (text) rest.push(`${labelFor(key)}: ${text}`);
  }

  return [title, hook, rest.join("\n")].filter(Boolean).join("\n\n");
}
