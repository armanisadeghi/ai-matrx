// What Settings › Notifications SHOWS a person about an event — pure, no I/O.
//
// The event catalog (`communication.notification_event_type`) is written by
// the features that send each notice, and many descriptions are the sending
// feature's own spec ("Fires when … Audience: … Mandatory notice
// (SPEC-NOTIFICATIONS ⚖) …"). That text is for engineers. This module is the
// one place that decides what of it a person reads: an event's area heading,
// and its description only when it is written for a person.

/** An event's area is the first segment of its key (`hr.leave.decided` → `hr`). */
export function notificationArea(eventKey: string): string {
  return eventKey.split(".")[0] ?? eventKey;
}

const AREA_LABELS: Readonly<Record<string, string>> = {
  agent: "AI agents",
  cms: "Websites",
  comment: "Comments",
  custom: "Tables, forms and inbox",
  esign: "Signatures",
  hr: "HR",
  iam: "Invitations",
  knowledge: "Knowledge",
  masterwork: "Masterwork",
  meet: "Meetings",
  personal_staff: "Personal Staff",
  pipeline: "Pipelines",
  platform: "Access and security",
  print: "Print orders",
  question_desk: "Question Desk",
  records: "Data tables",
  secure_delivery: "Secure delivery",
  share: "Sharing",
  task: "Tasks",
  trash: "Trash",
};

/** The heading a person sees for an area; unknown areas are humanized. */
export function notificationAreaLabel(area: string): string {
  const known = AREA_LABELS[area];
  if (known) return known;
  const words = area.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Areas whose notices reach a person only through a role they hold (HR:
 * employees, managers, HR staff, candidates). They start folded so a person
 * outside that role is not handed a wall of notices that will never reach
 * them; search still finds them.
 */
export const ROLE_BOUND_AREAS: ReadonlySet<string> = new Set(["hr"]);

// Spec markers: text carrying any of these was written for engineers.
const SPEC_MARKERS: ReadonlyArray<RegExp> = [
  /^Fires when\b/i,
  /\bAudience:/,
  /SPEC-/,
  /§/,
  /`/,
  /\bNOT SUPPRESSIBLE\b/,
  /\p{Extended_Pictographic}/u,
  /[⚖↗]/,
];

/**
 * The description to show under an event, or null when the catalog text is an
 * engineering spec. Null is honest: the label already names the notice, and a
 * spec sentence ("the frozen audience snapshot") misleads more than it helps.
 */
export function personFacingEventDescription(description: string | null | undefined): string | null {
  const text = description?.trim();
  if (!text) return null;
  if (SPEC_MARKERS.some((marker) => marker.test(text))) return null;
  return text;
}
