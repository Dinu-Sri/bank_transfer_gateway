# Docker Frappe/LMS Troubleshooting Guide

This document records common issues encountered with the Docker deployment and their solutions.

---

## Issue 1: CSS Assets 404 Errors (Broken Website Styling)

### Symptoms
- Website appears unstyled (raw HTML with no CSS)
- Browser DevTools shows 404 errors for CSS files like:
  - `website.bundle.XXXXXXXX.css`
  - `lms.bundle.XXXXXXXX.css`

### Root Cause
The Docker setup has multiple `assets.json` files across different containers and locations. These files map bundle names to hashed filenames. When there's a **mismatch** between:
1. The hash in `assets.json` (what the HTML requests)
2. The actual CSS filename on disk (what nginx serves)

...you get 404 errors.

### Key Locations to Check

**Backend Container:**
```bash
/home/frappe/frappe-bench/sites/assets/assets.json
/home/frappe/frappe-bench/sites/frontend/assets/assets.json
/home/frappe/frappe-bench/sites/frontend/public_assets/assets.json
```

**Frontend Container:**
```bash
/home/frappe/frappe-bench/sites/assets/assets.json
```

### Diagnosis Steps

1. **Find what hash the browser is requesting** - Open DevTools > Network tab > filter "css" > look at 404 URLs

2. **Check what hash assets.json has:**
   ```bash
   cat /home/frappe/frappe-bench/sites/assets/assets.json | grep -E "website|lms"
   ```

3. **Check what CSS files actually exist:**
   ```bash
   ls /home/frappe/frappe-bench/sites/assets/frappe/dist/css/ | grep website
   ls /home/frappe/frappe-bench/sites/assets/lms/dist/css/ | grep lms
   ```

4. **Find ALL assets.json files:**
   ```bash
   find /home/frappe/frappe-bench/sites -name "assets.json" 2>/dev/null
   ```

### Solution

**Option A: Update assets.json to match existing files**
```bash
# Replace OLD_HASH with the hash in assets.json
# Replace NEW_HASH with the hash of actual files on disk
sed -i 's/OLD_HASH/NEW_HASH/g' assets.json
```

**Option B: Copy CSS files to match assets.json (RECOMMENDED)**

This is the preferred approach - copy existing CSS files with new names matching what the backend requests.

```bash
cd /home/frappe/frappe-bench/sites/assets/frappe/dist/css/

# Copy each CSS file to match the requested hash
# Format: cp EXISTING_FILE.css REQUESTED_FILE.css
cp website.bundle.EXISTING_HASH.css website.bundle.NEEDED_HASH.css

cd /home/frappe/frappe-bench/sites/assets/lms/dist/css/
cp lms.bundle.EXISTING_HASH.css lms.bundle.NEEDED_HASH.css
```

### Comprehensive Fix Example (December 2025)

When multiple CSS files have hash mismatches, copy ALL of them:

```bash
cd /home/frappe/frappe-bench/sites/assets/frappe/dist/css/

# Check what hashes are REQUESTED (in browser DevTools 404 errors)
# Check what hashes EXIST (ls command)
# Copy each existing file to the requested name

cp desk.bundle.WLNLGKVI.css desk.bundle.NJXEJGIV.css
cp desk.bundle.WLNLGKVI.css desk.bundle.PWLLNP3E.css
cp email.bundle.XXMYT5LP.css email.bundle.2C5XBSJN.css
cp login.bundle.SP4OKUVQ.css login.bundle.EXUUQIHG.css
cp login.bundle.SP4OKUVQ.css login.bundle.6J4DKKOV.css
cp print.bundle.3EJLHQ27.css print.bundle.JG3GOTZJ.css
cp print_format.bundle.6YM6Q2T4.css print_format.bundle.54GOTS6X.css
cp report.bundle.K2JXPPS5.css report.bundle.VGK7PVOE.css
cp report.bundle.K2JXPPS5.css report.bundle.M6ES2620.css
cp web_form.bundle.PUMC6NCU.css web_form.bundle.O3NDWJJI.css
cp website.bundle.XRE5YRZD.css website.bundle.2Y6FVZRW.css

cd /home/frappe/frappe-bench/sites/assets/lms/dist/css/
cp lms.bundle.LKFKGSLD.css lms.bundle.7HU65HCC.css
```

