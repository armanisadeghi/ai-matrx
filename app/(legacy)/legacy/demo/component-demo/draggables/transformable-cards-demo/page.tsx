'use client'
import React, { useState, useCallback } from "react";
import { DraggableCardProvider, useDraggableCard } from "@/components/ui/draggable-card-context";
import { DropContainer } from "@/components/ui/enhanced-draggable-card";
import { TransformableCard, TransformableCardContainer } from "@/components/ui/transformable-card";
import { TaskCard, TaskPill, taskIcons, pillIcons } from "./task-components";

// Container assignment display
const ContainerAssignmentDisplay = () => {
  const { positions, containers } = useDraggableCard();
  
  // Group cards by container
  const containerAssignments: Record<string, string[]> = {};
  
  // Initialize with empty arrays for all containers
  Object.keys(containers).forEach(containerId => {
    containerAssignments[containerId] = [];
  });
  
  // Add a category for unassigned cards
  containerAssignments['unassigned'] = [];
  
  // Assign cards to their containers
  Object.values(positions).forEach(position => {
    const containerId = position.containerId || 'unassigned';
    containerAssignments[containerId] = [
      ...(containerAssignments[containerId] || []),
      position.id
    ];
  });
  
  return (
    <div className="mt-8 p-4 bg-textured rounded-lg border-border">
      <h2 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Task Assignments</h2>
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(containerAssignments).map(([containerId, cardIds]) => (
          <div key={containerId} className="p-3 bg-gray-100 dark:bg-gray-700 rounded">
            <div className="font-medium mb-1 text-gray-800 dark:text-gray-200">
              {containerId === 'unassigned' 
                ? 'Unassigned' 
                : containers[containerId]?.label || 'Unknown'}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {cardIds.length === 0 
                ? 'No tasks' 
                : cardIds.map(id => <div key={id}>{id}</div>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Main demo component 
export default function TransformableCardsDemo() {
  // State to track container assignments
  const [containerAssignments, setContainerAssignments] = useState<Record<string, string | null>>({
    'task-research': null,
    'task-design': null,
    'task-development': null,
    'task-testing': null,
    'task-meeting': null,
    'task-documentation': null
  });
  
  // Handle container change
  const handleContainerChange = useCallback((cardId: string, containerId: string | null) => {
    setContainerAssignments(prev => ({
      ...prev,
      [cardId]: containerId
    }));
  }, []);
  
  return (
    <DraggableCardProvider>
      <div className="w-full min-h-dvh bg-gray-50 dark:bg-gray-900 p-8 pb-32 overflow-hidden">
        <h1 className="text-2xl font-bold mb-2 text-gray-800 dark:text-gray-200">
          Transformable Cards Demo
        </h1>
        <p className="mb-6 text-gray-600 dark:text-gray-400">
          Drag cards to containers to see them transform into pills. Click pills to release them back to card form.
        </p>
        
        {/* Free dragging area with cards */}
        <div className="relative bg-gray-100 dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-700 p-6 min-h-[550px] mb-8">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Task Board</h2>
          
          {/* Research task */}
          <TransformableCardContainer>
            <TransformableCard
              id="task-research"
              initialPosition={{ x: 50, y: 80 }}
              pillView={<TaskPill 
                title="Market Research" 
                icon={pillIcons.research} 
                priority="high"
              />}
            >
              <TaskCard 
                title="Market Research" 
                description="Conduct competitive analysis and gather user feedback for the new product features."
                icon={taskIcons.research}
                priority="high"
                dueDate="June 15"
                status="Not Started" 
              />
            </TransformableCard>
          </TransformableCardContainer>
          
          {/* Design task */}
          <TransformableCardContainer>
            <TransformableCard
              id="task-design"
              initialPosition={{ x: 370, y: 80 }}
              pillView={<TaskPill 
                title="UI Design" 
                icon={pillIcons.design}
                priority="medium" 
              />}
            >
              <TaskCard 
                title="UI Design" 
                description="Create wireframes and mockups for the dashboard interface and mobile responsive views."
                icon={taskIcons.design}
                priority="medium"
                dueDate="June 18"
                status="Not Started" 
              />
            </TransformableCard>
          </TransformableCardContainer>
          
          {/* Development task */}
          <TransformableCardContainer>
            <TransformableCard
              id="task-development"
              initialPosition={{ x: 690, y: 80 }}
              pillView={<TaskPill 
                title="Frontend Development" 
                icon={pillIcons.development}
                priority="medium" 
              />}
            >
              <TaskCard 
                title="Frontend Development" 
                description="Implement the main dashboard components and ensure they match design specifications."
                icon={taskIcons.development}
                priority="medium"
                dueDate="June 25"
                status="Not Started" 
              />
            </TransformableCard>
          </TransformableCardContainer>
          
          {/* Testing task */}
          <TransformableCardContainer>
            <TransformableCard
              id="task-testing"
              initialPosition={{ x: 50, y: 300 }}
              pillView={<TaskPill 
                title="QA Testing" 
                icon={pillIcons.testing} 
                priority="low"
              />}
            >
              <TaskCard 
                title="QA Testing" 
                description="Prepare test cases and conduct thorough testing of new features across all supported browsers."
                icon={taskIcons.testing}
                priority="low"
                dueDate="June 30"
                status="Not Started" 
              />
            </TransformableCard>
          </TransformableCardContainer>
          
          {/* Meeting task */}
          <TransformableCardContainer>
            <TransformableCard
              id="task-meeting"
              initialPosition={{ x: 370, y: 300 }}
              pillView={<TaskPill 
                title="Client Meeting" 
                icon={pillIcons.meeting}
                priority="high" 
              />}
            >
              <TaskCard 
                title="Client Meeting" 
                description="Prepare presentation and demo for the quarterly client review meeting."
                icon={taskIcons.meeting}
                priority="high"
                dueDate="June 20"
                status="Not Started" 
              />
            </TransformableCard>
          </TransformableCardContainer>
          
          {/* Documentation task */}
          <TransformableCardContainer>
            <TransformableCard
              id="task-documentation"
              initialPosition={{ x: 690, y: 300 }}
              pillView={<TaskPill 
                title="Documentation" 
                icon={pillIcons.documentation}
                priority="low" 
              />}
            >
              <TaskCard 
                title="Documentation" 
                description="Update user documentation and API reference guide with the latest features."
                icon={taskIcons.documentation}
                priority="low"
                dueDate="July 5"
                status="Not Started" 
              />
            </TransformableCard>
          </TransformableCardContainer>
        </div>
        
        {/* Container grid */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <DropContainer id="container-backlog" label="Backlog" className="min-h-[250px] p-6">
            <div className="flex flex-wrap gap-2 mt-4 p-2">
              {/* Pills will appear here when cards are dropped */}
            </div>
          </DropContainer>
          
          <DropContainer id="container-in-progress" label="In Progress" className="min-h-[250px] p-6">
            <div className="flex flex-wrap gap-2 mt-4 p-2">
              {/* Pills will appear here when cards are dropped */}
            </div>
          </DropContainer>
          
          <DropContainer id="container-completed" label="Completed" className="min-h-[250px] p-6">
            <div className="flex flex-wrap gap-2 mt-4 p-2">
              {/* Pills will appear here when cards are dropped */}
            </div>
          </DropContainer>
        </div>
        
        {/* Display container assignments */}
        <ContainerAssignmentDisplay />
      </div>
    </DraggableCardProvider>
  );
} 