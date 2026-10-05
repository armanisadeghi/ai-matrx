"use client";

import React from "react";
import StructuredSectionCard from "@/components/official/StructuredSectionCard";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  Download, 
  Edit, 
  Plus, 
  Save, 
  Settings, 
  Trash
} from "lucide-react";

export default function StructuredSectionCardDemo() {
  return (
    <div className="container mx-auto py-8 space-y-8">
      <h1 className="text-2xl font-bold mb-6">Structured Section Card Demo</h1>
      
      {/* Example 1: Basic usage with header actions */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Example 1: Basic with Header Actions</h2>
        <StructuredSectionCard
          title="Project Settings"
          description="Configure your project properties and options"
          headerActions={[
            <Button icon={<Settings />} type="submit" key="settings" variant="outline">
              Settings
            </Button>,
            <Button icon={<Plus />} type="submit" key="new" variant="primary">
              New Project
            </Button>
          ]}
        >
          <div className="py-12 text-center text-gray-500 dark:text-gray-400">
            Content area for your main information and forms
          </div>
        </StructuredSectionCard>
      </div>
      
      {/* Example 2: With footer navigation */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Example 2: Step Navigation with Footer</h2>
        <StructuredSectionCard
          title="Step 2: User Details"
          description="Enter user information to continue"
          footerLeft={
            <Button icon={<ArrowLeft />} type="submit" variant="outline">
              Previous
            </Button>
          }
          footerRight={
            <Button iconEnd={<ArrowRight />} type="submit" variant="primary">
              Next
            </Button>
          }
        >
          <div className="py-12 text-center text-gray-500 dark:text-gray-400">
            Form fields would go here
          </div>
        </StructuredSectionCard>
      </div>
      
      {/* Example 3: Complex with all sections */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Example 3: Full Example with All Sections</h2>
        <StructuredSectionCard
          title="Document Editor"
          description="Edit document properties and content"
          headerActions={[
            <Button icon={<Edit />} type="submit" key="edit" variant="quiet">
              Edit
            </Button>,
            <Button icon={<Download />} type="submit" key="download" variant="outline">
              Download
            </Button>,
            <Button icon={<Save />} type="submit" key="save" variant="primary">
              Save
            </Button>
          ]}
          footerLeft={
            <Button icon={<Trash />} type="submit" variant="outline">
              Delete
            </Button>
          }
          footerCenter={
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Last edited: Today at 2:30pm
            </div>
          }
          footerRight={
            <Button icon={<Check />} type="submit" variant="primary">
              Publish
            </Button>
          }
        >
          <div className="py-12 text-center text-gray-500 dark:text-gray-400">
            Document editor would go here with all its controls and features
          </div>
        </StructuredSectionCard>
      </div>
      
      {/* Example 4: Mobile-friendly demo */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Example 4: Mobile Responsiveness Test</h2>
        <div className="max-w-sm mx-auto">
          <StructuredSectionCard
            title="Mobile View"
            description="This card is constrained to a narrow width to demonstrate responsive behavior"
            headerActions={[
              <Button type="submit" key="action" variant="primary">
                <Plus className="h-4 w-4" />
              </Button>
            ]}
            footerLeft={<Button type="submit" variant="outline">Cancel</Button>}
            footerCenter={<Button type="submit" variant="outline">Save Draft</Button>}
            footerRight={<Button type="submit" variant="primary">Submit</Button>}
          >
            <div className="py-6 text-center text-gray-500 dark:text-gray-400">
              Notice how the footer items stack on narrow screens
            </div>
          </StructuredSectionCard>
        </div>
      </div>
    </div>
  );
}