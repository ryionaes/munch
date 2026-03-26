// ==========================================
// DATA STORAGE & DOM ELEMENTS
// ==========================================
let orders = JSON.parse(localStorage.getItem('foodhub_orders')) || [];
let claimedCoupons = JSON.parse(localStorage.getItem('foodhub_wallet')) || {};
let activeDiscount = parseFloat(localStorage.getItem('foodhub_active_discount')) || 0;
let activeDiscountType = localStorage.getItem('foodhub_active_discount_type') || 'percent';
let activeCouponId = localStorage.getItem('foodhub_active_coupon_id') || '';

const COUPON_DATA = {
    'lent': { name: 'Mahal na Araw (40% OFF)', value: 40, type: 'percent' },
    'STUDENT20': { name: 'Student Discount (20% OFF)', value: 20, type: 'percent' },
    'GOLDEN20': { name: 'Senior Citizen (20% OFF)', value: 20, type: 'percent' },
    'INCLUSION': { name: 'PWD Discount (20% OFF)', value: 20, type: 'percent' },
    'LENT40': { name: 'Lent Season Promo (40% OFF)', value: 40, type: 'percent' },
    'WELCOME5': { name: 'New User Promo ($5 OFF)', value: 5, type: 'flat' }
};

let pendingCouponId = null;
let pendingEventBtn = null;

// ==========================================
// FORCE GLOBAL ACCESS (CRITICAL FIX)
// Inilagay sa itaas para siguradong mababasa agad ng HTML onclick events!
// ==========================================
window.addOrder = addOrder;
window.deleteOrder = deleteOrder;
window.openCheckout = openCheckout;
window.claimCoupon = claimCoupon;
window.closeCheckout = closeCheckout;
window.placeOrder = placeOrder;
window.applyCoupon = applyCoupon;
window.confirmClaim = confirmClaim;

