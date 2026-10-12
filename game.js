// =====================================================================
//  큐티로봇 짝짝 리듬 — 음악에 맞춰 로봇과 박수 치는 터치 게임
//
//  구성: [1] 장면  [2] 로봇 + 박수 포즈  [3] 노래와 악보  [4] 입력과 판정
//        [5] 로봇 애니메이션  [6] 화면 효과(링, 글자, 반짝이)  [7] 화면 전환 + 루프
// =====================================================================
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildPark } from './park.js';
import { Music } from './music.js';
import { TUNES } from './songs.js';

// ---------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------
const JUDGE = {
  perfect: 0.075, // ±75ms 안이면 Perfect
  good: 0.15,     // ±150ms 안이면 Good
  window: 0.22,   // 이 밖이면 Miss
  bothGap: 0.12   // 양손: 왼쪽·오른쪽을 이 시간 안에 같이 치면 인정
};
// 연습 모드와 아주 쉬움은 판정을 넉넉하게
const JUDGE_PRACTICE = { perfect: 0.1, good: 0.2, window: 0.28, bothGap: 0.12 };
const J = () => (level && (level.practice || level.wide) ? JUDGE_PRACTICE : JUDGE);
const APPROACH_BEATS = 2;


// 악보: 한 마디 = 4박. [박자 위치, 종류]
//   S = 로봇이 혼자 박수 (자동) / L = 화면 왼쪽 손 / R = 화면 오른쪽 손 / B = 양손
const LEVELS = {
  practice: {
    name: '연습', bpm: 92, tune: TUNES.twinkle, style: 'easy', practice: true,
    bars: {
      l: [[0, 'S'], [1, 'L'], [2, 'S'], [3, 'L']],
      r: [[0, 'S'], [1, 'R'], [2, 'S'], [3, 'R']],
      b: [[0, 'S'], [1, 'B'], [2, 'S'], [3, 'B']],
      m: [[0, 'S'], [1, 'L'], [2, 'S'], [3, 'R']],
      n: [[0, 'S'], [1, 'B'], [2, 'S'], [3, 'L']]
    },
    seq: 'llrrbbllrrbbmmnnmmnnmnmn', // 24마디 (반짝반짝 작은별 2바퀴)
    // 마디 종류별 안내 문구
    captions: {
      l: '분홍 링이 손바닥에 닿을 때 화면 왼쪽을 터치!',
      r: '파랑 링이 닿을 때 화면 오른쪽을 터치!',
      b: '노랑 링 두 개! 가운데를 터치 (또는 양쪽 동시에)',
      m: '이번엔 섞어서! 링 색을 잘 보세요',
      n: '이번엔 섞어서! 링 색을 잘 보세요'
    }
  },
  veryeasy: {
    name: '아주 쉬움', bpm: 100, tune: TUNES.airplane, style: 'easy', wide: true,
    // 한 마디에 박수 1~2번. 큐티가 혼자 칠 때 충분히 쉬어요
    bars: {
      a: [[0, 'S'], [2, 'B']],
      l: [[0, 'S'], [2, 'L']],
      r: [[0, 'S'], [2, 'R']],
      b: [[0, 'S'], [2, 'B'], [3, 'B']]
    },
    seq: 'aallrrablrbaablrbalrabba' // 24마디 (비행기 3바퀴)
  },
  easy: {
    name: '쉬움', bpm: 112, tune: TUNES.butterfly, style: 'easy',
    bars: {
      a: [[0, 'S'], [1, 'B'], [2, 'S'], [3, 'B']],
      b: [[0, 'S'], [1, 'L'], [2, 'S'], [3, 'R']],
      c: [[0, 'S'], [1, 'R'], [2, 'S'], [3, 'L']],
      d: [[0, 'S'], [1, 'B'], [2, 'B'], [3, 'S']]
    },
    seq: 'aabbaccbdabcadba' + 'abcdabcdbadcbdca' // 32마디 (나비야 2바퀴)
  },
  normal: {
    name: '보통', bpm: 120, tune: TUNES.london, style: 'normal',
    bars: {
      a: [[0, 'S'], [1, 'L'], [2, 'S'], [3, 'R']],
      b: [[0, 'S'], [1, 'B'], [2, 'S'], [3, 'B']],
      c: [[0, 'S'], [1, 'L'], [1.5, 'R'], [2, 'S'], [3, 'B']],
      d: [[0, 'L'], [1, 'R'], [2, 'L'], [3, 'R']],
      e: [[0, 'S'], [1, 'B'], [1.5, 'B'], [2, 'S'], [3, 'R'], [3.5, 'L']]
    },
    seq: 'abacdbcedacbecda' + 'cdebacedbdecadeb' // 32마디 (런던 다리 4바퀴)
  }
};
const INTRO_BARS = 2, OUTRO_BARS = 2;

const $ = (id) => document.getElementById(id);

