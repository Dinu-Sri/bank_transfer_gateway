import frappe


def update_context(context):
    """
    Update website context to inject bank transfer JS in LMS pages.
    This hook is called for every page render.
    """
    # Add our custom script to the page
    # This will be available as a variable in templates
    if not hasattr(context, 'bank_transfer_script'):
        context.bank_transfer_script = '/assets/bank_transfer_gateway/js/bank_transfer.js'
    
    # For LMS pages, we need to inject the script differently
    # Check if we're on an LMS route
    path = frappe.local.request.path if frappe.local.request else ''
    
    if '/lms/' in path or path.startswith('/courses') or path.startswith('/batches'):
        # Inject script tag for LMS pages
        script_tag = '<script src="/assets/bank_transfer_gateway/js/bank_transfer.js" defer></script>'
        
        if not context.get('bank_transfer_injected'):
            context.bank_transfer_injected = True
            
            # Add to head_html or footer_html if available
            if hasattr(context, 'head_html'):
                context.head_html = (context.head_html or '') + script_tag
            else:
                context.head_html = script_tag
