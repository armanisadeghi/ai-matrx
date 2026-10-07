"use client";

import { useEffect, useState } from "react";
import { Loader2, Notebook } from "lucide-react";
import { listAccessibleWorkbooks } from "@/features/workbooks/workbook-service";
import { isServiceFailure, type Workbook } from "@/features/data-tables/types";
import { filterAndSortBySearch } from "@ai-matrx/kit/search-scoring";
import { usePickerInputFocus } from "./usePickerInputFocus";
import {
  PickerEmpty,
  PickerRow,
  PickerSearchField,
  PickerView,
  PickerViewBody,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface WorkbooksResourcePickerProps {
  onBack: () => void;
  onSelect: (workbook: Workbook) => void;
}

export function WorkbooksResourcePicker({
  onBack,
  onSelect,
}: WorkbooksResourcePickerProps) {
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const searchInputRef = usePickerInputFocus();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await listAccessibleWorkbooks();
      if (cancelled) return;
      if (isServiceFailure(result)) {
        setError(result.error);
        setWorkbooks([]);
      } else {
        setError(null);
        setWorkbooks(result.data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredWorkbooks = searchQuery.trim()
    ? filterAndSortBySearch(workbooks, searchQuery, [
        { get: (w) => w.workbook_name, weight: "title" },
        { get: (w) => w.description, weight: "body" },
      ])
    : workbooks;

  return (
    <PickerView>
      <ResourcePickerSubViewHeader
        onBack={onBack}
        search={
          <PickerSearchField
            ref={searchInputRef}
            placeholder="Search workbooks"
            value={searchQuery}
            onChange={setSearchQuery}
          />
        }
      />
      <PickerViewBody>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="px-3 py-10 text-center text-sm text-destructive">
            {error}
            <ErrorAlchemyMenu error={error} />
          </div>
        ) : filteredWorkbooks.length === 0 ? (
          <PickerEmpty>
            {searchQuery ? "No workbooks found" : "No workbooks yet"}
          </PickerEmpty>
        ) : (
          filteredWorkbooks.map((workbook) => (
            <PickerRow
              key={workbook.id}
              icon={Notebook}
              iconClassName="text-primary"
              label={workbook.workbook_name}
              trailing={
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {new Date(workbook.updated_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              }
              onClick={() => onSelect(workbook)}
            />
          ))
        )}
      </PickerViewBody>
    </PickerView>
  );
}
