// Set environment variables for testing
process.env.PORT = 3001;
process.env.DB_PATH = 'data/test_pos.db';
process.env.JWT_SECRET = 'test_secret_for_pos_validation';

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Helper to delete database file
const cleanTestDB = () => {
  const dbFile = path.join(__dirname, '..', 'data', 'test_pos.db');
  if (fs.existsSync(dbFile)) {
    try {
      fs.unlinkSync(dbFile);
    } catch (e) {
      console.warn("Failed to clean up test database file:", e.message);
    }
  }
};

// Helper for making HTTP requests
const request = (method, urlPath, headers = {}, body = null) => {
  return new Promise((resolve, reject) => {
    const opt = {
      hostname: 'localhost',
      port: 3001,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    const req = http.request(opt, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });
    req.on('error', (err) => reject(err));
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
};

(async () => {
  console.log("=========================================");
  console.log("  Running POS Integration Test Suite     ");
  console.log("=========================================");

  cleanTestDB();

  // Require server to start it
  require('../server');

  // Wait for database and server to initialize
  await new Promise(resolve => setTimeout(resolve, 1500));

  let token = null;

  try {
    // 1. Test Login - Success
    console.log("\nTesting successful login...");
    const loginRes = await request('POST', '/api/auth/login', {}, {
      username: 'admin',
      password: 'admin123'
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.success, true);
    assert.ok(loginRes.body.token);
    token = loginRes.body.token;
    console.log("✓ Success login test passed.");

    // 2. Test Login - Invalid Credentials
    console.log("\nTesting invalid login credentials...");
    const loginFailRes = await request('POST', '/api/auth/login', {}, {
      username: 'admin',
      password: 'wrongpassword'
    });
    assert.strictEqual(loginFailRes.status, 401);
    assert.ok(loginFailRes.body.error);
    console.log("✓ Invalid credentials check passed.");

    // 3. Test Validation Middleware - Missing Fields
    console.log("\nTesting product creation validation (missing sellPrice)...");
    const badProdRes = await request('POST', '/api/products', {
      'Authorization': `Bearer ${token}`
    }, {
      name: "Invalid Steel Bar"
    });
    assert.strictEqual(badProdRes.status, 400);
    assert.strictEqual(badProdRes.body.error, "sellPrice is required.");
    console.log("✓ Missing field validation passed.");

    // 4. Test Product Operations (Create & Retrieve)
    console.log("\nTesting product creation & retrieval...");
    const prodRes = await request('POST', '/api/products', {
      'Authorization': `Bearer ${token}`
    }, {
      name: "Test Rods (12mm)",
      sellPrice: 450,
      buyPrice: 380,
      stock: 100,
      gstRate: 18,
      minStock: 10
    });
    assert.strictEqual(prodRes.status, 201);
    assert.strictEqual(prodRes.body.name, "Test Rods (12mm)");
    assert.strictEqual(prodRes.body.sellPrice, 450);

    const productId = prodRes.body.id;

    const listProdRes = await request('GET', '/api/products', {
      'Authorization': `Bearer ${token}`
    });
    assert.strictEqual(listProdRes.status, 200);
    const addedProd = listProdRes.body.find(p => p.id === productId);
    assert.ok(addedProd);
    assert.strictEqual(addedProd.name, "Test Rods (12mm)");
    console.log("✓ Product creation & retrieval verified successfully.");

    // 5. Test Customer Balance & Ledgers
    console.log("\nTesting customer ledger & balance updates...");
    const custRes = await request('POST', '/api/customers', {
      'Authorization': `Bearer ${token}`
    }, {
      name: "Test Customer Account",
      creditLimit: 50000
    });
    assert.strictEqual(custRes.status, 201);
    const custId = custRes.body.id;

    // Log a payment against outstanding balance (which starts at 0)
    const payRes = await request('POST', `/api/customers/${custId}/pay`, {
      'Authorization': `Bearer ${token}`
    }, {
      amount: 1500,
      paymentMethod: 'Cash',
      remarks: 'Prepayment'
    });
    assert.strictEqual(payRes.status, 200);
    assert.strictEqual(payRes.body.newBalance, 0); // Math.max(0, 0 - 1500) is 0
    console.log("✓ Customer ledger & balance test passed.");

    // 6. Test Dashboard Data Retrieval
    console.log("\nTesting Dashboard Analytics API...");
    const dashRes = await request('GET', '/api/dashboard', {
      'Authorization': `Bearer ${token}`
    });
    assert.strictEqual(dashRes.status, 200);
    assert.ok(dashRes.body.totalRevenue !== undefined);
    assert.ok(Array.isArray(dashRes.body.recentTransactions));
    console.log("✓ Dashboard Analytics API verified successfully.");

    // 7. Test Rate Limiter (Brute-force lockout verification)
    console.log("\nTesting Login API Rate Limiting (Brute-force protection)...");
    let limited = false;
    for (let i = 0; i < 6; i++) {
      const rateRes = await request('POST', '/api/auth/login', {}, {
        username: 'admin',
        password: 'wrong_password_limiter'
      });
      if (rateRes.status === 429) {
        limited = true;
        console.log(`✓ Triggered rate limit on attempt ${i + 1}: ${rateRes.body.error}`);
        break;
      }
    }
    assert.strictEqual(limited, true, "Rate limit should be triggered after 5 failed login attempts");
    console.log("✓ Login Rate limiting verification passed.");

    console.log("\n=========================================");
    console.log("  ALL TESTS PASSED SUCCESSFULLY!         ");
    console.log("=========================================");
    cleanTestDB();
    process.exit(0);

  } catch (err) {
    console.error("\n❌ TEST FAILURE ENCOUNTERED:");
    console.error(err);
    cleanTestDB();
    process.exit(1);
  }
})();
