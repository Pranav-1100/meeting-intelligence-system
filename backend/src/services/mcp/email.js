const { google } = require('googleapis');
const { ServiceUnavailableError, ValidationError } = require('../../middleware/errorHandler');

class EmailService {
  constructor() {
    this.gmail = null;
  }

  /**
   * Initialize Gmail client
   */
  initializeClient(serviceConfig) {
    const { refresh_token, client_id, client_secret } = serviceConfig;

    if (!refresh_token || !client_id || !client_secret) {
      throw new ValidationError('Missing required email configuration');
    }

    const oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    oauth2Client.setCredentials({
      refresh_token: refresh_token
    });

    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    return this.gmail;
  }

  /**
   * Test email connection
   */
  async testConnection(serviceConfig) {
    try {
      const gmail = this.initializeClient(serviceConfig);
      
      const response = await gmail.users.getProfile({
        userId: 'me'
      });

      return {
        success: true,
        email_address: response.data.emailAddress,
        total_messages: response.data.messagesTotal,
        total_threads: response.data.threadsTotal
      };

    } catch (error) {
      console.error('Email connection test failed:', error);
      throw new ServiceUnavailableError('Email service connection failed');
    }
  }

  /**
   * Send meeting summary email
   */
  async sendMeetingSummary(serviceConfig, emailData) {
    try {
      const gmail = this.initializeClient(serviceConfig);
      const { 
        meeting, 
        recipients, 
        subject, 
        summary, 
        actionItems = [], 
        transcript = null 
      } = emailData;

      // Generate email content
      const emailContent = this.generateMeetingSummaryEmail({
        meeting,
        summary,
        actionItems,
        transcript
      });

      // Create email message
      const message = this.createEmailMessage({
        to: recipients,
        subject,
        htmlBody: emailContent.html,
        textBody: emailContent.text
      });

      // Send email
      const response = await gmail.users.messages.send({
        userId: 'me',
        resource: {
          raw: message
        }
      });

      return {
        message_id: response.data.id,
        thread_id: response.data.threadId,
        label_ids: response.data.labelIds,
        recipients: recipients,
        subject: subject,
        sent_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to send meeting summary:', error);
      throw new ServiceUnavailableError('Failed to send meeting summary email');
    }
  }

  /**
   * Create follow-up email thread
   */
  async createFollowUpThread(serviceConfig, followUpData) {
    try {
      const gmail = this.initializeClient(serviceConfig);
      const { 
        meeting,
        recipients,
        action_items,
        follow_up_date,
        custom_message 
      } = followUpData;

      const subject = `Follow-up: ${meeting.title}`;
      const emailContent = this.generateFollowUpEmail({
        meeting,
        action_items,
        follow_up_date,
        custom_message
      });

      const message = this.createEmailMessage({
        to: recipients,
        subject,
        htmlBody: emailContent.html,
        textBody: emailContent.text
      });

      const response = await gmail.users.messages.send({
        userId: 'me',
        resource: {
          raw: message
        }
      });

      return {
        message_id: response.data.id,
        thread_id: response.data.threadId,
        subject: subject,
        recipients: recipients,
        sent_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to create follow-up thread:', error);
      throw new ServiceUnavailableError('Failed to create follow-up email thread');
    }
  }

  /**
   * Send calendar invitation
   */
  async sendCalendarInvitation(serviceConfig, invitationData) {
    try {
      const gmail = this.initializeClient(serviceConfig);
      const { 
        meeting_title,
        meeting_date,
        meeting_time,
        duration,
        recipients,
        location,
        agenda 
      } = invitationData;

      const subject = `Meeting Invitation: ${meeting_title}`;
      const emailContent = this.generateCalendarInvitationEmail({
        meeting_title,
        meeting_date,
        meeting_time,
        duration,
        location,
        agenda
      });

      // Create ICS calendar attachment
      const icsContent = this.generateICSCalendarEvent({
        title: meeting_title,
        start: new Date(`${meeting_date} ${meeting_time}`),
        duration,
        location,
        description: agenda
      });

      const message = this.createEmailMessageWithAttachment({
        to: recipients,
        subject,
        htmlBody: emailContent.html,
        textBody: emailContent.text,
        attachment: {
          filename: 'meeting.ics',
          content: icsContent,
          mimeType: 'text/calendar'
        }
      });

      const response = await gmail.users.messages.send({
        userId: 'me',
        resource: {
          raw: message
        }
      });

      return {
        message_id: response.data.id,
        subject: subject,
        recipients: recipients,
        meeting_date: meeting_date,
        sent_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to send calendar invitation:', error);
      throw new ServiceUnavailableError('Failed to send calendar invitation');
    }
  }

  /**
   * Draft action item emails
   */
  async draftActionItemEmails(serviceConfig, actionItemsData) {
    try {
      const gmail = this.initializeClient(serviceConfig);
      const { meeting, action_items } = actionItemsData;

      const drafts = [];

      for (const actionItem of action_items) {
        if (!actionItem.assignee_email) continue;

        const subject = `Action Item: ${actionItem.title}`;
        const emailContent = this.generateActionItemEmail({
          meeting,
          actionItem
        });

        const message = this.createEmailMessage({
          to: [actionItem.assignee_email],
          subject,
          htmlBody: emailContent.html,
          textBody: emailContent.text
        });

        // Create draft
        const response = await gmail.users.drafts.create({
          userId: 'me',
          resource: {
            message: {
              raw: message
            }
          }
        });

        drafts.push({
          draft_id: response.data.id,
          message_id: response.data.message.id,
          assignee: actionItem.assignee_name,
          assignee_email: actionItem.assignee_email,
          action_item_title: actionItem.title,
          subject: subject
        });
      }

      return {
        drafts_created: drafts.length,
        drafts: drafts,
        meeting_id: meeting.id
      };

    } catch (error) {
      console.error('Failed to draft action item emails:', error);
      throw new ServiceUnavailableError('Failed to create action item email drafts');
    }
  }

  /**
   * Generate meeting summary email content
   */
  generateMeetingSummaryEmail({ meeting, summary, actionItems, transcript }) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background-color: #f4f4f4; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .section { margin-bottom: 30px; }
          .action-item { background-color: #f9f9f9; padding: 15px; margin: 10px 0; border-left: 4px solid #007cba; }
          .transcript { background-color: #f0f0f0; padding: 15px; margin: 10px 0; font-family: monospace; font-size: 12px; }
          h1 { color: #2c3e50; }
          h2 { color: #34495e; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px; }
          .meta { color: #7f8c8d; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Meeting Summary</h1>
          <p class="meta">${meeting.title}</p>
          <p class="meta">${new Date(meeting.created_at).toLocaleDateString()} • Duration: ${Math.round(meeting.audio_duration / 60)} minutes</p>
        </div>
        
        <div class="content">
          ${summary ? `
            <div class="section">
              <h2>Summary</h2>
              <p>${summary}</p>
            </div>
          ` : ''}
          
          ${actionItems.length > 0 ? `
            <div class="section">
              <h2>Action Items</h2>
              ${actionItems.map(item => `
                <div class="action-item">
                  <strong>${item.title}</strong>
                  ${item.assignee_name ? `<br><em>Assigned to: ${item.assignee_name}</em>` : ''}
                  ${item.due_date ? `<br><em>Due: ${new Date(item.due_date).toLocaleDateString()}</em>` : ''}
                  ${item.priority ? `<br><em>Priority: ${item.priority}</em>` : ''}
                  ${item.description ? `<br><p>${item.description}</p>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          ${transcript ? `
            <div class="section">
              <h2>Meeting Transcript</h2>
              <div class="transcript">${transcript.content}</div>
            </div>
          ` : ''}
        </div>
        
        <div style="text-align: center; padding: 20px; color: #7f8c8d; font-size: 12px;">
          <p>This summary was automatically generated by Meeting Intelligence System</p>
        </div>
      </body>
      </html>
    `;

    const text = `
MEETING SUMMARY
${meeting.title}
${new Date(meeting.created_at).toLocaleDateString()} • Duration: ${Math.round(meeting.audio_duration / 60)} minutes

${summary ? `SUMMARY\n${summary}\n\n` : ''}

${actionItems.length > 0 ? `ACTION ITEMS\n${actionItems.map((item, index) => 
  `${index + 1}. ${item.title}${item.assignee_name ? ` (${item.assignee_name})` : ''}${item.due_date ? ` - Due: ${new Date(item.due_date).toLocaleDateString()}` : ''}`
).join('\n')}\n\n` : ''}

${transcript ? `TRANSCRIPT\n${transcript.content}\n\n` : ''}

---
This summary was automatically generated by Meeting Intelligence System
    `;

    return { html, text };
  }

  /**
   * Generate follow-up email content
   */
  generateFollowUpEmail({ meeting, action_items, follow_up_date, custom_message }) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background-color: #e8f4fd; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .action-item { background-color: #fff3cd; padding: 10px; margin: 5px 0; border-left: 4px solid #ffc107; }
          h1 { color: #2c3e50; }
          h2 { color: #34495e; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Follow-up: ${meeting.title}</h1>
          <p>Scheduled for: ${new Date(follow_up_date).toLocaleDateString()}</p>
        </div>
        
        <div class="content">
          <p>Hi everyone,</p>
          
          ${custom_message ? `<p>${custom_message}</p>` : `
            <p>This is a follow-up regarding our recent meeting. Please find below the action items that require attention:</p>
          `}
          
          ${action_items.length > 0 ? `
            <h2>Pending Action Items</h2>
            ${action_items.map(item => `
              <div class="action-item">
                <strong>${item.title}</strong>
                ${item.assignee_name ? `<br>Assignee: ${item.assignee_name}` : ''}
                ${item.due_date ? `<br>Due: ${new Date(item.due_date).toLocaleDateString()}` : ''}
                ${item.status ? `<br>Status: ${item.status}` : ''}
              </div>
            `).join('')}
          ` : ''}
          
          <p>Please let me know if you have any questions or updates on these items.</p>
          
          <p>Best regards</p>
        </div>
      </body>
      </html>
    `;

    const text = `
Follow-up: ${meeting.title}
Scheduled for: ${new Date(follow_up_date).toLocaleDateString()}

Hi everyone,

${custom_message || 'This is a follow-up regarding our recent meeting. Please find below the action items that require attention:'}

${action_items.length > 0 ? `PENDING ACTION ITEMS:\n${action_items.map((item, index) => 
  `${index + 1}. ${item.title}${item.assignee_name ? ` (${item.assignee_name})` : ''}${item.due_date ? ` - Due: ${new Date(item.due_date).toLocaleDateString()}` : ''}`
).join('\n')}\n\n` : ''}

Please let me know if you have any questions or updates on these items.

Best regards
    `;

    return { html, text };
  }

  /**
   * Generate action item email content
   */
  generateActionItemEmail({ meeting, actionItem }) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background-color: #d4edda; padding: 20px; text-align: center; }
          .action-details { background-color: #f8f9fa; padding: 20px; margin: 20px 0; border: 1px solid #dee2e6; }
          h1 { color: #155724; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Action Item Assignment</h1>
          <p>From meeting: ${meeting.title}</p>
        </div>
        
        <div style="padding: 20px;">
          <p>Hi ${actionItem.assignee_name || 'there'},</p>
          
          <p>You have been assigned the following action item from our recent meeting:</p>
          
          <div class="action-details">
            <h2>${actionItem.title}</h2>
            ${actionItem.description ? `<p><strong>Description:</strong> ${actionItem.description}</p>` : ''}
            ${actionItem.due_date ? `<p><strong>Due Date:</strong> ${new Date(actionItem.due_date).toLocaleDateString()}</p>` : ''}
            <p><strong>Priority:</strong> ${actionItem.priority || 'Medium'}</p>
            ${actionItem.category ? `<p><strong>Category:</strong> ${actionItem.category}</p>` : ''}
          </div>
          
          <p>Please confirm receipt of this action item and let us know if you have any questions.</p>
          
          <p>Thank you!</p>
        </div>
      </body>
      </html>
    `;

    const text = `
Action Item Assignment
From meeting: ${meeting.title}

Hi ${actionItem.assignee_name || 'there'},

You have been assigned the following action item from our recent meeting:

TITLE: ${actionItem.title}
${actionItem.description ? `DESCRIPTION: ${actionItem.description}` : ''}
${actionItem.due_date ? `DUE DATE: ${new Date(actionItem.due_date).toLocaleDateString()}` : ''}
PRIORITY: ${actionItem.priority || 'Medium'}
${actionItem.category ? `CATEGORY: ${actionItem.category}` : ''}

Please confirm receipt of this action item and let us know if you have any questions.

Thank you!
    `;

    return { html, text };
  }

  /**
   * Create email message in base64 format
   */
  createEmailMessage({ to, subject, htmlBody, textBody }) {
    const boundary = 'boundary_' + Math.random().toString(36).substr(2, 9);
    
    const message = [
      `To: ${Array.isArray(to) ? to.join(', ') : to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      textBody,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      htmlBody,
      '',
      `--${boundary}--`
    ].join('\n');

    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Create email message with attachment
   */
  createEmailMessageWithAttachment({ to, subject, htmlBody, textBody, attachment }) {
    const boundary = 'boundary_' + Math.random().toString(36).substr(2, 9);
    
    const message = [
      `To: ${Array.isArray(to) ? to.join(', ') : to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      htmlBody,
      '',
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      '',
      Buffer.from(attachment.content).toString('base64'),
      '',
      `--${boundary}--`
    ].join('\n');

    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Generate ICS calendar event
   */
  generateICSCalendarEvent({ title, start, duration, location, description }) {
    const end = new Date(start.getTime() + duration * 60 * 1000);
    
    const formatDate = (date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Meeting Intelligence//Meeting Invitation//EN',
      'BEGIN:VEVENT',
      `UID:${Date.now()}@meetingintelligence.com`,
      `DTSTART:${formatDate(start)}`,
      `DTEND:${formatDate(end)}`,
      `SUMMARY:${title}`,
      description ? `DESCRIPTION:${description}` : '',
      location ? `LOCATION:${location}` : '',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].filter(line => line !== '').join('\r\n');
  }
}

module.exports = new EmailService();