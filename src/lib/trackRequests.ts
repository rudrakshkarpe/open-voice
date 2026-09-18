export function shouldRefreshTrack(state: string | undefined, failed: boolean, elapsed: number, moved: number) {
  return !failed && state !== 'ready' && state !== 'error' && elapsed > 2000 && Math.abs(moved) > 1
}
