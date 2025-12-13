/**
 * Bank Transfer Gateway - LMS Integration
 * This script handles:
 * 1. Adding "Pay via Bank Transfer" button to course pages
 * 2. Changing "Buy Now" to "Complete Payment" for pending orders
 * 3. Redirecting users to their pending payment page
 */

(function() {
    'use strict';
    
    console.log('Bank Transfer Gateway: Script loaded');

    // Wait for page to load
    document.addEventListener('DOMContentLoaded', function() {
        console.log('Bank Transfer Gateway: DOMContentLoaded fired');
        // Delay to ensure LMS components are loaded
        setTimeout(initBankTransfer, 1500);
    });
    
    // If DOM is already loaded, run immediately
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        console.log('Bank Transfer Gateway: DOM already ready, running now');
        setTimeout(initBankTransfer, 1000);
    }

    // Also run when URL changes (SPA navigation)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(initBankTransfer, 1500);
        }
    }).observe(document, {subtree: true, childList: true});

    async function initBankTransfer() {
        // Check if we're on a course or batch page
        const path = window.location.pathname;
        console.log('Bank Transfer Gateway: initBankTransfer called, path:', path);
        
        if (path.includes('/courses/') || path.includes('/lms/courses/')) {
            console.log('Bank Transfer Gateway: Detected course page');
            await setupCoursePaymentStatus();
        } else if (path.includes('/batches/') || path.includes('/lms/batches/')) {
            await setupBatchPaymentStatus();
        }
    }

    async function setupCoursePaymentStatus() {
        // Get course name from URL
        const pathParts = window.location.pathname.split('/');
        const courseIndex = pathParts.findIndex(p => p === 'courses');
        if (courseIndex === -1 || !pathParts[courseIndex + 1]) return;
        
        // Handle /learn/ subpath
        let courseName = pathParts[courseIndex + 1];
        if (courseName === 'learn' || !courseName) return;
        
        courseName = decodeURIComponent(courseName);
        
        // Check for pending bank transfer order
        await checkAndUpdatePaymentButton('LMS Course', courseName);
    }

    async function setupBatchPaymentStatus() {
        // Get batch name from URL
        const pathParts = window.location.pathname.split('/');
        const batchIndex = pathParts.findIndex(p => p === 'batches');
        if (batchIndex === -1 || !pathParts[batchIndex + 1]) return;
        
        const batchName = decodeURIComponent(pathParts[batchIndex + 1]);
        
        await checkAndUpdatePaymentButton('LMS Batch', batchName);
    }

    // Helper function to make API calls without requiring frappe object
    async function callAPI(method, args) {
        try {
            console.log('Bank Transfer Gateway: Calling API', method, args);
            
            const response = await fetch('/api/method/' + method, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Frappe-CSRF-Token': getCSRFToken()
                },
                body: JSON.stringify(args)
            });
            
            console.log('Bank Transfer Gateway: API response status', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.log('Bank Transfer Gateway: API error response', errorText);
                throw new Error('API call failed: ' + response.status);
            }
            
            const data = await response.json();
            console.log('Bank Transfer Gateway: API success', data);
            return data;
        } catch (e) {
            console.log('Bank Transfer Gateway API Error:', e);
            return null;
        }
    }
    
    // Get CSRF token from cookie or meta tag
    function getCSRFToken() {
        // First try window.csrf_token (used by LMS/Frappe)
        if (typeof window !== 'undefined' && window.csrf_token) {
            console.log('Bank Transfer Gateway: Got CSRF from window.csrf_token');
            return window.csrf_token;
        }
        // Try frappe.csrf_token
        if (typeof frappe !== 'undefined' && frappe.csrf_token) {
            console.log('Bank Transfer Gateway: Got CSRF from frappe.csrf_token');
            return frappe.csrf_token;
        }
        // Try to get from cookie
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'csrf_token') {
                console.log('Bank Transfer Gateway: Got CSRF from cookie');
                return value;
            }
        }
        // Try meta tag
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) {
            console.log('Bank Transfer Gateway: Got CSRF from meta tag');
            return meta.getAttribute('content');
        }
        console.log('Bank Transfer Gateway: No CSRF token found!');
        return '';
    }

    async function checkAndUpdatePaymentButton(doctype, docname) {
        try {
            // Check for existing pending order using fetch API
            // Use the correct 2-level module path
            const result = await callAPI(
                'bank_transfer_gateway.bank_transfer_gateway.doctype.bank_transfer_order.bank_transfer_order.check_existing_order',
                { doctype: doctype, docname: docname }
            );

            console.log('Bank Transfer Gateway: API result', result);

            if (result && result.message && result.message.exists) {
                // User has a pending payment - update the button
                console.log('Bank Transfer Gateway: Found pending payment', result.message);
                updateButtonForPendingPayment(result.message);
            } else {
                // No pending order - add bank transfer option if course is paid
                addBankTransferButton(doctype, docname);
            }
        } catch (e) {
            console.log('Bank Transfer Gateway: Could not check payment status', e);
            // Still add the button as fallback
            addBankTransferButton(doctype, docname);
        }
    }

    function updateButtonForPendingPayment(orderInfo) {
        console.log('Bank Transfer Gateway: updateButtonForPendingPayment called', orderInfo);
        
        // Find the parent anchor link that wraps the button
        let parentAnchor = null;
        let buyButton = null;
        
        // Method 1: Find anchor with href containing /lms/billing/
        const billingLinks = document.querySelectorAll('a[href*="/lms/billing/"]');
        console.log('Bank Transfer Gateway: Found billing links', billingLinks.length);
        
        if (billingLinks.length > 0) {
            parentAnchor = billingLinks[0];
            buyButton = parentAnchor.querySelector('button');
            console.log('Bank Transfer Gateway: Found button via billing link', buyButton);
        }
        
        // Method 2: Find all buttons and check text
        if (!buyButton) {
            const allButtons = document.querySelectorAll('button');
            console.log('Bank Transfer Gateway: Checking all buttons', allButtons.length);
            
            for (const btn of allButtons) {
                const text = btn.textContent.toLowerCase();
                if (text.includes('buy') || text.includes('enroll') || text.includes('purchase')) {
                    buyButton = btn;
                    parentAnchor = btn.closest('a');
                    console.log('Bank Transfer Gateway: Found button by text', text);
                    break;
                }
            }
        }
        
        // Method 3: Look for buttons with Tailwind classes used by LMS
        if (!buyButton) {
            const tailwindButtons = document.querySelectorAll('button.w-full.inline-flex');
            for (const btn of tailwindButtons) {
                if (btn.textContent.toLowerCase().includes('buy')) {
                    buyButton = btn;
                    parentAnchor = btn.closest('a');
                    console.log('Bank Transfer Gateway: Found button by Tailwind class');
                    break;
                }
            }
        }

        // Legacy fallback for older LMS versions
        if (!buyButton) {
            const legacySelectors = [
                'button[data-action="buy"]',
                '.btn-primary-dark',
                '.buy-course-btn'
            ];
            for (const selector of legacySelectors) {
                buyButton = document.querySelector(selector);
                if (buyButton) break;
            }
        }

        console.log('Bank Transfer Gateway: Final button found', buyButton);
        console.log('Bank Transfer Gateway: Parent anchor found', parentAnchor);

        // Instead of modifying the Vue button (which gets re-rendered), 
        // add a NEW prominent element below it
        addPendingPaymentNotice(orderInfo, parentAnchor || buyButton);
        
        // Update the anchor href so if they click "Buy" it goes to payment page anyway
        if (parentAnchor) {
            parentAnchor.href = orderInfo.redirect_url;
            parentAnchor.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Bank Transfer Gateway: Redirecting to', orderInfo.redirect_url);
                window.location.href = orderInfo.redirect_url;
            };
        }

        console.log('Bank Transfer Gateway: Pending payment notice added');
    }

    function addPendingPaymentNotice(orderInfo, referenceElement) {
        // Check if notice already exists
        if (document.getElementById('pending-payment-notice')) return;
        
        const notice = document.createElement('div');
        notice.id = 'pending-payment-notice';
        
        let bgColor, borderColor, icon, title, message, buttonText, buttonColor;
        
        if (orderInfo.status === 'Pending') {
            bgColor = '#fff3cd';
            borderColor = '#f97316';
            icon = '💳';
            title = 'Payment Pending';
            message = 'You already started a bank transfer payment. No need to buy again!';
            buttonText = 'Complete Payment / Upload Receipt';
            buttonColor = '#f97316';
        } else if (orderInfo.status === 'Receipt Uploaded' || orderInfo.status === 'Under Review') {
            bgColor = '#d1ecf1';
            borderColor = '#17a2b8';
            icon = '⏳';
            title = 'Waiting for Approval';
            message = 'Your payment receipt has been submitted and is being reviewed by admin.';
            buttonText = 'View Payment Status';
            buttonColor = '#17a2b8';
        } else {
            bgColor = '#d4edda';
            borderColor = '#28a745';
            icon = '✅';
            title = 'Payment Submitted';
            message = 'Your payment is being processed.';
            buttonText = 'View Details';
            buttonColor = '#28a745';
        }
        
        notice.style.cssText = `
            margin-top: 12px;
            padding: 16px;
            background: ${bgColor};
            border-left: 4px solid ${borderColor};
            border-radius: 8px;
            font-family: inherit;
        `;
        
        notice.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <span style="font-size: 24px;">${icon}</span>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 14px; color: #333; margin-bottom: 4px;">
                        ${title}
                    </div>
                    <div style="font-size: 13px; color: #555; margin-bottom: 12px;">
                        ${message}
                    </div>
                    <a href="${orderInfo.redirect_url}" 
                       style="display: inline-block; 
                              background: ${buttonColor}; 
                              color: white; 
                              padding: 8px 16px; 
                              border-radius: 6px; 
                              text-decoration: none; 
                              font-size: 13px; 
                              font-weight: 500;
                              transition: opacity 0.2s;">
                        ${buttonText}
                    </a>
                </div>
            </div>
        `;
        
        // Insert after the reference element (buy button or its container)
        if (referenceElement && referenceElement.parentElement) {
            // Find the best container - go up to find the price/button container
            let container = referenceElement.parentElement;
            
            // Try to insert after the anchor/button
            if (referenceElement.nextSibling) {
                container.insertBefore(notice, referenceElement.nextSibling);
            } else {
                container.appendChild(notice);
            }
            
            console.log('Bank Transfer Gateway: Notice inserted successfully');
        } else {
            // Fallback - find sidebar or main container
            const fallbackContainers = [
                '.course-details-sidebar',
                'aside',
                '.container',
                'main'
            ];
            
            for (const selector of fallbackContainers) {
                const container = document.querySelector(selector);
                if (container) {
                    container.insertBefore(notice, container.firstChild);
                    console.log('Bank Transfer Gateway: Notice inserted in fallback container');
                    break;
                }
            }
        }
    }

    function addPendingPaymentBanner(orderInfo) {
        // Now handled by addPendingPaymentNotice - keeping for backward compatibility
        return;
    }

    function addBankTransferButton(doctype, docname) {
        // Try to find the "Buy this course" button/link first
        // LMS uses various button structures
        const buyButtonSelectors = [
            'a[href*="/lms/billing/"]',           // LMS billing link
            'a[href*="/billing/course/"]',        // Direct billing link
            'button:contains("Buy")',
            'a:contains("Buy this course")',
            '.course-card-cta a',
            '.course-cta a',
            '.batch-cta a',
            '.enrollment-button',
            '.buy-course-btn',
            '.payment-buttons',
            '[data-action="buy"]',
            '.btn-primary-dark'
        ];
        
        let buyButton = null;
        let container = null;
        
        // First try to find the buy button directly
        for (const selector of buyButtonSelectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    const text = (el.textContent || el.innerText || '').toLowerCase();
                    if (text.includes('buy') || el.href?.includes('/billing/')) {
                        buyButton = el;
                        container = el.parentElement;
                        console.log('Bank Transfer Gateway: Found buy button', el);
                        break;
                    }
                }
                if (buyButton) break;
            } catch (e) {}
        }
        
        // If no buy button found, look for container areas
        if (!container) {
            const possibleContainers = [
                '.course-card-cta',
                '.course-cta',
                '.batch-cta',
                '.course-details-sidebar',
                '.course-sidebar',
                'aside',
                '.container'
            ];
            
            for (const selector of possibleContainers) {
                const element = document.querySelector(selector);
                if (element) {
                    container = element;
                    break;
                }
            }
        }
        
        if (!container) {
            console.log('Bank Transfer Gateway: Could not find button container, trying body');
            // Last resort - find any element with price info
            const priceElements = document.querySelectorAll('*');
            for (const el of priceElements) {
                if (el.textContent && el.textContent.includes('Rs') && el.textContent.includes('12,500')) {
                    container = el.parentElement;
                    break;
                }
            }
        }
        
        if (!container) {
            console.log('Bank Transfer Gateway: Could not find any suitable container');
            return;
        }
        
        // Check if button already exists
        if (document.getElementById('bank-transfer-btn')) {
            return;
        }
        
        // Create the bank transfer button
        const btn = document.createElement('button');
        btn.id = 'bank-transfer-btn';
        btn.className = 'btn btn-outline-success mt-2 w-100';
        btn.innerHTML = '<i class="fa fa-university"></i> Pay via Bank Transfer';
        btn.style.cssText = 'margin-top: 10px; width: 100%; display: block;';
        
        btn.addEventListener('click', function() {
            handleBankTransferClick(doctype, docname);
        });
        
        // Add button to container
        if (container.classList.contains('btn') || container.tagName === 'BUTTON' || container.tagName === 'A') {
            container.parentElement.appendChild(btn);
        } else {
            container.appendChild(btn);
        }
        
        // Also add a link in the payment section if exists
        const paymentSection = document.querySelector('.payment-section, .billing-section');
        if (paymentSection && !paymentSection.querySelector('#bank-transfer-btn')) {
            const link = document.createElement('div');
            link.className = 'bank-transfer-option mt-3 p-3 border rounded';
            link.innerHTML = `
                <div class="d-flex align-items-center justify-content-between">
                    <div>
                        <i class="fa fa-university fa-2x text-success"></i>
                        <span class="ms-2 fw-bold">Bank Transfer</span>
                        <p class="text-muted mb-0 small">Pay directly to our bank account</p>
                    </div>
                    <button class="btn btn-success" onclick="handleBankTransferClick('${doctype}', '${docname}')">
                        Select
                    </button>
                </div>
            `;
            paymentSection.appendChild(link);
        }
    }

    // Make function globally available
    window.handleBankTransferClick = async function(doctype, docname) {
        // Check if user is logged in
        if (typeof frappe === 'undefined' || frappe.session.user === 'Guest') {
            frappe.msgprint({
                title: 'Login Required',
                message: 'Please login to proceed with bank transfer payment.',
                indicator: 'orange'
            });
            // Redirect to login
            setTimeout(() => {
                window.location.href = `/login?redirect-to=${encodeURIComponent(window.location.pathname)}`;
            }, 2000);
            return;
        }
        
        // Show loading
        frappe.show_alert({message: 'Processing...', indicator: 'blue'}, 5);
        
        try {
            // Check for existing order first
            const existingCheck = await frappe.call({
                method: 'bank_transfer_gateway.bank_transfer_gateway.doctype.bank_transfer_order.bank_transfer_order.check_existing_order',
                args: {
                    doctype: doctype,
                    docname: docname
                }
            });
            
            if (existingCheck.message && existingCheck.message.exists) {
                // Redirect to existing order
                frappe.show_alert({
                    message: 'You have an existing order. Redirecting...',
                    indicator: 'orange'
                }, 3);
                setTimeout(() => {
                    window.location.href = existingCheck.message.redirect_url;
                }, 1000);
                return;
            }
            
            // Create new order
            const response = await frappe.call({
                method: 'bank_transfer_gateway.bank_transfer_gateway.doctype.bank_transfer_order.bank_transfer_order.create_bank_transfer_order',
                args: {
                    doctype: doctype,
                    docname: docname
                }
            });
            
            if (response.message && response.message.redirect_url) {
                frappe.show_alert({
                    message: 'Order created! Redirecting to payment instructions...',
                    indicator: 'green'
                }, 3);
                setTimeout(() => {
                    window.location.href = response.message.redirect_url;
                }, 1000);
            }
        } catch (error) {
            console.error('Bank Transfer Error:', error);
            frappe.msgprint({
                title: 'Error',
                message: error.message || 'Failed to create order. Please try again.',
                indicator: 'red'
            });
        }
    };
})();
