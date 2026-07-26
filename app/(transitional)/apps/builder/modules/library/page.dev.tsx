'use client';

import ComponentLibrary from '@/features/applet/builder/modules/ComponentLibrary';
import BuilderPageLayout from '../common/BuilderPageLayout';

export default function ComponentLibraryPage() {
  return (
    <BuilderPageLayout activeModuleId="library">
      <ComponentLibrary />
    </BuilderPageLayout>
  );
} 