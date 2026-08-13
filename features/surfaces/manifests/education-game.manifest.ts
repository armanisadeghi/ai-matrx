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
 * THREE EMITTERS, TWO DOCUMENTED GAPS. `EngageHome`, `HostSetupImpl`, and
 * `JoinRoomImpl` are straightforward client leaves with plain `useState` —
 * emitters mount cleanly. `SoloArcade` and `MultiplayerGame` are BOTH thin
 * `next/dynamic({ ssr: false })` wrappers around `SoloArcadeImpl` /
 * `MultiplayerGameImpl` — a real-time game engine with per-answer timers, a
 * Supabase Broadcast channel, presence, and live score state (CLAUDE.md's
 * heavy-client-code-split rule is exactly why they're wrapped this way). This
 * manifest declares `solo_*` and `room_*` values so the vocabulary exists and
 * agents can be bound against it, but does NOT mount a
 * `SurfaceRuntimeProvider` inside either Impl in this pass — wiring a
 * synchronous `getScope` into a live-scoring realtime engine deserves its own
 * review pass, not a bolt-on here. Until then those values are declared but
 * NEVER actually emitted at runtime.
 *
 * Curated groups (band 0-899):
 *
 *   tool_view       Which of the five routes the learner is on — read first
 *   host_setup      The host composer: source pick + room size
 *   join_room       The join composer: room code entry
 *   solo_session     Read-only state of a live solo-arcade run (not yet emitted)
 *   room_session     Read-only state of a live multiplayer room (not yet emitted)
 *
 * NO WRITE TARGETS. `host`'s source picker and `join`'s code field are each
 * consumed by one human-pressed button (Create room / Join) that performs a
 * real side effect (room creation, cross-owner room lookup) — same "one
 * composite request behind a deliberate button" judgment as
 * `education-memory` and `education-audio-study`. Nothing on `home` is
 * editable at all.
 *
 * Emitters: `EngageHome.tsx`, `HostSetupImpl.tsx`, `JoinRoomImpl.tsx` — all in
 * `features/education/engage/components/`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
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
    key: "solo_session",
    label: "Solo session",
    sortOrder: 400,
    description:
      "Read-only state of a live solo-arcade run on /education/game/solo. No emitter is mounted here yet — see the manifest header.",
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
      'Which Study Games route the learner is on: "home" (the hub — streak, league, badges, and the three primary actions), "host" (the room-creation composer), "join" (the room-code entry), "solo" (a live single-player run), or "play" (a live multiplayer room). Always present when the surface emits at all — "solo" and "play" currently never emit (see manifest header).',
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
      "UUID of the flashcard deck picked as the room's question source. Absent when host_source_kind is \"due\" or no deck has been picked yet.",
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
      "Name of the currently selected deck. Absent when host_source_kind is \"due\" or no deck is picked.",
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
      "The validation or lookup error shown under the code field — e.g. a too-short code or \"No open room with that code.\" Absent whenever there is no error, which is the normal case.",
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

  // ── Solo session (declared, no emitter yet) ────────────────────────────
  {
    name: "solo_source_set_id",
    label: "Solo deck",
    description:
      "UUID of the deck the solo-arcade run is drawing questions from, when launched with a ?set= deep link. Not currently emitted — see manifest header.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "solo_session",
  },
  {
    name: "solo_score",
    label: "Solo score",
    description:
      "The learner's running score in the live solo-arcade session. Not currently emitted — see manifest header.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 310,
    group: "solo_session",
  },

  // ── Multiplayer room (declared, no emitter yet) ────────────────────────
  {
    name: "room_id",
    label: "Room id",
    description:
      "UUID of the multiplayer room the learner is in on /education/game/play/[roomId]. Not currently emitted — see manifest header.",
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
      "Which stage the live room is in — lobby, playing, or results. Not currently emitted — see manifest header.",
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
      "How many players are currently in the room (host + joiners), from Broadcast presence. Not currently emitted — see manifest header.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 320,
    group: "room_session",
  },
];

export const educationGameManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-game",
  readiness: "partial",
  readinessNote:
    "Manifest + three emitters (home, host, join) shipped, targeting a live DB row that previously had no manifest at all. NOT yet: DB sync has not been run; the solo-arcade and live-multiplayer views (SoloArcadeImpl / MultiplayerGameImpl, both dynamic({ssr:false}) real-time game engines) declare solo_*/room_* values but have no SurfaceRuntimeProvider mount (deliberately deferred, see manifest header); no write targets, agent roles, or config namespaces are declared; no data-surface-value Locate anchors are tagged; no live-agent-run verification or Matrx-vs-matrix test has been performed.",
  label: "Study Games",
  urlPattern: "/education/game",
  intro: `<surface_intro>
You are in Study Games at /education/game — play-as-review: every question in every mode is scheduled by the same spaced-repetition engine as the rest of the app. Read \`view\` FIRST — it is "home", "host", "join", "solo", or "play", and it decides which other values are even present.
On "home" the learner sees their streak, weekly league standing, badges, and three entry points: Solo Arcade, Host a game, Join a game. Nothing here is editable.
On "host" they are composing a room: \`host_source_kind\` is "due" (their cross-deck due queue, the adaptive default) or "set" (one specific deck, from \`host_available_sets\`); a private deck can't be used for a cross-account room, which the picker itself flags. \`host_max_players\` is the entitlement-capped room size, shown before creating. The learner still presses Create room.
On "join" they are typing a 5-character room code (\`join_code\`); \`join_error\` explains a bad or unknown code.
"solo" and "play" are live game engines (timers, live scoring, and for "play" a realtime multiplayer room) that this surface currently emits NOTHING from — treat any solo_*/room_* value you see as stale/absent until told otherwise.
You cannot WRITE anything here — no write targets are declared, and creating/joining a room is a real side effect the learner triggers themselves.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
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
 * group. `solo` and `play` currently emit nothing at all (no mount).
 */
export function createEducationGameScope(values: {
  // alwaysAvailable: true → required
  view: "home" | "host" | "join" | "solo" | "play";
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
  // solo (declared, not emitted — see manifest header)
  solo_source_set_id?: string;
  solo_score?: number;
  // play (declared, not emitted — see manifest header)
  room_id?: string;
  room_phase?: string;
  room_player_count?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
