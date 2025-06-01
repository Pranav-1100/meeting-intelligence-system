const Joi = require('joi');

class ValidationUtils {
  constructor() {
    this.schemas = this.initializeSchemas();
  }

  /**
   * Initialize all validation schemas
   */
  initializeSchemas() {
    return {
      // Meeting validation schemas
      meetingUpload: Joi.object({
        title: Joi.string().max(200).optional(),
        description: Joi.string().max(1000).optional(),
        meeting_type: Joi.string().valid('uploaded', 'real-time', 'video-call', 'phone-call', 'interview', 'standup', 'retrospective', 'planning').default('uploaded'),
        platform: Joi.string().max(50).optional(),
        participants: Joi.string().custom(this.validateJSONString).optional(),
        auto_process: Joi.string().valid('true', 'false').default('true')
      }),

      meetingUpdate: Joi.object({
        title: Joi.string().max(200).optional(),
        description: Joi.string().max(1000).optional(),
        status: Joi.string().valid('scheduled', 'in_progress', 'completed', 'cancelled').optional()
      }),

      // Action item validation schemas
      actionItemCreate: Joi.object({
        title: Joi.string().min(1).max(200).required(),
        description: Joi.string().max(1000).optional(),
        assigneeName: Joi.string().max(100).optional(),
        assigneeId: Joi.string().uuid().optional(),
        dueDate: Joi.date().iso().optional(),
        priority: Joi.string().valid('high', 'medium', 'low').default('medium'),
        category: Joi.string().valid('task', 'follow-up', 'research', 'decision', 'meeting', 'other').default('task')
      }),

      actionItemUpdate: Joi.object({
        title: Joi.string().min(1).max(200).optional(),
        description: Joi.string().max(1000).optional(),
        assignee_name: Joi.string().max(100).optional(),
        assignee_id: Joi.string().uuid().optional(),
        due_date: Joi.date().iso().optional(),
        priority: Joi.string().valid('high', 'medium', 'low').optional(),
        status: Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled').optional(),
        category: Joi.string().valid('task', 'follow-up', 'research', 'decision', 'meeting', 'other').optional()
      }),

      // User profile validation schemas
      userProfileUpdate: Joi.object({
        display_name: Joi.string().min(1).max(100).optional(),
        settings: Joi.object({
          notifications: Joi.boolean().optional(),
          theme: Joi.string().valid('light', 'dark', 'auto').optional(),
          language: Joi.string().valid('en', 'es', 'fr', 'de', 'pt', 'it').optional(),
          autoTranscription: Joi.boolean().optional(),
          realtimeProcessing: Joi.boolean().optional(),
          emailSummaries: Joi.boolean().optional(),
          slackNotifications: Joi.boolean().optional()
        }).optional()
      }),

      userSettings: Joi.object({
        notifications: Joi.boolean().optional(),
        theme: Joi.string().valid('light', 'dark', 'auto').optional(),
        language: Joi.string().valid('en', 'es', 'fr', 'de', 'pt', 'it').optional(),
        autoTranscription: Joi.boolean().optional(),
        realtimeProcessing: Joi.boolean().optional(),
        emailSummaries: Joi.boolean().optional(),
        slackNotifications: Joi.boolean().optional(),
        defaultMeetingType: Joi.string().valid('uploaded', 'real-time', 'video-call', 'phone-call', 'interview', 'standup', 'retrospective', 'planning').optional(),
        processingQuality: Joi.string().valid('fast', 'balanced', 'accurate').optional()
      }),

      // Analysis validation schemas
      analysisGenerate: Joi.object({
        analysisType: Joi.string().valid('comprehensive', 'summary', 'sentiment', 'action_items', 'topics').default('comprehensive'),
        customPrompt: Joi.string().max(2000).optional(),
        includeActionItems: Joi.boolean().default(true)
      }),

      transcriptionCorrect: Joi.object({
        segmentId: Joi.string().uuid().required(),
        correctedContent: Joi.string().min(1).max(5000).required(),
        speakerCorrection: Joi.object({
          speakerId: Joi.string().uuid().optional(),
          speakerName: Joi.string().max(100).optional()
        }).optional()
      }),

      retranscribe: Joi.object({
        language: Joi.string().valid('en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'ko', 'zh', 'ru', 'ar').default('en'),
        prompt: Joi.string().max(500).optional(),
        includeDiarization: Joi.boolean().default(true),
        temperature: Joi.number().min(0).max(1).default(0)
      }),

      speakerIdentify: Joi.object({
        name: Joi.string().min(1).max(100).required(),
        email: Joi.string().email().optional()
      }),

      // MCP integration validation schemas
      mcpIntegration: Joi.object({
        service_type: Joi.string().valid('calendar', 'email', 'slack', 'notion').required(),
        service_config: Joi.object().required(),
        is_active: Joi.boolean().default(true)
      }),

      calendarSchedule: Joi.object({
        title: Joi.string().min(1).max(200).required(),
        description: Joi.string().max(1000).optional(),
        start_time: Joi.date().iso().required(),
        end_time: Joi.date().iso().greater(Joi.ref('start_time')).required(),
        attendees: Joi.array().items(Joi.string().email()).default([]),
        meeting_id: Joi.string().uuid().optional()
      }),

      emailSummary: Joi.object({
        meeting_id: Joi.string().uuid().required(),
        recipients: Joi.array().items(Joi.string().email()).min(1).required(),
        subject: Joi.string().max(200).optional(),
        include_transcript: Joi.boolean().default(false),
        include_action_items: Joi.boolean().default(true)
      }),

      slackPost: Joi.object({
        meeting_id: Joi.string().uuid().required(),
        channel: Joi.string().min(1).required(),
        include_action_items: Joi.boolean().default(true),
        mention_users: Joi.array().items(Joi.string()).default([])
      }),

      notionPage: Joi.object({
        meeting_id: Joi.string().uuid().required(),
        database_id: Joi.string().required(),
        template_type: Joi.string().valid('standard', 'standup', 'retrospective', 'planning', 'interview').default('standard'),
        include_full_transcript: Joi.boolean().default(false)
      }),

      // Search and filter validation schemas
      searchQuery: Joi.object({
        query: Joi.string().min(1).max(500).required(),
        speakerId: Joi.string().uuid().optional(),
        caseSensitive: Joi.boolean().default(false),
        wholeWords: Joi.boolean().default(false),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20)
      }),

      meetingFilter: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        status: Joi.string().valid('scheduled', 'in_progress', 'completed', 'cancelled').optional(),
        type: Joi.string().valid('uploaded', 'real-time', 'video-call', 'phone-call', 'interview', 'standup', 'retrospective', 'planning').optional(),
        search: Joi.string().max(200).optional(),
        startDate: Joi.date().iso().optional(),
        endDate: Joi.date().iso().optional(),
        sortBy: Joi.string().valid('created_at', 'updated_at', 'title', 'duration', 'status').default('created_at'),
        sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC')
      }),

