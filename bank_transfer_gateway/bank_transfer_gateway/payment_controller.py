"""
Bank Transfer Payment Controller
Integrates Bank Transfer with Frappe Payments app
"""

import frappe
from frappe import _
from frappe.utils import now_datetime
import uuid


def on_lms_payment_update(doc, method):
    """
    Hook called when LMS Payment document is updated.
    Automatically creates enrollment when payment_received is checked.
    Also syncs Bank Transfer Order status.
    """
    # Check if payment_received was just set to True
    if doc.payment_received and doc.has_value_changed("payment_received"):
        # Create enrollment
        create_enrollment_from_payment(doc)
        
        # Also update corresponding Bank Transfer Order if exists
        sync_bank_transfer_order_status(doc)


def sync_bank_transfer_order_status(payment_doc):
    """
    Update Bank Transfer Order status when LMS Payment is confirmed.
    This keeps both records in sync.
    """
    try:
        # Find Bank Transfer Order by reference
        order_name = frappe.db.get_value("Bank Transfer Order", {
            "reference_doctype": payment_doc.payment_for_document_type,
            "reference_docname": payment_doc.payment_for_document,
            "payer_email": frappe.db.get_value("User", payment_doc.member, "email"),
            "status": ["in", ["Pending", "Receipt Uploaded"]]
        })
        
        if order_name:
            order = frappe.get_doc("Bank Transfer Order", order_name)
            order.status = "Confirmed"
            order.confirmation_method = "Admin confirmed via LMS Transaction"
            order.admin_notes = f"Confirmed via LMS Payment: {payment_doc.name}"
            order.save(ignore_permissions=True)
            frappe.db.commit()
    except Exception as e:
        frappe.log_error(f"Failed to sync Bank Transfer Order status: {str(e)}")


def create_enrollment_from_payment(payment_doc):
    """
    Create LMS Enrollment when payment is confirmed.
    Works for both course and batch payments.
    """
    try:
        member = payment_doc.member
        doctype = payment_doc.payment_for_document_type
        docname = payment_doc.payment_for_document
        
        if not member or not docname:
            frappe.log_error(f"Missing member or document info for payment {payment_doc.name}")
            return
        
        # Handle certificate-only purchase
        if payment_doc.payment_for_certificate:
            # For certificate purchase, just update existing enrollment
            if frappe.db.exists("LMS Enrollment", {"member": member, "course": docname}):
                frappe.db.set_value(
                    "LMS Enrollment",
                    {"member": member, "course": docname},
                    {
                        "purchased_certificate": 1,
                        "payment": payment_doc.name
                    }
                )
                frappe.db.commit()
                frappe.msgprint(_("Certificate purchase recorded for {0}").format(member))
            return
        
        # Handle course enrollment
        if doctype == "LMS Course":
            # Check if already enrolled
            if frappe.db.exists("LMS Enrollment", {"member": member, "course": docname}):
                frappe.msgprint(_("User {0} is already enrolled in this course").format(member))
                return
            
            # Create enrollment
            enrollment = frappe.get_doc({
                "doctype": "LMS Enrollment",
                "member": member,
                "course": docname,
                "member_type": "Student",
                "payment": payment_doc.name
            })
            enrollment.insert(ignore_permissions=True)
            frappe.db.commit()
            
            frappe.msgprint(_("Successfully enrolled {0} in course {1}").format(member, docname))
            
            # Send confirmation email
            send_enrollment_confirmation(member, docname, payment_doc)
        
        # Handle batch enrollment
        elif doctype == "LMS Batch":
            # Check if already enrolled
            if frappe.db.exists("LMS Batch Enrollment", {"member": member, "batch": docname}):
                frappe.msgprint(_("User {0} is already enrolled in this batch").format(member))
                return
            
            # Create batch enrollment
            enrollment = frappe.get_doc({
                "doctype": "LMS Batch Enrollment",
                "member": member,
                "batch": docname,
                "payment": payment_doc.name,
                "source": payment_doc.source
            })
            enrollment.insert(ignore_permissions=True)
            frappe.db.commit()
            
            frappe.msgprint(_("Successfully enrolled {0} in batch {1}").format(member, docname))
            
    except Exception as e:
        frappe.log_error(f"Error creating enrollment: {str(e)}")
        frappe.throw(_("Failed to create enrollment: {0}").format(str(e)))


def send_enrollment_confirmation(member, course, payment_doc):
    """Send enrollment confirmation email to the student"""
    try:
        user = frappe.get_doc("User", member)
        course_title = frappe.db.get_value("LMS Course", course, "title")
        
        frappe.sendmail(
            recipients=[member],
            subject=_("Enrollment Confirmed - {0}").format(course_title),
            message=_("""
                <p>Dear {name},</p>
                <p>Great news! Your payment has been confirmed and you are now enrolled in:</p>
                <p><strong>{course}</strong></p>
                <p><strong>Amount Paid:</strong> {currency} {amount}</p>
                <p>You can start learning right away by visiting your dashboard.</p>
                <p>Happy Learning!</p>
            """).format(
                name=user.full_name or user.first_name or "Student",
                course=course_title,
                currency=payment_doc.currency,
                amount=payment_doc.amount
            )
        )
    except Exception as e:
        frappe.log_error(f"Failed to send enrollment confirmation: {str(e)}")


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
