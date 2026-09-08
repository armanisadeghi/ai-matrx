"use client";

// features/messaging/lib/messagingAiDemand.tsx
//
// WHO IS ACTUALLY ASKING FOR THE CONVERSATION INTELLIGENCES.
//
// 🚨 THE DEFECT THIS CLOSES (production walk, 2026-09-08). `<MessagingHost>` is
// mounted app-wide and correctly so — the header's unread badge, the messages
// window panel and every "Message" button need the engine on every route. But
// it also resolved the FOUR `messaging.*` mandates on mount, which meant every
// page load of the entire app asked the server who fulfils four AI jobs for a
// conversation pane that was not on screen. On /mandates, on /dashboard,
// everywhere. Four requests, four refusals, four captured errors, per load, for
// a person who had not opened a single message.
//
// A PAGE MUST NOT RESOLVE WHAT IT DOES NOT RUN. Resolution is a question about
// a specific affordance ("who runs Catch me up?"); asking it where that
// affordance cannot appear is not a performance problem, it is a category
// error — and it is what turned an honest, correct refusal into background
// noise that a reader learns to ignore.
//
// So the demand is REF-COUNTED by the surfaces that actually render the AI bar.
// `<ConversationPane>` is the one component in this app that renders the
// package's `<ConversationView>` — every conversation surface (the /messages
// route, the floating window, the single-message window, the side sheet, the
// agent-review workspace) goes through it — so it is the one place that has to
// declare the demand, and MessagingHost resolves nothing until it does.
//
// The count, not a latch: it drops back to zero when the last pane unmounts, so
// a mandate cache invalidation cannot re-resolve four keys for a surface that
// closed ten minutes ago.

import { createContext, useContext, useEffect, useRef, useState } from "react";

/** Acquire one unit of demand; the returned function releases it. */
type AcquireMessagingAi = () => () => void;

const MessagingAiDemandContext = createContext<AcquireMessagingAi | null>(null);

export interface MessagingAiDemand {
  /** True while at least one conversation surface is mounted. */
  demanded: boolean;
  /** Pass to `<MessagingAiDemandProvider>`; never call this yourself. */
  acquire: AcquireMessagingAi;
}

/**
 * The counter itself, for `<MessagingHost>` to own. Split from the provider so
 * the host can BOTH read `demanded` and publish `acquire` without a second
 * component in between.
 */
export function useMessagingAiDemandCounter(): MessagingAiDemand {
  const [count, setCount] = useState(0);
  const acquireRef = useRef<AcquireMessagingAi | null>(null);
  if (acquireRef.current === null) {
    acquireRef.current = () => {
      setCount((n) => n + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        setCount((n) => Math.max(0, n - 1));
      };
    };
  }
  return { demanded: count > 0, acquire: acquireRef.current };
}

export function MessagingAiDemandProvider({
  acquire,
  children,
}: {
  acquire: AcquireMessagingAi;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <MessagingAiDemandContext.Provider value={acquire}>
      {children}
    </MessagingAiDemandContext.Provider>
  );
}

/**
 * DECLARE that this surface renders the conversation AI bar, so the four
 * `messaging.*` mandates are resolved. Call it from any component that renders
 * `<ConversationView>`; calling it twice is harmless (the count is a count).
 *
 * 🚨 NOT SILENT WHEN UNWIRED. A conversation pane rendered outside
 * `<MessagingHost>` would otherwise show no AI chips and say nothing about why
 * — the precise "dead affordance" the laws forbid. There is no provider to
 * acquire from in that case, so it screams once, naming the remedy, rather than
 * quietly rendering a pane with its intelligence removed.
 */
export function useMessagingAiDemand(): void {
  const acquire = useContext(MessagingAiDemandContext);
  const screamed = useRef(false);
  useEffect(() => {
    if (acquire === null) {
      if (screamed.current) return;
      screamed.current = true;
      console.error(
        "[messaging] a conversation pane is rendering OUTSIDE <MessagingHost>, " +
          "so its four AI intelligences (Catch me up, Summarize, Action items, " +
          "Draft a reply) will not resolve and their chips will be absent with " +
          "no explanation on screen. Mount this surface under the app-wide " +
          "<MessagingHost> in app/Providers.tsx.",
      );
      return;
    }
    return acquire();
  }, [acquire]);
}
