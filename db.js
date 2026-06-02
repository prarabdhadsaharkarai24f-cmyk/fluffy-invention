const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

class SQLiteDatabase {
  constructor() {
    this.dbFile = process.env.DB_PATH || path.join(__dirname, 'data', 'pos.db');
    this.dbDir = path.dirname(this.dbFile);
    this.db = null;
  }

  async init() {
    try {
      if (!fs.existsSync(this.dbDir)) {
        fs.mkdirSync(this.dbDir, { recursive: true });
      }
      this.db = await open({
        filename: this.dbFile,
        driver: sqlite3.Database
      });
    } catch (err) {
      console.error(`Failed to initialize database at ${this.dbFile}:`, err.message);
      console.warn("Falling back to relative local data directory.");
      this.dbFile = path.join(__dirname, 'data', 'pos.db');
      this.dbDir = path.dirname(this.dbFile);
      try {
        if (!fs.existsSync(this.dbDir)) {
          fs.mkdirSync(this.dbDir, { recursive: true });
        }
        this.db = await open({
          filename: this.dbFile,
          driver: sqlite3.Database
        });
      } catch (fallbackErr) {
        console.error("Critical: Failed to initialize fallback database:", fallbackErr.message);
        throw fallbackErr;
      }
    }

    // Enable foreign keys
    await this.db.run('PRAGMA foreign_keys = ON');

    // Create tables if they do not exist
    await this.createTables();
  }

