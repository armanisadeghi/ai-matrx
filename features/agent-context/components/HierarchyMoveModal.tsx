'use client';

import { useState, useMemo } from 'react';
import { Building2, FolderKanban, ListTodo, TreePine } from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useMoveProject,
  useMoveTask,
} from '../hooks/useHierarchy';
import type { HierarchyNode, HierarchyNodeType } from '../service/hierarchyService';

const ICONS: Record<HierarchyNodeType, React.ComponentType<{ className?: string }>> = {
  user: Building2,
  organization: Building2,
  project: FolderKanban,
  task: ListTodo,
};

type Props = {
  nodeToMove: HierarchyNode;
  tree: HierarchyNode[];
  onClose: () => void;
};

// Compute valid targets and flatten them with depth
function getValidTargets(tree: HierarchyNode[], typeToMove: HierarchyNodeType, idToMove: string) {
  const result: { node: HierarchyNode; depth: number }[] = [];

  function traverse(node: HierarchyNode, depth: number, isInvalidBranch: boolean) {
    const invalid = isInvalidBranch || node.id === idToMove;

    if (!invalid) {
      if (typeToMove === 'project' && node.type === 'organization') {
        result.push({ node, depth });
      } else if (typeToMove === 'task' && (node.type === 'project' || node.type === 'task')) {
        if (node.id !== 'unassigned-projects' && node.id !== 'orphan-tasks') {
          result.push({ node, depth });
        }
      }
    }

    node.children.forEach(child => traverse(child, depth + 1, invalid));
  }

  tree.forEach(root => traverse(root, 0, false));
  return result;
}

export function HierarchyMoveModal({ nodeToMove, tree, onClose }: Props) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  const moveProj = useMoveProject();
  const moveTask = useMoveTask();

  const isPending = moveProj.isPending || moveTask.isPending;

  const validTargets = useMemo(() => getValidTargets(tree, nodeToMove.type, nodeToMove.id), [tree, nodeToMove]);

  const handleSubmit = () => {
    if (!selectedTargetId) return;

    const targetNode = validTargets.find(t => t.node.id === selectedTargetId)?.node;
    if (!targetNode) return;

    if (nodeToMove.type === 'project') {
      const orgId = targetNode.type === 'organization' ? targetNode.id : (targetNode.meta?.organization_id as string);
      moveProj.mutate({
        projectId: nodeToMove.id,
        target: {
          organization_id: orgId,
        }
      }, { onSuccess: onClose });
    } else if (nodeToMove.type === 'task') {
      moveTask.mutate({
        taskId: nodeToMove.id,
        target: {
          project_id: targetNode.type === 'project' ? targetNode.id : null, 
          parent_task_id: targetNode.type === 'task' ? targetNode.id : null,
        }
      }, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <TreePine className="h-4 w-4" />
            Move {nodeToMove.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Select a new location for this {nodeToMove.type}.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-2 px-2 h-[400px]">
          {validTargets.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              No valid targets found.
            </div>
          ) : (
            <div className="space-y-1">
              {validTargets.map(({ node, depth }) => {
                const Icon = ICONS[node.type];
                const isSelected = selectedTargetId === node.id;
                return (
                  <button
                    key={node.id}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors hover:bg-muted ${
                      isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : ''
                    }`}
                    style={{ paddingLeft: `${depth * 16 + 8}px` }}
                    onClick={() => setSelectedTargetId(node.id)}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1 font-medium">{node.name}</span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground shrink-0 opacity-50 px-1 border rounded bg-background">
                      {node.type}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="mt-4 pt-4 border-t">
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="text-xs"
            onClick={handleSubmit}
            disabled={!selectedTargetId || isPending}
          >
            {isPending ? 'Moving...' : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
