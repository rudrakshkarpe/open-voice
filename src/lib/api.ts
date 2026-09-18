// Public backend origin only. Credentials must never be VITE_ variables.
export function createApiUrl(origin = '') {
  const base = origin.trim().replace(/\/$/, '')
  if (base) {
    const parsed = new URL(base)
    if (parsed.origin !== base || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('VITE_API_ORIGIN must be an HTTP(S) origin without a path or credentials.')
  }
  return (path: string) => {
    if (!path.startsWith('/api/') || path.includes('\\') || path.includes('..')) throw new Error('Expected an API path.')
    return `${base}${path}`
  }
}

export const apiUrl = createApiUrl(import.meta.env?.VITE_API_ORIGIN ?? '')
