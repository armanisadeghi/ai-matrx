import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import EntityShowSelectedAccordion from "@/components/matrx/Entity/prewired-components/EntityShowSelectedAccordion";
import QuickRefSelect from "@/app/entities/quick-reference/QuickRefSelectFloatingLabel";
import { QuickReferenceRecord } from "@/lib/redux/entity/types/stateTypes";
import {
  getUnifiedLayoutProps,
  getUpdatedUnifiedLayoutProps,
} from "@/app/entities/layout/configs";
import { SmartCrudButtons } from "@/components/matrx/Entity/prewired-components/layouts/smart-layouts/smart-actions/SmartCrudButtons";

interface ChipSelectionContentProps {
  onSave: (selectedRecords: any[]) => void;
  onCancel: () => void;
}

const initialLayoutProps = getUnifiedLayoutProps({
  entityKey: "broker",
  formComponent: "MINIMAL",
  quickReferenceType: "LIST",
  isExpanded: true,
  handlers: {},
});

const layoutProps = getUpdatedUnifiedLayoutProps(initialLayoutProps, {
  formComponent: "MINIMAL",
  dynamicStyleOptions: {
    density: "compact",
    size: "sm",
  },
  dynamicLayoutOptions: {
    formStyleOptions: {
      fieldFiltering: {
        excludeFields: ["id", "otherSourceParams"],
        defaultShownFields: [
          "displayName",
          "stringValue",
          "defaultSource",
          "defaultDestination",
        ],
      },
    },
  },
});

export const ChipSelectionContent: React.FC<ChipSelectionContentProps> = ({
  onSave,
  onCancel,
}) => {
  const [selectedRecords, setSelectedRecords] = useState<any[]>([]);

  const handleRecordsChange = (record: QuickReferenceRecord) => {
    setSelectedRecords([record]);
  };

  const handleSave = () => {
    onSave(selectedRecords);
  };

  return (
    <div className="h-full space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1">
          <div className="h-[80dvh]">
            <ScrollArea className="h-full w-full rounded-md border">
              <div className="p-4">
                <SmartCrudButtons
                  entityKey="broker"
                  options={{
                    allowCreate: true,
                    allowEdit: false,
                    allowDelete: false,
                    allowRefresh: false,
                    allowCancel: false,
                  }}
                  layout={{
                    buttonLayout: "row",
                    buttonSize: "lg",
                    buttonsPosition: "top",
                    buttonSpacing: "normal",
                  }}
                />

                <QuickRefSelect
                  entityKey="broker"
                  onRecordChange={handleRecordsChange}
                />
              </div>
            </ScrollArea>
          </div>
        </div>
        <div className="col-span-2">
          <div className="h-[80dvh]">
            <ScrollArea className="h-full w-full rounded-md border">
              <EntityShowSelectedAccordion entityKey="dataBroker" />
            </ScrollArea>
          </div>
        </div>
      </div>
      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
};

export default ChipSelectionContent;
