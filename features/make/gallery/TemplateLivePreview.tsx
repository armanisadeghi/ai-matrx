"use client";

// features/make/gallery/TemplateLivePreview.tsx — lanes CHAIR-GALLERY-2 / -3 (Unified Data System v7), 2026-10-05.
//
// THE TEMPLATE, ON THE REAL SCREENS. Arman: people must SEE exactly what they will get. Once the page is
// in the browser this mounts @ai-matrx/records-ui's TemplatePreview over the template installed into
// memory (@ai-matrx/records/memory): the canonical table page (grid, board, calendar, timeline, gallery,
// list; a click opens the record page), the forms on the real FormRunner, the booking pages on this
// app's own booking page (BookingPicker, the page a stranger's link opens) and the dashboards on the
// real canvas. Read-only: nothing is read from or written to any store; a send is refused in a sentence.
//
// Until then the server HTML passed as `children` stays on screen — it is what a crawler reads and what
// first paint shows — and it is swapped for the live screens only once their code has loaded, in a box
// that keeps its height, so nothing jumps.

import { useEffect, useState, type ComponentType, type ReactNode } from "react";

import type { TemplateSpec } from "@ai-matrx/records/templates";
import type { TemplatePreviewProps } from "@ai-matrx/records-ui";

import { BookingPicker } from "@/app/(link)/b/[bookingId]/BookingPicker";
import type { PublicBooking } from "@/features/booking/service";

export function TemplateLivePreview({ spec, today, children }: { spec: TemplateSpec; today: string; children: ReactNode }) {
  const [Live, setLive] = useState<{ Preview: ComponentType<TemplatePreviewProps>; refusal: string } | null>(null);
  useEffect(() => {
    let gone = false;
    void Promise.all([import("@ai-matrx/records-ui"), import("@ai-matrx/records/memory")]).then(([ui, memory]) => {
      if (!gone) setLive({ Preview: ui.TemplatePreview, refusal: memory.PREVIEW_REFUSAL.message });
    });
    return () => {
      gone = true;
    };
  }, []);
  return (
    <div className="min-h-[36rem] min-w-0" data-template-live={Live ? "on" : "off"}>
      {Live ? (
        <Live.Preview
          spec={spec}
          today={today}
          className="gap-6"
          booking={(page) => <BookingPicker page={page as unknown as PublicBooking} preview={Live.refusal} />}
        />
      ) : (
        children
      )}
    </div>
  );
}
