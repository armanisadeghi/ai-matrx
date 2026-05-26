import { ShortcutCategoriesManager } from '@/features/prompt-builtins/admin/ShortcutCategoriesManager';

export default function PromptShortcutCategoriesPage() {
  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <ShortcutCategoriesManager />
    </div>
  );
}

