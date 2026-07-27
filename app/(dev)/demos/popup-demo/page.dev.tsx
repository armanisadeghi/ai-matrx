import { createRouteMetadata } from "@/utils/route-metadata";
import PopupDemoClient from "./_client";

export const metadata = createRouteMetadata("/demos/popup-demo", {
  title: "Popup Window Demo",
  description:
    "Interactive demo: open a small chrome-less popup window and sync state with the opener via BroadcastChannel.",
});

export default function PopupDemoPage() {
  return (
    <div className="p-8 max-w-4xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Popup Window Demo</h1>
        <p className="text-muted-foreground">
          Demonstrates <code>window.open</code> with a minimal chrome-less popup
          window, two-way state sync via <code>BroadcastChannel</code>, popup
          blocker behavior, and mobile fallback detection.
        </p>
      </header>

      <PopupDemoClient />

      <section className="space-y-3 text-sm text-muted-foreground border-t border-border pt-6">
        <h2 className="text-base font-semibold text-foreground">
          How this works
        </h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Open popup</strong> calls{" "}
            <code>
              window.open(url, name, &quot;popup=yes,width=480,height=640&quot;)
            </code>{" "}
            synchronously inside the click handler — popup blockers allow it.
          </li>
          <li>
            <strong>Delayed open</strong> waits 1.5s via <code>setTimeout</code>{" "}
            before calling <code>window.open</code> — most browsers block this
            because it isn&apos;t tied to the user gesture.
          </li>
          <li>
            <strong>State sync</strong> uses a{" "}
            <code>BroadcastChannel(&quot;popup-demo&quot;)</code> — any window
            on the same origin can post and receive messages. Same pattern works
            as a Redux middleware: intercept dispatches, rebroadcast, replay on
            the other side.
          </li>
          <li>
            <strong>Mobile:</strong> iOS Safari and Android Chrome ignore size
            hints and open a new tab instead. The demo detects touch-primary
            devices and shows a note.
          </li>
          <li>
            <strong>Same-origin only:</strong> the popup loads a Next.js route
            on your domain (<code>/popup-window</code>). Cross-origin popups
            cannot share <code>BroadcastChannel</code>.
          </li>
        </ul>
      </section>
    </div>
  );
}
