import { describe, expect, it } from 'vitest';
import { findPath, isPathValid, isWalkable, samePoint } from './pathfinding';
import type { Point, World } from './types';

type GridWorld = Pick<World, 'width' | 'height' | 'obstacles'>;
const empty = (): GridWorld => ({ width: 12, height: 8, obstacles: [] });

// Independent breadth-first oracle verifies shortest length without A* heuristics.
function shortestDistance(world: GridWorld, start: Point, target: Point): number | null {
  const obstacles = new Set(world.obstacles.map((point) => `${point.x},${point.y}`));
  if (obstacles.has(`${start.x},${start.y}`) || obstacles.has(`${target.x},${target.y}`)) return null;
  const queue = [{ ...start, distance: 0 }];
  const visited = new Set([`${start.x},${start.y}`]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current.x === target.x && current.y === target.y) return current.distance;
    for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0]]) {
      const x = current.x + dx!;
      const y = current.y + dy!;
      const key = `${x},${y}`;
      if (x < 0 || y < 0 || x >= world.width || y >= world.height || visited.has(key) || obstacles.has(key)) continue;
      visited.add(key);
      queue.push({ x, y, distance: current.distance + 1 });
    }
  }
  return null;
}

describe('deterministic grid A*', () => {
  it('finds a cardinal shortest route on the 12 × 8 world, excluding start and including target', () => {
    const start = { x: 0, y: 0 };
    const target = { x: 11, y: 7 };
    const path = findPath(empty(), start, target);
    expect(path).toHaveLength(18);
    expect(path?.[0]).toEqual({ x: 1, y: 0 });
    expect(path?.at(-1)).toEqual(target);
    expect(isPathValid(empty(), start, path!, target)).toBe(true);
  });

  it('takes the shortest detour around a wall, even when it initially moves away from the goal', () => {
    const world = { ...empty(), obstacles: Array.from({ length: 6 }, (_, y) => ({ x: 2, y })) };
    const start = { x: 0, y: 0 };
    const target = { x: 4, y: 0 };
    const path = findPath(world, start, target);
    expect(path).toHaveLength(16);
    expect(path).toContainEqual({ x: 2, y: 6 });
    expect(isPathValid(world, start, path!, target)).toBe(true);
  });

  it('returns the same equal-cost route repeatedly regardless of obstacle order or duplicates', () => {
    const obstacles = [{ x: 5, y: 3 }, { x: 5, y: 4 }, { x: 8, y: 2 }];
    const start = { x: 1, y: 1 };
    const target = { x: 10, y: 6 };
    const expected = findPath({ ...empty(), obstacles }, start, target);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(findPath({ ...empty(), obstacles: [...obstacles].reverse().concat(obstacles) }, start, target)).toEqual(expected);
    }
  });

  it('returns no route for a complete separating wall and for a fully surrounded robot', () => {
    const wall = { ...empty(), obstacles: Array.from({ length: 8 }, (_, y) => ({ x: 2, y })) };
    expect(findPath(wall, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeNull();
    const surrounded = { ...empty(), obstacles: [{ x: 1, y: 0 }, { x: 0, y: 1 }] };
    expect(findPath(surrounded, { x: 0, y: 0 }, { x: 11, y: 7 })).toBeNull();
  });

  it('returns an empty route only when the shared start/goal is valid and unblocked', () => {
    const point = { x: 3, y: 5 };
    expect(findPath(empty(), point, point)).toEqual([]);
    expect(findPath({ ...empty(), obstacles: [point] }, point, point)).toBeNull();
    expect(findPath({ width: 1, height: 1, obstacles: [] }, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([]);
  });

  it('rejects blocked endpoints', () => {
    const world = { ...empty(), obstacles: [{ x: 3, y: 5 }] };
    expect(findPath(world, { x: 3, y: 5 }, { x: 4, y: 5 })).toBeNull();
    expect(findPath(world, { x: 4, y: 5 }, { x: 3, y: 5 })).toBeNull();
  });

  it.each([
    { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 12, y: 0 }, { x: 0, y: 8 },
    { x: 1.5, y: 0 }, { x: 0, y: 1.5 }, { x: NaN, y: 0 }, { x: 0, y: Infinity },
    { x: Number.MAX_SAFE_INTEGER + 1, y: 0 }, null as unknown as Point,
  ])('rejects an invalid point as either endpoint or an obstacle: %j', (point) => {
    expect(findPath(empty(), point, { x: 0, y: 0 })).toBeNull();
    expect(findPath(empty(), { x: 0, y: 0 }, point)).toBeNull();
    expect(findPath({ ...empty(), obstacles: [point] }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
    expect(isWalkable(empty(), point)).toBe(false);
  });

  it.each([
    { width: 0, height: 8 }, { width: 12, height: -1 }, { width: 1.5, height: 8 },
    { width: NaN, height: 8 }, { width: 12, height: Infinity },
    { width: 129, height: 128 }, { width: 16_385, height: 1 },
  ])('rejects invalid or excessively large dimensions: %j', (dimensions) => {
    const world = { ...dimensions, obstacles: [] };
    expect(findPath(world, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
    expect(isWalkable(world, { x: 0, y: 0 })).toBe(false);
    expect(isPathValid(world, { x: 0, y: 0 }, [])).toBe(false);
  });

  it('bounds obstacle input and supports the maximum number of cells', () => {
    const point = { x: 0, y: 0 };
    const invalid = { ...empty(), obstacles: Array.from({ length: 16_385 }, () => ({ x: 11, y: 7 })) };
    expect(findPath(invalid, point, { x: 1, y: 0 })).toBeNull();
    const world = { width: 16_384, height: 1, obstacles: [] };
    const path = findPath(world, point, { x: 16_383, y: 0 });
    expect(path).toHaveLength(16_383);
    expect(isPathValid(world, point, path!, { x: 16_383, y: 0 })).toBe(true);
  });

  it('rejects malformed world/obstacle arrays from recordings without throwing', () => {
    for (const world of [null, { ...empty(), obstacles: null }, { ...empty(), obstacles: [undefined] }]) {
      expect(findPath(world as unknown as GridWorld, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
      expect(isWalkable(world as unknown as GridWorld, { x: 0, y: 0 })).toBe(false);
    }
  });

  it('does not mutate input objects, obstacles, or previous results', () => {
    const world = empty();
    world.obstacles.push({ x: 2, y: 2 });
    const start = { x: 0, y: 0 };
    const target = { x: 2, y: 0 };
    const before = JSON.stringify({ world, start, target });
    const first = findPath(world, start, target)!;
    first[0]!.x = 9;
    expect(JSON.stringify({ world, start, target })).toBe(before);
    expect(findPath(world, start, target)).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  it('matches an independent BFS oracle for every target across 24 seeded obstacle fields', () => {
    for (let seed = 1; seed <= 24; seed += 1) {
      let random = seed;
      const obstacles: Point[] = [];
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 12; x += 1) {
          random = (Math.imul(random, 1_664_525) + 1_013_904_223) >>> 0;
          if ((x !== 0 || y !== 0) && random / 2 ** 32 < 0.32) obstacles.push({ x, y });
        }
      }
      const world = { ...empty(), obstacles };
      const start = { x: 0, y: 0 };
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 12; x += 1) {
          const target = { x, y };
          const path = findPath(world, start, target);
          expect(path?.length ?? null, `seed=${seed}, target=${x},${y}`).toBe(shortestDistance(world, start, target));
          if (path !== null) expect(isPathValid(world, start, path, target)).toBe(true);
        }
      }
    }
  });
});

describe('route validation for runtime world-version checks', () => {
  it('validates a remaining route from the current robot position', () => {
    const world = empty();
    const target = { x: 4, y: 2 };
    const path = findPath(world, { x: 0, y: 0 }, target)!;
    expect(isPathValid(world, path[1]!, path.slice(2), target)).toBe(true);
    expect(isPathValid(world, target, [], target)).toBe(true);
    expect(isPathValid({ width: 1, height: 1, obstacles: [] }, { x: 0, y: 0 }, [])).toBe(true);
  });

  it('rejects a route after an obstacle blocks it or its destination changes', () => {
    const world = empty();
    const start = { x: 0, y: 0 };
    const target = { x: 3, y: 0 };
    const path = findPath(world, start, target)!;
    expect(isPathValid({ ...world, obstacles: [{ x: 2, y: 0 }] }, start, path, target)).toBe(false);
    expect(isPathValid(world, start, path, { x: 4, y: 0 })).toBe(false);
    expect(isPathValid(world, start, [], target)).toBe(false);
  });

  it.each([
    [{ x: 1, y: 1 }],
    [{ x: 2, y: 0 }],
    [{ x: 0, y: 0 }],
    [{ x: 1, y: 0 }, { x: 0, y: 0 }],
    [{ x: -1, y: 0 }],
    [{ x: Infinity, y: 0 }],
    [null as unknown as Point],
  ])('rejects diagonals, jumps, cycles, and invalid cells: %j', (...path) => {
    expect(isPathValid(empty(), { x: 0, y: 0 }, path)).toBe(false);
  });

  it('rejects malformed or excessively long route arrays', () => {
    const start = { x: 0, y: 0 };
    expect(isPathValid(empty(), start, null as unknown as Point[])).toBe(false);
    expect(isPathValid(empty(), start, Array.from({ length: 96 }, () => start))).toBe(false);
  });

  it('distinguishes exact coordinates and checks all four world boundaries', () => {
    expect(samePoint({ x: 2, y: 3 }, { x: 2, y: 3 })).toBe(true);
    expect(samePoint({ x: 2, y: 3 }, { x: 3, y: 2 })).toBe(false);
    for (const point of [{ x: 0, y: 0 }, { x: 11, y: 0 }, { x: 0, y: 7 }, { x: 11, y: 7 }]) {
      expect(isWalkable(empty(), point)).toBe(true);
    }
    expect(isWalkable({ ...empty(), obstacles: [{ x: 11, y: 7 }] }, { x: 11, y: 7 })).toBe(false);
  });
});
