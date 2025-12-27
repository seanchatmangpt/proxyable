/**
 * Multi-Tenant Behavioral Views Example
 *
 * Demonstrates how to create multiple tenant views of the same underlying object
 * with different visibility, virtual properties, and transformations.
 */

import {
  createTenantContext,
  createMultipleTenants,
  getTenantId,
  getRawTarget
} from '../src/multitenancy/tenant-context.js';

console.log('=== Multi-Tenant Behavioral Views Example ===\n');

// ============================================================================
// Example 1: Basic Tenant Isolation with Filtered Keys
// ============================================================================
console.log('--- Example 1: Basic Tenant Isolation ---');

const sharedUserData = {
  id: 12345,
  username: 'john_doe',
  email: 'john@example.com',
  passwordHash: 'hashed_password_value',
  ssn: '123-45-6789',
  salary: 75_000,
  publicBio: 'Software engineer',
  privateNotes: 'Performance review notes'
};

// Public-facing tenant - only sees public information
const publicTenant = createTenantContext(sharedUserData, 'public', {
  visibleKeys: new Set(['id', 'username', 'publicBio']),
  metadata: {
    name: 'Public API',
    tier: 'public'
  }
});

// HR tenant - sees salary and private notes but not password
const hrTenant = createTenantContext(sharedUserData, 'hr', {
  visibleKeys: (key) => !key.includes('password') && !key.includes('ssn'),
  metadata: {
    name: 'HR Department',
    tier: 'internal'
  }
});

// Admin tenant - sees everything
const adminTenant = createTenantContext(sharedUserData, 'admin', {
  metadata: {
    name: 'System Admin',
    tier: 'admin'
  }
});

publicTenant.call(proxy => {
  console.log('Public tenant sees:');
  console.log('  Keys:', Object.keys(proxy));
  console.log('  Username:', proxy.username);
  console.log('  Salary:', proxy.salary); // undefined - not visible
  console.log('  Has passwordHash:', 'passwordHash' in proxy); // false
});

hrTenant.call(proxy => {
  console.log('\nHR tenant sees:');
  console.log('  Keys:', Object.keys(proxy));
  console.log('  Salary:', proxy.salary);
  console.log('  Private notes:', proxy.privateNotes);
  console.log('  Has passwordHash:', 'passwordHash' in proxy); // false
});

adminTenant.call(proxy => {
  console.log('\nAdmin tenant sees:');
  console.log('  Keys:', Object.keys(proxy));
  console.log('  All data accessible: true');
});

// ============================================================================
// Example 2: Virtual Properties
// ============================================================================
console.log('\n--- Example 2: Virtual Properties ---');

const product = {
  id: 'PROD-001',
  name: 'Premium Widget',
  basePrice: 100,
  cost: 60
};

const customerTenant = createTenantContext(product, 'customer', {
  visibleKeys: new Set(['id', 'name', 'basePrice']),
  virtualProperties: {
    // Static virtual property
    currency: 'USD',
    // Dynamic virtual property (function)
    displayPrice: function() {
      return `$${this.basePrice.toFixed(2)}`;
    },
    // Computed virtual property
    formattedName: function() {
      return `🛒 ${this.name}`;
    }
  },
  metadata: { tier: 'customer' }
});

const sellerTenant = createTenantContext(product, 'seller', {
  visibleKeys: new Set(['id', 'name', 'basePrice', 'cost']),
  virtualProperties: {
    // Seller sees profit margin
    profitMargin: function() {
      return ((this.basePrice - this.cost) / this.basePrice * 100).toFixed(1) + '%';
    },
    profit: function() {
      return this.basePrice - this.cost;
    }
  },
  metadata: { tier: 'seller' }
});

customerTenant.call(proxy => {
  console.log('Customer view:');
  console.log('  Name:', proxy.formattedName); // Virtual property auto-called
  console.log('  Price:', proxy.displayPrice); // Virtual property auto-called
  console.log('  Currency:', proxy.currency);
  console.log('  Cost:', proxy.cost); // undefined - not visible
  console.log('  Keys:', Object.keys(proxy));
});

