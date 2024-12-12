// global.d.ts

type Interceptor<TArgs extends any[], TResult> = (target: any, ...args: TArgs) => TResult;

type GetInterceptor<T> = (target: T, prop: keyof T, receiver: any) => any;
type SetInterceptor<T> = (target: T, prop: keyof T, value: any, receiver: any) => boolean;
type HasInterceptor<T> = (target: T, prop: keyof T) => boolean;
type DeletePropertyInterceptor<T> = (target: T, prop: keyof T) => boolean;
type OwnKeysInterceptor<T> = (target: T) => (keyof T | string | symbol)[];
type GetOwnPropertyDescriptorInterceptor<T> = (
  target: T,
  prop: keyof T
) => PropertyDescriptor | undefined;

// Refined Apply and Construct interceptors
type ApplyInterceptor = (target: (...args: any[]) => any, thisArg: any, argsList: any[]) => any;
type ConstructInterceptor = (
  target: new (...args: any[]) => any,
  argsList: any[],
  newTarget: any
) => object;

interface Proxyable<T extends object> {
  proxy: T;
  defineGetInterceptor(interceptor: GetInterceptor<T>): void;
  defineSetInterceptor(interceptor: SetInterceptor<T>): void;
  defineHasInterceptor(interceptor: HasInterceptor<T>): void;
  defineDeletePropertyInterceptor(interceptor: DeletePropertyInterceptor<T>): void;
  defineOwnKeysInterceptor(interceptor: OwnKeysInterceptor<T>): void;
  defineGetOwnPropertyDescriptorInterceptor(
    interceptor: GetOwnPropertyDescriptorInterceptor<T>
  ): void;
  defineApplyInterceptor(interceptor: ApplyInterceptor): void;
  defineConstructInterceptor(interceptor: ConstructInterceptor): void;
}
