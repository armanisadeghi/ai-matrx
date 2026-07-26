'use client';

import PrimaryFieldBuilder from '@/features/applet/builder/modules/field-builder/PrimaryFieldBuilder';
import BuilderPageLayout from '../common/BuilderPageLayout';

export default function FieldBuilderPage() {
  return (
    <BuilderPageLayout activeModuleId="fields">
      <PrimaryFieldBuilder />
    </BuilderPageLayout>
  );
} 