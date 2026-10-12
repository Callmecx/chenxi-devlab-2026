import type { OrbitSnapshot } from './types';
const natural = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
/** Domain invariants, independent of renderer and planner. Never mutates input. */
export function assertOrbitInvariants(snapshot: OrbitSnapshot): string[] {
  const errors: string[] = [];
  const test = (valid: boolean, code: string) => { if (!valid && !errors.includes(code)) errors.push(code); };
  if (!snapshot || !Array.isArray(snapshot.stations) || !Array.isArray(snapshot.lanes) || !Array.isArray(snapshot.carriers) || !snapshot.task) return ['INVALID_SNAPSHOT'];
  const { stations, lanes, carriers, task } = snapshot;
  test(snapshot.schemaVersion === 3 && natural(snapshot.worldVersion) && snapshot.worldVersion > 0 && natural(snapshot.simTick), 'WORLD_VERSION_OR_TICK');
  test(stations.length === 7 && new Set(stations.map(s => s.id)).size === stations.length, 'STATION_IDS');
  test(carriers.length === 2 && new Set(carriers.map(c => c.id)).size === carriers.length, 'CARRIER_IDS');
  test(new Set(lanes.map(l => l.id)).size === lanes.length, 'LANE_IDS');
  test(stations.some(s => s.id === task.targetId), 'MISSING_TARGET');
  test(natural(task.quantity) && task.quantity > 0 && natural(task.delivered) && task.delivered <= task.quantity && natural(task.initialStock) && natural(task.deadline), 'TASK_QUANTITY');
  for (const s of stations) {
    test(natural(s.stock) && natural(s.reserved) && s.reserved <= s.stock, 'STOCK_OR_RESERVATION');
    test(natural(s.dockCapacity) && s.dockCapacity > 0, 'DOCK_CAPACITY');
    test(s.reserved === carriers.filter(c => c.sourceId === s.id).reduce((sum, c) => sum + c.reserved, 0), 'RESERVATION_OWNERSHIP');
    const occupying = carriers.filter(c => c.transit ? c.transit.to === s.id : c.nodeId === s.id).length;
    test(occupying <= s.dockCapacity, 'DOCK_OVERBOOKED');
  }
  for (const l of lanes) {
    test(stations.some(s => s.id === l.from) && stations.some(s => s.id === l.to) && l.from !== l.to, 'LANE_ENDPOINT');
    test(natural(l.ticks) && l.ticks > 0 && natural(l.energy) && Number.isFinite(l.distance) && l.distance >= 0 && natural(l.capacity) && l.capacity > 0, 'LANE_COST');
    test(carriers.filter(c => c.transit?.laneId === l.id).length <= l.capacity, 'LANE_OVERBOOKED');
  }
  for (const c of carriers) {
    test(natural(c.capacity) && c.capacity > 0 && natural(c.cargo) && natural(c.reserved) && c.cargo + c.reserved <= c.capacity && !(c.cargo && c.reserved), 'CARRIER_CAPACITY');
    test(natural(c.initialEnergy) && natural(c.energy) && c.energy <= c.initialEnergy, 'ENERGY');
    test(natural(c.delivered) && natural(c.waitTicks) && natural(c.totalWait) && c.totalWait >= c.waitTicks && natural(c.priority), 'CARRIER_COUNTER');
    test(stations.some(s => s.id === c.nodeId), 'CARRIER_NODE');
    test(c.sourceId === null ? c.reserved === 0 : stations.some(s => s.id === c.sourceId), 'SOURCE_ID');
    test(natural(c.planVersion) && c.planVersion <= snapshot.worldVersion, 'FUTURE_PLAN');
    test(Array.isArray(c.route) && c.route.every(id => lanes.some(l => l.id === id)), 'ROUTE_ID');
    if (c.route.length) {
      test(c.planVersion === snapshot.worldVersion, 'STALE_ROUTE');
      let node = c.transit?.to ?? c.nodeId;
      for (const id of c.route) {
        const lane = lanes.find(l => l.id === id);
        if (!lane) break;
        test(lane.open, 'CLOSED_PLANNED_LANE');
        if (lane.from === node) node = lane.to;
        else if (lane.bidirectional && lane.to === node) node = lane.from;
        else { test(false, 'DISCONNECTED_ROUTE'); break; }
      }
    }
    if (c.transit) {
      const t = c.transit, lane = lanes.find(l => l.id === t.laneId);
      test(!!lane && (lane.from === t.from && lane.to === t.to || lane.bidirectional && lane.to === t.from && lane.from === t.to), 'TRANSIT_ENDPOINT');
      test(c.nodeId === t.from && natural(t.elapsed) && natural(t.duration) && t.duration === lane?.ticks && t.elapsed < t.duration, 'TRANSIT_PROGRESS');
      // A closed lane may still contain a carrier which entered while it was open.
    }
  }
  test(stations.reduce((sum, s) => sum + s.stock, 0) + carriers.reduce((sum, c) => sum + c.cargo, 0) + task.delivered === task.initialStock, 'STOCK_CONSERVATION');
  test(carriers.reduce((sum, c) => sum + c.delivered, 0) === task.delivered, 'DELIVERY_CONSERVATION');
  test(carriers.reduce((sum, c) => sum + c.cargo + c.reserved, 0) + task.delivered <= task.quantity, 'TASK_OVERALLOCATED');
  test(Array.isArray(snapshot.actionIds) && new Set(snapshot.actionIds).size === snapshot.actionIds.length, 'DUPLICATE_ACTION');
  test(snapshot.status !== 'completed' || task.delivered === task.quantity && carriers.every(c => !c.cargo && !c.reserved), 'FALSE_COMPLETION');
  test(snapshot.status !== 'cancelled' || carriers.every(c => !c.reserved), 'CANCELLED_RESERVATION');
  return errors;
}
