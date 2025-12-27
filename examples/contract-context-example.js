import { createProxy } from '../src/proxy/create-proxy.js'
import {
  createContractContext,
  registerContractInterceptors,
} from '../src/contracts/contract-context.js'

/**
 * Protocol & Call-Level Contracts Example
 *
 * This example demonstrates how to use the contract context to enforce:
 * - Argument validation
 * - Call sequencing (enforced method call order)
 * - Rate limiting
 * - Return type validation
 * - Purity checking (no side effects)
 */

console.log('=== Contract Context Example ===\n')

// ============================================================================
// Example 1: Argument Validation
// ============================================================================
console.log('1. Argument Validation')
console.log('---------------------')

const userService = {
  createUser: function createUser(name, email, age) {
    return { id: Date.now(), name, email, age }
  },
}

const { proxy: userProxy } = createProxy(userService.createUser)

const userContractCtx = createContractContext(userService, {
  createUser: {
    validate: (args) => {
      if (args.length !== 3) return 'Must provide name, email, and age'
      if (typeof args[0] !== 'string') return 'Name must be a string'
      if (typeof args[1] !== 'string' || !args[1].includes('@')) return 'Invalid email format'
      if (typeof args[2] !== 'number' || args[2] < 0 || args[2] > 150) return 'Age must be between 0 and 150'
      return true
    },
    maxArgs: 3,
    returnType: 'object',
  },
})

registerContractInterceptors({ proxy: userProxy, defineApplyInterceptor: (fn) => fn, defineConstructInterceptor: (fn) => fn }, userContractCtx)

userContractCtx.call(() => {
  try {
    // Valid user creation
    const user = userProxy('Alice', 'alice@example.com', 30)
    console.log('✓ Created user:', user)
  } catch (error) {
    console.log('✗ Error:', error.message)
  }

  try {
    // Invalid: wrong email format
    userProxy('Bob', 'not-an-email', 25)
  } catch (error) {
    console.log('✗ Caught expected error:', error.message)
  }
})

console.log()

// ============================================================================
// Example 2: Call Sequencing (Database Transaction Pattern)
// ============================================================================
console.log('2. Call Sequencing (Database Transaction)')
console.log('------------------------------------------')

const database = {
  begin: function begin() {
    console.log('  → Transaction started')
    return 'transaction_id_123'
  },
  query: function query(sql) {
    console.log(`  → Executing query: ${sql}`)
    return [{ id: 1, name: 'Result' }]
  },
  commit: function commit() {
    console.log('  → Transaction committed')
    return true
  },
  rollback: function rollback() {
    console.log('  → Transaction rolled back')
    return true
  },
}

const { proxy: beginProxy } = createProxy(database.begin)
const { proxy: queryProxy } = createProxy(database.query)
const { proxy: commitProxy } = createProxy(database.commit)

const dbContractCtx = createContractContext(database, {
  begin: {
    sequence: ['begin', 'query', 'commit'],
  },
  query: {
    sequence: ['begin', 'query', 'commit'],
    validate: (args) => args[0] && typeof args[0] === 'string',
  },
  commit: {
    sequence: ['begin', 'query', 'commit'],
  },
})

registerContractInterceptors({ proxy: beginProxy, defineApplyInterceptor: (fn) => fn, defineConstructInterceptor: (fn) => fn }, dbContractCtx)
registerContractInterceptors({ proxy: queryProxy, defineApplyInterceptor: (fn) => fn, defineConstructInterceptor: (fn) => fn }, dbContractCtx)
registerContractInterceptors({ proxy: commitProxy, defineApplyInterceptor: (fn) => fn, defineConstructInterceptor: (fn) => fn }, dbContractCtx)

dbContractCtx.call(() => {
  try {
    // Correct sequence
    beginProxy()
    queryProxy('SELECT * FROM users')
    commitProxy()
    console.log('✓ Transaction completed successfully')
  } catch (error) {
    console.log('✗ Error:', error.message)
  }

  // Reset for next example
  dbContractCtx.resetSequence()

  try {
    // Incorrect sequence: trying to commit before begin
    commitProxy()
  } catch (error) {
    console.log('✗ Caught expected error:', error.message)
  }
})

console.log()

// ============================================================================
// Example 3: Rate Limiting (API Endpoint Pattern)
// ============================================================================
console.log('3. Rate Limiting (API Endpoint)')
console.log('-------------------------------')

const apiService = {
  fetchData: function fetchData(endpoint) {
    return { endpoint, data: 'mock data', timestamp: Date.now() }
  },
}

const { proxy: apiProxy } = createProxy(apiService.fetchData)

const apiContractCtx = createContractContext(apiService, {
  fetchData: {
    validate: (args) => args[0] && typeof args[0] === 'string',
    rateLimit: {
      calls: 3,
      window: 1000, // 3 calls per second
    },
    returnType: 'object',
  },
})

registerContractInterceptors({ proxy: apiProxy, defineApplyInterceptor: (fn) => fn, defineConstructInterceptor: (fn) => fn }, apiContractCtx)

apiContractCtx.call(() => {
  // First 3 calls should succeed
  for (let index = 0; index < 3; index++) {
    try {
      const result = apiProxy('/api/users')
      console.log(`✓ Call ${index + 1} succeeded`)
    } catch (error) {
      console.log(`✗ Call ${index + 1} failed:`, error.message)
    }
  }

  // 4th call should fail due to rate limit
  try {
    apiProxy('/api/users')
  } catch (error) {
    console.log('✗ Caught expected error:', error.message)
  }

  // Check rate limit stats
  const stats = apiContractCtx.getRateLimitStats('fetchData')
  console.log(`Rate limit stats: ${stats.currentCalls}/${stats.maxCalls} calls, ${stats.remaining} remaining`)
})