// =====================================================================
// [1] 장면
// =====================================================================
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
function placeCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  // 세로 화면(휴대폰)이면 조금 더 뒤로
  const dist = aspect < 0.8 ? 5.2 : aspect < 1.2 ? 4.0 : 3.3;
  camera.position.set(0, 1.12, dist);
  camera.lookAt(0, 0.92, 0);
  camera.updateProjectionMatrix();
}
placeCamera();
const park = buildPark(scene, renderer);

const fx = $('fx');
const g2 = fx.getContext('2d');
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio, 2);
  fx.width = window.innerWidth * dpr;
  fx.height = window.innerHeight * dpr;
  g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  placeCamera();
}
window.addEventListener('resize', resize);
resize();

// =====================================================================
// [2] 로봇 + 박수 포즈
// =====================================================================
const robot = new THREE.Group();
scene.add(robot);
let fbxRoot = null;
const B = {};
const rest = {};
const POSE = {};     // POSE.IDLE.Left_UpperArm = 로컬 회전
const hitPoint = {}; // 화면 쪽으로 내민 손바닥 위치 (월드)

async function loadRobot() {
  const manager = new THREE.LoadingManager();
  // FBX 안에 적힌 텍스처 경로를 우리 textures 폴더로 (표면 굴곡 이미지는 가볍게 줄인 jpg로)
  manager.setURLModifier((url) => {
    if (!url.includes('.fbm/')) return url;
    const name = url.split('/').pop();
    return './models/textures/' + (name.includes('_normal.') ? 'cute_robot_3d_model_normal.jpg' : name);
  });
  const fbx = await new FBXLoader(manager).loadAsync('./models/robot.fbx');
  fbxRoot = fbx;
  const tl = new THREE.TextureLoader();
  const tex = (n, srgb) => { const t = tl.load('./models/textures/' + n); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  // 큐티 재질: 그림자는 약하게, 색은 밝게 (큐티의 진주빛 흰색과 하늘색 포인트를 살리기)
  const LOOK = {
    glow: 0.45,      // 원래 색으로 스스로 빛나는 정도 → 클수록 그림자가 옅고 밝아요 (0~1)
    bumps: 0.6,      // 표면 굴곡 세기 (1 = 원래대로)
    reflect: 0.25    // 주변 반사 세기 (0 = 반사 없음)
  };
  const colorMap = tex('cute_robot_3d_model_basecolor.JPEG', true);
  const material = new THREE.MeshStandardMaterial({
    map: colorMap,
    normalMap: tex('cute_robot_3d_model_normal.jpg'),
    normalScale: new THREE.Vector2(LOOK.bumps, LOOK.bumps),
    metalness: 0,
    roughness: 0.9,                 // 무광: 반짝이는 하이라이트 줄이기
    envMapIntensity: LOOK.reflect,
    emissive: 0xffffff,             // 색 이미지 그대로 살짝 빛나게
    emissiveMap: colorMap,
    emissiveIntensity: LOOK.glow
  });
  material.toneMapped = false;      // 화면 보정 필터를 로봇에만 꺼서 흰색이 회색빛으로 바래지 않게
  const all = {};
  fbx.traverse((o) => {
    if (o.isMesh) { o.material = material; o.castShadow = true; o.frustumCulled = false; }
    if (o.isBone) all[o.name] = o;
  });
  robot.add(fbx);

  fbx.updateMatrixWorld(true);
  fbx.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); } });
  const box = new THREE.Box3().setFromObject(fbx);
  const k = 1.6 / (box.max.y - box.min.y);
  fbx.scale.multiplyScalar(k);
  const c = box.getCenter(new THREE.Vector3());
  fbx.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  robot.updateMatrixWorld(true);

  // 뼈 이름 연결표: 이 게임의 이름 → Mixamo 방식 이름 (mixamorig:LeftArm 등)
  // 로봇마다 뼈 이름이 달라도 둘 중 하나로 찾아요
  const ALIAS = {
    Shoulder: 'Shoulder', UpperArm: 'Arm', LowerArm: 'ForeArm', Hand: 'Hand',
    MiddleProximal: 'HandMiddle1', IndexProximal: 'HandIndex1', PinkyProximal: 'HandPinky1'
  };
  const mixamoName = (n) => {
    const m = n.match(/^(Left|Right)_(\w+)$/);
    return m && ALIAS[m[2]] ? m[1] + ALIAS[m[2]] : n;
  };
  const byEnd = (n) => Object.values(all).find((b) => b.name.endsWith(n));
  const find = (n) => all[n] || byEnd(n) || byEnd(mixamoName(n));
  const names = ['Hips', 'Spine', 'Head'];
  for (const s of ['Left', 'Right']) {
    names.push(`${s}_Shoulder`, `${s}_UpperArm`, `${s}_LowerArm`, `${s}_Hand`, `${s}_MiddleProximal`, `${s}_IndexProximal`, `${s}_PinkyProximal`);
  }
  for (const n of names) B[n] = find(n);

  if (B.Left_UpperArm.getWorldPosition(new THREE.Vector3()).x < 0) robot.rotation.y = Math.PI;
  robot.updateMatrixWorld(true);

  for (const n of names) {
    rest[n] = { local: B[n].quaternion.clone(), world: B[n].getWorldQuaternion(new THREE.Quaternion()) };
  }
  bakePoses();
}

