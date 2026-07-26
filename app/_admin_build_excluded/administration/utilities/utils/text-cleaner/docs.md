# Tasks & Ideas
- [ O ] Add feature to parse TypeScript Errors to extract what matters for long ones. (partially done)
- [ ] Update TypeScript Error system to handle multiple errors pasted together.




Progress: Add feature to parse TypeScript Errors to extract what matters for long ones.

Example: 
```error
<html>TS2322: Type '{ footer?: ReactNode; style?: CSSProperties; title?: string; required?: boolean; className?: string; classNames?: Partial&lt;ClassNames&gt; &amp; Partial&lt;DeprecatedUI&lt;string&gt;&gt;; modifiersClassNames?: ModifiersClassNames; styles?: Partial&lt;Styles&gt; &amp; Partial&lt;DeprecatedUI&lt;CSSProperties&gt;&gt;; modifiersStyles?: ModifiersStyles; id?: string; defaultMonth?: Date; month?: Date; numberOfMonths?: number; startMonth?: Date; fromDate?: Date; fromMonth?: Date; fromYear?: number; endMonth?: Date; toDate?: Date; toMonth?: Date; toYear?: number; pagedNavigation?: boolean; reverseMonths?: boolean; hideNavigation?: boolean; disableNavigation?: boolean; captionLayout?: &quot;label&quot; | &quot;dropdown&quot; | &quot;dropdown-months&quot; | &quot;dropdown-years&quot;; fixedWeeks?: boolean; hideWeekdays?: boolean; showOutsideDays?: boolean; showWeekNumber?: boolean; ISOWeek?: boolean; timeZone?: string; components?: Partial&lt;CustomComponents&gt;; autoFocus?: boolean; initialFocus: boolean; disabled?: Matcher | Matcher[]; hidden?: Matcher | Matcher[]; today?: Date; modifiers?: Record&lt;string, Matcher | Matcher[]&gt;; labels?: Partial&lt;Labels&gt;; formatters?: Partial&lt;Formatters&gt;; dir?: string; nonce?: string; lang?: string; locale?: Partial&lt;Locale&gt;; weekStartsOn?: 0 | 2 | 1 | 3 | 4 | 5 | 6; firstWeekContainsDate?: 1 | 4; useAdditionalWeekYearTokens?: boolean; useAdditionalDayOfYearTokens?: boolean; onMonthChange?: MonthChangeEventHandler; onNextClick?: MonthChangeEventHandler; onPrevClick?: MonthChangeEventHandler; onWeekNumberClick?: any; onDayClick?: DayEventHandler&lt;MouseEvent&lt;Element, MouseEvent&gt;&gt;; onDayFocus?: DayEventHandler&lt;FocusEvent&lt;Element, Element&gt;&gt;; onDayBlur?: DayEventHandler&lt;FocusEvent&lt;Element, Element&gt;&gt;; onDayKeyDown?: DayEventHandler&lt;KeyboardEvent&lt;Element&gt;&gt;; onDayMouseEnter?: DayEventHandler&lt;MouseEvent&lt;Element, MouseEvent&gt;&gt;; onDayMouseLeave?: DayEventHandler&lt;MouseEvent&lt;Element, MouseEvent&gt;&gt;; dateLib?: Partial&lt;DateLib&gt;; onDayKeyUp?: DayEventHandler&lt;KeyboardEvent&lt;Element&gt;&gt;; onDayKeyPress?: DayEventHandler&lt;KeyboardEvent&lt;Element&gt;&gt;; onDayPointerEnter?: DayEventHandler&lt;PointerEvent&lt;Element&gt;&gt;; onDayPointerLeave?: DayEventHandler&lt;PointerEvent&lt;Element&gt;&gt;; onDayTouchCancel?: DayEventHandler&lt;TouchEvent&lt;Element&gt;&gt;; onDayTouchEnd?: DayEventHandler&lt;TouchEvent&lt;Element&gt;&gt;; onDayTouchMove?: DayEventHandler&lt;TouchEvent&lt;Element&gt;&gt;; onDayTouchStart?: DayEventHandler&lt;TouchEvent&lt;Element&gt;&gt;; mode: &quot;single&quot;; selected: Date; onSelect: (newDate: Date | DateRange) =&gt; void; }' is not assignable to type 'IntrinsicAttributes &amp; DayPickerProps'.<br/>Type '{ footer?: ReactNode; style?: CSSProperties; title?: string; required?: boolean; className?: string; classNames?: Partial&lt;ClassNames&gt; &amp; Partial&lt;DeprecatedUI&lt;string&gt;&gt;; modifiersClassNames?: ModifiersClassNames; styles?: Partial&lt;Styles&gt; &amp; Partial&lt;DeprecatedUI&lt;CSSProperties&gt;&gt;; modifiersStyles?: ModifiersStyles; id?: string; defaultMonth?: Date; month?: Date; numberOfMonths?: number; startMonth?: Date; fromDate?: Date; fromMonth?: Date; fromYear?: number; endMonth?: Date; toDate?: Date; toMonth?: Date; toYear?: number; pagedNavigation?: boolean; reverseMonths?: boolean; hideNavigation?: boolean; disableNavigation?: boolean; captionLayout?: &quot;label&quot; | &quot;dropdown&quot; | &quot;dropdown-months&quot; | &quot;dropdown-years&quot;; fixedWeeks?: boolean; hideWeekdays?: boolean; showOutsideDays?: boolean; showWeekNumber?: boolean; ISOWeek?: boolean; timeZone?: string; components?: Partial&lt;CustomComponents&gt;; autoFocus?: boolean; initialFocus: boolean; disabled?: Matcher | Matcher[]; hidden?: Matcher | Matcher[]; today?: Date; modifiers?: Record&lt;string, Matcher | Matcher[]&gt;; labels?: Partial&lt;Labels&gt;; formatters?: Partial&lt;Formatters&gt;; dir?: string; nonce?: string; lang?: string; locale?: Partial&lt;Locale&gt;; weekStartsOn?: 0 | 2 | 1 | 3 | 4 | 5 | 6; firstWeekContainsDate?: 1 | 4; useAdditionalWeekYearTokens?: boolean; useAdditionalDayOfYearTokens?: boolean; onMonthChange?: MonthChangeEventHandler; onNextClick?: MonthChangeEventHandler; onPrevClick?: MonthChangeEventHandler; onWeekNumberClick?: any; onDayClick?: DayEventHandler&lt;MouseEvent&lt;Element, MouseEvent&gt;&gt;; onDayFocus?: DayEventHandler&lt;FocusEvent&lt;Element, Element&gt;&gt;; onDayBlur?: DayEventHandler&lt;FocusEvent&lt;Element, Element&gt;&gt;; onDayKeyDown?: DayEventHandler&lt;KeyboardEvent&lt;Element&gt;&gt;; onDayMouseEnter?: DayEventHandler&lt;MouseEvent&lt;Element, MouseEvent&gt;&gt;; onDayMouseLeave?: DayEventHandler&lt;MouseEvent&lt;Element, MouseEvent&gt;&gt;; dateLib?: Partial&lt;DateLib&gt;; onDayKeyUp?: DayEventHandler&lt;KeyboardEvent&lt;Element&gt;&gt;; onDayKeyPress?: DayEventHandler&lt;KeyboardEvent&lt;Element&gt;&gt;; onDayPointerEnter?: DayEventHandler&lt;PointerEvent&lt;Element&gt;&gt;; onDayPointerLeave?: DayEventHandler&lt;PointerEvent&lt;Element&gt;&gt;; onDayTouchCancel?: DayEventHandler&lt;TouchEvent&lt;Element&gt;&gt;; onDayTouchEnd?: DayEventHandler&lt;TouchEvent&lt;Element&gt;&gt;; onDayTouchMove?: DayEventHandler&lt;TouchEvent&lt;Element&gt;&gt;; onDayTouchStart?: DayEventHandler&lt;TouchEvent&lt;Element&gt;&gt;; mode: &quot;single&quot;; selected: Date; onSelect: (newDate: Date | DateRange) =&gt; void; }' is not assignable to type '(IntrinsicAttributes &amp; PropsBase &amp; PropsSingle) | (IntrinsicAttributes &amp; PropsBase &amp; PropsSingleRequired)'.<br/>Type '{ footer?: ReactNode; style?: CSSProperties; title?: string; required?: boolean; className?: string; classNames?: Partial&lt;ClassNames&gt; &amp; Partial&lt;DeprecatedUI&lt;string&gt;&gt;; modifiersClassNames?: ModifiersClassNames; styles?: Partial&lt;Styles&gt; &amp; Partial&lt;DeprecatedUI&lt;CSSProperties&gt;&gt;; modifiersStyles?: ModifiersStyles; id?: string; defaultMonth?: Date; month?: Date; numberOfMonths?: number; startMonth?: Date; fromDate?: Date; fromMonth?: Date; fromYear?: number; endMonth?: Date; toDate?: Date; toMonth?: Date; toYear?: number; pagedNavigation?: boolean; reverseMonths?: boolean; hideNavigation?: boolean; disableNavigation?: boolean; captionLayout?: &quot;label&quot; | &quot;dropdown&quot; | &quot;dropdown-months&quot; | &quot;dropdown-years&quot;; fixedWeeks?: boolean; hideWeekdays?: boolean; showOutsideDays?: boolean; showWeekNumber?: boolean; ISOWeek?: boolean; timeZone?: string; components?: Partial&lt;CustomComponents&gt;; autoFocus?: boolean; initialFocus: boolean; disabled?: Matcher | Matcher[]; hidden?: Matcher | Matcher[]; today?: Date; modifiers?: Record&lt;string, Matcher | Matcher[]&gt;; labels?: Partial&lt;Labels&gt;; formatters?: Partial&lt;Formatters&gt;; dir?: string; nonce?: string; lang?: string; locale?: Partial&lt;Locale&gt;; weekStartsOn?: 0 | 2 | 1 | 3 | 4 | 5 | 6; firstWeekContainsDate?: 1 | 4; useAdditionalWeekYearTokens?: boolean; useAdditionalDayOfYearTokens?: boolean; onMonthChange?: MonthChangeEventHandler; onNextClick?: MonthChangeEventHandler; onPrevClick?: MonthChangeEventHandler; onWeekNumberClick?: any; onDayClick?: DayEventHandler&lt;MouseEvent&lt;Element, MouseEvent&gt;&gt;; onDayFocus?: DayEventHandler&lt;FocusEvent&lt;Element, Element&gt;&gt;; onDayBlur?: DayEventHandler&lt;FocusEvent&lt;Element, Element&gt;&gt;; onDayKeyDown?: DayEventHandler&lt;KeyboardEvent&lt;Element&gt;&gt;; onDayMouseEnter?: DayEventHandler&lt;MouseEvent&lt;Element, MouseEvent&gt;&gt;; onDayMouseLeave?: DayEventHandler&lt;MouseEvent&lt;Element, MouseEvent&gt;&gt;; dateLib?: Partial&lt;DateLib&gt;; onDayKeyUp?: DayEventHandler&lt;KeyboardEvent&lt;Element&gt;&gt;; onDayKeyPress?: DayEventHandler&lt;KeyboardEvent&lt;Element&gt;&gt;; onDayPointerEnter?: DayEventHandler&lt;PointerEvent&lt;Element&gt;&gt;; onDayPointerLeave?: DayEventHandler&lt;PointerEvent&lt;Element&gt;&gt;; onDayTouchCancel?: DayEventHandler&lt;TouchEvent&lt;Element&gt;&gt;; onDayTouchEnd?: DayEventHandler&lt;TouchEvent&lt;Element&gt;&gt;; onDayTouchMove?: DayEventHandler&lt;TouchEvent&lt;Element&gt;&gt;; onDayTouchStart?: DayEventHandler&lt;TouchEvent&lt;Element&gt;&gt;; mode: &quot;single&quot;; selected: Date; onSelect: (newDate: Date | DateRange) =&gt; void; }' is not assignable to type 'PropsSingleRequired'.<br/>Types of property 'required' are incompatible.<br/>Type 'boolean' is not assignable to type 'true'.
```
This is really just saying:
- The `required` prop is not of type `true` as expected by the `PropsSingleRequired` interface.
- The `required` prop is of type `boolean` as expected by the `PropsSingle` interface.
- Maybe something like this: "TS2322: Type '{ footer?: ReactNode; style?: CSSProperties; title?: string; required?:... onSelect: (newDate: Date | DateRange) = void; }' is not assignable to type 'PropsSingleRequired'."
```

- Well, I ended up doing a lot of it but here is the link and the final suggestions:
https://console.anthropic.com/workbench/e9b5997a-157b-498c-88ef-05bf20d4d7be

# Error Parser Enhancement Plan

## 1. Length-Based Processing Strategy

### Implementation Notes
```typescript
interface LengthThresholds {
  critical: number;    // e.g., 500 chars
  moderate: number;    // e.g., 1000 chars
  verbose: number;     // e.g., 2000 chars
}

