// =====================================================================
//  park.js — 동화 같은 놀이터 배경 (외부 파일 없이 도형으로만 만듦)
//  buildPark(scene)을 부르면 배경을 만들고, 매 프레임 부를 update(t)를 돌려줍니다.
// =====================================================================
import * as THREE from 'three';

// 같은 결과가 나오도록 고정된 난수
function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

const PALETTE = {
  grass: 0x8fd16a, grassDark: 0x6fbf5a, hill1: 0x9ad97a, hill2: 0x7cc96a, hill3: 0xb5e38f,
  trunk: 0x9a6b4a, leaf1: 0x6cc36a, leaf2: 0x8fd96f, blossom: 0xffb3c7, blossom2: 0xffd2a8,
  mat: 0xffe9c7, matRing: 0xff9eb5, stone: 0xfff3dc,
  red: 0xff6b6b, yellow: 0xffd45c, blue: 0x6cb8ff, mint: 0x7fe0c4, purple: 0xb59cff, white: 0xffffff,
  wood: 0xd99a62, sand: 0xf6dfa4
};

export function buildPark(scene, renderer) {
  const updaters = [];
  const R = rng(7);
  const park = new THREE.Group();
  scene.add(park);

  const mat = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, flatShading: true, ...extra });
  const mesh = (geo, material, { x = 0, y = 0, z = 0, shadow = true } = {}) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  };

  // ---------------- 하늘: 그라데이션 + 해 ----------------
  const sky = document.createElement('canvas');
  sky.width = 16; sky.height = 512;
  const g = sky.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#6ec3f4');
  grad.addColorStop(0.45, '#aee0fb');
  grad.addColorStop(0.7, '#dff2fb');
  grad.addColorStop(1, '#fff1d9');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 512);
  const skyTex = new THREE.CanvasTexture(sky);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xdff2fb, 22, 70);

  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 40),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false })
  );
  sunDisc.position.set(-16, 17, -55);
  park.add(sunDisc);
  const sunGlow = new THREE.Mesh(
    new THREE.CircleGeometry(6, 40),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.35, fog: false })
  );
  sunGlow.position.copy(sunDisc.position).add(new THREE.Vector3(0, 0, -0.1));
  park.add(sunGlow);

  // ---------------- 조명 ----------------
  scene.add(new THREE.HemisphereLight(0xd6ecff, 0x9bd17a, 0.75));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.0);
  sun.position.set(6, 10, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // ---------------- 땅: 가운데는 평평, 멀수록 언덕 ----------------
  const groundGeo = new THREE.PlaneGeometry(140, 140, 90, 90);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  const colors = [];
  const cA = new THREE.Color(PALETTE.grass), cB = new THREE.Color(PALETTE.grassDark), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const bump = Math.sin(x * 0.25) * Math.cos(z * 0.2) * 0.8 + Math.sin(x * 0.07 + 1) * 1.2;
    pos.setY(i, THREE.MathUtils.smoothstep(r, 12, 40) * (bump + 1.5));
    c.copy(cA).lerp(cB, R() * 0.5);
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  ground.receiveShadow = true;
  park.add(ground);

  // 먼 언덕
  [[-22, -38, 16, PALETTE.hill1], [6, -45, 22, PALETTE.hill2], [30, -36, 15, PALETTE.hill3], [-40, -30, 12, PALETTE.hill2]]
    .forEach(([x, z, s, col]) => {
      const h = mesh(new THREE.SphereGeometry(1, 20, 12), mat(col), { x, y: -s * 0.55, z, shadow: false });
      h.scale.set(s * 1.6, s, s);
      park.add(h);
    });

  // ---------------- 로봇 무대: 둥근 놀이 매트 ----------------
  const stage = new THREE.Group();
  stage.add(mesh(new THREE.CylinderGeometry(2.0, 2.05, 0.06, 48), mat(PALETTE.matRing), { y: 0.03, shadow: false }));
  stage.add(mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.07, 48), mat(PALETTE.mat), { y: 0.035, shadow: false }));
  // 매트 위 별 무늬
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? 0.16 : 0.38;
    i ? star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  [[-1.1, 0.6, PALETTE.yellow], [1.15, 0.5, PALETTE.blue], [0.2, -1.2, PALETTE.mint]].forEach(([x, z, col]) => {
    const s = mesh(new THREE.ShapeGeometry(star), mat(col), { x, y: 0.072, z, shadow: false });
    s.rotation.x = -Math.PI / 2;
    stage.add(s);
  });
  park.add(stage);

  // 징검다리 길 (무대 → 뒤쪽 놀이터)
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = Math.sin(t * 3) * 1.6 + 0.3;
    const z = -2.4 - t * 7;
    const s = mesh(new THREE.CylinderGeometry(0.42 - t * 0.1, 0.45 - t * 0.1, 0.06, 10), mat(PALETTE.stone), { x, y: 0.03, z, shadow: false });
    s.scale.z = 0.75;
    s.rotation.y = R() * Math.PI;
    park.add(s);
  }

  // ---------------- 나무 ----------------
  function tree(x, z, s = 1, kind = 'round') {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    t.scale.setScalar(s);
    t.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 7), mat(PALETTE.trunk), { y: 0.6 }));
    if (kind === 'cone') {
      [[1.0, 1.1, 1.3], [0.8, 0.9, 1.9], [0.55, 0.7, 2.45]].forEach(([r, h, y]) =>
        t.add(mesh(new THREE.ConeGeometry(r, h, 8), mat(PALETTE.leaf1), { y })));
    } else {
      const col = kind === 'blossom' ? (R() < 0.5 ? PALETTE.blossom : PALETTE.blossom2) : (R() < 0.5 ? PALETTE.leaf1 : PALETTE.leaf2);
      [[0, 1.75, 0, 0.75], [0.45, 1.5, 0.1, 0.5], [-0.42, 1.55, -0.05, 0.55], [0.05, 2.2, -0.1, 0.5]].forEach(([dx, y, dz, r]) =>
        t.add(mesh(new THREE.IcosahedronGeometry(r, 1), mat(col), { x: dx, y, z: dz })));
    }
    t.userData.phase = R() * 6;
    updaters.push((time) => { t.rotation.z = Math.sin(time * 0.8 + t.userData.phase) * 0.015; });
    park.add(t);
  }
  [
    [-6.5, -6, 1.3, 'round'], [-4.2, -10, 1.1, 'blossom'], [-8.5, -11, 1.5, 'cone'], [5.6, -10.5, 1.3, 'cone'],
    [8.5, -7, 1.4, 'round'], [3.8, -13, 1.2, 'blossom'], [-1.5, -14, 1.4, 'round'], [10.5, -12, 1.6, 'blossom'],
    [-11, -7, 1.3, 'blossom'], [-4.6, -2.2, 0.9, 'blossom'], [4.8, -2.6, 0.95, 'round'], [12, -3, 1.4, 'cone'],
    [-12.5, -2.5, 1.5, 'round'], [0.8, -18, 1.6, 'cone'], [-7, -17, 1.4, 'blossom'], [8, -17, 1.5, 'round']
  ].forEach(([x, z, s, k]) => tree(x, z, s, k));

  // 덤불
  function bush(x, z, s = 1, col = PALETTE.leaf2) {
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    b.scale.setScalar(s);
    [[0, 0.3, 0, 0.4], [0.35, 0.25, 0.05, 0.3], [-0.35, 0.22, 0, 0.3]].forEach(([dx, y, dz, r]) =>
      b.add(mesh(new THREE.IcosahedronGeometry(r, 1), mat(col), { x: dx, y, z: dz })));
    park.add(b);
  }
  [[-3.2, -4.5], [3.0, -5.2], [-6.8, -3.4], [6.9, -4.2], [-2.4, -8.6], [2.6, -9.4]].forEach(([x, z]) => bush(x, z, 1 + R() * 0.4));

  // ---------------- 그네 ----------------
  {
    const sw = new THREE.Group();
    sw.position.set(-4.2, 0, -6.4);
    sw.rotation.y = 0.35;
    const frame = mat(PALETTE.red);
    for (const sx of [-1.3, 1.3]) {
      for (const sz of [-0.5, 0.5]) {
        const leg = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8), frame, { x: sx, y: 1.15, z: sz * 0.6 });
        leg.rotation.x = -sz * 0.45;
        sw.add(leg);
      }
    }
    const bar = mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.8, 8), mat(PALETTE.yellow), { y: 2.3 });
    bar.rotation.z = Math.PI / 2;
    sw.add(bar);
    [-0.6, 0.6].forEach((sx, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx, 2.3, 0);
      for (const rx of [-0.22, 0.22]) pivot.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.7, 4), mat(0x8a8a8a), { x: rx, y: -0.85 }));
      pivot.add(mesh(new THREE.BoxGeometry(0.6, 0.06, 0.28), mat(i ? PALETTE.blue : PALETTE.mint), { y: -1.72 }));
      sw.add(pivot);
      updaters.push((t) => { pivot.rotation.x = Math.sin(t * 1.7 + i * 1.3) * (0.35 + i * 0.1); });
    });
    park.add(sw);
  }

  // ---------------- 미끄럼틀 (작은 탑 + 뾰족 지붕) ----------------
  {
    const sl = new THREE.Group();
    sl.position.set(4.6, 0, -7.2);
    sl.rotation.y = -0.5;
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]])
      sl.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8), mat(PALETTE.blue), { x, y: 1.4, z }));
    sl.add(mesh(new THREE.BoxGeometry(1.15, 0.1, 1.15), mat(PALETTE.wood), { y: 1.5 }));
    sl.add(mesh(new THREE.ConeGeometry(0.95, 0.9, 4), mat(PALETTE.red), { y: 3.2 }));
    sl.children[sl.children.length - 1].rotation.y = Math.PI / 4;
    // 깃발
    sl.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4), mat(0x777777), { y: 3.9 }));
    const flag = mesh(new THREE.PlaneGeometry(0.35, 0.22), mat(PALETTE.yellow, { side: THREE.DoubleSide }), { x: 0.18, y: 4.07 });
    sl.add(flag);
    updaters.push((t) => { flag.rotation.y = Math.sin(t * 3) * 0.4; });
    // 사다리
    for (const x of [-0.3, 0.3]) {
      const rail = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), mat(PALETTE.yellow), { x, y: 0.85, z: 0.95 });
      rail.rotation.x = -0.35;
      sl.add(rail);
    }
    for (let i = 0; i < 5; i++) {
      const rung = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), mat(PALETTE.yellow), { y: 0.2 + i * 0.3, z: 1.22 - i * 0.105 });
      rung.rotation.z = Math.PI / 2;
      sl.add(rung);
    }
    // 미끄럼판 (곡면)
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 1.5, -0.55), new THREE.Vector3(0, 1.0, -1.6),
      new THREE.Vector3(0, 0.25, -1.9), new THREE.Vector3(0, 0.18, -2.9)
    );
    const pts = curve.getPoints(24);
    const chute = new THREE.Group();
    const seg = new THREE.Vector3();
    for (let i = 0; i < pts.length - 1; i++) {
      seg.subVectors(pts[i + 1], pts[i]);
      const len = seg.length();
      const piece = mesh(new THREE.BoxGeometry(0.75, 0.05, len + 0.02), mat(PALETTE.yellow), {});
      piece.position.copy(pts[i]).add(pts[i + 1]).multiplyScalar(0.5);
      piece.lookAt(pts[i + 1]);
      chute.add(piece);
      for (const x of [-0.4, 0.4]) {
        const side = mesh(new THREE.BoxGeometry(0.05, 0.16, len + 0.02), mat(PALETTE.red), {});
        side.position.copy(piece.position);
        side.quaternion.copy(piece.quaternion);
        side.translateX(x);
        side.translateY(0.06);
        chute.add(side);
      }
    }
    sl.add(chute);
    park.add(sl);
  }

  // ---------------- 시소 ----------------
  {
    const ss = new THREE.Group();
    ss.position.set(-0.6, 0, -10.4);
    ss.rotation.y = 0.2;
    ss.add(mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.5, 6), mat(PALETTE.purple), { y: 0.25 }));
    const plank = new THREE.Group();
    plank.position.y = 0.52;
    plank.add(mesh(new THREE.BoxGeometry(3.0, 0.08, 0.32), mat(PALETTE.mint)));
    for (const x of [-1.3, 1.3]) {
      plank.add(mesh(new THREE.BoxGeometry(0.4, 0.06, 0.36), mat(PALETTE.red), { x, y: 0.07 }));
      const handle = mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI), mat(PALETTE.yellow), { x: x * 0.82, y: 0.06 });
      plank.add(handle);
    }
    ss.add(plank);
    updaters.push((t) => { plank.rotation.z = Math.sin(t * 1.2) * 0.22; });
    park.add(ss);
  }

  // ---------------- 모래놀이터 + 양동이 ----------------
  {
    const sb = new THREE.Group();
    sb.position.set(-7.6, 0, -9.2);
    for (const [x, z, w, d] of [[0, -0.9, 2, 0.15], [0, 0.9, 2, 0.15], [-0.95, 0, 0.15, 1.95], [0.95, 0, 0.15, 1.95]])
      sb.add(mesh(new THREE.BoxGeometry(w, 0.25, d), mat(PALETTE.wood), { x, y: 0.12, z }));
    sb.add(mesh(new THREE.BoxGeometry(1.8, 0.14, 1.7), mat(PALETTE.sand), { y: 0.07, shadow: false }));
    sb.add(mesh(new THREE.ConeGeometry(0.35, 0.3, 10), mat(PALETTE.sand), { x: 0.3, y: 0.28, z: -0.2 }));
    sb.add(mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.25, 12), mat(PALETTE.blue), { x: -0.4, y: 0.27, z: 0.3 }));
    park.add(sb);
  }

  // ---------------- 벤치 + 풍선 ----------------
  {
    const bench = new THREE.Group();
    bench.position.set(7.4, 0, -3.6);
    bench.rotation.y = -0.9;
    for (const y of [0.45, 0.5]) bench.add(mesh(new THREE.BoxGeometry(1.6, 0.05, 0.16), mat(PALETTE.wood), { y, z: (y - 0.47) * 6 }));
    for (const y of [0.75, 0.92]) bench.add(mesh(new THREE.BoxGeometry(1.6, 0.12, 0.05), mat(PALETTE.wood), { y, z: -0.27 }));
    for (const x of [-0.7, 0.7]) bench.add(mesh(new THREE.BoxGeometry(0.08, 0.45, 0.5), mat(0x6b6b6b), { x, y: 0.22 }));
    park.add(bench);

    const anchor = new THREE.Vector3(7.0, 0.5, -3.3);
    [[PALETTE.red, -0.35, 2.6], [PALETTE.yellow, 0.1, 2.9], [PALETTE.purple, 0.4, 2.5]].forEach(([col, dx, h], i) => {
      const balloon = mesh(new THREE.SphereGeometry(0.28, 16, 12), mat(col, { roughness: 0.3, flatShading: false }), {});
      balloon.scale.y = 1.2;
      const stringGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0x666666 }));
      park.add(balloon, string);
      updaters.push((t) => {
        balloon.position.set(anchor.x + dx + Math.sin(t * 0.9 + i) * 0.12, anchor.y + h + Math.sin(t * 1.3 + i * 2) * 0.08, anchor.z + Math.cos(t * 0.7 + i) * 0.1);
        stringGeo.attributes.position.setXYZ(0, anchor.x, anchor.y, anchor.z);
        stringGeo.attributes.position.setXYZ(1, balloon.position.x, balloon.position.y - 0.33, balloon.position.z);
        stringGeo.attributes.position.needsUpdate = true;
      });
    });
  }

  // ---------------- 울타리 (뒤쪽 반원) ----------------
  {
    const picket = new THREE.ConeGeometry(0.09, 0.2, 4);
    const post = new THREE.BoxGeometry(0.14, 0.7, 0.05);
    const fenceMat = mat(PALETTE.white);
    for (let a = -1.25; a <= 1.25; a += 0.035) {
      const x = Math.sin(a) * 15, z = -Math.cos(a) * 15 - 2;
      const p = mesh(post, fenceMat, { x, y: 0.35, z });
      p.rotation.y = -a;
      const tip = mesh(picket, fenceMat, { x, y: 0.8, z });
      tip.rotation.y = -a + Math.PI / 4;
      park.add(p, tip);
    }
    for (const y of [0.25, 0.5]) {
      const rail = mesh(new THREE.TorusGeometry(15, 0.03, 4, 80, 2.5), fenceMat, { y, z: -2 });
      rail.rotation.x = Math.PI / 2;
      rail.rotation.z = -Math.PI / 2 - 1.25;
      park.add(rail);
    }
  }

  // ---------------- 꽃 (인스턴싱으로 가볍게) ----------------
  {
    const N = 260;
    const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), mat(0xffffff), N);
    const centers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.035, 0), mat(PALETTE.yellow), N);
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 3), mat(0x4f9e45), N);
    const flowerCols = [0xff8fab, 0xffffff, 0xffd45c, 0xb59cff, 0x7fc8ff, 0xff9e6b].map((h) => new THREE.Color(h));
    const m4 = new THREE.Matrix4();
    let n = 0;
    while (n < N) {
      const x = (R() - 0.5) * 30, z = 0.8 - R() * 17;
      if (Math.hypot(x, z) < 2.4) continue;            // 로봇 무대 피하기
      if (Math.abs(x) < 1.5 && z > 1) continue;          // 카메라 바로 앞 피하기
      const h = 0.15 + R() * 0.1;
      m4.makeTranslation(x, h, z); heads.setMatrixAt(n, m4); heads.setColorAt(n, flowerCols[n % flowerCols.length]);
      m4.makeTranslation(x, h + 0.03, z); centers.setMatrixAt(n, m4);
      m4.makeTranslation(x, h / 2, z); stems.setMatrixAt(n, m4);
      n++;
    }
    park.add(heads, centers, stems);
  }

  // 버섯
  [[-2.8, -3.2], [2.2, -3.6], [-5.6, -4.8], [6.2, -6]].forEach(([x, z], i) => {
    const s = 0.7 + (i % 2) * 0.4;
    const m = new THREE.Group();
    m.position.set(x, 0, z);
    m.scale.setScalar(s);
    m.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.25, 8), mat(0xfff6e6), { y: 0.12 }));
    const cap = mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(PALETTE.red), { y: 0.24 });
    m.add(cap);
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3;
      m.add(mesh(new THREE.SphereGeometry(0.035, 6, 4), mat(0xffffff), { x: Math.cos(a) * 0.13, y: 0.38 - (k % 2) * 0.05, z: Math.sin(a) * 0.13 }));
    }
    park.add(m);
  });

  // ---------------- 구름 ----------------
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.35, flatShading: true, fog: false });
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const cl = new THREE.Group();
    const puffs = 4 + Math.floor(R() * 3);
    for (let k = 0; k < puffs; k++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + R() * 0.8, 1), cloudMat);
      p.position.set(k * 1.0 - puffs * 0.5, R() * 0.5, R() * 0.4);
      cl.add(p);
    }
    cl.position.set(-35 + i * 11 + R() * 4, 15 + R() * 6, -50 - R() * 10);
    cl.scale.setScalar(1 + R() * 0.8);
    clouds.push(cl);
    park.add(cl);
  }
  updaters.push((t, dt) => {
    for (const cl of clouds) {
      cl.position.x += dt * 0.4;
      if (cl.position.x > 45) cl.position.x = -45;
    }
  });

  // ---------------- 나비 ----------------
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    const wingGeo = new THREE.CircleGeometry(0.09, 8);
    const wmat = mat([PALETTE.yellow, 0xff8fab, PALETTE.blue][i], { side: THREE.DoubleSide, flatShading: false });
    const wl = new THREE.Mesh(wingGeo, wmat), wr = new THREE.Mesh(wingGeo, wmat);
    wl.position.x = -0.08; wr.position.x = 0.08;
    wl.rotation.x = wr.rotation.x = -Math.PI / 2;
    const gl = new THREE.Group(), gr = new THREE.Group();
    gl.add(wl); gr.add(wr);
    b.add(gl, gr);
    park.add(b);
    const cx = [-2.5, 2.8, 0.5][i], cz = [-3, -4, -6][i];
    updaters.push((t) => {
      const k = t * 0.5 + i * 2;
      b.position.set(cx + Math.sin(k) * 1.5, 1.2 + Math.sin(k * 2.3) * 0.4, cz + Math.cos(k * 0.8) * 1.2);
      b.rotation.y = -k;
      const flap = Math.sin(t * 18 + i) * 0.9;
      gl.rotation.z = flap; gr.rotation.z = -flap;
    });
  }

  return {
    update(t, dt) { for (const u of updaters) u(t, dt); }
  };
}
