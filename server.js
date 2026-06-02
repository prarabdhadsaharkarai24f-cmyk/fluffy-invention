const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = 'zade_traders_pos_jwt_secret_key_2026';

function generateToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null; 
    return payload;
  } catch (e) {
    return null;
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  // Allow login and GET /api/settings to be public. Protect all other /api/* endpoints.
  if (
    req.path === '/api/auth/login' || 
    (req.path === '/api/settings' && req.method === 'GET') || 
    !req.path.startsWith('/api/')
  ) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: "Access token is missing." });
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(403).json({ error: "Access token is invalid or expired." });
  }

  req.user = user;
  next();
};

app.use(cors());
app.use(express.json());
app.use(authenticateToken);
app.use(express.static(__dirname));

// ==========================================
// Auth Endpoint
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const users = db.get('users');
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  if (passwordHash !== user.passwordHash) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const token = generateToken({ id: user.id, username: user.username, exp });

  res.json({ success: true, token, user: { id: user.id, username: user.username } });
});

// ==========================================
// 1. Settings Endpoints
// ==========================================
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.put('/api/settings', (req, res) => {
  const updated = db.updateSettings(req.body);
  res.json(updated);
});

// ==========================================
// 2. Products Endpoints
// ==========================================
app.get('/api/products', (req, res) => {
  res.json(db.get('products'));
});

app.post('/api/products', (req, res) => {
  const { name, barcode, category, buyPrice, sellPrice, stock, unit, gstRate, minStock } = req.body;
  if (!name || sellPrice === undefined) {
    return res.status(400).json({ error: "Product name and selling price are required." });
  }

  const sellVal = parseFloat(sellPrice);
  if (isNaN(sellVal) || sellVal < 0) {
    return res.status(400).json({ error: "Selling price must be a non-negative number." });
  }

  const buyVal = buyPrice !== undefined ? parseFloat(buyPrice) : 0;
  if (isNaN(buyVal) || buyVal < 0) {
    return res.status(400).json({ error: "Buy price must be a non-negative number." });
  }

  const stockVal = stock !== undefined ? parseFloat(stock) : 0;
  if (isNaN(stockVal) || stockVal < 0) {
    return res.status(400).json({ error: "Stock must be a non-negative number." });
  }

  const minStockVal = minStock !== undefined ? parseFloat(minStock) : 0;
  if (isNaN(minStockVal) || minStockVal < 0) {
    return res.status(400).json({ error: "Minimum stock must be a non-negative number." });
  }

  const gstRateVal = gstRate !== undefined ? parseInt(gstRate) : 0;
  if (isNaN(gstRateVal) || gstRateVal < 0) {
    return res.status(400).json({ error: "GST rate must be a non-negative integer." });
  }

  const newProduct = db.insert('products', {
    name,
    barcode: barcode || "",
    category: category || "General",
    buyPrice: buyVal,
    sellPrice: sellVal,
    stock: stockVal,
    unit: unit || "Pcs",
    gstRate: gstRateVal,
    minStock: minStockVal
  });
  res.status(201).json(newProduct);
});

app.put('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

  const product = db.getById('products', id);
  if (!product) return res.status(404).json({ error: "Product not found." });

  const updatedFields = {};
  if (req.body.name !== undefined) updatedFields.name = req.body.name;
  if (req.body.barcode !== undefined) updatedFields.barcode = req.body.barcode;
  if (req.body.category !== undefined) updatedFields.category = req.body.category;
  if (req.body.unit !== undefined) updatedFields.unit = req.body.unit;

  if (req.body.sellPrice !== undefined) {
    const sellVal = parseFloat(req.body.sellPrice);
    if (isNaN(sellVal) || sellVal < 0) {
      return res.status(400).json({ error: "Selling price must be a non-negative number." });
    }
    updatedFields.sellPrice = sellVal;
  }
  if (req.body.buyPrice !== undefined) {
    const buyVal = parseFloat(req.body.buyPrice);
    if (isNaN(buyVal) || buyVal < 0) {
      return res.status(400).json({ error: "Buy price must be a non-negative number." });
    }
    updatedFields.buyPrice = buyVal;
  }
  if (req.body.stock !== undefined) {
    const stockVal = parseFloat(req.body.stock);
    if (isNaN(stockVal) || stockVal < 0) {
      return res.status(400).json({ error: "Stock must be a non-negative number." });
    }
    updatedFields.stock = stockVal;
  }
  if (req.body.minStock !== undefined) {
    const minStockVal = parseFloat(req.body.minStock);
    if (isNaN(minStockVal) || minStockVal < 0) {
      return res.status(400).json({ error: "Minimum stock must be a non-negative number." });
    }
    updatedFields.minStock = minStockVal;
  }
  if (req.body.gstRate !== undefined) {
    const gstRateVal = parseInt(req.body.gstRate);
    if (isNaN(gstRateVal) || gstRateVal < 0) {
      return res.status(400).json({ error: "GST rate must be a non-negative integer." });
    }
    updatedFields.gstRate = gstRateVal;
  }

  const updated = db.update('products', id, updatedFields);
  res.json(updated);
});

