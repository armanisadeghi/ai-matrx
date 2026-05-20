"use client";

import React, { useState, useEffect, useMemo } from "react";
import { MobileOverlayWrapper } from "@/components/official/MobileOverlayWrapper";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { Search, FileText, Globe, Lock, Tag, Filter, X } from "lucide-react";
import {
  MessageRole,
  ContentTemplateDB,
} from "@/features/content-templates/types/content-templates-db";
import {
  fetchContentTemplates,
  getAllTags,
} from "@/features/content-templates/services/content-templates-service";
import { useToast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type { ContentSource } from "@/features/rich-document/types";

interface TemplateBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  role?: MessageRole;
  onSelectTemplate: (content: string) => void;
}

const MESSAGE_ROLES: { value: MessageRole | "all"; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
  { value: "tool", label: "Tool" },
];

export function TemplateBrowserModal({
  isOpen,
  onClose,
  role,
  onSelectTemplate,
}: TemplateBrowserModalProps) {
  const [templates, setTemplates] = useState<ContentTemplateDB[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTemplate, setSelectedTemplate] =
    useState<ContentTemplateDB | null>(null);
  const [selectedRole, setSelectedRole] = useState<MessageRole | "all">(
    role || "all",
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagSearchOpen, setTagSearchOpen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isOpen) {
      // Reset role to the default when modal opens
      setSelectedRole(role || "all");
      setSelectedTags([]);
      loadTemplates();
      loadTags();
    }
  }, [isOpen, role]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await fetchContentTemplates({
        order_by: "updated_at",
        order_direction: "desc",
      });
      setTemplates(data);
    } catch (error) {
      console.error("Error loading templates:", error);
      toast({
        title: "Error",
        description: "Failed to load templates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const tags = await getAllTags();
      setAvailableTags(tags);
    } catch (error) {
      console.error("Error loading tags:", error);
    }
  };

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      // Role filter
      const matchesRole =
        selectedRole === "all" || template.role === selectedRole;

      // Search filter
      const matchesSearch =
        searchTerm === "" ||
        template.label?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.tags?.some((tag) =>
          tag.toLowerCase().includes(searchTerm.toLowerCase()),
        );

      // Tag filter - template must have ALL selected tags
      const matchesTags =
        selectedTags.length === 0 ||
        (template.tags &&
          selectedTags.every((selectedTag) =>
            template.tags?.includes(selectedTag),
          ));

      return matchesRole && matchesSearch && matchesTags;
    });
  }, [templates, searchTerm, selectedRole, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const clearFilters = () => {
    setSelectedRole(role || "all");
    setSelectedTags([]);
    setSearchTerm("");
  };

  const handleSelect = () => {
    if (selectedTemplate && selectedTemplate.content) {
      onSelectTemplate(selectedTemplate.content);
      onClose();
      setSelectedTemplate(null);
      setSearchTerm("");
    }
  };

  const handleClose = () => {
    setSelectedTemplate(null);
    setSearchTerm("");
    onClose();
  };

  const content = (
    <div className="flex flex-col h-full">
      {/* Search and Filters */}
      <div className="p-4 border-b border-border/50 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search content templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Role and Tag Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Role Filter */}
          <Select
            value={selectedRole}
            onValueChange={(value) =>
              setSelectedRole(value as MessageRole | "all")
            }
          >
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Message Type" />
            </SelectTrigger>
            <SelectContent>
              {MESSAGE_ROLES.map((roleOption) => (
                <SelectItem key={roleOption.value} value={roleOption.value}>
                  {roleOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tag Filter */}
          <Popover
            modal={true}
            open={tagSearchOpen}
            onOpenChange={setTagSearchOpen}
          >
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <Tag className="w-3 h-3 mr-1" />
                Tags {selectedTags.length > 0 && `(${selectedTags.length})`}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[200px] p-0"
              align="start"
              onWheel={(e) => e.stopPropagation()}
            >
              <Command>
                <CommandInput placeholder="Search tags..." />
                <CommandEmpty>No tags found.</CommandEmpty>
                <CommandGroup className="max-h-[200px] overflow-y-auto overscroll-contain">
                  {availableTags.map((tag) => (
                    <CommandItem
                      key={tag}
                      onSelect={() => toggleTag(tag)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <div
                        className={`w-4 h-4 rounded border ${selectedTags.includes(tag) ? "bg-primary border-primary" : "border-input"} flex items-center justify-center`}
                      >
                        {selectedTags.includes(tag) && (
                          <div className="w-2 h-2 bg-primary-foreground rounded-sm" />
                        )}
                      </div>
                      {tag}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Clear Filters */}
          {(selectedRole !== (role || "all") ||
            selectedTags.length > 0 ||
            searchTerm) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={clearFilters}
            >
              <X className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Active Tag Badges */}
        {selectedTags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {selectedTags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs cursor-pointer hover:bg-secondary/80"
                onClick={() => toggleTag(tag)}
              >
                {tag}
                <X className="w-3 h-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Template List & Preview */}
      <div className="flex-1 overflow-hidden">
        {selectedTemplate ? (
          // Preview Mode
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-border/50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate">
                    {selectedTemplate.label}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      {selectedTemplate.role}
                    </Badge>
                    {selectedTemplate.is_public ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Globe className="w-3 h-3" />
                        Public
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="w-3 h-3" />
                        Private
                      </div>
                    )}
                  </div>
                  {selectedTemplate.tags &&
                    selectedTemplate.tags.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {selectedTemplate.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-xs"
                          >
                            <Tag className="w-3 h-3 mr-1" />
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                </div>
                <Button
                  size="sm"
                  onClick={() => setSelectedTemplate(null)}
                  variant="outline"
                >
                  Back
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <RichDocument
                  content={selectedTemplate.content || ""}
                  source={{ type: "raw" } as ContentSource}
                  actionsVariant="icon-only"
                  actionsPosition="top-right"
                  actionsBehavior="hover-only"
                  actions={{ exclude: ["announcements", "preferences"] }}
                />
              </div>
            </ScrollArea>
            <div className="p-4 border-t border-border/50">
              <Button onClick={handleSelect} className="w-full">
                Use This Template
              </Button>
            </div>
          </div>
        ) : (
          // List Mode
          <div className="h-full flex flex-col">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                Loading templates...
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No templates found</p>
                {(searchTerm ||
                  selectedTags.length > 0 ||
                  selectedRole !== (role || "all")) && (
                  <p className="text-sm mt-2">Try adjusting your filters</p>
                )}
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-2">
                  {filteredTemplates.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => setSelectedTemplate(template)}
                      className="p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                            <h4 className="font-medium text-sm truncate">
                              {template.label}
                            </h4>
                            <Badge
                              variant="outline"
                              className="text-xs flex-shrink-0"
                            >
                              {template.role}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 break-words">
                            {template.content}
                          </p>
                          {template.tags && template.tags.length > 0 && (
                            <div className="flex items-center gap-1 mt-2 flex-wrap">
                              {template.tags.slice(0, 3).map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {tag}
                                </Badge>
                              ))}
                              {template.tags.length > 3 && (
                                <span className="text-xs text-muted-foreground">
                                  +{template.tags.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          {template.is_public ? (
                            <Globe className="w-4 h-4 text-green-500" />
                          ) : (
                            <Lock className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MobileOverlayWrapper
        isOpen={isOpen}
        onClose={handleClose}
        title="Content Templates"
        description={
          role
            ? `${role.charAt(0).toUpperCase() + role.slice(1)} content templates`
            : "Select a template"
        }
        maxHeight="xl"
      >
        {content}
      </MobileOverlayWrapper>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl w-[90vw] h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-3 border-b border-border/50 flex-shrink-0">
          <DialogTitle>Content Templates</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto min-h-0">{content}</div>
      </DialogContent>
    </Dialog>
  );
}
