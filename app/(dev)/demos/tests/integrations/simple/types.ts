export interface Integration {
    id: string;
    name: string;
    icon: React.ComponentType<any>;
    description: string;
    category: string;
  }
  
  export interface UserIntegration {
    integrationId: string;
    connected: boolean;
    connectedAt?: string;
    settings?: Record<string, any>;
  }