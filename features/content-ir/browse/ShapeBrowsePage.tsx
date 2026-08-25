"use client";

import { useEffect } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListController } from "@/lib/entity-list/config";
import { produceMissingComponentAssists } from "@/features/content-ir/studio/shape-assists-producer";
import { createShapesScope } from "@/features/surfaces/manifests/shapes.manifest";
import {
  SHAPES_SURFACE_NAME,
  SHAPE_BUILDER_ROLE,
} from "@/features/content-ir/studio/constants";
import { composeNewShapeIntent } from "@/features/content-ir/studio/kind-agent-intents";
import { useKindAgentLaunch } from "@/features/content-ir/studio/useKindAgentLaunch";
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
 * New shape — opens the studio's `shape_builder` role in a window ON THIS
 * PAGE, with the list's live surface scope attached. It deliberately does not
 * navigate to a form first: the builder's own composer is the input, and
 * asking for the same description twice was the whole complaint.
 */
function NewShapeButton() {
  const { launch, launching } = useKindAgentLaunch(
    SHAPES_SURFACE_NAME,
    SHAPE_BUILDER_ROLE,
  );
  return (
    <Button
      size="sm"
      className="h-11 lg:h-7"
      aria-label="New shape"
      disabled={launching}
      onClick={() => void launch(composeNewShapeIntent())}
    >
      {launching ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Plus className="h-4 w-4" aria-hidden />
      )}
      <span className="max-sm:sr-only">New shape</span>
    </Button>
  );
}

export function ShapeBrowsePage() {
  const newShapeButton = <NewShapeButton />;

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
