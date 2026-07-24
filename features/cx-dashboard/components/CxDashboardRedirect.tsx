"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, MessageSquare, Send, AlertCircle, DollarSign } from "lucide-react";
import Link from "next/link";

const LINKS = [
  { href: "/administration/chat/cx-dashboard", label: "Overview Dashboard", icon: BarChart3, description: "KPIs, cost trends, model usage" },
  { href: "/administration/chat/cx-dashboard/conversations", label: "Conversations", icon: MessageSquare, description: "Browse & drill into conversation chains" },
  { href: "/administration/chat/cx-dashboard/requests", label: "User Requests", icon: Send, description: "Token usage, cost, iterations per request" },
  { href: "/administration/chat/cx-dashboard/usage", label: "Usage & Cost", icon: DollarSign, description: "Cost analytics by model, provider, day" },
  { href: "/administration/chat/cx-dashboard/errors", label: "Errors & Issues", icon: AlertCircle, description: "Pending bugs, max_tokens, tool errors" },
];

export default function CxDashboardRedirect() {
  const router = useRouter();

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">CX Conversation Dashboard</h2>
          <p className="text-sm text-muted-foreground">Monitor conversations, usage, costs, and errors</p>
        </div>
        <button
          onClick={() => router.push("/administration/chat/cx-dashboard")}
          className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Open Dashboard
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-start gap-3 p-3 rounded-md border border-border bg-card hover:border-primary/40 transition-colors group"
          >
            <div className="p-2 rounded bg-muted group-hover:bg-primary/10 transition-colors">
              <link.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{link.label}</p>
              <p className="text-xs text-muted-foreground">{link.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
