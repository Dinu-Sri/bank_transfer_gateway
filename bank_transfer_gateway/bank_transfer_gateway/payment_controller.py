"""
Bank Transfer Payment Controller
Integrates Bank Transfer with Frappe Payments app
"""

import frappe
from frappe import _
from frappe.utils import now_datetime
import uuid


def get_payment_url(**kwargs):
    """
    Called by the payments app to get the payment URL.
    For bank transfer, we redirect to our instructions page.
    
    Args:
        kwargs: Payment details including amount, currency, reference_doctype, reference_docname, etc.
    
    Returns:
        URL to redirect the user to
    """
    # Create a bank transfer order
    order_id = create_order_from_payment_request(kwargs)
    
    # Return the URL to our bank transfer instructions page
    return f"/bank-transfer-instructions/{order_id}"


def create_order_from_payment_request(kwargs):
    """
    Create a Bank Transfer Order from payment request data.
    """
    # Check if bank transfer is enabled
    settings = frappe.get_single("Bank Transfer Settings")
    if not settings.enabled:
        frappe.throw(_("Bank Transfer payment is not currently available"))
    
    # Get user info
    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Please login to proceed with payment"))
    
    user_info = frappe.db.get_value("User", user, ["full_name", "email", "phone"], as_dict=True)
    
    # Extract payment details from kwargs
    amount = kwargs.get("amount")
    currency = kwargs.get("currency") or settings.currency or "LKR"
    title = kwargs.get("title") or kwargs.get("subject") or kwargs.get("description") or "Course Payment"
    reference_doctype = kwargs.get("reference_doctype")
    reference_docname = kwargs.get("reference_docname") or kwargs.get("reference_name")
    payer_email = kwargs.get("payer_email") or user_info.email
    payer_name = kwargs.get("payer_name") or user_info.full_name
    redirect_to = kwargs.get("redirect_to") or kwargs.get("redirect_url") or "/"
    
    # Check for existing pending order
    existing_order = frappe.db.exists("Bank Transfer Order", {
        "reference_doctype": reference_doctype,
        "reference_docname": reference_docname,
        "payer_email": payer_email,
        "status": ["in", ["Pending", "Receipt Uploaded"]]
    })
    
    if existing_order:
        order = frappe.get_doc("Bank Transfer Order", existing_order)
        return order.order_id
    
    # Generate unique order ID
    order_id = f"BT-{uuid.uuid4().hex[:8].upper()}"
    
    # Create new order
    order = frappe.get_doc({
        "doctype": "Bank Transfer Order",
        "order_id": order_id,
        "status": "Pending",
        "created_at": now_datetime(),
        "amount": amount,
        "currency": currency,
        "title": title,
        "description": f"Payment for {reference_doctype}: {title}",
        "payer_name": payer_name,
        "payer_email": payer_email,
        "payer_phone": user_info.phone if user_info else None,
        "reference_doctype": reference_doctype,
        "reference_docname": reference_docname,
        "redirect_to": redirect_to
    })
    
    order.insert(ignore_permissions=True)
    frappe.db.commit()
    
    return order_id


def validate_transaction_currency(currency):
    """
    Validate if the currency is supported.
    Bank transfer typically supports all currencies.
    """
    return True


def get_gateway_controller(doctype=None, docname=None):
    """
    Return the gateway controller module path.
    """
    return "bank_transfer_gateway.bank_transfer_gateway.bank_transfer_gateway.payment_controller"


@frappe.whitelist(allow_guest=False)
def get_bank_transfer_url(doctype, docname, amount, currency=None, title=None, redirect_to=None):
    """
    Whitelist method to get bank transfer payment URL.
    Can be called from frontend to initiate bank transfer.
    
    Args:
        doctype: Reference document type (e.g., "LMS Course", "LMS Batch")
        docname: Reference document name
        amount: Payment amount
        currency: Currency code (default: LKR)
        title: Payment title
        redirect_to: URL to redirect after payment confirmation
    
    Returns:
        dict with payment_url
    """
    payment_url = get_payment_url(
        reference_doctype=doctype,
        reference_docname=docname,
        amount=amount,
        currency=currency,
        title=title,
        redirect_to=redirect_to
    )
    
    return {"payment_url": payment_url}
