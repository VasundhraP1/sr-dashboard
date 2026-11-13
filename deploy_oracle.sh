#!/usr/bin/env bash
set -e

echo "======================================================"
echo " Steady Rabbit Console - Automated Oracle Cloud Setup"
echo "======================================================"

# 1. Update package lists
echo "--> Updating system packages..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update -y
    sudo apt-get install -y curl git ufw iptables
elif command -v dnf &> /dev/null; then
    sudo dnf update -y
    sudo dnf install -y curl git iptables
fi

# 2. Configure 2GB Swap (Essential for 1GB RAM instances)
echo "--> Checking swap space..."
if [ $(swapon --show | wc -l) -le 1 ]; then
    echo "Creating 2GB swapfile..."
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi
    echo "Swap created successfully."
else
    echo "Swap is already active."
fi

# 3. Install Node.js LTS (v20+) if not installed
echo "--> Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs || sudo dnf install -y nodejs
fi
echo "Node.js $(node -v) installed."

# 4. Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2 process manager..."
    sudo npm install -g pm2
fi

# 5. Fix Oracle Cloud Internal Firewall (Ubuntu/Oracle Linux iptables)
echo "--> Configuring firewall for Port 5000..."
if command -v iptables &> /dev/null; then
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 5000 -j ACCEPT || sudo iptables -I INPUT 1 -p tcp --dport 5000 -j ACCEPT
    # Persist iptables rules across reboots
    if command -v netfilter-persistent &> /dev/null; then
        sudo netfilter-persistent save
    elif [ -f /etc/debian_version ]; then
        echo iptables-persistent iptables-persistent/autosave_v4 boolean true | sudo debconf-set-selections
        echo iptables-persistent iptables-persistent/autosave_v6 boolean true | sudo debconf-set-selections
        sudo apt-get install -y iptables-persistent
    fi
fi
if command -v ufw &> /dev/null; then
    sudo ufw allow 22/tcp || true
    sudo ufw allow 5000/tcp || true
fi

# 6. Install Project Dependencies
echo "--> Installing project dependencies..."
npm install --omit=dev

# 7. Start / Restart with PM2
echo "--> Starting Steady Rabbit Console with PM2..."
pm2 stop sr-dashboard 2>/dev/null || true
pm2 delete sr-dashboard 2>/dev/null || true
pm2 start server.js --name "sr-dashboard" --node-args="--max-old-space-size=512"

# 8. Save PM2 startup
pm2 save
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

echo "======================================================"
echo " Steady Rabbit Console successfully deployed!"
echo " Status: Running on Port 5000"
echo " Process: $(pm2 list | grep sr-dashboard || true)"
echo "======================================================"