interface TruncationRules {
  maxTypes: number;        // Maximum number of types to show
  maxSuggestions: number;  // Maximum suggestions to show
  maxProps: number;        // Maximum properties to list
  ellipsisStyle: 'smart' | 'simple';  // How to handle truncation
}
```

### Action Items
1. Add length thresholds to `ErrorManager` configuration
2. Create truncation rules for different length scenarios
3. Implement smart truncation logic for type definitions
4. Add configuration options for customizing thresholds

## 2. Smart Type Reduction

### Implementation Notes
```typescript
interface TypeReductionStrategy {
  complexTypes: boolean;     // Show full generic types
  unionTypes: boolean;       // Show all union options
  recursiveTypes: boolean;   // Handle nested type definitions
  propertyList: boolean;     // Show full property list
}
```

### Action Items
1. Create type complexity analyzer
2. Implement smart type reduction algorithm
3. Add type importance scoring
4. Create type summary generator

## 3. Enhanced Error Classification

### Implementation Notes
```typescript
interface ErrorClassification {
  category: 'type' | 'syntax' | 'runtime' | 'prop';
  severity: 'critical' | 'major' | 'minor';
  context: 'component' | 'hook' | 'function' | 'generic';
  impact: 'high' | 'medium' | 'low';
}
```

### Action Items
1. Expand error classification system
2. Create context-aware error processor
3. Implement severity assessment
4. Add impact analysis

## 4. Component Updates

### Implementation Notes
```typescript
interface ErrorDisplayConfig {
  mode: 'compact' | 'detailed' | 'interactive';
  features: {
    expandable: boolean;
    copyable: boolean;
    searchable: boolean;
    filterable: boolean;
  };
}
```

### Action Items
1. Add progressive disclosure UI
2. Implement expandable sections
3. Add error navigation
4. Create error relationship visualization

## 5. Hook Enhancements

### Implementation Notes
```typescript
interface ErrorProcessingOptions {
  autoTruncate: boolean;
  preserveContext: boolean;
  smartSuggestions: boolean;
  relationshipTracking: boolean;
}
```

### Action Items
1. Add configuration options
2. Implement error relationship tracking
3. Add error history management
4. Create error pattern recognition

## Detailed Implementation Guide

### 1. Update ErrorManager Class

```typescript
class ErrorManager {
  // Add new configuration
  private static readonly CONFIG = {
    thresholds: {
      critical: 500,
      moderate: 1000,
      verbose: 2000
    },
    truncation: {
      maxTypes: 3,
      maxSuggestions: 2,
      maxProps: 5
    }
  };

