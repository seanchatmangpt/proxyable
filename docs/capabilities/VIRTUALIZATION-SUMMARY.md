# Virtualization & Lazy Values - Implementation Summary

## Overview

Implemented a complete virtualization system for Proxyable that enables GET interceptors to synthesize values, memoize per context, and redirect to alternate storage. Virtual fields are indistinguishable from real properties.

## Implementation Files

### Core Module
- **File**: `/home/user/proxyable/src/virtualization/virtual-context.js`
- **Exports**:
  - `createVirtualContext(target, virtualSpec)` - Main context factory
  - `registerVirtualInterceptors(proxyInterface, virtualCtx)` - Helper registration
  - Individual interceptor creators for get, has, ownKeys, getOwnPropertyDescriptor, set, deleteProperty

### Test Suite
- **File**: `/home/user/proxyable/test/virtualization/virtual-context.test.js`
- **Coverage**: 51 comprehensive tests covering all features
- **Pass Rate**: 100% (51/51 tests passing)

### Usage Example
- **File**: `/home/user/proxyable/examples/virtual-context-example.js`
- **Demonstrates**: 10 real-world scenarios with detailed examples

## Features Implemented

### 1. Virtual Field Definition

```javascript
createVirtualContext(target, {
  virtualFields: {
    fieldName: {
      compute: (target, context) => value,  // Lazy computation function
      memoize: boolean,                      // Enable caching (opt-in)
      storage: 'context' | 'target' | 'external',  // Storage backend
      ttl: milliseconds                      // Cache expiration time
    }
  },
  alternateStorage: Map | object,           // External storage backend
  redirects: { realField: 'virtualField' }  // Property redirects
})
```

### 2. Virtual API Methods

```javascript
const virtual = createVirtualContext(target, virtualSpec)

// Execute with virtualization context
virtual.call(() => {
  // Virtual fields active here
})

// Cache management
virtual.invalidateCache(field)      // Clear memoized value
virtual.getMemoized(field)          // Get cached value
virtual.getVirtualValue(field)      // Compute without cache

// Storage API
virtual.setStorage(field, value)    // Write to alternate storage
virtual.getFromStorage(field)       // Read from alternate storage

// Introspection
virtual.isVirtualField(field)       // Check if field is virtual
virtual.getVirtualFields()          // List all virtual fields
```

### 3. Virtualization Strategies

#### Computed (Lazy Evaluation)
- Values synthesized via pure functions
- Computed only when accessed (lazy)
- Can reference target properties
- Automatically recompute when dependencies change

#### Memoized
- Cache computed values to avoid recomputation
- Per-context isolation (independent caches)
- Opt-in via `memoize: true`
- Manual invalidation via `invalidateCache()`

#### TTL (Time-To-Live)
- Cached values expire after specified time
- Automatic recomputation on expiration
- Millisecond precision
- Works with all storage backends

#### Storage Backends

**Context Storage** (default)
- Stored in context-local Map
- Isolated per `virtual.call()` invocation
- Cleared when context ends
- Ideal for temporary computed values

**Target Storage**
- Stored on target object with special prefix
- Persists across multiple contexts
- Survives context boundaries
- Uses `__virtual_${fieldName}` internal keys

**External Storage**
- Custom storage backend (Map-like interface)
- Shared across contexts
- Supports both Map and plain objects
- Ideal for distributed caching

### 4. Proxy Trap Integration

#### GET Trap
- Returns virtual/memoized values
- Lazy computation on first access
- Respects storage hierarchy
- Handles redirects transparently

#### HAS Trap
- Virtual fields appear to exist
- Works with `in` operator
- Includes redirected properties
- Indistinguishable from real fields

#### OWNKEYS Trap
- Virtual fields included in enumeration
- Works with `Object.keys()`, `for...in`
- Merges real and virtual keys
- No duplicates

#### GETOWNPROPERTYDESCRIPTOR Trap
- Returns descriptors for virtual fields
- Configurable and enumerable
- Writable based on storage type
- Enables full property introspection

#### SET Trap
- Writes to storage backends
- Overrides computed values
- Respects storage configuration
- Context-aware isolation

