# Plugins and Interceptors Guide

## 1. What Are Plugins and Interceptors?

### Core Concept

In Proxyable, **interceptors** are functions that hook into proxy operations and allow you to intercept, monitor, or modify behavior before it reaches the target object. While Proxyable doesn't have a formal "plugin" system, you can create **plugin patterns** by composing multiple interceptors together to encapsulate reusable functionality.

### Interceptors vs. Plugins

- **Interceptors**: Individual functions that respond to a single proxy trap (like `get`, `set`, `has`, etc.)
- **Plugins**: Collections of related interceptors grouped together to solve a specific problem (logging, validation, caching, etc.)

### How They Work

When you access a proxied object, the operation goes through the registered interceptors:

```
User Action (e.g., proxy.property = value)
    “
Proxy Trap (e.g., 'set')
    “
Interceptor Chain (runs all registered interceptors in order)
    “
Target Object (original object/function)
```

Each interceptor in the chain can:
- **Observe** the operation without modifying it
- **Modify** the operation (change values, block access)
- **Transform** the result before returning it
- **Reject** the operation by throwing an error

## 2. Logging Plugin Pattern

The logging plugin intercepts operations and records them for debugging, auditing, or monitoring purposes.

### Basic Logging Plugin

```javascript
import { createProxy } from 'proxyable';

function createLoggingPlugin(logger = console) {
  return {
    name: 'logging',
    apply(createProxyFn) {
      return (target, options = {}) => {
        const { proxy, addInterceptor, context } = createProxyFn(target, options);

        // Log get operations
        addInterceptor('get', (target, prop) => {
          logger.log(`[GET] ${String(prop)}`);
          return target[prop];
        });

        // Log set operations
        addInterceptor('set', (target, prop, value) => {
          logger.log(`[SET] ${String(prop)} = ${JSON.stringify(value)}`);
          target[prop] = value;
          return true;
        });

        // Log delete operations
        addInterceptor('deleteProperty', (target, prop) => {
          logger.log(`[DELETE] ${String(prop)}`);
          return delete target[prop];
        });

        return { proxy, addInterceptor, context };
      };
    }
  };
}

// Usage
const logger = {
  log: (msg) => console.log(`[APP LOG] ${msg}`)
};

const { proxy, addInterceptor } = createProxy({ name: 'John', age: 30 });
const loggingInterceptors = createLoggingPlugin(logger);

// Apply logging
proxy.name = 'Jane';      // Logs: "[APP LOG] [SET] name = "Jane""
console.log(proxy.name);  // Logs: "[APP LOG] [GET] name"
delete proxy.age;         // Logs: "[APP LOG] [DELETE] age"
```

### Advanced Logging with Context

```javascript
function createContextualLoggingPlugin() {
  return {
    apply(createProxyFn) {
      return (target, options = {}) => {
        const { proxy, addInterceptor, context } = createProxyFn(target, options);

        // Store operation history in context
        context.set('operations', []);

        addInterceptor('get', (target, prop) => {
          const timestamp = new Date().toISOString();
          const value = target[prop];

          context.use(() => {
            const ops = context.operations || [];
            ops.push({
              type: 'get',
              prop: String(prop),
              timestamp,
              result: typeof value === 'object' ? 'object' : typeof value
            });
          });

          return value;
        });

        addInterceptor('set', (target, prop, value) => {
          const timestamp = new Date().toISOString();

          context.use(() => {
            const ops = context.operations || [];
            ops.push({
              type: 'set',
              prop: String(prop),
              value: JSON.stringify(value),
              timestamp
            });
          });

          target[prop] = value;
          return true;
        });

        // Expose operation history
        context.getOperations = () => {
          return context.use(() => context.operations || []);
        };

        return { proxy, addInterceptor, context };
      };
    }
  };
}

// Usage
const { proxy, context } = createProxy({ email: 'user@example.com' });
const loggingPlugin = createContextualLoggingPlugin();

// ... interact with proxy ...
proxy.email = 'newuser@example.com';
console.log(proxy.email);

// Retrieve operation history
const history = context.getOperations();
console.log(history);
// Output: [{type: 'set', prop: 'email', ...}, {type: 'get', prop: 'email', ...}]
```

