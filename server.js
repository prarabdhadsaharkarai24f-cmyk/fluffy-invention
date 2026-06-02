require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'zade_traders_pos_jwt_secret_key_2026';

// Global error logging function
const logError = (err, context = '') => {
  console.error(`[Error][${context}]`, err);
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const logPath = path.join(dataDir, 'error.log');
    const timestamp = new Date().toISOString();
    const errMsg = `[${timestamp}] [Context: ${context}] ${err.stack || err}\n`;
    fs.appendFileSync(logPath, errMsg, 'utf8');
  } catch (e) {
    console.error("Failed writing to error log file:", e);
  }
};

// Rate Limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per 15 minutes for login
  message: { error: "Too many login attempts. Please try again after 15 minutes." }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
  message: { error: "Too many requests. Please try again later." }
});

// Request body validation middleware builder
const validateBody = (schema) => {
  return (req, res, next) => {
    for (const [field, rules] of Object.entries(schema)) {
      const val = req.body[field];
      if (rules.required && (val === undefined || val === null || val === '')) {
        return res.status(400).json({ error: `${field} is required.` });
      }
      if (val !== undefined && val !== null && val !== '') {
        if (rules.type === 'number') {
          const num = parseFloat(val);
          if (isNaN(num)) {
            return res.status(400).json({ error: `${field} must be a number.` });
          }
          if (rules.min !== undefined && num < rules.min) {
            return res.status(400).json({ error: `${field} must be at least ${rules.min}.` });
          }
        }
        if (rules.type === 'integer') {
          const num = parseInt(val);
          if (isNaN(num)) {
            return res.status(400).json({ error: `${field} must be an integer.` });
          }
          if (rules.min !== undefined && num < rules.min) {
            return res.status(400).json({ error: `${field} must be at least ${rules.min}.` });
          }
        }
      }
    }
    next();
  };
};

// Define Validation Schemas
const loginSchema = {
  username: { required: true },
  password: { required: true }
};

const productSchema = {
  name: { required: true },
  sellPrice: { required: true, type: 'number', min: 0 },
  buyPrice: { type: 'number', min: 0 },
  stock: { type: 'number', min: 0 },
  minStock: { type: 'number', min: 0 },
  gstRate: { type: 'integer', min: 0 }
};

const customerSchema = {
  name: { required: true },
  creditLimit: { type: 'number', min: 0 }
};

const supplierSchema = {
  name: { required: true }
};

const paymentSchema = {
  amount: { required: true, type: 'number', min: 0.01 }
};

// Token helpers
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

// Apply rate limits: login specific vs general APIs
app.use('/api/', (req, res, next) => {
  if (req.path === '/auth/login') {
    return next();
  }
  apiLimiter(req, res, next);
});

app.use(authenticateToken);
app.use(express.static(__dirname));

