'use client';

import React from 'react';

export interface ResultComponentMetadata {
  name: string;
  displayName: string;
  description: string;
  supportedFunctions?: string[]; // Optional array of function names this component supports
  supportedResultTypes?: string[]; // Optional array of result types this component can render
}

export interface RegisteredComponent {
  metadata: ResultComponentMetadata;
  render: (props: ResultRendererProps) => React.ReactNode;
}

export interface ResultRendererProps {
  result: unknown;
  functionName: string;
  error?: string | null;
  context?: Record<string, unknown>; // Optional additional context data
}

// Registry to store all registered components
const componentRegistry: Record<string, RegisteredComponent> = {};

// Register a component
export function registerResultComponent(
  metadata: ResultComponentMetadata,
  renderFunction: (props: ResultRendererProps) => React.ReactNode
): void {
  componentRegistry[metadata.name] = {
    metadata,
    render: renderFunction
  };
}

// Get a component by name
export function getResultComponent(name: string): RegisteredComponent | undefined {
  return componentRegistry[name];
}

// Get all registered components
export function getAllResultComponents(): RegisteredComponent[] {
  return Object.values(componentRegistry);
}

// Get components compatible with a specific function
export function getComponentsForFunction(functionName: string): RegisteredComponent[] {
  return Object.values(componentRegistry).filter(comp => 
    !comp.metadata.supportedFunctions || 
    comp.metadata.supportedFunctions.includes(functionName)
  );
} 