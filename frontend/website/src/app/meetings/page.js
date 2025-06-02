'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  Users,
  CheckSquare,
  MoreVertical,
  Upload,
  Mic,
  Video,
  Phone,
  RefreshCw,
  Download,
  Trash2,
  Eye
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/toast-provider';
import Navigation from '@/components/layout/navigation';
import MeetingCard from '@/components/meetings/meeting-card';
import api from '@/lib/api';
import { formatDuration, formatRelativeTime, formatDate, getStatusColor } from '@/lib/utils';

export default function MeetingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  // State
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMeetings, setTotalMeetings] = useState(0);

  const ITEMS_PER_PAGE = 10;

  // Load meetings
  useEffect(() => {
    loadMeetings();
  }, [currentPage, sortBy, sortOrder, statusFilter, typeFilter, searchQuery]);

  const loadMeetings = async () => {
    setLoading(true);
    try {
      console.log('Loading meetings from API...');
      
      const params = {
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        sortBy,
        sortOrder,
        ...(searchQuery && { search: searchQuery }),
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(typeFilter !== 'all' && { meeting_type: typeFilter })
      };

      const response = await api.getMeetings(params);
      console.log('✅ Meetings loaded:', response);
      
      setMeetings(response.meetings || []);
      setTotalMeetings(response.total || 0);
      setTotalPages(Math.ceil((response.total || 0) / ITEMS_PER_PAGE));
      
    } catch (error) {
      console.error('❌ Failed to load meetings:', error);
      toast.error('Failed to load meetings');
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleFilterChange = (filterType, value) => {
    if (filterType === 'status') {
      setStatusFilter(value);
    } else if (filterType === 'type') {
      setTypeFilter(value);
    }
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handleSortChange = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('DESC');
    }
    setCurrentPage(1);
  };

  const handleMeetingClick = (meetingId) => {
    router.push(`/meetings/${meetingId}`);
  };

  const handleMeetingAction = (action, meeting) => {
    switch (action) {
      case 'view':
        router.push(`/meetings/${meeting.id}`);
        break;
      case 'delete':
        handleDeleteMeeting(meeting.id);
        break;
      case 'download':
        handleDownloadMeeting(meeting.id);
        break;
      default:
        console.log('Unknown action:', action);
    }
  };

  const handleDeleteMeeting = async (meetingId) => {
    if (!confirm('Are you sure you want to delete this meeting? This action cannot be undone.')) {
      return;
    }

    try {
      await api.deleteMeeting(meetingId);
      toast.success('Meeting deleted successfully');
      loadMeetings(); // Refresh the list
    } catch (error) {
      console.error('Failed to delete meeting:', error);
      toast.error('Failed to delete meeting');
    }
  };

  const handleDownloadMeeting = async (meetingId) => {
    try {
      toast.info('Download feature coming soon!');
    } catch (error) {
      console.error('Failed to download meeting:', error);
      toast.error('Failed to download meeting');
    }
  };

  const getPlatformIcon = (platform) => {
    switch (platform) {
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

  const getMeetingTypeIcon = (type) => {
    switch (type) {
      case 'realtime':
        return <Mic className="h-4 w-4 text-red-500" />;
      case 'uploaded':
        return <Upload className="h-4 w-4 text-blue-500" />;
      default:
        return <Calendar className="h-4 w-4 text-gray-500" />;
    }
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex items-center justify-between px-6 py-3 bg-white border-t border-gray-200">
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <span>
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalMeetings)} of {totalMeetings} meetings
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          
          {pages.map(page => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`px-3 py-1 text-sm rounded ${
                currentPage === page
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {page}
            </button>
          ))}
          
          <button
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">All Meetings</h1>
              <p className="mt-1 text-sm text-gray-600">
                View and manage your meeting recordings and analysis
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={loadMeetings}
                disabled={loading}
                className="btn-outline flex items-center space-x-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={() => router.push('/meetings/upload')}
                className="btn-primary flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Upload Meeting</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search */}
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search meetings..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="input-primary pl-10"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="input-primary"
                >
                  <option value="all">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="processing">Processing</option>
                  <option value="failed">Failed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              {/* Type Filter */}
              <div>
                <select
                  value={typeFilter}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  className="input-primary"
                >
                  <option value="all">All Types</option>
                  <option value="realtime">Real-time</option>
                  <option value="uploaded">Uploaded</option>
                </select>
              </div>
            </div>

            {/* Sort Options */}
            <div className="mt-4 flex items-center space-x-4">
              <span className="text-sm text-gray-500">Sort by:</span>
              <button
                onClick={() => handleSortChange('created_at')}
                className={`text-sm px-3 py-1 rounded ${
                  sortBy === 'created_at' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Date {sortBy === 'created_at' && (sortOrder === 'ASC' ? '↑' : '↓')}
              </button>
              <button
                onClick={() => handleSortChange('title')}
                className={`text-sm px-3 py-1 rounded ${
                  sortBy === 'title' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Title {sortBy === 'title' && (sortOrder === 'ASC' ? '↑' : '↓')}
              </button>
              <button
                onClick={() => handleSortChange('audio_duration')}
                className={`text-sm px-3 py-1 rounded ${
                  sortBy === 'audio_duration' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Duration {sortBy === 'audio_duration' && (sortOrder === 'ASC' ? '↑' : '↓')}
              </button>
            </div>
          </div>
        </div>

        {/* Meetings List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading ? (
            <div className="p-6">
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-20 bg-gray-200 rounded-lg"></div>
                  </div>
                ))}
              </div>
            </div>
          ) : meetings.length > 0 ? (
            <>
              <div className="divide-y divide-gray-200">
                {meetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="p-6 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => handleMeetingClick(meeting.id)}
                  >
                    <div className="flex items-center justify-between">
                      {/* Meeting Info */}
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          {getMeetingTypeIcon(meeting.meeting_type)}
                          <h3 className="text-lg font-medium text-gray-900">
                            {meeting.title || 'Untitled Meeting'}
                          </h3>
                          <span className={`badge ${getStatusColor(meeting.processing_status)}`}>
                            {meeting.processing_status}
                          </span>
                        </div>
                        
                        {meeting.description && (
                          <p className="text-sm text-gray-600 mb-2">
                            {meeting.description}
                          </p>
                        )}
                        
                        <div className="flex items-center space-x-6 text-sm text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-4 w-4" />
                            <span>{formatDate(meeting.created_at)}</span>
                          </div>
                          
                          <div className="flex items-center space-x-1">
                            <Clock className="h-4 w-4" />
                            <span>{formatDuration(meeting.audio_duration)}</span>
                          </div>
                          
                          {meeting.participants_count > 0 && (
                            <div className="flex items-center space-x-1">
                              <Users className="h-4 w-4" />
                              <span>{meeting.participants_count} participants</span>
                            </div>
                          )}
                          
                          {meeting.action_items_count > 0 && (
                            <div className="flex items-center space-x-1">
                              <CheckSquare className="h-4 w-4" />
                              <span>{meeting.action_items_count} action items</span>
                            </div>
                          )}
                          
                          {meeting.platform && (
                            <div className="flex items-center space-x-1">
                              {getPlatformIcon(meeting.platform)}
                              <span className="capitalize">{meeting.platform}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMeetingAction('view', meeting);
                          }}
                          className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                          title="View meeting"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMeetingAction('download', meeting);
                          }}
                          className="p-2 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMeetingAction('delete', meeting);
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                          title="Delete meeting"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Progress bar for processing meetings */}
                    {meeting.processing_status === 'processing' && meeting.metadata?.processing_progress && (
                      <div className="mt-3">
                        <div className="progress-bar">
                          <div 
                            className="progress-fill"
                            style={{ width: `${meeting.metadata.processing_progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Processing... {meeting.metadata.processing_progress}%
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Pagination */}
              {renderPagination()}
            </>
          ) : (
            <div className="text-center py-12">
              <Calendar className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No meetings found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                  ? 'Try adjusting your search or filter criteria'
                  : 'Get started by uploading an audio file or recording a live meeting'
                }
              </p>
              {!searchQuery && statusFilter === 'all' && typeFilter === 'all' && (
                <div className="mt-6">
                  <button
                    onClick={() => router.push('/meetings/upload')}
                    className="btn-primary"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Your First Meeting
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}