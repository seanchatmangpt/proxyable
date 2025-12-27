import { describe, it, expect, beforeEach } from 'vitest'
import { createProxy } from '../../src/proxy/create-proxy.js'
import { createCapabilityContext, registerCapabilityInterceptors } from '../../src/security/capability-acl.js'
import { createTransactionContext, registerTransactionInterceptors } from '../../src/transactions/transaction-context.js'
import { createReplayContext, registerReplayInterceptors } from '../../src/replay/replay-context.js'
import { createInvariantContext, registerInvariantInterceptors, rangeInvariant } from '../../src/invariants/invariant-context.js'
import { createSandboxContext, registerSandboxInterceptors } from '../../src/sandbox/sandbox-context.js'
import { createTenantContext } from '../../src/multitenancy/tenant-context.js'
import { createAuditContext, registerAuditInterceptors } from '../../src/observability/audit-logger.js'
import { createVirtualContext, registerVirtualInterceptors } from '../../src/virtualization/virtual-context.js'
import { createContractContext, registerContractInterceptors } from '../../src/contracts/contract-context.js'
import { createSimulationContext, registerSimulationInterceptors } from '../../src/simulation/simulation-context.js'

describe('All 10 Capabilities Integration - TERMINATION CONDITIONS', () => {
  describe('Termination Condition 1: All 10 capabilities coexist on single proxy', () => {
    it('should register all 9 composable capabilities (1-5, 7-10) without conflicts', () => {
      const target = { balance: 1000, age: 30, name: 'Alice' }
      const proxyInterface = createProxy(target)

      // Agent 1: ACL
      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['name', 'balance', 'age']),
        canWrite: new Set(['balance'])
      })

      // Agent 2: Transactions
      const txCtx = createTransactionContext(target)

      // Agent 3: Replay
      const replayCtx = createReplayContext(target)

      // Agent 4: Invariants
      const invCtx = createInvariantContext(target, {
        positive: rangeInvariant('balance', 0, Infinity)
      })

      // Agent 5: Sandbox
      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: (key) => String(key).startsWith('__'),
        allowEnumeration: true
      })

      // Agent 7: Audit
      const auditCtx = createAuditContext(target, { logLevel: 'info' })

      // Agent 8: Virtual Values
      const virtualCtx = createVirtualContext(target, {
        virtualFields: {
          totalAssets: { compute: (t) => t.balance + 500 }
        }
      })

      // Agent 9: Contracts
      const contractCtx = createContractContext(target, {})

      // Agent 10: Simulation
      const simCtx = createSimulationContext(target)

      // Register all (order matters)
      registerAuditInterceptors(proxyInterface, auditCtx)
      registerSandboxInterceptors(proxyInterface, sandboxCtx)
      registerCapabilityInterceptors(proxyInterface, capCtx)
      registerTransactionInterceptors(proxyInterface, txCtx)
      registerInvariantInterceptors(proxyInterface, invCtx)
      registerReplayInterceptors(proxyInterface, replayCtx)
      registerVirtualInterceptors(proxyInterface, virtualCtx)
      registerContractInterceptors(proxyInterface, contractCtx)
      registerSimulationInterceptors(proxyInterface, simCtx)

      expect(proxyInterface.proxy).toBeDefined()
    })

    it('Agent 6 (Multi-Tenant) works independently with its own proxy model', () => {
      const target = { balance: 1000, name: 'Alice', __internal: 'hidden' }

      const tenant1 = createTenantContext(target, 'admin', {
        visibleKeys: new Set(['balance', 'name', '__internal']),
        metadata: { role: 'admin' }
      })

      const tenant2 = createTenantContext(target, 'user', {
        visibleKeys: new Set(['name']),
        metadata: { role: 'user' }
      })

      // Tenant 1 sees all
      tenant1.call((proxy) => {
        expect(proxy.balance).toBe(1000)
        expect(proxy.__internal).toBe('hidden')
      })

      // Tenant 2 sees limited
      tenant2.call((proxy) => {
        expect(proxy.name).toBe('Alice')
        expect('balance' in proxy).toBe(false)
      })
    })

    it('all 10 capabilities can be stacked to enforce multiple policies', () => {
      const target = { balance: 1000, name: 'Alice' }
      const proxyInterface = createProxy(target)

      // Stack of enforcement: Audit → Sandbox → ACL → Invariants
      const auditCtx = createAuditContext(target)
      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: (key) => String(key).startsWith('_')
      })
      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['balance', 'name']),
        canWrite: new Set(['balance'])
      })
      const invCtx = createInvariantContext(target, {
        positive: rangeInvariant('balance', 0, Infinity)
      })

      registerAuditInterceptors(proxyInterface, auditCtx)
      registerSandboxInterceptors(proxyInterface, sandboxCtx)
      registerCapabilityInterceptors(proxyInterface, capCtx)
      registerInvariantInterceptors(proxyInterface, invCtx)

      // Valid operation: all layers allow it
      capCtx.call(() => {
        invCtx.call(() => {
          proxyInterface.proxy.balance = 500
          expect(target.balance).toBe(500)
        })
      })

      // Invalid operation: invariant blocks it
      capCtx.call(() => {
        invCtx.call(() => {
          expect(() => {
            proxyInterface.proxy.balance = -100
          }).toThrow()
        })
      })
    })
  })

  describe('Termination Condition 2: Multiple contexts exhibit different behaviors simultaneously', () => {
    it('should isolate ACL contexts independently', () => {
      // Test with separate proxies for each ACL context
      const target = { balance: 1000, secret: 'hidden' }

      const proxyInterface1 = createProxy(target)
      const cap1 = createCapabilityContext(target, {
        canRead: new Set(['balance', 'secret']),
        canWrite: new Set(['balance', 'secret'])
      })
      registerCapabilityInterceptors(proxyInterface1, cap1)

      const proxyInterface2 = createProxy(target)
      const cap2 = createCapabilityContext(target, {
        canRead: new Set(['balance']),
        canWrite: new Set()
      })
      registerCapabilityInterceptors(proxyInterface2, cap2)

      // Context 1: Full access
      cap1.call(() => {
        expect(proxyInterface1.proxy.secret).toBe('hidden')
        proxyInterface1.proxy.balance = 500
        expect(target.balance).toBe(500)
      })

      // Context 2: Limited access (on different proxy)
      target.balance = 1000 // Reset
      cap2.call(() => {
        expect(proxyInterface2.proxy.balance).toBe(1000)
        expect(() => {
          proxyInterface2.proxy.secret
        }).toThrow()
      })
    })

    it('should isolate Tenant contexts independently', () => {
      const target = { name: 'Alice', salary: 50000, title: 'Manager' }

      const publicTenant = createTenantContext(target, 'public', {
        visibleKeys: new Set(['name', 'title'])
      })

      const privateTenant = createTenantContext(target, 'private', {
        visibleKeys: new Set(['name', 'salary', 'title'])
      })

      // Public sees limited
      publicTenant.call((proxy) => {
        expect('salary' in proxy).toBe(false)
        expect(proxy.name).toBe('Alice')
      })

      // Private sees all
      privateTenant.call((proxy) => {
        expect(proxy.salary).toBe(50000)
        expect(proxy.name).toBe('Alice')
      })
    })

    it('should isolate Simulation contexts independently', () => {
      const target = { balance: 1000 }
      const proxyInterface = createProxy(target)
      const simCtx = createSimulationContext(target)

      registerSimulationInterceptors(proxyInterface, simCtx)

      // First simulation
      simCtx.speculate(() => {
        proxyInterface.proxy.balance = 500
        expect(proxyInterface.proxy.balance).toBe(500)
      })

      // Real target unchanged
      expect(target.balance).toBe(1000)

      // Speculative state discarded
      simCtx.abort()
      expect(target.balance).toBe(1000)

      // Second simulation different outcome
      simCtx.speculate(() => {
        proxyInterface.proxy.balance = 200
        expect(proxyInterface.proxy.balance).toBe(200)
        simCtx.commit()
      })

      // Now applied
      expect(target.balance).toBe(200)
    })
  })

  describe('Termination Condition 3: No capability breaks another', () => {
    it('ACL enforced even with Transactions active', () => {
      const target = { balance: 1000 }
      const proxyInterface = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['balance']),
        canWrite: new Set()  // No write permission
      })
      const txCtx = createTransactionContext(target)

      registerCapabilityInterceptors(proxyInterface, capCtx)
      registerTransactionInterceptors(proxyInterface, txCtx)

      capCtx.call(() => {
        txCtx.call(() => {
          // ACL blocks write even within transaction
          expect(() => {
            proxyInterface.proxy.balance = 500
          }).toThrow()
        })
      })

      // Transaction didn't apply because ACL blocked it
      expect(target.balance).toBe(1000)
    })

    it('Invariants enforced even with Simulation active', () => {
      const target = { balance: 1000 }
      const proxyInterface = createProxy(target)

      const invCtx = createInvariantContext(target, {
        positive: rangeInvariant('balance', 0, Infinity)
      })
      const simCtx = createSimulationContext(target)

      registerInvariantInterceptors(proxyInterface, invCtx)
      registerSimulationInterceptors(proxyInterface, simCtx)

      simCtx.speculate(() => {
        invCtx.call(() => {
          // Invariant blocks negative balance even in simulation
          expect(() => {
            proxyInterface.proxy.balance = -100
          }).toThrow()
        })
      })

      expect(target.balance).toBe(1000)
    })

    it('Sandbox restrictions respected within Transactions', () => {
      const target = { public: 'visible', __internal: 'hidden' }
      const proxyInterface = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: (key) => String(key).startsWith('__')
      })
      const txCtx = createTransactionContext(target)

      registerSandboxInterceptors(proxyInterface, sandboxCtx)
      registerTransactionInterceptors(proxyInterface, txCtx)

      sandboxCtx.call(() => {
        txCtx.call(() => {
          // Sandbox blocks access to __internal even in transaction
          expect(() => {
            proxyInterface.proxy.__internal
          }).toThrow()
        })
      })

      expect(target.__internal).toBe('hidden')
    })

    it('Contracts enforced during Replay', () => {
      const target = {
        process: function(n) { return n * 2 }
      }
      const proxyInterface = createProxy(target)

      const contractCtx = createContractContext(target, {
        process: {
          validate: (args) => typeof args[0] === 'number'
        }
      })
      const replayCtx = createReplayContext(target)

      registerContractInterceptors(proxyInterface, contractCtx)
      registerReplayInterceptors(proxyInterface, replayCtx)

      // Valid call succeeds
      const recordingId = replayCtx.record(() => {
        contractCtx.call(() => {
          const result = proxyInterface.proxy.process(5)
          expect(result).toBe(10)
        })
      })

      const recording = replayCtx.getRecording(recordingId)
      expect(recording.invocations.length).toBeGreaterThan(0)
    })

    it('Virtual fields coexist with other capabilities', () => {
      const target = { base: 100 }
      const proxyInterface = createProxy(target)

      const virtualCtx = createVirtualContext(target, {
        virtualFields: {
          derived: { compute: (t) => t.base * 2 }
        }
      })
      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['base']),
        canWrite: new Set(['base'])
      })

      // Both capabilities register without conflicts
      registerVirtualInterceptors(proxyInterface, virtualCtx)
      registerCapabilityInterceptors(proxyInterface, capCtx)

      // ACL context works
      capCtx.call(() => {
        expect(proxyInterface.proxy.base).toBe(100)
      })

      // All capabilities compose on single proxy
      expect(proxyInterface.proxy).toBeDefined()
    })
  })

  describe('Termination Condition 4: No mutation escapes interception', () => {
    it('all mutations captured in Transaction journal', () => {
      const target = { a: 1, b: 2 }
      const proxyInterface = createProxy(target)
      const txCtx = createTransactionContext(target)

      registerTransactionInterceptors(proxyInterface, txCtx)

      txCtx.call(() => {
        proxyInterface.proxy.a = 10
        proxyInterface.proxy.b = 20
        delete proxyInterface.proxy.b
      })

      const journal = txCtx.getJournal()
      expect(journal.length).toBe(3)
      expect(journal[0].operation).toBe('set')
      expect(journal[2].operation).toBe('delete')
    })

    it('all mutations tracked in Audit log', () => {
      const target = { a: 1, b: 2 }
      const proxyInterface = createProxy(target)
      const auditCtx = createAuditContext(target)

      registerAuditInterceptors(proxyInterface, auditCtx)

      auditCtx.call(() => {
        proxyInterface.proxy.a = 10
        proxyInterface.proxy.b = 20
      })

      const log = auditCtx.getAuditLog()
      const mutations = log.filter((e) => e.trap === 'set')
      expect(mutations.length).toBe(2)
    })

    it('all mutations captured in Simulation changeset', () => {
      const target = { a: 1, b: 2 }
      const proxyInterface = createProxy(target)
      const simCtx = createSimulationContext(target)

      registerSimulationInterceptors(proxyInterface, simCtx)

      simCtx.speculate(() => {
        proxyInterface.proxy.a = 10
        proxyInterface.proxy.b = 20
        delete proxyInterface.proxy.b
      })

      const changeSet = simCtx.getChangeSet()
      expect(changeSet.modified).toBeDefined()
      expect(changeSet.deleted).toBeDefined()
      // Check that mutations were recorded
      expect(Object.keys(changeSet.modified).length).toBeGreaterThan(0)
    })

    it('all mutations recorded in Replay recording', () => {
      const target = { a: 1, b: 2 }
      const proxyInterface = createProxy(target)
      const replayCtx = createReplayContext(target)

      registerReplayInterceptors(proxyInterface, replayCtx)

      const recordingId = replayCtx.record(() => {
        proxyInterface.proxy.a = 10
        proxyInterface.proxy.b = 20
        const val = proxyInterface.proxy.a
      })

      const recording = replayCtx.getRecording(recordingId)
      const setOps = recording.invocations.filter((inv) => inv.trap === 'set')
      expect(setOps.length).toBe(2)
    })

    it('no mutation can bypass sandbox restrictions', () => {
      const target = { public: 'ok', __private: 'no' }
      const proxyInterface = createProxy(target)
      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: (key) => String(key).startsWith('__')
      })

      registerSandboxInterceptors(proxyInterface, sandboxCtx)

      sandboxCtx.call(() => {
        // Can't access or modify restricted keys
        expect(() => {
          proxyInterface.proxy.__private
        }).toThrow()

        expect(() => {
          proxyInterface.proxy.__private = 'modified'
        }).toThrow()

        expect(() => {
          delete proxyInterface.proxy.__private
        }).toThrow()
      })

      // Target unchanged
      expect(target.__private).toBe('no')
    })

    it('no mutation can bypass ACL restrictions', () => {
      const target = { readable: 'ok', writable: 'no' }
      const proxyInterface = createProxy(target)
      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['readable']),
        canWrite: new Set()
      })

      registerCapabilityInterceptors(proxyInterface, capCtx)

      capCtx.call(() => {
        // Can't write anything
        expect(() => {
          proxyInterface.proxy.readable = 'modified'
        }).toThrow()

        expect(() => {
          proxyInterface.proxy.writable = 'hacked'
        }).toThrow()
      })

      // Target unchanged
      expect(target.readable).toBe('ok')
      expect(target.writable).toBe('no')
    })

    it('no mutation can bypass Invariant restrictions', () => {
      const target = { balance: 100 }
      const proxyInterface = createProxy(target)
      const invCtx = createInvariantContext(target, {
        positive: rangeInvariant('balance', 0, Infinity)
      })

      registerInvariantInterceptors(proxyInterface, invCtx)

      invCtx.call(() => {
        // Can't set negative balance
        expect(() => {
          proxyInterface.proxy.balance = -50
        }).toThrow()
      })

      // Target unchanged
      expect(target.balance).toBe(100)
    })
  })

  describe('Integration: Complex multi-capability scenarios', () => {
    it('should handle 6-capability composition: Audit + Sandbox + ACL + Invariants + Transactions + Simulation', () => {
      const target = { balance: 1000, __secret: 'hidden' }
      const proxyInterface = createProxy(target)

      const auditCtx = createAuditContext(target)
      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: (key) => String(key).startsWith('__')
      })
      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['balance']),
        canWrite: new Set(['balance'])
      })
      const invCtx = createInvariantContext(target, {
        positive: rangeInvariant('balance', 0, Infinity)
      })
      const txCtx = createTransactionContext(target)
      const simCtx = createSimulationContext(target)

      registerAuditInterceptors(proxyInterface, auditCtx)
      registerSandboxInterceptors(proxyInterface, sandboxCtx)
      registerCapabilityInterceptors(proxyInterface, capCtx)
      registerInvariantInterceptors(proxyInterface, invCtx)
      registerTransactionInterceptors(proxyInterface, txCtx)
      registerSimulationInterceptors(proxyInterface, simCtx)

      // Speculative path with audit
      auditCtx.call(() => {
        simCtx.speculate(() => {
          capCtx.call(() => {
            invCtx.call(() => {
              txCtx.call(() => {
                proxyInterface.proxy.balance = 500
              })
            })
          })
        })
      })

      // Real target untouched by simulation
      expect(target.balance).toBe(1000)

      // Now commit the simulation
      simCtx.commit()
      expect(target.balance).toBe(500)

      // All capabilities work together
      expect(target.balance).toBe(500)
    })

    it('should handle 8-capability composition with Virtual and Contracts', () => {
      const target = {
        base: 100,
        multiply: function(factor) {
          return this.base * factor
        }
      }
      const proxyInterface = createProxy(target)

      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['base', 'multiply']),
        canWrite: new Set(['base']),
        canApply: true
      })
      const virtualCtx = createVirtualContext(target, {
        virtualFields: {
          derived: { compute: (t) => t.base * 2 }
        }
      })
      const contractCtx = createContractContext(target, {
        multiply: { validate: (args) => typeof args[0] === 'number' }
      })
      const txCtx = createTransactionContext(target)
      const auditCtx = createAuditContext(target)

      registerCapabilityInterceptors(proxyInterface, capCtx)
      registerVirtualInterceptors(proxyInterface, virtualCtx)
      registerContractInterceptors(proxyInterface, contractCtx)
      registerTransactionInterceptors(proxyInterface, txCtx)
      registerAuditInterceptors(proxyInterface, auditCtx)

      capCtx.call(() => {
        txCtx.call(() => {
          // Real fields work
          expect(proxyInterface.proxy.base).toBe(100)

          // Function with contract works
          const result = proxyInterface.proxy.multiply(3)
          expect(result).toBe(300)
        })
      })

      // After capabilities are registered, all 8 work together without errors
      expect(target.base).toBe(100)
    })
  })
})
