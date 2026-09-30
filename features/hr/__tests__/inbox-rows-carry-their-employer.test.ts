import { parseEnvelope, parseInbox } from "@/features/hr/tasks/envelope";
import { isRefusal } from "@/features/hr/tasks/types";

const ORG = "2643e470-b275-47f3-95f3-ae275ad3ca47";

const page = (total: number) => ({ offset: 0, limit: 50, total });

function inboxPayload(row: Record<string, unknown>) {
    return {
        granted: true,
        scope: "mine",
        needs_my_decision: [row],
        scope_rows: [],
        auto_applying_soon: [],
        waiting_on_others: [],
        failures_assigned_to_me: [],
        recently_decided: [],
        pagination: {
            needs_my_decision: page(1),
            scope_rows: page(0),
            auto_applying_soon: page(0),
            waiting_on_others: page(0),
            failures_assigned_to_me: page(0),
            recently_decided: page(0),
        },
        bulk_max: 25,
        default_sort: "due",
        can_view_queue: false,
        employment_ids: [],
        as_of: "2026-09-30T00:00:00Z",
    };
}

const baseRow = {
    step_id: "s1",
    instance_id: "i1",
    flow_key: "leave_request",
    step_key: "manager_approval",
    priority: "normal",
    urgent: false,
    sensitivity_tier: "standard",
    deep_link: "/hr/tasks/i1",
};

describe("HR inbox rows carry their employer", () => {
    it("keeps the organization_id the door sends", () => {
        const env = parseEnvelope("hr_wf_inbox", inboxPayload({ ...baseRow, organization_id: ORG }), parseInbox);
        if (isRefusal(env)) throw new Error("refused");
        expect(env.data.needs_my_decision[0].organization_id).toBe(ORG);
    });

    it("keeps an absent organization_id as null, never a guessed employer", () => {
        const env = parseEnvelope("hr_wf_inbox", inboxPayload(baseRow), parseInbox);
        if (isRefusal(env)) throw new Error("refused");
        expect(env.data.needs_my_decision[0].organization_id).toBeNull();
    });
});