app.delete('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

  const success = db.delete('products', id);
  if (!success) return res.status(404).json({ error: "Product not found." });
  res.json({ success: true, message: "Product deleted successfully." });
});

// ==========================================
// 3. Customers Endpoints
// ==========================================
app.get('/api/customers', (req, res) => {
  res.json(db.get('customers'));
});

app.post('/api/customers', (req, res) => {
  const { name, phone, address, creditLimit, gstin } = req.body;
  if (!name) return res.status(400).json({ error: "Customer name is required." });

  let limitVal = 10000;
  if (creditLimit !== undefined) {
    limitVal = parseFloat(creditLimit);
    if (isNaN(limitVal) || limitVal < 0) {
      return res.status(400).json({ error: "Credit limit must be a non-negative number." });
    }
  }

  const newCustomer = db.insert('customers', {
    name,
    phone: phone || "",
    address: address || "",
    creditLimit: limitVal,
    balance: 0,
    gstin: gstin || ""
  });
  res.status(201).json(newCustomer);
});

app.put('/api/customers/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

  const customer = db.getById('customers', id);
  if (!customer) return res.status(404).json({ error: "Customer not found." });

  const updatedFields = {};
  if (req.body.name !== undefined) updatedFields.name = req.body.name;
  if (req.body.phone !== undefined) updatedFields.phone = req.body.phone;
  if (req.body.address !== undefined) updatedFields.address = req.body.address;
  if (req.body.gstin !== undefined) updatedFields.gstin = req.body.gstin;

  if (req.body.creditLimit !== undefined) {
    const limitVal = parseFloat(req.body.creditLimit);
    if (isNaN(limitVal) || limitVal < 0) {
      return res.status(400).json({ error: "Credit limit must be a non-negative number." });
    }
    updatedFields.creditLimit = limitVal;
  }

  const updated = db.update('customers', id, updatedFields);
  res.json(updated);
});

app.delete('/api/customers/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

  const success = db.delete('customers', id);
  if (!success) return res.status(404).json({ error: "Customer not found." });
  res.json({ success: true, message: "Customer profile deleted successfully." });
});

app.post('/api/customers/:id/pay', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

  const { amount, paymentMethod, remarks } = req.body;
  
  const payAmt = parseFloat(amount);
  if (isNaN(payAmt) || payAmt <= 0) {
    return res.status(400).json({ error: "Invalid payment amount. Must be a positive number." });
  }

  const customer = db.getById('customers', id);
  if (!customer) return res.status(404).json({ error: "Customer not found." });

  const originalBalance = customer.balance;
  const newBalance = Math.max(0, originalBalance - payAmt);

  db.update('customers', id, { balance: newBalance });

  const paymentRecord = db.insert('payments', {
    date: new Date().toISOString(),
    customerId: id,
    customerName: customer.name,
    amount: payAmt,
    paymentMethod: paymentMethod || "Cash",
    remarks: remarks || "Khata Payment Received"
  });

  res.json({
    success: true,
    message: `Payment of ₹${payAmt} recorded successfully.`,
    newBalance,
    payment: paymentRecord
  });
});

// ==========================================
// 4. Supplier Endpoints (NEW)
// ==========================================
app.get('/api/suppliers', (req, res) => {
  res.json(db.get('suppliers'));
});

app.post('/api/suppliers', (req, res) => {
  const { name, phone, address, gstin } = req.body;
  if (!name) return res.status(400).json({ error: "Supplier name is required." });

  const newSupplier = db.insert('suppliers', {
    name,
    phone: phone || "",
    address: address || "",
    gstin: gstin || "",
    balance: 0 // New suppliers start with 0 outstanding balance
  });
  res.status(201).json(newSupplier);
});

