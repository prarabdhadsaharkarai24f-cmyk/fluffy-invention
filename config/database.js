const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

// Ensure database directory exists
const dbDir = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, '../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, 'pos.db');
let db;

try {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
  db.pragma('foreign_keys = ON');
  logger.info(`Connected to SQLite database at ${dbPath}`);
} catch (error) {
  logger.error('Failed to connect to database:', error);
  process.exit(1);
}

// Initialize database schema
function initializeDatabase() {
  try {
    // Users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        role TEXT DEFAULT 'operator',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Products table
    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        barcode TEXT UNIQUE,
        category TEXT DEFAULT 'General',
        buyPrice REAL NOT NULL,
        sellPrice REAL NOT NULL,
        stock REAL NOT NULL,
        unit TEXT DEFAULT 'Pcs',
        gstRate INTEGER DEFAULT 0,
        minStock REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Customers table
    db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        gstin TEXT,
        creditLimit REAL DEFAULT 10000,
        balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Suppliers table
    db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        gstin TEXT,
        balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sales table
    db.exec(`
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceNo TEXT UNIQUE NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        customerId INTEGER DEFAULT 0,
        customerName TEXT DEFAULT 'Cash Customer',
        subtotal REAL NOT NULL,
        discount REAL DEFAULT 0,
        gstTotal REAL DEFAULT 0,
        total REAL NOT NULL,
        paymentMethod TEXT DEFAULT 'Cash',
        paymentStatus TEXT DEFAULT 'Paid',
        billType TEXT DEFAULT 'GST',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE SET NULL
      )
    `);

    // Sales items table
    db.exec(`
      CREATE TABLE IF NOT EXISTS sales_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        saleId INTEGER NOT NULL,
        productId INTEGER NOT NULL,
        productName TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT DEFAULT 'Pcs',
        price REAL NOT NULL,
        gstRate INTEGER DEFAULT 0,
        gstAmount REAL DEFAULT 0,
        total REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE RESTRICT
      )
    `);

    // Purchases table
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchaseNo TEXT UNIQUE NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        supplierId INTEGER DEFAULT 0,
        supplierName TEXT DEFAULT 'Cash Purchase',
        supplierInvoiceNo TEXT,
        subtotal REAL NOT NULL,
        discount REAL DEFAULT 0,
        gstTotal REAL DEFAULT 0,
        total REAL NOT NULL,
        paymentMethod TEXT DEFAULT 'Cash',
        paymentStatus TEXT DEFAULT 'Paid',
        billType TEXT DEFAULT 'GST',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE SET NULL
      )
    `);

    // Purchase items table
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchaseId INTEGER NOT NULL,
        productId INTEGER NOT NULL,
        productName TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT DEFAULT 'Pcs',
        price REAL NOT NULL,
        gstRate INTEGER DEFAULT 0,
        gstAmount REAL DEFAULT 0,
        total REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (purchaseId) REFERENCES purchases(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE RESTRICT
      )
    `);

    // Payments table
    db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        customerId INTEGER NOT NULL,
        customerName TEXT NOT NULL,
        amount REAL NOT NULL,
        paymentMethod TEXT DEFAULT 'Cash',
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE
      )
    `);

    // Supplier payments table
    db.exec(`
      CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        supplierId INTEGER NOT NULL,
        supplierName TEXT NOT NULL,
        amount REAL NOT NULL,
        paymentMethod TEXT DEFAULT 'Bank Transfer',
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE CASCADE
      )
    `);

    // Settings table
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        shopName TEXT DEFAULT 'Zade Traders',
        address TEXT,
        phone TEXT,
        gstin TEXT,
        upiId TEXT,
        currency TEXT DEFAULT '₹',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Audit logs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        action TEXT NOT NULL,
        entityType TEXT NOT NULL,
        entityId INTEGER,
        userId INTEGER,
        username TEXT,
        details TEXT,
        ipAddress TEXT
      )
    `);

    // Create indexes for better query performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
      CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
      CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
    `);

    logger.info('Database schema initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database schema:', error);
    throw error;
  }
}

module.exports = {
  db,
  initializeDatabase
};
