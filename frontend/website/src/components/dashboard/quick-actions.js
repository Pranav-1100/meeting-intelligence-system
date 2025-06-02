'use client';

import { useState } from 'react';
import { 
  Mic, 
  MicOff, 
  Upload, 
  Calendar, 
  Play, 
  Square, 
  Wifi, 
  WifiOff,
  AlertCircle
} from 'lucide-react';

export default function QuickActions({ 
  onStartRecording, 
  onStopRecording, 
  onUpload, 
  isRecording = false, 
  isConnected = false 
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const handleStartRecording = async () => {
    if (!isConnected) {
      return;
    }

    setIsStarting(true);
    try {
      await onStartRecording();
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopRecording = async () => {
    setIsStopping(true);
    try {
      await onStopRecording();
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
      
      {/* Connection Status */}
      <div className="mb-6 p-4 rounded-lg bg-gray-50 border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {isConnected ? (
              <Wifi className="h-5 w-5 text-green-500" />
            ) : (
              <WifiOff className="h-5 w-5 text-red-500" />
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">
                {isConnected ? 'Real-time Processing Ready' : 'Connection Required'}
              </p>
              <p className="text-xs text-gray-500">
                {isConnected 
                  ? 'WebSocket connection established' 
                  : 'Connect to enable live transcription'
                }
              </p>
            </div>
          </div>
          
          {isRecording && (
            <div className="flex items-center space-x-2 text-red-600">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium">RECORDING</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Start/Stop Recording */}
        {!isRecording ? (
          <button
            onClick={handleStartRecording}
            disabled={!isConnected || isStarting}
            className={`
              flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed transition-all
              ${isConnected && !isStarting
                ? 'border-green-300 bg-green-50 hover:bg-green-100 text-green-700'
                : 'border-gray-300 bg-gray-50 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            {isStarting ? (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            ) : (
              <Mic className="h-8 w-8 mb-2" />
            )}
            <span className="font-medium text-sm">
              {isStarting ? 'Starting...' : 'Start Recording'}
            </span>
            <span className="text-xs text-center mt-1">
              {!isConnected 
                ? 'Connection required' 
                : 'Begin live meeting capture'
              }
            </span>
          </button>
        ) : (
          <button
            onClick={handleStopRecording}
            disabled={isStopping}
            className="flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed border-red-300 bg-red-50 hover:bg-red-100 text-red-700 transition-all"
          >
            {isStopping ? (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            ) : (
              <Square className="h-8 w-8 mb-2" />
            )}
            <span className="font-medium text-sm">
              {isStopping ? 'Stopping...' : 'Stop Recording'}
            </span>
            <span className="text-xs text-center mt-1">
              End capture and process
            </span>
          </button>
        )}

        {/* Upload Audio */}
        <button
          onClick={onUpload}
          className="flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 transition-all"
        >
          <Upload className="h-8 w-8 mb-2" />
          <span className="font-medium text-sm">Upload Audio</span>
          <span className="text-xs text-center mt-1">
            Process existing recording
          </span>
        </button>

        {/* Schedule Meeting */}
        <button
          onClick={() => {
            // TODO: Implement meeting scheduling
            console.log('Schedule meeting clicked');
          }}
          className="flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-700 transition-all"
        >
          <Calendar className="h-8 w-8 mb-2" />
          <span className="font-medium text-sm">Schedule Meeting</span>
          <span className="text-xs text-center mt-1">
            Plan upcoming sessions
          </span>
        </button>
      </div>

      {/* Recording Instructions */}
      {!isRecording && isConnected && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start space-x-3">
            <Play className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-blue-900 mb-1">
                Ready for Live Recording
              </h4>
              <p className="text-xs text-blue-700">
                Click "Start Recording" to begin capturing audio from your current tab. 
                The system will automatically transcribe speech and identify action items in real-time.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Connection Warning */}
      {!isConnected && (
        <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-amber-900 mb-1">
                Connection Required
              </h4>
              <p className="text-xs text-amber-700">
                Real-time features require a WebSocket connection. 
                Please refresh the page or check your internet connection.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recording Status */}
      {isRecording && (
        <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <div>
                <h4 className="text-sm font-medium text-red-900">
                  Recording in Progress
                </h4>
                <p className="text-xs text-red-700">
                  Audio is being captured and processed in real-time
                </p>
              </div>
            </div>
            <button
              onClick={handleStopRecording}
              disabled={isStopping}
              className="btn-secondary text-xs px-3 py-1"
            >
              {isStopping ? 'Stopping...' : 'Stop'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}