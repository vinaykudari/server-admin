# Server Admin Dashboard

Production-ready React + TypeScript dashboard for Vinay's server operations.

## Architecture

- `apps/client`: React + Vite UI.
- `apps/server`: Express API + static asset server.
- `apps/server/src/services`: data access layer (read runbook/tasks).
- `apps/server/src/routes`: HTTP routes.
- `apps/server/src/utils`: paths + environment.

### Extension Points

- Add new data sources: `apps/server/src/services/*` + route in `apps/server/src/routes/*`.
- Add UI views: `apps/client/src/components/*` + wire in `apps/client/src/App.tsx`.
- Add background jobs: extend server with schedulers or move to separate worker service.

## Commands

- `npm install`
- `npm run build`
- `npm run lint`
- `npm run dev` (starts server in watch mode)

## Runtime Configuration

Server environment variables:

- `PORT` (default `4175`)
- `WORKSPACE_ROOT` (default `/root/.openclaw/workspace`)
- `CLIENT_DIST_PATH` (defaults to `apps/client/dist`)

## Deployment Notes

- Build outputs:
  - UI: `apps/client/dist`
  - API: `apps/server/dist`
- Systemd service runs `node apps/server/dist/index.js` in `/srv/apps/server-admin`.
- Nginx reverse proxies `server.vinaykudari.com` to `127.0.0.1:4175`.

## Rollback

1. Stop service: `systemctl stop server-admin`
2. Disable service: `systemctl disable server-admin`
3. Restore previous nginx config (see RUNBOOK entry)
4. Reload nginx: `systemctl reload nginx`
