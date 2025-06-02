'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Copy, 
  Download,
  Maximize2,
  Minimize2,
  CheckSquare,
  Clock,
  Users
} from 'lucide-react';
import { useToast } from '@/components/ui/toast-provider';
import { copyToClipboard, formatDuration } from '@/lib/utils';

export default function RealtimeTranscript({ 
  isRecording = false,
  transcript = '',
  actionItems = [],
  speakers = [],
  meetingId,
  onClose 
}) {
  const { toast } = useToast();
  const transcriptRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  // Update elapsed time
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording, startTime]);

  // Auto-scroll to bottom when new transcript arrives
  useEffect(() => {
    if (autoScroll && transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, autoScroll]);

  const handleCopyTranscript = async () => {
    if (transcript.trim()) {
      const success = await copyToClipboard(transcript);
      if (success) {
        toast.success('Transcript copied to clipboard');
      } else {
        toast.error('Failed to copy transcript');
      }
    }
  };

  const handleDownloadTranscript = () => {
    if (!transcript.trim()) {
      toast.warning('No transcript content to download');
      return;
    }

    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-transcript-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Transcript downloaded');
  };

  const handleScroll = () => {
    if (transcriptRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = transcriptRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
      setAutoScroll(isAtBottom);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-lg border border-gray-200 ${
      isExpanded ? 'fixed inset-4 z-50' : 'relative'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            {isRecording ? (
              <>
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <Mic className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-600">Live Recording</span>
              </>
            ) : (
              <>
                <MicOff className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">Recording Ended</span>
              </>
            )}
          </div>
          
          {isRecording && (
            <div className="text-xs text-gray-500">
              {formatDuration(elapsedTime / 1000)}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Stats */}
          <div className="flex items-center space-x-4 text-xs text-gray-500 mr-4">
            {speakers.length > 0 && (
              <div className="flex items-center space-x-1">
                <Users className="h-3 w-3" />
                <span>{speakers.length} speaker{speakers.length !== 1 ? 's' : ''}</span>
              </div>
            )}
            
            {actionItems.length > 0 && (
              <div className="flex items-center space-x-1">
                <CheckSquare className="h-3 w-3" />
                <span>{actionItems.length} action{actionItems.length !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <button
            onClick={handleCopyTranscript}
            disabled={!transcript.trim()}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            title="Copy transcript"
          >
            <Copy className="h-4 w-4" />
          </button>

          <button
            onClick={handleDownloadTranscript}
            disabled={!transcript.trim()}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            title="Download transcript"
          >
            <Download className="h-4 w-4" />
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-gray-400 hover:text-gray-600"
            title={isExpanded ? 'Minimize' : 'Expand'}
          >
            {isExpanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={`flex flex-col ${isExpanded ? 'h-full' : 'h-96'}`}>
        {/* Transcript */}
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">Live Transcript</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`text-xs px-2 py-1 rounded ${
                  autoScroll 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                Auto-scroll {autoScroll ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          <div 
            ref={transcriptRef}
            onScroll={handleScroll}
            className="h-full border border-gray-200 rounded-lg p-3 bg-gray-50 overflow-y-auto custom-scrollbar transcript-content"
          >
            {transcript ? (
              <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                {transcript}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <Mic className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">
                    {isRecording 
                      ? 'Listening for speech...' 
                      : 'No transcript available'
                    }
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Items */}
        {actionItems.length > 0 && (
          <div className="border-t border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Live Action Items ({actionItems.length})
            </h3>
            <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
              {actionItems.map((item, index) => (
                <div 
                  key={item.id || index}
                  className="action-item text-sm"
                >
                  <div className="flex items-start space-x-2">
                    <CheckSquare className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-gray-900">{item.title || item.description}</p>
                      {item.assignee_name && (
                        <p className="text-xs text-gray-500 mt-1">
                          Assigned to: {item.assignee_name}
                        </p>
                      )}
                      {item.confidence_score && (
                        <p className="text-xs text-gray-400 mt-1">
                          Confidence: {Math.round(item.confidence_score * 100)}%
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Speaker Information */}
        {speakers.length > 0 && (
          <div className="border-t border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Detected Speakers ({speakers.length})
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {speakers.map((speaker, index) => (
                <div 
                  key={speaker.id || index}
                  className="bg-gray-50 rounded-lg p-2"
                >
                  <p className="text-xs font-medium text-gray-900">
                    {speaker.identified_name || speaker.label || `Speaker ${index + 1}`}
                  </p>
                  {speaker.speaking_time && (
                    <p className="text-xs text-gray-500">
                      {formatDuration(speaker.speaking_time)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recording status footer */}
      {isRecording && (
        <div className="border-t border-gray-200 p-3 bg-red-50">
          <div className="flex items-center justify-center space-x-2 text-sm text-red-700">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span>Recording in progress - transcript updates automatically</span>
          </div>
        </div>
      )}
    </div>
  );
}