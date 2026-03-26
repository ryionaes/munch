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
    'WELCOME5': { name: 'New User Promo (₱280 OFF)', value: 280, type: 'flat' }, // In-adjust sa PHP
    'PAYDAY100': { name: 'Payday Treat (₱100 OFF)', value: 100, type: 'flat' },
    'MIDNIGHT15': { name: 'Midnight Cravings (15% OFF)', value: 15, type: 'percent' },
    'BARKADA200': { name: 'Barkada Bundle (₱200 OFF)', value: 200, type: 'flat' },
    'FREESHIP': { name: 'Free Delivery', value: 0, type: 'shipping' }
};

let pendingCouponId = null;
let pendingEventBtn = null;

// ==========================================
// CURRENCY LOGIC (ADDED HERE AT THE TOP)
// ==========================================
const CURRENCY_DATA = {
    PHP: { symbol: '₱', rate: 1 },
    USD: { symbol: '$', rate: 0.0178 }, // 1 / 56
    EUR: { symbol: '€', rate: 0.0163 }, 
    GBP: { symbol: '£', rate: 0.0140 }, 
    JPY: { symbol: '¥', rate: 2.68 },   // 1 PHP = 2.68 JPY
    KRW: { symbol: '₩', rate: 26.92 }   // 1 PHP = 26.92 KRW
};

let currentCurrency = localStorage.getItem('foodhub_currency') || 'PHP';

