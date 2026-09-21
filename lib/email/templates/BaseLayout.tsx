import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
  Hr,
  Img,
} from "react-email";
import * as React from "react";

interface BaseLayoutProps {
  preview?: string;
  children: React.ReactNode;
  footerText?: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://aimatrx.com";

export function BaseLayout({ preview, children, footerText }: BaseLayoutProps) {
  return (
    <Html>
      <Head />
      {preview && <Preview>{preview}</Preview>}
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={logoText}>AI Matrx</Text>
          </Section>

          {/* Content */}
          <Section style={content}>{children}</Section>

          {/* Footer */}
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerStyle}>
              {footerText ?? "You're receiving this email because of activity on your AI Matrx account."}
            </Text>
            <Text style={footerStyle}>
              <a href={APP_URL} style={footerLink}>
                AI Matrx
              </a>{" "}
              · All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#f6f9fc",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "0",
  maxWidth: "600px",
  borderRadius: "8px",
  overflow: "hidden" as const,
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
};

const header = {
  background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
  padding: "24px 32px",
};

const logoText = {
  color: "#ffffff",
  fontSize: "22px",
  fontWeight: "700" as const,
  margin: "0",
};

const content = {
  padding: "32px",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "0",
};

const footer = {
  padding: "20px 32px",
  backgroundColor: "#f9fafb",
};

const footerStyle = {
  color: "#9ca3af",
  fontSize: "12px",
  margin: "4px 0",
};

const footerLink = {
  color: "#6b7280",
  textDecoration: "none" as const,
};
