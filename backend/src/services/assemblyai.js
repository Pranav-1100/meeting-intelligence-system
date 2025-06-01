const { AssemblyAI } = require('assemblyai');
const fs = require('fs');
const { ServiceUnavailableError, ValidationError } = require('../middleware/errorHandler');

class AssemblyAIService {
  constructor() {
    this.client = new AssemblyAI({
      apiKey: process.env.ASSEMBLYAI_API_KEY
    });
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 seconds
    this.pollInterval = 3000; // 3 seconds
  }

  /**
   * Transcribe audio with speaker diarization
   */
  async transcribeWithDiarization(audioFilePath, options = {}) {
    const {
      minSpeakers = 2,
      maxSpeakers = 6,
      language = 'en',
      enableAutoHighlights = true,
      enableSummary = true,
      enableSentimentAnalysis = true
    } = options;

    try {
      // Validate file
      if (!fs.existsSync(audioFilePath)) {
        throw new ValidationError('Audio file not found');
      }

      const fileStats = fs.statSync(audioFilePath);
      console.log(`🎤 Starting AssemblyAI transcription: ${audioFilePath} (${fileStats.size} bytes)`);

      const startTime = Date.now();

      // Upload audio file
      const uploadUrl = await this.uploadAudio(audioFilePath);

      // Create transcription request
      const transcriptConfig = {
        audio_url: uploadUrl,
        speaker_labels: true,
        speakers_expected: Math.min(maxSpeakers, Math.max(minSpeakers, 4)),
        language_code: language,
        punctuate: true,
        format_text: true,
        auto_highlights: enableAutoHighlights,
        summary_model: enableSummary ? 'informative' : undefined,
        summary_type: enableSummary ? 'bullets' : undefined,
        sentiment_analysis: enableSentimentAnalysis,
        entity_detection: true,
        iab_categories: true,
        content_safety: true,
        custom_spelling: [
          { from: ['Gpt', 'gpt'], to: 'GPT' },
          { from: ['Ai', 'ai'], to: 'AI' },
          { from: ['Api', 'api'], to: 'API' },
          { from: ['Ui', 'ui'], to: 'UI' },
          { from: ['Ux', 'ux'], to: 'UX' }
        ]
      };

      // Submit transcription
      const transcript = await this.retryWithBackoff(async () => {
        return await this.client.transcripts.create(transcriptConfig);
      });

      // Poll for completion
      const completedTranscript = await this.pollTranscriptionStatus(transcript.id);

      const processingTime = (Date.now() - startTime) / 1000;

      console.log(`✅ AssemblyAI transcription completed in ${processingTime}s`);

      return this.formatTranscriptionResult(completedTranscript, processingTime);

    } catch (error) {
      console.error('AssemblyAI transcription error:', error);
      
      if (error.response?.status === 429) {
        throw new ServiceUnavailableError('AssemblyAI rate limit exceeded');
      }
      
      if (error.response?.status >= 500) {
        throw new ServiceUnavailableError('AssemblyAI service temporarily unavailable');
      }

      throw error;
    }
  }

  /**
   * Real-time transcription with speaker diarization
   */
  async startRealtimeTranscription(options = {}) {
    const {
      sampleRate = 16000,
      enableSpeakerLabels = true,
      onTranscript = () => {},
      onError = () => {},
      onClose = () => {}
    } = options;

    try {
      console.log('🔴 Starting real-time transcription with speaker diarization');

      const rt = this.client.realtime.createRealtimeTranscriber({
        sample_rate: sampleRate,
        word_boost: ['AI', 'API', 'GPT', 'machine learning', 'artificial intelligence'],
        speaker_labels: enableSpeakerLabels
      });

      // Set up event handlers
      rt.on('transcript', (transcript) => {
        if (transcript.message_type === 'FinalTranscript') {
          const formattedTranscript = this.formatRealtimeTranscript(transcript);
          onTranscript(formattedTranscript);
        }
      });

      rt.on('error', onError);
      rt.on('close', onClose);

      // Connect to AssemblyAI
      await rt.connect();

      return rt;

    } catch (error) {
      console.error('Real-time transcription error:', error);
      throw error;
    }
  }

  /**
   * Upload audio file to AssemblyAI
   */
  async uploadAudio(audioFilePath) {
    try {
      const audioData = fs.readFileSync(audioFilePath);
      const uploadResponse = await this.retryWithBackoff(async () => {
        return await this.client.files.upload(audioData);
      });

      return uploadResponse.upload_url;

    } catch (error) {
      console.error('Audio upload error:', error);
      throw new ServiceUnavailableError('Failed to upload audio to AssemblyAI');
    }
  }

