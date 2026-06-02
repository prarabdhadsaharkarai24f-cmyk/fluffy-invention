const { body, validationResult } = require('express-validator');

/**
 * Validation middleware for user authentication
 */
const validateLogin = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

/**
 * Validation middleware for product creation/update
 */
const validateProduct = [
  body('name')
    .trim()
    .notEmpty().withMessage('Product name is required'),
  body('sellPrice')
    .notEmpty().withMessage('Selling price is required')
    .isFloat({ min: 0 }).withMessage('Selling price must be a non-negative number'),
  body('buyPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('Buy price must be a non-negative number'),
  body('stock')
    .optional()
    .isFloat({ min: 0 }).withMessage('Stock must be a non-negative number'),
  body('gstRate')
    .optional()
    .isInt({ min: 0, max: 100 }).withMessage('GST rate must be between 0 and 100')
];

/**
 * Validation middleware for customer creation/update
 */
const validateCustomer = [
  body('name')
    .trim()
    .notEmpty().withMessage('Customer name is required'),
  body('creditLimit')
    .optional()
    .isFloat({ min: 0 }).withMessage('Credit limit must be a non-negative number'),
  body('phone')
    .optional()
    .isMobilePhone().withMessage('Invalid phone number'),
  body('gstin')
    .optional()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).withMessage('Invalid GSTIN format')
];

/**
 * Validation middleware for supplier creation/update
 */
const validateSupplier = [
  body('name')
    .trim()
    .notEmpty().withMessage('Supplier name is required'),
  body('phone')
    .optional()
    .isMobilePhone().withMessage('Invalid phone number'),
  body('gstin')
    .optional()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).withMessage('Invalid GSTIN format')
];

/**
 * Validation middleware for sales creation
 */
const validateSale = [
  body('items')
    .isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId')
    .isInt({ min: 1 }).withMessage('Valid product ID is required'),
  body('items.*.qty')
    .isFloat({ min: 0 }).withMessage('Quantity must be a positive number'),
  body('items.*.price')
    .isFloat({ min: 0 }).withMessage('Price must be a non-negative number'),
  body('subtotal')
    .isFloat({ min: 0 }).withMessage('Subtotal must be a non-negative number'),
  body('discount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Discount must be a non-negative number'),
  body('gstTotal')
    .isFloat({ min: 0 }).withMessage('GST total must be a non-negative number'),
  body('total')
    .isFloat({ min: 0 }).withMessage('Total must be a non-negative number'),
  body('paymentMethod')
    .notEmpty().withMessage('Payment method is required')
    .isIn(['Cash', 'UPI', 'Khata']).withMessage('Invalid payment method')
];

/**
 * Validation middleware for purchase creation
 */
const validatePurchase = [
  body('items')
    .isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId')
    .isInt({ min: 1 }).withMessage('Valid product ID is required'),
  body('items.*.qty')
    .isFloat({ min: 0 }).withMessage('Quantity must be a positive number'),
  body('items.*.price')
    .isFloat({ min: 0 }).withMessage('Price must be a non-negative number'),
  body('subtotal')
    .isFloat({ min: 0 }).withMessage('Subtotal must be a non-negative number'),
  body('discount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Discount must be a non-negative number'),
  body('gstTotal')
    .isFloat({ min: 0 }).withMessage('GST total must be a non-negative number'),
  body('total')
    .isFloat({ min: 0 }).withMessage('Total must be a non-negative number'),
  body('paymentMethod')
    .notEmpty().withMessage('Payment method is required')
    .isIn(['Cash', 'Credit', 'Cheque']).withMessage('Invalid payment method')
];

/**
 * Validation middleware for payment processing
 */
const validatePayment = [
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('paymentMethod')
    .notEmpty().withMessage('Payment method is required'),
  body('remarks')
    .optional()
    .trim()
];

/**
 * Error handling middleware for validation
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

module.exports = {
  validateLogin,
  validateProduct,
  validateCustomer,
  validateSupplier,
  validateSale,
  validatePurchase,
  validatePayment,
  handleValidationErrors
};
