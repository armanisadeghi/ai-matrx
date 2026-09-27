'use client';

import {Card, CardHeader, CardTitle, CardDescription} from '@/components/ui/card';
import Link from "@/components/navigation/AppLink";
import {usePathname} from 'next/navigation';
import type {NavCardProps, NavItem} from './types';


const NextNavCard = ({items, basePath = ''}: NavCardProps) => {
    const currentPath = usePathname();

    const getFullPath = (item: NavItem) => {
        if (item.relative) {
            return `${basePath || currentPath}/${item.path}`.replace(/\/+/g, '/');
        }
        return item.path.startsWith('/') ? item.path : `/${item.path}`;
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {items.map((item) => {
                    const fullPath = getFullPath(item);
                    return (
                        <Link
                            key={item.path}
                            href={fullPath}
                            className="transition-transform hover:scale-105"
                        >
                            <Card className="h-full hover:bg-muted cursor-pointer">
                                <CardHeader>
                                    <CardTitle className="text-lg">{item.title}</CardTitle>
                                    <CardDescription className="text-sm font-mono">
                                        {fullPath}
                                    </CardDescription>
                                </CardHeader>
                            </Card>
                        </Link>
                    )
                }
            )}
        </div>
    );
};

export default NextNavCard;
