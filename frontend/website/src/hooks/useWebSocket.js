'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import wsClient from '@/lib/websocket';
import { useAuth } from './useAuth';

/**
 * WebSocket Hook for Real-time Meeting Intelligence
 */
export function useWebSocket() {
  const { user } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [currentMeeting, setCurrentMeeting] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [actionItems, setActionItems] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [error, setError] = useState(null);

  // Auto-connect when user is authenticated
  useEffect(() => {
    if (user && connectionStatus === 'disconnected') {
      connect();
    }

    return () => {
      if (connectionStatus === 'connected') {
        disconnect();
      }
    };
  }, [user]);

  /**
   * Connect to WebSocket
   */
  const connect = useCallback(async () => {
    if (!user) {
      console.warn('Cannot connect: user not authenticated');
      return;
    }

    try {
      setConnectionStatus('connecting');
      setError(null);
      
      await wsClient.connect();
      setConnectionStatus('connected');

      // Setup event listeners
      wsClient.on('transcript_update', handleTranscriptUpdate);
      wsClient.on('action_item_detected', handleActionItemDetected);
      wsClient.on('speaker_detected', handleSpeakerDetected);
      wsClient.on('processing_status', handleProcessingStatus);
      wsClient.on('meeting_started', handleMeetingStarted);
      wsClient.on('meeting_ended', handleMeetingEnded);
      wsClient.on('error', handleError);
      wsClient.on('max_reconnect_reached', handleMaxReconnectReached);

    } catch (error) {
      console.error('WebSocket connection failed:', error);
      setConnectionStatus('error');
      setError(error.message);
    }
  }, [user]);

  /**
   * Disconnect from WebSocket
   */
  const disconnect = useCallback(() => {
    wsClient.disconnect();
    setConnectionStatus('disconnected');
    setCurrentMeeting(null);
    setLiveTranscript('');
    setActionItems([]);
    setSpeakers([]);
    setError(null);
  }, []);

  /**
   * Start real-time meeting
   */
  const startMeeting = useCallback(async (meetingData) => {
    try {
      const response = await wsClient.startMeeting(meetingData);
      setCurrentMeeting(response);
      setLiveTranscript('');
      setActionItems([]);
      setSpeakers([]);
      return response;
    } catch (error) {
      console.error('Failed to start meeting:', error);
      setError(error.message);
      throw error;
    }
  }, []);

  /**
   * End real-time meeting
   */
  const endMeeting = useCallback(async () => {
    try {
      const response = await wsClient.endMeeting();
      setCurrentMeeting(null);
      return response;
    } catch (error) {
      console.error('Failed to end meeting:', error);
      setError(error.message);
      throw error;
    }
  }, []);

  /**
   * Send audio chunk
   */
  const sendAudioChunk = useCallback((audioData, chunkIndex) => {
    wsClient.sendAudioChunk(audioData, chunkIndex);
  }, []);

  /**
   * Join meeting room for live updates
   */
  const joinMeetingRoom = useCallback((meetingId) => {
    wsClient.joinMeetingRoom(meetingId);
  }, []);

  /**
   * Leave meeting room
   */
  const leaveMeetingRoom = useCallback((meetingId) => {
    wsClient.leaveMeetingRoom(meetingId);
  }, []);

  /**
   * Send transcript correction
   */
  const sendCorrection = useCallback((correctionData) => {
    wsClient.sendCorrection(correctionData);
  }, []);

  // Event Handlers
  const handleTranscriptUpdate = useCallback((data) => {
    setLiveTranscript(prev => {
      // Append new transcript data
      if (data.isNew) {
        return prev + ' ' + data.content;
      } else {
        // Update existing segment
        return data.fullTranscript || prev;
      }
    });
  }, []);

  const handleActionItemDetected = useCallback((data) => {
    setActionItems(prev => {
      // Check if action item already exists
      const exists = prev.find(item => item.id === data.id);
      if (exists) {
        return prev.map(item => item.id === data.id ? data : item);
      } else {
        return [...prev, data];
      }
    });
  }, []);

  const handleSpeakerDetected = useCallback((data) => {
    setSpeakers(prev => {
      const exists = prev.find(speaker => speaker.id === data.id);
      if (exists) {
        return prev.map(speaker => speaker.id === data.id ? data : speaker);
      } else {
        return [...prev, data];
      }
    });
  }, []);

  const handleProcessingStatus = useCallback((data) => {
    console.log('Processing status:', data);
    // You can emit this to parent components if needed
  }, []);

  const handleMeetingStarted = useCallback((data) => {
    setCurrentMeeting(data);
    setLiveTranscript('');
    setActionItems([]);
    setSpeakers([]);
  }, []);

  const handleMeetingEnded = useCallback((data) => {
    setCurrentMeeting(null);
  }, []);

  const handleError = useCallback((error) => {
    console.error('WebSocket error:', error);
    setError(error.message || 'WebSocket error occurred');
  }, []);

  const handleMaxReconnectReached = useCallback(() => {
    setConnectionStatus('error');
    setError('Unable to maintain connection. Please refresh the page.');
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Get status info
   */
  const getStatus = useCallback(() => {
    return wsClient.getStatus();
  }, []);

  return {
    // Connection state
    connectionStatus,
    isConnected: connectionStatus === 'connected',
    error,
    
    // Meeting state
    currentMeeting,
    isRecording: !!currentMeeting,
    
    // Real-time data
    liveTranscript,
    actionItems,
    speakers,
    
    // Actions
    connect,
    disconnect,
    startMeeting,
    endMeeting,
    sendAudioChunk,
    joinMeetingRoom,
    leaveMeetingRoom,
    sendCorrection,
    clearError,
    getStatus,
  };
}

export default useWebSocket;