## 3. Security and Access Control Plugin Pattern

Control which properties can be accessed or modified based on user roles, permissions, or other criteria.

### Role-Based Access Control (RBAC)

```javascript
function createRBACPlugin(permissions) {
  return {
    name: 'rbac',
    apply(createProxyFn) {
      return (target, options = {}) => {
        const { proxy, addInterceptor, context } = createProxyFn(target, options);

        // Store current user role in context
        context.set('userRole', options.role || 'guest');

        const canAccess = (prop, action) => {
          const role = context.use(() => context.userRole);
          const rules = permissions[role] || [];
          return rules.some(r =>
            (r.prop === '*' || r.prop === prop) &&
            (r.actions === '*' || r.actions.includes(action))
          );
        };

        // Secure get operations
        addInterceptor('get', (target, prop) => {
          if (!canAccess(prop, 'read')) {
            throw new Error(`[RBAC] Unauthorized: Cannot read ${String(prop)}`);
          }
          return target[prop];
        });

        // Secure set operations
        addInterceptor('set', (target, prop, value) => {
          if (!canAccess(prop, 'write')) {
            throw new Error(`[RBAC] Unauthorized: Cannot write to ${String(prop)}`);
          }
          target[prop] = value;
          return true;
        });

        // Secure delete operations
        addInterceptor('deleteProperty', (target, prop) => {
          if (!canAccess(prop, 'delete')) {
            throw new Error(`[RBAC] Unauthorized: Cannot delete ${String(prop)}`);
          }
          return delete target[prop];
        });

        // Allow role switching
        context.setRole = (role) => {
          context.set('userRole', role);
        };

        return { proxy, addInterceptor, context };
      };
    }
  };
}

// Define permissions
const permissions = {
  admin: [
    { prop: '*', actions: '*' }  // Full access
  ],
  editor: [
    { prop: 'title', actions: ['read', 'write'] },
    { prop: 'content', actions: ['read', 'write'] },
    { prop: 'status', actions: ['read'] }  // Read-only
  ],
  viewer: [
    { prop: '*', actions: ['read'] }  // Read-only access
  ]
};

// Usage
const document = {
  title: 'Secret Document',
  content: 'Sensitive information',
  apiKey: 'secret-key-123'
};

const { proxy, context } = createProxy(document, { role: 'viewer' });
const rbacPlugin = createRBACPlugin(permissions);

console.log(proxy.title);        //  Works (read allowed)

try {
  proxy.title = 'New Title';     //  Throws error (write not allowed)
} catch (error) {
  console.error(error.message);  // "[RBAC] Unauthorized: Cannot write to title"
}

// Switch to editor role
context.setRole('editor');
proxy.title = 'New Title';       //  Works now
proxy.status = 'published';      //  Throws error (write not allowed)
```

### Field-Level Encryption

