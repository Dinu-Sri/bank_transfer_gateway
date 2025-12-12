import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class BankTransferOrder(Document):
    """
    Bank Transfer Order - Tracks individual bank transfer payment orders.
    """

    def before_save(self):
        """Update timestamps based on status changes"""
        if self.status == "Confirmed" and not self.confirmed_at:
            self.confirmed_at = now_datetime()

        # Update receipt uploaded timestamp
        if self.payment_receipt and not self.receipt_uploaded_at:
            self.receipt_uploaded_at = now_datetime()

    def on_update(self):
        """Handle status changes"""
        if self.has_value_changed("status"):
            if self.status == "Confirmed":
                self.process_payment_completion()
            elif self.status == "Receipt Uploaded":
                self.notify_admin_receipt_uploaded()
            elif self.status == "Rejected":
                self.notify_student_rejection()

    def notify_admin_receipt_uploaded(self):
        """Notify admin when a student uploads a receipt"""
        settings = frappe.get_single("Bank Transfer Settings")
        if settings.admin_email:
            try:
                frappe.sendmail(
                    recipients=[settings.admin_email],
                    subject=_("Payment Receipt Uploaded - {0}").format(self.order_id),
                    message=_("""
                        <p>A student has uploaded a payment receipt for verification.</p>
                        <p><strong>Order ID:</strong> {order_id}</p>
                        <p><strong>Amount:</strong> {currency} {amount}</p>
                        <p><strong>Payer:</strong> {payer_name} ({payer_email})</p>
                        <p><strong>Course:</strong> {title}</p>
                        <p><strong>Student Notes:</strong> {notes}</p>
                        <p>Please login to verify the payment.</p>
                    """).format(
                        order_id=self.order_id,
                        currency=self.currency,
                        amount=self.amount,
                        payer_name=self.payer_name or "N/A",
                        payer_email=self.payer_email or "N/A",
                        title=self.title or "N/A",
                        notes=self.receipt_notes or "No notes provided"
                    )
                )
            except Exception as e:
                frappe.log_error(f"Failed to send receipt notification: {str(e)}")

    def notify_student_rejection(self):
        """Notify student when payment is rejected"""
        if not self.payer_email:
            return
        try:
            frappe.sendmail(
                recipients=[self.payer_email],
                subject=_("Payment Rejected - {0}").format(self.title or self.order_id),
                message=_("""
                    <p>Dear {payer_name},</p>
                    <p>Unfortunately, we could not verify your payment for the following order:</p>
                    <p><strong>Order Reference:</strong> {order_id}</p>
                    <p><strong>Amount:</strong> {currency} {amount}</p>
                    <p><strong>Item:</strong> {title}</p>
                    <p><strong>Reason:</strong> {reason}</p>
                    <p>Please check your payment details and try again, or contact support if you believe this is an error.</p>
                """).format(
                    payer_name=self.payer_name or "Student",
                    order_id=self.order_id,
                    currency=self.currency,
                    amount=self.amount,
                    title=self.title or "N/A",
                    reason=self.rejection_reason or "Payment could not be verified"
                )
            )
        except Exception as e:
            frappe.log_error(f"Failed to send rejection notification: {str(e)}")

    def process_payment_completion(self):
        """
        Process actions when payment is confirmed.
        This can trigger LMS enrollment or other actions.
        """
        # Notify admin
        settings = frappe.get_single("Bank Transfer Settings")
        if settings.admin_email:
            try:
                frappe.sendmail(
                    recipients=[settings.admin_email],
                    subject=_("Bank Transfer Payment Confirmed - {0}").format(self.order_id),
                    message=_("""
                        <p>A bank transfer payment has been confirmed.</p>
                        <p><strong>Order ID:</strong> {order_id}</p>
                        <p><strong>Amount:</strong> {currency} {amount}</p>
                        <p><strong>Payer:</strong> {payer_name} ({payer_email})</p>
                        <p><strong>Description:</strong> {title}</p>
                        <p><strong>Confirmation Method:</strong> {method}</p>
                    """).format(
                        order_id=self.order_id,
                        currency=self.currency,
                        amount=self.amount,
                        payer_name=self.payer_name or "N/A",
                        payer_email=self.payer_email or "N/A",
                        title=self.title or "N/A",
                        method=self.confirmation_method or "Not specified"
                    )
                )
            except Exception as e:
                frappe.log_error(f"Failed to send admin notification: {str(e)}")

        # Send confirmation to student
        if self.payer_email:
            self.send_student_confirmation()

        # If this is a course payment, trigger enrollment
        if self.reference_doctype == "LMS Course":
            self.enroll_in_course()

    def send_student_confirmation(self):
        """Send payment confirmation email to the student"""
        try:
            frappe.sendmail(
                recipients=[self.payer_email],
                subject=_("Payment Confirmed - {0}").format(self.title),
                message=_("""
                    <p>Dear {payer_name},</p>
                    <p>Great news! Your payment has been confirmed.</p>
                    <p><strong>Order Reference:</strong> {order_id}</p>
                    <p><strong>Amount:</strong> {currency} {amount}</p>
                    <p><strong>Course:</strong> {title}</p>
                    <p>You now have access to the course. Happy learning!</p>
                """).format(
                    payer_name=self.payer_name or "Student",
                    order_id=self.order_id,
                    currency=self.currency,
                    amount=self.amount,
                    title=self.title or "N/A"
                )
            )
        except Exception as e:
            frappe.log_error(f"Failed to send student confirmation: {str(e)}")

    def enroll_in_course(self):
        """Enroll the user in the LMS course after payment confirmation"""
        try:
            if not self.reference_docname or not self.payer_email:
                return

            # Find user by email
            user = frappe.db.get_value("User", {"email": self.payer_email}, "name")
            if not user:
                frappe.log_error(f"User not found for email: {self.payer_email}")
                return

            # Check if LMS Enrollment doctype exists
            if frappe.db.exists("DocType", "LMS Enrollment"):
                # Check if already enrolled
                existing = frappe.db.exists("LMS Enrollment", {
                    "course": self.reference_docname,
                    "member": user
                })
                if not existing:
                    enrollment = frappe.get_doc({
                        "doctype": "LMS Enrollment",
                        "course": self.reference_docname,
                        "member": user,
                        "member_type": "Student"
                    })
                    enrollment.insert(ignore_permissions=True)
                    frappe.db.commit()
                    frappe.log_error(f"Enrolled {user} in course {self.reference_docname}")
        except Exception as e:
            frappe.log_error(f"Failed to enroll user in course: {str(e)}")


