import type { Point, World } from './types';

type GridWorld = Pick<World, 'width' | 'height' | 'obstacles'>;
interface Grid { width: number; height: number; cells: number; blocked: Set<number> }
interface SearchNode { index: number; distance: number; estimate: number; order: number }

// Bound both the allocation and the number of expanded cells for untrusted recordings.
const MAX_GRID_CELLS = 16_384;
const DIRECTIONS: readonly Point[] = [
  { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
];

function inBounds(grid: Pick<Grid, 'width' | 'height'>, point: Point): boolean {
  return point != null && Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y)
    && point.x >= 0 && point.y >= 0 && point.x < grid.width && point.y < grid.height;
}

function readGrid(world: GridWorld): Grid | null {
  if (world == null || !Number.isSafeInteger(world.width) || !Number.isSafeInteger(world.height)
    || world.width <= 0 || world.height <= 0 || world.width > MAX_GRID_CELLS
    || world.height > MAX_GRID_CELLS || !Array.isArray(world.obstacles)
    || world.obstacles.length > MAX_GRID_CELLS) return null;
  const cells = world.width * world.height;
  if (cells > MAX_GRID_CELLS) return null;
  const grid: Grid = { width: world.width, height: world.height, cells, blocked: new Set() };
  for (const obstacle of world.obstacles) {
    if (!inBounds(grid, obstacle)) return null;
    grid.blocked.add(obstacle.y * grid.width + obstacle.x);
  }
  return grid;
}

function walkable(grid: Grid, point: Point): boolean {
  return inBounds(grid, point) && !grid.blocked.has(point.y * grid.width + point.x);
}

/** Coordinate equality only; bounds and obstacle validation belong to isWalkable. */
export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Invalid dimensions, obstacles, or coordinates are not walkable. */
export function isWalkable(world: GridWorld, point: Point): boolean {
  const grid = readGrid(world);
  return grid !== null && walkable(grid, point);
}

function precedes(a: SearchNode, b: SearchNode): boolean {
  const aScore = a.distance + a.estimate;
  const bScore = b.distance + b.estimate;
  return aScore < bScore || (aScore === bScore
    && (a.estimate < b.estimate || (a.estimate === b.estimate && a.order < b.order)));
}

/** Stable binary min-heap; insertion order resolves equal f/h scores. */
class Frontier {
  private nodes: SearchNode[] = [];

  push(node: SearchNode): void {
    let index = this.nodes.length;
    this.nodes.push(node);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const parentNode = this.nodes[parent]!;
      if (!precedes(node, parentNode)) break;
      this.nodes[index] = parentNode;
      index = parent;
    }
    this.nodes[index] = node;
  }

  pop(): SearchNode | undefined {
    const first = this.nodes[0];
    const last = this.nodes.pop();
    if (this.nodes.length === 0 || last === undefined) return first;
    let index = 0;
    while (index * 2 + 1 < this.nodes.length) {
      const left = index * 2 + 1;
      const right = left + 1;
      const child = right < this.nodes.length && precedes(this.nodes[right]!, this.nodes[left]!)
        ? right : left;
      if (!precedes(this.nodes[child]!, last)) break;
      this.nodes[index] = this.nodes[child]!;
      index = child;
    }
    this.nodes[index] = last;
    return first;
  }
}

/**
 * Deterministic A* with Manhattan distance and unit-cost cardinal moves.
 * Returns a shortest path excluding start and including target, or null for
 * invalid input / no route. A valid start equal to target returns [].
 * Dimensions must be positive safe integers with at most 16,384 total cells;
 * obstacle entries must be valid cells (duplicates are allowed, up to 16,384).
 * Never mutates the world, start, or target.
 */
export function findPath(world: GridWorld, start: Point, target: Point): Point[] | null {
  const grid = readGrid(world);
  if (grid === null || !walkable(grid, start) || !walkable(grid, target)) return null;
  if (samePoint(start, target)) return [];

  const startIndex = start.y * grid.width + start.x;
  const targetIndex = target.y * grid.width + target.x;
  const distance = new Float64Array(grid.cells).fill(Infinity);
  const previous = new Int32Array(grid.cells).fill(-1);
  const closed = new Uint8Array(grid.cells);
  const frontier = new Frontier();
  let order = 0;
  let expanded = 0;
  const heuristic = (point: Point) => Math.abs(point.x - target.x) + Math.abs(point.y - target.y);
  distance[startIndex] = 0;
  frontier.push({ index: startIndex, distance: 0, estimate: heuristic(start), order: order++ });

  while (expanded < grid.cells) {
    const current = frontier.pop();
    if (current === undefined) return null;
    // A lower-cost entry can supersede an earlier entry without mutating the heap.
    if (closed[current.index] || current.distance !== distance[current.index]) continue;
    closed[current.index] = 1;
    expanded += 1;
    if (current.index === targetIndex) {
      const path: Point[] = [];
      let index = targetIndex;
      for (let steps = 0; steps < grid.cells && index !== startIndex; steps += 1) {
        if (index < 0) return null;
        path.push({ x: index % grid.width, y: Math.floor(index / grid.width) });
        index = previous[index]!;
      }
      return index === startIndex ? path.reverse() : null;
    }
    const point = { x: current.index % grid.width, y: Math.floor(current.index / grid.width) };
    for (const direction of DIRECTIONS) {
      const next = { x: point.x + direction.x, y: point.y + direction.y };
      if (!walkable(grid, next)) continue;
      const nextIndex = next.y * grid.width + next.x;
      const nextDistance = current.distance + 1;
      if (closed[nextIndex] || nextDistance >= distance[nextIndex]!) continue;
      distance[nextIndex] = nextDistance;
      previous[nextIndex] = current.index;
      frontier.push({ index: nextIndex, distance: nextDistance, estimate: heuristic(next), order: order++ });
    }
  }
  return null;
}

/**
 * Validate a simple remaining route against the CURRENT grid and optional target.
 * The caller must also compare its planned worldVersion with the current version;
 * route geometry alone cannot establish freshness after unrelated world changes.
 */
export function isPathValid(world: GridWorld, start: Point, path: readonly Point[], target?: Point): boolean {
  const grid = readGrid(world);
  if (grid === null || !walkable(grid, start) || !Array.isArray(path) || path.length >= grid.cells
    || (target !== undefined && !walkable(grid, target))) return false;
  let previous = start;
  const seen = new Set([start.y * grid.width + start.x]);
  for (const point of path) {
    if (!walkable(grid, point) || Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) !== 1) return false;
    const index = point.y * grid.width + point.x;
    if (seen.has(index)) return false;
    seen.add(index);
    previous = point;
  }
  return target === undefined || samePoint(previous, target);
}
