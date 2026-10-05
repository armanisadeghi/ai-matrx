"use client";

// ChatMobileAdminToggles — Admin-only client island for the mobile header.
//
// Migrated to pure Redux: no context dependencies.

import { Chip, Button } from "@ai-matrx/design-system/controls";
import { Blocks, Camera } from "lucide-react";
import { useAppSelector, useAppDispatch } from "../../store/hooks";
import {
  selectActiveServer,
  selectLoopbackTargetsAllowed,
  switchServer,
} from "../../host/server/api-config";
import {
  selectIsBlockMode,
  selectIsSnapshot,
} from "../../agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  setUseBlockMode,
  setUseSnapshot,
} from "../../agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { selectIsAdmin } from "../../host/identity";

export default function ChatMobileAdminToggles() {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsAdmin);
  const activeServer = useAppSelector(selectActiveServer);
  const isUsingLocalhost = activeServer === "localhost";
  const blockMode = useAppSelector(selectIsBlockMode);
  const snapshot = useAppSelector(selectIsSnapshot);
  const loopbackAllowed = useAppSelector(selectLoopbackTargetsAllowed);

  if (!isAdmin) return null;

  const handleToggleLocalhost = () => {
    dispatch(
      switchServer({ env: isUsingLocalhost ? "production" : "localhost" }),
    );
  };

  const handleToggleBlockMode = () => {
    dispatch(setUseBlockMode(!blockMode));
  };

  const handleToggleSnapshot = () => {
    dispatch(setUseSnapshot(!snapshot));
  };

  return (
    <div className="flex items-center gap-1">
      {loopbackAllowed && (
        <Chip
          asChild
          pressed={isUsingLocalhost}
          tone="warning"
          label="local"
          title={
            isUsingLocalhost
              ? "Using localhost — click to switch to production"
              : "Using production — click to switch to localhost"
          }
        >
          <button type="button" onClick={handleToggleLocalhost} />
        </Chip>
      )}
      <Button variant="quiet" pressed={!!(blockMode)} icon={<Blocks />} onClick={handleToggleBlockMode} title={
          blockMode
            ? "Block mode ON — using agents-blocks endpoint. Click to disable."
            : "Block mode OFF — using standard agents endpoint. Click to enable."
        } aria-label={
          blockMode
            ? "Block mode ON — using agents-blocks endpoint. Click to disable."
            : "Block mode OFF — using standard agents endpoint. Click to enable."
        } />
      <Button variant="quiet" pressed={!!(snapshot)} icon={<Camera />} onClick={handleToggleSnapshot} title={
          snapshot
            ? "Snapshot ON — every request stamps snapshot:true. Click to disable."
            : "Snapshot OFF — click to capture full server-side snapshots per request."
        } aria-label={
          snapshot
            ? "Snapshot ON — every request stamps snapshot:true. Click to disable."
            : "Snapshot OFF — click to capture full server-side snapshots per request."
        } />
    </div>
  );
}
