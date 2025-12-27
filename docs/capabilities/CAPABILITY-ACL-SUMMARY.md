# Capability-Based Access Control Implementation

## Overview

A comprehensive capability-based access control layer has been implemented for the Proxyable framework. This implementation follows security-first principles:

- **Fail-closed**: All operations are denied by default unless explicitly granted
- **Possession-based**: Having the capability context = having the authority
- **Context-local**: All permissions are tied to execution context with no global state
- **Composable**: Works seamlessly with other interceptors without interference

## Files Created

### 1. Core Implementation
**Location**: `/home/user/proxyable/src/security/capability-acl.js`

This module provides:
- `createCapabilityContext(target, capabilities)` - Creates a capability context
- Individual interceptor creators for all 8 proxy traps:
  - `createGetInterceptor` - Read access control
  - `createSetInterceptor` - Write access control
  - `createHasInterceptor` - Property visibility control
  - `createDeletePropertyInterceptor` - Deletion control
  - `createOwnKeysInterceptor` - Key enumeration filtering
  - `createGetOwnPropertyDescriptorInterceptor` - Descriptor access control
  - `createApplyInterceptor` - Function execution control
  - `createConstructInterceptor` - Construction control
- `registerCapabilityInterceptors(proxyInterface, capabilityContext)` - Helper to register all interceptors at once

### 2. Comprehensive Test Suite
**Location**: `/home/user/proxyable/test/security/capability-acl.test.js`

36 comprehensive tests covering:
- Basic read/write/delete capabilities
- Function-based capability predicates
- Set-based capability specifications
- Context isolation and no global leakage
- Composition with other interceptors
- Edge cases (Symbols, nested contexts, etc.)
- Fail-closed security validation
- All 8 proxy traps

**Test Results**: ✅ All 36 tests passing

### 3. Usage Examples
**Location**: `/home/user/proxyable/examples/capability-security-example.js`

7 detailed examples demonstrating:
1. Basic read/write capabilities
2. Multiple isolated contexts with different permissions
3. Function-based dynamic capabilities
4. Function application control
5. Constructor control
6. Composition with logging interceptors
7. Context isolation demonstration

## Capability Structure

```javascript
{
  canRead: Set<string|symbol> | Function,    // Properties that can be read
  canWrite: Set<string|symbol> | Function,   // Properties that can be written
  canDelete: Set<string|symbol> | Function,  // Properties that can be deleted
  canApply: boolean | Function,              // Whether function can be called
  canConstruct: boolean | Function           // Whether constructor can be used
}
```

## Minimal Usage Example

```javascript
import { createProxy } from './src/proxy/create-proxy.js'
import { createCapabilityContext, registerCapabilityInterceptors } from './src/security/capability-acl.js'

// Create a proxy
const target = { secret: 'hidden', public: 'visible' }
const proxyInterface = createProxy(target)

// Create capability context (read-only access to 'public')
const capCtx = createCapabilityContext(target, {
  canRead: new Set(['public']),
  canWrite: new Set(),  // No write access
})

// Register interceptors
registerCapabilityInterceptors(proxyInterface, capCtx)

// Use within capability context
capCtx.call(() => {
  console.log(proxyInterface.proxy.public)  // ✓ Allowed: "visible"
  console.log(proxyInterface.proxy.secret)  // ✗ Throws: "Access denied: No read capability"
})

// Outside context
console.log(proxyInterface.proxy.public)  // ✗ Throws: "No capability context"
```

## Key Features

### 1. Fail-Closed Security
Operations are denied by default unless capabilities explicitly grant them:

```javascript
const capCtx = createCapabilityContext(target, {
  // Empty capabilities = deny all
})
capCtx.call(() => {
  proxy.anything  // ✗ Denied
})
```

### 2. Context Isolation
Multiple contexts can have different permissions without interference:

```javascript
const adminCtx = createCapabilityContext(target, {
  canRead: new Set(['secret', 'public']),
  canWrite: new Set(['secret', 'public']),
})

const userCtx = createCapabilityContext(target, {
  canRead: new Set(['public']),
  canWrite: new Set(),
})

// Different permissions in different contexts
adminCtx.call(() => { /* full access */ })
userCtx.call(() => { /* read-only access */ })
```

### 3. Function-Based Dynamic Capabilities
Capabilities can use predicates for dynamic permission checking:

```javascript
const capCtx = createCapabilityContext(target, {
  canRead: (key) => String(key).startsWith('public_'),
  canWrite: (key) => String(key).endsWith('_writable'),
})
```

### 4. Composition
Works seamlessly with other interceptors:

```javascript
// Add logging interceptor
proxyInterface.defineGetInterceptor((target, prop) => {
  console.log(`Accessing: ${prop}`)
  return undefined  // Continue to capability check
})

// Add capability interceptor
registerCapabilityInterceptors(proxyInterface, capCtx)

// Both interceptors work together
```

## Implementation Details

### Interceptor Behavior

All interceptors follow a consistent pattern:

1. **Check context**: Verify capability context is active
2. **Check permission**: Verify specific capability is granted
3. **Return appropriately**:
   - For get/apply/construct: Throw error if denied, return undefined if allowed
   - For set/has/deleteProperty: Return false if denied, undefined if allowed
   - For ownKeys: Return filtered array
   - For getOwnPropertyDescriptor: Return undefined if denied, undefined if allowed

### Composition Contract

Interceptors return:
- `undefined` to allow the operation to continue to the next interceptor or fallback
- `false` (for boolean traps) to deny the operation
- Throw error (for non-boolean traps) to deny the operation
- Definitive value (for get/ownKeys) to provide the result

This ensures capability interceptors can be layered with other security or functionality interceptors.

## Security Properties

1. **No global state**: All capabilities stored in isolated execution contexts
2. **No capability escalation**: Can't access capabilities without the context
3. **No wrapper proliferation**: Uses existing proxy infrastructure
4. **Defense in depth**: Multiple traps enforce the same security policy
5. **Fail-safe**: Errors in capability checks result in denial, not grant

## Testing

Run tests:
```bash
npx vitest run test/security/capability-acl.test.js
```

Run example:
```bash
node examples/capability-security-example.js
```

## Future Enhancements

Potential areas for extension:
- Capability delegation (sharing capabilities with limited scope)
- Time-bound capabilities (automatic expiration)
- Audit logging integration
- Capability revocation
- Capability combination operators (union, intersection)
