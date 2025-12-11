/**
 * Bank Transfer Gateway - LMS Integration
 * This script adds "Pay via Bank Transfer" button to LMS course and batch pages
 */

(function() {
    'use strict';

    // Wait for page to load
    document.addEventListener('DOMContentLoaded', function() {
        // Delay to ensure LMS components are loaded
        setTimeout(initBankTransfer, 1000);
    });

    function initBankTransfer() {
        // Check if we're on a course or batch page
        const path = window.location.pathname;
        
        if (path.includes('/courses/') || path.includes('/lms/courses/')) {
            setupCourseButton();
        } else if (path.includes('/batches/') || path.includes('/lms/batches/')) {
            setupBatchButton();
        }
    }

    async function setupCourseButton() {
        // Get course name from URL
        const pathParts = window.location.pathname.split('/');
        const courseIndex = pathParts.findIndex(p => p === 'courses');
        if (courseIndex === -1 || !pathParts[courseIndex + 1]) return;
        
        const courseName = decodeURIComponent(pathParts[courseIndex + 1]);
        
        // Check if bank transfer is enabled
        try {
            const settingsResponse = await frappe.call({
                method: 'bank_transfer_gateway.bank_transfer_gateway.doctype.bank_transfer_order.bank_transfer_order.get_bank_transfer_settings'
            });
            
            if (!settingsResponse.message || !settingsResponse.message.enabled) {
                return; // Bank transfer not enabled
            }
        } catch (e) {
            console.log('Bank Transfer Gateway not available');
            return;
        }
        
        // Find the payment/enrollment button area
        addBankTransferButton('LMS Course', courseName);
    }

    async function setupBatchButton() {
        // Get batch name from URL
        const pathParts = window.location.pathname.split('/');
        const batchIndex = pathParts.findIndex(p => p === 'batches');
        if (batchIndex === -1 || !pathParts[batchIndex + 1]) return;
        
        const batchName = decodeURIComponent(pathParts[batchIndex + 1]);
        
        // Check if bank transfer is enabled
        try {
            const settingsResponse = await frappe.call({
                method: 'bank_transfer_gateway.bank_transfer_gateway.doctype.bank_transfer_order.bank_transfer_order.get_bank_transfer_settings'
            });
            
            if (!settingsResponse.message || !settingsResponse.message.enabled) {
                return;
            }
        } catch (e) {
            console.log('Bank Transfer Gateway not available');
            return;
        }
        
        addBankTransferButton('LMS Batch', batchName);
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
        if (frappe.session.user === 'Guest') {
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
        frappe.show_alert({message: 'Creating your order...', indicator: 'blue'}, 5);
        
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
