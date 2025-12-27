/**
 * Invariant Enforcement System - Usage Examples
 *
 * This example demonstrates how to use the invariant enforcement system
 * to protect state integrity and prevent illegal state transitions.
 */

import { createProxy } from '../src/proxy/create-proxy.js'
import {
  createInvariantContext,
  createInvariantSetInterceptor,
  registerInvariantInterceptors,
  typeInvariant,
  rangeInvariant,
  immutableInvariant,
  dependencyInvariant,
  requiredInvariant,
  patternInvariant,
} from '../src/invariants/invariant-context.js'

// ============================================================================
// Example 1: Basic Invariant Enforcement
// ============================================================================

console.log('=== Example 1: Basic Invariant Enforcement ===\n')

const bankAccount = { balance: 1000 }
const { proxy: accountProxy, defineSetInterceptor } = createProxy(bankAccount)

// Create invariant context: balance must never be negative
const accountInvCtx = createInvariantContext(bankAccount, {
  positiveBalance: (target, operation) => {
    if (operation.trap === 'set' && operation.property === 'balance') {
      return operation.value >= 0 || 'Balance cannot be negative'
    }
    return true
  }
})

defineSetInterceptor(createInvariantSetInterceptor(accountInvCtx))

accountInvCtx.call(() => {
  console.log('Initial balance:', accountProxy.balance)

  // Valid withdrawal
  accountProxy.balance = 500
  console.log('After withdrawal:', accountProxy.balance)

  try {
    // Invalid withdrawal - would go negative
    accountProxy.balance = -100
  } catch (error) {
    console.log('Error prevented:', error.message)
  }

  console.log('Final balance:', accountProxy.balance)
})

console.log()

// ============================================================================
// Example 2: Type Safety with typeInvariant
// ============================================================================

console.log('=== Example 2: Type Safety ===\n')

const user = { name: 'Alice', age: 25, active: true }
const userProxy = createProxy(user)

const userInvCtx = createInvariantContext(user, {
  nameType: typeInvariant('name', String),
  ageType: typeInvariant('age', Number),
  activeType: typeInvariant('active', Boolean),
})

registerInvariantInterceptors(userProxy, userInvCtx)

userInvCtx.call(() => {
  console.log('User:', userProxy.proxy)

  // Valid type
  userProxy.proxy.age = 26
  console.log('Updated age:', userProxy.proxy.age)

  try {
    // Invalid type
    userProxy.proxy.age = 'twenty-seven'
  } catch (error) {
    console.log('Type error prevented:', error.message)
  }
})

console.log()

// ============================================================================
// Example 3: Range Constraints
// ============================================================================

console.log('=== Example 3: Range Constraints ===\n')

const thermostat = { temperature: 20 }
const thermostatProxy = createProxy(thermostat)

const thermostatInvCtx = createInvariantContext(thermostat, {
  tempRange: rangeInvariant('temperature', -10, 40),
})

registerInvariantInterceptors(thermostatProxy, thermostatInvCtx)

thermostatInvCtx.call(() => {
  console.log('Initial temperature:', thermostatProxy.proxy.temperature)

  // Valid temperature
  thermostatProxy.proxy.temperature = 25
  console.log('Set to 25°C:', thermostatProxy.proxy.temperature)

  try {
    // Too hot
    thermostatProxy.proxy.temperature = 50
  } catch (error) {
    console.log('Range error prevented:', error.message)
  }

  try {
    // Too cold
    thermostatProxy.proxy.temperature = -20
  } catch (error) {
    console.log('Range error prevented:', error.message)
  }
})

console.log()

// ============================================================================
// Example 4: Immutability
// ============================================================================

console.log('=== Example 4: Immutability ===\n')

const entity = { id: 123 }
const entityProxy = createProxy(entity)

const entityInvCtx = createInvariantContext(entity, {
  immutableId: immutableInvariant(new Set(['id', 'createdAt'])),
})

registerInvariantInterceptors(entityProxy, entityInvCtx)

entityInvCtx.call(() => {
  // Can set immutable property initially
  entityProxy.proxy.createdAt = new Date()
  console.log('Entity created:', {
    id: entityProxy.proxy.id,
    createdAt: entityProxy.proxy.createdAt,
  })

  try {
    // Cannot modify immutable property
    entityProxy.proxy.id = 456
  } catch (error) {
    console.log('Immutability protected:', error.message)
  }

  try {
    // Cannot delete immutable property
    delete entityProxy.proxy.id
  } catch (error) {
    console.log('Deletion prevented:', error.message)
  }
})

console.log()

// ============================================================================
// Example 5: Dependency Invariants (Business Rules)
// ============================================================================

console.log('=== Example 5: Dependency Invariants ===\n')

