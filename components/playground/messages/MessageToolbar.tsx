// components\playground\messages\MessageToolbar.tsx
import React, { useState, useEffect } from "react";
import {
  Image,
  Link,
  Trash2,
  Save,
  Expand,
  Minimize2,
  LetterText,
  Radiation,
  Eye,
  SquareAsterisk,
  Code,
  MessageSquare,
  FileText,
  Diamond,
} from "lucide-react";
import { IoDiamondOutline } from "react-icons/io5";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MatrxRecordId } from "@/types/records";
import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import { useUser } from "@/lib/hooks/useUser";

export type DisplayOption =
  | "brokerEditor"
  | "textChat"
  | "richText"
  | "markdown";

export interface MessageToolbarProps {
  messageRecordId: MatrxRecordId;
  role: string;
  isCollapsed: boolean;
  onAddMedia: (messageRecordId: MatrxRecordId) => void;
  onLinkBroker: (messageRecordId: MatrxRecordId) => void;
  onDelete: (messageRecordId: MatrxRecordId) => void;
  onSave: (messageRecordId: MatrxRecordId) => void;
  onToggleCollapse: (messageRecordId: MatrxRecordId) => void;
  onShowChips: (messageRecordId: MatrxRecordId) => void;
  onShowEncoded: (messageRecordId: MatrxRecordId) => void;
  onShowNames: (messageRecordId: MatrxRecordId) => void;
  onShowDefaultValue: (messageRecordId: MatrxRecordId) => void;
  onShowEncodedId: (messageRecordId: MatrxRecordId) => void;
  onRoleChange: (messageRecordId: MatrxRecordId, newRole: string) => void;
  onDragDrop: (draggedId: MatrxRecordId, targetId: MatrxRecordId) => void;
  debug?: boolean;
  onDebugClick?: (messageRecordId: MatrxRecordId) => void;
  onDisplayOptionChange: (
    messageRecordId: MatrxRecordId,
    displayOption: DisplayOption,
  ) => void;
  currentDisplayOption?: DisplayOption;
  onToggleFullDisplay?: (messageRecordId: MatrxRecordId) => void;
}

// Super simple action button without tooltip
const ActionIcon = ({ onClick, icon, label }) => (
  <span
    onClick={onClick}
    className="inline-flex h-6 w-6 items-center justify-center rounded-md p-0 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors"
    aria-label={label}
    title={label}
  >
    {icon}
  </span>
);

// Super simple display option icon without tooltip
const DisplayIcon = ({ onClick, icon, label, isActive }) => (
  <span
    onClick={onClick}
    className={
      isActive
        ? "inline-flex h-6 w-6 items-center justify-center rounded-md p-0 text-zinc-900 dark:text-zinc-100 bg-zinc-200 dark:bg-zinc-700 cursor-pointer transition-colors"
        : "inline-flex h-6 w-6 items-center justify-center rounded-md p-0 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors"
    }
    aria-label={label}
    title={label}
  >
    {icon}
  </span>
);

