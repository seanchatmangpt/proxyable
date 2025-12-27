/**
 * Virtual Context Example - Lazy Computation & Virtual Objects
 *
 * Demonstrates how to create virtual fields that:
 * - Compute values on-demand (lazy evaluation)
 * - Memoize results per context
 * - Support TTL (time-to-live) expiration
 * - Use alternate storage backends
 * - Redirect property access
 * - Appear indistinguishable from real properties
 */

import { createProxy } from '../src/proxy/create-proxy.js'
import {
  createVirtualContext,
  registerVirtualInterceptors
} from '../src/virtualization/virtual-context.js'

console.log('=== Virtual Context Examples ===\n')

// Example 1: Basic Computed Virtual Fields
console.log('1. Basic Computed Virtual Fields')
console.log('-----------------------------------')
{
  const user = {
    firstName: 'John',
    lastName: 'Doe',
    birthYear: 1990
  }

  const proxyInterface = createProxy(user)
  const proxy = proxyInterface.proxy

  const virtual = createVirtualContext(user, {
    virtualFields: {
      fullName: {
        compute: (target) => `${target.firstName} ${target.lastName}`
      },
      age: {
        compute: (target) => new Date().getFullYear() - target.birthYear
      }
    }
  })

  registerVirtualInterceptors(proxyInterface, virtual)

  virtual.call(() => {
    console.log(`Full Name: ${proxy.fullName}`) // "John Doe"
    console.log(`Age: ${proxy.age}`) // Computed from birth year
    console.log(`Is enumerable: ${'fullName' in proxy}`) // true
  })

  console.log()
}

// Example 2: Memoization with Context-Local Cache
console.log('2. Memoization with Context-Local Cache')
console.log('-----------------------------------')
{
  let computeCount = 0
  const data = { value: 10 }

  const proxyInterface = createProxy(data)
  const proxy = proxyInterface.proxy

  const virtual = createVirtualContext(data, {
    virtualFields: {
      expensive: {
        compute: (target) => {
          computeCount++
          console.log(`  Computing expensive value... (call #${computeCount})`)
          return target.value * 2
        },
        memoize: true,
        storage: 'context'
      }
    }
  })

  registerVirtualInterceptors(proxyInterface, virtual)

  console.log('First context:')
  virtual.call(() => {
    console.log(`  Result: ${proxy.expensive}`) // Computes
    console.log(`  Result: ${proxy.expensive}`) // Uses cache
    console.log(`  Result: ${proxy.expensive}`) // Uses cache
  })

  console.log('Second context (independent cache):')
  virtual.call(() => {
    console.log(`  Result: ${proxy.expensive}`) // Computes again (new context)
    console.log(`  Result: ${proxy.expensive}`) // Uses cache
  })

  console.log()
}

// Example 3: TTL (Time-To-Live) Expiration
console.log('3. TTL (Time-To-Live) Expiration')
console.log('-----------------------------------')
{
  const cache = { timestamp: Date.now() }

  const proxyInterface = createProxy(cache)
  const proxy = proxyInterface.proxy

  const virtual = createVirtualContext(cache, {
    virtualFields: {
      currentTime: {
        compute: () => {
          const time = new Date().toLocaleTimeString()
          console.log(`  Computing time: ${time}`)
          return time
        },
        memoize: true,
        ttl: 100 // Expire after 100ms
      }
    }
  })

  registerVirtualInterceptors(proxyInterface, virtual)

  virtual.call(() => {
    console.log(`Time (cached): ${proxy.currentTime}`)
    console.log(`Time (cached): ${proxy.currentTime}`)

    // Manually invalidate cache
    virtual.invalidateCache('currentTime')
    console.log(`Time (recomputed): ${proxy.currentTime}`)
  })

  console.log()
}

// Example 4: External Storage Backend
console.log('4. External Storage Backend')
console.log('-----------------------------------')
{
  const session = { userId: 123 }
  const externalCache = new Map()

  const proxyInterface = createProxy(session)
  const proxy = proxyInterface.proxy

  const virtual = createVirtualContext(session, {
    virtualFields: {
      userData: {
        compute: (target) => {
          console.log(`  Fetching user data for ID: ${target.userId}`)
          return { id: target.userId, name: 'Alice', role: 'admin' }
        },
        memoize: true,
        storage: 'external'
      }
    },
    alternateStorage: externalCache
  })

  registerVirtualInterceptors(proxyInterface, virtual)

  virtual.call(() => {
    const data = proxy.userData
    console.log(`  User: ${data.name}, Role: ${data.role}`)
    console.log(`  External cache has userData: ${externalCache.has('userData')}`)
  })

  // Access from a different context - reads from external storage
  virtual.call(() => {
    const data = proxy.userData
    console.log(`  Cached user: ${data.name}`)
  })

  console.log()
}

