<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import { createOrbitAssets } from "./assets";
import type {
  OrbitSnapshot,
  OrbitSelection,
  OrbitCamera,
  OrbitMetrics,
  OrbitCarrier,
} from "../../../../../packages/intelligence/src/orbit/types";

const props = defineProps<{
  snapshot: OrbitSnapshot;
  selected: OrbitSelection | null;
  camera: OrbitCamera;
  cameraRequest: number;
  quality: "standard" | "high";
  reduced: boolean;
}>();
const emit = defineEmits<{
  select: [OrbitSelection];
  "camera-interrupt": [];
  "context-lost": [];
  metrics: [OrbitMetrics];
}>();
const host = ref<HTMLDivElement>();
const hoverText = ref("");
const failed = ref(false);
let renderer: THREE.WebGLRenderer | undefined;
let assets: ReturnType<typeof createOrbitAssets> | undefined;
let observer: ResizeObserver | undefined;
let frame = 0,
  disposed = false,
  contextLost = false,
  frames = 0,
  lastRender = 0,
  lastMetric = 0;
let compact = false;
let aspect = 1.5,
  pixelCount = 0,
  topology = "",
  manualCamera = false;
let environment: THREE.Group | undefined, world: THREE.Group | undefined;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#050a14");
scene.fog = new THREE.FogExp2("#07111c", 0.007);
const sceneCamera = new THREE.PerspectiveCamera(43, 1.5, 0.2, 260);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const yAxis = new THREE.Vector3(0, 1, 0);
const focus = new THREE.Vector3(0, 0, 1),
  desiredFocus = focus.clone();
const orbit = new THREE.Spherical(39, 0.97, 0.44),
  desiredOrbit = orbit.clone();
const carrierMeshes = new Map<
  string,
  { group: THREE.Group; cargo: THREE.Group; target: THREE.Vector3; yaw: number }
>();
let priorRun = "",
  priorTick = -1;
const stationMeshes = new Map<string, THREE.Group>();
const labels = new Map<string, THREE.Sprite>();
const laneMeshes = new Map<
  string,
  {
    group: THREE.Group;
    material: THREE.MeshStandardMaterial;
    markers: THREE.Mesh[];
  }
>();
const pickable: THREE.Object3D[] = [];
const frameSamples: number[] = [];
const pointA = new THREE.Vector3(),
  pointB = new THREE.Vector3(),
  direction = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();
let selectionRing: THREE.Mesh | undefined;
let hover: OrbitSelection | null = null;
let drag: {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
} | null = null;
const listenerRemovers: (() => void)[] = [];
const id = `orbit-${Math.random().toString(36).slice(2, 9)}`;

