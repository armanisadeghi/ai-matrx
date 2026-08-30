import React from 'react';
import { Input } from '@ai-matrx/design-system';
import { Label } from '@/components/ui/label';


interface MatrxInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
}

const MatrxInput: React.FC<MatrxInputProps> = ({ label, className, ...props }) => (
    <div className="mb-4">
        {label && <Label htmlFor={props.id} className="block mb-2 text-sm font-medium text-foreground">{label}</Label>}
        <Input
            className={`w-full bg-background text-foreground border-input ${className}`}
            {...props}
        />
    </div>
);

export default MatrxInput;