```javascript
function createEncryptionPlugin(encryptionKey) {
  return {
    name: 'encryption',
    apply(createProxyFn) {
      return (target, options = {}) => {
        const { proxy, addInterceptor, context } = createProxyFn(target, options);

        // Simple encryption (use proper crypto in production)
        const encrypt = (str) => Buffer.from(str).toString('base64');
        const decrypt = (str) => Buffer.from(str, 'base64').toString();

        const sensitiveFields = options.sensitiveFields || [];

        addInterceptor('get', (target, prop) => {
          const value = target[prop];
          if (sensitiveFields.includes(String(prop)) && typeof value === 'string') {
            return decrypt(value);  // Return decrypted value
          }
          return value;
        });

        addInterceptor('set', (target, prop, value) => {
          if (sensitiveFields.includes(String(prop)) && typeof value === 'string') {
            target[prop] = encrypt(value);  // Store encrypted
          } else {
            target[prop] = value;
          }
          return true;
        });

        return { proxy, addInterceptor, context };
      };
    }
  };
}

// Usage
const user = {
  name: 'John Doe',
  email: 'john@example.com',
  ssn: '123-45-6789'  // Will be encrypted
};

const { proxy } = createProxy(user, {
  sensitiveFields: ['ssn', 'email']
});
const encryptionPlugin = createEncryptionPlugin('my-secret-key');

// Data is stored encrypted but returned decrypted
console.log(proxy.ssn);        // "123-45-6789" (decrypted)
console.log(user.ssn);         // Base64 string (encrypted storage)
```

## 4. Validation Plugin Pattern

Ensure data integrity by validating values before they're set on the target object.

### Schema Validation Plugin

```javascript
function createValidationPlugin(schema) {
  return {
    name: 'validation',
    apply(createProxyFn) {
      return (target, options = {}) => {
        const { proxy, addInterceptor, context } = createProxyFn(target, options);

        const validate = (prop, value) => {
          if (!schema[prop]) {
            return { valid: true };
          }

          const rules = schema[prop];

          // Type validation
          if (rules.type && typeof value !== rules.type) {
            return {
              valid: false,
              error: `${String(prop)} must be of type ${rules.type}`
            };
          }

          // Custom validator
          if (rules.validator && !rules.validator(value)) {
            return {
              valid: false,
              error: rules.message || `${String(prop)} validation failed`
            };
          }

          // Min/max for numbers
          if (typeof value === 'number') {
            if (rules.min !== undefined && value < rules.min) {
              return {
                valid: false,
                error: `${String(prop)} must be >= ${rules.min}`
              };
            }
            if (rules.max !== undefined && value > rules.max) {
              return {
                valid: false,
                error: `${String(prop)} must be <= ${rules.max}`
              };
            }
          }

          // Length for strings
          if (typeof value === 'string') {
            if (rules.minLength && value.length < rules.minLength) {
              return {
                valid: false,
                error: `${String(prop)} must be at least ${rules.minLength} characters`
              };
            }
            if (rules.maxLength && value.length > rules.maxLength) {
              return {
                valid: false,
                error: `${String(prop)} must be at most ${rules.maxLength} characters`
              };
            }
            if (rules.pattern && !rules.pattern.test(value)) {
              return {
                valid: false,
                error: `${String(prop)} does not match required pattern`
              };
            }
          }

          return { valid: true };
        };

        addInterceptor('set', (target, prop, value) => {
          const result = validate(prop, value);

          if (!result.valid) {
            throw new TypeError(`[VALIDATION] ${result.error}`);
          }

          target[prop] = value;
          return true;
        });

        // Expose validator
        context.validate = (prop, value) => validate(prop, value);

        return { proxy, addInterceptor, context };
      };
    }
  };
}

// Define validation schema
const userSchema = {
  email: {
    type: 'string',
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Invalid email format'
  },
  age: {
    type: 'number',
    min: 0,
    max: 150
  },
  name: {
    type: 'string',
    minLength: 1,
    maxLength: 100
  },
  password: {
    type: 'string',
    minLength: 8,
    validator: (pwd) => /[A-Z]/.test(pwd) && /[0-9]/.test(pwd),
    message: 'Password must contain uppercase letter and number'
  }
};

// Usage
const { proxy, context } = createProxy({}, {});
const validationPlugin = createValidationPlugin(userSchema);

proxy.email = 'user@example.com';  //  Valid
proxy.age = 25;                    //  Valid

try {
  proxy.age = 200;                 //  Throws error (exceeds max)
} catch (error) {
  console.error(error.message);    // "[VALIDATION] age must be <= 150"
}

try {
  proxy.email = 'invalid-email';   //  Throws error (invalid format)
} catch (error) {
  console.error(error.message);    // "[VALIDATION] Invalid email format"
}
```

