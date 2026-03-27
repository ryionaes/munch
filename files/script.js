// ==========================================
// DATA STORAGE & DOM ELEMENTS
// ==========================================
let orders = JSON.parse(localStorage.getItem('foodhub_orders')) || [];
let claimedCoupons = JSON.parse(localStorage.getItem('foodhub_wallet')) || {};
let activeDiscount = parseFloat(localStorage.getItem('foodhub_active_discount')) || 0;
let activeDiscountType = localStorage.getItem('foodhub_active_discount_type') || 'percent';
let activeCouponId = localStorage.getItem('foodhub_active_coupon_id') || '';

const COUPON_DATA = {
    'STUDENT20': { name: 'Student Discount (20% OFF)', value: 20, type: 'percent', minSpend: 150 },
    'GOLDEN20': { name: 'Senior Citizen (20% OFF)', value: 20, type: 'percent', minSpend: 0 },
    'INCLUSION': { name: 'PWD Discount (20% OFF)', value: 20, type: 'percent', minSpend: 0 },
    'LENT40': { name: 'Mahal na Araw Promo (40% OFF)', value: 40, type: 'percent', minSpend: 400 },
    'WELCOME5': { name: 'New User Promo (₱280 OFF)', value: 280, type: 'flat', minSpend: 600 }, 
    'PAYDAY100': { name: 'Payday Treat (₱100 OFF)', value: 100, type: 'flat', minSpend: 400 },
    'MIDNIGHT15': { name: 'Midnight Cravings (15% OFF)', value: 15, type: 'percent', minSpend: 250 },
    'WEEKEND10': { name: 'Weekend Craze (10% OFF)', value: 10, type: 'percent', minSpend: 200 },
    'BARKADA200': { name: 'Barkada Bundle (₱200 OFF)', value: 200, type: 'flat', minSpend: 800 },
    'FREESHIP': { name: 'Free Delivery', value: 0, type: 'shipping', minSpend: 300 }
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
    // 1. Update Food Grid Prices (Fixed Regex to include openAddonsModal)
    document.querySelectorAll('.food-card').forEach(card => {
        const btn = card.querySelector('.btn-add-card');
        const priceStrong = card.querySelector('.card-bottom strong');
        if (btn && priceStrong) {
            const onclickStr = btn.getAttribute('onclick');
            // This new regex catches BOTH the old addOrder and the new openAddonsModal
            const match = onclickStr.match(/(?:addOrder|openAddonsModal)\([^,]+,\s*'[^']+',\s*([\d.]+)/);
            if (match && match[1]) {
                const basePrice = parseFloat(match[1]);
                priceStrong.textContent = formatPrice(basePrice);
            }
        }
    });

    // 2. Sync Custom Dropdown UI (Updates the flag and text if changed)
    const flagMap = {
        'PHP': 'ph.png', 'USD': 'us.png', 'EUR': 'eu.png', 
        'GBP': 'gb.png', 'JPY': 'jp.png', 'KRW': 'kr.png'
    };
    const flagImg = document.getElementById('selectedFlag');
    const currencyText = document.getElementById('selectedCurrency');
    
    if (flagImg && currencyText && flagMap[currentCurrency]) {
        flagImg.src = `https://flagcdn.com/w20/${flagMap[currentCurrency]}`;
        currencyText.textContent = currentCurrency;
    }

    // 3. Re-render Cart, Stats, and Modal
    renderTable();
    updateStats();
    if (document.getElementById('checkoutModal') && document.getElementById('checkoutModal').style.display === 'flex') {
        renderCheckoutTotals();
    }
    
    // 4. Apply region-specific delivery fees
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

    // AUTO-REMOVE COUPON KUNG BUMABA SA MINIMUM SPEND ANG SUBTOTAL
    if (activeCouponId && COUPON_DATA[activeCouponId]) {
        if (subtotal < COUPON_DATA[activeCouponId].minSpend) {
            activeDiscount = 0;
            activeDiscountType = 'percent';
            activeCouponId = '';
            localStorage.setItem('foodhub_active_coupon_id', '');
            
            // ITO ANG BAGONG UPDATE: I-uupdate na niya yung text sa bagong voucher button mo!
            if (typeof updateCheckoutVoucherLabel === 'function') {
                updateCheckoutVoucherLabel(); 
            }
        }
    }

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
                const claimedCouponsKeys = Object.keys(claimedCoupons).filter(k => {
                    const v = claimedCoupons[k];
                    return v === true || (v && v.claimed);
                });
                const usedCount = claimedCouponsKeys.filter(k => {
                    const v = claimedCoupons[k];
                    return v && typeof v === 'object' && v.used;
                }).length;
                const activeCount = claimedCouponsKeys.length - usedCount;
                const countEl = document.getElementById('claimedCount');
                if (countEl) {
                    if (activeCount > 0) {
                        countEl.innerText = `${activeCount} Active • ${usedCount} Used`;
                    } else {
                        countEl.innerText = `${usedCount} Used`;
                    }
                }

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
    // Dinagdag natin yung 'receiptModal' sa array
    ['couponModal', 'checkoutModal', 'claimModal', 'walletModal', 'receiptModal'].forEach(id => {
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
    const list = document.getElementById('checkoutVoucherList');
    if (!list) return;

    list.innerHTML = '';
    let hasCoupons = false;

    for (let id in claimedCoupons) {
        const cv = claimedCoupons[id];
        const isCl = cv === true || (cv && cv.claimed);
        const isUs = cv && typeof cv === 'object' && cv.used;
        
        if (isCl && !isUs && COUPON_DATA[id]) {
            hasCoupons = true;
            const coupon = COUPON_DATA[id];
            const isSelected = (id === activeCouponId);
            const borderStyle = isSelected ? 'border: 2px solid var(--primary-orange); background: rgba(255, 107, 53, 0.05);' : 'border: 1px solid #ddd; background: white;';
            
            list.innerHTML += `
                <div onclick="applyCoupon('${id}')" style="${borderStyle} padding: 15px; border-radius: 12px; cursor: pointer; transition: 0.2s; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h4 style="font-size: 14px; font-weight: 700; color: var(--text-dark); margin-bottom: 2px;">${coupon.name}</h4>
                        <p style="font-size: 12px; color: var(--text-light); margin: 0;">Min. Spend: ${formatPrice(coupon.minSpend)}</p>
                    </div>
                    ${isSelected ? '<i data-lucide="check-circle" style="color: var(--primary-orange); width: 20px;"></i>' : ''}
                </div>
            `;
        }
    }

    if (!hasCoupons) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-light); font-size: 13px; padding: 20px 0;">No available vouchers in your wallet.</p>';
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    // I-update ang label sa checkout button
    updateCheckoutVoucherLabel();
}

function updateCheckoutVoucherLabel() {
    const label = document.getElementById('checkoutVoucherLabel');
    if (!label) return;
    if (activeCouponId && COUPON_DATA[activeCouponId]) {
        label.innerHTML = `<span style="color: var(--primary-orange);">${COUPON_DATA[activeCouponId].name}</span>`;
    } else {
        label.innerHTML = "Apply a Voucher";
    }
}

function applyCoupon(couponId) {
    if (!couponId || couponId === "0" || !COUPON_DATA[couponId]) {
        activeDiscount = 0;
        activeDiscountType = 'percent';
        activeCouponId = '';
        if(couponId === "0") showToast('Voucher removed.', 'info'); 
    } else {
        const coupon = COUPON_DATA[couponId];
        let currentSubtotal = orders.reduce((sum, item) => sum + item.subtotal, 0);
        
        if (currentSubtotal < coupon.minSpend) {
            showToast(`Minimum spend of ${formatPrice(coupon.minSpend)} required!`, 'error');
            return; 
        }

        activeDiscount = coupon.value;
        activeDiscountType = coupon.type || 'percent';
        activeCouponId = couponId;
        showToast(`${coupon.name} applied!`, 'success');
    }

    localStorage.setItem('foodhub_active_discount', activeDiscount);
    localStorage.setItem('foodhub_active_discount_type', activeDiscountType);
    localStorage.setItem('foodhub_active_coupon_id', activeCouponId);
    
    updateStats();
    renderCouponDropdown(); // Re-render para lumabas yung check icon sa napili
    
    const modal = document.getElementById('checkoutModal');
    if (modal && modal.style.display === 'flex') {
        renderCheckoutTotals();
    }
    
    // Isara agad ang voucher modal kapag nakapili na
    const vModal = document.getElementById('voucherSelectionModal');
    if (vModal) vModal.style.display = 'none';
}

function applyManualCoupon() {
    const input = document.getElementById('manualPromoInput');
    if (!input) return;
    
    const code = input.value.trim().toUpperCase();
    if (!code) {
        showToast('Please enter a promo code.', 'error');
        return;
    }

    // 1. I-check kung nag-e-exist yung promo code
    if (!COUPON_DATA[code]) {
        showToast('Invalid promo code.', 'error');
        return;
    }

    // 2. I-check kung NAGAMIT NA (ito yung request mo!)
    const cv = claimedCoupons[code];
    const isUsed = cv && typeof cv === 'object' && cv.used;
    if (isUsed) {
        showToast('This promo code has already been used.', 'error');
        return;
    }
    
    // 3. I-check ang Oras / Araw (kung para lang ba sa weekend/midnight)
    const check = isVoucherTimeValid(code);
    if (!check.valid) {
        showToast(check.msg, 'error');
        return;
    }

    // 4. Kung di pa niya na-claim, i-auto claim natin at idagdag sa wallet niya
    if (!cv || cv !== true || !cv.claimed) {
        claimedCoupons[code] = { claimed: true, used: false };
        localStorage.setItem('foodhub_wallet', JSON.stringify(claimedCoupons));
    }

    // 5. I-apply ang voucher! (Kasama na rito ang minimum spend check na nasa applyCoupon function)
    applyCoupon(code);
    input.value = ''; // i-clear ang text box
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

// Hanapin at palitan ang buong placeOrder() function:
function placeOrder() {
    const nameEl = document.getElementById('custName');
    const addrEl = document.getElementById('custAddress');
    const phoneEl = document.getElementById('custPhone');
    const paymentEl = document.getElementById('paymentMethod'); 

    const name = nameEl ? nameEl.value.trim() : '';
    const address = addrEl ? addrEl.value.trim() : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const paymentMethod = paymentEl ? paymentEl.value : ''; 

    // 1. Empty Cart Check
    if (orders.length === 0) {
        showToast("Your cart is empty! Add some items first.", "error");
        return;
    }

    // 2. Basic Empty Field Validation
    if (name === '' || address === '' || phone === '' || paymentMethod === '') {
        showToast("Please fill in all delivery details.", "error");
        return;
    }

    // 3. Robust Phone Regex Validation (7 to 15 digits)
    const phoneRegex = /^\d{7,15}$/;
    if (!phoneRegex.test(phone)) {
        phoneEl.classList.add('input-error');
        showToast("Please enter a valid phone number (digits only).", "error");
        return;
    } else {
        phoneEl.classList.remove('input-error');
    }

    // 4. Trigger Loading State UX
    const confirmBtn = document.querySelector('.btn-checkout-confirm');
    const originalBtnText = confirmBtn.innerHTML;
    confirmBtn.innerHTML = '<i data-lucide="loader" class="icon-spin" style="width: 18px; display: inline-block; vertical-align: middle;"></i> Processing Payment...';
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.7';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Simulate network request delay (1.5 seconds)
    setTimeout(() => {
        // --- COMPUTATION PARA SA RECEIPT ---
        let subtotal = orders.reduce((sum, item) => sum + item.subtotal, 0);
        let deliveryFee = (subtotal >= 1000 || activeCouponId === 'FREESHIP') ? 0 : getDynamicDeliveryFee();
        let discountAmount = activeDiscountType === 'flat' ? Math.min(activeDiscount, subtotal) : subtotal * (activeDiscount / 100);
        let finalTotal = (subtotal - discountAmount) + deliveryFee;

        const orderId = 'MUNCH-' + Math.floor(100000 + Math.random() * 900000); 
        
        const newOrderData = {
            orderId: orderId,
            date: new Date().toISOString(),
            customer: { name, address, phone },
            items: [...orders], 
            subtotal: subtotal,
            discount: discountAmount,
            deliveryFee: deliveryFee,
            total: finalTotal,
            paymentMethod: paymentMethod,
            status: 'Preparing', 
            currency: currentCurrency 
        };
        
        localStorage.setItem('munch_active_order', JSON.stringify(newOrderData));

        let orderHistory = JSON.parse(localStorage.getItem('munch_order_history')) || [];
        orderHistory.push(newOrderData);
        localStorage.setItem('munch_order_history', JSON.stringify(orderHistory));

        document.getElementById('receiptOrderId').textContent = orderId;
        document.getElementById('receiptTotalAmount').textContent = formatPrice(finalTotal);
        
        const receiptList = document.getElementById('receiptItemsList');
        receiptList.innerHTML = '';
        orders.forEach(item => {
            receiptList.innerHTML += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: var(--text-dark);">
                    <span style="font-weight: 600;">${item.quantity}x ${item.foodName}</span>
                    <span>${formatPrice(item.subtotal)}</span>
                </div>
            `;
        });

        if (activeCouponId && claimedCoupons[activeCouponId]) {
            claimedCoupons[activeCouponId] = { claimed: true, used: true };
            localStorage.setItem('foodhub_wallet', JSON.stringify(claimedCoupons));
        }

        // Clear Cart
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
        
        // Reset Button and Modals
        confirmBtn.innerHTML = originalBtnText;
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        
        document.getElementById('checkoutModal').style.display = 'none';
        document.getElementById('receiptModal').style.display = 'flex';
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
        
        if (nameEl) nameEl.value = '';
        if (addrEl) addrEl.value = '';
        if (phoneEl) phoneEl.value = '';
        if (paymentEl) paymentEl.value = '';
    }, 1500); 
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
            
            // Check kung claimed o kaya ay used na
            const cv = claimedCoupons[key];
            const isClaimedOrUsed = cv === true || (cv && cv.claimed);

            if (key && isClaimedOrUsed) {
                // Idinagdag ang claimed-btn class para gumana yung CSS natin!
                btn.classList.add('claimed-btn'); 
                
                btn.innerHTML = '<i data-lucide="check" style="width: 18px; display: inline-block; vertical-align: middle; margin-right: 5px;"></i> Claimed';
                btn.style.background = '#27AE60';
                btn.style.color = 'white';
                btn.style.border = 'none';
                btn.disabled = true;
                
                // Kailangan tawagin ulit ito para ma-drawing yung check icon
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        });

       // ==========================================
        // SMART UNIFIED FILTER (Search + Categories)
        // ==========================================
        const filterBtns = document.querySelectorAll('.filter-btn');
        const foodCards = document.querySelectorAll('.food-card');
        const searchInput = document.getElementById('foodSearchInput');
        const noResultsMsg = document.getElementById('noResultsMessage');

        // Main filtering function
        function applyFilters() {
            const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
            const activeBtn = document.querySelector('.filter-btn.active');
            const activeFilter = activeBtn ? activeBtn.getAttribute('data-filter') : 'all';
            
            let visibleCount = 0;

            foodCards.forEach(card => {
                // 1. Check Search Input
                const titleElement = card.querySelector('h4');
                const foodName = titleElement ? titleElement.textContent.toLowerCase() : '';
                const matchesSearch = foodName.includes(searchTerm);

                // 2. Check Category Filter
                const itemCategories = card.getAttribute('data-category') || "";
                const matchesCategory = (activeFilter === 'all' || itemCategories.includes(activeFilter));

                // 3. Show card ONLY if it matches BOTH
                if (matchesSearch && matchesCategory) {
                    card.style.display = 'block';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });
            

            // 4. Show "Empty Message" kung walang nakapasa sa filter
            if (noResultsMsg) {
                noResultsMsg.style.display = visibleCount === 0 ? 'block' : 'none';
                // Re-render icon kung sakaling lumabas ang empty message
                if (visibleCount === 0 && typeof lucide !== 'undefined') {
                    lucide.createIcons(); 
                }
            }

            // ==========================================
        // AUTO-SCROLL ON ENTER KEY (Search Bar)
        // ==========================================
        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                // I-check kung "Enter" key ang pinindot
                if (e.key === 'Enter') {
                    e.preventDefault(); // Iwasan ang page reload
                    
                    // Hanapin yung food grid container natin
                    const gridTarget = document.querySelector('.category-header'); 
                    
                    if (gridTarget) {
                        // Mag-scroll pababa nang dahan-dahan (smooth)
                        gridTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        
                        // Optional: Tanggalin yung focus sa search bar para hindi na naka-keyboard sa mobile
                        searchInput.blur();
                    }
                }
            });
        }
        }

        

        // Trigger filter kapag pumindot ng category button
        if (filterBtns.length > 0) {
            filterBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    // Tanggalin ang active class sa lahat, tapos ilagay sa kinlick
                    filterBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    // I-apply ang filter rules
                    applyFilters();
                });
            });
        }

        // Trigger filter habang nagta-type sa search bar
        if (searchInput) {
            searchInput.addEventListener('input', applyFilters);
        }

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
            const claimedCouponsKeys = Object.keys(claimedCoupons).filter(k => {
                const v = claimedCoupons[k];
                return v === true || (v && v.claimed);
            });
            const usedCount = claimedCouponsKeys.filter(k => {
                const v = claimedCoupons[k];
                return v && typeof v === 'object' && v.used;
            }).length;
            const activeCount = claimedCouponsKeys.length - usedCount;
            
            if (activeCount > 0) {
                countEl.innerText = `${activeCount} Active • ${usedCount} Used`;
            } else if (usedCount > 0) {
                countEl.innerText = `${usedCount} Used`;
            } else {
                countEl.innerText = '0 Vouchers Claimed';
            }
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
    const hour = now.getHours(); 
    const day = now.getDate();   
    const dayOfWeek = now.getDay(); // 0 = Sun, 6 = Sat

    if (code === 'MIDNIGHT15') {
        if (hour >= 22 || hour < 2) return { valid: true };
        else return { valid: false, msg: "Midnight Cravings is only claimable between 10 PM and 2 AM!" };
    }

    if (code === 'PAYDAY100') {
        if (day === 15 || day === 30) return { valid: true };
        else return { valid: false, msg: "Payday Treat is only claimable every 15th and 30th of the month!" };
    }

    if (code === 'LENT40') {
        const month = now.getMonth(); 
        const isLentPeriod = (month === 2 && day >= 31) || (month === 3 && day <= 6);
        if (isLentPeriod) return { valid: true };
        else return { valid: false, msg: "Mahal na Araw Promo is only available from March 31 to April 6!" };
    }

    // BAGONG LOGIC PARA SA WEEKEND CRAZE
    if (code === 'WEEKEND10') {
        if (dayOfWeek === 0 || dayOfWeek === 6) return { valid: true };
        else return { valid: false, msg: "Weekend Craze is only claimable on Saturdays and Sundays!" };
    }

    return { valid: true };
}

function renderPromos() {
    const claimableGrid = document.getElementById('claimableGrid');
    const unclaimableGrid = document.getElementById('unclaimableGrid');
    const unavailableContainer = document.getElementById('unavailableContainer');

    if (!claimableGrid || !unclaimableGrid) return;
    
    claimableGrid.innerHTML = '';
    unclaimableGrid.innerHTML = '';

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDate();   
    const currentMonth = now.getMonth(); 
    const currentDayOfWeek = now.getDay(); 

    let hasUnclaimable = false;

    Object.keys(COUPON_DATA).forEach(key => {
        const coupon = COUPON_DATA[key];
        const _cv = claimedCoupons[key];
        const isClaimed = _cv === true || (_cv && _cv.claimed === true);
        const isUsed = _cv && typeof _cv === 'object' && _cv.used === true;

        let isDisabled = false;
        let buttonText = isClaimed ? 'Claimed' : 'Claim Now';
        let buttonClass = 'claim-btn';

        // Check if Time/Date makes it disabled
        if (key === 'MIDNIGHT15' && !(currentHour >= 22 || currentHour < 2)) isDisabled = true;
        if (key === 'PAYDAY100' && (currentDay !== 15 && currentDay !== 30)) isDisabled = true;
        if (key === 'LENT40' && !((currentMonth === 2 && currentDay >= 31) || (currentMonth === 3 && currentDay <= 6))) isDisabled = true;
        if (key === 'WEEKEND10' && (currentDayOfWeek !== 0 && currentDayOfWeek !== 6)) isDisabled = true;

        if (isDisabled) buttonText = "Unclaimable";

        const idAttr = key.match(/^\d+$/) ? `data-id="${key}"` : '';
        const codeAttr = key.match(/^\d+$/) ? '' : `data-code="${key}"`;
        const titleAttr = key.match(/^\d+$/) ? '' : `data-title="${coupon.name}"`; 
        
        let iconHtml = '<i data-lucide="tag"></i>'; 
        let cardClass = 'promo-card';
        if (key === 'GOLDEN20') { iconHtml = '<i data-lucide="user-plus"></i>'; cardClass += ' promo-senior'; }
        if (key === 'INCLUSION') { iconHtml = '<i data-lucide="accessibility"></i>'; cardClass += ' promo-pwd'; }
        if (key === 'STUDENT20') { iconHtml = '<i data-lucide="award"></i>'; cardClass += ' promo-student'; }
        if (key === 'MIDNIGHT15') { iconHtml = '<i data-lucide="moon"></i>'; cardClass += ' promo-midnight'; }
        if (key === 'PAYDAY100') { iconHtml = '<i data-lucide="banknote"></i>'; cardClass += ' promo-payday'; }
        if (key === 'BARKADA200') { iconHtml = '<i data-lucide="users"></i>'; cardClass += ' promo-barkada'; }
        if (key === 'LENT40') { iconHtml = '<i data-lucide="sun"></i>'; cardClass += ' promo-lent'; }
        if (key === 'WEEKEND10') { iconHtml = '<i data-lucide="calendar-heart"></i>'; cardClass += ' promo-payday'; }
        if (key === 'WELCOME5') { iconHtml = '<i data-lucide="party-popper"></i>'; cardClass += ' promo-welcome'; }
        if (key === 'FREESHIP') { iconHtml = '<i data-lucide="truck"></i>'; cardClass += ' promo-freeship'; }

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

        const buttonIconHtml = (isClaimed || isUsed)
            ? '<i data-lucide="check" style="width:18px;height:18px;stroke:white;color:white;"></i>'
            : iconHtml;

        let displayValue = "";
        if (coupon.type === 'flat') displayValue = formatPrice(coupon.value) + " OFF";
        else if (coupon.type === 'percent') displayValue = coupon.value + "% OFF";
        else if (coupon.type === 'shipping') displayValue = "FREE SHIPPING";

        let displayDesc = coupon.type === 'shipping' ? 'No delivery fee!' : `Enjoy ${coupon.type === 'flat' ? formatPrice(coupon.value) : coupon.value + '%'} discount on your next ordering!`;

        let promoHtml = `
            <div class="${cardClass}">
                <div class="promo-content">
                    <div class="promo-value">${displayValue}</div>
                    <h3>${coupon.name.split(' (')[0]}</h3>
                    <p>${displayDesc}</p>
                    <button class="${buttonClass}" ${isDisabled || isClaimed || isUsed ? 'disabled' : ''} ${idAttr} ${codeAttr} ${titleAttr}>
                        ${buttonIconHtml} ${buttonText}
                    </button>
                </div>
                <div class="promo-icon-bg">${iconHtml}</div>
            </div>
        `;

        if (isDisabled || isUsed) {
            unclaimableGrid.innerHTML += promoHtml;
            hasUnclaimable = true;
        } else {
            claimableGrid.innerHTML += promoHtml;
        }
    });
    
    if (unavailableContainer) {
        unavailableContainer.style.display = hasUnclaimable ? 'block' : 'none';
    }

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

// ==========================================
        // SEARCH BAR LOGIC
        // ==========================================
        const searchInput = document.getElementById('foodSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                const searchTerm = this.value.toLowerCase().trim();
                const foodCards = document.querySelectorAll('.food-card');
                const filterBtns = document.querySelectorAll('.filter-btn');
                
                // Kapag nag-type si user, i-reset natin ang category tab sa "All"
                // Para hindi siya magtaka kung bakit walang lumalabas pag nasa "Drinks" tab siya pero "Burger" ang hinahanap
                if (searchTerm.length > 0) {
                    filterBtns.forEach(b => b.classList.remove('active'));
                    const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
                    if (allBtn) allBtn.classList.add('active');
                }

                // I-check bawat food card kung may match sa pangalan
                foodCards.forEach(card => {
                    const titleElement = card.querySelector('h4');
                    const foodName = titleElement ? titleElement.textContent.toLowerCase() : '';
                    
                    if (foodName.includes(searchTerm)) {
                        card.style.display = 'block';
                    } else {
                        card.style.display = 'none';
                    }
                });
            });
        }

        function openVoucherSelectionModal() {
    renderCouponDropdown();
    const modal = document.getElementById('voucherSelectionModal');
    if (modal) {
        modal.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

window.viewOrderDetails = function(orderId, currentStatus) {
    const historyData = JSON.parse(localStorage.getItem('munch_order_history')) || [];
    const order = historyData.find(o => o.orderId === orderId);
    
    if (!order) return;

    // 1. Populate Basic Info
    document.getElementById('modalOrderId').textContent = order.orderId;
    document.getElementById('modalOrderStatus').textContent = currentStatus;
    const dateObj = new Date(order.date);
    document.getElementById('modalOrderDate').textContent = dateObj.toLocaleString();

   // --- TIMELINE LOGIC (WITH CANCELLED STATE) ---
const s2 = document.getElementById('m-step-2');
const s3 = document.getElementById('m-step-3');
const s4 = document.getElementById('m-step-4');

// I-reset muna lahat sa default bago i-apply ang status
[s2, s3, s4].forEach(s => {
    s.classList.remove('active', 'cancelled');
    s.style.display = 'flex';
});
s2.querySelector('.step-icon').innerHTML = '<i data-lucide="chef-hat"></i>';
s2.querySelector('h4').textContent = 'Cooking';

if (currentStatus === 'Cancelled') {
    // Kapag cancelled: Step 2 magiging Red X, pero lahat ng steps ay makikita pa rin
    s2.classList.add('cancelled');
    s2.querySelector('.step-icon').innerHTML = '<i data-lucide="x"></i>';
    s2.querySelector('h4').textContent = 'Cancelled';
    // IMPORTANT: Don't hide s3 at s4, para makita pa rin ang lahat ng steps
    // s3 at s4 ay manatiling visible pero hindi active/highlighted
    document.getElementById('modalOrderStatus').style.color = '#E74C3C';
} else {
    // Kapag Completed: Lahat magiging Solid Orange (Active)
    s2.classList.add('active');
    s3.classList.add('active');
    s4.classList.add('active');
    document.getElementById('modalOrderStatus').style.color = 'var(--primary-orange)';
}
// --- END TIMELINE LOGIC ---

    // 3. Render Items
    const itemsList = document.getElementById('modalOrderItems');
    itemsList.innerHTML = order.items.map(item => `
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px;">
            <span><span style="font-weight:700;">${item.quantity}x</span> ${item.foodName}</span>
            <span style="font-weight:600;">${formatHistoryPrice(item.subtotal, order.currency)}</span>
        </div>
    `).join('');

    // 4. Update Totals
    document.getElementById('modalOrderSubtotal').textContent = formatHistoryPrice(order.subtotal, order.currency);
    document.getElementById('modalOrderDelivery').textContent = order.deliveryFee === 0 ? "FREE" : formatHistoryPrice(order.deliveryFee, order.currency);
    document.getElementById('modalOrderTotal').textContent = formatHistoryPrice(order.total, order.currency);
    
    // Customer Info
    document.getElementById('modalCustName').textContent = order.customer.name;
    document.getElementById('modalCustPhone').textContent = order.customer.phone;
    document.getElementById('modalCustAddress').textContent = order.customer.address;

    document.getElementById('orderDetailsModal').style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
};

// Wag kalimutang i-register 'to sa window object sa taas ng script mo para mabasa ng HTML
// ILAGAY ITO SA PINAKABABA NG script.js
window.applyManualCoupon = applyManualCoupon;
window.openVoucherSelectionModal = openVoucherSelectionModal;

// Siguraduhin na tinatawag ang initial load functions
document.addEventListener('DOMContentLoaded', () => {
    renderCouponDropdown();
    renderTable();
    updateStats();
    updateAllVisiblePrices();
    if (typeof renderPromos === 'function') renderPromos();
});

let _addons_item = {};

function openAddonsModal(name, category, price, prepTime, rating, imgSrc) {
    _addons_item = { name, category, price, prepTime, rating };

    const addonsContainer = document.getElementById('addonsListContainer');
    let addonsHTML = '';

    // I-convert sa lowercase ang category para mas madaling i-check
    const cat = category.toLowerCase();

    // Kapag Mains o Popular (kadalasan meals ito)
    if (cat.includes('mains') || cat.includes('popular') || cat === 'meals') {
        addonsHTML = `
            <label class="addon-row">
                <input type="checkbox" class="addon-check" value="25" data-label="Extra Rice"> 
                <span class="addon-name">Extra Rice</span><span class="addon-price">+₱25</span>
            </label>
            <label class="addon-row">
                <input type="checkbox" class="addon-check" value="30" data-label="Add Egg"> 
                <span class="addon-name">Add Egg</span><span class="addon-price">+₱30</span>
            </label>
            <label class="addon-row">
                <input type="checkbox" class="addon-check" value="50" data-label="Extra Meat"> 
                <span class="addon-name">Extra Meat</span><span class="addon-price">+₱50</span>
            </label>
        `;
    } 
    // Kapag Sides (tulad ng Fries, Wings)
    else if (cat.includes('sides')) {
        addonsHTML = `
            <label class="addon-row">
                <input type="checkbox" class="addon-check" value="20" data-label="Cheese Dip"> 
                <span class="addon-name">Cheese Dip</span><span class="addon-price">+₱20</span>
            </label>
            <label class="addon-row">
                <input type="checkbox" class="addon-check" value="25" data-label="Garlic Mayo"> 
                <span class="addon-name">Garlic Mayo</span><span class="addon-price">+₱25</span>
            </label>
        `;
    } 
    // Kapag Desserts (tulad ng Churros, Cake)
    else if (cat.includes('desserts')) {
        addonsHTML = `
            <label class="addon-row">
                <input type="checkbox" class="addon-check" value="30" data-label="Extra Chocolate Syrup"> 
                <span class="addon-name">Extra Chocolate Syrup</span><span class="addon-price">+₱30</span>
            </label>
            <label class="addon-row">
                <input type="checkbox" class="addon-check" value="50" data-label="Add 1 Scoop Ice Cream"> 
                <span class="addon-name">Add 1 Scoop Ice Cream</span><span class="addon-price">+₱50</span>
            </label>
        `;
    } 
    // Kapag Drinks (tulad ng Coke, Coffee)
        else if (cat.includes('drinks')) {
    addonsHTML = `
        <label class="addon-row">
            <input type="checkbox" class="addon-check" value="0" data-label="Extra Ice"> 
            <span class="addon-name">Extra Ice</span><span class="addon-price" style="color: var(--primary-orange);">Free</span>
        </label>
        <label class="addon-row">
            <input type="checkbox" class="addon-check" value="30" data-label="Upsize to Large"> 
            <span class="addon-name">Upsize to Large</span><span class="addon-price">+₱30</span>
        </label>
    `;
}
    // Fallback kung sakaling walang tamang category
    else {
        addonsHTML = `<p style="font-size: 14px; color: var(--text-light); text-align: center;">No add-ons available for this item.</p>`;
    }

    // Ipasok ang na-generate na HTML sa container
    addonsContainer.innerHTML = addonsHTML;

    // I-re-attach yung event listener sa mga bagong checkboxes
    document.querySelectorAll('.addon-check').forEach(c => {
        c.addEventListener('change', updateAddonsTotal);
    });

    // Update Modal Details
    document.getElementById('addonsModalImg').src = imgSrc;
    document.getElementById('addonsModalName').textContent = name;
    document.getElementById('addonsModalPrice').textContent = '₱' + price.toFixed(2);
    document.getElementById('addonsQty').textContent = '1';

    // Update logic and display
    updateAddonsTotal();
    document.getElementById('addonsModal').style.display = 'flex';
    lucide.createIcons();
}

function closeAddonsModal() {
    document.getElementById('addonsModal').style.display = 'none';
}

function changeAddonQty(delta) {
    const el = document.getElementById('addonsQty');
    let q = parseInt(el.textContent) + delta;
    if (q < 1) q = 1;
    if (q > 99) q = 99;
    el.textContent = q;
    updateAddonsTotal();
}

function updateAddonsTotal() {
    const qty = parseInt(document.getElementById('addonsQty').textContent);
    let addonsTotal = 0;
    document.querySelectorAll('.addon-check:checked').forEach(c => addonsTotal += parseFloat(c.value));
    const total = (_addons_item.price + addonsTotal) * qty;
    document.getElementById('addonsConfirmLabel').textContent = `Add to Cart — ₱${total.toFixed(2)}`;
}

document.querySelectorAll('.addon-check').forEach(c => c.addEventListener('change', updateAddonsTotal));

function confirmAddons() {
    const qty = parseInt(document.getElementById('addonsQty').textContent);
    let addonsTotal = 0;
    let addonLabels = [];
    document.querySelectorAll('.addon-check:checked').forEach(c => {
        addonsTotal += parseFloat(c.value);
        addonLabels.push(c.dataset.label);
    });
    const finalPrice = _addons_item.price + addonsTotal;
    addOrder(_addons_item.name, _addons_item.category, finalPrice, qty, _addons_item.prepTime, _addons_item.rating, addonLabels);
    closeAddonsModal();
}

// ── Notifications (bell) ─────────────────────────────────────────────

// 1. Gawing dynamic at naka-connect sa localStorage ang notifications
let _notifications = JSON.parse(localStorage.getItem('munch_notifs')) || [
    { id: 1, icon: 'party-popper', color: '#27AE60', bg: '#EAFAF1', title: 'Welcome to munch.!', body: 'Check out our promos and start ordering!', time: 'Just now', read: false }
];

function saveNotifs() {
    localStorage.setItem('munch_notifs', JSON.stringify(_notifications));
}

// 2. Function para mag-add ng bagong notification nang madali
function addNotification(title, body, icon = 'bell', color = '#FF6B35', bg = '#FFF4E5') {
    const newNotif = {
        id: Date.now(),
        icon: icon,
        color: color,
        bg: bg,
        title: title,
        body: body,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        read: false
    };
    
    _notifications.unshift(newNotif); // Ilagay sa pinakataas
    if (_notifications.length > 15) _notifications.pop(); // Limitahan sa 15 notifs lang para iwas lag
    
    saveNotifs();
    updateNotifBadge();
    
    // I-update agad ang list kung nakabukas ang panel
    const panel = document.getElementById('notifPanel');
    if (panel && window.getComputedStyle(panel).display === 'block') {
        renderNotifs();
    }
}

// Helper function para i-check at i-update yung red dot badge
function updateNotifBadge() {
    const unreadCount = _notifications.filter(n => !n.read).length;
    const badge = document.getElementById('notifBadge');
    if (badge) {
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }
}

function toggleNotifPanel() {
    const panel = document.getElementById('notifPanel');
    if (!panel) return;

    const isHidden = window.getComputedStyle(panel).display === 'none';
    
    if (isHidden) {
        panel.style.display = 'block';
        renderNotifs();
        
        // Mark as read pagkatapos ng 1.5 seconds at i-update ang UI
        setTimeout(() => {
            _notifications.forEach(n => n.read = true);
            saveNotifs(); // I-save sa localStorage na nabasa na lahat
            updateNotifBadge();
            renderNotifs(); 
        }, 1500);
    } else {
        panel.style.display = 'none';
    }
}

function renderNotifs() {
    const list = document.getElementById('notifList');
    if (!list) return;
    
    if (_notifications.length === 0) {
        list.innerHTML = `<div style="padding: 20px; text-align: center; color: #999; font-size: 13px;">No notifications yet.</div>`;
        return;
    }

    list.innerHTML = _notifications.map(n => `
        <div style="display:flex;gap:12px;padding:14px 18px;border-bottom:1px solid #F5F5F5;background:${n.read ? 'white' : '#FFFAF7'};transition:0.2s;cursor:pointer;" onmouseenter="this.style.background='#FFF4E5'" onmouseleave="this.style.background='${n.read ? 'white' : '#FFFAF7'}'">
            <div style="width:38px;height:38px;border-radius:12px;background:${n.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i data-lucide="${n.icon}" style="width:18px;color:${n.color};"></i>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
                    <span style="font-size:13px;font-weight:700;color:var(--text-dark);">${n.title}</span>
                    ${!n.read ? '<span style="width:8px;height:8px;background:var(--primary-orange);border-radius:50%;flex-shrink:0;"></span>' : ''}
                </div>
                <p style="font-size:12px;color:var(--text-light);margin:0 0 4px;line-height:1.4;">${n.body}</p>
                <span style="font-size:11px;color:#CCC;font-weight:500;">${n.time}</span>
            </div>
        </div>
    `).join('');
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Close notif panel kapag pumindot sa labas
document.addEventListener('click', function(e) {
    const panel = document.getElementById('notifPanel');
    const bell = document.getElementById('notifBell');
    if (panel && bell && !panel.contains(e.target) && !bell.contains(e.target)) {
        panel.style.display = 'none';
    }
});

// 3. GLOBAL REAL-TIME ORDER MONITOR (Ito ang magic sa lahat ng pages)
function monitorOrderNotifications() {
    const activeOrderJson = localStorage.getItem('munch_active_order');
    if (!activeOrderJson) return; // Kung walang order, wag na mag-check

    let order = JSON.parse(activeOrderJson);
    const orderTimestamp = new Date(order.date).getTime();
    const elapsedSecs = Math.floor((Date.now() - orderTimestamp) / 1000);

    // I-track kung saang stage na tayo nag-notify para hindi mag-spam
    if (typeof order.notifiedStage === 'undefined') order.notifiedStage = 0;

    let currentStage = 0;
    if (elapsedSecs >= 45) currentStage = 4; // Arrived
    else if (elapsedSecs >= 30) currentStage = 3; // Out for Delivery
    else if (elapsedSecs >= 15) currentStage = 2; // Preparing
    else currentStage = 1; // Placed

    // Kapag may bagong stage na narating, mag-push ng notification
    if (currentStage > order.notifiedStage) {
        
        if (currentStage === 1 && order.notifiedStage < 1) {
            addNotification('Order Received!', `We got your order ${order.orderId}.`, 'clipboard-check', '#FF6B35', '#FFF4E5');
        }
        if (currentStage === 2 && order.notifiedStage < 2) {
            addNotification('Cooking Magic!', `The kitchen is now preparing your meal.`, 'chef-hat', '#F39C12', '#FEF9E7');
        }
        if (currentStage === 3 && order.notifiedStage < 3) {
            addNotification('Out for Delivery!', `Rider is on the way with your food. Get ready!`, 'bike', '#3498DB', '#EBF5FB');
        }
        if (currentStage === 4 && order.notifiedStage < 4) {
            addNotification('Order Arrived!', `Your food is here. Enjoy your munch!`, 'package', '#27AE60', '#EAFAF1');
            
            // Auto-trigger din yung browser toast alert
            if (typeof showToast === 'function') {
                showToast(`Your order ${order.orderId} has arrived!`, "success");
            }
        }

        // I-save na na-notify na natin ang stage na 'to para hindi umulit
        order.notifiedStage = currentStage;
        localStorage.setItem('munch_active_order', JSON.stringify(order));
    }
}


// Siguruhing accessible globally ang mga functions
window.toggleDropdown = toggleDropdown;
window.selectCurrency = selectCurrency;
window.toggleNotifPanel = toggleNotifPanel;
window.addNotification = addNotification;

// --- INITIALIZATION ON PAGE LOAD ---
document.addEventListener('DOMContentLoaded', () => {
    renderCouponDropdown();
    renderTable();
    updateStats();
    updateAllVisiblePrices(); 
    if (typeof renderPromos === 'function') renderPromos();
    
    // I-check agad kung may unread notifications pagkakasimula
    updateNotifBadge();
    
    // I-run yung monitor every 2 seconds para real-time sa lahat ng pages!
    setInterval(monitorOrderNotifications, 2000);
});

// ==========================================
// BUG FIXES: DROPDOWN & NOTIF CLICK ISSUES
// ==========================================

// 1. Inayos ang Notification Toggle
window.toggleNotifPanel = function(event) {
    // Pigilan ang click na umabot sa document
    const e = event || window.event;
    if (e) e.stopPropagation(); 

    const panel = document.getElementById('notifPanel');
    if (!panel) return;

    const isHidden = window.getComputedStyle(panel).display === 'none';
    
    if (isHidden) {
        panel.style.display = 'block';
        if (typeof renderNotifs === 'function') renderNotifs();
        
        setTimeout(() => {
            if (typeof _notifications !== 'undefined') {
                _notifications.forEach(n => n.read = true);
                if (typeof saveNotifs === 'function') saveNotifs();
                if (typeof updateNotifBadge === 'function') updateNotifBadge();
                renderNotifs(); 
            }
        }, 1500);
    } else {
        panel.style.display = 'none';
    }
};

// 2. Inayos ang Currency Dropdown Toggle
window.toggleDropdown = function(event) {
    // Pigilan din ang click dito
    const e = event || window.event;
    if (e) e.stopPropagation();
    
    const options = document.getElementById('currencyOptions');
    if (options) {
        options.classList.toggle('show');
    }
};

// 3. Pinagsama sa iisang Global Click Listener para malinis
document.addEventListener('click', function(e) {
    // Check para sa Notification Panel
    const notifPanel = document.getElementById('notifPanel');
    const notifBell = document.getElementById('notifBell');
    if (notifPanel && notifPanel.style.display === 'block') {
        if (!notifPanel.contains(e.target) && (!notifBell || !notifBell.contains(e.target))) {
            notifPanel.style.display = 'none';
        }
    }

    // Check para sa Currency Dropdown
    const currOptions = document.getElementById('currencyOptions');
    const currDropdown = document.querySelector('.custom-currency-dropdown');
    if (currOptions && currOptions.classList.contains('show')) {
        if (!currDropdown || !currDropdown.contains(e.target)) {
            currOptions.classList.remove('show');
        }
    }
});
// ==========================================
// DYNAMIC DELIVERY & CROSS-TAB SYNC
// ==========================================
const DYNAMIC_FEES = {
    PHP: 50.00,
    USD: 2.00,
    EUR: 2.00,
    GBP: 1.50,
    JPY: 300,
    KRW: 2500
};

function getDynamicDeliveryFee() {
    return DYNAMIC_FEES[currentCurrency] !== undefined ? DYNAMIC_FEES[currentCurrency] : 50.00;
}

// Update renderCheckoutTotals to use the dynamic fee
const originalRenderTotals = renderCheckoutTotals;
renderCheckoutTotals = function() {
    originalRenderTotals();
    const subtotal = orders.reduce((sum, item) => sum + item.subtotal, 0);
    let deliveryFee = (subtotal >= 1000 || activeCouponId === 'FREESHIP') ? 0 : getDynamicDeliveryFee();
    
    // Recalculate and update the UI with the dynamic fee
    const discountAmount = activeDiscountType === 'flat' ? Math.min(activeDiscount, subtotal) : subtotal * (activeDiscount / 100);
    const finalTotal = (subtotal - discountAmount) + deliveryFee;
    
    document.getElementById('summaryTotal').textContent = formatPrice(finalTotal);
};

// Sync cart across multiple tabs instantly
window.addEventListener('storage', (e) => {
    if (e.key === 'foodhub_orders') {
        orders = JSON.parse(e.newValue) || [];
        renderTable();
        updateStats();
    }
});

// ==========================================
// REORDER FEATURE
// ==========================================
window.reorderPastMeal = function(orderId) {
    const historyData = JSON.parse(localStorage.getItem('munch_order_history')) || [];
    const pastOrder = historyData.find(o => o.orderId === orderId);
    
    if (pastOrder && pastOrder.items) {
        pastOrder.items.forEach(item => {
            // Push items back to cart
            addOrder(item.foodName, item.category, item.price, item.quantity, item.deliveryTime, item.rating);
        });
        showToast("Order items added to your cart!", "success");
        
        // Redirect to order page after 1 second
        setTimeout(() => {
            window.location.href = 'order.html';
        }, 1000);
    }
};