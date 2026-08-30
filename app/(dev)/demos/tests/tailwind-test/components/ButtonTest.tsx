import React from 'react';
import { Button, ButtonProps } from '@/components/ui/button'; // Adjust this import path as necessary
import { Star } from 'lucide-react';

const ButtonTest: React.FC = () => {
    const variants: ButtonProps['variant'][] = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'];
    const sizes: ButtonProps['size'][] = ['default', 'sm', 'lg', 'icon'];

    return (
        <div className="bg-card rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-semibold mb-4">Button Variations</h2>

            {variants.map((variant) => (
                <div key={variant} className="mb-6">
                    <h3 className="text-lg font-medium mb-2 capitalize">{variant} Buttons</h3>
                    <div className="flex flex-wrap gap-2">
                        {sizes.map((size) => (
                            <Button key={`${variant}-${size}`} variant={variant} size={size}>
                                {`${size} ${variant}`}
                            </Button>
                        ))}
                    </div>
                </div>
            ))}

            <div className="mt-6">
                <h3 className="text-lg font-medium mb-2">Icon Buttons</h3>
                <div className="flex gap-2">
                    {variants.map((variant) => (
                        <Button key={`icon-${variant}`} variant={variant} size="icon" aria-label={`${variant} favorite`}>
                            <Star aria-hidden="true" className="h-4 w-4" />
                        </Button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ButtonTest;
