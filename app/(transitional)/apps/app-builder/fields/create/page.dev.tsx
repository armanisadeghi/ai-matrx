"use client";

import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectActiveFieldId } from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { startFieldCreation } from "@/lib/redux/app-builder/slices/fieldBuilderSlice";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import FieldEditor from "@/features/applet/builder/modules/field-builder/editor/FieldEditor";

export default function FieldCreatePage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const activeFieldId = useAppSelector(selectActiveFieldId);

  useEffect(() => {
    const newId = uuidv4();
    dispatch(startFieldCreation({ id: newId }));
  }, [dispatch]);

  const handleSaveSuccess = (fieldId: string) => {
    router.push(`/apps/app-builder/fields/${fieldId}`);
  };

  const handleCancel = () => {
    router.push("/apps/app-builder/fields");
  };

  if (!activeFieldId) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FieldEditor
        fieldId={activeFieldId}
        isCreatingNew={false}
        onSaveSuccess={handleSaveSuccess}
        onCancel={handleCancel}
      />
    </div>
  );
}