// ---- 뼈를 "월드 방향"으로 돌리는 도구 (Robot Mirror와 같은 원리) ----
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _qa = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const wpos = (n) => B[n].getWorldPosition(new THREE.Vector3());
const v3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

function frameQuat(dir, ref, out) {
  _Y.copy(dir).normalize();
  _Z.copy(ref).addScaledVector(_Y, -ref.dot(_Y));
  if (_Z.lengthSq() < 1e-8) _Z.set(0, 0, 1).addScaledVector(_Y, -_Y.z);
  _Z.normalize();
  _X.crossVectors(_Y, _Z);
  _m.makeBasis(_X, _Y, _Z);
  return out.setFromRotationMatrix(_m);
}
function setWorld(n, q) {
  B[n].parent.getWorldQuaternion(_qp);
  B[n].quaternion.copy(_qp.invert().multiply(q));
  B[n].updateMatrixWorld(true);
}
function aim(n, dir, ref) {
  frameQuat(dir, ref, _qa).multiply(rest[n].frameInv).multiply(rest[n].world);
  setWorld(n, _qa);
}

// 포즈: 팔 방향을 숫자로 적어 둠. s = +1(로봇 왼팔, 화면 오른쪽) / -1(로봇 오른팔, 화면 왼쪽)
const POSE_DEFS = {
  IDLE: (s) => ({ upper: v3(s * 0.3, -0.9, 0.3), lower: v3(s * 0.12, 0.75, 0.6), hand: v3(0, 1, 0.25), side: v3(-s, 0, 0) }),
  PUSH: (s) => ({ upper: v3(s * 0.45, -0.3, 0.85), lower: v3(s * 0.35, 0.15, 1), hand: v3(s * 0.1, 0.9, 0.45), side: v3(-s, 0, 0) }),
  SELF: (s) => ({ upper: v3(s * 0.16, -0.8, 0.57), lower: v3(-s * 0.69, 0.29, 0.66), hand: v3(-s * 0.5, 0.55, 0.65), side: v3(0, 1, 0) }),
  CHEER: (s) => ({ upper: v3(s * 0.55, 0.8, 0.1), lower: v3(s * 0.25, 1, 0.15), hand: v3(s * 0.1, 1, 0.1), side: v3(-s, 0, 0) }),
  SAD: (s) => ({ upper: v3(s * 0.12, -1, 0.05), lower: v3(s * 0.05, -1, 0.15), hand: v3(0, -1, 0.1), side: v3(0, 0, 1) })
};
const ARM = ['UpperArm', 'LowerArm', 'Hand'];

function bakePoses() {
  // 각 뼈의 기본 방향 기억
  for (const s of ['Left', 'Right']) {
    const handSide = wpos(`${s}_IndexProximal`).sub(wpos(`${s}_PinkyProximal`)).normalize();
    const chain = [[`${s}_UpperArm`, `${s}_LowerArm`], [`${s}_LowerArm`, `${s}_Hand`], [`${s}_Hand`, `${s}_MiddleProximal`]];
    for (const [n, child] of chain) {
      const dir = wpos(child).sub(wpos(n)).normalize();
      const ref = n.endsWith('Hand') ? handSide : new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize();
      rest[n].dir = dir;
      rest[n].ref = ref;
      rest[n].frameInv = frameQuat(dir, ref, new THREE.Quaternion()).invert();
    }
  }
  // 포즈마다 팔을 맞춰 보고, 그때의 로컬 회전을 저장
  for (const [name, def] of Object.entries(POSE_DEFS)) {
    POSE[name] = {};
    for (const s of ['Left', 'Right']) {
      const p = def(s === 'Left' ? 1 : -1);
      // 팔꿈치가 굽는 축 = 윗팔 × 아랫팔 (비틀림 방지)
      let hinge = new THREE.Vector3().crossVectors(p.upper, p.lower);
      if (hinge.lengthSq() < 1e-4) hinge = rest[`${s}_UpperArm`].ref.clone();
      hinge.normalize();
      const fb = rest[`${s}_UpperArm`].ref.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(rest[`${s}_UpperArm`].dir, p.upper));
      if (hinge.dot(fb) < 0) hinge.negate();
      aim(`${s}_UpperArm`, p.upper, hinge);
      aim(`${s}_LowerArm`, p.lower, hinge);
      aim(`${s}_Hand`, p.hand, p.side);
      for (const a of ARM) POSE[name][`${s}_${a}`] = B[`${s}_${a}`].quaternion.clone();
      if (name === 'PUSH') hitPoint[s] = wpos(`${s}_MiddleProximal`);
      for (const a of ARM) { B[`${s}_${a}`].quaternion.copy(rest[`${s}_${a}`].local); }
      fbxRoot.updateMatrixWorld(true);
    }
  }
}

