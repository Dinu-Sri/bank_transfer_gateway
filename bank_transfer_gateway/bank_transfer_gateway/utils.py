"""
Utility functions for Bank Transfer Gateway
Includes response injection for LMS SPA pages
"""

import frappe


def inject_bank_transfer_script(response=None, request=None):
    """
    Inject bank transfer script into HTML responses.
    
    This hook runs after every request and injects our JavaScript
    into HTML pages, ensuring it loads even on Vue SPA pages like LMS.
    
    This is the most stable method as it:
    - Lives in our app (not LMS)
    - Survives LMS/Frappe updates
    - Gets deployed with our app via git
    
    Args:
        response: Werkzeug Response object
        request: Werkzeug Request object
    """
    try:
        # Only process HTML responses
        if not response or not hasattr(response, 'content_type'):
            return
            
        if not response.content_type or 'text/html' not in response.content_type:
            return
        
        # Check if response has data
        if not hasattr(response, 'data') or not response.data:
            return
        
        # Script tag to inject
        script_tag = b'<script src="/assets/bank_transfer_gateway/js/bank_transfer.js"></script></body>'
        
        # Only inject if </body> exists and script not already present
        if b'</body>' in response.data and b'bank_transfer_gateway' not in response.data:
            response.data = response.data.replace(b'</body>', script_tag)
            
    except Exception as e:
        # Log error but don't break the response
        frappe.log_error(f"Bank Transfer Gateway: Script injection error: {str(e)}")
