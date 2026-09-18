import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { parse } from 'dotenv'

// Generate a private, temporary env file; never put secrets in process arguments.
const local = parse(await readFile('.env.local').catch((error) => { if (error.code === 'ENOENT') return ''; throw error }))
const key = process.env.BOSON_API_KEY || local.BOSON_API_KEY
if (!key || /[\r\n]/.test(key)) throw new Error('Set a valid BOSON_API_KEY in .env.local or the environment.')
const directory = await mkdtemp(path.join(tmpdir(), 'openvoice-deploy-'))
const envFile = path.join(directory, 'runtime.env')
try {
  await writeFile(envFile, [
    `BOSON_API_KEY=${key}`, 'NODE_ENV=production', 'HOST=0.0.0.0', 'PORT=8080',
    'ALLOWED_ORIGINS=https://rudrakshkarpe.com,https://www.rudrakshkarpe.com',
    'DAILY_PROVIDER_REQUEST_LIMIT=300',
  ].join('\n'), { mode: 0o600 })
  const status = await new Promise((resolve, reject) => {
    const child = spawn('npx', ['-y', '@insforge/cli', 'compute', 'deploy', '.', '--name', 'openvoice', '--port', '8080', '--cpu', 'shared-1x', '--memory', '512', '--scale-to-zero', '--env-file', envFile], { stdio: 'inherit' })
    child.on('error', reject); child.on('exit', resolve)
  })
  process.exitCode = typeof status === 'number' ? status : 1
} finally {
  await rm(directory, { recursive: true, force: true })
}
