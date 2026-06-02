const request = require('supertest');
const { db, initializeDatabase } = require('../config/database');
const { hashPassword } = require('../utils/auth');
const app = require('../server');

describe('Authentication Tests', () => {
  beforeAll(() => {
    initializeDatabase();
  });

  afterAll(() => {
    db.close();
  });

  describe('POST /api/auth/login', () => {
    beforeEach(() => {
      // Create test user
      const passwordHash = require('bcryptjs').hashSync('testpass123', 12);
      try {
        db.prepare(`
          INSERT INTO users (username, passwordHash, role)
          VALUES (?, ?, ?)
        `).run('testuser', passwordHash, 'operator');
      } catch (e) {
        // User may already exist
      }
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'testpass123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
    });

    it('should reject invalid username', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'testpass123'
        });

      expect(res.statusCode).toBe(401);
    });

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword'
        });

      expect(res.statusCode).toBe(401);
    });
  });
});

describe('Product Management Tests', () => {
  let token;

  beforeAll(async () => {
    initializeDatabase();
    // Get valid token
    const bcrypt = require('bcryptjs');
    const passwordHash = bcrypt.hashSync('admin123', 12);
    try {
      db.prepare(`
        INSERT INTO users (username, passwordHash, role)
        VALUES (?, ?, ?)
      `).run('admin', passwordHash, 'admin');
    } catch (e) {
      // User may already exist
    }

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: 'admin123'
      });
    token = loginRes.body.token;
  });

  afterAll(() => {
    db.close();
  });

  describe('POST /api/products', () => {
    it('should create product with valid data', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test Cement',
          sellPrice: 430,
          buyPrice: 380,
          stock: 100,
          gstRate: 28
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Test Cement');
    });

    it('should reject product without name', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sellPrice: 430,
          stock: 100
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject negative price', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Invalid Product',
          sellPrice: -100,
          stock: 100
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/products', () => {
    it('should fetch all products', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});

describe('Sales Management Tests', () => {
  let token;
  let customerId;
  let productId;

  beforeAll(async () => {
    initializeDatabase();
    
    // Setup test data
    const bcrypt = require('bcryptjs');
    const passwordHash = bcrypt.hashSync('admin123', 12);
    try {
      db.prepare(`
        INSERT INTO users (username, passwordHash, role)
        VALUES (?, ?, ?)
      `).run('salesuser', passwordHash, 'operator');
    } catch (e) {
      // User may already exist
    }

    // Create test customer
    try {
      const customerResult = db.prepare(`
        INSERT INTO customers (name, creditLimit, balance)
        VALUES (?, ?, ?)
      `).run('Test Customer', 50000, 0);
      customerId = customerResult.lastInsertRowid;
    } catch (e) {
      customerId = 1;
    }

    // Create test product
    try {
      const productResult = db.prepare(`
        INSERT INTO products (name, sellPrice, buyPrice, stock, gstRate)
        VALUES (?, ?, ?, ?, ?)
      `).run('Test Product', 100, 80, 1000, 18);
      productId = productResult.lastInsertRowid;
    } catch (e) {
      productId = 1;
    }

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'salesuser',
        password: 'admin123'
      });
    token = loginRes.body.token;
  });

  afterAll(() => {
    db.close();
  });

  describe('POST /api/sales', () => {
    it('should create sale with valid data', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          customerName: 'Test Customer',
          items: [
            {
              productId,
              qty: 5,
              price: 100
            }
          ],
          subtotal: 500,
          discount: 0,
          gstTotal: 90,
          total: 590,
          paymentMethod: 'Cash'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('invoiceNo');
    });

    it('should reject sale without items', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          items: [],
          subtotal: 0,
          gstTotal: 0,
          total: 0,
          paymentMethod: 'Cash'
        });

      expect(res.statusCode).toBe(400);
    });
  });
});

describe('Input Validation Tests', () => {
  let token;

  beforeAll(async () => {
    initializeDatabase();
    const bcrypt = require('bcryptjs');
    const passwordHash = bcrypt.hashSync('admin123', 12);
    try {
      db.prepare(`
        INSERT INTO users (username, passwordHash, role)
        VALUES (?, ?, ?)
      `).run('validuser', passwordHash, 'admin');
    } catch (e) {
      // User may already exist
    }

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'validuser',
        password: 'admin123'
      });
    token = loginRes.body.token;
  });

  afterAll(() => {
    db.close();
  });

  it('should sanitize input data', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '<script>alert("xss")</script>Product',
        sellPrice: 100,
        stock: 50
      });

    expect(res.statusCode).toBe(201);
    // Should not contain script tags
    expect(res.body.name).not.toContain('<script>');
  });

  it('should validate GSTIN format', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Customer',
        gstin: 'INVALID'
      });

    expect(res.statusCode).toBe(400);
  });
});
