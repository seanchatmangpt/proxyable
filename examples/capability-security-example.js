import { createProxy } from '../src/proxy/create-proxy.js'
import {
  createCapabilityContext,
  registerCapabilityInterceptors,
} from '../src/security/capability-acl.js'

/**
 * Example: Capability-Based Access Control with Proxyable
 *
 * Demonstrates how to use capability-based security to control access
 * to object properties and methods based on possession of capabilities.
 */

console.log('=== Capability-Based Access Control Example ===\n')

// Example 1: Basic Read/Write Capabilities
console.log('Example 1: Basic Read/Write Capabilities')
console.log('-'.repeat(50))

const document = {
  title: 'Confidential Report',
  content: 'Sensitive information...',
  author: 'John Doe',
  metadata: { created: '2024-01-01' }
}

const { proxy: docProxy, ...docInterface } = createProxy(document)

// Create a read-only capability (can read title and author, but not content)
const readOnlyCtx = createCapabilityContext(document, {
  canRead: new Set(['title', 'author']),
  canWrite: new Set(), // No write permissions
})

registerCapabilityInterceptors(docInterface, readOnlyCtx)

readOnlyCtx.call(() => {
  console.log('Read-only access:')
  console.log('  Title:', docProxy.title) // ✓ Allowed
  console.log('  Author:', docProxy.author) // ✓ Allowed

  try {
    console.log('  Content:', docProxy.content) // ✗ Denied
  } catch (e) {
    console.log('  Content: Access denied ✗')
  }

  try {
    docProxy.title = 'Modified Title' // ✗ Denied
    console.log('  Write: Success')
  } catch (e) {
    console.log('  Write: Denied ✗')
  }
})

console.log()

// Example 2: Multiple Isolated Contexts
console.log('Example 2: Multiple Isolated Contexts')
console.log('-'.repeat(50))

const database = {
  publicData: 'Everyone can see this',
  userData: 'User-specific data',
  adminData: 'Admin-only data',
  secretKey: 'super-secret-key'
}

// Public proxy - minimal access
const { proxy: publicProxy, ...publicInterface } = createProxy(database)
const publicCtx = createCapabilityContext(database, {
  canRead: new Set(['publicData']),
  canWrite: new Set(),
})
registerCapabilityInterceptors(publicInterface, publicCtx)

// User proxy - more access
const { proxy: userProxy, ...userInterface } = createProxy(database)
const userCtx = createCapabilityContext(database, {
  canRead: new Set(['publicData', 'userData']),
  canWrite: new Set(['userData']),
})
registerCapabilityInterceptors(userInterface, userCtx)

// Admin proxy - full access
const { proxy: adminProxy, ...adminInterface } = createProxy(database)
const adminCtx = createCapabilityContext(database, {
  canRead: new Set(['publicData', 'userData', 'adminData', 'secretKey']),
  canWrite: new Set(['publicData', 'userData', 'adminData']),
  canDelete: new Set(['userData']),
})
registerCapabilityInterceptors(adminInterface, adminCtx)

console.log('Public context:')
publicCtx.call(() => {
  console.log('  publicData:', publicProxy.publicData) // ✓
  try {
    console.log('  userData:', publicProxy.userData)
  } catch (e) {
    console.log('  userData: Access denied ✗')
  }
})

console.log('\nUser context:')
userCtx.call(() => {
  console.log('  publicData:', userProxy.publicData) // ✓
  console.log('  userData:', userProxy.userData) // ✓
  userProxy.userData = 'Updated user data' // ✓
  console.log('  Updated userData:', database.userData)
  try {
    console.log('  adminData:', userProxy.adminData)
  } catch (e) {
    console.log('  adminData: Access denied ✗')
  }
})

console.log('\nAdmin context:')
adminCtx.call(() => {
  console.log('  publicData:', adminProxy.publicData) // ✓
  console.log('  userData:', adminProxy.userData) // ✓
  console.log('  adminData:', adminProxy.adminData) // ✓
  console.log('  secretKey:', adminProxy.secretKey) // ✓
})

console.log()

// Example 3: Function-Based Capabilities with Dynamic Rules
console.log('Example 3: Function-Based Capabilities')
console.log('-'.repeat(50))

const apiConfig = {
  public_endpoint: '/api/public',
  private_endpoint: '/api/private',
  internal_endpoint: '/api/internal',
  public_key: 'pk_123',
  private_key: 'sk_456',
}

const { proxy: apiProxy, ...apiInterface } = createProxy(apiConfig)

// Capability: Can read anything starting with 'public_', can write nothing
const apiCtx = createCapabilityContext(apiConfig, {
  canRead: (key) => String(key).startsWith('public_'),
  canWrite: (key) => false, // No writes allowed
})

registerCapabilityInterceptors(apiInterface, apiCtx)

apiCtx.call(() => {
  console.log('Function-based read capability (public_* only):')
  console.log('  public_endpoint:', apiProxy.public_endpoint) // ✓
  console.log('  public_key:', apiProxy.public_key) // ✓

  try {
    console.log('  private_endpoint:', apiProxy.private_endpoint)
  } catch (e) {
    console.log('  private_endpoint: Access denied ✗')
  }

  const keys = Reflect.ownKeys(apiProxy)
  console.log('  Visible keys:', keys) // Only public_* keys
})

