<div align="center">

<img src="src/app/icon.svg" alt="" width="84" height="84">

# Plex Show Mixer

**Build Plex playlists that mix episodes from several TV shows, and keep them
fresh.** Watched episodes are removed automatically, so a playlist always shows
what is left to watch.

[![Docker Image Version](https://img.shields.io/docker/v/gurjaps/plex-show-mixer?sort=semver&logo=docker&label=docker&color=e5a00d)](https://hub.docker.com/r/gurjaps/plex-show-mixer)
[![Docker Pulls](https://img.shields.io/docker/pulls/gurjaps/plex-show-mixer?logo=docker&color=e5a00d)](https://hub.docker.com/r/gurjaps/plex-show-mixer)

<a href="docs/screenshots/dashboard.png">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/dashboard-dark.png">
    <img src="docs/screenshots/dashboard.png" alt="Plex Show Mixer: pick shows, preview the mixed playlist, create it" width="760">
  </picture>
</a>

</div>

## Features

- **Search and pick**: search your Plex TV library, then choose shows, seasons and individual episodes
- **Take turns or shuffle**: alternate between shows, or shuffle everything, then drag rows to fine-tune the order
- **Preview first**: see exactly what will be created (runtime, air dates, ratings, watched status) before it touches Plex
- **Auto-update**: episodes are removed from a playlist once you have watched them
- **Save points**: reset a playlist to an earlier state
- **Multi-user**: several people (and Plex Home profiles) can share one install; each has their own playlists and auto-update
- **Private**: you sign in with Plex (plex.tv/link), and your Plex password is never seen or stored

## Screenshots

<table>
  <tr>
    <td width="50%">
      <a href="docs/screenshots/search.png"><img src="docs/screenshots/search.png" alt="Searching the library"></a>
      <p align="center"><b>Search your library</b><br>Press Enter to add a show</p>
    </td>
    <td width="50%">
      <a href="docs/screenshots/shows.png"><img src="docs/screenshots/shows.png" alt="Choosing seasons and episodes"></a>
      <p align="center"><b>Choose seasons and episodes</b><br>Watched episodes are flagged</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <a href="docs/screenshots/preview.png"><img src="docs/screenshots/preview.png" alt="Playlist preview"></a>
      <p align="center"><b>Preview the mix</b><br>Take turns or shuffle, drag to reorder</p>
    </td>
    <td width="50%">
      <a href="docs/screenshots/playlists.png"><img src="docs/screenshots/playlists.png" alt="Existing playlists with auto-update"></a>
      <p align="center"><b>Manage playlists</b><br>Auto-update, save points, edit, delete</p>
    </td>
  </tr>
</table>

Light and dark themes are built in.

<sub>Screenshots use a fake Plex server with sample shows, so no real library is shown.</sub>

## How it works

1. **Sign in** with Plex using the plex.tv/link code flow.
2. **Pick** a server and a TV library, then search and add shows.
3. **Preview and create**: choose take turns or shuffle, tweak the order, name the playlist.
4. **Turn on auto-update** and watched episodes drop out of the playlist on their own.

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
