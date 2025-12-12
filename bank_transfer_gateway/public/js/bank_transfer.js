/**
 * Bank Transfer Gateway - LMS Integration
 * This script handles:
 * 1. Adding "Pay via Bank Transfer" button to course pages
 * 2. Changing "Buy Now" to "Complete Payment" for pending orders
 * 3. Redirecting users to their pending payment page
 */

(function() {
    'use strict';

    // Wait for page to load
    document.addEventListener('DOMContentLoaded', function() {
        // Delay to ensure LMS components are loaded
        setTimeout(initBankTransfer, 1000);
    });

    // Also run when navigating within SPA
    if (typeof frappe !== 'undefined') {
        frappe.router && frappe.router.on('change', function() {
            setTimeout(initBankTransfer, 1000);
        });
    }

    async function initBankTransfer() {
        // Check if we're on a course or batch page
        const path = window.location.pathname;
        
        if (path.includes('/courses/') || path.includes('/lms/courses/')) {
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

    async function checkAndUpdatePaymentButton(doctype, docname) {
        // Skip for guest users
        if (typeof frappe === 'undefined' || frappe.session.user === 'Guest') {
            return;
        }

        try {
            // Check for existing pending order
            const response = await frappe.call({
                method: 'bank_transfer_gateway.bank_transfer_gateway.doctype.bank_transfer_order.bank_transfer_order.check_existing_order',
                args: {
                    doctype: doctype,
                    docname: docname
                }
            });

            if (response.message && response.message.exists) {
                // User has a pending payment - update the button
                updateButtonForPendingPayment(response.message);
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
            } else if (orderInfo.status === 'Receipt Uploaded') {
                buyButton.innerHTML = '<i class="fa fa-clock"></i> Payment Under Review';
                buyButton.className = buyButton.className.replace('btn-primary', 'btn-info');
                buyButton.classList.add('btn-info');
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
        
        if (orderInfo.status === 'Pending') {
            statusText = 'You have a pending bank transfer payment for this course.';
            actionText = 'Complete Payment';
        } else if (orderInfo.status === 'Receipt Uploaded') {
            statusText = 'Your payment receipt has been uploaded and is under review.';
            actionText = 'View Payment Status';
        }

        banner.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <div>
                    <strong><i class="fa fa-info-circle"></i> ${statusText}</strong>
                    <br><small>Order ID: ${orderInfo.order_id}</small>
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
        // Try to find existing payment buttons or enrollment area
        const possibleContainers = [
            '.course-card-cta',
            '.course-cta',
            '.batch-cta',
            '.enrollment-button',
            '.buy-course-btn',
            '.payment-buttons',
            '[data-action="buy"]',
            '.btn-primary-dark'
        ];
        
        let container = null;
        for (const selector of possibleContainers) {
            const element = document.querySelector(selector);
            if (element) {
                container = element.parentElement || element;
                break;
            }
        }
        
        // If no specific container found, try to find any prominent button area
        if (!container) {
            // Look for the sidebar or main course info section
            const sidebar = document.querySelector('.course-details-sidebar, .course-sidebar, aside');
            if (sidebar) {
                container = sidebar;
            }
        }
        
        if (!container) {
            console.log('Bank Transfer: Could not find button container');
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
