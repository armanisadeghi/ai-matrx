import { UserIntegration } from './types';

// This represents what would come from the database for a specific user
export const USER_INTEGRATIONS: UserIntegration[] = [
  { integrationId: 'google-workspace', connected: true, connectedAt: '2023-04-15T10:30:00Z' },
  { integrationId: 'slack', connected: true, connectedAt: '2023-05-20T14:45:00Z' },
  { integrationId: 'notion', connected: true, connectedAt: '2023-03-10T09:15:00Z' },
  { integrationId: 'jira', connected: true, connectedAt: '2023-06-05T11:20:00Z' },
  { integrationId: 'box', connected: true, connectedAt: '2023-02-28T16:10:00Z' },
  { integrationId: 'hubspot', connected: true, connectedAt: '2023-07-12T13:40:00Z' },
  { integrationId: 'stripe', connected: true, connectedAt: '2023-01-18T08:50:00Z' },
];