const { keys: objKeys } = Object;

export function assign<T, U>(obj: T, assignments: U): T & U;
export function assign<T, U, V>(obj: T, a: U, b: V): T & U & V;
export function assign<T, U, V, W>(obj: T, a: U, b: V, c: W): T & U & V & W;
export function assign<T, U, V, W, X>(obj: T, a: U, b: V, c: W, d: X): T & U & V & W & X;
export function assign<T, U, V, W, X, Y>(
  obj: T,
  a: U,
  b: V,
  c: W,
  d: X,
  e: Y
): T & U & V & W & X & Y;
export function assign<T, U, V, W, X, Y, Z>(
  obj: T,
  a: U,
  b: V,
  c: W,
  d: X,
  e: Y,
  f: Z
): T & U & V & W & X & Y & Z;
export function assign(target: any, ...args: any[]): any;
export function assign(obj: any) {
  let length = arguments.length;
  for (let i = 1; i < length; i++) {
    let assignment = arguments[i];
    if (assignment === null || typeof assignment !== 'object') continue;
    let keys = objKeys(assignment);
    let keyLength = keys.length;
    for (let j = 0; j < keyLength; j++) {
      let key = keys[j];
      obj[key] = assignment[key];
    }
  }
  return obj;
}

export function fillNulls<T>(count: number): T[] {
  let arr = new Array(count);

  for (let i = 0; i < count; i++) {
    arr[i] = null;
  }

  return arr;
}

export function values<T>(obj: { [s: string]: T }): T[] {
  const vals = [];
  for (const key in obj) {
    vals.push(obj[key]);
  }
  return vals;
}
