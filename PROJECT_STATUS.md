# Bank Transfer Gateway - Project Status & Context

**Last Updated:** December 12, 2025

---

## 🎯 Project Goal

When a student initiates a bank transfer payment for a course but doesn't complete the payment submission:
1. **Change the "Buy Now" button to "Complete Payment"** on the course page
2. **Redirect them to the payment instructions page** where they can upload their bank slip

### User Flow
1. Student clicks "Buy Now" on course
2. Student selects "Bank Transfer" payment method
3. Student sees bank details and payment instructions
4. **PROBLEM**: If student leaves without submitting slip, there's no way to return to that page
5. **SOLUTION**: Detect pending payment, change button to "Complete Payment", redirect to instructions page

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
- When apps are updated, must reinstall in each container

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
app_include_js = []
web_include_js = ["/assets/bank_transfer_gateway/js/bank_transfer.js"]
```

---

## ✅ What's Working

1. **All Docker containers running** - backend, frontend, scheduler, queue-long, queue-short, websocket
2. **Apps installed in all containers** - payments and bank_transfer_gateway
3. **Email/SMTP working** - scheduler sends emails
4. **CSS assets fixed** - all pages styling works
5. **API endpoint works** - `check_existing_order` returns correct data when called directly
6. **JS file exists** - at `/assets/bank_transfer_gateway/js/bank_transfer.js` in frontend container

---

## ❌ Current Problem

### JS Not Loading on LMS Pages

**The Issue:**
- LMS uses Vue.js SPA (Single Page Application)
- Frappe's `web_include_js` hook only works for traditional Jinja-rendered pages
- LMS pages don't use Frappe's standard template system
- The bank_transfer.js script is NOT being injected into LMS pages

**Evidence:**
- Page source doesn't show the script tag
- Console doesn't show "Bank Transfer Gateway: Script loaded"
- The script works on non-LMS pages (home, login, etc.)

### Attempted Solutions

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
