# Bank Transfer Payment Gateway for Frappe LMS

A custom Frappe app that adds **Bank Transfer** as a payment method for Frappe LMS. Designed for markets where online payment gateways are not available or where customers prefer manual bank transfers.

## 🎯 What This System Does

This app allows students to pay for LMS courses via bank transfer:

1. **Student** clicks "Buy Course" → selects Bank Transfer payment method
2. **System** creates a Bank Transfer Order with unique reference ID
3. **Student** sees bank account details and transfers money manually
4. **Student** uploads payment receipt/slip on the payment page
5. **Admin** reviews the receipt and confirms the payment
6. **System** automatically enrolls student in the course and sends confirmation email

## ✨ Features

- ✅ Bank Transfer Settings DocType for bank account configuration
- ✅ Automatic pending payment detection on course pages
- ✅ Floating notification for users with pending payments
- ✅ Payment instructions page with bank details
- ✅ Receipt upload functionality
- ✅ Admin approval workflow
- ✅ Automatic course enrollment on payment confirmation
- ✅ Email notifications (admin & student)
- ✅ WhatsApp integration link for receipts
- ✅ Works with Frappe LMS Vue.js SPA

## 📁 Project Structure

```
bank_transfer_gateway/
├── bank_transfer_gateway/
│   ├── __init__.py
│   ├── hooks.py                    # App configuration & hooks
│   ├── modules.txt
│   ├── patches.txt
│   ├── bank_transfer_gateway/
│   │   ├── __init__.py
│   │   ├── payment_controller.py   # LMS payment integration
│   │   ├── setup.py                # Gateway registration
│   │   ├── website_context.py      # Context injection
│   │   └── doctype/
│   │       ├── bank_transfer_order/
│   │       │   ├── bank_transfer_order.json    # DocType definition
│   │       │   └── bank_transfer_order.py      # Order logic & API
│   │       └── bank_transfer_settings/
│   │           ├── bank_transfer_settings.json # Settings DocType
│   │           └── bank_transfer_settings.py   # Settings logic
│   ├── public/
│   │   └── js/
│   │       └── bank_transfer.js    # Frontend JS for LMS pages
│   └── www/
│       ├── bank_transfer_instructions.html  # Payment page template
│       ├── bank_transfer_instructions.py    # Payment page controller
│       ├── my_payments.html                 # User payments list
│       └── my_payments.py
├── README.md
├── setup.py
├── pyproject.toml
├── requirements.txt
└── license.txt
```

## 🐳 Installation on Docker (Portainer)

### Prerequisites

- Frappe/ERPNext Docker stack running via Portainer
- LMS app installed
- Payments app installed (required dependency)

### Step 1: Access Backend Container

```bash
# Find your backend container name
docker ps | grep backend

# Access the container
docker exec -it <backend_container_name> bash

# Navigate to frappe-bench
cd /home/frappe/frappe-bench
```

### Step 2: Install Payments App (if not installed)

```bash
# Check if payments app exists
ls apps/ | grep payments

# If not, get it
bench get-app payments

# Or clone directly
cd apps
git clone https://github.com/frappe/payments.git
cd ..

# Install with correct pip
./env/bin/pip install -e apps/payments

# Add to apps.txt if not there
echo "payments" >> sites/apps.txt

# Install to site
bench --site frontend install-app payments
```

### Step 3: Install Bank Transfer Gateway

```bash
# Navigate to apps folder
cd /home/frappe/frappe-bench/apps

# Clone the repository
git clone https://github.com/Dinu-Sri/bank_transfer_gateway.git

# Go back to bench
cd ..

# Install with pip (use ./env/bin/pip to ensure correct virtualenv)
./env/bin/pip install -e apps/bank_transfer_gateway

# Add to apps.txt
echo "bank_transfer_gateway" >> sites/apps.txt

# Install to your site
bench --site frontend install-app bank_transfer_gateway

# Run migrations
bench --site frontend migrate

# Build assets
bench build --app bank_transfer_gateway
```

### Step 4: Deploy JavaScript to Frontend Container

The frontend container (nginx) serves static assets. You need to copy the JS file:

```bash
# Exit backend container first
exit

# Find frontend container
docker ps | grep frontend

# Copy JS file to frontend container
docker exec -it <frontend_container_name> sh

# Inside frontend container
cd /home/frappe/frappe-bench/sites/assets

# Create directory if not exists
mkdir -p bank_transfer_gateway/js

# Download JS from GitHub
cd bank_transfer_gateway/js
wget -O bank_transfer.js "https://raw.githubusercontent.com/Dinu-Sri/bank_transfer_gateway/master/bank_transfer_gateway/public/js/bank_transfer.js"

# Or use curl
curl -o bank_transfer.js "https://raw.githubusercontent.com/Dinu-Sri/bank_transfer_gateway/master/bank_transfer_gateway/public/js/bank_transfer.js"

# Verify
ls -la
cat bank_transfer.js | head -20

# Exit frontend container
exit
```

