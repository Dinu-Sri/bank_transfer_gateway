"""
Setup and installation utilities for Bank Transfer Gateway
"""

import frappe
from frappe import _


def after_install():
    """
    Called after the app is installed.
    Sets up the payment gateway and default settings.
    """
    setup_payment_gateway()
    setup_default_settings()


def setup_payment_gateway():
    """
    Register Bank Transfer as a Payment Gateway in the Payments app.
    """
    try:
        # Check if Payment Gateway doctype exists (payments app installed)
        if not frappe.db.exists("DocType", "Payment Gateway"):
            frappe.log_error("Payment Gateway doctype not found. Payments app may not be installed.")
            return
        
        # Check if Bank Transfer gateway already exists
        if frappe.db.exists("Payment Gateway", "Bank Transfer"):
            print("Bank Transfer gateway already exists")
            return
        
        # Create the Payment Gateway entry
        gateway = frappe.get_doc({
            "doctype": "Payment Gateway",
            "gateway": "Bank Transfer",
            "gateway_controller": "Bank Transfer Settings",
            "gateway_settings": "Bank Transfer Settings",
            "is_default": 0
        })
        gateway.insert(ignore_permissions=True)
        
        frappe.db.commit()
        print("Bank Transfer Payment Gateway registered successfully")
        
    except Exception as e:
        frappe.log_error(f"Failed to setup payment gateway: {str(e)}")
        print(f"Warning: Could not setup payment gateway: {str(e)}")


def setup_default_settings():
    """
    Set up default Bank Transfer Settings if not already configured.
    """
    try:
        settings = frappe.get_single("Bank Transfer Settings")
        
        # Only set defaults if not already configured
        if not settings.bank_name:
            settings.enabled = 1
            settings.currency = "LKR"
            settings.bank_name = "Your Bank Name"
            settings.account_name = "Your Account Name"
            settings.account_number = "0000000000"
            settings.payment_instructions = """
                <p>Please transfer the exact amount to the bank account shown above.</p>
                <p><strong>Important:</strong></p>
                <ul>
                    <li>Use your Order Reference as the payment description/reference</li>
                    <li>After making the payment, upload your receipt or send via WhatsApp</li>
                    <li>Your enrollment will be processed within 24-48 hours after payment verification</li>
                </ul>
            """
            settings.confirmation_message = "Your enrollment will be activated within 24-48 hours after we verify your payment."
            settings.save(ignore_permissions=True)
            frappe.db.commit()
            print("Default Bank Transfer Settings created")
            
    except Exception as e:
        frappe.log_error(f"Failed to setup default settings: {str(e)}")
        print(f"Warning: Could not setup default settings: {str(e)}")


@frappe.whitelist()
def register_payment_gateway():
    """
    Whitelist method to manually register the payment gateway.
    Can be called from the desk if automatic registration failed.
    """
    setup_payment_gateway()
    return {"status": "success", "message": _("Payment Gateway registered successfully")}
