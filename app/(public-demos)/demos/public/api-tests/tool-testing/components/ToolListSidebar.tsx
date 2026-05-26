'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Globe,
  Database,
  FileText,
  Code,
  Wrench,
  Loader2,
  Package,
  type LucideIcon,
} from 'lucide-react';
import type { ToolDefinition } from '@/features/tool-call-visualization/testing/types';
import { filterAndSortBySearch } from '@/utils/search-scoring';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  web: Globe,
  data: Database,
  text: FileText,
  code: Code,
};

interface ToolListSidebarProps {
  tools: ToolDefinition[];
  loading: boolean;
  selectedTool: string | null;
  onSelectTool: (toolName: string) => void;
}

export function ToolListSidebar({
  tools,
  loading,
  selectedTool,
  onSelectTool,
}: ToolListSidebarProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    tools.forEach((t) => {
      if (t.category) cats.add(t.category);
    });
    return Array.from(cats).sort();
  }, [tools]);

  const filtered = useMemo(() => {
    let result = tools;
    if (activeCategory) {
      result = result.filter((t) => t.category === activeCategory);
    }
    if (search.trim()) {
      result = filterAndSortBySearch(result, search, [
        { get: (t) => t.name, weight: 'title' },
        { get: (t) => t.description, weight: 'body' },
        { get: (t) => t.tags, weight: 'tag' },
      ]);
    }
    return result;
  }, [tools, activeCategory, search]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-2 space-y-2 border-b">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-xs font-semibold">
            Tools{' '}
            <span className="text-muted-foreground font-normal">({tools.length})</span>
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools..."
            className="h-7 text-xs pl-7"
          />
        </div>
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="flex-shrink-0 px-2 py-1.5 border-b">
          <div className="flex flex-wrap gap-1">
            <Badge
              variant={activeCategory === null ? 'default' : 'outline'}
              className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-primary/10 transition-colors"
              onClick={() => setActiveCategory(null)}
            >
              All
            </Badge>
            {categories.map((cat) => (
              <Badge
                key={cat}
                variant={activeCategory === cat ? 'default' : 'outline'}
                className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() =>
                  setActiveCategory(activeCategory === cat ? null : cat)
                }
              >
                {cat}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Tool list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-1.5 space-y-0.5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              {tools.length === 0 ? 'No tools loaded' : 'No tools match your search'}
            </div>
          ) : (
            filtered.map((tool) => {
              const Icon: LucideIcon = (tool.category ? CATEGORY_ICONS[tool.category] : undefined) ?? Wrench;
              const isSelected = selectedTool === tool.name;
              return (
                <button
                  key={tool.name}
                  onClick={() => onSelectTool(tool.name)}
                  className={`w-full text-left px-2 py-1.5 rounded-md transition-colors text-xs cursor-pointer ${
                    isSelected
                      ? 'bg-primary/10 border border-primary/20 text-foreground'
                      : 'hover:bg-muted border border-transparent text-foreground/80'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">{tool.name}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1 pl-[18px]">
                    {tool.description}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
