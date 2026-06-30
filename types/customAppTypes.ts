import { defaultTableRules } from "@/types/appletDefaultTableRules";
import type { Json } from "@/types/database.types";
import { ReactNode } from "react";

export type ComponentType =
  | "input"
  | "textarea"
  | "buttonSelection"
  | "buttonColumn"
  | "draggableTable"
  | "draggableEditableTable"
  | "dragEditModifyTable"
  | "dragTableRowAndColumn"
  | "select"
  | "multiselect"
  | "radio"
  | "checkbox"
  | "slider"
  | "number"
  | "date"
  | "switch"
  | "rangeSlider"
  | "numberInput"
  | "numberPicker"
  | "jsonField"
  | "fileUpload"
  | "searchableSelect"
  | "directMultiSelect"
  | "multiDate"
  | "simpleNumber"
  | "sortable"
  | "tagInput"
  | "dependentDropdown"
  | "addressBlock"
  | "starRating"
  | "phoneNumber"
  | "stepperNumber"
  | "multiSearchableSelect"
  | "conceptBrokerOptions";

export interface TableRules {
  canAddRows?: boolean;
  canDeleteRows?: boolean;
  canAddColumns?: boolean;
  canDeleteColumns?: boolean;
  canEditCells?: boolean;
  canRenameColumns?: boolean; // For column headers
  canSortRows?: boolean;
  canSortColumns?: boolean;
}

export interface FieldOption {
  id: string; // Typically used for the value of the option.
  label: string; // Used as the human readable label for the option.
  description?: string; // This is where the 'context' is stored for the ai model. NOT SHOWN TO THE USER!
  helpText?: string; // Seen by the user.
  iconName?: string; // Icon name from lucide-react.
  parentId?: string; // Used to create a hierarchy of options.
  metadata?: any; // Used to store any additional data for the option.
  order?: number; // Used to sort the options.
  [key: string]: any; // Extensibility for future needs
}

export interface FieldOptionsRuntime extends FieldOption {
  isSelected: boolean; // Used to determine if the option is selected.
  otherText?: string; // Used to store the text of the other option.
}

export type fieldDirection = "vertical" | "horizontal";

export interface ComponentProps {
  min: number;
  max: number;
  step: number;
  rows: number;
  minDate: string;
  maxDate: string;
  onLabel: string;
  offLabel: string;
  multiSelect: boolean;
  maxItems?: number;
  minItems: number;
  gridCols: string;
  autoComplete: string;
  direction: fieldDirection;
  customContent: ReactNode;
  showSelectAll: boolean;
  width: string;
  valuePrefix: string;
  valueSuffix: string;
  maxLength?: number;
  spellCheck: boolean;
  tableRules: TableRules;
}

export interface FieldDefinition {
  id: string;
  label: string;
  description: string;
  helpText: string;
  component: ComponentType;
  required: boolean;
  placeholder: string;
  componentProps: ComponentProps;
  includeOther: boolean;
  group?: string;
  iconName?: string;
  defaultValue?: any;
  options?: FieldOption[];
}

export type AppletContainer = {
  id: string;
  label: string;
  shortLabel?: string;
  description?: string;
  hideDescription?: boolean;
  helpText?: string;
  gridCols?: string; // Newly added and would need to be added to the database structure, slice, and many other places. ======================
  fields: FieldDefinition[];
};

export interface WorkflowSourceConfig {
  sourceType: "workflow";
  id: string;
  workflowId: string;
  [key: string]: any;
}

export interface ApiSourceConfig {
  sourceType: "api";
  id: string;
  [key: string]: any;
}

export interface DatabaseSourceConfig {
  sourceType: "database";
  id: string;
  [key: string]: any;
}

export interface OtherSourceConfig {
  sourceType: "other";
  id: string;
  [key: string]: any;
}

export interface PromptSourceConfig {
  sourceType: "prompt";
  id: string;
  [key: string]: any;
}

export interface NeededBroker {
  id: string;
  name: string;
  required: boolean;
  dataType: string;
  defaultValue: string;
  fieldComponentId?: string;
}

export interface RecipeSourceConfig {
  id: string;
  compiledId: string;
  version: number;
  neededBrokers: NeededBroker[];
  /** Cached agent/prompt ID from convert_compiled_recipe_to_prompt. Set on first FastAPI execution; avoids repeat conversion calls. */
  promptId?: string;
}

export interface AppletSourceConfig {
  sourceType?:
    "recipe" | "workflow" | "api" | "database" | "prompt" | "other" | string;
  config?:
    | RecipeSourceConfig
    | WorkflowSourceConfig
    | ApiSourceConfig
    | DatabaseSourceConfig
    | PromptSourceConfig
    | OtherSourceConfig;
}

export interface Broker {
  id: string;
  name: string;
  required: boolean;
  dataType: string;
  defaultValue: string;
  inputComponent: string;
}

export interface BrokerMapping {
  appletId: string;
  fieldId: string;
  brokerId: string;
}

