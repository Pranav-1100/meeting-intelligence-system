'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Clock, 
  Users, 
  Calendar, 
  Download, 
  Share2, 
  MoreVertical,
  CheckSquare,
  Play,
  Pause,
  Volume2,
  Search,
  Copy,
  Edit,
  Trash2,
  Plus,
  RefreshCw,
  Mic,
  FileText,
  MessageSquare,
  TrendingUp,
  AlertCircle
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/toast-provider';
import Navigation from '@/components/layout/navigation';
import api from '@/lib/api';
import { 
  formatDuration, 
  formatDate, 
  formatRelativeTime, 
  getStatusColor, 
  getPriorityColor,
  copyToClipboard 
} from '@/lib/utils';

export default function MeetingDetailsPage({ params }) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const { id } = params;

  // State
  const [meeting, setMeeting] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [actionItems, setActionItems] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('transcript');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  // Load meeting data
  useEffect(() => {
    if (id && user) {
      loadMeetingData();
    }
  }, [id, user]);

  const loadMeetingData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Loading meeting data for ID:', id);
      
      // Load meeting details
      const meetingResponse = await api.getMeeting(id);
      console.log('✅ Meeting data loaded:', meetingResponse);
      setMeeting(meetingResponse.meeting);
      
      // Load transcript if available
      try {
        const transcriptResponse = await api.getTranscript(id, { includeSegments: true });
        console.log('✅ Transcript loaded:', transcriptResponse);
        setTranscript(transcriptResponse);
      } catch (transcriptError) {
        console.warn('⚠️ Transcript not available:', transcriptError.message);
        setTranscript(null);
      }
      
      // Load analysis if available
      try {
        const analysisResponse = await api.getMeetingAnalysis(id);
        console.log('✅ Analysis loaded:', analysisResponse);
        setAnalysis(analysisResponse.analysis?.[0] || null);
      } catch (analysisError) {
        console.warn('⚠️ Analysis not available:', analysisError.message);
        setAnalysis(null);
      }

      // Load action items
      try {
        const actionItemsResponse = await api.getActionItems(id);
        console.log('✅ Action items loaded:', actionItemsResponse);
        setActionItems(actionItemsResponse.actionItems || []);
      } catch (actionItemsError) {
        console.warn('⚠️ Action items not available:', actionItemsError.message);
        setActionItems([]);
      }

      // Set speakers from meeting data
      setSpeakers(meetingResponse.speakers || []);

    } catch (error) {
      console.error('❌ Failed to load meeting data:', error);
      setError(error.message);
      
      if (error.message.includes('404') || error.message.includes('not found')) {
        toast.error('Meeting not found');
      } else {
        toast.error('Failed to load meeting details');
      }
    } finally {
      setLoading(false);
    }
  };

  // Search transcript
  const handleSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await api.searchTranscript(id, query, {
        caseSensitive: false,
        limit: 20
      });
      setSearchResults(response.results || []);
    } catch (error) {
      console.error('Search failed:', error);
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  // Action item handlers
  const handleCreateActionItem = async (itemData) => {
    try {
      const response = await api.createActionItem(id, itemData);
      setActionItems(prev => [...prev, response.actionItem]);
      toast.success('Action item created');
    } catch (error) {
      console.error('Failed to create action item:', error);
      toast.error('Failed to create action item');
    }
  };

  const handleUpdateActionItem = async (itemId, updates) => {
    try {
      await api.updateActionItem(itemId, updates);
      setActionItems(prev => 
        prev.map(item => item.id === itemId ? { ...item, ...updates } : item)
      );
      toast.success('Action item updated');
    } catch (error) {
      console.error('Failed to update action item:', error);
      toast.error('Failed to update action item');
    }
  };

  const handleDeleteActionItem = async (itemId) => {
    try {
      await api.deleteActionItem(itemId);
      setActionItems(prev => prev.filter(item => item.id !== itemId));
      toast.success('Action item deleted');
    } catch (error) {
      console.error('Failed to delete action item:', error);
      toast.error('Failed to delete action item');
    }
  };

  // Export handlers
  const handleExportTranscript = async (format) => {
    try {
      const blob = await api.exportTranscript(id, format, {
        includeSpeakers: true,
        includeTimestamps: true
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${meeting?.title || 'meeting'}-transcript.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Transcript exported');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed');
    }
  };

  const handleCopyTranscript = async () => {
    if (transcript?.content) {
      const success = await copyToClipboard(transcript.content);
      if (success) {
        toast.success('Transcript copied to clipboard');
      } else {
        toast.error('Failed to copy transcript');
      }
    }
  };

  const handleShare = async () => {
    try {
      await navigator.share({
        title: meeting?.title || 'Meeting',
        text: analysis?.summary || 'Meeting analysis',
        url: window.location.href
      });
    } catch (error) {
      // Fallback to copying link
      const success = await copyToClipboard(window.location.href);
      if (success) {
        toast.success('Link copied to clipboard');
      } else {
        toast.error('Failed to share meeting');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {error?.includes('not found') ? 'Meeting not found' : 'Error loading meeting'}
            </h1>
            <p className="text-gray-600 mb-4">
              {error || "The meeting you're looking for doesn't exist or couldn't be loaded."}
            </p>
            <div className="space-x-4">
              <button
                onClick={() => router.back()}
                className="btn-outline"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="btn-primary"
              >
                Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'transcript', label: 'Transcript', icon: FileText },
    { id: 'analysis', label: 'Analysis', icon: TrendingUp },
    { id: 'actions', label: 'Action Items', icon: CheckSquare, count: actionItems.length },
    { id: 'speakers', label: 'Speakers', icon: Users, count: speakers.length },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <button
              onClick={() => router.back()}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 flex-1">
              {meeting.title || 'Untitled Meeting'}
            </h1>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={handleShare}
                className="btn-outline flex items-center space-x-1"
              >
                <Share2 className="h-4 w-4" />
                <span>Share</span>
              </button>
              
              <div className="relative">
                <button 
                  onClick={() => handleExportTranscript('txt')}
                  className="btn-outline flex items-center space-x-1"
                >
                  <Download className="h-4 w-4" />
                  <span>Export</span>
                </button>
              </div>
              
              <button className="btn-ghost p-2">
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Meeting metadata */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Date</p>
                  <p className="font-medium">{formatDate(meeting.created_at)}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Clock className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Duration</p>
                  <p className="font-medium">{formatDuration(meeting.audio_duration)}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Users className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Participants</p>
                  <p className="font-medium">{meeting.participants_count || speakers.length || 0}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Mic className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <span className={`badge ${getStatusColor(meeting.processing_status)}`}>
                    {meeting.processing_status}
                  </span>
                </div>
              </div>
            </div>

            {meeting.description && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-700">{meeting.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch(e.target.value);
              }}
              className="input-primary pl-10"
            />
            {searching && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Search Results ({searchResults.length})
            </h3>
            <div className="space-y-2">
              {searchResults.map((result, index) => (
                <div key={index} className="p-2 hover:bg-gray-50 rounded">
                  <p className="text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: result.content }} />
                  <p className="text-xs text-gray-500 mt-1">
                    {result.speaker_label} • {formatDuration(result.start_time)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                    {tab.count !== undefined && (
                      <span className={`badge-sm ${
                        activeTab === tab.id ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          
          {/* Transcript Tab */}
          {activeTab === 'transcript' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Meeting Transcript</h2>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleCopyTranscript}
                    className="btn-outline text-sm flex items-center space-x-1"
                  >
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </button>
                  <button
                    onClick={() => handleExportTranscript('txt')}
                    className="btn-outline text-sm flex items-center space-x-1"
                  >
                    <Download className="h-3 w-3" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {transcript ? (
                <div className="transcript-content">
                  {transcript.segments ? (
                    <div className="space-y-4">
                      {transcript.segments.map((segment, index) => (
                        <div key={index} className="flex space-x-4">
                          <div className="flex-shrink-0 w-20 text-xs text-gray-500 pt-1">
                            {formatDuration(segment.start_time)}
                          </div>
                          <div className="flex-1">
                            <span className="speaker-label">
                              {segment.speaker_label || 'Speaker'}:
                            </span>
                            <span className="ml-2">{segment.content}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{transcript.content}</div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>No transcript available</p>
                  {meeting.processing_status !== 'completed' && (
                    <p className="text-sm mt-2">Processing in progress...</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Analysis Tab */}
          {activeTab === 'analysis' && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Meeting Analysis</h2>
              
              {analysis ? (
                <div className="space-y-6">
                  {/* Summary */}
                  {analysis.summary && (
                    <div>
                      <h3 className="text-base font-medium text-gray-900 mb-2">Summary</h3>
                      <p className="text-gray-700 leading-relaxed">{analysis.summary}</p>
                    </div>
                  )}

                  {/* Key Points */}
                  {analysis.key_points && analysis.key_points.length > 0 && (
                    <div>
                      <h3 className="text-base font-medium text-gray-900 mb-2">Key Points</h3>
                      <ul className="list-disc list-inside space-y-1">
                        {analysis.key_points.map((point, index) => (
                          <li key={index} className="text-gray-700">{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Decisions */}
                  {analysis.decisions && analysis.decisions.length > 0 && (
                    <div>
                      <h3 className="text-base font-medium text-gray-900 mb-2">Decisions Made</h3>
                      <ul className="list-disc list-inside space-y-1">
                        {analysis.decisions.map((decision, index) => (
                          <li key={index} className="text-gray-700">{decision}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Topics */}
                  {analysis.topics && analysis.topics.length > 0 && (
                    <div>
                      <h3 className="text-base font-medium text-gray-900 mb-2">Topics Discussed</h3>
                      <div className="flex flex-wrap gap-2">
                        {analysis.topics.map((topic, index) => (
                          <span key={index} className="badge bg-blue-100 text-blue-800">
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sentiment Analysis */}
                  {analysis.sentiment_analysis && (
                    <div>
                      <h3 className="text-base font-medium text-gray-900 mb-2">Sentiment Analysis</h3>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-sm text-gray-700">
                          Overall sentiment: 
                          <span className={`ml-2 badge ${
                            analysis.sentiment_analysis.overall === 'positive' ? 'badge-success' :
                            analysis.sentiment_analysis.overall === 'negative' ? 'badge-error' :
                            'badge-neutral'
                          }`}>
                            {analysis.sentiment_analysis.overall}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>No analysis available</p>
                  {meeting.processing_status !== 'completed' && (
                    <p className="text-sm mt-2">Processing in progress...</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Items Tab */}
          {activeTab === 'actions' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Action Items</h2>
                <button
                  onClick={() => {
                    // TODO: Open action item creation modal
                    toast.info('Action item creation coming soon!');
                  }}
                  className="btn-primary text-sm flex items-center space-x-1"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Item</span>
                </button>
              </div>

              {actionItems.length > 0 ? (
                <div className="space-y-4">
                  {actionItems.map((item) => (
                    <div key={item.id} className={`action-item ${
                      item.priority === 'high' ? 'action-item-priority-high' :
                      item.priority === 'medium' ? 'action-item-priority-medium' :
                      item.priority === 'low' ? 'action-item-priority-low' : ''
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{item.title}</h4>
                          {item.description && (
                            <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                          )}
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            {item.assignee_name && (
                              <span>Assigned to: {item.assignee_name}</span>
                            )}
                            {item.due_date && (
                              <span>Due: {formatDate(item.due_date)}</span>
                            )}
                            {item.priority && (
                              <span className={`badge ${getPriorityColor(item.priority)}`}>
                                {item.priority}
                              </span>
                            )}
                            <span className={`badge ${getStatusColor(item.status)}`}>
                              {item.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1 ml-4">
                          <button
                            onClick={() => handleUpdateActionItem(item.id, { 
                              status: item.status === 'completed' ? 'pending' : 'completed' 
                            })}
                            className="p-1 text-gray-400 hover:text-green-600"
                            title={item.status === 'completed' ? 'Mark as pending' : 'Mark as completed'}
                          >
                            <CheckSquare className={`h-4 w-4 ${
                              item.status === 'completed' ? 'text-green-600' : ''
                            }`} />
                          </button>
                          <button
                            onClick={() => handleDeleteActionItem(item.id)}
                            className="p-1 text-gray-400 hover:text-red-600"
                            title="Delete action item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <CheckSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>No action items found</p>
                  <p className="text-sm mt-2">Add action items to track follow-up tasks</p>
                </div>
              )}
            </div>
          )}

          {/* Speakers Tab */}
          {activeTab === 'speakers' && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Speaker Analysis</h2>
              
              {speakers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {speakers.map((speaker, index) => (
                    <div key={speaker.id || index} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-gray-900">
                          {speaker.identified_name || speaker.label || `Speaker ${index + 1}`}
                        </h3>
                        <span className="text-xs text-gray-500">
                          {Math.round((speaker.speaking_time / meeting.audio_duration) * 100)}% of meeting
                        </span>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Speaking time:</span>
                          <span className="font-medium">{formatDuration(speaker.speaking_time)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Word count:</span>
                          <span className="font-medium">{speaker.word_count}</span>
                        </div>
                        {speaker.confidence_score && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Confidence:</span>
                            <span className="font-medium">{Math.round(speaker.confidence_score * 100)}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>No speaker analysis available</p>
                  {meeting.processing_status !== 'completed' && (
                    <p className="text-sm mt-2">Processing in progress...</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}