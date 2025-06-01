const axios = require('axios');
const { ServiceUnavailableError, ValidationError } = require('../../middleware/errorHandler');

class NotionService {
  constructor() {
    this.baseURL = 'https://api.notion.com/v1';
    this.version = '2022-06-28';
  }

  /**
   * Test Notion connection
   */
  async testConnection(serviceConfig) {
    try {
      const { api_key } = serviceConfig;

      if (!api_key) {
        throw new ValidationError('Missing Notion API key');
      }

      const response = await axios.get(`${this.baseURL}/users/me`, {
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Notion-Version': this.version,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        user_id: response.data.id,
        user_name: response.data.name,
        user_email: response.data.person?.email,
        workspace: response.data.workspace_name
      };

    } catch (error) {
      console.error('Notion connection test failed:', error);
      throw new ServiceUnavailableError('Notion service connection failed');
    }
  }

  /**
   * Create meeting page in Notion
   */
  async createMeetingPage(serviceConfig, meetingData) {
    try {
      const { api_key } = serviceConfig;
      const { 
        database_id, 
        meeting, 
        summary, 
        keyPoints = [], 
        decisions = [], 
        actionItems = [], 
        speakers = [], 
        transcript = null,
        template_type = 'standard'
      } = meetingData;

      if (!api_key || !database_id) {
        throw new ValidationError('Missing required Notion configuration');
      }

      // Build page properties
      const properties = this.buildMeetingPageProperties(meeting, template_type);

      // Build page content
      const children = this.buildMeetingPageContent({
        meeting,
        summary,
        keyPoints,
        decisions,
        actionItems,
        speakers,
        transcript,
        template_type
      });

      // Create the page
      const response = await axios.post(`${this.baseURL}/pages`, {
        parent: { database_id: database_id },
        properties: properties,
        children: children
      }, {
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Notion-Version': this.version,
          'Content-Type': 'application/json'
        }
      });

      return {
        page_id: response.data.id,
        page_url: response.data.url,
        title: meeting.title,
        created_at: response.data.created_time,
        database_id: database_id
      };

    } catch (error) {
      console.error('Failed to create Notion meeting page:', error);
      throw new ServiceUnavailableError('Failed to create meeting page in Notion');
    }
  }

  /**
   * Update project notes with meeting information
   */
  async updateProjectNotes(serviceConfig, updateData) {
    try {
      const { api_key } = serviceConfig;
      const { page_id, meeting, new_content } = updateData;

      if (!api_key || !page_id) {
        throw new ValidationError('Missing required Notion configuration');
      }

      // Get existing page content
      const existingPage = await axios.get(`${this.baseURL}/pages/${page_id}`, {
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Notion-Version': this.version
        }
      });

      // Build update content
      const updateBlocks = this.buildMeetingUpdateBlocks({
        meeting,
        new_content
      });

      // Append blocks to the page
      const response = await axios.patch(`${this.baseURL}/blocks/${page_id}/children`, {
        children: updateBlocks
      }, {
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Notion-Version': this.version,
          'Content-Type': 'application/json'
        }
      });