// ==========================================
// TOAST NOTIFICATIONS LOGIC
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'check-circle';
    if (type === 'error') icon = 'trash-2';
    if (type === 'info') icon = 'info';

    toast.innerHTML = `<i data-lucide="${icon}" class="toast-icon-wrapper" style="width: 18px;"></i> <span style="margin-left: 8px;">${message}</span>`;
    container.appendChild(toast);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    setTimeout(() => {
        toast.style.animation = 'fadeOutRight 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================================
// ADD / DELETE ORDER
// ==========================================
function addOrder(foodName, category, price, quantity, deliveryTime, rating) {
    // PREVENT GHOST/NULL ORDERS: If foodName is empty or 'null', stop right here.
    if (!foodName || foodName === 'null') return;

    // Safety check in case localStorage was corrupted
    if (!Array.isArray(orders)) orders = [];

    const existingOrder = orders.find(order => order.foodName === foodName);

    if (existingOrder) {
        existingOrder.quantity += parseInt(quantity);
        existingOrder.subtotal = existingOrder.price * existingOrder.quantity;
    } else {
        const order = {
            id: Date.now(),
            foodName,
            category,
            price: parseFloat(price),
            quantity: parseInt(quantity),
            subtotal: parseFloat(price) * parseInt(quantity),
            deliveryTime: parseInt(deliveryTime),
            rating: parseFloat(rating)
        };
        orders.push(order);
    }

    localStorage.setItem('foodhub_orders', JSON.stringify(orders));
    renderTable();
    updateStats();
    showToast(`Added ${foodName} to cart!`, 'success');
}

function deleteOrder(orderId) {
    orders = orders.filter(order => order.id !== orderId);
    localStorage.setItem('foodhub_orders', JSON.stringify(orders));
    renderTable();
    updateStats();
    showToast('Item removed from cart.', 'error');
}

// ==========================================
// UPDATED STATS
// ==========================================
function updateStats() {
    const totalOrdersDisplay = document.getElementById('totalOrders');
    const totalCostDisplay = document.getElementById('totalCost');

    const totalOrders = orders.length;
    const subtotal = orders.reduce((sum, order) => sum + order.subtotal, 0);

    const discountAmount = activeDiscountType === 'flat'
        ? Math.min(activeDiscount, subtotal)
        : subtotal * (activeDiscount / 100);
    const finalTotal = subtotal - discountAmount;

    if (totalOrdersDisplay) totalOrdersDisplay.textContent = totalOrders;

    if (totalCostDisplay) {
        totalCostDisplay.innerHTML = activeDiscount > 0
            ? `<span class="discount-strikethrough" style="text-decoration: line-through; color: #999; margin-right: 10px; font-size: 14px;">$${subtotal.toFixed(2)}</span> $${finalTotal.toFixed(2)}`
            : `$${finalTotal.toFixed(2)}`;
    }
}

// ==========================================
// COUPON WALLET LOGIC
// ==========================================
function claimCoupon(couponId, targetBtnOrEvent) {
    pendingCouponId = couponId;
    
    // Handle both event objects (from inline onclick) and DOM elements safely
    if (targetBtnOrEvent && targetBtnOrEvent.currentTarget) {
        pendingEventBtn = targetBtnOrEvent.currentTarget;
    } else if (targetBtnOrEvent && targetBtnOrEvent.target) {
        pendingEventBtn = targetBtnOrEvent.target.closest('button');
    } else {
        pendingEventBtn = targetBtnOrEvent;
    }

    const coupon = COUPON_DATA[couponId] || { name: 'Coupon' };
    const modalTitle = document.getElementById('modalCouponTitle');
    if (modalTitle) modalTitle.textContent = `Claim ${coupon.name}?`;

    const modal = document.getElementById('couponModal');
    if (modal) modal.style.display = 'flex';
}

function confirmClaim() {
    if (pendingCouponId) {
        // Index page flow: coupon claimed via claimCoupon()
        claimedCoupons[pendingCouponId] = true;
        localStorage.setItem('foodhub_wallet', JSON.stringify(claimedCoupons));

        if (pendingEventBtn) {
            pendingEventBtn.innerHTML = '<i data-lucide="check" style="width: 18px; display: inline-block; vertical-align: middle; margin-right: 5px;"></i> Claimed';
            pendingEventBtn.style.background = '#27AE60';
            pendingEventBtn.style.color = 'white';
            pendingEventBtn.style.border = 'none';
            pendingEventBtn.disabled = true;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        renderCouponDropdown();
        closeModal();
        showToast('Coupon added to your wallet!', 'success');
    } else {
        // Promos page flow: voucher claimed via claimModal
        const codeEl = document.getElementById('promoCodeDisplay');
        if (codeEl) {
            const code = codeEl.innerText;

            if (claimedCoupons[code]) {
                showToast('You have already claimed this voucher!', 'info');
            } else {
                claimedCoupons[code] = true;
                localStorage.setItem('foodhub_wallet', JSON.stringify(claimedCoupons));
                const claimedCount = Object.values(claimedCoupons).filter(Boolean).length;
                const countEl = document.getElementById('claimedCount');
                if (countEl) countEl.innerText = `${claimedCount} Voucher${claimedCount > 1 ? 's' : ''} Claimed`;
                showToast('Voucher added to your wallet!', 'success');
            }
            closeModal();
        }
    }
}

function closeModal() {
    ['couponModal', 'checkoutModal', 'claimModal'].forEach(id => {
        const m = document.getElementById(id);
        if (m) m.style.display = 'none';
    });
    pendingCouponId = null;
    pendingEventBtn = null;
}

// Global Alias for inline onclicks in HTML
function closeCheckout() {
    closeModal();
}

function renderCouponDropdown() {
    const select = document.getElementById('couponSelect');
    const container = document.getElementById('couponContainer');
    if (!select || !container) return;

    select.innerHTML = '<option value="">No coupon applied</option>';
    let hasCoupons = false;

    for (let id in claimedCoupons) {
        if (claimedCoupons[id] && COUPON_DATA[id]) {
            hasCoupons = true;
            const option = document.createElement('option');
            option.value = id; // Store coupon ID, not value
            option.textContent = COUPON_DATA[id].name;
            if (id === activeCouponId) option.selected = true;
            select.appendChild(option);
        }
    }
    container.style.display = hasCoupons ? 'block' : 'none';
}

function applyCoupon(couponId) {
    if (!couponId || !COUPON_DATA[couponId]) {
        activeDiscount = 0;
        activeDiscountType = 'percent';
        activeCouponId = '';
        localStorage.setItem('foodhub_active_discount', 0);
        localStorage.setItem('foodhub_active_discount_type', 'percent');
        localStorage.setItem('foodhub_active_coupon_id', '');
        updateStats();
        return;
    }

    const coupon = COUPON_DATA[couponId];
    activeDiscount = coupon.value;
    activeDiscountType = coupon.type || 'percent';
    activeCouponId = couponId;
    localStorage.setItem('foodhub_active_discount', activeDiscount);
    localStorage.setItem('foodhub_active_discount_type', activeDiscountType);
    localStorage.setItem('foodhub_active_coupon_id', activeCouponId);
    updateStats();

    if (activeDiscount > 0) {
        showToast(`${coupon.name} applied!`, 'info');
    }
}

function copyPromoCode() {
    const codeEl = document.getElementById('promoCodeDisplay');
    if (!codeEl) return;
    const code = codeEl.innerText;
    const tempInput = document.createElement('input');
    tempInput.value = code;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);

    showToast('Code copied to clipboard!', 'success');
}

// ==========================================
// CART INITIALIZATION
// ==========================================
function renderTable() {
    const tableBody = document.getElementById('tableBody');
    const emptyMessage = document.getElementById('emptyMessage');
    if (!tableBody) return;

    const items = tableBody.querySelectorAll('.order-item');
    items.forEach(item => item.remove());

    if (orders.length === 0) {
        if (emptyMessage) emptyMessage.style.display = 'flex';
        return;
    }
    if (emptyMessage) emptyMessage.style.display = 'none';

    orders.forEach(order => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'order-item';
        // Adjusted inner styling to match your custom aesthetic
        itemDiv.innerHTML = `
            <div class="item-img" style="width: 65px; height: 65px; border-radius: 16px; background: var(--light-orange); display: flex; align-items: center; justify-content: center; color: var(--primary-orange); flex-shrink: 0;">
                <i data-lucide="utensils" style="width: 28px; height: 28px;"></i>
            </div>
            <div class="item-details" style="flex: 1;">
                <h4 style="font-size: 15px; margin: 0; color: var(--text-dark); font-weight: 600;">${order.foodName}</h4>
                <p style="font-size: 13px; color: var(--text-light); margin: 2px 0;">Qty: ${order.quantity}</p>
                <strong style="color: var(--primary-orange); font-size: 16px;">$${order.subtotal.toFixed(2)}</strong>
            </div>
            <button class="btn-delete" onclick="deleteOrder(${order.id})" style="background: #FFE0D5; color: #E74C3C; border: none; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;">
                <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
            </button>
        `;
        tableBody.appendChild(itemDiv);
    });
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// ==========================================
// CAROUSEL LOGIC
// ==========================================
let currentSlide = 0;
function moveSlide(direction) {
    const track = document.getElementById('devTrack');
    if (!track) return;
    const cards = document.querySelectorAll('.dev-card');
    currentSlide = (currentSlide + direction + cards.length) % cards.length;
    track.style.transform = `translateX(${currentSlide * -100}%)`;
}

// ==========================================
// CHECKOUT & FORM LOGIC
// ==========================================
function openCheckout() {
    if (orders.length === 0) {
        showToast("Your cart is empty!", "error");
        return;
    }

    const modal = document.getElementById('checkoutModal');
    const tableBody = document.getElementById('checkoutTableBody');
    if (!modal || !tableBody) return;

    tableBody.innerHTML = '';
    let subtotal = 0;

    orders.forEach(item => {
        subtotal += item.subtotal;
        const row = document.createElement('tr');
        row.style.borderBottom = "1px solid #f9f9f9";
        row.innerHTML = `
            <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #2C3E50;">${item.foodName} <span style="color: #95A5A6; font-weight: 400;">(x${item.quantity})</span></td>
            <td style="padding: 10px 0; font-size: 13px; font-weight: 600; text-align: right; color: #FF6B35;">$${item.subtotal.toFixed(2)}</td>
        `;
        tableBody.appendChild(row);
    });

    const deliveryFee = 2.00;
    const discountAmount = activeDiscountType === 'flat'
        ? Math.min(activeDiscount, subtotal)
        : subtotal * (activeDiscount / 100);
    const finalTotal = (subtotal - discountAmount) + deliveryFee;

    document.getElementById('summarySubtotal').textContent = `$${subtotal.toFixed(2)}`;

    const discountRow = document.getElementById('summaryDiscountRow');
    if (activeDiscount > 0) {
        discountRow.style.display = 'flex';
        document.getElementById('summaryDiscountAmount').textContent = `-$${discountAmount.toFixed(2)}`;
    } else {
        discountRow.style.display = 'none';
    }

    document.getElementById('summaryTotal').textContent = `$${finalTotal.toFixed(2)}`;
    modal.style.display = 'flex';
}

function placeOrder() {
    const nameEl = document.getElementById('custName');
    const addrEl = document.getElementById('custAddress');
    const phoneEl = document.getElementById('custPhone');

    const name = nameEl ? nameEl.value.trim() : '';
    const address = addrEl ? addrEl.value.trim() : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';

    if (name === '' || address === '' || phone === '') {
        showToast("Please fill in all delivery details.", "error");
        return;
    }
    if (phone.length < 10) {
        showToast("Validation Error: Enter a valid phone number.", "error");
        return;
    }

    showToast(`Order confirmed for ${name}! 🚀`, "success");

    orders = [];
    activeDiscount = 0;
    activeDiscountType = 'percent';
    activeCouponId = '';
    localStorage.setItem('foodhub_orders', JSON.stringify(orders));
    localStorage.setItem('foodhub_active_discount', 0);
    localStorage.setItem('foodhub_active_discount_type', 'percent');
    localStorage.setItem('foodhub_active_coupon_id', '');

    renderTable();
    updateStats();
    closeModal();

    if (nameEl) nameEl.value = '';
    if (addrEl) addrEl.value = '';
    if (phoneEl) phoneEl.value = '';
    renderCouponDropdown();
}

// ==========================================
// DOM EVENT BINDINGS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    try {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Reveal Logic
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                }
            });
        }, { threshold: 0.15 });
        document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

        // Restore Claim Buttons visually based on wallet status
        document.querySelectorAll('.claim-btn').forEach(btn => {
            const id = btn.getAttribute('data-id');
            const code = btn.getAttribute('data-code');
            const key = id || code;
            if (key && claimedCoupons[key]) {
                btn.innerHTML = '<i data-lucide="check" style="width: 18px; display: inline-block; vertical-align: middle; margin-right: 5px;"></i> Claimed';
                btn.style.background = '#27AE60';
                btn.style.color = 'white';
                btn.style.border = 'none';
                btn.disabled = true;
            }
        });

        // Category Filter Buttons
        const filterBtns = document.querySelectorAll('.filter-btn');
        const foodCards = document.querySelectorAll('.food-card');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filterValue = btn.getAttribute('data-filter');
                foodCards.forEach(card => {
                    const itemCategories = card.getAttribute('data-category') || "";
                    card.style.display = (filterValue === 'all' || itemCategories.includes(filterValue)) ? 'block' : 'none';
                });
            });
        });

        // FAQ Accordion
        document.querySelectorAll('.faq-header').forEach(header => {
            header.addEventListener('click', function() {
                const item = this.parentElement;
                const isActive = item.classList.contains('active');
                document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
                if (!isActive) item.classList.add('active');
            });
        });

        // Bind Core Elements
        const bindings = [
            { id: 'prev-slide-btn', event: 'click', handler: () => moveSlide(-1) },
            { id: 'next-slide-btn', event: 'click', handler: () => moveSlide(1) },
            { id: 'orderNowBtn', event: 'click', handler: () => window.location.href = 'order.html' },
            { id: 'confirmClaimCouponBtn', event: 'click', handler: confirmClaim },
            { id: 'cancelClaimCouponBtn', event: 'click', handler: closeModal },
            { id: 'copyCodeBtn', event: 'click', handler: copyPromoCode },
            { id: 'confirmPromoBtn', event: 'click', handler: confirmClaim },
            { id: 'closePromoBtn', event: 'click', handler: closeModal }
        ];

        bindings.forEach(binding => {
            const el = document.getElementById(binding.id);
            if (el && !el.hasAttribute('onclick')) {
                el.addEventListener(binding.event, binding.handler);
            }
        });

        // Attach functionality to dynamic Claim Coupon Buttons
        document.querySelectorAll('.claim-btn').forEach(btn => {
            if (!btn.hasAttribute('onclick')) {
                btn.addEventListener('click', (e) => {
                    const id = btn.getAttribute('data-id');
                    const code = btn.getAttribute('data-code');
                    const title = btn.getAttribute('data-title');
                    if (id) {
                        claimCoupon(id, e.currentTarget);
                    } else if (code && title) {
                        const codeEl = document.getElementById('promoCodeDisplay');
                        const titleEl = document.getElementById('modalTitle');
                        if (codeEl) codeEl.innerText = code;
                        if (titleEl) titleEl.innerText = title;
                        const modal = document.getElementById('claimModal');
                        if (modal) modal.style.display = 'flex';
                    }
                });
            }
        });

        // Fix for the double-fire issue
        document.querySelectorAll('.btn-add-card').forEach(btn => {
            if (btn.hasAttribute('data-food')) {
                btn.addEventListener('click', () => {
                    addOrder(
                        btn.getAttribute('data-food'),
                        btn.getAttribute('data-cat'),
                        btn.getAttribute('data-price'),
                        btn.getAttribute('data-qty'),
                        btn.getAttribute('data-time'),
                        btn.getAttribute('data-rating')
                    );
                });
            }
        });

        // Developer Image Fallback logic
        document.querySelectorAll('.dev-img').forEach(img => {
            img.addEventListener('error', function() {
                this.classList.add('hidden');
                const fallback = this.nextElementSibling;
                if (fallback) fallback.classList.remove('hidden');
            });
        });

        // Outside click to close modals
        window.addEventListener('click', function(event) {
            if (event.target.classList.contains('modal-overlay')) {
                closeModal();
            }
        });

        // Initialize UI states
        renderCouponDropdown();
        renderTable();
        updateStats();
        
        const countEl = document.getElementById('claimedCount');
        if (countEl) {
            const count = Object.values(claimedCoupons).filter(Boolean).length;
            countEl.innerText = `${count} Voucher${count > 1 ? 's' : ''} Claimed`;
        }
    } catch (err) {
        console.warn("Munch UI Init warning: Some elements might not exist on this page.", err);
    }
});