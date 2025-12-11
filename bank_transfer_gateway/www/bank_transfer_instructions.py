import frappe
from frappe import _

no_cache = 1


def get_context(context):
    """
    Context for the bank transfer instructions page.
    """
    # Get order_id from path
    order_id = frappe.form_dict.get("order_id")
    
    if not order_id:
        context.order = None
        context.settings = None
        frappe.throw(_("Order ID is required"), frappe.DoesNotExistError)
        return
    
    # Get the order
    try:
        order = frappe.get_doc("Bank Transfer Order", {"order_id": order_id})
        context.order = order
    except frappe.DoesNotExistError:
        context.order = None
        context.settings = None
        frappe.throw(_("Order not found"), frappe.DoesNotExistError)
        return
    
    # Get bank transfer settings
    try:
        settings = frappe.get_single("Bank Transfer Settings")
        context.settings = settings
    except Exception:
        context.settings = None
    
    context.title = _("Bank Transfer Payment - {0}").format(order_id)
    context.no_cache = 1

