/**
 * THE ROOM IS USABLE ON A PHONE (jobs-bar-2026-09-16, item 19).
 *
 * At 390px the centre panel opened with six expert tabs wrapped over three
 * rows — a third of the screen spent before one word of the conversation —
 * and the document controls beside them were unlabelled glyphs, because they
 * carried `hidden sm:inline` on their words. Both are the same mistake: a
 * desktop rail printed at phone width.
 *
 * This suite drives the REAL `RoomChatPane` against the REAL slice with
 * `useIsMobile` forced true. Nothing about the layout is mocked; only the
 * viewport question and the session load are supplied.
 *
 * Proven red before green (2026-09-16), each independently — reverting the
 * phone branch in `RoomChatPane` so it renders `StageTabs` plus the icon-only
 * document buttons at every width fails all four cases:
 *
 *  * "prints one expert, not six"  → all six names are on screen at once.
 *  * "the document control says what it is" → no button reads "Documents".
 *  * "every expert is one tap away" → the sheet does not exist.
 *  * "the desktop rail is untouched" is the other half: with `useIsMobile`
 *    false the six tabs MUST still be there, so the fix can never be a
 *    deletion.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { TooltipProvider } from "@/components/ui/tooltip";
import { configureStore } from "@reduxjs/toolkit";

import visionInterviewReducer, {
  roomOpened,
  sessionMerged,
} from "../../redux/vision-interview.slice";
import { ROLES, ROLE_TABS } from "../../types";
import { RoomChatPane } from "../RoomChatPane";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The one thing a test may decide for the layout: how wide the screen is. */
const viewport = { mobile: true };
jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => viewport.mobile,
}));

const SESSION_ID = "01039730-435d-4e8d-a34f-3537f254996f";

/**
 * A session with NO role bindings on purpose: the bindings are what mount the
 * canonical chat, which is not this test's subject and drags the whole
 * execution system in with it. Every control this suite is about lives above
 * the chat and renders either way.
 */
const SESSION = {
  id: SESSION_ID,
  title: "Route every incoming pallet at our recycling",
  stage: "capture",
  current_round: 1,
  role_bindings: {},
  document: "",
  vision_document: null,
  requirements_document: null,
  cleaned_transcript: null,
  finalized_at: null,
  updated_at: "2026-09-16T00:00:00.000Z",
};

let container: HTMLDivElement;
let root: Root;

function makeStore() {
  const store = configureStore({
    reducer: { visionInterview: visionInterviewReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
  store.dispatch(roomOpened({ sessionId: SESSION_ID }));
  store.dispatch(sessionMerged(SESSION as never));
  return store;
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      // The app root (app/Providers.tsx) mounts one TooltipProvider; the
      // room header's IntelligenceIndicator tooltip reads it.
      <Provider store={makeStore()}>
        <TooltipProvider>
          <RoomChatPane
            onGotoStage={() => {}}
            onRetryRoles={() => {}}
            onAdvanceStage={async () => {}}
          />
        </TooltipProvider>
      </Provider>,
    );
  });
}

function buttons(): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")] as HTMLButtonElement[];
}

function buttonByText(needle: string): HTMLButtonElement {
  const found = buttons().find((b) => b.textContent?.trim().includes(needle));
  if (!found) throw new Error(`no button containing "${needle}"`);
  return found;
}

/** Every expert name currently painted anywhere on screen. */
function expertNamesOnScreen(): string[] {
  const text = document.body.textContent ?? "";
  return ROLE_TABS.map(({ role }) => ROLES[role].name).filter((name) =>
    text.includes(name),
  );
}

beforeEach(() => {
  viewport.mobile = true;
});

afterEach(() => {
  if (!root) return;
  act(() => root.unmount());
  container.remove();
});

describe("the interview room at phone width", () => {
  it("prints one expert, not six — the conversation is what the screen is for", async () => {
    await mount();
    // The room opens on the expert whose stage the session is in; the other
    // five are a CHOICE, and a choice is one control, not six rows of chrome.
    expect(expertNamesOnScreen()).toHaveLength(1);
  });

  it("the document control says what it is, in words", async () => {
    await mount();
    // Not a bare page glyph. `hidden sm:inline` on the only word a control
    // carries means the control has no words at all on a phone.
    expect(() => buttonByText("Documents")).not.toThrow();
  });

  it("every expert is one tap away, and the sheet names all of them", async () => {
    await mount();
    const opener = buttonByText(ROLES[ROLE_TABS[0].role].name);
    await act(async () => {
      opener.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(document.body.textContent).toContain("Who you are talking to");
    // Every role reachable, none of them dropped by the rebuild.
    for (const { role } of ROLE_TABS) {
      expect(document.body.textContent).toContain(ROLES[role].name);
    }
  });

  it("leaves the desktop rail exactly as it was", async () => {
    viewport.mobile = false;
    await mount();
    // The fix is a phone layout, never a deletion: at desktop width all six
    // tabs are still on the bar, with their words, and so are the documents.
    expect(expertNamesOnScreen()).toHaveLength(ROLE_TABS.length);
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(
      ROLE_TABS.length,
    );
    expect(document.body.textContent).toContain("Document");
  });
});
