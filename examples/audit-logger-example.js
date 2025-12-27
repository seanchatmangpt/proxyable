import { createProxy } from '../src/proxy/create-proxy.js'
import {
  createAuditContext,
  registerAuditInterceptors,
} from '../src/observability/audit-logger.js'
import {
  createCapabilityContext,
  registerCapabilityInterceptors,
} from '../src/security/capability-acl.js'
import {
  createInvariantContext,
  registerInvariantInterceptors,
} from '../src/invariants/invariant-context.js'

console.log('='.repeat(80))
console.log('Observability & Audit - Comprehensive Example')
console.log('='.repeat(80))

// ============================================================================
// Example 1: Basic Audit Logging
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('Example 1: Basic Audit Logging')
console.log('='.repeat(80))

const user = {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com',
  balance: 100,
}

const userProxy = createProxy(user)
const userAudit = createAuditContext(user, {
  format: 'json',
  includeTimestamp: true,
})

registerAuditInterceptors(userProxy, userAudit)

userAudit.call(() => {
  // These operations will be logged
  const name = userProxy.proxy.name
  console.log(`\nRead name: ${name}`)

  userProxy.proxy.balance = 150
  console.log('Updated balance to 150')

  delete userProxy.proxy.email
  console.log('Deleted email')

  const hasId = 'id' in userProxy.proxy
  console.log(`Has ID: ${hasId}`)
})

console.log('\n--- Audit Log (Basic) ---')
const basicLog = userAudit.getAuditLog()
console.log(JSON.stringify(basicLog, null, 2))

// ============================================================================
// Example 2: Audit + Access Control Integration
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('Example 2: Audit + Access Control Integration')
console.log('='.repeat(80))

const secretData = {
  public: 'Everyone can read this',
  private: 'Only authorized users can read this',
  apiKey: 'super-secret-key',
}

const secretProxy = createProxy(secretData)
const secretAudit = createAuditContext(secretData, {
  format: 'text',
  includeTimestamp: false,
})
const secretCap = createCapabilityContext(secretData, {
  canRead: new Set(['public']), // Only allow reading 'public'
  canWrite: new Set(), // No writes allowed
})

// Register audit FIRST, then capabilities
registerAuditInterceptors(secretProxy, secretAudit)
registerCapabilityInterceptors(secretProxy, secretCap)

secretAudit.call(() => {
  secretCap.call(() => {
    console.log('\nAttempting to access public data...')
    const publicData = secretProxy.proxy.public
    console.log(`Success: ${publicData}`)

    console.log('\nAttempting to access private data...')
    try {
      const _ = secretProxy.proxy.private
      console.log('This should not print')
    } catch (error_) {
      console.log(`Denied: ${error_.message}`)
    }

    console.log('\nAttempting to access apiKey...')
    try {
      const _ = secretProxy.proxy.apiKey
      console.log('This should not print')
    } catch (error_) {
      console.log(`Denied: ${error_.message}`)
    }
  })
})

console.log('\n--- Audit Log (with ACL) ---')
console.log(secretAudit.exportLog('text'))

// ============================================================================
// Example 3: Audit + Invariants Integration
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('Example 3: Audit + Invariants Integration')
console.log('='.repeat(80))

const account = {
  balance: 1000,
  owner: 'Bob',
}

const accountProxy = createProxy(account)
const accountAudit = createAuditContext(account)
const accountInvariant = createInvariantContext(account, {
  positiveBalance: (_target, operation) => {
    if (operation.trap === 'set' && operation.property === 'balance') {
      if (operation.value < 0) {
        return 'Balance cannot be negative'
      }
    }
    return true
  },
  immutableOwner: (_target, operation) => {
    if (operation.trap === 'set' && operation.property === 'owner') {
      return 'Owner is immutable'
    }
    return true
  },
})

registerAuditInterceptors(accountProxy, accountAudit)
registerInvariantInterceptors(accountProxy, accountInvariant)

accountAudit.call(() => {
  accountInvariant.call(() => {
    console.log('\nAttempting valid balance update...')
    accountProxy.proxy.balance = 1500
    console.log(`Success: Balance is now ${account.balance}`)

    console.log('\nAttempting invalid balance update (negative)...')
    try {
      accountProxy.proxy.balance = -100
    } catch (error_) {
      console.log(`Denied: ${error_.message}`)
    }

    console.log('\nAttempting to change immutable owner...')
    try {
      accountProxy.proxy.owner = 'Charlie'
    } catch (error_) {
      console.log(`Denied: ${error_.message}`)
    }
  })
})

console.log('\n--- Audit Log (with Invariants) ---')
const invLog = accountAudit.getAuditLog()
invLog.forEach((entry) => {
  console.log(`[${entry.index}] ${entry.trap} ${entry.property || ''} → ${entry.status}`)
})

// ============================================================================
// Example 4: Export Formats
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('Example 4: Export Formats')
console.log('='.repeat(80))