**Important Notes:**
- Different pages may request different hashes (login vs desk vs LMS)
- Watch DevTools Network tab for each broken page to find exact hash needed
- Hashes are case-sensitive - copy exactly as shown in 404 error

### Post-Fix Steps
1. Reload nginx in frontend container:
   ```bash
   nginx -s reload
   ```

2. Clear Cloudflare cache (if using Cloudflare)

3. Hard refresh browser: `Ctrl+Shift+R`

4. Test in Incognito window to avoid browser cache

### Verification
```bash
# In frontend container, test if nginx can serve the file
curl -I http://localhost:8080/assets/lms/dist/css/lms.bundle.HASH.css
# Should return: HTTP/1.1 200 OK
```

---

## Issue 2: Scheduler/Queue Workers Crashing with ModuleNotFoundError

### Symptoms
- Scheduler, queue-long, or queue-short containers keep restarting
- Container logs show:
  ```
  ModuleNotFoundError: No module named 'payments'
  ModuleNotFoundError: No module named 'bank_transfer_gateway'
  ```

### Root Cause
Each container has its own Python environment. The apps were installed in the backend container but NOT in the scheduler/queue worker containers.

### Solution

**Step 1: Keep the container running**

Edit docker-compose.yml in Portainer. Change the command from:
```yaml
command: ["bench", "schedule"]
```
To:
```yaml
command: ["tail", "-f", "/dev/null"]
```

Update the stack. The container will now run without crashing.

**Step 2: Clone and install apps**

Open console into the container and run:
```bash
cd /home/frappe/frappe-bench/apps

# Clone the apps (if not present)
git clone https://github.com/frappe/payments.git
git clone https://github.com/Dinu-Sri/bank_transfer_gateway.git

# Install them
cd /home/frappe/frappe-bench
pip install -e apps/payments
pip install -e apps/bank_transfer_gateway
```

**Step 3: Restore original command**

Change docker-compose.yml back to:
```yaml
command: ["bench", "schedule"]
```

Update the stack.

### Apply to All Worker Containers
Repeat for:
- `scheduler` - command: `["bench", "schedule"]`
- `queue-long` - command: `["bench", "worker", "--queue", "long"]`
- `queue-short` - command: `["bench", "worker", "--queue", "short"]`

---

## Issue 3: Nginx Not Running in Frontend Container

### Symptoms
- Cannot access the website
- curl to localhost fails with "Connection refused"

### Diagnosis
```bash
# Try to start nginx
nginx

# If it says "Address already in use", nginx is already running
# If it starts, it wasn't running
```

### Solution
```bash
# Start nginx
nginx

# Or reload if already running
nginx -s reload
```

Note: Nginx in frontend container listens on port **8080**, not 80:
```bash
curl -I http://localhost:8080/assets/...
```

---

## Issue 4: Finding Your Site Name

### Problem
Commands like `bench --site sitename clear-cache` fail with "Site does not exist"

### Solution
```bash
# List all sites
ls /home/frappe/frappe-bench/sites/

# The site folder (not "assets") is your site name
# Common pattern: "frontend" or the actual domain name
```

---

## Useful Commands Reference

### Find all assets.json files
```bash
find /home/frappe/frappe-bench -name "assets.json" 2>/dev/null
```

### Check CSS entries in assets.json
```bash
cat assets.json | grep -E "website|lms|\.css"
```

### List installed apps
```bash
ls /home/frappe/frappe-bench/apps/
```

### Check nginx config
```bash
cat /etc/nginx/conf.d/frappe.conf | grep -E "root|location.*assets" -A5
```

