# Proxyable Examples

This document provides practical, well-commented examples demonstrating various use cases for the Proxyable library.

## 1. Basic Usage

The simplest way to get started with Proxyable is to create a proxy and add basic interceptors.

```javascript
import { createProxy } from 'proxyable';

// Create a target object
const user = {
  name: 'Alice',
  email: 'alice@example.com',
  age: 28
};

// Create a proxy with interceptor support
const { proxy, defineGetInterceptor } = createProxy(user);

// Add a simple get interceptor to log property access
defineGetInterceptor((target, prop) => {
  console.log(`Accessing property: ${prop}`);
  return target[prop];
});

// Use the proxy
console.log(proxy.name);  // Logs: "Accessing property: name", Output: "Alice"
console.log(proxy.email); // Logs: "Accessing property: email", Output: "alice@example.com"
```

## 2. Validation Example (Set Interceptor)

One of the most practical uses for Proxies is adding validation logic when setting properties.

```javascript
import { createProxy } from 'proxyable';

// Create a user object with validation requirements
const user = {
  name: '',
  age: 0,
  email: ''
};

const { proxy, defineSetInterceptor } = createProxy(user);

// Add a set interceptor to validate data before assignment
defineSetInterceptor((target, prop, value) => {
  // Validate name: non-empty string
  if (prop === 'name') {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new TypeError('Name must be a non-empty string');
    }
  }

  // Validate age: positive number between 0 and 150
  if (prop === 'age') {
    if (typeof value !== 'number' || value < 0 || value > 150) {
      throw new TypeError('Age must be a number between 0 and 150');
    }
  }

  // Validate email: basic email format check
  if (prop === 'email') {
    if (!value.includes('@') || !value.includes('.')) {
      throw new TypeError('Email must be a valid email format');
    }
  }

  // If validation passes, assign the value
  target[prop] = value;
  return true; // Must return true to indicate success
});

// Use the proxy with validation
try {
  proxy.name = 'Bob';        // Valid 
  proxy.age = 30;            // Valid 
  proxy.email = 'bob@example.com'; // Valid 

  proxy.age = -5;            // Throws: Age must be a number between 0 and 150
} catch (error) {
  console.error(`Validation error: ${error.message}`);
}

console.log(proxy.name);  // "Bob"
console.log(proxy.age);   // 30
```

## 3. Read-Only Properties

Prevent modification of specific properties by rejecting set operations.

```javascript
import { createProxy } from 'proxyable';

// Create an object with properties that should be read-only
const config = {
  appVersion: '1.0.0',
  appName: 'MyApp',
  environment: 'production'
};

const { proxy, defineSetInterceptor, defineGetInterceptor } = createProxy(config);

// Define which properties are read-only
const readOnlyProperties = ['appVersion', 'appName', 'environment'];

// Add a set interceptor to enforce read-only restrictions
defineSetInterceptor((target, prop, value) => {
  if (readOnlyProperties.includes(prop)) {
    throw new Error(`Cannot modify read-only property "${prop}"`);
  }

  // Allow setting other properties
  target[prop] = value;
  return true;
});

// Add a get interceptor to log read access to sensitive properties
defineGetInterceptor((target, prop) => {
  if (readOnlyProperties.includes(prop)) {
    console.log(`[READ-ONLY] Accessing: ${prop} = ${target[prop]}`);
  }
  return target[prop];
});

// Use the proxy
console.log(proxy.appVersion); // Logs: [READ-ONLY] Accessing: appVersion = 1.0.0

try {
  proxy.appVersion = '2.0.0'; // Throws: Cannot modify read-only property "appVersion"
} catch (error) {
  console.error(error.message);
}

// Other properties can still be modified
proxy.customSetting = true;    // Works fine
console.log(proxy.customSetting); // true
```

## 4. Dynamic Method Injection

Add methods to objects at runtime through proxy interceptors.

```javascript
import { createProxy } from 'proxyable';

// Create a simple user object without methods
const user = {
  firstName: 'John',
  lastName: 'Doe',
  birthYear: 1990
};

const { proxy, defineGetInterceptor } = createProxy(user);

// Inject dynamic methods via the get interceptor
defineGetInterceptor((target, prop) => {
  // Inject a computed property
  if (prop === 'fullName') {
    return `${target.firstName} ${target.lastName}`;
  }

  // Inject a method to calculate age
  if (prop === 'getAge') {
    return function() {
      const currentYear = new Date().getFullYear();
      return currentYear - target.birthYear;
    };
  }

  // Inject a method to format name
  if (prop === 'getInitials') {
    return function() {
      return `${target.firstName[0]}${target.lastName[0]}`;
    };
  }

  // Inject a method to update the user
  if (prop === 'update') {
    return function(updates) {
      Object.assign(target, updates);
      return true;
    };
  }

  // Return the actual property value
  return target[prop];
});

// Use the proxy to access original properties and injected methods
console.log(proxy.firstName);        // "John"
console.log(proxy.fullName);         // "John Doe" (computed property)
console.log(proxy.getAge());         // Current age
console.log(proxy.getInitials());    // "JD"

// Update the user using the injected method
proxy.update({ firstName: 'Jane', birthYear: 1992 });
console.log(proxy.fullName);         // "Jane Doe"
```

