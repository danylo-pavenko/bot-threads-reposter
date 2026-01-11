#!/bin/bash

# Infrastructure deployment script for Threads-to-Telegram Reposter
# This script sets up Docker containers and configures firewall rules

set -e

echo "🚀 Starting infrastructure deployment..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run as root (use sudo)"
  exit 1
fi

# Update system packages
echo "📦 Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    
    # Install prerequisites
    apt-get install -y \
        ca-certificates \
        curl \
        gnupg \
        lsb-release
    
    # Add Docker's official GPG key
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Set up the repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker Engine
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    echo "✅ Docker installed successfully"
else
    echo "✅ Docker is already installed"
fi

# Install Docker Compose if not present
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Installing..."
    apt-get install -y docker-compose-plugin
    echo "✅ Docker Compose installed"
else
    echo "✅ Docker Compose is available"
fi

# Start Docker containers
echo "🐳 Starting Docker containers..."
cd "$(dirname "$0")"
docker compose up -d

# Wait for containers to be ready
echo "⏳ Waiting for containers to be ready..."
sleep 10

# Check if containers are running
if docker ps | grep -q threads-reposter-postgres && docker ps | grep -q threads-reposter-redis; then
    echo "✅ Docker containers are running"
else
    echo "❌ Docker containers failed to start"
    exit 1
fi

# Configure firewall (UFW)
echo "🔥 Configuring firewall..."

# Check if UFW is installed
if ! command -v ufw &> /dev/null; then
    echo "📦 Installing UFW..."
    apt-get install -y ufw
fi

# Enable UFW if not already enabled
if ! ufw status | grep -q "Status: active"; then
    echo "🔐 Enabling UFW..."
    ufw --force enable
fi

# Allow SSH (important - don't lock yourself out!)
echo "🔓 Allowing SSH (port 22)..."
ufw allow 22/tcp

# Allow HTTP and HTTPS
echo "🔓 Allowing HTTP (port 80)..."
ufw allow 80/tcp

echo "🔓 Allowing HTTPS (port 443)..."
ufw allow 443/tcp

# Allow application port (if needed for direct access)
echo "🔓 Allowing application port (port 3000)..."
ufw allow 3000/tcp

# Show firewall status
echo "📊 Firewall status:"
ufw status

echo "✅ Infrastructure deployment completed successfully!"
echo ""
echo "📝 Next steps:"
echo "   1. Copy env.example to .env and configure environment variables"
echo "   2. Run: npm install"
echo "   3. Run: npx prisma migrate dev"
echo "   4. Run: npm run build"
echo "   5. Run: ./deploy.sh"
