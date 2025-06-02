'use client';

import { useState, useEffect } from 'react';
import { 
  Clock, 
  CheckSquare, 
  Upload, 
  Mic, 
  Users, 
  Calendar,
  AlertCircle,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import api from '@/lib/api';
import { useToast } from '@/components/ui/toast-provider';

export default function RecentActivity() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadRecentActivity();
  }, []);

  const loadRecentActivity = async () => {
    try {
      setLoading(true);
      
      console.log('Loading recent activity from API...');
      
      // Get recent meetings from API
      let meetingActivities = [];
      try {
        const meetingsResponse = await api.getMeetings({
          page: 1,
          limit: 10,
          sortBy: 'created_at',
          sortOrder: 'DESC'
        });
        
        console.log('✅ Recent meetings loaded:', meetingsResponse);
        
        // Convert meetings to activity format
        meetingActivities = (meetingsResponse.meetings || []).slice(0, 5).map(meeting => ({
          id: `meeting-${meeting.id}`,
          type: 'meeting',
          title: meeting.title || 'Untitled Meeting',
          description: `${meeting.meeting_type} meeting ${meeting.processing_status}`,
          timestamp: meeting.created_at,
          metadata: {
            status: meeting.processing_status,
            duration: meeting.audio_duration,
            participants: meeting.participants_count || 0,
            platform: meeting.platform
          }
        }));
        
      } catch (error) {
        console.error('Failed to load meetings for activity:', error);
      }

      // Get recent action items from the meetings
      let actionItemActivities = [];
      try {
        // Get action items from the first few meetings
        const actionItemPromises = meetingActivities.slice(0, 3).map(async (activity) => {
          try {
            const meetingId = activity.id.replace('meeting-', '');
            const actionItemsResponse = await api.getActionItems(meetingId);
            
            return (actionItemsResponse.actionItems || []).slice(0, 2).map(item => ({
              id: `action-${item.id}`,
              type: 'action_item',
              title: item.title || item.description || 'Action Item',
              description: `Action item ${item.status === 'completed' ? 'completed' : 'created'}`,
              timestamp: item.created_at || item.updated_at || activity.timestamp,
              metadata: {
                status: item.status,
                priority: item.priority,
                assignee: item.assignee_name,
                meetingTitle: activity.title
              }
            }));
          } catch (error) {
            console.warn('Failed to load action items for meeting:', error);
            return [];
          }
        });

        const actionItemArrays = await Promise.all(actionItemPromises);
        actionItemActivities = actionItemArrays.flat();
        
      } catch (error) {
        console.error('Failed to load action items for activity:', error);
      }

      // Combine and sort all activities
      const allActivities = [...meetingActivities, ...actionItemActivities]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 8);

      console.log('✅ Recent activity loaded:', allActivities);
      setActivities(allActivities);
      
      if (allActivities.length === 0) {
        // Fallback to mock data if no real data available
        setActivities(getMockActivities());
      }
      
    } catch (error) {
      console.error('Failed to load recent activity:', error);
      
      // Fallback to mock data
      setActivities(getMockActivities());
    } finally {
      setLoading(false);
    }
  };

  const refreshActivity = async () => {
    setRefreshing(true);
    try {
      await loadRecentActivity();
      toast.success('Activity refreshed');
    } catch (error) {
      toast.error('Failed to refresh activity');
    } finally {
      setRefreshing(false);
    }
  };

  const getMockActivities = () => [
    {
      id: 'mock-1',
      type: 'meeting',
      title: 'No recent meetings found',
      description: 'Upload or record your first meeting',
      timestamp: new Date().toISOString(),
      metadata: { status: 'pending', duration: 0, participants: 0 }
    }
  ];

  const getActivityIcon = (type, metadata) => {
    switch (type) {
      case 'meeting':
        return metadata?.status === 'processing' ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        ) : (
          <Calendar className="h-4 w-4 text-blue-600" />
        );
      case 'action_item':
        return metadata?.status === 'completed' ? (
          <CheckSquare className="h-4 w-4 text-green-600" />
        ) : (
          <AlertCircle className="h-4 w-4 text-yellow-600" />
        );
      case 'upload':
        return <Upload className="h-4 w-4 text-purple-600" />;
      case 'recording':
        return <Mic className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActivityColor = (type, metadata) => {
    switch (type) {
      case 'meeting':
        return metadata?.status === 'failed' ? 'border-red-200' : 'border-blue-200';
      case 'action_item':
        return metadata?.status === 'completed' ? 'border-green-200' : 
               metadata?.priority === 'high' ? 'border-red-200' : 'border-yellow-200';
      default:
        return 'border-gray-200';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          <button
            onClick={refreshActivity}
            disabled={refreshing}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title="Refresh activity"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center space-x-3">
                <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : activities.length > 0 ? (
          <div className="space-y-4">
            {activities.map((activity) => (
              <div 
                key={activity.id}
                className={`flex items-start space-x-3 p-3 rounded-lg border ${getActivityColor(activity.type, activity.metadata)} bg-gray-50 hover:bg-gray-100 transition-colors`}
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                  {getActivityIcon(activity.type, activity.metadata)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-900 truncate">
                      {activity.title}
                    </h4>
                    <span className="text-xs text-gray-500 ml-2">
                      {formatRelativeTime(activity.timestamp)}
                    </span>
                  </div>
                  
                  <p className="text-xs text-gray-600 mt-1">
                    {activity.description}
                  </p>
                  
                  {/* Activity-specific metadata */}
                  {activity.type === 'meeting' && activity.metadata && (
                    <div className="flex items-center space-x-3 mt-2 text-xs text-gray-500">
                      {activity.metadata.duration > 0 && (
                        <span>{Math.round(activity.metadata.duration / 60)} min</span>
                      )}
                      {activity.metadata.participants > 0 && (
                        <span>{activity.metadata.participants} participants</span>
                      )}
                      {activity.metadata.status && (
                        <span className={`badge-${
                          activity.metadata.status === 'completed' ? 'success' : 
                          activity.metadata.status === 'failed' ? 'error' : 'info'
                        }`}>
                          {activity.metadata.status}
                        </span>
                      )}
                      {activity.metadata.platform && (
                        <span>{activity.metadata.platform}</span>
                      )}
                    </div>
                  )}
                  
                  {activity.type === 'action_item' && activity.metadata && (
                    <div className="flex items-center space-x-3 mt-2 text-xs text-gray-500">
                      {activity.metadata.assignee && (
                        <span>@{activity.metadata.assignee}</span>
                      )}
                      {activity.metadata.priority && (
                        <span className={`badge-${
                          activity.metadata.priority === 'high' ? 'error' : 
                          activity.metadata.priority === 'medium' ? 'warning' : 'neutral'
                        }`}>
                          {activity.metadata.priority}
                        </span>
                      )}
                      {activity.metadata.meetingTitle && (
                        <span>from &quot;{activity.metadata.meetingTitle}&quot;</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <TrendingUp className="mx-auto h-8 w-8 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No recent activity</h3>
            <p className="mt-1 text-sm text-gray-500">
              Start recording or upload a meeting to see activity here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}