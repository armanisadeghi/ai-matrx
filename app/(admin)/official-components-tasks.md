# Official Components Migration Tasks

## Migration of Official Components from admin to admin-auth

- [ ] Create new directory structure in admin-auth for official components
  - [ ] Verified by Arman
- [ ] Move official-components.md to new location
  - [ ] Verified by Arman
- [ ] Move page.tsx to new location
  - [ ] Verified by Arman
- [ ] Move component-list.ts to new location
  - [ ] Verified by Arman
- [ ] Move component-usage.tsx to new location
  - [ ] Verified by Arman
- [ ] Move all files from component-displays directory
  - [ ] Verified by Arman
- [ ] Update all imports in moved files to reflect new paths
  - [ ] Verified by Arman
- [ ] Update any references to these components throughout the codebase
  - [ ] Verified by Arman
- [ ] Test all component displays to ensure they work in the new location
  - [ ] Verified by Arman

## Fix JSON Explorer Demo

- [ ] Diagnose issue with JSON Explorer demo
  - [ ] Verified by Arman
- [ ] Update JSON Explorer demo to use correct imports and data
  - [ ] Verified by Arman
- [ ] Fix any styling or layout issues
  - [ ] Verified by Arman
- [ ] Test functionality in both light and dark mode
  - [ ] Verified by Arman
- [ ] Ensure demo properly demonstrates all features of the JSON Explorer
  - [ ] Verified by Arman

## Documentation Updates

- [ ] Update component documentation to reflect new location
  - [ ] Verified by Arman
- [ ] Add any missing components to the documentation
  - [ ] Verified by Arman
- [ ] Improve usage examples for each component
  - [ ] Verified by Arman
- [ ] Add code snippets for common use cases
  - [ ] Verified by Arman
- [ ] Document light/dark mode usage for all components
  - [ ] Verified by Arman

## Component Enhancements

- [ ] Review and improve FullScreenOverlay component
  - [ ] Verified by Arman
- [ ] Enhance AccordionWrapper component
  - [ ] Verified by Arman
- [ ] Review and improve RawJsonExplorer component
  - [ ] Verified by Arman
- [ ] Ensure all components follow consistent styling patterns
  - [ ] Verified by Arman
- [ ] Add proper TypeScript typing to all components
  - [ ] Verified by Arman

## Testing and Quality Assurance

- [ ] Create test cases for each component
  - [ ] Verified by Arman
- [ ] Test all components in various viewport sizes
  - [ ] Verified by Arman
- [ ] Test keyboard navigation and accessibility
  - [ ] Verified by Arman
- [ ] Test component integration with each other
  - [ ] Verified by Arman
- [ ] Document any edge cases or limitations
  - [ ] Verified by Arman 



  NEW TASKS FROM ARMAN:
  - We need to create a way to have the admin system also include places for test components and infomational things. Likely in a nice, well-categorized way.
  - As our first one, The following route needs to be moved to the admin system: /applet/test-applets (This is a simple testing system for testing a hook)
  