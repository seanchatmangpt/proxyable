/**
 * Sandboxing & Structural Containment Example
 *
 * Demonstrates how to use the sandbox context to restrict key enumeration,
 * descriptor access, and construction to prevent structural discovery and mutation.
 */

import { createProxy } from '../src/proxy/create-proxy.js'
import {
  createSandboxContext,
  registerSandboxInterceptors,
} from '../src/sandbox/sandbox-context.js'
import {
  createCapabilityContext,
  registerCapabilityInterceptors,
} from '../src/security/capability-acl.js'
import {
  createTransactionContext,
  registerTransactionInterceptors,
} from '../src/transactions/transaction-context.js'

console.log('='.repeat(80))
console.log('Sandboxing & Structural Containment Examples')
console.log('='.repeat(80))

// ============================================================================
// Example 1: Basic Key Restriction
// ============================================================================
console.log('\n1. Basic Key Restriction (Hiding Internal Properties)')
console.log('-'.repeat(80))

const apiObject = {
  publicMethod: () => 'public',
  __internalState: { secret: true },
  __privateMethod: () => 'private',
  version: '1.0.0',
}

const apiProxy = createProxy(apiObject)
const apiSandbox = createSandboxContext(apiObject, {
  // Restrict keys starting with __
  restrictedKeys: (key) => String(key).startsWith('__'),
  allowEnumeration: true,
})

registerSandboxInterceptors(apiProxy, apiSandbox)

apiSandbox.call(() => {
  console.log('Public keys visible:', Object.keys(apiProxy.proxy))
  // Output: ['publicMethod', 'version']

  console.log('"version" in proxy:', 'version' in apiProxy.proxy)
  // Output: true

  console.log('"__internalState" in proxy:', '__internalState' in apiProxy.proxy)
  // Output: false (hidden)

  try {
    apiProxy.proxy.__internalState
  } catch (error_) {
    console.log('Access to __internalState:', error_.message)
  }
  // Output: Sandbox violation: property "__internalState" is restricted
})

// ============================================================================
// Example 2: Construction Control
// ============================================================================
console.log('\n2. Construction Control')
console.log('-'.repeat(80))

class UserAccount {
  constructor(username, role) {
    this.username = username
    this.role = role
    this.createdAt = Date.now()
  }
}

const accountProxy = createProxy(UserAccount)
const accountSandbox = createSandboxContext(UserAccount, {
  allowConstruction: false, // Prevent instantiation
})

registerSandboxInterceptors(accountProxy, accountSandbox)

accountSandbox.call(() => {
  try {
    const user = new accountProxy.proxy('alice', 'admin')
    console.log('Created user:', user)
  } catch (error_) {
    console.log('Construction blocked:', error_.message)
  }
  // Output: Sandbox violation: construction is not allowed
})

// Allow construction with validation
const validatedAccountSandbox = createSandboxContext(UserAccount, {
  allowConstruction: (target, argsList) => {
    const [username, role] = argsList
    // Only allow non-admin users
    return role !== 'admin'
  },
})

const validatedProxy = createProxy(UserAccount)
registerSandboxInterceptors(validatedProxy, validatedAccountSandbox)

validatedAccountSandbox.call(() => {
  try {
    const admin = new validatedProxy.proxy('alice', 'admin')
    console.log('Created admin:', admin)
  } catch (error_) {
    console.log('Admin creation blocked:', error_.message)
  }
  // Output: Sandbox violation: construction is not allowed

  const user = new validatedProxy.proxy('bob', 'user')
  console.log('Created user:', user.username, user.role)
  // Output: Created user: bob user
})

// ============================================================================
// Example 3: Structural Containment (Multi-Layer Discovery Prevention)
// ============================================================================
console.log('\n3. Structural Containment')
console.log('-'.repeat(80))

const secureObject = {
  publicData: 'visible to all',
  _internalCache: new Map(),
  __secretKey: 'abc123',
  __credentials: { apiKey: 'secret' },
}

