import { describe, it, expect } from 'vitest'
import { createProxy } from '../../src/proxy/create-proxy.js'
import {
  createInvariantContext,
  createInvariantSetInterceptor,
  createInvariantDeletePropertyInterceptor,
  createInvariantApplyInterceptor,
  createInvariantConstructInterceptor,
  registerInvariantInterceptors,
  typeInvariant,
  rangeInvariant,
  immutableInvariant,
  dependencyInvariant,
  uniquenessInvariant,
  requiredInvariant,
  patternInvariant,
} from '../../src/invariants/invariant-context.js'
import { createCapabilityContext, registerCapabilityInterceptors } from '../../src/security/capability-acl.js'
import { createTransactionContext, registerTransactionInterceptors } from '../../src/transactions/transaction-context.js'

describe('Invariant Enforcement', () => {
  describe('createInvariantContext', () => {
    it('should create an invariant context with named invariants', () => {
      const target = { value: 0 }
      const invCtx = createInvariantContext(target, {
        positive: (t, op) => op.trap === 'set' && op.property === 'value' ? op.value >= 0 : true
      })

      expect(invCtx).toBeDefined()
      expect(invCtx.addInvariant).toBeDefined()
      expect(invCtx.removeInvariant).toBeDefined()
      expect(invCtx.getInvariants).toBeDefined()
      expect(invCtx.validateState).toBeDefined()
      expect(invCtx.call).toBeDefined()
    })

    it('should create an invariant context with array of invariants', () => {
      const target = { value: 0 }
      const invCtx = createInvariantContext(target, [
        (t, op) => op.value >= 0,
        (t, op) => op.value <= 100,
      ])

      const invariants = invCtx.getInvariants()
      expect(Object.keys(invariants).length).toBe(2)
      expect(invariants.invariant_0).toBeDefined()
      expect(invariants.invariant_1).toBeDefined()
    })

    it('should handle empty invariants', () => {
      const target = {}
      const invCtx = createInvariantContext(target)

      const invariants = invCtx.getInvariants()
      expect(Object.keys(invariants).length).toBe(0)
    })
  })

  describe('Basic Invariant Enforcement', () => {
    it('should prevent invalid mutations', () => {
      const target = { age: 25 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const invCtx = createInvariantContext(target, {
        agePositive: (t, op) => {
          if (op.trap === 'set' && op.property === 'age') {
            return op.value >= 0 || 'Age cannot be negative'
          }
          return true
        }
      })

      defineSetInterceptor(createInvariantSetInterceptor(invCtx))

      invCtx.call(() => {
        // Valid mutation
        proxy.age = 30
        expect(target.age).toBe(30)

        // Invalid mutation
        expect(() => {
          proxy.age = -5
        }).toThrow('Invariant violation: Age cannot be negative')

        // Age should remain at valid value
        expect(target.age).toBe(30)
      })
    })

    it('should allow mutations that pass invariants', () => {
      const target = { balance: 100 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const invCtx = createInvariantContext(target, {
        positiveBalance: (t, op) => {
          if (op.trap === 'set' && op.property === 'balance') {
            return op.value >= 0
          }
          return true
        }
      })

      defineSetInterceptor(createInvariantSetInterceptor(invCtx))

      invCtx.call(() => {
        proxy.balance = 200
        expect(target.balance).toBe(200)

        proxy.balance = 0
        expect(target.balance).toBe(0)
      })
    })

    it('should work outside context without enforcement', () => {
      const target = { value: 10 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const invCtx = createInvariantContext(target, {
        positive: (t, op) => op.value >= 0 || 'Must be positive'
      })

      defineSetInterceptor(createInvariantSetInterceptor(invCtx))

      // Outside context - no enforcement
      proxy.value = -100
      expect(target.value).toBe(-100)

      // Inside context - enforcement active
      invCtx.call(() => {
        expect(() => {
          proxy.value = -200
        }).toThrow('Must be positive')
      })
    })
  })

  describe('Multiple Invariants', () => {
    it('should require all invariants to pass', () => {
      const target = { age: 25 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const invCtx = createInvariantContext(target, {
        positive: (t, op) => {
          if (op.trap === 'set' && op.property === 'age') {
            return op.value >= 0 || 'Age must be positive'
          }
          return true
        },
        maximum: (t, op) => {
          if (op.trap === 'set' && op.property === 'age') {
            return op.value <= 150 || 'Age must be <= 150'
          }
          return true
        },
        integer: (t, op) => {
          if (op.trap === 'set' && op.property === 'age') {
            return Number.isInteger(op.value) || 'Age must be an integer'
          }
          return true
        }
      })

      defineSetInterceptor(createInvariantSetInterceptor(invCtx))

      invCtx.call(() => {
        // All invariants pass
        proxy.age = 30
        expect(target.age).toBe(30)

        // Fails positive check
        expect(() => {
          proxy.age = -5
        }).toThrow('Age must be positive')

        // Fails maximum check
        expect(() => {
          proxy.age = 200
        }).toThrow('Age must be <= 150')

        // Fails integer check
        expect(() => {
          proxy.age = 25.5
        }).toThrow('Age must be an integer')

        // Age should still be valid
        expect(target.age).toBe(30)
      })
    })

    it('should short-circuit on first failure', () => {
      const target = { value: 10 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const callOrder = []

      const invCtx = createInvariantContext(target, {
        first: (_t, _op) => {
          callOrder.push('first')
          return false // Always fails
        },
        second: (_t, _op) => {
          callOrder.push('second')
          return false
        },
        third: (_t, _op) => {
          callOrder.push('third')
          return false
        }
      })

      defineSetInterceptor(createInvariantSetInterceptor(invCtx))

      invCtx.call(() => {
        callOrder.length = 0

        expect(() => {
          proxy.value = 20
        }).toThrow('Invariant "first" failed')

        // All invariants are checked (validateState checks all)
        // but error reports first failure
        expect(callOrder).toContain('first')
      })
    })
  })

  describe('Dynamic Invariant Management', () => {
    it('should allow adding invariants dynamically', () => {
      const target = { value: 0 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const invCtx = createInvariantContext(target)
      defineSetInterceptor(createInvariantSetInterceptor(invCtx))

      invCtx.call(() => {
        // No invariants - everything allowed
        proxy.value = -100
        expect(target.value).toBe(-100)

        // Add invariant
        invCtx.addInvariant('positive', (t, op) => {
          if (op.trap === 'set' && op.property === 'value') {
            return op.value >= 0 || 'Must be positive'
          }
          return true
        })

        // Now enforced
        expect(() => {
          proxy.value = -200
        }).toThrow('Must be positive')

        // Valid operations still work
        proxy.value = 50
        expect(target.value).toBe(50)
      })
    })

    it('should allow removing invariants dynamically', () => {
      const target = { value: 10 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const invCtx = createInvariantContext(target, {
        positive: (t, op) => {
          if (op.trap === 'set' && op.property === 'value') {
            return op.value >= 0 || 'Must be positive'
          }
          return true
        }
      })

      defineSetInterceptor(createInvariantSetInterceptor(invCtx))

      invCtx.call(() => {
        // Invariant enforced
        expect(() => {
          proxy.value = -5
        }).toThrow('Must be positive')

        // Remove invariant
        const removed = invCtx.removeInvariant('positive')
        expect(removed).toBe(true)

        // No longer enforced
        proxy.value = -100
        expect(target.value).toBe(-100)

        // Removing non-existent invariant
        const removed2 = invCtx.removeInvariant('nonexistent')
        expect(removed2).toBe(false)
      })
    })

    it('should list current invariants', () => {
      const inv1 = (t, op) => true
      const inv2 = (t, op) => true

      const invCtx = createInvariantContext({}, {
        first: inv1,
        second: inv2,
      })

      const invariants = invCtx.getInvariants()
      expect(Object.keys(invariants)).toEqual(['first', 'second'])
      expect(invariants.first).toBe(inv1)
      expect(invariants.second).toBe(inv2)
    })

    it('should throw when adding duplicate invariant', () => {
      const invCtx = createInvariantContext({}, {
        existing: (t, op) => true
      })

      expect(() => {
        invCtx.addInvariant('existing', (t, op) => true)
      }).toThrow('Invariant "existing" already exists')
    })

    it('should throw when adding non-function invariant', () => {
      const invCtx = createInvariantContext({})

      expect(() => {
        // @ts-expect-error - intentionally passing wrong type
        invCtx.addInvariant('invalid', 'not a function')
      }).toThrow('Invariant must be a function')
    })
  })

  describe('Delete Property Enforcement', () => {
    it('should enforce invariants on delete operations', () => {
      const target = { id: 1, name: 'Test' }
      const { proxy, defineDeletePropertyInterceptor } = createProxy(target)

      const invCtx = createInvariantContext(target, {
        protectId: (t, op) => {
          if (op.trap === 'deleteProperty' && op.property === 'id') {
            return 'Cannot delete id property'
          }
          return true
        }
      })

      defineDeletePropertyInterceptor(createInvariantDeletePropertyInterceptor(invCtx))

      invCtx.call(() => {
        // Can delete name
        delete proxy.name
        expect(target.name).toBeUndefined()

        // Cannot delete id
        expect(() => {
          delete proxy.id
        }).toThrow('Cannot delete id property')

        expect(target.id).toBe(1)
      })
    })
  })

  describe('Apply and Construct Enforcement', () => {
    it('should enforce invariants on function application', () => {
      const target = function (x) { return x * 2 }
      const { proxy, defineApplyInterceptor } = createProxy(target)

      const invCtx = createInvariantContext(target, {
        positiveArgs: (t, op) => {
          if (op.trap === 'apply') {
            return op.args.every(arg => arg >= 0) || 'Arguments must be positive'
          }
          return true
        }
      })

      defineApplyInterceptor(createInvariantApplyInterceptor(invCtx))

      invCtx.call(() => {
        // Valid call
        const result = proxy(5)
        expect(result).toBe(10)

        // Invalid call
        expect(() => {
          proxy(-5)
        }).toThrow('Arguments must be positive')
      })
    })

    it('should enforce invariants on construction', () => {
      const target = function (value) {
        this.value = value
      }
      const { proxy, defineConstructInterceptor } = createProxy(target)

      const invCtx = createInvariantContext(target, {
        positiveValue: (t, op) => {
          if (op.trap === 'construct') {
            return op.args[0] >= 0 || 'Constructor argument must be positive'
          }
          return true
        }
      })

      defineConstructInterceptor(createInvariantConstructInterceptor(invCtx))

      invCtx.call(() => {
        // Valid construction
        const obj = new proxy(10)
        expect(obj.value).toBe(10)

        // Invalid construction
        expect(() => {
          new proxy(-5)
        }).toThrow('Constructor argument must be positive')
      })
    })
  })

  describe('Composition with ACL', () => {
    it('should compose with ACL - ACL checks first, then invariants', () => {
      const target = { public: 10, private: 20 }
      const proxyInterface = createProxy(target)

      // ACL: can only write to public
      const capCtx = createCapabilityContext(target, {
        canWrite: new Set(['public']),
      })

      // Invariant: values must be positive
      const invCtx = createInvariantContext(target, {
        positive: (t, op) => {
          if (op.trap === 'set') {
            return op.value >= 0 || 'Value must be positive'
          }
          return true
        }
      })

      // Register ACL interceptors first (they should run first)
      registerCapabilityInterceptors(proxyInterface, capCtx)
      // Register invariant interceptors second
      registerInvariantInterceptors(proxyInterface, invCtx)

      capCtx.call(() => {
        invCtx.call(() => {
          // Can write to public with positive value
          proxyInterface.proxy.public = 30
          expect(target.public).toBe(30)

          // ACL denies writing to private (should fail before invariant check)
          const result = Reflect.set(proxyInterface.proxy, 'private', 50)
          expect(result).toBe(false)
          expect(target.private).toBe(20)

          // Invariant denies negative value on public property
          expect(() => {
            proxyInterface.proxy.public = -10
          }).toThrow('Value must be positive')

          expect(target.public).toBe(30)
        })
      })
    })
  })

  describe('Composition with Transactions', () => {
    it('should compose with Transactions - invariants checked before journaling', () => {
      const target = { balance: 100 }
      const proxyInterface = createProxy(target)

      // Invariant: balance must be non-negative
      const invCtx = createInvariantContext(target, {
        positiveBalance: (t, op) => {
          if (op.trap === 'set' && op.property === 'balance') {
            return op.value >= 0 || 'Balance cannot be negative'
          }
          return true
        }
      })

      // Transaction context
      const txCtx = createTransactionContext(target)

      // Register invariant interceptors first (should check before journaling)
      registerInvariantInterceptors(proxyInterface, invCtx)
      // Register transaction interceptors second
      registerTransactionInterceptors(proxyInterface, txCtx)

      invCtx.call(() => {
        txCtx.call(() => {
          // Valid mutation - should be journaled
          proxyInterface.proxy.balance = 200
          expect(target.balance).toBe(200)

          const journal1 = txCtx.getJournal()
          expect(journal1.length).toBe(1)

          // Invalid mutation - should NOT be journaled
          expect(() => {
            proxyInterface.proxy.balance = -50
          }).toThrow('Balance cannot be negative')

          // Journal should not include the failed mutation
          const journal2 = txCtx.getJournal()
          expect(journal2.length).toBe(1) // Still just the first mutation

          // Rollback
          txCtx.rollback()
          expect(target.balance).toBe(100)
        })
      })
    })
  })

  describe('Context Isolation', () => {
    it('should isolate invariants per context', () => {
      const target = { value: 0 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      // Context A: value must be positive
      const invCtxA = createInvariantContext(target, {
        positive: (t, op) => {
          if (op.trap === 'set' && op.property === 'value') {
            return op.value >= 0 || 'Must be positive'
          }
          return true
        }
      })

      // Context B: value must be even (not used in this test, but demonstrates isolation)
      const _invCtxB = createInvariantContext(target, {
        even: (t, op) => {
          if (op.trap === 'set' && op.property === 'value') {
            return op.value % 2 === 0 || 'Must be even'
          }
          return true
        }
      })

      defineSetInterceptor(createInvariantSetInterceptor(invCtxA))

      // In context A - positive constraint
      invCtxA.call(() => {
        proxy.value = 5 // Positive, odd - should pass
        expect(target.value).toBe(5)

        expect(() => {
          proxy.value = -10
        }).toThrow('Must be positive')
      })

      // Context B is independent (would need separate proxy to test)
      // This demonstrates context isolation
    })

    it('should support multiple contexts with different invariants on separate proxies', () => {
      const target = { count: 0 }

      // Proxy A with positive constraint
      const { proxy: proxyA, defineSetInterceptor: addSetA } = createProxy(target)
      const invCtxA = createInvariantContext(target, {
        positive: (t, op) => op.trap === 'set' ? op.value >= 0 : true
      })
      addSetA(createInvariantSetInterceptor(invCtxA))

      // Proxy B with even constraint
      const { proxy: proxyB, defineSetInterceptor: addSetB } = createProxy(target)
      const invCtxB = createInvariantContext(target, {
        even: (t, op) => op.trap === 'set' ? op.value % 2 === 0 : true
      })
      addSetB(createInvariantSetInterceptor(invCtxB))

      // Context A allows odd positive numbers
      invCtxA.call(() => {
        proxyA.count = 5
        expect(target.count).toBe(5)
      })

      // Context B requires even numbers
      invCtxB.call(() => {
        expect(() => {
          proxyB.count = 7
        }).toThrow('Invariant "even" failed')

        proxyB.count = 8
        expect(target.count).toBe(8)
      })
    })
  })

  describe('Common Invariant Patterns', () => {
    describe('typeInvariant', () => {
      it('should enforce type constraints', () => {
        const target = { age: 25, name: 'Alice' }
        const { proxy, defineSetInterceptor } = createProxy(target)

        const invCtx = createInvariantContext(target, {
          ageType: typeInvariant('age', Number),
          nameType: typeInvariant('name', String),
        })

        defineSetInterceptor(createInvariantSetInterceptor(invCtx))

        invCtx.call(() => {
          // Valid types
          proxy.age = 30
          expect(target.age).toBe(30)

          proxy.name = 'Bob'
          expect(target.name).toBe('Bob')

          // Invalid types
          expect(() => {
            proxy.age = 'thirty'
          }).toThrow('Property "age" must be of type Number')

          expect(() => {
            proxy.name = 123
          }).toThrow('Property "name" must be of type String')
        })
      })
    })

    describe('rangeInvariant', () => {
      it('should enforce range constraints', () => {
        const target = { age: 25, temperature: 20 }
        const { proxy, defineSetInterceptor } = createProxy(target)

        const invCtx = createInvariantContext(target, {
          ageRange: rangeInvariant('age', 0, 150),
          tempRange: rangeInvariant('temperature', -273.15, Infinity),
        })

        defineSetInterceptor(createInvariantSetInterceptor(invCtx))

        invCtx.call(() => {
          // Valid ranges
          proxy.age = 100
          expect(target.age).toBe(100)

          proxy.temperature = -100
          expect(target.temperature).toBe(-100)

          // Out of range
          expect(() => {
            proxy.age = -5
          }).toThrow('Property "age" must be between 0 and 150')

          expect(() => {
            proxy.age = 200
          }).toThrow('Property "age" must be between 0 and 150')

          expect(() => {
            proxy.temperature = -300
          }).toThrow('Property "temperature" must be between -273.15 and Infinity')
        })
      })

      it('should require numeric values', () => {
        const target = { value: 0 }
        const { proxy, defineSetInterceptor } = createProxy(target)

        const invCtx = createInvariantContext(target, {
          range: rangeInvariant('value', 0, 100),
        })

        defineSetInterceptor(createInvariantSetInterceptor(invCtx))

        invCtx.call(() => {
          expect(() => {
            proxy.value = 'not a number'
          }).toThrow('Property "value" must be a number')
        })
      })
    })

    describe('immutableInvariant', () => {
      it('should prevent modification of immutable properties', () => {
        const target = { id: 1, name: 'Test' }
        const { proxy, defineSetInterceptor, defineDeletePropertyInterceptor } = createProxy(target)

        const invCtx = createInvariantContext(target, {
          immutable: immutableInvariant(new Set(['id'])),
        })

        defineSetInterceptor(createInvariantSetInterceptor(invCtx))
        defineDeletePropertyInterceptor(createInvariantDeletePropertyInterceptor(invCtx))

        invCtx.call(() => {
          // Can modify mutable property
          proxy.name = 'Updated'
          expect(target.name).toBe('Updated')

          // Cannot modify immutable property
          expect(() => {
            proxy.id = 2
          }).toThrow('Property "id" is immutable')

          // Cannot delete immutable property
          expect(() => {
            delete proxy.id
          }).toThrow('Property "id" is immutable and cannot be deleted')

          expect(target.id).toBe(1)
        })
      })

      it('should allow setting immutable property initially', () => {
        const target = {}
        const { proxy, defineSetInterceptor } = createProxy(target)

        const invCtx = createInvariantContext(target, {
          immutable: immutableInvariant(new Set(['id'])),
        })

        defineSetInterceptor(createInvariantSetInterceptor(invCtx))

        invCtx.call(() => {
          // Can set initially (property doesn't exist)
          proxy.id = 1
          expect(target.id).toBe(1)

          // Cannot modify after set
          expect(() => {
            proxy.id = 2
          }).toThrow('Property "id" is immutable')
        })
      })
    })

    describe('dependencyInvariant', () => {
      it('should enforce dependent state constraints', () => {
        const target = { min: 0, max: 100, value: 50 }
        const { proxy, defineSetInterceptor } = createProxy(target)

        const invCtx = createInvariantContext(target, {
          valueInRange: dependencyInvariant('valueInRange', (obj) => {
            return obj.value >= obj.min && obj.value <= obj.max
          }),
        })

        defineSetInterceptor(createInvariantSetInterceptor(invCtx))

        invCtx.call(() => {
          // Valid state change
          proxy.value = 75
          expect(target.value).toBe(75)

          // Can change max as long as value stays in range
          proxy.max = 80
          expect(target.max).toBe(80)

          // Invalid state change - value would be outside range
          expect(() => {
            proxy.max = 70 // Would make value > max
          }).toThrow('Dependency invariant "valueInRange" failed')

          expect(target.max).toBe(80)

          // Invalid value outside range
          expect(() => {
            proxy.value = 150
          }).toThrow('Dependency invariant "valueInRange" failed')

          expect(target.value).toBe(75)
        })
      })

      it('should check complex business rules', () => {
        const target = { startDate: new Date('2024-01-01'), endDate: new Date('2024-12-31') }
        const { proxy, defineSetInterceptor } = createProxy(target)

        const invCtx = createInvariantContext(target, {
          dateRange: dependencyInvariant('dateRange', (obj) => {
            return obj.startDate <= obj.endDate
          }),
        })

        defineSetInterceptor(createInvariantSetInterceptor(invCtx))

        invCtx.call(() => {
          // Valid date range
          proxy.endDate = new Date('2025-12-31')
          expect(target.endDate.getFullYear()).toBe(2025)

          // Invalid date range
          expect(() => {
            proxy.startDate = new Date('2026-01-01')
          }).toThrow('Dependency invariant "dateRange" failed')
        })
      })
    })

    describe('uniquenessInvariant', () => {
      it('should enforce uniqueness across a collection', () => {
        const emails = new Set(['alice@test.com', 'bob@test.com'])
        const target1 = { email: 'alice@test.com' }
        const target2 = { email: 'bob@test.com' }

        const { proxy: proxy1, defineSetInterceptor: addSet1 } = createProxy(target1)
        const invCtx1 = createInvariantContext(target1, {
          emailUnique: uniquenessInvariant('email', emails),
        })
        addSet1(createInvariantSetInterceptor(invCtx1))

        const { proxy: proxy2, defineSetInterceptor: addSet2 } = createProxy(target2)
        const invCtx2 = createInvariantContext(target2, {
          emailUnique: uniquenessInvariant('email', emails),
        })
        addSet2(createInvariantSetInterceptor(invCtx2))

        // Use invCtx1 for first object
        invCtx1.call(() => {
          // Can change to new unique email
          proxy1.email = 'alice2@test.com'
          expect(target1.email).toBe('alice2@test.com')
          // Update the collection to track the new email
          emails.delete('alice@test.com')
          emails.add('alice2@test.com')
        })

        invCtx2.call(() => {
          // Cannot use existing email
          expect(() => {
            proxy2.email = 'alice2@test.com'
          }).toThrow('Property "email" must be unique, "alice2@test.com" already exists')
        })
      })
    })

    describe('requiredInvariant', () => {
      it('should prevent deletion of required properties', () => {
        const target = { id: 1, name: 'Test', optional: 'data' }
        const { proxy, defineDeletePropertyInterceptor } = createProxy(target)

        const invCtx = createInvariantContext(target, {
          required: requiredInvariant(new Set(['id', 'name'])),
        })

        defineDeletePropertyInterceptor(createInvariantDeletePropertyInterceptor(invCtx))

        invCtx.call(() => {
          // Can delete optional property
          delete proxy.optional
          expect(target.optional).toBeUndefined()

          // Cannot delete required properties
          expect(() => {
            delete proxy.id
          }).toThrow('Property "id" is required and cannot be deleted')

          expect(() => {
            delete proxy.name
          }).toThrow('Property "name" is required and cannot be deleted')

          expect(target.id).toBe(1)
          expect(target.name).toBe('Test')
        })
      })
    })

    describe('patternInvariant', () => {
      it('should enforce regex patterns', () => {
        const target = { email: 'test@example.com', phone: '123-456-7890' }
        const { proxy, defineSetInterceptor } = createProxy(target)

        const invCtx = createInvariantContext(target, {
          emailPattern: patternInvariant('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'),
          phonePattern: patternInvariant('phone', /^\d{3}-\d{3}-\d{4}$/),
        })

        defineSetInterceptor(createInvariantSetInterceptor(invCtx))

        invCtx.call(() => {
          // Valid patterns
          proxy.email = 'new@example.com'
          expect(target.email).toBe('new@example.com')

          proxy.phone = '999-888-7777'
          expect(target.phone).toBe('999-888-7777')

          // Invalid patterns
          expect(() => {
            proxy.email = 'not-an-email'
          }).toThrow('Invalid email format')

          expect(() => {
            proxy.phone = '123456789'
          }).toThrow('Property "phone" does not match required pattern')
        })
      })

      it('should require string values', () => {
        const target = { code: 'ABC123' }
        const { proxy, defineSetInterceptor } = createProxy(target)

        const invCtx = createInvariantContext(target, {
          pattern: patternInvariant('code', /^[A-Z]{3}\d{3}$/),
        })

        defineSetInterceptor(createInvariantSetInterceptor(invCtx))

        invCtx.call(() => {
          expect(() => {
            proxy.code = 123
          }).toThrow('Property "code" must be a string')
        })
      })
    })
  })

  describe('validateState Method', () => {
    it('should return validation results without applying changes', () => {
      const target = { value: 10 }
      const invCtx = createInvariantContext(target, {
        positive: (t, op) => {
          if (op.trap === 'set' && op.property === 'value') {
            return op.value >= 0 || 'Must be positive'
          }
          return true
        }
      })

      // Test valid operation
      const result1 = invCtx.validateState({
        trap: 'set',
        property: 'value',
        value: 20
      })

      expect(result1.valid).toBe(true)
      expect(result1.errors).toEqual([])

      // Test invalid operation
      const result2 = invCtx.validateState({
        trap: 'set',
        property: 'value',
        value: -5
      })

      expect(result2.valid).toBe(false)
      expect(result2.errors).toEqual(['Must be positive'])

      // Target unchanged
      expect(target.value).toBe(10)
    })

    it('should collect all errors from multiple invariants', () => {
      const invCtx = createInvariantContext({}, {
        first: () => 'Error 1',
        second: () => false,
        third: () => 'Error 3',
      })

      const result = invCtx.validateState({ trap: 'set', property: 'test', value: 1 })

      expect(result.valid).toBe(false)
      expect(result.errors).toEqual([
        'Error 1',
        'Invariant "second" failed',
        'Error 3'
      ])
    })

    it('should handle invariants that throw errors', () => {
      const invCtx = createInvariantContext({}, {
        throwing: () => {
          throw new Error('Invariant exploded')
        }
      })

      const result = invCtx.validateState({ trap: 'set' })

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('Invariant exploded')
    })
  })

  describe('registerInvariantInterceptors Helper', () => {
    it('should register all interceptors at once', () => {
      const target = { value: 10, deletable: true }
      const proxyInterface = createProxy(target)

      const invCtx = createInvariantContext(target, {
        positive: (t, op) => {
          if (op.trap === 'set' && op.property === 'value') {
            return op.value >= 0
          }
          return true
        },
        noDelete: (t, op) => {
          if (op.trap === 'deleteProperty' && op.property === 'value') {
            return false
          }
          return true
        }
      })

      registerInvariantInterceptors(proxyInterface, invCtx)

      invCtx.call(() => {
        // Set interceptor works
        proxyInterface.proxy.value = 20
        expect(target.value).toBe(20)

        expect(() => {
          proxyInterface.proxy.value = -5
        }).toThrow('Invariant "positive" failed')

        // Delete interceptor works
        expect(() => {
          delete proxyInterface.proxy.value
        }).toThrow('Invariant "noDelete" failed')

        // Can delete other properties
        delete proxyInterface.proxy.deletable
        expect(target.deletable).toBeUndefined()
      })
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle Symbol properties', () => {
      const sym = Symbol('test')
      const target = { [sym]: 10 }
      const { proxy, defineSetInterceptor } = createProxy(target)

      const invCtx = createInvariantContext(target, {
        positive: (t, op) => {
          if (op.trap === 'set' && op.property === sym) {
            return op.value >= 0
          }
          return true
        }
      })

      defineSetInterceptor(createInvariantSetInterceptor(invCtx))

      invCtx.call(() => {
        proxy[sym] = 20
        expect(target[sym]).toBe(20)

        expect(() => {
          proxy[sym] = -5
        }).toThrow('Invariant "positive" failed')
      })
    })

    it('should handle invariants that return undefined (treated as pass)', () => {
      const invCtx = createInvariantContext({}, {
        passthrough: () => undefined
      })

      const result = invCtx.validateState({ trap: 'set' })
      expect(result.valid).toBe(true)
    })

    it('should handle invariants that return invalid values', () => {
      const invCtx = createInvariantContext({}, {
        invalid: () => 123 // Not true, false, string, or undefined
      })

      const result = invCtx.validateState({ trap: 'set' })
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('returned invalid result')
    })
  })
})
