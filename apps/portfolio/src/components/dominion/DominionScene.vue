<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import {
  BRIDGE_ANCHOR,
  BRIDGE_SCALE,
  BRIDGE_YAW,
  createDominionAssets,
  type PlanetModel,
  type ShipModel,
  type StationModel,
} from "./assets";
import type {
  CameraMode,
  DominionSnapshot,
  Quality,
  Resource,
  SceneMetrics,
  Selection,
  Ship,
} from "../../../../../packages/intelligence/src/dominion/types";

const props = defineProps<{
  snapshot: DominionSnapshot;
  selected: Selection | null;
  camera: CameraMode;
  cameraRequest: number;
  quality: Quality;
  reduced: boolean;
}>();
const emit = defineEmits<{
  select: [Selection];
  "camera-interrupt": [];
  "context-lost": [];
  metrics: [SceneMetrics];
}>();
const host = ref<HTMLDivElement>();
const hoverText = ref("");
const failed = ref(false);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#040911");
scene.fog = new THREE.FogExp2("#071421", 0.0038);
const sceneCamera = new THREE.PerspectiveCamera(43, 1.6, 0.06, 330);
const focus = new THREE.Vector3(-3, 1, 3),
  desiredFocus = focus.clone();
const orbit = new THREE.Spherical(61, 1.07, 0.28),
  desiredOrbit = orbit.clone();
const cameraOffset = new THREE.Vector3();
const cockpitEye = new THREE.Vector3();
const cockpitLook = new THREE.Spherical(18, Math.PI / 2, Math.PI);
let cockpitFov = 58;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const axisY = new THREE.Vector3(0, 1, 0);
const a = new THREE.Vector3(),
  b = new THREE.Vector3(),
  direction = new THREE.Vector3();
const id = `dominion-${Math.random().toString(36).slice(2, 9)}`;
let renderer: THREE.WebGLRenderer | undefined;
let assets: ReturnType<typeof createDominionAssets> | undefined;
let observer: ResizeObserver | undefined;
let world: THREE.Group | undefined;
let environment: THREE.Group | undefined;
let bridge: THREE.Group | undefined;
let planets: PlanetModel[] = [];
let selectionRing: THREE.Mesh | undefined;
const stations = new Map<string, StationModel>();
const ships = new Map<
  string,
  ShipModel & { target: THREE.Vector3; yaw: number }
>();
const lanes = new Map<
  string,
  {
    group: THREE.Group;
    material: THREE.MeshStandardMaterial;
    arrows: THREE.Mesh[];
  }
>();
const labels = new Map<string, THREE.Sprite>();
const effects = new Map<string, { beam: THREE.Mesh; ring: THREE.Mesh }>();
const pickable: THREE.Object3D[] = [];
const frameSamples: number[] = [];
const removers: (() => void)[] = [];
let frame = 0,
  frames = 0,
  lastRender = 0,
  lastMetric = 0;
let disposed = false,
  contextLost = false,
  compact = false,
  manualCamera = false;
let pixels = 0,
  topology = "",
  assetSession = "",
  priorSession = "",
  priorTick = -1;
let wasOnDemand: boolean | undefined;
let hover: Selection | null = null;
let drag: {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
} | null = null;