sellerTenant.call(proxy => {
  console.log('\nSeller view:');
  console.log('  Name:', proxy.name);
  console.log('  Price:', proxy.basePrice);
  console.log('  Cost:', proxy.cost);
  console.log('  Profit:', proxy.profit);
  console.log('  Margin:', proxy.profitMargin);
  console.log('  Keys:', Object.keys(proxy));
});

// ============================================================================
// Example 3: Value Transformations
// ============================================================================
console.log('\n--- Example 3: Value Transformations ---');

const sensitiveData = {
  id: 1,
  name: 'Alice Johnson',
  creditCard: '4532-1234-5678-9010',
  ssn: '987-65-4321',
  balance: 1234.56,
  status: 'active'
};

// Masked tenant - sensitive data is masked on read
const maskedTenant = createTenantContext(sensitiveData, 'masked', {
  transformGet: (key, value) => {
    if (key === 'creditCard') {
      // Mask all but last 4 digits
      return '****-****-****-' + value.slice(-4);
    }
    if (key === 'ssn') {
      return '***-**-' + value.slice(-4);
    }
    if (key === 'balance') {
      // Round to nearest dollar
      return Math.round(value);
    }
    return value;
  },
  metadata: { security: 'masked' }
});

// Uppercase tenant - strings are uppercased
const uppercaseTenant = createTenantContext(sensitiveData, 'uppercase', {
  transformGet: (key, value) => {
    if (typeof value === 'string') {
      return value.toUpperCase();
    }
    return value;
  }
});

console.log('Original data:');
console.log('  Credit Card:', sensitiveData.creditCard);
console.log('  SSN:', sensitiveData.ssn);
console.log('  Balance:', sensitiveData.balance);

maskedTenant.call(proxy => {
  console.log('\nMasked tenant view:');
  console.log('  Credit Card:', proxy.creditCard);
  console.log('  SSN:', proxy.ssn);
  console.log('  Balance:', proxy.balance);
});

uppercaseTenant.call(proxy => {
  console.log('\nUppercase tenant view:');
  console.log('  Name:', proxy.name);
  console.log('  Status:', proxy.status);
});

// ============================================================================
// Example 4: Transform on Set (Validation/Normalization)
// ============================================================================
console.log('\n--- Example 4: Transform on Set ---');

const config = {
  maxUsers: 100,
  timeout: 30,
  name: 'MyApp'
};

const validatingTenant = createTenantContext(config, 'validating', {
  transformSet: (key, value) => {
    if (key === 'maxUsers') {
      // Enforce minimum and maximum
      return Math.max(1, Math.min(1000, value));
    }
    if (key === 'timeout') {
      // Enforce positive timeout
      return Math.max(0, value);
    }
    if (key === 'name') {
      // Normalize name to title case
      return value.trim().replace(/\w\S*/g, txt =>
        txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
      );
    }
    return value;
  }
});

validatingTenant.call(proxy => {
  console.log('Testing validation transforms:');

  proxy.maxUsers = 5000; // Will be capped at 1000
  console.log('  Set maxUsers to 5000, actual:', config.maxUsers);

  proxy.maxUsers = -10; // Will be set to 1 (minimum)
  console.log('  Set maxUsers to -10, actual:', config.maxUsers);

  proxy.timeout = -5; // Will be set to 0
  console.log('  Set timeout to -5, actual:', config.timeout);

  proxy.name = '  my awesome app  '; // Will be normalized
  console.log('  Set name to "  my awesome app  ", actual:', config.name);
});

// ============================================================================
// Example 5: Multiple Tenants with createMultipleTenants
// ============================================================================
console.log('\n--- Example 5: Multiple Tenants Factory ---');

const apiData = {
  id: 'API-001',
  endpoint: '/api/users',
  rateLimitPerMinute: 100,
  internalNotes: 'High priority endpoint',
  debugMode: false
};

