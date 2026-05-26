import { 
  Search, Moon, Sun, Filter, Check, X, Mail, MessageSquare, Calendar, Trello, 
  Github, Gitlab, Slack, FileText, HardDrive, Database, PieChart, BarChart, 
  Linkedin, Twitter, Facebook, Figma, Chrome, Coffee, Code, BookOpen,
  MessageCircle, Users, Cloud, Briefcase, LucideIcon
} from 'lucide-react';

export type Category =
| "Email & Communication"
| "Calendar & Scheduling"
| "Project Management"
| "File Storage"
| "Development"
| "Productivity"
| "CRM & Sales"
| "Analytics"
| "Social Media"
| "Messaging";




export interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType<any>;
  iconColor?: string;
  category: Category;
  isConnected: boolean;
  popularityScore: number; // Higher number means more popular
}


export const mockIntegrations: Integration[] = [
    // Email & Communication
    {
      id: 'google-gmail',
      name: 'Gmail',
      description: 'Email service by Google',
      icon: Mail,
      iconColor: '#D44638',
      category: 'Email & Communication',
      isConnected: true,
      popularityScore: 95
    },
    {
      id: 'microsoft-outlook',
      name: 'Outlook',
      description: 'Email service by Microsoft',
      icon: Mail,
      iconColor: '#0078D4',
      category: 'Email & Communication',
      isConnected: false,
      popularityScore: 90
    },
    
    // Messaging
    {
      id: 'slack',
      name: 'Slack',
      description: 'Business communication platform',
      icon: MessageSquare,
      iconColor: '#4A154B',
      category: 'Messaging',
      isConnected: true,
      popularityScore: 94
    },
    {
      id: 'ms-teams',
      name: 'Microsoft Teams',
      description: 'Business communication platform by Microsoft',
      icon: MessageCircle,
      iconColor: '#6264A7',
      category: 'Messaging',
      isConnected: false,
      popularityScore: 88
    },
    {
      id: 'discord',
      name: 'Discord',
      description: 'VoIP and instant messaging platform',
      icon: MessageCircle,
      iconColor: '#5865F2',
      category: 'Messaging',
      isConnected: false,
      popularityScore: 85
    },
    
    // Calendar & Scheduling
    {
      id: 'google-calendar',
      name: 'Google Calendar',
      description: 'Calendar service by Google',
      icon: Calendar,
      iconColor: '#4285F4',
      category: 'Calendar & Scheduling',
      isConnected: true,
      popularityScore: 92
    },
    {
      id: 'microsoft-calendar',
      name: 'Microsoft Calendar',
      description: 'Calendar service by Microsoft',
      icon: Calendar,
      iconColor: '#0078D4',
      category: 'Calendar & Scheduling',
      isConnected: false,
      popularityScore: 86
    },
    {
      id: 'calendly',
      name: 'Calendly',
      description: 'Scheduling automation platform',
      icon: Calendar,
      iconColor: '#006BFF',
      category: 'Calendar & Scheduling',
      isConnected: false,
      popularityScore: 82
    },
    
    // Project Management
    {
      id: 'asana',
      name: 'Asana',
      description: 'Project management tool',
      icon: Briefcase,
      iconColor: '#FC636B',
      category: 'Project Management',
      isConnected: false,
      popularityScore: 86
    },
    {
      id: 'trello',
      name: 'Trello',
      description: 'Visual collaboration tool',
      icon: Trello,
      iconColor: '#0079BF',
      category: 'Project Management',
      isConnected: true,
      popularityScore: 84
    },
    {
      id: 'jira',
      name: 'Jira',
      description: 'Issue tracking product by Atlassian',
      icon: Briefcase,
      iconColor: '#0052CC',
      category: 'Project Management',
      isConnected: false,
      popularityScore: 90
    },
    {
      id: 'monday',
      name: 'Monday.com',
      description: 'Work OS platform',
      icon: Briefcase,
      iconColor: '#FF3D57',
      category: 'Project Management',
      isConnected: false,
      popularityScore: 83
    },
    
    // File Storage
    {
      id: 'google-drive',
      name: 'Google Drive',
      description: 'File storage service by Google',
      icon: HardDrive,
      iconColor: '#4285F4',
      category: 'File Storage',
      isConnected: true,
      popularityScore: 94
    },
    {
      id: 'dropbox',
      name: 'Dropbox',
      description: 'File hosting service',
      icon: Cloud,
      iconColor: '#0061FF',
      category: 'File Storage',
      isConnected: false,
      popularityScore: 88
    },
    {
      id: 'box',
      name: 'Box',
      description: 'Cloud content management platform',
      icon: Cloud,
      iconColor: '#0061D5',
      category: 'File Storage',
      isConnected: false,
      popularityScore: 82
    },
    {
      id: 'onedrive',
      name: 'OneDrive',
      description: 'File hosting service by Microsoft',
      icon: Cloud,
      iconColor: '#0078D4',
      category: 'File Storage',
      isConnected: false,
      popularityScore: 86
    },
    
    // Development
    {
      id: 'github',
      name: 'GitHub',
      description: 'Code hosting platform',
      icon: Github,
      iconColor: '#181717',
      category: 'Development',
      isConnected: true,
      popularityScore: 95
    },
    {
      id: 'gitlab',
      name: 'GitLab',
      description: 'DevOps platform',
      icon: Gitlab,
      iconColor: '#FC6D26',
      category: 'Development',
      isConnected: false,
      popularityScore: 84
    },
    {
      id: 'bitbucket',
      name: 'Bitbucket',
      description: 'Git repository management by Atlassian',
      icon: Code,
      iconColor: '#0052CC',
      category: 'Development',
      isConnected: false,
      popularityScore: 78
    },
    
    // CRM & Sales
    {
      id: 'salesforce',
      name: 'Salesforce',
      description: 'Customer relationship management platform',
      icon: Users,
      iconColor: '#00A1E0',
      category: 'CRM & Sales',
      isConnected: false,
      popularityScore: 92
    },
    {
      id: 'hubspot',
      name: 'HubSpot',
      description: 'Marketing, sales, and service platform',
      icon: Users,
      iconColor: '#FF7A59',
      category: 'CRM & Sales',
      isConnected: true,
      popularityScore: 86
    },
    {
      id: 'zoho',
      name: 'Zoho CRM',
      description: 'Customer relationship management software',
      icon: Users,
      iconColor: '#E42527',
      category: 'CRM & Sales',
      isConnected: false,
      popularityScore: 80
    },
    
    // Productivity
    {
      id: 'notion',
      name: 'Notion',
      description: 'Project management and note-taking software',
      icon: FileText,
      iconColor: '#000000',
      category: 'Productivity',
      isConnected: false,
      popularityScore: 89
    },
    {
      id: 'evernote',
      name: 'Evernote',
      description: 'Note-taking app',
      icon: BookOpen,
      iconColor: '#00A82D',
      category: 'Productivity',
      isConnected: false,
      popularityScore: 78
    },
    {
      id: 'miro',
      name: 'Miro',
      description: 'Online collaborative whiteboard platform',
      icon: Figma,
      iconColor: '#FFD02F',
      category: 'Productivity',
      isConnected: true,
      popularityScore: 85
    },
    
    // Analytics
    {
      id: 'google-analytics',
      name: 'Google Analytics',
      description: 'Web analytics service by Google',
      icon: BarChart,
      iconColor: '#E37400',
      category: 'Analytics',
      isConnected: false,
      popularityScore: 92
    },
    {
      id: 'tableau',
      name: 'Tableau',
      description: 'Data visualization software',
      icon: PieChart,
      iconColor: '#1F77B4',
      category: 'Analytics',
      isConnected: false,
      popularityScore: 88
    },
    {
      id: 'looker',
      name: 'Looker',
      description: 'Business intelligence software by Google',
      icon: PieChart,
      iconColor: '#4285F4',
      category: 'Analytics',
      isConnected: false,
      popularityScore: 82
    },
    
    // Social Media
    {
      id: 'linkedin',
      name: 'LinkedIn',
      description: 'Business and employment-oriented social media',
      icon: Linkedin,
      iconColor: '#0A66C2',
      category: 'Social Media',
      isConnected: true,
      popularityScore: 89
    },
    {
      id: 'twitter',
      name: 'X (Twitter)',
      description: 'Social networking service',
      icon: Twitter,
      iconColor: '#000000',
      category: 'Social Media',
      isConnected: false,
      popularityScore: 88
    },
    {
      id: 'facebook',
      name: 'Facebook',
      description: 'Social media platform by Meta',
      icon: Facebook,
      iconColor: '#1877F2',
      category: 'Social Media',
      isConnected: false,
      popularityScore: 90
    }
  ];