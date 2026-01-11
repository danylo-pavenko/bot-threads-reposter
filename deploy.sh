#!/bin/bash

# Deployment script for Threads-to-Telegram Reposter
# This script pulls from Git, installs dependencies, runs migrations, builds, and restarts PM2

set -e

echo "🚀 Starting deployment process..."

# Navigate to project directory (adjust if needed)
cd "$(dirname "$0")"

# Pull latest changes from Git
echo "📥 Pulling latest changes from Git..."
git pull origin main || git pull origin master

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "🗄️  Running database migrations..."
npx prisma migrate deploy

# Build the project
echo "🔨 Building project..."
npm run build

# Restart PM2 process
echo "🔄 Restarting PM2 process..."
pm2 reload ecosystem.config.js || pm2 start ecosystem.config.js

echo "✅ Deployment completed successfully!"
echo "📊 Check status with: pm2 status"
echo "📝 View logs with: pm2 logs threads-reposter"
