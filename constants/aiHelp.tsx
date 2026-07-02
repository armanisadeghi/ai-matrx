// constants/aiHelp.ts
import AIHelpButton from "@/components/ai-help/AIHelpButton";
import React from "react";

// https://claude.ai/chat/327028d1-1df2-4272-816d-83c3e06f72a2

export const AI_HELP_PROMPTS = {
    INITIAL_CONTEXT:
        "You are tasked with assisting a user in AI Matrx. Below, you can find a wealth of information about the context for exactly what the user is doing. The user has clicked the help icon and you are receiving the exact screenshot of what they see right now and the context should provide you the information you need to guide the user.\n\nAt this time, the user does not have the ability to respond back to you so you have one chance to give the user some help. Please do your best. We are working on improving our system to allow for a conversation.",
    FINAL_INSTRUCTION:
        "Please do your best to respond to the user with as much helpful information as you can. We are working to improve the system and provide you with even more relevant context, but for now, we hope you have enough to provide the user with as much help as possible. Your response will be streamed directly to the user. Please proceed...",
};

export const FeatureHelpDocs = {
    EntityForm: {
        pageHelp: "This is the entity management interface. You can interact with the data in the system through this interface.",
        entityHelp: `Currently viewing: {{selectedEntity}} which is one of the tables in the system.
                        Each table is represented by a dynamic, dedicated Redux Slice that is keyed for the entity.
                        The slice is called Entity and it's incredibly dynamic. The user can interact with the table, as well as all related tables.
                        That includes Foreign keys and even inverse Foreign keys, as well as many to many relationships.
                        Of course, from the user's perspective, this isn't a table, it's a page of the app that let's them interact with the data.`,
    },
    EntityField: {
        pageHelp: "This is the entity field interface. You can interact with the fields in the system through this interface.",
        fieldHelp: `Currently viewing: {{selectedField}} which is one of the fields in the system.
                        Each field is represented by a dynamic, dedicated Redux Slice that is keyed for the field.
                        The slice is called Field and it's incredibly dynamic. The user can interact with the field, as well as all related fields.
                        That includes Foreign keys and even inverse Foreign keys, as well as many to many relationships.
                        Of course, from the user's perspective, this isn't a field, it's a page of the app that let's them interact with the data.`,
    },
    AiChatWelcomePage: {
        pageHelp: "This is the AI chat interface. You can interact with the AI chat through this interface.",
        chatHelp: `This page is the first page where an AI Chat Conversation can be started. The page features many different options for a user that could get a bit confusing.
                   There are some general chat options under the input container that allow the user to select an overall style that will be used for the conversation with the AI Model.
                   Overall options include:
                   - Text Generation: A standard chat.
                   - Image Generation: User provides descriptions of images to be generated.
                   - Video Generation: User provides descriptions of videos to be generated.
                   - Deep Research: Conduct a thorough, deep research project to completely analyze a topic and provide the results and the references.
                   - Brainstorming: Work through complex patterns to brainstorm about something in a multi-turn conversation.
                   - Data Analysis: The user provides data that the AI Model analyzes in detail.
                   - Running powerful AI Agent Recipes: Run a pre-defined set of tools.
                   - Working directly with an AI Model who specializes in specific coding skills such as programming languages, libraries and packages.
                   Inside of the input container, they have options which will remain available to them after starting a chat, including adding attachments, enabling search, thinking, planning, question asking, tools, and audio.
                   - Attachments: allow a user to attach images, videos, pdf or any file for context.
                   - Search: Gives the AI Model the ability to search the web.
                   - Thinking: Triggers a special feature where the model will think through the request prior to providing the final response.
                   - Planning: This utilizes an option where the model will propose a plan to the user. Upon acceptance, the model will work through the plan in a multi-turn process.
                   - Question Asking: This special feature triggeres the model to ask questions for ANYTHING that is not clearly provided by the user. Questions are displayed as UI elements and the answers go back to the model.
                   - Tools: Allows the user to select from a long list of tools that convert the AI Model into an AI Agent and give it the autonomy of using those tools, when necessary.
                   - Audio: Allows the user to speak to the model using their voice, instead of just typing.
                   - Model Selection: Allows the user to select the AI model of their choice.`,
    },
};

export const AIHelpButtonWithDocs = ({ helpDocs }: { helpDocs?: Record<string, string> }) => {
    return <AIHelpButton helpDocs={helpDocs} />;
};
