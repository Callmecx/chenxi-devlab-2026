import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { OrbitStation } from "../../../../../packages/intelligence/src/orbit/types";

/** Original procedural geometry. No downloaded models, textures, or external assets. */
export function createOrbitAssets() {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const material = (color: string, metalness = 0.4, roughness = 0.48) => {
    const value = new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
    });
    materials.add(value);
    return value;
  };
  const light = (color: string) => {
    const value = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.4,
      roughness: 0.3,
    });
    materials.add(value);
    return value;
  };
  const palette = {
    shell: material("#8196a0", 0.55),
    white: material("#bcc6c9", 0.42),
    metal: material("#2b414c", 0.65),
    dark: material("#101922", 0.45),
    copper: material("#b68353", 0.55),
    blue: material("#142932", 0.65, 0.25),
    cyan: light("#75e9e1"),
    amber: light("#ffc078"),
    red: light("#ff7063"),
    glass: material("#275679", 0.65, 0.15),
  };
  const keep = <T extends THREE.BufferGeometry>(geometry: T) => {
    geometries.add(geometry);
    return geometry;
  };
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = keep(new THREE.CylinderGeometry(1, 1, 1, 16));
  const sphere = keep(new THREE.SphereGeometry(1, 16, 10));
  const taper = keep(new THREE.CylinderGeometry(0.65, 1, 1, 8));
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.42);
  shape.lineTo(-0.42, -0.5);
  shape.lineTo(0.42, -0.5);
  shape.lineTo(0.5, -0.42);
  shape.lineTo(0.5, 0.42);
  shape.lineTo(0.42, 0.5);
  shape.lineTo(-0.42, 0.5);
  shape.lineTo(-0.5, 0.42);
  shape.closePath();
  const bevel = keep(
    new THREE.ExtrudeGeometry(shape, {
      depth: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: 0.04,
      bevelThickness: 0.04,
    }),
  );
  bevel.translate(0, 0, -0.5);

  function builder() {
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const transform = new THREE.Object3D();
    function add(
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      position: [number, number, number],
      scale: [number, number, number],
      rotation: [number, number, number] = [0, 0, 0],
    ) {
      transform.position.set(...position);
      transform.scale.set(...scale);
      transform.rotation.set(...rotation);
      transform.updateMatrix();
      const copy = geo.index ? geo.toNonIndexed() : geo.clone();
      copy.applyMatrix4(transform.matrix);
      const bucket = parts.get(mat) || [];
      bucket.push(copy);
      parts.set(mat, bucket);
    }
    function finish() {
      const group = new THREE.Group();
      for (const [mat, chunks] of parts) {
        const merged = mergeGeometries(chunks);
        for (const chunk of chunks) chunk.dispose();
        if (!merged) throw new Error("Unable to merge orbital asset geometry");
        keep(merged);
        group.add(new THREE.Mesh(merged, mat));
      }
      return group;
    }
    return { add, finish };
  }
  function torus(radius: number, tube: number, arc = Math.PI * 2) {
    return keep(
      new THREE.TorusGeometry(
        radius,
        tube,
        8,
        Math.ceil((64 * arc) / (Math.PI * 2)),
        arc,
      ),
    );
  }
  function station(station: OrbitStation) {
    const b = builder();
    const { add } = b;
    if (station.kind === "port") {
      // The foreground drydock continues beyond the working node, giving the port human scale.
      add(bevel, palette.dark, [-0.7, -0.72, 4.2], [8.4, 1.1, 6]);
      add(bevel, palette.metal, [-0.7, -0.1, 4.2], [7.65, 0.2, 5.3]);
      for (let i = 0; i < 13; i++) {
        add(
          box,
          palette.shell,
          [-4 + i * 0.56, 0.035, 4.5],
          [0.025, 0.035, 4.6],
        );
      }
      for (const x of [-4.65, 3.25]) {
        add(bevel, palette.shell, [x, 0.26, 4.1], [0.52, 0.85, 6.9]);
        add(box, palette.amber, [x, 0.72, 4.4], [0.08, 0.06, 5.7]);
        for (const z of [2.1, 4, 5.9]) {
          add(box, palette.dark, [x, 1.18, z], [0.13, 1.1, 0.15]);
          add(box, palette.shell, [x, 1.75, z], [0.2, 0.09, 1.8]);
        }
      }
      add(
        bevel,
        palette.metal,
        [-3.5, -1.75, 5.2],
        [1.7, 2.5, 2.7],
        [0.2, 0, -0.15],
      );
      add(bevel, palette.shell, [2.4, -1.25, 2.8], [1.2, 2.2, 1.6]);
      add(bevel, palette.metal, [0, -0.3, 0], [6.2, 0.7, 4.5]);
      add(bevel, palette.shell, [-0.8, 0.09, 0], [4.5, 0.12, 3.8]);
      add(bevel, palette.dark, [1.2, 0.1, 0], [2.6, 0.16, 3.4]);
      for (let i = 0; i < 7; i++) {
        add(
          box,
          palette.copper,
          [-2.5 + i * 0.75, 0.18, 1.9],
          [0.34, 0.04, 0.24],
          [0, -0.35, 0],
        );
        add(
          box,
          palette.cyan,
          [-2.3 + i * 0.78, 0.2, -1.7],
          [0.36, 0.05, 0.08],
        );
      }
      add(bevel, palette.dark, [-1.4, 0.9, -1.6], [2.3, 1.65, 0.8]);
      add(bevel, palette.white, [-1.4, 1.8, -1.45], [2.8, 0.45, 1.15]);
      add(box, palette.glass, [-1.4, 1.65, -0.99], [2.25, 0.3, 0.06]);
      add(box, palette.cyan, [-1.4, 1.86, -0.92], [2.35, 0.06, 0.08]);
      for (const x of [-2.8, 2.8]) {
        add(bevel, palette.white, [x, 0.6, -0.5], [0.5, 1.2, 2.8]);
        add(box, palette.amber, [x, 1.23, 0], [0.36, 0.04, 0.7]);
        add(cylinder, palette.dark, [x, -0.8, 1], [0.36, 0.8, 0.36]);
      }
      add(cylinder, palette.shell, [-2.4, 2.8, -1.6], [0.065, 2.2, 0.065]);
      add(sphere, palette.red, [-2.4, 3.92, -1.6], [0.11, 0.11, 0.11]);
    } else if (station.kind === "target") {
      // Segmented working ring, service spokes and asymmetric inhabited modules.
      add(
        torus(4.2, 0.26, Math.PI * 1.76),
        palette.shell,
        [0, 0.5, 0],
        [1, 1, 1],
        [Math.PI / 2, 0, 0.35],
      );
      add(
        torus(3.78, 0.095, Math.PI * 1.82),
        palette.cyan,
        [0, 0.54, 0],
        [1, 1, 1],
        [Math.PI / 2, 0, 0.2],
      );
      add(
        torus(4.55, 0.12, Math.PI * 1.72),
        palette.dark,
        [0, 0.5, 0],
        [1, 1, 1],
        [Math.PI / 2, 0, 0.4],
      );
      add(
        torus(4.26, 0.11, Math.PI * 1.86),
        palette.metal,
        [0, -0.3, 0],
        [1, 1, 1],
        [Math.PI / 2, 0, 0.1],
      );
      add(
        torus(3.52, 0.075, Math.PI * 1.7),
        palette.copper,
        [0, 0.05, 0],
        [1, 1, 1],
        [Math.PI / 2, 0, 0.2],
      );
      for (let i = 0; i < 11; i++) {
        const angle = i * 0.52 + 0.15,
          x = Math.cos(angle) * 4.2,
          z = Math.sin(angle) * 4.2;
        add(
          bevel,
          i % 3 ? palette.white : palette.metal,
          [x, 0.62, z],
          [0.95, i % 3 ? 0.65 : 1.1, 1.65],
          [0, -angle, 0],
        );
        add(
          box,
          i % 3 ? palette.cyan : palette.amber,
          [x, 1.03, z],
          [0.055, 0.04, 0.8],
          [0, -angle, 0],
        );
        add(
          box,
          palette.dark,
          [x, 1.01, z],
          [0.65, 0.055, 1.25],
          [0, -angle, 0],
        );
        add(
          box,
          palette.cyan,
          [x, 1.055, z],
          [0.06, 0.02, 0.83],
          [0, -angle, 0],
        );
        for (const delta of [-0.15, 0.15]) {
          const a = angle + delta;
          add(
            box,
            palette.shell,
            [Math.cos(a) * 4.1, 0.03, Math.sin(a) * 4.1],
            [0.09, 0.85, 0.11],
            [0, -a, 0.3],
          );
        }
      }
      // Two radiator banks and a single cantilevered dock deliberately break ring symmetry.
      for (const side of [-1, 1])
        for (let i = 0; i < 7; i++) {
          add(
            box,
            palette.dark,
            [side * 5.05, 0.3, -2.2 + i * 0.42],
            [2.2, 0.09, 0.3],
            [0, side * 0.14, 0.12],
          );
          add(
            box,
            palette.copper,
            [side * 5.05, 0.36, -2.2 + i * 0.42],
            [2.08, 0.025, 0.018],
            [0, side * 0.14, 0.12],
          );
        }
      add(
        bevel,
        palette.metal,
        [2.5, 0.3, 4.9],
        [1.7, 0.38, 3.2],
        [0, -0.45, 0],
      );
      add(
        bevel,
        palette.white,
        [3.05, 0.62, 5.9],
        [2.1, 0.25, 1.3],
        [0, -0.45, 0],
      );
      add(
        box,
        palette.amber,
        [3.05, 0.78, 5.9],
        [1.3, 0.035, 0.09],
        [0, -0.45, 0],
      );
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + 0.25;
        add(
          box,
          palette.metal,
          [Math.cos(angle) * 2.2, 0.35, Math.sin(angle) * 2.2],
          [3.5, 0.25, 0.36],
          [0, -angle, 0],
        );
      }
      add(taper, palette.shell, [0, 0.6, 0], [1.7, 1.2, 1.7]);
      add(cylinder, palette.dark, [0, 1.3, 0], [1.1, 0.45, 1.1]);
      add(
        torus(1.1, 0.06),
        palette.amber,
        [0, 1.56, 0],
        [1, 1, 1],
        [Math.PI / 2, 0, 0],
      );
      add(bevel, palette.white, [-0.7, 2.1, -0.4], [0.75, 1.3, 0.9]);
      add(bevel, palette.glass, [-0.7, 2.55, -0.35], [1.15, 0.38, 1.2]);
      add(cylinder, palette.cyan, [-0.7, 3.1, -0.4], [0.065, 0.8, 0.065]);
    } else if (station.kind === "resource" && station.id === "foundry") {
      add(taper, palette.dark, [0, -0.2, 0], [1.8, 0.6, 1.8]);
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.95,
          height = i === 1 ? 2.9 : 1.9;
        add(cylinder, palette.shell, [x, height / 2, 0], [0.38, height, 0.38]);
        add(taper, palette.copper, [x, height + 0.22, 0], [0.4, 0.44, 0.4]);
        add(
          torus(0.4, 0.045),
          palette.amber,
          [x, height * 0.75, 0],
          [1, 1, 1],
          [Math.PI / 2, 0, 0],
        );
        add(
          box,
          palette.dark,
          [x, height / 2, -0.45],
          [0.17, height + 0.4, 0.16],
        );
      }
      add(bevel, palette.metal, [0, 0.4, 1], [2.9, 0.9, 0.85]);
      for (let i = 0; i < 6; i++)
        add(
          box,
          palette.copper,
          [-1.15 + i * 0.46, 0.91, 1],
          [0.18, 0.04, 0.63],
        );
    } else if (station.kind === "resource") {
      add(bevel, palette.metal, [0, -0.2, 0], [3.7, 0.55, 2.8]);
      for (let i = 0; i < 3; i++) {
        const x = -1.12 + i * 1.12;
        add(
          cylinder,
          palette.shell,
          [x, 0.73, 0],
          [0.43, 2.15, 0.43],
          [Math.PI / 2, 0, 0],
        );
        add(sphere, palette.white, [x, 0.73, 1.06], [0.43, 0.43, 0.2]);
        for (const z of [-0.8, 0.5])
          add(torus(0.445, 0.055), palette.copper, [x, 0.73, z], [1, 1, 1]);
        add(box, palette.amber, [x, 1.19, 0.12], [0.08, 0.06, 1.2]);
        add(bevel, palette.dark, [x, 0.1, -0.75], [0.72, 0.7, 0.25]);
      }
      add(bevel, palette.white, [0, 0.4, -1.4], [2.8, 0.8, 0.45]);
    } else if (station.id === "junction") {
      add(taper, palette.dark, [0, 0.2, 0], [1.1, 0.6, 1.1]);
      add(cylinder, palette.shell, [0, 0.65, 0], [0.52, 0.5, 0.52]);
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        add(
          bevel,
          palette.metal,
          [Math.cos(a), 0.4, Math.sin(a)],
          [1.5, 0.25, 0.43],
          [0, -a, 0],
        );
        add(
          box,
          palette.amber,
          [Math.cos(a) * 1.5, 0.58, Math.sin(a) * 1.5],
          [0.12, 0.08, 0.38],
          [0, -a, 0],
        );
      }
    } else {
      add(taper, palette.metal, [0, 0.15, 0], [1.1, 0.4, 1.1]);
      add(bevel, palette.white, [0, 0.65, 0], [1.1, 0.7, 1.1]);
      add(cylinder, palette.dark, [0, 1.3, 0], [0.24, 1.4, 0.24]);
      const dish = keep(
        new THREE.SphereGeometry(0.9, 20, 12, 0, Math.PI * 2, 0.65, 0.85),
      );
      add(dish, palette.shell, [0, 2.1, 0], [1, 0.45, 1], [0.35, 0, -0.2]);
      add(cylinder, palette.cyan, [0, 2.45, 0], [0.045, 0.7, 0.045]);
      for (const side of [-1, 1]) {
        add(box, palette.metal, [side * 1.8, 0.8, 0], [2.8, 0.15, 0.18]);
        for (let i = 0; i < 5; i++) {
          add(
            box,
            palette.blue,
            [side * (1.35 + i * 0.47), 0.91, 0],
            [0.41, 0.06, 1.7],
          );
          add(
            box,
            palette.shell,
            [side * (1.35 + i * 0.47), 0.95, 0],
            [0.018, 0.025, 1.7],
          );
        }
      }
    }
    const group = b.finish();
    group.position.set(...station.position);
    if (station.kind === "target") {
      group.scale.setScalar(1.28);
      group.rotation.set(0.18, -0.16, -0.16);
    }
    return group;
  }
  function carrier(index: number) {
    const b = builder();
    const accent = index % 2 ? palette.amber : palette.cyan;
    b.add(bevel, palette.shell, [0, 0.05, 0], [0.92, 0.45, 2.4]);
    b.add(
      taper,
      palette.white,
      [0, 0.08, 1.28],
      [0.45, 0.62, 0.38],
      [Math.PI / 2, 0, 0],
    );
    b.add(
      bevel,
      palette.glass,
      [0, 0.36, 0.73],
      [0.67, 0.35, 0.7],
      [-0.2, 0, 0],
    );
    for (const side of [-1, 1]) {
      b.add(
        bevel,
        palette.metal,
        [side * 0.6, -0.07, 0],
        [0.6, 0.18, 1.65],
        [0, side * -0.25, 0],
      );
      b.add(
        cylinder,
        palette.white,
        [side * 0.79, 0.01, -0.55],
        [0.2, 1.55, 0.2],
        [Math.PI / 2, 0, 0],
      );
      b.add(
        cylinder,
        palette.dark,
        [side * 0.79, 0.01, -1.3],
        [0.23, 0.23, 0.23],
        [Math.PI / 2, 0, 0],
      );
      b.add(
        cylinder,
        accent,
        [side * 0.79, 0.01, -1.44],
        [0.15, 0.06, 0.15],
        [Math.PI / 2, 0, 0],
      );
      b.add(box, accent, [side * 0.42, 0.3, 0.12], [0.05, 0.035, 0.65]);
    }
    const group = b.finish();
    const cargo = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const cell = new THREE.Mesh(
        keep(new THREE.CylinderGeometry(0.2, 0.2, 0.57, 8)),
        palette.copper,
      );
      cell.rotation.x = Math.PI / 2;
      cell.position.set((i - 1) * 0.3, 0.42, -0.37);
      cargo.add(cell);
    }
    group.add(cargo);
    return { group, cargo };
  }
  function label(text: string, color = "#b8dbe4") {
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Label canvas unavailable");
    ctx.fillStyle = "rgba(5,15,26,.82)";
    ctx.fillRect(0, 0, 384, 80);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 5, 80);
    ctx.font = '500 30px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText(text, 20, 49);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    const mat = new THREE.SpriteMaterial({
      map: texture,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    });
    materials.add(mat);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.1, 0.65, 1);
    return sprite;
  }
  function environment() {
    const group = new THREE.Group();
    const planetMaterial = new THREE.ShaderMaterial({
      uniforms: {
        sun: { value: new THREE.Vector3(-0.85, 0.25, 0.26).normalize() },
      },
      vertexShader: `varying vec3 vNormal; varying vec3 vPoint; void main(){vNormal=normalize(mat3(modelMatrix)*normal);vPoint=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 vNormal; varying vec3 vPoint; uniform vec3 sun;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){
        vec3 p=normalize(vPoint);
        float latitude=p.y+.19*p.x;
        float flow=noise(p*3.1)*.31+noise(p*8.)*.1;
        float bands=sin(latitude*18.+flow*7.)*.5+.5;
        float wisps=noise(vec3(p.x*11.,p.y*24.,p.z*11.)+flow)*.22;
        vec3 surface=mix(vec3(.075,.13,.18),vec3(.18,.25,.3),bands*.62+wisps);
        float cloud=smoothstep(.48,.8,noise(p*5.+vec3(latitude*5.,0.,0.)));
        surface=mix(surface,vec3(.29,.35,.39),cloud*.3);
        float light=dot(normalize(vNormal),sun);
        float day=smoothstep(-.075,.26,light);
        vec3 color=surface*(.035+day*.84);
        color+=vec3(.06,.15,.23)*pow(1.-abs(light),7.)*.07;
        gl_FragColor=vec4(color,1.);
      }`,
    });
    materials.add(planetMaterial);
    const planet = new THREE.Mesh(
      keep(new THREE.SphereGeometry(12, 80, 48)),
      planetMaterial,
    );
    planet.position.set(12, -13, -55);
    planet.name = "orbit-planet";
    planet.rotation.z = 0.22;
    group.add(planet);
    const atmosphereMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      vertexShader:
        "varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}",
      fragmentShader:
        "varying vec3 n;varying vec3 v;void main(){float rim=pow(1.-abs(dot(n,v)),3.);gl_FragColor=vec4(.17,.43,.67,rim*.27);}",
    });
    materials.add(atmosphereMat);
    const atmosphere = new THREE.Mesh(
      keep(new THREE.SphereGeometry(12.14, 64, 32)),
      atmosphereMat,
    );
    atmosphere.position.copy(planet.position);
    atmosphere.name = "orbit-atmosphere";
    group.add(atmosphere);
    const positions = [],
      colors = [];
    let seed = 61723;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 460; i++) {
      positions.push(
        (random() - 0.5) * 190,
        random() * 85 - 16,
        -45 - random() * 90,
      );
      const tone = 0.3 + random() * 0.6;
      colors.push(tone * 0.82, tone * 0.91, tone);
    }
    const stars = keep(new THREE.BufferGeometry());
    stars.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    stars.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    materials.add(starMat);
    group.add(new THREE.Points(stars, starMat));
    // A sparse procedural emission layer behind the planet, not a backdrop image.
    const nebulaMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader:
        "varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec2 v;void main(){float d=length((v-.5)*vec2(1.,2.6));float a=exp(-d*d*12.)*.12;gl_FragColor=vec4(.19,.2,.4,a);}",
    });
    materials.add(nebulaMat);
    const nebula = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(120, 55)),
      nebulaMat,
    );
    nebula.position.set(5, 16, -65);
    nebula.rotation.z = -0.25;
    group.add(nebula);
    return group;
  }
  return {
    station,
    carrier,
    label,
    environment,
    keep,
    material,
    palette,
    materials,
    dispose() {
      for (const item of geometries) item.dispose();
      for (const item of materials) item.dispose();
      for (const item of textures) item.dispose();
      geometries.clear();
      materials.clear();
      textures.clear();
    },
  };
}