  async createTables() {
    // 1. settings table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY,
        shopName TEXT,
        address TEXT,
        phone TEXT,
        gstin TEXT,
        upiId TEXT,
        currency TEXT
      )
    `);

    // 2. users table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        passwordHash TEXT
      )
    `);

    // 3. products table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        barcode TEXT,
        category TEXT,
        buyPrice REAL,
        sellPrice REAL,
        stock REAL,
        unit TEXT,
        gstRate INTEGER,
        minStock REAL
      )
    `);

    // 4. suppliers table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        gstin TEXT,
        balance REAL
      )
    `);

    // 5. customers table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        creditLimit REAL,
        balance REAL,
        gstin TEXT
      )
    `);

    // 6. sales table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceNo TEXT UNIQUE,
        date TEXT,
        customerId INTEGER,
        customerName TEXT,
        items TEXT,
        subtotal REAL,
        discount REAL,
        gstTotal REAL,
        total REAL,
        paymentMethod TEXT,
        paymentStatus TEXT,
        billType TEXT
      )
    `);

    // 7. purchases table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchaseNo TEXT UNIQUE,
        supplierInvoiceNo TEXT,
        date TEXT,
        supplierId INTEGER,
        supplierName TEXT,
        items TEXT,
        subtotal REAL,
        discount REAL,
        gstTotal REAL,
        total REAL,
        paymentMethod TEXT,
        paymentStatus TEXT,
        billType TEXT
      )
    `);

    // 8. payments table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        customerId INTEGER,
        customerName TEXT,
        amount REAL,
        paymentMethod TEXT,
        remarks TEXT
      )
    `);

    // 9. supplier_payments table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        supplierId INTEGER,
        supplierName TEXT,
        amount REAL,
        paymentMethod TEXT,
        remarks TEXT
      )
    `);

    // 10. audit_logs table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        user TEXT,
        action TEXT,
        details TEXT
      )
    `);

    // Seed data if settings is empty
    const settingsCount = await this.db.get('SELECT COUNT(*) as count FROM settings');
    if (settingsCount.count === 0) {
      await this.seedDefaultData();
    }
  }

  async seedDefaultData() {
    console.log("Seeding default data into SQLite database...");
    
    // Seed settings
    await this.db.run(`
      INSERT INTO settings (id, shopName, address, phone, gstin, upiId, currency)
      VALUES (1, 'Zade Traders', 'MIDC Road, Near Main Chowk, Umred - 441203', '+91 94228 12345', '27GHIJK5678L1Z9', 'zadetraders@okaxis', '₹')
    `);

    // Seed users (hash admin123 with bcryptjs)
    const salt = bcrypt.genSaltSync(10);
    const adminHash = bcrypt.hashSync('admin123', salt);
    await this.db.run(`
      INSERT INTO users (username, passwordHash)
      VALUES ('admin', ?)
    `, [adminHash]);

    // Seed products
    const products = [
      { name: "ACC Gold Cement (50kg Bag)", barcode: "8901234100015", category: "Cement", buyPrice: 380, sellPrice: 430, stock: 500, unit: "Bag", gstRate: 28, minStock: 50 },
      { name: "TMT Steel Bars 12mm (per Ton)", barcode: "8901234100022", category: "Steel", buyPrice: 52000, sellPrice: 58000, stock: 5.5, unit: "Ton", gstRate: 18, minStock: 1 },
      { name: "Red Clay Bricks (1000 Pcs)", barcode: "8901234100039", category: "Bricks", buyPrice: 6000, sellPrice: 7500, stock: 15, unit: "1k Pcs", gstRate: 5, minStock: 3 },
      { name: "Fine Ganga Sand (per Brass)", barcode: "8901234100046", category: "Aggregates", buyPrice: 5500, sellPrice: 6500, stock: 8, unit: "Brass", gstRate: 5, minStock: 2 },
      { name: "Asian Paints Apex White (20L)", barcode: "8901234100053", category: "Paints", buyPrice: 4100, sellPrice: 4800, stock: 25, unit: "Bkt", gstRate: 18, minStock: 5 },
      { name: "PVC Pipe 4-inch (Premium 6m)", barcode: "8901234100060", category: "Plumbing", buyPrice: 320, sellPrice: 450, stock: 120, unit: "Pcs", gstRate: 18, minStock: 20 }
    ];
    for (const p of products) {
      await this.db.run(`
        INSERT INTO products (name, barcode, category, buyPrice, sellPrice, stock, unit, gstRate, minStock)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [p.name, p.barcode, p.category, p.buyPrice, p.sellPrice, p.stock, p.unit, p.gstRate, p.minStock]);
    }

    // Seed suppliers
    const suppliers = [
      { name: "Nagpur Cement Distributors", phone: "+91 98222 98765", address: "Cement Depot, MIDC, Nagpur", gstin: "27AAAAA1111A1Z1", balance: 45000 },
      { name: "Jindal Steel Depot (Umred)", phone: "+91 99234 44321", address: "MIDC Area, Plot No. 12, Umred", gstin: "27BBBBB2222B1Z2", balance: 120000 },
      { name: "Local Bricks Kiln (Umred)", phone: "+91 94217 66554", address: "Girad Road, Umred", gstin: "", balance: 0 }
    ];
    for (const s of suppliers) {
      await this.db.run(`
        INSERT INTO suppliers (name, phone, address, gstin, balance)
        VALUES (?, ?, ?, ?, ?)
      `, [s.name, s.phone, s.address, s.gstin, s.balance]);
    }

    // Seed customers
    const customers = [
      { name: "Ramesh Gawande (Contractor)", phone: "+91 98234 56789", address: "Umred Rural, Ward No. 2", creditLimit: 200000, balance: 65000 },
      { name: "Sanjay Thakre", phone: "+91 99754 12345", address: "Mangalwari Peth, Umred", creditLimit: 50000, balance: 18200 },
      { name: "Vilas Mohite", phone: "+91 98901 98765", address: "Bahadura Road, Umred", creditLimit: 150000, balance: 0 },
      { name: "Nilesh Chopde", phone: "+91 91588 44332", address: "Girad Road, Umred", creditLimit: 100000, balance: 0 }
    ];
    for (const c of customers) {
      await this.db.run(`
        INSERT INTO customers (name, phone, address, creditLimit, balance, gstin)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [c.name, c.phone, c.address, c.creditLimit, c.balance, c.gstin]);
    }

    // Seed sales
    const sales = [
      {
        invoiceNo: "ZT-2026-0001",
        date: "2026-05-30T10:30:00.000Z",
        customerId: 1,
        customerName: "Ramesh Gawande (Contractor)",
        items: JSON.stringify([
          { productId: 2, name: "TMT Steel Bars 12mm (per Ton)", price: 58000, qty: 1, unit: "Ton", gstRate: 18, gstAmount: 8847.46, total: 58000 },
          { productId: 3, name: "Red Clay Bricks (1000 Pcs)", price: 7500, qty: 1, unit: "1k Pcs", gstRate: 5, gstAmount: 357.14, total: 7500 }
        ]),
        subtotal: 56295.4,
        discount: 500,
        gstTotal: 9204.6,
        total: 65000,
        paymentMethod: "Khata",
        paymentStatus: "Unpaid",
        billType: "GST"
      },
      {
        invoiceNo: "ZT-2026-0002",
        date: "2026-06-01T09:15:00.000Z",
        customerId: 2,
        customerName: "Sanjay Thakre",
        items: JSON.stringify([
          { productId: 1, name: "ACC Gold Cement (50kg Bag)", price: 430, qty: 40, unit: "Bag", gstRate: 28, gstAmount: 3762.5, total: 17200 },
          { productId: 6, name: "PVC Pipe 4-inch (Premium 6m)", price: 450, qty: 2, unit: "Pcs", gstRate: 18, gstAmount: 137.29, total: 900 }
        ]),
        subtotal: 14200.21,
        discount: 0,
        gstTotal: 3899.79,
        total: 18200,
        paymentMethod: "Khata",
        paymentStatus: "Unpaid",
        billType: "GST"
      },
      {
        invoiceNo: "ZT-2026-0003",
        date: "2026-06-01T14:30:00.000Z",
        customerId: 3,
        customerName: "Vilas Mohite",
        items: JSON.stringify([
          { productId: 5, name: "Asian Paints Apex White (20L)", price: 4800, qty: 2, unit: "Bkt", gstRate: 18, gstAmount: 1464.41, total: 9600 }
        ]),
        subtotal: 8135.59,
        discount: 100,
        gstTotal: 1464.41,
        total: 9500,
        paymentMethod: "UPI",
        paymentStatus: "Paid",
        billType: "GST"
      }
    ];
    for (const s of sales) {
      await this.db.run(`
        INSERT INTO sales (invoiceNo, date, customerId, customerName, items, subtotal, discount, gstTotal, total, paymentMethod, paymentStatus, billType)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [s.invoiceNo, s.date, s.customerId, s.customerName, s.items, s.subtotal, s.discount, s.gstTotal, s.total, s.paymentMethod, s.paymentStatus, s.billType]);
    }

    // Seed purchases
    const purchases = [
      {
        purchaseNo: "ZT-PUR-0001",
        date: "2026-05-29T14:00:00.000Z",
        supplierId: 1,
        supplierName: "Nagpur Cement Distributors",
        items: JSON.stringify([
          { productId: 1, name: "ACC Gold Cement (50kg Bag)", price: 380, qty: 100, unit: "Bag", gstRate: 28, gstAmount: 8312.5, total: 38000 }
        ]),
        subtotal: 29687.5,
        discount: 0,
        gstTotal: 8312.5,
        total: 38000,
        paymentMethod: "Credit",
        paymentStatus: "Unpaid",
        billType: "GST"
      },
      {
        purchaseNo: "ZT-PUR-0002",
        date: "2026-05-30T11:00:00.000Z",
        supplierId: 2,
        supplierName: "Jindal Steel Depot (Umred)",
        items: JSON.stringify([
          { productId: 2, name: "TMT Steel Bars 12mm (per Ton)", price: 52000, qty: 2, unit: "Ton", gstRate: 18, gstAmount: 15864.41, total: 104000 }
        ]),
        subtotal: 88135.59,
        discount: 0,
        gstTotal: 15864.41,
        total: 104000,
        paymentMethod: "Credit",
        paymentStatus: "Unpaid",
        billType: "GST"
      }
    ];
    for (const p of purchases) {
      await this.db.run(`
        INSERT INTO purchases (purchaseNo, date, supplierId, supplierName, items, subtotal, discount, gstTotal, total, paymentMethod, paymentStatus, billType)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [p.purchaseNo, p.date, p.supplierId, p.supplierName, p.items, p.subtotal, p.discount, p.gstTotal, p.total, p.paymentMethod, p.paymentStatus, p.billType]);
    }

    // Seed payments
    await this.db.run(`
      INSERT INTO payments (date, customerId, customerName, amount, paymentMethod, remarks)
      VALUES ('2026-05-31T15:00:00.000Z', 1, 'Ramesh Gawande (Contractor)', 5000, 'Cash', 'Partial builder payment')
    `);

    // Seed supplier payments
    await this.db.run(`
      INSERT INTO supplier_payments (date, supplierId, supplierName, amount, paymentMethod, remarks)
      VALUES ('2026-05-31T11:00:00.000Z', 1, 'Nagpur Cement Distributors', 10000, 'Bank Transfer', 'Repayment against cement stock')
    `);
  }

  // Retrieve all records from a table
  async get(table) {
    const rows = await this.db.all(`SELECT * FROM ${table}`);
    if (table === 'sales' || table === 'purchases') {
      return rows.map(r => ({
        ...r,
        items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items
      }));
    }
    return rows;
  }

  // Retrieve a specific record by id
  async getById(table, id) {
    const row = await this.db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!row) return null;
    if (table === 'sales' || table === 'purchases') {
      return {
        ...row,
        items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items
      };
    }
    return row;
  }

  // Insert a new record
  async insert(table, record) {
    const columns = Object.keys(record);
    const values = Object.values(record).map(val => {
      if (typeof val === 'object' && val !== null) {
        return JSON.stringify(val);
      }
      return val;
    });
    const placeholders = columns.map(() => '?').join(', ');
    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    
    const result = await this.db.run(query, values);
    const newId = result.lastID;
    
    return this.getById(table, newId);
  }

  // Update a record
  async update(table, id, updatedFields) {
    const columns = Object.keys(updatedFields);
    if (columns.length === 0) return this.getById(table, id);

    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const values = Object.values(updatedFields).map(val => {
      if (typeof val === 'object' && val !== null) {
        return JSON.stringify(val);
      }
      return val;
    });
    values.push(id);

    const query = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
    await this.db.run(query, values);

    return this.getById(table, id);
  }

  // Delete a record
  async delete(table, id) {
    const result = await this.db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
    return result.changes > 0;
  }

  // Settings helpers
  async getSettings() {
    const row = await this.db.get('SELECT * FROM settings WHERE id = 1');
    return row;
  }

  async updateSettings(newSettings) {
    const columns = Object.keys(newSettings);
    if (columns.length === 0) return this.getSettings();

    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const values = Object.values(newSettings);
    values.push(1);

    await this.db.run(`UPDATE settings SET ${setClause} WHERE id = 1`, values);
    return this.getSettings();
  }

  // Audit Logging helper
  async logAudit(user, action, details) {
    await this.db.run(`
      INSERT INTO audit_logs (timestamp, user, action, details)
      VALUES (?, ?, ?, ?)
    `, [new Date().toISOString(), user || 'system', action, details || '']);
  }

  // Reset database back to seed defaults
  async reset() {
    await this.db.run('DROP TABLE IF EXISTS settings');
    await this.db.run('DROP TABLE IF EXISTS users');
    await this.db.run('DROP TABLE IF EXISTS products');
    await this.db.run('DROP TABLE IF EXISTS suppliers');
    await this.db.run('DROP TABLE IF EXISTS customers');
    await this.db.run('DROP TABLE IF EXISTS sales');
    await this.db.run('DROP TABLE IF EXISTS purchases');
    await this.db.run('DROP TABLE IF EXISTS payments');
    await this.db.run('DROP TABLE IF EXISTS supplier_payments');
    await this.db.run('DROP TABLE IF EXISTS audit_logs');
    
    await this.createTables();
    return true;
  }

  // Get full backup data as an object
  async getBackupData() {
    const backup = {};
    const tables = ['settings', 'users', 'products', 'suppliers', 'customers', 'sales', 'purchases', 'payments', 'supplier_payments', 'audit_logs'];
    for (const t of tables) {
      if (t === 'settings') {
        backup.settings = await this.getSettings();
      } else {
        backup[t] = await this.get(t);
      }
    }
    return backup;
  }

  // Restore backup data
  async restore(backup) {
    // Drop and recreate empty tables first
    await this.reset();

    // 1. Settings
    if (backup.settings) {
      const keys = Object.keys(backup.settings).filter(k => k !== 'id');
      const setClause = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => backup.settings[k]);
      values.push(1);
      await this.db.run(`UPDATE settings SET ${setClause} WHERE id = 1`, values);
    }

    // Helper for table inserts
    const restoreTable = async (table, list) => {
      if (!list || !Array.isArray(list)) return;
      for (const item of list) {
        const columns = Object.keys(item);
        const placeholders = columns.map(() => '?').join(', ');
        const values = Object.values(item).map(val => {
          if (typeof val === 'object' && val !== null) {
            return JSON.stringify(val);
          }
          return val;
        });
        await this.db.run(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, values);
      }
    };

    if (backup.users) await restoreTable('users', backup.users);
    if (backup.products) await restoreTable('products', backup.products);
    if (backup.suppliers) await restoreTable('suppliers', backup.suppliers);
    if (backup.customers) await restoreTable('customers', backup.customers);
    if (backup.sales) await restoreTable('sales', backup.sales);
    if (backup.purchases) await restoreTable('purchases', backup.purchases);
    if (backup.payments) await restoreTable('payments', backup.payments);
    if (backup.supplier_payments) await restoreTable('supplier_payments', backup.supplier_payments);
    if (backup.audit_logs) await restoreTable('audit_logs', backup.audit_logs);

    return true;
  }
}

const dbInstance = new SQLiteDatabase();
module.exports = dbInstance;
