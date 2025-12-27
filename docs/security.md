# Security Guide for Proxy-Based Applications

This guide covers security considerations, patterns, and best practices when using JavaScript proxies in your applications.

## Table of Contents

1. [Security Considerations](#security-considerations)
2. [Access Control Patterns](#access-control-patterns)
3. [Sandboxing Techniques](#sandboxing-techniques)
4. [Input Validation Best Practices](#input-validation-best-practices)
5. [Prototype Pollution Prevention](#prototype-pollution-prevention)
6. [Security Plugin Examples](#security-plugin-examples)
7. [Best Practices for Sensitive Data](#best-practices-for-sensitive-data)

## Security Considerations

### Proxy Trap Attacks

Proxies can be exploited if not properly designed. Consider these common attack vectors:

- **Trap Overloading**: Attackers may attempt to trigger expensive operations through proxy traps
- **Property Enumeration**: Using `ownKeys` trap to discover sensitive properties
- **Prototype Chain Manipulation**: Exploiting proxy handlers to access prototype methods
- **Function Binding Hijacking**: Intercepting function calls to steal context or modify behavior

### Reflection API Abuse

Be cautious with `Reflect` API usage in proxy traps:

```javascript
// VULNERABLE: Reflects all operations
const proxy = new Proxy(target, {
  get(target, prop) {
    return Reflect.get(target, prop); // No validation
  }
});

// SECURE: Validates before reflection
const secureProxy = new Proxy(target, {
  get(target, prop) {
    if (isAllowedProperty(prop)) {
      return Reflect.get(target, prop);
    }
    throw new Error(`Access denied: ${prop}`);
  }
});
```

### Performance Denial of Service

Proxies can introduce performance overhead:

```javascript
// Monitor and limit trap invocations
const trapLimiter = {
  trapCounts: {},
  maxTrapsPerSecond: 1000,

  checkLimit(trapName) {
    this.trapCounts[trapName] = (this.trapCounts[trapName] || 0) + 1;
    if (this.trapCounts[trapName] > this.maxTrapsPerSecond) {
      throw new Error(`Rate limit exceeded for ${trapName}`);
    }
  },

  reset() {
    this.trapCounts = {};
  }
};
```

## Access Control Patterns

### Role-Based Access Control (RBAC)

```javascript
// Define roles and their permissions
const roles = {
  admin: ['read', 'write', 'delete', 'admin'],
  editor: ['read', 'write'],
  viewer: ['read']
};

function createRBACProxy(target, userRole) {
  return new Proxy(target, {
    get(target, prop) {
      // Allow public properties
      if (prop.startsWith('_public_')) {
        return Reflect.get(target, prop);
      }

      // Check role-based access
      const allowedPerms = roles[userRole] || [];
      const requiredPerm = getRequiredPermission(prop);

      if (!allowedPerms.includes(requiredPerm)) {
        throw new Error(`Access denied for ${userRole}`);
      }

      return Reflect.get(target, prop);
    },

    set(target, prop, value) {
      const allowedPerms = roles[userRole] || [];
      if (!allowedPerms.includes('write')) {
        throw new Error(`Write access denied for ${userRole}`);
      }

      return Reflect.set(target, prop, value);
    }
  });
}

// Usage
const data = { username: 'john', password: 'secret123' };
const userProxy = createRBACProxy(data, 'viewer');

// This works
console.log(userProxy.username); // 'john'

// This throws
try {
  userProxy.password = 'newhash';
} catch (e) {
  console.log(e.message); // 'Write access denied for viewer'
}
```

### Attribute-Based Access Control (ABAC)

```javascript
function createABACProxy(target, context) {
  return new Proxy(target, {
    get(target, prop) {
      const policy = getPolicyForProperty(prop);

      if (policy.requiresCondition) {
        if (!policy.condition(context)) {
          throw new Error(`Attribute condition failed for ${prop}`);
        }
      }

      return Reflect.get(target, prop);
    }
  });
}

// Policy example: User can only access data from their department
const policies = {
  salary: {
    requiresCondition: true,
    condition: (context) => context.isDepartmentHead || context.isHR
  },
  phone: {
    requiresCondition: true,
    condition: (context) => context.isManager || context.isSelfUser
  }
};

function getPolicyForProperty(prop) {
  return policies[prop] || { requiresCondition: false };
}
```

### Property Whitelisting

```javascript
function createWhitelistProxy(target, whitelist) {
  return new Proxy(target, {
    get(target, prop) {
      if (typeof prop === 'symbol') {
        return Reflect.get(target, prop);
      }

      if (!whitelist.includes(String(prop))) {
        return undefined; // Silently deny
      }

      return Reflect.get(target, prop);
    },

    set(target, prop, value) {
      if (!whitelist.includes(String(prop))) {
        throw new Error(`Property ${prop} not whitelisted`);
      }

      return Reflect.set(target, prop, value);
    },

    ownKeys(target) {
      return Reflect.ownKeys(target).filter(key =>
        whitelist.includes(String(key))
      );
    },

    getOwnPropertyDescriptor(target, prop) {
      if (!whitelist.includes(String(prop))) {
        return undefined;
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    }
  });
}

// Usage
const user = { name: 'John', password: 'secret', email: 'john@example.com' };
const safeUser = createWhitelistProxy(user, ['name', 'email']);

console.log(safeUser.name); // 'John'
console.log(safeUser.password); // undefined
```

## Sandboxing Techniques

### Object Isolation

```javascript
function createSandboxProxy(target, allowedMethods) {
  return new Proxy(target, {
    get(target, prop) {
      // Allow only specific methods
      if (typeof target[prop] === 'function') {
        if (!allowedMethods.includes(prop)) {
          throw new Error(`Method ${prop} not allowed in sandbox`);
        }
      }

      // Prevent access to constructor
      if (prop === 'constructor') {
        throw new Error('Constructor access denied');
      }

      // Prevent access to __proto__
      if (prop === '__proto__') {
        throw new Error('Prototype access denied');
      }

      return Reflect.get(target, prop);
    }
  });
}

// Usage
const untrustedCode = {
  process: function() { return 'safe'; },
  dangerous: function() { return 'denied'; }
};

const sandbox = createSandboxProxy(untrustedCode, ['process']);
sandbox.process(); // Works
// sandbox.dangerous(); // Throws: Method dangerous not allowed in sandbox
```

### Memory Boundaries

```javascript
class MemorySandbox {
  constructor(maxMemoryMB = 10) {
    this.maxMemory = maxMemoryMB * 1024 * 1024;
    this.currentMemory = 0;
  }

  createProxy(target) {
    return new Proxy(target, {
      set: (target, prop, value) => {
        const estimatedSize = JSON.stringify(value).length;

        if (this.currentMemory + estimatedSize > this.maxMemory) {
          throw new Error('Sandbox memory limit exceeded');
        }

        this.currentMemory += estimatedSize;
        return Reflect.set(target, prop, value);
      }
    });
  }
}

// Usage
const sandbox = new MemorySandbox(5); // 5MB limit
const data = sandbox.createProxy({});

// This works
data.chunk1 = 'x'.repeat(1024 * 1024); // 1MB

// This might fail if exceeds limit
data.chunk2 = 'y'.repeat(6 * 1024 * 1024); // 6MB
```

## Input Validation Best Practices

### Type Validation Proxy

```javascript
function createValidatingProxy(target, schema) {
  return new Proxy(target, {
    set(target, prop, value) {
      // Check if property is in schema
      if (!schema.hasOwnProperty(prop)) {
        throw new Error(`Property ${prop} not in schema`);
      }

      const rule = schema[prop];

      // Type checking
      if (rule.type && typeof value !== rule.type) {
        throw new TypeError(
          `Property ${prop} must be of type ${rule.type}, got ${typeof value}`
        );
      }

      // Custom validator
      if (rule.validate && !rule.validate(value)) {
        throw new Error(`Validation failed for ${prop}: ${rule.message}`);
      }

      // Length checking for strings
      if (rule.maxLength && value.length > rule.maxLength) {
        throw new Error(`${prop} exceeds maximum length of ${rule.maxLength}`);
      }

      // Range checking for numbers
      if (rule.min !== undefined && value < rule.min) {
        throw new Error(`${prop} is below minimum value of ${rule.min}`);
      }

      if (rule.max !== undefined && value > rule.max) {
        throw new Error(`${prop} exceeds maximum value of ${rule.max}`);
      }

      return Reflect.set(target, prop, value);
    }
  });
}

// Usage
const userSchema = {
  username: {
    type: 'string',
    maxLength: 50,
    validate: (val) => /^[a-zA-Z0-9_]+$/.test(val),
    message: 'Username must contain only alphanumeric characters and underscores'
  },
  age: {
    type: 'number',
    min: 0,
    max: 150
  },
  email: {
    type: 'string',
    validate: (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
    message: 'Invalid email format'
  }
};

const user = createValidatingProxy({}, userSchema);
user.username = 'john_doe'; // OK
// user.username = 'john@#$%'; // Throws: Validation failed
// user.age = 200; // Throws: age exceeds maximum value of 150
```

### Sanitization Proxy

```javascript
function createSanitizingProxy(target, sanitizers) {
  return new Proxy(target, {
    set(target, prop, value) {
      let sanitizedValue = value;

      // Apply sanitizers for this property
      if (sanitizers[prop]) {
        const propSanitizers = Array.isArray(sanitizers[prop])
          ? sanitizers[prop]
          : [sanitizers[prop]];

        for (const sanitizer of propSanitizers) {
          sanitizedValue = sanitizer(sanitizedValue);
        }
      }

      return Reflect.set(target, prop, sanitizedValue);
    }
  });
}

// Sanitizer functions
const sanitizers = {
  username: (val) => String(val).trim().toLowerCase(),
  password: (val) => String(val).trim(), // Never log or expose
  bio: [
    (val) => String(val).trim(),
    (val) => val.replace(/<script[^>]*>.*?<\/script>/gi, ''), // Remove scripts
    (val) => val.substring(0, 500) // Limit length
  ]
};

const user = createSanitizingProxy({}, sanitizers);
user.username = '  JohnDoe  '; // Becomes 'johndoe'
user.bio = '<script>alert("xss")</script>Hello'; // Script removed
```

## Prototype Pollution Prevention

### Prototype Chain Protection

```javascript
function createPrototypeSafeProxy(target) {
  return new Proxy(target, {
    set(target, prop, value) {
      // Block dangerous properties
      if (prop === 'constructor' || prop === '__proto__' || prop === 'prototype') {
        throw new Error(`Setting ${prop} is not allowed`);
      }

      // Prevent setting on Object prototype
      if (prop === '__proto__' || prop === 'constructor') {
        return false;
      }

      return Reflect.set(target, prop, value);
    },

    get(target, prop) {
      // Block access to dangerous properties
      if (prop === 'constructor' || prop === '__proto__') {
        return undefined;
      }

      return Reflect.get(target, prop);
    },

    has(target, prop) {
      if (prop === 'constructor' || prop === '__proto__') {
        return false;
      }

      return Reflect.has(target, prop);
    },

    deleteProperty(target, prop) {
      if (prop === 'constructor' || prop === '__proto__') {
        throw new Error(`Cannot delete ${prop}`);
      }

      return Reflect.deleteProperty(target, prop);
    }
  });
}

// Usage
const obj = createPrototypeSafeProxy({});

// These are blocked
try {
  obj.__proto__ = { polluted: true }; // Throws
} catch (e) {
  console.log('Blocked:', e.message);
}

try {
  obj.constructor = function() {}; // Throws
} catch (e) {
  console.log('Blocked:', e.message);
}

// Safe properties work normally
obj.name = 'safe'; // Works
```

### Deep Property Protection

```javascript
function createDeepProtectionProxy(obj, path = []) {
  return new Proxy(obj, {
    set(target, prop, value) {
      // Prevent prototype pollution at any level
      if (['__proto__', 'constructor', 'prototype'].includes(String(prop))) {
        throw new Error(`Prototype pollution attempt detected at path: ${path.join('.')}`);
      }

      // If value is an object, wrap it too
      if (value && typeof value === 'object') {
        value = createDeepProtectionProxy(value, [...path, String(prop)]);
      }

      return Reflect.set(target, prop, value);
    },

    get(target, prop) {
      if (['__proto__', 'constructor', 'prototype'].includes(String(prop))) {
        return undefined;
      }

      const value = Reflect.get(target, prop);

      // Wrap nested objects
      if (value && typeof value === 'object') {
        return createDeepProtectionProxy(value, [...path, String(prop)]);
      }

      return value;
    }
  });
}
```

## Security Plugin Examples

### Audit Logging Plugin

```javascript
class AuditLogger {
  constructor(options = {}) {
    this.logs = [];
    this.maxLogs = options.maxLogs || 1000;
    this.sensitive = options.sensitiveFields || ['password', 'token', 'secret'];
  }

  createAuditProxy(target, context = {}) {
    return new Proxy(target, {
      get: (target, prop) => {
        this.log({
          action: 'get',
          property: prop,
          timestamp: Date.now(),
          context
        });

        return Reflect.get(target, prop);
      },

      set: (target, prop, value) => {
        this.log({
          action: 'set',
          property: prop,
          value: this.sensitive.includes(String(prop)) ? '[REDACTED]' : value,
          timestamp: Date.now(),
          context
        });

        return Reflect.set(target, prop, value);
      },

      deleteProperty: (target, prop) => {
        this.log({
          action: 'delete',
          property: prop,
          timestamp: Date.now(),
          context
        });

        return Reflect.deleteProperty(target, prop);
      }
    });
  }

  log(entry) {
    this.logs.push(entry);

    // Keep logs under max size
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  getLogs(filter) {
    if (filter) {
      return this.logs.filter(log =>
        Object.entries(filter).every(([key, value]) => log[key] === value)
      );
    }

    return this.logs;
  }

  clear() {
    this.logs = [];
  }
}

// Usage
const logger = new AuditLogger({ sensitiveFields: ['password', 'apiKey'] });
const user = logger.createAuditProxy({ name: 'John', password: 'secret' }, { userId: 123 });

user.name; // Logged
user.password = 'newhash'; // Logged with [REDACTED]

console.log(logger.getLogs({ action: 'set' }));
```

### Rate Limiting Plugin

```javascript
class RateLimiter {
  constructor(options = {}) {
    this.options = {
      windowMs: options.windowMs || 60000, // 1 minute
      maxCalls: options.maxCalls || 100,
      ...options
    };
    this.calls = new Map();
  }

  createLimitedProxy(target) {
    return new Proxy(target, {
      get: (target, prop) => {
        this.checkLimit('get', prop);
        return Reflect.get(target, prop);
      },

      set: (target, prop, value) => {
        this.checkLimit('set', prop);
        return Reflect.set(target, prop, value);
      }
    });
  }

  checkLimit(action, property) {
    const key = `${action}:${String(property)}`;
    const now = Date.now();

    if (!this.calls.has(key)) {
      this.calls.set(key, []);
    }

    const callTimes = this.calls.get(key);

    // Remove old calls outside window
    while (callTimes.length > 0 && callTimes[0] < now - this.options.windowMs) {
      callTimes.shift();
    }

    if (callTimes.length >= this.options.maxCalls) {
      throw new Error(`Rate limit exceeded for ${action} on ${property}`);
    }

    callTimes.push(now);
  }
}

// Usage
const limiter = new RateLimiter({ maxCalls: 10, windowMs: 1000 });
const data = limiter.createLimitedProxy({ counter: 0 });
```

### Encryption Plugin

```javascript
class EncryptionProxy {
  constructor(encryptFn, decryptFn) {
    this.encrypt = encryptFn;
    this.decrypt = decryptFn;
  }

  createEncryptedProxy(target, fieldsToEncrypt = []) {
    return new Proxy(target, {
      set: (target, prop, value) => {
        if (fieldsToEncrypt.includes(String(prop))) {
          value = this.encrypt(value);
        }
        return Reflect.set(target, prop, value);
      },

      get: (target, prop) => {
        let value = Reflect.get(target, prop);
        if (fieldsToEncrypt.includes(String(prop)) && value) {
          value = this.decrypt(value);
        }
        return value;
      }
    });
  }
}

// Usage with simple base64 (not real encryption - use crypto in production)
const crypto = {
  encrypt: (val) => Buffer.from(String(val)).toString('base64'),
  decrypt: (val) => Buffer.from(val, 'base64').toString()
};

const encryption = new EncryptionProxy(crypto.encrypt, crypto.decrypt);
const user = encryption.createEncryptedProxy(
  {},
  ['password', 'ssn']
);

user.password = 'secretpassword';
// Internally stored as encrypted, but retrieved as plaintext
console.log(user.password); // 'secretpassword'
```

## Best Practices for Sensitive Data

### Secure Data Handling

```javascript
function createSecureDataProxy(target, sensitiveFields = []) {
  const privateData = new WeakMap();

  return new Proxy(target, {
    set(target, prop, value) {
      if (sensitiveFields.includes(String(prop))) {
        // Store sensitive data separately
        if (!privateData.has(target)) {
          privateData.set(target, {});
        }
        privateData.get(target)[prop] = value;
        return true;
      }

      return Reflect.set(target, prop, value);
    },

    get(target, prop) {
      if (sensitiveFields.includes(String(prop))) {
        const data = privateData.get(target);
        return data ? data[prop] : undefined;
      }

      return Reflect.get(target, prop);
    }
  });
}

// Usage
const user = createSecureDataProxy({}, ['password', 'apiKey']);
user.name = 'John';
user.password = 'secret123';

// password is never stored directly on user object
console.log(Object.keys(user)); // ['name']
console.log(user.password); // Can still retrieve it
```

### Data Expiration

```javascript
class DataExpirationProxy {
  constructor(defaultTTL = 3600000) { // 1 hour
    this.defaultTTL = defaultTTL;
    this.expirations = new Map();
  }

  createExpiringProxy(target) {
    return new Proxy(target, {
      set: (target, prop, value, ttl = this.defaultTTL) => {
        const result = Reflect.set(target, prop, value);

        // Set expiration
        const expiresAt = Date.now() + ttl;
        this.expirations.set(prop, expiresAt);

        // Clear expired data after TTL
        setTimeout(() => {
          if (Reflect.has(target, prop)) {
            Reflect.deleteProperty(target, prop);
          }
        }, ttl);

        return result;
      },

      get: (target, prop) => {
        // Check if expired
        const expiresAt = this.expirations.get(prop);
        if (expiresAt && Date.now() > expiresAt) {
          Reflect.deleteProperty(target, prop);
          this.expirations.delete(prop);
          return undefined;
        }

        return Reflect.get(target, prop);
      }
    });
  }
}

// Usage
const expiring = new DataExpirationProxy(5000); // 5 second TTL
const session = expiring.createExpiringProxy({});

session.token = 'xyz123'; // Automatically expires in 5 seconds
```

### Access Logging for Sensitive Data

```javascript
function createSensitiveDataProxy(target, sensitiveFields = []) {
  const accessLog = [];

  return new Proxy(target, {
    get(target, prop) {
      if (sensitiveFields.includes(String(prop))) {
        accessLog.push({
          action: 'read',
          field: prop,
          timestamp: Date.now(),
          stack: new Error().stack
        });
      }

      return Reflect.get(target, prop);
    },

    set(target, prop, value) {
      if (sensitiveFields.includes(String(prop))) {
        accessLog.push({
          action: 'write',
          field: prop,
          timestamp: Date.now(),
          stack: new Error().stack
        });
      }

      return Reflect.set(target, prop, value);
    },

    getAccessLog() {
      return [...accessLog];
    },

    clearAccessLog() {
      accessLog.length = 0;
    }
  });
}

// Usage
const user = createSensitiveDataProxy(
  { name: 'John', password: 'secret' },
  ['password']
);

user.password; // Logged
console.log(user.getAccessLog()); // Shows access history
```

### Environment Variable Protection

```javascript
function createEnvProxy() {
  const allowedVars = process.env.ALLOWED_ENV_VARS?.split(',') || [];
  const blockedVars = ['DATABASE_PASSWORD', 'API_SECRET', 'JWT_SECRET'];

  return new Proxy(process.env, {
    get(target, prop) {
      const varName = String(prop);

      if (blockedVars.includes(varName)) {
        throw new Error(`Access to ${varName} is blocked`);
      }

      if (allowedVars.length > 0 && !allowedVars.includes(varName)) {
        return undefined;
      }

      return Reflect.get(target, prop);
    },

    set(target, prop, value) {
      throw new Error('Environment variables cannot be modified');
    }
  });
}
```

## Summary

When implementing proxy-based security:

1. **Always validate input** before processing
2. **Use whitelisting** instead of blacklisting
3. **Prevent prototype pollution** explicitly
4. **Log security-relevant events** for auditing
5. **Implement rate limiting** to prevent DoS
6. **Encrypt sensitive data** in transit and at rest
7. **Use proper access control** patterns (RBAC, ABAC)
8. **Sandbox untrusted code** with resource limits
9. **Review proxy traps** for side effects
10. **Keep sensitive data** separate from public properties

Remember: Proxies are powerful tools, but they don't replace proper security architecture. Use them as part of a defense-in-depth strategy.
