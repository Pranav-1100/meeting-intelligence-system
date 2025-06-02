'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Upload, 
  File, 
  X, 
  Play, 
  Clock, 
  Users, 
  Calendar,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/toast-provider';
import Navigation from '@/components/layout/navigation';
import api from '@/lib/api';
import { 
  isAudioFile, 
  processAudioFile, 
  formatDuration, 
  formatFileSize,
  detectMeetingPlatform 
} from '@/lib/utils';

export default function MeetingUploadPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  // State
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [meetingData, setMeetingData] = useState({
    title: '',
    description: '',
    meeting_type: 'uploaded',
    platform: '',
    auto_process: true,
    participants: []
  });
  const [participants, setParticipants] = useState([{ name: '', email: '' }]);
  const [dragActive, setDragActive] = useState(false);

  // File upload handlers
  const handleFileSelect = useCallback(async (files) => {
    const validFiles = [];
    
    for (const file of files) {
      if (!isAudioFile(file)) {
        toast.error(`${file.name} is not a supported audio file format`);
        continue;
      }

      if (file.size > 100 * 1024 * 1024) { // 100MB limit
        toast.error(`${file.name} is too large. Maximum size is 100MB`);
        continue;
      }

      try {
        const processedFile = await processAudioFile(file);
        validFiles.push(processedFile);
      } catch (error) {
        console.error('Error processing file:', error);
        toast.error(`Failed to process ${file.name}`);
      }
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
      
      // Auto-fill title if empty and only one file
      if (!meetingData.title && validFiles.length === 1) {
        const fileName = validFiles[0].name.replace(/\.[^/.]+$/, '');
        setMeetingData(prev => ({ ...prev, title: fileName }));
      }
    }
  }, [meetingData.title, toast]);

  const handleFileInputChange = (e) => {
    if (e.target.files) {
      handleFileSelect(Array.from(e.target.files));
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files) {
      handleFileSelect(Array.from(e.dataTransfer.files));
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Meeting data handlers
  const handleMeetingDataChange = (field, value) => {
    setMeetingData(prev => ({ ...prev, [field]: value }));
  };

  const addParticipant = () => {
    setParticipants(prev => [...prev, { name: '', email: '' }]);
  };

  const updateParticipant = (index, field, value) => {
    setParticipants(prev => 
      prev.map((p, i) => i === index ? { ...p, [field]: value } : p)
    );
  };

  const removeParticipant = (index) => {
    if (participants.length > 1) {
      setParticipants(prev => prev.filter((_, i) => i !== index));
    }
  };

  // Upload handler
  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select at least one audio file');
      return;
    }

    if (!meetingData.title.trim()) {
      toast.error('Please enter a meeting title');
      return;
    }

    setUploading(true);

    try {
      const uploadPromises = selectedFiles.map(async (fileData, index) => {
        const formData = new FormData();
        formData.append('audio', fileData.file);
        formData.append('title', selectedFiles.length > 1 
          ? `${meetingData.title} - Part ${index + 1}` 
          : meetingData.title
        );
        formData.append('description', meetingData.description);
        formData.append('meeting_type', meetingData.meeting_type);
        formData.append('platform', meetingData.platform);
        formData.append('auto_process', meetingData.auto_process);
        
        // Add participants
        const validParticipants = participants.filter(p => p.name.trim() || p.email.trim());
        if (validParticipants.length > 0) {
          formData.append('participants', JSON.stringify(validParticipants));
        }

        // Track upload progress
        const uploadId = `upload-${index}`;
        setUploadProgress(prev => ({ ...prev, [uploadId]: 0 }));

        try {
          const response = await api.uploadAudio(formData);
          setUploadProgress(prev => ({ ...prev, [uploadId]: 100 }));
          return response;
        } catch (error) {
          setUploadProgress(prev => ({ ...prev, [uploadId]: -1 }));
          throw error;
        }
      });

      const results = await Promise.allSettled(uploadPromises);
      
      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      if (successful.length > 0) {
        toast.success(`Successfully uploaded ${successful.length} meeting${successful.length > 1 ? 's' : ''}`);
        
        // Redirect to dashboard or meeting details
        if (successful.length === 1) {
          router.push(`/meetings/${successful[0].value.meeting.id}`);
        } else {
          router.push('/dashboard');
        }
      }

      if (failed.length > 0) {
        toast.error(`Failed to upload ${failed.length} file${failed.length > 1 ? 's' : ''}`);
      }

    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Upload Meeting</h1>
          <p className="mt-1 text-sm text-gray-600">
            Upload audio files to process with AI-powered transcription and analysis
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* File Upload Section */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Drag and Drop Zone */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Audio Files</h2>
              
              <div
                className={`file-upload-zone ${dragActive ? 'dragover' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <div className="mt-4">
                  <p className="text-lg font-medium text-gray-900">
                    Drop audio files here or click to browse
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    Supports MP3, WAV, M4A, MP4, WebM files up to 100MB each
                  </p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="audio/*,video/mp4,video/webm"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>

            {/* Selected Files */}
            {selectedFiles.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Selected Files ({selectedFiles.length})
                </h3>
                
                <div className="space-y-4">
                  {selectedFiles.map((fileData, index) => (
                    <div key={index} className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg">
                      <div className="flex-shrink-0">
                        <File className="h-8 w-8 text-blue-600" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {fileData.name}
                        </p>
                        <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                          <span>{fileData.formattedSize}</span>
                          <span className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {fileData.formattedDuration}
                          </span>
                        </div>
                      </div>

                      {/* Upload Progress */}
                      {uploading && uploadProgress[`upload-${index}`] !== undefined && (
                        <div className="flex items-center space-x-2">
                          {uploadProgress[`upload-${index}`] === -1 ? (
                            <AlertCircle className="h-4 w-4 text-red-500" />
                          ) : uploadProgress[`upload-${index}`] === 100 ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <div className="w-8 text-xs text-gray-500">
                              {uploadProgress[`upload-${index}`]}%
                            </div>
                          )}
                        </div>
                      )}
                      
                      <button
                        onClick={() => removeFile(index)}
                        disabled={uploading}
                        className="flex-shrink-0 text-gray-400 hover:text-red-500 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Meeting Details Sidebar */}
          <div className="space-y-6">
            
            {/* Meeting Information */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Meeting Details</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Meeting Title *
                  </label>
                  <input
                    type="text"
                    value={meetingData.title}
                    onChange={(e) => handleMeetingDataChange('title', e.target.value)}
                    placeholder="Enter meeting title"
                    className="input-primary"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={meetingData.description}
                    onChange={(e) => handleMeetingDataChange('description', e.target.value)}
                    placeholder="Optional meeting description"
                    rows={3}
                    className="input-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Meeting Platform
                  </label>
                  <select
                    value={meetingData.platform}
                    onChange={(e) => handleMeetingDataChange('platform', e.target.value)}
                    className="input-primary"
                  >
                    <option value="">Select platform (optional)</option>
                    <option value="google-meet">Google Meet</option>
                    <option value="zoom">Zoom</option>
                    <option value="teams">Microsoft Teams</option>
                    <option value="webex">Webex</option>
                    <option value="phone">Phone Call</option>
                    <option value="in-person">In Person</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="auto_process"
                    checked={meetingData.auto_process}
                    onChange={(e) => handleMeetingDataChange('auto_process', e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="auto_process" className="ml-2 text-sm text-gray-700">
                    Start processing automatically
                  </label>
                </div>
              </div>
            </div>

            {/* Participants */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Participants</h3>
                <button
                  onClick={addParticipant}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </button>
              </div>

              <div className="space-y-3">
                {participants.map((participant, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={participant.name}
                        onChange={(e) => updateParticipant(index, 'name', e.target.value)}
                        placeholder="Name"
                        className="input-primary text-sm"
                      />
                      <input
                        type="email"
                        value={participant.email}
                        onChange={(e) => updateParticipant(index, 'email', e.target.value)}
                        placeholder="Email"
                        className="input-primary text-sm"
                      />
                    </div>
                    {participants.length > 1 && (
                      <button
                        onClick={() => removeParticipant(index)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-500 mt-2">
                Add participants to help with speaker identification
              </p>
            </div>

            {/* Upload Summary */}
            {selectedFiles.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Summary</h3>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Files:</span>
                    <span className="font-medium">{selectedFiles.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total size:</span>
                    <span className="font-medium">
                      {formatFileSize(selectedFiles.reduce((sum, f) => sum + f.size, 0))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total duration:</span>
                    <span className="font-medium">
                      {formatDuration(selectedFiles.reduce((sum, f) => sum + f.duration, 0))}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleUpload}
                  disabled={uploading || selectedFiles.length === 0 || !meetingData.title.trim()}
                  className="btn-primary w-full mt-4 flex items-center justify-center"
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload & Process
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}