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
 * Extract action items from a single audio chunk (35 seconds)
 * Optimized for real-time processing
 */
async extractActionItemsFromChunk(transcriptText, chunkContext = {}) {
  try {
    console.log(`🎯 Extracting action items from chunk ${chunkContext.chunkIndex || 'unknown'}`);
    
    if (!transcriptText || transcriptText.trim().length < 20) {
      console.log('Chunk too short for action item analysis');
      return { actionItems: [] };
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant that extracts action items from meeting transcript chunks.

IMPORTANT: You are analyzing a 35-second chunk of a meeting, not the full meeting.

Extract ONLY clear, actionable items from this transcript segment. Return JSON format:

{
  "actionItems": [
    {
      "title": "Brief action item description (max 80 chars)",
      "description": "More detailed description if needed",
      "assignee": "Person name if clearly mentioned, null otherwise",
      "priority": "high|medium|low",
      "category": "task|follow-up|decision|research",
      "confidence": 0.0-1.0
    }
  ]
}

Rules:
- Only extract CONCRETE action items with clear next steps
- If assignee is mentioned by name, include it; otherwise use null
- Set confidence based on how clear and actionable the item is
- Ignore general discussion, questions, or vague statements
- Return empty array if no clear action items found
- Focus on "will do", "should do", "need to", "action:", "todo" language`
        },
        {
          role: 'user',
          content: `Meeting transcript chunk ${chunkContext.chunkIndex || ''} (${chunkContext.timestamp || 'unknown time'}):

${transcriptText}`
        }
      ],
      temperature: 0.1,
      max_tokens: 500
    });

    const response = completion.choices[0].message.content;
    console.log('Raw action item extraction response:', response);

    const result = JSON.parse(response);
    
    // Validate and enhance action items
    const validActionItems = (result.actionItems || [])
      .filter(item => item.title && item.title.trim().length > 5)
      .map(item => ({
        ...item,
        title: item.title.substring(0, 80), // Enforce length limit
        confidence: Math.max(0.3, Math.min(1.0, item.confidence || 0.7)), // Ensure reasonable confidence
        extractedFromChunk: chunkContext.chunkIndex,
        chunkTimestamp: chunkContext.timestamp
      }));

    console.log(`✅ Extracted ${validActionItems.length} action items from chunk`);
    
    return {
      actionItems: validActionItems,
      metadata: {
        chunkIndex: chunkContext.chunkIndex,
        timestamp: chunkContext.timestamp,
        processingTime: Date.now()
      }
    };

  } catch (error) {
    console.error('Action item extraction from chunk failed:', error);
    
    // Don't throw error for chunk processing - log and continue
    return { 
      actionItems: [], 
      error: error.message,
      metadata: {
        chunkIndex: chunkContext.chunkIndex,
        timestamp: chunkContext.timestamp,
        failed: true
      }
    };
  }
}

/**
 * Analyze meeting transcript for comprehensive insights
 * Enhanced version that works with both full meetings and real-time chunks
 */
async  analyzeMeeting(transcript, options = {}) {
  try {
    const { 
      analysisType = 'comprehensive',
      speakerInfo = [],
      meetingContext = {},
      isRealtime = false
    } = options;

    console.log(`🧠 Starting ${analysisType} meeting analysis...`);
    console.log(`📊 Context:`, {
      transcriptLength: transcript.length,
      speakers: speakerInfo.length,
      method: meetingContext.method,
      isRealtime
    });

    // Different prompts for real-time vs full meeting analysis
    const systemPrompt = isRealtime ? 
      generateRealtimeAnalysisPrompt(meetingContext) : 
      generateFullMeetingAnalysisPrompt(meetingContext);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Meeting transcript:

${transcript}

${speakerInfo.length > 0 ? `

Speaker information:
${speakerInfo.map(s => `- ${s.label}: ${s.totalSpeakingTime}s speaking time`).join('\n')}` : ''}`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const response = completion.choices[0].message.content;
    console.log('Raw analysis response:', response.substring(0, 200) + '...');

    const analysis = JSON.parse(response);
    
    // Enhanced analysis with metadata
    const result = {
      summary: analysis.summary || '',
      keyPoints: analysis.keyPoints || [],
      decisions: analysis.decisions || [],
      topics: analysis.topics || [],
      actionItems: analysis.actionItems || [],
      sentiment: analysis.sentiment || { overall: 'neutral' },
      participants: analysis.participants || [],
      followUps: analysis.followUps || [],
      metadata: {
        model: 'gpt-4',
        analysisType,
        processingTime: Date.now(),
        transcriptLength: transcript.length,
        speakersDetected: speakerInfo.length,
        method: meetingContext.method || 'unknown',
        confidence: analysis.confidence || 0.8,
        ...meetingContext
      }
    };

    console.log(`✅ Meeting analysis completed:`, {
      summaryLength: result.summary.length,
      keyPoints: result.keyPoints.length,
      decisions: result.decisions.length,
      actionItems: result.actionItems.length,
      topics: result.topics.length
    });

    return result;

  } catch (error) {
    console.error('Meeting analysis failed:', error);
    throw new Error(`Analysis failed: ${error.message}`);
  }
}


/**
 * Generate system prompt for real-time analysis
 */
 generateRealtimeAnalysisPrompt(context) {
  return `You are an AI assistant analyzing a meeting transcript compiled from real-time 35-second chunks.

This meeting was processed in real-time with the following context:
- Duration: ${context.duration || 'unknown'} seconds
- Chunks processed: ${context.chunksProcessed || 'unknown'}
- Method: ${context.method || 'real-time processing'}

Provide comprehensive analysis in JSON format:

{
  "summary": "3-4 sentence executive summary of the meeting",
  "keyPoints": ["Important points discussed", "Major topics covered"],
  "decisions": ["Decisions made during the meeting"],
  "topics": ["main topic 1", "topic 2", "topic 3"],
  "actionItems": [
    {
      "title": "Action item title",
      "description": "Detailed description",
      "assignee": "Person name or null",
      "priority": "high|medium|low",
      "category": "task|follow-up|decision|research"
    }
  ],
  "sentiment": {
    "overall": "positive|neutral|negative",
    "energy": "high|medium|low",
    "collaboration": "excellent|good|fair|poor"
  },
  "participants": [
    {
      "name": "Participant name or Speaker A/B",
      "role": "estimated role",
      "contribution": "key contribution summary"
    }
  ],
  "followUps": ["Suggested follow-up items"],
  "confidence": 0.0-1.0
}

Focus on:
- Clear, actionable insights
- Identifying actual decisions vs discussions
- Recognizing participation patterns
- Noting any action items that may have been mentioned across chunks`;
}

/**
 * Generate system prompt for full meeting analysis
 */
 generateFullMeetingAnalysisPrompt(context) {
  return `You are an AI assistant providing comprehensive analysis of a complete meeting transcript.

Meeting context:
- Duration: ${context.duration || 'unknown'} seconds
- Processing method: ${context.method || 'standard'}
- Speakers detected: ${context.speakersDetected || 'unknown'}

Provide thorough analysis in JSON format:

{
  "summary": "Comprehensive 4-6 sentence summary of the entire meeting",
  "keyPoints": ["Most important points and discussions", "Critical insights"],
  "decisions": ["All decisions made during the meeting"],
  "topics": ["primary topic", "secondary topics", "brief mentions"],
  "actionItems": [
    {
      "title": "Action item title",
      "description": "Detailed description with context",
      "assignee": "Person name if mentioned, null otherwise",
      "priority": "high|medium|low",
      "category": "task|follow-up|decision|research",
      "dueDate": "extracted date if mentioned, null otherwise"
    }
  ],
  "sentiment": {
    "overall": "positive|neutral|negative",
    "energy": "high|medium|low",
    "collaboration": "excellent|good|fair|poor",
    "concerns": ["any concerns raised"]
  },
  "participants": [
    {
      "name": "Participant name or Speaker label",
      "role": "inferred role based on contributions",
      "contribution": "summary of their key contributions"
    }
  ],
  "followUps": ["Recommended follow-up actions and meetings"],
  "confidence": 0.0-1.0
}

Provide detailed, accurate analysis focusing on actionable insights and clear outcomes.`;
}

/**
 * Analyze speaker patterns and contributions
 * Enhanced for real-time processing
 */
async  analyzeSpeakerPatterns(transcriptSegments, speakerInfo = []) {
  try {
    console.log(`👥 Analyzing speaker patterns for ${speakerInfo.length} speakers`);

    if (speakerInfo.length === 0) {
      return {
        patterns: [],
        insights: [],
        recommendations: []
      };
    }

    // Prepare speaker data for analysis
    const speakerData = speakerInfo.map(speaker => ({
      label: speaker.label,
      speakingTime: speaker.totalSpeakingTime || 0,
      wordCount: speaker.totalWords || 0,
      segments: transcriptSegments.filter(seg => seg.speaker_id === speaker.id).length
    }));

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Analyze speaker participation patterns and provide insights.

Return JSON format:
{
  "patterns": [
    {
      "speaker": "Speaker A",
      "pattern": "dominant|balanced|minimal|interrupted",
      "speakingPercentage": 45.2,
      "avgSegmentLength": 12.5,
      "participationStyle": "description"
    }
  ],
  "insights": [
    "Key insight about meeting dynamics",
    "Observation about participation balance"
  ],
  "recommendations": [
    "Suggestion for improving meeting dynamics"
  ]
}`
        },
        {
          role: 'user',
          content: `Speaker data:
${speakerData.map(s => 
  `${s.label}: ${s.speakingTime}s speaking time, ${s.wordCount} words, ${s.segments} segments`
).join('\n')}`
        }
      ],
      temperature: 0.3,
      max_tokens: 800
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    
    console.log(`✅ Speaker analysis completed for ${speakerInfo.length} speakers`);
    
    return {
      ...analysis,
      metadata: {
        totalSpeakers: speakerInfo.length,
        totalSpeakingTime: speakerData.reduce((sum, s) => sum + s.speakingTime, 0),
        processingTime: Date.now()
      }
    };

  } catch (error) {
    console.error('Speaker pattern analysis failed:', error);
    return {
      patterns: [],
      insights: [`Analysis failed: ${error.message}`],
      recommendations: []
    };
  }
}

/**
 * Generate meeting summary for different audiences
 */
async  generateTargetedSummary(analysis, targetAudience = 'general') {
  try {
    console.log(`📝 Generating ${targetAudience} summary...`);

    const audiencePrompts = {
      executive: 'Focus on decisions, outcomes, business impact, and high-level strategic points. Keep it concise and action-oriented.',
      team: 'Focus on action items, team responsibilities, project updates, and collaboration points. Include technical details as needed.',
      stakeholder: 'Focus on project status, deliverables, timeline updates, and any blockers or concerns. Balance detail with clarity.',
      general: 'Provide a balanced overview covering main topics, decisions, action items, and outcomes.'
    };

    const prompt = audiencePrompts[targetAudience] || audiencePrompts.general;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Generate a meeting summary for ${targetAudience} audience.

${prompt}

Format as structured text with clear sections.`
        },
        {
          role: 'user',
          content: `Meeting analysis:
Summary: ${analysis.summary}
Key Points: ${analysis.keyPoints?.join(', ')}
Decisions: ${analysis.decisions?.join(', ')}
Action Items: ${analysis.actionItems?.map(ai => ai.title).join(', ')}`
        }
      ],
      temperature: 0.2,
      max_tokens: 800
    });

    const summary = completion.choices[0].message.content;
    
    console.log(`✅ ${targetAudience} summary generated`);
    
    return {
      audience: targetAudience,
      content: summary,
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('Summary generation failed:', error);
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