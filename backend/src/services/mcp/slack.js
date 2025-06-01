const axios = require('axios');
const { ServiceUnavailableError, ValidationError } = require('../../middleware/errorHandler');

class SlackService {
  constructor() {
    this.baseURL = 'https://slack.com/api';
  }

  /**
   * Test Slack connection
   */
  async testConnection(serviceConfig) {
    try {
      const { bot_token } = serviceConfig;

      if (!bot_token) {
        throw new ValidationError('Missing Slack bot token');
      }

      const response = await axios.post(`${this.baseURL}/auth.test`, {}, {
        headers: {
          'Authorization': `Bearer ${bot_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.data.ok) {
        throw new Error(response.data.error);
      }

      return {
        success: true,
        team: response.data.team,
        user: response.data.user,
        team_id: response.data.team_id,
        user_id: response.data.user_id
      };

    } catch (error) {
      console.error('Slack connection test failed:', error);
      throw new ServiceUnavailableError('Slack service connection failed');
    }
  }

  /**
   * Post meeting summary to Slack channel
   */
  async postMeetingSummary(serviceConfig, summaryData) {
    try {
      const { bot_token } = serviceConfig;
      const { channel, meeting, summary, actionItems = [], mentionUsers = [] } = summaryData;

      if (!bot_token || !channel) {
        throw new ValidationError('Missing required Slack configuration');
      }

      // Build Slack blocks for rich formatting
      const blocks = this.buildMeetingSummaryBlocks({
        meeting,
        summary,
        actionItems,
        mentionUsers
      });

      const response = await axios.post(`${this.baseURL}/chat.postMessage`, {
        channel: channel,
        blocks: blocks,
        text: `Meeting Summary: ${meeting.title}`, // Fallback text
        unfurl_links: false,
        unfurl_media: false
      }, {
        headers: {
          'Authorization': `Bearer ${bot_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.data.ok) {
        throw new Error(response.data.error);
      }

      return {
        message_ts: response.data.ts,
        channel: response.data.channel,
        permalink: await this.getPermalink(bot_token, response.data.channel, response.data.ts),
        posted_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to post meeting summary to Slack:', error);
      throw new ServiceUnavailableError('Failed to post meeting summary to Slack');
    }
  }

  /**
   * Create action item threads in Slack
   */
  async createActionItemThreads(serviceConfig, threadData) {
    try {
      const { bot_token } = serviceConfig;
      const { channel, meeting, actionItems } = threadData;

      if (!bot_token || !channel || !actionItems.length) {
        throw new ValidationError('Missing required data for action item threads');
      }

      const threads = [];

      // Post main message about action items
      const mainBlocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🎯 Action Items: ${meeting.title}`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Meeting Date: ${new Date(meeting.created_at).toLocaleDateString()} | Total Items: ${actionItems.length}`
            }
          ]
        },
        {
          type: 'divider'
        }
      ];

      const mainResponse = await axios.post(`${this.baseURL}/chat.postMessage`, {
        channel: channel,
        blocks: mainBlocks,
        text: `Action Items: ${meeting.title}`
      }, {
        headers: {
          'Authorization': `Bearer ${bot_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!mainResponse.data.ok) {
        throw new Error(mainResponse.data.error);
      }

      // Create individual threads for each action item
      for (const actionItem of actionItems) {
        const actionBlocks = this.buildActionItemBlocks(actionItem);

        const threadResponse = await axios.post(`${this.baseURL}/chat.postMessage`, {
          channel: channel,
          thread_ts: mainResponse.data.ts,
          blocks: actionBlocks,
          text: `Action Item: ${actionItem.title}`
        }, {
          headers: {
            'Authorization': `Bearer ${bot_token}`,
            'Content-Type': 'application/json'
          }
        });

        if (threadResponse.data.ok) {
          threads.push({
            action_item_id: actionItem.id,
            message_ts: threadResponse.data.ts,
            thread_ts: mainResponse.data.ts
          });
        }
      }

      return {
        main_message_ts: mainResponse.data.ts,
        threads_created: threads.length,
        threads: threads,
        channel: channel
      };

    } catch (error) {
      console.error('Failed to create action item threads:', error);
      throw new ServiceUnavailableError('Failed to create action item threads in Slack');
    }
  }

  /**
   * Notify team members about meeting results
   */
  async notifyTeamMembers(serviceConfig, notificationData) {
    try {
      const { bot_token } = serviceConfig;
      const { users, meeting, message_type = 'summary', custom_message } = notificationData;

      if (!bot_token || !users.length) {
        throw new ValidationError('Missing required notification data');
      }

      const notifications = [];

      for (const user of users) {
        const blocks = this.buildNotificationBlocks({
          meeting,
          message_type,
          custom_message,
          user
        });

        try {
          const response = await axios.post(`${this.baseURL}/chat.postMessage`, {
            channel: user.slack_user_id || user.email,
            blocks: blocks,
            text: `Meeting Update: ${meeting.title}`
          }, {
            headers: {
              'Authorization': `Bearer ${bot_token}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.data.ok) {
            notifications.push({
              user_id: user.id,
              slack_user_id: user.slack_user_id,
              message_ts: response.data.ts,
              status: 'sent'
            });
          } else {
            notifications.push({
              user_id: user.id,
              status: 'failed',
              error: response.data.error
            });
          }
        } catch (userError) {
          notifications.push({
            user_id: user.id,
            status: 'failed',
            error: userError.message
          });
        }
      }

      return {
        notifications_sent: notifications.filter(n => n.status === 'sent').length,
        notifications_failed: notifications.filter(n => n.status === 'failed').length,
        notifications: notifications
      };

    } catch (error) {
      console.error('Failed to notify team members:', error);
      throw new ServiceUnavailableError('Failed to send Slack notifications');
    }
  }

