app_name = "bank_transfer_gateway"
app_title = "Bank Transfer Gateway"
app_publisher = "Your Name"
app_description = "Bank Transfer Payment Gateway for Frappe LMS"
app_email = "your.email@example.com"
app_license = "MIT"
required_apps = ["frappe"]

# Installation
# ------------
after_install = "bank_transfer_gateway.bank_transfer_gateway.setup.after_install"

# Response Hook - Inject JS into all HTML pages (including LMS Vue SPA)
# This is the most stable method that survives LMS updates
after_request = ["bank_transfer_gateway.bank_transfer_gateway.utils.inject_bank_transfer_script"]

# Document Events
# ----------------
# Hook on document methods and events
doc_events = {
    "LMS Payment": {
        "on_update": "bank_transfer_gateway.bank_transfer_gateway.payment_controller.on_lms_payment_update"
    }
}

# Website
# -------
# Include custom pages
website_route_rules = [
    {
        "from_route": "/bank-transfer-instructions/<order_id>",
        "to_route": "bank_transfer_instructions",
    },
    {
        "from_route": "/my-payments",
        "to_route": "my_payments",
    },
]

# Whitelisted Methods
# -------------------
# Methods that can be called from the web

# fixtures = []

# Include js, css files in header of web template
web_include_js = "/assets/bank_transfer_gateway/js/bank_transfer.js"
# web_include_css = "/assets/bank_transfer_gateway/css/bank_transfer.css"

# Update website context to inject our script in LMS pages
update_website_context = "bank_transfer_gateway.bank_transfer_gateway.website_context.update_context"