const secureProxy = createProxy(secureObject)
const structuralSandbox = createSandboxContext(secureObject, {
  restrictedKeys: (key) => String(key).startsWith('_') || String(key).startsWith('__'),
  allowEnumeration: true,
  allowDescriptors: true,
})

registerSandboxInterceptors(secureProxy, structuralSandbox)

structuralSandbox.call(() => {
  console.log('Enumerable keys:', Object.keys(secureProxy.proxy))
  // Output: ['publicData'] - internal keys hidden

  console.log('Own keys:', Reflect.ownKeys(secureProxy.proxy))
  // Output: ['publicData']

  console.log('"_internalCache" in proxy:', '_internalCache' in secureProxy.proxy)
  // Output: false

  console.log('"__secretKey" in proxy:', '__secretKey' in secureProxy.proxy)
  // Output: false

  try {
    Object.getOwnPropertyDescriptor(secureProxy.proxy, '__secretKey')
  } catch (error_) {
    console.log('Descriptor access blocked:', error_.message)
  }
  // Output: Sandbox violation: descriptor access denied for restricted property "__secretKey"

  console.log('Can access public data:', secureProxy.proxy.publicData)
  // Output: Can access public data: visible to all
})

// ============================================================================
// Example 4: Composition - Sandbox > ACL > Transactions
// ============================================================================
console.log('\n4. Layered Security: Sandbox > ACL > Transactions')
console.log('-'.repeat(80))

const dataStore = {
  publicCounter: 0,
  internalState: { version: 1 },
  __adminData: { sensitive: true },
}

const storeProxy = createProxy(dataStore)

// Layer 1: Sandbox - Structural containment
const storeSandbox = createSandboxContext(dataStore, {
  restrictedKeys: (key) => String(key).startsWith('__'),
  allowEnumeration: true,
})

// Layer 2: ACL - Capability-based access
const storeCapabilities = createCapabilityContext(dataStore, {
  canRead: new Set(['publicCounter', 'internalState']),
  canWrite: new Set(['publicCounter']),
})

// Layer 3: Transactions - Mutation tracking
const storeTransaction = createTransactionContext(dataStore)

// Register in order: Sandbox (outermost) > ACL > Transactions (innermost)
registerSandboxInterceptors(storeProxy, storeSandbox)
registerCapabilityInterceptors(storeProxy, storeCapabilities)
registerTransactionInterceptors(storeProxy, storeTransaction)

storeSandbox.call(() => {
  storeCapabilities.call(() => {
    storeTransaction.call(() => {
      console.log('Visible keys:', Object.keys(storeProxy.proxy))
      // Output: ['publicCounter', 'internalState'] - __adminData hidden by sandbox

      // Can read allowed properties
      console.log('Counter value:', storeProxy.proxy.publicCounter)
      // Output: Counter value: 0

      // Can write to allowed properties
      storeProxy.proxy.publicCounter = 5
      console.log('Updated counter:', dataStore.publicCounter)
      // Output: Updated counter: 5

      // Transaction journals the mutation
      console.log('Transaction journal:', storeTransaction.getJournal().length, 'entry')
      // Output: Transaction journal: 1 entry

      // Try to access restricted key
      try {
        storeProxy.proxy.__adminData
      } catch (error_) {
        console.log('Admin data access blocked:', error_.message)
      }
      // Output: Sandbox violation: property "__adminData" is restricted

      // Rollback transaction
      storeTransaction.rollback()
      console.log('After rollback:', dataStore.publicCounter)
      // Output: After rollback: 0
    })
  })
})

// ============================================================================
// Example 5: Dynamic Policy Updates
// ============================================================================
console.log('\n5. Dynamic Policy Updates')
console.log('-'.repeat(80))

const configObject = {
  devMode: true,
  debugFlag: false,
  productionKey: 'prod-key',
}

