// constants/audioHelp.ts
import {
    MessageCircleQuestion,
    ClipboardList,
    FileSearch,
    AlertCircle,
    Settings,
    Filter,
    TableProperties,
    Save,
    Upload,
    Download,
    UserCog,
    Bell,
    History,
    Calculator,
    Workflow
} from 'lucide-react';
import type { AudioHelpMessage } from '@/types/audioHelp';

export const AUDIO_HELP_MESSAGES: Record<string, AudioHelpMessage> = {
    help: {
        id: 'help',
        icon: MessageCircleQuestion,
        text: "Hi. I can see you're a little stuck. No problem. I'm reviewing the page right now to give you a few options for things I can help you with.",
        title: "Need Help?",
        description: "Let me guide you through your options"
    },
    newReport: {
        id: 'newReport',
        icon: ClipboardList,
        text: "To create a new report, start by selecting your data source from the dropdown menu. You can then customize your columns, apply filters, and set up any calculations you need. Don't worry about making mistakes - you can preview your report before saving it.",
        title: "Create New Report",
        description: "Step-by-step report creation guide"
    },
    searchTips: {
        id: 'searchTips',
        icon: FileSearch,
        text: "To get the most out of the search feature, try using specific keywords related to what you're looking for. You can also use filters to narrow down results by date, category, or status. For exact matches, use quotation marks around your search terms.",
        title: "Search Tips",
        description: "Optimize your search results"
    },
    errorHelp: {
        id: 'errorHelp',
        icon: AlertCircle,
        text: "I notice you've encountered an error. First, don't worry - your work is automatically saved. Try refreshing the page first. If the error persists, check your input data for any special characters or formatting issues that might be causing problems.",
        title: "Error Resolution",
        description: "Steps to resolve common errors"
    },
    settings: {
        id: 'settings',
        icon: Settings,
        text: "In the settings panel, you can customize your workspace preferences, set up default views, and configure notifications. Take a moment to review these options to make your workflow more efficient.",
        title: "Settings Guide",
        description: "Customize your workspace"
    },
    filterData: {
        id: 'filterData',
        icon: Filter,
        text: "To filter your data, click the filter icon in any column header. You can combine multiple filters, and even save your favorite filter combinations for future use. Remember to click apply after setting up your filters.",
        title: "Filtering Data",
        description: "Master data filtering"
    },
    customizeTable: {
        id: 'customizeTable',
        icon: TableProperties,
        text: "You can customize this table by dragging columns to reorder them, resizing column widths, and using the column show/hide menu to show or hide specific columns. Your layout will be automatically saved for next time.",
        title: "Table Customization",
        description: "Personalize your data view"
    },
    saveChanges: {
        id: 'saveChanges',
        icon: Save,
        text: "Your changes are automatically saved as you work. However, for major changes, you might want to create a new version. Click the save icon and choose 'Save as New Version' to keep a backup of your current setup.",
        title: "Saving Changes",
        description: "Understanding auto-save and versions"
    },
    importData: {
        id: 'importData',
        icon: Upload,
        text: "To import data, make sure your file is in CSV, Excel, or JSON format. The system will analyze your file and match columns automatically. You can review and adjust the mapping before finalizing the import.",
        title: "Data Import",
        description: "Guide to importing data"
    },
    exportData: {
        id: 'exportData',
        icon: Download,
        text: "You can export your data in multiple formats. Choose between CSV for simple spreadsheets, Excel for formatted reports, or JSON for system integrations. Your column customizations and filters will be applied to the export.",
        title: "Data Export",
        description: "Export options explained"
    },
    userPreferences: {
        id: 'userPreferences',
        icon: UserCog,
        text: "Your user preferences control everything from dark mode to notification settings. You can also set up keyboard shortcuts and configure your default views here.",
        title: "User Preferences",
        description: "Personalize your experience"
    },
    notifications: {
        id: 'notifications',
        icon: Bell,
        text: "Notifications keep you informed about important updates, approaching deadlines, and system maintenance. You can customize which notifications you receive and how they're delivered in your settings.",
        title: "Notifications",
        description: "Stay informed and in control"
    },
    auditLog: {
        id: 'auditLog',
        icon: History,
        text: "The audit log shows all changes made to this record, including who made them and when. You can filter the log by date range or action type, and export it for compliance purposes.",
        title: "Audit Log",
        description: "Track changes and activities"
    },
    calculations: {
        id: 'calculations',
        icon: Calculator,
        text: "Custom calculations can be added to any numeric column. Use the formula builder to create simple sums or complex conditional calculations. Your formulas will be automatically validated before saving.",
        title: "Custom Calculations",
        description: "Create powerful computations"
    },
    workflow: {
        id: 'workflow',
        icon: Workflow,
        text: "Workflows automate your business processes. Start by defining your trigger events, then add conditions and actions. You can test your workflow before activating it to ensure it behaves as expected.",
        title: "Workflow Automation",
        description: "Streamline your processes"
    }
};