  // Add new processing methods
  private static processBasedOnLength(error: string): ProcessingStrategy {
    const length = error.length;
    if (length > this.CONFIG.thresholds.verbose) {
      return 'aggressive-truncation';
    }
    // ... etc
  }

  // Add type reduction logic
  private static reduceTypeComplexity(type: string): string {
    // Implement smart type reduction
  }
}
```

### 2. Update Hook

```typescript
// Add new state and methods
const useTextCleaner = () => {
  const [errorProcessingConfig, setErrorProcessingConfig] = 
    useState<ErrorProcessingOptions>({
      autoTruncate: true,
      preserveContext: true,
      smartSuggestions: true,
      relationshipTracking: true
    });

  // Add new processing methods
  const processErrorWithConfig = useCallback((error: string) => {
    // Implement configured processing
  }, [errorProcessingConfig]);
};
```

### 3. Update Component

```typescript
// Add new UI elements and handlers
const TextCleanerComponent: React.FC = () => {
  // Add configuration panel
  const renderErrorConfig = () => {
    // Implement configuration UI
  };

  // Add progressive disclosure
  const renderErrorContent = () => {
    // Implement expandable content
  };
};
```

## Implementation Priority

1. Length-based processing
    - Implement thresholds
    - Add basic truncation
    - Test with various error lengths

2. Smart type reduction
    - Build type analyzer
    - Implement reduction logic
    - Add type importance scoring

3. Error classification
    - Create classification system
    - Implement context awareness
    - Add severity assessment

4. UI enhancements
    - Add progressive disclosure
    - Implement expandable sections
    - Add error navigation

5. Hook updates
    - Add configuration options
    - Implement relationship tracking
    - Add pattern recognition

## Testing Strategy

1. Create test suite with various error types
2. Test different length scenarios
3. Verify truncation logic
4. Validate type reduction
5. Test UI responsiveness

## Documentation Requirements

1. Update type definitions
2. Document configuration options
3. Create usage examples
4. Add troubleshooting guide

## Migration Notes

1. Preserve existing functionality
2. Add feature flags for new features
3. Implement graceful degradation
4. Provide migration guide

This plan provides a structured approach to enhancing the error parser while maintaining existing functionality. The developer should implement these changes incrementally, starting with length-based processing and moving through the priority list.