console.log()

// ============================================================================
// Example 4: Purity Checking (Pure Functions)
// ============================================================================
console.log('4. Purity Checking (Pure Functions)')
console.log('-----------------------------------')

const mathService = {
  sum: function sum(array_) {
    return array_.reduce((acc, n) => acc + n, 0)
  },
  average: function average(array_) {
    return this.sum(array_) / array_.length
  },
}

const { proxy: sumProxy } = createProxy(mathService.sum)

const mathContractCtx = createContractContext(mathService, {
  sum: {
    pure: true,
    validate: (args) => Array.isArray(args[0]) || 'Argument must be an array',
    returnType: 'number',
  },
})

registerContractInterceptors({ proxy: sumProxy, defineApplyInterceptor: (fn) => fn, defineConstructInterceptor: (fn) => fn }, mathContractCtx)

mathContractCtx.call(() => {
  try {
    const result = sumProxy([1, 2, 3, 4, 5])
    console.log('✓ Pure function result:', result)
  } catch (error) {
    console.log('✗ Error:', error.message)
  }
})

console.log()

// ============================================================================
// Example 5: Pre-validation with validateCall
// ============================================================================
console.log('5. Pre-validation with validateCall')
console.log('-----------------------------------')

const paymentService = {
  processPayment: function processPayment(amount, currency) {
    return { success: true, amount, currency }
  },
}

const paymentContractCtx = createContractContext(paymentService, {
  processPayment: {
    validate: (args) => {
      if (typeof args[0] !== 'number') return 'Amount must be a number'
      if (args[0] <= 0) return 'Amount must be positive'
      if (!['USD', 'EUR', 'GBP'].includes(args[1])) return 'Invalid currency'
      return true
    },
    maxArgs: 2,
  },
})

// Pre-validate without executing
let validation = paymentContractCtx.validateCall('processPayment', [100, 'USD'])
console.log('Validation for valid call:', validation)

validation = paymentContractCtx.validateCall('processPayment', [-50, 'USD'])
console.log('Validation for invalid call:', validation)

console.log()

// ============================================================================
// Example 6: Combined Contracts (Multiple Constraints)
// ============================================================================
console.log('6. Combined Contracts (Multiple Constraints)')
console.log('--------------------------------------------')

const secureApi = {
  authenticatedRequest: function authenticatedRequest(token, endpoint) {
    return { authorized: true, endpoint, data: 'sensitive data' }
  },
}

const { proxy: secureProxy } = createProxy(secureApi.authenticatedRequest)

const secureContractCtx = createContractContext(secureApi, {
  authenticatedRequest: {
    // Argument validation
    validate: (args) => {
      if (typeof args[0] !== 'string' || args[0].length < 20) return 'Invalid token'
      if (typeof args[1] !== 'string') return 'Invalid endpoint'
      return true
    },
    // Rate limiting for security
    rateLimit: {
      calls: 10,
      window: 60_000, // 10 calls per minute
    },
    // Type checking
    returnType: 'object',
    // Max arguments
    maxArgs: 2,
  },
})

registerContractInterceptors({ proxy: secureProxy, defineApplyInterceptor: (fn) => fn, defineConstructInterceptor: (fn) => fn }, secureContractCtx)

secureContractCtx.call(() => {
  try {
    const result = secureProxy('valid_token_12345678901234567890', '/api/secure/data')
    console.log('✓ Secure request succeeded:', result)
  } catch (error) {
    console.log('✗ Error:', error.message)
  }

  try {
    // Should fail: token too short
    secureProxy('short', '/api/secure/data')
  } catch (error) {
    console.log('✗ Caught expected error:', error.message)
  }

  // Check stats
  const stats = secureContractCtx.getRateLimitStats('authenticatedRequest')
  console.log(`Rate limit: ${stats.currentCalls}/${stats.maxCalls} calls used`)
  console.log(`Sequence state:`, secureContractCtx.getSequenceState())
})

console.log()

// ============================================================================
// Example 7: Constructor Contracts
// ============================================================================
console.log('7. Constructor Contracts')
console.log('------------------------')

const User = function User(name, email) {
  this.name = name
  this.email = email
  this.createdAt = new Date()
}

const { proxy: UserProxy } = createProxy(User)

const constructorContractCtx = createContractContext(User, {
  User: {
    validate: (args) => {
      if (args.length !== 2) return 'Must provide name and email'
      if (typeof args[0] !== 'string') return 'Name must be string'
      if (typeof args[1] !== 'string' || !args[1].includes('@')) return 'Invalid email'
      return true
    },
  },
})

registerContractInterceptors({ proxy: UserProxy, defineApplyInterceptor: (fn) => fn, defineConstructInterceptor: (fn) => fn }, constructorContractCtx)

constructorContractCtx.call(() => {
  try {
    const user = new UserProxy('Charlie', 'charlie@example.com')
    console.log('✓ User created:', user)
  } catch (error) {
    console.log('✗ Error:', error.message)
  }

  try {
    // Should fail: invalid email
    new UserProxy('Dave', 'not-an-email')
  } catch (error) {
    console.log('✗ Caught expected error:', error.message)
  }
})

console.log('\n=== Contract Context Example Complete ===')