function stationPoint(stationId: string, result: THREE.Vector3, lift = 1.2) {
  const station = props.snapshot.stations.find((item) => item.id === stationId);
  if (station) result.set(...station.position);
  else result.set(0, 0, 0);
  result.y += lift;
  return result;
}
function shipBerth(ship: Ship, nodeId: string, result: THREE.Vector3) {
  stationPoint(nodeId, result);
  const index = Math.max(
    0,
    props.snapshot.ships.findIndex((item) => item.id === ship.id),
  );
  if (nodeId === "port") {
    result.x += index % 2 ? -3.1 : 3.1;
    result.z += 7.4 - Math.floor(index / 2) * 3.3;
    result.y += 0.03;
  } else {
    const roleIndex =
      ship.role === "transport" ? 0 : ship.role === "survey" ? 1 : 2;
    const angle = (roleIndex * Math.PI * 2) / 3 + (index % 2 ? 0.42 : -0.42);
    result.x += Math.sin(angle) * 2.8;
    result.z += Math.cos(angle) * 2.8;
    result.y += roleIndex === 1 ? 0.6 : 0;
  }
  return result;
}
function shipPoint(ship: Ship, result: THREE.Vector3) {
  if (!ship.transit) return shipBerth(ship, ship.nodeId, result);
  shipBerth(ship, ship.transit.from, result);
  const destination = new THREE.Vector3();
  shipBerth(ship, ship.transit.to, destination);
  return result.lerp(
    destination,
    THREE.MathUtils.clamp(
      ship.transit.elapsed / Math.max(1, ship.transit.duration),
      0,
      1,
    ),
  );
}
function trackedShip() {
  return (
    props.snapshot.ships.find(
      (ship) =>
        props.selected?.kind === "ship" && ship.id === props.selected.id,
    ) ||
    (props.camera === "scan"
      ? props.snapshot.ships.find(
          (ship) => ship.role === "survey" && ship.action?.kind === "scan",
        ) || props.snapshot.ships.find((ship) => ship.role === "survey")
      : undefined) ||
    props.snapshot.ships.find((ship) => ship.transit || ship.action) ||
    props.snapshot.ships[0]
  );
}
function selectionPoint(selection: Selection | null, result: THREE.Vector3) {
  if (selection?.kind === "station")
    return stationPoint(selection.id, result, 1.1);
  if (selection?.kind === "ship") {
    const ship = props.snapshot.ships.find((item) => item.id === selection.id);
    if (ship) return shipPoint(ship, result);
  }
  if (selection?.kind === "lane") {
    const lane = props.snapshot.lanes.find((item) => item.id === selection.id);
    if (lane) {
      stationPoint(lane.from, result);
      stationPoint(lane.to, b);
      return result.lerp(b, 0.5);
    }
  }
  return result.set(-3, 1, 3);
}
function selectedPlanet() {
  let stationId =
    props.selected?.kind === "station" ? props.selected.id : "ice";
  if (props.selected?.kind === "ship") {
    const ship = props.snapshot.ships.find(
      (item) => item.id === props.selected!.id,
    );
    stationId = ship?.transit?.to || ship?.nodeId || stationId;
  } else if (props.selected?.kind === "lane") {
    stationId =
      props.snapshot.lanes.find((item) => item.id === props.selected!.id)?.to ||
      stationId;
  }
  const region =
    props.snapshot.stations.find((item) => item.id === stationId)?.regionId ||
    "frost";
  return planets.find((item) => item.id === region) || planets[0];
}
function ensureBridge() {
  if (!assets || !world || bridge) return;
  bridge = assets.bridge();
  const port = props.snapshot.stations.find((station) => station.id === "port");
  bridge.position.set(...(port?.position || [-15, 0, 10]));
  bridge.position.add(new THREE.Vector3(...BRIDGE_ANCHOR));
  bridge.rotation.y = BRIDGE_YAW;
  bridge.scale.setScalar(BRIDGE_SCALE);
  bridge.name = "dominion-command-bridge";
  world.add(bridge);
  bridge.updateMatrixWorld(true);
  assets.updateBridge(props.snapshot, props.selected);
}
function cameraProjection() {
  if (!host.value) return;
  const width = Math.max(1, host.value.clientWidth),
    height = Math.max(1, host.value.clientHeight);
  sceneCamera.fov = props.camera === "cockpit" ? cockpitFov : compact ? 51 : 43;
  sceneCamera.aspect = width / height;
  const framed = props.camera === "overview";
  sceneCamera.setViewOffset(
    width,
    height,
    framed ? -width * (compact ? 0.17 : 0.04) : 0,
    framed ? -height * (compact ? 0.09 : 0) : 0,
    width,
    height,
  );
  sceneCamera.updateProjectionMatrix();
}
function configureCamera() {
  if (drag) return;
  manualCamera = false;
  if (bridge) bridge.visible = props.camera === "cockpit";
  // The initial view is a port-side approach, not a fit-all tactical map.
  // Both the forward transport berth and ring crown remain inside the frustum.
  desiredFocus.set(compact ? -16 : -15, compact ? 1 : 2, compact ? 8 : 11);
  desiredOrbit.setFromVector3(
    new THREE.Vector3(
      compact ? -10 : -8,
      compact ? 15 : 11,
      compact ? 41 : 29,
    ).sub(desiredFocus),
  );
  const ship = trackedShip();
  if (props.camera === "follow" || props.camera === "scan") {
    if (ship) shipPoint(ship, desiredFocus);
    desiredOrbit.set(
      compact ? 14.8 : 10.2,
      1.06,
      props.camera === "scan" ? -0.72 : 0.52,
    );
  } else if (props.camera === "docking") {
    if (ship) shipPoint(ship, desiredFocus);
    else stationPoint("port", desiredFocus);
    desiredFocus.y += 0.25;
    desiredOrbit.set(compact ? 15 : 11, 1.23, -0.65);
  } else if (props.camera === "inspect") {
    selectionPoint(props.selected, desiredFocus);
    const station = props.snapshot.stations.find(
      (item) => item.id === props.selected?.id,
    );
    const radius =
      props.selected?.kind === "ship" ? 9.5 : station?.id === "port" ? 29 : 15;
    desiredOrbit.set(radius * (compact ? 1.35 : 1), 1.12, 0.44);
  } else if (props.camera === "planet") {
    const planet = selectedPlanet();
    if (planet) {
      const regionStations = props.snapshot.stations.filter(
        (station) => station.regionId === planet.id,
      );
      const anchor = new THREE.Vector3();
      for (const station of regionStations)
        anchor.add(new THREE.Vector3(...station.position));
      if (regionStations.length) anchor.divideScalar(regionStations.length);
      desiredFocus.copy(anchor).lerp(planet.group.position, 0.32);
      // Keep the real regional stations in front of the limb, so observation
      // still offers selectable operational objects, not an isolated planet.
      desiredOrbit.setFromVector3(
        anchor
          .clone()
          .add(new THREE.Vector3(compact ? 7 : 10, 12, compact ? 45 : 36))
          .sub(desiredFocus),
      );
    }
  } else if (props.camera === "cockpit") {
    ensureBridge();
    if (bridge) {
      bridge.visible = true;
      bridge.updateMatrixWorld(true);
      cockpitEye.set(0, 2.65, 2.6).applyMatrix4(bridge.matrixWorld);
      cockpitLook.set(18, Math.PI / 2 + 0.19, Math.PI + bridge.rotation.y);
      cockpitFov = compact ? 72 : 58;
      cameraOffset.setFromSpherical(cockpitLook);
      desiredFocus.copy(cockpitEye).add(cameraOffset);
      desiredOrbit.setFromVector3(cockpitEye.clone().sub(desiredFocus));
    }
  }
  cameraProjection();
  if (props.reduced || props.camera === "cockpit") {
    focus.copy(desiredFocus);
    orbit.copy(desiredOrbit);
  }
}
function clearWorld() {
  if (world) scene.remove(world);
  if (environment) scene.remove(environment);
  assets?.dispose();
  renderer?.renderLists.dispose();
  if (drag && renderer?.domElement.hasPointerCapture(drag.id))
    renderer.domElement.releasePointerCapture(drag.id);
  drag = null;
  hover = null;
  hoverText.value = "";
  selectionRing = undefined;
  assetSession = "";
  frameSamples.length = 0;
  lastRender = 0;
  lastMetric = 0;
  world = undefined;
  environment = undefined;
  bridge = undefined;
  planets = [];
  stations.clear();
  ships.clear();
  lanes.clear();
  labels.clear();
  effects.clear();
  pickable.length = 0;
}
function rebuildWorld() {
  clearWorld();
  topology = topologyKey();
  assetSession = props.snapshot.sessionId;
  assets = createDominionAssets();
  world = new THREE.Group();
  const sky = assets.environment();
  environment = sky.group;
  planets = sky.planets;
  scene.add(environment, world);
  for (const station of props.snapshot.stations) {
    const model = assets.station(station);
    model.group.userData.selection = {
      kind: "station",
      id: station.id,
    } satisfies Selection;
    stations.set(station.id, model);
    world.add(model.group);
    pickable.push(model.group);
    const label = assets.label(station.label);
    label.position.set(
      station.position[0],
      station.position[1] + (station.id === "port" ? 9.7 : 4.8),
      station.position[2],
    );
    label.visible = false;
    labels.set(station.id, label);
    world.add(label);
  }
  const shaft = assets.keep(new THREE.CylinderGeometry(1, 1, 1, 5));
  const arrow = assets.keep(new THREE.ConeGeometry(0.2, 0.56, 3));
  for (const lane of props.snapshot.lanes) {
    const group = new THREE.Group();
    group.userData.selection = {
      kind: "lane",
      id: lane.id,
    } satisfies Selection;
    const material = assets.material("#376473", 0.18, 0.65);
    material.emissive.set("#193f48");
    material.emissiveIntensity = 0.32;
    stationPoint(lane.from, a);
    stationPoint(lane.to, b);
    direction.subVectors(b, a);
    const tube = new THREE.Mesh(shaft, material);
    tube.position.copy(a).add(b).multiplyScalar(0.5);
    tube.scale.set(0.035, direction.length(), 0.035);
    tube.quaternion.setFromUnitVectors(axisY, direction.clone().normalize());
    group.add(tube);
    const arrows: THREE.Mesh[] = [];
    for (const ratio of [0.24, 0.76]) {
      const marker = new THREE.Mesh(arrow, material);
      marker.position.copy(a).lerp(b, ratio);
      marker.quaternion.setFromUnitVectors(
        axisY,
        direction
          .clone()
          .normalize()
          .multiplyScalar(ratio < 0.5 ? -1 : 1),
      );
      group.add(marker);
      arrows.push(marker);
    }
    lanes.set(lane.id, { group, material, arrows });
    pickable.push(group);
    world.add(group);
  }
  const effectGeo = assets.keep(new THREE.CylinderGeometry(0.025, 0.025, 1, 6));
  const scanGeo = assets.keep(new THREE.TorusGeometry(1, 0.03, 6, 48));
  for (const ship of props.snapshot.ships) {
    const model = assets.ship(ship.role);
    model.group.userData.selection = {
      kind: "ship",
      id: ship.id,
    } satisfies Selection;
    ships.set(ship.id, { ...model, target: new THREE.Vector3(), yaw: 0 });
    pickable.push(model.group);
    world.add(model.group);
    const beamMat = new THREE.MeshBasicMaterial({
      color: ship.role === "survey" ? "#8bdded" : "#eeb575",
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    assets.materials.add(beamMat);
    const beam = new THREE.Mesh(effectGeo, beamMat),
      ring = new THREE.Mesh(scanGeo, beamMat);
    beam.visible = false;
    ring.visible = false;
    effects.set(ship.id, { beam, ring });
    world.add(beam, ring);
  }
  const selectionMaterial = new THREE.MeshBasicMaterial({
    color: "#b2f9e4",
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  assets.materials.add(selectionMaterial);
  selectionRing = new THREE.Mesh(
    assets.keep(new THREE.TorusGeometry(1, 0.035, 6, 64)),
    selectionMaterial,
  );
  selectionRing.rotation.x = Math.PI / 2;
  selectionRing.visible = false;
  world.add(selectionRing);
  priorSession = "";
  updateFacts();
  configureCamera();
  focus.copy(desiredFocus);
  orbit.copy(desiredOrbit);
}
function updateFacts() {
  assets?.updateBridge(props.snapshot, props.selected);
  const snap =
    props.reduced ||
    props.snapshot.status !== "running" ||
    priorSession !== props.snapshot.sessionId ||
    props.snapshot.tick < priorTick;
  for (const ship of props.snapshot.ships) {
    const model = ships.get(ship.id);
    if (!model) continue;
    shipPoint(ship, model.target);
    if (ship.transit) {
      shipBerth(ship, ship.transit.from, a);
      shipBerth(ship, ship.transit.to, b);
      direction.subVectors(b, a);
      model.yaw = Math.atan2(direction.x, direction.z);
    } else model.yaw = ship.nodeId === "port" ? Math.PI : 0;
    if (snap) {
      model.group.position.copy(model.target);
      model.group.rotation.y = model.yaw;
    }
    for (const resource of [
      "energy",
      "supplies",
      "parts",
      "samples",
    ] as Resource[])
      model.cargo[resource].forEach((cell, index) => {
        cell.visible =
          ship.cargo[resource] >
          index * Math.max(1, Math.ceil(ship.capacity / 4));
      });
    model.engines.visible =
      !!ship.transit && ship.status === "moving" && !ship.disabled;
    model.scanner.visible = ship.action?.kind === "scan";
    model.lift.visible =
      ship.action?.kind === "load" || ship.action?.kind === "deliver";
    const progress = ship.action
      ? THREE.MathUtils.clamp(
          ship.action.elapsed / Math.max(1, ship.action.duration),
          0,
          1,
        )
      : 0;
    model.lift.position.y =
      1.02 + (ship.action?.kind === "load" ? 1 - progress : progress) * 0.55;
    model.tools.rotation.y =
      ship.action?.kind === "repair" || ship.action?.kind === "rescue"
        ? Math.sin(progress * Math.PI) * 0.12
        : 0;
    model.scanner.rotation.z = progress * Math.PI * 1.4;
  }
  priorSession = props.snapshot.sessionId;
  priorTick = props.snapshot.tick;
  const activeRoutes = new Set(
    props.snapshot.ships.flatMap((ship) => ship.route),
  );
  for (const lane of props.snapshot.lanes) {
    const view = lanes.get(lane.id);
    if (!view) continue;
    const selected =
      (props.selected?.kind === "lane" && props.selected.id === lane.id) ||
      (hover?.kind === "lane" && hover.id === lane.id);
    const occupied = props.snapshot.ships.some(
      (ship) => ship.transit?.laneId === lane.id,
    );
    const active = occupied || activeRoutes.has(lane.id);
    const color = !lane.open
      ? "#e26e62"
      : lane.damaged
        ? "#cc9860"
        : selected
          ? "#d8fff4"
          : active
            ? "#85dece"
            : "#2b5263";
    view.material.color.set(color);
    view.material.emissive.set(color);
    view.material.emissiveIntensity = selected
      ? 0.95
      : active
        ? 0.6
        : lane.open && !lane.damaged
          ? 0.1
          : 0.4;
    view.arrows.forEach((arrow) =>
      arrow.scale.setScalar(active || selected ? 1.3 : 0.8),
    );
  }
  for (const station of props.snapshot.stations) {
    const model = stations.get(station.id);
    if (!model || !assets) continue;
    model.damage.visible = station.damaged;
    const activeShips = props.snapshot.ships.filter(
      (ship) => ship.nodeId === station.id && ship.action,
    );
    model.berthLights.forEach((lamp, index) => {
      lamp.material =
        index < station.blockedBerths
          ? assets!.palette.red
          : index < station.blockedBerths + activeShips.length
            ? assets!.palette.amber
            : assets!.palette.cyan;
    });
    const label = labels.get(station.id);
    if (label)
      label.visible =
        props.camera !== "cockpit" &&
        (props.selected?.id === station.id || hover?.id === station.id);
  }
  updateSelection();
}
function updateSelection() {
  if (!selectionRing) return;
  const selected = hover || props.selected;
  selectionRing.visible = !!selected && props.camera !== "cockpit";
  if (selected) {
    selectionPoint(selected, selectionRing.position);
    selectionRing.position.y -= 0.9;
    selectionRing.scale.setScalar(
      selected.kind === "station"
        ? selected.id === "port"
          ? 6
          : 2.8
        : selected.kind === "ship"
          ? 2
          : 0.9,
    );
  }
}
function updateEffects() {
  for (const ship of props.snapshot.ships) {
    const effect = effects.get(ship.id),
      model = ships.get(ship.id);
    if (!effect || !model) continue;
    const action = ship.action;
    const visible =
      !!action && ["scan", "repair", "rescue"].includes(action.kind);
    effect.beam.visible = visible;
    effect.ring.visible = visible && action?.kind === "scan";
    if (!visible || !action) continue;
    const targetShip = props.snapshot.ships.find(
      (item) => item.id === action.targetId,
    );
    if (targetShip) shipPoint(targetShip, b);
    else stationPoint(action.targetId, b);
    a.copy(model.group.position);
    a.y += 0.4;
    direction.subVectors(b, a);
    effect.beam.position.copy(a).add(b).multiplyScalar(0.5);
    effect.beam.scale.set(1, Math.max(0.1, direction.length()), 1);
    effect.beam.quaternion.setFromUnitVectors(axisY, direction.normalize());
    effect.ring.position.copy(b);
    effect.ring.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction,
    );
    effect.ring.scale.setScalar(
      0.9 +
        THREE.MathUtils.clamp(
          action.elapsed / Math.max(1, action.duration),
          0,
          1,
        ) *
          1.3,
    );
  }
}
function pick(event: PointerEvent): Selection | null {
  if (!renderer) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    (-(event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, sceneCamera);
  for (const hit of raycaster.intersectObjects(pickable, true)) {
    let object: THREE.Object3D | null = hit.object;
    while (object) {
      if (object.userData.selection)
        return object.userData.selection as Selection;
      object = object.parent;
    }
  }
  return null;
}
function takeCamera() {
  manualCamera = true;
  desiredFocus.copy(focus);
  desiredOrbit.copy(orbit);
  emit("camera-interrupt");
}
function pointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  renderer?.domElement.setPointerCapture(event.pointerId);
  drag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };
  takeCamera();
  wake();
}
function pointerMove(event: PointerEvent) {
  if (drag?.id === event.pointerId) {
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    drag.moved ||=
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;
    if (drag.moved) {
      if (props.camera === "cockpit") {
        cockpitLook.theta -= dx * 0.004;
        cockpitLook.phi = THREE.MathUtils.clamp(
          cockpitLook.phi - dy * 0.004,
          0.3,
          2.55,
        );
      } else {
        orbit.theta -= dx * 0.005;
        orbit.phi = THREE.MathUtils.clamp(orbit.phi - dy * 0.005, 0.15, 1.49);
        desiredOrbit.copy(orbit);
      }
      wake();
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
  } else {
    const result = pick(event);
    if (result?.kind !== hover?.kind || result?.id !== hover?.id) {
      hover = result;
      hoverText.value =
        result?.kind === "station"
          ? props.snapshot.stations.find((item) => item.id === result.id)
              ?.label || "站点"
          : result?.kind === "ship"
            ? props.snapshot.ships.find((item) => item.id === result.id)
                ?.label || "舰船"
            : result
              ? (() => {
                  const lane = props.snapshot.lanes.find(
                    (item) => item.id === result.id,
                  );
                  return !lane?.open
                    ? "航道已关闭 · 查看许可"
                    : lane.damaged
                      ? "航道损坏 · 需要维修"
                      : "开放航道 · 查看约束";
                })()
              : "";
      if (renderer)
        renderer.domElement.style.cursor = result ? "pointer" : "grab";
      updateFacts();
      wake();
    }
  }
}
function pointerUp(event: PointerEvent) {
  if (drag?.id !== event.pointerId) return;
  if (!drag.moved) {
    const selected = pick(event);
    if (selected) emit("select", selected);
  }
  if (renderer?.domElement.hasPointerCapture(event.pointerId))
    renderer.domElement.releasePointerCapture(event.pointerId);
  drag = null;
  wake();
}
function pointerLeave() {
  if (drag || !hover) return;
  hover = null;
  hoverText.value = "";
  if (renderer) renderer.domElement.style.cursor = "grab";
  updateFacts();
  wake();
}
function wheel(event: WheelEvent) {
  event.preventDefault();
  takeCamera();
  if (props.camera === "cockpit") {
    cockpitFov = THREE.MathUtils.clamp(
      cockpitFov + event.deltaY * 0.025,
      38,
      78,
    );
    cameraProjection();
  } else {
    orbit.radius = THREE.MathUtils.clamp(
      orbit.radius * Math.exp(event.deltaY * 0.001),
      4,
      140,
    );
    desiredOrbit.copy(orbit);
  }
  wake();
}
function keydown(event: KeyboardEvent) {
  if (
    ![
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "+",
      "-",
      "Home",
    ].includes(event.key)
  )
    return;
  event.preventDefault();
  takeCamera();
  if (event.key === "Home") configureCamera();
  else if (props.camera === "cockpit") {
    if (event.key === "ArrowLeft") cockpitLook.theta -= 0.08;
    else if (event.key === "ArrowRight") cockpitLook.theta += 0.08;
    else if (event.key === "ArrowUp" || event.key === "ArrowDown")
      cockpitLook.phi = THREE.MathUtils.clamp(
        cockpitLook.phi + (event.key === "ArrowUp" ? -0.06 : 0.06),
        0.3,
        2.55,
      );
    else {
      cockpitFov = THREE.MathUtils.clamp(
        cockpitFov + (event.key === "+" ? -3 : 3),
        38,
        78,
      );
      cameraProjection();
    }
  } else {
    if (event.key === "+") orbit.radius = Math.max(4, orbit.radius - 2);
    else if (event.key === "-") orbit.radius = Math.min(140, orbit.radius + 2);
    else if (event.key === "ArrowLeft") orbit.theta -= 0.08;
    else if (event.key === "ArrowRight") orbit.theta += 0.08;
    else
      orbit.phi = THREE.MathUtils.clamp(
        orbit.phi + (event.key === "ArrowUp" ? -0.06 : 0.06),
        0.15,
        1.49,
      );
    desiredOrbit.copy(orbit);
  }
  wake();
}
function resize() {
  if (!host.value || !renderer) return;
  const width = Math.max(1, host.value.clientWidth),
    height = Math.max(1, host.value.clientHeight);
  compact = width < 650 || width / height < 0.7;
  const cap =
    props.quality === "high"
      ? 2100000
      : props.quality === "mobile"
        ? 800000
        : 1600000;
  const dprCap =
    props.quality === "high" ? 2 : props.quality === "mobile" ? 1.25 : 1.5;
  const dpr = Math.min(
    devicePixelRatio || 1,
    dprCap,
    Math.sqrt(cap / (width * height)),
  );
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  pixels = renderer.domElement.width * renderer.domElement.height;
  configureCamera();
  updateFacts();
  renderer.domElement.dataset.pixels = String(pixels);
  renderer.domElement.dataset.quality = props.quality;
  wake();
}
function animate(now: number) {
  frame = 0;
  if (renderer) renderer.domElement.dataset.rafPending = "0";
  if (disposed || contextLost || document.hidden || !renderer) return;
  const onDemand = props.reduced && props.snapshot.status !== "running";
  const modeChanged = onDemand !== wasOnDemand;
  renderer.domElement.dataset.renderMode = onDemand
    ? "on-demand"
    : "continuous";
  if (modeChanged) {
    lastRender = 0;
    frameSamples.length = 0;
    wasOnDemand = onDemand;
  }
  if (!onDemand) {
    frame = requestAnimationFrame(animate);
    renderer.domElement.dataset.rafPending = "1";
  }
  const interval = props.quality === "mobile" ? 1000 / 30 : 1000 / 60;
  if (!onDemand && lastRender && now - lastRender < interval - 0.5) return;
  if (!onDemand && lastRender) {
    frameSamples.push(now - lastRender);
    if (frameSamples.length > 240) frameSamples.shift();
  }
  const delta =
    !onDemand && lastRender ? Math.min((now - lastRender) / 1000, 0.1) : 1;
  lastRender = onDemand ? 0 : now;
  const blend =
    props.reduced || props.snapshot.status !== "running"
      ? 1
      : 1 - Math.exp(-delta * 12);
  for (const model of ships.values()) {
    model.group.position.lerp(model.target, blend);
    model.group.rotation.y +=
      Math.atan2(
        Math.sin(model.yaw - model.group.rotation.y),
        Math.cos(model.yaw - model.group.rotation.y),
      ) * blend;
  }
  if (!manualCamera && ["follow", "scan", "docking"].includes(props.camera)) {
    const ship = trackedShip();
    const model = ship ? ships.get(ship.id) : undefined;
    if (model) desiredFocus.copy(model.group.position);
  }
  if (props.camera === "cockpit") {
    cameraOffset.setFromSpherical(cockpitLook);
    focus.copy(cockpitEye).add(cameraOffset);
    desiredFocus.copy(focus);
    sceneCamera.position.copy(cockpitEye);
    sceneCamera.lookAt(focus);
    orbit.setFromVector3(sceneCamera.position.clone().sub(focus));
    desiredOrbit.copy(orbit);
  } else {
    const ease = props.reduced || drag ? 1 : 1 - Math.exp(-delta * 5);
    focus.lerp(desiredFocus, ease);
    orbit.radius = THREE.MathUtils.lerp(
      orbit.radius,
      desiredOrbit.radius,
      ease,
    );
    orbit.theta = THREE.MathUtils.lerp(orbit.theta, desiredOrbit.theta, ease);
    orbit.phi = THREE.MathUtils.lerp(orbit.phi, desiredOrbit.phi, ease);
    cameraOffset.setFromSpherical(orbit);
    sceneCamera.position.copy(focus).add(cameraOffset);
    sceneCamera.lookAt(focus);
  }
  updateEffects();
  renderer.render(scene, sceneCamera);
  frames++;
  renderer.domElement.dataset.frames = String(frames);
  renderer.domElement.dataset.camera = props.camera;
  renderer.domElement.dataset.cameraRequest = String(props.cameraRequest);
  renderer.domElement.dataset.worldVersion = String(
    props.snapshot.worldVersion,
  );
  renderer.domElement.dataset.tick = String(props.snapshot.tick);
  renderer.domElement.dataset.shipCount = String(ships.size);
  renderer.domElement.dataset.bridge = bridge?.visible ? "visible" : "hidden";
  if (modeChanged || now - lastMetric >= 3000) {
    const sorted = [...frameSamples].sort((x, y) => x - y);
    const metrics: SceneMetrics = {
      frames,
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      drawCalls: renderer.info.render.calls,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      pixels,
    };
    renderer.domElement.dataset.drawCalls = String(metrics.drawCalls);
    renderer.domElement.dataset.geometries = String(metrics.geometries);
    renderer.domElement.dataset.textures = String(metrics.textures);
    emit("metrics", metrics);
    lastMetric = now;
  }
}
function wake() {
  if (renderer && !frame && !disposed && !document.hidden && !contextLost) {
    frame = requestAnimationFrame(animate);
    renderer.domElement.dataset.rafPending = "1";
  }
}
function visibility() {
  cancelAnimationFrame(frame);
  frame = 0;
  lastRender = 0;
  frameSamples.length = 0;
  if (renderer) {
    renderer.domElement.dataset.rafPending = "0";
    renderer.domElement.dataset.rendering = document.hidden
      ? "paused-hidden"
      : "active";
  }
  wake();
}
function lost(event: Event) {
  event.preventDefault();
  contextLost = true;
  cancelAnimationFrame(frame);
  frame = 0;
  if (renderer) {
    renderer.domElement.dataset.rafPending = "0";
    renderer.domElement.dataset.rendering = "context-lost";
  }
  emit("context-lost");
}
function restored() {
  contextLost = false;
  lastRender = 0;
  frameSamples.length = 0;
  if (renderer)
    renderer.domElement.dataset.rendering = document.hidden
      ? "paused-hidden"
      : "active";
  resize();
  wake();
}
type Listener = Parameters<EventTarget["addEventListener"]>[1];
type Options = Parameters<EventTarget["addEventListener"]>[2];
function listen(
  target: EventTarget,
  type: string,
  handler: Listener,
  options?: Options,
) {
  target.addEventListener(type, handler, options);
  removers.push(() => target.removeEventListener(type, handler, options));
}
function topologyKey() {
  return JSON.stringify([
    props.snapshot.stations.map((station) => [
      station.id,
      station.kind,
      station.regionId,
      station.position,
    ]),
    props.snapshot.lanes.map((lane) => [lane.id, lane.from, lane.to]),
    props.snapshot.ships.map((ship) => [ship.id, ship.role]),
  ]);
}
watch(
  () => props.snapshot,
  () => {
    if (!renderer) return;
    // A fresh isolated world owns fresh GPU resources. Within the same session,
    // camera changes, stepping and replay keep the already uploaded asset cache.
    if (assetSession !== props.snapshot.sessionId || topology !== topologyKey())
      rebuildWorld();
    else updateFacts();
    wake();
  },
);
watch(
  () => [
    props.camera,
    props.cameraRequest,
    props.selected?.id,
    props.selected?.kind,
    props.reduced,
  ],
  () => {
    configureCamera();
    updateFacts();
    wake();
  },
);
watch(() => props.quality, resize);
onMounted(() => {
  if (!host.value) return;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    const canvas = renderer.domElement;
    canvas.dataset.dominionCanvas = id;
    canvas.dataset.rendering = "active";
    canvas.tabIndex = 0;
    canvas.setAttribute(
      "aria-label",
      "星际协同指挥中枢三维世界。拖动观察，滚轮缩放，点击舰船、站点或航道。方向键调整镜头，Home 恢复；可使用页面对象列表替代。 ",
    );
    host.value.prepend(canvas);
    scene.add(new THREE.HemisphereLight("#bed9e9", "#18222e", 1.65));
    const sun = new THREE.DirectionalLight("#ffe1ba", 2.8);
    sun.position.set(-18, 27, 18);
    scene.add(sun);
    const rim = new THREE.DirectionalLight("#79b8e3", 2.5);
    rim.position.set(6, 12, -28);
    scene.add(rim);
    const fill = new THREE.DirectionalLight("#9cb1c3", 0.4);
    fill.position.set(-30, 2, 25);
    scene.add(fill);
    rebuildWorld();
    resize();
    focus.copy(desiredFocus);
    orbit.copy(desiredOrbit);
    listen(canvas, "pointerdown", pointerDown as Listener);
    listen(canvas, "pointermove", pointerMove as Listener);
    listen(canvas, "pointerup", pointerUp as Listener);
    listen(canvas, "pointerleave", pointerLeave);
    listen(canvas, "pointercancel", () => {
      drag = null;
      wake();
    });
    listen(canvas, "wheel", wheel as Listener, { passive: false });
    listen(canvas, "keydown", keydown as Listener);
    listen(canvas, "webglcontextlost", lost);
    listen(canvas, "webglcontextrestored", restored);
    listen(document, "visibilitychange", visibility);
    observer = new ResizeObserver(resize);
    observer.observe(host.value);
    wake();
  } catch {
    failed.value = true;
    emit("context-lost");
  }
});
onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(frame);
  frame = 0;
  if (renderer) renderer.domElement.dataset.rafPending = "0";
  observer?.disconnect();
  for (const remove of removers) remove();
  removers.length = 0;
  clearWorld();
  scene.clear();
  renderer?.renderLists.dispose();
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer?.domElement.remove();
  renderer = undefined;
});
</script>

