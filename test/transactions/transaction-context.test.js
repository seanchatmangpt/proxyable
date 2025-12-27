import { describe, it, expect, beforeEach } from 'vitest'
import { createProxy } from '../../src/proxy/create-proxy.js'
import {
  createTransactionContext,
  registerTransactionInterceptors,
  createTransactionSetInterceptor,
  createTransactionDeletePropertyInterceptor,
  createTransactionApplyInterceptor,
  createTransactionConstructInterceptor,
} from '../../src/transactions/transaction-context.js'
import {
  createCapabilityContext,
  registerCapabilityInterceptors,
} from '../../src/security/capability-acl.js'

describe('Transaction Context', () => {
  describe('createTransactionContext', () => {
    it('should create a transaction context with all required methods', () => {
      const target = { x: 1 }
      const tx = createTransactionContext(target)

      expect(tx).toHaveProperty('call')
      expect(tx).toHaveProperty('commit')
      expect(tx).toHaveProperty('rollback')
      expect(tx).toHaveProperty('getDryRun')
      expect(tx).toHaveProperty('isActive')
      expect(tx).toHaveProperty('getJournal')
      expect(tx).toHaveProperty('context')
    })

    it('should start with no active transaction', () => {
      const target = { x: 1 }
      const tx = createTransactionContext(target)

      expect(tx.isActive()).toBe(false)
      expect(tx.getJournal()).toEqual([])
    })
  })

  describe('Basic Transaction Operations', () => {
    let target, proxyInterface, proxy, tx

    beforeEach(() => {
      target = { x: 1, y: 2 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      tx = createTransactionContext(target)
      registerTransactionInterceptors(proxyInterface, tx)
    })

    it('should journal set operations and apply them during transaction', () => {
      tx.call(() => {
        proxy.x = 10
        proxy.z = 3
      })

      // Verify mutations WERE applied during transaction
      expect(target.x).toBe(10)
      expect(target.z).toBe(3)

      // Verify journal contains the operations
      const journal = tx.getJournal()
      expect(journal).toHaveLength(2)
      expect(journal[0]).toMatchObject({
        operation: 'set',
        property: 'x',
        value: 10,
        previousValue: 1,
      })
      expect(journal[1]).toMatchObject({
        operation: 'set',
        property: 'z',
        value: 3,
        previousValue: undefined,
      })
    })

    it('should journal delete operations and apply them during transaction', () => {
      tx.call(() => {
        delete proxy.x
      })

      // Verify property WAS deleted during transaction
      expect(target.x).toBeUndefined()

      // Verify journal contains the delete
      const journal = tx.getJournal()
      expect(journal).toHaveLength(1)
      expect(journal[0]).toMatchObject({
        operation: 'delete',
        property: 'x',
        previousValue: 1,
      })
    })

    it('should keep mutations on commit', () => {
      tx.call(() => {
        proxy.x = 10
        proxy.z = 3
        delete proxy.y
      })

      // Mutations already applied during transaction
      expect(target.x).toBe(10)
      expect(target.y).toBeUndefined()
      expect(target.z).toBe(3)

      // Commit the transaction
      const result = tx.commit()
      expect(result).toBe(true)

      // Verify mutations are still there
      expect(target.x).toBe(10)
      expect(target.y).toBeUndefined()
      expect(target.z).toBe(3)

      // Transaction should be cleared
      expect(tx.isActive()).toBe(false)
      expect(tx.getJournal()).toEqual([])
    })

    it('should restore previous values on rollback', () => {
      tx.call(() => {
        proxy.x = 10
        proxy.z = 3
        delete proxy.y
      })

      // Mutations were applied during transaction
      expect(target.x).toBe(10)
      expect(target.z).toBe(3)
      expect(target.y).toBeUndefined()

      // Verify journal has entries
      expect(tx.getJournal()).toHaveLength(3)

      // Rollback the transaction
      tx.rollback()

      // Verify mutations were REVERTED
      expect(target.x).toBe(1)
      expect(target.y).toBe(2)
      expect(target.z).toBeUndefined()

      // Transaction should be cleared
      expect(tx.isActive()).toBe(false)
      expect(tx.getJournal()).toEqual([])
    })
  })

  describe('getDryRun', () => {
    let target, proxyInterface, proxy, tx

    beforeEach(() => {
      target = { x: 1, y: 2 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      tx = createTransactionContext(target)
      registerTransactionInterceptors(proxyInterface, tx)
    })

    it('should return journal of mutations', () => {
      tx.call(() => {
        proxy.x = 10
        delete proxy.y
        proxy.z = 3
      })

      const dryRun = tx.getDryRun()

      // Verify dry run shows mutations that occurred
      expect(dryRun).toHaveLength(3)
      expect(dryRun[0].operation).toBe('set')
      expect(dryRun[1].operation).toBe('delete')
      expect(dryRun[2].operation).toBe('set')

      // Verify mutations were applied
      expect(target.x).toBe(10)
      expect(target.y).toBeUndefined()
      expect(target.z).toBe(3)

      // Verify dry run is a copy (modifying it doesn't affect journal)
      dryRun[0].value = 999
      expect(tx.getJournal()[0].value).toBe(10)
    })
  })

  describe('Journal Structure', () => {
    let target, proxyInterface, proxy, tx

    beforeEach(() => {
      target = { x: 1 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      tx = createTransactionContext(target)
      registerTransactionInterceptors(proxyInterface, tx)
    })

    it('should include timestamp and index in journal entries', () => {
      const beforeTime = Date.now()

      tx.call(() => {
        proxy.x = 10
        proxy.y = 20
      })

      const afterTime = Date.now()
      const journal = tx.getJournal()

      expect(journal[0]).toHaveProperty('timestamp')
      expect(journal[0]).toHaveProperty('index')
      expect(journal[0].timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(journal[0].timestamp).toBeLessThanOrEqual(afterTime)
      expect(journal[0].index).toBe(0)
      expect(journal[1].index).toBe(1)
    })

    it('should maintain operation order in journal', () => {
      tx.call(() => {
        proxy.a = 1
        proxy.b = 2
        proxy.c = 3
        delete proxy.b
        proxy.d = 4
      })

      const journal = tx.getJournal()
      expect(journal).toHaveLength(5)
      expect(journal.map(e => e.operation)).toEqual(['set', 'set', 'set', 'delete', 'set'])
      expect(journal.map(e => e.index)).toEqual([0, 1, 2, 3, 4])
    })
  })

  describe('Function Call Journaling', () => {
    let proxyInterface, proxy, tx

    beforeEach(() => {
      const target = (a, b) => a + b
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      tx = createTransactionContext(target)
      registerTransactionInterceptors(proxyInterface, tx)
    })

    it('should journal apply operations', () => {
      let result
      tx.call(() => {
        result = proxy(5, 3)
      })

      expect(result).toBe(8)

      const journal = tx.getJournal()
      expect(journal).toHaveLength(1)
      expect(journal[0]).toMatchObject({
        operation: 'apply',
        args: [5, 3],
        result: 8,
      })
    })
  })

  describe('Constructor Journaling', () => {
    let proxyInterface, proxy, tx

    beforeEach(() => {
      class TestClass {
        constructor(value) {
          this.value = value
        }
      }
      proxyInterface = createProxy(TestClass)
      proxy = proxyInterface.proxy
      tx = createTransactionContext(TestClass)
      registerTransactionInterceptors(proxyInterface, tx)
    })

    it('should journal construct operations', () => {
      let instance
      tx.call(() => {
        instance = new proxy(42)
      })

      expect(instance.value).toBe(42)

      const journal = tx.getJournal()
      expect(journal).toHaveLength(1)
      expect(journal[0]).toMatchObject({
        operation: 'construct',
        args: [42],
      })
      expect(journal[0].result).toBe(instance)
    })
  })

  describe('Nested Transactions', () => {
    let target, proxyInterface, proxy, tx

    beforeEach(() => {
      target = { x: 1 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      tx = createTransactionContext(target)
      registerTransactionInterceptors(proxyInterface, tx)
    })

    it('should handle nested call() invocations', () => {
      tx.call(() => {
        proxy.x = 10
        tx.call(() => {
          proxy.y = 20
        })
        proxy.z = 30
      })

      const journal = tx.getJournal()
      expect(journal).toHaveLength(3)
      expect(journal.map(e => e.property)).toEqual(['x', 'y', 'z'])
    })

    it('should allow commit after nested calls', () => {
      tx.call(() => {
        proxy.x = 10
        tx.call(() => {
          proxy.y = 20
        })
      })

      tx.commit()

      expect(target.x).toBe(10)
      expect(target.y).toBe(20)
    })
  })

  describe('Error Handling', () => {
    let target, proxyInterface, proxy, tx

    beforeEach(() => {
      target = { x: 1 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      tx = createTransactionContext(target)
      registerTransactionInterceptors(proxyInterface, tx)
    })

    it('should throw error when committing without active transaction', () => {
      expect(() => tx.commit()).toThrow('No active transaction to commit')
    })

    it('should throw error when rolling back without active transaction', () => {
      expect(() => tx.rollback()).toThrow('No active transaction to rollback')
    })

    it('should allow new transaction after commit', () => {
      tx.call(() => {
        proxy.x = 10
      })
      tx.commit()

      // Start new transaction
      tx.call(() => {
        proxy.x = 20
      })

      expect(tx.isActive()).toBe(true)
      expect(tx.getJournal()).toHaveLength(1)
      expect(tx.getJournal()[0].value).toBe(20)
    })

    it('should allow new transaction after rollback', () => {
      tx.call(() => {
        proxy.x = 10
      })
      tx.rollback()

      // Start new transaction
      tx.call(() => {
        proxy.x = 20
      })

      expect(tx.isActive()).toBe(true)
      expect(tx.getJournal()).toHaveLength(1)
    })
  })

  describe('Integration with Capability ACL', () => {
    let target, proxyInterface, proxy, capabilityCtx, tx

    beforeEach(() => {
      target = { x: 1, y: 2, z: 3 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy

      // Create capability context with specific permissions
      capabilityCtx = createCapabilityContext(target, {
        canRead: new Set(['x', 'y', 'z']),
        canWrite: new Set(['x', 'y']), // Can't write z
        canDelete: new Set(['y']), // Can only delete y
      })

      tx = createTransactionContext(target)

      // Register interceptors - capability checks run first, then transactions
      registerCapabilityInterceptors(proxyInterface, capabilityCtx)
      registerTransactionInterceptors(proxyInterface, tx)
    })

    it('should respect capability restrictions during transactions', () => {
      let writeToZFailed = false

      capabilityCtx.call(() => {
        tx.call(() => {
          // Allowed: writing to x and y
          proxy.x = 10
          proxy.y = 20

          // Not allowed: writing to z (should be blocked by capability check)
          try {
            proxy.z = 30
          } catch (error) {
            writeToZFailed = true
          }
        })
      })

      const journal = tx.getJournal()

      // Write to z was blocked
      expect(writeToZFailed).toBe(true)

      // Only x and y should be in journal (z write was blocked)
      expect(journal).toHaveLength(2)
      expect(journal.map(e => e.property)).toEqual(['x', 'y'])
    })

    it('should apply only authorized mutations on commit', () => {
      capabilityCtx.call(() => {
        tx.call(() => {
          proxy.x = 10
          delete proxy.y // Allowed
        })
      })

      tx.commit()

      expect(target.x).toBe(10)
      expect(target.y).toBeUndefined()
      expect(target.z).toBe(3) // Unchanged
    })

    it('should work with nested capability and transaction contexts', () => {
      capabilityCtx.call(() => {
        tx.call(() => {
          proxy.x = 100
          proxy.y = 200
        })
      })

      expect(tx.getJournal()).toHaveLength(2)

      tx.commit()

      expect(target.x).toBe(100)
      expect(target.y).toBe(200)
    })
  })

  describe('Mutations Outside Transaction', () => {
    let target, proxyInterface, proxy, tx

    beforeEach(() => {
      target = { x: 1 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      tx = createTransactionContext(target)
      registerTransactionInterceptors(proxyInterface, tx)
    })

    it('should allow normal mutations when no transaction is active', () => {
      // Direct mutation without transaction
      proxy.x = 10
      proxy.y = 20

      // Mutations should be applied immediately
      expect(target.x).toBe(10)
      expect(target.y).toBe(20)

      // No journal entries
      expect(tx.getJournal()).toEqual([])
      expect(tx.isActive()).toBe(false)
    })

    it('should not interfere with normal operations', () => {
      // Normal operation
      proxy.x = 10
      expect(target.x).toBe(10)

      // Transaction operation
      tx.call(() => {
        proxy.x = 20
      })
      expect(target.x).toBe(20) // Applied during transaction

      // Rollback instead of commit
      tx.rollback()
      expect(target.x).toBe(10) // Reverted to value before transaction

      // Normal operation again
      proxy.x = 30
      expect(target.x).toBe(30)
    })
  })

  describe('Journal Index Reset', () => {
    let target, proxyInterface, proxy, tx

    beforeEach(() => {
      target = { x: 1 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      tx = createTransactionContext(target)
      registerTransactionInterceptors(proxyInterface, tx)
    })

    it('should reset journal index after commit', () => {
      tx.call(() => {
        proxy.x = 10
        proxy.y = 20
      })

      const journal1 = tx.getJournal()
      expect(journal1[0].index).toBe(0)
      expect(journal1[1].index).toBe(1)

      tx.commit()

      // New transaction should start index at 0 again
      tx.call(() => {
        proxy.x = 30
      })

      const journal2 = tx.getJournal()
      expect(journal2[0].index).toBe(0)
    })
  })

  describe('No Deep Cloning', () => {
    let target, proxyInterface, proxy, tx

    beforeEach(() => {
      target = { obj: { nested: 'value' } }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      tx = createTransactionContext(target)
      registerTransactionInterceptors(proxyInterface, tx)
    })

    it('should store references in journal, not deep clones', () => {
      const originalObj = target.obj
      const newObj = { nested: 'new' }

      tx.call(() => {
        proxy.obj = newObj
      })

      const journal = tx.getJournal()

      // Should store reference, not clone
      expect(journal[0].value).toBe(newObj)
      expect(journal[0].previousValue).toBe(originalObj)

      // Modifying the object should reflect in journal
      newObj.nested = 'modified'
      expect(journal[0].value.nested).toBe('modified')
    })
  })

  describe('Individual Interceptor Creation', () => {
    it('should create set interceptor', () => {
      const target = { x: 1 }
      const tx = createTransactionContext(target)
      const interceptor = createTransactionSetInterceptor(tx)

      expect(typeof interceptor).toBe('function')
    })

    it('should create deleteProperty interceptor', () => {
      const target = { x: 1 }
      const tx = createTransactionContext(target)
      const interceptor = createTransactionDeletePropertyInterceptor(tx)

      expect(typeof interceptor).toBe('function')
    })

    it('should create apply interceptor', () => {
      const target = () => {}
      const tx = createTransactionContext(target)
      const interceptor = createTransactionApplyInterceptor(tx)

      expect(typeof interceptor).toBe('function')
    })

    it('should create construct interceptor', () => {
      const target = class {}
      const tx = createTransactionContext(target)
      const interceptor = createTransactionConstructInterceptor(tx)

      expect(typeof interceptor).toBe('function')
    })
  })
})