// ==========================================
// Auth Endpoint
// ==========================================
app.post('/api/auth/login', loginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const users = await db.get('users');
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const isMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const exp = Date.now() + 12 * 60 * 60 * 1000; // 12 Hours expiration
    const token = generateToken({ id: user.id, username: user.username, exp });

    await db.logAudit(user.username, 'LOGIN', 'Successfully logged in');
    res.json({ success: true, token, user: { id: user.id, username: user.username } });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 1. Settings Endpoints
// ==========================================
app.get('/api/settings', async (req, res, next) => {
  try {
    const settings = await db.getSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

app.put('/api/settings', async (req, res, next) => {
  try {
    const updated = await db.updateSettings(req.body);
    await db.logAudit(req.user?.username, 'UPDATE_SETTINGS', JSON.stringify(req.body));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 2. Products Endpoints
// ==========================================
app.get('/api/products', async (req, res, next) => {
  try {
    const products = await db.get('products');
    res.json(products);
  } catch (err) {
    next(err);
  }
});

app.post('/api/products', validateBody(productSchema), async (req, res, next) => {
  try {
    const { name, barcode, category, buyPrice, sellPrice, stock, unit, gstRate, minStock } = req.body;
    const buyVal = buyPrice !== undefined ? parseFloat(buyPrice) : 0;
    const sellVal = parseFloat(sellPrice);
    const stockVal = stock !== undefined ? parseFloat(stock) : 0;
    const minStockVal = minStock !== undefined ? parseFloat(minStock) : 0;
    const gstRateVal = gstRate !== undefined ? parseInt(gstRate) : 0;

    const newProduct = await db.insert('products', {
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
    await db.logAudit(req.user?.username, 'CREATE_PRODUCT', `Created product: ${name} (ID: ${newProduct.id})`);
    res.status(201).json(newProduct);
  } catch (err) {
    next(err);
  }
});

app.put('/api/products/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

    const product = await db.getById('products', id);
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

    const updated = await db.update('products', id, updatedFields);
    await db.logAudit(req.user?.username, 'UPDATE_PRODUCT', `Updated ID: ${id}, Fields: ${JSON.stringify(updatedFields)}`);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/products/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

    const success = await db.delete('products', id);
    if (!success) return res.status(404).json({ error: "Product not found." });
    
    await db.logAudit(req.user?.username, 'DELETE_PRODUCT', `Deleted product ID: ${id}`);
    res.json({ success: true, message: "Product deleted successfully." });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 3. Customers Endpoints
// ==========================================
app.get('/api/customers', async (req, res, next) => {
  try {
    const customers = await db.get('customers');
    res.json(customers);
  } catch (err) {
    next(err);
  }
});

app.post('/api/customers', validateBody(customerSchema), async (req, res, next) => {
  try {
    const { name, phone, address, creditLimit, gstin } = req.body;
    let limitVal = 10000;
    if (creditLimit !== undefined) {
      limitVal = parseFloat(creditLimit);
    }

    const newCustomer = await db.insert('customers', {
      name,
      phone: phone || "",
      address: address || "",
      creditLimit: limitVal,
      balance: 0,
      gstin: gstin || ""
    });
    
    await db.logAudit(req.user?.username, 'CREATE_CUSTOMER', `Created customer: ${name} (ID: ${newCustomer.id})`);
    res.status(201).json(newCustomer);
  } catch (err) {
    next(err);
  }
});

app.put('/api/customers/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

    const customer = await db.getById('customers', id);
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

    const updated = await db.update('customers', id, updatedFields);
    await db.logAudit(req.user?.username, 'UPDATE_CUSTOMER', `Updated customer ID: ${id}, Fields: ${JSON.stringify(updatedFields)}`);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/customers/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

    const success = await db.delete('customers', id);
    if (!success) return res.status(404).json({ error: "Customer not found." });
    
    await db.logAudit(req.user?.username, 'DELETE_CUSTOMER', `Deleted customer ID: ${id}`);
    res.json({ success: true, message: "Customer profile deleted successfully." });
  } catch (err) {
    next(err);
  }
});

app.post('/api/customers/:id/pay', validateBody(paymentSchema), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

    const { amount, paymentMethod, remarks } = req.body;
    const payAmt = parseFloat(amount);

    const customer = await db.getById('customers', id);
    if (!customer) return res.status(404).json({ error: "Customer not found." });

    const originalBalance = customer.balance;
    const newBalance = Math.max(0, originalBalance - payAmt);

    await db.update('customers', id, { balance: newBalance });

    const paymentRecord = await db.insert('payments', {
      date: new Date().toISOString(),
      customerId: id,
      customerName: customer.name,
      amount: payAmt,
      paymentMethod: paymentMethod || "Cash",
      remarks: remarks || "Khata Payment Received"
    });

    await db.logAudit(req.user?.username, 'CUSTOMER_PAYMENT', `Recorded customer payment of ₹${payAmt} for ID: ${id}. New Balance: ₹${newBalance}`);

    res.json({
      success: true,
      message: `Payment of ₹${payAmt} recorded successfully.`,
      newBalance,
      payment: paymentRecord
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 4. Supplier Endpoints
// ==========================================
app.get('/api/suppliers', async (req, res, next) => {
  try {
    const suppliers = await db.get('suppliers');
    res.json(suppliers);
  } catch (err) {
    next(err);
  }
});

app.post('/api/suppliers', validateBody(supplierSchema), async (req, res, next) => {
  try {
    const { name, phone, address, gstin } = req.body;

    const newSupplier = await db.insert('suppliers', {
      name,
      phone: phone || "",
      address: address || "",
      gstin: gstin || "",
      balance: 0
    });
    
    await db.logAudit(req.user?.username, 'CREATE_SUPPLIER', `Created supplier: ${name} (ID: ${newSupplier.id})`);
    res.status(201).json(newSupplier);
  } catch (err) {
    next(err);
  }
});

app.put('/api/suppliers/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

    const supplier = await db.getById('suppliers', id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found." });

    const updatedFields = {};
    if (req.body.name !== undefined) updatedFields.name = req.body.name;
    if (req.body.phone !== undefined) updatedFields.phone = req.body.phone;
    if (req.body.address !== undefined) updatedFields.address = req.body.address;
    if (req.body.gstin !== undefined) updatedFields.gstin = req.body.gstin;

    const updated = await db.update('suppliers', id, updatedFields);
    await db.logAudit(req.user?.username, 'UPDATE_SUPPLIER', `Updated supplier ID: ${id}, Fields: ${JSON.stringify(updatedFields)}`);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.post('/api/suppliers/:id/pay', validateBody(paymentSchema), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

    const { amount, paymentMethod, remarks } = req.body;
    const payAmt = parseFloat(amount);

    const supplier = await db.getById('suppliers', id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found." });

    const originalBalance = supplier.balance;
    const newBalance = Math.max(0, originalBalance - payAmt);

    await db.update('suppliers', id, { balance: newBalance });

    const paymentRecord = await db.insert('supplier_payments', {
      date: new Date().toISOString(),
      supplierId: id,
      supplierName: supplier.name,
      amount: payAmt,
      paymentMethod: paymentMethod || "Bank Transfer",
      remarks: remarks || "Wholesale Repayment Made"
    });

    await db.logAudit(req.user?.username, 'SUPPLIER_PAYMENT', `Recorded payment of ₹${payAmt} to supplier ID: ${id}. New Balance: ₹${newBalance}`);

    res.json({
      success: true,
      message: `Repayment of ₹${payAmt} to ${supplier.name} recorded.`,
      newBalance,
      payment: paymentRecord
    });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/suppliers/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter." });

    const success = await db.delete('suppliers', id);
    if (!success) return res.status(404).json({ error: "Supplier not found." });
    
    await db.logAudit(req.user?.username, 'DELETE_SUPPLIER', `Deleted supplier ID: ${id}`);
    res.json({ success: true, message: "Supplier profile deleted successfully." });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 5. Purchases & Material Shipments
// ==========================================
app.get('/api/purchases', async (req, res, next) => {
  try {
    const purchases = await db.get('purchases');
    res.json(purchases);
  } catch (err) {
    next(err);
  }
});

app.post('/api/purchases', async (req, res, next) => {
  try {
    const { supplierId, supplierName, items, subtotal, discount, gstTotal, total, paymentMethod, billType, supplierInvoiceNo } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cannot process purchase shipment with empty bill." });
    }

    // Validate items
    for (const item of items) {
      if (!item.productId || typeof item.qty !== 'number' || isNaN(item.qty) || item.qty <= 0) {
        return res.status(400).json({ error: "Each purchase item must have a valid productId and quantity greater than zero." });
      }
      if (typeof item.price !== 'number' || isNaN(item.price) || item.price < 0) {
        return res.status(400).json({ error: "Item price must be a non-negative number." });
      }
    }

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

    const productsList = await db.get('products');
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
      await db.update('products', pId, { stock: prod.stock + qty });
    }

    let isCredit = paymentMethod === 'Credit';
    let paymentStatus = isCredit ? 'Unpaid' : 'Paid';

    if (isCredit) {
      if (!supplierId || supplierId === 0) {
        return res.status(400).json({ error: "Supplier profile required to purchase on Credit." });
      }
      const supplier = await db.getById('suppliers', supplierId);
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found." });
      }
      await db.update('suppliers', supplierId, { balance: supplier.balance + parsedTotal });
    }

    const purchases = await db.get('purchases');
    const count = purchases.length;
    const purchaseNo = `ZT-PUR-${String(count + 1).padStart(4, '0')}`;

    const purchaseRecord = await db.insert('purchases', {
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

    await db.logAudit(req.user?.username, 'CREATE_PURCHASE', `Created purchase invoice: ${purchaseNo} (Total: ₹${parsedTotal})`);

    res.status(201).json(purchaseRecord);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 6. Sales & Customer Billing Endpoints
// ==========================================
app.get('/api/sales', async (req, res, next) => {
  try {
    const sales = await db.get('sales');
    res.json(sales);
  } catch (err) {
    next(err);
  }
});

app.post('/api/sales', async (req, res, next) => {
  try {
    const { customerId, customerName, items, subtotal, discount, gstTotal, total, paymentMethod, billType } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cannot process sale with empty cart." });
    }

    // Validate items inside the cart
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

    const productsList = await db.get('products');
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
      await db.update('products', pId, { stock: prod.stock - qty });
    }

    let isCredit = paymentMethod === 'Khata';
    let paymentStatus = isCredit ? 'Unpaid' : 'Paid';

    if (isCredit) {
      if (!customerId || customerId === 0) {
        return res.status(400).json({ error: "Customer selection required for Khata credit billing." });
      }
      const customer = await db.getById('customers', customerId);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found." });
      }
      if (customer.balance + parsedTotal > customer.creditLimit) {
        return res.status(400).json({ 
          error: `Credit limit exceeded! Customer owes ₹${customer.balance}. Credit limit is ₹${customer.creditLimit}. Transaction total of ₹${parsedTotal} will exceed limit.` 
        });
      }
      await db.update('customers', customerId, { balance: customer.balance + parsedTotal });
    }

    const sales = await db.get('sales');
    const count = sales.length;
    const invoiceNo = `ZT-2026-${String(count + 1).padStart(4, '0')}`;

    const saleRecord = await db.insert('sales', {
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

    await db.logAudit(req.user?.username, 'CREATE_SALE', `Created sale invoice: ${invoiceNo} (Total: ₹${parsedTotal})`);

    res.status(201).json(saleRecord);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 7. General Transactions Logs
// ==========================================
app.get('/api/payments', async (req, res, next) => {
  try {
    const payments = await db.get('payments');
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

app.get('/api/supplier_payments', async (req, res, next) => {
  try {
    const payments = await db.get('supplier_payments');
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 8. Dashboard Analytics & Financial Ledger
// ==========================================
app.get('/api/dashboard', async (req, res, next) => {
  try {
    const sales = await db.get('sales');
    const products = await db.get('products');
    const customers = await db.get('customers');
    const suppliers = await db.get('suppliers');
    const purchases = await db.get('purchases');

    const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
    const totalOutstandingCredit = customers.reduce((sum, c) => sum + c.balance, 0);
    const totalOutstandingSupplierCredit = suppliers.reduce((sum, s) => sum + s.balance, 0);
    const lowStockCount = products.filter(p => p.stock <= p.minStock).length;

    const today = new Date().toISOString().substring(0, 10);
    const todaySales = sales
      .filter(s => s.date && s.date.substring(0, 10) === today)
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
      if (s.date) {
        const dateStr = s.date.substring(0, 10);
        if (salesChartData[dateStr] !== undefined) {
          salesChartData[dateStr] += s.total;
        }
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
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 9. System Administrative Actions
// ==========================================
app.post('/api/system/reset', async (req, res, next) => {
  try {
    const success = await db.reset();
    if (!success) return res.status(500).json({ error: "Failed to reset database on disk." });
    await db.logAudit(req.user?.username, 'RESET_DATABASE', 'Reset database to factory seeds');
    res.json({ success: true, message: "Database reset to factory defaults successfully." });
  } catch (err) {
    next(err);
  }
});

app.get('/api/system/backup', async (req, res, next) => {
  try {
    const backup = await db.getBackupData();
    res.json(backup);
  } catch (err) {
    next(err);
  }
});

app.post('/api/system/restore', async (req, res, next) => {
  try {
    const backup = req.body;
    if (!backup || !backup.products || !backup.customers || !backup.suppliers || !backup.sales) {
      return res.status(400).json({ error: "Invalid backup file structure." });
    }

    const currentUsers = await db.get('users');
    if (!backup.users || !Array.isArray(backup.users) || backup.users.length === 0) {
      backup.users = currentUsers.length > 0 ? currentUsers : [
        { id: 1, username: "admin", passwordHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9" }
      ];
    }

    const success = await db.restore(backup);
    if (!success) return res.status(500).json({ error: "Failed to write backup to disk." });
    await db.logAudit(req.user?.username, 'RESTORE_DATABASE', 'Restored database from external backup');
    res.json({ success: true, message: "Database backup restored successfully." });
  } catch (err) {
    next(err);
  }
});

// Global error handling middleware
app.use((err, req, res, next) => {
  logError(err, `${req.method} ${req.url}`);
  res.status(500).json({ error: "An internal server error occurred." });
});

// Initialize database and start server
(async () => {
  try {
    await db.init();
    console.log("Database initialized successfully.");
    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`  Zade Traders POS Server is running locally!`);
      console.log(`  Access URL: http://localhost:${PORT}`);
      console.log(`====================================================`);
    });
  } catch (error) {
    logError(error, "Server database initialization");
    process.exit(1);
  }
})();