### Test if file is accessible via nginx
```bash
curl -I http://localhost:8080/assets/path/to/file.css
```

---

## Prevention

To avoid these issues recurring after container restarts:

1. **For apps installation**: Consider modifying docker-compose.yml to auto-install apps:
   ```yaml
   command: ["bash", "-c", "cd /home/frappe/frappe-bench && pip install -e apps/payments && pip install -e apps/bank_transfer_gateway && bench schedule"]
   ```

2. **For assets**: The `sites` volume is shared, but assets in the Docker image can differ. After any rebuild, verify assets.json matches actual files.

---

## Container Reference

| Container | Purpose | Key Path |
|-----------|---------|----------|
| backend | Frappe/Gunicorn server | serves HTML, reads assets.json |
| frontend | Nginx static files | serves CSS/JS from /sites/assets |
| scheduler | Background scheduler | needs apps installed |
| queue-long | Long-running jobs | needs apps installed |
| queue-short | Short-running jobs | needs apps installed |
| redis-cache | Cache | |
| redis-queue | Job queue | |

---

*Last updated: December 13, 2025*

---

## Issue 5: Site Completely Down After App Installation/Removal (CRITICAL)

### Symptoms
- Website shows 502 Bad Gateway
- Backend container logs show: `ModuleNotFoundError: No module named 'bank_transfer_gateway'` or `'payments'`
- Error occurs even after removing app from `apps.txt`

### Root Cause
When a Frappe app is installed but then the Python module is removed (e.g., container restart loses pip install), Frappe crashes because:
1. The app is registered in multiple database tables
2. Frappe tries to import the module on every request
3. Even error pages try to import the module, causing infinite error loops

### Key Places App References Hide

| Location | How to Check | How to Fix |
|----------|--------------|------------|
| `sites/apps.txt` | `cat sites/apps.txt` | Remove app line |
| `sites/apps.json` | `cat sites/apps.json` | Remove app entry with Python |
| `tabDefaultValue` (installed_apps) | SQL query below | Update with SQL |
| `tabModule Def` | SQL query below | Delete rows |
| `tabDocType` | SQL query below | Delete rows |
| `tabInstalled Application` | SQL query below | Verify clean |
| Redis cache | `redis-cli FLUSHALL` | Flush all |

### Complete Cleanup Process

**Step 1: Check what's broken**
```bash
cd /home/frappe/frappe-bench/sites
/home/frappe/frappe-bench/env/bin/python -c "
import frappe
frappe.init('frontend')
frappe.connect()
print('Installed apps:', frappe.get_installed_apps())
"
```

If this shows apps like `bank_transfer_gateway` or `payments` that shouldn't be there, proceed:

**Step 2: Clean apps.txt**
```bash
cat /home/frappe/frappe-bench/sites/apps.txt
# Should only show: frappe, lms (or your valid apps)
# If it shows unwanted apps, edit it:
echo -e "frappe\nlms" > /home/frappe/frappe-bench/sites/apps.txt
```

**Step 3: Clean apps.json**
```bash
cd /home/frappe/frappe-bench/sites
python3 -c "
import json
with open('apps.json', 'r') as f:
    data = json.load(f)
# Remove unwanted apps
for app in ['bank_transfer_gateway', 'payments']:
    if app in data:
        del data[app]
with open('apps.json', 'w') as f:
    json.dump(data, f, indent=4)
print('Done!')
"
```

**Step 4: Clean tabDefaultValue (THE CRITICAL ONE!)**
```bash
# First check current value
bench --site frontend mariadb -e "SELECT name, defvalue FROM \`tabDefaultValue\` WHERE defkey = 'installed_apps';"

# Note the 'name' value (e.g., 'mbhj4t2lv2')
# Update to only include valid apps
bench --site frontend mariadb -e "UPDATE \`tabDefaultValue\` SET defvalue = '[\"frappe\", \"lms\"]' WHERE name = 'YOUR_NAME_HERE';"

# Verify
bench --site frontend mariadb -e "SELECT defvalue FROM \`tabDefaultValue\` WHERE defkey = 'installed_apps';"
```

