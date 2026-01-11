#!/bin/bash

# Setup Infrastructure Script for Threads-to-Telegram Reposter
# This script installs Docker/Docker-compose and starts containers

set -e

echo "🚀 Setting up infrastructure for Threads-to-Telegram Reposter..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "📦 Docker is not installed. Installing Docker..."
    
    # Update package index
    sudo apt-get update
    
    # Install prerequisites
    sudo apt-get install -y \
        ca-certificates \
        curl \
        gnupg \
        lsb-release
    
    # Add Docker's official GPG key
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Set up the repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker Engine
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    echo "✅ Docker installed successfully"
else
    echo "✅ Docker is already installed"
fi

# Check if Docker Compose is available (as plugin)
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please install Docker Compose plugin."
    exit 1
else
    echo "✅ Docker Compose is available"
fi

# Start containers
echo "🐳 Starting Docker containers..."
docker compose up -d

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker exec threads-reposter-postgres pg_isready -U postgres &> /dev/null; then
        echo "✅ PostgreSQL is ready"
        break
    fi
    attempt=$((attempt + 1))
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ PostgreSQL failed to start"
    exit 1
fi

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to be ready..."
attempt=0
while [ $attempt -lt $max_attempts ]; then
    if docker exec threads-reposter-redis redis-cli ping &> /dev/null; then
        echo "✅ Redis is ready"
        break
    fi
    attempt=$((attempt + 1))
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ Redis failed to start"
    exit 1
fi

echo "✅ Infrastructure setup complete!"
echo "📝 Next steps:"
echo "   1. Copy .env.example to .env and configure environment variables"
echo "   2. Run: npm install"
echo "   3. Run: npx prisma migrate dev"
echo "   4. Run: npm run build"
echo "   5. Run: npm run start:prod"
