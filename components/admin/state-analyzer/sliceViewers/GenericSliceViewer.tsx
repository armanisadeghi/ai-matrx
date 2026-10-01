"use client";

import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import {
  TAB_INDEX_ID,
  useTabNavigation,
} from "@/components/admin/state-analyzer/stateViewerTabs";

const GenericSliceViewer = ({
  sliceKey,
  state,
}: {
  sliceKey: string;
  state: unknown;
}) => {
  const navigate = useTabNavigation();

  return (
    <JsonInspector showSource
      data={state}
      onBack={navigate ? () => navigate(TAB_INDEX_ID) : undefined}
      backLabel="Back to Tab Index"
    />
  );
};

export default GenericSliceViewer;
