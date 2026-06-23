"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Plus,
  Search,
  Users,
  Crown,
  Shield,
  User as UserIcon,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useUserOrganizations } from "../hooks";
import { OrganizationCard } from "./OrganizationCard";
import { CreateOrgModal } from "./CreateOrgModal";
import { filterAndSortBySearch } from "@/utils/search-scoring";

/**
 * OrganizationList - Main component for displaying user's organizations
 *
 * Features:
 * - Displays all organizations user belongs to
 * - Personal org shown first with special styling
 * - Role-based badges and actions
 * - Search/filter functionality
 * - Create new organization modal
 * - Loading and empty states
 */
export function OrganizationList() {
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  // Open the create modal when arriving via `?create=1` (the shell's "New Org"
  // nav action). Reuses the canonical modal — no parallel create UI.
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(
    () => searchParams?.get("create") === "1",
  );

  const { organizations, loading, error, refresh } = useUserOrganizations();

  // Filter organizations based on search
  const filteredOrgs = searchTerm
    ? filterAndSortBySearch(organizations, searchTerm, [
        { get: (o) => o.name, weight: "title" },
        { get: (o) => o.slug, weight: "subtitle" },
        { get: (o) => o.description, weight: "body" },
      ])
    : organizations;

  // Separate personal and team organizations
  const personalOrg = filteredOrgs.find((org) => org.isPersonal);
  const teamOrgs = filteredOrgs.filter((org) => !org.isPersonal);

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
        <p className="text-muted-foreground">Loading your organizations...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="p-8 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
            Failed to Load Organizations
          </h3>
          <p className="text-red-700 dark:text-red-300 mb-4">{error}</p>
          <Button onClick={refresh} variant="outline">
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  // Empty state - no organizations at all (shouldn't happen if personal org exists)
  if (organizations.length === 0) {
    return (
      <Card className="p-8 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-800 mb-4">
            <Building2 className="h-8 w-8 text-blue-600 dark:text-blue-300" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No Organizations Yet
          </h3>
          <p className="text-muted-foreground mb-6">
            Create your first organization to start collaborating with your team
          </p>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-blue-500 hover:bg-blue-600"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Organization
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search organizations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Organization
        </Button>
      </div>

      {/* Personal Organization */}
      {personalOrg && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <UserIcon className="h-4 w-4" />
            Personal Space
          </h2>
          <OrganizationCard organization={personalOrg} onUpdate={refresh} />
        </div>
      )}

      {/* Team Organizations */}
      {teamOrgs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Team Organizations {searchTerm && `(${teamOrgs.length})`}
          </h2>
          <div className="space-y-3">
            {teamOrgs.map((org) => (
              <OrganizationCard
                key={org.id}
                organization={org}
                onUpdate={refresh}
              />
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {filteredOrgs.length === 0 && searchTerm && (
        <Card className="p-8">
          <div className="text-center">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              No organizations found
            </h3>
            <p className="text-muted-foreground">
              Try adjusting your search terms
            </p>
          </div>
        </Card>
      )}

      {/* Create Organization Modal */}
      <CreateOrgModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={refresh}
      />
    </div>
  );
}
