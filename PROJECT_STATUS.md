# Bank Transfer Gateway - Project Status & Context

**Last Updated:** December 13, 2025

---

## 🎉 FULLY WORKING - Complete Payment Flow Operational!

**Date:** December 13, 2025

The Bank Transfer Gateway is now **fully operational** with complete end-to-end payment flow!

### ✅ Complete Feature List (All Working)

| Feature | Status | Notes |
|---------|--------|-------|
| Pending payment detection | ✅ Working | API detects LMS Payment + Bank Transfer Order |
| Floating notification | ✅ Working | Appears bottom-right on course pages |
| Auto-create Bank Transfer Order | ✅ Working | Creates order when LMS Payment exists without one |
| Receipt upload | ✅ Working | Drag-drop file upload with preview |
| Admin approval workflow | ✅ Working | Change status to "Confirmed" in Desk |
| Auto course enrollment | ✅ Working | Student enrolled on payment confirmation |
| Email notifications | ✅ Working | Student + Admin get emails |
| Payment rejection | ✅ Working | Student gets rejection email with reason |

### User Flow (Tested & Working)

1. Student clicks "Buy Course" → LMS Payment created
2. Student sees bank details page with instructions
3. **If student leaves and returns to course page:**
   - Floating notification: "Payment Pending - No need to buy again!"
   - "Complete Payment / Upload Receipt" button
4. Student uploads bank transfer receipt
5. Admin sees notification, views receipt, confirms payment
6. Student auto-enrolled + gets confirmation email

---

## 🔧 Critical Issues Fixed Today (December 13, 2025)

## 🔧 Critical Issues Fixed Today (December 13, 2025)

### Issue 1: Site Crashed with ModuleNotFoundError
**Problem:** Site showed "Internal Server Error" with `ModuleNotFoundError: No module named 'bank_transfer_gateway'`.

**Root Cause:** Apps were registered in database tables but Python modules didn't exist in containers.

**Solution:** Cleaned orphaned app references from database tables:
```sql
-- Update installed_apps
UPDATE `tabDefaultValue` SET defvalue = '["frappe", "lms"]' WHERE defkey = 'installed_apps';

-- Delete orphan modules
DELETE FROM `tabModule Def` WHERE name = 'Bank Transfer Gateway';
```

### Issue 2: 502 Bad Gateway After Container Restart
**Solution:** Run `nginx -s reload` in frontend container.

### Issue 3: CSS 404 Errors (Broken Styling)
**Solution:** Copy CSS files with correct hashes in frontend container.

### Issue 4: Pip Installing to Wrong Location
**Problem:** `pip install` was using system pip, not Frappe virtualenv.

**Solution:** Use `./env/bin/pip install -e apps/bank_transfer_gateway`

### Issue 5: File Upload 403 Forbidden
**Problem:** Uploading with `doctype` parameter triggers permission check.

**Solution:** Remove `doctype` and `docname` from FormData - upload as standalone file.

### Issue 6: Redirect URL Leading to Error Page
**Problem:** LMS Payment exists but no Bank Transfer Order → redirects to broken LMS billing page.

**Solution:** Auto-create Bank Transfer Order when LMS Payment exists without one:
```python
# In check_existing_order()
if lms_payment and not bto:
    new_order = create_bank_transfer_order_from_lms_payment(lms_payment, doctype, docname, user)
    return {"redirect_url": f"/bank-transfer-instructions/{new_order.order_id}"}
```

### Issue 7: Vue.js Re-renders Remove DOM Changes
**Problem:** Modifying "Buy" button doesn't persist - Vue re-renders it.

**Solution:** Append floating notification to `document.body` with `position: fixed`.

---

## 🚨 Critical Files & Locations

### Files You MUST Update After Code Changes

| File | Location | How to Update |
|------|----------|---------------|
| `bank_transfer.js` | Frontend container: `/home/frappe/frappe-bench/sites/assets/bank_transfer_gateway/js/` | `curl -o bank_transfer.js "https://raw.githubusercontent.com/..."` |
| Python code | Backend container: `/home/frappe/frappe-bench/apps/bank_transfer_gateway/` | `git pull` + `./env/bin/pip install -e apps/bank_transfer_gateway` |
| Templates (www/) | Backend container | `git pull` + `bench --site frontend clear-cache` |

### Critical Code Sections

