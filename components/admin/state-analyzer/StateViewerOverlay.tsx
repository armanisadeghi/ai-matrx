// state-analyzer/StateViewerOverlay.tsx
import React, { useRef, useState } from "react";
import FullScreenOverlay from "@/components/official/FullScreenOverlay";
import type { RootState } from "@/lib/redux/store";
import { useAppStore } from "@/lib/redux/hooks";
import {
  getStateViewerTabs,
  TAB_INDEX_ID,
  TabNavigationContext,
} from "./stateViewerTabs";

interface StateViewerOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const useCompleteState = (): RootState => {
  const store = useAppStore();
  return store.getState();
};

const StateViewerOverlay: React.FC<StateViewerOverlayProps> = ({
  isOpen,
  onClose,
}) => {
  const completeState = useCompleteState();
  const [activeTab, setActiveTab] = useState<string>(TAB_INDEX_ID);
  const tabChangeRef = useRef(setActiveTab);
  tabChangeRef.current = setActiveTab;

  const tabs = getStateViewerTabs(completeState, (tabId) =>
    tabChangeRef.current(tabId),
  );

  return (
    <TabNavigationContext.Provider value={setActiveTab}>
      <FullScreenOverlay
        isOpen={isOpen}
        onClose={onClose}
        title=""
        description="View the current Redux state of the application"
        tabs={tabs}
        initialTab={activeTab}
        onTabChange={setActiveTab}
        width="95vw"
        height="95dvh"
        compactTabs={true}
        homeTabId={TAB_INDEX_ID}
      />
    </TabNavigationContext.Provider>
  );
};

export default StateViewerOverlay;
