import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { stat } from 'node:fs/promises'
import path from 'node:path'

const run = promisify(execFile)
export function youtubeUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Paste a valid YouTube video URL.')
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('Paste a complete YouTube URL, starting with https://.') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('Use a public YouTube video URL.')
  const host = url.hostname.toLowerCase()
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1)
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else id = /^\/(?:shorts|embed|live)\/([\w-]{11})\/?$/.exec(url.pathname)?.[1] ?? null
  }
  if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('Use a YouTube video link, not a channel or playlist.')
  // Never pass arbitrary hosts, query strings or user arguments to the downloader.
  return `https://www.youtube.com/watch?v=${id}`
}

export function validateYoutubeInfo(info: { duration?: number; is_live?: boolean; live_status?: string; availability?: string }) {
  if (info.is_live || ['is_live', 'is_upcoming', 'post_live'].includes(info.live_status ?? '')) throw new Error('Live and upcoming videos are not supported. Use a recorded clip.')
  if (!Number.isFinite(info.duration) || !info.duration || info.duration < 1 || info.duration > 600) throw new Error('Choose a YouTube clip between 1 second and 10 minutes.')
  if (info.availability && !['public', 'unlisted'].includes(info.availability)) throw new Error('This video requires access. Upload a local file you have permission to use.')
}

export async function importYoutube(url: string, directory: string, signal: AbortSignal, progress: (message: string, title?: string) => void) {
  const base = ['--ignore-config', '--no-plugin-dirs', '--no-playlist', '--no-cache-dir', '--no-remote-components', '--js-runtimes', `node:${process.execPath}`, '--socket-timeout', '15', '--retries', '1', '--extractor-retries', '1']
  try {
    progress('Checking YouTube video…')
    const fields = '{"title":%(title)j,"duration":%(duration)j,"is_live":%(is_live)j,"live_status":%(live_status)j,"availability":%(availability)j}'
    const { stdout } = await run('yt-dlp', [...base, '--print', fields, '--skip-download', '--', url], { signal, timeout: 45000, maxBuffer: 1024 * 1024 })
    const info = JSON.parse(stdout) as { title?: string; duration?: number; is_live?: boolean; live_status?: string; availability?: string }
    validateYoutubeInfo(info)
    progress('Downloading video…', info.title?.slice(0, 200) || 'YouTube video')
    const file = path.join(directory, 'video.mp4')
    await run('yt-dlp', [...base, '--no-progress', '--max-filesize', '200M', '--match-filters', '!is_live & duration <= 600', '-f', 'bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][ext=mp4]', '--merge-output-format', 'mp4', '-o', file, '--', url], { signal, timeout: 180000, maxBuffer: 1024 * 1024 })
    if ((await stat(file)).size > 200 * 1024 * 1024) throw new Error('This video exceeds the 200 MB demo limit.')
    return file
  } catch (error) {
    if (signal.aborted) throw new Error('Import cancelled.', { cause: error })
    const failure = error as Error & { code?: string; path?: string; stderr?: string; killed?: boolean }
    if (failure.code === 'ENOENT' && !failure.path?.includes('video.mp4')) throw new Error('YouTube import needs yt-dlp on the server. Install it with brew install yt-dlp, then retry.', { cause: error })
    if (failure.killed) throw new Error('YouTube took too long to respond. Retry or upload the file instead.', { cause: error })
    if (failure.stderr || failure.code === 'ENOENT') throw new Error('YouTube could not provide this video. It may be restricted, unavailable, or blocking downloads. Try another public clip or upload a file. No browser cookies are used.', { cause: error })
    throw error
  }
}
