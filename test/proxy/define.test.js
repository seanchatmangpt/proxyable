import { describe, it, expect } from 'vitest';
import { createProxy } from '../../src/proxy/create-proxy.js';

describe('createProxy with specialized interceptor definitions', () => {
  it('should handle defineGetInterceptor', () => {
    const { proxy, defineGetInterceptor } = createProxy({ key: 'value' });

    defineGetInterceptor((target, prop) => {
      if (prop === 'dynamic') {
        return 'Intercepted Value';
      }
      return Reflect.get(target, prop);
    });

    expect(proxy.key).toBe('value'); // Original property
    expect(proxy.dynamic).toBe('Intercepted Value'); // Intercepted property
  });

  it('should handle defineSetInterceptor', () => {
    const { proxy, defineSetInterceptor } = createProxy({});

    defineSetInterceptor((target, prop, value) => {
      if (prop === 'age' && typeof value !== 'number') {
        throw new TypeError('Age must be a number.');
      }
      return Reflect.set(target, prop, value);
    });

    proxy.age = 30;
    expect(proxy.age).toBe(30); // Valid set

    expect(() => {
      proxy.age = 'invalid';
    }).toThrow(TypeError); // Invalid set
  });

  it('should handle defineHasInterceptor', () => {
    const { proxy, defineHasInterceptor } = createProxy({ key: 'value' });

    defineHasInterceptor((target, prop) => {
      if (prop === 'hidden') return false; // Hide 'hidden' property from `in`
      return Reflect.has(target, prop);
    });

    expect('key' in proxy).toBe(true); // Key is present
    expect('hidden' in proxy).toBe(false); // Hidden property intercepted
  });

  it('should handle defineDeletePropertyInterceptor', () => {
    const { proxy, defineDeletePropertyInterceptor } = createProxy({
      protectedKey: 'value',
      deletableKey: 'value',
    });

    defineDeletePropertyInterceptor((target, prop) => {
      if (prop === 'protectedKey') {
        throw new Error(`Cannot delete protected property "${prop}".`);
      }
      return Reflect.deleteProperty(target, prop);
    });

    expect(() => {
      delete proxy.protectedKey;
    }).toThrow('Cannot delete protected property "protectedKey".');

    delete proxy.deletableKey;
    expect(proxy.deletableKey).toBeUndefined(); // Successfully deleted
  });

  it('should handle defineOwnKeysInterceptor', () => {
    const { proxy, defineOwnKeysInterceptor, defineGetOwnPropertyDescriptorInterceptor } = createProxy({ key1: 'value1' });

    defineOwnKeysInterceptor(() => ['key1', 'dynamicKey']); // Include dynamicKey
    defineGetOwnPropertyDescriptorInterceptor((target, prop) => {
      if (prop === 'dynamicKey') {
        return { value: 'Dynamic Value', enumerable: true, configurable: true, writable: true };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    });

    const keys = Object.keys(proxy);
    expect(keys).toEqual(['key1', 'dynamicKey']); // Includes dynamicKey
  });

  it('should handle defineGetOwnPropertyDescriptorInterceptor', () => {
    const { proxy, defineGetOwnPropertyDescriptorInterceptor } = createProxy({ key: 'value' });

    defineGetOwnPropertyDescriptorInterceptor((target, prop) => {
      if (prop === 'dynamicKey') {
        return { value: 'Dynamic Value', enumerable: true, configurable: true, writable: true };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    });

    const descriptor = Object.getOwnPropertyDescriptor(proxy, 'dynamicKey');
    expect(descriptor).toEqual({
      value: 'Dynamic Value',
      enumerable: true,
      configurable: true,
      writable: true,
    });

    const keyDescriptor = Object.getOwnPropertyDescriptor(proxy, 'key');
    expect(keyDescriptor.value).toBe('value'); // Original descriptor
  });

  it('should handle defineApplyInterceptor', () => {
    const target = function () {
      return 'Original Output';
    };
    const { proxy, defineApplyInterceptor } = createProxy(target);

    defineApplyInterceptor((target, thisArg, argsList) => {
      if (argsList.includes('intercept')) {
        return 'Intercepted Output';
      }
      return Reflect.apply(target, thisArg, argsList);
    });

    expect(proxy('original')).toBe('Original Output'); // No interception
    expect(proxy('intercept')).toBe('Intercepted Output'); // Intercepted
  });

  it('should handle defineConstructInterceptor', () => {
    const target = function (name) {
      this.name = name;
    };
    const { proxy, defineConstructInterceptor } = createProxy(target);

    defineConstructInterceptor((target, argsList) => {
      if (argsList[0] === 'special') {
        return { name: 'Intercepted Instance' };
      }
      return Reflect.construct(target, argsList);
    });

    const obj1 = new proxy('special');
    expect(obj1.name).toBe('Intercepted Instance'); // Intercepted

    const obj2 = new proxy('normal');
    expect(obj2.name).toBe('normal'); // Original behavior
  });

  it('should validate multiple define interceptors work independently', () => {
    const { proxy, defineGetInterceptor, defineSetInterceptor } = createProxy({ key: 'value' });

    defineGetInterceptor((target, prop) => {
      if (prop === 'dynamic') {
        return 'Intercepted Value';
      }
      return Reflect.get(target, prop);
    });

    defineSetInterceptor((target, prop, value) => {
      if (prop === 'immutable') {
        throw new Error(`Cannot set property "${prop}".`);
      }
      return Reflect.set(target, prop, value);
    });

    expect(proxy.key).toBe('value'); // Original property
    expect(proxy.dynamic).toBe('Intercepted Value'); // Intercepted property

    proxy.key = 'new value';
    expect(proxy.key).toBe('new value'); // Successfully updated

    expect(() => {
      proxy.immutable = 'value';
    }).toThrow('Cannot set property "immutable".'); // Blocked by set interceptor
  });
});
