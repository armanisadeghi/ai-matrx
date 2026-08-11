"use client";
import { useState, useEffect } from "react";
import { updateTableMetadata } from "@/features/data-tables/service";
import { isServiceFailure } from "@/features/data-tables/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface EditTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tableId: string | null;
  initialData?: {
    table_name: string;
    description: string;
    is_public: boolean;
  };
}

export default function EditTableModal({
  isOpen,
  onClose,
  onSuccess,
  tableId,
  initialData,
}: EditTableModalProps) {
  const [tableName, setTableName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form with table data when modal opens
  useEffect(() => {
    if (isOpen && initialData) {
      setTableName(initialData.table_name || "");
      setDescription(initialData.description || "");
      setIsPublic(initialData.is_public || false);
      setError(null);
    }
  }, [isOpen, initialData]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tableId) {
      setError("No table selected");
      return;
    }

    if (!tableName.trim()) {
      setError("Table name is required");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // ONE path for table metadata — the same service call the surface's
      // `table_description` write target uses, so a hand edit and an agent
      // edit can never disagree about what a metadata write does.
      const result = await updateTableMetadata({
        tableId,
        tableName,
        description,
        isPublic,
      });

      if (isServiceFailure(result)) {
        console.error("Table metadata update failed:", result.error);
        throw new Error(result.error);
      }

      // Call success callback
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error updating table:", err);
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "object" && err !== null) {
        setError(JSON.stringify(err));
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] bg-white dark:bg-gray-950">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">
            Edit Table
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-md text-red-500 dark:text-red-400 text-sm border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label
              htmlFor="tableName"
              className="text-gray-700 dark:text-gray-300"
            >
              Table Name
            </Label>
            <Input
              id="tableName"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="e.g. Customer Data"
              required
              className="bg-textured border-gray-200 dark:border-gray-800"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="description"
              className="text-gray-700 dark:text-gray-300"
            >
              Description (optional)
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description for this table"
              rows={3}
              className="bg-textured border-gray-200 dark:border-gray-800"
            />
          </div>

          <div className="space-y-4 pt-2 border-t border-border">
            <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 pt-2">
              Access Controls
            </h3>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label
                  htmlFor="isPublic"
                  className="text-gray-700 dark:text-gray-300"
                >
                  Public Access
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Allow anyone to access this table
                </p>
              </div>
              <Switch
                id="isPublic"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 border-gray-200 dark:border-gray-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
            >
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
