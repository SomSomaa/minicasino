// Kriptográfiai RNG helper
export function randFloat() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  // 0 <= x < 1
  return arr[0] / 2 ** 32;
}

export function randInt(min, maxInclusive) {
  const x = randFloat();
  const span = maxInclusive - min + 1;
  return min + Math.floor(x * span);
}