// Simple role selector without complex state
const RoleSelector = ({ role, messageRecordId, onRoleChange }) => (
  <DropdownMenu>
    <DropdownMenuTrigger className="text-sm text-muted-foreground hover:text-foreground">
      {role.toUpperCase()}
    </DropdownMenuTrigger>
    <DropdownMenuContent className="bg-elevation2 bg-opacity-100">
      <DropdownMenuItem onClick={() => onRoleChange(messageRecordId, "system")}>
        SYSTEM
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onRoleChange(messageRecordId, "user")}>
        USER
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => onRoleChange(messageRecordId, "assistant")}
      >
        ASSISTANT
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const MessageToolbar = ({
  messageRecordId,
  role,
  isCollapsed,
  onAddMedia,
  onLinkBroker,
  onDelete,
  onSave,
  onToggleCollapse,
  onShowChips,
  onShowEncoded,
  onShowNames,
  onShowDefaultValue,
  onShowEncodedId,
  onRoleChange,
  onDragDrop,
  debug = false,
  onDebugClick,
  onDisplayOptionChange,
  currentDisplayOption = "textChat",
  onToggleFullDisplay = () => {},
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { isAdmin } = useUser();
  const [initialCooldownComplete, setInitialCooldownComplete] = useState(false);

  // Set up the initial cooldown timer
  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialCooldownComplete(true);
    }, 5000);

    // Clean up the timer if the component unmounts
    return () => clearTimeout(timer);
  }, []);

  // Display options - defined inline to avoid any memoization issues
  const displayOptions = [
    {
      value: "richText",
      label: "Rich Text",
      icon: <FileText className="h-4 w-4" />,
    },
    {
      value: "markdown",
      label: "Markdown",
      icon: (
        <IoDiamondOutline className="h-4 w-4 text-blue-500 hover:text-blue-600 hover:h-5 hover:w-5 transition-all" />
      ),
    },
    {
      value: "brokerEditor",
      label: "Broker Editor",
      icon: <Code className="h-4 w-4" />,
    },
    {
      value: "textChat",
      label: "Text Chat",
      icon: <MessageSquare className="h-4 w-4" />,
    },
  ];

  // Define actions - defined inline to avoid any memoization issues
  const actions = [
    {
      label: "Delete Message",
      icon: <Trash2 className="h-4 w-4" />,
      onClick: () => onDelete(messageRecordId),
    },
    {
      label: "Save Message",
      icon: <Save className="h-4 w-4" />,
      onClick: () => onSave(messageRecordId),
    },
    {
      label: "Add Media",
      icon: <Image className="h-4 w-4" />,
      onClick: () => onAddMedia(messageRecordId),
    },
    {
      label: "Link Broker",
      icon: <Link className="h-4 w-4" />,
      onClick: () => onLinkBroker(messageRecordId),
    },
    {
      label: isCollapsed ? "Expand" : "Collapse",
      icon: isCollapsed ? (
        <Expand className="h-4 w-4" />
      ) : (
        <Minimize2 className="h-4 w-4" />
      ),
      onClick: () => onToggleCollapse(messageRecordId),
    },
    {
      label: "Standard Text With Chips",
      icon: <Radiation className="h-4 w-4" />,
      onClick: () => onShowChips(messageRecordId),
    },
    {
      label: "Plain Text With Broker Default Values",
      icon: <LetterText className="h-4 w-4" />,
      onClick: () => onShowDefaultValue(messageRecordId),
    },
    {
      label: "Visible Encoded ID",
      icon: <SquareAsterisk className="h-4 w-4" />,
      onClick: () => onShowEncodedId(messageRecordId),
    },
    {
      label: "Broker Names",
      icon: <Eye className="h-4 w-4" />,
      onClick: () => onShowNames(messageRecordId),
    },
  ];

  // if (isAdmin && debug && initialCooldownComplete) {
  //     actions.push(
  //         {
  //             label: "Visible Encoded Text",
  //             icon: <SquareRadical className="h-4 w-4" />,
  //             onClick: () => onShowEncoded(messageRecordId),
  //         },
  //         {
  //             label: "Debug",
  //             icon: <Bug className="h-4 w-4" />,
  //             onClick: () => onDebugClick?.(messageRecordId),
  //         }
  //     );
  // }

  // Basic drag and drop handlers
  const handleDragStart = (e) => {
    e.dataTransfer.setData("text/plain", messageRecordId.toString());
    e.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!isDragging) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId !== messageRecordId.toString()) {
      onDragDrop(draggedId as MatrxRecordId, messageRecordId);
    }
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex justify-between items-center px-2 py-1 border-b cursor-move transition-all
                ${isDragOver ? "border-t-4 border-t-primary" : ""}
                ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-1">
        <RoleSelector
          role={role}
          messageRecordId={messageRecordId}
          onRoleChange={onRoleChange}
        />

        {/* Display option icons */}
        <div className="ml-2 flex gap-1 border-l pl-2">
          {displayOptions.map((option) => (
            <DisplayIcon
              key={option.value}
              onClick={() =>
                onDisplayOptionChange(
                  messageRecordId,
                  option.value as DisplayOption,
                )
              }
              icon={option.icon}
              label={option.label}
              isActive={currentDisplayOption === option.value}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-1">
        {actions.map((action) => (
          <ActionIcon
            key={action.label}
            onClick={action.onClick}
            icon={action.icon}
            label={action.label}
          />
        ))}
      </div>
    </div>
  );
};

export default MessageToolbar;
