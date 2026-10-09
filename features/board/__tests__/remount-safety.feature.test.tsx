/**
 * Remount safety — feature items: task, project, research, War Room, workflow
 * run, meeting.
 *
 * SUT: each type's `Body` from `items/catalog.ts`, mounted as the board mounts
 * a tile (`remount-safety/harness.tsx`), over the real store and the recording
 * service boundary. The break each case catches is named above it.
 */

jest.mock("@/utils/supabase/client", () => {
  const { createFakeSupabase } = jest.requireActual("./remount-safety/fake-backend");
  const client = createFakeSupabase();
  return { createClient: () => client, supabase: client };
});
jest.mock("next/navigation", () => jest.requireActual("./remount-safety/next-navigation"));

import { BOARD_ITEM_TYPES } from "../items/catalog";
import { expectRemountSafe, richEditorIn, richTextOf, runCycle, typeInto, typeIntoRich, type TileHandle } from "./remount-safety/harness";
import { installBrowserGaps } from "./remount-safety/browser-gaps";
import {
  MEETING_ID,
  PROJECT_ID,
  REPORT_TEXT,
  RUN_ID,
  TASK_ID,
  TOPIC_ID,
  WAR_ROOM_ID,
  meetingRow,
  seedMeeting,
  seedProject,
  seedResearch,
  seedTask,
  seedWarRoom,
  seedWorkflowRun,
  taskRow,
  warRoomRow,
} from "./remount-safety/fixtures-feature";
import { remountType } from "./remount-safety/cases";

installBrowserGaps();

const type = (key: string) => {
  const t = BOARD_ITEM_TYPES.find((x) => x.key === key);
  if (!t) throw new Error(`no board item type ${key}`);
  return t;
};
const shows = (tile: TileHandle, text: string) => (tile.container.textContent ?? "").includes(text);
const skeleton = (tile: TileHandle) => tile.container.querySelector('[aria-busy="true"]') !== null;

// Break: the task editor rebuilds its description from the last saved copy on
// remount (an unsaved edit lost), or re-reads the task on wake.
const APPENDED = " Confirm the October 9 slot with Luis.";
const DESCRIPTION = `${taskRow.description}${APPENDED}`;
remountType(
  "task",
  () =>
    runCycle(type("task"), { kind: "entity", entity: "task", id: TASK_ID }, {
      title: taskRow.title,
      prepare: seedTask,
      loadMs: 800,
      act: async (tile) => {
        const description = richEditorIn(tile.container);
        if (!description) throw new Error("the task's description field never rendered");
        await typeIntoRich(description, [APPENDED]);
      },
      kept: (tile) => ({
        description: richTextOf(tile.container),
        title: (tile.container.querySelector('input[aria-label="Task title"]') as HTMLInputElement | null)?.value,
      }),
    }),
  (r) => expectRemountSafe(r, { description: DESCRIPTION, title: taskRow.title }, [/^projects\.tasks$/]),
);

// Break: the project workspace re-reads the project and its tasks on wake, or
// loses the half-typed quick-add task.
const QUICK_TASK = "Order replacement blinds for the bedroom";
remountType(
  "project",
  () =>
    runCycle(type("project"), { kind: "entity", entity: "project", id: PROJECT_ID }, {
      title: "Unit 4B turnover",
      prepare: seedProject,
      loadMs: 800,
      act: async (tile) => {
        const input = tile.container.querySelector('input[placeholder^="Task title"]');
        if (!input) throw new Error("the project's quick-add task field never rendered");
        await typeInto(input, QUICK_TASK);
      },
      kept: (tile) => ({
        draft: (tile.container.querySelector('input[placeholder^="Task title"]') as HTMLInputElement | null)?.value,
        task: shows(tile, taskRow.title),
      }),
    }),
  (r) => expectRemountSafe(r, { draft: QUICK_TASK, task: true }, [/^projects\.projects$/, /^projects\.tasks$/]),
);

// Break: the research report re-reads the topic and its document on wake.
remountType(
  "research",
  () =>
    runCycle(type("research"), { kind: "entity", entity: "research", id: TOPIC_ID }, {
      title: "Oregon rent increase limits 2027",
      prepare: seedResearch,
      loadMs: 800,
      kept: (tile) => ({ report: shows(tile, REPORT_TEXT), loading: skeleton(tile) }),
    }),
  (r) => expectRemountSafe(r, { report: true, loading: false }, [/^research\.rs_topic$/, /^research\.rs_document$/, /^get_topic_overview$/]),
);

// Break: the War Room re-hydrates on wake (skeleton, re-read) and records
// "opened" (an update of last_opened_at) on every mount.
remountType(
  "war-room",
  () =>
    runCycle(type("war-room"), { kind: "entity", entity: "war-room", id: WAR_ROOM_ID }, {
      title: warRoomRow.title,
      prepare: seedWarRoom,
      loadMs: 800,
      kept: (tile) => ({ room: shows(tile, warRoomRow.title), loading: skeleton(tile) }),
    }),
  (r) => expectRemountSafe(r, { room: true, loading: false }, [/^projects\.war_rooms$/]),
);

// Break: the run tile re-adopts the run on wake/remount — re-reading the run
// and its durable log, or opening the floating run window again.
remountType(
  "workflow-run",
  () =>
    runCycle(type("workflow-run"), { kind: "entity", entity: "workflow-run", id: RUN_ID }, {
      title: "Turnover checklist",
      prepare: seedWorkflowRun,
      loadMs: 1000,
      kept: (tile) => ({ name: shows(tile, "Turnover checklist"), finished: shows(tile, "Finished") }),
    }),
  (r) =>
    expectRemountSafe(r, { name: true, finished: true }, [
      /^workflow\.run$/,
      /^workflow\.definition$/,
      new RegExp(`/runs/${RUN_ID}`),
    ]),
);

// Break: the meeting home re-reads the meeting, its guests and occurrences on
// wake/remount instead of keeping them by meeting id.
remountType(
  "meeting",
  () =>
    runCycle(type("meeting"), { kind: "entity", entity: "meeting", id: MEETING_ID }, {
      title: meetingRow.title,
      prepare: seedMeeting,
      loadMs: 800,
      kept: (tile) => ({ meeting: shows(tile, meetingRow.title), when: shows(tile, "October 6, 2026") }),
    }),
  (r) =>
    expectRemountSafe(r, { meeting: true, when: true }, [
      /^communication\.meet_meetings$/,
      /^communication\.meet_invitees$/,
      /^meet_meeting_occurrences$/,
    ]),
);

// Break: one part of a meeting (its notes) re-reads the meeting and its record
// on wake/remount, or falls back to a skeleton.
remountType(
  "meeting_part",
  () =>
    runCycle(type("meeting_part"), { kind: "entity", entity: "meeting_part", id: MEETING_ID, meta: { part: "notes" } }, {
      title: "Notes",
      prepare: seedMeeting,
      loadMs: 800,
      kept: (tile) => ({ text: (tile.container.textContent ?? "").trim().slice(0, 80), loading: skeleton(tile) }),
    }),
  (r) => {
    expect(r.keptAfterWake).toEqual(r.keptAfterRemount);
    expectRemountSafe({ ...r, keptAfterRemount: r.keptAfterWake }, r.keptAfterWake, [
      /^communication\.meet_meetings$/,
      /^communication\.meet_invitees$/,
      /^meet_meeting_occurrences$/,
    ]);
  },
);
