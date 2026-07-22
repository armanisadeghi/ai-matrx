import {
  createDynamicRouteMetadata,
  createRouteMetadata,
} from "@/utils/route-metadata";
import { getShapeDetail } from "./shape-detail-server";
import { SHAPES_NEW_HREF, SHAPES_ROUTE_BASE } from "./constants";

/** Two-letter badge — matches `/shapes` in favicon-route-data. */
export const SHAPES_FAVICON_LETTER = "Sh";

export const shapesListMetadata = createRouteMetadata(SHAPES_ROUTE_BASE, {
  title: "Shapes",
  description:
    "Design custom structured-content shapes with an agent and see them render live.",
  letter: SHAPES_FAVICON_LETTER,
  canonicalPath: SHAPES_ROUTE_BASE,
});

export const newShapeMetadata = createRouteMetadata(SHAPES_ROUTE_BASE, {
  titlePrefix: "New",
  title: "Shapes",
  description: "Design a custom shape with the agent.",
  letter: SHAPES_FAVICON_LETTER,
  canonicalPath: SHAPES_NEW_HREF,
});

export const shapesAdminMetadata = createRouteMetadata(SHAPES_ROUTE_BASE, {
  titlePrefix: "Admin",
  title: "Shapes",
  description: "Shapes studio routes, modules, and related admin resources.",
  letter: SHAPES_FAVICON_LETTER,
  canonicalPath: `${SHAPES_ROUTE_BASE}/admin`,
});

type ShapeKindMetadataOptions = {
  titlePrefix?: string;
  description?: string;
  /** Route segment after `[kind]` — e.g. `test` → `/shapes/<kind>/test`. */
  pathSuffix?: "test" | "instances" | "schema";
};

export async function createShapeKindMetadata(
  kindSlug: string,
  options: ShapeKindMetadataOptions = {},
) {
  const detail = await getShapeDetail(kindSlug);
  const label = detail?.label ?? kindSlug;
  const encodedKind = encodeURIComponent(kindSlug);
  const basePath = `${SHAPES_ROUTE_BASE}/${encodedKind}`;
  const canonicalPath = options.pathSuffix
    ? `${basePath}/${options.pathSuffix}`
    : basePath;
  const description =
    options.description ??
    (detail
      ? `Preview, test, and manage saved instances of the ${label} shape.`
      : `Shape studio for ${kindSlug}.`);

  return createDynamicRouteMetadata(SHAPES_ROUTE_BASE, {
    titlePrefix: options.titlePrefix,
    title: label,
    description,
    letter: SHAPES_FAVICON_LETTER,
    canonicalPath,
  });
}
