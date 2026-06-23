/**
 * Guarantees a display name is unique among the current user's `udt_datasets`.
 * Convert-to-table and other one-click create paths must never fail on duplicates.
 */

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";

const MAX_NAME_LENGTH = 120;

/** Trim and cap length; preserve readable punctuation. */
export function normalizeDatasetDisplayName(name: string): string {
  return name
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

async function isDatasetNameTaken(
  userId: string,
  name: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("udt_datasets")
    .select("id")
    .eq("user_id", userId)
    .eq("table_name", name)
    .maybeSingle();
  return !!data;
}

function ordinalVariant(base: string, n: number): string {
  if (n === 2) return `${base} · 2nd`;
  if (n === 3) return `${base} · 3rd`;
  return `${base} · ${n}th`;
}

function formatMonthDay(d = new Date()): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Last-resort suffix — compact but still human-readable. */
function formatCompactTimestamp(d = new Date()): string {
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${month} ${day}, ${hh}:${mm}`;
}

function* nameCandidates(base: string): Generator<string> {
  yield base;
  for (let n = 2; n <= 9; n++) {
    yield ordinalVariant(base, n);
  }
  const dateLabel = formatMonthDay();
  yield `${base} (${dateLabel})`;
  for (let n = 2; n <= 4; n++) {
    yield `${base} (${dateLabel} · ${n})`;
  }
  yield `${base} (${formatCompactTimestamp()})`;
}

/**
 * Pick the first variant of `preferredName` not already used by this user.
 * Never throws — always returns a non-empty string.
 */
export async function resolveUniqueDatasetName(
  preferredName: string,
): Promise<string> {
  const userId = requireUserId();
  const base = normalizeDatasetDisplayName(preferredName) || "Table from chat";

  for (const candidate of nameCandidates(base)) {
    const normalized = normalizeDatasetDisplayName(candidate);
    if (!(await isDatasetNameTaken(userId, normalized))) {
      return normalized;
    }
  }

  // Absolute fallback — timestamp + random tail so parallel clicks can't collide.
  const tail = Math.random().toString(36).slice(2, 6);
  return normalizeDatasetDisplayName(
    `${base} (${formatCompactTimestamp()} · ${tail})`,
  );
}