function stationPoint(stationId: string, target: THREE.Vector3, lift = 1.35) {
  const station = props.snapshot.stations.find((item) => item.id === stationId);
  if (station) target.set(...station.position);
  else target.set(0, 0, 0);
  target.y += lift;
  return target;
}
function carrierPoint(carrier: OrbitCarrier, target: THREE.Vector3) {
  if (carrier.transit) {
    const transit = carrier.transit;
    stationPoint(transit.from, target);
    stationPoint(transit.to, pointB);
    // Facts come only from simulation progress. Wall-clock animation never completes a task.
    target.lerp(
      pointB,
      THREE.MathUtils.clamp(
        transit.elapsed / Math.max(1, transit.duration),
        0,
        1,
      ),
    );
  } else stationPoint(carrier.nodeId, target);
  return target;
}
function selectionPoint(
  selection: OrbitSelection | null,
  target: THREE.Vector3,
) {
  if (!selection) return target.set(0, 0, 1);
  if (selection.kind === "station")
    return stationPoint(selection.id, target, 0.7);
  if (selection.kind === "carrier") {
    const carrier = props.snapshot.carriers.find(
      (item) => item.id === selection.id,
    );
    if (carrier) return carrierPoint(carrier, target);
  } else {
    const lane = props.snapshot.lanes.find((item) => item.id === selection.id);
    if (lane) {
      stationPoint(lane.from, target);
      stationPoint(lane.to, pointB);
      return target.lerp(pointB, 0.5);
    }
  }
  return target.set(0, 0, 1);
}
function configureCamera() {
  if (drag) return;
  manualCamera = false;
  const portrait = compact;
  desiredFocus.set(portrait ? 0.5 : 0.3, 0.7, 0.7);
  desiredOrbit.set(
    portrait ? 49 : 31,
    portrait ? 0.85 : 1.06,
    portrait ? -0.18 : 0.42,
  );
  if (props.camera === "focused-object" && props.selected) {
    selectionPoint(props.selected, desiredFocus);
    desiredOrbit.set(
      props.selected.kind === "station"
        ? portrait
          ? 19
          : 14
        : portrait
          ? 13
          : 9,
      0.97,
      0.45,
    );
  } else if (props.camera === "mission") {
    const carrier =
      props.snapshot.carriers.find((item) => item.id === props.selected?.id) ||
      props.snapshot.carriers.find((item) => item.transit) ||
      props.snapshot.carriers[0];
    if (carrier) carrierPoint(carrier, desiredFocus);
    desiredOrbit.set(portrait ? 22 : 17, 0.89, 0.32);
  } else if (props.camera === "engineering") {
    desiredOrbit.set(portrait ? 48 : 32, 0.19, 0.06);
  } else if (props.camera === "comparison") {
    desiredOrbit.set(portrait ? 46 : 39, 0.58, 0.14);
  }
  if (props.reduced) {
    focus.copy(desiredFocus);
    orbit.copy(desiredOrbit);
  }
}
function clearWorld() {
  if (world) scene.remove(world);
  if (environment) scene.remove(environment);
  assets?.dispose();
  carrierMeshes.clear();
  stationMeshes.clear();
  laneMeshes.clear();
  labels.clear();
  pickable.length = 0;
}
function composeEnvironment() {
  for (const name of ["orbit-planet", "orbit-atmosphere"])
    environment
      ?.getObjectByName(name)
      ?.position.set(compact ? 29 : 12, compact ? -18 : -4, -55);
}
function rebuildWorld() {
  clearWorld();
  topology = topologyKey();
  assets = createOrbitAssets();
  world = new THREE.Group();
  environment = assets.environment();
  composeEnvironment();
  scene.add(environment, world);
  for (const [index, station] of props.snapshot.stations.entries()) {
    const group = assets.station(station);
    group.userData.selection = {
      kind: "station",
      id: station.id,
    } satisfies OrbitSelection;
    stationMeshes.set(station.id, group);
    world.add(group);
    pickable.push(group);
    const label = assets.label(
      `${String(index + 1).padStart(2, "0")}  ${station.label}`,
      station.kind === "target" ? "#ffcf93" : "#b8e1e5",
    );
    label.position.set(
      station.position[0],
      station.position[1] + (station.kind === "port" ? 4.5 : 3.8),
      station.position[2],
    );
    labels.set(station.id, label);
    world.add(label);
  }
  const shaft = assets.keep(new THREE.CylinderGeometry(1, 1, 1, 6));
  const arrow = assets.keep(new THREE.ConeGeometry(0.16, 0.48, 3));
  const beacon = assets.keep(new THREE.SphereGeometry(0.11, 8, 6));
  for (const lane of props.snapshot.lanes) {
    const group = new THREE.Group();
    group.userData.selection = {
      kind: "lane",
      id: lane.id,
    } satisfies OrbitSelection;
    const mat = assets.material("#306d7d", 0.25, 0.55);
    mat.emissive.set("#124959");
    mat.emissiveIntensity = 0.7;
    stationPoint(lane.from, pointA);
    stationPoint(lane.to, pointB);
    direction.subVectors(pointB, pointA);
    const tube = new THREE.Mesh(shaft, mat);
    tube.position.copy(pointA).add(pointB).multiplyScalar(0.5);
    tube.scale.set(0.043, direction.length(), 0.043);
    tube.quaternion.setFromUnitVectors(yAxis, direction.clone().normalize());
    group.add(tube);
    const markers: THREE.Mesh[] = [];
    for (const t of [0.3, 0.7]) {
      const marker = new THREE.Mesh(arrow, mat);
      marker.position.copy(pointA).lerp(pointB, t);
      const arrowDirection = direction.clone().normalize();
      if (lane.bidirectional && t === 0.3) arrowDirection.negate();
      marker.quaternion.setFromUnitVectors(yAxis, arrowDirection);
      group.add(marker);
      markers.push(marker);
    }
    for (const t of [0.08, 0.92]) {
      const lamp = new THREE.Mesh(beacon, mat);
      lamp.position.copy(pointA).lerp(pointB, t);
      group.add(lamp);
    }
    laneMeshes.set(lane.id, { group, material: mat, markers });
    world.add(group);
    pickable.push(group);
  }
  for (const [index, carrier] of props.snapshot.carriers.entries()) {
    const model = assets.carrier(index);
    model.group.userData.selection = {
      kind: "carrier",
      id: carrier.id,
    } satisfies OrbitSelection;
    carrierMeshes.set(carrier.id, {
      ...model,
      target: new THREE.Vector3(),
      yaw: 0,
    });
    world.add(model.group);
    pickable.push(model.group);
  }
  const selectionMaterial = new THREE.MeshBasicMaterial({
    color: "#c5fff5",
    transparent: true,
    opacity: 0.8,
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
  priorRun = "";
  updateFacts();
  configureCamera();
  focus.copy(desiredFocus);
  orbit.copy(desiredOrbit);
}
function updateFacts() {
  const snap =
    props.reduced ||
    props.snapshot.status !== "running" ||
    priorRun !== props.snapshot.runId ||
    props.snapshot.simTick < priorTick;
  for (const [index, carrier] of props.snapshot.carriers.entries()) {
    const model = carrierMeshes.get(carrier.id);
    if (!model) continue;
    carrierPoint(carrier, model.target);
    if (carrier.transit) {
      stationPoint(carrier.transit.from, pointA);
      stationPoint(carrier.transit.to, pointB);
      direction.subVectors(pointB, pointA);
      model.yaw = Math.atan2(direction.x, direction.z);
    } else {
      model.target.x += index % 2 ? 1.12 : -0.72;
      model.target.z += index % 2 ? -0.32 : 0.45;
    }
    if (snap) {
      model.group.position.copy(model.target);
      model.group.rotation.y = model.yaw;
    }
    model.cargo.children.forEach((cell, cargoIndex) => {
      cell.visible = cargoIndex < carrier.cargo;
    });
  }
  priorRun = props.snapshot.runId;
  priorTick = props.snapshot.simTick;
  const activeRoutes = new Set(
    props.snapshot.carriers.flatMap((carrier) => carrier.route),
  );
  for (const lane of props.snapshot.lanes) {
    const view = laneMeshes.get(lane.id);
    if (!view) continue;
    const selected =
      (props.selected?.kind === "lane" && props.selected.id === lane.id) ||
      (hover?.kind === "lane" && hover.id === lane.id);
    const active =
      activeRoutes.has(lane.id) ||
      props.snapshot.carriers.some(
        (carrier) => carrier.transit?.laneId === lane.id,
      );
    const color = !lane.open
      ? "#f57863"
      : selected
        ? "#e5fff9"
        : active
          ? "#8ff3dc"
          : "#2c6979";
    view.material.color.set(color);
    view.material.emissive.set(color);
    view.material.emissiveIntensity = selected
      ? 1.25
      : active
        ? 0.75
        : lane.open
          ? 0.28
          : 0.6;
    view.markers.forEach((marker) =>
      marker.scale.setScalar(active || selected ? 1.25 : 1),
    );
  }
  for (const [stationId, label] of labels)
    label.visible =
      props.camera === "engineering" ||
      props.selected?.id === stationId ||
      hover?.id === stationId ||
      (!compact &&
        ["port", "target"].includes(
          props.snapshot.stations.find((station) => station.id === stationId)
            ?.kind || "",
        ));
  updateSelection();
}
function updateSelection() {
  if (!selectionRing) return;
  const selected = hover || props.selected;
  selectionRing.visible = !!selected;
  if (selected) {
    selectionPoint(selected, selectionRing.position);
    selectionRing.position.y -= 0.55;
    selectionRing.scale.setScalar(
      selected.kind === "station"
        ? 2.1
        : selected.kind === "carrier"
          ? 1.5
          : 0.8,
    );
  }
}
function pick(event: PointerEvent): OrbitSelection | null {
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
        return object.userData.selection as OrbitSelection;
      object = object.parent;
    }
  }
  return null;
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
  manualCamera = true;
  desiredOrbit.copy(orbit);
  desiredFocus.copy(focus);
  emit("camera-interrupt");
}
function pointerMove(event: PointerEvent) {
  if (drag && drag.id === event.pointerId) {
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    drag.moved ||=
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;
    if (drag.moved) {
      orbit.theta -= dx * 0.006;
      orbit.phi = THREE.MathUtils.clamp(orbit.phi - dy * 0.006, 0.15, 1.43);
      desiredOrbit.copy(orbit);
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
  } else {
    const result = pick(event);
    if (result?.id !== hover?.id || result?.kind !== hover?.kind) {
      hover = result;
      hoverText.value = result
        ? result.kind === "station"
          ? props.snapshot.stations.find((station) => station.id === result.id)
              ?.label || "站点"
          : result.kind === "carrier"
            ? props.snapshot.carriers.find(
                (carrier) => carrier.id === result.id,
              )?.label || "载体"
            : props.snapshot.lanes.find((lane) => lane.id === result.id)?.open
              ? "开放航道 · 点击干预"
              : "关闭航道 · 点击查看"
        : "";
      if (renderer)
        renderer.domElement.style.cursor = result ? "pointer" : "grab";
      updateFacts();
    }
  }
}
function pointerUp(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId) return;
  if (!drag.moved) {
    const selected = pick(event);
    if (selected) emit("select", selected);
  }
  if (renderer?.domElement.hasPointerCapture(event.pointerId))
    renderer.domElement.releasePointerCapture(event.pointerId);
  drag = null;
}
function wheel(event: WheelEvent) {
  event.preventDefault();
  manualCamera = true;
  emit("camera-interrupt");
  orbit.radius = THREE.MathUtils.clamp(
    orbit.radius * Math.exp(event.deltaY * 0.001),
    6,
    70,
  );
  desiredOrbit.copy(orbit);
  desiredFocus.copy(focus);
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
  manualCamera = true;
  emit("camera-interrupt");
  if (event.key === "Home") configureCamera();
  else if (event.key === "+") orbit.radius = Math.max(6, orbit.radius - 2);
  else if (event.key === "-") orbit.radius = Math.min(70, orbit.radius + 2);
  else if (event.key === "ArrowLeft") orbit.theta -= 0.1;
  else if (event.key === "ArrowRight") orbit.theta += 0.1;
  else
    orbit.phi = THREE.MathUtils.clamp(
      orbit.phi + (event.key === "ArrowUp" ? -0.08 : 0.08),
      0.15,
      1.43,
    );
  if (event.key !== "Home") {
    desiredOrbit.copy(orbit);
    desiredFocus.copy(focus);
  }
}
function resize() {
  if (!host.value || !renderer) return;
  const width = Math.max(1, host.value.clientWidth),
    height = Math.max(1, host.value.clientHeight);
  aspect = width / height;
  compact = width < 650 || aspect < 0.7;
  composeEnvironment();
  const cap = props.quality === "high" ? 2100000 : 1600000;
  const dpr = Math.min(
    devicePixelRatio || 1,
    props.quality === "high" ? 2 : 1.5,
    Math.sqrt(cap / (width * height)),
  );
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  pixelCount = renderer.domElement.width * renderer.domElement.height;
  sceneCamera.aspect = aspect;
  sceneCamera.fov = compact ? 50 : 43;
  sceneCamera.setViewOffset(
    width,
    height,
    compact ? 0 : -width * 0.055,
    -height * (compact ? 0.065 : 0.035),
    width,
    height,
  );
  sceneCamera.updateProjectionMatrix();
  configureCamera();
  updateFacts();
  renderer.domElement.dataset.pixels = String(pixelCount);
  renderer.domElement.dataset.quality = props.quality;
}
function animate(now: number) {
  frame = 0;
  if (disposed || contextLost || document.hidden || !renderer) return;
  frame = requestAnimationFrame(animate);
  const targetInterval =
    compact && props.quality === "standard" ? 1000 / 30 : 1000 / 60;
  if (lastRender && now - lastRender < targetInterval - 0.5) return;
  if (lastRender) {
    frameSamples.push(now - lastRender);
    if (frameSamples.length > 240) frameSamples.shift();
  }
  const delta = lastRender ? Math.min((now - lastRender) / 1000, 0.1) : 1;
  lastRender = now;
  for (const model of carrierMeshes.values()) {
    const blend =
      props.reduced || props.snapshot.status !== "running"
        ? 1
        : 1 - Math.exp(-delta * 13);
    model.group.position.lerp(model.target, blend);
    const turn = Math.atan2(
      Math.sin(model.yaw - model.group.rotation.y),
      Math.cos(model.yaw - model.group.rotation.y),
    );
    model.group.rotation.y += turn * blend;
  }
  if (!manualCamera && props.camera === "mission") {
    const carrier =
      props.snapshot.carriers.find((item) => item.id === props.selected?.id) ||
      props.snapshot.carriers.find((item) => item.transit) ||
      props.snapshot.carriers[0];
    if (carrier) carrierPoint(carrier, desiredFocus);
  }
  const ease = props.reduced || drag ? 1 : 1 - Math.exp(-delta * 5);
  focus.lerp(desiredFocus, ease);
  orbit.radius = THREE.MathUtils.lerp(orbit.radius, desiredOrbit.radius, ease);
  orbit.theta = THREE.MathUtils.lerp(orbit.theta, desiredOrbit.theta, ease);
  orbit.phi = THREE.MathUtils.lerp(orbit.phi, desiredOrbit.phi, ease);
  cameraOffset.setFromSpherical(orbit);
  sceneCamera.position.copy(focus).add(cameraOffset);
  sceneCamera.lookAt(focus);
  renderer.render(scene, sceneCamera);
  frames++;
  renderer.domElement.dataset.frames = String(frames);
  renderer.domElement.dataset.camera = props.camera;
  if (now - lastMetric > 3000) {
    const sorted = [...frameSamples].sort((a, b) => a - b);
    renderer.domElement.dataset.drawCalls = String(renderer.info.render.calls);
    renderer.domElement.dataset.geometries = String(
      renderer.info.memory.geometries,
    );
    renderer.domElement.dataset.textures = String(
      renderer.info.memory.textures,
    );
    emit("metrics", {
      frames,
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      drawCalls: renderer.info.render.calls,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      pixels: pixelCount,
    });
    lastMetric = now;
  }
}
function wake() {
  if (!frame && !disposed && !document.hidden && !contextLost)
    frame = requestAnimationFrame(animate);
}
function visibility() {
  cancelAnimationFrame(frame);
  frame = 0;
  lastRender = 0;
  frameSamples.length = 0;
  if (renderer)
    renderer.domElement.dataset.rendering = document.hidden
      ? "paused-hidden"
      : "active";
  wake();
}
function lost(event: Event) {
  event.preventDefault();
  contextLost = true;
  cancelAnimationFrame(frame);
  frame = 0;
  if (renderer) renderer.domElement.dataset.rendering = "context-lost";
  emit("context-lost");
}
function restored() {
  contextLost = false;
  lastRender = 0;
  resize();
  wake();
}
type SceneListener = Parameters<EventTarget["addEventListener"]>[1];
type SceneListenerOptions = Parameters<EventTarget["addEventListener"]>[2];
function listen<T extends EventTarget>(
  target: T,
  name: string,
  listener: SceneListener,
  options?: SceneListenerOptions,
) {
  target.addEventListener(name, listener, options);
  listenerRemovers.push(() =>
    target.removeEventListener(name, listener, options),
  );
}