export type AppletLayoutOption =
  | "horizontal"
  | "vertical"
  | "stepper"
  | "flat"
  | "open"
  | "oneColumn"
  | "twoColumn"
  | "threeColumn"
  | "fourColumn"
  | "tabs"
  | "accordion"
  | "minimalist"
  | "floatingCard"
  | "sidebar"
  | "carousel"
  | "cardStack"
  | "contextual"
  | "chat"
  | "mapBased"
  | "fullWidthSidebar"
  | "stepper-field"
  | "flat-accordion";

export type AppLayoutOptions =
  | "tabbedApplets"
  | "singleDropdown"
  | "multiDropdown"
  | "singleDropdownWithSearch"
  | "icons";

export type KnownMethod =
  "renderChat" | "changeApplet" | "renderModal" | "renderSampleApplet" | "none";

export interface HeaderExtraButtonsConfig {
  label: string;
  icon?: ReactNode;
  actionType?: "button" | "link" | "redux" | "none";
  onClick?: () => void;
  route?: string;
  reduxAction?: string;
  knownMethod?: KnownMethod;
}

export type CustomActionButton = {
  label: string;
  icon?: ReactNode;
  actionType?: "button" | "link" | "redux" | "none";
  onClick?: () => void;
  route?: string;
  reduxAction?: string;
  knownMethod?: KnownMethod;
};

export type AppletListItemConfig = {
  appletId: string;
  label: string;
  slug: string;
};

export type CustomAppConfig = {
  id?: string;
  name: string;
  description: string;
  slug: string;
  mainAppIcon?: string;
  mainAppSubmitIcon?: string;
  creator?: string;
  primaryColor?: string;
  accentColor?: string;
  appletList?: AppletListItemConfig[];
  extraButtons?: CustomActionButton[];
  layoutType?: AppLayoutOptions;
  imageUrl?: string;
  /** cld_files.id backing imageUrl. Source of truth for rendering; imageUrl is the durable fallback. */
  imageFileId?: string;
  createdAt?: string;
  updatedAt?: string;
  userId?: string;
  isPublic?: boolean;
  authenticatedRead?: boolean;
  publicRead?: boolean;
};

export type CustomAppletConfig = {
  id: string;
  name: string;
  description?: string;
  slug: string;
  /** From `custom_applet_configs.user_id` when loaded via `fetchAppletBySlug`. */
  userId?: string | null;
  /** From `custom_applet_configs.public_read` when loaded via `fetchAppletBySlug`. */
  publicRead?: boolean | null;
  appletIcon?: string;
  appletSubmitText?: string;
  creator?: string;
  primaryColor?: string;
  accentColor?: string;
  layoutType?: AppletLayoutOption;
  containers?: AppletContainer[];
  dataSourceConfig?: AppletSourceConfig;
  dataDestinationConfig?: Json | null;
  resultComponentConfig?: any;
  nextStepConfig?: any;
  compiledRecipeId?: string;
  subcategoryId?: string;
  imageUrl?: string;
  /** cld_files.id backing imageUrl. Source of truth for rendering; imageUrl is the durable fallback. */
  imageFileId?: string;
  appId?: string;
  brokerMap?: BrokerMapping[];
  overviewLabel?: string; // "This will replace the message for Minimalist Layout as well as show after submission if things are put together. (eg. What are you looking for?)"
};

/** Matches `FieldBuilder` in app-builder (FieldDefinition + editor flags) without importing app-builder. */
export type FieldBuilderInput = Partial<
  FieldDefinition & {
    isPublic?: boolean;
    authenticatedRead?: boolean;
    publicRead?: boolean;
    isDirty?: boolean;
    isLocal?: boolean;
  }
>;

export function normalizeFieldDefinition(
  field: FieldBuilderInput,
): FieldDefinition {
  const componentType = field.component || "textarea";
  const defaultComponentProps: ComponentProps = {
    min: 0,
    max: 100,
    step: 1,
    rows: 3,
    minDate: "",
    maxDate: "",
    onLabel: "Yes",
    offLabel: "No",
    multiSelect: false,
    maxItems: undefined,
    minItems: 0,
    gridCols: "grid-cols-1",
    autoComplete: "off",
    direction: "vertical",
    customContent: undefined,
    showSelectAll: false,
    width: "w-full",
    valuePrefix: "",
    valueSuffix: "",
    maxLength: undefined,
    spellCheck: false,
    tableRules: defaultTableRules,
  };

  const mergedComponentProps = {
    ...defaultComponentProps,
    ...(field.componentProps || {}),
  };

  return {
    id: field.id || "temp-id",
    label: field.label || "Untitled Field",
    description: field.description || "",
    helpText: field.helpText || "",
    group: field.group || "default",
    iconName: field.iconName || "",
    component: componentType,
    required: field.required !== undefined ? field.required : false,
    placeholder: field.placeholder || "",
    defaultValue: field.defaultValue !== undefined ? field.defaultValue : "",
    options: field.options || [],
    componentProps: mergedComponentProps,
    includeOther: field.includeOther !== undefined ? field.includeOther : false,
  };
}

export type ComponentGroup = AppletContainer & {
  isPublic?: boolean;
  authenticatedRead?: boolean;
  publicRead?: boolean;
};
