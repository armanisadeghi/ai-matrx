import {Circle} from "lucide-react";
import React from "react";

interface ConnectionStatusProps {
    status: string;
}

// =====================
// Status Indicator Component
// =====================
const ConnectionStatus = ({status}: ConnectionStatusProps) => {
    const statusConfig = {
        connected: {color: 'text-green-500', text: 'Connected'},
        disconnected: {color: 'text-red-500', text: 'Disconnected'},
        connecting: {color: 'text-yellow-500', text: 'Connecting'},
        error: {color: 'text-red-500', text: 'Error'}
    };

    const config = statusConfig[status] || statusConfig.disconnected;

    return (
        <div className="flex items-center gap-2">
            <Circle className={`w-3 h-3 ${config.color} fill-current animate-pulse`}/>
            <span className="text-sm text-muted-foreground">{config.text}</span>
        </div>
    );
};

export default ConnectionStatus;