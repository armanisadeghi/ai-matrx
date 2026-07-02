// File: lib/ai/recipeUtils.ts

interface RecipeContentPart {
    text: string;
    [key: string]: unknown;
}

interface RecipeMessage {
    content: RecipeContentPart[];
    [key: string]: unknown;
}

// Function to extract variables from a recipe
export function extractVariablesFromRecipe(recipe: RecipeMessage[]): string[] {
    const variableRegex = /\{([^}]+)\}/g;
    const variables: string[] = [];

    recipe.forEach(message => {
        message.content.forEach(contentPart => {
            let match;
            while ((match = variableRegex.exec(contentPart.text)) !== null) {
                variables.push(match[1]);
            }
        });
    });

    return Array.from(new Set(variables)); // Return unique variables
}

// Function to replace variables in a recipe with provided values
export function replaceVariablesInRecipe(recipe: RecipeMessage[], variableValues: { [key: string]: string }): RecipeMessage[] {
    return recipe.map(message => {
        const newMessage = { ...message };
        newMessage.content = message.content.map(contentPart => {
            let newText = contentPart.text;
            Object.keys(variableValues).forEach(variable => {
                const variablePlaceholder = `{${variable}}`;
                newText = newText.replace(new RegExp(variablePlaceholder, 'g'), variableValues[variable]);
            });
            return { ...contentPart, text: newText };
        });
        return newMessage;
    });
}
