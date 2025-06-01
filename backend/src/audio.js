const fs = require('fs');
const path = require('path');

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
   * Get audio file metadata (fallback version without ffprobe)
   */
  async getAudioMetadata(filePath) {
    try {
      // First try with ffprobe if available
      if (this.isFFmpegAvailable()) {
        return await this.getAudioMetadataWithFFprobe(filePath);
      } else {
        // Fallback: estimate metadata from file
        return await this.getAudioMetadataFallback(filePath);
      }
    } catch (error) {
      console.warn('Failed to get audio metadata:', error.message);
      // Return fallback metadata
      return await this.getAudioMetadataFallback(filePath);
    }
  }

  /**
   * Check if FFmpeg is available
   */
  isFFmpegAvailable() {
    try {
      const { execSync } = require('child_process');
      execSync('ffprobe -version', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get metadata using ffprobe (when available)
   */
  async getAudioMetadataWithFFprobe(filePath) {
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegStatic = require('ffmpeg-static');
    
    // Set FFmpeg path if available
    if (ffmpegStatic) {
      ffmpeg.setFfmpegPath(ffmpegStatic);
    }

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
   * Fallback metadata extraction (estimates based on file info)
   */
  async getAudioMetadataFallback(filePath) {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    // Rough estimates based on common audio formats
    const bitrateEstimates = {
      '.mp3': 128000,  // 128 kbps
      '.wav': 1411200, // 44.1kHz 16-bit stereo
      '.m4a': 128000,  // 128 kbps
      '.mp4': 128000,  // 128 kbps
      '.ogg': 128000,  // 128 kbps
      '.flac': 1000000 // ~1 Mbps
    };

    const estimatedBitrate = bitrateEstimates[ext] || 128000;
    const estimatedDuration = Math.max(10, (stats.size * 8) / estimatedBitrate); // Minimum 10 seconds

    console.log(`📊 Using fallback metadata estimation for ${ext} file`);

    return {
      duration: estimatedDuration,
      bitrate: estimatedBitrate,
      size: stats.size,
      format: ext.substring(1), // Remove the dot
      codec: 'unknown',
      sampleRate: 44100, // Common sample rate
      channels: 2, // Assume stereo
      channelLayout: 'stereo',
      _estimated: true // Flag to indicate this is estimated
    };
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
   * Generate content hash for file (for duplicate detection)
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
   * Simple audio conversion (requires ffmpeg)
   */
  async convertToOptimalFormat(inputPath, outputPath = null) {
    if (!this.isFFmpegAvailable()) {
      console.warn('FFmpeg not available, skipping audio conversion');
      return inputPath; // Return original file
    }

    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegStatic = require('ffmpeg-static');
    
    if (ffmpegStatic) {
      ffmpeg.setFfmpegPath(ffmpegStatic);
    }

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
          console.error('Audio conversion failed:', err.message);
          resolve(inputPath); // Return original file if conversion fails
        })
        .save(outputPath);
    });
  }
}

module.exports = new AudioUtils();