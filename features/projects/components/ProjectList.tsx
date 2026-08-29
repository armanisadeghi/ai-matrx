'use client';

import React, { useState } from 'react';
import { Puzzle, Plus, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useOrgProjects, usePersonalProjects } from '../hooks';
import { ProjectCard } from './ProjectCard';
import { CreateProjectModal } from './CreateProjectModal';
import { filterAndSortBySearch } from '@ai-matrx/kit/search-scoring';

interface ProjectListProps {
  organizationId?: string | null;
  orgSlug?: string | null;
  canCreate?: boolean;
}

export function ProjectList({ organizationId, orgSlug, canCreate = false }: ProjectListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const orgResult = useOrgProjects(organizationId ?? undefined);
  const personalResult = usePersonalProjects();

  const { projects, loading, error, refresh } = organizationId ? orgResult : personalResult;

  const filteredProjects = searchTerm
    ? filterAndSortBySearch(projects, searchTerm, [
        { get: (p) => p.name, weight: 'title' },
        { get: (p) => p.slug, weight: 'subtitle' },
        { get: (p) => p.description, weight: 'body' },
      ])
    : projects;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-4" />
        <p className="text-muted-foreground">Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
            Failed to Load Projects
          </h3>
          <p className="text-red-700 dark:text-red-300 mb-4">{error}</p>
          <Button onClick={refresh} variant="outline">
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <>
        <Card className="p-8 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-indigo-200 dark:border-indigo-800">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-800 mb-4">
              <Puzzle className="h-8 w-8 text-indigo-600 dark:text-indigo-300" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Projects Yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first project to start organizing team work
            </p>
            {canCreate && (
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            )}
          </div>
        </Card>
        {canCreate && (
          <CreateProjectModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onSuccess={refresh}
            organizationId={organizationId}
            orgSlug={orgSlug}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        {canCreate && (
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        )}
      </div>

      {filteredProjects.length > 0 ? (
        <div className="space-y-3">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              orgSlug={orgSlug}
              onUpdate={refresh}
            />
          ))}
        </div>
      ) : (
        <Card className="p-8">
          <div className="text-center">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No projects found</h3>
            <p className="text-muted-foreground">Try adjusting your search terms</p>
          </div>
        </Card>
      )}

      {canCreate && (
        <CreateProjectModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={refresh}
          organizationId={organizationId}
          orgSlug={orgSlug}
        />
      )}
    </div>
  );
}

