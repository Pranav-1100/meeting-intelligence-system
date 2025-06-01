/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString(),
      user: req.user?.id || 'anonymous'
    });
  
    // Default error
    let error = {
      status: 500,
      message: 'Internal Server Error',
      code: 'INTERNAL_ERROR'
    };
  
    // Handle specific error types
    switch (err.name) {
      case 'ValidationError':
        error = {
          status: 400,
          message: 'Validation Error',
          code: 'VALIDATION_ERROR',
          details: err.details || err.message
        };
        break;
  
      case 'CastError':
        error = {
          status: 400,
          message: 'Invalid data format',
          code: 'CAST_ERROR'
        };
        break;
  
      case 'MulterError':
        if (err.code === 'LIMIT_FILE_SIZE') {
          error = {
            status: 413,
            message: 'File too large',
            code: 'FILE_TOO_LARGE',
            details: 'Maximum file size is 100MB'
          };
        } else {
          error = {
            status: 400,
            message: 'File upload error',
            code: 'UPLOAD_ERROR',
            details: err.message
          };
        }
        break;
  
      case 'JsonWebTokenError':
        error = {
          status: 401,
          message: 'Invalid token',
          code: 'INVALID_TOKEN'
        };
        break;
  
      case 'TokenExpiredError':
        error = {
          status: 401,
          message: 'Token expired',
          code: 'TOKEN_EXPIRED'
        };
        break;
  
      default:
        // Check for specific error codes
        if (err.code) {
          switch (err.code) {
            case 'ENOENT':
              error = {
                status: 404,
                message: 'File not found',
                code: 'FILE_NOT_FOUND'
              };
              break;
  
            case 'ENOSPC':
              error = {
                status: 507,
                message: 'Insufficient storage space',
                code: 'STORAGE_FULL'
              };
              break;
  
            case 'SQLITE_CONSTRAINT_UNIQUE':
              error = {
                status: 409,
                message: 'Resource already exists',
                code: 'DUPLICATE_RESOURCE'
              };
              break;
  
            case 'SQLITE_CONSTRAINT_FOREIGNKEY':
              error = {
                status: 400,
                message: 'Invalid reference',
                code: 'INVALID_REFERENCE'
              };
              break;
          }
        }
  
        // Handle HTTP status codes
        if (err.status || err.statusCode) {
          error.status = err.status || err.statusCode;
          error.message = err.message || error.message;
        }
    }
  
    // Don't leak sensitive information in production
    if (process.env.NODE_ENV === 'production') {
      // Remove stack trace and internal details
      delete error.stack;
      
      // Generic message for 500 errors
      if (error.status === 500) {
        error.message = 'Something went wrong. Please try again later.';
      }
    } else {
      // Include stack trace in development
      error.stack = err.stack;
    }
  
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
      ...(error.details && { details: error.details }),
      ...(error.stack && { stack: error.stack })
    });
  };
  
  /**
   * Wrapper for async route handlers to catch errors
   */
  const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
  
  /**
   * Create custom error classes
   */
  class CustomError extends Error {
    constructor(message, status = 500, code = 'CUSTOM_ERROR') {
      super(message);
      this.name = 'CustomError';
      this.status = status;
      this.code = code;
    }
  }
  
  class ValidationError extends CustomError {
    constructor(message, details = null) {
      super(message, 400, 'VALIDATION_ERROR');
      this.name = 'ValidationError';
      this.details = details;
    }
  }
  
  class NotFoundError extends CustomError {
    constructor(resource = 'Resource') {
      super(`${resource} not found`, 404, 'NOT_FOUND');
      this.name = 'NotFoundError';
    }
  }
  
  class UnauthorizedError extends CustomError {
    constructor(message = 'Unauthorized access') {
      super(message, 401, 'UNAUTHORIZED');
      this.name = 'UnauthorizedError';
    }
  }
  
  class ForbiddenError extends CustomError {
    constructor(message = 'Access forbidden') {
      super(message, 403, 'FORBIDDEN');
      this.name = 'ForbiddenError';
    }
  }
  
  class ConflictError extends CustomError {
    constructor(message = 'Resource conflict') {
      super(message, 409, 'CONFLICT');
      this.name = 'ConflictError';
    }
  }
  
  class RateLimitError extends CustomError {
    constructor(message = 'Rate limit exceeded') {
      super(message, 429, 'RATE_LIMIT_EXCEEDED');
      this.name = 'RateLimitError';
    }
  }
  
  class ServiceUnavailableError extends CustomError {
    constructor(service = 'Service') {
      super(`${service} is currently unavailable`, 503, 'SERVICE_UNAVAILABLE');
      this.name = 'ServiceUnavailableError';
    }
  }
  
  module.exports = {
    errorHandler,
    asyncHandler,
    CustomError,
    ValidationError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    RateLimitError,
    ServiceUnavailableError
  };