<template>
  <div ref="host" class="dominion-scene" :data-dominion-renderer="id">
    <div v-if="hoverText" class="dominion-scene-hint" aria-hidden="true">
      {{ hoverText }} <span>↗</span>
    </div>
    <p v-if="failed" class="dominion-scene-fallback" role="status">
      三维资源暂不可用，请切换保留同一任务状态的二维星图。
    </p>
  </div>
</template>

<style scoped>
.dominion-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #040911;
}
.dominion-scene :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
.dominion-scene :deep(canvas:focus-visible) {
  outline: 2px solid #91e5d6;
  outline-offset: -4px;
}
.dominion-scene-hint {
  position: absolute;
  left: 50%;
  bottom: 110px;
  transform: translateX(-50%);
  max-width: 85%;
  padding: 9px 15px;
  border: 1px solid #79ccb955;
  border-radius: 20px;
  background: #07111eeb;
  color: #d9eeea;
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
}
.dominion-scene-hint span {
  margin-left: 14px;
  color: #8fe2d0;
}
.dominion-scene-fallback {
  position: absolute;
  top: 40%;
  inset-inline: 10%;
  color: #d9eeea;
  text-align: center;
}
@media (max-width: 650px) {
  .dominion-scene-hint {
    bottom: 100px;
    font-size: 11px;
  }
}
</style>
