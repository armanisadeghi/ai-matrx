# ContentBlockWrapper

A reusable wrapper component that provides consistent UI and functionality for all content blocks (quizzes, math problems, presentations, etc.) in the markdown display system.

## What It Provides

- **Fullscreen Mode**: Toggle focus mode with ESC key support
- **Canvas Integration**: Open content in the Canvas workspace
- **File Operations**: Download/upload content as JSON
- **Action Buttons**: Consistent action bar with custom actions support
- **Save Management**: Visual save status indicators
- **Responsive**: Adapts to all screen sizes
- **Dark Mode**: Full theme support

## Basic Usage

```tsx
import ContentBlockWrapper from "@/components/mardown-display/blocks/common/ContentBlockWrapper";

<ContentBlockWrapper
    title="My Content"
    subtitle="Category"
    canvasType="my_type"
    canvasData={data}
    onDownload={handleDownload}
    onUpload={handleUpload}
    allowFullscreen={true}
>
    <YourContentComponent />
</ContentBlockWrapper>
```

## Key Props

| Prop | Type | Description |
|------|------|-------------|
| `children` | ReactNode | Your content component |
| `title` | string | Header title |
| `subtitle` | string | Category badge |
| `canvasType` | CanvasContentType | Type for canvas integration |
| `canvasData` | any | Data to pass to canvas |
| `onDownload` | () => void | Download handler |
| `onUpload` | () => Promise<void> | Upload handler |
| `onSave` | () => Promise<void> | Save handler |
| `customActions` | ContentBlockAction[] | Additional action buttons |
| `allowFullscreen` | boolean | Enable fullscreen toggle |

See `ContentBlockWrapper.tsx` for complete prop list.

## Adding a New Content Block

### 1. Define the Type

Add to `CanvasContentType` in `features/canvas/canvasContent.ts`:
```typescript
export type CanvasContentType = 'quiz' | 'your_type' | ...
```

### 2. Add JSON Detection

In `content-splitter.ts` (~line 700), add detection function:
```typescript
const isYourTypeJson = (jsonContent: string): { isYourType: boolean; isComplete: boolean } => {
    const trimmed = jsonContent.trim();
    
    // Fast check
    if (!trimmed.startsWith('{\n  "your_type"')) {
        return { isYourType: false, isComplete: false };
    }
    
    // Brace counting for streaming
    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;
    
    if (openBraces > closeBraces) {
        return { isYourType: true, isComplete: false };
    }
    
    // Validate when complete
    if (trimmed.endsWith("}") && openBraces === closeBraces) {
        try {
            const parsed = JSON.parse(trimmed);
            return { isYourType: !!parsed?.your_type, isComplete: true };
        } catch {
            return { isYourType: true, isComplete: false };
        }
    }
    
    return { isYourType: true, isComplete: false };
};
```

Add to `ContentBlock` type and processing loop.

### 3. Create Your Component

```tsx
// blocks/your-type/YourTypeBlock.tsx
"use client";

import ContentBlockWrapper from "../common/ContentBlockWrapper";

interface YourTypeBlockProps {
    yourData: { your_type: { /* structure */ } };
}

const YourTypeBlock: React.FC<YourTypeBlockProps> = ({ yourData }) => {
    const handleDownload = () => {
        const json = JSON.stringify(yourData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'content.json';
        a.click();
        URL.revokeObjectURL(url);
    };
    
    return (
        <ContentBlockWrapper
            title={yourData.your_type.title}
            canvasType="your_type"
            canvasData={yourData}
            onDownload={handleDownload}
            allowFullscreen={true}
        >
            {/* Your content here */}
        </ContentBlockWrapper>
    );
};

export default YourTypeBlock;
```

### 4. Add to EnhancedChatMarkdown

In `EnhancedChatMarkdown.tsx`, import and add render case:
```typescript
import YourTypeBlock from "../blocks/your-type/YourTypeBlock";

// In renderBlock():
case "your_type":
    if (!block.complete) {
        return <LoadingVisualization key={index} />;
    }
    try {
        const parsed = JSON.parse(block.content);
        return <YourTypeBlock key={index} yourData={parsed} />;
    } catch (error) {
        return <ErrorDisplay key={index} />;
    }
```

### 5. Add Canvas Support

In `CanvasRenderer.tsx`:
- Import your component
- Add to `getDefaultTitle()` and `getSubtitle()` helpers
- Add render case in `renderContent()`

## Custom Actions

Add block-specific buttons:
```tsx
const customActions = [
    {
        icon: YourIcon,
        tooltip: "Custom action",
        onClick: handleAction,
        className: "bg-blue-500 text-white hover:bg-blue-600"
    }
];

<ContentBlockWrapper customActions={customActions}>
    ...
</ContentBlockWrapper>
```

## Key Files to Modify

1. `features/canvas/canvasContent.ts` - Add type definition
2. `content-splitter.ts` - Add JSON detection
3. `EnhancedChatMarkdown.tsx` - Add rendering
4. `CanvasRenderer.tsx` - Add canvas support
5. Create your block component

## Notes

- **Streaming Resilience**: Use brace counting, not just `endsWith("}")`
- **Type Safety**: Always validate JSON structure before accessing fields
- **Error Handling**: Wrap JSON parsing in try-catch blocks
- **Testing**: Test with streaming JSON, complete JSON, and malformed input
