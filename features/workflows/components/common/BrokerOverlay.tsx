"use client";
import React, { useMemo } from 'react';
import { X, Database, GitBranch, ArrowRight, ArrowLeft, Zap, Link, Target } from 'lucide-react';
import { PreparedWorkflowData, collectBrokersFromPreparedData, BrokerInfo } from '@/features/workflows/utils/brokerCollector';

interface BrokerOverlayProps {
  workflowData: PreparedWorkflowData;
  isOpen: boolean;
  onClose: () => void;
}

export function BrokerOverlay({ workflowData, isOpen, onClose }: BrokerOverlayProps) {
  const brokerCollection = useMemo(() => 
    collectBrokersFromPreparedData(workflowData), 
    [workflowData]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Overlay Content */}
      <div className="relative bg-textured rounded-lg shadow-2xl border-border w-full max-w-6xl max-h-[90dvh] overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Workflow Brokers
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {brokerCollection.uniqueCount} unique broker{brokerCollection.uniqueCount !== 1 ? 's' : ''} found in this workflow
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90dvh-120px)]">
          {brokerCollection.uniqueCount === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No brokers found in this workflow</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-700 rounded-lg px-4 pt-4 pb-2 text-center">
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{brokerCollection.stats.withProducers}</div>
                  <div className="text-sm text-blue-600 dark:text-blue-400">Producers</div>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Publish data to this broker</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-700 rounded-lg px-4 pt-4 pb-2 text-center">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-300">{brokerCollection.stats.withConsumers}</div>
                  <div className="text-sm text-green-600 dark:text-green-400">Consumers</div>
                  <p className="text-xs text-green-600 dark:text-green-400">Get data from this broker</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-700 rounded-lg px-4 pt-4 pb-2 text-center">
                  <div className="text-2xl font-bold text-red-700 dark:text-red-300">{brokerCollection.stats.orphaned}</div>
                  <div className="text-sm text-red-600 dark:text-red-400">Orphaned</div>
                  <p className="text-xs text-red-600 dark:text-red-400">No Known Producers</p>
                </div>
              </div>

              {/* Broker List */}
              <div className="space-y-4">
                {brokerCollection.allBrokers.map((broker) => (
                  <BrokerCard key={broker.id} broker={broker} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BrokerCard({ broker }: { broker: BrokerInfo }) {
  const hasNoProducers = broker.producers.length === 0;
  const hasConsumers = broker.consumers.length > 0;
  const isOrphaned = hasNoProducers && hasConsumers; // Critical issue: consumers waiting for data that will never come
  
  return (
    <div className={`bg-textured rounded-lg p-6 border ${
      isOrphaned 
        ? 'border-red-500 dark:border-red-400 ring-2 ring-red-200 dark:ring-red-800' 
        : 'border-gray-200 dark:border-gray-700'
    }`}>
             {/* Broker ID Header */}
       <div className="flex items-center justify-between mb-4">
         <div className="flex items-center gap-2">
           {isOrphaned && (
             <span className="text-red-500 dark:text-red-400" title="Critical: Consumers waiting for data that will never come">
               ⚠️
             </span>
           )}
           <span className="px-3 py-1 rounded-md text-sm font-mono bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600">
             {broker.id}
           </span>
         </div>
        <div className="flex gap-2 text-xs">
          <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
            {broker.producers.length} producer{broker.producers.length !== 1 ? 's' : ''}
          </span>
          <span className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded">
            {broker.consumers.length} consumer{broker.consumers.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Producers */}
        <div>
          <h4 className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <ArrowRight className="w-4 h-4 text-blue-500" />
            Producers
          </h4>
                     {broker.producers.length === 0 ? (
             <div className={`text-xs italic ${
               hasConsumers 
                 ? 'text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-950/50 p-2 rounded border border-red-200 dark:border-red-800' 
                 : 'text-gray-500 dark:text-gray-400'
             }`}>
               {hasConsumers ? '⚠️ No producers - consumers will wait indefinitely!' : 'No producers'}
             </div>
           ) : (
            <div className="space-y-2">
              {broker.producers.map((producer, index) => (
                <div key={index} className="text-xs bg-blue-50 dark:bg-blue-950/50 p-2 rounded border border-blue-200 dark:border-blue-800">
                  <div className="font-medium text-blue-800 dark:text-blue-200">{producer.nodeName}</div>
                  <div className="text-blue-600 dark:text-blue-400">{producer.connectionType}</div>
                  {producer.details && (
                    <div className="text-blue-500 dark:text-blue-500">{producer.details}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Consumers */}
        <div>
          <h4 className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <ArrowLeft className="w-4 h-4 text-green-500" />
            Consumers
          </h4>
          {broker.consumers.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 italic">No consumers</div>
          ) : (
            <div className="space-y-2">
              {broker.consumers.map((consumer, index) => (
                <div key={index} className="text-xs bg-green-50 dark:bg-green-950/50 p-2 rounded border border-green-200 dark:border-green-800">
                  <div className="font-medium text-green-800 dark:text-green-200">{consumer.nodeName}</div>
                  <div className="text-green-600 dark:text-green-400">{consumer.connectionType}</div>
                  {consumer.details && (
                    <div className="text-green-500 dark:text-green-500">{consumer.details}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 