const configProxy = createProxy(configObject)
const configSandbox = createSandboxContext(configObject, {
  restrictedKeys: new Set(['debugFlag']),
})

registerSandboxInterceptors(configProxy, configSandbox)

configSandbox.call(() => {
  console.log('Initial restricted keys:', Object.keys(configProxy.proxy))
  // Output: ['devMode', 'productionKey']

  // Update policy to restrict productionKey instead
  configSandbox.updatePolicy({
    restrictedKeys: new Set(['productionKey']),
  })

  console.log('Updated restricted keys:', Object.keys(configProxy.proxy))
  // Output: ['devMode', 'debugFlag']

  console.log('Can now access debugFlag:', configProxy.proxy.debugFlag)
  // Output: Can now access debugFlag: false

  try {
    configProxy.proxy.productionKey
  } catch (error_) {
    console.log('Production key now restricted:', error_.message)
  }
  // Output: Sandbox violation: property "productionKey" is restricted
})

// ============================================================================
// Example 6: Whitelist Strategy
// ============================================================================
console.log('\n6. Whitelist Strategy (Allow Only Specific Keys)')
console.log('-'.repeat(80))

const whitelistObject = {
  allowedProp1: 'value1',
  allowedProp2: 'value2',
  deniedProp1: 'hidden1',
  deniedProp2: 'hidden2',
}

const allowedKeys = new Set(['allowedProp1', 'allowedProp2'])

const whitelistProxy = createProxy(whitelistObject)
const whitelistSandbox = createSandboxContext(whitelistObject, {
  // Whitelist: restrict everything NOT in the allowed set
  restrictedKeys: (key) => !allowedKeys.has(key),
  allowEnumeration: true,
})

registerSandboxInterceptors(whitelistProxy, whitelistSandbox)

whitelistSandbox.call(() => {
  console.log('Whitelisted keys only:', Object.keys(whitelistProxy.proxy))
  // Output: ['allowedProp1', 'allowedProp2']

  console.log('Can access allowed:', whitelistProxy.proxy.allowedProp1)
  // Output: Can access allowed: value1

  try {
    whitelistProxy.proxy.deniedProp1
  } catch (error_) {
    console.log('Denied key blocked:', error_.message)
  }
  // Output: Sandbox violation: property "deniedProp1" is restricted
})

// ============================================================================
// Example 7: Delete Restrictions
// ============================================================================
console.log('\n7. Delete Restrictions')
console.log('-'.repeat(80))

const operationsObject = {
  data: 'value',
  permanent: 'cannot delete',
}

const opsProxy = createProxy(operationsObject)
const opsSandbox = createSandboxContext(operationsObject, {
  restrictedOperations: new Set(['deleteProperty']),
  allowDelete: false,
})

registerSandboxInterceptors(opsProxy, opsSandbox)

opsSandbox.call(() => {
  // Can read
  console.log('Can read:', opsProxy.proxy.data)
  // Output: Can read: value

  // Can write
  opsProxy.proxy.data = 'new value'
  console.log('Can write:', operationsObject.data)
  // Output: Can write: new value

  // Cannot delete (blocked by restrictedOperations)
  const deleteResult1 = Reflect.deleteProperty(opsProxy.proxy, 'data')
  console.log('Delete blocked by restrictedOperations:', !deleteResult1)
  // Output: Delete blocked by restrictedOperations: true

  // Cannot delete (blocked by allowDelete: false)
  const deleteResult2 = Reflect.deleteProperty(opsProxy.proxy, 'permanent')
  console.log('Delete blocked by allowDelete:', !deleteResult2)
  // Output: Delete blocked by allowDelete: true

  console.log('Both properties still exist:', 'data' in operationsObject, 'permanent' in operationsObject)
  // Output: Both properties still exist: true true
})

console.log('\n' + '='.repeat(80))
console.log('All sandbox examples completed successfully!')
console.log('='.repeat(80))
