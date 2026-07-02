import { CustomAppConfig, CustomAppletConfig, AppletLayoutOption, AppLayoutOptions } from '@/types/customAppTypes';
import { extractErrorMessage } from '@/utils/errors';

// Types for validation results
export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  // Debug metadata attached per-issue — shape varies by validator (see call sites below).
  data?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

// Type for validation function
export type ValidatorFn = (appConfig: CustomAppConfig, applets: CustomAppletConfig[]) => ValidationIssue[];

/**
 * Validates that app.appletList matches exactly with the actual applets array
 */
export const validateAppletListConsistency: ValidatorFn = (appConfig, applets) => {
  const issues: ValidationIssue[] = [];
  
  if (!appConfig.appletList || appConfig.appletList.length === 0) {
    issues.push({
      code: 'APP_MISSING_APPLET_LIST',
      message: 'App configuration is missing appletList',
      severity: 'error'
    });
    return issues;
  }
  
  // Check that every applet in appletList exists in applets
  const appletMap = new Map(applets.map(applet => [applet.id, applet]));
  
  for (const listItem of appConfig.appletList) {
    const applet = appletMap.get(listItem.appletId);
    
    if (!applet) {
      issues.push({
        code: 'APPLET_LIST_CONTAINS_NONEXISTENT_APPLET',
        message: `App references applet ID ${listItem.appletId} which doesn't exist`,
        severity: 'error',
        data: { appletId: listItem.appletId }
      });
      continue;
    }
    
    // Check that label matches
    if (listItem.label !== applet.name) {
      issues.push({
        code: 'APPLET_LIST_LABEL_MISMATCH',
        message: `Applet list label "${listItem.label}" doesn't match applet name "${applet.name}"`,
        severity: 'warning',
        data: { appletId: listItem.appletId, listLabel: listItem.label, appletName: applet.name }
      });
    }
    
    // Check that slug matches
    if (listItem.slug !== applet.slug) {
      issues.push({
        code: 'APPLET_LIST_SLUG_MISMATCH',
        message: `Applet list slug "${listItem.slug}" doesn't match applet slug "${applet.slug}"`,
        severity: 'error',
        data: { appletId: listItem.appletId, listSlug: listItem.slug, appletSlug: applet.slug }
      });
    }
  }
  
  // Check that every applet exists in appletList
  const appletListIds = new Set(appConfig.appletList.map(item => item.appletId));
  
  for (const applet of applets) {
    if (!appletListIds.has(applet.id)) {
      issues.push({
        code: 'APPLET_MISSING_FROM_APPLET_LIST',
        message: `Applet ID ${applet.id} exists but is not in app's appletList`,
        severity: 'error',
        data: { appletId: applet.id, appletName: applet.name }
      });
    }
  }
  
  return issues;
};

/**
 * Validates that applets have valid sourceType
 */
export const validateAppletSourceType: ValidatorFn = (appConfig, applets) => {
  const issues: ValidationIssue[] = [];
  const validSourceTypes = ['recipe', 'workflow', 'api', 'database', 'other'];
  
  for (const applet of applets) {
    if (!applet.dataSourceConfig || !applet.dataSourceConfig.sourceType) {
      issues.push({
        code: 'APPLET_MISSING_SOURCE_TYPE',
        message: `Applet "${applet.name}" is missing dataSourceConfig or sourceType`,
        severity: 'error',
        data: { appletId: applet.id, appletName: applet.name }
      });
      continue;
    }
    
    const sourceType = applet.dataSourceConfig.sourceType;
    if (!validSourceTypes.includes(sourceType)) {
      issues.push({
        code: 'APPLET_INVALID_SOURCE_TYPE',
        message: `Applet "${applet.name}" has invalid sourceType "${sourceType}"`,
        severity: 'error',
        data: { appletId: applet.id, appletName: applet.name, sourceType }
      });
    }
  }
  
  return issues;
};

/**
 * Validates app layout type
 */
export const validateAppLayoutType: ValidatorFn = (appConfig, applets) => {
  const issues: ValidationIssue[] = [];
  const validLayoutTypes: AppLayoutOptions[] = [
    'tabbedApplets', 
    'singleDropdown', 
    'multiDropdown', 
    'singleDropdownWithSearch', 
    'icons'
  ];
  
  if (!appConfig.layoutType) {
    issues.push({
      code: 'APP_MISSING_LAYOUT_TYPE',
      message: 'App is missing layoutType',
      severity: 'warning'
    });
    return issues;
  }
  
  if (!validLayoutTypes.includes(appConfig.layoutType as AppLayoutOptions)) {
    issues.push({
      code: 'APP_INVALID_LAYOUT_TYPE',
      message: `App has invalid layoutType "${appConfig.layoutType}"`,
      severity: 'error',
      data: { layoutType: appConfig.layoutType }
    });
  }
  
  return issues;
};

/**
 * Validates applet layout types
 */