app.put('/api/suppliers/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

  const supplier = db.getById('suppliers', id);
  if (!supplier) return res.status(404).json({ error: "Supplier not found." });

  const updatedFields = {};
  if (req.body.name !== undefined) updatedFields.name = req.body.name;
  if (req.body.phone !== undefined) updatedFields.phone = req.body.phone;
  if (req.body.address !== undefined) updatedFields.address = req.body.address;
  if (req.body.gstin !== undefined) updatedFields.gstin = req.body.gstin;

  const updated = db.update('suppliers', id, updatedFields);
  res.json(updated);
});

app.post('/api/suppliers/:id/pay', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

  const { amount, paymentMethod, remarks } = req.body;

  const payAmt = parseFloat(amount);
  if (isNaN(payAmt) || payAmt <= 0) {
    return res.status(400).json({ error: "Invalid repayment amount. Must be a positive number." });
  }

  const supplier = db.getById('suppliers', id);
  if (!supplier) return res.status(404).json({ error: "Supplier not found." });

  const originalBalance = supplier.balance;
  const newBalance = Math.max(0, originalBalance - payAmt);

  // Deduct Zade Traders' outstanding payable to supplier
  db.update('suppliers', id, { balance: newBalance });

  // Record supplier payment log
  const paymentRecord = db.insert('supplier_payments', {
    date: new Date().toISOString(),
    supplierId: id,
    supplierName: supplier.name,
    amount: payAmt,
    paymentMethod: paymentMethod || "Bank Transfer",
    remarks: remarks || "Wholesale Repayment Made"
  });

  res.json({
    success: true,
    message: `Repayment of ₹${payAmt} to ${supplier.name} recorded.`,
    newBalance,
    payment: paymentRecord
  });
});

app.delete('/api/suppliers/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

  const success = db.delete('suppliers', id);
  if (!success) return res.status(404).json({ error: "Supplier not found." });
  res.json({ success: true, message: "Supplier profile deleted successfully." });
});

// ==========================================
// 5. Purchases & Material Shipments (NEW)
// ==========================================
app.get('/api/purchases', (req, res) => {
  res.json(db.get('purchases'));
});

app.post('/api/purchases', (req, res) => {
  const { supplierId, supplierName, items, subtotal, discount, gstTotal, total, paymentMethod, billType, supplierInvoiceNo } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cannot process purchase shipment with empty bill." });
  }

  // Validate items inside the purchase bill
  for (const item of items) {
    if (!item.productId || typeof item.qty !== 'number' || isNaN(item.qty) || item.qty <= 0) {
      return res.status(400).json({ error: "Each purchase item must have a valid productId and quantity greater than zero." });
    }
    if (typeof item.price !== 'number' || isNaN(item.price) || item.price < 0) {
      return res.status(400).json({ error: "Item price must be a non-negative number." });
    }
  }

  // Validate financial summaries
  const parsedSubtotal = parseFloat(subtotal);
  const parsedDiscount = parseFloat(discount);
  const parsedGstTotal = parseFloat(gstTotal);
  const parsedTotal = parseFloat(total);

  if (isNaN(parsedSubtotal) || parsedSubtotal < 0) return res.status(400).json({ error: "Subtotal must be a non-negative number." });
  if (isNaN(parsedDiscount) || parsedDiscount < 0) return res.status(400).json({ error: "Discount must be a non-negative number." });
  if (isNaN(parsedGstTotal) || parsedGstTotal < 0) return res.status(400).json({ error: "GST Total must be a non-negative number." });
  if (isNaN(parsedTotal) || parsedTotal < 0) return res.status(400).json({ error: "Total must be a non-negative number." });

  // Aggregate quantities by productId to prevent duplicate stock updates issues
  const qtyMap = {};
  for (const item of items) {
    qtyMap[item.productId] = (qtyMap[item.productId] || 0) + item.qty;
  }

  const productsList = db.get('products');
  for (const [productIdStr, qty] of Object.entries(qtyMap)) {
    const pId = parseInt(productIdStr);
    const prod = productsList.find(p => p.id === pId);
    if (!prod) {
      return res.status(400).json({ error: `Product ID ${pId} does not exist.` });
    }
  }

  // Increment stock in database
  for (const [productIdStr, qty] of Object.entries(qtyMap)) {
    const pId = parseInt(productIdStr);
    const prod = productsList.find(p => p.id === pId);
    db.update('products', pId, { stock: prod.stock + qty });
  }

  let isCredit = paymentMethod === 'Credit';
  let paymentStatus = isCredit ? 'Unpaid' : 'Paid';

  if (isCredit) {
    if (!supplierId || supplierId === 0) {
      return res.status(400).json({ error: "Supplier profile required to purchase on Credit." });
    }
    const supplier = db.getById('suppliers', supplierId);
    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found." });
    }
    // Update Zade Traders' outstanding payable balance to this supplier
    db.update('suppliers', supplierId, { balance: supplier.balance + parsedTotal });
  }

  const purchases = db.get('purchases');
  const count = purchases.length;
  const purchaseNo = `ZT-PUR-${String(count + 1).padStart(4, '0')}`;

  const purchaseRecord = db.insert('purchases', {
    purchaseNo,
    supplierInvoiceNo: supplierInvoiceNo || "",
    date: new Date().toISOString(),
    supplierId: supplierId || 0,
    supplierName: supplierName || "Cash Purchases / Local Supplier",
    items,
    subtotal: parsedSubtotal,
    discount: parsedDiscount,
    gstTotal: parsedGstTotal,
    total: parsedTotal,
    paymentMethod,
    paymentStatus,
    billType: billType || "GST"
  });

  res.status(201).json(purchaseRecord);
});

