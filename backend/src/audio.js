const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

class AudioUtils {
  constructor() {
    this.supportedFormats = ['.mp3', '.wav', '.m4a', '.mp4', '.webm', '.ogg', '.flac'];
    this.maxFileSize = 100 * 1024 * 1024; // 100MB
    this.maxDuration = 4 * 60 * 60; // 4 hours in seconds
  }

  /**
   * Validate audio file
   */
  validateAudioFile(filePath) {
    const errors = [];

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      errors.push('Audio file does not exist');
      return { isValid: false, errors };
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!this.supportedFormats.includes(ext)) {
      errors.push(`Unsupported file format: ${ext}. Supported formats: ${this.supportedFormats.join(', ')}`);
    }

    // Check file size
    const stats = fs.statSync(filePath);
    if (stats.size > this.maxFileSize) {
      errors.push(`File too large: ${Math.round(stats.size / 1024 / 1024)}MB. Maximum size: ${Math.round(this.maxFileSize / 1024 / 1024)}MB`);
    }

    if (stats.size === 0) {
      errors.push('Audio file is empty');
    }

    return {
      isValid: errors.length === 0,
      errors,
      fileSize: stats.size,
      fileExtension: ext
    };
  }

  /**
   * Get audio file metadata
   */
  async getAudioMetadata(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
        
        if (!audioStream) {
          reject(new Error('No audio stream found in file'));
          return;
        }

        const result = {
          duration: parseFloat(metadata.format.duration) || 0,
          bitrate: parseInt(metadata.format.bit_rate) || 0,
          size: parseInt(metadata.format.size) || 0,
          format: metadata.format.format_name,
          codec: audioStream.codec_name,
          sampleRate: parseInt(audioStream.sample_rate) || 0,
          channels: parseInt(audioStream.channels) || 0,
          channelLayout: audioStream.channel_layout || 'unknown'
        };

        // Validate duration
        if (result.duration > this.maxDuration) {
          reject(new Error(`Audio too long: ${Math.round(result.duration / 60)} minutes. Maximum: ${Math.round(this.maxDuration / 60)} minutes`));
          return;
        }

        resolve(result);
      });
    });
  }

  /**
   * Convert audio to optimal format for processing
   */
  async convertToOptimalFormat(inputPath, outputPath = null) {
    if (!outputPath) {
      const ext = path.extname(inputPath);
      outputPath = inputPath.replace(ext, '_converted.wav');
    }

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioChannels(1) // Mono for better speech recognition
        .audioFrequency(16000) // 16kHz sample rate
        .audioCodec('pcm_s16le') // 16-bit PCM
        .format('wav')
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new Error(`Audio conversion failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * Split audio into chunks for processing
   */
  async splitAudioIntoChunks(inputPath, chunkDurationSeconds = 90, outputDir = null) {
    if (!outputDir) {
      outputDir = path.join(path.dirname(inputPath), 'chunks');
    }

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get audio metadata first
    const metadata = await this.getAudioMetadata(inputPath);
    const totalDuration = metadata.duration;
    const numberOfChunks = Math.ceil(totalDuration / chunkDurationSeconds);

    const chunks = [];

    for (let i = 0; i < numberOfChunks; i++) {
      const startTime = i * chunkDurationSeconds;
      const outputFile = path.join(outputDir, `chunk_${i.toString().padStart(3, '0')}.wav`);

      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .seekInput(startTime)
          .duration(chunkDurationSeconds)
          .audioChannels(1)
          .audioFrequency(16000)
          .audioCodec('pcm_s16le')
          .format('wav')
          .on('end', resolve)
          .on('error', reject)
          .save(outputFile);
      });

      chunks.push({
        index: i,
        filePath: outputFile,
        startTime: startTime,
        endTime: Math.min(startTime + chunkDurationSeconds, totalDuration),
        duration: Math.min(chunkDurationSeconds, totalDuration - startTime)
      });
    }

    return {
      chunks,
      totalChunks: numberOfChunks,
      totalDuration,
      outputDir
    };
  }

  /**
   * Normalize audio volume
   */
  async normalizeAudio(inputPath, outputPath = null) {
    if (!outputPath) {
      const ext = path.extname(inputPath);
      outputPath = inputPath.replace(ext, '_normalized' + ext);
    }

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters('loudnorm')
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  /**
   * Remove noise from audio
   */
  async removeNoise(inputPath, outputPath = null) {
    if (!outputPath) {
      const ext = path.extname(inputPath);
      outputPath = inputPath.replace(ext, '_denoised' + ext);
    }

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters([
          'highpass=f=200', // Remove low frequency noise
          'lowpass=f=3000'   // Remove high frequency noise
        ])
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  /**
   * Merge audio chunks back together
   */
  async mergeAudioChunks(chunkPaths, outputPath) {
    return new Promise((resolve, reject) => {
      let command = ffmpeg();

      // Add all chunk files as inputs
      chunkPaths.forEach(chunkPath => {
        command = command.addInput(chunkPath);
      });

      command
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .mergeToFile(outputPath);
    });
  }

  /**
   * Extract audio from video file
   */
  async extractAudioFromVideo(videoPath, audioPath = null) {
    if (!audioPath) {
      const videoExt = path.extname(videoPath);
      audioPath = videoPath.replace(videoExt, '.wav');
    }

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec('pcm_s16le')
        .format('wav')
        .on('end', () => resolve(audioPath))
        .on('error', reject)
        .save(audioPath);
    });
  }

  /**
   * Calculate audio fingerprint for duplicate detection
   */
  async generateAudioFingerprint(filePath) {
    try {
      const metadata = await this.getAudioMetadata(filePath);
      const stats = fs.statSync(filePath);
      
      // Simple fingerprint based on file characteristics
      const fingerprint = {
        duration: Math.round(metadata.duration),
        size: stats.size,
        sampleRate: metadata.sampleRate,
        channels: metadata.channels,
        // Hash of first and last 1000 bytes
        contentHash: this.generateContentHash(filePath)
      };

      return JSON.stringify(fingerprint);
    } catch (error) {
      throw new Error(`Failed to generate audio fingerprint: ${error.message}`);
    }
  }

  /**
   * Generate content hash for file
   */
  generateContentHash(filePath) {
    const crypto = require('crypto');
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    // Read first and last 1KB for hash
    const fd = fs.openSync(filePath, 'r');
    const firstChunk = Buffer.alloc(Math.min(1024, fileSize));
    const lastChunk = Buffer.alloc(Math.min(1024, fileSize));
    
    fs.readSync(fd, firstChunk, 0, firstChunk.length, 0);
    if (fileSize > 1024) {
      fs.readSync(fd, lastChunk, 0, lastChunk.length, fileSize - lastChunk.length);
    }
    
    fs.closeSync(fd);
    
    const hash = crypto.createHash('sha256');
    hash.update(firstChunk);
    hash.update(lastChunk);
    hash.update(fileSize.toString());
    
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Clean up temporary audio files
   */
  cleanupTempFiles(filePaths) {
    const cleaned = [];
    const failed = [];

    filePaths.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          cleaned.push(filePath);
        }
      } catch (error) {
        failed.push({ filePath, error: error.message });
      }
    });

    return { cleaned, failed };
  }

  /**
   * Get supported audio formats
   */
  getSupportedFormats() {
    return [...this.supportedFormats];
  }

  /**
   * Check if file format is supported
   */
  isFormatSupported(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedFormats.includes(ext);
  }

  /**
   * Estimate processing time based on file duration
   */
  estimateProcessingTime(durationSeconds) {
    // Rough estimates based on typical processing speeds
    const transcriptionTime = durationSeconds * 0.3; // ~30% of audio duration
    const diarizationTime = durationSeconds * 0.5;   // ~50% of audio duration
    const analysisTime = 30;                         // ~30 seconds for analysis

    return {
      transcription: Math.ceil(transcriptionTime),
      diarization: Math.ceil(diarizationTime),
      analysis: analysisTime,
      total: Math.ceil(transcriptionTime + diarizationTime + analysisTime)
    };
  }

  /**
   * Calculate approximate API costs
   */
  calculateEstimatedCosts(durationMinutes) {
    const whisperCost = durationMinutes * 0.006; // $0.006 per minute
    const assemblyAICost = (durationMinutes / 60) * 0.37; // $0.37 per hour
    const gptAnalysisCost = 0.15; // Rough estimate for analysis

    return {
      whisper: Number(whisperCost.toFixed(4)),
      assemblyai: Number(assemblyAICost.toFixed(4)),
      analysis: gptAnalysisCost,
      total: Number((whisperCost + assemblyAICost + gptAnalysisCost).toFixed(4))
    };
  }
}

module.exports = new AudioUtils();