
export type TextContextEntry = {
    id: string;
    name: string;
    prefix: string;
    suffix: string;
};

export const textContext: TextContextEntry[] = [
    {
        id: "1001",
        name: "Solve TypeScript Errors",
        prefix: "Thank you, but I am getting these errors:",
        suffix: "Can you please review them carefully, find the exact cause and give me the full and complete solution?",
    },
    {
        id: "1002",
        name: "Get help with general React/Next.js/Tailwind CSS/motion/react",
        prefix: "Please keep in mind that I use React, Next.js 14 App Router (app directory, page.tsx, etc.), I have strict TypeScript settings and I use Tailwind CSS with mostly custom components and ShadCN and a lot of animation with motion/react. I have light/dark mode and my theme sets colors so do not hard-code any colors",
        suffix: "Lets make this really amazing please. The key is to make it totally reusable and fully self-sufficient, but include all of the optional props that we need to fully control it from the outside, including cn so we can add classNames",
    },
    {
        id: "1003",
        name: "Make Reusable Tailwind Component",
        prefix: "Please keep in mind that I use React, Next.js 14 App Router (app directory, page.tsx, etc.), I have strict TypeScript settings and I use Tailwind CSS with mostly custom components and ShadCN and a lot of animation with Framer-Motion. I have light/dark mode and my theme sets colors so do not hard-code any colors. The key is that you must make sure that you generate the component as a fully reusable component. Do not hard-code anything. Do not hard code the things it needs to function. Get them all as props. At the same time, the component should be totally self-reliant so make as many props as possible optional and ensure the component can manage itself. That includes all actions the component might need. Do not rely on the parent component for state management or for triggering actions. Everything must be able to be controlled internally, with no outside control. But again, if the parent component wants to take control of all of those things, then you must make props available to make that happen.",
        suffix: "I want an animated version that uses motion/react to create a beautiful and professional component that will look great in the app. Use some nice hover effects to possibly slightly change the shade on hover. If you assign a color, in tailwind, remember that you must also provide a color for 'dark:' or use any of the css variables such as --background, --foreground, --card, --card-foreground, --primary, and many other usual ones you already know from shadcn/ui. the other Lets make this really amazing please. The key is to make it totally reusable and fully self-sufficient, but include all of the optional props that we need to fully control it from the outside, including cn so we can add classNames. Make an amazing reusable version of this component.",
    },
    {
        id: "1004",
        name: "Clean HTML For Structure Review",
        prefix: "Prefix 4 initial text",
        suffix: "Suffix 4 initial text",
    },
    {
        id: "1005",
        name: "name_1005",
        prefix: "Prefix 5 initial text",
        suffix: "Suffix 5 initial text",
    },
];