## 5. Multiple Interceptors

Register multiple interceptors for the same trap to create a layered interception pipeline.

```javascript
import { createProxy } from 'proxyable';

const data = {
  username: 'alice',
  timestamp: null,
  accessCount: 0
};

const { proxy, defineGetInterceptor } = createProxy(data);

// First interceptor: Track access count
defineGetInterceptor((target, prop) => {
  if (prop === 'accessCount') {
    target.accessCount++;
  }
  return target[prop];
});

// Second interceptor: Add logging
defineGetInterceptor((target, prop) => {
  console.log(`[LOG] Reading property: ${prop}`);
  return target[prop];
});

// Third interceptor: Update timestamp on access
defineGetInterceptor((target, prop) => {
  if (prop !== 'timestamp') {
    target.timestamp = new Date().toISOString();
  }
  return target[prop];
});

// Use the proxy - all three interceptors run in order
console.log(proxy.username);
// Output:
// [LOG] Reading property: username
// alice

console.log(data.accessCount);       // 1
console.log(data.timestamp !== null); // true

// Access again
console.log(proxy.username);
// Output:
// [LOG] Reading property: username
// alice

console.log(data.accessCount);       // 2
```

## 6. Function Proxy Example (Apply/Construct)

Wrap functions to intercept function calls and class instantiation.

```javascript
import { createProxy } from 'proxyable';

// Example 1: Intercept function calls with apply
// Create a calculator function
const multiply = (a, b) => a * b;

const { proxy: calculatorProxy, defineApplyInterceptor } = createProxy(multiply);

// Add an apply interceptor to log function calls
defineApplyInterceptor((target, thisArg, args) => {
  console.log(`[CALL] multiply(${args[0]}, ${args[1]})`);
  const result = Reflect.apply(target, thisArg, args);
  console.log(`[RETURN] ${result}`);
  return result;
});

console.log(calculatorProxy(5, 3));
// Output:
// [CALL] multiply(5, 3)
// [RETURN] 15
// Result: 15

// Example 2: Intercept class instantiation with construct
class User {
  constructor(name, email) {
    this.name = name;
    this.email = email;
    this.createdAt = null;
  }
}

const { proxy: UserProxy, defineConstructInterceptor } = createProxy(User);

// Add a construct interceptor to enhance instantiation
defineConstructInterceptor((target, args, newTarget) => {
  console.log(`[CONSTRUCT] Creating User with args:`, args);

  // Create the instance
  const instance = Reflect.construct(target, args, newTarget);

  // Enhance the instance
  instance.createdAt = new Date();
  instance.getId = function() {
    return `user-${this.name.toLowerCase()}-${this.createdAt.getTime()}`;
  };

  console.log(`[CONSTRUCT] User created with id:`, instance.getId());
  return instance;
});

const user = new UserProxy('Alice', 'alice@example.com');
// Output:
// [CONSTRUCT] Creating User with args: [ 'Alice', 'alice@example.com' ]
// [CONSTRUCT] User created with id: user-alice-1234567890

console.log(user.name);           // "Alice"
console.log(user.createdAt instanceof Date); // true
console.log(user.getId());        // "user-alice-1234567890"
```

## 7. Access Control Example

Implement role-based access control using proxy interceptors.

```javascript
import { createProxy } from 'proxyable';

// Sensitive data object
const secretData = {
  apiKey: 'secret-key-12345',
  databasePassword: 'db-pass-9876',
  userDatabase: { id: 1, name: 'Admin' },
  publicConfig: { appName: 'MyApp' }
};

// Define access control rules based on user role
const accessControl = {
  admin: {
    canRead: ['apiKey', 'databasePassword', 'userDatabase', 'publicConfig'],
    canWrite: ['publicConfig']
  },
  user: {
    canRead: ['publicConfig'],
    canWrite: []
  },
  guest: {
    canRead: [],
    canWrite: []
  }
};

// Create a function to create access-controlled proxies
function createAccessControlledProxy(target, userRole = 'guest') {
  const { proxy, defineGetInterceptor, defineSetInterceptor } = createProxy(target);

  const rules = accessControl[userRole];

  if (!rules) {
    throw new Error(`Invalid role: ${userRole}`);
  }

  // Control read access
  defineGetInterceptor((target, prop) => {
    if (!rules.canRead.includes(prop)) {
      throw new Error(
        `Access denied: User role "${userRole}" cannot read property "${prop}"`
      );
    }
    console.log(`[${userRole}] Reading: ${prop}`);
    return target[prop];
  });

  // Control write access
  defineSetInterceptor((target, prop, value) => {
    if (!rules.canWrite.includes(prop)) {
      throw new Error(
        `Access denied: User role "${userRole}" cannot write property "${prop}"`
      );
    }
    console.log(`[${userRole}] Writing: ${prop}`);
    target[prop] = value;
    return true;
  });

  return { proxy, userRole };
}

// Example 1: Admin access - Full permissions
console.log('=== Admin User ===');
const adminProxy = createAccessControlledProxy(secretData, 'admin').proxy;

console.log(adminProxy.apiKey);        // [admin] Reading: apiKey, Output: "secret-key-12345"
console.log(adminProxy.publicConfig);  // [admin] Reading: publicConfig, Output: {...}

adminProxy.publicConfig = { appName: 'UpdatedApp' }; // [admin] Writing: publicConfig

// Example 2: Regular user - Limited permissions
console.log('\n=== Regular User ===');
const userProxy = createAccessControlledProxy(secretData, 'user').proxy;

console.log(userProxy.publicConfig);   // [user] Reading: publicConfig, Output: {...}

try {
  console.log(userProxy.apiKey);       // Throws error
} catch (error) {
  console.error(`Error: ${error.message}`);
  // Error: Access denied: User role "user" cannot read property "apiKey"
}

try {
  userProxy.publicConfig = { appName: 'UserUpdate' }; // Throws error
} catch (error) {
  console.error(`Error: ${error.message}`);
  // Error: Access denied: User role "user" cannot write property "publicConfig"
}

// Example 3: Guest access - No permissions
console.log('\n=== Guest User ===');
const guestProxy = createAccessControlledProxy(secretData, 'guest').proxy;

try {
  console.log(guestProxy.publicConfig); // Throws error
} catch (error) {
  console.error(`Error: ${error.message}`);
  // Error: Access denied: User role "guest" cannot read property "publicConfig"
}
```

