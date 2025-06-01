// src/services/openai.js
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { ServiceUnavailableError, ValidationError } = require('../middleware/errorHandler');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class OpenAIService {
  constructor() {
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Transcribe audio file using Whisper
   */
  async transcribeAudio(audioFilePath, options = {}) {
    const {
      language = 'en',
      prompt = null,
      temperature = 0,
      timestampGranularities = ['word', 'segment']
    } = options;

    try {
      // Validate file exists and size
      if (!fs.existsSync(audioFilePath)) {
        throw new ValidationError('Audio file not found');
      }

      const fileStats = fs.statSync(audioFilePath);
      const maxSize = 25 * 1024 * 1024; // 25MB limit for Whisper
      
      if (fileStats.size > maxSize) {
        throw new ValidationError('Audio file too large for transcription (max 25MB)');
      }

      console.log(`🎤 Transcribing audio: ${audioFilePath} (${fileStats.size} bytes)`);

      const startTime = Date.now();
      
      const transcription = await this.retryWithBackoff(async () => {
        const transcriptionParams = {
          file: fs.createReadStream(audioFilePath),
          model: 'whisper-1',
          language: language,
          response_format: 'verbose_json',
          temperature: temperature,
          timestamp_granularities: timestampGranularities
        };

        // Only add prompt if it's not null/undefined
        if (prompt) {
          transcriptionParams.prompt = prompt;
        }

        return await openai.audio.transcriptions.create(transcriptionParams);
      });

      const processingTime = (Date.now() - startTime) / 1000;

      console.log(`✅ Transcription completed in ${processingTime}s`);

      return {
        text: transcription.text,
        language: transcription.language,
        duration: transcription.duration,
        words: transcription.words || [],
        segments: transcription.segments || [],
        processingTime: processingTime,
        model: 'whisper-1',
        wordCount: transcription.text.split(/\s+/).length
      };

    } catch (error) {
      console.error('Transcription error:', error);
      
      if (error.status === 429) {
        throw new ServiceUnavailableError('OpenAI rate limit exceeded');
      }
      
      if (error.status === 500 || error.status === 502 || error.status === 503) {
        throw new ServiceUnavailableError('OpenAI service temporarily unavailable');
      }

      throw error;
    }
  }

  /**
   * Analyze meeting content using GPT-4
   */
  async analyzeMeeting(transcript, options = {}) {
    const {
      analysisType = 'comprehensive',
      speakerInfo = [],
      meetingContext = {},
      customPrompt = null
    } = options;

    try {
      console.log(`🧠 Analyzing meeting (${transcript.length} characters)`);

      const analysisPrompt = customPrompt || this.buildAnalysisPrompt(
        transcript, 
        analysisType, 
        speakerInfo, 
        meetingContext
      );

      const startTime = Date.now();

      const completion = await this.retryWithBackoff(async () => {
        const messages = [
          {
            role: 'system',
            content: 'You are an expert meeting analyst. Provide structured, actionable insights from meeting transcripts.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ];

        const requestParams = {
          model: 'gpt-4-turbo-preview',
          messages: messages,
          temperature: 0.3,
          max_tokens: 4000,
          response_format: { type: 'json_object' }
        };

        return await openai.chat.completions.create(requestParams);
      });

      const processingTime = (Date.now() - startTime) / 1000;
      const analysisResult = JSON.parse(completion.choices[0].message.content);

      console.log(`✅ Meeting analysis completed in ${processingTime}s`);

      return {
        ...analysisResult,
        metadata: {
          model: 'gpt-4-turbo-preview',
          processingTime: processingTime,
          tokenUsage: completion.usage,
          analysisType: analysisType,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Meeting analysis error:', error);
      
      if (error.status === 429) {
        throw new ServiceUnavailableError('OpenAI rate limit exceeded');
      }
      
      if (error.status === 500 || error.status === 502 || error.status === 503) {
        throw new ServiceUnavailableError('OpenAI service temporarily unavailable');
      }

      throw error;
    }
  }

  /**
   * Extract action items specifically
   */
  async extractActionItems(transcript, speakerInfo = []) {
    const prompt = `
      Analyze the following meeting transcript and extract action items.
      
      Speaker Information: ${JSON.stringify(speakerInfo)}
      
      Transcript:
      ${transcript}
      
      Extract action items and return a JSON object with this structure:
      {
        "actionItems": [
          {
            "title": "Brief action item title",
            "description": "Detailed description of what needs to be done",
            "assignee": "Person responsible (if mentioned)",
            "dueDate": "Due date if mentioned (YYYY-MM-DD format)",
            "priority": "high|medium|low",
            "category": "task category",
            "contextTimestamp": "approximate timestamp in seconds if available",
            "confidenceScore": 0.0-1.0,
            "extractedFromText": "exact text that led to this action item"
          }
        ]
      }
      
      Guidelines:
      - Only extract clear, actionable items
      - Assign priority based on urgency/importance mentioned
      - Include timestamp context when possible
      - Set confidence based on clarity of the action item
      - Categories: "task", "follow-up", "research", "decision", "meeting", "other"
    `;

    try {
      const result = await this.analyzeMeeting(transcript, {
        analysisType: 'action_items',
        speakerInfo: speakerInfo,
        customPrompt: prompt
      });

      return result.actionItems || [];

    } catch (error) {
      console.error('Action item extraction error:', error);
      throw error;
    }
  }

  /**
   * Build analysis prompt based on type and context
   */
  buildAnalysisPrompt(transcript, analysisType, speakerInfo, meetingContext) {
    const baseContext = `
      Meeting Context: ${JSON.stringify(meetingContext)}
      Speaker Information: ${JSON.stringify(speakerInfo)}
      
      Transcript:
      ${transcript}
    `;

    const prompts = {
      comprehensive: `
        ${baseContext}
        
        Provide a comprehensive analysis of this meeting. Return a JSON object with:
        {
          "summary": "Executive summary of the meeting",
          "keyPoints": ["Important points discussed"],
          "decisions": ["Decisions made during the meeting"],
          "actionItems": [
            {
              "title": "Action item title",
              "assignee": "Person responsible",
              "dueDate": "Due date if mentioned",
              "priority": "high|medium|low"
            }
          ],
          "topics": ["Main topics discussed"],
          "nextSteps": ["Immediate next steps"],
          "participants": [
            {
              "name": "Speaker name",
              "participationLevel": "high|medium|low",
              "keyContributions": ["Their main contributions"]
            }
          ],
          "sentiment": {
            "overall": "positive|neutral|negative",
            "details": "Sentiment analysis details"
          },
          "meetingEffectiveness": {
            "score": 1-10,
            "reasoning": "Why this score"
          }
        }
      `,

      summary: `
        ${baseContext}
        
        Create a concise meeting summary. Return JSON:
        {
          "summary": "Brief meeting summary",
          "keyDecisions": ["Important decisions"],
          "actionItems": ["Action items with assignees"],
          "nextMeeting": "Next meeting details if mentioned"
        }
      `,

      sentiment: `
        ${baseContext}
        
        Analyze the sentiment and dynamics of this meeting. Return JSON:
        {
          "overallSentiment": "positive|neutral|negative",
          "speakerSentiments": [
            {
              "speaker": "Speaker name",
              "sentiment": "positive|neutral|negative",
              "engagement": "high|medium|low",
              "emotions": ["emotions detected"]
            }
          ],
          "conflictAreas": ["Areas of disagreement"],
          "collaborationLevel": "high|medium|low",
          "energyLevel": "high|medium|low"
        }
      `
    };

    return prompts[analysisType] || prompts.comprehensive;
  }

  /**
   * Retry mechanism with exponential backoff
   */
  async retryWithBackoff(operation, attempt = 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= this.maxRetries) {
        throw error;
      }

      // Only retry on specific errors
      const retryableErrors = [429, 500, 502, 503, 504];
      if (!retryableErrors.includes(error.status)) {
        throw error;
      }

      const delay = this.retryDelay * Math.pow(2, attempt - 1);
      console.log(`🔄 Retrying operation (attempt ${attempt + 1}/${this.maxRetries}) in ${delay}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryWithBackoff(operation, attempt + 1);
    }
  }

  /**
   * Get estimated cost for transcription
   */
  getTranscriptionCost(durationMinutes) {
    const costPerMinute = 0.006; // $0.006 per minute for Whisper
    return durationMinutes * costPerMinute;
  }

  /**
   * Get estimated cost for analysis
   */
  getAnalysisCost(inputTokens, outputTokens) {
    const inputCostPer1K = 0.01; // $0.01 per 1K input tokens for GPT-4 Turbo
    const outputCostPer1K = 0.03; // $0.03 per 1K output tokens
    
    return (inputTokens / 1000) * inputCostPer1K + (outputTokens / 1000) * outputCostPer1K;
  }
}

module.exports = new OpenAIService();