### Step 5: Restart Services

```bash
# Restart backend container
docker restart <backend_container_name>

# Or inside backend container
supervisorctl restart all
```

### Step 6: Clear Cache

```bash
docker exec -it <backend_container_name> bash
cd /home/frappe/frappe-bench
bench --site frontend clear-cache
```

## ⚙️ Configuration

### 1. Configure Bank Transfer Settings

Go to: `https://your-site.com/app/bank-transfer-settings`

Fill in:
- **Enabled**: ✓ Check to enable
- **Bank Name**: Your bank name
- **Account Name**: Account holder name
- **Account Number**: Bank account number
- **Branch Code** (optional): Bank branch
- **Currency**: LKR, USD, etc.
- **Admin Email**: Email for notifications
- **WhatsApp Number** (optional): For receipt submissions
- **Payment Instructions**: Custom HTML instructions
- **Confirmation Message**: Message shown after payment

### 2. Register Payment Gateway (if not auto-registered)

Run in bench console:
```bash
bench --site frontend console
```

```python
from bank_transfer_gateway.bank_transfer_gateway.setup import register_payment_gateway
register_payment_gateway()
frappe.db.commit()
exit()
```

### 3. Verify Installation

Check these URLs:
- Bank Transfer Settings: `/app/bank-transfer-settings`
- Bank Transfer Orders: `/app/bank-transfer-order`
- Test a course page - floating notification should appear for pending payments

## 🔄 Updating the App

### Update Backend Code

```bash
docker exec -it <backend_container_name> bash
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
docker exec -it <frontend_container_name> sh
cd /home/frappe/frappe-bench/sites/assets/bank_transfer_gateway/js
curl -o bank_transfer.js "https://raw.githubusercontent.com/Dinu-Sri/bank_transfer_gateway/master/bank_transfer_gateway/public/js/bank_transfer.js"
exit
```

## 📋 Admin Workflow

### Approving Payments

1. Go to: `https://your-site.com/app/bank-transfer-order`
2. Filter by **Status** = "Receipt Uploaded"
3. Open the order
4. View the uploaded receipt
5. Change **Status** to "Confirmed"
6. Save

**On Confirmation:**
- Student is automatically enrolled in the course
- Student receives confirmation email
- LMS Payment is marked as received

### Rejecting Payments

1. Open the order
2. Change **Status** to "Rejected"
3. Fill in **Rejection Reason**
4. Save

Student will receive rejection email with the reason.

## 🔧 Troubleshooting

### JavaScript Not Loading

Check browser console for 404 errors. If JS file is missing:

```bash
# In frontend container
docker exec -it <frontend_container_name> sh
ls -la /home/frappe/frappe-bench/sites/assets/bank_transfer_gateway/js/
```

If missing, re-download as shown in Step 4.

### CSS 404 Errors

CSS files have version hashes. Copy with correct names:

```bash
# In frontend container
cd /home/frappe/frappe-bench/sites/assets/frappe/css
cp website.bundle.css website.bundle.XXXXXX.css
```

See `DOCKER_TROUBLESHOOTING.md` for details.

### Permission Errors on File Upload

The app uses `ignore_permissions=True` for backend operations. If you still get 403 errors, check that the upload doesn't specify `doctype` parameter.

### Emails Not Sending

Ensure Email Account is configured:
- Go to: `/app/email-account`
- Set up outgoing email with valid SMTP credentials

### Pending Payment Not Detected

Test the API in bench console:

```python
frappe.set_user("student@example.com")
from bank_transfer_gateway.bank_transfer_gateway.doctype.bank_transfer_order.bank_transfer_order import check_existing_order
result = check_existing_order(doctype="LMS Course", docname="your-course-name")
print(result)
```

## 📧 Email Notifications

| Event | Student | Admin |
|-------|---------|-------|
| Receipt Uploaded | ❌ | ✅ |
| Payment Confirmed | ✅ | ✅ |
| Payment Rejected | ✅ | ❌ |

## 🛠️ Development

### Local Development

```bash
# Clone repo
git clone https://github.com/Dinu-Sri/bank_transfer_gateway.git

# Make changes
# Commit and push
git add -A
git commit -m "Your message"
git push
```

### Key Files to Edit

- **Frontend behavior**: `public/js/bank_transfer.js`
- **Payment page UI**: `www/bank_transfer_instructions.html`
- **Backend logic**: `doctype/bank_transfer_order/bank_transfer_order.py`
- **App hooks**: `hooks.py`

## 📄 License

MIT License

## 👤 Author

Dinu Sri - [GitHub](https://github.com/Dinu-Sri)

