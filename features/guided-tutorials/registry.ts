/**
 * Guided tutorials — THE registry.
 *
 * A guided tutorial walks one person through a page: it dims the page, cuts out
 * one element at a time, and waits for the person to do the thing. Definitions
 * live HERE, in code, not in the database: every step points at a
 * `data-tour="…"` attribute that only exists once code puts it on the page, so a
 * tutorial and its targets ship together. An admin sends any tutorial in this
 * list from Users & Access without writing code (features/guided-tutorials/admin).
 *
 * Text slots are layout (≤60 chars each) — `__tests__/registry.test.ts` holds it.
 */

/** What the person does to finish a step. Absent = they press Next. */
export type TutorialStepAction = "click" | "copy";

export interface TutorialStep {
  /** The `data-tour` value of the element this step points at. */
  target: string;
  /** Step heading, ≤60 chars. */
  title: string;
  /** One line under the heading, ≤60 chars. */
  text: string;
  /**
   * `click` — any press inside the target advances. `copy` — a press on a copy
   * control inside the target advances. Absent — the person presses Next.
   */
  action?: TutorialStepAction;
}

export interface GuidedTutorial {
  /** Stable id; it travels in DMs, emails and the `?tutorial=` link. */
  id: string;
  /** ≤60 chars — the DM card title and the admin picker label. */
  title: string;
  /** ≤60 chars — the DM card's second line. */
  summary: string;
  /** In-app route the tutorial runs on. */
  route: string;
  steps: readonly TutorialStep[];
}

export const GUIDED_TUTORIALS: readonly GuidedTutorial[] = [
  {
    id: "connect-your-ai",
    title: "Connect your AI",
    summary: "Use AI Matrx from Claude, ChatGPT or Cursor",
    route: "/bring-your-work",
    steps: [
      {
        target: "byw-pick-ai",
        title: "Pick your AI",
        text: "Choose the app you already use",
        action: "click",
      },
      {
        target: "byw-connect",
        title: "Connect AI Matrx",
        text: "One click, then sign in to AI Matrx",
        action: "click",
      },
      {
        target: "byw-get-key",
        title: "Try it",
        text: "Copy the hello and paste it into your AI",
        action: "copy",
      },
      {
        target: "byw-move-work",
        title: "What do you want to do?",
        text: "Copy one and paste it into your AI",
        action: "copy",
      },
    ],
  },
];

export function findTutorial(id: string | null | undefined): GuidedTutorial | null {
  if (!id) return null;
  return GUIDED_TUTORIALS.find((t) => t.id === id) ?? null;
}

/** The query key that starts a tutorial on its route. */
export const TUTORIAL_QUERY_KEY = "tutorial";

/** In-app link that opens the route and starts the tutorial. */
export function tutorialHref(tutorial: GuidedTutorial): string {
  const sep = tutorial.route.includes("?") ? "&" : "?";
  return `${tutorial.route}${sep}${TUTORIAL_QUERY_KEY}=${encodeURIComponent(tutorial.id)}`;
}
