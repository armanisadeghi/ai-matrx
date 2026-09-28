/**
 * Surface manifest — Study Games (`matrx-user/education-game`).
 *
 * The Study Games ("Engage") tool at `/education/game`: play-as-review —
 * every question is scheduled by the same spaced-repetition engine as the
 * rest of the app, just wrapped in game modes. Five routes:
 *
 *   home    /education/game              EngageHome         — the "savior" list/hub
 *   host    /education/game/host         HostSetupImpl      — create a multiplayer room
 *   join    /education/game/join         JoinRoomImpl       — enter a host's code
 *   solo    /education/game/solo         SoloArcade         — SRS-wired single-player
 *   play    /education/game/play/[roomId] MultiplayerGame   — live room (lobby → play → results)
 *
 * WHY THIS MANIFEST EXISTS AT ALL. `route-to-surface.ts` already mapped
 * `/education/game` → `matrx-user/education-game`, and `ui.ui_surface` already
 * carried an ACTIVE row with a `url_pattern` — but there was no manifest and no
 * `SurfaceRuntimeProvider` anywhere in `features/education/engage/**`. Same
 * failure class as `education-memory`: agents were bindable here and blind
 * here (empty scope, silent fallback toast).
 *
 * SOLO HAS ITS OWN SURFACE NOW. `/education/game/solo` used to fall through
 * to this manifest with declared-but-never-emitted `solo_*` values (wave 4
 * gap). It is resolved to its own `matrx-user/education-game-solo` before the
 * `/education/game` prefix table entry (see `route-to-surface.ts`) and has a
 * real `SurfaceRuntimeProvider` emitter — see `education-game-solo.manifest.ts`.
 * `MultiplayerGame` (`/education/game/play/[roomId]`) emits only the narrow
 * durable room scope the page already loads. Its one write target cancels a
 * host-owned lobby room after approval; live game state stays Broadcast-only.
 *
 * Curated groups (band 0-899):
 *
 *   tool_view       Which of the routes the learner is on — read first
 *   host_setup      The host composer: source pick + room size
 *   join_room       The join composer: room code entry
 *   room_session     Current multiplayer room and the host's safe cancellation action
 *
 * ONE WRITE TARGET. `delete_game_rooms` retires only the host's current lobby
 * room, after approval. It cannot touch an active room because that would
 * interrupt players and their study sessions. `host`'s source picker and
 * `join`'s code field remain human-pressed composite actions.
 *
 * Emitters: `EngageHome.tsx`, `HostSetupImpl.tsx`, `JoinRoomImpl.tsx`, and
 * `MultiplayerGameImpl.tsx` — all in `features/education/engage/components/`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "tool_view",
    label: "Tool view",
    sortOrder: 100,
    description:
      "Which of the Study Games routes the learner is on. Read this first — it tells you which of the other groups carry values at all.",
  },
  {
    key: "host_setup",
    label: "Host setup",
    sortOrder: 200,
    description:
      "The room-creation composer on /education/game/host — what source players will be quizzed from, and the room-size entitlement.",
  },
  {
    key: "join_room",
    label: "Join room",
    sortOrder: 300,
    description:
      "The join composer on /education/game/join — the code the learner is typing.",
  },
  {
    key: "room_session",
    label: "Multiplayer room",
    sortOrder: 500,
    description:
      "Read-only state of a live multiplayer room on /education/game/play/[roomId]. No emitter is mounted here yet — see the manifest header.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Tool view ──────────────────────────────────────────────────────────
  {
    name: "view",
    label: "Current view",
    description:
      'Which Study Games route the learner is on: "home" (the hub — streak, league, badges, and the three primary actions), "host" (the room-creation composer), "join" (the room-code entry), or "play" (a live multiplayer room). Solo Arcade (/education/game/solo) has its own surface — see education-game-solo.manifest.ts. Always present when the surface emits at all — "play" currently never emits (see manifest header).',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 300,
    group: "tool_view",
  },

  // ── Host setup ─────────────────────────────────────────────────────────
  {
    name: "host_source_kind",
    label: "Room source kind",
    description:
      '"due" (the learner\'s cross-deck due queue — the adaptive default) or "set" (one specific flashcard deck). Only present on the host view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 300,
    group: "host_setup",
  },
  {
    name: "host_source_set_id",
    label: "Selected deck",
    description:
      'UUID of the flashcard deck picked as the room\'s question source. Absent when host_source_kind is "due" or no deck has been picked yet.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "host_setup",
  },
  {
    name: "host_source_set_name",
    label: "Selected deck name",
    description:
      'Name of the currently selected deck. Absent when host_source_kind is "due" or no deck is picked.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 320,
    group: "host_setup",
  },
  {
    name: "host_available_sets",
    label: "Available decks",
    description:
      "The learner's flashcard decks offered in the host picker, each with id, name, and whether it is private (only the host can load its cards — a cross-account room needs a shared/public deck). Empty array when they have none; absent until the picker's list has loaded. Only present on the host view.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 330,
    group: "host_setup",
  },
  {
    name: "host_max_players",
    label: "Max players",
    description:
      "The room-size cap the room will be created with, from the education.game_room_size entitlement (shown before hosting, per the TRUST mandate — never a mid-workflow ambush). Always present on the host view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 340,
    group: "host_setup",
  },
  {
    name: "host_creating",
    label: "Creating room",
    description:
      "True while the Create room button's request is in flight. Absent on the other views.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 350,
    group: "host_setup",
  },

  // ── Join room ──────────────────────────────────────────────────────────
  {
    name: "join_code",
    label: "Room code",
    description:
      "The 5-character room code the learner has typed so far (uppercased as they type). Empty string before they type anything. Only present on the join view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "join_room",
  },
  {
    name: "join_error",
    label: "Join error",
    description:
      'The validation or lookup error shown under the code field — e.g. a too-short code or "No open room with that code." Absent whenever there is no error, which is the normal case.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 310,
    group: "join_room",
  },
  {
    name: "join_joining",
    label: "Joining room",
    description:
      "True while the room lookup is in flight. Absent on the other views.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 320,
    group: "join_room",
  },

  // ── Multiplayer room (declared, no emitter yet) ────────────────────────
  {
    name: "room_id",
    label: "Room id",
    description:
      "UUID of the verified multiplayer room the learner is in on /education/game/play/[roomId]. Absent while the room is loading or cannot be opened.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "room_session",
  },
  {
    name: "room_phase",
    label: "Room phase",
    description:
      "The room's durable stage: lobby, active, or ended. Absent while the room is loading or cannot be opened.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 7,
    sortOrder: 310,
    group: "room_session",
  },
  {
    name: "room_player_count",
    label: "Players in room",
    description:
      "How many players are currently in the room (host + joiners), from Broadcast presence. Absent while the room is loading or cannot be opened.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 320,
    group: "room_session",
  },
  {
    name: "owned_game_rooms",
    label: "My current room",
    description:
      "The verified room currently open on this page when the learner is its host, as an array of at most one { id, status }. It is an empty array for guests. delete_game_rooms may cancel it only while status is lobby.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 330,
    group: "room_session",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "delete_game_rooms",
    label: "Cancel waiting room",
    description:
      'Cancels the host\'s currently open WAITING room, saved immediately. Value is a JSON ARRAY with exactly its one id from owned_game_rooms, for example ["…"]. The person must approve. This ends the lobby, soft-deletes its room record, and invalidates the join code so no new player can join. It refuses guests, an unknown id, a room that is already active or ended, and requests with any number of ids other than one. A live round cannot be deleted here because cancelling it would interrupt players and their study sessions.',
    valueType: "array",
    updatesValue: "owned_game_rooms",
    mode: "entity",
    applyPolicy: "ask",
    group: "room_session",
    sortOrder: 330,
  },
];

export const educationGameManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-game",
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Study game arcade hub + multiplayer host/join (/education/game). Solo Arcade has its own surface, matrx-user/education-game-solo.",
  readiness: "partial",
  readinessNote:
    "Manifest + home, host, join, and narrow play-route emitters shipped, targeting a live DB row that previously had no manifest at all. The play route supplies only the current durable room state and an approval-gated host cancellation target; it does not expose mutable live scores, presence, or active-round controls. Solo Arcade moved to its own surface (matrx-user/education-game-solo). NOT yet: DB sync has not been run; no data-surface-value Locate anchors are tagged; no live-agent-run verification or Matrx-vs-matrix test has been performed.",
  label: "Study Games",
  urlPattern: "/education/game",
  intro: `<surface_intro>
You are in Study Games at /education/game — play-as-review: every question in every mode is scheduled by the same spaced-repetition engine as the rest of the app. Read \`view\` FIRST — it is "home", "host", "join", or "play", and it decides which other values are even present. A live Solo Arcade round (/education/game/solo) is a separate surface — see matrx-user/education-game-solo.
On "home" the learner sees their streak, weekly league standing, badges, and three entry points: Solo Arcade, Host a game, Join a game. Nothing here is editable.
On "host" they are composing a room: \`host_source_kind\` is "due" (their cross-deck due queue, the adaptive default) or "set" (one specific deck, from \`host_available_sets\`); a private deck can't be used for a cross-account room, which the picker itself flags. \`host_max_players\` is the entitlement-capped room size, shown before creating. The learner still presses Create room.
On "join" they are typing a 5-character room code (\`join_code\`); \`join_error\` explains a bad or unknown code.
On "play", room_id, room_phase, and room_player_count describe the verified room currently open. owned_game_rooms contains that one room only for its host. delete_game_rooms cancels a host-owned lobby by its id after the person approves; it soft-deletes the room and disables the join code. It refuses guests and active or ended rooms, because interrupting a live round would harm players and their study sessions.
Creating and joining rooms remain actions the learner triggers themselves; never use generic tools for those composite actions.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One entry in `host_available_sets`. */
export interface GameDeckOption {
  id: string;
  name: string;
  isPrivate: boolean;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 *
 * Only `view` is guaranteed: the emitted views each supply only their own
 * group.
 */
export function createEducationGameScope(values: {
  // alwaysAvailable: true → required
  view: "home" | "host" | "join" | "play";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  // host
  host_source_kind?: string;
  host_source_set_id?: string;
  host_source_set_name?: string;
  host_available_sets?: GameDeckOption[];
  host_max_players?: number;
  host_creating?: boolean;
  // join
  join_code?: string;
  join_error?: string;
  join_joining?: boolean;
  // play
  room_id?: string;
  room_phase?: string;
  room_player_count?: number;
  owned_game_rooms?: Array<{ id: string; status: string }>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
