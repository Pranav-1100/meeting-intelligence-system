const { AssemblyAI } = require('assemblyai');
const axios = require('axios');
const fs = require('fs');
const { ServiceUnavailableError, ValidationError } = require('../middleware/errorHandler');

class AssemblyAIService {
  constructor() {
    this.client = new AssemblyAI({
      apiKey: process.env.ASSEMBLYAI_API_KEY
    });
    this.baseUrl = 'https://api.assemblyai.com';
    this.maxRetries = 3;
    this.retryDelay = 2000;
    this.pollInterval = 3000;
  }

  /**
   * Complete transcription with speaker diarization using AssemblyAI
   * This replaces both OpenAI transcription AND AssemblyAI diarization
   */
  async transcribeWithDiarization(audioFilePath, options = {}) {
    const {
      minSpeakers = 1,
      maxSpeakers = 6,
      language = 'en',
      enableAutoHighlights = false, // Disabled to avoid extra costs
      enableSentimentAnalysis = false // Disabled to avoid extra costs
    } = options;

    try {
      // Validate file
      if (!fs.existsSync(audioFilePath)) {
        throw new ValidationError('Audio file not found');
      }

      const fileStats = fs.statSync(audioFilePath);
      console.log(`🎤 Starting AssemblyAI transcription with diarization: ${audioFilePath} (${fileStats.size} bytes)`);

      const startTime = Date.now();

      // Step 1: Upload audio file using axios (more reliable than SDK upload)
      console.log('📤 Uploading audio file to AssemblyAI...');
      const uploadUrl = await this.uploadAudioFileWithAxios(audioFilePath);
      console.log('✅ Audio file uploaded successfully:', uploadUrl);

      // Step 2: Create transcription request with speaker diarization
      const transcriptConfig = {
        audio_url: uploadUrl,
        speaker_labels: true, // Enable speaker diarization
        speakers_expected: Math.min(maxSpeakers, Math.max(minSpeakers, 2)),
        punctuate: true,
        format_text: true,
        // Only include language if not English (let AssemblyAI auto-detect English)
        ...(language !== 'en' && { language_code: language }),
        // Optional features (disabled for cost savings)
        auto_highlights: enableAutoHighlights,
        sentiment_analysis: enableSentimentAnalysis
      };

      console.log('🔄 Submitting transcription request with config:', {
        speaker_labels: transcriptConfig.speaker_labels,
        speakers_expected: transcriptConfig.speakers_expected,
        language_code: transcriptConfig.language_code || 'auto-detect'
      });

      // Step 3: Submit transcription using axios
      const transcript = await this.createTranscriptWithAxios(transcriptConfig);
      console.log('✅ Transcription submitted, ID:', transcript.id);

      // Step 4: Poll for completion
      const completedTranscript = await this.pollTranscriptionStatus(transcript.id);

      const processingTime = (Date.now() - startTime) / 1000;

      console.log(`✅ AssemblyAI transcription completed in ${processingTime}s`);
      console.log('📊 Transcript stats:', {
        status: completedTranscript.status,
        confidence: completedTranscript.confidence,
        audio_duration: completedTranscript.audio_duration,
        utterances_count: completedTranscript.utterances?.length || 0,
        text_length: completedTranscript.text?.length || 0
      });

      return this.formatTranscriptionResult(completedTranscript, processingTime);

    } catch (error) {
      console.error('AssemblyAI transcription error:', error);
      
      if (error.response?.status === 429) {
        throw new ServiceUnavailableError('AssemblyAI rate limit exceeded');
      }
      
      if (error.response?.status >= 500) {
        throw new ServiceUnavailableError('AssemblyAI service temporarily unavailable');
      }

      // Enhanced error logging
      if (error.response) {
        console.error('AssemblyAI API Error Details:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }

      throw error;
    }
  }

  /**
   * Upload audio file using axios (more reliable than SDK)
   */
  async uploadAudioFileWithAxios(audioFilePath) {
    try {
      console.log('📁 Reading audio file for upload...');
      
      // Read the file as a buffer
      const audioData = fs.readFileSync(audioFilePath);
      console.log(`📊 File read successfully: ${audioData.length} bytes`);

      // Upload using axios
      console.log('🚀 Uploading to AssemblyAI via axios...');
      const uploadResponse = await axios.post(`${this.baseUrl}/v2/upload`, audioData, {
        headers: {
          'authorization': process.env.ASSEMBLYAI_API_KEY,
          'content-type': 'application/octet-stream'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      console.log('✅ Upload response:', {
        status: uploadResponse.status,
        upload_url: uploadResponse.data.upload_url ? 'received' : 'missing'
      });

      if (!uploadResponse.data.upload_url) {
        throw new Error('Upload failed: No upload URL returned');
      }

      return uploadResponse.data.upload_url;

    } catch (error) {
      console.error('Audio upload error:', error);
      
      if (error.response) {
        console.error('Upload error details:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }

      throw new ServiceUnavailableError(`Failed to upload audio to AssemblyAI: ${error.message}`);
    }
  }

  /**
   * Create transcript using axios
   */
  async createTranscriptWithAxios(transcriptConfig) {
    try {
      const response = await axios.post(`${this.baseUrl}/v2/transcript`, transcriptConfig, {
        headers: {
          'authorization': process.env.ASSEMBLYAI_API_KEY,
          'content-type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Create transcript error:', error);
      
      if (error.response) {
        console.error('Create transcript error details:', {
          status: error.response.status,
          data: error.response.data
        });
      }

      throw error;
    }
  }

  /**
   * Poll transcription status until complete
   */
  async pollTranscriptionStatus(transcriptId) {
    const maxAttempts = 200; // ~10 minutes max wait time
    let attempts = 0;

    console.log(`🔍 Polling transcription status for ID: ${transcriptId}`);

    while (attempts < maxAttempts) {
      try {
        const response = await axios.get(`${this.baseUrl}/v2/transcript/${transcriptId}`, {
          headers: {
            'authorization': process.env.ASSEMBLYAI_API_KEY
          }
        });

        const transcript = response.data;

        console.log(`📊 Poll attempt ${attempts + 1}: Status = ${transcript.status}`);

        if (transcript.status === 'completed') {
          console.log('✅ Transcription completed successfully');
          return transcript;
        }

        if (transcript.status === 'error') {
          console.error('❌ Transcription failed with error:', transcript.error);
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

    throw new Error('Transcription timed out after maximum attempts');
  }

  /**
   * Format transcription result for our system
   */
  formatTranscriptionResult(transcript, processingTime) {
    console.log('📝 Formatting transcription result...');
    
    // Extract speaker information from utterances
    const speakers = this.extractSpeakerInfoFromUtterances(transcript.utterances || []);
    console.log(`👥 Extracted ${speakers.length} speakers:`, speakers.map(s => ({
      label: s.label,
      speakingTime: s.totalSpeakingTime,
      wordCount: s.totalWords
    })));

    const result = {
      // Basic transcription info (compatible with OpenAI Whisper format)
      text: transcript.text,
      language: transcript.language_code || 'en',
      confidence: transcript.confidence,
      duration: transcript.audio_duration / 1000, // Convert ms to seconds
      processingTime: processingTime,
      model: 'assemblyai-core',
      wordCount: transcript.text ? transcript.text.split(/\s+/).length : 0,

      // Speaker diarization info
      speakers: speakers,
      
      // Detailed utterances with speaker labels (converted to seconds)
      utterances: (transcript.utterances || []).map(utterance => ({
        speaker: utterance.speaker,
        text: utterance.text,
        confidence: utterance.confidence,
        start: utterance.start / 1000, // Convert ms to seconds
        end: utterance.end / 1000,
        words: (utterance.words || []).map(word => ({
          text: word.text,
          start: word.start / 1000,
          end: word.end / 1000,
          confidence: word.confidence,
          speaker: word.speaker
        }))
      })),

      // Word-level timestamps (converted to seconds)
      words: [],

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
        timestamp: new Date().toISOString(),
        transcriptId: transcript.id
      }
    };

    // Extract word-level data from utterances if not provided separately
    if (transcript.utterances && transcript.utterances.length > 0) {
      const allWords = [];
      transcript.utterances.forEach(utterance => {
        if (utterance.words) {
          utterance.words.forEach(word => {
            allWords.push({
              text: word.text,
              start: word.start / 1000,
              end: word.end / 1000,
              confidence: word.confidence,
              speaker: word.speaker
            });
          });
        }
      });
      result.words = allWords;
    }

    console.log('✅ Transcription result formatted successfully');
    return result;
  }

  /**
   * Extract speaker information from utterances
   */
  extractSpeakerInfoFromUtterances(utterances) {
    const speakerStats = {};

    // Process utterances to gather speaker statistics
    utterances.forEach(utterance => {
      const speaker = utterance.speaker;
      const duration = (utterance.end - utterance.start) / 1000; // Convert to seconds
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

    // Calculate averages
    const speakers = Object.values(speakerStats).map(speaker => {
      if (speaker.utteranceCount > 0) {
        speaker.averageConfidence = speaker.averageConfidence / speaker.utteranceCount;
        speaker.averageUtteranceLength = speaker.totalWords / speaker.utteranceCount;
      }

      return speaker;
    });

    return speakers.sort((a, b) => b.totalSpeakingTime - a.totalSpeakingTime);
  }

  /**
   * Test connection to AssemblyAI
   */
  async testConnection() {
    try {
      console.log('🔧 Testing AssemblyAI connection...');
      
      // Test by trying to get transcripts list
      const response = await axios.get(`${this.baseUrl}/v2/transcript`, {
        headers: {
          'authorization': process.env.ASSEMBLYAI_API_KEY
        }
      });
      
      console.log('✅ AssemblyAI connection test successful');
      return {
        success: true,
        status: response.status,
        transcripts_count: response.data.transcripts?.length || 0
      };
    } catch (error) {
      console.error('❌ AssemblyAI connection test failed:', error);
      return {
        success: false,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      };
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