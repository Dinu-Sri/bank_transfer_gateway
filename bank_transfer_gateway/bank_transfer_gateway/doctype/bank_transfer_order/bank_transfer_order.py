import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class BankTransferOrder(Document):
    """
    Bank Transfer Order - Tracks individual bank transfer payment orders.
    """

    def before_save(self):
        """Update confirmed_at timestamp when status changes to Completed"""
        if self.status == "Completed" and not self.confirmed_at:
            self.confirmed_at = now_datetime()

    def on_update(self):
        """Handle status changes"""
        if self.has_value_changed("status") and self.status == "Completed":
            self.process_payment_completion()

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
                    """).format(
                        order_id=self.order_id,
                        currency=self.currency,
                        amount=self.amount,
                        payer_name=self.payer_name or "N/A",
                        payer_email=self.payer_email or "N/A",
                        title=self.title or "N/A"
                    )
                )
            except Exception as e:
                frappe.log_error(f"Failed to send admin notification: {str(e)}")

        # If this is a course payment, you can trigger enrollment here
        if self.reference_doctype == "LMS Course":
            self.enroll_in_course()

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
def confirm_payment(order_id, admin_notes=None):
    """
    Whitelist method for admin to confirm a bank transfer payment.
    """
    if not frappe.has_permission("Bank Transfer Order", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    order = frappe.get_doc("Bank Transfer Order", {"order_id": order_id})
    order.status = "Completed"
    if admin_notes:
        order.admin_notes = admin_notes
    order.save()
    frappe.db.commit()

    return {"status": "success", "message": _("Payment confirmed successfully")}


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

