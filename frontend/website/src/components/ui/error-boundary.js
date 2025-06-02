'use client';

import { Component } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree and displays a fallback UI
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Capture error details
    this.setState({
      error,
      errorInfo,
      eventId: this.generateErrorId()
    });

    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error Boundary caught an error:', error, errorInfo);
    }

    // Send error to monitoring service in production
    if (process.env.NODE_ENV === 'production') {
      this.logErrorToService(error, errorInfo);
    }
  }

  generateErrorId = () => {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  logErrorToService = (error, errorInfo) => {
    // Here you would integrate with your error monitoring service
    // Examples: Sentry, LogRocket, Bugsnag, etc.
    
    try {
      // Example error logging
      const errorData = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        userId: this.props.userId || 'anonymous',
        eventId: this.state.eventId
      };

      // Log to console for now (replace with actual service)
      console.error('Error logged:', errorData);
      
      // Example: Send to error tracking service
      // fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorData)
      // });
      
    } catch (loggingError) {
      console.error('Failed to log error:', loggingError);
    }
  };

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  copyErrorDetails = () => {
    const errorDetails = {
      error: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      eventId: this.state.eventId,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2))
      .then(() => {
        alert('Error details copied to clipboard');
      })
      .catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = JSON.stringify(errorDetails, null, 2);
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Error details copied to clipboard');
      });
  };

  render() {
    if (this.state.hasError) {
      // Render custom error UI
      const { fallback: Fallback, level = 'page' } = this.props;

      // If custom fallback provided, use it
      if (Fallback) {
        return (
          <Fallback
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            eventId={this.state.eventId}
            onRetry={this.handleRetry}
            onReload={this.handleReload}
            onGoHome={this.handleGoHome}
          />
        );
      }

      // Default error UI based on level
      if (level === 'component') {
        return (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 my-4">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
              <h3 className="text-sm font-medium text-red-800">
                Component Error
              </h3>
            </div>
            <p className="text-sm text-red-700 mt-2">
              Something went wrong with this component. 
            </p>
            <div className="mt-3">
              <button
                onClick={this.handleRetry}
                className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded hover:bg-red-200 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        );
      }

      // Full page error UI
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10">
              
              {/* Error Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
              </div>

              {/* Error Message */}
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  Oops! Something went wrong
                </h1>
                <p className="text-gray-600">
                  We're sorry for the inconvenience. An unexpected error occurred.
                </p>
              </div>

              {/* Error Details (Development only) */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="mb-6 p-4 bg-gray-100 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-900 mb-2">
                    Error Details (Development Mode)
                  </h3>
                  <div className="text-xs text-gray-700 font-mono">
                    <div className="mb-2">
                      <strong>Message:</strong> {this.state.error.message}
                    </div>
                    <div className="mb-2">
                      <strong>Event ID:</strong> {this.state.eventId}
                    </div>
                    {this.state.error.stack && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-gray-600">
                          Stack Trace
                        </summary>
                        <pre className="mt-2 text-xs overflow-auto max-h-32 p-2 bg-gray-200 rounded">
                          {this.state.error.stack}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              )}

              {/* Error ID for Production */}
              {process.env.NODE_ENV === 'production' && (
                <div className="mb-6 p-3 bg-gray-50 rounded-lg text-center">
                  <p className="text-xs text-gray-600">
                    Error ID: <code className="font-mono">{this.state.eventId}</code>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Please include this ID when reporting the issue
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={this.handleRetry}
                  className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </button>

                <button
                  onClick={this.handleReload}
                  className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reload Page
                </button>

                <button
                  onClick={this.handleGoHome}
                  className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Go to Dashboard
                </button>
              </div>

              {/* Support Options */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-xs text-gray-500 text-center mb-3">
                  Need help? Contact our support team
                </p>
                <div className="flex justify-center space-x-4">
                  <button
                    onClick={this.copyErrorDetails}
                    className="text-xs text-blue-600 hover:text-blue-500 flex items-center"
                  >
                    <Bug className="w-3 h-3 mr-1" />
                    Copy Error Details
                  </button>
                  <a
                    href="mailto:support@meetingintelligence.ai?subject=Error Report"
                    className="text-xs text-blue-600 hover:text-blue-500"
                  >
                    Email Support
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // No error, render children normally
    return this.props.children;
  }
}

/**
 * Higher-order component to wrap components with error boundary
 */
export function withErrorBoundary(Component, errorBoundaryProps = {}) {
  const WrappedComponent = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

/**
 * Hook to manually trigger error boundary (for testing or manual error handling)
 */
export function useErrorBoundary() {
  return (error) => {
    throw error;
  };
}

/**
 * Simple error fallback component for component-level errors
 */
export function SimpleErrorFallback({ error, onRetry }) {
  return (
    <div className="text-center py-8">
      <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        Something went wrong
      </h3>
      <p className="text-gray-600 mb-4">
        {error?.message || 'An unexpected error occurred'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-primary"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

export default ErrorBoundary;