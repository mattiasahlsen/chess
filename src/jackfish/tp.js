/**
 * Transposition table stuff
 * @flow
 */

import Position from './Position';
import { pieces, WHITE, BLACK } from './declarations';
import type { Move } from './declarations';

const Random = require('random-js');
// 27102 is just a random number
const random = new Random(Random.engines.mt19937().seed(27102));

/**
 * Zobrist hashing for positions. Hashed in two parts, low and high.
 *
 * Low is used as key in Map and high is stored at the key
 * together with a value for that position. This is because of
 * javascript's number type that can only store integers up to 52 signed
 * bits and the fact that bitwise operators in javascript only operates on
 * 32 bit signed integers.
 */

// get 2 random 32 bit integers
export function rand() {
  return random.integer(-Math.pow(2, 31), Math.pow(2, 31) - 1);
}

// Makes a hash tuple with low and high
export const make = () => [rand(), rand()];

// initialize hashes array
export const hashes = {};
pieces.forEach(p => {
  hashes[p] = [];
  for (let i = 0; i < 64; i++) {
    hashes[p].push(make()); // [low, high]
  }

  hashes.turn = [];
  hashes.turn[WHITE] = make();
  hashes.turn[BLACK] = make();

  hashes.wc = [make(), make()]; // [queenside, kingside]
  hashes.bc = [make(), make()];

  hashes.epFile = [];
  for (let i = 0; i < 8; i++) {
    hashes.epFile.push(make()); // [A, B, C...]
  }
});

// Hash the position, returning hash as [low, high]
export function hash(pos: Position): [number, number] {
  let low = 0;
  let high = 0;

  // apply [low, high] to low and high
  const applyHashes = (lowAndHigh: [number, number]) => {
    low ^= lowAndHigh[0];
    high ^= lowAndHigh[1];
  }

  applyHashes(hashes.turn[pos.turn]);
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (p) applyHashes(hashes[p][i]);
  }
  if (pos.wc[0]) applyHashes(hashes.wc[0]);
  if (pos.wc[1]) applyHashes(hashes.wc[1]);
  if (pos.bc[0]) applyHashes(hashes.bc[0]);
  if (pos.bc[1]) applyHashes(hashes.bc[1]);
  if (pos.ep !== -1) applyHashes(hashes.epFile[pos.ep % 8]);

  return [low, high];
}

/** Transposition table */

// Entry
type Entry = Move | number; // move or score

// LRU cache, first in first out, size > 0
export class LRU {
  map: Map<number, Array<Entry>> = new Map();
  // max number of keys in map (not max number of entries since there can be
  // many entries in an array at one key)
  maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  size() {
    return this.map.size;
  }

  /** Returns entry at hash, or undefined if there is none. */
  get(hash: [number, number]): ?Entry {
    const low = hash[0];
    const high = hash[1];
    const arr = this.map.get(low);

    if (arr !== undefined) {
      // set to last recently used
      this.map.delete(low);
      this.map.set(low, arr);

      return arr[high];
    }
    return undefined;
  }

  /** Add an entry to the cache. */
  add(hash: [number, number], val: Entry): void {
    const low = hash[0];
    const high = hash[1];
    const arr = this.map.get(low);

    if (arr !== undefined) {
      arr[high] = val;
      this.map.delete(low);
      this.map.set(low, arr);
    } else {
      const arr = [];
      arr[high] = val;
      this.map.set(low, arr);
    }

    if (this.map.size > this.maxSize) {
      // $FlowFixMe
      this.map.delete(this.map.keys().next().value);
    }
  }
}

// A simpler cache, has a max size but just resets when it's reached
export class Cache {
  cache: Array<Array<Entry>> = [];
  maxSize: number;
  currentSize: number = 0;

  constructor(size: number) {
    this.maxSize = size;
  }

  size() {
    return this.currentSize;
  }

  /** Returns entry at hash or undefined if there is none. */
  get(hash: [number, number]): ?Entry {
    const low = hash[0];
    const high = hash[1];

    if (this.cache[low] !== undefined) return this.cache[low][high];
    else return undefined;
  }

  /** Add an entry to the cache. Assumes it does not already exist */
  add(hash: [number, number], val: Entry): void {
    const low = hash[0];
    const high = hash[1];

    // if passed size limit, clear cache and start over
    if (this.currentSize === this.maxSize) {
      this.cache = [];
      this.currentSize = 0;
    }

    if (this.cache[low] !== undefined) {
      if (this.cache[low][high] === undefined) this.currentSize++;
      this.cache[low][high] = val;
    } else {
      this.cache[low] = [];
      this.cache[low][high] = val;
      this.currentSize++;
    }
  }
}
