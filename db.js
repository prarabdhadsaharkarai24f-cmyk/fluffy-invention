const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

// Default initial database schema with high-quality Building Materials Supplier seed data
const DEFAULT_DB = {
  settings: {
    shopName: "Zade Traders",
    address: "MIDC Road, Near Main Chowk, Umred - 441203",
    phone: "+91 94228 12345",
    gstin: "27GHIJK5678L1Z9",
    upiId: "zadetraders@okaxis",
    currency: "₹"
  },
  products: [
    { id: 1, name: "ACC Gold Cement (50kg Bag)", barcode: "8901234100015", category: "Cement", buyPrice: 380, sellPrice: 430, stock: 500, unit: "Bag", gstRate: 28, minStock: 50 },
    { id: 2, name: "TMT Steel Bars 12mm (per Ton)", barcode: "8901234100022", category: "Steel", buyPrice: 52000, sellPrice: 58000, stock: 5.5, unit: "Ton", gstRate: 18, minStock: 1 },
    { id: 3, name: "Red Clay Bricks (1000 Pcs)", barcode: "8901234100039", category: "Bricks", buyPrice: 6000, sellPrice: 7500, stock: 15, unit: "1k Pcs", gstRate: 5, minStock: 3 },
    { id: 4, name: "Fine Ganga Sand (per Brass)", barcode: "8901234100046", category: "Aggregates", buyPrice: 5500, sellPrice: 6500, stock: 8, unit: "Brass", gstRate: 5, minStock: 2 },
    { id: 5, name: "Asian Paints Apex White (20L)", barcode: "8901234100053", category: "Paints", buyPrice: 4100, sellPrice: 4800, stock: 25, unit: "Bkt", gstRate: 18, minStock: 5 },
    { id: 6, name: "PVC Pipe 4-inch (Premium 6m)", barcode: "8901234100060", category: "Plumbing", buyPrice: 320, sellPrice: 450, stock: 120, unit: "Pcs", gstRate: 18, minStock: 20 }
  ],
  suppliers: [
    { id: 1, name: "Nagpur Cement Distributors", phone: "+91 98222 98765", address: "Cement Depot, MIDC, Nagpur", gstin: "27AAAAA1111A1Z1", balance: 45000 },
    { id: 2, name: "Jindal Steel Depot (Umred)", phone: "+91 99234 44321", address: "MIDC Area, Plot No. 12, Umred", gstin: "27BBBBB2222B1Z2", balance: 120000 },
    { id: 3, name: "Local Bricks Kiln (Umred)", phone: "+91 94217 66554", address: "Girad Road, Umred", gstin: "", balance: 0 }
  ],
  customers: [
    { id: 1, name: "Ramesh Gawande (Contractor)", phone: "+91 98234 56789", address: "Umred Rural, Ward No. 2", creditLimit: 200000, balance: 65000 },
    { id: 2, name: "Sanjay Thakre", phone: "+91 99754 12345", address: "Mangalwari Peth, Umred", creditLimit: 50000, balance: 18200 },
    { id: 3, name: "Vilas Mohite", phone: "+91 98901 98765", address: "Bahadura Road, Umred", creditLimit: 150000, balance: 0 },
    { id: 4, name: "Nilesh Chopde", phone: "+91 91588 44332", address: "Girad Road, Umred", creditLimit: 100000, balance: 0 }
  ],
  sales: [
    {
      id: 1,
      invoiceNo: "ZT-2026-0001",
      date: "2026-05-30T10:30:00.000Z",
      customerId: 1,
      customerName: "Ramesh Gawande (Contractor)",
      items: [
        { productId: 2, name: "TMT Steel Bars 12mm (per Ton)", price: 58000, qty: 1, unit: "Ton", gstRate: 18, gstAmount: 8847.46, total: 58000 },
        { productId: 3, name: "Red Clay Bricks (1000 Pcs)", price: 7500, qty: 1, unit: "1k Pcs", gstRate: 5, gstAmount: 357.14, total: 7500 }
      ],
      subtotal: 56295.4,
      discount: 500,
      gstTotal: 9204.6,
      total: 65000,
      paymentMethod: "Khata",
      paymentStatus: "Unpaid"
    },
    {
      id: 2,
      invoiceNo: "ZT-2026-0002",
      date: "2026-06-01T09:15:00.000Z",
      customerId: 2,
      customerName: "Sanjay Thakre",
      items: [
        { productId: 1, name: "ACC Gold Cement (50kg Bag)", price: 430, qty: 40, unit: "Bag", gstRate: 28, gstAmount: 3762.5, total: 17200 },
        { productId: 6, name: "PVC Pipe 4-inch (Premium 6m)", price: 450, qty: 2, unit: "Pcs", gstRate: 18, gstAmount: 137.29, total: 900 }
      ],
      subtotal: 14200.21,
      discount: 0,
      gstTotal: 3899.79,
      total: 18200,
      paymentMethod: "Khata",
      paymentStatus: "Unpaid"
    },
    {
      id: 3,
      invoiceNo: "ZT-2026-0003",
      date: "2026-06-01T14:30:00.000Z",
      customerId: 3,
      customerName: "Vilas Mohite",
      items: [
        { productId: 5, name: "Asian Paints Apex White (20L)", price: 4800, qty: 2, unit: "Bkt", gstRate: 18, gstAmount: 1464.41, total: 9600 }
      ],
      subtotal: 8135.59,
      discount: 100,
      gstTotal: 1464.41,
      total: 9500,
      paymentMethod: "UPI",
      paymentStatus: "Paid"
    }
  ],
  purchases: [
    {
      id: 1,
      purchaseNo: "ZT-PUR-0001",
      date: "2026-05-29T14:00:00.000Z",
      supplierId: 1,
      supplierName: "Nagpur Cement Distributors",
      items: [
        { productId: 1, name: "ACC Gold Cement (50kg Bag)", price: 380, qty: 100, unit: "Bag", gstRate: 28, gstAmount: 8312.5, total: 38000 }
      ],
      subtotal: 29687.5,
      gstTotal: 8312.5,
      total: 38000,
      paymentMethod: "Credit",
      paymentStatus: "Unpaid"
    },
    {
      id: 2,
      purchaseNo: "ZT-PUR-0002",
      date: "2026-05-30T11:00:00.000Z",
      supplierId: 2,
      supplierName: "Jindal Steel Depot (Umred)",
      items: [
        { productId: 2, name: "TMT Steel Bars 12mm (per Ton)", price: 52000, qty: 2, unit: "Ton", gstRate: 18, gstAmount: 15864.41, total: 104000 }
      ],
      subtotal: 88135.59,
      gstTotal: 15864.41,
      total: 104000,
      paymentMethod: "Credit",
      paymentStatus: "Unpaid"
    }
  ],
  payments: [
    { id: 1, date: "2026-05-31T15:00:00.000Z", customerId: 1, customerName: "Ramesh Gawande (Contractor)", amount: 5000, paymentMethod: "Cash", remarks: "Partial builder payment" }
  ],
  supplier_payments: [
    { id: 1, date: "2026-05-31T11:00:00.000Z", supplierId: 1, supplierName: "Nagpur Cement Distributors", amount: 10000, paymentMethod: "Bank Transfer", remarks: "Repayment against cement stock" }
  ],
  users: [
    { id: 1, username: "admin", passwordHash: "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918" } // SHA-256 of "admin123"
  ]
};

