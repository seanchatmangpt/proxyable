/**
 * Transaction System Usage Examples
 *
 * Demonstrates transactional mutations with commit/rollback support.
 */

import { createProxy } from '../src/proxy/create-proxy.js'
import {
  createTransactionContext,
  registerTransactionInterceptors,
} from '../src/transactions/transaction-context.js'
import {
  createCapabilityContext,
  registerCapabilityInterceptors,
} from '../src/security/capability-acl.js'

console.log('=== Transaction System Examples ===\n')

// Example 1: Basic Transaction with Commit
console.log('Example 1: Basic Transaction with Commit')
{
  const target = { balance: 100, pending: 0 }
  const proxyInterface = createProxy(target)
  const { proxy } = proxyInterface
  const tx = createTransactionContext(target)
  registerTransactionInterceptors(proxyInterface, tx)

  // Start transaction
  tx.call(() => {
    proxy.balance -= 50
    proxy.pending += 50
  })

  console.log('During transaction:', target)
  // Output: { balance: 50, pending: 50 }

  // Commit the transaction
  tx.commit()

  console.log('After commit:', target)
  // Output: { balance: 50, pending: 50 }
  console.log()
}

// Example 2: Transaction with Rollback
console.log('Example 2: Transaction with Rollback')
{
  const target = { balance: 100, pending: 0 }
  const proxyInterface = createProxy(target)
  const { proxy } = proxyInterface
  const tx = createTransactionContext(target)
  registerTransactionInterceptors(proxyInterface, tx)

  // Start transaction
  tx.call(() => {
    proxy.balance -= 50
    proxy.pending += 50
  })

  console.log('During transaction:', target)
  // Output: { balance: 50, pending: 50 }

  // Rollback the transaction
  tx.rollback()

  console.log('After rollback:', target)
  // Output: { balance: 100, pending: 0 } (reverted!)
  console.log()
}

// Example 3: Dry-run to Preview Changes
console.log('Example 3: Dry-run to Preview Changes')
{
  const target = { x: 10, y: 20 }
  const proxyInterface = createProxy(target)
  const { proxy } = proxyInterface
  const tx = createTransactionContext(target)
  registerTransactionInterceptors(proxyInterface, tx)

  tx.call(() => {
    proxy.x = 100
    delete proxy.y
    proxy.z = 300
  })

  const dryRun = tx.getDryRun()
  console.log('Dry-run preview:')
  dryRun.forEach(entry => {
    console.log(`  ${entry.operation} ${entry.property}: ${entry.previousValue} → ${entry.value}`)
  })

  // Can decide whether to commit or rollback based on dry-run
  tx.commit()
  console.log()
}

// Example 4: Integration with Capability ACL
console.log('Example 4: Integration with Capability ACL')
{
  const target = { balance: 100, credit: 50 }
  const proxyInterface = createProxy(target)
  const { proxy } = proxyInterface

  // Create capability context - only allow writing to balance
  const capCtx = createCapabilityContext(target, {
    canRead: new Set(['balance', 'credit']),
    canWrite: new Set(['balance']), // Can't write to credit
  })

  const tx = createTransactionContext(target)

  // Register interceptors - capability checks run first
  registerCapabilityInterceptors(proxyInterface, capCtx)
  registerTransactionInterceptors(proxyInterface, tx)

  capCtx.call(() => {
    tx.call(() => {
      // This is allowed
      proxy.balance = 200

      // This will be blocked by capability check
      try {
        proxy.credit = 100
      } catch (error_) {
        console.log('Write to credit blocked by ACL')
      }
    })

    console.log('Journal:', tx.getJournal().map(e => e.property))
    // Only 'balance' in journal, 'credit' was blocked

    tx.commit()
    console.log('After commit:', target)
  })
  console.log()
}

// Example 5: Complex Transaction with Multiple Operations
console.log('Example 5: Complex Transaction with Multiple Operations')
{
  const target = {
    users: new Map([
      ['alice', { balance: 100 }],
      ['bob', { balance: 50 }],
    ]),
    totalBalance: 150,
  }

  const proxyInterface = createProxy(target)
  const { proxy } = proxyInterface
  const tx = createTransactionContext(target)
  registerTransactionInterceptors(proxyInterface, tx)

  // Transfer money from alice to bob
  const transfer = (from, to, amount) => {
    tx.call(() => {
      const fromUser = proxy.users.get(from)
      const toUser = proxy.users.get(to)

      if (!fromUser || !toUser) {
        throw new Error('User not found')
      }

      if (fromUser.balance < amount) {
        throw new Error('Insufficient funds')
      }

      fromUser.balance -= amount
      toUser.balance += amount
    })
  }

  try {
    transfer('alice', 'bob', 30)
    console.log('Journal entries:', tx.getJournal().length)
    console.log('Alice balance:', target.users.get('alice').balance) // 70
    console.log('Bob balance:', target.users.get('bob').balance) // 80

    tx.commit()
    console.log('Transfer committed')
  } catch (error_) {
    console.log('Transfer failed:', error_.message)
    tx.rollback()
  }
  console.log()
}

// Example 6: Nested Transactions
console.log('Example 6: Nested Transactions')
{
  const target = { a: 1, b: 2, c: 3 }
  const proxyInterface = createProxy(target)
  const { proxy } = proxyInterface
  const tx = createTransactionContext(target)
  registerTransactionInterceptors(proxyInterface, tx)

  tx.call(() => {
    proxy.a = 10

    // Nested transaction context
    tx.call(() => {
      proxy.b = 20
    })

    proxy.c = 30
  })

  console.log('Journal entries:', tx.getJournal().length) // 3 entries
  console.log('Values during transaction:', target) // { a: 10, b: 20, c: 30 }

  // Can rollback all operations
  tx.rollback()
  console.log('After rollback:', target) // { a: 1, b: 2, c: 3 }
  console.log()
}

// Example 7: Conditional Commit Based on Validation
console.log('Example 7: Conditional Commit Based on Validation')
{
  const target = { items: [], total: 0 }
  const proxyInterface = createProxy(target)
  const { proxy } = proxyInterface
  const tx = createTransactionContext(target)
  registerTransactionInterceptors(proxyInterface, tx)

  const addItem = (item, price) => {
    tx.call(() => {
      proxy.items.push(item)
      proxy.total += price
    })

    // Validate total is not negative
    if (target.total < 0) {
      console.log('Invalid total, rolling back')
      tx.rollback()
      return false
    }

    console.log('Valid transaction, committing')
    tx.commit()
    return true
  }

  addItem('Widget', 50)
  console.log('After first item:', target) // { items: ['Widget'], total: 50 }

  addItem('Gadget', -100) // This will be rolled back
  console.log('After rollback:', target) // { items: ['Widget'], total: 50 }
  console.log()
}

// Example 8: Journaling Function Calls
console.log('Example 8: Journaling Function Calls')
{
  const calculator = {
    value: 0,
    add: function(x) {
      this.value += x
      return this.value
    },
  }

  const proxyInterface = createProxy(calculator)
  const { proxy } = proxyInterface
  const tx = createTransactionContext(calculator)
  registerTransactionInterceptors(proxyInterface, tx)

  tx.call(() => {
    proxy.value = 10
    const result = proxy.add(5)
    console.log('Result:', result) // 15
  })

  const journal = tx.getJournal()
  console.log('Journaled operations:')
  journal.forEach(entry => {
    console.log(`  - ${entry.operation}`, entry.property || entry.args)
  })

  tx.commit()
  console.log()
}

console.log('=== All examples completed ===')
