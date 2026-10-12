import type { OrbitScenario, OrbitSnapshot } from './types';

export const ORBIT_PLANNER_VERSION = 'orbit-dijkstra-priority-v3.1';
export const ORBIT_SCENARIOS: OrbitScenario[] = ['normal', 'detour', 'sealed', 'scarce', 'low-energy'];
export const orbitTaskLabel = (stationLabel: string, quantity: number) => `向${stationLabel.split(' · ')[0]}交付${quantity === 3 ? '三' : quantity}份能源组件`;
export function createOrbitFixture(scenario: OrbitScenario, seed: number, runId: string): OrbitSnapshot {
  const stations: OrbitSnapshot['stations'] = [
    { id: 'port', label: '星环港 · 调度起点', kind: 'port', position: [-10, 0, 7], stock: 0, reserved: 0, dockCapacity: 2 },
    { id: 'foundry', label: '铸能仓 · 快线资源', kind: 'resource', position: [-8, 1, -3], stock: 2, reserved: 0, dockCapacity: 1 },
    { id: 'depot', label: '补给仓 · 节能资源', kind: 'resource', position: [-2, 1, 8], stock: scenario === 'scarce' ? 0 : 2, reserved: 0, dockCapacity: 1 },
    { id: 'relay', label: '通信中继 · 航路分流', kind: 'relay', position: [0, 3, -5], stock: 0, reserved: 0, dockCapacity: 1 },
    { id: 'target', label: '曙光站 · 补给目标', kind: 'target', position: [7, 1, 0], stock: 0, reserved: 0, dockCapacity: 2 },
    { id: 'solar', label: '日晷中继 · 低耗慢线', kind: 'relay', position: [7, 3, -7], stock: 0, reserved: 0, dockCapacity: 1 },
    { id: 'junction', label: '交汇站 · 运力调节', kind: 'relay', position: [2, 0, 6], stock: 0, reserved: 0, dockCapacity: 1 },
  ];
  const lanes: OrbitSnapshot['lanes'] = [
    ['port-foundry', 'port', 'foundry', 2, 9, 10],
    ['port-depot', 'port', 'depot', 3, 2, 8],
    ['foundry-relay', 'foundry', 'relay', 2, 8, 8],
    ['depot-junction', 'depot', 'junction', 3, 2, 5],
    ['relay-target', 'relay', 'target', 2, 9, 8],
    ['junction-target', 'junction', 'target', 3, 2, 8],
    ['relay-solar', 'relay', 'solar', 3, 1, 7],
    ['solar-target', 'solar', 'target', 3, 1, 7],
    ['junction-relay', 'junction', 'relay', 4, 2, 9],
  ].map(([id, from, to, ticks, energy, distance]) => ({ id: String(id), from: String(from), to: String(to), ticks: Number(ticks), energy: Number(energy), distance: Number(distance), bidirectional: true, open: scenario !== 'sealed' || (from !== 'port' && to !== 'port'), capacity: 1 }));
  const carriers: OrbitSnapshot['carriers'] = [
    { id: 'carrier-a', label: '巡航者 A', capacity: 2, initialEnergy: scenario === 'low-energy' ? 1 : 70, priority: 2 },
    { id: 'carrier-b', label: '信使 B', capacity: 1, initialEnergy: scenario === 'low-energy' ? 1 : 60, priority: 1 },
  ].map(carrier => ({ ...carrier, energy: carrier.initialEnergy, nodeId: 'port', transit: null, cargo: 0, reserved: 0, sourceId: null, route: [], planVersion: 0, status: 'idle', delivered: 0, waitTicks: 0, totalWait: 0 }));
  return {
    schemaVersion: 3, plannerVersion: ORBIT_PLANNER_VERSION, runId, seed, worldVersion: 1, simTick: 0, status: 'ready', strategy: 'time',
    stations, lanes, carriers,
    task: { id: 'mission-energy', label: orbitTaskLabel(stations.find(s => s.id === 'target')!.label, 3), quantity: 3, targetId: 'target', delivered: 0, initialStock: stations.reduce((sum, station) => sum + station.stock, 0), deadline: 180 },
    message: '三份能源组件等待调度。开始任务后，航线与载体由真实图搜索驱动。', failureCode: null, tools: [], actionIds: [], replans: 0,
    faults: scenario === 'detour' ? [{ tick: 4, laneId: 'relay-target', open: false }] : [], appliedFaults: [],
  };
}