  /**
   * Schedule Slack reminders for action items
   */
  async scheduleSlackReminders(serviceConfig, reminderData) {
    try {
      const { bot_token } = serviceConfig;
      const { action_items, reminder_time } = reminderData;

      if (!bot_token || !action_items.length) {
        throw new ValidationError('Missing required reminder data');
      }

      const reminders = [];
      const reminderTimestamp = Math.floor(new Date(reminder_time).getTime() / 1000);

      for (const actionItem of action_items) {
        if (!actionItem.assignee_slack_id) continue;

        const reminderText = `Reminder: "${actionItem.title}" is due ${actionItem.due_date ? `on ${new Date(actionItem.due_date).toLocaleDateString()}` : 'soon'}`;

        try {
          const response = await axios.post(`${this.baseURL}/chat.scheduleMessage`, {
            channel: actionItem.assignee_slack_id,
            text: reminderText,
            post_at: reminderTimestamp
          }, {
            headers: {
              'Authorization': `Bearer ${bot_token}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.data.ok) {
            reminders.push({
              action_item_id: actionItem.id,
              scheduled_message_id: response.data.scheduled_message_id,
              post_at: reminder_time,
              status: 'scheduled'
            });
          }
        } catch (itemError) {
          console.warn(`Failed to schedule reminder for action item ${actionItem.id}:`, itemError.message);
        }
      }

      return {
        reminders_scheduled: reminders.length,
        reminders: reminders
      };

    } catch (error) {
      console.error('Failed to schedule Slack reminders:', error);
      throw new ServiceUnavailableError('Failed to schedule Slack reminders');
    }
  }

  /**
   * Build meeting summary blocks for Slack
   */
  buildMeetingSummaryBlocks({ meeting, summary, actionItems, mentionUsers }) {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📝 Meeting Summary: ${meeting.title}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `📅 ${new Date(meeting.created_at).toLocaleDateString()} | ⏱️ ${Math.round(meeting.audio_duration / 60)} min | 🎤 ${meeting.meeting_type || 'Meeting'}`
          }
        ]
      }
    ];

    // Add mentions if provided
    if (mentionUsers.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `👥 ${mentionUsers.map(user => `<@${user}>`).join(' ')}`
        }
      });
    }

    blocks.push({ type: 'divider' });

    // Add summary
    if (summary) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📋 Summary*\n${summary}`
        }
      });
    }

    // Add action items
    if (actionItems.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🎯 Action Items (${actionItems.length})*`
        }
      });

      actionItems.slice(0, 5).forEach((item, index) => {
        const priorityEmoji = item.priority === 'high' ? '🔴' : item.priority === 'low' ? '🟡' : '🟠';
        const dueText = item.due_date ? ` (Due: ${new Date(item.due_date).toLocaleDateString()})` : '';
        const assigneeText = item.assignee_name ? ` - ${item.assignee_name}` : '';

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${priorityEmoji} *${item.title}*${assigneeText}${dueText}`
          }
        });

        if (item.description) {
          blocks.push({
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: item.description
              }
            ]
          });
        }
      });

      if (actionItems.length > 5) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `_... and ${actionItems.length - 5} more action items_`
            }
          ]
        });
      }
    }

    blocks.push(
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '🤖 Generated by Meeting Intelligence System'
          }
        ]
      }
    );

    return blocks;
  }

  /**
   * Build action item blocks for Slack threads
   */
  buildActionItemBlocks(actionItem) {
    const priorityEmoji = actionItem.priority === 'high' ? '🔴' : actionItem.priority === 'low' ? '🟡' : '🟠';
    const statusEmoji = actionItem.status === 'completed' ? '✅' : actionItem.status === 'in_progress' ? '🔄' : '⏳';

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${priorityEmoji} ${statusEmoji} *${actionItem.title}*`
        }
      }
    ];

    if (actionItem.description) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: actionItem.description
        }
      });
    }

    // Add metadata
    const metadata = [];
    if (actionItem.assignee_name) metadata.push(`👤 ${actionItem.assignee_name}`);
    if (actionItem.due_date) metadata.push(`📅 Due: ${new Date(actionItem.due_date).toLocaleDateString()}`);
    if (actionItem.category) metadata.push(`🏷️ ${actionItem.category}`);
    if (actionItem.priority) metadata.push(`⚡ ${actionItem.priority} priority`);

    if (metadata.length > 0) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: metadata.join(' • ')
          }
        ]
      });
    }

    return blocks;
  }

  /**
   * Build notification blocks
   */
  buildNotificationBlocks({ meeting, message_type, custom_message, user }) {
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `👋 Hi ${user.name || 'there'}! You have a meeting update.`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Meeting:* ${meeting.title}\n*Date:* ${new Date(meeting.created_at).toLocaleDateString()}`
        }
      }
    ];

    if (custom_message) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: custom_message
        }
      });
    }

    return blocks;
  }

  /**
   * Get permalink for a message
   */
  async getPermalink(botToken, channel, messageTs) {
    try {
      const response = await axios.get(`${this.baseURL}/chat.getPermalink`, {
        params: {
          channel: channel,
          message_ts: messageTs
        },
        headers: {
          'Authorization': `Bearer ${botToken}`
        }
      });

      return response.data.ok ? response.data.permalink : null;
    } catch (error) {
      console.warn('Failed to get Slack permalink:', error.message);
      return null;
    }
  }

  /**
   * Get channel list
   */
  async getChannels(serviceConfig) {
    try {
      const { bot_token } = serviceConfig;

      const response = await axios.get(`${this.baseURL}/conversations.list`, {
        params: {
          types: 'public_channel,private_channel',
          limit: 100
        },
        headers: {
          'Authorization': `Bearer ${bot_token}`
        }
      });

      if (!response.data.ok) {
        throw new Error(response.data.error);
      }

      return response.data.channels.map(channel => ({
        id: channel.id,
        name: channel.name,
        is_private: channel.is_private,
        is_member: channel.is_member
      }));

    } catch (error) {
      console.error('Failed to get Slack channels:', error);
      throw new ServiceUnavailableError('Failed to retrieve Slack channels');
    }
  }

  /**
   * Get user list
   */
  async getUsers(serviceConfig) {
    try {
      const { bot_token } = serviceConfig;

      const response = await axios.get(`${this.baseURL}/users.list`, {
        headers: {
          'Authorization': `Bearer ${bot_token}`
        }
      });

      if (!response.data.ok) {
        throw new Error(response.data.error);
      }

      return response.data.members
        .filter(member => !member.deleted && !member.is_bot)
        .map(member => ({
          id: member.id,
          name: member.real_name || member.name,
          email: member.profile?.email,
          display_name: member.profile?.display_name
        }));

    } catch (error) {
      console.error('Failed to get Slack users:', error);
      throw new ServiceUnavailableError('Failed to retrieve Slack users');
    }
  }
}

module.exports = new SlackService();