**1. Pending Payment Detection API** - [bank_transfer_order.py](bank_transfer_gateway/bank_transfer_gateway/doctype/bank_transfer_order/bank_transfer_order.py#L493)
```python
@frappe.whitelist(allow_guest=False)
def check_existing_order(doctype, docname):
    # Checks LMS Payment first, then Bank Transfer Order
    # Auto-creates BTO if LMS Payment exists without one
```

**2. Auto-Create Order Helper** - [bank_transfer_order.py](bank_transfer_gateway/bank_transfer_gateway/doctype/bank_transfer_order/bank_transfer_order.py#L453)
```python
def create_bank_transfer_order_from_lms_payment(lms_payment, doctype, docname, user):
    # Creates Bank Transfer Order from existing LMS Payment
```

**3. Floating Notification** - [bank_transfer.js](bank_transfer_gateway/public/js/bank_transfer.js#L244)
```javascript
function addPendingPaymentNotice(orderInfo, referenceElement) {
    // Creates floating notification appended to document.body
    // Uses position: fixed to avoid Vue.js re-rendering issues
}
```

**4. Receipt Upload** - [bank_transfer_instructions.html](bank_transfer_gateway/www/bank_transfer_instructions.html#L327)
```javascript
// Upload without doctype to avoid permission check
formData.append('file', file);
formData.append('is_private', '0');
formData.append('folder', 'Home/Attachments');
// DON'T include: doctype, docname
```

**5. CSRF Token Helper** - [bank_transfer_instructions.html](bank_transfer_gateway/www/bank_transfer_instructions.html#L254)
```javascript
function getCSRFToken() {
    // Tries: frappe.csrf_token, window.csrf_token, cookie, meta tag
}
```

---

## 🏗️ System Architecture

### Docker Deployment (Portainer Stack)

| Container | Purpose | Port |
|-----------|---------|------|
| backend | Frappe/Gunicorn (Python) | 8000 |
| frontend | Nginx (static files) | 8080 |
| scheduler | Background scheduler | - |
| queue-long | Long-running jobs | - |
| queue-short | Short-running jobs | - |
| redis-cache | Cache | 6379 |
| redis-queue | Job queue | 6379 |
| db | MariaDB | 3306 |
| websocket | Socket.io | 9000 |
| cloudflared | Cloudflare tunnel | - |

### Volume Sharing
- Only `sites` volume is shared between containers
- `apps` folder is baked into Docker image
- JS files must be manually copied to frontend container's assets folder

### Site Details
- **URL**: https://academy.sltaxsolution.lk
- **Site folder**: `/home/frappe/frappe-bench/sites/frontend`
- **Apps**: frappe, lms, payments, bank_transfer_gateway

---

## 📁 Code Structure

### Bank Transfer Gateway App
```
bank_transfer_gateway/
├── bank_transfer_gateway/
│   ├── bank_transfer_gateway/
│   │   ├── payment_controller.py      # API endpoints
│   │   ├── doctype/
│   │   │   ├── bank_transfer_order/   # Order doctype
│   │   │   └── bank_transfer_settings/ # Settings doctype
│   ├── public/
│   │   └── js/
│   │       └── bank_transfer.js       # Frontend script (KEY FILE)
│   ├── hooks.py                       # App hooks
│   └── www/
│       ├── bank_transfer_instructions.html
│       └── bank_transfer_instructions.py
```

### Key File: payment_controller.py

Located at: `/bank_transfer_gateway/bank_transfer_gateway/bank_transfer_gateway/payment_controller.py`

```python
@frappe.whitelist(allow_guest=True)
def check_existing_order():
    """Check if user has pending bank transfer payment"""
    if not frappe.session.user or frappe.session.user == "Guest":
        return {"has_pending": False}
    
    # First check LMS Payment doctype (primary for LMS flow)
    lms_payment = frappe.db.get_value(
        "LMS Payment",
        {
            "member": frappe.session.user,
            "payment_received": 0  # Not yet confirmed
        },
        ["name", "source"],
        as_dict=True
    )
    
    if lms_payment:
        return {
            "has_pending": True,
            "order_id": lms_payment.name,
            "source": lms_payment.source,
            "redirect_url": f"/bank_transfer_instructions?order_id={lms_payment.name}"
        }
    
    # Fallback: check Bank Transfer Order
    order = frappe.db.get_value(
        "Bank Transfer Order",
        {
            "user": frappe.session.user,
            "status": "Pending"
        },
        ["name", "course"],
        as_dict=True
    )
    
    if order:
        return {
            "has_pending": True,
            "order_id": order.name,
            "course": order.course,
            "redirect_url": f"/bank_transfer_instructions?order_id={order.name}"
        }
    
    return {"has_pending": False}
```

### Key File: bank_transfer.js

Located at: `/bank_transfer_gateway/bank_transfer_gateway/public/js/bank_transfer.js`

```javascript
// Bank Transfer Gateway - Pending Payment Handler
console.log('Bank Transfer Gateway: Script loaded');

document.addEventListener('DOMContentLoaded', function() {
    console.log('Bank Transfer Gateway: DOMContentLoaded fired');
    initBankTransfer();
});

function getCSRFToken() {
    const cookie = document.cookie.split('; ').find(row => row.startsWith('csrf_token='));
    return cookie ? cookie.split('=')[1] : '';
}

async function callAPI(method, args = {}) {
    const response = await fetch(`/api/method/${method}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Frappe-CSRF-Token': getCSRFToken()
        },
        credentials: 'include',
        body: JSON.stringify(args)
    });
    return await response.json();
}

function initBankTransfer() {
    const path = window.location.pathname;
    console.log('Bank Transfer Gateway: initBankTransfer called, path:', path);
    
    // Only run on course/batch pages
    if (path.includes('/courses/') || path.includes('/lms/') || path.includes('/batch')) {
        checkPendingPayment();
    }
}

async function checkPendingPayment() {
    try {
        const response = await callAPI('bank_transfer_gateway.bank_transfer_gateway.bank_transfer_gateway.payment_controller.check_existing_order');
        console.log('Bank Transfer Gateway: API response', response);
        
        if (response.message && response.message.has_pending) {
            modifyBuyButton(response.message.redirect_url);
        }
    } catch (error) {
        console.error('Bank Transfer Gateway: Error checking pending payment', error);
    }
}

function modifyBuyButton(redirectUrl) {
    console.log('Bank Transfer Gateway: Looking for buy button to modify');
    
    // Find buttons with text containing "Buy", "Enroll", "Purchase"
    const allElements = document.querySelectorAll('button, a, .btn');
    allElements.forEach(el => {
        const text = (el.textContent || el.innerText || '').toLowerCase().trim();
        if (text.includes('buy') || text.includes('enroll') || text.includes('purchase')) {
            console.log('Bank Transfer Gateway: Found button:', text);
            el.textContent = 'Complete Payment';
            el.style.backgroundColor = '#ff9800';
            el.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = redirectUrl;
            });
        }
    });
}