const data = { a: 1, b: 2, c: 3 }
const dataProxy = createProxy(data)
const dataAudit = createAuditContext(data, {
  includeTimestamp: false,
  output: () => {}, // Suppress console output during execution
})

registerAuditInterceptors(dataProxy, dataAudit)

dataAudit.call(() => {
  void dataProxy.proxy.a
  void dataProxy.proxy.b
  dataProxy.proxy.c = 4
  delete dataProxy.proxy.b
})

console.log('\n--- JSON Export ---')
console.log(dataAudit.exportLog('json'))

console.log('\n--- CSV Export ---')
console.log(dataAudit.exportLog('csv'))

console.log('\n--- Text Export ---')
console.log(dataAudit.exportLog('text'))

// ============================================================================
// Example 5: Log Filtering
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('Example 5: Log Filtering')
console.log('='.repeat(80))

const mixed = { x: 1, y: 2, z: 3 }
const mixedProxy = createProxy(mixed)

// Only log write operations
const writeAudit = createAuditContext(mixed, {
  filters: (operation) => operation.trap === 'set',
  includeTimestamp: false,
})

registerAuditInterceptors(mixedProxy, writeAudit)

writeAudit.call(() => {
  void mixedProxy.proxy.x // Read - filtered out
  mixedProxy.proxy.y = 20 // Write - logged
  void mixedProxy.proxy.z // Read - filtered out
  mixedProxy.proxy.x = 10 // Write - logged
})

console.log('\n--- Filtered Audit Log (writes only) ---')
console.log(writeAudit.exportLog('text'))

// ============================================================================
// Example 6: Complete Composition (Audit + ACL + Invariants)
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('Example 6: Complete Composition (Audit + ACL + Invariants)')
console.log('='.repeat(80))

const secureAccount = {
  id: 123,
  balance: 5000,
  status: 'active',
}

const secureProxy = createProxy(secureAccount)

const secureAudit = createAuditContext(secureAccount, {
  includeTimestamp: false,
})

const secureCap = createCapabilityContext(secureAccount, {
  canRead: new Set(['balance', 'status']),
  canWrite: new Set(['balance', 'status']),
})

const secureInvariant = createInvariantContext(secureAccount, {
  balanceRange: (_target, operation) => {
    if (operation.trap === 'set' && operation.property === 'balance') {
      if (operation.value < 0 || operation.value > 100_000) {
        return 'Balance must be between 0 and 100000'
      }
    }
    return true
  },
  validStatus: (_target, operation) => {
    if (operation.trap === 'set' && operation.property === 'status') {
      const validStatuses = ['active', 'inactive', 'suspended']
      if (!validStatuses.includes(operation.value)) {
        return 'Status must be one of: active, inactive, suspended'
      }
    }
    return true
  },
})

// Order matters: Audit -> ACL -> Invariants
registerAuditInterceptors(secureProxy, secureAudit)
registerCapabilityInterceptors(secureProxy, secureCap)
registerInvariantInterceptors(secureProxy, secureInvariant)

secureAudit.call(() => {
  secureCap.call(() => {
    secureInvariant.call(() => {
      console.log('\n✓ Valid operation: Read balance')
      console.log(`  Balance: ${secureProxy.proxy.balance}`)

      console.log('\n✓ Valid operation: Update balance to 6000')
      secureProxy.proxy.balance = 6000
      console.log(`  New balance: ${secureAccount.balance}`)

      console.log('\n✗ Invalid operation: Try to read private id')
      try {
        const _ = secureProxy.proxy.id
      } catch (error_) {
        console.log(`  ${error_.message}`)
      }

      console.log('\n✗ Invalid operation: Try to set balance too high')
      try {
        secureProxy.proxy.balance = 200_000
      } catch (error_) {
        console.log(`  ${error_.message}`)
      }

      console.log('\n✗ Invalid operation: Try to set invalid status')
      try {
        secureProxy.proxy.status = 'deleted'
      } catch (error_) {
        console.log(`  ${error_.message}`)
      }
    })
  })
})

console.log('\n--- Complete Audit Trail ---')
const completeLog = secureAudit.getAuditLog()
completeLog.forEach((entry) => {
  const prop = entry.property ? ` "${entry.property}"` : ''
  const value = entry.value !== undefined ? ` = ${entry.value}` : ''
  console.log(`[${entry.index}] ${entry.intent.toUpperCase()}${prop}${value} → ${entry.status}`)
})

console.log('\n' + '='.repeat(80))
console.log('Summary')
console.log('='.repeat(80))
console.log(`Total operations logged: ${completeLog.length}`)
console.log(`Log size: ${JSON.stringify(completeLog).length} bytes`)
console.log('\nAudit logging provides:')
console.log('  ✓ Intent logging at interception point')
console.log('  ✓ Integration with ACL and Invariants')
console.log('  ✓ Multiple export formats (JSON, CSV, Text)')
console.log('  ✓ Filtering and log levels')
console.log('  ✓ Deterministic ordering')
console.log('  ✓ Minimal performance overhead')
console.log('='.repeat(80))
