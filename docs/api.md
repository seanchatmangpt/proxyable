# API Reference

## Overview

Proxyable exports a single main function `createProxy` that creates a JavaScript Proxy with interceptor support and isolated context management.

## `createProxy(target)`

Creates a new proxy object with support for registering interceptors.

### Parameters

- **`target`** (Object | Function): The object or function to wrap in a proxy

### Returns

An object with the following properties:

```typescript
{
  proxy: Proxy,
  context: ContextAPI,
  addInterceptor(trap: string, handler: Function): void,
  defineGetInterceptor(handler: Function): void,
  defineSetInterceptor(handler: Function): void,
  defineHasInterceptor(handler: Function): void,
  defineDeletePropertyInterceptor(handler: Function): void,
  defineOwnKeysInterceptor(handler: Function): void,
  defineGetOwnPropertyDescriptorInterceptor(handler: Function): void,
  defineApplyInterceptor(handler: Function): void,
  defineConstructInterceptor(handler: Function): void
}
```

### Example

```javascript
import { createProxy } from 'proxyable';

const target = { name: 'Alice', age: 25 };
const { proxy, addInterceptor } = createProxy(target);

// The proxy object that you interact with
console.log(proxy.name); // 'Alice'
```

## Return Object Properties

### `proxy`

The actual JavaScript Proxy object that wraps your target. Use this object for all interactions.

**Type:** `Proxy`

**Example:**
```javascript
const { proxy } = createProxy({ x: 10 });
console.log(proxy.x); // 10
proxy.y = 20; // Sets y on the target
```

### `context`

