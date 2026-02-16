# Docker Deployment

This project includes a `docker-compose.yml` file for easy deployment.

## Environment Variables

Required:
- `JELLYFIN_HOST` — Full URL to your Jellyfin server (e.g. `https://jellyfin.example.com`)
- `JELLYFIN_USERNAME`
- `JELLYFIN_PASSWORD`

Optional (see `.env.example` for defaults):
- `WEBSERVER_PORT` — Port the server listens on (default: `4000`)
- `AUTH_USERNAME` / `AUTH_PASSWORD` — Enable basic auth on the web interface (recommended for production)
- `AUDIO_BITRATE`, `VIDEO_BITRATE`, `MAX_AUDIO_CHANNELS`, `MAX_HEIGHT`, `MAX_WIDTH`

## Deployment

1. Copy `.env.example` to `.env` and fill in the required values
2. Deploy with `docker compose up -d`

Service runs on port 4000 by default.
