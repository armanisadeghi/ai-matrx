import { sendEmail, emailTemplates } from './client';
import { marked } from 'marked';
import { extractErrorMessage } from '@/utils/errors';
import { escapeHtml } from "@ai-matrx/kit/html-escape";

/**
 * Email Export Service
 * Provides utilities for emailing content to users
 */

interface EmailExportResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Convert markdown content to formatted HTML for email
 */
export function markdownToEmailHtml(markdown: string): string {
  const htmlContent = marked(markdown, { async: false }) as string;
  
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #1f2937;">
      <div style="background: #ffffff; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
        ${htmlContent}
      </div>
    </div>
  `;
}

/**
 * Email an AI chat response to a user
 */
export async function emailChatResponse(options: {
  to: string;
  content: string;
  metadata?: {
    taskId?: string;
    runId?: string;
    messageId?: string;
    timestamp?: string;
  };
}): Promise<EmailExportResult> {
  const { to, content, metadata } = options;
  
  const timestamp = metadata?.timestamp || new Date().toLocaleString();
  const subject = `AI Response from ${timestamp}`;
  
  // Convert markdown to HTML
  const htmlContent = markdownToEmailHtml(content);
  
  // Add metadata if available
  let metadataHtml = '';
  if (metadata?.taskId || metadata?.runId || metadata?.messageId) {
    metadataHtml = `
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
        <strong>Message Details:</strong><br/>
        ${metadata.messageId ? `Message ID: ${metadata.messageId}<br/>` : ''}
        ${metadata.taskId ? `Task ID: ${metadata.taskId}<br/>` : ''}
        ${metadata.runId ? `Run ID: ${metadata.runId}<br/>` : ''}
        Timestamp: ${timestamp}
      </div>
    `;
  }
  
  const fullHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">AI Response</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0; font-size: 14px;">
          Saved from AI Matrx
        </p>
      </div>
      ${htmlContent}
      ${metadataHtml}
      <div style="margin-top: 24px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px;">
          Sent from <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://aimatrx.com'}" style="color: #3b82f6; text-decoration: none;">AI Matrx</a>
        </p>
      </div>
    </div>
  `;
  
  const result = await sendEmail({
    to,
    subject,
    html: fullHtml,
    text: content,
  });
  
  if (result.success) {
    return { success: true, message: 'Email sent successfully' };
  }
  
  return {
    success: false,
    message: 'Failed to send email',
    error: extractErrorMessage(result.error),
  };
}

/**
 * Email a table export to a user
 */
export async function emailTableExport(options: {
  to: string;
  tableName: string;
  format: 'csv' | 'json' | 'markdown';
  content: string;
  rowCount?: number;
}): Promise<EmailExportResult> {
  const { to, tableName, format, content, rowCount } = options;
  
  const subject = `Your table export: ${tableName}`;
  const formatLabel = format === 'csv' ? 'CSV' : format === 'json' ? 'JSON' : 'Markdown';
  
  // For small exports, include in body. For large, note that it's truncated
  const isLargeExport = content.length > 50000;
  const displayContent = isLargeExport ? content.substring(0, 50000) + '\n\n... (truncated)' : content;
  
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Table Export</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0; font-size: 14px;">
          ${tableName}
        </p>
      </div>
      <div style="background: #ffffff; border-radius: 0 0 8px 8px; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
        <div style="margin-bottom: 16px;">
          <span style="display: inline-block; padding: 4px 12px; background: #f3f4f6; border-radius: 4px; font-size: 12px; color: #6b7280;">
            Format: ${formatLabel}
          </span>
          ${rowCount !== undefined ? `
            <span style="display: inline-block; padding: 4px 12px; background: #f3f4f6; border-radius: 4px; font-size: 12px; color: #6b7280; margin-left: 8px;">
              ${rowCount} rows
            </span>
          ` : ''}
        </div>
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px; overflow-x: auto;">
          <pre style="margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; white-space: pre-wrap; word-wrap: break-word; color: #1f2937;">${escapeHtml(displayContent)}</pre>
        </div>
        ${isLargeExport ? `
          <p style="color: #f59e0b; font-size: 12px; margin-top: 12px;">
            Note: This export was truncated for email. For the full data, please use the download option.
          </p>
        ` : ''}
      </div>
      <div style="margin-top: 24px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px;">
          Sent from <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://aimatrx.com'}" style="color: #3b82f6; text-decoration: none;">AI Matrx</a>
        </p>
      </div>
    </div>
  `;
  
  const result = await sendEmail({
    to,
    subject,
    html: htmlContent,
    text: `Table Export: ${tableName}\nFormat: ${formatLabel}\n\n${displayContent}`,
  });
  
  if (result.success) {
    return { success: true, message: 'Export emailed successfully' };
  }
  
  return {
    success: false,
    message: 'Failed to send email',
    error: extractErrorMessage(result.error),
  };
}

/**
 * Email a share link to a user
 */
export async function emailShareLink(options: {
  to: string;
  resourceType: string;
  resourceName: string;
  shareUrl: string;
  message?: string;
}): Promise<EmailExportResult> {
  const { to, resourceType, resourceName, shareUrl, message } = options;
  
  const subject = `Link to ${resourceType}: ${resourceName}`;
  
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Saved Link</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0; font-size: 14px;">
          ${resourceType}: ${resourceName}
        </p>
      </div>
      <div style="background: #ffffff; border-radius: 0 0 8px 8px; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
        ${message ? `<p style="color: #4b5563; margin-bottom: 16px;">${escapeHtml(message)}</p>` : ''}
        <div style="text-align: center; margin: 24px 0;">
          <a href="${shareUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">
            Open ${resourceType}
          </a>
        </div>
        <div style="background: #f9fafb; border-radius: 8px; padding: 12px; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px 0;">Direct link:</p>
          <a href="${shareUrl}" style="color: #3b82f6; font-size: 14px; word-break: break-all;">${shareUrl}</a>
        </div>
      </div>
      <div style="margin-top: 24px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px;">
          Sent from <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://aimatrx.com'}" style="color: #3b82f6; text-decoration: none;">AI Matrx</a>
        </p>
      </div>
    </div>
  `;
  
  const result = await sendEmail({
    to,
    subject,
    html: htmlContent,
    text: `${resourceType}: ${resourceName}\n\nLink: ${shareUrl}${message ? `\n\nNote: ${message}` : ''}`,
  });
  
  if (result.success) {
    return { success: true, message: 'Link emailed successfully' };
  }
  
  return {
    success: false,
    message: 'Failed to send email',
    error: extractErrorMessage(result.error),
  };
}