// ==========================================
// 6. Sales & Customer Billing Endpoints
// ==========================================
app.get('/api/sales', (req, res) => {
  res.json(db.get('sales'));
});

app.post('/api/sales', (req, res) => {
  const { customerId, customerName, items, subtotal, discount, gstTotal, total, paymentMethod, billType } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cannot process sale with empty cart." });
  }

  // Validate all items inside the cart
  for (const item of items) {
    if (!item.productId || typeof item.qty !== 'number' || isNaN(item.qty) || item.qty <= 0) {
      return res.status(400).json({ error: "Each cart item must have a valid productId and quantity greater than zero." });
    }
    if (typeof item.price !== 'number' || isNaN(item.price) || item.price < 0) {
      return res.status(400).json({ error: "Item price must be a non-negative number." });
    }
  }

  // Validate financial summaries
  const parsedSubtotal = parseFloat(subtotal);
  const parsedDiscount = parseFloat(discount);
  const parsedGstTotal = parseFloat(gstTotal);
  const parsedTotal = parseFloat(total);

  if (isNaN(parsedSubtotal) || parsedSubtotal < 0) return res.status(400).json({ error: "Subtotal must be a non-negative number." });
  if (isNaN(parsedDiscount) || parsedDiscount < 0) return res.status(400).json({ error: "Discount must be a non-negative number." });
  if (isNaN(parsedGstTotal) || parsedGstTotal < 0) return res.status(400).json({ error: "GST Total must be a non-negative number." });
  if (isNaN(parsedTotal) || parsedTotal < 0) return res.status(400).json({ error: "Total must be a non-negative number." });

  // Aggregate quantities by productId to prevent duplicate stock checks from bypassing stock limits
  const qtyMap = {};
  for (const item of items) {
    qtyMap[item.productId] = (qtyMap[item.productId] || 0) + item.qty;
  }

  const productsList = db.get('products');
  for (const [productIdStr, qty] of Object.entries(qtyMap)) {
    const pId = parseInt(productIdStr);
    const prod = productsList.find(p => p.id === pId);
    if (!prod) {
      return res.status(400).json({ error: `Product ID ${pId} not found.` });
    }
    if (prod.stock < qty) {
      return res.status(400).json({ error: `Insufficient stock for ${prod.name}. Available: ${prod.stock} ${prod.unit}, requested: ${qty}` });
    }
  }

  // Deduct stock in database
  for (const [productIdStr, qty] of Object.entries(qtyMap)) {
    const pId = parseInt(productIdStr);
    const prod = productsList.find(p => p.id === pId);
    db.update('products', pId, { stock: prod.stock - qty });
  }

  let isCredit = paymentMethod === 'Khata';
  let paymentStatus = isCredit ? 'Unpaid' : 'Paid';

  if (isCredit) {
    if (!customerId || customerId === 0) {
      return res.status(400).json({ error: "Customer selection required for Khata credit billing." });
    }
    const customer = db.getById('customers', customerId);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found." });
    }
    if (customer.balance + parsedTotal > customer.creditLimit) {
      return res.status(400).json({ 
        error: `Credit limit exceeded! Customer owes ₹${customer.balance}. Credit limit is ₹${customer.creditLimit}. Transaction total of ₹${parsedTotal} will exceed limit.` 
      });
    }
    db.update('customers', customerId, { balance: customer.balance + parsedTotal });
  }

  const sales = db.get('sales');
  const count = sales.length;
  const invoiceNo = `ZT-2026-${String(count + 1).padStart(4, '0')}`;

  const saleRecord = db.insert('sales', {
    invoiceNo,
    date: new Date().toISOString(),
    customerId: customerId || 0,
    customerName: customerName || "Cash Customer",
    items,
    subtotal: parsedSubtotal,
    discount: parsedDiscount,
    gstTotal: parsedGstTotal,
    total: parsedTotal,
    paymentMethod,
    paymentStatus,
    billType: billType || "GST"
  });

  res.status(201).json(saleRecord);
});

