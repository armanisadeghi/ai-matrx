/**
 * Surface manifest — Start page (`matrx-user/start-page`, route /start).
 *
 * The person's own home: a document of widgets (counts, tasks, today's meetings, recents, favorites,
 * pinned agents, their data pages). Its job for agents is the EDIT vocabulary — the start_* tools
 * (`features/start/tools/start-tools.ts`) — so the Start page maintainer (mandate key
 * `start_page.maintainer`, proposed; the chair takes it through the Agent Factory) can keep the page the
 * way the person asks. Every agent turn saves as ONE version the person can undo from History.
 *
 * Runtime emitter: `features/start/StartPage.tsx`.
 */

import type { SurfaceManifest, SurfaceValue, SurfaceValueGroup } from "@ai-matrx/chat/surfaces/types";
import { mergeBaselineValues } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";
import { START_CLIENT_TOOLS } from "@/features/start/tools/start-tools";

export const START_PAGE_SURFACE_NAME = "matrx-user/start-page";

const groups: SurfaceValueGroup[] = [
  { key: "start_page", label: "Start page", sortOrder: 100, description: "The person's Start page layout." },
];

const values: SurfaceValue[] = [
  {
    name: "start_widgets",
    label: "Widgets on the page",
    description:
      "Every widget on the person's Start page, in reading order: [{id, type, size, config, describe, position}]. `describe` is the widget's one-line name. Change the page with the start_* tools.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1500,
    group: "start_page",
    sortOrder: 100,
  },
  {
    name: "start_editing",
    label: "Person is editing",
    description: "True while the person has the page in Edit mode; the start_* tools wait until they press Done.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "start_page",
    sortOrder: 110,
  },
];

export const startPageManifest: SurfaceManifest = {
  surfaceName: START_PAGE_SURFACE_NAME,
  client: "matrx-user",
  executor: MATRX_WEB_APP_EXECUTOR,
  label: "Start page",
  description: "The person's own home page: a grid of widgets from across the app and their own data pages.",
  executionMode: "python-stream",
  readiness: "partial",
  readinessNote:
    "Tools live on /start; the maintainer mandate (start_page.maintainer) is proposed, not created — the Chat door says so until it exists.",
  urlPattern: "/start",
  intro: `<surface_intro>
The person is on their Start page: a grid of widgets (s = one column, m = two, l = the whole row on a 4-column grid).
You can CHANGE THE PAGE with the start_* tools, using the same rules as the person's own Edit mode:
- start_read_page first — every widget's id, type, size, config and one-line name.
- start_list_widgets — every widget type, the sizes it allows and its config fields.
- start_add_widget, start_remove_widget, start_move_widget, start_resize_widget, start_configure_widget.
Everything you change in this turn is saved together as ONE version the person can undo from History. Say in one sentence what you changed.
</surface_intro>`,
  groups,
  values: mergeBaselineValues([], values),
  clientTools: START_CLIENT_TOOLS,
};
