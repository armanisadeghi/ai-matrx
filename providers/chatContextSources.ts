// providers/chatContextSources.ts
//
// The app's CONTEXT SOURCES and COMPUTE TARGETS, registered into `@ai-matrx/chat`
// (P21 — ../aidream/apps/shared/chat/src/context/sources/scopes.tsx, ../aidream/apps/shared/chat/src/compute/targets.tsx).
// The package reads scopes (the active selection, the tree, values, agent-context tasks) and
// the sandbox platform through these registrations instead of importing app code. Scope DATA chat
// reads itself through `@ai-matrx/records/scopes` (chat 0.8.0); the host hands over only its own
// state (the selection, the holder's selectors/thunks/hooks) and UI.
// Imported for its side effect by providers/ChatHostAdapter.tsx. Tests register the same
// exports lazily in jest.setup.ts.

import { registerChatScopes } from "@ai-matrx/chat/context/sources/scopes";
import { registerChatComputeTargets } from "@ai-matrx/chat/compute/targets";
import type { AppThunk } from "@/lib/redux/store";

import {
  selectActiveOrganizationId,
  selectActiveOrganizationName,
  selectActiveProjectId,
  selectActiveTaskId,
  selectActiveScopeIds,
  selectActiveScopeIdsByType,
  selectHasActiveContext,
} from "@/features/scopes/redux/selectors/active-context";
import {
  selectScopeSelectionsContext,
  selectActiveScopeTypeIds,
  selectProjectId,
  selectTaskId,
  selectProjectName,
  selectTaskName,
  selectAppContext,
  addActiveScope,
  removeActiveScope,
} from "@/lib/redux/slices/appContextSlice";
import { selectScopeById, selectScopesByType, selectScopesLoadedForType } from "@/features/scopes/redux/selectors/admin";
import { makeSelectResolvedContext } from "@/features/scopes/redux/selectors/resolved-context";
import { makeSelectScopeTypeLabelMapForOrg } from "@/features/scopes/redux/selectors/tree";
import {
  listScopeTypeItems,
  selectAllContextItems,
  selectLoadedCatalogTypeIds,
} from "@/features/scopes/redux/contextItemCatalog";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { setScopeContextValue } from "@/features/scopes/redux/scopeContextView";
import { ensureContextValues } from "@/features/scopes/redux/thunks/ensureContextValues";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { ensureConversationScopesOrAsk } from "@/features/scopes/redux/thunks/conversationScopeGate";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { useContextValues } from "@/features/scopes/hooks/useContextValues";
import { useDrillPathEngine, useUniverse } from "@/features/scopes/components/active-context/quick-pick/engine";
import { associationsService } from "@/features/scopes/service/associationsService";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { getAssociationsStore } from "@/features/scopes/host/associationsStore";
import { readFavoriteIds, writeFavorite } from "@/features/scopes/service/favoriteOverlay";
import { resolveEntityToken, tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { entityTitleFallback, fetchEntityTitles, getCachedEntityTitle } from "@/features/scopes/service/entityTitles";
import { ActiveContextLensChip } from "@/features/scopes/components/active-context/ActiveContextLensChip";
import { ActiveContextTree } from "@/features/scopes/components/active-context/ActiveContextTree";
import { MillerColumnsCore } from "@/features/scopes/components/active-context/miller-columns/MillerColumns";
import { ContextValueInput } from "@/features/scopes/components/reference/ContextValueInput";
import { ContextValueRow } from "@/features/scopes/components/reference/ContextValueRow";

import {
  clearSandboxBindingCache,
  getActiveSandboxBinding,
  getConversationSandboxBinding,
  getEffectiveSandboxRef,
  getSurfaceSeedRef,
  resolveAgentSandboxRef,
  resolveSandboxRefDetails,
} from "@/lib/sandbox/active-binding";
import { resolveBindingScope } from "@/lib/sandbox/binding-scope";
import { describeBoundTargetState, resolveBoundTargetView } from "@/lib/sandbox/bound-target-view";
import { conversationSandboxBindingFromRow } from "@/lib/sandbox/conversation-binding-row";
import { sandboxDisplayName, splitIdentifyingName } from "@/lib/sandbox/format";
import { resolveSandboxCreateDefaults } from "@/lib/sandbox/sandbox-defaults";
import { ACTIVE_EFFECTIVE_STATUSES, getEffectiveStatus, STATUS_LABELS, statusPillClasses } from "@/lib/sandbox/status";
import { useComputeTargets } from "@/hooks/sandbox/use-compute-targets";
import { useSandboxInstances } from "@/hooks/sandbox/use-sandbox";
import { useVerifiedSandboxBinding } from "@/hooks/sandbox/use-verified-binding";
import { openSandboxGate } from "@/components/dialogs/sandbox-gate/SandboxGateHost";
import { CloneRepoDialog } from "@/features/code/views/sandboxes/CloneRepoDialog";
import { SandboxDiagnosticsPanel } from "@/features/code/views/sandboxes/SandboxDiagnosticsPanel";

/** The post-send scope union stays out of the send path's bundle until a send needs it. */
const syncConversationScopes =
  (conversationId: string): AppThunk<Promise<void>> =>
  async (dispatch) => {
    const mod = await import("@/features/scopes/redux/thunks/syncConversationScopes");
    await dispatch(mod.syncConversationScopes(conversationId));
  };

registerChatScopes({
  selectActiveOrganizationId,
  selectActiveOrganizationName,
  selectActiveProjectId,
  selectActiveTaskId,
  selectActiveScopeIds,
  selectActiveScopeIdsByType,
  selectHasActiveContext,
  selectScopeSelectionsContext,
  selectActiveScopeTypeIds,
  selectProjectId,
  selectTaskId,
  selectProjectName,
  selectTaskName,
  selectAppContext,
  addActiveScope,
  removeActiveScope,
  selectScopeById,
  selectScopesByType,
  selectScopesLoadedForType,
  makeSelectResolvedContext,
  makeSelectScopeTypeLabelMapForOrg,
  selectAllContextItems,
  selectLoadedCatalogTypeIds,
  selectTaskById,
  listScopeTypeItems,
  ensureContextValues,
  ensureScopeTree,
  ensureConversationScopesOrAsk,
  syncConversationScopes,
  setScopeContextValue,
  useScopeTree,
  useContextValues,
  useUniverse,
  useDrillPathEngine,
  associationsService,
  favoritesService,
  getAssociationsStore,
  readFavoriteIds,
  writeFavorite,
  resolveEntityToken,
  tryGetEntityInfo,
  getCachedEntityTitle,
  entityTitleFallback,
  fetchEntityTitles,
  drillPathForScope: (organizations, scopeId) => {
    for (const organization of organizations) {
      for (const scopeType of organization.scope_types) {
        if (scopeType.scopes.some((scope) => scope.id === scopeId)) {
          return { orgId: organization.id, typeId: scopeType.id, scopeId, itemId: null };
        }
      }
    }
    return null;
  },
  ActiveContextLensChip,
  ActiveContextTree,
  MillerColumnsCore,
  ContextValueInput,
  ContextValueRow,
});

registerChatComputeTargets({
  getEffectiveSandboxRef,
  resolveAgentSandboxRef,
  getConversationSandboxBinding,
  getSurfaceSeedRef,
  getActiveSandboxBinding,
  resolveSandboxRefDetails,
  clearSandboxBindingCache,
  conversationSandboxBindingFromRow,
  resolveBindingScope,
  resolveBoundTargetView,
  describeBoundTargetState,
  sandboxDisplayName,
  splitIdentifyingName,
  getEffectiveStatus,
  statusPillClasses,
  STATUS_LABELS,
  ACTIVE_EFFECTIVE_STATUSES,
  resolveSandboxCreateDefaults,
  useComputeTargets,
  useSandboxInstances,
  useVerifiedSandboxBinding,
  openSandboxGate,
  CloneRepoDialog,
  SandboxDiagnosticsPanel,
});