// =====================================================================
// [3] 노래와 악보
// =====================================================================
let music = null;
let level = null;       // 현재 레벨 설정
let events = [];        // { t, type, judged, auto }
let songStart = 0;      // 노래가 시작되는 오디오 시각
let spb = 0.6;          // 한 박자 길이(초)
let songEnd = 0;
let timingOffset = 0;   // 사용자 타이밍 보정 (초)

function buildChart(lv) {
  const list = [];
  // 2번째 마디(카운트): 로봇 혼자 4번 박수
  for (let b = 0; b < 4; b++) list.push({ t: (4 + b) * spb, type: 'S', auto: true });
  [...lv.seq].forEach((key, i) => {
    for (const [beat, type] of lv.bars[key]) {
      list.push({ t: ((INTRO_BARS + i) * 4 + beat) * spb, type, auto: type === 'S', judged: false });
    }
  });
  return list.sort((a, b) => a.t - b.t);
}

// =====================================================================
// [4] 입력과 판정
// =====================================================================
const stats = { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, mood: 50 };
let half = null; // 양손 판정용: 먼저 친 한쪽 {zone, t}
let state = 'loading';

const gameTime = () => (music ? music.now - songStart - timingOffset : 0);

function zoneFromX(x) {
  const w = window.innerWidth;
  return x < w * 0.36 ? 'L' : x > w * 0.64 ? 'R' : 'B';
}

// 한 손 차례에 반대쪽까지 같이 치는 걸 막기 위한 기록
let held = null;   // 맞는 손으로 친 한 손 박수: 잠깐(bothGap) 기다렸다가 확정 { e, zone, result, timer }
let stray = null;  // 맞는 박자가 없을 때 친 터치 { zone, t }

function onTap(zone) {
  if (state !== 'playing') return;
  flashPad(zone);
  const t = gameTime();

  // ① 방금 한 손으로 맞게 쳤는데, 바로 다른 쪽도 쳤다
  if (held && zone !== held.zone) {
    const h = held;
    held = null;
    clearTimeout(h.timer);
    // 다른 쪽 터치가 "자기 차례"(빠른 왼-오 연타 등)라면 정상 → 앞의 박수 점수 확정
    const ownTurn = events.some((x) => x !== h.e && !x.auto && !x.judged &&
      (x.type === zone || x.type === 'B') && Math.abs(x.t - t) <= J().good);
    if (!ownTurn) { judge(h.e, 'miss', '한 손만!'); return; } // 자기 차례가 아님 → 양손으로 친 것 = Miss
    judge(h.e, h.result, null, false);
  }

  const pending = events.filter((e) => !e.auto && !e.judged && Math.abs(e.t - t) <= J().window);
  const ok = pending.filter((e) => e.type === zone || e.type === 'B');
  if (!ok.length) {
    if (pending.length && Math.min(...pending.map((e) => Math.abs(e.t - t))) < J().good) {
      const e = pending.sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
      judge(e, 'miss', '반대 손!');
    } else {
      stray = { zone, t };
      music.clap(music.ctx.currentTime, 0.35); // 박자 없는 곳에서 친 박수 (감점 없음)
    }
    return;
  }
  const e = ok.sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];

  if (e.type === 'B') {
    if (zone === 'B') { grade(e, t); return; }
    // 양손 차례를 왼쪽/오른쪽 따로 터치하는 경우: 두 번째 손이 오면 판정
    if (half && half.e === e && half.zone !== zone && t - half.t <= J().bothGap) {
      const tt = (t + half.t) / 2;
      half = null;
      grade(e, tt);
    } else {
      half = { e, zone, t };
      music.clap(music.ctx.currentTime, 0.4);
    }
    return;
  }

  // ② 한 손 차례인데, 직전에 반대쪽을 먼저 쳤다 → 양손으로 친 것 = Miss
  if (stray && stray.zone !== zone && t - stray.t <= J().bothGap) {
    stray = null;
    judge(e, 'miss', '한 손만!');
    return;
  }

  // ③ 한 손 차례에 맞는 손: 소리는 바로 내고, 반대쪽이 따라오는지 잠깐 지켜본 뒤 점수 확정
  const d = Math.abs(e.t - t);
  const result = d <= J().perfect ? 'perfect' : d <= J().good ? 'good' : 'miss';
  if (result === 'miss') { grade(e, t); return; }
  e.judged = true; // 다른 터치나 자동 Miss가 건드리지 못하게
  const now = music.ctx.currentTime;
  music.clap(now, 1);
  if (result === 'perfect') music.ding(now);
  held = {
    e, zone, result,
    timer: setTimeout(() => {
      if (held && held.e === e && state === 'playing') { held = null; judge(e, result, null, false); }
    }, J().bothGap * 1000)
  };
}