  /**
   * Poll transcription status until complete
   */
  async pollTranscriptionStatus(transcriptId) {
    const maxAttempts = 200; // ~10 minutes max wait time
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const transcript = await this.client.transcripts.get(transcriptId);

        if (transcript.status === 'completed') {
          return transcript;
        }

        if (transcript.status === 'error') {
          throw new Error(`Transcription failed: ${transcript.error}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        attempts++;

      } catch (error) {
        console.error('Polling error:', error);
        throw error;
      }
    }

    throw new Error('Transcription timed out');
  }

  /**
   * Format transcription result for our system
   */
  formatTranscriptionResult(transcript, processingTime) {
    return {
      // Basic info
      id: transcript.id,
      text: transcript.text,
      language: transcript.language_code || 'en',
      confidence: transcript.confidence,
      duration: transcript.audio_duration,
      processingTime: processingTime,

      // Speaker information
      speakers: this.extractSpeakerInfo(transcript),
      
      // Detailed utterances with speaker labels
      utterances: (transcript.utterances || []).map(utterance => ({
        speaker: utterance.speaker,
        text: utterance.text,
        confidence: utterance.confidence,
        start: utterance.start / 1000, // Convert to seconds
        end: utterance.end / 1000,
        words: (utterance.words || []).map(word => ({
          text: word.text,
          start: word.start / 1000,
          end: word.end / 1000,
          confidence: word.confidence
        }))
      })),

      // Word-level timestamps
      words: (transcript.words || []).map(word => ({
        text: word.text,
        start: word.start / 1000,
        end: word.end / 1000,
        confidence: word.confidence,
        speaker: word.speaker
      })),

      // Additional analysis
      highlights: transcript.auto_highlights || [],
      summary: transcript.summary || null,
      sentimentAnalysis: transcript.sentiment_analysis_results || [],
      entities: transcript.entities || [],
      topics: transcript.iab_categories_result || {},
      
      // Metadata
      metadata: {
        model: 'assemblyai-core',
        features: {
          speakerLabels: true,
          sentimentAnalysis: !!transcript.sentiment_analysis_results,
          autoHighlights: !!transcript.auto_highlights,
          summary: !!transcript.summary
        },
        audioUrl: transcript.audio_url,
        processingTime: processingTime,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Extract speaker information and statistics
   */
  extractSpeakerInfo(transcript) {
    const speakerStats = {};

    // Process utterances to gather speaker statistics
    (transcript.utterances || []).forEach(utterance => {
      const speaker = utterance.speaker;
      const duration = (utterance.end - utterance.start) / 1000;
      const wordCount = (utterance.text || '').split(/\s+/).length;

      if (!speakerStats[speaker]) {
        speakerStats[speaker] = {
          label: speaker,
          totalSpeakingTime: 0,
          totalWords: 0,
          utteranceCount: 0,
          averageConfidence: 0,
          sentiments: []
        };
      }

      speakerStats[speaker].totalSpeakingTime += duration;
      speakerStats[speaker].totalWords += wordCount;
      speakerStats[speaker].utteranceCount += 1;
      speakerStats[speaker].averageConfidence += utterance.confidence || 0;
    });

    // Calculate averages and add sentiment data
    const speakers = Object.values(speakerStats).map(speaker => {
      speaker.averageConfidence = speaker.averageConfidence / speaker.utteranceCount;
      speaker.averageUtteranceLength = speaker.totalWords / speaker.utteranceCount;
      
      // Add sentiment analysis for this speaker
      const speakerSentiments = (transcript.sentiment_analysis_results || [])
        .filter(sentiment => 
          sentiment.start >= 0 && 
          transcript.utterances.some(u => 
            u.speaker === speaker.label && 
            u.start <= sentiment.start && 
            u.end >= sentiment.end
          )
        );
      
      speaker.sentiments = speakerSentiments;
      speaker.averageSentiment = this.calculateAverageSentiment(speakerSentiments);

      return speaker;
    });

    return speakers.sort((a, b) => b.totalSpeakingTime - a.totalSpeakingTime);
  }

  /**
   * Format real-time transcript data
   */
  formatRealtimeTranscript(transcript) {
    return {
      text: transcript.text,
      confidence: transcript.confidence,
      messageType: transcript.message_type,
      speaker: transcript.speaker || null,
      timestamp: Date.now(),
      words: (transcript.words || []).map(word => ({
        text: word.text,
        start: word.start,
        end: word.end,
        confidence: word.confidence
      }))
    };
  }

  /**
   * Calculate average sentiment for a speaker
   */
  calculateAverageSentiment(sentiments) {
    if (!sentiments || sentiments.length === 0) {
      return { sentiment: 'NEUTRAL', confidence: 0 };
    }

    const sentimentValues = {
      'POSITIVE': 1,
      'NEUTRAL': 0,
      'NEGATIVE': -1
    };

    let totalValue = 0;
    let totalConfidence = 0;

    sentiments.forEach(s => {
      totalValue += (sentimentValues[s.sentiment] || 0) * s.confidence;
      totalConfidence += s.confidence;
    });

    const averageValue = totalValue / totalConfidence;
    const averageConfidence = totalConfidence / sentiments.length;

    let sentiment = 'NEUTRAL';
    if (averageValue > 0.1) sentiment = 'POSITIVE';
    else if (averageValue < -0.1) sentiment = 'NEGATIVE';

    return { sentiment, confidence: averageConfidence };
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

      const retryableErrors = [429, 500, 502, 503, 504];
      if (!retryableErrors.includes(error.response?.status)) {
        throw error;
      }

      const delay = this.retryDelay * Math.pow(2, attempt - 1);
      console.log(`🔄 Retrying AssemblyAI operation (attempt ${attempt + 1}/${this.maxRetries}) in ${delay}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryWithBackoff(operation, attempt + 1);
    }
  }

  /**
   * Get estimated cost for transcription
   */
  getTranscriptionCost(durationHours) {
    const costPerHour = 0.37; // $0.37 per hour for AssemblyAI Core
    return durationHours * costPerHour;
  }
}

module.exports = new AssemblyAIService();