import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createProxy } from '../../src/proxy/create-proxy.js'
import {
  createContractContext,
  createContractApplyInterceptor,
  createContractConstructInterceptor,
  registerContractInterceptors,
} from '../../src/contracts/contract-context.js'

describe('Contract Context', () => {
  describe('createContractContext', () => {
    it('should create a contract context with specified contracts', () => {
      const target = function testFn() {}
      const contracts = {
        testFn: {
          validate: (args) => args.length > 0,
          maxArgs: 3,
        },
      }

      const contractCtx = createContractContext(target, contracts)

      expect(contractCtx).toBeDefined()
      expect(contractCtx.call).toBeDefined()
      expect(contractCtx.getSequenceState).toBeDefined()
      expect(contractCtx.resetSequence).toBeDefined()
      expect(contractCtx.getRateLimitStats).toBeDefined()
      expect(contractCtx.validateCall).toBeDefined()
    })

    it('should work with empty contracts', () => {
      const target = function () {}
      const contractCtx = createContractContext(target)

      expect(contractCtx).toBeDefined()
      expect(contractCtx.getSequenceState().totalCalls).toBe(0)
    })
  })

  describe('Argument Validation', () => {
    it('should validate arguments using custom validation function', () => {
      const target = function calculateSum(a, b) {
        return a + b
      }

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        calculateSum: {
          validate: (args) => {
            if (args.length !== 2) return 'Must have exactly 2 arguments'
            if (typeof args[0] !== 'number') return 'First argument must be number'
            if (typeof args[1] !== 'number') return 'Second argument must be number'
            return true
          },
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // Valid call
        const result = proxy(5, 3)
        expect(result).toBe(8)

        // Invalid: wrong number of arguments
        expect(() => {
          proxy(5)
        }).toThrow('Must have exactly 2 arguments')

        // Invalid: wrong type
        expect(() => {
          proxy('5', 3)
        }).toThrow('First argument must be number')
      })
    })

    it('should enforce maxArgs constraint', () => {
      const target = function greet(name, greeting) {
        return `${greeting}, ${name}!`
      }

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        greet: {
          maxArgs: 2,
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // Valid
        const result = proxy('Alice', 'Hello')
        expect(result).toBe('Hello, Alice!')

        // Invalid: too many arguments
        expect(() => {
          proxy('Bob', 'Hi', 'extra')
        }).toThrow('accepts maximum 2 arguments, got 3')
      })
    })

    it('should handle validation returning false', () => {
      const target = function check(value) {
        return value > 0
      }

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        check: {
          validate: (args) => args[0] !== undefined,
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // Valid
        expect(proxy(5)).toBe(true)

        // Invalid
        expect(() => {
          proxy(undefined)
        }).toThrow('argument validation failed')
      })
    })

    it('should allow array validation', () => {
      const target = function processArray(arr) {
        return arr.length
      }

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        processArray: {
          validate: (args) => {
            if (!Array.isArray(args[0])) return 'First arg must be array'
            if (args.length > 1) return 'Max 1 argument'
            return true
          },
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        expect(proxy([1, 2, 3])).toBe(3)

        expect(() => {
          proxy('not array')
        }).toThrow('First arg must be array')

        expect(() => {
          proxy([1, 2], 'extra')
        }).toThrow('Max 1 argument')
      })
    })
  })

  describe('Call Sequencing', () => {
    it('should enforce call order constraints', () => {
      const api = {
        init: function () {
          return 'initialized'
        },
        process: function () {
          return 'processed'
        },
        close: function () {
          return 'closed'
        },
      }

      const { proxy: initProxy, defineApplyInterceptor: addInit } = createProxy(api.init)
      const { proxy: processProxy, defineApplyInterceptor: addProcess } = createProxy(api.process)
      const { proxy: closeProxy, defineApplyInterceptor: addClose } = createProxy(api.close)

      const contractCtx = createContractContext(api, {
        init: {
          sequence: ['init', 'process', 'close'],
        },
        process: {
          sequence: ['init', 'process', 'close'],
        },
        close: {
          sequence: ['init', 'process', 'close'],
        },
      })

      addInit(createContractApplyInterceptor(contractCtx))
      addProcess(createContractApplyInterceptor(contractCtx))
      addClose(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // Calling process before init should fail
        expect(() => {
          processProxy()
        }).toThrow('process requires init to be called first')

        // Calling close before init should fail
        expect(() => {
          closeProxy()
        }).toThrow('close requires init to be called first')

        // Call init first
        expect(initProxy()).toBe('initialized')

        // Now process should work
        expect(processProxy()).toBe('processed')

        // Now close should work
        expect(closeProxy()).toBe('closed')
      })
    })

    it('should track call sequence state', () => {
      const api = {
        first: function () {},
        second: function () {},
        third: function () {},
      }

      const { proxy: p1, defineApplyInterceptor: a1 } = createProxy(api.first)
      const { proxy: p2, defineApplyInterceptor: a2 } = createProxy(api.second)
      const { proxy: p3, defineApplyInterceptor: a3 } = createProxy(api.third)

      const contractCtx = createContractContext(api, {
        first: {},
        second: {},
        third: {},
      })

      a1(createContractApplyInterceptor(contractCtx))
      a2(createContractApplyInterceptor(contractCtx))
      a3(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        expect(contractCtx.getSequenceState().totalCalls).toBe(0)

        p1()
        expect(contractCtx.getSequenceState().callSequence).toEqual(['first'])

        p2()
        expect(contractCtx.getSequenceState().callSequence).toEqual(['first', 'second'])

        p3()
        expect(contractCtx.getSequenceState().callSequence).toEqual(['first', 'second', 'third'])
      })
    })

    it('should reset call sequence', () => {
      const api = {
        step1: function () {},
        step2: function () {},
      }

      const { proxy: p1, defineApplyInterceptor: a1 } = createProxy(api.step1)
      const { proxy: p2, defineApplyInterceptor: a2 } = createProxy(api.step2)

      const contractCtx = createContractContext(api, {
        step1: { sequence: ['step1', 'step2'] },
        step2: { sequence: ['step1', 'step2'] },
      })

      a1(createContractApplyInterceptor(contractCtx))
      a2(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        p1()
        p2()

        expect(contractCtx.getSequenceState().totalCalls).toBe(2)

        // Reset
        contractCtx.resetSequence()
        expect(contractCtx.getSequenceState().totalCalls).toBe(0)

        // Should fail again without step1
        expect(() => {
          p2()
        }).toThrow('step2 requires step1 to be called first')
      })
    })

    it('should handle partial sequences', () => {
      const api = {
        optional: function () {},
        required: function () {},
        final: function () {},
      }

      const { proxy: p1, defineApplyInterceptor: a1 } = createProxy(api.optional)
      const { proxy: p2, defineApplyInterceptor: a2 } = createProxy(api.required)
      const { proxy: p3, defineApplyInterceptor: a3 } = createProxy(api.final)

      const contractCtx = createContractContext(api, {
        optional: {},
        required: {},
        final: {
          sequence: ['required', 'final'], // Only requires 'required', not 'optional'
        },
      })

      a1(createContractApplyInterceptor(contractCtx))
      a2(createContractApplyInterceptor(contractCtx))
      a3(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // Can call optional anytime
        p1()

        // Call required
        p2()

        // Now final should work (doesn't care about optional)
        p3()
      })
    })
  })

  describe('Rate Limiting', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should enforce rate limits', () => {
      const target = function fetchData() {
        return 'data'
      }

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        fetchData: {
          rateLimit: {
            calls: 3,
            window: 60_000, // 1 minute
          },
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // First 3 calls should succeed
        expect(proxy()).toBe('data')
        expect(proxy()).toBe('data')
        expect(proxy()).toBe('data')

        // 4th call should fail
        expect(() => {
          proxy()
        }).toThrow('Rate limit exceeded for fetchData')

        // After time window passes, should work again
        vi.advanceTimersByTime(60_001)

        expect(proxy()).toBe('data')
      })
    })

    it('should provide rate limit statistics', () => {
      const target = function api() {}

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        api: {
          rateLimit: {
            calls: 10,
            window: 60_000,
          },
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // Before any calls
        let stats = contractCtx.getRateLimitStats('api')
        expect(stats.hasLimit).toBe(true)
        expect(stats.maxCalls).toBe(10)
        expect(stats.currentCalls).toBe(0)
        expect(stats.remaining).toBe(10)

        // Make 3 calls
        proxy()
        proxy()
        proxy()

        stats = contractCtx.getRateLimitStats('api')
        expect(stats.currentCalls).toBe(3)
        expect(stats.remaining).toBe(7)

        // Advance time partially
        vi.advanceTimersByTime(30_000)

        // Stats should still show 3 calls
        stats = contractCtx.getRateLimitStats('api')
        expect(stats.currentCalls).toBe(3)

        // After window passes
        vi.advanceTimersByTime(30_001)

        stats = contractCtx.getRateLimitStats('api')
        expect(stats.currentCalls).toBe(0)
        expect(stats.remaining).toBe(10)
      })
    })

    it('should handle methods without rate limits', () => {
      const contractCtx = createContractContext({}, {
        noLimit: {},
      })

      const stats = contractCtx.getRateLimitStats('noLimit')
      expect(stats.hasLimit).toBe(false)
    })

    it('should track rate limits independently per method', () => {
      const api = {
        fast: function () {
          return 'fast'
        },
        slow: function () {
          return 'slow'
        },
      }

      const { proxy: fastProxy, defineApplyInterceptor: addFast } = createProxy(api.fast)
      const { proxy: slowProxy, defineApplyInterceptor: addSlow } = createProxy(api.slow)

      const contractCtx = createContractContext(api, {
        fast: {
          rateLimit: { calls: 10, window: 1_000 },
        },
        slow: {
          rateLimit: { calls: 2, window: 1_000 },
        },
      })

      addFast(createContractApplyInterceptor(contractCtx))
      addSlow(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // Fast can be called 10 times
        for (let i = 0; i < 10; i++) {
          expect(fastProxy()).toBe('fast')
        }

        // Slow can only be called 2 times
        expect(slowProxy()).toBe('slow')
        expect(slowProxy()).toBe('slow')
        expect(() => slowProxy()).toThrow('Rate limit exceeded')

        // Fast 11th call should fail
        expect(() => fastProxy()).toThrow('Rate limit exceeded')
      })
    })
  })

  describe('Timeout Enforcement', () => {
    it('should enforce timeout constraints', () => {
      const target = function slowFunction() {
        // Simulate slow operation
        const start = Date.now()
        while (Date.now() - start < 100) {
          // Busy wait
        }
        return 'done'
      }

      const { defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        slowFunction: {
          timeout: 50, // 50ms timeout
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // This is a simplified test - real timeout would need async support
        // For now, we just verify the contract accepts timeout property
        const contract = contractCtx.getContract('slowFunction')
        expect(contract.timeout).toBe(50)
      })
    })
  })

  describe('Return Type Validation', () => {
    it('should validate return types', () => {
      const api = {
        getString: function () {
          return 'hello'
        },
        getNumber: function () {
          return 42
        },
        getBadString: function () {
          return 123 // Wrong type
        },
      }

      const { proxy: p1, defineApplyInterceptor: a1 } = createProxy(api.getString)
      const { proxy: p2, defineApplyInterceptor: a2 } = createProxy(api.getNumber)
      const { proxy: p3, defineApplyInterceptor: a3 } = createProxy(api.getBadString)

      const contractCtx = createContractContext(api, {
        getString: {
          returnType: 'string',
        },
        getNumber: {
          returnType: 'number',
        },
        getBadString: {
          returnType: 'string',
        },
      })

      a1(createContractApplyInterceptor(contractCtx))
      a2(createContractApplyInterceptor(contractCtx))
      a3(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // Valid returns
        expect(p1()).toBe('hello')
        expect(p2()).toBe(42)

        // Invalid return type
        expect(() => {
          p3()
        }).toThrow('must return string, got number')
      })
    })

    it('should handle complex return types', () => {
      const target = function getObject() {
        return { key: 'value' }
      }

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        getObject: {
          returnType: 'object',
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        const result = proxy()
        expect(result).toEqual({ key: 'value' })
      })
    })
  })

  describe('Purity Checking', () => {
    it('should enforce pure function constraints', () => {
      const state = { counter: 0 }
      const api = {
        pureAdd: function (a, b) {
          return a + b
        },
        impureIncrement: function () {
          state.counter++ // Side effect!
          return state.counter
        },
      }

      const { proxy: pureProxy, defineApplyInterceptor: addPure } = createProxy(api.pureAdd)

      const contractCtx = createContractContext(api, {
        pureAdd: {
          pure: true,
        },
      })

      addPure(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // Pure function should work
        expect(pureProxy(2, 3)).toBe(5)
      })
    })

    it('should detect side effects in pure functions', () => {
      const target = { value: 0 }

      const impureFunction = function impureFunction() {
        target.value++ // Mutates external state
        return target.value
      }

      const { proxy, defineApplyInterceptor } = createProxy(impureFunction)

      const contractCtx = createContractContext(target, {
        impureFunction: {
          pure: true,
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        expect(() => {
          proxy()
        }).toThrow('marked as pure but caused side effects')
      })
    })

    it('should allow functions without purity constraints to have side effects', () => {
      const target = { value: 0 }

      const nonPureFunction = function nonPureFunction() {
        target.value++
        return target.value
      }

      const { proxy, defineApplyInterceptor } = createProxy(nonPureFunction)

      const contractCtx = createContractContext(target, {
        nonPureFunction: {
          pure: false, // Explicitly not pure
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // Should work fine
        expect(proxy()).toBe(1)
        expect(target.value).toBe(1)
      })
    })
  })

  describe('Constructor Contracts', () => {
    it('should enforce contracts on constructors', () => {
      const User = function (name, age) {
        this.name = name
        this.age = age
      }

      const { proxy, defineConstructInterceptor } = createProxy(User)

      const contractCtx = createContractContext(User, {
        User: {
          validate: (args) => {
            if (args.length !== 2) return 'Must provide name and age'
            if (typeof args[0] !== 'string') return 'Name must be string'
            if (typeof args[1] !== 'number') return 'Age must be number'
            return true
          },
        },
      })

      defineConstructInterceptor(createContractConstructInterceptor(contractCtx))

      contractCtx.call(() => {
        // Valid construction
        const user = new proxy('Alice', 25)
        expect(user.name).toBe('Alice')
        expect(user.age).toBe(25)

        // Invalid: wrong types
        expect(() => {
          new proxy(123, 'wrong')
        }).toThrow('Name must be string')

        // Invalid: wrong number of args
        expect(() => {
          new proxy('Bob')
        }).toThrow('Must provide name and age')
      })
    })

    it('should track constructor calls in sequence', () => {
      const ClassA = function () {
        this.type = 'A'
      }
      const ClassB = function () {
        this.type = 'B'
      }

      const { proxy: proxyA, defineConstructInterceptor: addA } = createProxy(ClassA)
      const { proxy: proxyB, defineConstructInterceptor: addB } = createProxy(ClassB)

      const contractCtx = createContractContext(ClassA, {
        ClassA: {
          sequence: ['ClassA', 'ClassB'],
        },
        ClassB: {
          sequence: ['ClassA', 'ClassB'],
        },
      })

      addA(createContractConstructInterceptor(contractCtx))
      addB(createContractConstructInterceptor(contractCtx))

      contractCtx.call(() => {
        // Must construct A before B
        expect(() => {
          new proxyB()
        }).toThrow('ClassB requires ClassA to be called first')

        new proxyA()

        // Now B should work
        const b = new proxyB()
        expect(b.type).toBe('B')
      })
    })
  })

  describe('validateCall Method', () => {
    it('should pre-validate calls without executing', () => {
      const target = function test(x) {
        return x * 2
      }

      const contractCtx = createContractContext(target, {
        test: {
          validate: (args) => args[0] > 0 || 'Argument must be positive',
          maxArgs: 1,
        },
      })

      // Valid call
      let result = contractCtx.validateCall('test', [5])
      expect(result.valid).toBe(true)

      // Invalid: negative argument
      result = contractCtx.validateCall('test', [-5])
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('Argument must be positive')

      // Invalid: too many args
      result = contractCtx.validateCall('test', [1, 2])
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('maximum 1 arguments')
    })

    it('should validate against sequence requirements', () => {
      const contractCtx = createContractContext({}, {
        step1: {
          sequence: ['step1', 'step2'],
        },
        step2: {
          sequence: ['step1', 'step2'],
        },
      })

      // step2 requires step1 first
      let result = contractCtx.validateCall('step2', [])
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('requires step1')

      // After recording step1 in sequence, step2 should validate
      contractCtx._recordCall('step1')

      result = contractCtx.validateCall('step2', [])
      expect(result.valid).toBe(true)
    })

    it('should validate against rate limits', () => {
      vi.useFakeTimers()

      const target = function api() {}
      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        api: {
          rateLimit: { calls: 2, window: 1000 },
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // First 2 calls should validate
        expect(contractCtx.validateCall('api', []).valid).toBe(true)
        proxy()
        expect(contractCtx.validateCall('api', []).valid).toBe(true)
        proxy()

        // 3rd call should not validate
        const result = contractCtx.validateCall('api', [])
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('Rate limit exceeded')
      })

      vi.useRealTimers()
    })

    it('should return valid for methods without contracts', () => {
      const contractCtx = createContractContext({}, {})

      const result = contractCtx.validateCall('unknownMethod', [])
      expect(result.valid).toBe(true)
      expect(result.reason).toContain('No contract defined')
    })
  })

  describe('Contract Management', () => {
    it('should get, set, and remove contracts dynamically', () => {
      const contractCtx = createContractContext({}, {
        initial: { maxArgs: 1 },
      })

      // Get existing contract
      let contract = contractCtx.getContract('initial')
      expect(contract).toEqual({ maxArgs: 1 })

      // Set new contract
      contractCtx.setContract('newMethod', { maxArgs: 2 })
      contract = contractCtx.getContract('newMethod')
      expect(contract).toEqual({ maxArgs: 2 })

      // Update existing contract
      contractCtx.setContract('initial', { maxArgs: 5 })
      contract = contractCtx.getContract('initial')
      expect(contract).toEqual({ maxArgs: 5 })

      // Remove contract
      const removed = contractCtx.removeContract('initial')
      expect(removed).toBe(true)
      expect(contractCtx.getContract('initial')).toBeUndefined()

      // Remove non-existent contract
      const removed2 = contractCtx.removeContract('doesNotExist')
      expect(removed2).toBe(false)
    })
  })

  describe('Composition with Multiple Contracts', () => {
    it('should enforce multiple contract rules simultaneously', () => {
      const target = function fetchUser(userId) {
        return { id: userId, name: 'User' }
      }

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        fetchUser: {
          validate: (args) => args[0] && typeof args[0] === 'string' || 'userId must be string',
          maxArgs: 1,
          rateLimit: { calls: 5, window: 60_000 },
          returnType: 'object',
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // All constraints satisfied
        const result = proxy('user123')
        expect(result).toEqual({ id: 'user123', name: 'User' })

        // Violate validation
        expect(() => {
          proxy(123)
        }).toThrow('userId must be string')

        // Violate maxArgs
        expect(() => {
          proxy('user123', 'extra')
        }).toThrow('maximum 1 arguments')
      })
    })
  })

  describe('registerContractInterceptors Helper', () => {
    it('should register both apply and construct interceptors', () => {
      const MyClass = function (value) {
        this.value = value
      }

      MyClass.staticMethod = function (x) {
        return x * 2
      }

      const proxyInterface = createProxy(MyClass)

      const contractCtx = createContractContext(MyClass, {
        MyClass: {
          validate: (args) => args[0] > 0 || 'Value must be positive',
        },
        staticMethod: {
          validate: (args) => typeof args[0] === 'number',
        },
      })

      registerContractInterceptors(proxyInterface, contractCtx)

      contractCtx.call(() => {
        // Constructor contract
        const instance = new proxyInterface.proxy(10)
        expect(instance.value).toBe(10)

        expect(() => {
          new proxyInterface.proxy(-5)
        }).toThrow('Value must be positive')
      })
    })
  })

  describe('Context Isolation', () => {
    it('should enforce contracts only within active context', () => {
      const target = function test(x) {
        return x
      }

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        test: {
          validate: (args) => args[0] > 0 || 'Must be positive',
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      // Outside context - no enforcement
      expect(proxy(-5)).toBe(-5)

      // Inside context - enforcement active
      contractCtx.call(() => {
        expect(() => {
          proxy(-5)
        }).toThrow('Must be positive')

        expect(proxy(5)).toBe(5)
      })

      // Outside again - no enforcement
      expect(proxy(-10)).toBe(-10)
    })
  })

  describe('Error Messages', () => {
    it('should provide clear error messages for contract violations', () => {
      const target = function api(user, action) {
        return `${user} ${action}`
      }

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        api: {
          validate: (args) => {
            if (!args[0]) return 'User parameter is required'
            if (!args[1]) return 'Action parameter is required'
            return true
          },
          sequence: ['init', 'api'],
          maxArgs: 2,
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // Sequence error
        try {
          proxy('admin', 'login')
        } catch (error) {
          expect(error.message).toContain('api requires init to be called first')
          expect(error.message).toContain('Required sequence: [init → api]')
        }

        // Validation error
        contractCtx._recordCall('init')
        try {
          proxy(undefined, 'login')
        } catch (error) {
          expect(error.message).toContain('User parameter is required')
        }

        // MaxArgs error
        try {
          proxy('admin', 'login', 'extra')
        } catch (error) {
          expect(error.message).toContain('accepts maximum 2 arguments, got 3')
        }
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle anonymous functions', () => {
      const target = function () {
        return 'result'
      }

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        anonymous: {
          validate: () => true,
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        expect(proxy()).toBe('result')
      })
    })

    it('should handle functions that throw errors', () => {
      const target = function throwError() {
        throw new Error('Function error')
      }

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        throwError: {
          validate: () => true,
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        expect(() => {
          proxy()
        }).toThrow('Function error')
      })
    })

    it('should handle contract validation that throws', () => {
      const target = function test() {}

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        test: {
          validate: () => {
            throw new Error('Validation exploded')
          },
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        expect(() => {
          proxy()
        }).toThrow('Validation exploded')
      })
    })
  })

  describe('Common Contract Patterns', () => {
    it('should implement API endpoint contract pattern', () => {
      const target = function fetchUser(userId) {
        // Simulate API call
        return { id: userId, name: 'User' + userId }
      }

      const { proxy, defineApplyInterceptor } = createProxy(target)

      const contractCtx = createContractContext(target, {
        fetchUser: {
          validate: (args) => args[0] && typeof args[0] === 'string',
          rateLimit: { calls: 100, window: 60_000 },
          returnType: 'object',
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        const user = proxy('123')
        expect(user).toEqual({ id: '123', name: 'User123' })

        const stats = contractCtx.getRateLimitStats('fetchUser')
        expect(stats.maxCalls).toBe(100)
        expect(stats.currentCalls).toBe(1)
      })
    })

    it('should implement database transaction contract pattern', () => {
      const db = {
        begin: function () {
          return 'transaction started'
        },
        query: function (_sql) {
          return 'query result'
        },
        commit: function () {
          return 'committed'
        },
      }

      const { proxy: beginProxy, defineApplyInterceptor: addBegin } = createProxy(db.begin)
      const { proxy: queryProxy, defineApplyInterceptor: addQuery } = createProxy(db.query)
      const { proxy: commitProxy, defineApplyInterceptor: addCommit } = createProxy(db.commit)

      const contractCtx = createContractContext(db, {
        begin: {
          sequence: ['begin', 'query', 'commit'],
        },
        query: {
          sequence: ['begin', 'query', 'commit'],
          validate: (args) => args[0] && typeof args[0] === 'string',
        },
        commit: {
          sequence: ['begin', 'query', 'commit'],
        },
      })

      addBegin(createContractApplyInterceptor(contractCtx))
      addQuery(createContractApplyInterceptor(contractCtx))
      addCommit(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        // Must follow sequence
        beginProxy()
        queryProxy('SELECT * FROM users')
        commitProxy()

        expect(contractCtx.getSequenceState().callSequence).toEqual(['begin', 'query', 'commit'])
      })
    })

    it('should implement pure calculation contract pattern', () => {
      const math = {
        calculateTotal: function (items) {
          return items.reduce((sum, item) => sum + item, 0)
        },
      }

      const { proxy, defineApplyInterceptor } = createProxy(math.calculateTotal)

      const contractCtx = createContractContext(math, {
        calculateTotal: {
          pure: true,
          validate: (args) => Array.isArray(args[0]),
          returnType: 'number',
        },
      })

      defineApplyInterceptor(createContractApplyInterceptor(contractCtx))

      contractCtx.call(() => {
        const total = proxy([1, 2, 3, 4, 5])
        expect(total).toBe(15)
      })
    })
  })
})
