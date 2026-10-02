# Variable Input Components

Custom input components for prompt variables. All components return text values that are used in the prompt.

## Components

### 1. **Textarea** (Default)
Multi-line text input. This is the default if no `customComponent` is specified.

```json
{
  "name": "description",
  "defaultValue": "Enter text here",
  "customComponent": {
    "type": "textarea"
  }
}
```

### 2. **Toggle**
Boolean input with custom labels. Returns one of two text values.

```json
{
  "name": "enabled",
  "defaultValue": "Yes",
  "customComponent": {
    "type": "toggle",
    "toggleValues": ["No", "Yes"]
  }
}
```

**Default values**: `["No", "Yes"]` if not specified

### 3. **Radio Group**
Single selection from a list of options. Returns the selected option text.

```json
{
  "name": "priority",
  "defaultValue": "Medium",
  "customComponent": {
    "type": "radio",
    "options": ["Low", "Medium", "High", "Critical"]
  }
}
```

**Required**: `options` array

### 4. **Checkbox Group**
Multiple selection from a list of options. Returns selected options separated by newlines.

```json
{
  "name": "categories",
  "defaultValue": "Development\nTesting",
  "customComponent": {
    "type": "checkbox",
    "options": ["Development", "Testing", "Documentation", "Design"]
  }
}
```

**Required**: `options` array
**Output format**: Each selected item on a new line

### 5. **Select**
Dropdown single selection. Returns the selected option text.

```json
{
  "name": "status",
  "defaultValue": "In Progress",
  "customComponent": {
    "type": "select",
    "options": ["Not Started", "In Progress", "Completed"]
  }
}
```

**Required**: `options` array

### 6. **Number**
Numeric input with optional min/max/step controls.

```json
{
  "name": "quantity",
  "defaultValue": "5",
  "customComponent": {
    "type": "number",
    "min": 1,
    "max": 100,
    "step": 5
  }
}
```

**Optional**: `min`, `max`, `step` (defaults to 1)

## Value Handling

All components handle cases where the current value doesn't match the component's options:

- **Toggle**: Shows current value with warning, allows replacing with Yes/No
- **Radio/Select**: Shows current value above options, clears when option selected
- **Checkbox**: Shows current values (including non-option ones) with "Custom" badge
- **Number**: Shows warning if value is not a valid number

This allows users to:
1. Manually edit values as text
2. Use the component UI to select from predefined options
3. See what value will be used even if it doesn't match options

## Testing

Use the `TEST_PROMPT_EXAMPLE.json` file to create a test prompt with all component types:

1. Copy the JSON from `TEST_PROMPT_EXAMPLE.json`
2. Manually insert it into the database (or create via API)
3. Open the prompt in the runner
4. Test each variable input type

## Implementation Details

- Components are located in `/features/prompts/components/variable-inputs/`
- Type definitions in `/features/prompts/types/variable-components.ts`
- Used in `PromptRunnerInput.tsx` component
- All components return plain text strings
- The `VariableInputComponent` wrapper handles routing to the correct component

## Future Enhancements

Potential future component types:
- Date/Time picker
- Color picker
- Multi-line code editor with syntax highlighting
- File selector
- Tag input
- Slider (range)

