import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import random_string, now_datetime, get_url


class BankTransferSettings(Document):
    """
    Bank Transfer Payment Gateway Settings.
    This DocType follows the Frappe Payments pattern for payment gateway integration.
    """

    def validate(self):
        """Validate the settings"""
        if self.enabled and not self.bank_name:
            frappe.throw(_("Bank Name is required when gateway is enabled"))
        if self.enabled and not self.account_number:
            frappe.throw(_("Account Number is required when gateway is enabled"))

    def validate_transaction_currency(self, currency):
        """
        Validate if the transaction currency is supported.
        Required method for Frappe Payments integration.
        """
        if currency != self.currency:
            frappe.throw(
                _("Bank Transfer currently only supports {0}").format(self.currency)
            )

    def get_payment_url(self, **kwargs):
        """
        Generate payment URL for bank transfer.
        Required method for Frappe Payments integration.
        
        This method creates a pending payment order and returns
        the URL to the bank transfer instructions page.
        """
        # Extract payment details from kwargs
        amount = kwargs.get("amount", 0)
        title = kwargs.get("title", "Course Payment")
        description = kwargs.get("description", "")
        reference_doctype = kwargs.get("reference_doctype", "")
        reference_docname = kwargs.get("reference_docname", "")
        payer_email = kwargs.get("payer_email", "")
        payer_name = kwargs.get("payer_name", "")
        order_id = kwargs.get("order_id", "")
        redirect_to = kwargs.get("redirect_to", "")

        # Generate a unique order reference if not provided
        if not order_id:
            order_id = f"BT-{random_string(8).upper()}"

        # Create a Bank Transfer Order record to track the payment
        order = frappe.get_doc({
            "doctype": "Bank Transfer Order",
            "order_id": order_id,
            "amount": amount,
            "currency": self.currency,
            "title": title,
            "description": description,
            "reference_doctype": reference_doctype,
            "reference_docname": reference_docname,
            "payer_email": payer_email,
            "payer_name": payer_name,
            "status": "Pending",
            "redirect_to": redirect_to,
            "created_at": now_datetime()
        })
        order.insert(ignore_permissions=True)
        frappe.db.commit()

        # Return URL to the bank transfer instructions page
        return get_url(f"/bank-transfer-instructions/{order_id}")

    def on_payment_authorized(self, order_id):
        """
        Called when admin confirms the bank transfer payment.
        This method should be called from the admin interface.
        """
        order = frappe.get_doc("Bank Transfer Order", {"order_id": order_id})
        order.status = "Completed"
        order.save(ignore_permissions=True)
        
        # Send confirmation email to payer
        if order.payer_email:
            self.send_confirmation_email(order)
        
        frappe.db.commit()
        return order

    def send_confirmation_email(self, order):
        """Send payment confirmation email to the payer"""
        try:
            frappe.sendmail(
                recipients=[order.payer_email],
                subject=_("Payment Confirmed - {0}").format(order.title),
                message=_("""
                    <p>Dear {payer_name},</p>
                    <p>Your payment has been confirmed!</p>
                    <p><strong>Order Reference:</strong> {order_id}</p>
                    <p><strong>Amount:</strong> {currency} {amount}</p>
                    <p>Thank you for your purchase.</p>
                """).format(
                    payer_name=order.payer_name or "Customer",
                    order_id=order.order_id,
                    currency=order.currency,
                    amount=order.amount
                )
            )
        except Exception as e:
            frappe.log_error(f"Failed to send confirmation email: {str(e)}")