## 8. Bonus: Combined Example - Secure Configuration Manager

A practical real-world example combining multiple concepts.

```javascript
import { createProxy } from 'proxyable';

// Create a configuration manager with multiple security features
function createConfigManager(initialConfig = {}) {
  const config = { ...initialConfig };
  const changeHistory = [];

  const {
    proxy,
    defineGetInterceptor,
    defineSetInterceptor,
    defineHasInterceptor,
    defineOwnKeysInterceptor
  } = createProxy(config);

  // Encrypted property names that should not appear in enumeration
  const secretProperties = ['apiSecret', 'dbPassword'];

  // Get interceptor: Mask sensitive data in logs
  defineGetInterceptor((target, prop) => {
    if (secretProperties.includes(prop)) {
      console.log(`[SECURE] Reading sensitive property: ${prop}`);
      // In production, you might decrypt the value here
    }
    return target[prop];
  });

  // Set interceptor: Validate and track changes
  defineSetInterceptor((target, prop, value) => {
    // Validate that only strings are stored in config
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new TypeError(`Config values must be string or number, got ${typeof value}`);
    }

    // Track the change
    changeHistory.push({
      timestamp: new Date().toISOString(),
      property: prop,
      oldValue: target[prop],
      newValue: value
    });

    console.log(`[CONFIG] Updated: ${prop}`);
    target[prop] = value;
    return true;
  });

  // Has interceptor: Prevent checking for secret properties
  defineHasInterceptor((target, prop) => {
    if (secretProperties.includes(prop)) {
      console.log(`[SECURE] Checking existence of sensitive property: ${prop}`);
    }
    return Reflect.has(target, prop);
  });

  // OwnKeys interceptor: Hide secret properties from enumeration
  defineOwnKeysInterceptor((target) => {
    const allKeys = Reflect.ownKeys(target);
    return allKeys.filter(key => !secretProperties.includes(key));
  });

  return {
    proxy,
    getHistory: () => [...changeHistory],
    reset: (newConfig) => {
      Object.keys(config).forEach(key => delete config[key]);
      Object.assign(config, newConfig);
      changeHistory.length = 0;
    }
  };
}

// Usage
const manager = createConfigManager({
  appName: 'SecureApp',
  environment: 'production',
  apiSecret: 'super-secret-key-123',
  dbPassword: 'db-pass-456'
});

// Public access works normally
manager.proxy.appName = 'UpdatedApp';
console.log(Object.keys(manager.proxy));  // Shows only public keys, not secrets

// Sensitive access is logged
const secret = manager.proxy.apiSecret;

// View change history
console.log('Change History:', manager.getHistory());
// Output:
// Change History: [
//   { timestamp: '2025-01-15T10:30:00Z', property: 'appName',
//     oldValue: 'SecureApp', newValue: 'UpdatedApp' }
// ]
```

## Key Concepts to Remember

1. **Interceptor Order**: Multiple interceptors for the same trap execute in registration order
2. **Return Values**:
   - `get` interceptors should return a value
   - `set`/`has`/`deleteProperty` interceptors must return booleans
   - `apply` interceptors should return the function result
   - `construct` interceptors should return an object
3. **Target Modification**: The target object is directly modifiable within interceptors
4. **Context Isolation**: Each proxy maintains its own isolated context automatically
5. **Error Handling**: Errors thrown in interceptors propagate to the caller

## Performance Considerations

- Interceptors add a small performance overhead - use them judiciously
- Multiple interceptors for the same trap execute sequentially
- Avoid heavy computations in get interceptors which are frequently called
- Cache computed values when possible to reduce repeated calculations