## 5. Caching Plugin Pattern

Improve performance by caching read operations and invalidating cache on writes.

### Simple Caching Plugin

```javascript
function createCachingPlugin(options = {}) {
  const ttl = options.ttl || Infinity;  // Time to live in ms
  const maxSize = options.maxSize || 100;

  return {
    name: 'caching',
    apply(createProxyFn) {
      return (target, opts = {}) => {
        const { proxy, addInterceptor, context } = createProxyFn(target, opts);

        context.set('cache', new Map());
        context.set('timestamps', new Map());
        context.set('accessCount', new Map());

        const isExpired = (prop) => {
          if (ttl === Infinity) return false;
          const timestamp = context.use(() => context.timestamps?.get(String(prop)));
          return timestamp && Date.now() - timestamp > ttl;
        };

        const isCached = (prop) => {
          const cache = context.use(() => context.cache);
          return cache.has(String(prop)) && !isExpired(prop);
        };

        const getCached = (prop) => {
          return context.use(() => {
            const cache = context.cache;
            const count = context.accessCount.get(String(prop)) || 0;
            context.accessCount.set(String(prop), count + 1);
            return cache.get(String(prop));
          });
        };

        const setCached = (prop, value) => {
          return context.use(() => {
            const cache = context.cache;

            // Implement LRU eviction if cache is full
            if (cache.size >= maxSize && !cache.has(String(prop))) {
              const lruKey = [...context.accessCount.entries()]
                .sort((a, b) => a[1] - b[1])[0][0];
              cache.delete(lruKey);
              context.accessCount.delete(lruKey);
            }

            cache.set(String(prop), value);
            context.timestamps.set(String(prop), Date.now());
          });
        };

        // Cache get operations
        addInterceptor('get', (target, prop) => {
          if (isCached(prop)) {
            return getCached(prop);
          }

          const value = target[prop];
          setCached(prop, value);
          return value;
        });

        // Invalidate cache on set
        addInterceptor('set', (target, prop, value) => {
          context.use(() => {
            context.cache.delete(String(prop));
            context.timestamps.delete(String(prop));
          });
          target[prop] = value;
          return true;
        });

        // Invalidate cache on delete
        addInterceptor('deleteProperty', (target, prop) => {
          context.use(() => {
            context.cache.delete(String(prop));
            context.timestamps.delete(String(prop));
          });
          return delete target[prop];
        });

        // Expose cache stats
        context.getCacheStats = () => {
          return context.use(() => ({
            size: context.cache.size,
            items: Array.from(context.cache.keys()),
            accessCounts: Object.fromEntries(context.accessCount)
          }));
        };

        return { proxy, addInterceptor, context };
      };
    }
  };
}

// Usage with expensive computations
const dataSource = {
  async fetchUser(id) {
    // Simulate expensive API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { id, name: 'User ' + id };
  }
};

const { proxy, context } = createProxy(dataSource);
const cachingPlugin = createCachingPlugin({ ttl: 5000, maxSize: 50 });

// First access - fetches from source (1000ms)
const user1 = await proxy.fetchUser(1);

// Second access - served from cache (instant)
const user2 = await proxy.fetchUser(1);

console.log(context.getCacheStats());
// { size: 1, items: ['fetchUser'], accessCounts: { fetchUser: 2 } }
```

### Computed Value Caching

