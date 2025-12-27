# Invariant Enforcement System

## Overview

The Invariant Enforcement System is a powerful mechanism for protecting state integrity and preventing illegal state transitions in the Proxyable library. It provides fail-closed validation that checks invariants **before** state changes are applied, ensuring data consistency and business rule compliance.

## Core Principles

1. **Fail Closed**: Operations are denied unless all invariants pass
2. **Pre-mutation Checking**: Invariants are validated BEFORE changes are applied
3. **Composition**: Works seamlessly with ACL > Invariants > Transactions
4. **Context-Bound**: Invariants are tied to execution context
5. **Deterministic**: Same input = same result (no side effects in invariant functions)
6. **Short-Circuit**: Stops on first failure for efficiency

## Architecture

### Composition Stack

```
┌─────────────────────────────────────┐
│  ACL (Access Control Layer)         │  ← Who can access what?
├─────────────────────────────────────┤
│  Invariants (Validation Layer)      │  ← What values are valid?
├─────────────────────────────────────┤
│  Transactions (Journaling Layer)    │  ← Record/rollback changes
└─────────────────────────────────────┘
```

### Execution Flow

1. **ACL Check**: Does the capability context allow this operation?
2. **Invariant Check**: Do all invariants pass for this operation?
3. **Transaction Journal**: Record the operation for commit/rollback
4. **Apply**: Execute the actual state change via Reflect

If any layer fails, the operation is rejected and subsequent layers are not reached.

## API Reference

### Core Functions

#### `createInvariantContext(target, invariants)`

Creates an invariant context with specified invariants.

**Parameters:**
- `target` (object): The target object (for reference)
- `invariants` (object|array): Invariant specifications
  - Object: `{ name: invariantFn, ... }`
  - Array: `[invariantFn, ...]`

**Returns:** Invariant context object with:
- `addInvariant(name, fn)`: Add invariant dynamically
- `removeInvariant(name)`: Remove invariant
- `getInvariants()`: List all invariants
- `validateState(operation)`: Check if operation is valid
- `call(fn)`: Execute with enforcement

**Example:**
```javascript
const invCtx = createInvariantContext(target, {
  positive: (t, op) => op.value >= 0 || 'Must be positive'
})
```

### Invariant Functions

Invariant functions receive `(target, operation)` and return:
- `true` or `undefined`: Invariant passes
- `false`: Invariant fails (generic error)
- `string`: Invariant fails (custom error message)

**Operation Object:**
```javascript
{
  trap: 'set' | 'deleteProperty' | 'apply' | 'construct',
  property: propertyKey,  // for set/deleteProperty
  value: any,             // for set
  args: Array,            // for apply/construct
  thisArg: any,           // for apply
  newTarget: Function,    // for construct
  receiver: Proxy,        // for set
  target: Object          // original target
}
```

### Interceptor Creation

#### `createInvariantSetInterceptor(invCtx)`
Creates interceptor for property set operations.

#### `createInvariantDeletePropertyInterceptor(invCtx)`
Creates interceptor for property deletion operations.

#### `createInvariantApplyInterceptor(invCtx)`
Creates interceptor for function application.

#### `createInvariantConstructInterceptor(invCtx)`
Creates interceptor for constructor calls.

#### `registerInvariantInterceptors(proxyInterface, invCtx)`
Registers all interceptors at once (recommended).

## Common Invariant Patterns

### Type Checking

```javascript
typeInvariant('age', Number)
typeInvariant('name', String)
typeInvariant('active', Boolean)
```

Ensures properties match specific types.

### Range Validation

```javascript
rangeInvariant('age', 0, 150)
rangeInvariant('temperature', -273.15, Infinity)
```

Validates numeric properties are within bounds.

### Immutability

```javascript
immutableInvariant(new Set(['id', 'createdAt']))
```

Prevents modification or deletion of specified properties after initial set.

### Dependency Constraints

```javascript
dependencyInvariant('valueInRange', (obj) => {
  return obj.value >= obj.min && obj.value <= obj.max
})
```

Validates complex business rules involving multiple properties.

### Required Fields

```javascript
requiredInvariant(new Set(['id', 'name', 'email']))
```

Prevents deletion of required properties.

### Pattern Matching

```javascript
patternInvariant('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email')
patternInvariant('phone', /^\d{3}-\d{3}-\d{4}$/)
```

Validates string properties against regex patterns.

### Uniqueness

```javascript
const emails = new Set()
uniquenessInvariant('email', emails)
```

Ensures property values are unique across a collection.

## Usage Examples

### Basic Enforcement

```javascript
import { createProxy } from 'proxyable'
import { createInvariantContext, createInvariantSetInterceptor } from 'proxyable'

const account = { balance: 1000 }
const { proxy, defineSetInterceptor } = createProxy(account)

const invCtx = createInvariantContext(account, {
  positiveBalance: (t, op) => {
    if (op.trap === 'set' && op.property === 'balance') {
      return op.value >= 0 || 'Balance cannot be negative'
    }
    return true
  }
})

defineSetInterceptor(createInvariantSetInterceptor(invCtx))

invCtx.call(() => {
  proxy.balance = 500   // ✓ Valid
  proxy.balance = -100  // ✗ Throws: Balance cannot be negative
})
```

### Multiple Invariants

```javascript
const invCtx = createInvariantContext(user, {
  agePositive: rangeInvariant('age', 0, 150),
  ageInteger: (t, op) => {
    if (op.trap === 'set' && op.property === 'age') {
      return Number.isInteger(op.value) || 'Age must be integer'
    }
    return true
  },
  nameNotEmpty: (t, op) => {
    if (op.trap === 'set' && op.property === 'name') {
      return op.value.length > 0 || 'Name cannot be empty'
    }
    return true
  }
})
```