// For SPA navigation - observe DOM changes
const observer = new MutationObserver(function(mutations) {
    initBankTransfer();
});
observer.observe(document.body, { childList: true, subtree: true });
```

### Key File: hooks.py

```python
# Response Hook - Inject JS into all HTML pages (including LMS Vue SPA)
after_request = ["bank_transfer_gateway.bank_transfer_gateway.utils.inject_bank_transfer_script"]

# Also keep the standard web_include_js for non-SPA pages
web_include_js = "/assets/bank_transfer_gateway/js/bank_transfer.js"
```

### Key File: utils.py (NEW - Script Injection)

```python
def inject_bank_transfer_script(response=None, request=None):
    """
    Inject bank transfer script into HTML responses.
    This hook runs after every request and injects our JavaScript
    into HTML pages, ensuring it loads even on Vue SPA pages like LMS.
    """
    try:
        if not response or not hasattr(response, 'content_type'):
            return
        if not response.content_type or 'text/html' not in response.content_type:
            return
        if not hasattr(response, 'data') or not response.data:
            return
        
        script_tag = b'<script src="/assets/bank_transfer_gateway/js/bank_transfer.js"></script></body>'
        
        if b'</body>' in response.data and b'bank_transfer_gateway' not in response.data:
            response.data = response.data.replace(b'</body>', script_tag)
    except Exception as e:
        frappe.log_error(f"Bank Transfer Gateway: Script injection error: {str(e)}")
