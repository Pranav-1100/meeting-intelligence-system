'use client';

import { 
  Clock, 
  Users, 
  CheckSquare, 
  Play, 
  MoreVertical,
  Calendar,
  Mic,
  Upload,
  Video,
  Phone
} from 'lucide-react';
import { formatDuration, formatRelativeTime, getStatusColor, detectMeetingPlatform } from '@/lib/utils';

export default function MeetingCard({ meeting, onClick, onAction }) {
  const {
    id,
    title,
    description,
    meeting_type,
    platform,
    status,
    processing_status,
    audio_duration,
    created_at,
    action_items_count,
    participants_count,
    metadata
  } = meeting;

  const getPlatformIcon = () => {
    switch (platform || detectMeetingPlatform(metadata?.external_meeting_id)) {
      case 'google-meet':
        return <Video className="h-4 w-4 text-green-600" />;
      case 'zoom':
        return <Video className="h-4 w-4 text-blue-600" />;
      case 'teams':
        return <Video className="h-4 w-4 text-purple-600" />;
      case 'phone':
        return <Phone className="h-4 w-4 text-gray-600" />;
      default:
        return <Mic className="h-4 w-4 text-gray-600" />;
    }
  };

  const getMeetingTypeIcon = () => {
    switch (meeting_type) {
      case 'realtime':
        return <Mic className="h-4 w-4 text-red-500" />;
      case 'uploaded':
        return <Upload className="h-4 w-4 text-blue-500" />;
      default:
        return <Calendar className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = () => {
    if (processing_status && processing_status !== 'completed') {
      const statusColors = {
        pending: 'bg-yellow-100 text-yellow-800',
        processing: 'bg-blue-100 text-blue-800',
        failed: 'bg-red-100 text-red-800'
      };
      
      return (
        <span className={`badge ${statusColors[processing_status] || 'bg-gray-100 text-gray-800'}`}>
          {processing_status.charAt(0).toUpperCase() + processing_status.slice(1)}
        </span>
      );
    }
    
    return (
      <span className={`badge ${getStatusColor(status)}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const handleCardClick = (e) => {
    // Don't trigger onClick if clicking on action buttons
    if (e.target.closest('[data-action]')) {
      return;
    }
    onClick?.(id);
  };

  const handleActionClick = (action, e) => {
    e.stopPropagation();
    onAction?.(action, meeting);
  };

  return (
    <div 
      className="card-hover bg-white border border-gray-200 rounded-lg p-4 cursor-pointer"
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            {getMeetingTypeIcon()}
            <h3 className="font-medium text-gray-900 truncate">
              {title || 'Untitled Meeting'}
            </h3>
          </div>
          
          {description && (
            <p className="text-sm text-gray-600 truncate-2">
              {description}
            </p>
          )}
        </div>
        
        <div className="flex items-center space-x-2 ml-4">
          {getStatusBadge()}
          
          <button
            data-action="menu"
            onClick={(e) => handleActionClick('menu', e)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center space-x-4 text-sm text-gray-500 mb-3">
        <div className="flex items-center space-x-1">
          <Clock className="h-4 w-4" />
          <span>{formatDuration(audio_duration)}</span>
        </div>
        
        {participants_count > 0 && (
          <div className="flex items-center space-x-1">
            <Users className="h-4 w-4" />
            <span>{participants_count} participant{participants_count !== 1 ? 's' : ''}</span>
          </div>
        )}
        
        {action_items_count > 0 && (
          <div className="flex items-center space-x-1">
            <CheckSquare className="h-4 w-4" />
            <span>{action_items_count} action item{action_items_count !== 1 ? 's' : ''}</span>
          </div>
        )}
        
        <div className="flex items-center space-x-1">
          {getPlatformIcon()}
          <span className="capitalize">
            {platform || detectMeetingPlatform(metadata?.external_meeting_id) || 'Audio'}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {formatRelativeTime(created_at)}
        </span>
        
        <div className="flex items-center space-x-2">
          {processing_status === 'completed' && (
            <button
              data-action="play"
              onClick={(e) => handleActionClick('play', e)}
              className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50"
            >
              <Play className="h-3 w-3" />
              <span>View</span>
            </button>
          )}
          
          {processing_status === 'processing' && (
            <div className="flex items-center space-x-1 text-xs text-blue-600">
              <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600"></div>
              <span>Processing...</span>
            </div>
          )}
          
          {processing_status === 'failed' && (
            <button
              data-action="retry"
              onClick={(e) => handleActionClick('retry', e)}
              className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {/* Progress bar for processing */}
      {processing_status === 'processing' && metadata?.processing_progress && (
        <div className="mt-3">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${metadata.processing_progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Processing... {metadata.processing_progress}%
          </p>
        </div>
      )}
    </div>
  );
}