console.log()

// Example 4: Function Application Control
console.log('Example 4: Function Application Control')
console.log('-'.repeat(50))

const calculator = function (operation, a, b) {
  switch (operation) {
    case 'add': return a + b
    case 'subtract': return a - b
    case 'multiply': return a * b
    case 'divide': return a / b
    default: throw new Error('Unknown operation')
  }
}

const { proxy: calcProxy, ...calcInterface } = createProxy(calculator)

// Only allow safe operations (no division to prevent divide-by-zero exploits)
const calcCtx = createCapabilityContext(calculator, {
  canApply: (target, thisArg, [operation]) => {
    return ['add', 'subtract', 'multiply'].includes(operation)
  },
})

registerCapabilityInterceptors(calcInterface, calcCtx)

calcCtx.call(() => {
  console.log('Safe operations allowed:')
  console.log('  add(5, 3):', calcProxy('add', 5, 3)) // ✓
  console.log('  multiply(4, 7):', calcProxy('multiply', 4, 7)) // ✓

  try {
    console.log('  divide(10, 2):', calcProxy('divide', 10, 2))
  } catch (e) {
    console.log('  divide(10, 2): Access denied ✗')
  }
})

console.log()

// Example 5: Constructor Control
console.log('Example 5: Constructor Control')
console.log('-'.repeat(50))

class User {
  constructor(name, role) {
    this.name = name
    this.role = role
  }
}

const { proxy: UserProxy, ...userClassInterface } = createProxy(User)

// Only allow construction of non-admin users
const constructCtx = createCapabilityContext(User, {
  canRead: new Set(['prototype', 'name', 'length']), // Allow reading constructor metadata
  canConstruct: (target, [name, role]) => {
    return role !== 'admin' // Prevent admin creation through this proxy
  },
})

registerCapabilityInterceptors(userClassInterface, constructCtx)

constructCtx.call(() => {
  console.log('Constructor capability (non-admin only):')

  const user1 = new UserProxy('Alice', 'user')
  console.log('  Created user:', user1.name, '-', user1.role) // ✓

  try {
    const admin = new UserProxy('Bob', 'admin')
    console.log('  Created admin:', admin.name)
  } catch (e) {
    console.log('  Admin creation: Access denied ✗')
  }
})

console.log()

// Example 6: Composing with Other Interceptors
console.log('Example 6: Composition with Logging')
console.log('-'.repeat(50))

const secureStore = {
  apiKey: 'secret_key_123',
  apiUrl: 'https://api.example.com',
  timeout: 5000,
}

const storeInterface = createProxy(secureStore)
const storeProxy = storeInterface.proxy

// Add logging interceptor first
const accessLog = []
storeInterface.defineGetInterceptor((target, prop) => {
  accessLog.push({ prop: String(prop), timestamp: Date.now() })
  return undefined // Continue to next interceptor
})

// Add capability interceptor
const storeCtx = createCapabilityContext(secureStore, {
  canRead: new Set(['apiUrl', 'timeout']), // apiKey is secret
})

registerCapabilityInterceptors(storeInterface, storeCtx)

storeCtx.call(() => {
  console.log('Composed interceptors (logging + capabilities):')
  console.log('  apiUrl:', storeProxy.apiUrl) // Logged and allowed

  try {
    console.log('  apiKey:', storeProxy.apiKey) // Logged but denied
  } catch (e) {
    console.log('  apiKey: Access denied ✗')
  }

  console.log('  Access log entries:', accessLog.length)
  console.log('  Logged properties:', accessLog.map(l => l.prop))
})

console.log()

// Example 7: Context Isolation Demonstration
console.log('Example 7: Context Isolation (No Global Leakage)')
console.log('-'.repeat(50))

const sharedResource = {
  data: 'sensitive',
  counter: 0,
}

const resourceInterface = createProxy(sharedResource)
const resourceProxy = resourceInterface.proxy

const ctx1 = createCapabilityContext(sharedResource, {
  canRead: new Set(['data']),
})

const ctx2 = createCapabilityContext(sharedResource, {
  canRead: new Set(['counter']),
})

registerCapabilityInterceptors(resourceInterface, ctx1)

console.log('Context 1 (can read "data"):')
ctx1.call(() => {
  console.log('  data:', resourceProxy.data) // ✓
  try {
    console.log('  counter:', resourceProxy.counter)
  } catch (e) {
    console.log('  counter: Access denied ✗')
  }
})

console.log('\nOutside any context:')
try {
  console.log('  data:', resourceProxy.data)
} catch (e) {
  console.log('  data: No capability context ✗')
}

console.log()
console.log('=== Examples Complete ===')
console.log('\nKey Takeaways:')
console.log('1. Capabilities are possession-based: having the context = having authority')
console.log('2. Fail-closed: operations are denied by default unless explicitly granted')
console.log('3. Context-local: permissions are tied to execution context, no global state')
console.log('4. Composable: works alongside other interceptors without interference')
console.log('5. Flexible: supports both Set-based and function-based capabilities')
