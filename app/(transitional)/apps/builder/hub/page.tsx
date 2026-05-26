'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { builderModules } from './build-modules';
import { AnimatePresence, motion } from "motion/react";


const BuilderHub = () => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">App Builder Hub</h1>
        <p className="text-gray-600 dark:text-gray-400">Choose a component to build or modify</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {builderModules.map((module, idx) => (
          <Link 
            key={module.id} 
            href={module.href} 
            className="block relative group"
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <AnimatePresence>
              {hoveredIndex === idx && (
                <motion.span
                  className="absolute -inset-3 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)] bg-gray-100 dark:bg-gray-700/[0.6] block rounded-2xl"
                  layoutId="hoverBackground"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: { duration: 0.15 },
                  }}
                  exit={{
                    opacity: 0,
                    transition: { duration: 0.15, delay: 0.2 },
                  }}
                />
              )}
            </AnimatePresence>
            
            <Card className="h-full border-border bg-textured transition-all duration-200 relative z-10">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  {module.icon}
                  <CardTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">{module.title}</CardTitle>
                </div>
                <CardDescription className="text-gray-600 dark:text-gray-400">{module.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-16 flex items-center justify-center">
                  {module.icon && React.cloneElement(module.icon, { 
                    className: `h-16 w-16 opacity-25 group-hover:opacity-40 transition-opacity ${
                      module.icon.props.className.split(' ').filter(c => c.includes('text-')).join(' ')
                    }` 
                  })}
                </div>
              </CardContent>
              <CardFooter>
                <div className="w-full">
                  <div className="w-full py-2 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 text-center font-medium transition-colors">
                    Open Builder
                  </div>
                </div>
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default BuilderHub;