An object for managing the isolated execution context of this proxy. See [Context API](#context-api) below.

**Type:** `ContextAPI`

## Interceptor Methods

### `addInterceptor(trap, handler)`

Register an interceptor function for a specific trap. Multiple interceptors can be registered for the same trap, and they will be executed in order.

**Parameters:**

- **`trap`** (string): The trap name. One of: `'get'`, `'set'`, `'has'`, `'deleteProperty'`, `'ownKeys'`, `'getOwnPropertyDescriptor'`, `'apply'`, `'construct'`
- **`handler`** (Function): The interceptor function to execute

**Handler Signature by Trap Type:**

#### `'get'` Handler
```javascript
(target, prop, receiver) => value
```
Called when a property is accessed on the proxy.

#### `'set'` Handler
```javascript
(target, prop, value, receiver) => boolean
```
Called when a property is assigned on the proxy. Must return a boolean indicating success.

#### `'has'` Handler
```javascript
(target, prop) => boolean
```
Called when checking if a property exists (in operator).

#### `'deleteProperty'` Handler
```javascript
(target, prop) => boolean
```
Called when deleting a property. Must return a boolean indicating success.

#### `'ownKeys'` Handler
```javascript
(target) => array
```
Called when getting all own property keys. Returns an array of keys.

#### `'getOwnPropertyDescriptor'` Handler
```javascript
(target, prop) => descriptor
```
Called when getting a property descriptor.

#### `'apply'` Handler (Function Proxies)
```javascript
(target, thisArg, argumentsList) => result
```
Called when the proxy is invoked as a function.

#### `'construct'` Handler (Function Proxies)
```javascript
(target, argumentsList, newTarget) => object
```
Called when the proxy is used with the `new` operator.

**Example:**
```javascript
const { proxy, addInterceptor } = createProxy({});

// Add a get interceptor
addInterceptor('get', (target, prop) => {
  console.log(`Getting property: ${prop}`);
  return target[prop];
});

// Add a set interceptor
addInterceptor('set', (target, prop, value) => {
  console.log(`Setting ${prop} = ${value}`);
  target[prop] = value;
  return true;
});

console.log(proxy.message); // Logs: "Getting property: message"
proxy.message = 'Hello'; // Logs: "Setting message = Hello"
```

### Specialized Interceptor Methods

For convenience, Proxyable provides specialized methods for defining single interceptors:

- **`defineGetInterceptor(handler)`** - Shorthand for `addInterceptor('get', handler)`
- **`defineSetInterceptor(handler)`** - Shorthand for `addInterceptor('set', handler)`
- **`defineHasInterceptor(handler)`** - Shorthand for `addInterceptor('has', handler)`
- **`defineDeletePropertyInterceptor(handler)`** - Shorthand for `addInterceptor('deleteProperty', handler)`
- **`defineOwnKeysInterceptor(handler)`** - Shorthand for `addInterceptor('ownKeys', handler)`
- **`defineGetOwnPropertyDescriptorInterceptor(handler)`** - Shorthand for `addInterceptor('getOwnPropertyDescriptor', handler)`
- **`defineApplyInterceptor(handler)`** - Shorthand for `addInterceptor('apply', handler)`
- **`defineConstructInterceptor(handler)`** - Shorthand for `addInterceptor('construct', handler)`

**Example:**
```javascript
const { proxy, defineGetInterceptor, defineSetInterceptor } = createProxy({});

defineGetInterceptor((target, prop) => {
  return target[prop]?.toUpperCase?.();
});

defineSetInterceptor((target, prop, value) => {
  target[prop] = value?.toLowerCase?.();
  return true;
});
```

## Context API

The `context` object provides methods for managing the isolated execution context of a proxy.

### `context.use(callback)`

Execute a callback function within this proxy's isolated context.

**Parameters:**

- **`callback`** (Function): The function to execute

**Returns:** The return value of the callback

**Example:**
```javascript
const { context } = createProxy({});
const result = context.use(() => {
  return "Inside the proxy's context";
});
```

### `context.tryUse(callback)`

Safely execute a callback function within this proxy's isolated context. Returns undefined if an error occurs.

**Parameters:**

- **`callback`** (Function): The function to execute

**Returns:** The return value of the callback, or undefined if an error occurs

**Example:**
```javascript
const { context } = createProxy({});
const result = context.tryUse(() => {
  throw new Error('This error will be caught');
  return 'Not reached';
});
console.log(result); // undefined
```

### `context.call(thisArg, callback, ...args)`

Execute a callback with a specific `this` context within the proxy's isolated context.

**Parameters:**

- **`thisArg`** (any): The value to bind as `this`
- **`callback`** (Function): The function to execute
- **`...args`** (any[]): Arguments to pass to the callback

**Returns:** The return value of the callback

**Example:**
```javascript
const { context } = createProxy({});
const obj = { name: 'MyObject' };
context.call(obj, function() {
  console.log(this.name); // 'MyObject'
});
```

### `context.set(key, value)`

Set a value in the proxy's context that can be accessed later.

**Parameters:**

- **`key`** (string): The key to set
- **`value`** (any): The value to store

**Example:**
```javascript
const { context } = createProxy({});
context.set('userId', 123);
```

### `context.unset(key)`

Remove a value from the proxy's context.

**Parameters:**

- **`key`** (string): The key to remove

**Example:**
```javascript
const { context } = createProxy({});
context.unset('userId');
```

## Complete Example

```javascript
import { createProxy } from 'proxyable';

// Create a proxy for a user object
const user = { firstName: 'John', lastName: 'Doe', age: 30 };
const { proxy, defineGetInterceptor, defineSetInterceptor, context } = createProxy(user);

// Add a get interceptor to provide computed properties
defineGetInterceptor((target, prop) => {
  if (prop === 'fullName') {
    return `${target.firstName} ${target.lastName}`;
  }
  return target[prop];
});

// Add a set interceptor to validate age
defineSetInterceptor((target, prop, value) => {
  if (prop === 'age') {
    if (typeof value !== 'number' || value < 0) {
      throw new TypeError('Age must be a non-negative number');
    }
  }
  target[prop] = value;
  return true;
});

// Use the proxy
console.log(proxy.firstName); // 'John'
console.log(proxy.fullName); // 'John Doe' (computed)

proxy.age = 31; // Valid
console.log(proxy.age); // 31

try {
  proxy.age = -5; // Invalid
} catch (error) {
  console.error(error.message); // 'Age must be a non-negative number'
}

// Use context
context.set('currentUser', proxy);
const currentUser = context.call({}, () => {
  // The context variable is accessible here
  return 'Context accessed';
});
```

## Notes

- Interceptor handlers are called in the order they were registered
- If multiple interceptors are registered for the same trap, all will be executed
- The `target` parameter in interceptor handlers is always the original unwrapped object
- Context isolation is automatic and built-in - you don't need to manage it manually
- Proxies can also wrap functions for intercepting `apply` and `construct` operations