function grade(e, t) {
  const d = Math.abs(e.t - t);
  if (d <= J().perfect) judge(e, 'perfect');
  else if (d <= J().good) judge(e, 'good');
  else judge(e, 'miss', t < e.t ? '빨라요!' : '늦어요!');
}

function judge(e, result, msg, withSound = true) {
  e.judged = true;
  const now = music.ctx.currentTime;
  if (result === 'miss') {
    stats.miss++;
    stats.combo = 0;
    stats.mood = Math.max(0, stats.mood - 8);
    music.boop(now);
    reaction.shake = performance.now();
  } else {
    stats[result]++;
    stats.combo++;
    stats.maxCombo = Math.max(stats.maxCombo, stats.combo);
    stats.score += Math.round((result === 'perfect' ? 100 : 60) * (1 + Math.floor(stats.combo / 10) * 0.1));
    stats.mood = Math.min(100, stats.mood + (result === 'perfect' ? 5 : 3));
    if (withSound) { music.clap(now, 1); if (result === 'perfect') music.ding(now); }
    if (result === 'perfect') reaction.nod = performance.now();
    burst(e, result === 'perfect' ? 18 : 9);
  }
  popText(e, msg || (result === 'perfect' ? 'Perfect!' : result === 'good' ? 'Good' : 'Miss'), result);
  music.say(result, result === 'miss'); // 큐티 목소리: 대단해 / 잘했어 / 다시
  updateHud();
}

// 터치 / 마우스
$('play').addEventListener('pointerdown', (ev) => { ev.preventDefault(); onTap(zoneFromX(ev.clientX)); });
// 키보드
const KEYS = { ArrowLeft: 'L', KeyA: 'L', KeyF: 'L', ArrowRight: 'R', KeyD: 'R', KeyJ: 'R', Space: 'B', ArrowDown: 'B', ArrowUp: 'B', KeyS: 'B' };
window.addEventListener('keydown', (ev) => {
  if (ev.repeat) return;
  if (KEYS[ev.code] && state === 'playing') { ev.preventDefault(); onTap(KEYS[ev.code]); }
  if (ev.code === 'Escape' && state === 'playing') quitToTitle();
});

// =====================================================================
// [5] 로봇 애니메이션
// =====================================================================
const reaction = { nod: -1e9, shake: -1e9 };
const _qs = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _qt = new THREE.Quaternion();
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const ease = (x) => x * x * (3 - 2 * x);

// 한쪽 팔이 시간 t에 어떤 포즈인지: 직전 박수 → 쉬는 자세 → 다음 박수
function armPose(side, t) {
  const mine = (e) => e.type === 'S' || e.type === 'B' || (side === 'Right' ? e.type === 'L' : e.type === 'R');
  const poseOf = (e) => (e.type === 'S' ? 'SELF' : 'PUSH');
  let prev = null, next = null;
  for (const e of events) {
    if (!mine(e)) continue;
    if (e.t <= t) prev = e; else { next = e; break; }
  }
  const gap = prev && next ? next.t - prev.t : 10;
  const rel = Math.min(0.28, gap * 0.45);
  const app = Math.min(0.32, gap * 0.5);
  if (prev && t - prev.t < rel) return [poseOf(prev), 'IDLE', ease((t - prev.t) / rel)];
  if (next && next.t - t < app) return ['IDLE', poseOf(next), ease(1 - (next.t - t) / app)];
  return ['IDLE', 'IDLE', 0];
}

function animateRobot(t, beat, override) {
  if (!fbxRoot) return;
  const nowMs = performance.now();
  const phase = beat % 1;

  // 몸: 박자마다 통통 + 좌우로 살랑
  robot.position.y = Math.abs(Math.sin(Math.PI * phase)) * 0.025;
  const sway = Math.sin(Math.PI * beat) * 0.07;
  B.Hips.quaternion.copy(rest.Hips.local);
  B.Hips.updateMatrixWorld(true);
  setWorld('Spine', _qs.setFromAxisAngle(AX.z, sway).multiply(rest.Spine.world));

  // 머리: 반대로 갸웃 + 잘하면 끄덕 + 틀리면 도리도리
  const nodK = (nowMs - reaction.nod) / 1000;
  const shakeK = (nowMs - reaction.shake) / 1000;
  const nod = nodK < 0.5 ? Math.sin(nodK * Math.PI * 4) * 0.18 * (1 - nodK * 2) : 0;
  const shake = shakeK < 0.6 ? Math.sin(shakeK * 30) * 0.35 * (1 - shakeK / 0.6) : 0;
  const sadTilt = override === 'SAD' ? 0.35 : 0;
  _qh.setFromAxisAngle(AX.z, sway * -1.6)
    .multiply(_qt.setFromAxisAngle(AX.x, nod + sadTilt))
    .multiply(new THREE.Quaternion().setFromAxisAngle(AX.y, shake));
  setWorld('Head', _qs.setFromAxisAngle(AX.z, sway).multiply(_qh).multiply(rest.Head.world));

  // 팔
  for (const s of ['Left', 'Right']) {
    let [a, b, w] = override ? [override, override, 0] : armPose(s, t);
    for (const part of ARM) {
      const n = `${s}_${part}`;
      const target = _qa.copy(POSE[a][n]).slerp(POSE[b][n], w);
      if (override) B[n].quaternion.slerp(target, 0.12); else B[n].quaternion.copy(target);
    }
  }
  fbxRoot.updateMatrixWorld(true);
}

