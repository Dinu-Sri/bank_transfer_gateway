app_name = "bank_transfer_gateway"
app_title = "Bank Transfer Gateway"
app_publisher = "Your Name"
app_description = "Bank Transfer Payment Gateway for Frappe LMS"
app_email = "your.email@example.com"
app_license = "MIT"
required_apps = ["frappe"]

# Document Events
# ----------------
# Hook on document methods and events

# doc_events = {
#     "*": {
#         "on_update": "method",
#     }
# }

# Website
# -------
# Include custom pages
website_route_rules = [
    {
        "from_route": "/bank-transfer-instructions/<order_id>",
        "to_route": "bank_transfer_instructions",
    },
]

# Whitelisted Methods
# -------------------
# Methods that can be called from the web

# fixtures = []

# Include js, css files in header of web template
# web_include_css = "/assets/bank_transfer_gateway/css/bank_transfer.css"
# web_include_js = "/assets/bank_transfer_gateway/js/bank_transfer.js"

