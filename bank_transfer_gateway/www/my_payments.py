import frappe
from frappe import _

no_cache = 1

def get_context(context):
    # Require login
    if frappe.session.user == "Guest":
        frappe.throw(_("Please login to view your payments"), frappe.PermissionError)
        
    context.no_cache = 1
    context.title = "My Payments"
    
    # Get all orders for current user
    orders = frappe.get_all(
        "Bank Transfer Order",
        filters={
            "user": frappe.session.user
        },
        fields=[
            "name", "source_doctype", "source_docname", 
            "amount", "currency", "status", "creation",
            "modified", "rejection_reason", "receipt_image"
        ],
        order_by="creation desc"
    )
    
    context.orders = orders
    return context
