"use client";

import { useEffect, useState } from "react";
import { Loader2, FileText } from "lucide-react";
import { listAccessibleDocuments } from "@/features/documents/document-service";
import {
  isServiceFailure,
  type DocumentRow,
} from "@/features/data-tables/types";
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

interface DocumentsResourcePickerProps {
  onBack: () => void;
  onSelect: (document: DocumentRow) => void;
}

export function DocumentsResourcePicker({
  onBack,
  onSelect,
}: DocumentsResourcePickerProps) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const searchInputRef = usePickerInputFocus();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await listAccessibleDocuments();
      if (cancelled) return;
      if (isServiceFailure(result)) {
        setError(result.error);
        setDocuments([]);
      } else {
        setError(null);
        setDocuments(result.data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredDocuments = searchQuery.trim()
    ? filterAndSortBySearch(documents, searchQuery, [
        { get: (d) => d.document_name, weight: "title" },
        { get: (d) => d.description, weight: "body" },
      ])
    : documents;

  return (
    <PickerView>
      <ResourcePickerSubViewHeader
        onBack={onBack}
        search={
          <PickerSearchField
            ref={searchInputRef}
            placeholder="Search documents"
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
        ) : filteredDocuments.length === 0 ? (
          <PickerEmpty>
            {searchQuery ? "No documents found" : "No documents yet"}
          </PickerEmpty>
        ) : (
          filteredDocuments.map((document) => (
            <PickerRow
              key={document.id}
              icon={FileText}
              iconClassName="text-primary"
              label={document.document_name}
              trailing={
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {new Date(document.updated_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              }
              onClick={() => onSelect(document)}
            />
          ))
        )}
      </PickerViewBody>
    </PickerView>
  );
}
