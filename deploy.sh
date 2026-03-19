#!/bin/bash
set -euo pipefail

# ============================================================
# FastRAG Deployment Script for Ubuntu 22.04 EC2
# SSL/Domain config is commented out - enable when ready
# Image pulled from Docker Hub (lightsspeed/fastrag:latest)
# ============================================================

# DOMAIN="rag.deployone.cloud"   # TODO: Uncomment when domain is configured
APP_DIR="/opt/fastrag"
WEB_DIR="/var/www/fastrag"
REPO_URL="https://github.com/lightsspeed/Rag_2026.git"

echo "================================================"
echo "  FastRAG Deployment"
echo "================================================"

# --- 1. System Updates ---
echo "[1/7] Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# --- 2. Install Docker ---
echo "[2/7] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker $USER
fi
sudo systemctl enable docker
sudo systemctl start docker
sudo apt-get install -y docker-compose-plugin

# --- 3. Install Nginx & Certbot ---
echo "[3/7] Installing Nginx & Certbot..."
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx

# --- 4. Install Node.js 20 ---
echo "[4/7] Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# --- 5. Clone Repo & Build Frontend ---
echo "[5/7] Cloning repository and building frontend..."
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

if [ -d "$APP_DIR/.git" ]; then
    cd $APP_DIR && git pull origin main
else
    git clone $REPO_URL $APP_DIR
fi

cd $APP_DIR/frontend
npm ci
npm run build

sudo mkdir -p $WEB_DIR
sudo cp -r dist/* $WEB_DIR/
sudo chown -R www-data:www-data $WEB_DIR

# --- 6. Configure Nginx ---
echo "[6/7] Configuring Nginx..."
sudo cp $APP_DIR/nginx/fastrag.conf /etc/nginx/sites-available/fastrag
sudo ln -sf /etc/nginx/sites-available/fastrag /etc/nginx/sites-enabled/fastrag
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# --- 7. SSL Certificate (disabled - uncomment when domain is configured) ---
# echo "[7/7] Obtaining SSL certificate..."
# sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@deployone.cloud

# --- Pre-pull Docker image ---
echo "Pulling FastRAG Docker image from Docker Hub..."
sudo docker pull lightsspeed/fastrag:latest

echo ""
echo "================================================"
echo "  Infrastructure ready!"
echo "================================================"
echo ""
echo "Next steps:"
echo "  1. Create your .env file:"
echo "     cp $APP_DIR/.env.production.example $APP_DIR/.env"
echo "     nano $APP_DIR/.env  # Fill in your secrets"
echo ""
echo "  2. Start the application:"
echo "     cd $APP_DIR"
echo "     sudo docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "  3. Verify:"
echo "     curl http://localhost/health"
echo ""
echo "  App will be live at: http://YOUR_SERVER_IP"
echo "  Admin panel at:      http://YOUR_SERVER_IP/admin"
# NOTE: SSL is disabled. To enable, uncomment step 7 and set DOMAIN variable.
echo "================================================"
