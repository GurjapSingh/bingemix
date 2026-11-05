# Plex Show Mixer

Build Plex playlists that mix episodes from several TV shows, and keep them
fresh: watched episodes are removed automatically so a playlist always shows
what is left to watch.

- Search your Plex TV library, pick shows, seasons and episodes
- Mix them **taking turns** between shows or **shuffled**, drag to fine-tune the order
- Preview exactly what will be created (runtime, air dates, ratings, watched status)
- **Auto-update** removes episodes from a playlist once you have watched them
- **Save points** let you reset a playlist to an earlier state
- Several people (and Plex Home profiles) can use one install; each has their own playlists and auto-update

You sign in with Plex (plex.tv/link). Your Plex password is never seen or stored.

## Run with Docker

```bash
docker run -d --name plex-show-mixer -p 6767:6767 \
  -v ./data:/app/data \
  gurjaps/plex-show-mixer:latest
```

Then open <http://localhost:6767>.

Or with Docker Compose, using the included `docker-compose.yml`:

```bash
docker compose up -d
```

Keep the `data/` folder: it holds the app's state, and **back it up**
(see "Token encryption" below).

## Configuration

All settings are optional environment variables.

| Variable | Purpose |
| --- | --- |
| `PORT` | Port to listen on (default `6767`). |
| `TOKEN_ENCRYPTION_KEY` | 32-byte base64 key used to encrypt Plex tokens on disk. See below. |
| `TOKEN_ENCRYPTION_KEY_FILE` | Path to a file (e.g. a Docker secret) containing the key instead. |
| `PLEX_CLIENT_ID` | Fixed identifier Plex uses for this install. Generated and saved to `data/client_id` if unset. |
| `INSTANCE_NAME` | Name shown when another copy of the app sees this one auto-updating a playlist. Defaults to the machine name. |
| `DATA_DIR` | Parent folder for the `data/` directory. |
| `AUTO_UPDATE_POLL_INTERVAL_MS` | How often auto-update checks playlists (default 5 minutes). |

### Token encryption

Auto-update needs to keep your Plex access token so it can work while you are
away. Tokens are stored encrypted (AES-256-GCM). The key comes from, in order:

1. `TOKEN_ENCRYPTION_KEY`
2. `TOKEN_ENCRYPTION_KEY_FILE`
3. a key generated on first run and saved at `data/.encryption_key`

Option 3 works with no setup, but the key then sits next to the data it
protects. For better security set option 1 or 2 and keep the key outside the
data folder. Generate a key with `openssl rand -base64 32`. If the key is lost
or changed, stored tokens cannot be read and people just sign in again.

## Good to know

- Playlists are built from **one Plex server at a time**. A Plex playlist lives
  on a single server and can only contain that server's items.
- If you run more than one copy of the app against the same Plex server, the
  app leaves a short note in the playlist description in Plex
  (`Auto-updated by Plex Show Mixer (...)`) so other copies can warn you that a
  playlist is already being updated elsewhere.

## Development

Requires Node.js 18.18 or newer.

```bash
npm install
cp .env.example .env.local   # optional
npm run dev
```

Open <http://localhost:3000>. `npm run build` and `npm start` make and serve a
production build.

### Tests

```bash
npm test          # run once
npm run test:watch
```

The tests run against a small fake of plex.tv and of Plex Media Servers
(`tests/helpers/plexWorld.js`), so they need no real Plex server. The fake can
have several servers, several TV libraries, Plex Home profiles with PINs, and
unreachable connections. Each test file uses its own temporary data folder.

Built with [Next.js](https://nextjs.org), React, Tailwind CSS and SQLite
(`better-sqlite3`).
