import { describe, it, expect } from 'vitest'
import { createProxy } from '../../src/proxy/create-proxy.js'
import {
  createSandboxContext,
  createSandboxOwnKeysInterceptor,
  createSandboxGetOwnPropertyDescriptorInterceptor,
  createSandboxConstructInterceptor,
  createSandboxDeletePropertyInterceptor,
  createSandboxSetInterceptor,
  createSandboxHasInterceptor,
  createSandboxApplyInterceptor,
  createSandboxGetInterceptor,
  registerSandboxInterceptors,
} from '../../src/sandbox/sandbox-context.js'
import {
  createCapabilityContext,
  registerCapabilityInterceptors,
} from '../../src/security/capability-acl.js'
import {
  createTransactionContext,
  registerTransactionInterceptors,
} from '../../src/transactions/transaction-context.js'

describe('Sandbox Context', () => {
  describe('createSandboxContext', () => {
    it('should create a sandbox context with default policy', () => {
      const target = { foo: 1, bar: 2 }
      const sandboxCtx = createSandboxContext(target)

      expect(sandboxCtx).toBeDefined()
      expect(sandboxCtx.call).toBeDefined()
      expect(sandboxCtx.isRestricted).toBeDefined()
      expect(sandboxCtx.getPolicy).toBeDefined()
      expect(sandboxCtx.updatePolicy).toBeDefined()
    })

    it('should create a sandbox context with custom policy', () => {
      const target = { secret: 1, public: 2 }
      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['secret']),
        allowConstruction: false,
        allowDescriptors: false,
        allowEnumeration: true,
        allowDelete: false,
      })

      const policy = sandboxCtx.getPolicy()
      expect(policy.allowConstruction).toBe(false)
      expect(policy.allowDescriptors).toBe(false)
      expect(policy.allowEnumeration).toBe(true)
      expect(policy.allowDelete).toBe(false)
    })

    it('should support function-based restrictedKeys', () => {
      const target = { _private: 1, public: 2 }
      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: (key) => String(key).startsWith('_'),
      })

      expect(sandboxCtx.isRestricted('_private')).toBe(true)
      expect(sandboxCtx.isRestricted('public')).toBe(false)
    })
  })

  describe('Policy Management', () => {
    it('should get current policy', () => {
      const target = {}
      const sandboxCtx = createSandboxContext(target, {
        allowConstruction: true,
        allowDelete: true,
      })

      const policy = sandboxCtx.getPolicy()
      expect(policy.allowConstruction).toBe(true)
      expect(policy.allowDelete).toBe(true)
    })

    it('should update policy', () => {
      const target = {}
      const sandboxCtx = createSandboxContext(target, {
        allowConstruction: false,
      })

      expect(sandboxCtx.getPolicy().allowConstruction).toBe(false)

      sandboxCtx.updatePolicy({ allowConstruction: true })
      expect(sandboxCtx.getPolicy().allowConstruction).toBe(true)
    })

    it('should merge policy updates with existing policy', () => {
      const target = {}
      const sandboxCtx = createSandboxContext(target, {
        allowConstruction: false,
        allowDelete: false,
      })

      sandboxCtx.updatePolicy({ allowConstruction: true })
      const policy = sandboxCtx.getPolicy()

      expect(policy.allowConstruction).toBe(true)
      expect(policy.allowDelete).toBe(false) // Unchanged
    })
  })

  describe('Key Restriction Checking', () => {
    it('should check if key is restricted using Set', () => {
      const target = { secret: 1, public: 2 }
      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['secret']),
      })

      expect(sandboxCtx.isRestricted('secret')).toBe(true)
      expect(sandboxCtx.isRestricted('public')).toBe(false)
    })

    it('should check if key is restricted using function', () => {
      const target = { __internal: 1, public: 2 }
      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: (key) => String(key).startsWith('__'),
      })

      expect(sandboxCtx.isRestricted('__internal')).toBe(true)
      expect(sandboxCtx.isRestricted('public')).toBe(false)
    })

    it('should handle Symbol keys', () => {
      const sym = Symbol('secret')
      const target = { [sym]: 1 }
      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set([sym]),
      })

      expect(sandboxCtx.isRestricted(sym)).toBe(true)
    })
  })

  describe('OwnKeys Interceptor - Key Enumeration Filtering', () => {
    it('should filter out restricted keys during enumeration', () => {
      const target = { public1: 1, secret: 2, public2: 3 }
      const { proxy, defineOwnKeysInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['secret']),
        allowEnumeration: true,
      })

      defineOwnKeysInterceptor(createSandboxOwnKeysInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        const keys = Reflect.ownKeys(proxy)
        expect(keys).toEqual(['public1', 'public2'])
        expect(keys).not.toContain('secret')
      })
    })

    it('should return empty array when enumeration is not allowed', () => {
      const target = { foo: 1, bar: 2 }
      const { proxy, defineOwnKeysInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        allowEnumeration: false,
      })

      defineOwnKeysInterceptor(createSandboxOwnKeysInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        const keys = Reflect.ownKeys(proxy)
        expect(keys).toEqual([])
      })
    })

    it('should work with Object.keys()', () => {
      const target = { visible: 1, hidden: 2, another: 3 }
      const { proxy, defineOwnKeysInterceptor, defineGetOwnPropertyDescriptorInterceptor } =
        createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['hidden']),
        allowEnumeration: true,
        allowDescriptors: true,
      })

      defineOwnKeysInterceptor(createSandboxOwnKeysInterceptor(sandboxCtx))
      defineGetOwnPropertyDescriptorInterceptor(
        createSandboxGetOwnPropertyDescriptorInterceptor(sandboxCtx)
      )

      sandboxCtx.call(() => {
        const keys = Object.keys(proxy)
        expect(keys).toEqual(['visible', 'another'])
      })
    })

    it('should support function-based restrictedKeys predicate', () => {
      const target = { _internal1: 1, public: 2, _internal2: 3 }
      const { proxy, defineOwnKeysInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: (key) => String(key).startsWith('_'),
        allowEnumeration: true,
      })

      defineOwnKeysInterceptor(createSandboxOwnKeysInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        const keys = Reflect.ownKeys(proxy)
        expect(keys).toEqual(['public'])
      })
    })

    it('should return empty array when ownKeys operation is restricted', () => {
      const target = { foo: 1, bar: 2 }
      const { proxy, defineOwnKeysInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedOperations: new Set(['ownKeys']),
      })

      defineOwnKeysInterceptor(createSandboxOwnKeysInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        const keys = Reflect.ownKeys(proxy)
        expect(keys).toEqual([])
      })
    })
  })

  describe('GetOwnPropertyDescriptor Interceptor - Descriptor Access Restriction', () => {
    it('should deny descriptor access when operation is restricted', () => {
      const target = { foo: 42 }
      const { proxy, defineGetOwnPropertyDescriptorInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedOperations: new Set(['getOwnPropertyDescriptor']),
      })

      defineGetOwnPropertyDescriptorInterceptor(
        createSandboxGetOwnPropertyDescriptorInterceptor(sandboxCtx)
      )

      sandboxCtx.call(() => {
        expect(() => Object.getOwnPropertyDescriptor(proxy, 'foo')).toThrow(
          'Sandbox violation: getOwnPropertyDescriptor operation is restricted'
        )
      })
    })

    it('should deny descriptor access for restricted keys', () => {
      const target = { secret: 42, public: 10 }
      const { proxy, defineGetOwnPropertyDescriptorInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['secret']),
        allowDescriptors: true,
      })

      defineGetOwnPropertyDescriptorInterceptor(
        createSandboxGetOwnPropertyDescriptorInterceptor(sandboxCtx)
      )

      sandboxCtx.call(() => {
        expect(() => Object.getOwnPropertyDescriptor(proxy, 'secret')).toThrow(
          'Sandbox violation: descriptor access denied for restricted property'
        )

        const publicDesc = Object.getOwnPropertyDescriptor(proxy, 'public')
        expect(publicDesc).toBeDefined()
        expect(publicDesc.value).toBe(10)
      })
    })

    it('should allow descriptor access when policy permits', () => {
      const target = { accessible: 99 }
      const { proxy, defineGetOwnPropertyDescriptorInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        allowDescriptors: true,
      })

      defineGetOwnPropertyDescriptorInterceptor(
        createSandboxGetOwnPropertyDescriptorInterceptor(sandboxCtx)
      )

      sandboxCtx.call(() => {
        const desc = Object.getOwnPropertyDescriptor(proxy, 'accessible')
        expect(desc).toBeDefined()
        expect(desc.value).toBe(99)
      })
    })

    it('should allow descriptor access for non-restricted keys', () => {
      const target = { foo: 42 }
      const { proxy, defineGetOwnPropertyDescriptorInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        allowDescriptors: true,
      })

      defineGetOwnPropertyDescriptorInterceptor(
        createSandboxGetOwnPropertyDescriptorInterceptor(sandboxCtx)
      )

      sandboxCtx.call(() => {
        const desc = Object.getOwnPropertyDescriptor(proxy, 'foo')
        expect(desc).toBeDefined()
        expect(desc.value).toBe(42)
      })
    })
  })

  describe('Construct Interceptor - Construction Denial', () => {
    it('should deny construction when not allowed', () => {
      const target = function (name) {
        this.name = name
      }
      const { proxy, defineConstructInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        allowConstruction: false,
      })

      defineConstructInterceptor(createSandboxConstructInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        expect(() => new proxy('Test')).toThrow('Sandbox violation: construction is not allowed')
      })
    })

    it('should allow construction when policy permits', () => {
      const target = function (value) {
        this.value = value
      }
      const { proxy, defineConstructInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        allowConstruction: true,
      })

      defineConstructInterceptor(createSandboxConstructInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        const obj = new proxy(42)
        expect(obj.value).toBe(42)
      })
    })

    it('should support function-based construction allowance', () => {
      const target = function (value) {
        this.value = value
      }
      const { proxy, defineConstructInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        allowConstruction: (target, argsList) => argsList[0] !== 'forbidden',
      })

      defineConstructInterceptor(createSandboxConstructInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        const obj1 = new proxy('allowed')
        expect(obj1.value).toBe('allowed')

        expect(() => new proxy('forbidden')).toThrow('construction is not allowed')
      })
    })

    it('should deny construction when operation is restricted', () => {
      const target = function (name) {
        this.name = name
      }
      const { proxy, defineConstructInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        allowConstruction: true,
        restrictedOperations: new Set(['construct']),
      })

      defineConstructInterceptor(createSandboxConstructInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        expect(() => new proxy('Test')).toThrow('Sandbox violation: construct operation is restricted')
      })
    })
  })

  describe('DeleteProperty Interceptor - Deletion Control', () => {
    it('should deny deletion when not allowed', () => {
      const target = { deletable: 1, permanent: 2 }
      const { proxy, defineDeletePropertyInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        allowDelete: false,
      })

      defineDeletePropertyInterceptor(createSandboxDeletePropertyInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        const result = Reflect.deleteProperty(proxy, 'deletable')
        expect(result).toBe(false)
        expect(target.deletable).toBe(1) // Still exists
      })
    })

    it('should allow deletion when policy permits', () => {
      const target = { deletable: 1 }
      const { proxy, defineDeletePropertyInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        allowDelete: true,
      })

      defineDeletePropertyInterceptor(createSandboxDeletePropertyInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        delete proxy.deletable
        expect(target.deletable).toBeUndefined()
      })
    })

    it('should deny deletion of restricted keys even when delete is allowed', () => {
      const target = { deletable: 1, protected: 2 }
      const { proxy, defineDeletePropertyInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['protected']),
        allowDelete: true,
      })

      defineDeletePropertyInterceptor(createSandboxDeletePropertyInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        delete proxy.deletable
        expect(target.deletable).toBeUndefined()

        const result = Reflect.deleteProperty(proxy, 'protected')
        expect(result).toBe(false)
        expect(target.protected).toBe(2) // Still exists
      })
    })
  })

  describe('Set Interceptor - Write Restriction', () => {
    it('should deny setting restricted keys', () => {
      const target = { allowed: 1, restricted: 2 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['restricted']),
      })

      defineSetInterceptor(createSandboxSetInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        proxy.allowed = 99
        expect(target.allowed).toBe(99)

        const result = Reflect.set(proxy, 'restricted', 99)
        expect(result).toBe(false)
        expect(target.restricted).toBe(2) // Unchanged
      })
    })

    it('should deny setting when operation is restricted', () => {
      const target = { foo: 1 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedOperations: new Set(['set']),
      })

      defineSetInterceptor(createSandboxSetInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        const result = Reflect.set(proxy, 'foo', 99)
        expect(result).toBe(false)
        expect(target.foo).toBe(1)
      })
    })
  })

  describe('Has Interceptor - Property Hiding', () => {
    it('should return false for restricted keys', () => {
      const target = { visible: 1, hidden: 2 }
      const { proxy, defineHasInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['hidden']),
      })

      defineHasInterceptor(createSandboxHasInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        expect('visible' in proxy).toBe(true)
        expect('hidden' in proxy).toBe(false) // Hidden from discovery
      })
    })

    it('should return false when operation is restricted', () => {
      const target = { foo: 1 }
      const { proxy, defineHasInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedOperations: new Set(['has']),
      })

      defineHasInterceptor(createSandboxHasInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        expect('foo' in proxy).toBe(false)
      })
    })
  })

  describe('Apply Interceptor - Function Call Control', () => {
    it('should allow function application when policy permits', () => {
      const target = function (x) {
        return x * 2
      }
      const { proxy, defineApplyInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        allowApply: true,
      })

      defineApplyInterceptor(createSandboxApplyInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        const result = proxy(21)
        expect(result).toBe(42)
      })
    })

    it('should deny function application when not allowed', () => {
      const target = function (x) {
        return x * 2
      }
      const { proxy, defineApplyInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        allowApply: false,
      })

      defineApplyInterceptor(createSandboxApplyInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        expect(() => proxy(21)).toThrow('Sandbox violation: function application is not allowed')
      })
    })

    it('should support function-based apply allowance', () => {
      const target = function (...args) {
        return args
      }
      const { proxy, defineApplyInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        allowApply: (target, thisArg, argsList) => argsList.length <= 2,
      })

      defineApplyInterceptor(createSandboxApplyInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        expect(proxy(1, 2)).toEqual([1, 2])
        expect(() => proxy(1, 2, 3)).toThrow('function application is not allowed')
      })
    })
  })

  describe('Get Interceptor - Read Restriction', () => {
    it('should deny reading restricted keys', () => {
      const target = { public: 1, secret: 2 }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['secret']),
      })

      defineGetInterceptor(createSandboxGetInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        expect(proxy.public).toBe(1)
        expect(() => proxy.secret).toThrow('Sandbox violation: property "secret" is restricted')
      })
    })

    it('should deny reading when operation is restricted', () => {
      const target = { foo: 1 }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedOperations: new Set(['get']),
      })

      defineGetInterceptor(createSandboxGetInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        expect(() => proxy.foo).toThrow('Sandbox violation: get operation is restricted')
      })
    })
  })

  describe('Structural Containment - Property Discovery Prevention', () => {
    it('should prevent discovery of restricted properties through multiple vectors', () => {
      const target = { public: 1, __internal: 2, __secret: 3 }
      const proxyInterface = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: (key) => String(key).startsWith('__'),
        allowEnumeration: true,
        allowDescriptors: true,
      })

      registerSandboxInterceptors(proxyInterface, sandboxCtx)

      sandboxCtx.call(() => {
        // ownKeys should not reveal restricted keys
        const keys = Reflect.ownKeys(proxyInterface.proxy)
        expect(keys).toEqual(['public'])

        // has should return false for restricted keys
        expect('__internal' in proxyInterface.proxy).toBe(false)
        expect('__secret' in proxyInterface.proxy).toBe(false)

        // getOwnPropertyDescriptor should throw for restricted keys
        expect(() =>
          Object.getOwnPropertyDescriptor(proxyInterface.proxy, '__internal')
        ).toThrow('descriptor access denied')

        // get should throw for restricted keys
        expect(() => proxyInterface.proxy.__internal).toThrow('restricted')
      })
    })

    it('should provide complete structural isolation', () => {
      const target = {
        publicData: 'visible',
        _privateData: 'hidden',
        _internalState: { secret: true },
      }
      const proxyInterface = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: (key) => String(key).startsWith('_'),
        allowEnumeration: true,
        allowDescriptors: false,
      })

      registerSandboxInterceptors(proxyInterface, sandboxCtx)

      sandboxCtx.call(() => {
        // Complete structural isolation
        expect(Object.keys(proxyInterface.proxy)).toEqual(['publicData'])
        expect('_privateData' in proxyInterface.proxy).toBe(false)
        expect('_internalState' in proxyInterface.proxy).toBe(false)

        // Descriptor access works for non-restricted keys even with allowDescriptors: false
        // (to prevent breaking internal JS operations)
        const desc = Object.getOwnPropertyDescriptor(proxyInterface.proxy, 'publicData')
        expect(desc).toBeDefined()
        expect(desc.value).toBe('visible')

        // Can still access public data
        expect(proxyInterface.proxy.publicData).toBe('visible')
      })
    })
  })

  describe('Composition with ACL', () => {
    it('should compose Sandbox > ACL for layered security', () => {
      const target = { public: 1, internal: 2, secret: 3 }
      const proxyInterface = createProxy(target)

      // Layer 1: Sandbox - prevents structural discovery
      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['secret']),
        allowEnumeration: true,
      })

      // Layer 2: ACL - capability-based access control
      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['public', 'internal']),
        canWrite: new Set(['public']),
      })

      // Register Sandbox first (outer layer, more restrictive)
      registerSandboxInterceptors(proxyInterface, sandboxCtx)
      // Then ACL (inner layer)
      registerCapabilityInterceptors(proxyInterface, capCtx)

      sandboxCtx.call(() => {
        capCtx.call(() => {
          // Can read public
          expect(proxyInterface.proxy.public).toBe(1)

          // Can read internal (ACL allows, sandbox allows)
          expect(proxyInterface.proxy.internal).toBe(2)

          // Cannot read secret (sandbox blocks)
          expect(() => proxyInterface.proxy.secret).toThrow('Sandbox violation')

          // ownKeys respects both layers
          const keys = Reflect.ownKeys(proxyInterface.proxy)
          expect(keys).toEqual(['public', 'internal']) // secret filtered by sandbox
        })
      })
    })

    it('should enforce fail-closed security in composition', () => {
      const target = { data: 'sensitive' }
      const proxyInterface = createProxy(target)

      // Restrictive sandbox
      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['data']),
      })

      // Permissive ACL
      const capCtx = createCapabilityContext(target, {
        canRead: new Set(['data']),
      })

      registerSandboxInterceptors(proxyInterface, sandboxCtx)
      registerCapabilityInterceptors(proxyInterface, capCtx)

      sandboxCtx.call(() => {
        capCtx.call(() => {
          // Sandbox denies (outer layer), ACL allows (inner layer)
          // Sandbox wins (fail-closed)
          expect(() => proxyInterface.proxy.data).toThrow('Sandbox violation')
        })
      })
    })
  })

  describe('Composition with Transactions', () => {
    it('should compose Sandbox > Transactions for safe mutation journaling', () => {
      const target = { counter: 0, protected: 10 }
      const proxyInterface = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['protected']),
      })

      const txCtx = createTransactionContext(target)

      // Sandbox first (blocks restricted mutations)
      registerSandboxInterceptors(proxyInterface, sandboxCtx)
      // Transactions second (journals allowed mutations)
      registerTransactionInterceptors(proxyInterface, txCtx)

      sandboxCtx.call(() => {
        txCtx.call(() => {
          // Allowed mutation is journaled
          proxyInterface.proxy.counter = 5
          expect(target.counter).toBe(5)

          // Restricted mutation is blocked before journaling
          const result = Reflect.set(proxyInterface.proxy, 'protected', 99)
          expect(result).toBe(false)

          // Rollback only affects allowed mutations
          txCtx.rollback()
          expect(target.counter).toBe(0) // Rolled back
          expect(target.protected).toBe(10) // Never changed
        })
      })
    })

    it('should prevent restricted mutations from being journaled', () => {
      const target = { editable: 1, readonly: 2 }
      const proxyInterface = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['readonly']),
      })

      const txCtx = createTransactionContext(target)

      registerSandboxInterceptors(proxyInterface, sandboxCtx)
      registerTransactionInterceptors(proxyInterface, txCtx)

      sandboxCtx.call(() => {
        txCtx.call(() => {
          proxyInterface.proxy.editable = 99
          const result = Reflect.set(proxyInterface.proxy, 'readonly', 99)
          expect(result).toBe(false)

          // Journal should only contain editable mutation
          const journal = txCtx.getJournal()
          expect(journal).toHaveLength(1)
          expect(journal[0].property).toBe('editable')
        })
      })
    })
  })

  describe('Whitelist vs Blacklist Strategies', () => {
    it('should support blacklist strategy (restrict specific keys)', () => {
      const target = { foo: 1, bar: 2, secret: 3, internal: 4 }
      const { proxy, defineOwnKeysInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        // Blacklist: explicitly restrict these keys
        restrictedKeys: new Set(['secret', 'internal']),
        allowEnumeration: true,
      })

      defineOwnKeysInterceptor(createSandboxOwnKeysInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        const keys = Reflect.ownKeys(proxy)
        expect(keys).toEqual(['foo', 'bar'])
      })
    })

    it('should support whitelist strategy (allow only specific keys)', () => {
      const target = { public1: 1, public2: 2, private1: 3, private2: 4 }
      const { proxy, defineOwnKeysInterceptor } = createProxy(target)

      const allowedKeys = new Set(['public1', 'public2'])
      const sandboxCtx = createSandboxContext(target, {
        // Whitelist: restrict everything NOT in allowed set
        restrictedKeys: (key) => !allowedKeys.has(key),
        allowEnumeration: true,
      })

      defineOwnKeysInterceptor(createSandboxOwnKeysInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        const keys = Reflect.ownKeys(proxy)
        expect(keys).toEqual(['public1', 'public2'])
      })
    })

    it('should support pattern-based blacklist', () => {
      const target = {
        publicFoo: 1,
        _privateFoo: 2,
        publicBar: 3,
        __internalBar: 4,
      }
      const { proxy, defineOwnKeysInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        // Pattern-based blacklist: restrict keys starting with _ or __
        restrictedKeys: (key) => String(key).startsWith('_'),
        allowEnumeration: true,
      })

      defineOwnKeysInterceptor(createSandboxOwnKeysInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        const keys = Reflect.ownKeys(proxy)
        expect(keys).toEqual(['publicFoo', 'publicBar'])
      })
    })
  })

  describe('registerSandboxInterceptors Helper', () => {
    it('should register all sandbox interceptors at once', () => {
      const target = {
        public: 1,
        secret: 2,
      }
      const proxyInterface = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['secret']),
        allowConstruction: false,
        allowDescriptors: false,
        allowEnumeration: true,
        allowDelete: false,
      })

      registerSandboxInterceptors(proxyInterface, sandboxCtx)

      sandboxCtx.call(() => {
        // Get: allowed for public, denied for secret
        expect(proxyInterface.proxy.public).toBe(1)
        expect(() => proxyInterface.proxy.secret).toThrow('restricted')

        // OwnKeys: filters out secret
        expect(Reflect.ownKeys(proxyInterface.proxy)).toEqual(['public'])

        // Has: false for secret
        expect('secret' in proxyInterface.proxy).toBe(false)

        // GetOwnPropertyDescriptor: works for non-restricted keys
        const desc = Object.getOwnPropertyDescriptor(proxyInterface.proxy, 'public')
        expect(desc).toBeDefined()
        expect(desc.value).toBe(1)

        // Delete: denied globally
        const deleteResult = Reflect.deleteProperty(proxyInterface.proxy, 'public')
        expect(deleteResult).toBe(false)
      })
    })
  })

  describe('Context Isolation', () => {
    it('should not apply sandbox restrictions outside context', () => {
      const target = { public: 1, secret: 2 }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['secret']),
      })

      defineGetInterceptor(createSandboxGetInterceptor(sandboxCtx))

      // Outside context - sandbox not active
      expect(proxy.secret).toBe(2)

      // Inside context - sandbox active
      sandboxCtx.call(() => {
        expect(() => proxy.secret).toThrow('restricted')
      })
    })

    it('should support nested sandbox contexts', () => {
      const target = { level1: 1, level2: 2, level3: 3 }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const outerSandbox = createSandboxContext(target, {
        restrictedKeys: new Set(['level3']),
      })

      defineGetInterceptor(createSandboxGetInterceptor(outerSandbox))

      outerSandbox.call(() => {
        expect(proxy.level1).toBe(1)
        expect(proxy.level2).toBe(2)
        expect(() => proxy.level3).toThrow('restricted')
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty restrictedKeys', () => {
      const target = { foo: 1, bar: 2 }
      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(),
      })

      expect(sandboxCtx.isRestricted('foo')).toBe(false)
      expect(sandboxCtx.isRestricted('bar')).toBe(false)
    })

    it('should handle Symbol keys in restrictions', () => {
      const sym1 = Symbol('public')
      const sym2 = Symbol('secret')
      const target = { [sym1]: 1, [sym2]: 2 }
      const { proxy, defineHasInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set([sym2]),
      })

      defineHasInterceptor(createSandboxHasInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        expect(sym1 in proxy).toBe(true)
        expect(sym2 in proxy).toBe(false)
      })
    })

    it('should handle dynamic policy updates', () => {
      const target = { foo: 1, bar: 2 }
      const { proxy, defineGetInterceptor } = createProxy(target)

      const sandboxCtx = createSandboxContext(target, {
        restrictedKeys: new Set(['foo']),
      })

      defineGetInterceptor(createSandboxGetInterceptor(sandboxCtx))

      sandboxCtx.call(() => {
        // Initially foo is restricted
        expect(() => proxy.foo).toThrow('restricted')
        expect(proxy.bar).toBe(2)

        // Update policy to restrict bar instead
        sandboxCtx.updatePolicy({
          restrictedKeys: new Set(['bar']),
        })

        // Now bar is restricted, foo is accessible
        expect(proxy.foo).toBe(1)
        expect(() => proxy.bar).toThrow('restricted')
      })
    })
  })
})
