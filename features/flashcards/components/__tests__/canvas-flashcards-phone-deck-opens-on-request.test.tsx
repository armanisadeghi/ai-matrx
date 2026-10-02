/**
 * Guard: inside a canvas pane on a phone, the flashcards view renders INLINE.
 * The full-screen phone deck (`fixed inset-0`) opens only when the person
 * asks for it — it used to open on every mount, covering the canvas and
 * swallowing taps, and re-opened on every remount.
 *
 * Proven failing before passing: with the old `isMobile && !mobileDismissed`
 * condition the deck rendered on mount → RED.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@ai-matrx/kit/media-query", () => ({ useIsMobile: () => true }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock("@/features/canvas/hooks/useCanvasItem", () => ({
  useCanvasItem: () => ({
    row: { external_system: "fc_set", external_id: "set-1", source_message_id: null },
    loading: false,
  }),
}));
jest.mock("@/features/canvas/components/CanvasArtifactDebugPanel", () => ({
  InlineArtifactDebugStrip: () => null,
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/components/mardown-display/blocks/flashcards/FlashcardMobileView", () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="phone-deck">
      <button type="button" onClick={onClose}>
        Close deck
      </button>
    </div>
  ),
}));
jest.mock("@/components/mardown-display/blocks/flashcards/FlashcardItem", () => ({
  __esModule: true,
  default: ({ front }: { front: string }) => <div data-testid="inline-card">{front}</div>,
}));
jest.mock("../study/MatchingCardPlayer", () => ({ MatchingCardPlayer: () => null }));
jest.mock("../study/cardImages", () => ({ getCardImages: () => ({ front: null, back: null }) }));
jest.mock("../../data/useFlashcardStudy", () => ({
  useFlashcardStudy: () => ({
    set: { id: "set-1" },
    cards: [{ id: "c1", front: "Q1", back: "A1", card_kind: "basic" }],
    loading: false,
    error: null,
    currentIndex: 0,
    isFlipped: false,
    resultsByCard: {},
    next: jest.fn(),
    prev: jest.fn(),
    goTo: jest.fn(),
    flip: jest.fn(),
    grade: jest.fn(),
    grading: false,
    progress: { done: 0, total: 1, correct: 0 },
  }),
}));

import { CanvasFlashcardsView } from "../CanvasFlashcardsView";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const ARTIFACT_ID = "11111111-2222-4333-8444-555555555555";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
}

it("renders inline on a phone and opens the full-screen deck only on request", () => {
  act(() => root.render(<CanvasFlashcardsView artifactId={ARTIFACT_ID} />));

  expect(container.querySelector('[data-testid="phone-deck"]')).toBeNull();
  expect(container.querySelector('[data-testid="inline-card"]')?.textContent).toBe("Q1");

  act(() => buttonByText("Full screen")?.click());
  expect(container.querySelector('[data-testid="phone-deck"]')).not.toBeNull();

  act(() => buttonByText("Close deck")?.click());
  expect(container.querySelector('[data-testid="phone-deck"]')).toBeNull();
});

it("a remount does not re-open the deck", () => {
  act(() => root.render(<CanvasFlashcardsView key="a" artifactId={ARTIFACT_ID} />));
  act(() => root.render(<CanvasFlashcardsView key="b" artifactId={ARTIFACT_ID} />));
  expect(container.querySelector('[data-testid="phone-deck"]')).toBeNull();
});
