# Bank Transfer Gateway - Project Status & Context

**Last Updated:** December 13, 2025

---

## ✅ FULLY WORKING - Pending Payment Detection Complete!

**Date:** December 13, 2025

The Bank Transfer Gateway is now fully operational! When a user has a pending bank transfer payment, a floating notification appears on the course page guiding them to complete their payment.

### What's Working Now
1. ✅ JS injection into LMS Vue SPA pages
2. ✅ API calls to detect pending payments (returns 200 OK)
3. ✅ Floating notification appears at bottom-right of screen
4. ✅ Shows correct status: "Payment Pending" or "Waiting for Approval"
5. ✅ "Complete Payment / Upload Receipt" button redirects to payment page
6. ✅ "Buy this course" button also redirects to payment page (href updated)
7. ✅ Close button (✕) to dismiss the notice
8. ✅ Works around Vue.js re-rendering by appending to document.body

### Console Output (Working!)
```
Bank Transfer Gateway: Script loaded
Bank Transfer Gateway: DOMContentLoaded fired
Bank Transfer Gateway: initBankTransfer called, path: /lms/courses/quickbooks-master-course
Bank Transfer Gateway: Detected course page
Bank Transfer Gateway: API response status 200
Bank Transfer Gateway: Found pending payment {exists: true, status: 'Pending', redirect_url: '...'}
Bank Transfer Gateway: Notice appended to body
```

---

## 🎉 December 13, 2025 - Major Issues Resolved

### Issue 1: Site Crashed with ModuleNotFoundError
**Problem:** After removing docker-compose.yml changes, the site showed "Internal Server Error" with `ModuleNotFoundError: No module named 'bank_transfer_gateway'` and `'payments'`.

**Root Cause:** Apps were registered in database tables but Python modules didn't exist in containers.

**Solution:** Cleaned orphaned app references from multiple database tables:
- `tabDefaultValue` (installed_apps) - SET to `["frappe", "lms"]`
- `tabModule Def` - Deleted Bank Transfer Gateway, Payments, Payment Gateways
- `tabDocType` - Deleted all related doctypes

### Issue 2: 502 Bad Gateway After Container Restart
**Problem:** After restarting stack, nginx returned 502.

**Solution:** Run `nginx -s reload` in frontend container after backend restarts.

### Issue 3: CSS 404 Errors (Broken Styling)
**Problem:** Website unstyled due to CSS file hash mismatches.

**Solution:** Copy CSS files with correct hashes:
```bash
cp website.bundle.XRE5YRZD.css website.bundle.2Y6FVZRW.css
cp lms.bundle.LKFKGSLD.css lms.bundle.7HU65HCC.css
cp login.bundle.SP4OKUVQ.css login.bundle.6J4DKKOV.css
```

### Issue 4: JS File Not Served (404)
**Problem:** Frontend container didn't have the JS file.

**Solution:** Download directly to frontend container's assets folder:
```bash
cd /home/frappe/frappe-bench/sites/assets/bank_transfer_gateway/js/
curl -o bank_transfer.js https://raw.githubusercontent.com/Dinu-Sri/bank_transfer_gateway/master/bank_transfer_gateway/public/js/bank_transfer.js
```

### Issue 5: Vue.js Re-rendering Removed Our DOM Changes
**Problem:** When trying to modify the "Buy this course" button, Vue.js would re-render and undo changes.

**Solution:** Instead of modifying the Vue button, append a new floating notification to `document.body` with `position: fixed`. Vue doesn't touch elements outside its app container.

---

## 🎯 Project Goal

When a student initiates a bank transfer payment for a course but doesn't complete the payment submission:
1. ✅ **Show floating notification** with payment status
2. ✅ **Redirect them to the payment instructions page** where they can upload their bank slip
3. ✅ **"Buy this course" button also redirects** to payment page

### User Flow
1. Student clicks "Buy Now" on course
2. Student selects "Bank Transfer" payment method
3. Student sees bank details and payment instructions
4. **If student leaves without submitting slip:**
   - Next time they visit the course page
   - Floating notification appears: "Payment Pending - No need to buy again!"
   - They can click "Complete Payment / Upload Receipt" to continue

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

## 🔍 Debugging Next Steps

### 1. Verify JS file is accessible
```bash
# In frontend container
curl -I http://localhost:8080/assets/bank_transfer_gateway/js/bank_transfer.js
```

### 2. Check LMS app structure for injection points
```bash
# In backend container
find /home/frappe/frappe-bench/apps/lms -name "*.html" | head -20
find /home/frappe/frappe-bench/apps/lms -name "*.vue" | head -20
cat /home/frappe/frappe-bench/apps/lms/lms/www/*.html
```

### 3. Check how LMS loads its JavaScript
```bash
# In backend container
grep -r "lms.bundle" /home/frappe/frappe-bench/apps/lms --include="*.py" --include="*.html"
```

### 4. Option: Modify LMS base template directly
Find the base HTML file that LMS uses and add the script tag there.

### 5. Option: Build custom LMS bundle
Add bank_transfer.js to LMS's bundle configuration.

---

## 🌐 GitHub Repository

- **Bank Transfer Gateway**: https://github.com/Dinu-Sri/bank_transfer_gateway.git
- **Payments App**: https://github.com/frappe/payments.git

---

## 📋 Container Commands Reference

### Access Container Console
Via Portainer > Containers > [container name] > Console > Connect

### Install Apps (when container restarts)
```bash
# If scheduler/queue crashes with ModuleNotFoundError
# First change command to: ["tail", "-f", "/dev/null"]
# Then in container:
cd /home/frappe/frappe-bench/apps
git clone https://github.com/frappe/payments.git
git clone https://github.com/Dinu-Sri/bank_transfer_gateway.git
cd /home/frappe/frappe-bench
pip install -e apps/payments
pip install -e apps/bank_transfer_gateway
# Then change command back to original
```

### Fix CSS 404 Errors
```bash
# In frontend container - copy existing CSS to match requested hashes
cd /home/frappe/frappe-bench/sites/assets/frappe/dist/css/
# cp existing.css requested.css
```

---

## 🎯 Goal Summary

**Feature to Implement:**
1. Student with pending bank transfer payment visits course page
2. JS detects pending payment via API call
3. "Buy Now" button changes to "Complete Payment"
4. Clicking redirects to `/bank_transfer_instructions?order_id=XXX`
5. Student can upload bank slip and complete payment

**Current Blocker:**
The JavaScript file is not being loaded on LMS Vue SPA pages. Need to find how LMS injects its scripts and use the same mechanism for bank_transfer.js.

---

## 📝 Session Notes

- LMS is a Vue.js SPA, not traditional server-rendered pages
- LMS has its own bundled JavaScript (lms.bundle.js)
- Need to either:
  1. Add bank_transfer.js to LMS's bundle build process, OR
  2. Find LMS's base HTML template and add script tag, OR
  3. Modify LMS source code to include our functionality

---

*To continue: Read this document and focus on getting bank_transfer.js to load on LMS course pages.*