      return {
        page_id: page_id,
        blocks_added: updateBlocks.length,
        updated_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to update Notion project notes:', error);
      throw new ServiceUnavailableError('Failed to update project notes in Notion');
    }
  }

  /**
   * Add action items to Notion database
   */
  async addActionItemsToDatabase(serviceConfig, actionItemsData) {
    try {
      const { api_key } = serviceConfig;
      const { database_id, meeting, action_items } = actionItemsData;

      if (!api_key || !database_id || !action_items.length) {
        throw new ValidationError('Missing required data for action items database');
      }

      const createdItems = [];

      for (const actionItem of action_items) {
        try {
          const properties = this.buildActionItemProperties(actionItem, meeting);

          const response = await axios.post(`${this.baseURL}/pages`, {
            parent: { database_id: database_id },
            properties: properties
          }, {
            headers: {
              'Authorization': `Bearer ${api_key}`,
              'Notion-Version': this.version,
              'Content-Type': 'application/json'
            }
          });

          createdItems.push({
            action_item_id: actionItem.id,
            notion_page_id: response.data.id,
            notion_url: response.data.url,
            title: actionItem.title
          });

        } catch (itemError) {
          console.warn(`Failed to create action item ${actionItem.id} in Notion:`, itemError.message);
        }
      }

      return {
        items_created: createdItems.length,
        total_items: action_items.length,
        created_items: createdItems
      };

    } catch (error) {
      console.error('Failed to add action items to Notion database:', error);
      throw new ServiceUnavailableError('Failed to add action items to Notion database');
    }
  }

  /**
   * Link related meetings
   */
  async linkRelatedMeetings(serviceConfig, linkData) {
    try {
      const { api_key } = serviceConfig;
      const { current_meeting_page_id, related_meeting_ids } = linkData;

      if (!api_key || !current_meeting_page_id || !related_meeting_ids.length) {
        throw new ValidationError('Missing required data for linking meetings');
      }

      // Build relation blocks
      const relationBlocks = this.buildRelatedMeetingsBlocks(related_meeting_ids);

      // Add to current meeting page
      const response = await axios.patch(`${this.baseURL}/blocks/${current_meeting_page_id}/children`, {
        children: relationBlocks
      }, {
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Notion-Version': this.version,
          'Content-Type': 'application/json'
        }
      });

      return {
        current_page_id: current_meeting_page_id,
        related_meetings_linked: related_meeting_ids.length,
        blocks_added: relationBlocks.length
      };

    } catch (error) {
      console.error('Failed to link related meetings in Notion:', error);
      throw new ServiceUnavailableError('Failed to link related meetings');
    }
  }

  /**
   * Create meeting templates
   */
  async createMeetingTemplates(serviceConfig, templateData) {
    try {
      const { api_key } = serviceConfig;
      const { template_database_id, templates } = templateData;

      if (!api_key || !template_database_id || !templates.length) {
        throw new ValidationError('Missing required template data');
      }

      const createdTemplates = [];

      for (const template of templates) {
        try {
          const properties = {
            'Template Name': {
              title: [
                {
                  text: {
                    content: template.name
                  }
                }
              ]
            },
            'Meeting Type': {
              select: {
                name: template.meeting_type
              }
            },
            'Description': {
              rich_text: [
                {
                  text: {
                    content: template.description || ''
                  }
                }
              ]
            }
          };

          const children = this.buildTemplateContent(template);

          const response = await axios.post(`${this.baseURL}/pages`, {
            parent: { database_id: template_database_id },
            properties: properties,
            children: children
          }, {
            headers: {
              'Authorization': `Bearer ${api_key}`,
              'Notion-Version': this.version,
              'Content-Type': 'application/json'
            }
          });

          createdTemplates.push({
            template_name: template.name,
            notion_page_id: response.data.id,
            notion_url: response.data.url
          });

        } catch (templateError) {
          console.warn(`Failed to create template ${template.name}:`, templateError.message);
        }
      }

      return {
        templates_created: createdTemplates.length,
        total_templates: templates.length,
        created_templates: createdTemplates
      };

    } catch (error) {
      console.error('Failed to create meeting templates:', error);
      throw new ServiceUnavailableError('Failed to create meeting templates');
    }
  }

  /**
   * Build meeting page properties
   */
  buildMeetingPageProperties(meeting, templateType) {
    const properties = {
      'Meeting Title': {
        title: [
          {
            text: {
              content: meeting.title
            }
          }
        ]
      },
      'Date': {
        date: {
          start: meeting.created_at.split('T')[0]
        }
      },
      'Duration (min)': {
        number: Math.round(meeting.audio_duration / 60)
      },
      'Meeting Type': {
        select: {
          name: meeting.meeting_type || 'Other'
        }
      },
      'Status': {
        select: {
          name: meeting.status === 'completed' ? 'Completed' : 'In Progress'
        }
      }
    };

    // Add template-specific properties
    if (templateType === 'standup') {
      properties['Yesterday\'s Progress'] = { rich_text: [] };
      properties['Today\'s Goals'] = { rich_text: [] };
      properties['Blockers'] = { rich_text: [] };
    } else if (templateType === 'retrospective') {
      properties['What Went Well'] = { rich_text: [] };
      properties['What Could Improve'] = { rich_text: [] };
      properties['Action Items'] = { rich_text: [] };
    }

    return properties;
  }

  /**
   * Build meeting page content
   */
  buildMeetingPageContent({ meeting, summary, keyPoints, decisions, actionItems, speakers, transcript, template_type }) {
    const children = [];

    // Meeting overview
    children.push({
      object: 'block',
      type: 'heading_1',
      heading_1: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: '📋 Meeting Overview'
            }
          }
        ]
      }
    });

    if (summary) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: summary
              }
            }
          ]
        }
      });
    }

    // Key points
    if (keyPoints.length > 0) {
      children.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: '🔑 Key Points'
              }
            }
          ]
        }
      });

      keyPoints.forEach(point => {
        children.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: point
                }
              }
            ]
          }
        });
      });
    }

    // Decisions
    if (decisions.length > 0) {
      children.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: '✅ Decisions Made'
              }
            }
          ]
        }
      });

      decisions.forEach(decision => {
        children.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: decision
                }
              }
            ]
          }
        });
      });
    }

    // Action items
    if (actionItems.length > 0) {
      children.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: '🎯 Action Items'
              }
            }
          ]
        }
      });

      actionItems.forEach(item => {
        const itemText = `${item.title}${item.assignee_name ? ` (@${item.assignee_name})` : ''}${item.due_date ? ` - Due: ${new Date(item.due_date).toLocaleDateString()}` : ''}`;
        
        children.push({
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: itemText
                }
              }
            ],
            checked: item.status === 'completed'
          }
        });

        if (item.description) {
          children.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `    ${item.description}`
                  }
                }
              ]
            }
          });
        }
      });
    }

    // Participants
    if (speakers.length > 0) {
      children.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: '👥 Participants'
              }
            }
          ]
        }
      });

      speakers.forEach(speaker => {
        const speakerName = speaker.identified_name || speaker.label;
        const speakingTime = Math.round(speaker.speaking_time / 60);
        
        children.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `${speakerName} (${speakingTime} min)`
                }
              }
            ]
          }
        });
      });
    }

    // Full transcript (if requested)
    if (transcript && transcript.content) {
      children.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: '📝 Full Transcript'
              }
            }
          ]
        }
      });

      children.push({
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: 'Click to view transcript'
              }
            }
          ],
          children: [
            {
              object: 'block',
              type: 'code',
              code: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: transcript.content.substring(0, 2000) // Notion has content limits
                    }
                  }
                ],
                language: 'plain text'
              }
            }
          ]
        }
      });
    }

    return children;
  }

  /**
   * Build action item properties for database
   */
  buildActionItemProperties(actionItem, meeting) {
    return {
      'Title': {
        title: [
          {
            text: {
              content: actionItem.title
            }
          }
        ]
      },
      'Description': {
        rich_text: [
          {
            text: {
              content: actionItem.description || ''
            }
          }
        ]
      },
      'Assignee': {
        rich_text: [
          {
            text: {
              content: actionItem.assignee_name || 'Unassigned'
            }
          }
        ]
      },
      'Due Date': actionItem.due_date ? {
        date: {
          start: actionItem.due_date.split('T')[0]
        }
      } : { date: null },
      'Priority': {
        select: {
          name: actionItem.priority || 'Medium'
        }
      },
      'Status': {
        select: {
          name: actionItem.status === 'completed' ? 'Done' : 
                actionItem.status === 'in_progress' ? 'In Progress' : 'To Do'
        }
      },
      'Meeting': {
        rich_text: [
          {
            text: {
              content: meeting.title
            }
          }
        ]
      },
      'Category': {
        select: {
          name: actionItem.category || 'Task'
        }
      }
    };
  }

  /**
   * Build meeting update blocks
   */
  buildMeetingUpdateBlocks({ meeting, new_content }) {
    return [
      {
        object: 'block',
        type: 'divider',
        divider: {}
      },
      {
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: `Update from ${meeting.title} - ${new Date().toLocaleDateString()}`
              }
            }
          ]
        }
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: new_content
              }
            }
          ]
        }
      }
    ];
  }

  /**
   * Build related meetings blocks
   */
  buildRelatedMeetingsBlocks(relatedMeetingIds) {
    return [
      {
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: '🔗 Related Meetings'
              }
            }
          ]
        }
      },
      ...relatedMeetingIds.map(meetingId => ({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: `Meeting ID: ${meetingId}`
              }
            }
          ]
        }
      }))
    ];
  }

  /**
   * Build template content
   */
  buildTemplateContent(template) {
    const children = [
      {
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: template.name
              }
            }
          ]
        }
      }
    ];

    if (template.sections) {
      template.sections.forEach(section => {
        children.push({
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: section.title
                }
              }
            ]
          }
        });

        if (section.content) {
          children.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: section.content
                  }
                }
              ]
            }
          });
        }
      });
    }

    return children;
  }
}

module.exports = new NotionService();