// =====================================================================
// [6] 화면 효과: 다가오는 링, 판정 글자, 반짝이
// =====================================================================
const COLORS = { L: '#ff8fab', R: '#6cb8ff', B: '#ffd45c' };
const texts = [];
const sparks = [];
const _v = new THREE.Vector3();

function screenOf(side) { // 로봇 손의 화면 좌표
  _v.copy(hitPoint[side]).project(camera); // 3D 위치 → 화면 위치
  return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight };
}
// 이벤트 종류 → 화면에 표시할 위치들 (L은 로봇 오른손 = 화면 왼쪽)
const spotsOf = (type) => type === 'L' ? [screenOf('Right')] : type === 'R' ? [screenOf('Left')] : [screenOf('Right'), screenOf('Left')];

function popText(e, text, kind) {
  const ps = spotsOf(e.type);
  const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
  const y = Math.min(...ps.map((p) => p.y)) - 40;
  texts.push({ x, y, text, kind, born: performance.now() });
}
function burst(e, n) {
  for (const p of spotsOf(e.type)) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 260;
      sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, born: performance.now(),
        color: ['#ffd45c', '#ff8fab', '#6cb8ff', '#7fe0c4', '#ffffff'][i % 5], star: i % 3 === 0 });
    }
  }
}
function drawStar(x, y, r) {
  g2.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    i ? g2.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g2.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g2.closePath();
  g2.fill();
}

let countText = null;
function drawFx(t, dt) {
  const W = window.innerWidth, H = window.innerHeight;
  g2.clearRect(0, 0, W, H);
  const base = Math.min(W, H);
  const target = base * 0.055, start = base * 0.2;

  if (state === 'playing') {
    // 다가오는 링: 링이 손바닥 크기로 줄어드는 순간 = 칠 때!
    for (const e of events) {
      if (e.auto || e.judged) continue;
      const left = e.t - t;
      if (left > APPROACH_BEATS * spb || left < -J().window) continue;
      const k = Math.max(0, left / (APPROACH_BEATS * spb));
      for (const p of spotsOf(e.type)) {
        g2.globalAlpha = 0.25 + 0.75 * (1 - k);
        g2.lineWidth = 6;
        g2.strokeStyle = COLORS[e.type];
        g2.beginPath();
        g2.arc(p.x, p.y, target + (start - target) * k, 0, Math.PI * 2);
        g2.stroke();
        g2.globalAlpha = 0.35;
        g2.fillStyle = COLORS[e.type];
        g2.beginPath();
        g2.arc(p.x, p.y, target, 0, Math.PI * 2);
        g2.fill();
      }
    }
    g2.globalAlpha = 1;

    // 카운트다운 (두 번째 마디)
    const beatNo = Math.floor(t / spb);
    countText = beatNo < 4 ? '준비~' : beatNo < 8 ? ['3', '2', '1', '짝!'][beatNo - 4] : null;
    if (countText && t >= 0) {
      const ph = (t / spb) % 1;
      g2.font = `800 ${base * (0.12 + 0.03 * (1 - ph))}px Jua, "Malgun Gothic", sans-serif`;
      g2.textAlign = 'center';
      g2.textBaseline = 'middle';
      g2.lineWidth = 10;
      g2.strokeStyle = '#ffffff';
      g2.strokeText(countText, W / 2, H * 0.28);
      g2.fillStyle = '#ff6b8a';
      g2.fillText(countText, W / 2, H * 0.28);
    }
  }

  // 반짝이
  const now = performance.now();
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    const age = (now - s.born) / 1000;
    if (age > 0.8) { sparks.splice(i, 1); continue; }
    s.vy += 600 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    g2.globalAlpha = 1 - age / 0.8;
    g2.fillStyle = s.color;
    if (s.star) drawStar(s.x, s.y, 9); else { g2.beginPath(); g2.arc(s.x, s.y, 4, 0, Math.PI * 2); g2.fill(); }
  }
  // 판정 글자
  for (let i = texts.length - 1; i >= 0; i--) {
    const tx = texts[i];
    const age = (now - tx.born) / 1000;
    if (age > 0.7) { texts.splice(i, 1); continue; }
    g2.globalAlpha = 1 - age / 0.7;
    const size = base * 0.055 * (1 + 0.3 * Math.max(0, 0.15 - age) / 0.15);
    g2.font = `800 ${size}px Jua, "Malgun Gothic", sans-serif`;
    g2.textAlign = 'center';
    g2.lineWidth = 7;
    g2.strokeStyle = '#ffffff';
    g2.strokeText(tx.text, tx.x, tx.y - age * 40);
    g2.fillStyle = tx.kind === 'perfect' ? '#ff6b8a' : tx.kind === 'good' ? '#3d9bff' : '#8a8f9c';
    g2.fillText(tx.text, tx.x, tx.y - age * 40);
  }
  g2.globalAlpha = 1;
}

