// File: lib/ai/openai-recipes.ts

// Recipe data
export const recipes = {
    recipe_1238: [
        {
            role: "system",
            content: [
                {
                    type: "text",
                    text: "test {variable_1832}"
                }
            ]
        },
        {
            role: "user",
            content: [
                {
                    type: "text",
                    text: "{some_variable} test {some_other_var}"
                }
            ]
        },
        {
            role: "assistant",
            content: [
                {
                    type: "text",
                    text: "test"
                }
            ]
        },
        {
            role: "user",
            content: [
                {
                    type: "text",
                    text: "test {variable_1001} is here."
                }
            ]
        }
    ],
    recipe_1239: [
        {
            role: "system",
            content: [
                {
                    type: "text",
                    text: "test {variable_1832}"
                }
            ]
        },
        {
            role: "user",
            content: [
                {
                    type: "text",
                    text: "{some_variable} test {some_other_var}"
                }
            ]
        },
        {
            role: "assistant",
            content: [
                {
                    type: "text",
                    text: "test"
                }
            ]
        },
        {
            role: "user",
            content: [
                {
                    type: "text",
                    text: "test {variable_1001} is here."
                }
            ]
        }
    ]
    ,
    this_is_my_recipe: [
        {
            role: "system",
            content: [
                {
                    type: "text",
                    text: "test {variable_1832}"
                }
            ]
        },
        {
            role: "user",
            content: [
                {
                    type: "text",
                    text: "{some_variable} test {some_other_var}"
                }
            ]
        },
        {
            role: "assistant",
            content: [
                {
                    type: "text",
                    text: "test"
                }
            ]
        },
        {
            role: "user",
            content: [
                {
                    type: "text",
                    text: "test {variable_1001} is here."
                }
            ]
        }
    ]

};

// Function to fetch a specific recipe by name
export function getRecipeByName(recipeName: string) {
    return (recipes as Record<string, (typeof recipes)[keyof typeof recipes]>)[recipeName] || null;
}

// Function to get the list of available recipes
export function getAvailableRecipes() {
    return Object.keys(recipes);
}
