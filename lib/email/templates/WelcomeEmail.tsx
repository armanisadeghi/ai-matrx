import { Button, Heading, Text, Section } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./BaseLayout";

interface WelcomeEmailProps {
  name: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://aimatrx.com";

export function WelcomeEmail({ name }: WelcomeEmailProps) {
  return (
    <BaseLayout preview={`Welcome to AI Matrx, ${name}!`}>
      <Heading style={heading}>Welcome, {name}!</Heading>
      <Text style={text}>
        We're excited to have you on AI Matrx — the platform for advanced AI prompt engineering,
        canvas creation, and team collaboration.
      </Text>

      <Section style={featureList}>
        <Text style={featureItem}>Build and share AI-powered apps</Text>
        <Text style={featureItem}>Create canvases and collaborate with your team</Text>
        <Text style={featureItem}>Organize prompts and templates</Text>
        <Text style={featureItem}>Connect to any AI model</Text>
      </Section>

      <Section style={buttonSection}>
        <Button href={APP_URL} style={button}>
          Get Started
        </Button>
      </Section>

      <Text style={textMuted}>
        If you have any questions, just reply to this email — we're always happy to help.
      </Text>
    </BaseLayout>
  );
}

WelcomeEmail.PreviewProps = {
  name: "Arman",
} as WelcomeEmailProps;

export default WelcomeEmail;

const heading = {
  color: "#111827",
  fontSize: "24px",
  fontWeight: "700" as const,
  margin: "0 0 16px 0",
};

const text = {
  color: "#374151",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 16px 0",
};

const textMuted = {
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "16px 0 0 0",
};

const featureList = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "16px 0",
};

const featureItem = {
  color: "#374151",
  fontSize: "14px",
  margin: "6px 0",
};

const buttonSection = {
  margin: "24px 0",
};

const button = {
  backgroundColor: "#3b82f6",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600" as const,
  textDecoration: "none" as const,
  textAlign: "center" as const,
  padding: "12px 28px",
  display: "inline-block" as const,
};
