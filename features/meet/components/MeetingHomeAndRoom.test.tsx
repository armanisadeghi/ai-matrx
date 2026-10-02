import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MeetingRecord } from "@ai-matrx/meet/react";
import { MeetingHomeAndRoom } from "./MeetingHomeAndRoom";

// The home and the room are the real components' seams: the home hands its
// Join press to `onJoin`; the room reports Leave through `onLeave`.
const homeMounts = jest.fn();
jest.mock("@/features/meet/components/manage/MeetingDetail", () => ({
  MeetingDetail: ({
    meetingId,
    onJoin,
  }: {
    meetingId: string;
    onJoin?: (m: MeetingRecord) => void;
  }) => {
    React.useEffect(() => {
      homeMounts(meetingId);
    }, [meetingId]);
    return (
      <button
        type="button"
        data-testid="join"
        onClick={() => onJoin?.({ id: meetingId, slug: "abc-defg-hjk" } as unknown as MeetingRecord)}
      >
        Join
      </button>
    );
  },
}));
jest.mock("@/features/meet/components/MeetingSurface", () => ({
  MeetingSurface: ({
    slug,
    chrome,
    onLeave,
  }: {
    slug: string;
    chrome?: string;
    onLeave?: () => void;
  }) => (
    <button type="button" data-testid="room" data-slug={slug} data-chrome={chrome} onClick={onLeave}>
      Leave
    </button>
  ),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function render(onRoomChange: (inRoom: boolean) => void) {
  const container = document.createElement("div");
  document.body.append(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<MeetingHomeAndRoom meetingId="m-1" onRoomChange={onRoomChange} />);
  });
  const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;
  return {
    q,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("MeetingHomeAndRoom", () => {
  beforeEach(() => homeMounts.mockClear());

  it("Join opens the live room in the same box; Leave returns to the meeting's home", () => {
    const changes: boolean[] = [];
    const view = render((inRoom) => changes.push(inRoom));

    // Home first, no room.
    expect(view.q('[data-testid="room"]')).toBeNull();
    expect(view.q("[data-meeting-home]")?.classList.contains("hidden")).toBe(false);

    act(() => view.q('[data-testid="join"]')!.click());
    // The room is the canonical stage, embedded, for this meeting's slug.
    const room = view.q('[data-testid="room"]');
    expect(room).not.toBeNull();
    expect(room!.dataset.slug).toBe("abc-defg-hjk");
    expect(room!.dataset.chrome).toBe("embedded");
    // The home is kept (its agent surface keeps answering), only hidden.
    expect(view.q("[data-meeting-home]")?.classList.contains("hidden")).toBe(true);
    expect(changes).toEqual([true]);

    act(() => view.q('[data-testid="room"]')!.click());
    expect(view.q('[data-testid="room"]')).toBeNull();
    expect(view.q("[data-meeting-home]")?.classList.contains("hidden")).toBe(false);
    expect(changes).toEqual([true, false]);
    // The home never remounted across the round trip.
    expect(homeMounts).toHaveBeenCalledTimes(1);

    view.unmount();
  });
});
