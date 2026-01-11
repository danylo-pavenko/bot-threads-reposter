# Threads-to-Telegram Reposter Bot

A NestJS service that automatically syncs Threads posts to Telegram channels using the Threads API and GrammyJS.

## Features

- 🔐 OAuth2 authentication with Threads API
- 📅 Configurable sync start date
- 🔄 Automatic polling every 60 seconds
- 📢 Multi-channel support
- 🎨 Supports images and videos
- 💾 PostgreSQL database with Prisma ORM
- ⚡ Redis for caching and task queues
- 🚀 Production-ready deployment scripts

## Tech Stack

- **Framework:** NestJS
- **Bot Library:** GrammyJS (`@grammyjs/nestjs`, `@grammyjs/conversations`)
- **Database:** PostgreSQL + Prisma
- **Cache/Queue:** Redis + BullMQ
- **Process Manager:** PM2
- **Web Server:** Nginx

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- PostgreSQL (via Docker)
- Redis (via Docker)
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Threads API App ID and Secret (from [Meta for Developers](https://developers.facebook.com))

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd bot-threads-reposter
npm install
```

### 2. Setup Infrastructure

```bash
# Run infrastructure setup (installs Docker, starts containers)
sudo ./setup-infra.sh

# Or manually start containers
docker compose up -d
```

### 3. Configure Environment

```bash
cp env.example .env
# Edit .env with your configuration
```

Required environment variables:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/threads_reposter?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Server
PORT=3000
BASE_URL=https://reposter.pavenko.com

# Threads API (Meta)
THREADS_APP_ID=1508003770281677
THREADS_APP_SECRET=your_threads_app_secret_here
THREADS_REDIRECT_URI=https://reposter.pavenko.com/auth/threads/callback

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

### 4. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev
```

### 5. Development

```bash
# Start in development mode
npm run start:dev
```

### 6. Production Deployment

```bash
# Build the project
npm run build

# Start with PM2
pm2 start ecosystem.config.js

# Or use deployment script
./deploy.sh
```

## Configuration

### Threads API Setup

1. Go to [Meta for Developers](https://developers.facebook.com)
2. Create a new app
3. Add the Threads API product
4. Configure OAuth redirect URI: `https://reposter.pavenko.com/auth/threads/callback`
5. Get your App ID and App Secret
6. Add to `.env` file

### Telegram Bot Setup

1. Contact [@BotFather](https://t.me/botfather) on Telegram
2. Create a new bot: `/newbot`
3. Get your bot token
4. Add to `.env` file
5. Add the bot as an administrator to your Telegram channels

## Usage

### For Users

1. Start the bot: `/start` in Telegram
2. Authenticate: `/auth` (opens Threads OAuth)
3. Set sync date: `/setsyncdate` (format: YYYY-MM-DD)
4. Add bot to channels: Add the bot as an admin to your Telegram channels
5. Wait for posts to sync automatically

### Bot Commands

- `/start` - Start the bot and check status
- `/auth` - Authenticate with Threads API
- `/setsyncdate` - Set the sync start date
- `/status` - Check your current configuration

## Project Structure

```
bot-threads-reposter/
├── src/
│   ├── main.ts                 # Application entry point
│   ├── app.module.ts           # Root module
│   ├── prisma/                 # Prisma service and module
│   ├── redis/                  # Redis service
│   ├── threads-auth/           # Threads OAuth2 authentication
│   ├── telegram-bot/           # Telegram bot handlers
│   │   └── conversations/      # Bot conversations
│   └── polling/                # Polling service (cron jobs)
├── prisma/
│   └── schema.prisma           # Database schema
├── docker-compose.yml          # Docker services
├── ecosystem.config.js         # PM2 configuration
├── nginx.conf                  # Nginx configuration
├── deploy.sh                   # Deployment script
└── infra-deploy.sh             # Infrastructure setup script
```

## Database Schema

- **User**: Stores Telegram user data, Threads tokens, and sync configuration
- **Channel**: Stores Telegram channels where the bot is admin
- **ProcessedPost**: Tracks which Threads posts have been synced

## API Endpoints

- `GET /auth/threads/authorize?telegramId=<id>` - Initiate OAuth flow
- `GET /auth/threads/callback` - OAuth callback handler

## Deployment

### Server Setup

1. **Infrastructure Deployment:**
   ```bash
   sudo ./infra-deploy.sh
   ```

2. **Application Deployment:**
   ```bash
   ./deploy.sh
   ```

3. **Nginx Configuration:**
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/reposter.pavenko.com
   sudo ln -s /etc/nginx/sites-available/reposter.pavenko.com /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **SSL Certificate (Let's Encrypt):**
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot --nginx -d reposter.pavenko.com
   ```

## Monitoring

- **PM2 Status:**
  ```bash
  pm2 status
  pm2 logs threads-reposter
  ```

- **Database:**
  ```bash
  npx prisma studio
  ```

- **Docker Containers:**
  ```bash
  docker ps
  docker logs threads-reposter-postgres
  docker logs threads-reposter-redis
  ```

## Troubleshooting

### Bot not responding
- Check if the bot token is correct in `.env`
- Verify the bot is running: `pm2 status`
- Check logs: `pm2 logs threads-reposter`

### OAuth not working
- Verify redirect URI matches Threads API configuration
- Check BASE_URL in `.env`
- Check server logs for errors

### Posts not syncing
- Verify user has set sync start date
- Check if bot is admin in channels
- Verify Threads token is not expired
- Check polling service logs

## License

MIT
