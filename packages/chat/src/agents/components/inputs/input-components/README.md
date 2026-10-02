# Agent variable inputs

UI for **agent execution variables** (`VariableDefinition` + `customComponent` on `AgentDefinition`). Types and the registered component-type list live in `@/features/agents/types/agent-definition.types.ts` — this is **not** the Prompts feature.

## Layouts (`variable-input-variations/`)

Shell components that arrange variables and wire them to Redux / submit:

| File | Role |
|------|------|
| `SmartAgentVariables.tsx` | Picks layout from `variableInputStyle` (Redux), or `styleOverride` |
| `AgentVariableForm.tsx` | Collapsible form |
| `AgentVariablesWizard.tsx` | One variable at a time |
| `AgentVariablesStacked.tsx` | Full-width rows (“compact” / stacked) |
| `AgentVariablesGuided.tsx` | Step-by-step, large targets |
| `AgentVariableCards.tsx` | Card per variable |

Barrel: `variable-input-variations/index.ts` re-exports these (including legacy names like `AgentVariableInputForm`).

## Options & styles (`variable-input-options.ts`)

Single place for **metadata** used in editors and UI:

- Re-exports `VARIABLE_COMPONENT_TYPES` and `VariableComponentType` from agent types.
- `getComponentTypeOptions()` / `getComponentTypeMeta()` — labels, descriptions, and flags (`requiresOptions`, `requiresToggleValues`, `requiresMinMax`).
- `VARIABLE_INPUT_STYLES`, `VARIABLE_INPUT_STYLE_OPTIONS`, `isVariableInputStyle()` — layout presets: `inline`, `wizard`, `form`, `compact`, `guided`, `cards`.

## Primitives (`input-components/`)

`VariableInputComponent` in `index.tsx` routes `VariableCustomComponent.type` to the correct control. All values are **strings** end-to-end (numbers are stringified for the variable value).

| `type` | Implementation | Notes |
|--------|----------------|--------|
| `textarea` | `TextareaInput` | Default when `customComponent` is omitted |
| `toggle`, `light-switch` | `ToggleInput` | `toggleValues?: [off, on]` (defaults `No` / `Yes`); `light-switch` enables 3D styling |
| `radio` | `RadioGroupInput` | Needs `options`; else falls back to textarea |
| `pill-toggle` | `PillToggleInput` | Needs `options` |
| `selection-list`, `buttons`, `select` | `SelectInput` | `selection-list` = column list; `buttons` = wrapping grid; `select` = compact dropdown |
| `checkbox` | `CheckboxGroupInput` | Multi-select; value is options joined with `\n` |
| `number` | `NumberInput` | Optional `min`, `max`, `step` |
| `slider` | `SliderInput` | Optional `min`, `max`, `step` |

Shared config on `VariableCustomComponent`: `options?: string[]`, `allowOther?: boolean` (where supported), `toggleValues?: [string, string]`, `min` / `max` / `step` for number and slider.

`useContainerColumns.ts` (`useContainerWidth`) feeds responsive layout hints into inputs.

## Consumers

Agent run / pre-execution UIs import from `input-components` (router + exports) and `variable-input-variations` (layouts + `SmartAgentVariables`). Inline entry also uses `../AgentVariablesInline` from the variations folder via `SmartAgentVariables`.