```javascript
function createComputedCachingPlugin() {
  return {
    name: 'computed-caching',
    apply(createProxyFn) {
      return (target, options = {}) => {
        const { proxy, addInterceptor, context } = createProxyFn(target, options);

        const computedFields = options.computedFields || {};
        context.set('computedCache', new Map());
        context.set('dependencies', new Map());

        // Track field dependencies
        Object.entries(computedFields).forEach(([field, { dependsOn }]) => {
          context.use(() => {
            context.dependencies.set(field, dependsOn || []);
          });
        });

        addInterceptor('get', (target, prop) => {
          const propStr = String(prop);

          if (computedFields[propStr]) {
            const cached = context.use(() => context.computedCache?.get(propStr));

            if (cached !== undefined) {
              return cached;
            }

            const computed = computedFields[propStr].compute(target);

            context.use(() => {
              context.computedCache.set(propStr, computed);
            });

            return computed;
          }

          return target[prop];
        });

        // Invalidate computed cache when dependencies change
        addInterceptor('set', (target, prop, value) => {
          const propStr = String(prop);

          context.use(() => {
            // Invalidate any computed fields that depend on this property
            context.dependencies.forEach((deps, computed) => {
              if (deps.includes(propStr)) {
                context.computedCache.delete(computed);
              }
            });
          });

          target[prop] = value;
          return true;
        });

        return { proxy, addInterceptor, context };
      };
    }
  };
}

// Usage
const person = { firstName: 'John', lastName: 'Doe' };

const { proxy } = createProxy(person, {
  computedFields: {
    fullName: {
      dependsOn: ['firstName', 'lastName'],
      compute: (target) => `${target.firstName} ${target.lastName}`
    },
    initials: {
      dependsOn: ['firstName', 'lastName'],
      compute: (target) => `${target.firstName[0]}${target.lastName[0]}`
    }
  }
});

console.log(proxy.fullName);   // "John Doe" (computed and cached)
console.log(proxy.initials);   // "JD" (computed and cached)

proxy.firstName = 'Jane';      // Cache is automatically invalidated

console.log(proxy.fullName);   // "Jane Doe" (recomputed)
```

## 6. Plugin Composition Patterns

### Sequential Composition

```javascript
function composePlugins(...plugins) {
  return {
    apply(createProxyFn) {
      return (target, options = {}) => {
        let result = { proxy: target, addInterceptor: () => {}, context: {} };

        // Apply each plugin in order
        for (const plugin of plugins) {
          const factory = plugin.apply(
            (t, opts) => createProxyFn(result.proxy || t, opts)
          );
          result = factory(result.proxy || target, options);
        }

        return result;
      };
    }
  };
}

// Usage
const loggingPlugin = createLoggingPlugin();
const validationPlugin = createValidationPlugin(userSchema);
const cachingPlugin = createCachingPlugin();

const composedPlugin = composePlugins(
  loggingPlugin,
  validationPlugin,
  cachingPlugin
);

const { proxy } = createProxy(userData);
const result = composedPlugin.apply(createProxy)(userData, {
  sensitiveFields: ['password']
});
```

### Conditional Plugin Application

```javascript
function createConditionalPlugin(condition, plugin) {
  return {
    apply(createProxyFn) {
      return (target, options = {}) => {
        if (condition(target, options)) {
          return plugin.apply(createProxyFn)(target, options);
        }
        return createProxyFn(target, options);
      };
    }
  };
}

// Usage - only apply validation in non-production
const conditionalValidation = createConditionalPlugin(
  (target, options) => process.env.NODE_ENV !== 'production',
  validationPlugin
);
```

### Middleware-Style Pipeline

