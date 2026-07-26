import { CircleDot, CheckCircle, Mail, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request Received — AI Matrx",
  description: "Your access request has been received. We'll be in touch soon.",
};

const steps = [
  {
    icon: CheckCircle,
    title: "Request submitted",
    description: "We've received your request and saved all your details.",
    done: true,
  },
  {
    icon: Clock,
    title: "Under review",
    description: "Our team reviews every request within 1–2 business days.",
    done: false,
  },
  {
    icon: Mail,
    title: "Invitation sent",
    description: "You'll receive an email with your exclusive invitation code.",
    done: false,
  },
];

export default function ThankYouPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Hero section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        {/* Animated icon */}
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto shadow-[0_0_60px_hsl(var(--primary)/0.3)]">
            <CircleDot className="w-12 h-12 text-primary" />
          </div>
          <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
            <CheckCircle className="w-4 h-4 text-white" />
          </div>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4 max-w-lg">
          Your request is{" "}
          <span className="text-primary">in the queue!</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mb-12 leading-relaxed">
          Thank you for your interest in AI Matrx. Check your inbox — we just
          sent you a confirmation email. You'll hear back from us within 1–2
          business days.
        </p>

        {/* What happens next */}
        <div className="w-full max-w-md text-left mb-12">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 text-center">
            What happens next
          </h2>
          <div className="space-y-0">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      step.done
                        ? "bg-green-500 text-white shadow-[0_0_16px_hsl(142.1_70.6%_45.3%/0.4)]"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <step.icon className="w-4 h-4" />
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-px h-8 bg-border mt-1" />
                  )}
                </div>
                <div className="pb-8">
                  <p className="text-sm font-medium text-foreground mb-0.5">
                    {step.title}
                  </p>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Back to homepage
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Footer note */}
      <div className="text-center py-6 px-6 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Didn&apos;t receive a confirmation email?{" "}
          <a
            href="mailto:admin@aimatrx.com"
            className="text-primary hover:underline"
          >
            Contact us
          </a>
        </p>
      </div>
    </div>
  );
}
