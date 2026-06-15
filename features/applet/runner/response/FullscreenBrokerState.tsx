"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Database } from "lucide-react";
import FullScreenOverlay from "@/components/official/FullScreenOverlay";
import BrokerValuesSimpleViewer from "./BrokerValuesSimpleViewer";
import BrokerMapViewer from "./BrokerMapViewer";
import BrokerValuesAdvancedViewer from "./BrokerValuesAdvancedViewer";

interface FullscreenBrokerStateProps {
  triggerClassName?: string;
  triggerLabel?: string;
  onClose?: () => void;
  isOpen?: boolean; // External control of open state
}

const FullscreenBrokerState = ({
  triggerClassName,
  triggerLabel = "Broker State",
  onClose,
  isOpen: externalIsOpen,
}: FullscreenBrokerStateProps) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("brokers");
  
  // Use external isOpen state if provided, otherwise use internal state
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;

  const handleClose = () => {
    if (externalIsOpen === undefined) {
      setInternalIsOpen(false);
    }
    onClose?.();
  };
  
  const handleOpen = () => {
    if (externalIsOpen === undefined) {
      setInternalIsOpen(true);
    }
  };

  const tabs = [
    {
      id: "brokers",
      label: "Brokers (Simplified)",
      content: (
        <div className="p-4 h-full overflow-auto">
          <BrokerValuesSimpleViewer />
        </div>
      ),
    },
    {
      id: "brokerMap",
      label: "Broker Map",
      content: (
        <div className="p-4 h-full overflow-auto">
          <BrokerMapViewer />
        </div>
      ),
    },
    {
      id: "brokerValues",
      label: "Brokers (Advanced)",
      content: (
        <div className="p-4 h-full overflow-auto">
          <BrokerValuesAdvancedViewer />
        </div>
      ),
    },
  ];

  // If we're only being used as a controlled component without a trigger button
  if (externalIsOpen !== undefined && !triggerLabel) {
    return (
      <FullScreenOverlay
        isOpen={isOpen}
        onClose={handleClose}
        title="Live Broker Viewer Admin"
        description="View and analyze broker state and broker map"
        tabs={tabs}
        initialTab={activeTab}
        onTabChange={setActiveTab}
        width="95vw"
        height="90dvh"
      />
    );
  }

  return (
    <>
      {triggerLabel && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpen}
          className={triggerClassName}
          aria-label={`Open ${triggerLabel}`}
        >
          <Database className="h-4 w-4 mr-2" />
          {triggerLabel}
        </Button>
      )}

      <FullScreenOverlay
        isOpen={isOpen}
        onClose={handleClose}
        title="Live Broker Viewer Admin"
        description="View and analyze broker state and broker map"
        tabs={tabs}
        initialTab={activeTab}
        onTabChange={setActiveTab}
        width="95vw"
        height="90dvh"
      />
    </>
  );
};

export default FullscreenBrokerState; 