const slider = { min: 0, max: 100, value: 50 }
const sliderProxy = createProxy(slider)

const sliderInvCtx = createInvariantContext(slider, {
  valueInRange: dependencyInvariant('valueInRange', (obj) => {
    return obj.value >= obj.min && obj.value <= obj.max
  }),
})

registerInvariantInterceptors(sliderProxy, sliderInvCtx)

sliderInvCtx.call(() => {
  console.log('Slider state:', sliderProxy.proxy)

  // Valid value change
  sliderProxy.proxy.value = 75
  console.log('Value updated to:', sliderProxy.proxy.value)

  // Valid max change (value still in range)
  sliderProxy.proxy.max = 80
  console.log('Max updated to:', sliderProxy.proxy.max)

  try {
    // Invalid: would make value > max
    sliderProxy.proxy.max = 70
  } catch (error) {
    console.log('Dependency violation prevented:', error.message)
  }

  console.log('Final state:', sliderProxy.proxy)
})

console.log()

// ============================================================================
// Example 6: Pattern Matching (Email Validation)
// ============================================================================

console.log('=== Example 6: Pattern Matching ===\n')

const contact = { email: 'alice@example.com', phone: '555-123-4567' }
const contactProxy = createProxy(contact)

const contactInvCtx = createInvariantContext(contact, {
  emailPattern: patternInvariant(
    'email',
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    'Invalid email format'
  ),
  phonePattern: patternInvariant('phone', /^\d{3}-\d{3}-\d{4}$/),
})

registerInvariantInterceptors(contactProxy, contactInvCtx)

contactInvCtx.call(() => {
  console.log('Contact:', contactProxy.proxy)

  // Valid email
  contactProxy.proxy.email = 'bob@example.com'
  console.log('Email updated:', contactProxy.proxy.email)

  try {
    // Invalid email format
    contactProxy.proxy.email = 'not-an-email'
  } catch (error) {
    console.log('Pattern error prevented:', error.message)
  }

  try {
    // Invalid phone format
    contactProxy.proxy.phone = '123456789'
  } catch (error) {
    console.log('Pattern error prevented:', error.message)
  }
})

console.log()

// ============================================================================
// Example 7: Required Fields
// ============================================================================

console.log('=== Example 7: Required Fields ===\n')

const document = { id: 1, title: 'Document', author: 'Alice', draft: true }
const docProxy = createProxy(document)

const docInvCtx = createInvariantContext(document, {
  requiredFields: requiredInvariant(new Set(['id', 'title', 'author'])),
})

registerInvariantInterceptors(docProxy, docInvCtx)

docInvCtx.call(() => {
  console.log('Document:', docProxy.proxy)

  // Can delete optional field
  delete docProxy.proxy.draft
  console.log('Draft deleted, optional field:', docProxy.proxy.draft)

  try {
    // Cannot delete required field
    delete docProxy.proxy.title
  } catch (error) {
    console.log('Required field protected:', error.message)
  }
})

console.log()

// ============================================================================
// Example 8: Multiple Invariants (All Must Pass)
// ============================================================================

console.log('=== Example 8: Multiple Invariants ===\n')

const person = { age: 30 }
const personProxy = createProxy(person)

const personInvCtx = createInvariantContext(person, {
  agePositive: (target, op) => {
    if (op.trap === 'set' && op.property === 'age') {
      return op.value >= 0 || 'Age must be positive'
    }
    return true
  },
  ageMaximum: (target, op) => {
    if (op.trap === 'set' && op.property === 'age') {
      return op.value <= 150 || 'Age must be <= 150'
    }
    return true
  },
  ageInteger: (target, op) => {
    if (op.trap === 'set' && op.property === 'age') {
      return Number.isInteger(op.value) || 'Age must be an integer'
    }
    return true
  }
})

registerInvariantInterceptors(personProxy, personInvCtx)

personInvCtx.call(() => {
  console.log('Initial age:', personProxy.proxy.age)

  // All invariants pass
  personProxy.proxy.age = 35
  console.log('Valid age update:', personProxy.proxy.age)

  try {
    // Fails first invariant (positive)
    personProxy.proxy.age = -5
  } catch (error) {
    console.log('First invariant failed:', error.message)
  }

  try {
    // Fails second invariant (maximum)
    personProxy.proxy.age = 200
  } catch (error) {
    console.log('Second invariant failed:', error.message)
  }

  try {
    // Fails third invariant (integer)
    personProxy.proxy.age = 35.5
  } catch (error) {
    console.log('Third invariant failed:', error.message)
  }
})

console.log()

// ============================================================================
// Example 9: Dynamic Invariant Management
// ============================================================================

console.log('=== Example 9: Dynamic Invariant Management ===\n')

const config = { debugMode: false, maxRetries: 3 }
const configProxy = createProxy(config)

