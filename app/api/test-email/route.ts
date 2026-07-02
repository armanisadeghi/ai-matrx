import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function GET() {
  try {
    // Log environment variables (masked for security)
    const apiKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM;

    console.log("=== Email Test Debug ===");
    console.log("RESEND_API_KEY exists:", !!apiKey);
    console.log("RESEND_API_KEY length:", apiKey?.length || 0);
    console.log("RESEND_API_KEY starts with 're_':", apiKey?.startsWith('re_'));
    console.log("EMAIL_FROM:", emailFrom);
    console.log("========================");

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: "RESEND_API_KEY is not set in environment variables",
        details: {
          allEnvKeys: Object.keys(process.env).filter(k => k.includes('RESEND') || k.includes('EMAIL'))
        }
      }, { status: 500 });
    }

    if (!emailFrom) {
      return NextResponse.json({
        success: false,
        error: "EMAIL_FROM is not set in environment variables"
      }, { status: 500 });
    }

    // Initialize Resend
    const resend = new Resend(apiKey);

    // Send test email
    console.log("Attempting to send test email...");
    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: "info@aimatrx.com", // Change this to your email
      subject: "Test Email from AI Matrx",
      html: "<h1>Test Email</h1><p>If you're seeing this, email is working!</p>",
    });

    if (error) {
      console.error("Resend API error:", error);
      return NextResponse.json({
        success: false,
        error: "Resend API error",
        details: error,
      }, { status: 500 });
    }

    console.log("Email sent successfully!", data);

    return NextResponse.json({
      success: true,
      message: "Test email sent successfully!",
      data: data,
    });

  } catch (error: unknown) {
    console.error("Unexpected error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      details: error instanceof Error ? { name: error.name, message: error.message } : error,
    }, { status: 500 });
  }
}