function formatPrice(baseValue) {
    const currency = CURRENCY_DATA[currentCurrency];
    const converted = baseValue * currency.rate;
    
    // Walang butal (decimals) kapag JPY o KRW, at may comma para sa libo
    if (currentCurrency === 'JPY' || currentCurrency === 'KRW') {
        return currency.symbol + Math.round(converted).toLocaleString('en-US');
    } else {
        // May .00 at comma sa PHP, USD, EUR, GBP
        return currency.symbol + converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}

function changeCurrency(newCurrency) {
    currentCurrency = newCurrency;
    localStorage.setItem('foodhub_currency', newCurrency);
    updateAllVisiblePrices();
}

function updateAllVisiblePrices() {
    // 1. Update Food Grid Prices
    document.querySelectorAll('.food-card').forEach(card => {
        const btn = card.querySelector('.btn-add-card');
        const priceStrong = card.querySelector('.card-bottom strong');
        if (btn && priceStrong) {
            const onclickStr = btn.getAttribute('onclick');
            const match = onclickStr.match(/addOrder\([^,]+,\s*'[^']+',\s*([\d.]+)/);
            if (match && match[1]) {
                const usdPrice = parseFloat(match[1]);
                priceStrong.textContent = formatPrice(usdPrice);
            }
        }
    });

    // 2. Sync Dropdowns across pages
    document.querySelectorAll('#currencySelect').forEach(select => {
        select.value = currentCurrency;
    });

    // 3. Re-render Cart and Modal
   renderTable();
    updateStats();
    if (document.getElementById('checkoutModal') && document.getElementById('checkoutModal').style.display === 'flex') {
        renderCheckoutTotals();
    }
    
    // IDAGDAG ITO SA DULO:
    updateCheckoutRegion(); 
}

// ==========================================
// FORCE GLOBAL ACCESS (CRITICAL FIX)
// ==========================================
window.addOrder = addOrder;
window.deleteOrder = deleteOrder;
window.openCheckout = openCheckout;
window.claimCoupon = claimCoupon;
window.closeCheckout = closeCheckout;
window.placeOrder = placeOrder;
window.applyCoupon = applyCoupon;
window.confirmClaim = confirmClaim;
window.changeCurrency = changeCurrency;
window.renderTable = renderTable;

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
        toast.style.animation = 'fadeOutDown 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================================
// ADD / DELETE ORDER
// ==========================================
function addOrder(foodName, category, price, quantity, deliveryTime, rating) {
    if (!foodName || foodName === 'null') return;
    if (!Array.isArray(orders)) orders = [];

    let imageSrc = '';
    document.querySelectorAll('.food-card').forEach(card => {
        const titleElement = card.querySelector('h4');
        if (titleElement && titleElement.textContent.trim() === foodName) {
            const imgElement = card.querySelector('img');
            if (imgElement) imageSrc = imgElement.getAttribute('src');
        }
    });

    const existingOrder = orders.find(order => order.foodName === foodName);

    if (existingOrder) {
        existingOrder.quantity += parseInt(quantity);
        existingOrder.subtotal = existingOrder.price * existingOrder.quantity;
        if (imageSrc) existingOrder.imageSrc = imageSrc; 
    } else {
        const order = {
            id: Date.now(),
            foodName,
            category,
            price: parseFloat(price),
            quantity: parseInt(quantity),
            subtotal: parseFloat(price) * parseInt(quantity),
            deliveryTime: parseInt(deliveryTime),
            rating: parseFloat(rating),
            imageSrc: imageSrc 
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
            ? `<span class="discount-strikethrough" style="text-decoration: line-through; color: #999; margin-right: 10px; font-size: 14px;">${formatPrice(subtotal)}</span> ${formatPrice(finalTotal)}`
            : `${formatPrice(finalTotal)}`;
    }
}

// ==========================================
// COUPON WALLET LOGIC
// ==========================================
function claimCoupon(couponId, targetBtnOrEvent) {
    pendingCouponId = couponId;
    
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
        claimedCoupons[pendingCouponId] = true;
        localStorage.setItem('foodhub_wallet', JSON.stringify(claimedCoupons));

        if (pendingEventBtn) {
            pendingEventBtn.innerHTML = '<i data-lucide="check" style="width:18px;height:18px;stroke:white;color:white;display:inline-block;vertical-align:middle;margin-right:5px;"></i> Claimed';
            pendingEventBtn.classList.add('claimed-btn');
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
        const codeEl = document.getElementById('promoCodeDisplay');
        if (codeEl) {
            const code = codeEl.innerText;

            if (claimedCoupons[code]) {
                showToast('You have already claimed this voucher!', 'info');
            } else {
                claimedCoupons[code] = true;
                localStorage.setItem('foodhub_wallet', JSON.stringify(claimedCoupons));
                const claimedCount = Object.values(claimedCoupons).filter(v => v === true || (v && v.claimed)).length;
                const countEl = document.getElementById('claimedCount');
                if (countEl) countEl.innerText = `${claimedCount} Voucher${claimedCount > 1 ? 's' : ''} Claimed`;

                // Update the button in the voucher grid immediately
                const gridBtn = document.querySelector(`.claim-btn[data-code="${code}"]`);
                if (gridBtn) {
                    gridBtn.innerHTML = '<i data-lucide="check" style="width:18px;height:18px;stroke:white;color:white;"></i> Claimed';
                    gridBtn.classList.add('claimed-btn');
                    gridBtn.disabled = true;
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }

                renderCouponDropdown();
                showToast('Voucher added to your wallet!', 'success');
            }
            closeModal();
        }
    }
}

// ==========================================
// WALLET MODAL LOGIC
// ==========================================
function openWalletModal() {
    const list = document.getElementById('walletVoucherList');
    if (!list) return;

    const iconMap = {
        'STUDENT20': 'graduation-cap', 'GOLDEN20': 'star', 'INCLUSION': 'shield-check',
        'LENT40': 'utensils-crossed', 'WELCOME5': 'gift', 'PAYDAY100': 'banknote',
        'MIDNIGHT15': 'moon', 'BARKADA200': 'users', 'FREESHIP': 'truck'
    };

    const keys = Object.keys(claimedCoupons).filter(k => {
        const v = claimedCoupons[k];
        return v === true || (v && v.claimed);
    });

    const usedCount = keys.filter(k => {
        const v = claimedCoupons[k];
        return v && typeof v === 'object' && v.used;
    }).length;
    const activeCount = keys.length - usedCount;

    const statClaimed = document.getElementById('walletStatClaimed');
    const statUsed = document.getElementById('walletStatUsed');
    const statActive = document.getElementById('walletStatActive');
    if (statClaimed) statClaimed.textContent = keys.length;
    if (statUsed) statUsed.textContent = usedCount;
    if (statActive) statActive.textContent = activeCount;

    if (keys.length === 0) {
        list.innerHTML = `
            <div class="wallet-empty">
                <i data-lucide="ticket-x"></i>
                <p>No vouchers yet!</p>
                <small>Claim a voucher below to add it to your wallet.</small>
            </div>`;
    } else {
        list.innerHTML = keys.map(key => {
            const coupon = COUPON_DATA[key];
            if (!coupon) return '';
            const v = claimedCoupons[key];
            const isUsed = v && typeof v === 'object' && v.used;
            const icon = iconMap[key] || 'tag';
            const valueLabel = coupon.type === 'flat' ? formatPrice(coupon.value) : coupon.value + '% OFF';
            return `
                <div class="wallet-voucher-item ${isUsed ? 'used-voucher' : ''}">
                    <div class="wallet-voucher-icon ${isUsed ? 'used-icon' : ''}">
                        <i data-lucide="${isUsed ? 'check' : icon}" style="width:22px;height:22px;stroke:white;color:white;"></i>
                    </div>
                    <div class="wallet-voucher-info">
                        <div class="wallet-voucher-name">${coupon.name.split(' (')[0]}</div>
                        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                            <span class="wallet-voucher-code ${isUsed ? 'used-code' : ''}">${key}</span>
                            <span style="font-size:12px;color:var(--text-light);font-weight:500;">${valueLabel}</span>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }

    const modal = document.getElementById('walletModal');
    if (modal) {
        modal.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}
window.openWalletModal = openWalletModal;

function closeModal() {
    ['couponModal', 'checkoutModal', 'claimModal', 'walletModal'].forEach(id => {
        const m = document.getElementById(id);
        if (m) m.style.display = 'none';
    });
    pendingCouponId = null;
    pendingEventBtn = null;
}

function closeCheckout() {
    closeModal();
}

function renderCouponDropdown() {
    const select = document.getElementById('couponSelect');
    const container = document.getElementById('couponContainer');
    if (!select || !container) return;

    select.innerHTML = '<option value="0">No coupon applied</option>';
    let hasCoupons = false;

    for (let id in claimedCoupons) {
        const cv = claimedCoupons[id];
        const isCl = cv === true || (cv && cv.claimed);
        const isUs = cv && typeof cv === 'object' && cv.used;
        if (isCl && !isUs && COUPON_DATA[id]) {
            hasCoupons = true;
            const option = document.createElement('option');
            option.value = id; 
            option.textContent = COUPON_DATA[id].name;
            if (id === activeCouponId) option.selected = true;
            select.appendChild(option);
        }
    }
    container.style.display = hasCoupons ? 'block' : 'none';
}

function applyCoupon(couponId) {
    if (!couponId || couponId === "0" || !COUPON_DATA[couponId]) {
        activeDiscount = 0;
        activeDiscountType = 'percent';
        activeCouponId = '';
    } else {
        const coupon = COUPON_DATA[couponId];
        activeDiscount = coupon.value;
        activeDiscountType = coupon.type || 'percent';
        activeCouponId = couponId;
        showToast(`${coupon.name} applied!`, 'info');
    }

    localStorage.setItem('foodhub_active_discount', activeDiscount);
    localStorage.setItem('foodhub_active_discount_type', activeDiscountType);
    localStorage.setItem('foodhub_active_coupon_id', activeCouponId);
    
    updateStats();
    
    const modal = document.getElementById('checkoutModal');
    if (modal && modal.style.display === 'flex') {
        renderCheckoutTotals();
    }
}

function renderCheckoutTotals() {
    const tableBody = document.getElementById('checkoutTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let subtotal = 0;

    // 1. I-render ang bawat item at kunin ang subtotal
    orders.forEach(item => {
        subtotal += item.subtotal;
        const row = document.createElement('tr');
        row.style.borderBottom = "1px solid #f9f9f9";
        row.innerHTML = `
            <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #2C3E50;">${item.foodName} <span style="color: #95A5A6; font-weight: 400;">(x${item.quantity})</span></td>
            <td style="padding: 10px 0; font-size: 13px; font-weight: 600; text-align: right; color: #FF6B35;">${formatPrice(item.subtotal)}</td>
        `;
        tableBody.appendChild(row);
    });

    // 2. LOGIC: Default delivery fee is 50. Pero magiging zero (FREE) kung:
    // - Ang subtotal ay ₱1,000 pataas
    // - O kaya ay ginamit ang 'FREESHIP' voucher
    let deliveryFee = 50.00;
    if (subtotal >= 1000 || activeCouponId === 'FREESHIP') {
        deliveryFee = 0;
    }

    // 3. Compute Discount base sa active voucher (Flat vs Percent)
    const discountAmount = activeDiscountType === 'flat'
        ? Math.min(activeDiscount, subtotal)
        : subtotal * (activeDiscount / 100);
        
    const finalTotal = (subtotal - discountAmount) + deliveryFee;

    // 4. Update ang UI Labels
    document.getElementById('summarySubtotal').textContent = formatPrice(subtotal);

    // Update Discount Row (Itatago kung 0, ipapakita kung meron)
    const discountRow = document.getElementById('summaryDiscountRow');
    if (activeDiscount > 0) {
        discountRow.style.display = 'flex';
        document.getElementById('summaryDiscountAmount').textContent = `-${formatPrice(discountAmount)}`;
    } else {
        discountRow.style.display = 'none';
    }

    // Update Delivery Fee Display (Gagamit tayo ng special ID para dito)
    const deliveryDisplay = document.getElementById('summaryDeliveryFee');
    if (deliveryDisplay) {
        if (deliveryFee === 0) {
            deliveryDisplay.textContent = "FREE";
            deliveryDisplay.style.color = "#27AE60"; // Gagawing green ang word na FREE
            deliveryDisplay.style.fontWeight = "800";
        } else {
            deliveryDisplay.textContent = formatPrice(deliveryFee);
            deliveryDisplay.style.color = "inherit";
            deliveryDisplay.style.fontWeight = "500";
        }
    }
    
    document.getElementById('summaryTotal').textContent = formatPrice(finalTotal);
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
        
        const imgHTML = order.imageSrc 
            ? `<img src="${order.imageSrc}" alt="${order.foodName}" style="width: 100%; height: 100%; object-fit: cover;">`
            : `<i data-lucide="utensils"></i>`;

        itemDiv.innerHTML = `
            <div class="item-img" style="overflow: hidden; padding: 0; background: transparent;">
                ${imgHTML}
            </div>
            <div class="item-details">
                <h4>${order.foodName}</h4>
                <p>Qty: ${order.quantity}</p>
                <strong>${formatPrice(order.subtotal)}</strong> 
            </div>
            <button class="btn-delete" onclick="deleteOrder(${order.id})">
                <i data-lucide="trash-2"></i>
            </button>
        `;
        tableBody.appendChild(itemDiv);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
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
    renderCouponDropdown(); 
    renderCheckoutTotals(); 
    modal.style.display = 'flex';
}

function placeOrder() {
    const nameEl = document.getElementById('custName');
    const addrEl = document.getElementById('custAddress');
    const phoneEl = document.getElementById('custPhone');
    const paymentEl = document.getElementById('paymentMethod'); 

    const name = nameEl ? nameEl.value.trim() : '';
    const address = addrEl ? addrEl.value.trim() : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const paymentMethod = paymentEl ? paymentEl.value : ''; 

    // 1. Check kung may laman ang text fields
    if (name === '' || address === '' || phone === '') {
        showToast("Please fill in all delivery details.", "error");
        return;
    }
    
    // 2. Check kung valid ang phone number length
    if (phone.length < 10) {
        showToast("Validation Error: Enter a valid phone number.", "error");
        return;
    }

    // 3. Check kung nakapili ng payment method
    if (paymentMethod === '') {
        showToast("Please select a Payment Method.", "error");
        return;
    }

    // ==========================================
    // DITO BANDA YUNG STEP 4 (Dynamic Success Message)
    // ==========================================
    let successMsg = `Order confirmed for ${name}! 🚀`;
    if (paymentMethod === 'gcash' || paymentMethod === 'paypay' || paymentMethod === 'kakaopay') {
        successMsg = `Redirecting to e-Wallet... Order secured! 🚀`;
    } else if (paymentMethod === 'card') {
        successMsg = `Card verified! Order confirmed for ${name}. 🚀`;
    } else if (paymentMethod === 'paypal' || paymentMethod === 'applepay') {
         successMsg = `Payment successful! Order confirmed for ${name}. 🚀`;
    }

    // Show Success Alert
    showToast(successMsg, "success");

    // Mark the used coupon
    if (activeCouponId && claimedCoupons[activeCouponId]) {
        claimedCoupons[activeCouponId] = { claimed: true, used: true };
        localStorage.setItem('foodhub_wallet', JSON.stringify(claimedCoupons));
    }

    // Clear the cart
    orders = [];
    activeDiscount = 0;
    activeDiscountType = 'percent';
    activeCouponId = '';
    localStorage.setItem('foodhub_orders', JSON.stringify(orders));
    localStorage.setItem('foodhub_active_discount', 0);
    localStorage.setItem('foodhub_active_discount_type', 'percent');
    localStorage.setItem('foodhub_active_coupon_id', '');

    // Reset UI
    renderTable();
    updateStats();
    closeModal();

    if (nameEl) nameEl.value = '';
    if (addrEl) addrEl.value = '';
    if (phoneEl) phoneEl.value = '';
    if (paymentEl) paymentEl.value = ''; // Reset payment dropdown
    renderCouponDropdown();
}


// ==========================================
// CUSTOM DROPDOWN LOGIC
// ==========================================

// Para bumukas/sumara ang dropdown list
function toggleDropdown() {
    document.getElementById('currencyOptions').classList.toggle('show');
}

// Kapag may piniling bansa
function selectCurrency(currencyCode, flagImage) {
    // 1. Update ang UI (Text at Image)
    document.getElementById('selectedFlag').src = `https://flagcdn.com/w20/${flagImage}`;
    document.getElementById('selectedCurrency').textContent = currencyCode;

    // 2. Itago ulit ang dropdown menu
    document.getElementById('currencyOptions').classList.remove('show');

    // 3. I-run ang existing function mo para mag-recalculate ng presyo
    changeCurrency(currencyCode);
}

// Para magsara ang dropdown kung pumindot ka sa ibang parts ng page
window.addEventListener('click', function(e) {
    if (!e.target.closest('.custom-currency-dropdown')) {
        const options = document.getElementById('currencyOptions');
        if (options && options.classList.contains('show')) {
            options.classList.remove('show');
        }
    }
});

// ==========================================
// SYNC DROPDOWN UI ON PAGE LOAD
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

    
    // I-map ang currency code sa tamang image filename
const flagMap = {
        'PHP': 'ph.png',
        'USD': 'us.png',
        'EUR': 'eu.png',
        'GBP': 'gb.png',
        'JPY': 'jp.png', // <-- Idagdag mo itong line na ito
        'KRW': 'kr.png'
    };
    // Kunin ang current currency mula sa localStorage (o USD kung wala)
    const savedCurrency = currentCurrency; 

    // I-update ang UI ng custom dropdown kung nag-e-exist yung element
    const flagImg = document.getElementById('selectedFlag');
    const currencyText = document.getElementById('selectedCurrency');

    if (flagImg && currencyText && flagMap[savedCurrency]) {
        flagImg.src = `https://flagcdn.com/w20/${flagMap[savedCurrency]}`;
        currencyText.textContent = savedCurrency;
    }
});

// ==========================================
// DOM EVENT BINDINGS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    try {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                }
            });
        }, { threshold: 0.15 });
        document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

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

        document.querySelectorAll('.faq-header').forEach(header => {
            header.addEventListener('click', function() {
                const item = this.parentElement;
                const isActive = item.classList.contains('active');
                document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
                if (!isActive) item.classList.add('active');
            });
        });

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

        document.querySelectorAll('.dev-img').forEach(img => {
            img.addEventListener('error', function() {
                this.classList.add('hidden');
                const fallback = this.nextElementSibling;
                if (fallback) fallback.classList.remove('hidden');
            });
        });

        window.addEventListener('click', function(event) {
            if (event.target.classList.contains('modal-overlay')) {
                closeModal();
            }
        });

     
        
        const countEl = document.getElementById('claimedCount');
        if (countEl) {
            const count = Object.values(claimedCoupons).filter(v => v === true || (v && v.claimed)).length;
            countEl.innerText = `${count} Voucher${count > 1 ? 's' : ''} Claimed`;
        }
    } catch (err) {
        console.warn("Munch UI Init warning: Some elements might not exist on this page.", err);
    }
});

