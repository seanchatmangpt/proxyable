# Protocol & Call-Level Contracts - Quick Start Guide

## Basic Usage

```javascript
import { createProxy } from './src/proxy/create-proxy.js'
import {
  createContractContext,
  registerContractInterceptors
} from './src/contracts/contract-context.js'

// 1. Define your API
const api = {
  fetchUser: function fetchUser(userId) {
    return { id: userId, name: 'User' + userId }
  }
}

// 2. Create proxy
const { proxy } = createProxy(api.fetchUser)

// 3. Define contracts
const contractCtx = createContractContext(api, {
  fetchUser: {
    validate: (args) => args[0] && typeof args[0] === 'string',
    rateLimit: { calls: 100, window: 60_000 },
    returnType: 'object'
  }
})

// 4. Register interceptors
registerContractInterceptors({ proxy, defineApplyInterceptor, defineConstructInterceptor }, contractCtx)

// 5. Use with contract enforcement
contractCtx.call(() => {
  const user = proxy('user123')  // ✓ Enforces all contracts
  console.log(user)
})
```

## Available Contracts

### Argument Validation
```javascript
{
  validate: (args) => {
    if (!Array.isArray(args[0])) return 'First arg must be array'
    if (args.length > 3) return 'Max 3 arguments'
    return true
  },
  maxArgs: 3
}
```

### Call Sequencing
```javascript
{
  init: { sequence: ['init', 'process', 'close'] },
  process: { sequence: ['init', 'process', 'close'] },
  close: { sequence: ['init', 'process', 'close'] }
}
// Enforces: init() → process() → close()
```

### Rate Limiting
```javascript
{
  rateLimit: {
    calls: 10,      // Max calls
    window: 60_000  // Time window (ms)
  }
}
```

### Return Type Validation
```javascript
{
  returnType: 'object'  // 'string' | 'number' | 'boolean' | ...
}
```

### Purity Checking
```javascript
{
  pure: true  // No side effects allowed
}
```

## API Methods

```javascript
// Execute with contract enforcement
contractCtx.call(() => {
  proxy()
})

// Get sequence state
const state = contractCtx.getSequenceState()
// { callSequence: ['init', 'process'], totalCalls: 2 }

// Reset sequence
contractCtx.resetSequence()

// Get rate limit stats
const stats = contractCtx.getRateLimitStats('methodName')
// {
//   hasLimit: true,
//   maxCalls: 10,
//   currentCalls: 3,
//   remaining: 7,
//   nextReset: Date,
//   resetIn: 57000
// }

// Pre-validate without executing
const validation = contractCtx.validateCall('methodName', [arg1, arg2])
// { valid: true } or { valid: false, reason: 'error message' }

// Contract management
contractCtx.getContract('methodName')
contractCtx.setContract('methodName', { ... })
contractCtx.removeContract('methodName')
```

## Common Patterns

### API Endpoint
```javascript
{
  validate: (args) => args[0] && typeof args[0] === 'string',
  rateLimit: { calls: 100, window: 60_000 },
  returnType: 'object'
}
```

### Database Transaction
```javascript
{
  begin: { sequence: ['begin', 'query', 'commit'] },
  query: {
    sequence: ['begin', 'query', 'commit'],
    validate: (args) => typeof args[0] === 'string'
  },
  commit: { sequence: ['begin', 'query', 'commit'] }
}
```

### Pure Calculation
```javascript
{
  pure: true,
  validate: (args) => Array.isArray(args[0]),
  returnType: 'number'
}
```

## Error Messages

```javascript
// Validation
"Contract violation: First arg must be array"

// Sequence
"Contract violation: process requires init to be called first. Required sequence: [init → process → close]"

// Rate limit
"Contract violation: Rate limit exceeded for fetchData. Maximum 10 calls per 60000ms. Try again in 45s."

// Max args
"Contract violation: fetchData accepts maximum 1 arguments, got 2"

// Return type
"Contract violation: fetchData must return object, got string"

// Purity
"Contract violation: calculateSum is marked as pure but caused side effects"
```

## Important Notes

1. **Named Functions**: Use named function expressions for contracts to work:
   ```javascript
   // ✓ Good
   const myFunc = function myFunc() {}

   // ✗ Bad
   const myFunc = function() {}
   ```

2. **Context Required**: Contracts only enforced within `contractCtx.call()`

3. **Dry Run**: `validateCall()` doesn't execute or consume rate limit quota

4. **Composition**: Works with all Proxyable capabilities (ACL, invariants, etc.)

5. **Hard Failures**: All violations throw errors immediately

## Complete Example

See `/home/user/proxyable/examples/contract-context-example.js` for 7 comprehensive examples demonstrating all features.

## Testing

All 37 tests pass ✓

Run tests:
```bash
npm test -- test/contracts/contract-context.test.js
```
