import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTenantContext,
  getTenantId,
  getRawTarget,
  createMultipleTenants
} from '../../src/multitenancy/tenant-context.js';

describe('Multi-Tenant Behavioral Views', () => {
  let sharedData;

  beforeEach(() => {
    sharedData = {
      id: 1,
      name: 'Shared Resource',
      publicData: 'visible to all',
      privateData: 'sensitive info',
      salary: 50_000,
      status: 'active',
      price: 100
    };
  });

  describe('createTenantContext', () => {
    it('should require tenantId', () => {
      expect(() => createTenantContext(sharedData, undefined)).toThrow('tenantId is required');
    });

    it('should create tenant context with API', () => {
      const tenant = createTenantContext(sharedData, 'tenant1');

      expect(tenant.getTenantId()).toBe('tenant1');
      expect(tenant.call).toBeInstanceOf(Function);
      expect(tenant.getMetadata).toBeInstanceOf(Function);
      expect(tenant.getConfig).toBeInstanceOf(Function);
      expect(tenant.updateConfig).toBeInstanceOf(Function);
      expect(tenant.proxy).toBeDefined();
    });

    it('should access underlying object without restrictions by default', () => {
      const tenant = createTenantContext(sharedData, 'tenant1');

      tenant.call(proxy => {
        expect(proxy.name).toBe('Shared Resource');
        expect(proxy.publicData).toBe('visible to all');
        expect(proxy.privateData).toBe('sensitive info');
      });
    });
  });

  describe('Filtered Keys (visibleKeys)', () => {
    it('should filter keys using Set', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        visibleKeys: new Set(['id', 'name', 'publicData'])
      });

      tenant.call(proxy => {
        expect(proxy.id).toBe(1);
        expect(proxy.name).toBe('Shared Resource');
        expect(proxy.publicData).toBe('visible to all');
        expect(proxy.privateData).toBeUndefined();
        expect(proxy.salary).toBeUndefined();
      });
    });

    it('should filter keys using function', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        visibleKeys: (key) => !key.includes('private') && key !== 'salary'
      });

      tenant.call(proxy => {
        expect(proxy.id).toBe(1);
        expect(proxy.name).toBe('Shared Resource');
        expect(proxy.publicData).toBe('visible to all');
        expect(proxy.privateData).toBeUndefined();
        expect(proxy.salary).toBeUndefined();
      });
    });

    it('should hide invisible keys in has trap', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        visibleKeys: new Set(['id', 'name'])
      });

      tenant.call(proxy => {
        expect('id' in proxy).toBe(true);
        expect('name' in proxy).toBe(true);
        expect('privateData' in proxy).toBe(false);
        expect('salary' in proxy).toBe(false);
      });
    });

    it('should filter ownKeys to visible only', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        visibleKeys: new Set(['id', 'name'])
      });

      tenant.call(proxy => {
        const keys = Object.keys(proxy);
        expect(keys).toEqual(['id', 'name']);
        expect(keys).not.toContain('privateData');
        expect(keys).not.toContain('salary');
      });
    });

    it('should prevent setting invisible keys', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        visibleKeys: new Set(['id', 'name'])
      });

      tenant.call(proxy => {
        expect(() => {
          proxy.privateData = 'new value';
        }).toThrow('Property not visible to tenant');
      });
    });

    it('should prevent deleting invisible keys', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        visibleKeys: new Set(['id', 'name'])
      });

      tenant.call(proxy => {
        expect(() => {
          delete proxy.privateData;
        }).toThrow('Property not visible to tenant');
      });
    });

    it('should return undefined for getOwnPropertyDescriptor on invisible keys', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        visibleKeys: new Set(['id', 'name'])
      });

      tenant.call(proxy => {
        expect(Object.getOwnPropertyDescriptor(proxy, 'id')).toBeDefined();
        expect(Object.getOwnPropertyDescriptor(proxy, 'privateData')).toBeUndefined();
      });
    });
  });

  describe('Virtual Properties', () => {
    it('should add static virtual properties', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        virtualProperties: {
          tenantName: 'Acme Corp',
          organization: 'Engineering'
        }
      });

      tenant.call(proxy => {
        expect(proxy.tenantName).toBe('Acme Corp');
        expect(proxy.organization).toBe('Engineering');
        expect(proxy.name).toBe('Shared Resource'); // Real property still accessible
      });
    });

    it('should add dynamic virtual properties (functions)', () => {
      let callCount = 0;
      const tenant = createTenantContext(sharedData, 'tenant1', {
        virtualProperties: {
          timestamp: () => new Date('2025-01-01'),
          counter: () => ++callCount,
          fullName: function() {
            return `${this.name} - Tenant Edition`;
          }
        }
      });

      tenant.call(proxy => {
        expect(proxy.timestamp).toEqual(new Date('2025-01-01'));
        expect(proxy.counter).toBe(1);
        expect(proxy.counter).toBe(2);
        expect(proxy.fullName).toBe('Shared Resource - Tenant Edition');
      });
    });

    it('should include virtual properties in ownKeys', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        virtualProperties: {
          tenantName: 'Acme Corp',
          virtual1: 'value1'
        }
      });

      tenant.call(proxy => {
        const keys = Object.keys(proxy);
        expect(keys).toContain('tenantName');
        expect(keys).toContain('virtual1');
      });
    });

    it('should report virtual properties as existing in has trap', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        virtualProperties: {
          tenantName: 'Acme Corp'
        }
      });

      tenant.call(proxy => {
        expect('tenantName' in proxy).toBe(true);
      });
    });

    it('should prevent setting virtual properties', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        virtualProperties: {
          tenantName: 'Acme Corp'
        }
      });

      tenant.call(proxy => {
        expect(() => {
          proxy.tenantName = 'New Name';
        }).toThrow('Cannot set virtual property');
      });
    });

    it('should prevent deleting virtual properties', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        virtualProperties: {
          tenantName: 'Acme Corp'
        }
      });

      tenant.call(proxy => {
        expect(() => {
          delete proxy.tenantName;
        }).toThrow('Cannot delete virtual property');
      });
    });

    it('should provide descriptor for virtual properties', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        virtualProperties: {
          tenantName: 'Acme Corp'
        }
      });

      tenant.call(proxy => {
        const descriptor = Object.getOwnPropertyDescriptor(proxy, 'tenantName');
        expect(descriptor).toBeDefined();
        expect(descriptor.writable).toBe(false);
        expect(descriptor.enumerable).toBe(true);
        expect(descriptor.value).toBe('Acme Corp');
      });
    });
  });

  describe('Value Transformation', () => {
    it('should transform values on get', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        transformGet: (key, value) => {
          if (key === 'salary') return '***REDACTED***';
          if (key === 'status') return value.toUpperCase();
          return value;
        }
      });

      tenant.call(proxy => {
        expect(proxy.salary).toBe('***REDACTED***');
        expect(proxy.status).toBe('ACTIVE');
        expect(proxy.name).toBe('Shared Resource'); // Unchanged
      });
    });

    it('should transform values on set', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        transformSet: (key, value) => {
          if (key === 'price') return Math.max(0, value); // Enforce non-negative
          if (key === 'name') return value.toUpperCase();
          return value;
        }
      });

      tenant.call(proxy => {
        proxy.price = -50;
        expect(sharedData.price).toBe(0); // Transformed to 0

        proxy.price = 200;
        expect(sharedData.price).toBe(200);

        proxy.name = 'test';
        expect(sharedData.name).toBe('TEST');
      });
    });

    it('should transform with access to receiver', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        transformGet: (key, value, receiver) => {
          if (key === 'displayName') {
            return `[${receiver.id}] ${receiver.name}`;
          }
          return value;
        }
      });

      tenant.call(proxy => {
        sharedData.displayName = 'Display';
        expect(proxy.displayName).toBe('[1] Shared Resource');
      });
    });
  });

  describe('Multiple Tenants on Same Object', () => {
    it('should allow multiple tenants with different views', () => {
      const tenant1 = createTenantContext(sharedData, 'tenant1', {
        visibleKeys: new Set(['id', 'name', 'publicData'])
      });

      const tenant2 = createTenantContext(sharedData, 'tenant2', {
        visibleKeys: new Set(['id', 'privateData', 'salary'])
      });

      tenant1.call(proxy1 => {
        expect(proxy1.publicData).toBe('visible to all');
        expect(proxy1.privateData).toBeUndefined();
        expect(Object.keys(proxy1).sort()).toEqual(['id', 'name', 'publicData'].sort());
      });

      tenant2.call(proxy2 => {
        expect(proxy2.privateData).toBe('sensitive info');
        expect(proxy2.publicData).toBeUndefined();
        expect(Object.keys(proxy2).sort()).toEqual(['id', 'privateData', 'salary'].sort());
      });
    });

    it('should isolate tenant transformations', () => {
      const tenant1 = createTenantContext(sharedData, 'tenant1', {
        transformGet: (key, value) => {
          if (key === 'status') return value.toUpperCase();
          return value;
        }
      });

      const tenant2 = createTenantContext(sharedData, 'tenant2', {
        transformGet: (key, value) => {
          if (key === 'status') return `Status: ${value}`;
          return value;
        }
      });

      tenant1.call(proxy1 => {
        expect(proxy1.status).toBe('ACTIVE');
      });

      tenant2.call(proxy2 => {
        expect(proxy2.status).toBe('Status: active');
      });

      // Underlying value unchanged
      expect(sharedData.status).toBe('active');
    });

    it('should allow different virtual properties per tenant', () => {
      const tenant1 = createTenantContext(sharedData, 'tenant1', {
        virtualProperties: {
          tenantName: 'Tenant One',
          tier: 'premium'
        }
      });

      const tenant2 = createTenantContext(sharedData, 'tenant2', {
        virtualProperties: {
          tenantName: 'Tenant Two',
          tier: 'basic'
        }
      });

      tenant1.call(proxy1 => {
        expect(proxy1.tenantName).toBe('Tenant One');
        expect(proxy1.tier).toBe('premium');
      });

      tenant2.call(proxy2 => {
        expect(proxy2.tenantName).toBe('Tenant Two');
        expect(proxy2.tier).toBe('basic');
      });
    });

    it('should share underlying object modifications', () => {
      const tenant1 = createTenantContext(sharedData, 'tenant1', {
        visibleKeys: new Set(['id', 'name'])
      });

      const tenant2 = createTenantContext(sharedData, 'tenant2', {
        visibleKeys: new Set(['id', 'name'])
      });

      tenant1.call(proxy1 => {
        proxy1.name = 'Modified by Tenant 1';
      });

      tenant2.call(proxy2 => {
        expect(proxy2.name).toBe('Modified by Tenant 1');
      });

      expect(sharedData.name).toBe('Modified by Tenant 1');
    });
  });

  describe('Tenant Isolation', () => {
    it('should not allow tenant A to see tenant B virtual properties', () => {
      const tenant1 = createTenantContext(sharedData, 'tenant1', {
        virtualProperties: { tenant1Only: 'secret1' }
      });

      const tenant2 = createTenantContext(sharedData, 'tenant2', {
        virtualProperties: { tenant2Only: 'secret2' }
      });

      tenant1.call(proxy1 => {
        expect(proxy1.tenant1Only).toBe('secret1');
        expect(proxy1.tenant2Only).toBeUndefined();
      });

      tenant2.call(proxy2 => {
        expect(proxy2.tenant2Only).toBe('secret2');
        expect(proxy2.tenant1Only).toBeUndefined();
      });
    });

    it('should isolate visibility rules', () => {
      const tenant1 = createTenantContext(sharedData, 'tenant1', {
        visibleKeys: new Set(['id', 'publicData'])
      });

      const tenant2 = createTenantContext(sharedData, 'tenant2', {
        visibleKeys: new Set(['id', 'privateData'])
      });

      tenant1.call(proxy1 => {
        expect('publicData' in proxy1).toBe(true);
        expect('privateData' in proxy1).toBe(false);
      });

      tenant2.call(proxy2 => {
        expect('publicData' in proxy2).toBe(false);
        expect('privateData' in proxy2).toBe(true);
      });
    });
  });

  describe('Tenant Metadata and Config', () => {
    it('should store and retrieve metadata', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        metadata: {
          name: 'Acme Corp',
          organization: 'Engineering',
          tier: 'enterprise'
        }
      });

      const metadata = tenant.getMetadata();
      expect(metadata.name).toBe('Acme Corp');
      expect(metadata.organization).toBe('Engineering');
      expect(metadata.tier).toBe('enterprise');
    });

    it('should retrieve full configuration', () => {
      const visibleKeys = new Set(['id', 'name']);
      const virtualProps = { tenantName: 'Test' };
      const transformGet = (k, v) => v;

      const tenant = createTenantContext(sharedData, 'tenant1', {
        visibleKeys,
        virtualProperties: virtualProps,
        transformGet,
        metadata: { org: 'Test Org' }
      });

      const config = tenant.getConfig();
      expect(config.visibleKeys).toBe(visibleKeys);
      expect(config.virtualProperties).toEqual(virtualProps);
      expect(config.transformGet).toBe(transformGet);
      expect(config.metadata).toEqual({ org: 'Test Org' });
    });

    it('should update configuration dynamically', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        visibleKeys: new Set(['id', 'name'])
      });

      tenant.call(proxy => {
        expect(Object.keys(proxy).sort()).toEqual(['id', 'name'].sort());
      });

      // Update to show more keys
      tenant.updateConfig({
        visibleKeys: new Set(['id', 'name', 'publicData'])
      });

      tenant.call(proxy => {
        expect(Object.keys(proxy).sort()).toEqual(['id', 'name', 'publicData'].sort());
      });
    });

    it('should update virtual properties dynamically', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        virtualProperties: { prop1: 'value1' }
      });

      tenant.call(proxy => {
        expect(proxy.prop1).toBe('value1');
        expect(proxy.prop2).toBeUndefined();
      });

      tenant.updateConfig({
        virtualProperties: { prop2: 'value2' }
      });

      tenant.call(proxy => {
        expect(proxy.prop1).toBe('value1'); // Still exists
        expect(proxy.prop2).toBe('value2'); // Added
      });
    });

    it('should update transformations dynamically', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        transformGet: (k, v) => v
      });

      tenant.call(proxy => {
        expect(proxy.status).toBe('active');
      });

      tenant.updateConfig({
        transformGet: (k, v) => k === 'status' ? v.toUpperCase() : v
      });

      tenant.call(proxy => {
        expect(proxy.status).toBe('ACTIVE');
      });
    });
  });

  describe('Utility Functions', () => {
    it('should get tenant ID from proxy', () => {
      const tenant = createTenantContext(sharedData, 'tenant1');
      expect(getTenantId(tenant.proxy)).toBe('tenant1');
    });

    it('should get raw target from proxy', () => {
      const tenant = createTenantContext(sharedData, 'tenant1');
      expect(getRawTarget(tenant.proxy)).toBe(sharedData);
    });

    it('should return undefined for non-tenant objects', () => {
      expect(getTenantId({})).toBeUndefined();
      expect(getRawTarget({})).toEqual({});
    });
  });

  describe('createMultipleTenants', () => {
    it('should create multiple tenants at once', () => {
      const tenants = createMultipleTenants(sharedData, {
        tenant1: {
          visibleKeys: new Set(['id', 'name']),
          metadata: { name: 'Tenant 1' }
        },
        tenant2: {
          visibleKeys: new Set(['id', 'salary']),
          metadata: { name: 'Tenant 2' }
        },
        tenant3: {
          virtualProperties: { special: 'value' },
          metadata: { name: 'Tenant 3' }
        }
      });

      expect(tenants.size).toBe(3);
      expect(tenants.get('tenant1').getTenantId()).toBe('tenant1');
      expect(tenants.get('tenant2').getTenantId()).toBe('tenant2');
      expect(tenants.get('tenant3').getTenantId()).toBe('tenant3');

      tenants.get('tenant1').call(proxy => {
        expect(Object.keys(proxy).sort()).toEqual(['id', 'name'].sort());
      });

      tenants.get('tenant2').call(proxy => {
        expect(Object.keys(proxy).sort()).toEqual(['id', 'salary'].sort());
      });

      tenants.get('tenant3').call(proxy => {
        expect(proxy.special).toBe('value');
      });
    });
  });

  describe('Advanced Scenarios', () => {
    it('should handle nested objects', () => {
      const data = {
        user: {
          id: 1,
          name: 'John',
          sensitive: 'secret'
        },
        public: 'info'
      };

      const tenant = createTenantContext(data, 'tenant1', {
        visibleKeys: new Set(['user', 'public'])
      });

      tenant.call(proxy => {
        expect(proxy.user.id).toBe(1);
        expect(proxy.user.name).toBe('John');
        expect(proxy.user.sensitive).toBe('secret'); // Nested object not filtered
        expect(proxy.public).toBe('info');
      });
    });

    it('should handle arrays', () => {
      const data = {
        items: [1, 2, 3, 4, 5],
        metadata: 'test'
      };

      const tenant = createTenantContext(data, 'tenant1', {
        transformGet: (key, value) => {
          if (key === 'items' && Array.isArray(value)) {
            return value.filter(x => x > 2);
          }
          return value;
        }
      });

      tenant.call(proxy => {
        expect(proxy.items).toEqual([3, 4, 5]);
      });

      expect(data.items).toEqual([1, 2, 3, 4, 5]); // Original unchanged
    });

    it('should handle function properties', () => {
      const data = {
        value: 10,
        calculate: function() {
          return this.value * 2;
        }
      };

      const tenant = createTenantContext(data, 'tenant1', {
        transformGet: (key, value) => {
          if (key === 'value') return value + 5;
          return value;
        }
      });

      tenant.call(proxy => {
        expect(proxy.value).toBe(15); // Transformed
        expect(proxy.calculate()).toBe(30); // Uses transformed value (15 * 2)
      });
    });

    it('should work with Symbol keys', () => {
      const sym = Symbol('test');
      const data = {
        regular: 'value',
        [sym]: 'symbol value'
      };

      const tenant = createTenantContext(data, 'tenant1', {
        visibleKeys: new Set(['regular']) // Symbols always visible
      });

      tenant.call(proxy => {
        expect(proxy.regular).toBe('value');
        expect(proxy[sym]).toBe('symbol value'); // Symbols bypass filter
      });
    });

    it('should handle getter/setter properties', () => {
      const data = {
        _value: 10,
        get value() {
          return this._value;
        },
        set value(v) {
          this._value = v;
        }
      };

      const tenant = createTenantContext(data, 'tenant1', {
        transformGet: (key, value) => {
          if (key === 'value') return value * 2;
          return value;
        }
      });

      tenant.call(proxy => {
        expect(proxy.value).toBe(20); // Transformed
        proxy.value = 15;
        expect(data._value).toBe(15);
        expect(proxy.value).toBe(30); // Transformed on next get
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty configuration', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {});

      tenant.call(proxy => {
        expect(proxy.name).toBe('Shared Resource');
        expect(Object.keys(proxy).length).toBeGreaterThan(0);
      });
    });

    it('should handle null/undefined values', () => {
      const data = {
        nullValue: null,
        undefinedValue: undefined,
        normal: 'value'
      };

      const tenant = createTenantContext(data, 'tenant1', {
        transformGet: (key, value) => {
          if (value === null) return 'NULL';
          if (value === undefined) return 'UNDEFINED';
          return value;
        }
      });

      tenant.call(proxy => {
        expect(proxy.nullValue).toBe('NULL');
        expect(proxy.undefinedValue).toBe('UNDEFINED');
        expect(proxy.normal).toBe('value');
      });
    });

    it('should handle transformation that returns undefined', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        transformGet: (key, value) => {
          if (key === 'status') return undefined;
          return value;
        }
      });

      tenant.call(proxy => {
        expect(proxy.status).toBeUndefined();
      });
    });

    it('should handle circular references', () => {
      const data = { name: 'root' };
      data.self = data;

      const tenant = createTenantContext(data, 'tenant1', {
        visibleKeys: new Set(['name', 'self'])
      });

      tenant.call(proxy => {
        expect(proxy.name).toBe('root');
        expect(proxy.self).toBe(data); // Points to original
        expect(proxy.self.name).toBe('root');
      });
    });

    it('should preserve prototype chain', () => {
      class DataClass {
        constructor() {
          this.value = 10;
        }
        method() {
          return this.value * 2;
        }
      }

      const instance = new DataClass();
      const tenant = createTenantContext(instance, 'tenant1');

      tenant.call(proxy => {
        expect(proxy.value).toBe(10);
        expect(proxy.method()).toBe(20);
        expect(proxy instanceof DataClass).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw on setting virtual property', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        virtualProperties: { readOnly: 'value' }
      });

      tenant.call(proxy => {
        expect(() => {
          proxy.readOnly = 'new';
        }).toThrow('Cannot set virtual property');
      });
    });

    it('should throw on deleting virtual property', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        virtualProperties: { readOnly: 'value' }
      });

      tenant.call(proxy => {
        expect(() => {
          delete proxy.readOnly;
        }).toThrow('Cannot delete virtual property');
      });
    });

    it('should throw on accessing invisible property for set', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        visibleKeys: new Set(['id'])
      });

      tenant.call(proxy => {
        expect(() => {
          proxy.privateData = 'hack';
        }).toThrow('Property not visible to tenant');
      });
    });

    it('should handle errors in transform functions gracefully', () => {
      const tenant = createTenantContext(sharedData, 'tenant1', {
        transformGet: (key, value) => {
          if (key === 'status') throw new Error('Transform error');
          return value;
        }
      });

      tenant.call(proxy => {
        expect(() => proxy.status).toThrow('Transform error');
        expect(proxy.name).toBe('Shared Resource'); // Other properties work
      });
    });
  });

  describe('Composition with Other Capabilities', () => {
    it('should work with multiple proxy layers', () => {
      // First layer: logging proxy
      const loggedData = new Proxy(sharedData, {
        get(target, key) {
          const value = Reflect.get(target, key);
          return value;
        }
      });

      // Second layer: tenant proxy
      const tenant = createTenantContext(loggedData, 'tenant1', {
        visibleKeys: new Set(['id', 'name']),
        transformGet: (key, value) => {
          if (key === 'name') return value.toUpperCase();
          return value;
        }
      });

      tenant.call(proxy => {
        expect(proxy.name).toBe('SHARED RESOURCE');
        expect(proxy.id).toBe(1);
        expect(proxy.privateData).toBeUndefined();
      });
    });

    it('should maintain isolation across complex scenarios', () => {
      const data = {
        value: 100,
        status: 'active'
      };

      const tenant1 = createTenantContext(data, 'tenant1', {
        virtualProperties: {
          displayValue: function() {
            return `Tenant1: ${this.value}`;
          },
          tenantName: 'Tenant One'
        },
        transformGet: (key, value) => {
          if (key === 'status') return value.toUpperCase();
          return value;
        }
      });

      const tenant2 = createTenantContext(data, 'tenant2', {
        virtualProperties: {
          displayValue: function() {
            return `Tenant2: ${this.value}`;
          },
          tenantName: 'Tenant Two'
        },
        transformGet: (key, value) => {
          if (key === 'status') return `[${value}]`;
          return value;
        }
      });

      // Tenant 1 sees uppercase status and its own virtual properties
      tenant1.call(proxy => {
        expect(proxy.status).toBe('ACTIVE');
        expect(proxy.displayValue).toBe('Tenant1: 100'); // Virtual function auto-called
        expect(proxy.tenantName).toBe('Tenant One');
        expect(proxy.value).toBe(100);
      });

      // Tenant 2 sees bracketed status and its own virtual properties
      tenant2.call(proxy => {
        expect(proxy.status).toBe('[active]');
        expect(proxy.displayValue).toBe('Tenant2: 100'); // Virtual function auto-called
        expect(proxy.tenantName).toBe('Tenant Two');
        expect(proxy.value).toBe(100);
      });

      // Modify shared state through tenant 1
      tenant1.call(proxy => {
        proxy.value = 200;
      });

      // Both tenants see the change
      expect(data.value).toBe(200);

      tenant1.call(proxy => {
        expect(proxy.displayValue).toBe('Tenant1: 200');
      });

      tenant2.call(proxy => {
        expect(proxy.displayValue).toBe('Tenant2: 200');
      });
    });
  });
});
