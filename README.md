# Threads → Telegram Reposter

**Repost your Threads posts to your Telegram channel automatically.**

- Connect your Threads account once (OAuth).
- Set a “sync from” date (e.g. only new posts from today).
- Add the bot as an **admin** to your Telegram channel.
- New Threads posts are reposted to that channel about every minute (text, images, videos, carousels).

---

## What you need

| Item | Where to get it |
|------|------------------|
| **Telegram Bot** | [@BotFather](https://t.me/botfather) → `/newbot` → copy token and username |
| **Threads App** | [Meta for Developers](https://developers.facebook.com) → create app → add **Threads API** → get App ID & Secret, set redirect URI |
| **Server** | Any host that can run Node.js and reach the internet (e.g. Ubuntu with Docker) |

---

## Quick start (local)

### 1. Clone and install

```bash
git clone <this-repo>
cd bot-threads-reposter
npm install
```

### 2. Database and Redis (Docker)

```bash
docker compose up -d
```

### 3. Environment

```bash
cp env.example .env
```

Edit `.env` and set at least:

- `DATABASE_URL` – PostgreSQL URL (default in env.example matches docker-compose).
- `TELEGRAM_BOT_TOKEN` – from BotFather.
- `TELEGRAM_BOT_USERNAME` – bot username without `@` (e.g. `MyThreadsReposterBot`).
- `BASE_URL` – public URL of this app (e.g. `https://reposter.pavenko.com` for production, or `http://localhost:3000` for local + ngrok).
- `THREADS_APP_ID` and `THREADS_APP_SECRET` – from Meta app.
- `THREADS_REDIRECT_URI` – must be `{BASE_URL}/auth/threads/callback`.

### 4. Database migrations

```bash
npx prisma generate
npx prisma migrate dev
```

### 5. Run

```bash
npm run start:dev
```

For production:

```bash
npm run build
npm run start:prod
# or: pm2 start ecosystem.config.js
```

---

## Threads API setup (Meta)

1. Go to [Meta for Developers](https://developers.facebook.com) and create an app (or use existing).
2. Add the **Threads API** product to the app.
3. In **Threads API → Settings** (or App settings):
   - Set **Valid OAuth Redirect URIs** to: `https://YOUR_DOMAIN/auth/threads/callback` (must match `THREADS_REDIRECT_URI`).
   - Note your **App ID** and **App Secret** → use in `.env` as `THREADS_APP_ID` and `THREADS_APP_SECRET`.
4. For production, request **threads_basic** (and **threads_content_publish** if you plan to create posts). For “repost my posts to Telegram” you mainly need **threads_basic**.

---

## How to use (in Telegram)

1. **Start the bot**  
   Send `/start` to the bot in a private chat.

2. **Connect Threads**  
   Send `/auth`. Open the link, log in with Threads, and allow the app. You’ll be redirected back to Telegram.

3. **Set sync date**  
   Send `/setsyncdate` and enter a date in **YYYY-MM-DD** (e.g. `2024-01-01`). Only posts on or after this date will be reposted.

4. **Add bot to your channel**  
   In your Telegram channel:  
   **Channel → Administrators → Add Administrator** → choose your bot and give it permission to post (e.g. “Post messages”).  
   The bot will register this channel and start reposting your Threads posts there.

5. **Check status**  
   Send `/status` to see connected channels and sync date.  
   Send `/help` for a short reminder of commands.

---

## Bot commands

| Command | Description |
|--------|-------------|
| `/start` | Show status and next steps |
| `/auth` | Link your Threads account (opens browser) |
| `/setsyncdate` | Set “sync from” date (YYYY-MM-DD) |
| `/status` | Show sync date and list of channels |
| `/help` | Short help and setup steps |

---

## How it works

- The app runs a **cron job every 60 seconds**.
- For each user who has linked Threads, set a sync date, and added the bot to at least one channel, it:
  - Calls the Threads API (`/me/threads`) with the user’s long-lived token.
  - Filters posts by your “sync from” date and skips already processed posts.
  - Sends new posts (text + media) to every channel where the bot is admin for that user.
- Processed post IDs are stored so each post is reposted only once.

---

## Project structure

```
src/
├── main.ts                 # Entry point
├── app.module.ts           # Root module
├── health/                 # GET /health for monitoring
├── prisma/                 # Database client
├── threads-auth/           # Threads OAuth (authorize + callback)
├── telegram-bot/           # Bot commands + channel admin detection
│   └── conversations/      # /setsyncdate flow
└── polling/                # Cron: fetch Threads → send to Telegram
```

---

## Environment variables (reference)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `TELEGRAM_BOT_USERNAME` | Yes | Bot username (no @) for OAuth redirect |
| `BASE_URL` | Yes | Public URL of this app (e.g. https://reposter.pavenko.com) |
| `THREADS_APP_ID` | Yes | Meta app ID |
| `THREADS_APP_SECRET` | Yes | Meta app secret |
| `THREADS_REDIRECT_URI` | Yes | Must be `{BASE_URL}/auth/threads/callback` |
| `PORT` | No | Default 3000 |
| `REDIS_HOST`, `REDIS_PORT` | No | Not used by default (cron only); optional for future queue |

---

## Deployment (Ubuntu / server)

- **Infrastructure (Docker):**  
  `./setup-infra.sh` or `./infra-deploy.sh` (see scripts for Docker + UFW).

- **App:**  
  Set `.env` on the server, then:

  ```bash
  npm ci
  npx prisma generate
  npx prisma migrate deploy
  npm run build
  pm2 start ecosystem.config.js
  ```

  Or use the provided `deploy.sh` (pull, install, migrate, build, PM2 reload).

- **Nginx:**  
  Use `nginx.conf` as a template: proxy `https://reposter.pavenko.com` to `http://localhost:3000`, and add SSL (e.g. Let’s Encrypt).

- **Health check:**  
  `GET https://your-domain/health` returns `{ "status": "ok", ... }`.

---

## Troubleshooting

| Problem | What to check |
|--------|----------------|
| Bot doesn’t reply | `TELEGRAM_BOT_TOKEN` correct? Process running? `pm2 logs` or console. |
| “Authentication failed” after Threads login | `THREADS_REDIRECT_URI` exactly matches Meta app; `BASE_URL` and `TELEGRAM_BOT_USERNAME` set; no typos in `.env`. |
| Posts not reposting | User did `/auth`, `/setsyncdate`, and added bot as **admin** to the channel? Token might be expired (re-auth with `/auth`). Check app logs for Threads API errors. |
| Bot can’t post to channel | Bot must be channel **administrator** with “Post messages” (and “Edit messages” if you use that). |

---

## License

MIT
