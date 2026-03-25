/**
 * Global error handler middleware
 */

function errorHandler(err, req, res, next) {
  // Log error internally
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  // CORS error
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: 'CORS error', message: err.message });
  }

  // Validation / JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // Anthropic API errors
  if (err.constructor?.name === 'APIError') {
    return res.status(err.status || 500).json({
      error: 'AI service error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'AI service temporarily unavailable'
    });
  }

  // Default
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
}

module.exports = { errorHandler };
