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
        // Try to get from cookie
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'csrf_token') {
                return value;
            }
        }
        // Try meta tag
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) {
            return meta.getAttribute('content');
        }
        // Fallback - try frappe if available
        if (typeof frappe !== 'undefined' && frappe.csrf_token) {
            return frappe.csrf_token;
        }
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
        // Find existing buy/payment buttons
        const possibleButtons = [
            'button[data-action="buy"]',
            '.btn-primary-dark',
            '.buy-course-btn',
            '.course-card-cta .btn',
            '.btn:contains("Buy")',
            'button:contains("Buy Now")',
            'a:contains("Buy Now")'
        ];

        let buyButton = null;
        for (const selector of possibleButtons) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    if (el.textContent.toLowerCase().includes('buy') || 
                        el.textContent.toLowerCase().includes('enroll') ||
                        el.textContent.toLowerCase().includes('purchase')) {
                        buyButton = el;
                        break;
                    }
                }
                if (buyButton) break;
            } catch (e) {}
        }

        // Also try with jQuery if available
        if (!buyButton && typeof $ !== 'undefined') {
            const $btn = $('button, a').filter(function() {
                const text = $(this).text().toLowerCase();
                return text.includes('buy') || text.includes('enroll now') || text.includes('purchase');
            }).first();
            if ($btn.length) {
                buyButton = $btn[0];
            }
        }

        if (buyButton) {
            // Change button text and style based on status
            if (orderInfo.status === 'Pending') {
                buyButton.innerHTML = '<i class="fa fa-credit-card"></i> Complete Payment';
                buyButton.className = buyButton.className.replace('btn-primary', 'btn-warning');
                buyButton.classList.add('btn-warning');
            } else if (orderInfo.status === 'Receipt Uploaded' || orderInfo.status === 'Under Review') {
                buyButton.innerHTML = '<i class="fa fa-clock"></i> Payment Under Review';
                buyButton.className = buyButton.className.replace('btn-primary', 'btn-info');
                buyButton.classList.add('btn-info');
                buyButton.disabled = true;
            }
            
            // Update click handler
            buyButton.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = orderInfo.redirect_url;
            };
            
            // Remove any existing href
            if (buyButton.tagName === 'A') {
                buyButton.href = orderInfo.redirect_url;
            }
        }

        // Also add a notice banner
        addPendingPaymentBanner(orderInfo);
    }

    function addPendingPaymentBanner(orderInfo) {
        // Check if banner already exists
        if (document.getElementById('pending-payment-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'pending-payment-banner';
        banner.className = 'alert alert-warning mt-3 mb-3';
        banner.style.cssText = 'border-left: 4px solid #ffc107; background: #fff3cd; padding: 15px; border-radius: 5px;';
        
        let statusText = '';
        let actionText = '';
        let orderIdText = '';
        
        if (orderInfo.status === 'Pending') {
            statusText = 'You have a pending payment for this course.';
            actionText = 'Complete Payment';
        } else if (orderInfo.status === 'Receipt Uploaded' || orderInfo.status === 'Under Review') {
            statusText = 'Your payment receipt has been uploaded and is under review.';
            actionText = 'View Payment Status';
        }
        
        if (orderInfo.order_id) {
            orderIdText = `<br><small>Order ID: ${orderInfo.order_id}</small>`;
        }

        banner.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <div>
                    <strong><i class="fa fa-info-circle"></i> ${statusText}</strong>
                    ${orderIdText}
                </div>
                <a href="${orderInfo.redirect_url}" class="btn btn-warning btn-sm">
                    <i class="fa fa-arrow-right"></i> ${actionText}
                </a>
            </div>
        `;

        // Find a good place to insert the banner
        const containers = [
            '.course-details-container',
            '.course-content',
            '.course-head',
            '.course-card-cta',
            '.container',
            'main',
            '.course-body'
        ];

        for (const selector of containers) {
            const container = document.querySelector(selector);
            if (container) {
                container.insertBefore(banner, container.firstChild);
                break;
            }
        }
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