// =====================================================================
// [7] 화면 전환 + 메인 루프
// =====================================================================
function updateHud() {
  $('score').textContent = stats.score.toLocaleString();
  $('combo').textContent = stats.combo >= 2 ? `${stats.combo} 콤보` : '';
  $('combo').classList.remove('bump');
  void $('combo').offsetWidth;
  if (stats.combo >= 2) $('combo').classList.add('bump');
  $('moodFill').style.width = stats.mood + '%';
}
function flashPad(zone) {
  const el = $('pad' + zone);
  el.classList.remove('hit');
  void el.offsetWidth;
  el.classList.add('hit');
}
function show(id) {
  for (const s of ['title', 'result']) $(s).hidden = s !== id;
  $('hud').hidden = id !== 'hud';
  $('pads').hidden = id !== 'hud';
}

// 판정별 큐티 목소리 파일
const VOICE_FILES = {
  perfect: './voices/perfect.mp3', // "대단해"
  good: './voices/good.mp3',       // "잘했어"
  miss: './voices/miss.mp3'        // "다시"
};

async function startLevel(key) {
  if (!music) music = new Music();
  if (!music.voices) await music.loadVoices(VOICE_FILES); // 처음 한 번만 불러와요
  if (music.ctx.state !== 'running') {
    await Promise.race([music.ctx.resume(), new Promise((r) => setTimeout(r, 1500))]);
  }
  if (music.ctx.state !== 'running') throw new Error('소리를 켤 수 없어요. 버튼을 한 번 더 눌러 주세요');
  level = LEVELS[key];
  spb = 60 / level.bpm;
  Object.assign(stats, { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, mood: 50 });
  half = null;
  if (held) clearTimeout(held.timer);
  held = null;
  stray = null;
  texts.length = 0;
  events = buildChart(level);
  songStart = music.ctx.currentTime + 0.4;
  songEnd = (INTRO_BARS + level.seq.length + 1) * 4 * spb;
  music.play({ ...level, bars: level.seq.length, introBars: INTRO_BARS, outroBars: OUTRO_BARS }, songStart);
  // 로봇 혼자 치는 박수 소리는 미리 예약 (정확한 박자)
  for (const e of events) if (e.auto) music.clap(songStart + e.t, 0.55);
  updateHud();
  show('hud');
  state = 'playing';
}

// ---------- 연습 모드 도우미: 안내 문구 + 쳐야 할 패드 반짝이기 ----------
let lastCaption = null, lastCue = null;
function setCaption(text) {
  if (text === lastCaption) return;
  lastCaption = text;
  $('caption').textContent = text || '';
  $('caption').hidden = !text;
}
function setPadCue(zone) {
  if (zone === lastCue) return;
  lastCue = zone;
  for (const z of ['L', 'B', 'R']) $('pad' + z).classList.toggle('cue', z === zone);
}
function practiceHelp(t) {
  if (!level.practice) return;
  const bar = Math.floor(t / (4 * spb)) - INTRO_BARS;
  const key = level.seq[bar];
  setCaption(bar < 0 ? '연습 시작! 큐티가 혼자 박수 칠 때는 쉬어요' : key ? level.captions[key] : '잘했어요!');
  const next = events.find((e) => !e.auto && !e.judged && e.t > t - J().good);
  setPadCue(next && next.t - t < spb * 1.2 ? next.type : null);
}

