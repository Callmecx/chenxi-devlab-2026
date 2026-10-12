<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import type {
  LabSnapshot,
  Point,
} from "../../../../packages/intelligence/src/types";
const props = defineProps<{ snapshot: LabSnapshot; reduced: boolean }>();
const emit = defineEmits<{
  cell: [Point];
  fallback: [string];
  metrics: [
    {
      frames: number;
      p50: number;
      p95: number;
      drawCalls: number;
      geometries: number;
      textures: number;
    },
  ];
}>();
const host = ref<HTMLDivElement>();
let renderer: THREE.WebGLRenderer | undefined;
let observer: ResizeObserver | undefined;
let frame = 0,
  visible = true,
  last = 0,
  frames = 0;
const samples: number[] = [];
const scene = new THREE.Scene();
scene.background = new THREE.Color("#09131e");
scene.fog = new THREE.FogExp2("#09131e", 0.018);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
const dynamic = new THREE.Group();
const geometries: THREE.BufferGeometry[] = [];
const materials: THREE.Material[] = [];
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function disposeChildren(group: THREE.Group) {
  group.clear();
  for (const geo of geometries) geo.dispose();
  for (const mat of materials) mat.dispose();
  geometries.length = 0;
  materials.length = 0;
}
function box(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
  emissive = false,
) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.36,
    metalness: 0.38,
    emissive: emissive ? color : "#000000",
    emissiveIntensity: emissive ? 0.5 : 0,
  });
  geometries.push(geometry);
  materials.push(material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  dynamic.add(mesh);
  return mesh;
}
function line(points: THREE.Vector3[], color: string) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color });
  geometries.push(geo);
  materials.push(mat);
  dynamic.add(new THREE.Line(geo, mat));
}
function updateWorld() {
  disposeChildren(dynamic);
  dynamic.rotation.set(0, 0, 0);
  const s = props.snapshot,
    w = s.world;
  if (s.goal.preset === "warehouse") {
    camera.position.set(12, 14, 16);
    camera.lookAt(0, 0, 0);
    box(0, -0.26, 0, 12.4, 0.3, 8.4, "#102632");
    const point = (p: Point, y = 0.1) =>
      new THREE.Vector3(p.x - 5.5, y, p.y - 3.5);
    for (let x = 0; x <= 12; x++)
      line(
        [new THREE.Vector3(x - 6, -0.1, -4), new THREE.Vector3(x - 6, -0.1, 4)],
        "#26424b",
      );
    for (let z = 0; z <= 8; z++)
      line(
        [new THREE.Vector3(-6, -0.1, z - 4), new THREE.Vector3(6, -0.1, z - 4)],
        "#26424b",
      );
    for (const p of w.obstacles)
      box(p.x - 5.5, 0.5, p.y - 3.5, 0.85, 1, 0.85, "#29434c");
    box(w.target.x - 5.5, 0, w.target.y - 3.5, 0.9, 0.12, 0.9, "#a1f5c1", true);
    for (const c of w.cargo.filter(
      (c) => !c.delivered && c.id !== w.carrying,
    )) {
      box(
        c.position.x - 5.5,
        0.25,
        c.position.y - 3.5,
        0.53,
        0.5,
        0.53,
        "#ffb86c",
      );
    }
    if (w.path.length)
      line([point(w.robot), ...w.path.map((p) => point(p))], "#80f1ed");
    const r = w.robot;
    box(r.x - 5.5, 0.26, r.y - 3.5, 0.72, 0.48, 0.72, "#8ae5e0", true);
    box(r.x - 5.5, 0.54, r.y - 3.5, 0.45, 0.14, 0.45, "#dffdfa");
    if (w.carrying) box(r.x - 5.5, 0.8, r.y - 3.5, 0.4, 0.4, 0.4, "#ffb86c");
  } else {
    camera.position.set(2, 7.8, 14);
    camera.lookAt(0, 0, 0);
    const geometry = new THREE.IcosahedronGeometry(1.8, 1);
    const material = new THREE.MeshStandardMaterial({
      color: "#89e1e6",
      emissive: "#2e9a9e",
      emissiveIntensity: 0.28,
      wireframe: true,
    });
    geometries.push(geometry);
    materials.push(material);
    dynamic.add(new THREE.Mesh(geometry, material));
    const core = new THREE.IcosahedronGeometry(1.18, 1);
    geometries.push(core);
    const cm = new THREE.MeshStandardMaterial({
      color: "#17393e",
      metalness: 0.8,
      roughness: 0.2,
    });
    materials.push(cm);
    dynamic.add(new THREE.Mesh(core, cm));
    const nodes = s.nodes.length
      ? s.nodes
      : [
          { status: "queued", id: "goal" },
          { status: "queued", id: "plan" },
          { status: "queued", id: "tool" },
          { status: "queued", id: "observe" },
          { status: "queued", id: "review" },
        ];
    nodes.forEach((n, i) => {
      const a = (i / nodes.length) * Math.PI * 2;
      const x = Math.cos(a) * 4.4,
        z = Math.sin(a) * 3.2;
      const color =
        n.status === "succeeded"
          ? "#9df6cd"
          : n.status === "failed"
            ? "#ff997e"
            : n.status === "running" || n.status === "waiting-approval"
              ? "#faf6be"
              : "#37515b";
      box(x, 0, z, 0.62, 0.62, 0.62, color, n.status !== "queued");
      line([new THREE.Vector3(x, 0, z), new THREE.Vector3(0, 0, 0)], color);
    });
    const ring = new THREE.TorusGeometry(3, 0.012, 6, 90);
    geometries.push(ring);
    const rm = new THREE.MeshBasicMaterial({ color: "#376a79" });
    materials.push(rm);
    const mesh = new THREE.Mesh(ring, rm);
    mesh.rotation.x = Math.PI / 2;
    dynamic.add(mesh);
  }
  draw();
}
function draw() {
  if (renderer && visible) renderer.render(scene, camera);
}
function loop(time: number) {
  frame = 0;
  if (!renderer || !visible || props.reduced) return;
  if (last) {
    samples.push(time - last);
    if (samples.length > 300) samples.shift();
  }
  last = time;
  frames++;
  // Motion conveys the currently running state only; it does not advance the runtime.
  if (
    props.snapshot.goal.preset !== "warehouse" &&
    props.snapshot.status === "running"
  )
    dynamic.rotation.y += 0.002;
  draw();
  if (frames % 60 === 0) {
    const sorted = [...samples].sort((a, b) => a - b);
    emit("metrics", {
      frames,
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      drawCalls: renderer.info.render.calls,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    });
  }
  frame = requestAnimationFrame(loop);
}
function restart() {
  cancelAnimationFrame(frame);
  frame = 0;
  last = 0;
  draw();
  if (!props.reduced && visible) frame = requestAnimationFrame(loop);
}
function resize() {
  if (!renderer || !host.value) return;
  const { width, height } = host.value.getBoundingClientRect();
  if (!width || !height) return;
  const dpr = Math.min(
    window.devicePixelRatio || 1,
    1.5,
    Math.sqrt(1600000 / (width * height)),
  );
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  draw();
}
function visibility() {
  visible = !document.hidden;
  restart();
}
function contextLost(event: Event) {
  event.preventDefault();
  cancelAnimationFrame(frame);
  emit("fallback", "WebGL 上下文丢失，已保留任务并切换二维操作台。");
}
function click(event: PointerEvent) {
  if (props.snapshot.goal.preset !== "warehouse" || !renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(
    new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    ),
    camera,
  );
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, hit)) {
    const x = Math.floor(hit.x + 6),
      y = Math.floor(hit.z + 4);
    if (x >= 0 && x < 12 && y >= 0 && y < 8) emit("cell", { x, y });
  }
}
watch(() => props.snapshot, updateWorld);
watch(() => props.reduced, restart);
onMounted(() => {
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute(
      "aria-label",
      "当前任务的三维状态投影，所有操作也可在二维视图完成",
    );
    host.value?.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight("#c9fbff", "#10212a", 2.2));
    const light = new THREE.DirectionalLight("#bbf4ff", 3.5);
    light.position.set(4, 8, 6);
    scene.add(light, dynamic);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    renderer.domElement.addEventListener("pointerup", click);
    document.addEventListener("visibilitychange", visibility);
    observer = new ResizeObserver(resize);
    if (host.value) observer.observe(host.value);
    updateWorld();
    resize();
    visibility();
  } catch {
    emit("fallback", "当前设备不支持 WebGL，二维模式保留全部任务与路径操作。");
  }
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  observer?.disconnect();
  document.removeEventListener("visibilitychange", visibility);
  disposeChildren(dynamic);
  scene.clear();
  if (renderer) {
    renderer.domElement.removeEventListener("webglcontextlost", contextLost);
    renderer.domElement.removeEventListener("pointerup", click);
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    renderer = undefined;
  }
});
</script>
<template>
  <div
    ref="host"
    class="intelligence-scene"
    data-testid="intelligence-scene"
  ></div>
</template>
<style scoped>
.intelligence-scene {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.intelligence-scene :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: pan-y;
}
</style>
