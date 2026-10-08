/**
 * The open Applet as ONE XML context bundle (`app_bundle`) — what an agent on
 * `/applets/manage/[id]/**` needs up front, in the fewest tokens (the context
 * budget, `features/surfaces/runtime/context-bundle.ts`). Pure: built from the
 * record the page already hydrated into Redux, never a fetch.
 *
 * Budget: a focused record, ~9,000 chars. Code is listed by file name and size
 * only — the full sources are the `app_files` value.
 */

import {
  xmlElement,
  xmlList,
  xmlText,
} from "@ai-matrx/chat/surfaces/runtime/context-bundle";
import {
  appletFiles,
  appletJobs,
  appletPages,
  appletSources,
  type AppletDefinition,
} from "@/features/applets/types";
import { appletState } from "@/features/applets/lib/applet-state";

const APP_BUNDLE_DESCRIPTION_MAX_CHARS = 1500;

export type AppletBundleSource = Pick<
  AppletDefinition,
  | "id"
  | "slug"
  | "name"
  | "tagline"
  | "description"
  | "status"
  | "published_to_web"
  | "category"
  | "tags"
  | "content_version"
  | "entry"
  | "files"
  | "pages"
  | "mandates"
  | "sources"
  | "total_executions"
  | "success_rate"
  | "last_execution_at"
>;

export function buildAppletBundle(app: AppletBundleSource, activeView?: string): string {
  const files = appletFiles(app);
  return xmlElement(
    "applet",
    {
      id: app.id,
      name: app.name,
      slug: app.slug,
      public_url: app.published_to_web ? `/applets/${app.slug}` : null,
      status: appletState(app).kind,
      published_to_web: app.published_to_web,
      category: app.category,
      tags: app.tags?.length ? app.tags.join(", ") : null,
      version: app.content_version,
      entry: app.entry,
      view: activeView,
    },
    [
      xmlText("tagline", app.tagline),
      xmlText("description", app.description, { max: APP_BUNDLE_DESCRIPTION_MAX_CHARS }),
      xmlList("pages", appletPages(app), (p) =>
        xmlElement("page", { path: p.path, title: p.title, file: p.file, parent: p.parent ?? null }),
      ),
      xmlList("jobs", appletJobs(app), (j) => xmlElement("job", { alias: j.alias, key: j.key })),
      xmlList("sources", appletSources(app), (s) =>
        "entity" in s
          ? xmlElement("source", { alias: s.alias, entity: s.entity })
          : "new_table" in s
            ? xmlElement("source", { alias: s.alias, new_table: s.new_table.name })
            : xmlElement("source", { alias: s.alias, table_id: s.table_id }),
      ),
      xmlList("files", Object.entries(files), ([name, source]) =>
        xmlElement("file", { name, chars: source.length }),
      ),
      xmlElement("usage", {
        runs: app.total_executions,
        success_rate: app.success_rate,
        last_run: app.last_execution_at?.slice(0, 10),
      }),
    ],
  );
}