@frappe.whitelist(allow_guest=False)
def confirm_payment(order_id, confirmation_method=None, admin_notes=None):
    """
    Whitelist method for admin to confirm a bank transfer payment.

    Args:
        order_id: The order ID to confirm
        confirmation_method: How payment was verified (Receipt uploaded via system, WhatsApp support, etc.)
        admin_notes: Internal notes for admin reference
    """
    if not frappe.has_permission("Bank Transfer Order", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    order = frappe.get_doc("Bank Transfer Order", {"order_id": order_id})
    order.status = "Confirmed"
    if confirmation_method:
        order.confirmation_method = confirmation_method
    if admin_notes:
        order.admin_notes = admin_notes
    order.save()
    frappe.db.commit()

    return {"status": "success", "message": _("Payment confirmed successfully")}


@frappe.whitelist(allow_guest=False)
def reject_payment(order_id, rejection_reason=None, admin_notes=None):
    """
    Whitelist method for admin to reject a bank transfer payment.

    Args:
        order_id: The order ID to reject
        rejection_reason: Reason for rejection (shown to student)
        admin_notes: Internal notes for admin reference
    """
    if not frappe.has_permission("Bank Transfer Order", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    order = frappe.get_doc("Bank Transfer Order", {"order_id": order_id})
    order.status = "Rejected"
    if rejection_reason:
        order.rejection_reason = rejection_reason
    if admin_notes:
        order.admin_notes = admin_notes
    order.save()
    frappe.db.commit()

    return {"status": "success", "message": _("Payment rejected")}


@frappe.whitelist(allow_guest=False)
def cancel_payment(order_id, reason=None):
    """
    Whitelist method for admin to cancel a bank transfer payment.
    """
    if not frappe.has_permission("Bank Transfer Order", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    order = frappe.get_doc("Bank Transfer Order", {"order_id": order_id})
    order.status = "Cancelled"
    if reason:
        order.admin_notes = reason
    order.save()
    frappe.db.commit()

    return {"status": "success", "message": _("Payment cancelled")}


@frappe.whitelist(allow_guest=True)
def upload_receipt(order_id, receipt_notes=None):
    """
    Whitelist method for students to upload payment receipt.
    The actual file is uploaded separately using Frappe's file upload mechanism.
    This method updates the order status and notes.

    Args:
        order_id: The order ID
        receipt_notes: Optional notes from student about the payment
    """
    # Get the order
    if not frappe.db.exists("Bank Transfer Order", {"order_id": order_id}):
        frappe.throw(_("Order not found"), frappe.DoesNotExistError)

    order = frappe.get_doc("Bank Transfer Order", {"order_id": order_id})

    # Only allow updates to pending orders
    if order.status not in ["Pending", "Receipt Uploaded"]:
        frappe.throw(_("Cannot update receipt for this order"))

    # Update notes if provided
    if receipt_notes:
        order.receipt_notes = receipt_notes

    # Status will be updated when the file attachment is saved
    order.save(ignore_permissions=True)
    frappe.db.commit()

    return {"status": "success", "message": _("Receipt notes saved")}


@frappe.whitelist(allow_guest=True)
def update_receipt_status(order_id, file_url):
    """
    Called after file upload to update the order with receipt info.

    Args:
        order_id: The order ID
        file_url: URL of the uploaded file
    """
    if not frappe.db.exists("Bank Transfer Order", {"order_id": order_id}):
        frappe.throw(_("Order not found"), frappe.DoesNotExistError)

    order = frappe.get_doc("Bank Transfer Order", {"order_id": order_id})

    # Only allow updates to pending orders
    if order.status not in ["Pending", "Receipt Uploaded"]:
        frappe.throw(_("Cannot update receipt for this order"))

    order.payment_receipt = file_url
    order.receipt_uploaded_at = now_datetime()
    order.status = "Receipt Uploaded"
    order.save(ignore_permissions=True)
    frappe.db.commit()

    return {"status": "success", "message": _("Receipt uploaded successfully. We will verify your payment shortly.")}


@frappe.whitelist(allow_guest=False)
def create_bank_transfer_order(doctype, docname, title=None, amount=None, currency=None):
    """
    Create a new bank transfer order for a course or batch purchase.
    
    Args:
        doctype: "LMS Course" or "LMS Batch"
        docname: The name of the course or batch
        title: Optional title override
        amount: Optional amount override
        currency: Optional currency override
    
    Returns:
        dict with order_id and redirect URL
    """
    import uuid
    
    # Check if bank transfer is enabled
    settings = frappe.get_single("Bank Transfer Settings")
    if not settings.enabled:
        frappe.throw(_("Bank Transfer payment is not currently available"))
    
    # Get user info
    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Please login to proceed with payment"))
    
    user_info = frappe.db.get_value("User", user, ["full_name", "email", "phone"], as_dict=True)
    
    # Get course/batch details if not provided
    if doctype == "LMS Course":
        if not frappe.db.exists("LMS Course", docname):
            frappe.throw(_("Course not found"))
        
        course = frappe.db.get_value("LMS Course", docname, 
            ["title", "course_price", "currency", "paid_course"], as_dict=True)
        
        if not course.paid_course:
            frappe.throw(_("This is a free course"))
        
        title = title or course.title
        amount = amount or course.course_price
        currency = currency or course.currency or settings.currency or "LKR"
        
        # Check if already enrolled
        if frappe.db.exists("LMS Enrollment", {"course": docname, "member": user}):
            frappe.throw(_("You are already enrolled in this course"))
    
    elif doctype == "LMS Batch":
        if not frappe.db.exists("LMS Batch", docname):
            frappe.throw(_("Batch not found"))
        
        batch = frappe.db.get_value("LMS Batch", docname, 
            ["title", "amount", "currency", "paid_batch"], as_dict=True)
        
        if not batch.paid_batch:
            frappe.throw(_("This batch does not require payment"))
        
        title = title or batch.title
        amount = amount or batch.amount
        currency = currency or batch.currency or settings.currency or "LKR"
        
        # Check if already enrolled
        if frappe.db.exists("LMS Batch Enrollment", {"batch": docname, "member": user}):
            frappe.throw(_("You are already enrolled in this batch"))
    else:
        frappe.throw(_("Invalid document type"))
    
    # Check for existing pending order (new fields)
    existing_order = frappe.db.exists("Bank Transfer Order", {
        "source_doctype": doctype,
        "source_docname": docname,
        "user": user,
        "status": ["in", ["Pending", "Receipt Uploaded"]]
    })
    
    # Fallback: check with old fields
    if not existing_order:
        existing_order = frappe.db.exists("Bank Transfer Order", {
            "reference_doctype": doctype,
            "reference_docname": docname,
            "payer_email": user_info.email,
            "status": ["in", ["Pending", "Receipt Uploaded"]]
        })
    
    if existing_order:
        order = frappe.get_doc("Bank Transfer Order", existing_order)
        return {
            "status": "existing",
            "order_id": order.order_id,
            "redirect_url": f"/bank-transfer-instructions/{order.order_id}",
            "message": _("You already have a pending order for this item")
        }
    
    # Generate unique order ID
    order_id = f"BT-{uuid.uuid4().hex[:8].upper()}"
    
    # Create new order
    order = frappe.get_doc({
        "doctype": "Bank Transfer Order",
        "order_id": order_id,
        "status": "Pending",
        "user": user,
        "created_at": now_datetime(),
        "amount": amount,
        "currency": currency,
        "title": title,
        "description": f"Payment for {doctype}: {title}",
        "source_doctype": doctype,
        "source_docname": docname,
        "payer_name": user_info.full_name,
        "payer_email": user_info.email,
        "payer_phone": user_info.phone,
        "reference_doctype": doctype,
        "reference_docname": docname,
        "redirect_to": f"/courses/{docname}" if doctype == "LMS Course" else f"/batches/{docname}"
    })
    
    order.insert(ignore_permissions=True)
    frappe.db.commit()
    
    return {
        "status": "success",
        "order_id": order_id,
        "redirect_url": f"/bank-transfer-instructions/{order_id}",
        "message": _("Order created successfully")
    }


@frappe.whitelist(allow_guest=True)
def get_bank_transfer_settings():
    """
    Get public bank transfer settings (check if enabled).
    """
    settings = frappe.get_single("Bank Transfer Settings")
    return {
        "enabled": settings.enabled,
        "currency": settings.currency
    }


@frappe.whitelist(allow_guest=False)
def check_existing_order(doctype, docname):
    """
    Check if user has an existing pending payment.
    First checks LMS Payment, then Bank Transfer Order.
    """
    user = frappe.session.user
    user_email = frappe.db.get_value("User", user, "email")
    
    # First check LMS Payment for pending payments (payment_received = 0)
    lms_payment = frappe.db.get_value("LMS Payment", {
        "member": user,
        "payment_for_document_type": doctype,
        "payment_for_document": docname,
        "payment_received": 0
    }, ["name", "billing_name", "amount"], as_dict=True)
    
    if lms_payment:
        # Check if there's a corresponding Bank Transfer Order
        bto = frappe.db.get_value("Bank Transfer Order", {
            "source_doctype": doctype,
            "source_docname": docname,
            "user": user,
            "status": ["in", ["Pending", "Receipt Uploaded", "Under Review"]]
        }, ["order_id", "status"], as_dict=True)
        
        if bto:
            return {
                "exists": True,
                "order_id": bto.order_id,
                "status": bto.status,
                "redirect_url": f"/bank-transfer-instructions/{bto.order_id}",
                "lms_payment": lms_payment.name
            }
        else:
            # LMS Payment exists but no Bank Transfer Order
            # Return info to redirect to billing page to complete payment
            return {
                "exists": True,
                "order_id": None,
                "status": "Pending",
                "redirect_url": f"/lms/billing/{doctype.lower().replace(' ', '-')}/{docname}",
                "lms_payment": lms_payment.name
            }
    
    # Fallback: Check Bank Transfer Order directly
    existing_order = frappe.db.get_value("Bank Transfer Order", {
        "source_doctype": doctype,
        "source_docname": docname,
        "user": user,
        "status": ["in", ["Pending", "Receipt Uploaded", "Under Review"]]
    }, ["order_id", "status"], as_dict=True)
    
    if existing_order:
        return {
            "exists": True,
            "order_id": existing_order.order_id,
            "status": existing_order.status,
            "redirect_url": f"/bank-transfer-instructions/{existing_order.order_id}"
        }
    
    return {"exists": False}