export const validateAppletLayoutTypes: ValidatorFn = (appConfig, applets) => {
  const issues: ValidationIssue[] = [];
  const validLayoutTypes: AppletLayoutOption[] = [
    'horizontal', 'vertical', 'stepper', 'flat', 'open',
    'oneColumn', 'twoColumn', 'threeColumn', 'fourColumn',
    'tabs', 'accordion', 'minimalist', 'floatingCard',
    'sidebar', 'carousel', 'cardStack', 'contextual',
    'chat', 'mapBased', 'fullWidthSidebar'
    // Note: 'input-bar' is not a valid AppletLayoutOption, removed from validation
  ];
  
  for (const applet of applets) {
    if (!applet.layoutType) {
      issues.push({
        code: 'APPLET_MISSING_LAYOUT_TYPE',
        message: `Applet "${applet.name}" is missing layoutType`,
        severity: 'warning',
        data: { appletId: applet.id, appletName: applet.name }
      });
      continue;
    }
    
    if (!validLayoutTypes.includes(applet.layoutType as AppletLayoutOption)) {
      issues.push({
        code: 'APPLET_INVALID_LAYOUT_TYPE',
        message: `Applet "${applet.name}" has invalid layoutType "${applet.layoutType}"`,
        severity: 'error',
        data: { appletId: applet.id, appletName: applet.name, layoutType: applet.layoutType }
      });
    }
  }
  
  return issues;
};

/**
 * Validates required app icons
 */
export const validateAppIcons: ValidatorFn = (appConfig, applets) => {
  const issues: ValidationIssue[] = [];
  
  if (!appConfig.mainAppIcon) {
    issues.push({
      code: 'APP_MISSING_MAIN_ICON',
      message: 'App is missing mainAppIcon',
      severity: 'warning'
    });
  }
  
  if (!appConfig.mainAppSubmitIcon) {
    issues.push({
      code: 'APP_MISSING_SUBMIT_ICON',
      message: 'App is missing mainAppSubmitIcon',
      severity: 'warning'
    });
  }
  
  return issues;
};

/**
 * Validates required applet icons and text
 */
export const validateAppletIcons: ValidatorFn = (appConfig, applets) => {
  const issues: ValidationIssue[] = [];
  
  for (const applet of applets) {
    if (!applet.appletIcon) {
      issues.push({
        code: 'APPLET_MISSING_ICON',
        message: `Applet "${applet.name}" is missing appletIcon`,
        severity: 'warning',
        data: { appletId: applet.id, appletName: applet.name }
      });
    }
  }
  
  return issues;
};

/**
 * Validates that applets have at least one container
 */
export const validateAppletContainers: ValidatorFn = (appConfig, applets) => {
  const issues: ValidationIssue[] = [];
  
  for (const applet of applets) {
    if (!applet.containers || applet.containers.length === 0) {
      issues.push({
        code: 'APPLET_NO_CONTAINERS',
        message: `Applet "${applet.name}" doesn't have any containers`,
        severity: 'error',
        data: { appletId: applet.id, appletName: applet.name }
      });
    }
  }
  
  return issues;
};

// Combined array of all validators
const ALL_VALIDATORS: ValidatorFn[] = [
  validateAppletListConsistency,
  validateAppletSourceType,
  validateAppLayoutType,
  validateAppletLayoutTypes,
  validateAppIcons,
  validateAppletIcons,
  validateAppletContainers
];

// Options for running validations
export interface ValidationOptions {
  runValidations: boolean;
  validators?: ValidatorFn[];
  logResults?: boolean;
  severity?: 'info' | 'warning' | 'error';
}

/**
 * Runs all validations on app configuration and applets
 */
export function validateAppWithApplets(
  appConfig: CustomAppConfig, 
  applets: CustomAppletConfig[],
  options: ValidationOptions = { runValidations: false, logResults: false }
): ValidationResult {
  try {
    // If validations are disabled, return valid result
    if (!options.runValidations) {
      return { valid: true, issues: [] };
    }
    
    // Defensive check for invalid inputs
    if (!appConfig || !applets || !Array.isArray(applets)) {
      return { 
        valid: false, 
        issues: [{
          code: 'VALIDATION_INVALID_INPUT',
          message: 'Invalid app configuration or applets data provided',
          severity: 'error'
        }]
      };
    }
    
    // Determine which validators to run
    const validators = options.validators || ALL_VALIDATORS;
    
    // Run all validators
    const allIssues: ValidationIssue[] = [];
    
    for (const validator of validators) {
      try {
        const issues = validator(appConfig, applets);
        // Filter by severity if requested
        const filteredIssues = options.severity 
          ? issues.filter(issue => issue.severity === options.severity)
          : issues;
        allIssues.push(...filteredIssues);
      } catch (error) {
        // Log but don't rethrow errors from individual validators
        console.debug(`Validation error in ${validator.name || 'unknown validator'}:`, error);
        allIssues.push({
          code: 'VALIDATOR_ERROR',
          message: `Error running validator ${validator.name || 'unknown'}: ${error}`,
          severity: 'error',
          data: { validatorName: validator.name, error: extractErrorMessage(error) }
        });
      }
    }
    
    // Log results if requested
    if (options.logResults && allIssues.length > 0) {
      console.debug(`App validation found ${allIssues.length} issues (for logging only):`, allIssues);
    }
    
    return {
      valid: allIssues.length === 0,
      issues: allIssues
    };
  } catch (error) {
    // Safety catch-all to prevent any possible validation errors from affecting the main app
    console.debug('Validation system error (safely contained):', error);
    return { 
      valid: false, 
      issues: [{
        code: 'VALIDATION_SYSTEM_ERROR',
        message: 'Validation system error (safely contained)',
        severity: 'error',
        data: { error: extractErrorMessage(error) }
      }]
    };
  }
} 