```javascript
function createMiddlewarePlugin(middlewares = []) {
  return {
    name: 'middleware',
    apply(createProxyFn) {
      return (target, options = {}) => {
        const { proxy, addInterceptor, context } = createProxyFn(target, options);

        // Build middleware chain for get operations
        addInterceptor('get', (target, prop) => {
          let value = target[prop];

          // Run through get middlewares
          for (const mw of middlewares) {
            if (mw.onGet) {
              value = mw.onGet(value, prop, target);
            }
          }

          return value;
        });

        // Build middleware chain for set operations
        addInterceptor('set', (target, prop, value) => {
          let finalValue = value;

          // Run through set middlewares
          for (const mw of middlewares) {
            if (mw.onSet) {
              finalValue = mw.onSet(finalValue, prop, target);
            }
          }

          target[prop] = finalValue;
          return true;
        });

        return { proxy, addInterceptor, context };
      };
    }
  };
}

// Define middlewares
const trimMiddleware = {
  onSet: (value, prop, target) => {
    if (typeof value === 'string') {
      return value.trim();
    }
    return value;
  }
};

const lowercaseEmailMiddleware = {
  onSet: (value, prop, target) => {
    if (prop === 'email' && typeof value === 'string') {
      return value.toLowerCase();
    }
    return value;
  }
};

// Usage
const { proxy } = createProxy({});
const middlewarePlugin = createMiddlewarePlugin([
  trimMiddleware,
  lowercaseEmailMiddleware
]);

proxy.email = '  USER@EXAMPLE.COM  ';  // Stored as "user@example.com"
proxy.name = '  John Doe  ';           // Stored as "John Doe"
```

## 7. Best Practices for Creating Reusable Plugins

### 1. **Plugin Interface Convention**

```javascript
// Good plugin structure
function createMyPlugin(config = {}) {
  return {
    name: 'my-plugin',           // Unique identifier
    version: '1.0.0',            // Version tracking
    apply(createProxyFn) {       // Apply method
      return (target, options = {}) => {
        const { proxy, addInterceptor, context } = createProxyFn(target, options);

        // Merge plugin-specific config with options
        const config = { ...this.defaultConfig, ...options };

        // Add interceptors
        addInterceptor('get', /* ... */);

        // Expose plugin-specific methods on context
        context.getPluginState = () => { /* ... */ };

        return { proxy, addInterceptor, context };
      };
    },
    defaultConfig: {
      enabled: true,
      debug: false
    }
  };
}
```

### 2. **Namespace Plugin Methods**

```javascript
function createNamespacedPlugin() {
  return {
    apply(createProxyFn) {
      return (target, options = {}) => {
        const { proxy, addInterceptor, context } = createProxyFn(target, options);

        // Namespace all plugin methods under a unique key
        const pluginNamespace = '__myPlugin__';

        context[pluginNamespace] = {
          getState: () => { /* ... */ },
          resetState: () => { /* ... */ },
          configure: (config) => { /* ... */ }
        };

        return { proxy, addInterceptor, context };
      };
    }
  };
}

// Usage
const { context } = createProxy(target);
context.__myPlugin__.getState();
```

### 3. **Configuration Validation**

```javascript
function createConfigurablePlugin(defaultConfig = {}) {
  function validateConfig(config) {
    const errors = [];

    if (config.timeout && typeof config.timeout !== 'number') {
      errors.push('timeout must be a number');
    }

    if (config.maxRetries && config.maxRetries < 0) {
      errors.push('maxRetries must be non-negative');
    }

    if (errors.length > 0) {
      throw new Error(`Invalid plugin config: ${errors.join(', ')}`);
    }

    return config;
  }

  return {
    apply(createProxyFn) {
      return (target, options = {}) => {
        const config = validateConfig({ ...defaultConfig, ...options });
        const { proxy, addInterceptor, context } = createProxyFn(target, options);

        context.config = config;

        return { proxy, addInterceptor, context };
      };
    }
  };
}
```

### 4. **Memory Leak Prevention**