      actionItemFilter: Joi.object({
        status: Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled').optional(),
        priority: Joi.string().valid('high', 'medium', 'low').optional(),
        assignee: Joi.string().max(100).optional(),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20)
      }),

      // Real-time session validation schemas
      realtimeStart: Joi.object({
        userId: Joi.string().uuid().required(),
        meetingTitle: Joi.string().max(200).optional(),
        meetingType: Joi.string().valid('real-time', 'video-call', 'phone-call').default('real-time')
      }),

      realtimeChunk: Joi.object({
        audioData: Joi.binary().required(),
        timestamp: Joi.number().required(),
        forceProcess: Joi.boolean().default(false)
      }),

      // Organization validation schemas
      organizationCreate: Joi.object({
        name: Joi.string().min(1).max(100).required(),
        description: Joi.string().max(500).optional()
      }),

      // Account deletion validation
      accountDelete: Joi.object({
        confirmEmail: Joi.string().email().required()
      })
    };
  }

  /**
   * Custom validator for JSON strings
   */
  validateJSONString(value, helpers) {
    try {
      JSON.parse(value);
      return value;
    } catch (error) {
      return helpers.error('any.invalid');
    }
  }

  /**
   * Validate input against a schema
   */
  validate(schemaName, data) {
    const schema = this.schemas[schemaName];
    if (!schema) {
      throw new Error(`Validation schema '${schemaName}' not found`);
    }

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return {
        isValid: false,
        errors: errorDetails,
        value: null
      };
    }

    return {
      isValid: true,
      errors: [],
      value
    };
  }

  /**
   * Validate email address
   */
  validateEmail(email) {
    const emailSchema = Joi.string().email().required();
    const { error } = emailSchema.validate(email);
    return !error;
  }

  /**
   * Validate UUID
   */
  validateUUID(uuid) {
    const uuidSchema = Joi.string().uuid().required();
    const { error } = uuidSchema.validate(uuid);
    return !error;
  }

  /**
   * Validate date range
   */
  validateDateRange(startDate, endDate) {
    const schema = Joi.object({
      startDate: Joi.date().iso().required(),
      endDate: Joi.date().iso().greater(Joi.ref('startDate')).required()
    });

    const { error } = schema.validate({ startDate, endDate });
    return !error;
  }

  /**
   * Validate password strength
   */
  validatePasswordStrength(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasNonalphas = /\W/.test(password);

    const checks = {
      minLength: password.length >= minLength,
      hasUpperCase,
      hasLowerCase,
      hasNumbers,
      hasNonalphas
    };

    const score = Object.values(checks).filter(Boolean).length;
    
    let strength = 'weak';
    if (score >= 4) strength = 'strong';
    else if (score >= 3) strength = 'medium';

    return {
      isValid: checks.minLength && score >= 3,
      strength,
      checks,
      score
    };
  }

  /**
   * Sanitize string input
   */
  sanitizeString(input, maxLength = 1000) {
    if (typeof input !== 'string') {
      return '';
    }

    return input
      .trim()
      .slice(0, maxLength)
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Validate file upload
   */
  validateFileUpload(file, allowedTypes = [], maxSize = 100 * 1024 * 1024) {
    const errors = [];

    if (!file) {
      errors.push('No file provided');
      return { isValid: false, errors };
    }

    // Check file size
    if (file.size > maxSize) {
      errors.push(`File too large: ${Math.round(file.size / 1024 / 1024)}MB. Maximum: ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    // Check file type
    if (allowedTypes.length > 0) {
      const fileExtension = file.originalname.toLowerCase().split('.').pop();
      const allowedExtensions = allowedTypes.map(type => type.replace('.', ''));
      
      if (!allowedExtensions.includes(fileExtension)) {
        errors.push(`Invalid file type: .${fileExtension}. Allowed types: ${allowedTypes.join(', ')}`);
      }
    }

    // Check for empty file
    if (file.size === 0) {
      errors.push('File is empty');
    }

    return {
      isValid: errors.length === 0,
      errors,
      fileInfo: {
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype
      }
    };
  }

  /**
   * Validate meeting duration
   */
  validateMeetingDuration(duration) {
    const minDuration = 10; // 10 seconds
    const maxDuration = 4 * 60 * 60; // 4 hours

    if (duration < minDuration) {
      return {
        isValid: false,
        error: `Meeting too short: ${duration}s. Minimum: ${minDuration}s`
      };
    }

    if (duration > maxDuration) {
      return {
        isValid: false,
        error: `Meeting too long: ${Math.round(duration / 60)}min. Maximum: ${Math.round(maxDuration / 60)}min`
      };
    }

    return { isValid: true };
  }

  /**
   * Validate pagination parameters
   */
  validatePagination(page, limit, maxLimit = 100) {
    const schema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(maxLimit).default(20)
    });

    const { error, value } = schema.validate({ page, limit });
    
    if (error) {
      return {
        isValid: false,
        error: error.details[0].message,
        value: { page: 1, limit: 20 }
      };
    }

    return {
      isValid: true,
      value
    };
  }

  /**
   * Validate time zone
   */
  validateTimeZone(timezone) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: `Invalid timezone: ${timezone}`
      };
    }
  }

  /**
   * Validate language code
   */
  validateLanguageCode(langCode) {
    const supportedLanguages = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'ko', 'zh', 'ru', 'ar'];
    
    if (!supportedLanguages.includes(langCode)) {
      return {
        isValid: false,
        error: `Unsupported language: ${langCode}. Supported: ${supportedLanguages.join(', ')}`
      };
    }

    return { isValid: true };
  }

  /**
   * Get all available schemas
   */
  getAvailableSchemas() {
    return Object.keys(this.schemas);
  }

  /**
   * Create middleware for route validation
   */
  createValidationMiddleware(schemaName, source = 'body') {
    return (req, res, next) => {
      const data = req[source];
      const result = this.validate(schemaName, data);

      if (!result.isValid) {
        return res.status(400).json({
          error: 'Validation failed',
          details: result.errors
        });
      }

      // Replace the original data with validated and sanitized data
      req[source] = result.value;
      next();
    };
  }
}

module.exports = new ValidationUtils();