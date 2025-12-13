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

### Step-by-Step CSS Fix Process

**Step 1: Find existing CSS files (in frontend container)**
```bash
ls /home/frappe/frappe-bench/sites/assets/frappe/dist/css/
ls /home/frappe/frappe-bench/sites/assets/lms/dist/css/
```

Example output - these are your SOURCE files:
```
desk.bundle.WLNLGKVI.css
email.bundle.XXMYT5LP.css
login.bundle.SP4OKUVQ.css
print.bundle.3EJLHQ27.css
print_format.bundle.6YM6Q2T4.css
report.bundle.K2JXPPS5.css
web_form.bundle.PUMC6NCU.css
website.bundle.XRE5YRZD.css

lms.bundle.LKFKGSLD.css
```

**Step 2: Find what hashes are REQUESTED (404 errors)**

Open browser DevTools (F12) → Network tab → refresh page → filter "css" → look for red 404 errors.

The 404 URL shows the NEEDED hash, e.g.:
```
login.bundle.6J4DKKOV.css   ← NEEDED hash is 6J4DKKOV
```

**Step 3: Copy files to match requested hashes**

```bash
cd /home/frappe/frappe-bench/sites/assets/frappe/dist/css/

# Format: cp EXISTING.css NEEDED.css
cp login.bundle.SP4OKUVQ.css login.bundle.6J4DKKOV.css
cp website.bundle.XRE5YRZD.css website.bundle.2Y6FVZRW.css
cp desk.bundle.WLNLGKVI.css desk.bundle.PWLLNP3E.css
cp report.bundle.K2JXPPS5.css report.bundle.M6ES2G20.css

cd /home/frappe/frappe-bench/sites/assets/lms/dist/css/
cp lms.bundle.LKFKGSLD.css lms.bundle.7HU65HCC.css
```

**Step 4: Reload nginx**
```bash
nginx -s reload
```

**Step 5: Verify file is served correctly**
```bash
curl -I http://localhost:8080/assets/frappe/dist/css/login.bundle.6J4DKKOV.css
# Should return: HTTP/1.1 200 OK
```

**Step 6: Clear Cloudflare cache (CRITICAL!)**

If nginx returns 200 but browser still shows 404, Cloudflare cached the old 404 response:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your domain
3. **Caching** → **Configuration** → **Purge Everything**

**Step 7: Verify in browser**
- Hard refresh: `Ctrl+Shift+R`
- Or test in Incognito window
- Or enable DevTools → Network → "Disable cache" checkbox

### Actual Hashes Used (December 2025)

| Bundle | Existing Hash | Needed Hash |
|--------|---------------|-------------|
| website.bundle | XRE5YRZD | 2Y6FVZRW |
| lms.bundle | LKFKGSLD | 7HU65HCC |
| login.bundle | SP4OKUVQ | 6J4DKKOV |
| desk.bundle | WLNLGKVI | PWLLNP3E |
| report.bundle | K2JXPPS5 | M6ES2G20 |

**Important Notes:**
- Different pages request different bundles (login page needs login.bundle, desk needs desk.bundle)
- Hashes are case-sensitive - copy EXACTLY as shown in 404 error
- Always purge Cloudflare cache after copying files
- Check multiple pages (home, login, desk, courses) for different 404s

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

## Issue 8: File Upload 403 Forbidden Error

### Symptoms
- Student tries to upload payment receipt
- Browser console shows: `Failed to load resource: the server responded with a status of 403`
- Error on `/api/method/upload_file`

### Root Cause
When uploading a file with `doctype` and `docname` parameters, Frappe checks if the user has **write permission** on that document. Regular website users don't have write permission on `Bank Transfer Order` doctype.

### Solution
Remove `doctype` and `docname` from the upload request. Upload the file as a standalone attachment:

**In `bank_transfer_instructions.html`:**
```javascript
// WRONG - triggers permission check
const formData = new FormData();
formData.append('file', file);
formData.append('doctype', 'Bank Transfer Order');  // Remove this
formData.append('docname', '{{ order.order_id }}'); // Remove this
formData.append('is_private', '0');

// CORRECT - uploads without permission check
const formData = new FormData();
formData.append('file', file);
formData.append('is_private', '0');
formData.append('folder', 'Home/Attachments');
```

The backend `update_receipt_status` function (which uses `ignore_permissions=True`) then links the file to the order.

---

## Issue 9: Redirect URL Leading to Error Page

### Symptoms
- Student clicks "Complete Payment" button
- Redirects to `/lms/billing/lms-course/coursename`
- Page shows "Module is incorrect" or "Uncaught Server Exception"

### Root Cause
When an **LMS Payment** exists but no **Bank Transfer Order** was created, the old code returned the LMS billing URL as redirect. LMS billing page errors out because the payment gateway isn't properly integrated.

### Solution
Update `check_existing_order()` to **auto-create a Bank Transfer Order** when LMS Payment exists without one:

