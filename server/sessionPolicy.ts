export const MAX_SESSIONS = 8
export const IDLE_SESSION_MS = 2 * 60 * 1000
export function sessionExpired(lastSeenAt: number, listeners: number, now = Date.now()) {
  return listeners === 0 && now - lastSeenAt >= IDLE_SESSION_MS
}
