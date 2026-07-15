import { TableLoadingComponent } from '@/components/matrx/LoadingComponents';

export default function Loading() {
  return (
    <div className="w-full h-full overflow-hidden bg-gray-100 dark:bg-gray-900 pt-[var(--shell-header-h)] p-4 rounded-lg space-y-4">
      <TableLoadingComponent />
    </div>
  );
}
