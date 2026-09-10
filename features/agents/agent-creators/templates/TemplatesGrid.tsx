"use client";

import { useState, useTransition } from "react";
import { TemplateCard } from "./TemplateCard";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast-service";
import { ArchivedDisclosure } from "@ai-matrx/design-system";

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_featured: boolean;
  use_count: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

interface TemplatesGridProps {
  templates: Template[];
}

export function TemplatesGrid({ templates }: TemplatesGridProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [usingTemplateId, setUsingTemplateId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  // THE ARCHIVED-ITEMS LAW: archived templates are hidden by default and are
  // exactly one click away — never a separate page, never impossible.
  const [showArchived, setShowArchived] = useState(false);

  const handleNavigate = (id: string, path: string) => {
    // Prevent navigation if already navigating or using a template
    if (navigatingId || usingTemplateId) return;

    setNavigatingId(id);
    startTransition(() => {
      router.push(path);
    });
  };

  const handleUseTemplate = async (id: string) => {
    if (usingTemplateId || navigatingId) return;

    setUsingTemplateId(id);

    try {
      const response = await fetch(`/api/agents/templates/${id}/use`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to use template");
      }

      const { agentId } = await response.json();

      startTransition(() => {
        // agent-link-ok: instantiating a template creates a user agent owned by this user
        router.push(`/agents/${agentId}/build`);
      });
    } catch (error) {
      console.error("Error creating agent from template:", error);
      toast.error("Failed to create agent from template. Please try again.");
      setUsingTemplateId(null);
    }
  };

  const matchesTab = (template: Template) => {
    if (activeTab === "all") return true;
    if (activeTab === "featured") return template.is_featured;
    return template.category?.toLowerCase() === activeTab.toLowerCase();
  };

  const inTab = templates.filter(matchesTab);
  const filteredTemplates = inTab.filter((t) => !t.is_archived);
  const archivedTemplates = inTab.filter((t) => t.is_archived);

  // Get unique categories — from the ACTIVE templates, so a category that
  // exists only among archived rows never opens an empty-looking tab.
  const categories = Array.from(
    new Set(
      templates
        .filter((t) => !t.is_archived)
        .map((t) => t.category)
        .filter(Boolean),
    ),
  );

  if (templates.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No templates available yet. Check back soon!
        </p>
      </div>
    );
  }

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All Templates</TabsTrigger>
          <TabsTrigger value="featured">Featured</TabsTrigger>
          {categories.map((category) => (
            <TabsTrigger key={category} value={category?.toLowerCase() || ""}>
              {category}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            id={template.id}
            name={template.name}
            description={template.description}
            category={template.category}
            isFeatured={template.is_featured}
            useCount={template.use_count}
            isArchived={template.is_archived}
            onUseTemplate={handleUseTemplate}
            onNavigate={handleNavigate}
            isNavigating={navigatingId === template.id}
            isUsingTemplate={usingTemplateId === template.id}
            isAnyProcessing={navigatingId !== null || usingTemplateId !== null}
          />
        ))}
      </div>

      {filteredTemplates.length === 0 && archivedTemplates.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No templates found in this category.
          </p>
        </div>
      )}

      <ArchivedDisclosure
        count={archivedTemplates.length}
        open={showArchived}
        onOpenChange={setShowArchived}
        className="mt-6"
        contentClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      >
        {archivedTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            id={template.id}
            name={template.name}
            description={template.description}
            category={template.category}
            isFeatured={template.is_featured}
            useCount={template.use_count}
            isArchived
            onUseTemplate={handleUseTemplate}
            onNavigate={handleNavigate}
            isNavigating={navigatingId === template.id}
            isUsingTemplate={usingTemplateId === template.id}
            isAnyProcessing={navigatingId !== null || usingTemplateId !== null}
          />
        ))}
      </ArchivedDisclosure>
    </div>
  );
}