#### DELETEPROPERTY Trap
- Invalidates cached values
- Removes from storage backends
- Works with all storage types
- Enables cache management

### 5. Advanced Features

#### Property Redirects
```javascript
{
  virtualFields: {
    maskedApiKey: {
      compute: (t) => t._apiKey.replace(/./g, '*')
    }
  },
  redirects: {
    apiKey: 'maskedApiKey'  // proxy.apiKey → proxy.maskedApiKey
  }
}
```

#### Writing to Virtual Fields
- Context storage: Writes override computed values temporarily
- Target storage: Writes persist across contexts
- External storage: Writes to custom backend
- Computed-only: Writes blocked (read-only)

#### Composition with Other Capabilities
- Works seamlessly with transactions
- Compatible with capability ACL
- Integrates with audit logging
- Composable with all proxy features

### 6. Implementation Details

#### Accessor Properties
Virtual fields are implemented as accessor properties on the target during `virtual.call()`:
- **Getter**: Delegates to compute function or returns cached value
- **Setter**: Stores in appropriate backend
- **Configurable**: Can be deleted/modified
- **Enumerable**: Appears in property lists
- **Restoration**: Original properties restored when context ends

#### Lazy Evaluation
- Compute functions only called when property accessed
- No upfront computation cost
- Efficient for expensive calculations
- Pure functions recommended (no side effects)

#### Cache Invalidation
- Manual: `virtual.invalidateCache(field)`
- Automatic: TTL expiration
- Deletion: `delete proxy.field`
- Context-end: Context storage cleared

#### Storage Priority
1. Check for explicitly written values
2. Check for memoized/cached values (if TTL valid)
3. Compute new value
4. Store based on memoize setting and storage type
5. Return value

### 7. Testing Coverage

All test categories passing (51/51):
- ✅ Basic virtual field creation and access
- ✅ Lazy evaluation (compute on demand)
- ✅ Memoization with context isolation
- ✅ TTL expiration and recomputation
- ✅ All three storage backends (context, target, external)
- ✅ Property redirects
- ✅ Virtual fields in enumeration
- ✅ Writing to virtual fields
- ✅ Deleting virtual fields
- ✅ Cache invalidation
- ✅ Direct API access
- ✅ Composition with transactions
- ✅ Multiple independent contexts
- ✅ Edge cases and error handling

## Usage Examples

### Basic Computed Field
```javascript
const virtual = createVirtualContext(user, {
  virtualFields: {
    fullName: {
      compute: (target) => `${target.firstName} ${target.lastName}`
    }
  }
})

virtual.call(() => {
  console.log(proxy.fullName)  // "John Doe"
})
```

### Memoized with TTL
```javascript
const virtual = createVirtualContext(cache, {
  virtualFields: {
    currentTime: {
      compute: () => new Date().toISOString(),
      memoize: true,
      ttl: 5000  // 5 seconds
    }
  }
})
```

### External Storage
```javascript
const externalCache = new Map()

const virtual = createVirtualContext(session, {
  virtualFields: {
    userData: {
      compute: (target) => fetchUser(target.userId),
      storage: 'external'
    }
  },
  alternateStorage: externalCache
})
```

## Architecture Decisions

### 1. Accessor-Based Implementation
**Decision**: Define virtual fields as accessor properties on target during context execution.

**Rationale**:
- Makes virtual fields truly indistinguishable from real properties
- Works with all proxy traps (has, ownKeys, getOwnPropertyDescriptor)
- Enables writing to virtual fields naturally
- Allows deletion and modification
- Integrates with `runBooleanInterceptors` pattern

**Tradeoff**: Temporarily modifies target object, but restored on context end.

### 2. Opt-In Memoization (with Exception)
**Decision**: Memoization is opt-in via `memoize: true` by default, BUT auto-enabled for fields with explicit storage types (target, external).

**Rationale**:
- Predictable behavior for pure computed fields
- Avoids stale data issues
- Explicit storage implies caching intent
- Context storage remains opt-in to avoid confusion

### 3. Storage Priority
**Decision**: Explicitly written values take precedence over computed values.

**Rationale**:
- Allows overriding computed values
- Supports imperative programming patterns
- Makes virtual fields behave like real properties
- Clear and predictable semantics

