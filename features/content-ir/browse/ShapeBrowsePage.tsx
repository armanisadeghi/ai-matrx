"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListController } from "@/lib/entity-list/config";
import { produceMissingComponentAssists } from "@/features/content-ir/studio/shape-assists-producer";
import { createShapesScope } from "@/features/surfaces/manifests/shapes.manifest";
import {
  SHAPES_NEW_HREF,
  SHAPES_SURFACE_NAME,
} from "@/features/content-ir/studio/constants";
import { shapeListConfig } from "./listConfig";
import type { ShapeBrowseRow } from "./types";

function ShapeAssistProducer({
  list,
}: {
  list: EntityListController<ShapeBrowseRow>;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);

  useEffect(() => {
    if (!userId || list.isLoading) return;
    void produceMissingComponentAssists(list.rows, userId, dispatch);
  }, [dispatch, list.isLoading, list.rows, userId]);

  return null;
}

/**
 * New shape — GOES to `/shapes/new`, deliberately. You are at the home of
 * Shapes and you came here to make one; that earns the dedicated create
 * experience, not the generic agent window. The floating-window builder is
 * for making a shape from ANYWHERE ELSE, where the whole point is not leaving.
 */
export function ShapeBrowsePage() {
  const newShapeButton = (
    <Button asChild size="sm" className="h-11 lg:h-7">
      <Link href={SHAPES_NEW_HREF} aria-label="New shape">
        <Plus className="h-4 w-4" />
        <span className="max-sm:sr-only">New shape</span>
      </Link>
    </Button>
  );

  return (
    <EntityListPage
      config={shapeListConfig}
      notice={(list) => <ShapeAssistProducer list={list} />}
      headerActions={newShapeButton}
      emptyAction={newShapeButton}
      surface={{
        surfaceName: SHAPES_SURFACE_NAME,
        getScope: (list) =>
          createShapesScope({
            studio_tab: "list",
            shape_count: list.total,
            my_shapes: list.query.scope.kind === "mine" ? list.rows : undefined,
            platform_shapes:
              list.query.scope.kind !== "mine" ? list.rows : undefined,
            shape_search_query: list.query.search || undefined,
          }),
      }}
    />
  );
}
