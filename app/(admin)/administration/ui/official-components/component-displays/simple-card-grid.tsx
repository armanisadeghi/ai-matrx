'use client';
import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { CardGrid } from '@/components/official/cards/CardGrid';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Home, User, Settings, Mail, FileText, Bell } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function CardGridDemo({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // Example code for basic grid
  const basicCode = `import { CardGrid } from '@/components/official/cards/CardGrid';
import { Home, User, Settings } from 'lucide-react';

// Basic card grid with navigation links
const cards = [
  { icon: <Home className="h-12 w-12" />, title: "Dashboard", href: "/dashboard" },
  { icon: <User className="h-12 w-12" />, title: "Profile", href: "/profile" },
  { icon: <Settings className="h-12 w-12" />, title: "Settings", href: "/settings" },
];

<CardGrid cards={cards} />`;

  // Example code for grid with title and description
  const withHeaderCode = `import { CardGrid } from '@/components/official/cards/CardGrid';
import { Mail, FileText, Bell } from 'lucide-react';

// Card grid with header
const cards = [
  { 
    icon: <Mail className="h-12 w-12" />, 
    title: "Inbox", 
    description: "View and manage your emails",
    href: "/inbox" 
  },
  { 
    icon: <FileText className="h-12 w-12" />, 
    title: "Documents", 
    description: "Access your files and folders",
    href: "/documents" 
  },
  { 
    icon: <Bell className="h-12 w-12" />, 
    title: "Notifications", 
    description: "Stay updated with alerts",
    href: "/notifications" 
  },
];

<CardGrid 
  title="Your Workspace"
  description="Access all your tools and resources"
  cards={cards}
  columns={3}
/>`;

  // Example code for interactive grid
  const interactiveCode = `import { CardGrid } from '@/components/official/cards/CardGrid';
import { Home, User, Settings, Mail } from 'lucide-react';

// Interactive card grid with mixed links and click handlers
const cards = [
  { 
    icon: <Home className="h-12 w-12" />, 
    title: "Dashboard", 
    href: "/dashboard" 
  },
  { 
    icon: <User className="h-12 w-12" />, 
    title: "Add User", 
    onClick: () => console.log('Add user clicked') 
  },
  { 
    icon: <Settings className="h-12 w-12" />, 
    title: "Settings", 
    href: "/settings" 
  },
  { 
    icon: <Mail className="h-12 w-12" />, 
    title: "Compose", 
    onClick: () => console.log('Compose clicked') 
  },
];

<CardGrid cards={cards} columns={2} />`;

  // Example code for fully customized grid with all props
  const fullCode = `import { CardGrid } from '@/components/official/cards/CardGrid';
import { Home, User, Settings, Mail, FileText, Bell } from 'lucide-react';

// Fully customized card grid with all available props
const cards = [
  { 
    icon: <Home className="h-12 w-12" />, 
    title: "Dashboard", 
    description: "Your personal command center",
    href: "/dashboard",
    className: "bg-gradient-to-br from-green-100 to-blue-100 dark:from-green-900 dark:to-blue-900",
    descriptionClassName: "text-sm font-medium"
  },
  { 
    icon: <User className="h-12 w-12" />, 
    title: "Team", 
    description: "Manage your team members",
    onClick: () => console.log('Team clicked'),
    iconClassName: "text-orange-500",
    titleClassName: "text-orange-600"
  },
  { 
    icon: <Settings className="h-12 w-12" />, 
    title: "Settings", 
    description: "Configure your preferences",
    href: "/settings",
    className: "border-purple-400 hover:border-purple-600"
  },
  { 
    icon: <Mail className="h-12 w-12" />, 
    title: "Messages", 
    description: "Stay connected with your network",
    href: "/messages",
    descriptionClassName: "text-sm italic"
  },
  {
    icon: <FileText className="h-12 w-12" />,
    title: "Reports",
    description: "View analytics and insights",
    onClick: () => console.log('Reports clicked')
  },
  {
    icon: <Bell className="h-12 w-12" />,
    title: "Alerts",
    description: "Critical system notifications",
    href: "/alerts",
    className: "bg-red-50 dark:bg-red-950"
  }
];

<CardGrid 
  title={<span className="text-4xl">My Enterprise Dashboard</span>}
  description={<p className="text-lg">Welcome back! Here's what you can do today.</p>}
  cards={cards}
  columns={3}
  className="shadow-xl rounded-2xl p-8"
  headerClassName="text-left pb-12"
  titleClassName="text-blue-900 dark:text-blue-100"
  descriptionClassName="text-gray-700 dark:text-gray-300"
  contentClassName="p-6"
  gridClassName="gap-8"
/>`;

  // Basic cards
  const basicCards = [
    { icon: <Home className="h-12 w-12" />, title: "Dashboard", href: "/dashboard" },
    { icon: <User className="h-12 w-12" />, title: "Profile", href: "/profile" },
    { icon: <Settings className="h-12 w-12" />, title: "Settings", href: "/settings" },
  ];

  // Cards with descriptions
  const headerCards = [
    { 
      icon: <Mail className="h-12 w-12" />, 
      title: "Inbox", 
      description: "View and manage your emails",
      href: "/inbox" 
    },
    { 
      icon: <FileText className="h-12 w-12" />, 
      title: "Documents", 
      description: "Access your files and folders",
      href: "/documents" 
    },
    { 
      icon: <Bell className="h-12 w-12" />, 
      title: "Notifications", 
      description: "Stay updated with alerts",
      href: "/notifications" 
    },
  ];

  // Interactive cards
  const interactiveCards = [
    { 
      icon: <Home className="h-12 w-12" />, 
      title: "Dashboard", 
      href: "/dashboard" 
    },
    { 
      icon: <User className="h-12 w-12" />, 
      title: "Add User", 
      onClick: () => alert('Add user clicked') 
    },
    { 
      icon: <Settings className="h-12 w-12" />, 
      title: "Settings", 
      href: "/settings" 
    },
    { 
      icon: <Mail className="h-12 w-12" />, 
      title: "Compose", 
      onClick: () => alert('Compose clicked') 
    },
  ];

  // Fully customized cards
  const fullCards = [
    { 
      icon: <Home className="h-12 w-12" />, 
      title: "Dashboard", 
      description: "Your personal command center",
      href: "/dashboard",
      className: "bg-gradient-to-br from-green-100 to-blue-100 dark:from-green-900 dark:to-blue-900",
      descriptionClassName: "text-sm font-medium"
    },
    { 
      icon: <User className="h-12 w-12" />, 
      title: "Team", 
      description: "Manage your team members",
      onClick: () => alert('Team clicked'),
      iconClassName: "text-orange-500",
      titleClassName: "text-orange-600"
    },
    { 
      icon: <Settings className="h-12 w-12" />, 
      title: "Settings", 
      description: "Configure your preferences",
      href: "/settings",
      className: "border-purple-400 hover:border-purple-600"
    },
    { 
      icon: <Mail className="h-12 w-12" />, 
      title: "Messages", 
      description: "Stay connected with your network",
      href: "/messages",
      descriptionClassName: "text-sm italic"
    },
    {
      icon: <FileText className="h-12 w-12" />,
      title: "Reports",
      description: "View analytics and insights",
      onClick: () => alert('Reports clicked')
    },
    {
      icon: <Bell className="h-12 w-12" />,
      title: "Alerts",
      description: "Critical system notifications",
      href: "/alerts",
      className: "bg-red-50 dark:bg-red-950"
    }
  ];

  return (
    <Tabs defaultValue="basic">
      <TabsList className="mb-4">
        <TabsTrigger value="basic">Basic Grid</TabsTrigger>
        <TabsTrigger value="header">With Header</TabsTrigger>
        <TabsTrigger value="interactive">Interactive</TabsTrigger>
        <TabsTrigger value="full">All Props</TabsTrigger>
      </TabsList>
      
      <TabsContent value="basic">
        <ComponentDisplayWrapper
          component={component}
          code={basicCode}
          description="Basic CardGrid with navigation links. Simple and clean layout for navigation menus."
        >
          <CardGrid cards={basicCards} />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="header">
        <ComponentDisplayWrapper
          component={component}
          code={withHeaderCode}
          description="CardGrid with title, description, and 3 columns. Perfect for feature showcases and dashboards."
        >
          <CardGrid 
            title="Your Workspace"
            description="Access all your tools and resources"
            cards={headerCards}
            columns={3}
          />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="interactive">
        <ComponentDisplayWrapper
          component={component}
          code={interactiveCode}
          description="CardGrid with mixed links and click handlers. Demonstrates how to combine navigation and actions."
        >
          <CardGrid cards={interactiveCards} columns={2} />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="full">
        <ComponentDisplayWrapper
          component={component}
          code={fullCode}
          description="Fully customized CardGrid demonstrating all available props. Shows the complete flexibility of the component."
        >
          <CardGrid 
            title={<span className="text-4xl">My Enterprise Dashboard</span>}
            description={<p className="text-lg">Welcome back! Here's what you can do today.</p>}
            cards={fullCards}
            columns={3}
            className="shadow-xl rounded-2xl p-8"
            headerClassName="text-left pb-12"
            titleClassName="text-blue-900 dark:text-blue-100"
            descriptionClassName="text-gray-700 dark:text-gray-300"
            contentClassName="p-6"
            gridClassName="gap-8"
          />
        </ComponentDisplayWrapper>
      </TabsContent>
    </Tabs>
  );
}