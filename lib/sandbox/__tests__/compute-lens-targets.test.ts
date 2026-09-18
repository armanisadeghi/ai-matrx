/**
 * The compute lens offers OTHER boxes; it never re-renders (or hides) the one
 * this chat is bound to — that one is rendered from the conversation's record
 * so it is named on first paint and stays named while it is asleep.
 */

import { pickComputeLensTargets } from "@/features/agents/components/inputs/smart-input/use-compute-target-actions";
import type { ComputeTarget } from "@/app/api/compute-targets/route";

const target = (over: Partial<ComputeTarget>): ComputeTarget =>
  ({
    id: "id",
    kind: "ec2",
    name: "box",
    status: "running",
    is_online: true,
    is_this_device: false,
    sandbox_id: null,
    tier: "ec2",
    template: null,
    expires_at: null,
    instance_id: null,
    tunnel_url: null,
    platform: null,
    last_seen: null,
    ...over,
  }) as ComputeTarget;

const BOUND = "bound-row";

describe("pickComputeLensTargets", () => {
  const targets = [
    target({ id: BOUND, name: "This chat's box" }),
    target({ id: "pc", kind: "local-pc", name: "Arman's Mac" }),
    target({ id: "other", name: "Spare box" }),
    target({ id: "asleep", name: "Sleeping box", is_online: false }),
  ];

  it("never offers the bound box as something to connect", () => {
    const { visible } = pickComputeLensTargets(targets, BOUND, 1);
    expect(visible.map((t) => t.id)).not.toContain(BOUND);
  });

  it("counts the bound box in the total even when it is not offered", () => {
    const { totalCount } = pickComputeLensTargets(targets, BOUND, 1);
    // Two other AVAILABLE boxes (the sleeping one is not bindable) + the bound one.
    expect(totalCount).toBe(3);
  });

  it("prefers a local PC among the others, and reports the overflow", () => {
    const { visible, overflowCount } = pickComputeLensTargets(targets, BOUND, 1);
    expect(visible.map((t) => t.id)).toEqual(["pc"]);
    expect(overflowCount).toBe(1);
  });

  it("offers everything when nothing is bound", () => {
    const { visible, totalCount } = pickComputeLensTargets(targets, null, 2);
    // Local PC first, then sandboxes by name ("Spare box" < "This chat's box").
    expect(visible.map((t) => t.id)).toEqual(["pc", "other"]);
    expect(totalCount).toBe(3);
  });
});
