// File Location: components/matrx/buttons/MatrxButtons.tsx

import React from 'react';
import { Button } from "@ai-matrx/design-system";
import { IconType } from 'react-icons';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

interface MatrxButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children?: React.ReactNode;
}

const MatrxButton: React.FC<MatrxButtonProps> = ({ children, className, ...props }) => (
    <Button
        className={`px-4 py-2 rounded-md transition-colors duration-200 ${className}`}
        {...props}
    >
        {children}
    </Button>
);


interface MatrixIconButtonProps extends MatrxButtonProps {
    icon: IconType;
    iconPosition?: 'left' | 'right';
}

export const MatrixIconButton: React.FC<MatrixIconButtonProps> = ({
    icon: Icon,
    iconPosition = 'left',
    children,
    className,
    ...props
}) => (
    <MatrxButton className={`flex items-center justify-center space-x-2 ${className}`} {...props}>
        {iconPosition === 'left' && <Icon className="w-4 h-4" />}
        <span>{children}</span>
        {iconPosition === 'right' && <Icon className="w-4 h-4" />}
    </MatrxButton>
);

// Save Button
export const MatrxSaveButton: React.FC<MatrxButtonProps> = (props) => (
    <MatrxButton
        className="bg-primary text-primary-foreground hover:bg-primary/90"
        {...props}
    >
        Save
    </MatrxButton>
);

export const MatrxCancelButton: React.FC<MatrxButtonProps> = (props) => (
    <MatrxButton
        className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
        {...props}
    >
        Cancel
    </MatrxButton>
);

export const MatrxEditButton: React.FC<MatrxButtonProps> = (props) => (
    <MatrxButton
        className="bg-primary text-primary-foreground hover:bg-primary/90"
        {...props}
    >
        Edit
    </MatrxButton>
);

export const MatrxDeleteButton: React.FC<MatrxButtonProps> = (props) => (
    <MatrxButton
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        {...props}
    >
        Delete
    </MatrxButton>
);

export const MatrxNextButton: React.FC<MatrxButtonProps> = (props) => (
    <MatrixIconButton
        icon={FaChevronRight}
        iconPosition="right"
        className="bg-primary text-primary-foreground hover:bg-primary/90"
        {...props}
    >
        Next
    </MatrixIconButton>
);

export const MatrxPreviousButton: React.FC<MatrxButtonProps> = (props) => (
    <MatrixIconButton
        icon={FaChevronLeft}
        iconPosition="left"
        className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
        {...props}
    >
        Previous
    </MatrixIconButton>
);
