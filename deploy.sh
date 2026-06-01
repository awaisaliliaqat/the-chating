#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  THE CHATING — EC2 Auto-Deploy Script
#  Server: 47.129.200.84  |  User: ec2-user
#  Run this ONCE on the server after SSH-ing in
# ─────────────────────────────────────────────────────────────────
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  THE CHATING — Deploying to EC2"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. System packages ────────────────────────────────────────────
echo "[1/7] Installing system packages..."
sudo yum update -y -q
sudo yum install -y git python3 python3-pip nginx -q

# Install Node.js 18
if ! command -v node &> /dev/null; then
  curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash - > /dev/null 2>&1
  sudo yum install -y nodejs -q
fi
echo "      Node $(node -v)  |  Python $(python3 --version)"

# ── 2. Clone / update repo ────────────────────────────────────────
echo "[2/7] Cloning repo..."
cd /home/ec2-user
if [ -d "the-chating" ]; then
  cd the-chating && git pull
else
  git clone https://github.com/awaisaliliaqat/the-chating.git
  cd the-chating
fi

# ── 3. Backend setup ──────────────────────────────────────────────
echo "[3/7] Setting up backend..."
cd /home/ec2-user/the-chating/backend
pip3 install -r requirements.txt -q

# Write .env
cat > .env << 'ENVEOF'
SECRET_KEY=thechating2024supersecretkey99xz
FLASK_ENV=production
ADMIN_EMAILS=aariz123awais@gmail.com
FRONTEND_URL=http://47.129.200.84
ENVEOF

# Run DB migrations
python3 -c "from database import init_db; init_db()" && echo "      DB migrations OK"

# ── 4. Backend systemd service ────────────────────────────────────
echo "[4/7] Creating backend service..."
sudo bash -c 'cat > /etc/systemd/system/thechating.service << EOF
[Unit]
Description=THE CHATING Backend
After=network.target

[Service]
User=ec2-user
WorkingDirectory=/home/ec2-user/the-chating/backend
Environment="PATH=/usr/local/bin:/usr/bin:/bin:/home/ec2-user/.local/bin"
ExecStart=/usr/local/bin/gunicorn --worker-class eventlet -w 1 --bind 127.0.0.1:5001 app:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl daemon-reload
sudo systemctl enable thechating
sudo systemctl restart thechating
sleep 2
sudo systemctl is-active thechating && echo "      Backend service running ✓" || echo "      ERROR: backend service failed"

# ── 5. Frontend build ─────────────────────────────────────────────
echo "[5/7] Building frontend..."
cd /home/ec2-user/the-chating/frontend
npm install --silent

# Write production env
echo "VITE_API_BASE=http://47.129.200.84" > .env.production

npm run build
echo "      Frontend built ✓"

# ── 6. Nginx config ───────────────────────────────────────────────
echo "[6/7] Configuring nginx..."
sudo bash -c 'cat > /etc/nginx/conf.d/thechating.conf << EOF
server {
    listen 80;
    server_name 47.129.200.84;

    # Serve React app
    root /home/ec2-user/the-chating/frontend/dist;
    index index.html;

    # API → Flask
    location /api/ {
        proxy_pass         http://127.0.0.1:5001/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }

    # Socket.IO (WebSocket + polling)
    location /socket.io/ {
        proxy_pass         http://127.0.0.1:5001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_read_timeout 86400s;
    }

    # SPA — all other routes serve index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF'

# Remove default nginx site if it exists
sudo rm -f /etc/nginx/conf.d/default.conf

sudo nginx -t && echo "      Nginx config OK ✓"
sudo systemctl enable nginx
sudo systemctl restart nginx
sleep 1
sudo systemctl is-active nginx && echo "      Nginx running ✓" || echo "      ERROR: nginx failed"

# Fix permissions so nginx can read frontend files
chmod 755 /home/ec2-user
chmod -R 755 /home/ec2-user/the-chating/frontend/dist

# ── 7. Open firewall ──────────────────────────────────────────────
echo "[7/7] Done!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ THE CHATING is LIVE!"
echo ""
echo "  🌐 Open:        http://47.129.200.84"
echo "  🛡️  Admin panel: http://47.129.200.84/admin"
echo "  📋 Backend logs: sudo journalctl -u thechating -f"
echo "  🔄 Restart app:  sudo systemctl restart thechating"
echo "  🔄 Update app:   cd ~/the-chating && git pull && bash deploy.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
