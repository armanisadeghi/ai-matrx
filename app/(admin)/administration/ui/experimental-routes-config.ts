/**
 * Experimental Routes Configuration
 * 
 * This file contains all experimental, demo, and test routes organized by feature area.
 * Add new routes here as you create them for easy access and testing.
 */

export interface ExperimentalRoute {
    path: string;
    name: string;
    description?: string;
    status?: 'active' | 'deprecated' | 'in-progress';
}

export interface ExperimentalSection {
    name: string;
    description?: string;
    baseRoute: string;
    routes: ExperimentalRoute[];
}

export const experimentalRoutes: ExperimentalSection[] = [
    {
        name: "Prompts",
        description: "Experimental prompt features and interfaces",
        baseRoute: "/ai/prompts",
        routes: [
            {
                path: "/ai/prompts/experimental",
                name: "Experimental Home",
                description: "Main experimental prompts page",
                status: 'active'
            },
            {
                path: "/ai/prompts/experimental/builder",
                name: "Prompt Builder",
                description: "Interactive prompt building interface",
                status: 'active'
            },
            {
                path: "/ai/prompts/experimental/card-demo",
                name: "Card Demo",
                description: "Testing prompt card layouts and interactions",
                status: 'active'
            },
            {
                path: "/ai/prompts/experimental/chatbot-customizer",
                name: "Chatbot Customizer",
                description: "Customize chatbot settings and appearance",
                status: 'active'
            },
            {
                path: "/ai/prompts/experimental/chatbot-customizer/instant-custom-chatbot",
                name: "Instant Custom Chatbot",
                description: "Quick chatbot customization interface",
                status: 'active'
            },
            {
                path: "/ai/prompts/experimental/chatbot-customizer/modular",
                name: "Modular Chatbot Customizer",
                description: "Modular approach to chatbot customization",
                status: 'active'
            },
            {
                path: "/ai/prompts/experimental/execution-demo",
                name: "Execution Demo",
                description: "Test prompt execution functionality",
                status: 'active'
            },
            {
                path: "/ai/prompts/experimental/prompt-overlay-test",
                name: "Prompt Overlay Test",
                description: "Testing overlay UI for prompts",
                status: 'active'
            },
            {
                path: "/ai/prompts/experimental/test-controls",
                name: "Test Controls",
                description: "Model configuration and testing controls",
                status: 'active'
            },
        ]
    },
    {
        name: "Components",
        description: "UI component demos and tests",
        baseRoute: "/demo/component-demo",
        routes: [
            {
                path: "/demo/component-demo",
                name: "Component Demo Home",
                description: "Main component demo page",
                status: 'active'
            },
            {
                path: "/demo/component-demo/accordion",
                name: "Accordion",
                status: 'active'
            },
            {
                path: "/demo/component-demo/button",
                name: "Button",
                status: 'active'
            },
            {
                path: "/demo/component-demo/button/loading-button-demo",
                name: "Loading Button Demo",
                status: 'active'
            },
            {
                path: "/demo/component-demo/button/loading-button-demo-2",
                name: "Loading Button Demo 2",
                status: 'active'
            },
            {
                path: "/demo/component-demo/calendar",
                name: "Calendar",
                status: 'active'
            },
            {
                path: "/demo/component-demo/checkbox-radio",
                name: "Checkbox & Radio",
                status: 'active'
            },
            {
                path: "/demo/component-demo/chip-demo",
                name: "Chip Demo",
                status: 'active'
            },
            {
                path: "/demo/component-demo/color-tester",
                name: "Color Tester",
                status: 'active'
            },
        ]
    },
    {
        name: "Code Generator",
        description: "AI-powered code generation experiments",
        baseRoute: "/demo/code-generator",
        routes: [
            {
                path: "/demo/code-generator/react-live",
                name: "React Live",
                description: "Live React component generation",
                status: 'active'
            },
            {
                path: "/demo/code-generator/react-live-parts",
                name: "React Live Parts",
                description: "Component parts generation",
                status: 'active'
            },
        ]
    },
    // Add more sections as needed...
];

/**
 * Helper function to get all routes flattened
 */
export function getAllExperimentalRoutes(): Array<ExperimentalRoute & { section: string }> {
    return experimentalRoutes.flatMap(section => 
        section.routes.map(route => ({
            ...route,
            section: section.name
        }))
    );
}

/**
 * Helper function to search routes
 */
export function searchExperimentalRoutes(query: string): Array<ExperimentalRoute & { section: string }> {
    const lowerQuery = query.toLowerCase();
    return getAllExperimentalRoutes().filter(route => 
        route.name.toLowerCase().includes(lowerQuery) ||
        route.path.toLowerCase().includes(lowerQuery) ||
        route.description?.toLowerCase().includes(lowerQuery)
    );
}

