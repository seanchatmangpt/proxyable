# Introduction to Proxyable

## What is Proxyable?

Proxyable is a library that simplifies creating JavaScript Proxies with **isolated context-based interception**. It provides a clean, type-safe API for dynamically intercepting and modifying object operations without the complexity of managing multiple proxy instances and context isolation manually.

## Key Concepts

### Proxies
JavaScript Proxies are a meta-programming feature that allows you to intercept and customize operations performed on objects. Proxyable wraps the native Proxy API to make it more ergonomic and powerful.

### Interceptors
An interceptor is a function that responds to a specific operation on a proxied object. For example, a "get interceptor" runs whenever a property is accessed on the proxy, and can modify the returned value.

### Isolated Contexts
Each proxy created with Proxyable has its own isolated context (powered by `unctx`). This means you can have multiple proxy instances without their interceptors interfering with each other.

## Why Use Proxyable?

### 1. **Simpler API**
Instead of writing complex proxy handler objects, you register interceptor functions:

```javascript
// Without Proxyable (raw JavaScript)
const proxy = new Proxy(target, {
  get(target, prop) {
    console.log(`Getting ${prop}`);
    return target[prop];
  },
  set(target, prop, value) {
    console.log(`Setting ${prop} to ${value}`);
    target[prop] = value;
    return true;
  }
});

// With Proxyable
const { proxy, addInterceptor } = createProxy(target);
addInterceptor('get', (target, prop) => {
  console.log(`Getting ${prop}`);
  return target[prop];
});
addInterceptor('set', (target, prop, value) => {
  console.log(`Setting ${prop} to ${value}`);
  target[prop] = value;
  return true;
});
```

### 2. **Multiple Interceptors Per Trap**
You can register multiple interceptors for the same trap, and they'll all execute:

```javascript
const { proxy, addInterceptor } = createProxy(target);

// All of these will run when a property is accessed
addInterceptor('get', validateAccess);
addInterceptor('get', logAccess);
addInterceptor('get', cacheResult);
```

### 3. **Specialized Definition Methods**
For common use cases, Proxyable provides specialized methods:

```javascript
const { proxy, defineGetInterceptor, defineSetInterceptor } = createProxy(target);

defineGetInterceptor((target, prop) => {
  // Custom get logic
});

defineSetInterceptor((target, prop, value) => {
  // Custom set logic
});
```

### 4. **Built-in Context Management**
No need to manually manage context isolation - Proxyable handles it for you with `unctx`:

```javascript
const { proxy: proxy1 } = createProxy(obj1);
const { proxy: proxy2 } = createProxy(obj2);

// proxy1 and proxy2 have completely isolated contexts
```

## Use Cases

### Property Validation
Ensure properties meet certain criteria before being set:

```javascript
const { proxy, defineSetInterceptor } = createProxy({});
defineSetInterceptor((target, prop, value) => {
  if (prop === 'age' && typeof value !== 'number') {
    throw new Error('Age must be a number');
  }
  target[prop] = value;
  return true;
});
```

### Access Control
Control which properties can be accessed or modified:

```javascript
const { proxy, defineGetInterceptor } = createProxy(sensitiveData);
defineGetInterceptor((target, prop) => {
  if (currentUser.role === 'admin') {
    return target[prop];
  }
  throw new Error('Unauthorized');
});
```

### Dynamic Property Injection
Add computed or derived properties dynamically:

```javascript
const { proxy, defineGetInterceptor } = createProxy(user);
defineGetInterceptor((target, prop) => {
  if (prop === 'fullName') {
    return `${target.firstName} ${target.lastName}`;
  }
  return target[prop];
});
```

### Read-Only Properties
Make certain properties immutable:

```javascript
const { proxy, defineSetInterceptor } = createProxy(config);
defineSetInterceptor((target, prop, value) => {
  const readOnlyProps = ['id', 'createdAt', 'version'];
  if (readOnlyProps.includes(prop)) {
    throw new Error(`${prop} is read-only`);
  }
  target[prop] = value;
  return true;
});
```

## Architecture Overview

Proxyable's architecture consists of three main layers:

1. **Proxy Creation Layer** (`src/proxy/create-proxy.js`)
   - Creates the actual JavaScript Proxy
   - Registers trap handlers
   - Provides the public API (addInterceptor, defineXInterceptor methods)

2. **Context Management Layer** (`src/context/context.js`)
   - Uses `unctx` to create isolated execution contexts
   - Ensures interceptors don't affect each other across proxy instances

3. **Trap Execution Layer** (`src/proxy/traps.js`)
   - Executes registered interceptors in sequence
   - Handles common patterns like validation and logging

## Supported Proxy Traps

Proxyable supports all 8 standard JavaScript proxy traps:

- **`get`** - Property access
- **`set`** - Property assignment
- **`has`** - Property existence check (in operator)
- **`deleteProperty`** - Property deletion
- **`ownKeys`** - Getting property names
- **`getOwnPropertyDescriptor`** - Getting property descriptors
- **`apply`** - Function calls (for function proxies)
- **`construct`** - Constructor calls (for class proxies)

## When to Use Proxyable

###  Good Use Cases
- Property validation and type checking
- Access control and permission systems
- Dynamic property injection
- Audit logging and monitoring
- Caching layers
- API mocking and testing
- Configuration management with validation

### L Not Suitable For
- Performance-critical hot paths (proxies add overhead)
- Simple scenarios where a getter/setter would work
- Cases where you need very specialized proxy behavior

## Getting Started

To create your first proxy with Proxyable:

```javascript
import { createProxy } from 'proxyable';

const target = { name: 'John', age: 30 };
const { proxy, addInterceptor } = createProxy(target);

// Add an interceptor
addInterceptor('get', (target, prop) => {
  console.log(`Accessed: ${prop}`);
  return target[prop];
});

// Use the proxy
console.log(proxy.name); // Logs: "Accessed: name", returns "John"
```

See the [Examples](./examples.md) section for more detailed examples, or jump to the [API Reference](./api.md) for complete documentation.
