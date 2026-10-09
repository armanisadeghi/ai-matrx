'use client';

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import React, { useState } from 'react';
import { X, Plus, Copy, Check, Zap, ChevronDown, ChevronUp, ListFilter } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { isUuidShape } from "@ai-matrx/kit/uuid";

const UUIDArrayField = () => {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
    const [inputValue, setInputValue] = useState('');
    const [uuids, setUuids] = useState<string[]>([]);
    const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showExternal, setShowExternal] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // UUID validation regex

    const generateUUID = () => {
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        setInputValue(uuid);
    };

    const handleAdd = (e?: React.SyntheticEvent) => {
        e?.preventDefault();

        if (!inputValue.trim()) return;

        if (!isUuidShape(inputValue)) {
            toast.error('Please enter a valid UUID');
            return;
        }

        if (!uuids.includes(inputValue)) {
            setUuids([...uuids, inputValue]);
            setInputValue('');
        }
    };

  const handleRemove = (uuid: string, e?: React.SyntheticEvent) => {
    e?.stopPropagation();
        setUuids(uuids.filter(v => v !== uuid));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd(e);
        }
    };

  const copyToClipboard = async (uuid: string, e?: React.SyntheticEvent) => {
    e?.stopPropagation();
          if (!(await copyText(uuid, undefined, "Couldn't copy to the clipboard — select the UUID and copy it by hand."))) return;
          setCopiedId(uuid);
          setTimeout(() => setCopiedId(null), 2000);
    };

    return (
    <div className="space-y-2">
      <div className="relative">
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Add UUID..."
          className="font-mono text-sm pr-28"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                        <Button
                            icon={<Zap />} aria-label="Generate UUID"
                            type="button"
                            variant="quiet"
                            onClick={generateUUID}
                            title="Generate UUID"
                        />
                        <Button
                            icon={<Plus />} aria-label="Add UUID"
                            type="button"
                            variant="quiet"
            onClick={handleAdd}
            title="Add UUID"
            disabled={!inputValue}
          />
          <Button
            icon={showExternal ? <ChevronUp /> : <ChevronDown />} aria-label={showExternal ? "Show inline" : "Show external"}
            type="button"
            variant="quiet"
            onClick={() => setShowExternal(!showExternal)}
            title={showExternal ? "Show inline" : "Show external"}
          />
        </div>

        {/* Inline Dropdown */}
        {!showExternal && uuids.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md z-10">
            <div className="p-2 border-b flex justify-between items-center">
              <span className="text-sm font-medium">
                {uuids.length} UUID{uuids.length !== 1 ? 's' : ''} stored
              </span>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {uuids.map((uuid) => (
                <div
                  key={uuid}
                  className="flex items-center justify-between px-3 py-2 hover:bg-accent"
                >
                  <span className="font-mono text-sm truncate">{uuid}</span>
                  <div className="flex gap-1 ml-2">
                    <Button
                      variant="quiet"
                      onClick={(e) => copyToClipboard(uuid, e)}
                    >
                      {copiedId === uuid ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={(e) => handleRemove(uuid, e)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* External View */}
      {showExternal && uuids.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {uuids.map((uuid) => (
            <div
              key={uuid}
              className="bg-secondary text-secondary-foreground px-3 py-1 rounded-md flex items-center gap-2 font-mono text-sm"
            >
              <span className="truncate max-w-48">{uuid}</span>
              <div className="flex gap-1">
                <Button
                  variant="quiet"
                  onClick={(e) => copyToClipboard(uuid, e)}
                >
                  {copiedId === uuid ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  variant="quiet"
                  onClick={(e) => handleRemove(uuid, e)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UUIDArrayField;