```

---

## ✅ What's Working

1. **All Docker containers running** - backend, frontend, scheduler, queue-long, queue-short, websocket
2. **Apps installed** - frappe, lms, payments, bank_transfer_gateway
3. **Email/SMTP working** - scheduler sends emails
4. **CSS assets fixed** - all pages styling works
5. **API endpoint works** - `check_existing_order` returns 200 with correct data
6. **JS file deployed** - at `/assets/bank_transfer_gateway/js/bank_transfer.js` in frontend container
7. **JS injection working** - Script loads on ALL pages including LMS Vue SPA
8. **Pending payment detection** - API correctly detects pending payments
9. **Floating notification** - Shows at bottom-right of screen with correct status
10. **Redirect working** - Both notification button and "Buy" button redirect to payment page

---

## 🚀 Deployment Checklist

After any code changes, follow these steps:

### 1. Push to GitHub
```bash
git add -A
git commit -m "Your message"
git push
```

### 2. Update JS in Frontend Container
```bash
cd /home/frappe/frappe-bench/sites/assets/bank_transfer_gateway/js/
curl -o bank_transfer.js "https://raw.githubusercontent.com/Dinu-Sri/bank_transfer_gateway/master/bank_transfer_gateway/public/js/bank_transfer.js?v=$(date +%s)"
```

### 3. Purge Cloudflare Cache
1. Cloudflare Dashboard → your domain
2. Caching → Configuration → Purge Everything

### 4. Test in Incognito
Open course page in Incognito window to bypass browser cache.

---

## ✅ SOLVED: JS Not Loading on LMS Pages

### The Problem (SOLVED!)
- LMS uses Vue.js SPA (Single Page Application)
- Frappe's `web_include_js` hook only works for traditional Jinja-rendered pages
- LMS pages don't use Frappe's standard template system

### The Solution: `after_request` Hook
We used Frappe's `after_request` hook to inject the script tag into the HTML response before it's sent to the browser.

**Why This Works:**
- `after_request` runs AFTER the response is generated but BEFORE it's sent
- Works for ALL HTML responses, including Vue SPA pages
- Lives in our app code (not LMS) - survives LMS updates
- No need to modify Nginx or Docker configuration

**Key Fix - apps.txt:**
The hook wasn't being registered because `bank_transfer_gateway` wasn't in `/home/frappe/frappe-bench/sites/apps.txt`. After adding it:
```bash
echo "bank_transfer_gateway" >> /home/frappe/frappe-bench/sites/apps.txt
```

Then flushing Redis cache and restarting made it work.

### Attempted Solutions (Before Finding after_request)

1. **hooks.py web_include_js** - Doesn't work for Vue SPA
2. **Website Settings > Head HTML** - Added script tag, but LMS doesn't use this
3. **Website Script doctype** - Same issue, LMS bypasses this
4. **website_context.py hook** - Doesn't apply to Vue pages

### Script Added to Website Settings Head HTML
```html
<script>
// Bank Transfer Gateway - Load script dynamically for LMS pages
(function() {
    if (window.location.pathname.includes('/lms/') || 
        window.location.pathname.includes('/courses/') ||
        window.location.pathname.includes('/batches/')) {
        var script = document.createElement('script');
        script.src = '/assets/bank_transfer_gateway/js/bank_transfer.js';
        script.defer = true;
        document.head.appendChild(script);
    }
})();
</script>
```

---

## 🔍 Debugging Commands

### Test Pending Payment API
```bash
bench --site frontend console
```
```python
frappe.set_user("student@email.com")
from bank_transfer_gateway.bank_transfer_gateway.doctype.bank_transfer_order.bank_transfer_order import check_existing_order
result = check_existing_order(doctype="LMS Course", docname="course-name")
print(result)
```

### Check Installed Apps
```python
import frappe
frappe.get_installed_apps()
```

### Check DocType Permissions
```python
doc = frappe.get_doc("DocType", "Bank Transfer Order")
print([(p.role, p.read, p.write, p.create) for p in doc.permissions])
```

### Delete Test LMS Payments
```python
frappe.delete_doc("LMS Payment", "payment_name", force=True)
frappe.db.commit()
```

---

## 📋 Admin Quick Reference

### Approve a Payment
1. Go to: `/app/bank-transfer-order`
2. Filter: Status = "Receipt Uploaded"
3. Open order → View receipt
4. Change Status to "Confirmed"
5. Save

**Automatic actions on confirm:**
- ✅ Student enrolled in course
- ✅ Student gets confirmation email
- ✅ Admin gets confirmation email
- ✅ LMS Payment marked as received

### Reject a Payment
1. Change Status to "Rejected"
2. Fill in Rejection Reason
3. Save
4. Student receives rejection email

---

## 🚀 Deployment Checklist

### After Code Changes:

**1. Push to GitHub**
```bash
git add -A
git commit -m "Your message"
git push
```

**2. Update Backend (Python code)**
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

**3. Update Frontend (JavaScript)**
```bash
docker exec -it <frontend_container> sh
cd /home/frappe/frappe-bench/sites/assets/bank_transfer_gateway/js
curl -o bank_transfer.js "https://raw.githubusercontent.com/Dinu-Sri/bank_transfer_gateway/master/bank_transfer_gateway/public/js/bank_transfer.js"
exit
```

**4. Purge Cloudflare Cache**
- Cloudflare Dashboard → Caching → Purge Everything

**5. Test in Incognito**
- Open course page in Incognito window

---

## 🌐 Links

- **Live Site**: https://academy.sltaxsolution.lk
- **GitHub Repo**: https://github.com/Dinu-Sri/bank_transfer_gateway
- **Bank Transfer Orders**: https://academy.sltaxsolution.lk/app/bank-transfer-order
- **Bank Transfer Settings**: https://academy.sltaxsolution.lk/app/bank-transfer-settings

---

*Last updated: December 13, 2025*