function finish() {
  setCaption(null);
  setPadCue(null);
  state = 'result';
  const total = events.filter((e) => !e.auto).length;
  const acc = (stats.perfect + stats.good * 0.6) / total;
  const stars = acc >= 0.9 ? 3 : acc >= 0.7 ? 2 : acc >= 0.4 ? 1 : 0;
  $('rStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('rTitle').textContent = level.practice
    ? (stars >= 2 ? '연습 끝! 이제 쉬움에 도전해 봐요' : '연습 끝! 한 번 더 연습해 볼까요?')
    : stars === 3 ? '최고예요! 큐티가 신났어요' : stars === 2 ? '잘했어요!' : stars === 1 ? '좋아요, 한 번 더!' : '큐티가 아쉬워해요…';
  $('rScore').textContent = stats.score.toLocaleString();
  $('rDetail').innerHTML =
    `<span class="p">Perfect ${stats.perfect}</span><span class="g">Good ${stats.good}</span>` +
    `<span class="m">Miss ${stats.miss}</span><span>최대 콤보 ${stats.maxCombo}</span><span>정확도 ${Math.round(acc * 100)}%</span>`;
  resultPose = stars >= 1 ? 'CHEER' : 'SAD';
  if (!level.practice) try {
    const k = 'cutieclap-best-' + Object.keys(LEVELS).find((x) => LEVELS[x] === level);
    const best = Number(localStorage.getItem(k) || 0);
    if (stats.score > best) localStorage.setItem(k, String(stats.score));
  } catch {}
  show('result');
  renderBest();
}
let resultPose = null;

function quitToTitle() {
  if (music) music.stop();
  setCaption(null);
  setPadCue(null);
  state = 'title';
  resultPose = null;
  show('title');
  renderBest();
}

function renderBest() {
  for (const key of Object.keys(LEVELS)) {
    let best = 0;
    try { best = Number(localStorage.getItem('cutieclap-best-' + key) || 0); } catch {}
    const el = document.querySelector(`[data-level="${key}"] .best`);
    if (el) el.textContent = best ? `최고 ${best.toLocaleString()}점` : '';
  }
}

let robotReady = false;
let queuedLevel = null;
async function chooseLevel(key) {
  // 소리는 "사용자가 누른 순간"에만 켤 수 있어서, 버튼을 누를 때 바로 준비
  try {
    if (!music) music = new Music();
    if (music.ctx.state !== 'running') music.ctx.resume();
  } catch (err) { console.error(err); }
  if (!robotReady) { // 아직 로봇을 불러오는 중이면, 다 불러온 뒤 바로 시작
    queuedLevel = key;
    $('loadMsg').textContent = '큐티를 불러오는 중… 잠시만요!';
    return;
  }
  try {
    await startLevel(key);
  } catch (err) {
    console.error(err);
    state = 'title';
    show('title');
    $('loadMsg').textContent = '시작하지 못했어요: ' + err.message;
  }
}
document.querySelectorAll('[data-level]').forEach((btn) => btn.addEventListener('click', () => chooseLevel(btn.dataset.level)));
$('retry').addEventListener('click', () => chooseLevel(Object.keys(LEVELS).find((k) => LEVELS[k] === level)));
$('toTitle').addEventListener('click', quitToTitle);
$('quit').addEventListener('click', quitToTitle);
const offsetEl = $('offset');
try { offsetEl.value = localStorage.getItem('cutieclap-offset') || 0; } catch {}
const applyOffset = () => {
  timingOffset = Number(offsetEl.value) / 1000;
  $('offsetVal').textContent = `${offsetEl.value > 0 ? '+' : ''}${offsetEl.value}ms`;
  try { localStorage.setItem('cutieclap-offset', offsetEl.value); } catch {}
};
offsetEl.addEventListener('input', applyOffset);
applyOffset();

let last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  let t = 0, beat = now / 1000 / 0.6, override = null;
  if (state === 'playing') {
    t = gameTime();
    beat = Math.max(0, t / spb);
    // 놓친 박수 처리
    for (const e of events) if (!e.auto && !e.judged && t > e.t + J().window) judge(e, 'miss');
    if (half && t - half.t > J().bothGap && !half.e.judged && t > half.e.t + J().good) half = null;
    $('progress').style.width = Math.min(100, (t / songEnd) * 100) + '%';
    if (t > (INTRO_BARS + level.seq.length) * 4 * spb) override = stats.mood >= 40 ? 'CHEER' : 'SAD';
    practiceHelp(t);
    if (t > songEnd) finish();
  } else if (state === 'result') {
    override = resultPose;
  }
  if (window.cutieDebug?.forcePose) override = window.cutieDebug.forcePose;
  animateRobot(t, beat, override);
  park.update(now / 1000, dt);
  drawFx(t, dt);
  renderer.render(scene, camera);
}

// 시작
window.__gameStarted = true;
(async () => {
  show('title');
  $('loadMsg').textContent = '큐티를 불러오는 중…';
  try {
    await loadRobot();
    robotReady = true;
    state = 'title';
    $('loadMsg').textContent = '';
    renderBest();
    if (queuedLevel) chooseLevel(queuedLevel);
  } catch (err) {
    console.error(err);
    $('loadMsg').textContent = '로봇을 불러오지 못했어요 (models 폴더 확인): ' + err.message;
  }
  loop();
})();

// 테스트용
window.cutieDebug = { startLevel, onTap, events: () => events, gameTime, stats, LEVELS, finish, POSE, animateRobot };