// ==========================================
// 7. General Transactions Logs
// ==========================================
app.get('/api/payments', (req, res) => {
  res.json(db.get('payments'));
});

app.get('/api/supplier_payments', (req, res) => {
  res.json(db.get('supplier_payments'));
});

// ==========================================
// 8. Dashboard Analytics & Financial Ledger
// ==========================================
app.get('/api/dashboard', (req, res) => {
  const sales = db.get('sales');
  const products = db.get('products');
  const customers = db.get('customers');
  const suppliers = db.get('suppliers');
  const purchases = db.get('purchases');

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const totalOutstandingCredit = customers.reduce((sum, c) => sum + c.balance, 0);
  const totalOutstandingSupplierCredit = suppliers.reduce((sum, s) => sum + s.balance, 0);
  const lowStockCount = products.filter(p => p.stock <= p.minStock).length;

  const today = new Date().toISOString().substring(0, 10);
  const todaySales = sales
    .filter(s => s.date.substring(0, 10) === today)
    .reduce((sum, s) => sum + s.total, 0);

  // Sales Trend line graph (7 Days)
  const salesChartData = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().substring(0, 10);
    salesChartData[dateStr] = 0;
  }
  sales.forEach(s => {
    const dateStr = s.date.substring(0, 10);
    if (salesChartData[dateStr] !== undefined) {
      salesChartData[dateStr] += s.total;
    }
  });

  const chartLabels = Object.keys(salesChartData).map(dateStr => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}`;
  });
  const chartValues = Object.values(salesChartData);

  // Payments split
  const paymentDistribution = { Cash: 0, UPI: 0, Khata: 0 };
  sales.forEach(s => {
    if (paymentDistribution[s.paymentMethod] !== undefined) {
      paymentDistribution[s.paymentMethod] += s.total;
    }
  });

  // Recent feeds
  const recentTransactions = [...sales].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  const recentPurchases = [...purchases].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  res.json({
    totalRevenue,
    todaySales,
    totalOutstandingCredit, // Customer receivables
    totalOutstandingSupplierCredit, // Supplier payables
    lowStockCount,
    salesChart: {
      labels: chartLabels,
      data: chartValues
    },
    paymentDistribution,
    recentTransactions,
    recentPurchases
  });
});

// ==========================================
// 9. System Administrative Actions (NEW)
// ==========================================
app.post('/api/system/reset', (req, res) => {
  const success = db.reset();
  if (!success) return res.status(500).json({ error: "Failed to reset database on disk." });
  res.json({ success: true, message: "Database reset to factory defaults successfully." });
});

app.get('/api/system/backup', (req, res) => {
  res.json(db.data);
});

app.post('/api/system/restore', (req, res) => {
  const backup = req.body;
  if (!backup || !backup.products || !backup.customers || !backup.suppliers || !backup.sales) {
    return res.status(400).json({ error: "Invalid backup file structure." });
  }
  
  // Capture current user table to avoid locking out the operator
  const currentUsers = db.get('users');
  
  // If backup has a non-empty users table, keep it, otherwise restore the current users
  if (!backup.users || !Array.isArray(backup.users) || backup.users.length === 0) {
    backup.users = currentUsers.length > 0 ? currentUsers : [
      { id: 1, username: "admin", passwordHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9" } // SHA-256 of "admin123"
    ];
  }
  
  db.data = backup;
  const success = db.save();
  if (!success) return res.status(500).json({ error: "Failed to write backup to disk." });
  res.json({ success: true, message: "Database backup restored successfully." });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  Zade Traders POS Server is running locally!`);
  console.log(`  Access URL: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
