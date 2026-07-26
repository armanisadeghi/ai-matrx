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
            <Button key="settings" size="sm" variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>,
            <Button key="new" size="sm" variant="default">
              <Plus className="h-4 w-4 mr-2" />
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
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
          }
          footerRight={
            <Button size="sm">
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
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
            <Button key="edit" size="sm" variant="ghost">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>,
            <Button key="download" size="sm" variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>,
            <Button key="save" size="sm" variant="default">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          ]}
          footerLeft={
            <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600 border-red-200 hover:border-red-400 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20">
              <Trash className="h-4 w-4 mr-2" />
              Delete
            </Button>
          }
          footerCenter={
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Last edited: Today at 2:30pm
            </div>
          }
          footerRight={
            <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800">
              <Check className="h-4 w-4 mr-2" />
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
              <Button key="action" size="sm" variant="default">
                <Plus className="h-4 w-4" />
              </Button>
            ]}
            footerLeft={<Button size="sm" variant="outline">Cancel</Button>}
            footerCenter={<Button size="sm" variant="secondary">Save Draft</Button>}
            footerRight={<Button size="sm">Submit</Button>}
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