```javascript
function createPluginWithCleanup() {
  return {
    apply(createProxyFn) {
      return (target, options = {}) => {
        const { proxy, addInterceptor, context } = createProxyFn(target, options);

        // Use WeakMap for automatic garbage collection
        const cache = new WeakMap();
        const metadata = new Map();

        // Provide cleanup method
        context.cleanup = () => {
          // Clear all references
          metadata.clear();
          // WeakMap entries are automatically cleaned when keys are GC'd
        };

        // Limit event listeners
        let listenerCount = 0;
        const maxListeners = 10;

        context.addEventListener = (event, handler) => {
          if (listenerCount >= maxListeners) {
            throw new Error('Max listeners reached');
          }
          listenerCount++;
          // ... add listener
        };

        return { proxy, addInterceptor, context, cleanup: context.cleanup };
      };
    }
  };
}

// Usage
const { proxy, context, cleanup } = createProxy(target);
const plugin = createPluginWithCleanup();

// Later, when done with the proxy
cleanup();
```

### 5. **Error Handling and Recovery**

```javascript
function createResilientPlugin() {
  return {
    apply(createProxyFn) {
      return (target, options = {}) => {
        const { proxy, addInterceptor, context } = createProxyFn(target, options);

        context.set('errorCount', 0);
        context.set('lastError', null);

        const withErrorHandling = (interceptor, errorHandler) => {
          return (...args) => {
            try {
              return interceptor(...args);
            } catch (error) {
              context.use(() => {
                context.errorCount = (context.errorCount || 0) + 1;
                context.lastError = error;
              });

              if (errorHandler) {
                return errorHandler(error, ...args);
              }
              throw error;
            }
          };
        };

        addInterceptor('get', withErrorHandling(
          (target, prop) => target[prop],
          (error, target, prop) => {
            console.warn(`Failed to get ${String(prop)}: ${error.message}`);
            return undefined;  // Graceful fallback
          }
        ));

        context.getErrorStats = () => {
          return context.use(() => ({
            count: context.errorCount,
            last: context.lastError?.message
          }));
        };

        return { proxy, addInterceptor, context };
      };
    }
  };
}
```

### 6. **Testing Plugins**

```javascript
import { describe, it, expect } from 'vitest';

describe('MyPlugin', () => {
  it('should intercept get operations', () => {
    const target = { name: 'test' };
    const { proxy } = createProxy(target);
    const plugin = createMyPlugin();

    const logs = [];
    const testLogger = { log: (msg) => logs.push(msg) };

    const { proxy: loggedProxy } = plugin.apply(createProxy)(target, {
      logger: testLogger
    });

    loggedProxy.name;

    expect(logs).toContain(expect.stringContaining('[GET]'));
  });

  it('should handle invalid configuration', () => {
    expect(() => {
      createConfigurablePlugin().apply(createProxy)(target, {
        timeout: 'invalid'
      });
    }).toThrow('Invalid plugin config');
  });

  it('should provide cleanup method', () => {
    const { context, cleanup } = plugin.apply(createProxy)(target);

    expect(cleanup).toBeDefined();
    expect(() => cleanup()).not.toThrow();
  });
});
```

### 7. **Documentation and Examples**

```javascript
/**
 * Creates a caching plugin for proxied objects.
 *
 * @param {Object} options - Plugin configuration
 * @param {number} [options.ttl=Infinity] - Cache TTL in milliseconds
 * @param {number} [options.maxSize=100] - Maximum cache size
 * @returns {Object} Plugin object with apply method
 *
 * @example
 * const plugin = createCachingPlugin({ ttl: 5000 });
 * const { proxy, context } = createProxy(target);
 * const applied = plugin.apply(createProxy)(target);
 *
 * // Cache stats are available via context
 * console.log(context.getCacheStats());
 *
 * @throws {Error} When maxSize is invalid
 */
function createCachingPlugin(options = {}) {
  // Implementation
}
```

## Summary

Plugins and interceptors in Proxyable provide a powerful way to:
- **Separate concerns** - Keep logging, validation, and security separate
- **Reuse functionality** - Create composable, reusable modules
- **Extend capabilities** - Add features without modifying the original target
- **Maintain clean code** - Declarative, functional approach to proxy behavior

By following these patterns and best practices, you can build robust, maintainable plugin systems that enhance your applications while keeping code organized and testable.
