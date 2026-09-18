# OpenVoice deployment

## Resources

- Website: `https://rudrakshkarpe.com/openvoice/` (GitHub Pages, existing website repository).
- App source: `https://github.com/rudrakshkarpe/open-voice`, branch `main`.
- Website source: `rudrakshkarpe/rudrakshkarpe.com`, branch `upstream-live`.
- InsForge project: `b9f107db-78e0-4b30-b3ce-681932526b3b` (`AWS-hack!`).
- Dashboard: <https://insforge.dev/dashboard/project/b9f107db-78e0-4b30-b3ce-681932526b3b>.
- Compute service: `openvoice`, ID `288f6477-c196-4e89-bcd7-8e0c5431bc4e`.
- Backend: `https://openvoice-b9f107db-78e0-4b30-b3ce-681932526b3b.fly.dev`.

InsForge manages the underlying Fly infrastructure; no personal Fly or Google Cloud billing account is used. Use InsForge commands for lifecycle operations, not a separately authenticated `flyctl deploy`.

## Architecture

The existing website stays on GitHub Pages. Its deployment workflow builds a pinned OpenVoice commit with `VITE_BASE_PATH=/openvoice/` and `VITE_API_ORIGIN` set to the compute endpoint, then includes that output at `dist/openvoice/`. Other site content and domain DNS are unchanged.

The browser uploads media directly to the compute backend. SSE, translated WAV sections, extracted audio and imported videos all use that backend origin. Native media playback retains HTTP range support. CORS permits the website's HTTPS origins. Browser previews continue to use Vite's local API proxy without a configured API origin.

The container runs Node 22 as the unprivileged `node` user, with FFmpeg, ffprobe, Python and yt-dlp installed. The Node server listens on `0.0.0.0:8080` inside the container. It keeps the existing progressive speech pipeline; this is not an Edge Function or a migration to InsForge's AI gateway.

## Free-plan constraints

The linked organization was verified on the **Free** plan with no paid subscription. Only one default-spec service (`shared-1x`, 512 MB) is provisioned, with scale-to-zero explicitly enabled. No paid upgrade is authorized.

InsForge advertises 120 Custom Compute hours/month at the default spec, plus 1 GB storage and 5 GB bandwidth. Check the account's live usage before demos; these are allowances, not unlimited hosting. [Current pricing](https://insforge.dev/pricing).

Cold starts are expected after idle shutdown. Jobs live in memory and temporary files; a restart, new image or environment change invalidates existing sessions. Users must re-upload after that. Browser connections can keep the service active; stop the demo service after events if it is no longer needed. There is no durable media library in this deployment.

Boson is a separate provider with its own credits/billing. InsForge's free hosting does not make speech generation free. The optional InsForge agent-memory helper refused writes on the Free plan; no upgrade was made, and this repository is the deployment record instead.

## Public-demo safeguards

- 200 MB and 10 minutes per clip, at most two incoming uploads and two source-processing jobs.
- At most eight retained media sessions; expired disconnected sessions are removed after an hour.
- Three translated languages per video in production. Existing generated languages remain selectable.
- A shared daily limit of 300 Boson requests, including transcription, translation and synthesis retries. This counter resets at UTC midnight **or server restart**. It is an abuse guard, not a monetary billing cap; configure provider-side spending controls separately.
- The legacy endpoint issuing browser-accessible Boson session credentials is disabled in production.
- The project/API credentials and runtime secrets are excluded from Git and Docker build context.

This is a bounded public hackathon demo, not a multi-tenant production service. Job IDs are unguessable capability URLs; anyone with a job URL can access its temporary media. Do not upload sensitive/private media. Authentication, durable per-user quotas and a durable job queue are future work. YouTube may block cloud-hosted downloaders even when a video is public; authorized local uploads remain the fallback.

## Deploy or update the backend

Prerequisites: Node 22+, `flyctl` installed (used internally by the InsForge CLI for remote image builds), and a linked InsForge session.

```sh
npx -y @insforge/cli link --project-id b9f107db-78e0-4b30-b3ce-681932526b3b
npx -y @insforge/cli billing status --json
npx -y @insforge/cli usage --json
npm ci
npm run lint
npm test
npm run build
node scripts/deploy-insforge.mjs
```

The deploy script reads only `BOSON_API_KEY` from the shell or `.env.local`, creates a mode-0600 temporary environment file, invokes `compute deploy` with the default free hardware and idle shutdown, then removes that temporary file. It never puts the secret in command arguments. Runtime variables:

| Variable | Value/purpose |
| --- | --- |
| `BOSON_API_KEY` | Server-only speech credential |
| `NODE_ENV` | `production` |
| `HOST` / `PORT` | `0.0.0.0` / `8080` |
| `ALLOWED_ORIGINS` | `https://rudrakshkarpe.com,https://www.rudrakshkarpe.com` |
| `DAILY_PROVIDER_REQUEST_LIMIT` | `300` |

`.insforge/project.json` is an admin credential, **not** frontend configuration. `.env.local`, `.insforge/`, generated `fly.toml` and secrets are ignored. Do not copy local credentials into GitHub Pages or `VITE_` variables.

The only public frontend settings are the base path and backend origin:

```sh
VITE_BASE_PATH=/openvoice/ \
VITE_API_ORIGIN=https://openvoice-b9f107db-78e0-4b30-b3ce-681932526b3b.fly.dev \
npm run build
```

The website workflow pins the OpenVoice commit for reproducibility. After pushing a tested app change, update that ref in the website's `.github/workflows/deploy.yml`, commit it and push `upstream-live`. GitHub Pages builds and publishes the combined site. Backend deployment is deliberately explicit, not triggered by every documentation push.

## Verification and operations

```sh
curl -fsS https://openvoice-b9f107db-78e0-4b30-b3ce-681932526b3b.fly.dev/api/health
npx -y @insforge/cli compute get 288f6477-c196-4e89-bcd7-8e0c5431bc4e --json
npx -y @insforge/cli usage --json
```

Health reports process readiness and whether a speech key is configured, not end-to-end provider health. Test a sample upload, source captions, Italian translation, another language switch and pause/seek from the **website origin** after deployment. Check browser console errors and cross-origin requests. Check that the existing homepage still works.

To stop/start without deleting the service:

```sh
npx -y @insforge/cli compute stop 288f6477-c196-4e89-bcd7-8e0c5431bc4e
npx -y @insforge/cli compute start 288f6477-c196-4e89-bcd7-8e0c5431bc4e
```

For rollback, restore the website workflow's previous app commit and redeploy Pages. Restore the prior backend image with `compute update <service-id> --image <recorded-image-url>`; image updates interrupt active jobs. Keep the previous image URL from `compute get` before redeploying. Never delete the whole project to roll back an application change.
