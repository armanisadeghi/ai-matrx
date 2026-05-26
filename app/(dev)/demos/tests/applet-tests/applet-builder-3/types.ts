// types/applet.ts
export interface Step {
    id: number;
    title: string;
    icon: React.ReactNode;
  }
  
  export interface Template {
    id: string;
    name: string;
    description: string;
    icon?: React.ReactNode;
  }
  
  export interface AICapability {
    id: string;
    name: string;
    description: string;
    icon?: React.ReactNode;
  }
  
  export interface AppletState {
    currentStep: number;
    appName: string;
    selectedTemplate: string | null;
    selectedColor: string;
    selectedCapabilities: string[];
    deployment: 'private' | 'team' | 'public';
  }
  
  export interface DataTable {
    name: string;
    records: number;
  }
  
  export interface Automation {
    id: string;
    trigger: string;
    action: string;
    enabled: boolean;
  }
  
  export interface Layout {
    id: 'dashboard' | 'list' | 'kanban';
    name: string;
    description: string;
  }
  
  export interface ColorOption {
    id: string;
    value: string;
  }
  
  // Add these to your existing AppletState interface
  export interface ExtendedAppletState {
    layout: Layout['id'];
    automations: Automation[];
    tables: DataTable[];
  }
  