// Example 5: Target Storage (Persistent Across Contexts)
console.log('5. Target Storage (Persistent Across Contexts)')
console.log('-----------------------------------')
{
  const product = { price: 100, taxRate: 0.1 }

  const proxyInterface = createProxy(product)
  const proxy = proxyInterface.proxy

  const virtual = createVirtualContext(product, {
    virtualFields: {
      totalPrice: {
        compute: (target) => {
          console.log('  Computing total price...')
          return target.price * (1 + target.taxRate)
        },
        storage: 'target' // Persist on target object
      }
    }
  })

  registerVirtualInterceptors(proxyInterface, virtual)

  console.log('First context:')
  virtual.call(() => {
    console.log(`  Total: $${proxy.totalPrice}`)
  })

  console.log('Second context (reads from target):')
  virtual.call(() => {
    console.log(`  Total: $${proxy.totalPrice}`) // No recomputation
  })

  console.log()
}

// Example 6: Property Redirects
console.log('6. Property Redirects')
console.log('-----------------------------------')
{
  const config = {
    _apiKey: 'secret-key-12345',
    _dbPassword: 'super-secret'
  }

  const proxyInterface = createProxy(config)
  const proxy = proxyInterface.proxy

  const virtual = createVirtualContext(config, {
    virtualFields: {
      maskedApiKey: {
        compute: (target) => target._apiKey.replace(/./g, '*')
      },
      maskedPassword: {
        compute: (target) => target._dbPassword.replace(/./g, '*')
      }
    },
    redirects: {
      apiKey: 'maskedApiKey', // Redirect 'apiKey' to 'maskedApiKey'
      dbPassword: 'maskedPassword'
    }
  })

  registerVirtualInterceptors(proxyInterface, virtual)

  virtual.call(() => {
    console.log(`  API Key (via redirect): ${proxy.apiKey}`)
    console.log(`  Password (via redirect): ${proxy.dbPassword}`)
    console.log(`  Direct access: ${proxy.maskedApiKey}`)
  })

  console.log()
}

// Example 7: Writing to Virtual Fields
console.log('7. Writing to Virtual Fields')
console.log('-----------------------------------')
{
  const calculator = { base: 10 }

  const proxyInterface = createProxy(calculator)
  const proxy = proxyInterface.proxy

  const virtual = createVirtualContext(calculator, {
    virtualFields: {
      result: {
        compute: (target) => target.base * 2,
        storage: 'context' // Allow writes to context cache
      }
    }
  })

  registerVirtualInterceptors(proxyInterface, virtual)

  virtual.call(() => {
    console.log(`  Computed result: ${proxy.result}`) // 20 (base * 2)

    // Override with custom value
    proxy.result = 999
    console.log(`  Custom result: ${proxy.result}`) // 999
  })

  // New context - back to computed value
  virtual.call(() => {
    console.log(`  New context result: ${proxy.result}`) // 20 (recomputed)
  })

  console.log()
}

// Example 8: Virtual Fields in Enumeration
console.log('8. Virtual Fields in Enumeration')
console.log('-----------------------------------')
{
  const item = { name: 'Widget', cost: 50 }

  const proxyInterface = createProxy(item)
  const proxy = proxyInterface.proxy

  const virtual = createVirtualContext(item, {
    virtualFields: {
      displayName: {
        compute: (target) => `Product: ${target.name}`
      },
      price: {
        compute: (target) => `$${target.cost.toFixed(2)}`
      }
    }
  })

  registerVirtualInterceptors(proxyInterface, virtual)

  virtual.call(() => {
    console.log('  All keys:', Object.keys(proxy))

    console.log('  For...in loop:')
    for (const key in proxy) {
      console.log(`    ${key}: ${proxy[key]}`)
    }

    console.log(`  'displayName' in proxy: ${'displayName' in proxy}`)
  })

  console.log()
}

// Example 9: Direct API Access
console.log('9. Direct API Access')
console.log('-----------------------------------')
{
  const data = { x: 5 }

  const virtual = createVirtualContext(data, {
    virtualFields: {
      doubled: {
        compute: (target) => target.x * 2
      }
    }
  })

  // Use API without proxy
  console.log(`  Computed value: ${virtual.getVirtualValue('doubled')}`)
  console.log(`  Is virtual field: ${virtual.isVirtualField('doubled')}`)
  console.log(`  Virtual fields: ${virtual.getVirtualFields().join(', ')}`)

  const externalStorage = new Map()
  const virtualWithStorage = createVirtualContext(data, {
    virtualFields: {
      cached: {
        compute: (target) => target.x * 3,
        storage: 'external'
      }
    },
    alternateStorage: externalStorage
  })

  virtualWithStorage.setStorage('custom', 'value')
  console.log(`  Get from storage: ${virtualWithStorage.getFromStorage('custom')}`)

  console.log()
}

// Example 10: Composition with Transactions
console.log('10. Composition with Transactions')
console.log('-----------------------------------')
{
  const account = { balance: 1000, fee: 0.05 }

  const proxyInterface = createProxy(account)
  const proxy = proxyInterface.proxy

  // Import transaction context (if available)
  const virtual = createVirtualContext(account, {
    virtualFields: {
      netBalance: {
        compute: (target) => target.balance * (1 - target.fee)
      }
    }
  })

  registerVirtualInterceptors(proxyInterface, virtual)

  virtual.call(() => {
    console.log(`  Current balance: $${proxy.balance}`)
    console.log(`  Net balance (after fees): $${proxy.netBalance}`)

    // Modify balance
    account.balance = 1500
    console.log(`  Updated net balance: $${proxy.netBalance}`)
  })

  console.log()
}

console.log('=== Examples Complete ===')
