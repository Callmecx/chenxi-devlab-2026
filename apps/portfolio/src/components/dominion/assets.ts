import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type {
  DominionSnapshot,
  RegionId,
  Resource,
  Selection,
  ShipRole,
  Station,
} from "../../../../../packages/intelligence/src/dominion/types";

type Triple = [number, number, number];
export const BRIDGE_ANCHOR: Triple = [7.3, 4.6, -2];
export const BRIDGE_YAW = -0.64;
export const BRIDGE_SCALE = 0.65;
export interface StationModel {
  group: THREE.Group;
  damage: THREE.Group;
  berthLights: THREE.Mesh[];
}
export interface ShipModel {
  group: THREE.Group;
  cargo: Record<Resource, THREE.Mesh[]>;
  engines: THREE.Group;
  scanner: THREE.Group;
  tools: THREE.Group;
  lift: THREE.Group;
}
export interface PlanetModel {
  id: RegionId;
  group: THREE.Group;
  radius: number;
}

/** Original code-built V4 assets. No downloaded geometry, imagery, fonts or textures. */
export function createDominionAssets() {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const instances = new Set<THREE.InstancedMesh>();
  const displays: {
    canvas: HTMLCanvasElement;
    texture: THREE.CanvasTexture;
  }[] = [];
  const keep = <T extends THREE.BufferGeometry>(value: T) => {
    geometries.add(value);
    return value;
  };
  function material(color: string, metalness = 0.35, roughness = 0.48) {
    const value = new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
    });
    materials.add(value);
    // Subtle machined surface variation is evaluated in asset coordinates.
    // It is deterministic and remains fixed while a craft moves through space.
    value.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vAssetSurface;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvAssetSurface = position;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vAssetSurface;",
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float grain = fract(sin(dot(floor(vAssetSurface * 150.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float brushing = sin(vAssetSurface.x * 210.0 + vAssetSurface.z * 7.0) * 0.015;
          diffuseColor.rgb *= 0.96 + grain * 0.07 + brushing;`,
        );
    };
    return value;
  }
  function luminous(color: string, intensity = 1) {
    const value = material(color, 0.15, 0.38);
    value.emissive.set(color);
    value.emissiveIntensity = intensity;
    return value;
  }
  const palette = {
    hull: material("#8b9ca4", 0.32, 0.42),
    ceramic: material("#b8c6c9", 0.18, 0.53),
    titanium: material("#455966", 0.62, 0.38),
    graphite: material("#14232e", 0.32, 0.55),
    dark: material("#080f17", 0.2, 0.73),
    copper: material("#bc8554", 0.5, 0.45),
    glass: material("#123c55", 0.5, 0.18),
    solar: material("#143650", 0.6, 0.35),
    ice: material("#8eb8bf", 0.16, 0.7),
    rock: material("#80644f", 0.08, 0.94),
    cyan: luminous("#6ae4e2", 0.8),
    amber: luminous("#ffb66d", 0.6),
    red: luminous("#ef6652", 0.55),
    white: luminous("#d4ebee", 0.35),
  };
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = keep(new THREE.CylinderGeometry(1, 1, 1, 16));
  const cone = keep(new THREE.CylinderGeometry(0.62, 1, 1, 12));
  const sphere = keep(new THREE.SphereGeometry(1, 16, 10));
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.36);
  shape.lineTo(-0.36, -0.5);
  shape.lineTo(0.36, -0.5);
  shape.lineTo(0.5, -0.36);
  shape.lineTo(0.5, 0.36);
  shape.lineTo(0.36, 0.5);
  shape.lineTo(-0.36, 0.5);
  shape.lineTo(-0.5, 0.36);
  shape.closePath();
  const panel = keep(
    new THREE.ExtrudeGeometry(shape, {
      depth: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      steps: 1,
    }),
  );
  panel.translate(0, 0, -0.5);
  const engineBell = keep(new THREE.CylinderGeometry(0.76, 1, 1, 16, 1, true));
  const sectorCache = new Map<string, THREE.BufferGeometry>();
  function ring(radius: number, tube: number, arc = Math.PI * 2) {
    const key = `${radius}/${tube}/${arc}`;
    if (!sectorCache.has(key))
      sectorCache.set(
        key,
        keep(
          new THREE.TorusGeometry(
            radius,
            tube,
            6,
            Math.max(16, Math.ceil((56 * arc) / (Math.PI * 2))),
            arc,
          ),
        ),
      );
    return sectorCache.get(key)!;
  }
  function wedge(inner: number, outer: number, depth: number, arc: number) {
    const key = `w/${inner}/${outer}/${depth}/${arc}`;
    if (!sectorCache.has(key)) {
      const section = new THREE.Shape();
      section.absarc(0, 0, outer, 0, arc, false);
      section.absarc(0, 0, inner, arc, 0, true);
      section.closePath();
      const geometry = new THREE.ExtrudeGeometry(section, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.06,
        bevelSize: 0.06,
        bevelSegments: 1,
        curveSegments: 5,
        steps: 1,
      });
      geometry.translate(0, 0, -depth / 2);
      sectorCache.set(key, keep(geometry));
    }
    return sectorCache.get(key)!;
  }
  function builder() {
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const transform = new THREE.Object3D();
    function add(
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      position: Triple,
      scale: Triple,
      rotation: Triple = [0, 0, 0],
    ) {
      transform.position.set(...position);
      transform.scale.set(...scale);
      transform.rotation.set(...rotation);
      transform.updateMatrix();
      const copy = geo.index ? geo.toNonIndexed() : geo.clone();
      copy.applyMatrix4(transform.matrix);
      const bucket = buckets.get(mat) || [];
      bucket.push(copy);
      buckets.set(mat, bucket);
    }
    function beam(a: Triple, b: Triple, width: number, mat = palette.titanium) {
      const from = new THREE.Vector3(...a),
        to = new THREE.Vector3(...b);
      const axis = to.clone().sub(from);
      transform.position.copy(from).add(to).multiplyScalar(0.5);
      transform.scale.set(width, axis.length(), width);
      transform.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        axis.normalize(),
      );
      transform.updateMatrix();
      const copy = box.toNonIndexed();
      copy.applyMatrix4(transform.matrix);
      const bucket = buckets.get(mat) || [];
      bucket.push(copy);
      buckets.set(mat, bucket);
    }
    function finish() {
      const result = new THREE.Group();
      for (const [mat, parts] of buckets) {
        const merged = mergeGeometries(parts);
        for (const piece of parts) piece.dispose();
        if (!merged) throw new Error("Dominion geometry merge failed");
        result.add(new THREE.Mesh(keep(merged), mat));
      }
      return result;
    }
    return { add, beam, finish };
  }
  function radiator(
    b: ReturnType<typeof builder>,
    x: number,
    y: number,
    z: number,
    side = 1,
  ) {
    b.add(box, palette.titanium, [x, y, z], [3.7, 0.13, 0.2]);
    for (let index = 0; index < 8; index++) {
      b.add(
        panel,
        palette.solar,
        [x + (index - 3.5) * 0.43, y + 0.09, z],
        [0.4, 0.05, 2.15],
      );
      b.add(
        box,
        palette.copper,
        [x + (index - 3.5) * 0.43, y + 0.13, z],
        [0.018, 0.02, 2.05],
      );
    }
    b.beam([x - side * 2.3, y - 0.6, z], [x + side * 1.5, y, z], 0.08);
  }
  function hub(b: ReturnType<typeof builder>, position: Triple, size = 1) {
    const [x, y, z] = position;
    b.add(cone, palette.titanium, [x, y, z], [size, 0.8 * size, size]);
    b.add(
      cylinder,
      palette.graphite,
      [x, y + 0.55 * size, z],
      [0.75 * size, 0.3 * size, 0.75 * size],
    );
    b.add(
      ring(0.77, 0.035),
      palette.cyan,
      [x, y + 0.74 * size, z],
      [size, size, size],
      [Math.PI / 2, 0, 0],
    );
  }
  function station(source: Station): StationModel {
    const b = builder();
    const berths: Triple[] = [];
    if (source.id === "port") {
      // A vertical inhabited ring grows out of a load-bearing freight spine.
      // Curved pressure hulls, suspension spars and an asymmetric bridge replace V3's flat deck.
      const ringOrigin: Triple = [-3.8, 4.1, -4.8];
      for (let index = 0; index < 10; index++) {
        const angle = (index * Math.PI * 2) / 10 + 0.12;
        b.add(
          wedge(4.18, 4.95, 1.02, 0.51),
          index % 3 ? palette.hull : palette.titanium,
          ringOrigin,
          [1, 1, 1],
          [0.13, -0.16, angle],
        );
        b.add(
          wedge(4.36, 4.72, 1.12, 0.42),
          palette.graphite,
          ringOrigin,
          [1, 1, 1],
          [0.13, -0.16, angle + 0.05],
        );
        for (let cell = 0; cell < 4; cell++) {
          const a = angle + 0.1 + cell * 0.095;
          b.add(
            box,
            index % 3 ? palette.white : palette.amber,
            [
              ringOrigin[0] + Math.cos(a) * 4.53,
              ringOrigin[1] + Math.sin(a) * 4.53,
              -4.13,
            ],
            [0.17, 0.07, 0.055],
            [0, 0, a + Math.PI / 2],
          );
        }
      }
      for (const radius of [4.08, 5.06])
        b.add(
          ring(radius, 0.075),
          palette.copper,
          ringOrigin,
          [1, 1, 1],
          [0.13, -0.16, 0],
        );
      b.add(
        cylinder,
        palette.graphite,
        ringOrigin,
        [0.75, 2.5, 0.75],
        [Math.PI / 2, 0, 0],
      );
      for (const angle of [0.2, 2.25, 4.25]) {
        const end: Triple = [
          ringOrigin[0] + Math.cos(angle) * 4.3,
          ringOrigin[1] + Math.sin(angle) * 4.3,
          -4.8,
        ];
        b.beam(ringOrigin, end, 0.18);
        b.beam(
          [ringOrigin[0], ringOrigin[1], -3.65],
          end,
          0.07,
          palette.copper,
        );
      }
      b.beam([-3.8, 4.1, -4.8], [-1.4, -0.8, 1], 0.8);
      b.add(panel, palette.graphite, [0, -0.65, 2.7], [3.1, 1.9, 14]);
      b.add(panel, palette.titanium, [0, 0.33, 2.7], [2.6, 0.18, 13.6]);
      b.add(box, palette.amber, [-1.12, 0.46, 2.7], [0.035, 0.035, 12.8]);
      b.add(box, palette.amber, [1.12, 0.46, 2.7], [0.035, 0.035, 12.8]);
      for (let index = 0; index < 3; index++) {
        const z = index * 3.3 + 0.8;
        for (const side of [-1, 1]) {
          b.add(
            panel,
            palette.titanium,
            [side * 3, -0.02, z],
            [4.2, 0.5, 2.55],
          );
          b.add(
            panel,
            palette.graphite,
            [side * 3.3, 0.3, z],
            [3.8, 0.14, 2.1],
          );
          b.beam(
            [side * 0.7, -1.25, z - 0.8],
            [side * 4.4, -0.2, z - 0.8],
            0.18,
          );
          b.beam(
            [side * 0.7, -1.25, z + 0.8],
            [side * 4.4, -0.2, z + 0.8],
            0.18,
          );
          for (const edge of [-1.1, 1.1]) {
            b.add(
              box,
              palette.ceramic,
              [side * 3.4, 0.42, z + edge],
              [3.5, 0.1, 0.12],
            );
            for (let h = 0; h < 4; h++)
              b.add(
                box,
                palette.copper,
                [side * (2.3 + h * 0.68), 0.49, z + edge],
                [0.23, 0.02, 0.16],
                [0, 0.4, 0],
              );
          }
          b.add(panel, palette.hull, [side * 5.03, 0.54, z], [0.36, 1.2, 2.4]);
          b.add(box, palette.dark, [side * 5.22, 0.64, z], [0.03, 0.64, 1.65]);
          berths.push([side * 5.05, 1.18, z]);
        }
      }
      // Cargo lift tower and command bridge are substantial off-axis volumes.
      b.add(panel, palette.titanium, [2.4, 1.2, -3], [2.7, 3.7, 2.4]);
      b.add(
        panel,
        palette.hull,
        [2.4, 3.5, -2.65],
        [3.8, 1.1, 3.6],
        [-0.08, 0.06, 0],
      );
      b.add(panel, palette.glass, [2.4, 3.58, -0.76], [3.08, 0.62, 0.08]);
      b.add(box, palette.cyan, [2.4, 3.12, -0.7], [3.2, 0.05, 0.06]);
      for (const x of [1.2, 2.4, 3.6])
        b.add(box, palette.titanium, [x, 3.62, -0.69], [0.1, 0.75, 0.14]);
      b.add(
        cylinder,
        palette.titanium,
        [3.35, 5.05, -3.2],
        [0.055, 2.2, 0.055],
      );
      b.add(sphere, palette.amber, [3.35, 6.17, -3.2], [0.09, 0.09, 0.09]);
      // The observation bridge sits on an actual cantilever beyond the ring's
      // collision envelope. Its interior shares this same world-space anchor.
      b.beam([2.4, 2.7, -2.65], [7.3, 4.3, -2], 0.62);
      b.beam([2.4, 1.2, -2.65], [7.3, 4.1, -2], 0.23);
      b.add(
        panel,
        palette.titanium,
        [7.3, 4.3, -2],
        [5.5, 0.28, 4.7],
        [0, BRIDGE_YAW, 0],
      );
      b.add(
        panel,
        palette.graphite,
        [7.3, 4.48, -2],
        [5.3, 0.1, 4.5],
        [0, BRIDGE_YAW, 0],
      );
      // Exterior of the same walk-in observation bridge. The interior is
      // created on demand, but its roof and pressure shell never pop in.
      const bridgeAnchor = new THREE.Vector3(...BRIDGE_ANCHOR);
      const bridgeRotation = new THREE.Euler(0, BRIDGE_YAW, 0);
      const bridgePart = (
        material: THREE.Material,
        position: Triple,
        scale: Triple,
      ) => {
        const point = new THREE.Vector3(...position)
          .multiplyScalar(BRIDGE_SCALE)
          .applyEuler(bridgeRotation)
          .add(bridgeAnchor);
        b.add(
          panel,
          material,
          point.toArray() as Triple,
          scale.map((value) => value * BRIDGE_SCALE) as Triple,
          [0, BRIDGE_YAW, 0],
        );
      };
      bridgePart(palette.hull, [0, 4.1, -0.5], [8.5, 0.22, 5.4]);
      bridgePart(palette.titanium, [0, 0.32, 3.1], [8.2, 1.1, 0.25]);
      bridgePart(palette.glass, [0, 2.1, 3.1], [7.9, 2.35, 0.08]);
      for (const x of [-2.6, 0, 2.6])
        bridgePart(palette.hull, [x, 2.1, 3.15], [0.08, 2.45, 0.12]);
      for (const side of [-1, 1]) {
        bridgePart(palette.hull, [side * 3.97, 1.65, 0.2], [0.14, 4, 6.3]);
        bridgePart(palette.copper, [side * 3.95, 3.15, 0.2], [0.19, 0.16, 5.9]);
        bridgePart(
          palette.titanium,
          [side * 3.25, 1.65, -2.5],
          [0.15, 3.7, 0.14],
        );
      }
      for (const side of [-1, 1])
        radiator(b, -3.8 + side * 6.6, 2.6, -6.3, side);
      for (let index = 0; index < 5; index++) {
        b.add(
          panel,
          palette.copper,
          [-0.5, -0.25, -3.9 + index * 0.56],
          [1.4, 0.8, 0.42],
        );
        b.add(
          box,
          palette.dark,
          [-0.5, 0.2, -3.9 + index * 0.56],
          [1.28, 0.03, 0.06],
        );
      }
    } else if (source.id === "dock") {
      // Open repair cradle, not a second copy of the home ring.
      b.add(panel, palette.graphite, [0, -0.5, 0], [5.3, 0.8, 4.1]);
      for (const side of [-1, 1]) {
        b.add(panel, palette.hull, [side * 2.7, 0.9, 0], [0.7, 3, 4.7]);
        b.beam([side * 2.7, 1.9, -1.8], [side * 1.4, 3, -1.8], 0.32);
        b.add(
          cylinder,
          palette.copper,
          [side * 1.6, 2.4, -1.8],
          [0.23, 0.7, 0.23],
          [0, 0, Math.PI / 2],
        );
        for (const z of [-1.5, 0, 1.5]) berths.push([side * 2.28, 2, z]);
      }
      for (let index = 0; index < 6; index++)
        b.add(
          box,
          palette.copper,
          [-1.8 + index * 0.72, -0.03, 0],
          [0.3, 0.04, 3.4],
        );
      hub(b, [0, 0.2, -2.6], 0.9);
    } else if (source.kind === "depot") {
      b.add(panel, palette.graphite, [0, -0.4, 0], [4.4, 0.65, 3.6]);
      const cold = source.regionId === "frost";
      for (const side of [-1, 1]) {
        b.add(
          cylinder,
          cold ? palette.ice : palette.hull,
          [side * 1.22, 0.6, 0],
          [0.7, 3.5, 0.7],
          [Math.PI / 2, 0, 0],
        );
        for (const z of [-1.5, -0.5, 0.5, 1.5]) {
          b.add(
            ring(0.73, 0.065),
            palette.titanium,
            [side * 1.22, 0.6, z],
            [1, 1, 1],
          );
          b.add(
            box,
            palette.copper,
            [side * 1.22, -0.02, z],
            [1.65, 0.3, 0.18],
          );
        }
        b.add(
          sphere,
          palette.titanium,
          [side * 1.22, 0.6, 1.78],
          [0.64, 0.64, 0.2],
        );
      }
      b.add(panel, palette.hull, [0, 1.8, -0.2], [0.7, 0.55, 3.1]);
      for (let i = 0; i < 5; i++)
        b.add(box, palette.amber, [0, 2.1, -1.4 + i * 0.6], [0.4, 0.03, 0.12]);
      berths.push([-2.3, 0.4, 1.8], [2.3, 0.4, 1.8]);
    } else if (source.kind === "outpost") {
      // Frost's double pressure domes and ice-grey buttresses have a different silhouette.
      hub(b, [0, 0.1, 0], 1.7);
      b.add(sphere, palette.ice, [0, 1.4, 0], [1.7, 1, 1.7]);
      b.add(
        ring(1.7, 0.1),
        palette.titanium,
        [0, 1.3, 0],
        [1, 1, 1],
        [Math.PI / 2, 0, 0],
      );
      for (const side of [-1, 1]) {
        b.add(panel, palette.hull, [side * 2.4, 0.1, 0], [2.6, 0.7, 1.7]);
        b.add(sphere, palette.glass, [side * 2.5, 0.8, 0], [0.6, 0.6, 0.6]);
        b.beam([side * 2.8, 0, 0], [side * 0.9, 1.6, 0], 0.13);
        berths.push([side * 3.3, 0.6, 0]);
      }
      radiator(b, 0, 0.1, -3.3);
    } else if (source.kind === "science") {
      hub(b, [0, 0, 0], 1.45);
      for (let index = 0; index < 3; index++) {
        const angle = (index * Math.PI * 2) / 3;
        const x = Math.sin(angle) * 2.3,
          z = Math.cos(angle) * 2.3;
        b.add(
          panel,
          palette.ceramic,
          [x, 0.5, z],
          [1.3, 1.5, 2.5],
          [0, angle, 0],
        );
        b.add(
          panel,
          palette.glass,
          [x, 1.31, z],
          [0.83, 0.09, 1.7],
          [0, angle, 0],
        );
        b.beam([0, 0.4, 0], [x, 0.4, z], 0.5);
        berths.push([x * 1.36, 0.45, z * 1.36]);
      }
      b.add(cylinder, palette.graphite, [0, 2.3, 0], [0.44, 3.4, 0.44]);
      b.add(cone, palette.ceramic, [0, 3.9, 0], [0.7, 1.1, 0.7]);
      b.add(
        ring(0.72, 0.06),
        palette.amber,
        [0, 3.4, 0],
        [1, 1, 1],
        [Math.PI / 2, 0, 0],
      );
    } else if (source.kind === "sample") {
      const rock = keep(new THREE.IcosahedronGeometry(1, 1));
      for (let index = 0; index < 5; index++) {
        const a = index * 2.4;
        b.add(
          rock,
          palette.rock,
          [Math.sin(a) * 1.7, index * 0.2 - 0.2, Math.cos(a) * 1.7],
          [1.1, 0.75 + index * 0.07, 0.8],
          [a, a * 0.3, a],
        );
      }
      b.add(cylinder, palette.copper, [0, 1.4, 0], [0.13, 1.6, 0.13]);
      b.add(sphere, palette.amber, [0, 2.3, 0], [0.17, 0.17, 0.17]);
    } else {
      // Forked, asymmetrical relay with receiver vanes and a service spine.
      b.add(panel, palette.titanium, [0, 0.25, 0], [1.6, 0.8, 2.6]);
      b.add(panel, palette.hull, [0, 1.2, 0], [0.72, 1.4, 1.3]);
      for (const side of [-1, 1]) {
        b.beam([side * 0.3, 1.3, 0], [side * 1.5, 2.3, -0.2], 0.2);
        b.add(
          wedge(0.55, 0.82, 0.2, Math.PI * 1.48),
          palette.hull,
          [side * 1.5, 2.6, -0.2],
          [1, 1, 1],
          [0.15, side * 0.22, -0.7],
        );
        b.add(cylinder, palette.cyan, [side * 1.5, 2.65, 0], [0.05, 1.1, 0.05]);
      }
      radiator(b, 0, 0.15, -2.3);
      berths.push([-1.3, 0.55, 1.2], [1.3, 0.55, 1.2]);
    }
    const group = b.finish();
    group.position.set(...source.position);
    const damage = new THREE.Group();
    const crackBuilder = builder();
    for (let i = 0; i < 4; i++) {
      crackBuilder.add(
        panel,
        palette.dark,
        [(i - 1.5) * 0.45, 0.9, 1.38],
        [0.6, 0.19, 0.08],
        [0, 0, i % 2 ? -0.5 : 0.5],
      );
      crackBuilder.add(
        box,
        palette.red,
        [(i - 1.5) * 0.45, 1.01, 1.42],
        [0.29, 0.03, 0.02],
        [0, 0, i % 2 ? -0.5 : 0.5],
      );
    }
    damage.add(crackBuilder.finish());
    damage.visible = source.damaged;
    group.add(damage);
    const berthLights = berths.map((position) => {
      const lamp = new THREE.Mesh(box, palette.cyan);
      lamp.position.set(...position);
      lamp.scale.set(0.23, 0.11, 0.5);
      group.add(lamp);
      return lamp;
    });
    return { group, damage, berthLights };
  }

  function ship(role: ShipRole): ShipModel {
    const b = builder();
    const accent =
      role === "repair"
        ? palette.amber
        : role === "survey"
          ? palette.white
          : palette.cyan;
    const engines = new THREE.Group(),
      scanner = new THREE.Group(),
      tools = new THREE.Group(),
      lift = new THREE.Group();
    const cargo: ShipModel["cargo"] = {
      energy: [],
      supplies: [],
      parts: [],
      samples: [],
    };
    function engine(x: number, y: number, z: number, size: number) {
      b.add(
        cylinder,
        palette.titanium,
        [x, y, z + 0.48],
        [size, 1.3, size],
        [Math.PI / 2, 0, 0],
      );
      b.add(
        engineBell,
        palette.hull,
        [x, y, z - 0.2],
        [size * 1.1, 0.52, size * 1.1],
        [Math.PI / 2, 0, 0],
      );
      b.add(
        cylinder,
        palette.dark,
        [x, y, z - 0.44],
        [size * 0.94, 0.03, size * 0.94],
        [Math.PI / 2, 0, 0],
      );
      b.add(
        ring(size * 1.09, 0.035),
        palette.copper,
        [x, y, z - 0.48],
        [1, 1, 1],
      );
      const plume = new THREE.Mesh(
        keep(new THREE.ConeGeometry(size * 0.75, 1.35, 10)),
        accent,
      );
      plume.rotation.x = Math.PI / 2;
      plume.position.set(x, y, z - 1.1);
      engines.add(plume);
    }
    if (role === "transport") {
      // Long freight keel, open cargo lattice and four separately readable drive bells.
      b.add(panel, palette.titanium, [0, -0.25, -0.35], [1, 0.42, 5.5]);
      b.add(
        panel,
        palette.hull,
        [0, 0.04, 2.15],
        [1.62, 0.85, 1.65],
        [-0.09, 0, 0],
      );
      b.add(
        panel,
        palette.glass,
        [0, 0.5, 2.58],
        [1.15, 0.24, 0.67],
        [-0.18, 0, 0],
      );
      b.add(panel, palette.ceramic, [0, 0.7, 2.08], [1.35, 0.16, 0.74]);
      for (const side of [-1, 1]) {
        b.beam([side * 0.86, 0.65, -1.9], [side * 0.86, 0.65, 1.45], 0.16);
        b.beam([side * 0.86, -0.5, -1.9], [side * 0.86, -0.5, 1.45], 0.13);
        for (let index = 0; index < 4; index++) {
          const z = -1.75 + index * 1.02;
          b.beam(
            [side * 0.86, -0.5, z],
            [side * 0.86, 0.65, z + 0.74],
            0.07,
            palette.copper,
          );
          b.add(box, palette.hull, [side * 0.9, 0.1, z], [0.15, 1.15, 0.13]);
          b.add(
            cylinder,
            palette.titanium,
            [side * 0.9, 0.6, z],
            [0.065, 0.04, 0.065],
          );
          b.add(
            box,
            palette.graphite,
            [side * 0.39, -0.025, z + 0.3],
            [0.6, 0.07, 0.76],
          );
          b.add(
            box,
            palette.copper,
            [side * 0.63, 0.022, z + 0.3],
            [0.035, 0.02, 0.55],
          );
        }
        b.beam(
          [side * 0.62, -0.48, -1.7],
          [side * 0.62, -0.48, 1.65],
          0.09,
          palette.copper,
        );
        for (let seam = 0; seam < 3; seam++) {
          b.add(
            box,
            palette.dark,
            [side * 0.76, 0.29, 1.67 + seam * 0.31],
            [0.025, 0.36, 0.02],
          );
          b.add(
            cylinder,
            palette.titanium,
            [side * 0.62, 0.51, 1.66 + seam * 0.31],
            [0.042, 0.035, 0.042],
          );
        }
        b.add(
          panel,
          palette.graphite,
          [side * 1.38, -0.1, -1.67],
          [0.9, 0.7, 1.6],
          [0, side * 0.08, 0],
        );
        engine(side * 1.38, 0.22, -2.05, 0.31);
        engine(side * 1.38, -0.46, -2.05, 0.25);
        for (let i = 0; i < 5; i++)
          b.add(
            box,
            palette.dark,
            [side * 1.85, 0.13, -1.1 - i * 0.18],
            [0.03, 0.42, 0.055],
          );
        b.add(box, accent, [side * 0.87, 0.72, 1.4], [0.15, 0.07, 0.5]);
      }
      const crane = builder();
      crane.add(panel, palette.copper, [0, 0.1, 0], [1.9, 0.15, 0.65]);
      for (const side of [-1, 1])
        crane.add(
          box,
          palette.titanium,
          [side * 0.83, -0.3, 0],
          [0.12, 0.7, 0.62],
        );
      lift.add(crane.finish());
      lift.position.set(0, 1.02, 0);
    } else if (role === "survey") {
      // A narrow instrument fuselage with three radial booms and exposed sensors.
      b.add(panel, palette.hull, [0, 0, 0.3], [0.86, 0.58, 3.25]);
      b.add(
        cone,
        palette.ceramic,
        [0, 0.02, 2.03],
        [0.45, 0.85, 0.45],
        [Math.PI / 2, 0, 0],
      );
      b.add(panel, palette.glass, [0, 0.35, 0.85], [0.62, 0.21, 0.91]);
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 + Math.PI / 2;
        const x = Math.cos(a) * 1.35,
          y = Math.sin(a) * 1.35;
        b.beam([0, 0, -0.25], [x, y, -0.65], 0.14);
        b.add(panel, palette.solar, [x, y, -0.4], [0.76, 0.1, 1.66], [0, 0, a]);
        b.add(
          box,
          palette.copper,
          [x, y + 0.07, -0.4],
          [0.035, 0.035, 1.5],
          [0, 0, a],
        );
        b.add(sphere, accent, [x, y, 0.6], [0.09, 0.09, 0.09]);
      }
      b.add(
        ring(0.58, 0.08, Math.PI * 1.6),
        palette.titanium,
        [0, 0.07, 1.9],
        [1, 1, 1],
        [0, 0, 0.6],
      );
      engine(0, 0, -1.4, 0.34);
      const sensor = new THREE.Mesh(ring(0.85, 0.026), accent);
      sensor.position.z = 2.27;
      scanner.add(sensor);
    } else {
      // Broad service tug: twin exposed manipulators, a low body, and a spare-parts cabinet.
      b.add(panel, palette.copper, [0, -0.02, 0], [2.3, 0.72, 2.6]);
      b.add(panel, palette.hull, [0, 0.49, -0.05], [1.24, 0.36, 1.4]);
      b.add(
        panel,
        palette.glass,
        [0, 0.43, 1.07],
        [1.5, 0.28, 0.16],
        [-0.12, 0, 0],
      );
      for (const side of [-1, 1]) {
        b.add(
          panel,
          palette.graphite,
          [side * 0.9, 0.49, -0.42],
          [0.44, 0.32, 1.08],
        );
        for (let index = 0; index < 4; index++)
          b.add(
            box,
            palette.hull,
            [side * 0.9, 0.69, -0.81 + index * 0.25],
            [0.36, 0.04, 0.08],
          );
        b.add(
          cylinder,
          palette.titanium,
          [side * 1.25, 0, 0.66],
          [0.25, 0.25, 0.25],
          [0, 0, Math.PI / 2],
        );
        const arm = builder();
        arm.beam(
          [side * 1.25, 0, 0.7],
          [side * 1.8, 0, 1.75],
          0.16,
          palette.copper,
        );
        arm.beam([side * 1.8, 0, 1.75], [side * 1.1, 0.13, 2.75], 0.13);
        arm.add(
          cylinder,
          palette.hull,
          [side * 1.8, 0, 1.75],
          [0.2, 0.23, 0.2],
          [Math.PI / 2, 0, 0],
        );
        for (const finger of [-1, 1])
          arm.beam(
            [side * 1.1, 0.13, 2.75],
            [side * 1.1 + finger * 0.2, 0.13, 3.12],
            0.07,
          );
        tools.add(arm.finish());
        engine(side * 0.85, 0, -1.35, 0.34);
        b.add(box, accent, [side * 1.1, 0.39, 0.38], [0.09, 0.035, 0.6]);
      }
    }
    const group = b.finish();
    const resourceMaterials = {
      energy: palette.cyan,
      supplies: palette.copper,
      parts: palette.titanium,
      samples: palette.ice,
    };
    for (const [resourceIndex, resource] of (
      ["energy", "supplies", "parts", "samples"] as Resource[]
    ).entries()) {
      for (let index = 0; index < 4; index++) {
        const cell = new THREE.Mesh(panel, resourceMaterials[resource]);
        cell.scale.set(0.66, 0.56, 0.66);
        // Resource rows have distinct positions; counts follow the real cargo ledger.
        cell.position.set(
          (resourceIndex % 2 ? 1 : -1) * 0.38,
          0.04 + Math.floor(resourceIndex / 2) * 0.6,
          -1.35 + index * 0.69,
        );
        cell.visible = false;
        cargo[resource].push(cell);
        group.add(cell);
      }
    }
    group.add(engines, scanner, tools, lift);
    engines.visible = false;
    scanner.visible = false;
    lift.visible = false;
    group.scale.setScalar(role === "transport" ? 0.82 : 0.64);
    return { group, cargo, engines, scanner, tools, lift };
  }

  function instrument(position: Triple, size: [number, number], yaw = 0) {
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 640;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    displays.push({ canvas, texture });
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      color: "#b3cccd",
      toneMapped: false,
    });
    materials.add(mat);
    const geometry = keep(new THREE.PlaneGeometry(...size));
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(...position);
    mesh.rotation.set(0.32, yaw, 0);
    return mesh;
  }

  // These are three physical displays in the bridge, all painted from the
  // authoritative snapshot. No animation clock, guessed values or fake telemetry.
  function updateBridge(
    snapshot: DominionSnapshot,
    selected: Selection | null,
  ) {
    const ship =
      snapshot.ships.find(
        (item) => selected?.kind === "ship" && item.id === selected.id,
      ) ||
      snapshot.ships.find((item) => item.transit || item.action) ||
      snapshot.ships[0];
    for (const [index, display] of displays.entries()) {
      const c = display.canvas.getContext("2d");
      if (!c) continue;
      c.fillStyle = "#07151d";
      c.fillRect(0, 0, 960, 640);
      c.strokeStyle = "#183746";
      c.lineWidth = 1;
      for (let x = 32; x < 960; x += 56) {
        c.beginPath();
        c.moveTo(x, 96);
        c.lineTo(x, 610);
        c.stroke();
      }
      for (let y = 112; y < 640; y += 56) {
        c.beginPath();
        c.moveTo(24, y);
        c.lineTo(936, y);
        c.stroke();
      }
      c.font = '600 34px "Segoe UI", "Microsoft YaHei", sans-serif';
      c.fillStyle = "#a9e6df";
      c.fillText(
        index === 0
          ? "曙光环港 / 实时航图"
          : index === 1
            ? "舰船 / 执行状态"
            : "任务中枢",
        32,
        54,
      );
      c.font = '27px "Segoe UI", "Microsoft YaHei", sans-serif';
      c.fillStyle = "#e6bc89";
      c.fillText(
        `T${String(snapshot.tick).padStart(3, "0")} · WORLD ${snapshot.worldVersion} · ${snapshot.status.toUpperCase()}`,
        32,
        96,
      );
      if (index === 0) {
        const project = (position: readonly number[]) =>
          [
            80 + ((position[0]! + 22) / 44) * 780,
            166 + ((position[2]! + 15) / 31) * 350,
          ] as const;
        for (const lane of snapshot.lanes) {
          const from = snapshot.stations.find(
            (station) => station.id === lane.from,
          );
          const to = snapshot.stations.find(
            (station) => station.id === lane.to,
          );
          if (!from || !to) continue;
          const p = project(from.position),
            q = project(to.position);
          c.strokeStyle = !lane.open
            ? "#ed7966"
            : lane.damaged
              ? "#e6bc89"
              : "#42606f";
          c.lineWidth = ship?.route.includes(lane.id) ? 6 : 3;
          c.beginPath();
          c.moveTo(...p);
          c.lineTo(...q);
          c.stroke();
        }
        for (const station of snapshot.stations) {
          const p = project(station.position);
          c.fillStyle = station.damaged ? "#e6bc89" : "#9cdbd9";
          c.fillRect(p[0] - 5, p[1] - 5, 10, 10);
        }
        for (const item of snapshot.ships) {
          const origin = snapshot.stations.find(
            (station) => station.id === (item.transit?.from || item.nodeId),
          );
          const destination = snapshot.stations.find(
            (station) => station.id === item.transit?.to,
          );
          if (!origin) continue;
          const point = new THREE.Vector3(...origin.position);
          if (destination && item.transit)
            point.lerp(
              new THREE.Vector3(...destination.position),
              item.transit.elapsed / Math.max(1, item.transit.duration),
            );
          const p = project(point.toArray());
          c.fillStyle = item.id === ship?.id ? "#ffffff" : "#d79765";
          c.beginPath();
          c.arc(...p, item.id === ship?.id ? 9 : 5, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = "#a9c3cc";
        c.fillText(
          `${snapshot.stations.length} 站点 · ${snapshot.lanes.filter((lane) => lane.open && !lane.damaged).length}/${snapshot.lanes.length} 可用航道`,
          32,
          600,
        );
      } else if (index === 1 && ship) {
        c.fillStyle = "#d9ecec";
        c.font = '600 42px "Segoe UI", "Microsoft YaHei", sans-serif';
        c.fillText(ship.label, 32, 174);
        c.font = '30px "Segoe UI", "Microsoft YaHei", sans-serif';
        c.fillText(`ENERGY  ${ship.energy} / ${ship.initialEnergy}`, 32, 232);
        c.fillStyle = "#264454";
        c.fillRect(32, 256, 880, 18);
        c.fillStyle = "#84ccc5";
        c.fillRect(
          32,
          256,
          880 *
            Math.min(
              1,
              Math.max(0, ship.energy / Math.max(1, ship.initialEnergy)),
            ),
          18,
        );
        c.fillText(ship.status.toUpperCase(), 32, 330);
        c.fillStyle = "#c7d8dd";
        const next = ship.transit?.laneId || ship.route[0];
        const lane = snapshot.lanes.find((item) => item.id === next);
        const route = lane
          ? `${lane.from} → ${lane.to}`
          : `泊位 ${ship.nodeId}`;
        c.fillText(route, 32, 388);
        const progress = ship.transit || ship.action;
        c.fillText(
          progress
            ? `PROGRESS  ${progress.elapsed} / ${progress.duration}`
            : "等待真实指令",
          32,
          442,
        );
        c.fillText(
          `货舱 ${Object.values(ship.cargo).reduce((sum, count) => sum + count, 0)} / ${ship.capacity}`,
          32,
          502,
        );
        c.fillStyle = "#e6bc89";
        c.fillText(
          `PLAN ${ship.planVersion} · ${ship.disabled ? "DISABLED" : "CONNECTED"}`,
          32,
          598,
        );
      } else {
        c.fillStyle = "#d9ecec";
        c.font = '600 82px "Segoe UI", sans-serif';
        c.fillText(
          `${snapshot.missions.filter((mission) => mission.status === "completed").length} / ${snapshot.missions.length}`,
          32,
          212,
        );
        c.font = '28px "Segoe UI", "Microsoft YaHei", sans-serif';
        c.fillStyle = "#a9c3cc";
        c.fillText("已完成任务", 32, 260);
        snapshot.missions.slice(0, 4).forEach((mission, row) => {
          c.fillStyle = mission.status === "completed" ? "#a9e6df" : "#d6c1a8";
          c.fillText(`${mission.id} · ${mission.status}`, 32, 332 + row * 55);
        });
        c.fillStyle = "#a9c3cc";
        c.fillText(
          `REPLANS ${snapshot.replans} · ${snapshot.connected ? "ONLINE" : "OFFLINE"}`,
          32,
          600,
        );
      }
      display.texture.needsUpdate = true;
    }
  }

  function bridge() {
    const b = builder();
    // A standing eye-height camera sees recessed controls below an unobstructed window.
    b.add(panel, palette.graphite, [0, -0.32, 0.25], [8.2, 0.45, 7]);
    b.add(panel, palette.titanium, [0, 3.92, -0.5], [8.4, 0.3, 5.3]);
    for (const side of [-1, 1]) {
      b.add(panel, palette.graphite, [side * 3.82, 1.57, 0.2], [0.5, 4, 6.2]);
      b.beam(
        [side * 3.5, -0.1, -2.25],
        [side * 2.7, 3.8, -2.8],
        0.18,
        palette.hull,
      );
      b.beam(
        [side * 1.48, 0.12, -2.63],
        [side * 1.7, 3.77, -2.76],
        0.095,
        palette.titanium,
      );
      b.add(box, palette.amber, [side * 3.55, 0.05, 0], [0.035, 0.025, 4.8]);
      // Sloping console decks, separate recessed displays, raised bezel and physical switches.
      b.add(
        panel,
        palette.titanium,
        [side * 2.25, 0.3, -1.1],
        [2.1, 1.3, 2],
        [0, side * -0.23, 0],
      );
      b.add(
        panel,
        palette.dark,
        [side * 2.25, 1.01, -1.02],
        [1.86, 0.12, 1.65],
        [0.32, side * -0.23, 0],
      );
      b.add(
        panel,
        palette.glass,
        [side * 2.25, 1.25, -1.19],
        [1.55, 0.025, 1.04],
        [0.32, side * -0.23, 0],
      );
      for (let index = 0; index < 5; index++) {
        b.add(
          box,
          index % 3 ? palette.cyan : palette.amber,
          [side * 2.25 + (index - 2) * 0.2, 1.02, -0.32],
          [0.08, 0.05, 0.08],
        );
      }
      b.add(cylinder, palette.dark, [side * 2.25, 0.4, 1], [0.7, 0.75, 0.7]);
      b.add(
        panel,
        palette.graphite,
        [side * 2.25, 1.25, 1.45],
        [1, 1.25, 0.3],
        [0.15, 0, 0],
      );
    }
    b.beam([-3.5, 0.02, -2.25], [3.5, 0.02, -2.25], 0.17, palette.hull);
    b.beam([-2.7, 3.8, -2.8], [2.7, 3.8, -2.8], 0.17, palette.hull);
    b.add(panel, palette.titanium, [0, 0.45, -1.92], [1.54, 0.85, 1.1]);
    b.add(
      panel,
      palette.glass,
      [0, 0.94, -1.9],
      [1.26, 0.065, 0.87],
      [0.32, 0, 0],
    );
    const group = b.finish();
    group.add(instrument([-2.25, 1.28, -1.18], [1.55, 1.04], 0.23));
    group.add(instrument([2.25, 1.28, -1.18], [1.55, 1.04], -0.23));
    group.add(instrument([0, 0.99, -1.9], [1.26, 0.87]));
    return group;
  }

  function label(text: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 80;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Label surface unavailable");
    context.fillStyle = "#07121fe8";
    context.fillRect(0, 0, 512, 80);
    context.fillStyle = "#8fdfd6";
    context.fillRect(0, 0, 4, 80);
    context.fillStyle = "#d9eeed";
    context.font = '500 28px "Segoe UI", "Microsoft YaHei", sans-serif';
    context.fillText(text, 20, 49);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    textures.add(map);
    const mat = new THREE.SpriteMaterial({
      map,
      depthWrite: false,
      transparent: true,
    });
    materials.add(mat);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4.1, 0.64, 1);
    return sprite;
  }
  /** Lazily allocated read-only ledger. Updates only when its station data changes. */
  function resourceLabel(initial: Station) {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 200;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Resource surface unavailable");
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    textures.add(map);
    const mat = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
    });
    materials.add(mat);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(7, 2.1875, 1);
    let previous = "";
    function update(station: Station) {
      const key = JSON.stringify([
        station.label,
        station.stock,
        station.reserved,
      ]);
      if (previous === key) return;
      previous = key;
      const c = context!;
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.fillStyle = "#07121ff2";
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.fillStyle = "#8fdfd6";
      c.fillRect(0, 0, 5, canvas.height);
      c.font = '500 27px "Segoe UI", "Microsoft YaHei", sans-serif';
      c.fillText(`${station.label} · 库存 / 已预留`, 22, 41, 590);
      c.fillStyle = "#e5f3f1";
      c.font = '500 30px "Segoe UI", "Microsoft YaHei", sans-serif';
      const resources = [
        ["energy", "能源"],
        ["supplies", "补给"],
        ["parts", "维修件"],
        ["samples", "样本"],
      ] as const;
      resources.forEach(([resource, name], index) => {
        c.fillText(
          `${name} ${station.stock[resource]} / ${station.reserved[resource]}`,
          22 + (index % 2) * 307,
          103 + Math.floor(index / 2) * 60,
          290,
        );
      });
      map.needsUpdate = true;
    }
    update(initial);
    return { sprite, update };
  }
  function environment() {
    const group = new THREE.Group();
    const planets: PlanetModel[] = [];
    const specs: {
      id: RegionId;
      position: Triple;
      radius: number;
      theme: number;
    }[] = [
      { id: "dawn", position: [-50, 2, -90], radius: 17, theme: 0 },
      { id: "frost", position: [18, 6, -60], radius: 9.5, theme: 1 },
      { id: "ember", position: [45, -3, -34], radius: 7.5, theme: 2 },
    ];
    for (const spec of specs) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          theme: { value: spec.theme },
          sun: { value: new THREE.Vector3(-0.7, 0.4, 0.6).normalize() },
        },
        vertexShader: `varying vec3 p; varying vec3 n; void main(){p=position;n=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec3 p; varying vec3 n; uniform float theme; uniform vec3 sun;
          float hash(vec3 v){return fract(sin(dot(v,vec3(127.1,311.7,74.7)))*43758.5453);}
          float noise(vec3 v){vec3 i=floor(v),f=fract(v);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
          void main(){vec3 q=normalize(p);float f=noise(q*5.)*.65+noise(q*18.)*.25+noise(q*48.)*.1;vec3 c;
          if(theme<.5){float bands=sin(q.y*22.+f*6.)*.5+.5;c=mix(vec3(.055,.11,.17),vec3(.18,.32,.41),bands*.7+f*.3);c=mix(c,vec3(.47,.59,.65),smoothstep(.66,.82,f)*.35);}
          else if(theme<1.5){float fractures=pow(abs(sin(q.x*16.+sin(q.y*5.)+noise(q*3.)*2.)),30.);float polar=smoothstep(.4,.9,abs(q.y));c=mix(vec3(.13,.26,.31),vec3(.61,.75,.78),f*.48+polar*.38+.15);c=mix(c,vec3(.21,.34,.38),fractures*.16);}
          else{float ridges=abs(noise(q*12.)-.5)*2.;c=mix(vec3(.2,.075,.025),vec3(.55,.31,.16),f);c+=vec3(.12,.055,.018)*ridges;}
          float day=smoothstep(-.11,.32,dot(normalize(n),sun));gl_FragColor=vec4(c*(.026+day*.96),1.);}`,
      });
      materials.add(mat);
      const body = new THREE.Group();
      body.position.set(...spec.position);
      body.rotation.z = spec.theme === 1 ? -0.2 : 0.16;
      body.add(
        new THREE.Mesh(
          keep(new THREE.SphereGeometry(spec.radius, 64, 40)),
          mat,
        ),
      );
      const atmosphereMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        uniforms: {
          tint: {
            value: new THREE.Color(spec.theme === 2 ? "#ac582d" : "#467d99"),
          },
        },
        vertexShader:
          "varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}",
        fragmentShader:
          "varying vec3 n;varying vec3 v;uniform vec3 tint;void main(){float a=pow(1.-abs(dot(n,v)),3.);gl_FragColor=vec4(tint,a*.24);}",
      });
      materials.add(atmosphereMat);
      body.add(
        new THREE.Mesh(
          keep(new THREE.SphereGeometry(spec.radius * 1.014, 48, 24)),
          atmosphereMat,
        ),
      );
      if (spec.id === "frost") {
        const ringMaterial = new THREE.ShaderMaterial({
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          vertexShader:
            "varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
          fragmentShader:
            "varying vec3 p;void main(){float r=length(p.xy);float stripe=.5+.5*sin(r*35.);float a=.12+stripe*.12;gl_FragColor=vec4(.46,.64,.67,a);}",
        });
        materials.add(ringMaterial);
        const belt = new THREE.Mesh(
          keep(
            new THREE.RingGeometry(spec.radius * 1.24, spec.radius * 1.78, 96),
          ),
          ringMaterial,
        );
        belt.rotation.x = 1.17;
        belt.rotation.y = 0.12;
        body.add(belt);
      }
      if (spec.id === "ember") {
        const fragments = new THREE.InstancedMesh(
          keep(new THREE.IcosahedronGeometry(1, 0)),
          palette.rock,
          34,
        );
        instances.add(fragments);
        const transform = new THREE.Object3D();
        for (let i = 0; i < 34; i++) {
          const a = i * 2.399;
          transform.position.set(
            Math.cos(a) * (14 + (i % 4)),
            Math.sin(a) * 2 - 5,
            Math.sin(a) * 13,
          );
          transform.scale.set(0.24 + (i % 3) * 0.1, 0.15 + (i % 4) * 0.09, 0.3);
          transform.rotation.set(a, a * 0.3, a * 0.7);
          transform.updateMatrix();
          fragments.setMatrixAt(i, transform.matrix);
        }
        body.add(fragments);
      }
      group.add(body);
      planets.push({ id: spec.id, group: body, radius: spec.radius });
    }
    let seed = 4217;
    const random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const positions: number[] = [],
      colors: number[] = [];
    for (let i = 0; i < 620; i++) {
      positions.push(
        (random() - 0.5) * 220,
        random() * 105 - 30,
        -65 - random() * 100,
      );
      const value = 0.32 + random() * 0.42;
      colors.push(value * 0.8, value * 0.9, value);
    }
    const starGeometry = keep(new THREE.BufferGeometry());
    starGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    starGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3),
    );
    const starMaterial = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    materials.add(starMaterial);
    group.add(new THREE.Points(starGeometry, starMaterial));
    const nebulaMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader:
        "varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec2 v;void main(){float d=length((v-.5)*vec2(1.,2.6));float a=exp(-d*d*12.)*.1;gl_FragColor=vec4(.18,.27,.38,a);}",
    });
    materials.add(nebulaMaterial);
    const nebula = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(170, 80)),
      nebulaMaterial,
    );
    nebula.position.set(0, 15, -95);
    nebula.rotation.z = -0.2;
    group.add(nebula);
    return { group, planets };
  }
  return {
    station,
    ship,
    bridge,
    updateBridge,
    label,
    resourceLabel,
    environment,
    builder,
    keep,
    material,
    palette,
    materials,
    dispose() {
      // InstancedMesh owns its matrix/color GPU attributes independently of
      // BufferGeometry. Disposing only the shared geometry leaves those alive.
      for (const item of instances) item.dispose();
      for (const item of geometries) item.dispose();
      for (const item of materials) item.dispose();
      for (const item of textures) item.dispose();
      geometries.clear();
      materials.clear();
      textures.clear();
      instances.clear();
      displays.length = 0;
      sectorCache.clear();
    },
  };
}
