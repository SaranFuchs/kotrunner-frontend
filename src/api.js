export class ApiError extends Error {
  constructor(message, status, code, retryAfter = 60) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter; }
}

export async function api(path, body, options = {}) {
  let response;
  try {
    response = await fetch(`/api/v1${path}`, {
      credentials: 'same-origin',
      ...options,
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach KotRunner. Check your connection and retry.', 0, 'network_error');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('kotrunner-session-expired'));
    throw new ApiError(data?.message || 'The service is temporarily unavailable. Please retry.', response.status, data?.code, Number(response.headers.get('Retry-After')) || 60);
  }
  return data;
}
