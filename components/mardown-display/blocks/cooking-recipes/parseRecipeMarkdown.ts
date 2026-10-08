import type { KIND_KEY } from "@ai-matrx/content-ir";
// THE SHAPES COME FROM THE REGISTRY (`pnpm shape:types`) — this file never
// re-declares a registered kind's fields (`check:kind-type-twins`).
import type { RecipeStep as RecipeStepKind } from "@/features/content-ir/kinds/generated/kinds.generated";
export interface Ingredient {
  amount: string;
  item: string;
}

export type RecipeStep = Omit<RecipeStepKind, typeof KIND_KEY>;

export interface RecipeData {
  title: string;
  yields: string;
  totalTime: string;
  prepTime: string;
  cookTime: string;
  ingredients: Ingredient[];
  instructions: RecipeStep[];
  notes?: string;
}

const INGREDIENT_UNIT =
  "(?:tablespoons?|teaspoons?|pounds?|ounces?|cups?|tbsp|tsp|lbs?|kg|ml|oz|g|l)(?![a-zA-Z])";
const INGREDIENT_AMOUNT = new RegExp(
  `^([^a-zA-Z]*(?:\\d+(?:\\/\\d+)?(?:\\.\\d+)?\\s*(?:${INGREDIENT_UNIT})?(?:\\s*\\([^)]+\\))?\\s*)+)(.+)$`,
);

export const parseRecipeMarkdown = (content: string): RecipeData | null => {
  try {
    // Remove the cooking_recipe tags
    const cleanContent = content
      .replace(/<cooking_recipe>/g, '')
      .replace(/<\/cooking_recipe>/g, '')
      .trim();

    const lines = cleanContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let title = '';
    let yields = '';
    let totalTime = '';
    let prepTime = '';
    let cookTime = '';
    let ingredients: Ingredient[] = [];
    let instructions: RecipeStep[] = [];
    let notes = '';
    
    let currentSection = '';
    let i = 0;

    // Parse the content
    while (i < lines.length) {
      const line = lines[i];
      
      // Extract title (first header)
      if (line.startsWith('###') && !title) {
        title = line.replace(/^#+\s*/, '').trim();
        i++;
        continue;
      }
      
      // Extract metadata (Yields, Time, etc.)
      if (line.startsWith('**Yields:**')) {
        yields = line.replace('**Yields:**', '').trim();
        i++;
        continue;
      }
      
      if (line.startsWith('**Time:**')) {
        const timeInfo = line.replace('**Time:**', '').trim();
        totalTime = timeInfo.split('(')[0].trim();
        
        // Try to extract prep and cook time from parentheses
        const timeMatch = timeInfo.match(/\(([^)]+)\)/);
        if (timeMatch) {
          const timeDetails = timeMatch[1];
          const prepMatch = timeDetails.match(/(\d+\s*minutes?\s*prep)/i);
          const cookMatch = timeDetails.match(/(\d+\s*minutes?\s*(?:baking|cooking))/i);
          
          if (prepMatch) prepTime = prepMatch[1];
          if (cookMatch) cookTime = cookMatch[1];
        }
        i++;
        continue;
      }
      
      // Section headers
      if (line.startsWith('####')) {
        const sectionTitle = line.replace(/^#+\s*/, '').toLowerCase();
        if (sectionTitle.includes('ingredient')) {
          currentSection = 'ingredients';
        } else if (sectionTitle.includes('instruction')) {
          currentSection = 'instructions';
        }
        i++;
        continue;
      }
      
      // Skip separators
      if (line === '---') {
        i++;
        continue;
      }
      
      // Parse ingredients
      if (currentSection === 'ingredients' && line.startsWith('-')) {
        const ingredientText = line.replace(/^-\s*/, '').trim();
        
        // Split by first space or number pattern to separate amount from item
        // A unit is a WHOLE word (longest spelling first): without the boundary "4 large eggs"
        // split as "4 l" + "arge eggs", "2 cups" as "2 cup" + "s …", "1 lb" as "1 l" + "b …".
        const match = ingredientText.match(INGREDIENT_AMOUNT);
        
        if (match) {
          ingredients.push({
            amount: match[1].trim(),
            item: match[2].trim()
          });
        } else {
          // Fallback: treat whole line as item with empty amount
          ingredients.push({
            amount: '',
            item: ingredientText
          });
        }
        i++;
        continue;
      }
      
      // Parse instructions
      if (currentSection === 'instructions' && /^\d+\./.test(line)) {
        const stepText = line.replace(/^\d+\.\s*/, '').trim();
        
        // Look for bold action at the start
        const actionMatch = stepText.match(/^\*\*([^*]+)\*\*:?\s*(.+)$/);
        
        if (actionMatch) {
          const action = actionMatch[1].trim();
          const description = actionMatch[2].trim();
          
          // Look for time information in the description
          const timeMatch = description.match(/(\d+(?:-\d+)?\s*(?:minutes?|mins?|hours?|hrs?))/i);
          
          instructions.push({
            action,
            description,
            time: timeMatch ? timeMatch[1] : undefined
          });
        } else {
          // No bold action, treat first few words as action
          const words = stepText.split(' ');
          const action = words.slice(0, 2).join(' ');
          const description = stepText;
          
          instructions.push({
            action,
            description
          });
        }
        i++;
        continue;
      }
      
      // Collect notes (everything after instructions that's not a header)
      if (currentSection === 'instructions' && !line.startsWith('#') && !line.startsWith('---') && !(/^\d+\./.test(line))) {
        if (line.length > 0) {
          notes += (notes ? ' ' : '') + line;
        }
      }
      
      i++;
    }
    
    // Fallback values
    if (!prepTime && !cookTime && totalTime) {
      prepTime = '15 minutes';
      cookTime = totalTime.replace(/\d+\s*minutes/, (match) => {
        const total = parseInt(match);
        const cook = Math.max(total - 15, 10);
        return `${cook} minutes`;
      });
    }

    return {
      title: title || 'Recipe',
      yields: yields || 'Serves 4',
      totalTime: totalTime || '30 minutes',
      prepTime: prepTime || '15 minutes',
      cookTime: cookTime || '15 minutes',
      ingredients,
      instructions,
      notes: notes || undefined
    };
    
  } catch (error) {
    console.error('Error parsing recipe markdown:', error);
    return null;
  }
};