function topologyKey() {
  return JSON.stringify([
    props.snapshot.stations.map((station) => [
      station.id,
      station.kind,
      station.position,
    ]),
    props.snapshot.lanes.map((lane) => [
      lane.id,
      lane.from,
      lane.to,
      lane.bidirectional,
    ]),
    props.snapshot.carriers.map((carrier) => carrier.id),
  ]);
}
watch(
  () => props.snapshot,
  () => {
    if (!renderer) return;
    const next = topologyKey();
    if (next !== topology) {
      topology = next;
      rebuildWorld();
    } else updateFacts();
    wake();
  },
);
watch(
  () => [
    props.camera,
    props.cameraRequest,
    props.selected?.kind,
    props.selected?.id,
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
    renderer.toneMappingExposure = 0.95;
    const canvas = renderer.domElement;
    canvas.dataset.orbitCanvas = id;
    canvas.dataset.rendering = "active";
    canvas.setAttribute(
      "aria-label",
      "原创轨道港三维场景。拖动旋转，滚轮缩放，点选站点、载体或航道；也可使用页面对象列表。",
    );
    canvas.tabIndex = 0;
    host.value.prepend(canvas);
    scene.add(new THREE.HemisphereLight("#c1e4f8", "#10151d", 0.8));
    const sun = new THREE.DirectionalLight("#ffe0ba", 3.1);
    sun.position.set(-8, 13, 12);
    scene.add(sun);
    const rim = new THREE.DirectionalLight("#779eda", 3.1);
    rim.position.set(-14, 8, -12);
    scene.add(rim);
    const fill = new THREE.DirectionalLight("#b1d2e9", 0.45);
    fill.position.set(-15, 3, 14);
    scene.add(fill);
    rebuildWorld();
    resize();
    focus.copy(desiredFocus);
    orbit.copy(desiredOrbit);
    listen(canvas, "pointerdown", pointerDown as SceneListener);
    listen(canvas, "pointermove", pointerMove as SceneListener);
    listen(canvas, "pointerup", pointerUp as SceneListener);
    listen(canvas, "pointercancel", (() => {
      drag = null;
    }) as SceneListener);
    listen(canvas, "wheel", wheel as SceneListener, { passive: false });
    listen(canvas, "keydown", keydown as SceneListener);
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
  observer?.disconnect();
  for (const remove of listenerRemovers) remove();
  listenerRemovers.length = 0;
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
  <div ref="host" class="orbit-scene" :data-orbit-renderer="id">
    <div v-if="hoverText" class="orbit-scene-hint" aria-hidden="true">
      {{ hoverText }} <span>↗</span>
    </div>
    <p v-if="failed" class="orbit-scene-fallback" role="status">
      三维渲染暂不可用，请使用同一任务状态的二维地图。
    </p>
  </div>
</template>

<style scoped>
.orbit-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #050a14;
}
.orbit-scene :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
.orbit-scene :deep(canvas:focus-visible) {
  outline: 2px solid #8ef2dc;
  outline-offset: -4px;
}
.orbit-scene-hint {
  position: absolute;
  left: 50%;
  bottom: 132px;
  transform: translateX(-50%);
  padding: 10px 16px;
  background: #07131eeb;
  color: #e0f4f4;
  border: 1px solid #75e9e166;
  border-radius: 30px;
  font-size: 13px;
  pointer-events: none;
  white-space: nowrap;
}
.orbit-scene-hint span {
  margin-left: 14px;
  color: #71e7e1;
}
.orbit-scene-fallback {
  position: absolute;
  top: 40%;
  left: 10%;
  right: 10%;
  text-align: center;
  color: #e1eaef;
  font-size: 16px;
}
@media (max-width: 600px) {
  .orbit-scene-hint {
    bottom: 180px;
    max-width: 85%;
    font-size: 12px;
  }
}
</style>
