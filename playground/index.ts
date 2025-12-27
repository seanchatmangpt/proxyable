import { createProxy } from "../src";

// ============================================================================
// Example 1: Basic Get Interceptor
// ============================================================================
// Create a simple object to be proxied
const user = {
  name: "Alice",
  age: 30,
  email: "alice@example.com",
};

// Create a proxy with a get interceptor that logs property access
const { proxy: userProxy, defineGetInterceptor } = createProxy(user);

// Define a get interceptor that logs when properties are accessed
defineGetInterceptor((target, prop, _receiver) => {
  console.log(`[GET] Accessing property: ${String(prop)}`);
  // Return undefined to allow the default behavior
  return undefined;
});

console.log("\n--- Example 1: Get Interceptor ---");
console.log("Name:", userProxy.name); // Will log: [GET] Accessing property: name
console.log("Age:", userProxy.age); // Will log: [GET] Accessing property: age

// ============================================================================
// Example 2: Set Interceptor with Validation
// ============================================================================
const product = {
  name: "Laptop",
  price: 999,
  quantity: 10,
};

const { proxy: productProxy, defineSetInterceptor } = createProxy(product);

// Define a set interceptor that validates price is not negative
defineSetInterceptor((target, prop, value, receiver) => {
  // If trying to set price, validate it's positive
  if (prop === "price" && typeof value === "number" && value < 0) {
    console.warn(`[SET BLOCKED] Cannot set ${String(prop)} to negative value: ${value}`);
    return false; // Reject the operation
  }
  console.log(`[SET] ${String(prop)} = ${value}`);
  return undefined; // Allow the operation
});

console.log("\n--- Example 2: Set Interceptor with Validation ---");
productProxy.price = 1299;
console.log("Product price:", productProxy.price);

productProxy.price = -50; // This will be blocked
console.log("Product price after blocked attempt:", productProxy.price); // Still 1299

// ============================================================================
// Example 3: Has Interceptor (in operator)
// ============================================================================
const config = {
  debug: true,
  timeout: 5000,
};

const { proxy: configProxy, defineHasInterceptor } = createProxy(config);

// Define a has interceptor that logs property existence checks
defineHasInterceptor((target, prop) => {
  console.log(`[HAS] Checking if property exists: ${String(prop)}`);
  return undefined; // Allow default behavior
});

console.log("\n--- Example 3: Has Interceptor ---");
console.log("'debug' in config:", "debug" in configProxy); // Will log: [HAS] Checking if property exists: debug
console.log("'apiKey' in config:", "apiKey" in configProxy); // Will log: [HAS] Checking if property exists: apiKey

// ============================================================================
// Example 4: Delete Property Interceptor
// ============================================================================
const account = {
  username: "john_doe",
  balance: 1000,
  readonly_id: "12345",
};

const { proxy: accountProxy, defineDeletePropertyInterceptor } = createProxy(account);

// Define a delete interceptor that prevents deletion of readonly_id
defineDeletePropertyInterceptor((target, prop) => {
  if (prop === "readonly_id") {
    console.warn(`[DELETE BLOCKED] Cannot delete protected property: ${String(prop)}`);
    return false; // Prevent deletion
  }
  console.log(`[DELETE] Deleting property: ${String(prop)}`);
  return undefined; // Allow deletion
});

console.log("\n--- Example 4: Delete Property Interceptor ---");
delete accountProxy.balance;
console.log("'balance' in account after deletion:", "balance" in accountProxy); // false

delete accountProxy.readonly_id; // This will be blocked
console.log("'readonly_id' in account after blocked deletion:", "readonly_id" in accountProxy); // true

// ============================================================================
// Example 5: Combined Interceptors with Audit Trail
// ============================================================================
const bankAccount = {
  accountNumber: "ACC123456",
  balance: 5000,
  transactions: [],
};

const {
  proxy: auditedAccount,
  defineGetInterceptor: defineAuditGetInterceptor,
  defineSetInterceptor: defineAuditSetInterceptor,
} = createProxy(bankAccount);

// Get interceptor: log reads
defineAuditGetInterceptor((target, prop) => {
  console.log(`[AUDIT] Read: ${String(prop)}`);
  return undefined;
});

// Set interceptor: log writes and validate balance
defineAuditSetInterceptor((target, prop, value) => {
  if (prop === "balance" && value < 0) {
    console.error(`[AUDIT] BLOCKED: Cannot set balance to negative: ${value}`);
    return false;
  }
  console.log(`[AUDIT] Write: ${String(prop)} = ${value}`);
  return undefined;
});

console.log("\n--- Example 5: Combined Interceptors with Audit Trail ---");
console.log("Current balance:", auditedAccount.balance); // Logs: [AUDIT] Read: balance
auditedAccount.balance = 6000; // Logs: [AUDIT] Write: balance = 6000
auditedAccount.balance = -1000; // Logs: [AUDIT] BLOCKED...
console.log("Final balance:", auditedAccount.balance); // Still 6000