class JSONDatabase {
  constructor() {
    this.init();
  }

  init() {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const fileContent = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(fileContent);
        console.log("Database loaded from existing db.json file.");
        
        // Auto-migrate: seed users table if missing in older JSON db file
        if (!this.data.users) {
          this.data.users = JSON.parse(JSON.stringify(DEFAULT_DB.users));
          this.save();
          console.log("Users schema migrated successfully.");
        }
      } catch (err) {
        console.error("Failed to read database file, initializing default seed db:", err);
        fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
        this.data = JSON.parse(JSON.stringify(DEFAULT_DB));
      }
    } else {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
      this.data = JSON.parse(JSON.stringify(DEFAULT_DB));
      console.log("Database initialized with Building Materials seed data.");
    }
  }

  // Saves memory state to db.json synchronously
  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error("Failed to write to database file:", err);
      return false;
    }
  }

  // Overwrite database to factory default seeds
  reset() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
      this.data = JSON.parse(JSON.stringify(DEFAULT_DB));
      return true;
    } catch (err) {
      console.error("Failed to reset database:", err);
      return false;
    }
  }

  get(table) {
    return this.data[table] || [];
  }

  getById(table, id) {
    const list = this.get(table);
    return list.find(item => item.id === parseInt(id));
  }

  insert(table, record) {
    if (!this.data[table]) {
      this.data[table] = [];
    }
    const list = this.data[table];
    const newId = list.length > 0 ? Math.max(...list.map(i => i.id)) + 1 : 1;
    const newRecord = { id: newId, ...record };
    list.push(newRecord);
    this.save();
    return newRecord;
  }

  update(table, id, updatedFields) {
    const list = this.get(table);
    const index = list.findIndex(item => item.id === parseInt(id));
    if (index === -1) return null;
    
    const updatedRecord = { ...list[index], ...updatedFields, id: parseInt(id) };
    list[index] = updatedRecord;
    this.save();
    return updatedRecord;
  }

  delete(table, id) {
    const list = this.get(table);
    const index = list.findIndex(item => item.id === parseInt(id));
    if (index === -1) return false;
    list.splice(index, 1);
    this.save();
    return true;
  }

  getSettings() {
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.save();
    return this.data.settings;
  }
}

module.exports = new JSONDatabase();
