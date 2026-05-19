import React from 'react';
import { Zap } from "lucide-react";
import FieldActionButtons, { FieldActionButtonsProps } from './FieldActionButtons';

// Explicitly include all props we want to keep from FieldActionButtonsProps
export interface UUIDFieldButtonsProps extends Pick<
  FieldActionButtonsProps,
  'value' | 'onChange' | 'disabled' | 'onShowTooltip' | 'onHideTooltip' | 'className' | 'maxHistory'
> {}

const generateUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }
  );
};

const UUIDFieldButtons = ({
  value,
  onChange,
  disabled,
  onShowTooltip,
  onHideTooltip,
  className,
  maxHistory
}: UUIDFieldButtonsProps) => {
  return (
    <FieldActionButtons
      value={value}
      onChange={onChange}
      disabled={disabled}
      onShowTooltip={onShowTooltip}
      onHideTooltip={onHideTooltip}
      className={className}
      maxHistory={maxHistory}
      onGenerateValue={generateUUID}
      generateIcon={<Zap className="h-4 w-4" />}
      generateTooltip="Generate UUID"
    />
  );
};

export default React.memo(UUIDFieldButtons);