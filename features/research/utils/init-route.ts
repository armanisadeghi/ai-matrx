import { safeRelativePath } from "@/utils/auth/safe-redirect";

export interface ResearchInitHrefInput {
  subject: string;
  instructions?: string | null;
  returnTo?: string | null;
}

/**
 * Open the canonical AI-assisted research intake at its human review flow.
 * The intake generates a proposed topic and keywords; it never starts the
 * paid pipeline until the user approves that proposal.
 */
export function researchInitHref(input: ResearchInitHrefInput): string {
  const params = new URLSearchParams({
    mode: "ai",
    topic: input.subject.trim(),
  });
  if (input.instructions?.trim()) {
    params.set("instructions", input.instructions.trim());
  }
  const returnTo = safeRelativePath(input.returnTo, "");
  if (returnTo) params.set("return_to", returnTo);
  return `/research/topics/new?${params.toString()}`;
}

/**
 * After the user approves and starts research, return to the originating
 * surface with the newly-created topic identity. Unsafe destinations fall
 * back to the topic itself.
 */
export function researchStartDestination(
  returnTo: string | null | undefined,
  topicId: string,
): string {
  const fallback = `/research/topics/${encodeURIComponent(topicId)}`;
  const safe = safeRelativePath(returnTo, "");
  if (!safe) return fallback;

  const destination = new URL(safe, "https://aimatrx.local");
  destination.searchParams.set("researchTopic", topicId);
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
