'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Upload, 
  Mic, 
  Clock, 
  CheckSquare, 
  Users, 
  TrendingUp,
  Play,
  Calendar,
  Settings,
  Plus,
  Search,
  Filter,
  MoreVertical
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useToast } from '@/components/ui/toast-provider';
import api from '@/lib/api';
import { formatDuration, formatRelativeTime, formatDate } from '@/lib/utils';

import Navigation from '@/components/layout/navigation';
import MeetingCard from '@/components/meetings/meeting-card';
import RealtimeTranscript from '@/components/realtime/realtime-transcript';
import StatsCard from '@/components/dashboard/stats-card';
import QuickActions from '@/components/dashboard/quick-actions';
import RecentActivity from '@/components/dashboard/recent-activity';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { 
    isConnected, 
    isRecording, 
    currentMeeting, 
    liveTranscript, 
    actionItems,
    startMeeting,
    endMeeting,
    error: wsError 
  } = useWebSocket();
  const { toast } = useToast();

  // State
  const [meetings, setMeetings] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [showRealtimePanel, setShowRealtimePanel] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Load dashboard data
  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  // Show WebSocket errors
  useEffect(() => {
    if (wsError) {
      toast.error(wsError);
    }
  }, [wsError, toast]);

  // Show realtime panel when recording starts
  useEffect(() => {
    if (isRecording) {
      setShowRealtimePanel(true);
    }
  }, [isRecording]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load recent meetings
      const meetingsResponse = await api.getMeetings({
        page: 1,
        limit: 10,
        sortBy: 'created_at',
        sortOrder: 'DESC'
      });
      setMeetings(meetingsResponse.meetings || []);

      // Load user stats
      const statsResponse = await api.getUserUsage(30);
      setStats(statsResponse.usage || null);

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleStartRecording = async () => {
    try {
      const meetingData = {
        title: `Meeting ${new Date().toLocaleDateString()}`,
        meeting_type: 'realtime',
        platform: 'chrome-extension'
      };

      await startMeeting(meetingData);
      toast.success('Recording started successfully');
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast.error('Failed to start recording');
    }
  };

  const handleStopRecording = async () => {
    try {
      await endMeeting();
      toast.success('Recording stopped and processing started');
      setShowRealtimePanel(false);
      // Refresh meetings list
      loadDashboardData();
    } catch (error) {
      console.error('Failed to stop recording:', error);
      toast.error('Failed to stop recording');
    }
  };

  const handleUploadClick = () => {
    router.push('/meetings/upload');
  };

  const handleMeetingClick = (meetingId) => {
    router.push(`/meetings/${meetingId}`);
  };

  const filteredMeetings = meetings.filter(meeting => {
    const matchesSearch = meeting.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         meeting.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filter === 'all' || meeting.status === filter;
    
    return matchesSearch && matchesFilter;
  });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user.display_name || user.email?.split('@')[0]}!
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage your meetings and analyze conversations with AI
          </p>
        </div>

        {/* Connection Status */}
        <div className="mb-6">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            {isRecording && (
              <div className="recording-indicator">
                <div className="recording-pulse"></div>
                <span>Recording in progress</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard
              title="Total Meetings"
              value={stats.meetings_count}
              icon={Calendar}
              trend={`${stats.meetings_count} this month`}
              color="blue"
            />
            <StatsCard
              title="Audio Duration"
              value={formatDuration(stats.total_audio_duration)}
              icon={Clock}
              trend={`Avg ${formatDuration(stats.avg_meeting_duration)}`}
              color="green"
            />
            <StatsCard
              title="Action Items"
              value={stats.action_items_count}
              icon={CheckSquare}
              trend="Pending & completed"
              color="yellow"
            />
            <StatsCard
              title="Words Transcribed"
              value={stats.total_words_transcribed?.toLocaleString() || '0'}
              icon={TrendingUp}
              trend="High accuracy"
              color="purple"
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Actions */}
            <QuickActions
              onStartRecording={handleStartRecording}
              onStopRecording={handleStopRecording}
              onUpload={handleUploadClick}
              isRecording={isRecording}
              isConnected={isConnected}
            />

            {/* Recent Meetings */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Recent Meetings</h2>
                  <button
                    onClick={() => router.push('/meetings')}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    View all
                  </button>
                </div>

                {/* Search and Filter */}
                <div className="mt-4 flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search meetings..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="input-primary pl-10"
                    />
                  </div>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="input-primary sm:w-40"
                  >
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="processing">Processing</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>

              <div className="p-6">
                {loading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-20 bg-gray-200 rounded-lg"></div>
                      </div>
                    ))}
                  </div>
                ) : filteredMeetings.length > 0 ? (
                  <div className="space-y-4">
                    {filteredMeetings.map((meeting) => (
                      <MeetingCard
                        key={meeting.id}
                        meeting={meeting}
                        onClick={() => handleMeetingClick(meeting.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No meetings found</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {searchQuery || filter !== 'all' 
                        ? 'Try adjusting your search or filter criteria'
                        : 'Get started by uploading an audio file or recording a live meeting'
                      }
                    </p>
                    {!searchQuery && filter === 'all' && (
                      <div className="mt-6">
                        <button
                          onClick={handleUploadClick}
                          className="btn-primary"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Meeting
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Recent Activity */}
            <RecentActivity />

            {/* Realtime Transcript Panel */}
            {showRealtimePanel && (
              <RealtimeTranscript
                isRecording={isRecording}
                transcript={liveTranscript}
                actionItems={actionItems}
                meetingId={currentMeeting?.meetingId}
                onClose={() => setShowRealtimePanel(false)}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}