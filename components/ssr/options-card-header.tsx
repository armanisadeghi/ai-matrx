import React from "react";
import { ArrowLeft } from "lucide-react";
import { CardHeader } from "@/components/ui/card";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { OptionCardData } from "./types";
import { getDynamicIconSelection } from "@/utils/icons/getDynamicIcons";
import { cn } from "@/utils/cn";
import { resolveStyle } from "./utils";

interface OptionCardHeaderProps {
  data: OptionCardData;
  onBack?: () => void;
}

export const OptionCardHeader = async ({
  data,
  onBack,
}: OptionCardHeaderProps) => {
  const Icon = data.icon || (await getDynamicIconSelection(data.displayName));
  const customStyles = data.customStyles || {};

  const { Style: rawAdditionalStyle, ...displayFields } =
    data.additionalFields || {};
  const additionalStyle =
    typeof rawAdditionalStyle === "string" ? rawAdditionalStyle : undefined;

  return (
    <Card
      className={cn(
        "w-full relative overflow-hidden",
        "bg-gradient-to-r transition-all duration-300",
        resolveStyle(
          customStyles.backgroundColor,
          "from-background via-background/95 to-background/90",
        ),
        resolveStyle(customStyles.textColor, "text-foreground"),
        "before:absolute before:inset-0 before:bg-gradient-to-r before:from-primary/0 before:to-primary/5",
        additionalStyle, // Apply any additional style classes
      )}
    >
      <CardHeader className="sm:px-6">
        <div className="flex items-center sm:justify-between">
          <div className="flex items-center">
            {onBack && (
              <button
                onClick={onBack}
                className="sm:p-2 rounded-full transition-colors hover:bg-primary/10"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              </button>
            )}
            <div className="p-2 sm:p-3 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5">
              <Icon className="h-5 w-5 sm:h-8 sm:w-8 text-primary" />
            </div>
            <CardTitle className="ml-2 sm:ml-4 text-lg sm:text-2xl">
              {data.displayName}
            </CardTitle>

            <div className="hidden sm:block sm:ml-4">
              {data.description && (
                <CardDescription className="mt-1 max-w-2xl">
                  {data.description}
                </CardDescription>
              )}
            </div>
          </div>

          {Object.keys(displayFields).length > 0 && (
            <div className="hidden sm:flex space-x-6">
              {Object.entries(displayFields).map(([key, value]) => (
                <div key={key} className="text-sm">
                  <span className="font-medium capitalize text-muted-foreground">
                    {key}:
                  </span>
                  <span className="ml-2">
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
    </Card>
  );
};