const tenants = createMultipleTenants(apiData, {
  'free-tier': {
    visibleKeys: new Set(['id', 'endpoint']),
    virtualProperties: {
      rateLimit: 10,
      tier: 'free'
    }
  },
  'premium-tier': {
    visibleKeys: new Set(['id', 'endpoint']),
    virtualProperties: {
      rateLimit: 100,
      tier: 'premium'
    }
  },
  'internal': {
    virtualProperties: {
      tier: 'internal',
      environment: 'production'
    }
  }
});

console.log('Created', tenants.size, 'tenants');

tenants.get('free-tier').call(proxy => {
  console.log('\nFree tier:');
  console.log('  Endpoint:', proxy.endpoint);
  console.log('  Rate limit:', proxy.rateLimit);
  console.log('  Tier:', proxy.tier);
  console.log('  Internal notes:', proxy.internalNotes); // undefined
});

tenants.get('premium-tier').call(proxy => {
  console.log('\nPremium tier:');
  console.log('  Endpoint:', proxy.endpoint);
  console.log('  Rate limit:', proxy.rateLimit);
  console.log('  Tier:', proxy.tier);
});

tenants.get('internal').call(proxy => {
  console.log('\nInternal tier:');
  console.log('  All keys:', Object.keys(proxy));
  console.log('  Internal notes:', proxy.internalNotes);
  console.log('  Environment:', proxy.environment);
});

// ============================================================================
// Example 6: Dynamic Configuration Updates
// ============================================================================
console.log('\n--- Example 6: Dynamic Configuration Updates ---');

const resource = {
  id: 'RES-001',
  name: 'Shared Resource',
  data: 'Important data',
  secret: 'confidential'
};

const dynamicTenant = createTenantContext(resource, 'dynamic', {
  visibleKeys: new Set(['id', 'name']),
  metadata: { access: 'limited' }
});

dynamicTenant.call(proxy => {
  console.log('Initial view:');
  console.log('  Keys:', Object.keys(proxy));
  console.log('  Can see data:', 'data' in proxy); // false
});

// Upgrade tenant access
console.log('\nUpgrading tenant access...');
dynamicTenant.updateConfig({
  visibleKeys: new Set(['id', 'name', 'data']),
  metadata: { access: 'standard' }
});

dynamicTenant.call(proxy => {
  console.log('After upgrade:');
  console.log('  Keys:', Object.keys(proxy));
  console.log('  Can see data:', 'data' in proxy); // true
  console.log('  Data:', proxy.data);
  console.log('  Metadata:', dynamicTenant.getMetadata());
});

// Add virtual properties dynamically
console.log('\nAdding virtual properties...');
dynamicTenant.updateConfig({
  virtualProperties: {
    accessLevel: 'standard',
    lastUpdated: () => new Date().toISOString()
  }
});

dynamicTenant.call(proxy => {
  console.log('With virtual properties:');
  console.log('  Access level:', proxy.accessLevel);
  console.log('  Last updated:', proxy.lastUpdated);
});

// ============================================================================
// Example 7: Tenant Isolation - Modifications
// ============================================================================
console.log('\n--- Example 7: Tenant Isolation with Modifications ---');

const sharedState = {
  counter: 0,
  status: 'initial'
};

const tenantA = createTenantContext(sharedState, 'tenant-a', {
  transformGet: (key, value) => {
    if (key === 'status') return `[A] ${value}`;
    return value;
  }
});

const tenantB = createTenantContext(sharedState, 'tenant-b', {
  transformGet: (key, value) => {
    if (key === 'status') return `[B] ${value}`;
    return value;
  }
});

console.log('Initial state:', sharedState);

tenantA.call(proxy => {
  console.log('Tenant A sees status:', proxy.status);
  proxy.counter = 10;
});

console.log('After Tenant A modification:', sharedState);

tenantB.call(proxy => {
  console.log('Tenant B sees status:', proxy.status);
  console.log('Tenant B sees counter:', proxy.counter); // 10 - shared state
});

// ============================================================================
// Example 8: Real-World SaaS Scenario
// ============================================================================
console.log('\n--- Example 8: Real-World SaaS Scenario ---');

