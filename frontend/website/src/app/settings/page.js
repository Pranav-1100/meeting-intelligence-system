'use client';

import { useState, useEffect } from 'react';
import { 
  User, 
  Bell, 
  Shield, 
  Palette, 
  Globe, 
  Mic, 
  Download, 
  Trash2,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  Key,
  Link,
  Unlink,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/toast-provider';
import Navigation from '@/components/layout/navigation';
import api from '@/lib/api';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  // State
  const [activeSection, setActiveSection] = useState('profile');
  const [settings, setSettings] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Profile form state
  const [profileData, setProfileData] = useState({
    display_name: '',
    email: '',
  });

  // Settings form state
  const [settingsData, setSettingsData] = useState({
    notifications: true,
    theme: 'light',
    language: 'en',
    autoTranscription: true,
    realtimeProcessing: true,
    emailSummaries: false,
    slackNotifications: false,
  });

  // Load user data and settings
  useEffect(() => {
    loadUserData();
    loadIntegrations();
  }, []);

  useEffect(() => {
    if (user) {
      setProfileData({
        display_name: user.display_name || '',
        email: user.email || '',
      });
    }
  }, [user]);

  const loadUserData = async () => {
    setLoading(true);
    try {
      const [settingsResponse] = await Promise.all([
        api.getUserSettings(),
      ]);

      setSettings(settingsResponse.settings);
      setSettingsData(prev => ({
        ...prev,
        ...settingsResponse.settings
      }));
    } catch (error) {
      console.error('Failed to load user data:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const loadIntegrations = async () => {
    try {
      const response = await api.getMcpIntegrations();
      setIntegrations(response.integrations || []);
    } catch (error) {
      console.error('Failed to load integrations:', error);
    }
  };

  // Save handlers
  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await api.updateUserProfile(profileData);
      await refreshUser();
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await api.updateUserSettings(settingsData);
      setSettings(settingsData);
      toast.success('Settings updated successfully');
    } catch (error) {
      console.error('Failed to update settings:', error);
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmEmail = prompt('Type your email address to confirm account deletion:');
    if (confirmEmail !== user?.email) {
      toast.error('Email confirmation does not match');
      return;
    }

    try {
      await api.deleteAccount({ confirmEmail });
      toast.success('Account deleted successfully');
      // User will be automatically logged out
    } catch (error) {
      console.error('Failed to delete account:', error);
      toast.error('Failed to delete account');
    }
  };

  const sections = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'preferences', label: 'Preferences', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'integrations', label: 'Integrations', icon: Link },
    { id: 'privacy', label: 'Privacy & Security', icon: Shield },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="h-64 bg-gray-200 rounded"></div>
              <div className="lg:col-span-3 h-96 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage your account settings and preferences
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-fit">
            <nav className="space-y-2">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`nav-link w-full ${
                      activeSection === section.id ? 'active' : ''
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-3" />
                    {section.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="lg:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200">
            
            {/* Profile Section */}
            {activeSection === 'profile' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="btn-primary flex items-center space-x-2"
                  >
                    {saving ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span>Save Changes</span>
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Profile Picture */}
                  <div className="flex items-center space-x-6">
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                      {user?.photo_url ? (
                        <img
                          src={user.photo_url}
                          alt={user.display_name || user.email}
                          className="w-20 h-20 rounded-full object-cover"
                        />
                      ) : (
                        <User className="w-8 h-8 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">Profile Picture</h3>
                      <p className="text-sm text-gray-500">
                        JPG, GIF or PNG. 1MB max.
                      </p>
                      <button className="mt-2 btn-outline text-sm">
                        Change Picture
                      </button>
                    </div>
                  </div>

                  {/* Form Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={profileData.display_name}
                        onChange={(e) => setProfileData(prev => ({
                          ...prev,
                          display_name: e.target.value
                        }))}
                        className="input-primary"
                        placeholder="Enter your display name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={profileData.email}
                        disabled
                        className="input-primary bg-gray-50 cursor-not-allowed"
                        placeholder="Email cannot be changed"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Contact support to change your email address
                      </p>
                    </div>
                  </div>

                  {/* Account Information */}
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Account Information</h3>
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt className="text-gray-500">Account created</dt>
                        <dd className="font-medium">{new Date(user?.created_at).toLocaleDateString()}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Last login</dt>
                        <dd className="font-medium">{new Date(user?.last_login).toLocaleDateString()}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Subscription</dt>
                        <dd className="font-medium capitalize">{user?.subscription_tier || 'Free'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Provider</dt>
                        <dd className="font-medium capitalize">{user?.provider || 'Email'}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            )}

            {/* Preferences Section */}
            {activeSection === 'preferences' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">Preferences</h2>
                  <button
                    onClick={handleSaveSettings}
                    disabled={saving}
                    className="btn-primary flex items-center space-x-2"
                  >
                    {saving ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span>Save Changes</span>
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Theme */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Theme
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSettingsData(prev => ({ ...prev, theme: 'light' }))}
                        className={`p-4 border-2 rounded-lg ${
                          settingsData.theme === 'light'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="text-sm font-medium">Light</div>
                        <div className="text-xs text-gray-500">Clean and bright interface</div>
                      </button>
                      <button
                        onClick={() => setSettingsData(prev => ({ ...prev, theme: 'dark' }))}
                        className={`p-4 border-2 rounded-lg ${
                          settingsData.theme === 'dark'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="text-sm font-medium">Dark</div>
                        <div className="text-xs text-gray-500">Easier on the eyes</div>
                      </button>
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Language
                    </label>
                    <select
                      value={settingsData.language}
                      onChange={(e) => setSettingsData(prev => ({ ...prev, language: e.target.value }))}
                      className="input-primary max-w-xs"
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="it">Italian</option>
                    </select>
                  </div>

                  {/* Meeting Preferences */}
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Meeting Preferences</h3>
                    <div className="space-y-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settingsData.autoTranscription}
                          onChange={(e) => setSettingsData(prev => ({
                            ...prev,
                            autoTranscription: e.target.checked
                          }))}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          Auto-start transcription for uploaded files
                        </span>
                      </label>

                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settingsData.realtimeProcessing}
                          onChange={(e) => setSettingsData(prev => ({
                            ...prev,
                            realtimeProcessing: e.target.checked
                          }))}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          Enable real-time processing for live meetings
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notifications Section */}
            {activeSection === 'notifications' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">Notification Settings</h2>
                  <button
                    onClick={handleSaveSettings}
                    disabled={saving}
                    className="btn-primary flex items-center space-x-2"
                  >
                    {saving ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span>Save Changes</span>
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Email Notifications */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Email Notifications</h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between">
                        <div>
                          <span className="text-sm text-gray-700">Meeting summaries</span>
                          <p className="text-xs text-gray-500">
                            Receive email summaries after meetings are processed
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settingsData.emailSummaries}
                          onChange={(e) => setSettingsData(prev => ({
                            ...prev,
                            emailSummaries: e.target.checked
                          }))}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Browser Notifications */}
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Browser Notifications</h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between">
                        <div>
                          <span className="text-sm text-gray-700">Processing completed</span>
                          <p className="text-xs text-gray-500">
                            Get notified when meeting processing is complete
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settingsData.notifications}
                          onChange={(e) => setSettingsData(prev => ({
                            ...prev,
                            notifications: e.target.checked
                          }))}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Slack Notifications */}
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Slack Notifications</h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between">
                        <div>
                          <span className="text-sm text-gray-700">Action item updates</span>
                          <p className="text-xs text-gray-500">
                            Send action items to Slack channels automatically
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settingsData.slackNotifications}
                          onChange={(e) => setSettingsData(prev => ({
                            ...prev,
                            slackNotifications: e.target.checked
                          }))}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Integrations Section */}
            {activeSection === 'integrations' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Connected Integrations</h2>

                <div className="space-y-4">
                  {integrations.length > 0 ? (
                    integrations.map((integration) => (
                      <div key={integration.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                        <div className="flex items-center space-x-3">
                          {integration.is_active ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-red-500" />
                          )}
                          <div>
                            <h3 className="text-sm font-medium text-gray-900 capitalize">
                              {integration.service_type}
                            </h3>
                            <p className="text-xs text-gray-500">
                              {integration.is_active ? 'Connected' : 'Disconnected'} • 
                              Last used {integration.last_used ? new Date(integration.last_used).toLocaleDateString() : 'Never'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => api.testMcpIntegration(integration.service_type)}
                            className="btn-outline text-sm"
                          >
                            Test
                          </button>
                          <button className="btn-ghost text-sm text-red-600">
                            <Unlink className="h-3 w-3 mr-1" />
                            Disconnect
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <Link className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <h3 className="text-sm font-medium text-gray-900">No integrations connected</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Connect your calendar, email, and other tools to automate workflows
                      </p>
                    </div>
                  )}

                  {/* Available Integrations */}
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Available Integrations</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {['calendar', 'email', 'slack', 'notion'].map((service) => (
                        <button
                          key={service}
                          onClick={() => {
                            // TODO: Open integration setup modal
                            console.log(`Connect ${service}`);
                          }}
                          className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                        >
                          <div className="text-sm font-medium capitalize">{service}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            Connect your {service} account
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Privacy & Security Section */}
            {activeSection === 'privacy' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Privacy & Security</h2>

                <div className="space-y-6">
                  {/* Data Management */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Data Management</h3>
                    <div className="space-y-3">
                      <button className="btn-outline flex items-center space-x-2 w-full justify-center">
                        <Download className="h-4 w-4" />
                        <span>Export My Data</span>
                      </button>
                      <p className="text-xs text-gray-500 text-center">
                        Download all your meetings, transcripts, and account data
                      </p>
                    </div>
                  </div>

                  {/* Security */}
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Security</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm text-gray-700">Two-factor authentication</span>
                          <p className="text-xs text-gray-500">
                            Add an extra layer of security to your account
                          </p>
                        </div>
                        <button className="btn-outline text-sm">
                          Enable 2FA
                        </button>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm text-gray-700">API Keys</span>
                          <p className="text-xs text-gray-500">
                            Manage API keys for external integrations
                          </p>
                        </div>
                        <button className="btn-outline text-sm flex items-center space-x-1">
                          <Key className="h-3 w-3" />
                          <span>Manage</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div className="pt-6 border-t border-red-200">
                    <h3 className="text-sm font-medium text-red-900 mb-4">Danger Zone</h3>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-red-900">Delete Account</span>
                          <p className="text-xs text-red-700 mt-1">
                            Permanently delete your account and all associated data
                          </p>
                        </div>
                        <button
                          onClick={handleDeleteAccount}
                          className="btn-outline border-red-300 text-red-700 hover:bg-red-100 text-sm flex items-center space-x-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete Account</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}