// ==========================================
// REGION SPECIFIC DATA (Phone & Payments)
// ==========================================
// ==========================================
// REGION SPECIFIC DATA (Phone & Payments)
// ==========================================
const REGION_DATA = {
    PHP: { 
        code: "+63", phonePlaceholder: "912 345 6789", 
        payments: [{val: 'cod', text: 'Cash on Delivery (COD)'}, {val: 'gcash', text: 'GCash'}, {val: 'card', text: 'Credit / Debit Card'}] 
    },
    USD: { 
        code: "+1", phonePlaceholder: "234 567 8900", 
        payments: [{val: 'card', text: 'Credit / Debit Card'}, {val: 'paypal', text: 'PayPal'}, {val: 'applepay', text: 'Apple Pay'}] 
    },
    EUR: { 
        code: "+49", phonePlaceholder: "151 2345 6789", 
        payments: [{val: 'card', text: 'Credit / Debit Card'}, {val: 'sepa', text: 'SEPA Direct Debit'}, {val: 'paypal', text: 'PayPal'}] 
    },
    GBP: { 
        code: "+44", phonePlaceholder: "7123 456789", 
        payments: [{val: 'card', text: 'Credit / Debit Card'}, {val: 'paypal', text: 'PayPal'}, {val: 'applepay', text: 'Apple Pay'}] 
    },
    JPY: { 
        code: "+81", phonePlaceholder: "90 1234 5678", 
        payments: [{val: 'card', text: 'Credit / Debit Card'}, {val: 'paypay', text: 'PayPay'}, {val: 'linepay', text: 'LINE Pay'}] 
    },
    KRW: { 
        code: "+82", phonePlaceholder: "10 1234 5678", 
        payments: [{val: 'card', text: 'Credit / Debit Card'}, {val: 'kakaopay', text: 'KakaoPay'}, {val: 'naverpay', text: 'Naver Pay'}] 
    }
};

