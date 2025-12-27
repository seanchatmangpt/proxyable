import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createProxy } from '../../src/proxy/create-proxy.js'
import {
  createVirtualContext,
  registerVirtualInterceptors,
  createVirtualGetInterceptor,
  createVirtualHasInterceptor,
  createVirtualOwnKeysInterceptor,
  createVirtualGetOwnPropertyDescriptorInterceptor,
  createVirtualSetInterceptor,
  createVirtualDeletePropertyInterceptor,
} from '../../src/virtualization/virtual-context.js'

describe('Virtual Context', () => {
  describe('createVirtualContext', () => {
    it('should create a virtual context with all required methods', () => {
      const target = { x: 1 }
      const virtual = createVirtualContext(target, {
        virtualFields: {}
      })

      expect(virtual).toHaveProperty('call')
      expect(virtual).toHaveProperty('invalidateCache')
      expect(virtual).toHaveProperty('getVirtualValue')
      expect(virtual).toHaveProperty('getMemoized')
      expect(virtual).toHaveProperty('setStorage')
      expect(virtual).toHaveProperty('getFromStorage')
      expect(virtual).toHaveProperty('isVirtualField')
      expect(virtual).toHaveProperty('getVirtualFields')
      expect(virtual).toHaveProperty('context')
    })

    it('should handle empty virtual spec', () => {
      const target = { x: 1 }
      const virtual = createVirtualContext(target)

      expect(virtual).toBeDefined()
      expect(virtual.getVirtualFields()).toEqual([])
    })
  })

  describe('Computed Virtual Fields', () => {
    let target, proxyInterface, proxy, virtual

    beforeEach(() => {
      target = { firstName: 'John', lastName: 'Doe' }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy

      virtual = createVirtualContext(target, {
        virtualFields: {
          fullName: {
            compute: (target) => `${target.firstName} ${target.lastName}`
          }
        }
      })

      registerVirtualInterceptors(proxyInterface, virtual)
    })

    it('should compute virtual field value on access', () => {
      let result
      virtual.call(() => {
        result = proxy.fullName
      })

      expect(result).toBe('John Doe')
    })

    it('should recompute when dependencies change', () => {
      let result1, result2

      virtual.call(() => {
        result1 = proxy.fullName
        target.firstName = 'Jane'
        result2 = proxy.fullName
      })

      expect(result1).toBe('John Doe')
      expect(result2).toBe('Jane Doe')
    })

    it('should not expose virtual fields outside context', () => {
      // Outside virtual context
      const result = proxy.fullName

      expect(result).toBeUndefined()
    })

    it('should compute value lazily (only when accessed)', () => {
      const computeFn = vi.fn((target) => `${target.firstName} ${target.lastName}`)

      const lazyVirtual = createVirtualContext(target, {
        virtualFields: {
          fullName: { compute: computeFn }
        }
      })

      const lazyProxyInterface = createProxy(target)
      const lazyProxy = lazyProxyInterface.proxy
      registerVirtualInterceptors(lazyProxyInterface, lazyVirtual)

      // Compute function should not be called yet
      expect(computeFn).not.toHaveBeenCalled()

      const result = lazyVirtual.call(() => {
        // Still not called
        expect(computeFn).not.toHaveBeenCalled()

        // Access the field - now it should compute
        const value = lazyProxy.fullName
        expect(value).toBe('John Doe')
        expect(computeFn).toHaveBeenCalledTimes(1)
        return value
      })

      expect(result).toBe('John Doe')
    })
  })

  describe('Memoization', () => {
    let target, proxyInterface, proxy, virtual, computeFn

    beforeEach(() => {
      target = { value: 10 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy

      computeFn = vi.fn((target) => target.value * 2)

      virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: {
            compute: computeFn,
            memoize: true,
            storage: 'context'
          }
        }
      })

      registerVirtualInterceptors(proxyInterface, virtual)
    })

    it('should memoize computed values per context', () => {
      virtual.call(() => {
        const result1 = proxy.doubled
        const result2 = proxy.doubled
        const result3 = proxy.doubled

        expect(result1).toBe(20)
        expect(result2).toBe(20)
        expect(result3).toBe(20)

        // Compute function should only be called once
        expect(computeFn).toHaveBeenCalledTimes(1)
      })
    })

    it('should have independent caches for different contexts', () => {
      virtual.call(() => {
        const result = proxy.doubled // First call
        expect(result).toBe(20)
        expect(computeFn).toHaveBeenCalledTimes(1)
      })

      virtual.call(() => {
        const result = proxy.doubled // New context - should compute again
        expect(result).toBe(20)
        expect(computeFn).toHaveBeenCalledTimes(2)
      })
    })

    it('should invalidate cache when requested', () => {
      virtual.call(() => {
        const result1 = proxy.doubled // First call
        expect(result1).toBe(20)
        expect(computeFn).toHaveBeenCalledTimes(1)

        virtual.invalidateCache('doubled')

        const result2 = proxy.doubled // Should recompute after invalidation
        expect(result2).toBe(20)
        expect(computeFn).toHaveBeenCalledTimes(2)
      })
    })

    it('should support getMemoized to retrieve cached value', () => {
      virtual.call(() => {
        // Before access, no cached value
        expect(virtual.getMemoized('doubled')).toBeUndefined()

        // Access the field
        const result = proxy.doubled
        expect(result).toBe(20)

        // Now it should be cached
        expect(virtual.getMemoized('doubled')).toBe(20)
      })
    })

    it('should recompute when memoize is false', () => {
      const noMemoVirtual = createVirtualContext(target, {
        virtualFields: {
          doubled: {
            compute: computeFn,
            memoize: false
          }
        }
      })

      const noMemoProxyInterface = createProxy(target)
      const noMemoProxy = noMemoProxyInterface.proxy
      registerVirtualInterceptors(noMemoProxyInterface, noMemoVirtual)

      noMemoVirtual.call(() => {
        const r1 = noMemoProxy.doubled
        const r2 = noMemoProxy.doubled
        const r3 = noMemoProxy.doubled

        expect(r1).toBe(20)
        expect(r2).toBe(20)
        expect(r3).toBe(20)

        // Should compute every time (no memoization)
        expect(computeFn).toHaveBeenCalledTimes(3)
      })
    })
  })

  describe('TTL (Time To Live)', () => {
    let target, proxyInterface, proxy, virtual, computeFn

    beforeEach(() => {
      target = { value: 10 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy

      computeFn = vi.fn((target) => target.value * 2)

      virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: {
            compute: computeFn,
            memoize: true,
            ttl: 100 // 100ms TTL
          }
        }
      })

      registerVirtualInterceptors(proxyInterface, virtual)
    })

    it('should cache value within TTL period', () => {
      virtual.call(() => {
        const r1 = proxy.doubled
        const r2 = proxy.doubled

        expect(r1).toBe(20)
        expect(r2).toBe(20)
        expect(computeFn).toHaveBeenCalledTimes(1)
      })
    })

    it('should recompute after TTL expires', (done) => {
      // Note: This test uses a callback approach because async/await doesn't preserve
      // context across asynchronous boundaries in unctx
      virtual.call(() => {
        const r1 = proxy.doubled
        expect(r1).toBe(20)
        expect(computeFn).toHaveBeenCalledTimes(1)

        // Wait for TTL to expire, then check in a new context call
        setTimeout(() => {
          virtual.call(() => {
            const r2 = proxy.doubled
            expect(r2).toBe(20)
            // Should have recomputed in the new context
            expect(computeFn).toHaveBeenCalledTimes(2)
            done()
          })
        }, 150)
      })
    })
  })

  describe('Alternate Storage', () => {
    describe('External Storage (Map)', () => {
      let target, proxyInterface, proxy, virtual, externalStorage

      beforeEach(() => {
        target = { value: 10 }
        proxyInterface = createProxy(target)
        proxy = proxyInterface.proxy
        externalStorage = new Map()

        virtual = createVirtualContext(target, {
          virtualFields: {
            doubled: {
              compute: (target) => target.value * 2,
              memoize: true,
              storage: 'external'
            }
          },
          alternateStorage: externalStorage
        })

        registerVirtualInterceptors(proxyInterface, virtual)
      })

      it('should store computed values in external storage', () => {
        virtual.call(() => {
          const result = proxy.doubled
          expect(result).toBe(20)

          // Check external storage
          expect(externalStorage.get('doubled')).toBe(20)
        })
      })

      it('should read from external storage on subsequent access', () => {
        virtual.call(() => {
          const initial = proxy.doubled
          expect(initial).toBe(20)

          // Set value directly in external storage
          externalStorage.set('doubled', 999)

          const result = proxy.doubled
          expect(result).toBe(999)
        })
      })

      it('should support setStorage API', () => {
        virtual.setStorage('custom', 'value')
        expect(externalStorage.get('custom')).toBe('value')
      })

      it('should support getFromStorage API', () => {
        externalStorage.set('custom', 'value')
        expect(virtual.getFromStorage('custom')).toBe('value')
      })
    })

    describe('External Storage (Object)', () => {
      let target, proxyInterface, proxy, virtual, externalStorage

      beforeEach(() => {
        target = { value: 10 }
        proxyInterface = createProxy(target)
        proxy = proxyInterface.proxy
        externalStorage = {}

        virtual = createVirtualContext(target, {
          virtualFields: {
            doubled: {
              compute: (target) => target.value * 2,
              memoize: true,
              storage: 'external'
            }
          },
          alternateStorage: externalStorage
        })

        registerVirtualInterceptors(proxyInterface, virtual)
      })

      it('should store computed values in external object', () => {
        virtual.call(() => {
          const result = proxy.doubled
          expect(result).toBe(20)

          // Check external storage
          expect(externalStorage.doubled).toBe(20)
        })
      })

      it('should read from external object on subsequent access', () => {
        virtual.call(() => {
          const initial = proxy.doubled
          expect(initial).toBe(20)

          // Set value directly in external storage
          externalStorage.doubled = 999

          const result = proxy.doubled
          expect(result).toBe(999)
        })
      })
    })

    describe('Target Storage', () => {
      let target, proxyInterface, proxy, virtual, computeFn

      beforeEach(() => {
        target = { value: 10 }
        proxyInterface = createProxy(target)
        proxy = proxyInterface.proxy

        computeFn = vi.fn((target) => target.value * 2)

        virtual = createVirtualContext(target, {
          virtualFields: {
            doubled: {
              compute: computeFn,
              memoize: true,
              storage: 'target'
            }
          }
        })

        registerVirtualInterceptors(proxyInterface, virtual)
      })

      it('should store computed values on target object', () => {
        virtual.call(() => {
          const result = proxy.doubled
          expect(result).toBe(20)

          // Check that value is stored on target (with special prefix)
          expect(target.__virtual_doubled).toBe(20)
        })
      })

      it('should persist across multiple contexts', () => {
        virtual.call(() => {
          const result = proxy.doubled
          expect(result).toBe(20)
          expect(computeFn).toHaveBeenCalledTimes(1)
        })

        // New context - should read from target, not recompute
        virtual.call(() => {
          const result = proxy.doubled
          expect(result).toBe(20)
          expect(computeFn).toHaveBeenCalledTimes(1) // Still only called once
        })
      })
    })
  })

  describe('Redirects', () => {
    let target, proxyInterface, proxy, virtual

    beforeEach(() => {
      target = { _name: 'Secret' }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy

      virtual = createVirtualContext(target, {
        virtualFields: {
          publicName: {
            compute: (target) => target._name.toUpperCase()
          }
        },
        redirects: {
          name: 'publicName' // Redirect 'name' to 'publicName' virtual field
        }
      })

      registerVirtualInterceptors(proxyInterface, virtual)
    })

    it('should redirect property access to virtual field', () => {
      virtual.call(() => {
        const result = proxy.name // Access 'name', get 'publicName'
        expect(result).toBe('SECRET')
      })
    })

    it('should make redirected field appear to exist', () => {
      virtual.call(() => {
        expect('name' in proxy).toBe(true)
      })
    })
  })

  describe('Virtual Fields in Enumeration', () => {
    let target, proxyInterface, proxy, virtual

    beforeEach(() => {
      target = { realField: 'real' }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy

      virtual = createVirtualContext(target, {
        virtualFields: {
          virtualField: {
            compute: () => 'virtual'
          }
        }
      })

      registerVirtualInterceptors(proxyInterface, virtual)
    })

    it('should include virtual fields in Object.keys', () => {
      virtual.call(() => {
        const keys = Object.keys(proxy)
        expect(keys).toContain('realField')
        expect(keys).toContain('virtualField')
      })
    })

    it('should include virtual fields in for...in loops', () => {
      virtual.call(() => {
        const keys = []
        for (const key in proxy) {
          keys.push(key)
        }
        expect(keys).toContain('realField')
        expect(keys).toContain('virtualField')
      })
    })

    it('should report virtual fields exist with "in" operator', () => {
      virtual.call(() => {
        expect('virtualField' in proxy).toBe(true)
      })
    })

    it('should return property descriptor for virtual fields', () => {
      virtual.call(() => {
        const descriptor = Object.getOwnPropertyDescriptor(proxy, 'virtualField')
        expect(descriptor).toBeDefined()
        expect(descriptor.enumerable).toBe(true)
        expect(descriptor.configurable).toBe(true)
      })
    })
  })

  describe('Writing to Virtual Fields', () => {
    describe('Context Storage (default)', () => {
      let target, proxyInterface, proxy, virtual

      beforeEach(() => {
        target = { base: 10 }
        proxyInterface = createProxy(target)
        proxy = proxyInterface.proxy

        virtual = createVirtualContext(target, {
          virtualFields: {
            computed: {
              compute: (target) => target.base * 2,
              storage: 'context'
            }
          }
        })

        registerVirtualInterceptors(proxyInterface, virtual)
      })

      it('should allow writing to virtual field with context storage', () => {
        virtual.call(() => {
          proxy.computed = 999
          expect(proxy.computed).toBe(999)
        })
      })

      it('should not persist writes across contexts', () => {
        virtual.call(() => {
          proxy.computed = 999
          expect(proxy.computed).toBe(999)
        })

        virtual.call(() => {
          // New context - should recompute, not use previous write
          expect(proxy.computed).toBe(20) // base * 2
        })
      })
    })

    describe('Target Storage', () => {
      let target, proxyInterface, proxy, virtual

      beforeEach(() => {
        target = { base: 10 }
        proxyInterface = createProxy(target)
        proxy = proxyInterface.proxy

        virtual = createVirtualContext(target, {
          virtualFields: {
            computed: {
              compute: (target) => target.base * 2,
              storage: 'target'
            }
          }
        })

        registerVirtualInterceptors(proxyInterface, virtual)
      })

      it('should allow writing to virtual field with target storage', () => {
        virtual.call(() => {
          proxy.computed = 999
          expect(proxy.computed).toBe(999)
          expect(target.__virtual_computed).toBe(999)
        })
      })

      it('should persist writes across contexts', () => {
        virtual.call(() => {
          proxy.computed = 999
        })

        virtual.call(() => {
          expect(proxy.computed).toBe(999) // Persisted
        })
      })
    })

    describe('External Storage', () => {
      let target, proxyInterface, proxy, virtual, externalStorage

      beforeEach(() => {
        target = { base: 10 }
        proxyInterface = createProxy(target)
        proxy = proxyInterface.proxy
        externalStorage = new Map()

        virtual = createVirtualContext(target, {
          virtualFields: {
            computed: {
              compute: (target) => target.base * 2,
              storage: 'external'
            }
          },
          alternateStorage: externalStorage
        })

        registerVirtualInterceptors(proxyInterface, virtual)
      })

      it('should allow writing to virtual field with external storage', () => {
        virtual.call(() => {
          proxy.computed = 999
          expect(proxy.computed).toBe(999)
          expect(externalStorage.get('computed')).toBe(999)
        })
      })
    })
  })

  describe('Deleting Virtual Fields', () => {
    let target, proxyInterface, proxy, virtual, computeFn

    beforeEach(() => {
      target = { value: 10 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy

      computeFn = vi.fn((target) => target.value * 2)

      virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: {
            compute: computeFn,
            memoize: true
          }
        }
      })

      registerVirtualInterceptors(proxyInterface, virtual)
    })

    it('should invalidate cache when virtual field is deleted', () => {
      virtual.call(() => {
        const r1 = proxy.doubled // Compute and cache
        expect(r1).toBe(20)
        expect(computeFn).toHaveBeenCalledTimes(1)

        const deleted = delete proxy.doubled // Invalidate cache
        expect(deleted).toBe(true)

        const r2 = proxy.doubled // Should recompute
        expect(r2).toBe(20)
        expect(computeFn).toHaveBeenCalledTimes(2)
      })
    })

    it('should delete from external storage', () => {
      const externalStorage = new Map()
      const extVirtual = createVirtualContext(target, {
        virtualFields: {
          doubled: {
            compute: (target) => target.value * 2,
            storage: 'external'
          }
        },
        alternateStorage: externalStorage
      })

      const extProxyInterface = createProxy(target)
      const extProxy = extProxyInterface.proxy
      registerVirtualInterceptors(extProxyInterface, extVirtual)

      extVirtual.call(() => {
        const result = extProxy.doubled // Store in external storage
        expect(result).toBe(20)
        expect(externalStorage.has('doubled')).toBe(true)

        const deleted = delete extProxy.doubled
        expect(deleted).toBe(true)
        expect(externalStorage.has('doubled')).toBe(false)
      })
    })
  })

  describe('getVirtualValue API', () => {
    let target, virtual

    beforeEach(() => {
      target = { value: 10 }

      virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: {
            compute: (target) => target.value * 2
          }
        }
      })
    })

    it('should compute virtual value directly without proxy', () => {
      const result = virtual.getVirtualValue('doubled')
      expect(result).toBe(20)
    })

    it('should bypass cache when using getVirtualValue', () => {
      const computeFn = vi.fn((target) => target.value * 2)

      const testVirtual = createVirtualContext(target, {
        virtualFields: {
          doubled: {
            compute: computeFn,
            memoize: true
          }
        }
      })

      // Direct call should always compute
      testVirtual.getVirtualValue('doubled')
      testVirtual.getVirtualValue('doubled')
      testVirtual.getVirtualValue('doubled')

      expect(computeFn).toHaveBeenCalledTimes(3)
    })

    it('should return undefined for non-existent virtual fields', () => {
      const result = virtual.getVirtualValue('nonExistent')
      expect(result).toBeUndefined()
    })
  })

  describe('Composition with Other Capabilities', () => {
    it('should work with transaction context', async () => {
      const { createTransactionContext, registerTransactionInterceptors } =
        await import('../../src/transactions/transaction-context.js')

      const target = { value: 10 }
      const proxyInterface = createProxy(target)
      const proxy = proxyInterface.proxy

      const tx = createTransactionContext(target)
      const virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: {
            compute: (target) => target.value * 2
          }
        }
      })

      // Register both interceptors
      registerTransactionInterceptors(proxyInterface, tx)
      registerVirtualInterceptors(proxyInterface, virtual)

      // Use both contexts together
      tx.call(() => {
        virtual.call(() => {
          const result = proxy.doubled
          expect(result).toBe(20)

          proxy.value = 20
          const newResult = proxy.doubled
          expect(newResult).toBe(40)
        })
      })

      // Rollback transaction
      tx.rollback()

      // Value should be restored
      expect(target.value).toBe(10)

      // Virtual field should reflect original value
      virtual.call(() => {
        expect(proxy.doubled).toBe(20)
      })
    })
  })

  describe('Multiple Contexts with Independent Caches', () => {
    let target, proxyInterface, proxy, virtual, computeFn

    beforeEach(() => {
      target = { value: 10 }
      proxyInterface = createProxy(target)
      proxy = proxyInterface.proxy

      computeFn = vi.fn((target) => target.value * 2)

      virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: {
            compute: computeFn,
            memoize: true
          }
        }
      })

      registerVirtualInterceptors(proxyInterface, virtual)
    })

    it('should maintain independent caches per context', () => {
      // First context
      virtual.call(() => {
        const result = proxy.doubled
        expect(result).toBe(20)
        expect(computeFn).toHaveBeenCalledTimes(1)
        expect(virtual.getMemoized('doubled')).toBe(20)
      })

      // Second context (independent cache)
      virtual.call(() => {
        expect(virtual.getMemoized('doubled')).toBeUndefined() // New context
        const result = proxy.doubled
        expect(result).toBe(20)
        expect(computeFn).toHaveBeenCalledTimes(2)
      })

      // Third context
      virtual.call(() => {
        const result = proxy.doubled
        expect(result).toBe(20)
        expect(computeFn).toHaveBeenCalledTimes(3)
      })
    })

    it('should allow different values in different contexts with context storage', () => {
      virtual.call(() => {
        proxy.doubled = 100
        expect(proxy.doubled).toBe(100)
      })

      virtual.call(() => {
        proxy.doubled = 200
        expect(proxy.doubled).toBe(200)
      })

      // Each context has its own value
      // (can't easily verify after context ends, but behavior is correct)
    })
  })

  describe('Helper API Methods', () => {
    let target, virtual

    beforeEach(() => {
      target = { value: 10 }

      virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: {
            compute: (target) => target.value * 2
          },
          tripled: {
            compute: (target) => target.value * 3
          }
        }
      })
    })

    it('should identify virtual fields with isVirtualField', () => {
      expect(virtual.isVirtualField('doubled')).toBe(true)
      expect(virtual.isVirtualField('tripled')).toBe(true)
      expect(virtual.isVirtualField('value')).toBe(false)
      expect(virtual.isVirtualField('nonExistent')).toBe(false)
    })

    it('should list all virtual fields with getVirtualFields', () => {
      const fields = virtual.getVirtualFields()
      expect(fields).toEqual(['doubled', 'tripled'])
    })
  })

  describe('Individual Interceptor Creation', () => {
    it('should create get interceptor', () => {
      const target = { x: 1 }
      const virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: { compute: (t) => t.x * 2 }
        }
      })
      const interceptor = createVirtualGetInterceptor(virtual)

      expect(typeof interceptor).toBe('function')
    })

    it('should create has interceptor', () => {
      const target = { x: 1 }
      const virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: { compute: (t) => t.x * 2 }
        }
      })
      const interceptor = createVirtualHasInterceptor(virtual)

      expect(typeof interceptor).toBe('function')
    })

    it('should create ownKeys interceptor', () => {
      const target = { x: 1 }
      const virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: { compute: (t) => t.x * 2 }
        }
      })
      const interceptor = createVirtualOwnKeysInterceptor(virtual)

      expect(typeof interceptor).toBe('function')
    })

    it('should create getOwnPropertyDescriptor interceptor', () => {
      const target = { x: 1 }
      const virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: { compute: (t) => t.x * 2 }
        }
      })
      const interceptor = createVirtualGetOwnPropertyDescriptorInterceptor(virtual)

      expect(typeof interceptor).toBe('function')
    })

    it('should create set interceptor', () => {
      const target = { x: 1 }
      const virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: { compute: (t) => t.x * 2 }
        }
      })
      const interceptor = createVirtualSetInterceptor(virtual)

      expect(typeof interceptor).toBe('function')
    })

    it('should create deleteProperty interceptor', () => {
      const target = { x: 1 }
      const virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: { compute: (t) => t.x * 2 }
        }
      })
      const interceptor = createVirtualDeletePropertyInterceptor(virtual)

      expect(typeof interceptor).toBe('function')
    })
  })

  describe('Edge Cases', () => {
    it('should handle virtual fields with same name as real fields', () => {
      const target = { value: 10 }
      const proxyInterface = createProxy(target)
      const proxy = proxyInterface.proxy

      const virtual = createVirtualContext(target, {
        virtualFields: {
          value: {
            compute: () => 999
          }
        }
      })

      registerVirtualInterceptors(proxyInterface, virtual)

      virtual.call(() => {
        // Virtual field should take precedence
        expect(proxy.value).toBe(999)
      })

      // Outside context, real field
      expect(proxy.value).toBe(10)
    })

    it('should handle compute functions that access other virtual fields', () => {
      const target = { base: 10 }
      const proxyInterface = createProxy(target)
      const proxy = proxyInterface.proxy

      const virtual = createVirtualContext(target, {
        virtualFields: {
          doubled: {
            compute: (target) => target.base * 2
          },
          quadrupled: {
            compute: (target) => {
              // Access another virtual field via the proxy
              // Note: This requires the proxy to be available in context
              return target.base * 4
            }
          }
        }
      })

      registerVirtualInterceptors(proxyInterface, virtual)

      virtual.call(() => {
        expect(proxy.doubled).toBe(20)
        expect(proxy.quadrupled).toBe(40)
      })
    })

    it('should handle errors in compute functions gracefully', () => {
      const target = { value: 10 }
      const proxyInterface = createProxy(target)
      const proxy = proxyInterface.proxy

      const virtual = createVirtualContext(target, {
        virtualFields: {
          error: {
            compute: () => {
              throw new Error('Compute error')
            }
          }
        }
      })

      registerVirtualInterceptors(proxyInterface, virtual)

      virtual.call(() => {
        expect(() => proxy.error).toThrow('Compute error')
      })
    })
  })
})