**In `bank_transfer_order.py`:**
```python
if lms_payment:
    # Check if there's a corresponding Bank Transfer Order
    bto = frappe.db.get_value("Bank Transfer Order", {...}, as_dict=True)
    
    if bto:
        return {
            "exists": True,
            "redirect_url": f"/bank-transfer-instructions/{bto.order_id}",
            ...
        }
    else:
        # LMS Payment exists but no Bank Transfer Order
        # Create one now instead of redirecting to LMS billing
        try:
            new_order = create_bank_transfer_order_from_lms_payment(lms_payment, doctype, docname, user)
            return {
                "exists": True,
                "redirect_url": f"/bank-transfer-instructions/{new_order.order_id}",
                ...
            }
        except Exception as e:
            frappe.log_error(f"Failed to create Bank Transfer Order: {str(e)}")
            return {"exists": True, "redirect_url": None, "error": "..."}
```

---

## Issue 10: Pip Installing to Wrong Location

### Symptoms
- Run `pip install -e apps/bank_transfer_gateway`
- App installs but still shows `ModuleNotFoundError`
- `pip list` shows the app but Frappe can't find it

### Root Cause
Container has multiple Python environments. Running `pip` uses the **user's pip**, not the **Frappe virtualenv pip**.

### Diagnosis
```bash
# Check which pip is being used
which pip
# Output: /usr/local/bin/pip (WRONG!)

# Check where virtualenv pip is
ls /home/frappe/frappe-bench/env/bin/pip
# Output: /home/frappe/frappe-bench/env/bin/pip (CORRECT!)
```

### Solution
Always use the full path to virtualenv pip:
```bash
# WRONG
pip install -e apps/bank_transfer_gateway

# CORRECT
./env/bin/pip install -e apps/bank_transfer_gateway
```

Or:
```bash
/home/frappe/frappe-bench/env/bin/pip install -e apps/bank_transfer_gateway
```

---

## Issue 11: CSRF Token Not Found for API Calls

### Symptoms
- API calls return 403 or 417
- Browser console shows CSRF token errors
- File uploads fail

### Root Cause
Different Frappe pages expose CSRF token in different ways:
- Desk pages: `frappe.csrf_token`
- Website pages: `window.csrf_token` or cookie

### Solution
Use a helper function that tries all sources:

```javascript
function getCSRFToken() {
    // Try frappe.csrf_token first (Desk pages)
    if (typeof frappe !== 'undefined' && frappe.csrf_token) {
        return frappe.csrf_token;
    }
    // Try window.csrf_token (Website pages)
    if (typeof window !== 'undefined' && window.csrf_token) {
        return window.csrf_token;
    }
    // Try to get from cookie
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'csrf_token') {
            return value;
        }
    }
    // Try meta tag
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) {
        return meta.getAttribute('content');
    }
    return '';
}
```

---

## Issue 12: Vue.js Re-renders and Removes DOM Changes

### Symptoms
- Modify "Buy this course" button successfully
- Button reverts back to original after a moment
- Console shows changes being made but they don't persist

### Root Cause
LMS uses **Vue.js SPA**. Vue re-renders components based on its virtual DOM state, overwriting any direct DOM manipulations.

### Solution
Instead of modifying Vue-controlled elements, **append new elements to `document.body`**. Vue doesn't touch elements outside its app container.

```javascript
function addPendingPaymentNotice(orderInfo, referenceElement) {
    // Check if notice already exists
    if (document.getElementById('pending-payment-notice')) return;
    
    const notice = document.createElement('div');
    notice.id = 'pending-payment-notice';
    notice.style.cssText = `
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        z-index: 999999 !important;
        width: 320px !important;
        /* ... more styles ... */
    `;
    
    notice.innerHTML = `
        <div>Payment Pending</div>
        <a href="${orderInfo.redirect_url}">Complete Payment</a>
        <button onclick="this.parentElement.remove()">✕</button>
    `;
    
    // Append to body - Vue won't touch this!
    document.body.appendChild(notice);
}
```

**Key Points:**
- Use `position: fixed` so it stays in place
- Use high `z-index` (999999) to appear above everything
- Include a close button for UX
- Append to `document.body`, not to any Vue component

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

---

## Deployment Quick Reference

### Update Backend Code
```bash
docker exec -it <backend_container> bash
cd /home/frappe/frappe-bench/apps/bank_transfer_gateway
git pull origin master
cd ../..
./env/bin/pip install -e apps/bank_transfer_gateway --force-reinstall --no-deps
bench --site frontend migrate
bench --site frontend clear-cache
supervisorctl restart all
exit
```

### Update Frontend JavaScript
```bash
docker exec -it <frontend_container> sh
cd /home/frappe/frappe-bench/sites/assets/bank_transfer_gateway/js
curl -o bank_transfer.js "https://raw.githubusercontent.com/Dinu-Sri/bank_transfer_gateway/master/bank_transfer_gateway/public/js/bank_transfer.js"
exit
```

### Purge Cloudflare Cache
1. Cloudflare Dashboard → Your Domain
2. Caching → Configuration → Purge Everything

---

*Last updated: December 13, 2025*