**Step 5: Clean tabModule Def**
```bash
# Check for orphan modules
bench --site frontend mariadb -e "SELECT name, app_name FROM \`tabModule Def\` WHERE app_name IN ('payments', 'bank_transfer_gateway');"

# Delete them
bench --site frontend mariadb -e "DELETE FROM \`tabModule Def\` WHERE name = 'Bank Transfer Gateway';"
bench --site frontend mariadb -e "DELETE FROM \`tabModule Def\` WHERE name = 'Payments';"
bench --site frontend mariadb -e "DELETE FROM \`tabModule Def\` WHERE name = 'Payment Gateways';"
```

**Step 6: Clean tabDocType**
```bash
# Check for orphan doctypes
bench --site frontend mariadb -e "SELECT name, module FROM \`tabDocType\` WHERE module IN ('Bank Transfer Gateway', 'Payments', 'Payment Gateways');"

# Delete each one
bench --site frontend mariadb -e "DELETE FROM \`tabDocType\` WHERE name = 'Bank Transfer Order';"
bench --site frontend mariadb -e "DELETE FROM \`tabDocType\` WHERE name = 'Bank Transfer Settings';"
# ... delete all listed doctypes
```

**Step 7: Remove asset folders**
```bash
rm -rf /home/frappe/frappe-bench/sites/assets/bank_transfer_gateway
rm -rf /home/frappe/frappe-bench/sites/assets/payments
rm -rf /home/frappe/frappe-bench/sites/frontend/public_assets/bank_transfer_gateway
rm -rf /home/frappe/frappe-bench/sites/frontend/public_assets/payments
```

**Step 8: Create currentsite.txt if missing**
```bash
# Check if exists
cat /home/frappe/frappe-bench/sites/currentsite.txt

# If "No such file", create it:
echo "frontend" > /home/frappe/frappe-bench/sites/currentsite.txt
```

**Step 9: Clear all caches**
```bash
bench --site frontend clear-cache
bench --site frontend clear-website-cache

# Also flush Redis (from redis-cache container):
redis-cli FLUSHALL
```

**Step 10: Restart stack and reload nginx**
1. Stop the entire stack in Portainer
2. Start the stack
3. Go into frontend container and run: `nginx -s reload`

### Verification
```bash
# Test backend directly
curl -H "Host: frontend" http://localhost:8000 2>/dev/null | head -20

# Test through nginx (in frontend container)
curl -H "Host: frontend" http://localhost:8080 | head -20
```

---

## Issue 6: 502 Bad Gateway After Stack Restart

### Symptoms
- Site was working before restart
- Now shows 502 Bad Gateway
- Backend logs show gunicorn starting OK (no errors)

### Root Cause
Nginx cached the old backend IP address. After container restart, backend has a new IP.

### Solution
In frontend container:
```bash
nginx -s reload
```

Then test:
```bash
curl -H "Host: frontend" http://localhost:8080 | head -20
```

---

## Issue 7: "frontend does not exist" Error

### Symptoms
- Backend crashes with: `IncorrectSitePath: 404 Not Found: frontend does not exist`
- But the folder `/home/frappe/frappe-bench/sites/frontend/` exists

### Root Cause
The `currentsite.txt` file is missing.

### Solution
```bash
echo "frontend" > /home/frappe/frappe-bench/sites/currentsite.txt
```

---

## Quick Recovery Checklist

When site is completely down, check in this order:

1. **apps.txt** - Only valid apps listed?
2. **apps.json** - Only valid apps listed?
3. **tabDefaultValue installed_apps** - Only valid apps in JSON array?
4. **tabModule Def** - No orphan modules?
5. **currentsite.txt** - Exists with correct site name?
6. **Redis** - Flushed?
7. **Nginx** - Reloaded after backend restart?
