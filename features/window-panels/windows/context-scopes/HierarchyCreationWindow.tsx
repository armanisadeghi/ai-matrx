"use client";

import React, { useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  useCreateOrganization,
  useCreateProject,
  useCreateTask,
} from "@/features/agent-context/hooks/useHierarchy";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface HierarchyCreationWindowData {
  entityType?: "organization" | "project" | "task";
  presetContext?: {
    organization_id?: string | null;
    project_id?: string | null;
  };
}

interface HierarchyCreationWindowProps {
  isOpen: boolean;
  onClose: () => void;
  data?: HierarchyCreationWindowData;
}

export default function HierarchyCreationWindow({
  isOpen,
  onClose,
  data,
}: HierarchyCreationWindowProps) {
  const { entityType, presetContext } = data || {};
  const dispatch = useAppDispatch();

  const createOrganization = useCreateOrganization();
  const createProject = useCreateProject();
  const createTask = useCreateTask();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getTitle = () => {
    switch (entityType) {
      case "organization":
        return "Create Organization";
      case "project":
        return "Create Project";
      case "task":
        return "Create Task";
      default:
        return "Create Entity";
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);

    try {
      if (entityType === "organization") {
        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "");
        await createOrganization.mutateAsync({ name, slug });
      } else if (entityType === "project") {
        if (!presetContext?.organization_id)
          throw new Error("Organization ID is required");
        await createProject.mutateAsync({
          organization_id: presetContext.organization_id,
          name,
        });
      } else if (entityType === "task") {
        if (!presetContext?.project_id)
          throw new Error("Project ID is required");
        if (!presetContext?.organization_id)
          throw new Error("Organization ID is required");
        await createTask.mutateAsync({
          project_id: presetContext.project_id,
          organization_id: presetContext.organization_id,
          title: name,
          description: description,
        });
      }
      onClose();
    } catch (e) {
      console.error("Failed to create", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !entityType) return null;

  return (
    <WindowPanel
      title={getTitle()}
      onClose={onClose}
      width={400}
      height={350}
      position="center"
      minWidth={300}
      maxWidth={600}
      overlayId="hierarchyCreationWindow"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      footerRight={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="!h-7"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="!h-7"
            onClick={handleCreate}
            disabled={!name.trim() || isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-auto p-4">
        <div className="text-sm text-muted-foreground mb-2">
          {entityType === "project" &&
            presetContext?.organization_id &&
            "Creating in selected organization."}
          {entityType === "task" &&
            presetContext?.project_id &&
            "Creating in selected project."}
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`My new ${entityType}`}
              autoFocus
            />
          </div>

          {(entityType === "task" || entityType === "project") && (
            <div>
              <label className="text-xs font-medium mb-1.5 block">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional details..."
                className="resize-none min-h-[80px]"
              />
            </div>
          )}
        </div>
      </div>
    </WindowPanel>
  );
}
