import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import Link from 'next/link';

interface SimpleCardProps {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  iconClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}

const SimpleCard: React.FC<SimpleCardProps> = ({ 
  icon, 
  title, 
  description, 
  onClick, 
  href, 
  className,
  iconClassName,
  titleClassName,
  descriptionClassName 
}) => {
  const cardContent = (
    <>
      {icon && (
        <div className={cn("h-12 w-12 text-blue-500 dark:text-blue-400", iconClassName)}>
          {icon}
        </div>
      )}
      {title && (
        <span className={cn("font-medium text-blue-500 dark:text-blue-400", titleClassName)}>
          {title}
        </span>
      )}
      {description && (
        <p className={cn("type-secondary text-center text-gray-600 dark:text-gray-400 mt-1", descriptionClassName)}>
          {description}
        </p>
      )}
    </>
  );

  const cardClassName = cn(
    "cursor-pointer rounded-xl h-64 flex flex-col items-center justify-center space-y-6 p-4 text-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all",
    className
  );

  if (href) {
    return (
      <Link href={href} className={cardClassName}>
        {cardContent}
      </Link>
    );
  }

  return (
    <div onClick={onClick} className={cardClassName}>
      {cardContent}
    </div>
  );
};

interface CardOption {
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  iconClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}

interface CardGridProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  cards: CardOption[];
  columns?: number;
  className?: string;
  headerClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  contentClassName?: string;
  gridClassName?: string;
}

const CardGrid: React.FC<CardGridProps> = ({ 
  title, 
  description, 
  cards, 
  columns = 2,
  className,
  headerClassName,
  titleClassName,
  descriptionClassName,
  contentClassName,
  gridClassName
}) => {
  const gridColsClass = {
    1: 'md:grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
  }[columns] || 'md:grid-cols-2';

  return (
    <Card className={cn("w-full bg-inherit border-none", className)}>
      {(title || description) && (
        <CardHeader className={cn("text-center pb-8", headerClassName)}>
          {title && (
            <CardTitle className={cn("text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-200", titleClassName)}>
              {title}
            </CardTitle>
          )}
          {description && (
            <p className={cn("text-gray-600 dark:text-gray-400 mt-2", descriptionClassName)}>
              {description}
            </p>
          )}
        </CardHeader>
      )}
      <CardContent className={contentClassName}>
        <div className={cn(`grid grid-cols-1 ${gridColsClass} gap-6`, gridClassName)}>
          {cards.map((card, index) => (
            <SimpleCard
              key={index}
              icon={card.icon}
              title={card.title}
              description={card.description}
              onClick={card.onClick}
              href={card.href}
              className={card.className}
              iconClassName={card.iconClassName}
              titleClassName={card.titleClassName}
              descriptionClassName={card.descriptionClassName}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export { SimpleCard, CardGrid };