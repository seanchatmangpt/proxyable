import { describe, it, expect, beforeEach } from 'vitest'
import { createProxy } from '../../src/proxy/create-proxy.js'
import {
  createSimulationContext,
  registerSimulationInterceptors,
} from '../../src/simulation/simulation-context.js'
import {
  createInvariantContext,
  registerInvariantInterceptors,
  rangeInvariant,
} from '../../src/invariants/invariant-context.js'
import {
  createTransactionContext,
  registerTransactionInterceptors,
} from '../../src/transactions/transaction-context.js'
import {
  createCapabilityContext,
  registerCapabilityInterceptors,
} from '../../src/security/capability-acl.js'

describe('Simulation Context', () => {
  describe('createSimulationContext', () => {
    it('should create a simulation context with all required methods', () => {
      const target = { x: 1 }
      const sim = createSimulationContext(target)

      expect(sim).toHaveProperty('speculate')
      expect(sim).toHaveProperty('getSpeculativeState')
      expect(sim).toHaveProperty('commit')
      expect(sim).toHaveProperty('abort')
      expect(sim).toHaveProperty('getChangeSet')
      expect(sim).toHaveProperty('checkpoint')
      expect(sim).toHaveProperty('restore')
      expect(sim).toHaveProperty('getExecutionTree')
      expect(sim).toHaveProperty('isActive')
      expect(sim).toHaveProperty('getMutations')
      expect(sim).toHaveProperty('context')
    })

    it('should start with no active simulation', () => {
      const target = { x: 1 }
      const sim = createSimulationContext(target)

      expect(sim.isActive()).toBe(false)
      expect(sim.getMutations()).toEqual([])
    })

    it('should accept options', () => {
      const target = { x: 1 }
      const sim = createSimulationContext(target, {
        shallow: true,
        nested: false,
        checkpoint: false,
        isolation: 'partial',
      })

      expect(sim).toBeDefined()
    })
  })

  describe('Speculative Execution', () => {
    let target, proxyInterface, proxy, sim

    beforeEach(() => {
      target = { x: 1, y: 2 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      sim = createSimulationContext(target)
      registerSimulationInterceptors(proxyInterface, sim)
    })

    it('should execute code speculatively without affecting real target', () => {
      const result = sim.speculate(() => {
        proxy.x = 10
        proxy.z = 3
        return proxy.x + proxy.z
      })

      // Function executed and returned result
      expect(result).toBe(13)

      // Real target is UNCHANGED
      expect(target.x).toBe(1)
      expect(target.y).toBe(2)
      expect(target.z).toBeUndefined()
    })

    it('should track mutations in speculative state', () => {
      sim.speculate(() => {
        proxy.x = 10
        proxy.z = 3
        delete proxy.y
      })

      // Verify mutations were tracked
      const mutations = sim.getMutations()
      expect(mutations.length).toBeGreaterThan(0)

      // Real target unchanged
      expect(target.x).toBe(1)
      expect(target.y).toBe(2)
      expect(target.z).toBeUndefined()
    })

    it('should read from speculative state during simulation', () => {
      const values = []

      sim.speculate(() => {
        proxy.x = 10
        values.push(proxy.x) // Should read 10 from speculative state
        proxy.x = 20
        values.push(proxy.x) // Should read 20 from speculative state
      })

      expect(values).toEqual([10, 20])
      expect(target.x).toBe(1) // Real target unchanged
    })

    it('should handle property deletions speculatively', () => {
      let hadY

      sim.speculate(() => {
        delete proxy.y
        hadY = 'y' in proxy // Should be false in speculative state
      })

      expect(hadY).toBe(false)
      expect(target.y).toBe(2) // Real target unchanged
    })
  })

  describe('Commit and Abort', () => {
    let target, proxyInterface, proxy, sim

    beforeEach(() => {
      target = { x: 1, y: 2 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      sim = createSimulationContext(target)
      registerSimulationInterceptors(proxyInterface, sim)
    })

    it('should commit speculative changes to real target', () => {
      sim.speculate(() => {
        proxy.x = 10
        proxy.z = 3
        delete proxy.y
      })

      // Before commit - real target unchanged
      expect(target.x).toBe(1)
      expect(target.y).toBe(2)
      expect(target.z).toBeUndefined()

      // Commit changes
      const result = sim.commit()
      expect(result).toBe(true)

      // After commit - changes applied to real target
      expect(target.x).toBe(10)
      expect(target.y).toBeUndefined()
      expect(target.z).toBe(3)

      // Simulation no longer active
      expect(sim.isActive()).toBe(false)
    })

    it('should abort without affecting real target', () => {
      sim.speculate(() => {
        proxy.x = 10
        proxy.z = 3
        delete proxy.y
      })

      // Before abort - real target unchanged
      expect(target.x).toBe(1)
      expect(target.y).toBe(2)

      // Abort changes
      sim.abort()

      // After abort - real target still unchanged
      expect(target.x).toBe(1)
      expect(target.y).toBe(2)
      expect(target.z).toBeUndefined()

      // Simulation no longer active
      expect(sim.isActive()).toBe(false)
    })

    it('should throw error when committing without active simulation', () => {
      expect(() => sim.commit()).toThrow('No active simulation to commit')
    })

    it('should throw error when aborting without active simulation', () => {
      expect(() => sim.abort()).toThrow('No active simulation to abort')
    })
  })

  describe('Changesets', () => {
    let target, proxyInterface, proxy, sim

    beforeEach(() => {
      target = { x: 1, y: 2, z: 3 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      sim = createSimulationContext(target)
      registerSimulationInterceptors(proxyInterface, sim)
    })

    it('should generate changeset showing what would change', () => {
      sim.speculate(() => {
        proxy.x = 10 // Modified
        proxy.w = 4 // Added
        delete proxy.z // Deleted
      })

      const changeset = sim.getChangeSet()

      expect(changeset.modified).toEqual({
        x: { from: 1, to: 10 },
      })
      expect(changeset.added).toEqual({
        w: 4,
      })
      expect(changeset.deleted).toEqual({
        z: 3,
      })
    })

    it('should return empty changeset when no simulation active', () => {
      const changeset = sim.getChangeSet()

      expect(changeset).toEqual({
        added: {},
        modified: {},
        deleted: {},
      })
    })

    it('should track all types of mutations in changeset', () => {
      sim.speculate(() => {
        // Modifications
        proxy.x = 100
        proxy.y = 200

        // Additions
        proxy.a = 'new1'
        proxy.b = 'new2'

        // Deletions
        delete proxy.z
      })

      const changeset = sim.getChangeSet()

      expect(Object.keys(changeset.modified)).toHaveLength(2)
      expect(Object.keys(changeset.added)).toHaveLength(2)
      expect(Object.keys(changeset.deleted)).toHaveLength(1)
    })
  })

  describe('Nested Simulations', () => {
    let target, proxyInterface, proxy, sim

    beforeEach(() => {
      target = { x: 1, y: 2 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      sim = createSimulationContext(target, { nested: true })
      registerSimulationInterceptors(proxyInterface, sim)
    })

    it('should support nested speculations', () => {
      const results = []

      sim.speculate(() => {
        proxy.x = 10
        results.push('outer-start: x=' + proxy.x)

        sim.speculate(() => {
          proxy.x = 20
          results.push('inner: x=' + proxy.x)
        })

        // After nested speculation completes, outer continues
        results.push('outer-end: x=' + proxy.x)
      })

      expect(results).toContain('outer-start: x=10')
      expect(results).toContain('inner: x=20')
      expect(results).toContain('outer-end: x=10')

      // Real target unchanged
      expect(target.x).toBe(1)
    })

    it('should support deeply nested speculations', () => {
      let depth = 0

      sim.speculate(() => {
        depth++
        proxy.x = 10

        sim.speculate(() => {
          depth++
          proxy.x = 20

          sim.speculate(() => {
            depth++
            proxy.x = 30
          })
        })
      })

      expect(depth).toBe(3)
      expect(target.x).toBe(1) // Real target unchanged
    })

    it('should throw error when nested simulations disabled', () => {
      const simNoNest = createSimulationContext(target, { nested: false })
      registerSimulationInterceptors(proxyInterface, simNoNest)

      expect(() => {
        simNoNest.speculate(() => {
          simNoNest.speculate(() => {
            // Should throw
          })
        })
      }).toThrow('Nested simulations not allowed')
    })
  })

  describe('Checkpoint and Restore', () => {
    let target, proxyInterface, proxy, sim

    beforeEach(() => {
      target = { x: 1, y: 2 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      sim = createSimulationContext(target, { checkpoint: true })
      registerSimulationInterceptors(proxyInterface, sim)
    })

    it('should create and restore checkpoints', () => {
      sim.speculate(() => {
        proxy.x = 10
        proxy.y = 20

        const checkpointId = sim.checkpoint()
        expect(checkpointId).toBeDefined()

        // Make more changes
        proxy.x = 100
        proxy.y = 200

        // Verify changes
        expect(proxy.x).toBe(100)
        expect(proxy.y).toBe(200)

        // Restore to checkpoint
        sim.restore(checkpointId)

        // Values should be restored
        expect(proxy.x).toBe(10)
        expect(proxy.y).toBe(20)
      })

      // Real target still unchanged
      expect(target.x).toBe(1)
      expect(target.y).toBe(2)
    })

    it('should support multiple checkpoints', () => {
      sim.speculate(() => {
        proxy.x = 10
        const cp1 = sim.checkpoint()

        proxy.x = 20
        const cp2 = sim.checkpoint()

        proxy.x = 30
        const cp3 = sim.checkpoint()

        // Restore to middle checkpoint
        sim.restore(cp2)
        expect(proxy.x).toBe(20)

        // Restore to first checkpoint
        sim.restore(cp1)
        expect(proxy.x).toBe(10)

        // Restore to last checkpoint
        sim.restore(cp3)
        expect(proxy.x).toBe(30)
      })
    })

    it('should throw error when checkpoints disabled', () => {
      const simNoCp = createSimulationContext(target, { checkpoint: false })
      registerSimulationInterceptors(proxyInterface, simNoCp)

      simNoCp.speculate(() => {
        expect(() => simNoCp.checkpoint()).toThrow('Checkpoints not enabled')
      })
    })

    it('should throw error when restoring non-existent checkpoint', () => {
      sim.speculate(() => {
        expect(() => sim.restore('invalid-id')).toThrow('Checkpoint "invalid-id" not found')
      })
    })

    it('should throw error when creating checkpoint without active simulation', () => {
      expect(() => sim.checkpoint()).toThrow('Cannot create checkpoint without active simulation')
    })
  })

  describe('Execution Tree', () => {
    let target, proxyInterface, proxy, sim

    beforeEach(() => {
      target = { x: 1 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      sim = createSimulationContext(target)
      registerSimulationInterceptors(proxyInterface, sim)
    })

    it('should track execution tree for simulations', () => {
      sim.speculate(() => {
        proxy.x = 10
      })

      const tree = sim.getExecutionTree()

      expect(tree).toHaveProperty('rootId')
      expect(tree).toHaveProperty('currentId')
      expect(tree).toHaveProperty('nodes')
      expect(tree.nodes).toBeInstanceOf(Array)
      expect(tree.nodes.length).toBeGreaterThan(0)
    })

    it('should track nested simulations in execution tree', () => {
      sim.speculate(() => {
        proxy.x = 10
        sim.speculate(() => {
          proxy.x = 20
        })
      })

      const tree = sim.getExecutionTree()
      const nodes = tree.nodes

      // Should have nodes for both outer and inner speculation
      expect(nodes.length).toBeGreaterThanOrEqual(2)

      // Check that nodes have proper structure
      for (const node of nodes) {
        expect(node).toHaveProperty('id')
        expect(node).toHaveProperty('depth')
        expect(node).toHaveProperty('speculations')
        expect(node).toHaveProperty('timestamp')
      }
    })

    it('should mark nodes as committed after commit', () => {
      sim.speculate(() => {
        proxy.x = 10
      })

      sim.commit()

      const tree = sim.getExecutionTree()
      const committedNode = tree.nodes.find(n => n.status === 'committed')

      expect(committedNode).toBeDefined()
    })

    it('should mark nodes as aborted after abort', () => {
      sim.speculate(() => {
        proxy.x = 10
      })

      sim.abort()

      const tree = sim.getExecutionTree()
      const abortedNode = tree.nodes.find(n => n.status === 'aborted')

      expect(abortedNode).toBeDefined()
    })
  })

  describe('Isolation from Real State', () => {
    let target, proxyInterface, proxy, sim

    beforeEach(() => {
      target = { x: 1, nested: { a: 1, b: 2 } }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      sim = createSimulationContext(target)
      registerSimulationInterceptors(proxyInterface, sim)
    })

    it('should never mutate real target during speculation', () => {
      const originalTarget = { ...target, nested: { ...target.nested } }

      sim.speculate(() => {
        proxy.x = 100
        proxy.y = 200
        proxy.z = 300
        delete proxy.nested
        proxy.newProp = 'test'
      })

      // Real target completely unchanged
      expect(target).toEqual(originalTarget)
    })

    it('should maintain isolation across multiple speculations', () => {
      const originalX = target.x

      sim.speculate(() => {
        proxy.x = 10
      })

      expect(target.x).toBe(originalX)

      sim.speculate(() => {
        proxy.x = 20
      })

      expect(target.x).toBe(originalX)

      sim.speculate(() => {
        proxy.x = 30
      })

      expect(target.x).toBe(originalX)
    })
  })

  describe('Composition with ACL', () => {
    let target, proxyInterface, proxy, sim, readonlyAcl, adminAcl

    beforeEach(() => {
      target = { x: 1, y: 2 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy

      // Setup ACL contexts for different capability levels
      readonlyAcl = createCapabilityContext(target, {
        canRead: new Set(['x', 'y']),
        canWrite: new Set([]), // No write permissions
        canDelete: new Set([]),
      })

      adminAcl = createCapabilityContext(target, {
        canRead: new Set(['x', 'y', 'z']),
        canWrite: new Set(['x', 'y', 'z']),
        canDelete: new Set(['x', 'y', 'z']),
      })

      // Setup ACL interceptors first
      registerCapabilityInterceptors(proxyInterface, adminAcl)

      // Setup simulation after ACL
      sim = createSimulationContext(target)
      registerSimulationInterceptors(proxyInterface, sim)
    })

    it('should respect ACL permissions during simulation', () => {
      // Register readonly ACL instead
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      registerCapabilityInterceptors(proxyInterface, readonlyAcl)
      registerSimulationInterceptors(proxyInterface, sim)

      // With readonly capability
      readonlyAcl.call(() => {
        sim.speculate(() => {
          // Should throw because readonly doesn't have write permission
          expect(() => {
            proxy.x = 10
          }).toThrow()
        })
      })

      // Real target unchanged
      expect(target.x).toBe(1)
    })

    it('should allow simulation with proper permissions', () => {
      adminAcl.call(() => {
        sim.speculate(() => {
          proxy.x = 10
          proxy.z = 3
        })

        const changeset = sim.getChangeSet()
        expect(changeset.modified.x).toBeDefined()
        expect(changeset.added.z).toBeDefined()
      })
    })
  })

  describe('Composition with Invariants', () => {
    let target, proxyInterface, proxy, sim, inv

    beforeEach(() => {
      target = { x: 1, y: 2 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy

      // Setup invariants
      inv = createInvariantContext(target, {
        positiveX: rangeInvariant('x', 0, 100),
      })
      registerInvariantInterceptors(proxyInterface, inv)

      // Setup simulation
      sim = createSimulationContext(target)
      registerSimulationInterceptors(proxyInterface, sim)
    })

    it('should check invariants during simulation', () => {
      inv.call(() => {
        sim.speculate(() => {
          // Should throw because invariant violated
          expect(() => {
            proxy.x = 200 // Out of range
          }).toThrow(/Invariant violation/)
        })
      })

      // Real target unchanged
      expect(target.x).toBe(1)
    })

    it('should allow valid changes during simulation', () => {
      inv.call(() => {
        sim.speculate(() => {
          proxy.x = 50 // Within range
        })

        const changeset = sim.getChangeSet()
        expect(changeset.modified.x.to).toBe(50)
      })

      // Changes not committed yet
      expect(target.x).toBe(1)
    })
  })

  describe('Composition with Transactions', () => {
    let target, proxyInterface, proxy, sim, tx

    beforeEach(() => {
      target = { x: 1, y: 2 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy

      // Setup transaction
      tx = createTransactionContext(target)
      registerTransactionInterceptors(proxyInterface, tx)

      // Setup simulation
      sim = createSimulationContext(target)
      registerSimulationInterceptors(proxyInterface, sim)
    })

    it('should work with transactions - simulation outside transaction', () => {
      sim.speculate(() => {
        proxy.x = 10
        proxy.z = 3
      })

      // Simulation doesn't affect real target
      expect(target.x).toBe(1)
      expect(target.z).toBeUndefined()

      // Commit simulation
      sim.commit()

      // Now target is updated
      expect(target.x).toBe(10)
      expect(target.z).toBe(3)
    })

    it('should allow transaction within simulation', () => {
      sim.speculate(() => {
        tx.call(() => {
          proxy.x = 10
          proxy.z = 3
        })

        // Transaction applies to speculative state
        // Verify in speculative state
        const changeset = sim.getChangeSet()
        expect(changeset.modified.x).toBeDefined()
      })

      // Real target unchanged (simulation not committed)
      expect(target.x).toBe(1)
    })
  })

  describe('Speculative State Access', () => {
    let target, proxyInterface, proxy, sim

    beforeEach(() => {
      target = { x: 1, y: 2 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      sim = createSimulationContext(target)
      registerSimulationInterceptors(proxyInterface, sim)
    })

    it('should return speculative state copy', () => {
      sim.speculate(() => {
        proxy.x = 10
        proxy.z = 3

        const specState = sim.getSpeculativeState()

        expect(specState.x).toBe(10)
        expect(specState.z).toBe(3)
        expect(specState.y).toBe(2)
      })

      // Real target unchanged
      expect(target.x).toBe(1)
    })

    it('should throw when accessing speculative state without active simulation', () => {
      expect(() => sim.getSpeculativeState()).toThrow('No active simulation')
    })

    it('should return copy that cannot modify internal state', () => {
      sim.speculate(() => {
        proxy.x = 10

        const specState = sim.getSpeculativeState()
        specState.x = 999 // Modify the copy

        // Speculative state should be unchanged
        expect(proxy.x).toBe(10)
      })
    })
  })

  describe('Function Calls and Construction', () => {
    it('should handle function calls during simulation', () => {
      const target = function (a, b) {
        return a + b
      }

      const proxyInterface = createProxy(target)
      const proxy = proxyInterface.proxy
      const sim = createSimulationContext(target)
      registerSimulationInterceptors(proxyInterface, sim)

      let result
      sim.speculate(() => {
        result = proxy(5, 3)
      })

      expect(result).toBe(8)

      const mutations = sim.getMutations()
      const applyMutation = mutations.find(m => m.operation === 'apply')
      expect(applyMutation).toBeDefined()
      expect(applyMutation.args).toEqual([5, 3])
      expect(applyMutation.result).toBe(8)
    })

    it('should handle construction during simulation', () => {
      class TestClass {
        constructor(value) {
          this.value = value
        }
      }

      const proxyInterface = createProxy(TestClass)
      const proxy = proxyInterface.proxy
      const sim = createSimulationContext(TestClass)
      registerSimulationInterceptors(proxyInterface, sim)

      let instance
      sim.speculate(() => {
        instance = new proxy(42)
      })

      expect(instance).toBeInstanceOf(TestClass)
      expect(instance.value).toBe(42)

      const mutations = sim.getMutations()
      const constructMutation = mutations.find(m => m.operation === 'construct')
      expect(constructMutation).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    let target, proxyInterface, proxy, sim

    beforeEach(() => {
      target = { x: 1 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy
      sim = createSimulationContext(target)
      registerSimulationInterceptors(proxyInterface, sim)
    })

    it('should handle empty speculation', () => {
      const result = sim.speculate(() => {
        // Do nothing
        return 'done'
      })

      expect(result).toBe('done')
      expect(sim.getMutations()).toEqual([])
    })

    it('should handle errors during speculation', () => {
      expect(() => {
        sim.speculate(() => {
          proxy.x = 10
          throw new Error('Test error')
        })
      }).toThrow('Test error')

      // Simulation should be cleaned up
      // Target unchanged
      expect(target.x).toBe(1)
    })

    it('should handle speculation with no changes', () => {
      sim.speculate(() => {
        const val = proxy.x // Just read, no writes
        expect(val).toBe(1)
      })

      const changeset = sim.getChangeSet()
      expect(changeset.added).toEqual({})
      expect(changeset.modified).toEqual({})
      expect(changeset.deleted).toEqual({})
    })

    it('should handle multiple commits and aborts', () => {
      // First simulation - commit
      sim.speculate(() => {
        proxy.x = 10
      })
      sim.commit()
      expect(target.x).toBe(10)

      // Second simulation - abort
      sim.speculate(() => {
        proxy.x = 20
      })
      sim.abort()
      expect(target.x).toBe(10) // Unchanged

      // Third simulation - commit
      sim.speculate(() => {
        proxy.x = 30
      })
      sim.commit()
      expect(target.x).toBe(30)
    })
  })

  describe('Deep vs Shallow Copy', () => {
    it('should use deep copy by default', () => {
      const target = {
        x: 1,
        nested: { a: 1, b: 2 },
      }

      const proxyInterface = createProxy(target)
      const proxy = proxyInterface.proxy
      const sim = createSimulationContext(target) // Default: deep copy
      registerSimulationInterceptors(proxyInterface, sim)

      sim.speculate(() => {
        proxy.nested.a = 100
      })

      // Real target unchanged (deep copy)
      expect(target.nested.a).toBe(1)
    })

    it('should use shallow copy when specified', () => {
      const target = {
        x: 1,
        nested: { a: 1, b: 2 },
      }

      const proxyInterface = createProxy(target)
      const proxy = proxyInterface.proxy
      const sim = createSimulationContext(target, { shallow: true })
      registerSimulationInterceptors(proxyInterface, sim)

      sim.speculate(() => {
        proxy.x = 10
      })

      // Real target unchanged
      expect(target.x).toBe(1)
    })
  })
})