// Shared database record
const userRecord = {
  id: 'USER-123',
  email: 'user@company.com',
  name: 'John Doe',
  passwordHash: '$2b$10$abcdef...',
  apiKey: 'sk_live_abc123...',
  billingPlan: 'enterprise',
  billingHistory: [...Array.from({ length: 12 })],
  usageStats: { apiCalls: 15_000, storage: 5_000_000 },
  internalFlags: { beta: true, priority: 'high' },
  createdAt: '2024-01-15',
  lastLogin: '2025-01-10'
};

// Different tenant views for different contexts
const publicApiTenant = createTenantContext(userRecord, 'public-api', {
  visibleKeys: new Set(['id', 'name', 'email', 'billingPlan']),
  virtualProperties: {
    profileUrl: function() {
      return `/users/${this.id}`;
    }
  },
  transformGet: (key, value) => {
    if (key === 'email') {
      // Partially mask email for privacy
      const [local, domain] = value.split('@');
      return local.slice(0, 2) + '***@' + domain;
    }
    return value;
  },
  metadata: { context: 'public-api', version: '1.0' }
});

const billingTenant = createTenantContext(userRecord, 'billing', {
  visibleKeys: new Set(['id', 'email', 'billingPlan', 'billingHistory', 'usageStats']),
  virtualProperties: {
    currentPeriodCost: function() {
      const baseCost = this.billingPlan === 'enterprise' ? 999 : 49;
      const overageCost = Math.max(0, this.usageStats.apiCalls - 10_000) * 0.001;
      return baseCost + overageCost;
    },
    isOverage: function() {
      return this.usageStats.apiCalls > 10_000;
    }
  },
  metadata: { context: 'billing', department: 'finance' }
});

const supportTenant = createTenantContext(userRecord, 'support', {
  visibleKeys: (key) =>
    !key.includes('password') &&
    !key.includes('apiKey') &&
    !key.includes('billing') &&
    !key.includes('internalFlags'),
  virtualProperties: {
    accountAge: function() {
      const created = new Date(this.createdAt);
      const now = new Date();
      const days = Math.floor((now - created) / (1000 * 60 * 60 * 24));
      return `${days} days`;
    },
    recentActivity: function() {
      const lastLogin = new Date(this.lastLogin);
      const daysAgo = Math.floor((new Date() - lastLogin) / (1000 * 60 * 60 * 24));
      return daysAgo === 0 ? 'Today' : `${daysAgo} days ago`;
    }
  },
  metadata: { context: 'support', team: 'customer-success' }
});

console.log('SaaS Multi-Tenant Views:\n');

publicApiTenant.call(proxy => {
  console.log('Public API response:');
  console.log(JSON.stringify({
    id: proxy.id,
    name: proxy.name,
    email: proxy.email,
    plan: proxy.billingPlan,
    profileUrl: proxy.profileUrl
  }, null, 2));
});

billingTenant.call(proxy => {
  console.log('\nBilling dashboard:');
  console.log('  Customer:', proxy.id);
  console.log('  Plan:', proxy.billingPlan);
  console.log('  API Calls:', proxy.usageStats.apiCalls.toLocaleString());
  console.log('  Is Overage:', proxy.isOverage);
  console.log('  Current Period Cost: $' + proxy.currentPeriodCost);
});

supportTenant.call(proxy => {
  console.log('\nSupport panel:');
  console.log('  Name:', proxy.name);
  console.log('  Email:', proxy.email);
  console.log('  Account Age:', proxy.accountAge);
  console.log('  Recent Activity:', proxy.recentActivity);
  console.log('  Visible Keys:', Object.keys(proxy));
});

// ============================================================================
// Example 9: Utility Functions
// ============================================================================
console.log('\n--- Example 9: Utility Functions ---');

const testData = { value: 42 };
const testTenant = createTenantContext(testData, 'test-tenant-id');

testTenant.call(proxy => {
  const tenantId = getTenantId(proxy);
  const rawTarget = getRawTarget(proxy);

  console.log('Tenant ID:', tenantId);
  console.log('Raw target is original:', rawTarget === testData);
  console.log('Proxy value:', proxy.value);
});

console.log('\n=== End of Examples ===');