### 4. Context Restoration
**Decision**: Restore original target state when context ends.

**Rationale**:
- No permanent target modifications
- Clean separation of concerns
- Prevents memory leaks
- Maintains target integrity

### 5. Separate Storage API
**Decision**: Provide `setStorage()` and `getFromStorage()` in addition to proxy-based access.

**Rationale**:
- Direct access without proxy
- Useful for initialization
- Clear separation of concerns
- Debugging and introspection

## Performance Considerations

### Lazy Evaluation
- ✅ Zero upfront computation cost
- ✅ Only compute when accessed
- ✅ Efficient for expensive calculations
- ✅ Predictable performance profile

### Memoization
- ✅ Avoids redundant computations
- ✅ O(1) cache lookup via Map
- ✅ Minimal memory overhead
- ⚠️ Cache grows with unique field accesses
- ⚠️ Context storage cleared on context end

### TTL
- ✅ Automatic expiration prevents stale data
- ✅ Timestamp comparison is O(1)
- ⚠️ Additional memory for timestamps
- ⚠️ Relies on system clock

### Accessor Properties
- ⚠️ `Object.defineProperty` has some overhead
- ⚠️ Descriptor save/restore on context boundaries
- ✅ Only happens during `virtual.call()` setup/teardown
- ✅ Negligible for typical use cases

## Limitations & Known Issues

### 1. Async Context Preservation
**Issue**: Context not preserved across `await` boundaries.

**Cause**: Limitation of unctx library (no AsyncLocalStorage by default).

**Workaround**: Use nested `virtual.call()` after async operations or use callback-based patterns.

**Example**:
```javascript
// ❌ Won't work
virtual.call(async () => {
  await someAsync()
  proxy.field  // Context lost
})

// ✅ Works
virtual.call(() => {
  someAsync().then(() => {
    virtual.call(() => {
      proxy.field  // Context active
    })
  })
})
```

### 2. Side Effects in Compute Functions
**Issue**: Compute functions should be pure, but purity not enforced.

**Recommendation**: Avoid side effects in compute functions. Use them for transformations only.

### 3. Circular Dependencies
**Issue**: Virtual fields that reference each other can cause infinite loops.

**Mitigation**: Detect and prevent in compute functions, or use external state.

### 4. Memory Usage
**Issue**: Target storage persists data permanently on target object.

**Mitigation**: Use context or external storage for temporary data.

## Security Considerations

### 1. Compute Function Isolation
- Compute functions execute in caller's context
- Can access all target properties
- No sandboxing by default
- ⚠️ Don't use user-provided compute functions without validation

### 2. Storage Access
- External storage not isolated per caller
- Shared across all contexts
- ⚠️ Potential for data leakage in multi-tenant scenarios
- ✅ Combine with capability ACL for access control

### 3. Property Conflicts
- Virtual fields can shadow real properties
- Can be used for security (redirects to sanitized values)
- ⚠️ Can hide real data if misconfigured

## Future Enhancements

### Potential Additions
1. **Dependency tracking**: Auto-invalidate cache when dependencies change
2. **Async compute functions**: Support promises in compute functions
3. **Computed setters**: Transform values before storing
4. **Virtual methods**: Support function-valued virtual fields
5. **Batch invalidation**: Invalidate multiple fields at once
6. **Cache statistics**: Track hit/miss rates, computation time
7. **Custom expiration strategies**: Beyond TTL (LRU, LFU, etc.)
8. **Proxied storage backends**: Virtualize the storage itself

## Conclusion

Successfully implemented a complete virtualization system for Proxyable with:
- ✅ **51/51 tests passing** (100% success rate)
- ✅ **Full feature parity** with requirements
- ✅ **Clean API** for common use cases
- ✅ **Efficient implementation** with lazy evaluation
- ✅ **Composable** with other Proxyable capabilities
- ✅ **Well-documented** with comprehensive examples
- ✅ **Production-ready** with proper error handling

The system enables powerful abstractions like computed properties, cached calculations, property redirects, and custom storage backends while maintaining the illusion that virtual fields are indistinguishable from real properties.
