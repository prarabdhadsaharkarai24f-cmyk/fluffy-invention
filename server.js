const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

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
  if (!name || !sellPrice) {
    return res.status(400).json({ error: "Product name and selling price are required." });
  }
  const newProduct = db.insert('products', {
    name,
    barcode: barcode || "",
    category: category || "General",
    buyPrice: parseFloat(buyPrice) || 0,
    sellPrice: parseFloat(sellPrice) || 0,
    stock: parseFloat(stock) || 0,
    unit: unit || "Pcs",
    gstRate: parseInt(gstRate) || 0,
    minStock: parseFloat(minStock) || 0
  });
  res.status(201).json(newProduct);
});

app.put('/api/products/:id', (req, res) => {
  const id = req.params.id;
  const product = db.getById('products', id);
  if (!product) return res.status(404).json({ error: "Product not found." });

  const updatedFields = {};
  if (req.body.name !== undefined) updatedFields.name = req.body.name;
  if (req.body.barcode !== undefined) updatedFields.barcode = req.body.barcode;
  if (req.body.category !== undefined) updatedFields.category = req.body.category;
  if (req.body.buyPrice !== undefined) updatedFields.buyPrice = parseFloat(req.body.buyPrice) || 0;
  if (req.body.sellPrice !== undefined) updatedFields.sellPrice = parseFloat(req.body.sellPrice) || 0;
  if (req.body.stock !== undefined) updatedFields.stock = parseFloat(req.body.stock) || 0;
  if (req.body.unit !== undefined) updatedFields.unit = req.body.unit;
  if (req.body.gstRate !== undefined) updatedFields.gstRate = parseInt(req.body.gstRate) || 0;
  if (req.body.minStock !== undefined) updatedFields.minStock = parseFloat(req.body.minStock) || 0;

  const updated = db.update('products', id, updatedFields);
  res.json(updated);
});

app.delete('/api/products/:id', (req, res) => {
  const success = db.delete('products', req.params.id);
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
  const { name, phone, address, creditLimit } = req.body;
  if (!name) return res.status(400).json({ error: "Customer name is required." });

  const newCustomer = db.insert('customers', {
    name,
    phone: phone || "",
    address: address || "",
    creditLimit: parseFloat(creditLimit) || 10000,
    balance: 0
  });
  res.status(201).json(newCustomer);
});

app.put('/api/customers/:id', (req, res) => {
  const id = req.params.id;
  const customer = db.getById('customers', id);
  if (!customer) return res.status(404).json({ error: "Customer not found." });

  const updatedFields = {};
  if (req.body.name !== undefined) updatedFields.name = req.body.name;
  if (req.body.phone !== undefined) updatedFields.phone = req.body.phone;
  if (req.body.address !== undefined) updatedFields.address = req.body.address;
  if (req.body.creditLimit !== undefined) updatedFields.creditLimit = parseFloat(req.body.creditLimit) || 0;

  const updated = db.update('customers', id, updatedFields);
  res.json(updated);
});

app.post('/api/customers/:id/pay', (req, res) => {
  const id = parseInt(req.params.id);
  const { amount, paymentMethod, remarks } = req.body;
  
  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: "Invalid payment amount." });
  }

  const customer = db.getById('customers', id);
  if (!customer) return res.status(404).json({ error: "Customer not found." });

  const payAmt = parseFloat(amount);
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
  const id = req.params.id;
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
  const { amount, paymentMethod, remarks } = req.body;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: "Invalid repayment amount." });
  }

  const supplier = db.getById('suppliers', id);
  if (!supplier) return res.status(404).json({ error: "Supplier not found." });

  const payAmt = parseFloat(amount);
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
  const success = db.delete('suppliers', req.params.id);
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
  const { supplierId, supplierName, items, subtotal, discount, gstTotal, total, paymentMethod } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: "Cannot process purchase shipment with empty bill." });
  }

  // Verify and increment stocks
  const productsList = db.get('products');
  for (const item of items) {
    const prod = productsList.find(p => p.id === item.productId);
    if (!prod) {
      return res.status(400).json({ error: `Product ID ${item.productId} does not exist.` });
    }
  }

  // Increment stock in database
  for (const item of items) {
    const prod = productsList.find(p => p.id === item.productId);
    db.update('products', prod.id, { stock: prod.stock + item.qty });
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
    db.update('suppliers', supplierId, { balance: supplier.balance + total });
  }

  const purchases = db.get('purchases');
  const count = purchases.length;
  const purchaseNo = `ZT-PUR-${String(count + 1).padStart(4, '0')}`;

  const purchaseRecord = db.insert('purchases', {
    purchaseNo,
    date: new Date().toISOString(),
    supplierId: supplierId || 0,
    supplierName: supplierName || "Cash Purchases / Local Supplier",
    items,
    subtotal: parseFloat(subtotal) || 0,
    discount: parseFloat(discount) || 0,
    gstTotal: parseFloat(gstTotal) || 0,
    total: parseFloat(total) || 0,
    paymentMethod,
    paymentStatus
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
  const { customerId, customerName, items, subtotal, discount, gstTotal, total, paymentMethod } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: "Cannot process sale with empty cart." });
  }

  const productsList = db.get('products');
  for (const item of items) {
    const prod = productsList.find(p => p.id === item.productId);
    if (!prod) {
      return res.status(400).json({ error: `Product ID ${item.productId} not found.` });
    }
    if (prod.stock < item.qty) {
      return res.status(400).json({ error: `Insufficient stock for ${prod.name}. Available: ${prod.stock} ${prod.unit}` });
    }
  }

  for (const item of items) {
    const prod = productsList.find(p => p.id === item.productId);
    db.update('products', prod.id, { stock: prod.stock - item.qty });
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
    if (customer.balance + total > customer.creditLimit) {
      return res.status(400).json({ 
        error: `Credit limit exceeded! Customer owes ₹${customer.balance}. Credit limit is ₹${customer.creditLimit}. Transaction total of ₹${total} will exceed limit.` 
      });
    }
    db.update('customers', customerId, { balance: customer.balance + total });
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
    subtotal: parseFloat(subtotal) || 0,
    discount: parseFloat(discount) || 0,
    gstTotal: parseFloat(gstTotal) || 0,
    total: parseFloat(total) || 0,
    paymentMethod,
    paymentStatus
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