const configInvCtx = createInvariantContext(config)
registerInvariantInterceptors(configProxy, configInvCtx)

configInvCtx.call(() => {
  console.log('Initial config:', configProxy.proxy)

  // No invariants yet - anything goes
  configProxy.proxy.maxRetries = -100
  console.log('No invariants, allows negative:', configProxy.proxy.maxRetries)

  // Add invariant dynamically
  configInvCtx.addInvariant('positiveRetries', (target, op) => {
    if (op.trap === 'set' && op.property === 'maxRetries') {
      return op.value >= 0 || 'maxRetries must be positive'
    }
    return true
  })

  console.log('Added invariant')

  try {
    // Now enforced
    configProxy.proxy.maxRetries = -50
  } catch (error) {
    console.log('Now protected:', error.message)
  }

  // Valid value
  configProxy.proxy.maxRetries = 5
  console.log('Valid value works:', configProxy.proxy.maxRetries)

  // Remove invariant
  configInvCtx.removeInvariant('positiveRetries')
  console.log('Removed invariant')

  // No longer enforced
  configProxy.proxy.maxRetries = -200
  console.log('No longer enforced:', configProxy.proxy.maxRetries)
})

console.log()

// ============================================================================
// Example 10: Composition (ACL + Invariants + Transactions)
// ============================================================================

console.log('=== Example 10: Composition with ACL and Transactions ===\n')

import { createCapabilityContext, registerCapabilityInterceptors } from '../src/security/capability-acl.js'
import { createTransactionContext, registerTransactionInterceptors } from '../src/transactions/transaction-context.js'

const secureAccount = { balance: 1000, owner: 'Alice' }
const secureProxy = createProxy(secureAccount)

// Layer 1: ACL - What can be accessed
const acl = createCapabilityContext(secureAccount, {
  canRead: new Set(['balance', 'owner']), // Can read both
  canWrite: new Set(['balance']), // Can only write to balance, not owner
})

// Layer 2: Invariants - What values are valid
const invariants = createInvariantContext(secureAccount, {
  positiveBalance: rangeInvariant('balance', 0, Infinity),
})

// Layer 3: Transactions - Journaling and rollback
const transaction = createTransactionContext(secureAccount)

// Register in composition order: ACL > Invariants > Transactions
registerCapabilityInterceptors(secureProxy, acl)
registerInvariantInterceptors(secureProxy, invariants)
registerTransactionInterceptors(secureProxy, transaction)

acl.call(() => {
  invariants.call(() => {
    transaction.call(() => {
      console.log('Initial balance:', secureProxy.proxy.balance)

      // Valid operation: passes ACL and invariant, gets journaled
      secureProxy.proxy.balance = 500
      console.log('After withdrawal:', secureProxy.proxy.balance)

      try {
        // Fails ACL check (cannot write to owner)
        secureProxy.proxy.owner = 'Bob'
      } catch (error) {
        console.log('ACL denied:', 'Cannot write to owner (ACL check)')
      }

      try {
        // Fails invariant check (negative balance)
        secureProxy.proxy.balance = -100
      } catch (error) {
        console.log('Invariant denied:', error.message)
      }

      // Check transaction journal - only valid operation journaled
      const journal = transaction.getJournal()
      console.log('Transaction journal entries:', journal.length)
      console.log('Journaled operation:', journal[0].operation, journal[0].property)

      // Rollback transaction
      transaction.rollback()
      console.log('After rollback:', secureProxy.proxy.balance)
    })
  })
})

console.log()

// ============================================================================
// Example 11: validateState - Dry Run Validation
// ============================================================================

console.log('=== Example 11: Dry Run Validation ===\n')

const product = { price: 100, stock: 50 }

const productInvCtx = createInvariantContext(product, {
  positivePrice: (t, op) => {
    if (op.trap === 'set' && op.property === 'price') {
      return op.value > 0 || 'Price must be positive'
    }
    return true
  },
  validStock: (t, op) => {
    if (op.trap === 'set' && op.property === 'stock') {
      return op.value >= 0 || 'Stock cannot be negative'
    }
    return true
  }
})

// Test operations without applying them
console.log('Current product:', product)

// Valid operation
const result1 = productInvCtx.validateState({
  trap: 'set',
  property: 'price',
  value: 150
})
console.log('Validate price=150:', result1.valid ? 'Valid' : 'Invalid')

// Invalid operation
const result2 = productInvCtx.validateState({
  trap: 'set',
  property: 'price',
  value: -50
})
console.log('Validate price=-50:', result2.valid ? 'Valid' : 'Invalid', result2.errors)

// Product unchanged
console.log('Product unchanged:', product)

console.log()
console.log('=== All Examples Complete ===')