function updateCheckoutRegion() {
    const data = REGION_DATA[currentCurrency] || REGION_DATA['PHP'];
    
    // 1. I-update ang Phone Input Placeholder at Country Code
    const phoneInput = document.getElementById('custPhone');
    const codeDisplay = document.getElementById('countryCodeDisplay'); // Bagong idagdag
    
    if (phoneInput) phoneInput.placeholder = data.phonePlaceholder;
    if (codeDisplay) codeDisplay.innerText = data.code; // Papalitan kusa ang +63

    // 2. I-update ang Payment Dropdown Options
    const paymentSelect = document.getElementById('paymentMethod');
    if (paymentSelect) {
        paymentSelect.innerHTML = '<option value="" disabled selected>Select Payment Method...</option>';
        data.payments.forEach(opt => {
            paymentSelect.innerHTML += `<option value="${opt.val}">${opt.text}</option>`;
        });
    }
}

// Function para i-check kung valid ang time/date ng voucher
function isVoucherTimeValid(code) {
    const now = new Date();
    const hour = now.getHours(); // 0-23
    const day = now.getDate();   // 1-31

    // LOGIC: Midnight Cravings (10 PM - 2 AM)
    if (code === 'MIDNIGHT15') {
        if (hour >= 22 || hour < 2) {
            return { valid: true };
        } else {
            return { valid: false, msg: "Midnight Cravings is only claimable between 10 PM and 2 AM!" };
        }
    }

    // LOGIC: Payday Treat (Every 15th and 30th)
    if (code === 'PAYDAY100') {
        if (day === 15 || day === 30) {
            return { valid: true };
        } else {
            return { valid: false, msg: "Payday Treat is only claimable every 15th and 30th of the month!" };
        }
    }

    // LOGIC: Lent Season Promo (March 31 - April 6 only)
    if (code === 'LENT40') {
        const month = now.getMonth(); // 0=Jan, 2=Mar, 3=Apr
        const isLentPeriod = (month === 2 && day >= 31) || (month === 3 && day <= 6);
        if (isLentPeriod) {
            return { valid: true };
        } else {
            return { valid: false, msg: "Seasonal Feast is only available from March 31 to April 6!" };
        }
    }

    // Default: Claimable ang iba
    return { valid: true };
}

