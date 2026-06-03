document.addEventListener('DOMContentLoaded', () => {
  // Override global fetch to automatically inject Authorization token
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    if (url.includes('/api/') && !url.includes('/api/auth/login')) {
      const token = localStorage.getItem('auth_token');
      if (token) {
        options.headers = options.headers || {};
        if (options.headers instanceof Headers) {
          options.headers.set('Authorization', `Bearer ${token}`);
        } else {
          options.headers['Authorization'] = `Bearer ${token}`;
        }
      }
    }
    return originalFetch(url, options).then(async (response) => {
      if ((response.status === 401 || response.status === 403) && !url.includes('/api/auth/login')) {
        localStorage.removeItem('auth_token');
        showToast("Session expired. Please log in again.", "warning");
        showLoginScreen();
      }
      return response;
    });
  };

  const showLoginScreen = () => {
    document.getElementById('login-overlay').classList.remove('hidden');
    document.getElementById('login-username').value = "";
    document.getElementById('login-password').value = "";
    document.getElementById('login-error').classList.add('hidden');
  };

  const hideLoginScreen = () => {
    document.getElementById('login-overlay').classList.add('hidden');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const errorTextEl = document.getElementById('login-error-text');

    errorEl.classList.add('hidden');

    try {
      const res = await originalFetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('auth_token', data.token);
        hideLoginScreen();
        showToast("Welcome! Login successful.", "success");
        await initApp();
      } else {
        errorTextEl.textContent = data.error || "Invalid username or password.";
        errorEl.classList.remove('hidden');
      }
    } catch (err) {
      errorTextEl.textContent = "Server connection error.";
      errorEl.classList.remove('hidden');
    }
  };

  const handleLogout = () => {
    if (confirm("Are you sure you want to logout?")) {
      localStorage.removeItem('auth_token');
      showToast("Logged out successfully.", "info");
      showLoginScreen();
    }
  };

  // ==========================================
  // STATE VARIABLES
  // ==========================================
  let products = [];
  let customers = [];
  let suppliers = [];
  let sales = [];
  let purchases = [];
  let activeTab = 'panel-dashboard';
  let cart = [];             // Customer POS Cart
  let purchaseCart = [];     // Wholesale Purchase Cart
  let salesChart = null;
  let activeLedgerCustomer = null;
  let activeLedgerSupplier = null;
  let currentSettings = {};

  // Server API Host (runs on same local port)
  const API_URL = ''; 

  // ==========================================
  // CORE INITIALIZATION
  // ==========================================
  const initApp = async () => {
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // Initial API loads
    await fetchSettings();
    await fetchProducts();
    await fetchCustomers();
    await fetchSuppliers();
    await fetchDashboardStats();

    setupEventListeners();
    setupRouting();
    detectBrowser();
  };

  const updateDateTime = () => {
    const timeEl = document.getElementById('current-date-time');
    if (timeEl) {
      const now = new Date();
      timeEl.innerHTML = `<i class="fa-regular fa-clock"></i> ${now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} | ${now.toLocaleTimeString('en-IN')}`;
    }
  };

  const detectBrowser = () => {
    const userAgent = navigator.userAgent;
    let browserName = "Chrome / Edge";
    if (userAgent.indexOf("Firefox") > -1) {
      browserName = "Mozilla Firefox";
    } else if (userAgent.indexOf("Safari") > -1 && userAgent.indexOf("Chrome") === -1) {
      browserName = "Apple Safari";
    }
    const el = document.getElementById('browser-agent');
    if (el) el.textContent = browserName;
  };

  // ==========================================
  // ROUTING & NAVIGATION
  // ==========================================
  const setupRouting = () => {
    const navItems = document.querySelectorAll('.nav-item');
    const panels = document.querySelectorAll('.workspace-panel');

    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const target = item.getAttribute('data-target');
        
        // Update navigation classes
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // Toggle Workspace Panel
        panels.forEach(p => {
          if (p.id === target) {
            p.classList.add('active');
          } else {
            p.classList.remove('active');
          }
        });

        activeTab = target;

        // Perform contextual refreshes when visiting tabs
        if (target === 'panel-dashboard') {
          fetchDashboardStats();
        } else if (target === 'panel-pos') {
          renderCatalog();
          populateCustomerDropdown();
        } else if (target === 'panel-inventory') {
          renderInventoryTable();
        } else if (target === 'panel-purchases') {
          loadPurchaseEntryPanel();
        } else if (target === 'panel-khata') {
          renderCustomersGrid();
        } else if (target === 'panel-supplier-khata') {
          renderSuppliersGrid();
        } else if (target === 'panel-settings') {
          loadSettingsForm();
          updateSystemDetails();
        }
      });
    });

    // Dashboard quick link
    document.getElementById('btn-view-all-sales').addEventListener('click', () => {
      const posLink = document.querySelector('[data-target="panel-pos"]');
      if (posLink) posLink.click();
    });
  };

  // ==========================================
  // FETCH API OPERATIONS
  // ==========================================
  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/settings`);
      currentSettings = await res.json();
      
      // Update global UI brand headings
      document.getElementById('inv-shop-name').textContent = currentSettings.shopName.toUpperCase();
      document.getElementById('inv-shop-address').textContent = currentSettings.address;
      document.getElementById('inv-shop-phone').textContent = `Phone: ${currentSettings.phone}`;
      document.getElementById('inv-shop-gstin').textContent = `GSTIN: ${currentSettings.gstin}`;
      document.getElementById('operator-name').textContent = "Admin Operator";
    } catch (e) {
      showToast("Error loading shop settings from server.", "error");
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/products`);
      products = await res.json();
      renderCatalog();
      renderInventoryTable();
    } catch (e) {
      showToast("Error fetching products inventory.", "error");
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/customers`);
      customers = await res.json();
      renderCustomersGrid();
      populateCustomerDropdown();

      // Auto-refresh detail ledger view if open
      if (activeLedgerCustomer) {
        const updated = customers.find(c => c.id === activeLedgerCustomer.id);
        if (updated) {
          activeLedgerCustomer = updated;
          document.getElementById('ledger-outstanding-val').textContent = `₹${updated.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
          document.getElementById('ledger-limit-val').textContent = `₹${updated.creditLimit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
          const usePercent = Math.min(100, Math.round((updated.balance / updated.creditLimit) * 100)) || 0;
          const progress = document.getElementById('ledger-progress-bar');
          if (progress) {
            progress.className = "progress-bar";
            if (usePercent >= 90) progress.classList.add('danger');
            else if (usePercent >= 70) progress.classList.add('warning');
            progress.style.width = `${usePercent}%`;
          }
          const usageText = document.getElementById('ledger-usage-percent');
          if (usageText) usageText.textContent = `${usePercent}% Credit Used`;
          
          await renderLedgerTransactions(updated);
        }
      }
    } catch (e) {
      showToast("Error loading customers ledger list.", "error");
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/suppliers`);
      suppliers = await res.json();
      renderSuppliersGrid();
      loadPurchaseEntryPanel();

      // Auto-refresh detail ledger view if open
      if (activeLedgerSupplier) {
        const updated = suppliers.find(s => s.id === activeLedgerSupplier.id);
        if (updated) {
          activeLedgerSupplier = updated;
          document.getElementById('sup-ledger-outstanding-val').textContent = `₹${updated.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
          await renderSupplierLedgerTransactions(updated);
        }
      }
    } catch (e) {
      showToast("Error loading suppliers wholesalers.", "error");
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      const stats = await res.json();

      // Update KPI text values
      document.getElementById('kpi-today-sales').textContent = `₹${stats.todaySales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      document.getElementById('kpi-total-revenue').textContent = `₹${stats.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      document.getElementById('kpi-outstanding-khata').textContent = `₹${stats.totalOutstandingCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      document.getElementById('kpi-outstanding-supplier').textContent = `₹${stats.totalOutstandingSupplierCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      
      const lowStockEl = document.getElementById('kpi-low-stock');
      lowStockEl.textContent = stats.lowStockCount;
      const lowStockCard = document.getElementById('kpi-low-stock-card');
      if (stats.lowStockCount > 0) {
        lowStockCard.classList.add('glow-red');
      } else {
        lowStockCard.classList.remove('glow-red');
      }

      // Render Dashboard Sub-feeds
      renderDashboardRecentSales(stats.recentTransactions);
      renderDashboardRecentPurchases(stats.recentPurchases);
      renderDashboardLowStockAlerts(products);

      // Render Analytics Trend Line Chart
      renderChart(stats.salesChart.labels, stats.salesChart.data);
    } catch (e) {
      showToast("Failed to load dashboard analytics.", "error");
    }
  };

  // ==========================================
  // DASHBOARD RENDER FEED HELPERS
  // ==========================================
  const renderDashboardRecentSales = (recentTx) => {
    const container = document.getElementById('dashboard-recent-sales');
    if (!container) return;

    if (!recentTx || recentTx.length === 0) {
      container.innerHTML = `<div class="empty-state">No recent sales transactions recorded.</div>`;
      return;
    }

    container.innerHTML = recentTx.map(tx => {
      const iconClass = tx.paymentMethod === 'Cash' ? 'cash' : (tx.paymentMethod === 'UPI' ? 'upi' : 'khata');
      const icon = tx.paymentMethod === 'Cash' ? 'fa-money-bill-1' : (tx.paymentMethod === 'UPI' ? 'fa-qrcode' : 'fa-book');
      const dateStr = new Date(tx.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      return `
        <div class="transaction-item" onclick="window.reprintCustomerBillByNo('${tx.invoiceNo}')">
          <div class="tx-left">
            <div class="tx-badge ${iconClass}"><i class="fa-solid ${icon}"></i></div>
            <div class="tx-info">
              <span class="tx-inv">${tx.invoiceNo}</span>
              <span class="tx-cust">${tx.customerName}</span>
            </div>
          </div>
          <div class="tx-right">
            <span class="tx-amt text-${iconClass}">₹${tx.total.toLocaleString('en-IN')}</span>
            <span class="tx-time">${dateStr}</span>
          </div>
        </div>
      `;
    }).join('');
  };

  const renderDashboardRecentPurchases = (recentPur) => {
    const container = document.getElementById('dashboard-recent-purchases');
    if (!container) return;

    if (!recentPur || recentPur.length === 0) {
      container.innerHTML = `<div class="empty-state">No wholesale purchases logged.</div>`;
      return;
    }

    container.innerHTML = recentPur.map(pur => {
      const iconClass = "supplier";
      const icon = "fa-truck-moving";
      const dateStr = new Date(pur.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(pur.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      return `
        <div class="transaction-item" onclick="window.reprintSupplierPurchaseByNo('${pur.purchaseNo}')">
          <div class="tx-left">
            <div class="tx-badge ${iconClass}"><i class="fa-solid ${icon}"></i></div>
            <div class="tx-info">
              <span class="tx-inv">${pur.purchaseNo}</span>
              <span class="tx-cust">${pur.supplierName}</span>
            </div>
          </div>
          <div class="tx-right">
            <span class="tx-amt text-${iconClass}">₹${pur.total.toLocaleString('en-IN')}</span>
            <span class="tx-time">${dateStr}</span>
          </div>
        </div>
      `;
    }).join('');
  };

  const renderDashboardLowStockAlerts = (allProds) => {
    const container = document.getElementById('dashboard-low-stock-list');
    if (!container) return;

    const lowStock = allProds.filter(p => p.stock <= p.minStock);

    if (lowStock.length === 0) {
      container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-check text-green"></i> Material stocks are balanced.</div>`;
      return;
    }

    container.innerHTML = lowStock.map(p => `
      <div class="stock-alert-item">
        <div class="alert-details">
          <span class="alert-name">${p.name}</span>
          <span class="alert-stock">Stock: <strong>${p.stock} ${p.unit}</strong> (Min Limit: ${p.minStock})</span>
        </div>
        <span class="alert-badge">${p.stock <= 0 ? 'OUT' : 'LOW'}</span>
      </div>
    `).join('');
  };

  const renderChart = (labels, dataValues) => {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;

    if (salesChart) {
      salesChart.destroy();
    }

    salesChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Customer Retail Sales (₹)',
          data: dataValues,
          borderColor: '#00f2fe',
          backgroundColor: 'rgba(0, 242, 254, 0.15)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          pointBackgroundColor: '#4facfe',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(18, 24, 38, 0.9)',
            titleColor: '#00f2fe',
            bodyColor: '#ffffff',
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            displayColors: false,
            callbacks: {
              label: function(context) {
                return `Sales: ₹${context.parsed.y.toLocaleString('en-IN')}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#9ca3af',
              font: { family: 'Outfit' },
              callback: function(value) {
                return '₹' + value.toLocaleString('en-IN');
              }
            }
          }
        }
      }
    });
  };

  // ==========================================
  // 2. POS BILLING FLOW
  // ==========================================
  const renderCatalog = () => {
    const grid = document.getElementById('catalog-products-grid');
    if (!grid) return;

    const query = document.getElementById('catalog-search').value.toLowerCase();
    const activeTabCat = document.querySelector('.category-tab.active').getAttribute('data-category');

    const filtered = products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(query) || p.barcode.includes(query) || p.category.toLowerCase().includes(query);
      const matchCat = activeTabCat === 'all' || p.category.toLowerCase() === activeTabCat.toLowerCase();
      return matchSearch && matchCat;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state span-2" style="grid-column: 1 / -1; padding: 40px;"><i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom:10px;"></i><br>No matching building materials in catalog.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const isLow = p.stock <= p.minStock;
      const isOut = p.stock <= 0;
      let stockText = `${p.stock} ${p.unit} Left`;
      let stockClass = "in-stock";
      
      if (isOut) {
        stockText = "Out of Stock";
        stockClass = "out-of-stock";
      } else if (isLow) {
        stockText = `Low Stock (${p.stock} ${p.unit})`;
        stockClass = "low-stock";
      }

      return `
        <div class="catalog-card glass-panel" data-id="${p.id}">
          <div class="cat-card-header">
            <span class="cat-badge">${p.category}</span>
            <span class="cat-stock ${stockClass}">${stockText}</span>
          </div>
          <h3 class="cat-name">${p.name}</h3>
          <div class="cat-card-footer">
            <span class="cat-price">₹${p.sellPrice.toLocaleString('en-IN')}</span>
            <button class="cat-add-btn" ${isOut ? 'disabled' : ''}><i class="fa-solid fa-plus"></i></button>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.catalog-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const id = parseInt(card.getAttribute('data-id'));
        const product = products.find(p => p.id === id);
        
        if (product.stock <= 0) {
          showToast("Material is Out of Stock!", "error");
          return;
        }

        addToCart(product);
      });
    });
  };

  window.switchTab = (targetId) => {
    const navItem = document.querySelector(`.nav-item[data-target="${targetId}"]`);
    if (navItem) {
      navItem.click();
    }
  };

  const addToCart = (product) => {
    const existing = cart.find(item => item.productId === product.id);
    if (existing) {
      if (existing.qty + 1 > product.stock) {
        showToast(`Stock limit reached! Only ${product.stock} ${product.unit} available.`, "warning");
        return;
      }
      existing.qty++;
    } else {
      cart.push({
        productId: product.id,
        name: product.name,
        price: product.sellPrice,
        qty: 1,
        unit: product.unit,
        gstRate: product.gstRate
      });
    }
    showToast(`${product.name} added`, "success");
    updateCartUI();
  };

  const updateCartUI = () => {
    const list = document.getElementById('cart-items-list');
    if (!list) return;

    if (cart.length === 0) {
      list.innerHTML = `
        <div class="cart-empty-state">
            <i class="fa-solid fa-basket-shopping"></i>
            <p>Customer cart is Empty</p>
            <span>Click products on the left to add materials</span>
        </div>
      `;
      document.getElementById('cart-subtotal').textContent = "₹0.00";
      document.getElementById('cart-gst').textContent = "₹0.00";
      document.getElementById('cart-total').textContent = "₹0.00";
      return;
    }

    const billTypeOpt = document.querySelector('input[name="cart-bill-type"]:checked');
    const billType = billTypeOpt ? billTypeOpt.value : "GST";

    list.innerHTML = cart.map(item => {
      const itemTotal = item.qty * item.price;
      const rate = billType === "Non-GST" ? 0 : item.gstRate;
      return `
        <div class="cart-item">
          <div class="cart-item-details">
            <span class="cart-item-name">${item.name}</span>
            <span class="cart-item-gst">${item.qty} ${item.unit} x ₹${item.price} (GST ${rate}%)</span>
            <span class="cart-item-price">₹${itemTotal.toLocaleString('en-IN')}</span>
          </div>
          <div class="cart-item-controls">
            <div class="qty-counter">
              <button class="qty-btn btn-qty-minus" data-id="${item.productId}"><i class="fa-solid fa-minus"></i></button>
              <input type="number" class="qty-input-box qty-val" data-id="${item.productId}" value="${item.qty}" min="0.01" step="any">
              <button class="qty-btn btn-qty-plus" data-id="${item.productId}"><i class="fa-solid fa-plus"></i></button>
            </div>
            <button class="btn-text" style="color: var(--hint-red); font-size: 0.75rem;" onclick="removeFromCart(${item.productId})"><i class="fa-solid fa-trash"></i> Remove</button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.btn-qty-minus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        adjustQty(parseInt(btn.getAttribute('data-id')), -1);
      });
    });

    list.querySelectorAll('.btn-qty-plus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        adjustQty(parseInt(btn.getAttribute('data-id')), 1);
      });
    });

    list.querySelectorAll('.qty-input-box').forEach(input => {
      input.addEventListener('change', (e) => {
        const productId = parseInt(input.getAttribute('data-id'));
        const newQty = parseFloat(input.value);
        if (isNaN(newQty) || newQty <= 0) {
          removeFromCart(productId);
        } else {
          updateCartItemQty(productId, newQty);
        }
      });
    });

    calculateCartTotals();
  };

  const adjustQty = (productId, change) => {
    const item = cart.find(i => i.productId === productId);
    const prod = products.find(p => p.id === productId);

    if (item) {
      if (item.qty + change <= 0) {
        removeFromCart(productId);
        return;
      }
      if (item.qty + change > prod.stock) {
        showToast(`Stock limit reached! Available stock is ${prod.stock} ${prod.unit}.`, "warning");
        return;
      }
      item.qty += change;
      updateCartUI();
    }
  };

  const updateCartItemQty = (productId, newQty) => {
    const item = cart.find(i => i.productId === productId);
    const prod = products.find(p => p.id === productId);

    if (item && prod) {
      if (newQty > prod.stock) {
        showToast(`Stock limit reached! Available stock is ${prod.stock} ${prod.unit}.`, "warning");
        updateCartUI();
        return;
      }
      item.qty = newQty;
      updateCartUI();
    }
  };

  window.removeFromCart = (productId) => {
    cart = cart.filter(i => i.productId !== productId);
    updateCartUI();
  };

  const calculateCartTotals = () => {
    let subtotalExclGst = 0;
    let totalGstAmount = 0;
    let netTotalInclGst = 0;

    const billTypeOpt = document.querySelector('input[name="cart-bill-type"]:checked');
    const billType = billTypeOpt ? billTypeOpt.value : "GST";

    cart.forEach(item => {
      const itemTotalInclGst = item.qty * item.price;
      const rate = billType === "Non-GST" ? 0 : item.gstRate;
      const taxableVal = itemTotalInclGst / (1 + (rate / 100));
      const itemGst = itemTotalInclGst - taxableVal;

      subtotalExclGst += taxableVal;
      totalGstAmount += itemGst;
      netTotalInclGst += itemTotalInclGst;
    });

    const discount = parseFloat(document.getElementById('cart-discount').value) || 0;
    const finalBillTotal = Math.max(0, netTotalInclGst - discount);

    document.getElementById('cart-subtotal').textContent = `₹${subtotalExclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('cart-gst').textContent = `₹${totalGstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('cart-total').textContent = `₹${finalBillTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const populateCustomerDropdown = () => {
    const select = document.getElementById('cart-customer-select');
    if (!select) return;

    select.innerHTML = '<option value="0">Cash Customer</option>';
    
    customers.forEach(cust => {
      select.innerHTML += `<option value="${cust.id}">${cust.name} (Receivable: ₹${cust.balance.toLocaleString('en-IN')})</option>`;
    });

    const khataLabel = document.getElementById('khata-payment-option-label');
    select.addEventListener('change', () => {
      const val = parseInt(select.value);
      const optKhata = document.querySelector('input[name="payment-method"][value="Khata"]');
      
      if (val === 0) {
        if (optKhata.checked) {
          document.querySelector('input[name="payment-method"][value="Cash"]').checked = true;
        }
        khataLabel.style.opacity = '0.3';
        khataLabel.style.pointerEvents = 'none';
      } else {
        khataLabel.style.opacity = '1';
        khataLabel.style.pointerEvents = 'auto';
      }
    });
    
    select.dispatchEvent(new Event('change'));
  };

  // ==========================================
  // CHECKOUT GATEWAYS & INVOICES
  // ==========================================
  const triggerCheckout = async () => {
    if (cart.length === 0) {
      showToast("Cannot checkout empty cart!", "error");
      return;
    }

    const customerSelect = document.getElementById('cart-customer-select');
    const customerId = parseInt(customerSelect.value);
    const selectedCustomer = customerId > 0 ? customers.find(c => c.id === customerId) : null;
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    const discount = parseFloat(document.getElementById('cart-discount').value) || 0;

    const billTypeOpt = document.querySelector('input[name="cart-bill-type"]:checked');
    const billType = billTypeOpt ? billTypeOpt.value : "GST";

    let subtotalExclGst = 0;
    let totalGstAmount = 0;
    let netTotalInclGst = 0;
    
    const checkoutItems = cart.map(item => {
      const itemTotalInclGst = item.qty * item.price;
      const rate = billType === "Non-GST" ? 0 : item.gstRate;
      const taxableVal = itemTotalInclGst / (1 + (rate / 100));
      const gstAmt = itemTotalInclGst - taxableVal;

      subtotalExclGst += taxableVal;
      totalGstAmount += gstAmt;
      netTotalInclGst += itemTotalInclGst;

      return {
        productId: item.productId,
        name: item.name,
        price: item.price,
        qty: item.qty,
        unit: item.unit,
        gstRate: rate,
        gstAmount: parseFloat(gstAmt.toFixed(2)),
        total: itemTotalInclGst
      };
    });

    const grandTotal = Math.max(0, netTotalInclGst - discount);

    if (paymentMethod === 'Khata') {
      if (customerId === 0) {
        showToast("Credit/Khata billing requires customer selection!", "warning");
        return;
      }
      if (selectedCustomer.balance + grandTotal > selectedCustomer.creditLimit) {
        showToast(`Credit limit exceeded! outstanding: ₹${selectedCustomer.balance}. Limit: ₹${selectedCustomer.creditLimit}.`, "error");
        return;
      }
    }

    const payload = {
      customerId,
      customerName: selectedCustomer ? selectedCustomer.name : "Cash Customer",
      items: checkoutItems,
      subtotal: parseFloat(subtotalExclGst.toFixed(2)),
      discount,
      gstTotal: parseFloat(totalGstAmount.toFixed(2)),
      total: grandTotal,
      paymentMethod,
      billType
    };

    if (paymentMethod === 'UPI') {
      launchUpiQrGateway(payload);
    } else {
      await postInvoiceCheckout(payload);
    }
  };

  const launchUpiQrGateway = (payload) => {
    const upiModal = document.getElementById('modal-upi-qr');
    const qrAmount = document.getElementById('qr-total-amount');
    const qrName = document.getElementById('qr-merchant-name');
    const qrId = document.getElementById('qr-merchant-id');
    const qrImage = document.getElementById('upi-qr-image');

    qrAmount.textContent = `₹${payload.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    qrName.textContent = currentSettings.shopName;
    qrId.textContent = currentSettings.upiId;

    const upiString = `upi://pay?pa=${currentSettings.upiId}&pn=${encodeURIComponent(currentSettings.shopName)}&am=${payload.total.toFixed(2)}&cu=INR&tn=ZTInvoice`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiString)}`;
    
    qrImage.src = qrUrl;
    upiModal.classList.remove('hidden');

    const confirmBtn = document.getElementById('btn-confirm-upi-paid');
    const cancelBtn = document.getElementById('btn-cancel-upi-paid');

    const cleanupListeners = () => {
      confirmBtn.removeEventListener('click', newConfirm);
      cancelBtn.removeEventListener('click', newCancel);
    };

    const newConfirm = async () => {
      upiModal.classList.add('hidden');
      cleanupListeners();
      await postInvoiceCheckout(payload);
    };

    const newCancel = () => {
      upiModal.classList.add('hidden');
      cleanupListeners();
      showToast("UPI Checkout cancelled.", "info");
    };

    confirmBtn.addEventListener('click', newConfirm);
    cancelBtn.addEventListener('click', newCancel);
  };

  const postInvoiceCheckout = async (payload) => {
    try {
      const res = await fetch(`${API_URL}/api/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.status === 201) {
        showToast(`Invoice ${data.invoiceNo} processed via ${payload.paymentMethod}!`, "success");
        cart = [];
        updateCartUI();
        
        await fetchProducts();
        await fetchCustomers();
        await fetchDashboardStats();

        launchPrintableInvoice(data);
      } else {
        showToast(data.error || "Checkout API failed.", "error");
      }
    } catch (e) {
      showToast("API connection error during customer checkout.", "error");
    }
  };

  const getHsnCode = (categoryOrName) => {
    const name = (categoryOrName || '').toLowerCase();
    if (name.includes('cement')) return '25232910';
    if (name.includes('steel') || name.includes('bar') || name.includes('tmt') || name.includes('iron')) return '72141090';
    if (name.includes('brick')) return '69010010';
    if (name.includes('sand') || name.includes('aggregate') || name.includes('ganga')) return '25051010';
    if (name.includes('paint') || name.includes('apex')) return '32089020';
    if (name.includes('plumb') || name.includes('pvc') || name.includes('pipe')) return '39174000';
    return '72141090';
  };

  const numberToWords = (num) => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty ', 'Thirty ', 'Forty ', 'Fifty ', 'Sixty ', 'Seventy ', 'Eighty ', 'Ninety '];

    if ((num = num.toString()).length > 9) return 'overflow';
    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + a[n[5][1]]) : '';
    return str.trim() ? str.trim() + ' Only' : 'Zero Only';
  };

  const convertNumberToWords = (amount) => {
    const parts = parseFloat(amount).toFixed(2).split('.');
    const rupees = parseInt(parts[0], 10);
    const paise = parseInt(parts[1], 10);
    
    let result = "Indian Rupees " + numberToWords(rupees);
    if (paise > 0) {
      result += " and " + numberToWords(paise).replace(" Only", "") + " Paise Only";
    }
    return result;
  };

  const launchPrintableInvoice = (invoice) => {
    const modal = document.getElementById('modal-invoice-receipt');
    
    // Bind Shop Details (Seller)
    document.getElementById('inv-shop-name').textContent = currentSettings.shopName.toUpperCase();
    document.getElementById('inv-shop-address').textContent = currentSettings.address;
    document.getElementById('inv-shop-phone').innerHTML = '<strong>Phone:</strong> ' + currentSettings.phone;
    document.getElementById('inv-shop-gstin').textContent = currentSettings.gstin || 'N/A';
    document.getElementById('inv-shop-pan').textContent = currentSettings.pan || 'AADPZ2438A';

    // Bind Bank Details
    document.getElementById('inv-bank-name').textContent = currentSettings.bankName || 'Canara Bank';
    document.getElementById('inv-bank-ac').textContent = currentSettings.bankAc || '3126261000023';
    document.getElementById('inv-bank-ifsc').textContent = currentSettings.bankIfsc || 'CNRB0003126';
    document.getElementById('inv-bank-upi').textContent = currentSettings.upiId || '9850355126@okaxis';

    // Bind Invoice Details
    document.getElementById('inv-no').textContent = invoice.invoiceNo;
    document.getElementById('inv-date').textContent = new Date(invoice.date).toLocaleDateString('en-IN');
    
    // Auto-generate e-way bill number and vehicle number for realistic prints
    document.getElementById('inv-eway-bill').textContent = Math.floor(100000000000 + Math.random() * 900000000000);
    document.getElementById('inv-vehicle-no').textContent = 'MH40N' + Math.floor(1000 + Math.random() * 9000);
    
    document.getElementById('inv-payment-method').textContent = invoice.paymentMethod + (invoice.paymentMethod === 'Khata' ? ' (NEXT DAY)' : '');

    // Bind Buyer Details
    document.getElementById('inv-customer-name').textContent = invoice.customerName;
    const customer = customers.find(c => c.id === invoice.customerId);
    if (customer && invoice.customerId > 0) {
      document.getElementById('inv-customer-phone').textContent = customer.phone || 'N/A';
      document.getElementById('inv-customer-address').textContent = customer.address || 'N/A';
      document.getElementById('inv-customer-gstin').textContent = customer.gstin || 'N/A';
    } else {
      document.getElementById('inv-customer-phone').textContent = 'N/A';
      document.getElementById('inv-customer-address').textContent = 'Umred, Nagpur';
      document.getElementById('inv-customer-gstin').textContent = 'N/A';
    }

    // Toggle Estimate vs Tax Invoice Title
    const originalTitle = modal.querySelector('.original-title');
    const taxSummaryBlock = modal.querySelector('.tax-summary-block');
    const shopGstinLabel = document.getElementById('inv-shop-gstin-label');
    const shopPanLabel = document.getElementById('inv-shop-pan-label');

    if (invoice.billType === "Non-GST") {
      originalTitle.textContent = "ESTIMATE BILL (NON-GST)";
      if (taxSummaryBlock) taxSummaryBlock.style.display = 'none';
      if (shopGstinLabel) shopGstinLabel.style.display = 'none';
      if (shopPanLabel) shopPanLabel.style.display = 'none';
    } else {
      originalTitle.textContent = "TAX INVOICE (ORIGINAL FOR RECIPIENT)";
      if (taxSummaryBlock) taxSummaryBlock.style.display = 'block';
      if (shopGstinLabel) shopGstinLabel.style.display = 'block';
      if (shopPanLabel) shopPanLabel.style.display = 'block';
    }
    
    // Bind Items table
    let totalQty = 0;
    let totalTaxableValue = 0;
    const tableBody = document.getElementById('invoice-items-body');

    tableBody.innerHTML = invoice.items.map((item, index) => {
      const rate = invoice.billType === "Non-GST" ? 0 : item.gstRate;
      const unitPriceExclTax = item.price / (1 + (rate / 100));
      const itemTaxableAmount = unitPriceExclTax * item.qty;
      
      totalQty += item.qty;
      totalTaxableValue += itemTaxableAmount;
      
      const hsn = getHsnCode(item.name);

      return `
        <tr>
          <td class="text-center">${index + 1}</td>
          <td>
            <strong>${item.name}</strong>
          </td>
          <td class="text-center">${hsn}</td>
          <td class="text-center">${rate}%</td>
          <td class="text-center">${item.qty} ${item.unit}</td>
          <td class="text-right">₹${item.price.toFixed(2)}</td>
          <td class="text-right">₹${unitPriceExclTax.toFixed(2)}</td>
          <td class="text-center">${item.unit}</td>
          <td class="text-right">₹${itemTaxableAmount.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    document.getElementById('inv-total-qty').innerHTML = `<strong>${totalQty.toFixed(3)}</strong>`;
    document.getElementById('inv-total-taxable').innerHTML = `<strong>₹${totalTaxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;
    document.getElementById('inv-amount-in-words').textContent = convertNumberToWords(invoice.total);

    // Bind Tax Summary Table
    const breakdownBody = document.getElementById('inv-gst-breakdown-body');
    const gstGroups = {};
    invoice.items.forEach(item => {
      const rate = invoice.billType === "Non-GST" ? 0 : item.gstRate;
      const hsn = getHsnCode(item.name);
      const key = `${hsn}_${rate}`;
      if (!gstGroups[key]) {
        gstGroups[key] = { hsn, rate, taxable: 0, gst: 0 };
      }
      const unitPriceExclTax = item.price / (1 + (rate / 100));
      const itemTaxableAmount = unitPriceExclTax * item.qty;
      gstGroups[key].taxable += itemTaxableAmount;
      gstGroups[key].gst += (item.total - itemTaxableAmount);
    });

    let grandTaxable = 0;
    let grandCgst = 0;
    let grandSgst = 0;
    let grandTotalTax = 0;

    breakdownBody.innerHTML = Object.values(gstGroups).map(g => {
      if (g.rate === 0) return '';
      const cgstAmt = g.gst / 2;
      const sgstAmt = g.gst / 2;
      const cgstRate = g.rate / 2;
      const sgstRate = g.rate / 2;
      
      grandTaxable += g.taxable;
      grandCgst += cgstAmt;
      grandSgst += sgstAmt;
      grandTotalTax += g.gst;

      return `
        <tr>
          <td class="text-center">${g.hsn}</td>
          <td class="text-right">₹${g.taxable.toFixed(2)}</td>
          <td class="text-center">${cgstRate}%</td>
          <td class="text-right">₹${cgstAmt.toFixed(2)}</td>
          <td class="text-center">${sgstRate}%</td>
          <td class="text-right">₹${sgstAmt.toFixed(2)}</td>
          <td class="text-right">₹${g.gst.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    const breakdownTotalRow = document.getElementById('inv-gst-breakdown-total-row');
    if (breakdownTotalRow) {
      breakdownTotalRow.innerHTML = `
        <td class="text-center"><strong>Total</strong></td>
        <td class="text-right"><strong>₹${grandTaxable.toFixed(2)}</strong></td>
        <td></td>
        <td class="text-right"><strong>₹${grandCgst.toFixed(2)}</strong></td>
        <td></td>
        <td class="text-right"><strong>₹${grandSgst.toFixed(2)}</strong></td>
        <td class="text-right"><strong>₹${grandTotalTax.toFixed(2)}</strong></td>
      `;
    }

    document.getElementById('inv-tax-in-words').textContent = convertNumberToWords(grandTotalTax);

    modal.classList.remove('hidden');
  };

  // ==========================================
  // 3. INVENTORY TABLE
  // ==========================================
  const renderInventoryTable = () => {
    const body = document.getElementById('inventory-table-body');
    if (!body) return;

    const query = document.getElementById('inventory-search').value.toLowerCase();
    const filterCat = document.getElementById('inventory-filter-category').value;

    const filtered = products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(query) || p.barcode.includes(query) || p.category.toLowerCase().includes(query);
      const matchCat = filterCat === 'all' || p.category.toLowerCase() === filterCat.toLowerCase();
      return matchSearch && matchCat;
    });

    if (filtered.length === 0) {
      body.innerHTML = `<tr><td colspan="10" class="empty-state" style="text-align:center; padding: 30px;">No products found in inventory.</td></tr>`;
      return;
    }

    body.innerHTML = filtered.map(p => {
      const isLow = p.stock <= p.minStock;
      const statusBadge = isLow 
        ? `<span class="status-tag ${p.stock <= 0 ? 'critical' : 'alert'}">${p.stock <= 0 ? 'OUT OF STOCK' : 'LOW STOCK'}</span>`
        : `<span class="status-tag active">OK</span>`;

      return `
        <tr class="${isLow ? 'low-stock-row' : ''}">
          <td>${p.id}</td>
          <td>
            <div style="font-weight:600;">${p.name}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${p.barcode ? '<i class="fa-solid fa-barcode"></i> ' + p.barcode : 'No Barcode'}</div>
          </td>
          <td>${p.category}</td>
          <td class="text-right">₹${p.buyPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td class="text-right">₹${p.sellPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td class="text-right" style="font-weight:700; color:${isLow ? 'var(--hint-red)' : 'inherit'}">${p.stock}</td>
          <td>${p.unit}</td>
          <td>${p.gstRate}%</td>
          <td>${statusBadge}</td>
          <td>
            <div class="td-actions">
              <button class="btn-table edit" title="Edit Product" onclick="openProductEdit(${p.id})"><i class="fa-solid fa-pencil"></i></button>
              <button class="btn-table delete" title="Delete Product" onclick="deleteProduct(${p.id})"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  };

  window.openProductEdit = (id) => {
    const p = products.find(prod => prod.id === id);
    if (!p) return;

    document.getElementById('product-modal-title').textContent = "Edit Material Specifications";
    document.getElementById('product-id').value = p.id;
    document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-barcode').value = p.barcode;
    document.getElementById('prod-category').value = p.category;
    document.getElementById('prod-unit').value = p.unit;
    document.getElementById('prod-buy-price').value = p.buyPrice;
    document.getElementById('prod-sell-price').value = p.sellPrice;
    document.getElementById('prod-stock').value = p.stock;
    document.getElementById('prod-min-stock').value = p.minStock;
    document.getElementById('prod-gst').value = p.gstRate;

    document.getElementById('modal-product').classList.remove('hidden');
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    
    const name = document.getElementById('prod-name').value.trim();
    if (!name) {
      showToast("Material name is required.", "warning");
      return;
    }

    const sellPrice = parseFloat(document.getElementById('prod-sell-price').value);
    if (isNaN(sellPrice) || sellPrice < 0) {
      showToast("Selling price must be a valid non-negative number.", "warning");
      return;
    }

    const buyPrice = parseFloat(document.getElementById('prod-buy-price').value) || 0;
    if (buyPrice < 0) {
      showToast("Buy price must be a non-negative number.", "warning");
      return;
    }

    const stock = parseFloat(document.getElementById('prod-stock').value) || 0;
    if (stock < 0) {
      showToast("Stock must be a non-negative number.", "warning");
      return;
    }

    const minStock = parseFloat(document.getElementById('prod-min-stock').value) || 0;
    if (minStock < 0) {
      showToast("Minimum stock must be a non-negative number.", "warning");
      return;
    }

    const gstRate = parseInt(document.getElementById('prod-gst').value) || 0;
    if (gstRate < 0) {
      showToast("GST rate must be a non-negative integer.", "warning");
      return;
    }

    const payload = {
      name,
      barcode: document.getElementById('prod-barcode').value,
      category: document.getElementById('prod-category').value,
      unit: document.getElementById('prod-unit').value,
      buyPrice,
      sellPrice,
      stock,
      minStock,
      gstRate
    };

    const isEdit = id !== "";
    const endpoint = isEdit ? `/api/products/${id}` : '/api/products';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast("Material profile successfully saved.", "success");
        document.getElementById('modal-product').classList.add('hidden');
        await fetchProducts();
        renderInventoryTable();
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "Failed to save product details.", "error");
      }
    } catch (err) {
      showToast("Server error during product save.", "error");
    }
  };

  window.deleteProduct = async (id) => {
    if (!confirm("Are you sure you want to permanently delete this material?")) return;

    try {
      const res = await fetch(`${API_URL}/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast("Material deleted successfully", "success");
        await fetchProducts();
        renderInventoryTable();
      } else {
        showToast("Failed to delete product.", "error");
      }
    } catch (e) {
      showToast("Server API connection error.", "error");
    }
  };

  // ==========================================
  // 4. WHOLESALE PURCHASE ENTRY (NEW)
  // ==========================================
  const loadPurchaseEntryPanel = () => {
    const select = document.getElementById('purchase-product-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose Material --</option>';
    products.forEach(p => {
      select.innerHTML += `<option value="${p.id}">${p.name} (In stock: ${p.stock} ${p.unit})</option>`;
    });

    // Populate suppliers dropdown
    const supSelect = document.getElementById('purchase-supplier-select');
    supSelect.innerHTML = '<option value="0">Local Cash Supplier</option>';
    suppliers.forEach(s => {
      supSelect.innerHTML += `<option value="${s.id}">${s.name} (Debt: ₹${s.balance.toLocaleString('en-IN')})</option>`;
    });

    // Auto-update units when product is chosen
    select.addEventListener('change', () => {
      const val = parseInt(select.value);
      const unitInput = document.getElementById('purchase-item-unit');
      const rateInput = document.getElementById('purchase-item-rate');
      const gstInput = document.getElementById('purchase-item-gst');

      if (val > 0) {
        const prod = products.find(p => p.id === val);
        unitInput.value = prod.unit;
        rateInput.value = prod.buyPrice; // Wholesale default buyPrice
        gstInput.value = `${prod.gstRate}%`;
      } else {
        unitInput.value = "";
        rateInput.value = "";
        gstInput.value = "";
      }
    });

    const supCreditLabel = document.getElementById('supplier-credit-option-label');
    supSelect.addEventListener('change', () => {
      const val = parseInt(supSelect.value);
      const optCredit = document.querySelector('input[name="purchase-payment-method"][value="Credit"]');
      
      if (val === 0) {
        if (optCredit.checked) {
          document.querySelector('input[name="purchase-payment-method"][value="Cash"]').checked = true;
        }
        supCreditLabel.style.opacity = '0.3';
        supCreditLabel.style.pointerEvents = 'none';
      } else {
        supCreditLabel.style.opacity = '1';
        supCreditLabel.style.pointerEvents = 'auto';
      }
    });

    supSelect.dispatchEvent(new Event('change'));
    updatePurchaseCartUI();
  };

  const handlePurchaseItemAddSubmit = (e) => {
    e.preventDefault();
    const select = document.getElementById('purchase-product-select');
    const productId = parseInt(select.value);
    const qty = parseFloat(document.getElementById('purchase-item-qty').value);
    const buyRate = parseFloat(document.getElementById('purchase-item-rate').value);

    if (!productId || isNaN(qty) || qty <= 0 || isNaN(buyRate) || buyRate < 0) {
      showToast("Please enter valid wholesale parameters.", "warning");
      return;
    }

    const prod = products.find(p => p.id === productId);
    if (!prod) {
      showToast("Selected material not found.", "error");
      return;
    }
    
    // Add to Purchase Cart (B2B wholesale items calculations are exclusive of GST)
    const existing = purchaseCart.find(item => item.productId === productId);
    if (existing) {
      existing.qty += qty;
      existing.price = buyRate; // Update to latest rate
    } else {
      purchaseCart.push({
        productId: prod.id,
        name: prod.name,
        price: buyRate,
        qty: qty,
        unit: prod.unit,
        gstRate: prod.gstRate
      });
    }

    showToast(`Added ${qty} ${prod.unit} of ${prod.name} to wholesale bill.`, "success");
    document.getElementById('purchase-item-qty').value = "";
    select.value = "";
    select.dispatchEvent(new Event('change'));

    updatePurchaseCartUI();
  };

  const updatePurchaseCartUI = () => {
    const list = document.getElementById('purchase-cart-items-list');
    if (!list) return;

    if (purchaseCart.length === 0) {
      list.innerHTML = `
        <div class="cart-empty-state">
            <i class="fa-solid fa-truck-loading"></i>
            <p>Purchase Bill is empty</p>
            <span>Add wholesale products on the left to receive stock</span>
        </div>
      `;
      document.getElementById('purchase-subtotal').textContent = "₹0.00";
      document.getElementById('purchase-gst').textContent = "₹0.00";
      document.getElementById('purchase-total').textContent = "₹0.00";
      return;
    }

    const billTypeOpt = document.querySelector('input[name="purchase-bill-type"]:checked');
    const billType = billTypeOpt ? billTypeOpt.value : "GST";

    list.innerHTML = purchaseCart.map((item, idx) => {
      // wholesale purchase items calculations are exclusive of GST
      const costExclGst = item.qty * item.price;
      const rate = billType === "Non-GST" ? 0 : item.gstRate;
      const gstAmount = costExclGst * (rate / 100);
      const totalCost = costExclGst + gstAmount;

      return `
        <div class="cart-item" style="border-color: rgba(167, 139, 250, 0.2)">
          <div class="cart-item-details">
            <span class="cart-item-name">${item.name}</span>
            <span class="cart-item-gst">Rate: ₹${item.price} (GST +${rate}%)</span>
            <span class="cart-item-price" style="color:var(--hint-purple)">₹${totalCost.toLocaleString('en-IN')}</span>
          </div>
          <div class="cart-item-controls">
            <div class="qty-counter" style="border-color: rgba(167, 139, 250, 0.3)">
              <button class="qty-btn btn-purchase-qty-minus" data-index="${idx}"><i class="fa-solid fa-minus"></i></button>
              <input type="number" class="purchase-qty-input-box qty-val" data-index="${idx}" value="${item.qty}" min="0.01" step="any">
              <button class="qty-btn btn-purchase-qty-plus" data-index="${idx}"><i class="fa-solid fa-plus"></i></button>
            </div>
            <button class="btn-text" style="color: var(--hint-red); font-size: 0.75rem;" onclick="removePurchaseItem(${idx})"><i class="fa-solid fa-trash"></i> Remove</button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.btn-purchase-qty-minus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        adjustPurchaseQty(parseInt(btn.getAttribute('data-index')), -1);
      });
    });

    list.querySelectorAll('.btn-purchase-qty-plus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        adjustPurchaseQty(parseInt(btn.getAttribute('data-index')), 1);
      });
    });

    list.querySelectorAll('.purchase-qty-input-box').forEach(input => {
      input.addEventListener('change', (e) => {
        const index = parseInt(input.getAttribute('data-index'));
        const newQty = parseFloat(input.value);
        if (isNaN(newQty) || newQty <= 0) {
          removePurchaseItem(index);
        } else {
          updatePurchaseItemQty(index, newQty);
        }
      });
    });

    calculatePurchaseCartTotals();
  };

  const adjustPurchaseQty = (index, change) => {
    if (purchaseCart[index]) {
      const newQty = purchaseCart[index].qty + change;
      if (newQty <= 0) {
        removePurchaseItem(index);
      } else {
        purchaseCart[index].qty = newQty;
        updatePurchaseCartUI();
      }
    }
  };

  const updatePurchaseItemQty = (index, newQty) => {
    if (purchaseCart[index]) {
      purchaseCart[index].qty = newQty;
      updatePurchaseCartUI();
    }
  };

  window.removePurchaseItem = (index) => {
    purchaseCart.splice(index, 1);
    updatePurchaseCartUI();
  };

  const calculatePurchaseCartTotals = () => {
    let subtotalExclGst = 0;
    let totalGstAmount = 0;
    let netTotalInclGst = 0;

    const billTypeOpt = document.querySelector('input[name="purchase-bill-type"]:checked');
    const billType = billTypeOpt ? billTypeOpt.value : "GST";

    purchaseCart.forEach(item => {
      const costExclGst = item.qty * item.price;
      const rate = billType === "Non-GST" ? 0 : item.gstRate;
      const gstAmount = costExclGst * (rate / 100);
      const totalCost = costExclGst + gstAmount;

      subtotalExclGst += costExclGst;
      totalGstAmount += gstAmount;
      netTotalInclGst += totalCost;
    });

    document.getElementById('purchase-subtotal').textContent = `₹${subtotalExclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('purchase-gst').textContent = `₹${totalGstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('purchase-total').textContent = `₹${netTotalInclGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const triggerPurchaseCheckout = async () => {
    if (purchaseCart.length === 0) {
      showToast("Wholesale cart is empty!", "error");
      return;
    }

    const supSelect = document.getElementById('purchase-supplier-select');
    const supplierId = parseInt(supSelect.value);
    const selectedSupplier = supplierId > 0 ? suppliers.find(s => s.id === supplierId) : null;
    const paymentMethod = document.querySelector('input[name="purchase-payment-method"]:checked').value;

    const billTypeOpt = document.querySelector('input[name="purchase-bill-type"]:checked');
    const billType = billTypeOpt ? billTypeOpt.value : "GST";
    const supplierInvoiceNo = document.getElementById('purchase-supplier-invoice-no').value;

    let subtotalExclGst = 0;
    let totalGstAmount = 0;
    let netTotalInclGst = 0;

    const purchaseItems = purchaseCart.map(item => {
      const costExclGst = item.qty * item.price;
      const rate = billType === "Non-GST" ? 0 : item.gstRate;
      const gstAmount = costExclGst * (rate / 100);
      const totalCost = costExclGst + gstAmount;

      subtotalExclGst += costExclGst;
      totalGstAmount += gstAmount;
      netTotalInclGst += totalCost;

      return {
        productId: item.productId,
        name: item.name,
        price: item.price,
        qty: item.qty,
        unit: item.unit,
        gstRate: rate,
        gstAmount: parseFloat(gstAmount.toFixed(2)),
        total: totalCost
      };
    });

    if (paymentMethod === 'Credit' && supplierId === 0) {
      showToast("Credit wholesale billing requires supplier selection!", "warning");
      return;
    }

    const payload = {
      supplierId,
      supplierName: selectedSupplier ? selectedSupplier.name : "Local Wholesale Supplier",
      items: purchaseItems,
      subtotal: parseFloat(subtotalExclGst.toFixed(2)),
      discount: 0,
      gstTotal: parseFloat(totalGstAmount.toFixed(2)),
      total: netTotalInclGst,
      paymentMethod,
      billType,
      supplierInvoiceNo
    };

    try {
      const res = await fetch(`${API_URL}/api/purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.status === 201) {
        showToast(`Stock purchase shipment ${data.purchaseNo} successfully recorded.`, "success");
        purchaseCart = [];
        updatePurchaseCartUI();
        document.getElementById('purchase-supplier-invoice-no').value = "";
        
        await fetchProducts();
        await fetchSuppliers();
        await fetchDashboardStats();

        launchPrintablePurchaseBill(data);
      } else {
        showToast(data.error || "Wholesale checkout failed.", "error");
      }
    } catch (err) {
      showToast("Server connection error during wholesale entry.", "error");
    }
  };

  const launchPrintablePurchaseBill = (pur) => {
    const modal = document.getElementById('modal-purchase-receipt');
    
    document.getElementById('pur-no').textContent = pur.purchaseNo;
    document.getElementById('pur-date').textContent = new Date(pur.date).toLocaleDateString('en-IN') + ' ' + new Date(pur.date).toLocaleTimeString('en-IN');
    document.getElementById('pur-supplier-name').textContent = pur.supplierName;
    document.getElementById('pur-payment-method').textContent = pur.paymentMethod === 'Credit' ? 'Supplier Credit Ledger' : 'Cash / Bank Paid';

    // Show actual Supplier Bill No
    if (pur.supplierInvoiceNo) {
      document.getElementById('pur-supplier-invoice-no-val').textContent = pur.supplierInvoiceNo;
      document.getElementById('pur-supplier-invoice-row').style.display = 'block';
    } else {
      document.getElementById('pur-supplier-invoice-row').style.display = 'none';
    }

    // Look up supplier details from suppliers list
    const supplier = suppliers.find(s => s.id === pur.supplierId);
    if (supplier && pur.supplierId > 0) {
      document.getElementById('pur-supplier-phone').textContent = supplier.phone || 'N/A';
      document.getElementById('pur-supplier-address').textContent = supplier.address || 'N/A';
      document.getElementById('pur-supplier-gstin').textContent = supplier.gstin || 'N/A';
      document.getElementById('pur-supplier-phone-row').style.display = 'block';
      document.getElementById('pur-supplier-address-row').style.display = 'block';
      document.getElementById('pur-supplier-gstin-row').style.display = 'block';
    } else {
      document.getElementById('pur-supplier-phone-row').style.display = 'none';
      document.getElementById('pur-supplier-address-row').style.display = 'none';
      document.getElementById('pur-supplier-gstin-row').style.display = 'none';
    }

    // Handle GST vs Non-GST display
    const receiptTitle = document.getElementById('pur-receipt-title');
    if (pur.billType === "Non-GST") {
      receiptTitle.textContent = "INCOMING MATERIAL PURCHASE VOUCHER (Non-GST)";
      document.getElementById('pur-shop-gstin').style.display = 'none';
      document.getElementById('pur-gst').closest('.summary-line').style.display = 'none';
    } else {
      receiptTitle.textContent = "INCOMING MATERIAL PURCHASE VOUCHER (GST)";
      document.getElementById('pur-shop-gstin').style.display = 'block';
      document.getElementById('pur-gst').closest('.summary-line').style.display = 'flex';
    }

    const body = document.getElementById('purchase-items-body');
    body.innerHTML = pur.items.map(item => {
      const rate = pur.billType === "Non-GST" ? 0 : item.gstRate;
      return `
        <tr>
          <td>${item.name}</td>
          <td class="text-center">${rate}%</td>
          <td class="text-right">₹${item.price.toFixed(2)}</td>
          <td class="text-center">${item.qty} ${item.unit}</td>
          <td class="text-right">₹${item.total.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    document.getElementById('pur-subtotal').textContent = `₹${pur.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('pur-gst').textContent = `₹${pur.gstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('pur-total').textContent = `₹${pur.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    modal.classList.remove('hidden');
  };

  // ==========================================
  // 5. CUSTOMER KHATA LEDGER
  // ==========================================
  const renderCustomersGrid = () => {
    const grid = document.getElementById('khata-customers-grid');
    if (!grid) return;

    const query = document.getElementById('khata-search').value.toLowerCase();
    const filtered = customers.filter(c => c.name.toLowerCase().includes(query) || c.phone.includes(query) || c.address.toLowerCase().includes(query));

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; padding: 40px;">No customers found in ledger.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(c => {
      const usePercent = Math.min(100, Math.round((c.balance / c.creditLimit) * 100)) || 0;
      let barClass = "";
      if (usePercent >= 90) barClass = "danger";
      else if (usePercent >= 70) barClass = "warning";

      return `
        <div class="customer-card glass-panel">
          <div class="card-header-actions">
            <button class="btn-icon-action edit" onclick="event.stopPropagation(); editCustomer(${c.id})" title="Edit Profile"><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="btn-icon-action delete" onclick="event.stopPropagation(); deleteCustomer(${c.id})" title="Delete Profile"><i class="fa-solid fa-trash-can"></i></button>
          </div>
          <div class="customer-card-header">
            <div class="avatar-icon"><i class="fa-solid fa-user"></i></div>
            <div class="customer-details-card">
              <h3>${c.name}</h3>
              <span>${c.address || 'No Address'}</span>
            </div>
          </div>
          <div class="customer-card-body">
            <div class="ledger-row">
              <span>Mobile Number:</span>
              <span>${c.phone || 'N/A'}</span>
            </div>
            <div class="ledger-row" style="margin-top:4px;">
              <span>Outstanding Debt:</span>
              <strong class="${c.balance > 0 ? 'text-orange' : ''}">₹${c.balance.toLocaleString('en-IN')}</strong>
            </div>
            <div class="ledger-row">
              <span>Credit Limit:</span>
              <span>₹${c.creditLimit.toLocaleString('en-IN')}</span>
            </div>
            <div style="margin-top: 6px;">
              <div class="ledger-row" style="font-size:0.75rem;">
                <span>Credit Used:</span>
                <span>${usePercent}% (${c.balance} / ${c.creditLimit})</span>
              </div>
              <div class="progress-bar-container">
                <div class="progress-bar ${barClass}" style="width: ${usePercent}%;"></div>
              </div>
            </div>
          </div>
          <div class="customer-card-actions">
            <button class="btn-primary btn-full-width" onclick="viewCustomerLedger(${c.id})"><i class="fa-solid fa-book-open"></i> View Credit Ledger</button>
          </div>
        </div>
      `;
    }).join('');
  };

  window.viewCustomerLedger = async (id) => {
    const cust = customers.find(c => c.id === id);
    if (!cust) return;

    activeLedgerCustomer = cust;

    document.getElementById('ledger-cust-name').textContent = cust.name;
    document.getElementById('ledger-cust-phone').innerHTML = `<i class="fa-solid fa-phone"></i> ${cust.phone || 'N/A'}`;
    document.getElementById('ledger-cust-address').innerHTML = `<i class="fa-solid fa-location-dot"></i> ${cust.address || 'N/A'}`;
    
    document.getElementById('ledger-outstanding-val').textContent = `₹${cust.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('ledger-limit-val').textContent = `₹${cust.creditLimit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const usePercent = Math.min(100, Math.round((cust.balance / cust.creditLimit) * 100)) || 0;
    const progress = document.getElementById('ledger-progress-bar');
    progress.className = "progress-bar";
    if (usePercent >= 90) progress.classList.add('danger');
    else if (usePercent >= 70) progress.classList.add('warning');
    progress.style.width = `${usePercent}%`;
    document.getElementById('ledger-usage-percent').textContent = `${usePercent}% Credit Used`;

    await renderLedgerTransactions(cust);

    document.getElementById('khata-customers-view').classList.add('hidden');
    document.getElementById('khata-ledger-detail-view').classList.remove('hidden');
  };

  const renderLedgerTransactions = async (customer) => {
    const body = document.getElementById('customer-ledger-table-body');
    if (!body) return;

    try {
      const [salesRes, paymentsRes] = await Promise.all([
        fetch(`${API_URL}/api/sales`),
        fetch(`${API_URL}/api/payments`)
      ]);
      
      const allSales = await salesRes.json();
      const allPayments = await paymentsRes.json();

      const custSales = allSales.filter(s => s.customerId === customer.id);
      const custPayments = allPayments.filter(p => p.customerId === customer.id);

      const txs = [];
      custSales.forEach(s => {
        const isCredit = s.paymentMethod === 'Khata';
        const itemsSummary = s.items ? s.items.map(item => `${item.name} x ${item.qty} ${item.unit}`).join(', ') : '';
        txs.push({
          date: s.date,
          type: isCredit ? 'Invoice Bill' : `Retail (${s.paymentMethod})`,
          ref: s.invoiceNo,
          debit: s.total,
          credit: isCredit ? 0 : s.total, // Balance cash sales instantly in statement
          remarks: itemsSummary,
          rawItem: s
        });
      });

      custPayments.forEach(p => {
        txs.push({
          date: p.date,
          type: 'Payment Recv',
          ref: `REC-${String(p.id).padStart(4, '0')}`,
          debit: 0,
          credit: p.amount,
          remarks: p.remarks,
          rawItem: p
        });
      });

      txs.sort((a, b) => new Date(a.date) - new Date(b.date));

      if (txs.length === 0) {
        body.innerHTML = `<tr><td colspan="7" class="empty-state" style="text-align:center;">No transaction entries in this ledger yet.</td></tr>`;
        return;
      }

      let runningBal = 0;
      const rows = txs.map(t => {
        runningBal += (t.debit - t.credit);
        const dateStr = new Date(t.date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
        
        let actionBtn = '';
        const isSale = t.type === 'Invoice Bill' || t.type.startsWith('Retail');
        if (isSale) {
          actionBtn = `<button class="btn-table edit" title="Reprint Bill" onclick="window.reprintCustomerBillByNo('${t.ref}')"><i class="fa-solid fa-print"></i></button>`;
        } else {
          actionBtn = `<button class="btn-table ledger" title="Reprint Receipt" onclick="window.reprintCustomerReceiptById(${t.rawItem.id}, ${runningBal + t.credit})"><i class="fa-solid fa-print"></i></button>`;
        }

        const typeClass = t.type === 'Invoice Bill' ? 'alert' : (t.type.startsWith('Retail') ? 'status-tag active' : 'active');
        const badgeColorStyle = t.type.startsWith('Retail') ? 'background: rgba(14, 165, 233, 0.1); color: var(--accent-primary);' : '';

        return `
          <tr>
            <td>${dateStr}</td>
            <td><span class="status-tag ${typeClass}" style="font-size:0.7rem; padding: 2px 6px; ${badgeColorStyle}">${t.type}</span></td>
            <td>
              <strong>${t.ref}</strong>
              ${t.remarks ? '<span style="font-size:0.75rem; color:var(--text-muted); display:block; white-space:normal; max-width: 320px;">(' + t.remarks + ')</span>' : ''}
            </td>
            <td class="text-right text-red">${t.debit > 0 ? '₹' + t.debit.toLocaleString('en-IN') : '-'}</td>
            <td class="text-right text-green">${t.credit > 0 ? '₹' + t.credit.toLocaleString('en-IN') : '-'}</td>
            <td class="text-right" style="font-weight:700;">₹${runningBal.toLocaleString('en-IN')}</td>
            <td class="text-center">${actionBtn}</td>
          </tr>
        `;
      });
      body.innerHTML = rows.join('');
    } catch (e) {
      body.innerHTML = `<tr><td colspan="7" class="empty-state text-red">Failed to query ledger transactions.</td></tr>`;
    }
  };

  window.reprintCustomerBillByNo = async (invoiceNo) => {
    try {
      const res = await fetch(`${API_URL}/api/sales`);
      const allSales = await res.json();
      const invoice = allSales.find(s => s.invoiceNo === invoiceNo);
      if (invoice) {
        launchPrintableInvoice(invoice);
      } else {
        showToast("Invoice not found.", "error");
      }
    } catch (e) {
      showToast("Error loading invoice reprint details.", "error");
    }
  };

  window.reprintCustomerReceiptById = async (paymentId, originalBalance) => {
    try {
      const res = await fetch(`${API_URL}/api/payments`);
      const allPayments = await res.json();
      const payment = allPayments.find(p => p.id === parseInt(paymentId));
      if (payment) {
        const modal = document.getElementById('modal-payment-receipt');
        
        document.getElementById('rep-id').textContent = `REC-${String(payment.id).padStart(4, '0')}`;
        document.getElementById('rep-date').textContent = new Date(payment.date).toLocaleString('en-IN');
        document.getElementById('rep-customer-name').textContent = payment.customerName;
        document.getElementById('rep-old-balance').textContent = `₹${originalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        document.getElementById('rep-amount').textContent = `₹${payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        document.getElementById('rep-method').textContent = payment.paymentMethod;
        document.getElementById('rep-remarks').textContent = payment.remarks || "N/A";

        const newOutstanding = Math.max(0, originalBalance - payment.amount);
        document.getElementById('rep-summary-original').textContent = `₹${originalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        document.getElementById('rep-summary-paid').textContent = `₹${payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        document.getElementById('rep-summary-new').textContent = `₹${newOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

        modal.classList.remove('hidden');
      } else {
        showToast("Payment receipt not found.", "error");
      }
    } catch (e) {
      showToast("Error loading payment receipt.", "error");
    }
  };

  const handleKhataPaymentSubmit = async (e) => {
    e.preventDefault();
    if (!activeLedgerCustomer) return;

    const amount = parseFloat(document.getElementById('pay-amount').value);
    if (isNaN(amount) || amount <= 0) {
      showToast("Please enter a valid positive payment amount.", "warning");
      return;
    }

    const paymentMethod = document.getElementById('pay-method').value;
    const remarks = document.getElementById('pay-remarks').value;

    const payload = { amount, paymentMethod, remarks };

    try {
      const res = await fetch(`${API_URL}/api/customers/${activeLedgerCustomer.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        showToast("Customer payment logged successfully!", "success");
        document.getElementById('record-payment-form').reset();
        
        await fetchCustomers();
        await fetchDashboardStats();

        const updatedCust = customers.find(c => c.id === activeLedgerCustomer.id);
        await viewCustomerLedger(updatedCust.id);

        window.reprintCustomerReceiptById(data.payment.id, updatedCust.balance + data.payment.amount);
      } else {
        showToast(data.error || "Payment recording failed.", "error");
      }
    } catch (err) {
      showToast("Server API connection issue.", "error");
    }
  };

  const handleCustomerSubmit = async (e) => {
    e.preventDefault();

    const id = document.getElementById('customer-id').value;
    const name = document.getElementById('cust-name').value.trim();
    if (!name) {
      showToast("Builder/Customer name is required.", "warning");
      return;
    }

    const creditLimit = parseFloat(document.getElementById('cust-limit').value) || 0;
    if (creditLimit < 0) {
      showToast("Credit limit must be a non-negative number.", "warning");
      return;
    }

    const payload = {
      name,
      phone: document.getElementById('cust-phone').value,
      creditLimit,
      address: document.getElementById('cust-address').value,
      gstin: document.getElementById('cust-gstin').value
    };

    const isEdit = !!id;
    const url = isEdit ? `${API_URL}/api/customers/${id}` : `${API_URL}/api/customers`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast(isEdit ? "Builder profile updated." : "Builder profile registered.", "success");
        document.getElementById('modal-customer').classList.add('hidden');
        document.getElementById('customer-form').reset();
        document.getElementById('customer-id').value = "";
        document.getElementById('cust-gstin').value = "";
        
        await fetchCustomers();
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || (isEdit ? "Failed to update customer" : "Failed to add new customer"), "error");
      }
    } catch (err) {
      showToast("Server API error during operation", "error");
    }
  };

  window.editCustomer = (id) => {
    const cust = customers.find(c => c.id === id);
    if (!cust) return;

    document.getElementById('customer-id').value = cust.id;
    document.getElementById('cust-name').value = cust.name;
    document.getElementById('cust-phone').value = cust.phone || '';
    document.getElementById('cust-limit').value = cust.creditLimit || 0;
    document.getElementById('cust-address').value = cust.address || '';
    document.getElementById('cust-gstin').value = cust.gstin || '';

    document.getElementById('customer-modal-title').textContent = "Edit Customer Profile";
    document.getElementById('modal-customer').classList.remove('hidden');
  };

  window.deleteCustomer = async (id) => {
    const cust = customers.find(c => c.id === id);
    if (!cust) return;

    if (confirm(`Are you sure you want to delete customer "${cust.name}"?\n(This profile will be deleted, but transaction history remains for auditing)`)) {
      try {
        const res = await fetch(`${API_URL}/api/customers/${id}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (res.ok) {
          showToast("Customer profile deleted successfully", "success");
          await fetchCustomers();
        } else {
          showToast(data.error || "Failed to delete customer", "error");
        }
      } catch (err) {
        showToast("Server connection error during deletion", "error");
      }
    }
  };

  // ==========================================
  // 6. WHOLESALE SUPPLIER KHATA LEDGER (NEW)
  // ==========================================
  const renderSuppliersGrid = () => {
    const grid = document.getElementById('khata-suppliers-grid');
    if (!grid) return;

    const query = document.getElementById('supplier-khata-search').value.toLowerCase();
    const filtered = suppliers.filter(s => s.name.toLowerCase().includes(query) || s.phone.includes(query) || s.address.toLowerCase().includes(query));

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1; padding:40px;">No matching suppliers found.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(s => `
      <div class="customer-card glass-panel" style="border-left: 4px solid var(--hint-purple);">
        <div class="card-header-actions">
          <button class="btn-icon-action edit" onclick="event.stopPropagation(); editSupplier(${s.id})" title="Edit Supplier"><i class="fa-solid fa-pen-to-square" style="color: var(--hint-purple);"></i></button>
          <button class="btn-icon-action delete" onclick="event.stopPropagation(); deleteSupplier(${s.id})" title="Delete Supplier"><i class="fa-solid fa-trash-can"></i></button>
        </div>
        <div class="customer-card-header">
          <div class="avatar-icon" style="color:var(--hint-purple)"><i class="fa-solid fa-truck-field"></i></div>
          <div class="customer-details-card">
            <h3>${s.name}</h3>
            <span>${s.address || 'MIDC Nagpur'}</span>
          </div>
        </div>
        <div class="customer-card-body">
          <div class="ledger-row">
            <span>Mobile Phone:</span>
            <span>${s.phone || 'N/A'}</span>
          </div>
          <div class="ledger-row">
            <span>Supplier GSTIN:</span>
            <span>${s.gstin || 'N/A'}</span>
          </div>
          <div class="ledger-row" style="margin-top:8px;">
            <span>Outstanding Balance:</span>
            <strong class="text-purple" style="font-size:1.1rem">₹${s.balance.toLocaleString('en-IN')}</strong>
          </div>
        </div>
        <div class="customer-card-actions">
          <button class="btn-primary btn-full-width" style="background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);" onclick="viewSupplierLedger(${s.id})"><i class="fa-solid fa-book-open"></i> View Statement Ledger</button>
        </div>
      </div>
    `).join('');
  };

  window.viewSupplierLedger = async (id) => {
    const sup = suppliers.find(s => s.id === id);
    if (!sup) return;

    activeLedgerSupplier = sup;

    document.getElementById('sup-ledger-name').textContent = sup.name;
    document.getElementById('sup-ledger-phone').innerHTML = `<i class="fa-solid fa-phone"></i> ${sup.phone || 'N/A'}`;
    document.getElementById('sup-ledger-gstin').innerHTML = `<i class="fa-solid fa-address-card"></i> GSTIN: ${sup.gstin || 'N/A'}`;
    document.getElementById('sup-ledger-address').textContent = sup.address || 'N/A';
    document.getElementById('sup-ledger-outstanding-val').textContent = `₹${sup.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    await renderSupplierLedgerTransactions(sup);

    document.getElementById('khata-suppliers-view').classList.add('hidden');
    document.getElementById('supplier-ledger-detail-view').classList.remove('hidden');
  };

  const renderSupplierLedgerTransactions = async (supplier) => {
    const body = document.getElementById('supplier-ledger-table-body');
    if (!body) return;

    try {
      const [purRes, paymentsRes] = await Promise.all([
        fetch(`${API_URL}/api/purchases`),
        fetch(`${API_URL}/api/supplier_payments`)
      ]);

      const allPurchases = await purRes.json();
      const allPayments = await paymentsRes.json();

      const supPurchases = allPurchases.filter(p => p.supplierId === supplier.id);
      const supPayments = allPayments.filter(p => p.supplierId === supplier.id);

      const txs = [];
      supPurchases.forEach(p => {
        const isCredit = p.paymentMethod === 'Credit';
        const itemsSummary = p.items ? p.items.map(item => `${item.name} x ${item.qty} ${item.unit}`).join(', ') : '';
        const supplierRef = p.supplierInvoiceNo ? `Supplier Inv: ${p.supplierInvoiceNo}` : '';
        const desc = [supplierRef, itemsSummary].filter(Boolean).join(' | ');

        txs.push({
          date: p.date,
          type: isCredit ? 'Stock Purchase' : `Purchase (${p.paymentMethod})`,
          ref: p.purchaseNo,
          debit: isCredit ? 0 : p.total, // Balance cash wholesale orders instantly in statement
          credit: p.total,
          remarks: desc,
          rawItem: p
        });
      });

      supPayments.forEach(p => {
        txs.push({
          date: p.date,
          type: 'Payment Made',
          ref: `SREC-${String(p.id).padStart(4, '0')}`,
          debit: p.amount,
          credit: 0,
          remarks: p.remarks,
          rawItem: p
        });
      });

      txs.sort((a, b) => new Date(a.date) - new Date(b.date));

      if (txs.length === 0) {
        body.innerHTML = `<tr><td colspan="7" class="empty-state" style="text-align:center;">No transaction statements recorded for this supplier.</td></tr>`;
        return;
      }

      let runningBal = 0;
      const rows = txs.map(t => {
        runningBal += (t.credit - t.debit);
        const dateStr = new Date(t.date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
        
        let actionBtn = '';
        const isPurchase = t.type === 'Stock Purchase' || t.type.startsWith('Purchase');
        if (isPurchase) {
          actionBtn = `<button class="btn-table edit" title="Reprint Purchase Bill" onclick="window.reprintSupplierPurchaseByNo('${t.ref}')"><i class="fa-solid fa-print"></i></button>`;
        } else {
          actionBtn = `<button class="btn-table ledger" title="Reprint Voucher" onclick="window.reprintSupplierPaymentById(${t.rawItem.id}, ${runningBal + t.debit})"><i class="fa-solid fa-print"></i></button>`;
        }

        const typeClass = t.type === 'Stock Purchase' ? 'alert' : (t.type.startsWith('Purchase') ? 'status-tag active' : 'active');
        const badgeColorStyle = t.type.startsWith('Purchase') ? 'background: rgba(167, 139, 250, 0.1); color: var(--hint-purple);' : '';

        return `
          <tr>
            <td>${dateStr}</td>
            <td><span class="status-tag ${typeClass}" style="font-size:0.7rem; padding: 2px 6px; ${badgeColorStyle}">${t.type}</span></td>
            <td>
              <strong>${t.ref}</strong>
              ${t.remarks ? '<span style="font-size:0.75rem; color:var(--text-muted); display:block; white-space:normal; max-width: 320px;">(' + t.remarks + ')</span>' : ''}
            </td>
            <td class="text-right text-green">${t.debit > 0 ? '₹' + t.debit.toLocaleString('en-IN') : '-'}</td>
            <td class="text-right text-red">${t.credit > 0 ? '₹' + t.credit.toLocaleString('en-IN') : '-'}</td>
            <td class="text-right" style="font-weight:700;">₹${runningBal.toLocaleString('en-IN')}</td>
            <td class="text-center">${actionBtn}</td>
          </tr>
        `;
      });
      body.innerHTML = rows.join('');
    } catch (e) {
      body.innerHTML = `<tr><td colspan="7" class="empty-state text-red">Failed to query ledger transactions.</td></tr>`;
    }
  };

  window.reprintSupplierPurchaseByNo = async (purchaseNo) => {
    try {
      const res = await fetch(`${API_URL}/api/purchases`);
      const allPurchases = await res.json();
      const pur = allPurchases.find(p => p.purchaseNo === purchaseNo);
      if (pur) {
        launchPrintablePurchaseBill(pur);
      } else {
        showToast("Purchase voucher not found.", "error");
      }
    } catch (e) {
      showToast("Error loading purchase reprint details.", "error");
    }
  };

  window.reprintSupplierPaymentById = async (paymentId, originalBalance) => {
    try {
      const res = await fetch(`${API_URL}/api/supplier_payments`);
      const allPayments = await res.json();
      const payment = allPayments.find(p => p.id === parseInt(paymentId));
      if (payment) {
        const modal = document.getElementById('modal-supplier-payment-receipt');
        
        document.getElementById('srep-id').textContent = `SREC-${String(payment.id).padStart(4, '0')}`;
        document.getElementById('srep-date').textContent = new Date(payment.date).toLocaleDateString('en-IN');
        document.getElementById('srep-supplier-name').textContent = payment.supplierName;
        document.getElementById('srep-old-balance').textContent = `₹${originalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        document.getElementById('srep-amount').textContent = `₹${payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        document.getElementById('srep-method').textContent = payment.paymentMethod;
        document.getElementById('srep-remarks').textContent = payment.remarks || "N/A";

        const newOutstanding = Math.max(0, originalBalance - payment.amount);
        document.getElementById('srep-summary-original').textContent = `₹${originalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        document.getElementById('srep-summary-paid').textContent = `₹${payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        document.getElementById('srep-summary-new').textContent = `₹${newOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

        modal.classList.remove('hidden');
      } else {
        showToast("Payment voucher not found.", "error");
      }
    } catch (e) {
      showToast("Error loading repayment details.", "error");
    }
  };

  const handleSupplierPaymentSubmit = async (e) => {
    e.preventDefault();
    if (!activeLedgerSupplier) return;

    const amount = parseFloat(document.getElementById('sup-pay-amount').value);
    if (isNaN(amount) || amount <= 0) {
      showToast("Please enter a valid positive payment amount.", "warning");
      return;
    }

    const paymentMethod = document.getElementById('sup-pay-method').value;
    const remarks = document.getElementById('sup-pay-remarks').value;

    const payload = { amount, paymentMethod, remarks };

    try {
      const res = await fetch(`${API_URL}/api/suppliers/${activeLedgerSupplier.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        showToast("Repayment recorded and deducted from Supplier Khata.", "success");
        document.getElementById('record-supplier-payment-form').reset();
        
        await fetchSuppliers();
        await fetchDashboardStats();

        const updatedSup = suppliers.find(s => s.id === activeLedgerSupplier.id);
        await viewSupplierLedger(updatedSup.id);

        window.reprintSupplierPaymentById(data.payment.id, updatedSup.balance + data.payment.amount);
      } else {
        showToast(data.error || "Failed to submit supplier payment.", "error");
      }
    } catch (err) {
      showToast("Server connection error during payout.", "error");
    }
  };

  const handleSupplierSubmit = async (e) => {
    e.preventDefault();

    const id = document.getElementById('supplier-id').value;
    const payload = {
      name: document.getElementById('sup-name').value,
      phone: document.getElementById('sup-phone').value,
      gstin: document.getElementById('sup-gstin').value,
      address: document.getElementById('sup-address').value
    };

    const isEdit = !!id;
    const url = isEdit ? `${API_URL}/api/suppliers/${id}` : `${API_URL}/api/suppliers`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast(isEdit ? "Wholesale supplier updated." : "Wholesale supplier registered.", "success");
        document.getElementById('modal-supplier').classList.add('hidden');
        document.getElementById('supplier-form').reset();
        document.getElementById('supplier-id').value = "";
        
        await fetchSuppliers();
      } else {
        const errData = await res.json();
        showToast(errData.error || (isEdit ? "Failed to update supplier." : "Failed to add supplier."), "error");
      }
    } catch (err) {
      showToast("Server API error during operation.", "error");
    }
  };

  window.editSupplier = (id) => {
    const sup = suppliers.find(s => s.id === id);
    if (!sup) return;

    document.getElementById('supplier-id').value = sup.id;
    document.getElementById('sup-name').value = sup.name;
    document.getElementById('sup-phone').value = sup.phone || '';
    document.getElementById('sup-gstin').value = sup.gstin || '';
    document.getElementById('sup-address').value = sup.address || '';

    document.getElementById('supplier-modal-title').textContent = "Edit Wholesaler Profile";
    document.getElementById('modal-supplier').classList.remove('hidden');
  };

  window.deleteSupplier = async (id) => {
    const sup = suppliers.find(s => s.id === id);
    if (!sup) return;

    if (confirm(`Are you sure you want to delete supplier "${sup.name}"?\n(This profile will be deleted, but transaction history remains for auditing)`)) {
      try {
        const res = await fetch(`${API_URL}/api/suppliers/${id}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (res.ok) {
          showToast("Supplier profile deleted successfully", "success");
          await fetchSuppliers();
        } else {
          showToast(data.error || "Failed to delete supplier", "error");
        }
      } catch (err) {
        showToast("Server connection error during deletion", "error");
      }
    }
  };

  // ==========================================
  // 7. SETTINGS FORM ACTIONS
  // ==========================================
  const loadSettingsForm = () => {
    document.getElementById('shop-name').value = currentSettings.shopName;
    document.getElementById('shop-phone').value = currentSettings.phone;
    document.getElementById('shop-gstin').value = currentSettings.gstin;
    document.getElementById('shop-pan').value = currentSettings.pan || '';
    document.getElementById('shop-bank-name').value = currentSettings.bankName || '';
    document.getElementById('shop-bank-ac').value = currentSettings.bankAc || '';
    document.getElementById('shop-bank-ifsc').value = currentSettings.bankIfsc || '';
    document.getElementById('shop-upi').value = currentSettings.upiId;
    document.getElementById('shop-address').value = currentSettings.address;
  };

  const handleSettingsSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      shopName: document.getElementById('shop-name').value,
      phone: document.getElementById('shop-phone').value,
      gstin: document.getElementById('shop-gstin').value,
      pan: document.getElementById('shop-pan').value,
      bankName: document.getElementById('shop-bank-name').value,
      bankAc: document.getElementById('shop-bank-ac').value,
      bankIfsc: document.getElementById('shop-bank-ifsc').value,
      upiId: document.getElementById('shop-upi').value,
      address: document.getElementById('shop-address').value
    };

    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        showToast("Shop profile settings saved.", "success");
        await fetchSettings();
      } else {
        showToast("Failed to save settings.", "error");
      }
    } catch (err) {
      showToast("Server configuration error.", "error");
    }
  };

  const updateSystemDetails = () => {
    const dbSizeEl = document.getElementById('db-file-size');
    if (dbSizeEl) {
      const mockSize = JSON.stringify({products, customers, suppliers}).length;
      dbSizeEl.textContent = `~ ${(mockSize / 1024).toFixed(2)} KB`;
    }
  };

  const triggerFactoryReset = async () => {
    if (!confirm("⚠️ WARNING: This will reset the database back to its building supply seed data, wiping out custom transactions and customer ledger accounts! Proceed?")) return;
    
    showToast("Resetting POS system database...", "info");
    try {
      const res = await fetch(`${API_URL}/api/system/reset`, { method: 'POST' });
      if (res.ok) {
        showToast("POS Database reset completed successfully.", "success");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showToast("Reset API failed.", "error");
      }
    } catch (e) {
      showToast("Error connecting to database server.", "error");
    }
  };

  const triggerDatabaseBackup = async () => {
    try {
      const res = await fetch(`${API_URL}/api/system/backup`);
      const backupData = await res.json();
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const dlAnchorElem = document.createElement('a');
      dlAnchorElem.setAttribute("href", dataStr);
      dlAnchorElem.setAttribute("download", `ZT_POS_Backup_${new Date().toISOString().substring(0,10)}.json`);
      dlAnchorElem.click();
      showToast("Store Database JSON backup downloaded.", "success");
    } catch (e) {
      showToast("Failed to fetch database backup from server.", "error");
    }
  };

  const triggerDatabaseRestore = () => {
    document.getElementById('backup-file-input').click();
  };

  const handleBackupFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backupData = JSON.parse(event.target.result);
        const res = await fetch(`${API_URL}/api/system/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(backupData)
        });
        
        if (res.ok) {
          showToast("Database backup successfully restored!", "success");
          setTimeout(() => window.location.reload(), 1500);
        } else {
          const data = await res.json().catch(() => ({}));
          showToast(data.error || "Failed to restore backup.", "error");
        }
      } catch (err) {
        showToast("Invalid JSON file uploaded.", "error");
      } finally {
        e.target.value = ""; // Reset the input value to allow consecutive uploads of the same file
      }
    };
    reader.readAsText(file);
  };

  // ==========================================
  // EVENT HANDLERS REGISTRY
  // ==========================================
  const setupEventListeners = () => {
    // POS Customer Cart Events
    document.getElementById('btn-clear-cart').addEventListener('click', () => {
      if (cart.length === 0) return;
      if (confirm("Are you sure you want to clear your retail customer cart?")) {
        cart = [];
        updateCartUI();
        showToast("Cart cleared", "info");
      }
    });

    document.getElementById('cart-discount').addEventListener('input', calculateCartTotals);
    document.getElementById('btn-checkout').addEventListener('click', triggerCheckout);
    document.querySelectorAll('input[name="cart-bill-type"]').forEach(radio => {
      radio.addEventListener('change', calculateCartTotals);
    });

    // Product search retail
    document.getElementById('catalog-search').addEventListener('input', renderCatalog);
    
    // Category tabs click retail
    document.querySelectorAll('.category-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderCatalog();
      });
    });

    // POS Customer popup triggers
    document.getElementById('btn-add-customer-modal').addEventListener('click', () => {
      document.getElementById('customer-modal-title').textContent = "Register Client Profile";
      document.getElementById('customer-id').value = "";
      document.getElementById('cust-name').value = "";
      document.getElementById('cust-phone').value = "";
      document.getElementById('cust-limit').value = "100000";
      document.getElementById('cust-address').value = "";
      document.getElementById('cust-gstin').value = "";
      document.getElementById('modal-customer').classList.remove('hidden');
    });

    // POS Wholesale Supplier popup triggers
    document.getElementById('btn-add-supplier-modal').addEventListener('click', () => {
      document.getElementById('supplier-modal-title').textContent = "Register Wholesaler Profile";
      document.getElementById('supplier-id').value = "";
      document.getElementById('sup-name').value = "";
      document.getElementById('sup-phone').value = "";
      document.getElementById('sup-gstin').value = "";
      document.getElementById('sup-address').value = "";
      document.getElementById('modal-supplier').classList.remove('hidden');
    });

    // Inventory Controls search
    document.getElementById('inventory-search').addEventListener('input', renderInventoryTable);
    document.getElementById('inventory-filter-category').addEventListener('change', renderInventoryTable);

    // Add Product button triggers modal
    document.getElementById('btn-new-product').addEventListener('click', () => {
      document.getElementById('product-modal-title').textContent = "Add Wholesale Product";
      document.getElementById('product-form').reset();
      document.getElementById('product-id').value = "";
      document.getElementById('modal-product').classList.remove('hidden');
    });

    // Wholesale purchases forms
    document.getElementById('purchase-item-adder-form').addEventListener('submit', handlePurchaseItemAddSubmit);
    document.getElementById('btn-clear-purchase-cart').addEventListener('click', () => {
      if (purchaseCart.length === 0) return;
      if (confirm("Are you sure you want to clear your incoming purchase bill?")) {
        purchaseCart = [];
        updatePurchaseCartUI();
        showToast("Purchase bill cleared", "info");
      }
    });
    document.getElementById('btn-purchase-checkout').addEventListener('click', triggerPurchaseCheckout);
    document.querySelectorAll('input[name="purchase-bill-type"]').forEach(radio => {
      radio.addEventListener('change', calculatePurchaseCartTotals);
    });

    // Customer Khata search
    document.getElementById('khata-search').addEventListener('input', renderCustomersGrid);
    document.getElementById('btn-new-customer').addEventListener('click', () => {
      document.getElementById('btn-add-customer-modal').click();
    });

    // Back buttons
    document.getElementById('btn-back-to-khata-list').addEventListener('click', () => {
      document.getElementById('khata-ledger-detail-view').classList.add('hidden');
      document.getElementById('khata-customers-view').classList.remove('hidden');
      activeLedgerCustomer = null;
      renderCustomersGrid();
    });

    // Customer repayment submit
    document.getElementById('record-payment-form').addEventListener('submit', handleKhataPaymentSubmit);

    // Supplier Khata search
    document.getElementById('supplier-khata-search').addEventListener('input', renderSuppliersGrid);
    document.getElementById('btn-new-supplier-tab').addEventListener('click', () => {
      document.getElementById('btn-add-supplier-modal').click();
    });

    // Back buttons Supplier Ledger
    document.getElementById('btn-back-to-suppliers-list').addEventListener('click', () => {
      document.getElementById('supplier-ledger-detail-view').classList.add('hidden');
      document.getElementById('khata-suppliers-view').classList.remove('hidden');
      activeLedgerSupplier = null;
      renderSuppliersGrid();
    });

    // Supplier Repayment submit
    document.getElementById('record-supplier-payment-form').addEventListener('submit', handleSupplierPaymentSubmit);

    // Global settings profiles
    document.getElementById('settings-shop-form').addEventListener('submit', handleSettingsSubmit);
    document.getElementById('btn-trigger-backup').addEventListener('click', triggerDatabaseBackup);
    document.getElementById('btn-trigger-restore').addEventListener('click', triggerDatabaseRestore);
    document.getElementById('backup-file-input').addEventListener('change', handleBackupFileSelect);
    document.getElementById('btn-trigger-reset').addEventListener('click', triggerFactoryReset);

    // Modals close buttons
    document.getElementById('btn-close-product-modal').addEventListener('click', () => document.getElementById('modal-product').classList.add('hidden'));
    document.getElementById('btn-cancel-product-modal').addEventListener('click', () => document.getElementById('modal-product').classList.add('hidden'));
    
    document.getElementById('btn-close-customer-modal').addEventListener('click', () => document.getElementById('modal-customer').classList.add('hidden'));
    document.getElementById('btn-cancel-customer-modal').addEventListener('click', () => document.getElementById('modal-customer').classList.add('hidden'));

    document.getElementById('btn-close-supplier-modal').addEventListener('click', () => document.getElementById('modal-supplier').classList.add('hidden'));
    document.getElementById('btn-cancel-supplier-modal').addEventListener('click', () => document.getElementById('modal-supplier').classList.add('hidden'));

    document.getElementById('btn-close-qr-modal').addEventListener('click', () => document.getElementById('modal-upi-qr').classList.add('hidden'));
    document.getElementById('btn-close-invoice-modal').addEventListener('click', () => document.getElementById('modal-invoice-receipt').classList.add('hidden'));
    document.getElementById('btn-close-purchase-bill-modal').addEventListener('click', () => document.getElementById('modal-purchase-receipt').classList.add('hidden'));
    document.getElementById('btn-close-payment-receipt-modal').addEventListener('click', () => document.getElementById('modal-payment-receipt').classList.add('hidden'));
    document.getElementById('btn-close-supplier-payment-modal').addEventListener('click', () => document.getElementById('modal-supplier-payment-receipt').classList.add('hidden'));

    // Print Buttons
    document.getElementById('btn-print-invoice').addEventListener('click', () => window.print());
    document.getElementById('btn-print-purchase-bill').addEventListener('click', () => window.print());
    document.getElementById('btn-print-payment-receipt').addEventListener('click', () => window.print());
    document.getElementById('btn-print-supplier-payment').addEventListener('click', () => window.print());

    // Submit Forms
    document.getElementById('product-form').addEventListener('submit', handleProductSubmit);
    document.getElementById('customer-form').addEventListener('submit', handleCustomerSubmit);
    document.getElementById('supplier-form').addEventListener('submit', handleSupplierSubmit);
  };

  // ==========================================
  // CUSTOM PREMIUM VISUAL TOASTS
  // ==========================================
  const showToast = (message, type = "success") => {
    const existing = document.querySelectorAll('.custom-toast');
    existing.forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `custom-toast glass-panel toast-${type}`;
    
    let icon = "circle-check";
    if (type === "error") icon = "circle-xmark";
    else if (type === "warning") icon = "triangle-exclamation";
    else if (type === "info") icon = "circle-info";

    toast.innerHTML = `
      <i class="fa-solid fa-${icon}"></i>
      <span>${message}</span>
    `;

    document.body.appendChild(toast);

    toast.style.position = 'fixed';
    toast.style.bottom = '30px';
    toast.style.right = '30px';
    toast.style.zIndex = '9999';
    toast.style.padding = '14px 24px';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '12px';
    toast.style.fontSize = '0.9rem';
    toast.style.fontWeight = '500';
    toast.style.animation = 'slideInToast 0.3s ease forwards';
    toast.style.borderLeft = '4px solid';

    if (type === "success") {
      toast.style.borderLeftColor = 'var(--hint-green)';
      toast.style.color = '#fff';
      toast.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.25)';
    } else if (type === "error") {
      toast.style.borderLeftColor = 'var(--hint-red)';
      toast.style.color = '#fff';
      toast.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.25)';
    } else if (type === "warning") {
      toast.style.borderLeftColor = 'var(--hint-orange)';
      toast.style.color = '#fff';
      toast.style.boxShadow = '0 0 20px rgba(249, 115, 22, 0.25)';
    } else {
      toast.style.borderLeftColor = 'var(--hint-purple)';
      toast.style.color = '#fff';
      toast.style.boxShadow = '0 0 20px rgba(167, 139, 250, 0.25)';
    }

    setTimeout(() => {
      toast.style.animation = 'slideOutToast 0.3s ease forwards';
      setTimeout(() => toast.remove(), 350);
    }, 4000);
  };

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInToast {
      from { transform: translateX(120%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutToast {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(120%); opacity: 0; }
    }
    .low-stock-row {
      background: rgba(239, 68, 68, 0.03);
    }
    .custom-toast i {
      font-size: 1.2rem;
    }
  `;
  document.head.appendChild(style);

  // Bind login form submit
  document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
  
  // Bind logout button click
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  // Boot sequence
  const boot = async () => {
    // Load settings first (public API) so brand name shows on login screen
    await fetchSettings();

    const token = localStorage.getItem('auth_token');
    if (!token) {
      showLoginScreen();
    } else {
      hideLoginScreen();
      await initApp();
    }
  };

  boot();
});