All invariants must pass for an operation to succeed.

### Dynamic Management

```javascript
// Start without invariants
const invCtx = createInvariantContext(config)

// Add invariant at runtime
invCtx.addInvariant('positive', (t, op) => {
  return op.value >= 0 || 'Must be positive'
})

// Remove when no longer needed
invCtx.removeInvariant('positive')

// List current invariants
const invariants = invCtx.getInvariants()
```

### Dry Run Validation

```javascript
// Test operation without applying it
const result = invCtx.validateState({
  trap: 'set',
  property: 'price',
  value: -50
})

if (!result.valid) {
  console.log('Errors:', result.errors)
  // ['Price must be positive']
}
```

### Composition with ACL and Transactions

```javascript
import { createCapabilityContext, registerCapabilityInterceptors } from 'proxyable'
import { createTransactionContext, registerTransactionInterceptors } from 'proxyable'

const proxyInterface = createProxy(account)

// Layer 1: ACL
const acl = createCapabilityContext(account, {
  canRead: new Set(['balance']),
  canWrite: new Set(['balance'])
})

// Layer 2: Invariants
const invariants = createInvariantContext(account, {
  positiveBalance: rangeInvariant('balance', 0, Infinity)
})

// Layer 3: Transactions
const transaction = createTransactionContext(account)

// Register in order: ACL > Invariants > Transactions
registerCapabilityInterceptors(proxyInterface, acl)
registerInvariantInterceptors(proxyInterface, invariants)
registerTransactionInterceptors(proxyInterface, transaction)

// All layers active
acl.call(() => {
  invariants.call(() => {
    transaction.call(() => {
      proxyInterface.proxy.balance = 500  // ✓ Passes all layers
      proxyInterface.proxy.balance = -100 // ✗ Fails invariant check

      transaction.rollback() // Rollback to initial state
    })
  })
})
```

## Design Patterns

### Fail-Closed Security

Invariants implement fail-closed security: an operation is denied unless it explicitly passes all validation rules.

```javascript
// By default, no operations allowed
const invCtx = createInvariantContext(target)

// Explicitly allow specific operations
invCtx.addInvariant('allowPositive', (t, op) => {
  return op.value >= 0  // Only allow positive values
})
```

### Deterministic Validation

Invariant functions must be pure (no side effects) and deterministic:

```javascript
// ✓ Good: Pure, deterministic
const goodInvariant = (t, op) => {
  return op.value >= 0
}

// ✗ Bad: Side effects (logging, mutation)
const badInvariant = (t, op) => {
  console.log('Checking...') // Side effect!
  t.checkCount++             // Side effect!
  return op.value >= 0
}
```

### Context Isolation

Each invariant context is isolated and can have different rules:

```javascript
// Context A: strict validation
const strictCtx = createInvariantContext(obj, {
  strict: rangeInvariant('value', 0, 100)
})

// Context B: permissive validation
const permissiveCtx = createInvariantContext(obj, {
  permissive: rangeInvariant('value', -1000, 1000)
})

// Use different contexts for different scenarios
strictCtx.call(() => { /* strict rules */ })
permissiveCtx.call(() => { /* permissive rules */ })
```

## Testing

The invariant system includes comprehensive tests covering:

- ✓ Basic invariant enforcement
- ✓ Multiple invariants (all must pass)
- ✓ Short-circuit on first failure
- ✓ Custom error messages
- ✓ Dynamic invariant addition/removal
- ✓ Composition with ACL and Transactions
- ✓ Context isolation
- ✓ All common patterns (type, range, immutable, etc.)
- ✓ Edge cases (Symbols, undefined returns, etc.)

Run tests:
```bash
npm test -- test/invariants/invariant-context.test.js
```

## Files

### Implementation
- `/home/user/proxyable/src/invariants/invariant-context.js` - Core implementation

### Tests
- `/home/user/proxyable/test/invariants/invariant-context.test.js` - Comprehensive test suite (38 tests)

### Examples
- `/home/user/proxyable/examples/invariant-enforcement-example.js` - 11 practical examples

## Performance Considerations

1. **Invariant Complexity**: Keep invariant functions simple and fast
2. **Number of Invariants**: Each invariant is checked on every operation
3. **Short-Circuit**: Failed invariants stop checking immediately
4. **Context Overhead**: Minimal - uses unctx for efficient context management

## Best Practices

1. **Keep Invariants Pure**: No side effects, deterministic results
2. **Use Common Patterns**: Leverage built-in helpers (typeInvariant, rangeInvariant, etc.)
3. **Name Invariants**: Use descriptive names for better error messages
4. **Compose Carefully**: Register interceptors in correct order (ACL > Invariants > Transactions)
5. **Validate Early**: Use `validateState()` for dry-run validation before applying
6. **Context Scope**: Only activate invariants when needed via `call()`

## Limitations

1. **Atomic Operations**: Each property set is validated independently
2. **Multi-Property Constraints**: Use `dependencyInvariant` but be aware of ordering
3. **Async Validation**: Invariants must be synchronous
4. **Performance**: Many complex invariants may impact performance

## Future Enhancements

Potential improvements:
- Async invariant support
- Batch validation (multiple operations)
- Invariant dependencies/ordering
- Performance optimizations (caching, lazy evaluation)
- Schema-based validation integration

## License

Part of the Proxyable library - MIT License