function renderPromos() {
    const voucherGrid = document.getElementById('voucherGrid');
    if (!voucherGrid) return;
    voucherGrid.innerHTML = '';

    // Kumuha ng system time ngayon
    const now = new Date();
    const currentHour = now.getHours(); // 0-23
    const currentDay = now.getDate();   // 1-31

    Object.keys(COUPON_DATA).forEach(key => {
        const coupon = COUPON_DATA[key];
        const _cv = claimedCoupons[key];
        const isClaimed = _cv === true || (_cv && _cv.claimed === true);
        const isUsed = _cv && typeof _cv === 'object' && _cv.used === true;
        
        // Skip rendering Lend season and other unclaimable dynamic types
        if (coupon.type === 'season' || coupon.type === 'shipping') return;

        let isDisabled = false;
        let buttonText = isClaimed ? 'Claimed' : 'Claim Now';
        let buttonClass = 'claim-btn';

        // ==========================================
        // DITO BANDA ANG TIMING LOGIC
        // ==========================================
        
        // LOGIC: Midnight Cravings (Valid only 10 PM - 2 AM)
        if (key === 'MIDNIGHT15') {
            const isValidTime = (currentHour >= 22 || currentHour < 2);
            if (!isValidTime) {
                isDisabled = true;
                buttonText = "Unclaimable"; // Mas specific na text
            }
        }

        // LOGIC: Payday Treat (Valid only 15th and 30th)
        if (key === 'PAYDAY100') {
            const isValidDate = (currentDay === 15 || currentDay === 30);
            if (!isValidDate) {
                isDisabled = true;
                buttonText = "Unclaimable";
            }
        }

        // LOGIC: Lent Season Promo (Valid only March 31 - April 6)
        if (key === 'LENT40') {
            const currentMonth = now.getMonth(); // 0=Jan, 2=Mar, 3=Apr
            const isLentPeriod = (currentMonth === 2 && currentDay >= 31) || (currentMonth === 3 && currentDay <= 6);
            if (!isLentPeriod) {
                isDisabled = true;
                buttonText = "Unclaimable";
            }
        }

        // Setup common dynamic data
        const idAttr = key.match(/^\d+$/) ? `data-id="${key}"` : '';
        const codeAttr = key.match(/^\d+$/) ? '' : `data-code="${key}"`;
        const titleAttr = key.match(/^\d+$/) ? '' : `data-title="${coupon.name}"`; 
        
        // Setup Icon and Visual Class base sa categories
        let iconHtml = '<i data-lucide="tag"></i>'; 
        let cardClass = 'promo-card';
        if (key === 'GOLDEN20') { iconHtml = '<i data-lucide="user-plus"></i>'; cardClass += ' promo-senior'; }
        if (key === 'INCLUSION') { iconHtml = '<i data-lucide="accessibility"></i>'; cardClass += ' promo-pwd'; }
        if (key === 'STUDENT20') { iconHtml = '<i data-lucide="award"></i>'; cardClass += ' promo-student'; }
        if (key === 'MIDNIGHT15') { iconHtml = '<i data-lucide="moon"></i>'; cardClass += ' promo-midnight'; }
        if (key === 'PAYDAY100') { iconHtml = '<i data-lucide="banknote"></i>'; cardClass += ' promo-payday'; }
        if (key === 'BARKADA200') { iconHtml = '<i data-lucide="users"></i>'; cardClass += ' promo-barkada'; }
        if (key === 'LENT40') { iconHtml = '<i data-lucide="utensils-crossed"></i>'; cardClass += ' promo-lent'; }

        // ==========================================
        // I-apply ang GRAYISH looks kung disabled
        // ==========================================
        if (isUsed) {
            cardClass += ' disabled-card';
            buttonClass += ' btn-disabled';
            buttonText = 'Used';
        } else if (isDisabled) {
            cardClass += ' disabled-card';
            buttonClass += ' btn-disabled';
        } else if (isClaimed) {
            buttonClass += ' claimed-btn';
        }

        // Use check icon (white) for claimed, otherwise use the card's own icon
        const buttonIconHtml = (isClaimed || isUsed)
            ? '<i data-lucide="check" style="width:18px;height:18px;stroke:white;color:white;"></i>'
            : iconHtml;

        const promoCard = document.createElement('div');
        promoCard.className = cardClass;
        promoCard.innerHTML = `
            <div class="promo-content">
                <div class="promo-value">${coupon.type === 'flat' ? formatPrice(coupon.value) : coupon.value + '% OFF'}</div>
                <h3>${coupon.name.split(' (')[0]}</h3>
                <p>Enjoy ${coupon.type === 'flat' ? formatPrice(coupon.value) : coupon.value + '%'} discount on your next ordering!</p>
                <button class="${buttonClass}" ${isDisabled || isClaimed || isUsed ? 'disabled' : ''} ${idAttr} ${codeAttr} ${titleAttr}>
                    ${buttonIconHtml} ${buttonText}
                </button>
            </div>
            <div class="promo-icon-bg">${iconHtml}</div>
        `;
        voucherGrid.appendChild(promoCard);
    });
    
    // Re-initialize Lucide Icons after dynamic rendering
    lucide.createIcons();
    addClaimListeners(); 
}

// Function para gumana ang Claim Buttons kahit bagong gawa ang mga ito
function addClaimListeners() {
    document.querySelectorAll('.claim-btn').forEach(btn => {
        // Iwasan ang double binding
        if (btn.dataset.listenerAdded) return;
        
        btn.addEventListener('click', (e) => {
            const id = btn.getAttribute('data-id');
            const code = btn.getAttribute('data-code');
            const title = btn.getAttribute('data-title');
            
            // Re-check validity on click (safety measure)
            const key = id || code;
            const check = isVoucherTimeValid(key);
            
            if (!check.valid) {
                showToast(check.msg, "error");
                return;
            }

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
        btn.dataset.listenerAdded = "true";
    });
}
   renderCouponDropdown();
        renderTable();
        updateStats();
        updateAllVisiblePrices(); // DITO NATIN C-NALL YUNG INITIAL CURRENCY LOAD
    
        // IDAGDAG MO ITONG LINE NA ITO:
        renderPromos();

// Siguraduhin na tinatawag ito sa dulo ng renderPromos()
// (Nakalagay na ito sa script mo kanina, make sure lang na nandito yung function definition)