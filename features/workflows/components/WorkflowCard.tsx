'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkflowIcon, Calendar, Tag } from "lucide-react";
import { Workflow } from '@/lib/redux/workflow/types';
import { ShareButton } from "@/features/sharing";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

interface WorkflowCardProps {
  workflow: Workflow;
}

export function WorkflowCard({ workflow }: WorkflowCardProps) {
  const currentUserId = useAppSelector(selectUserId);
  const isOwner = Boolean(
    currentUserId && (workflow as { user_id?: string | null }).user_id === currentUserId,
  );
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <Link href={`/workflows/${workflow.id}`} className="block">
      <Card className="group hover:shadow-lg transition-all duration-200 border border-blue-200 dark:border-blue-800 hover:border-primary/20 dark:hover:border-primary/20 cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <WorkflowIcon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg group-hover:text-primary transition-colors">
                  {workflow.name}
                </CardTitle>
                {workflow.category && (
                  <div className="flex items-center gap-1 mt-1">
                    <Tag className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{workflow.category}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Description */}
          {workflow.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {workflow.description}
            </p>
          )}

          {/* Tags */}
          {workflow.tags && workflow.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {workflow.tags.slice(0, 3).map((tag, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {workflow.tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{workflow.tags.length - 3} more
                </Badge>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {/* Note: We'll need created_at/updated_at in the WorkflowData type */}
              <span>Recently updated</span>
            </div>
            
            <div className="flex items-center gap-1">
              {isOwner && (
                <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                  <ShareButton
                    resourceType="workflow"
                    resourceId={workflow.id}
                    resourceName={workflow.name}
                    isOwner={true}
                    variant="ghost"
                    size="icon"
                    showStatus={false}
                  />
                </div>
              )}
              <Button size="sm" variant="outline" className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                Open
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
} 