import { renderToStaticMarkup } from "react-dom/server";

import { HrDeliveryState } from "@/features/hr/tasks/components/HrDeliveryState";
import type { HrInboxNotice } from "@/features/hr/tasks/types";

const notices: HrInboxNotice[] = [
    { channel: "email", status: "succeeded", sent_at: "2026-09-12T00:00:00Z", delivered_at: "2026-09-12T00:01:00Z", read_at: null, failure_reason: null, body: "First message" },
    { channel: "email", status: "succeeded", sent_at: "2026-09-12T00:02:00Z", delivered_at: "2026-09-12T00:03:00Z", read_at: null, failure_reason: null, body: "First message" },
    { channel: "sms", status: "succeeded", sent_at: null, delivered_at: "2026-09-12T00:04:00Z", read_at: null, failure_reason: null, body: "Second message" },
    { channel: "in_app", status: "pending", sent_at: null, delivered_at: null, read_at: null, failure_reason: null, body: "Third message" },
    { channel: "push", status: "dead_letter", sent_at: null, delivered_at: null, read_at: null, failure_reason: "not sent — nobody was notified", body: "Fourth message" },
];

const markers = (html: string, marker: string) => (html.match(new RegExp(marker, "g")) ?? []).length;

describe("HrDeliveryState compact budget", () => {
    it("bounds compact output while full detail remains complete", () => {
        const compact = renderToStaticMarkup(<HrDeliveryState notices={notices} showBody={false} />);
        const full = renderToStaticMarkup(<HrDeliveryState notices={notices} showBody />);

        expect(markers(compact, 'data-testid="hr-delivery-chip"')).toBeLessThanOrEqual(3);
        expect(compact).toContain("+1 more");
        expect(compact).toContain("×2");
        expect(markers(compact, 'data-testid="hr-delivery-body"')).toBe(0);
        expect(compact).not.toContain("First message");
        expect(markers(full, 'data-testid="hr-delivery-chip"')).toBe(notices.length);
        expect(markers(full, 'data-testid="hr-delivery-body"')).toBe(4);
        expect(full).toContain("First message");
        expect(full).toContain("Fourth message");

        // The old `notices.map` + bodies path grew with every notice/body; this fixture is the
        // forcing contrast: five notice rows and four bodies exceed the compact constant budget.
        expect(notices.length + new Set(notices.map((notice) => notice.body)).size).toBeGreaterThan(3);
    });
});