/**
 * Email notification templates for various events
 */
export const notificationTemplates = {
  taskAssigned: (options: {
    taskTitle: string;
    assignerName: string;
    taskUrl: string;
    description?: string;
  }) => ({
    subject: `Task assigned: ${options.taskTitle}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Task Assigned</h1>
        </div>
        <div style="background: #ffffff; border-radius: 0 0 8px 8px; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="color: #4b5563; margin: 0 0 16px 0;">
            <strong>${escapeHtml(options.assignerName)}</strong> assigned you a task:
          </p>
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <h2 style="color: #1f2937; margin: 0 0 8px 0; font-size: 18px;">${escapeHtml(options.taskTitle)}</h2>
            ${options.description ? `<p style="color: #6b7280; margin: 0; font-size: 14px;">${escapeHtml(options.description)}</p>` : ''}
          </div>
          <div style="text-align: center;">
            <a href="${options.taskUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">
              View Task
            </a>
          </div>
        </div>
      </div>
    `,
  }),

  commentAdded: (options: {
    resourceTitle: string;
    commenterName: string;
    commentText: string;
    resourceUrl: string;
    resourceType: string;
  }) => ({
    subject: `New comment on ${options.resourceType}: ${options.resourceTitle}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">New Comment</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0; font-size: 14px;">
            On your ${options.resourceType}: ${escapeHtml(options.resourceTitle)}
          </p>
        </div>
        <div style="background: #ffffff; border-radius: 0 0 8px 8px; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
          <div style="display: flex; gap: 12px; margin-bottom: 16px;">
            <div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #4b5563;">
              ${options.commenterName.charAt(0).toUpperCase()}
            </div>
            <div style="flex: 1;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #1f2937;">${escapeHtml(options.commenterName)}</p>
              <p style="margin: 0; color: #4b5563;">${escapeHtml(options.commentText)}</p>
            </div>
          </div>
          <div style="text-align: center;">
            <a href="${options.resourceUrl}" style="display: inline-block; background: #8b5cf6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">
              View & Reply
            </a>
          </div>
        </div>
      </div>
    `,
  }),

  messageReceived: (options: {
    senderName: string;
    messagePreview: string;
    conversationUrl: string;
  }) => ({
    subject: `New message from ${options.senderName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">New Message</h1>
        </div>
        <div style="background: #ffffff; border-radius: 0 0 8px 8px; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
          <div style="display: flex; gap: 12px; margin-bottom: 16px;">
            <div style="width: 40px; height: 40px; background: #d1fae5; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #059669;">
              ${options.senderName.charAt(0).toUpperCase()}
            </div>
            <div style="flex: 1;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #1f2937;">${escapeHtml(options.senderName)}</p>
              <p style="margin: 0; color: #4b5563;">${escapeHtml(options.messagePreview)}</p>
            </div>
          </div>
          <div style="text-align: center;">
            <a href="${options.conversationUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">
              View Conversation
            </a>
          </div>
        </div>
      </div>
    `,
  }),

  dueDateReminder: (options: {
    taskTitle: string;
    dueDate: string;
    taskUrl: string;
    urgency: 'upcoming' | 'due_today' | 'overdue';
  }) => {
    const colors = {
      upcoming: { bg: '#fef3c7', text: '#92400e', gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
      due_today: { bg: '#fed7aa', text: '#c2410c', gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' },
      overdue: { bg: '#fee2e2', text: '#b91c1c', gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
    };
    const color = colors[options.urgency];
    const urgencyText = options.urgency === 'upcoming' ? 'Due Soon' : options.urgency === 'due_today' ? 'Due Today' : 'Overdue';

    return {
      subject: `${urgencyText}: ${options.taskTitle}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: ${color.gradient}; padding: 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${urgencyText}</h1>
          </div>
          <div style="background: #ffffff; border-radius: 0 0 8px 8px; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
            <div style="background: ${color.bg}; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
              <h2 style="color: ${color.text}; margin: 0 0 8px 0; font-size: 18px;">${escapeHtml(options.taskTitle)}</h2>
              <p style="color: ${color.text}; margin: 0; font-size: 14px;">Due: ${options.dueDate}</p>
            </div>
            <div style="text-align: center;">
              <a href="${options.taskUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                View Task
              </a>
            </div>
          </div>
        </div>
      `,
    };
  },
};


