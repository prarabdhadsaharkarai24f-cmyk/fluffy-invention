# Zade Traders POS - AWS EC2 Free Tier Deployment Guide

This guide describes how to deploy the POS application on the **AWS Free Tier** (virtual machine) using Ubuntu Linux, Nginx, and PM2. This setup is **100% free for the first 12 months** and includes permanent SSD storage for your database.

---

## Part 1: Launch EC2 Virtual Machine (AWS Console)

### Step 1: Login & Select region
1. Log in to your [AWS Management Console](https://aws.amazon.com/).
2. Select your nearest AWS Region from the top-right corner (e.g., **Asia Pacific (Mumbai) ap-south-1** for the lowest latency in India).

### Step 2: Launch EC2 Instance
1. In the console search bar, type **EC2** and click the service.
2. In the EC2 Dashboard, click the orange **Launch instance** button.
3. Configure the virtual machine parameters:
   - **Name**: `zade-traders-pos`
   - **Application and OS Images (Amazon Machine Image)**: Select **Ubuntu** (Ubuntu Server 22.04 LTS or 24.04 LTS, SSD Volume - Make sure it is marked as **Free tier eligible**).
   - **Instance Type**: Select `t2.micro` (or `t3.micro` depending on region availability; ensure it is marked **Free tier eligible**).
   - **Key Pair (Login)**: Click **Create new key pair**.
     - **Key pair name**: `pos-key-pair`
     - **Key pair type**: `RSA`
     - **Private key file format**: `.pem`
     - Click **Create key pair**. This automatically downloads `pos-key-pair.pem` to your PC. Keep this file safe; you will need it to connect to the server!

### Step 3: Configure Network (Security Group)
Under **Network settings**, configure firewall rules:
1. Check **Allow SSH traffic from** (Select **Anywhere** or **My IP** for maximum security).
2. Check **Allow HTTP traffic from the internet** (opens Port 80 for public browser access).
3. Check **Allow HTTPS traffic from the internet** (opens Port 443 for secure access).
4. Click **Launch instance** on the right side.

---

## Part 2: Connect to the Server via SSH

Once the instance state is "Running", connect to it from your local machine.

### On Windows PowerShell or git-bash:
1. Open PowerShell and navigate to the folder containing your downloaded `pos-key-pair.pem` file:
   ```powershell
   cd C:\Users\YourUsername\Downloads
   ```
2. Set correct read-only permissions for the key file (required by SSH):
   ```powershell
   icacls .\pos-key-pair.pem /inheritance:r
   icacls .\pos-key-pair.pem /grant:r "$($env:USERNAME):R"
   ```
3. Get your Instance **Public IPv4 Address** from the AWS EC2 dashboard, and connect:
   ```bash
   ssh -i .\pos-key-pair.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
   ```
   *(Type `yes` when prompted to verify server authenticity)*.

---

## Part 3: Configure Environment on AWS

After connecting via SSH, execute the following commands in the remote terminal to install dependencies.

### Step 1: Update Linux Packages
```bash
sudo apt update && sudo apt upgrade -y
```

### Step 2: Install Node.js (Version 20)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```
Verify Node installation:
```bash
node -v
npm -v
```

### Step 3: Install Git & PM2 Process Manager
```bash
sudo apt install git -y
sudo npm install -g pm2
```

---

## Part 4: Clone & Run the Application

### Step 1: Clone Repository
```bash
cd /home/ubuntu
git clone https://github.com/prarabdhadsaharkarai24f-cmyk/fluffy-invention.git pos-app
cd pos-app
```

### Step 2: Setup Environment variables
Create a `.env` file on the server:
```bash
nano .env
```
Copy and paste the configuration keys (change secrets as needed):
```env
PORT=3000
JWT_SECRET=zade_traders_pos_jwt_secret_key_2026
DB_PATH=/home/ubuntu/pos-app/data/pos.db
```
Press `CTRL+O` to write out, `ENTER` to confirm, and `CTRL+X` to exit the nano editor.

### Step 3: Install Dependencies
```bash
npm install --omit=dev
```

### Step 4: Launch POS System under PM2 Monitor
PM2 runs the server in the background and restarts it automatically if the server rebooted or crashed.
```bash
pm2 start server.js --name "pos-system"
```

Save the process list and instruct PM2 to boot on OS startup:
```bash
pm2 save
pm2 startup
```
*(Copy and run the exact command outputted by `pm2 startup` to enable boot scripts).*

---

## Part 5: Configure Nginx Reverse Proxy (Port 80 to 3000)

To allow accessing the site without typing `:3000` in the URL, forward traffic from port 80 to port 3000 using Nginx.

### Step 1: Install Nginx
```bash
sudo apt install nginx -y
```

### Step 2: Configure Proxy Rules
Remove default config and create a new one:
```bash
sudo rm /etc/nginx/sites-enabled/default
sudo nano /etc/nginx/sites-available/pos-app
```
Paste this configuration:
```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Save and close nano (`CTRL+O`, `ENTER`, `CTRL+X`).

### Step 3: Enable configuration & restart Nginx
```bash
sudo ln -s /etc/nginx/sites-available/pos-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Part 6: Verify Deployment

Open your browser and navigate to:
```text
http://<YOUR_EC2_PUBLIC_IP>
```
Your POS application is now live on AWS with permanent database storage!

### Essential Maintenance Commands:
- **View app console logs**: `pm2 logs pos-system`
- **Check server status**: `pm2 status`
- **Restart the POS service**: `pm2 restart pos-system`
- **Download Database File**: Connect via SFTP (using WinSCP or FileZilla) with your `pos-key-pair.pem` and download `/home/ubuntu/pos-app/data/pos.db` for local archiving.
