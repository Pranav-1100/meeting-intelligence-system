const { google } = require('googleapis');
const { ServiceUnavailableError, ValidationError } = require('../../middleware/errorHandler');

class CalendarService {
  constructor() {
    this.calendar = null;
  }

  /**
   * Initialize Google Calendar client
   */
  initializeClient(serviceConfig) {
    const { refresh_token, client_id, client_secret } = serviceConfig;

    if (!refresh_token || !client_id || !client_secret) {
      throw new ValidationError('Missing required calendar configuration');
    }

    const oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    oauth2Client.setCredentials({
      refresh_token: refresh_token
    });

    this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    return this.calendar;
  }

  /**
   * Test calendar connection
   */
  async testConnection(serviceConfig) {
    try {
      const calendar = this.initializeClient(serviceConfig);
      
      const response = await calendar.calendarList.list({
        maxResults: 1
      });

      return {
        success: true,
        calendars_found: response.data.items?.length || 0,
        primary_calendar: response.data.items?.[0]?.summary || 'Unknown'
      };

    } catch (error) {
      console.error('Calendar connection test failed:', error);
      throw new ServiceUnavailableError('Calendar service connection failed');
    }
  }

  /**
   * Schedule a new meeting
   */
  async scheduleMeeting(serviceConfig, meetingData) {
    try {
      const calendar = this.initializeClient(serviceConfig);
      const { title, description, start_time, end_time, attendees = [] } = meetingData;

      // Prepare event data
      const eventData = {
        summary: title,
        description: description,
        start: {
          dateTime: new Date(start_time).toISOString(),
          timeZone: 'UTC'
        },
        end: {
          dateTime: new Date(end_time).toISOString(),
          timeZone: 'UTC'
        },
        attendees: attendees.map(email => ({ email })),
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 1 day before
            { method: 'popup', minutes: 15 }        // 15 minutes before
          ]
        },
        conferenceData: {
          createRequest: {
            requestId: `meeting-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      };

      // Create the event
      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: eventData,
        conferenceDataVersion: 1,
        sendUpdates: 'all'
      });

      return {
        event_id: response.data.id,
        event_link: response.data.htmlLink,
        meeting_link: response.data.conferenceData?.entryPoints?.[0]?.uri,
        status: response.data.status,
        created: response.data.created,
        attendees_count: attendees.length
      };

    } catch (error) {
      console.error('Failed to schedule meeting:', error);
      throw new ServiceUnavailableError('Failed to schedule meeting in calendar');
    }
  }

  /**
   * Find available time slots
   */
  async findAvailableSlots(serviceConfig, searchCriteria) {
    try {
      const calendar = this.initializeClient(serviceConfig);
      const { 
        start_date, 
        end_date, 
        duration_minutes = 60,
        attendees = [],
        working_hours = { start: '09:00', end: '17:00' }
      } = searchCriteria;

      // Get busy times for attendees
      const freeBusyRequest = {
        timeMin: new Date(start_date).toISOString(),
        timeMax: new Date(end_date).toISOString(),
        items: [
          { id: 'primary' },
          ...attendees.map(email => ({ id: email }))
        ]
      };

      const freeBusyResponse = await calendar.freebusy.query({
        resource: freeBusyRequest
      });

      // Process busy times and find available slots
      const availableSlots = this.calculateAvailableSlots(
        freeBusyResponse.data,
        start_date,
        end_date,
        duration_minutes,
        working_hours
      );

      return {
        available_slots: availableSlots,
        requested_duration: duration_minutes,
        search_period: { start_date, end_date },
        attendees_checked: attendees.length + 1 // +1 for primary calendar
      };

    } catch (error) {
      console.error('Failed to find available slots:', error);
      throw new ServiceUnavailableError('Failed to check calendar availability');
    }
  }

  /**
   * Create recurring meeting
   */
  async createRecurringMeeting(serviceConfig, recurringData) {
    try {
      const calendar = this.initializeClient(serviceConfig);
      const { 
        title, 
        description, 
        start_time, 
        end_time, 
        attendees = [],
        recurrence_rule 
      } = recurringData;

      const eventData = {
        summary: title,
        description: description,
        start: {
          dateTime: new Date(start_time).toISOString(),
          timeZone: 'UTC'
        },
        end: {
          dateTime: new Date(end_time).toISOString(),
          timeZone: 'UTC'
        },
        attendees: attendees.map(email => ({ email })),
        recurrence: [recurrence_rule], // e.g., 'RRULE:FREQ=WEEKLY;COUNT=10'
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 15 }
          ]
        }
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: eventData,
        sendUpdates: 'all'
      });

      return {
        series_id: response.data.id,
        event_link: response.data.htmlLink,
        recurrence_rule: recurrence_rule,
        status: response.data.status
      };

    } catch (error) {
      console.error('Failed to create recurring meeting:', error);
      throw new ServiceUnavailableError('Failed to create recurring meeting');
    }
  }

  /**
   * Add meeting notes to existing event
   */
  async addMeetingNotes(serviceConfig, eventData) {
    try {
      const calendar = this.initializeClient(serviceConfig);
      const { event_id, notes, summary, action_items = [] } = eventData;

      // Get existing event
      const existingEvent = await calendar.events.get({
        calendarId: 'primary',
        eventId: event_id
      });

      // Prepare updated description
      let updatedDescription = existingEvent.data.description || '';
      
      if (summary) {
        updatedDescription += `\n\n--- MEETING SUMMARY ---\n${summary}`;
      }

      if (notes) {
        updatedDescription += `\n\n--- MEETING NOTES ---\n${notes}`;
      }

      if (action_items.length > 0) {
        updatedDescription += `\n\n--- ACTION ITEMS ---\n`;
        action_items.forEach((item, index) => {
          updatedDescription += `${index + 1}. ${item.title}`;
          if (item.assignee) updatedDescription += ` (Assigned to: ${item.assignee})`;
          if (item.due_date) updatedDescription += ` (Due: ${item.due_date})`;
          updatedDescription += '\n';
        });
      }

      // Update event
      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: event_id,
        resource: {
          ...existingEvent.data,
          description: updatedDescription.trim()
        }
      });

      return {
        event_id: response.data.id,
        updated: response.data.updated,
        status: response.data.status,
        notes_added: true
      };

    } catch (error) {
      console.error('Failed to add meeting notes:', error);
      throw new ServiceUnavailableError('Failed to update calendar event with notes');
    }
  }

  /**
   * Get upcoming meetings
   */
  async getUpcomingMeetings(serviceConfig, options = {}) {
    try {
      const calendar = this.initializeClient(serviceConfig);
      const { 
        max_results = 10, 
        days_ahead = 7,
        calendar_id = 'primary' 
      } = options;

      const timeMin = new Date();
      const timeMax = new Date();
      timeMax.setDate(timeMax.getDate() + days_ahead);

      const response = await calendar.events.list({
        calendarId: calendar_id,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: max_results,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = response.data.items.map(event => ({
        id: event.id,
        title: event.summary,
        description: event.description,
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date,
        attendees: event.attendees?.map(a => ({
          email: a.email,
          status: a.responseStatus,
          optional: a.optional
        })) || [],
        meeting_link: event.conferenceData?.entryPoints?.[0]?.uri,
        location: event.location,
        status: event.status
      }));

      return {
        events,
        total_found: events.length,
        search_period: {
          start: timeMin.toISOString(),
          end: timeMax.toISOString()
        }
      };

    } catch (error) {
      console.error('Failed to get upcoming meetings:', error);
      throw new ServiceUnavailableError('Failed to retrieve upcoming meetings');
    }
  }

  /**
   * Set follow-up reminders
   */
  async setFollowUpReminders(serviceConfig, reminderData) {
    try {
      const calendar = this.initializeClient(serviceConfig);
      const { 
        original_meeting_id,
        follow_up_title,
        follow_up_date,
        attendees = [],
        reminder_notes 
      } = reminderData;

      // Create follow-up event
      const eventData = {
        summary: follow_up_title || 'Follow-up Meeting',
        description: reminder_notes || 'Follow-up discussion based on previous meeting',
        start: {
          dateTime: new Date(follow_up_date).toISOString(),
          timeZone: 'UTC'
        },
        end: {
          dateTime: new Date(new Date(follow_up_date).getTime() + 60 * 60 * 1000).toISOString(), // 1 hour duration
          timeZone: 'UTC'
        },
        attendees: attendees.map(email => ({ email })),
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 15 }
          ]
        }
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: eventData,
        sendUpdates: 'all'
      });

      return {
        follow_up_event_id: response.data.id,
        follow_up_link: response.data.htmlLink,
        scheduled_for: follow_up_date,
        status: response.data.status
      };

    } catch (error) {
      console.error('Failed to set follow-up reminder:', error);
      throw new ServiceUnavailableError('Failed to create follow-up reminder');
    }
  }

  /**
   * Helper method to calculate available time slots
   */
  calculateAvailableSlots(freeBusyData, startDate, endDate, durationMinutes, workingHours) {
    const availableSlots = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Extract all busy periods
    const busyPeriods = [];
    Object.values(freeBusyData.calendars || {}).forEach(calendar => {
      calendar.busy?.forEach(busyTime => {
        busyPeriods.push({
          start: new Date(busyTime.start),
          end: new Date(busyTime.end)
        });
      });
    });

    // Sort busy periods by start time
    busyPeriods.sort((a, b) => a.start - b.start);

    // Find available slots
    let currentTime = new Date(start);
    const endTime = new Date(end);

    while (currentTime < endTime) {
      const dayStart = new Date(currentTime);
      dayStart.setHours(parseInt(workingHours.start.split(':')[0]), parseInt(workingHours.start.split(':')[1]), 0, 0);
      
      const dayEnd = new Date(currentTime);
      dayEnd.setHours(parseInt(workingHours.end.split(':')[0]), parseInt(workingHours.end.split(':')[1]), 0, 0);

      // Skip weekends (Saturday = 6, Sunday = 0)
      if (currentTime.getDay() === 0 || currentTime.getDay() === 6) {
        currentTime.setDate(currentTime.getDate() + 1);
        currentTime.setHours(0, 0, 0, 0);
        continue;
      }

      // Check for available slots within working hours
      let slotStart = new Date(Math.max(currentTime, dayStart));
      
      while (slotStart.getTime() + (durationMinutes * 60 * 1000) <= dayEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + (durationMinutes * 60 * 1000));
        
        // Check if this slot conflicts with any busy period
        const hasConflict = busyPeriods.some(busy => 
          (slotStart < busy.end && slotEnd > busy.start)
        );

        if (!hasConflict) {
          availableSlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            duration_minutes: durationMinutes
          });
        }

        // Move to next 30-minute slot
        slotStart.setMinutes(slotStart.getMinutes() + 30);
      }

      // Move to next day
      currentTime.setDate(currentTime.getDate() + 1);
      currentTime.setHours(0, 0, 0, 0);
    }

    return availableSlots.slice(0, 20); // Return max 20 slots
  }
}

module.exports = new CalendarService();