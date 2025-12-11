# Docker/Portainer Deployment Guide for Bank Transfer Gateway

This guide explains how to add the Bank Transfer Gateway app to your Frappe LMS running in Docker via Portainer.

## Prerequisites

- Frappe LMS running in Docker (via Portainer)
- Access to your Docker container's terminal
- The `payments` app must be installed

---

## Method 1: Using GitHub Repository (Recommended)

### Step 1: Push the App to GitHub

1. Create a new GitHub repository (e.g., `bank_transfer_gateway`)
2. Push this app to your repository:

```bash
cd bank_transfer_gateway
git init
git add .
git commit -m "Initial commit - Bank Transfer Gateway"
git remote add origin https://github.com/YOUR_USERNAME/bank_transfer_gateway.git
git push -u origin main
```

### Step 2: Access Your Docker Container

**Option A: Using Portainer**
1. Open Portainer dashboard
2. Go to **Containers**
3. Find your Frappe/LMS container (usually named something like `frappe_backend` or `erpnext_backend`)
4. Click on the container
5. Click **Console** → Select **/bin/bash** → Click **Connect**

**Option B: Using Docker CLI**
```bash
# List containers to find your Frappe container
docker ps

# Access the container
docker exec -it <container_name> bash
```

### Step 3: Install the App in Your Frappe Site

Inside the container, run:

```bash
# Navigate to frappe-bench directory
cd /home/frappe/frappe-bench

# Get the app from GitHub
bench get-app https://github.com/YOUR_USERNAME/bank_transfer_gateway.git

# Install on your site (replace 'your-site.local' with your actual site name)
bench --site your-site.local install-app bank_transfer_gateway

# Run migrations
bench --site your-site.local migrate

# Clear cache
bench --site your-site.local clear-cache
```

### Step 4: Restart the Container

In Portainer:
1. Go to **Containers**
2. Select your Frappe container
3. Click **Restart**

Or via CLI:
```bash
docker restart <container_name>
```

---

## Method 2: Using Volume Mount (For Development)

If you want to mount the app directly for development:

### Step 1: Find Your Docker Compose File

Locate your `docker-compose.yml` or check in Portainer under **Stacks**.

### Step 2: Add a Volume Mount

Add a volume mount for the apps directory:

```yaml
services:
  backend:
    # ... other config ...
    volumes:
      - ./bank_transfer_gateway:/home/frappe/frappe-bench/apps/bank_transfer_gateway
```

### Step 3: Restart and Install

```bash
docker-compose up -d
docker exec -it <container_name> bash
cd /home/frappe/frappe-bench
bench --site your-site.local install-app bank_transfer_gateway
bench --site your-site.local migrate
```

---

## Method 3: Copy Files Directly to Container

### Step 1: Copy the App to Container

```bash
# From your local machine
docker cp ./bank_transfer_gateway <container_name>:/home/frappe/frappe-bench/apps/
```

### Step 2: Install the App

```bash
docker exec -it <container_name> bash
cd /home/frappe/frappe-bench
bench --site your-site.local install-app bank_transfer_gateway
bench --site your-site.local migrate
```

---

## Post-Installation Configuration

### 1. Configure Bank Transfer Settings

1. Login to your Frappe/LMS site as Administrator
2. Go to **Search** → Type "Bank Transfer Settings"
3. Fill in your bank details:
   - Bank Name (e.g., "Bank of Ceylon")
   - Account Name
   - Account Number
   - Branch Name (optional)
   - Branch Code (optional)
   - SWIFT Code (optional)
   - Currency (LKR for Sri Lanka)
   - Payment Instructions (customize the message)
   - Admin Email (for notifications)
4. Save

### 2. Create Payment Gateway Entry

1. Go to **Search** → Type "Payment Gateway"
2. Click **+ Add Payment Gateway**
3. Set:
   - Gateway Name: "Bank Transfer"
   - Gateway Controller: "Bank Transfer Settings"
4. Save

### 3. Configure LMS Settings (if using Frappe LMS)

1. Go to LMS Settings
2. Under Payment Gateway, select "Bank Transfer"
3. Save

---

## Troubleshooting

### App not found after installation

```bash
bench --site your-site.local clear-cache
bench --site your-site.local clear-website-cache
```

### Permission issues

```bash
# Inside container
chown -R frappe:frappe /home/frappe/frappe-bench/apps/bank_transfer_gateway
```

### Migration errors

```bash
bench --site your-site.local migrate --rebuild-website
```

### Check logs

```bash
# Inside container
tail -f /home/frappe/frappe-bench/logs/frappe.log
```

---

## Finding Your Site Name

If you don't know your site name:

```bash
# Inside the container
cd /home/frappe/frappe-bench
ls sites/
```

The site name is the directory name (e.g., `frontend` or `lms.yoursite.com`).

