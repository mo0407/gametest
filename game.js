'use strict';

/* ============================================================
 * 迷宫 · 一段静静的路
 * 纪念碑谷风格的 2D 迷宫：全图探索 + 多版本地图 + 角色选择 + 计时
 * ============================================================ */

/* ---------------- 基础 ---------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const COLS = 18, ROWS = 18;          // 迷宫尺寸（格）
const MOVE_MS = 150;                 // 每步移动时长
const SIGHT = 3;                     // 探索标记半径（格）

const DIRS = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]]; // dx,dy,墙方向,反方向

let dpr = 1, viewW = 0, viewH = 0, cell = 32, ox = 0, oy = 0;

/* ---------------- 角色 ---------------- */
const CHARACTERS = [
  { id: 'ida',   name: '艾达',   en: 'IDA',   color: '#e98a9b', desc: '沉默的公主' },
  { id: 'totem', name: '图腾',   en: 'TOTEM', color: '#e2795b', desc: '忠诚的朋友' },
  { id: 'crow',  name: '小乌鸦', en: 'CROW',  color: '#3d3a50', desc: '好奇的旁观者' },
];

/* ---------------- 音效（首次点击后启用，柔和音量） ---------------- */
let actx = null;
function ensureAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 无音频环境 */ }
  }
  if (actx && actx.state === 'suspended') actx.resume();
}
function tone(freq, delay, dur, vol) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  const t0 = actx.currentTime + delay;
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0];
const plink = () => tone(PENTA[(Math.random() * PENTA.length) | 0], 0, 0.22, 0.04);
const winChime = () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.15, 0.5, 0.045));

/* ---------------- 迷宫生成：四种地图版本 ---------------- */
const k = (x, y, d) => x + ',' + y + ',' + d;

/* 从起点 BFS：在路径距离最远的格子（>=80% 最大距离）里随机选取出口，
 * 保证每局出口位置不固定，同时离起点足够远、不至于贴着出生点 */
function finalize(walls) {
  const dist = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
  dist[0][0] = 0;
  const q = [[0, 0]];
  let maxDist = 0;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy, d] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      if (walls.has(k(x, y, d)) || dist[ny][nx] !== -1) continue;
      dist[ny][nx] = dist[y][x] + 1;
      if (dist[ny][nx] > maxDist) maxDist = dist[ny][nx];
      q.push([nx, ny]);
    }
  }
  const threshold = maxDist * 0.8;
  const candidates = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (dist[y][x] >= threshold && x + y >= 3) candidates.push({ x, y });
    }
  }
  const exit = candidates.length
    ? candidates[(Math.random() * candidates.length) | 0]
    : { x: COLS - 1, y: ROWS - 1 };
  return { walls, exit };
}

const inBounds = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS;

function fullWalls() {
  const walls = new Set();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      walls.add(k(x, y, 0)); walls.add(k(x, y, 1));
      walls.add(k(x, y, 2)); walls.add(k(x, y, 3));
    }
  }
  return walls;
}

/* 版本一：递归回溯 —— 幽深曲折的长廊 */
function genBacktracker() {
  const walls = fullWalls();
  const visited = newGrid(false);
  const stack = [[0, 0]];
  visited[0][0] = true;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = [];
    for (const [dx, dy, d, od] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (inBounds(nx, ny) && !visited[ny][nx]) opts.push([nx, ny, d, od]);
    }
    if (!opts.length) { stack.pop(); continue; }
    const [nx, ny, d, od] = opts[(Math.random() * opts.length) | 0];
    walls.delete(k(x, y, d));
    walls.delete(k(nx, ny, od));
    visited[ny][nx] = true;
    stack.push([nx, ny]);
  }
  return finalize(walls);
}

/* 版本二：随机 Prim —— 繁密短促的分岔 */
function genPrim() {
  const walls = fullWalls();
  const visited = newGrid(false);
  const frontier = [];
  const addFrontier = (x, y) => {
    for (const [dx, dy, d, od] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (inBounds(nx, ny) && !visited[ny][nx]) frontier.push([x, y, d, nx, ny, od]);
    }
  };
  visited[0][0] = true;
  addFrontier(0, 0);
  while (frontier.length) {
    const i = (Math.random() * frontier.length) | 0;
    const [x, y, d, nx, ny, od] = frontier.splice(i, 1)[0];
    if (visited[ny][nx]) continue;
    walls.delete(k(x, y, d));
    walls.delete(k(nx, ny, od));
    visited[ny][nx] = true;
    addFrontier(nx, ny);
  }
  return finalize(walls);
}

/* 版本三：回溯 + 拆墙成环 —— 带有环形近路 */
function genBraid() {
  const walls = genBacktracker().walls;
  const internal = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (x < COLS - 1 && walls.has(k(x, y, 1))) internal.push([x, y, 1]);
      if (y < ROWS - 1 && walls.has(k(x, y, 2))) internal.push([x, y, 2]);
    }
  }
  const remove = Math.floor(internal.length * 0.10);
  for (let i = 0; i < remove; i++) {
    const j = (Math.random() * internal.length) | 0;
    const [x, y, d] = internal.splice(j, 1)[0];
    if (d === 1) { walls.delete(k(x, y, 1)); walls.delete(k(x + 1, y, 3)); }
    else { walls.delete(k(x, y, 2)); walls.delete(k(x, y + 1, 0)); }
  }
  return finalize(walls);
}

/* 版本四：递归分割 —— 院墙围出的园地 */
function genDivision() {
  const walls = new Set(); // 内部全空，逐层加墙
  for (let x = 0; x < COLS; x++) { walls.add(k(x, 0, 0)); walls.add(k(x, ROWS - 1, 2)); }
  for (let y = 0; y < ROWS; y++) { walls.add(k(0, y, 3)); walls.add(k(COLS - 1, y, 1)); }
  const addWall = (x, y, d, od, nx, ny) => { walls.add(k(x, y, d)); walls.add(k(nx, ny, od)); };
  const divide = (x0, y0, x1, y1) => {
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < 2 || h < 2) return;
    const horizontal = w < h ? true : w > h ? false : Math.random() < 0.5;
    if (horizontal) {
      const wy = y0 + 1 + ((Math.random() * (h - 1)) | 0);
      const gap = x0 + ((Math.random() * w) | 0);
      for (let x = x0; x <= x1; x++) {
        if (x === gap) continue;
        addWall(x, wy, 0, 2, x, wy - 1);
      }
      divide(x0, y0, x1, wy - 1);
      divide(x0, wy, x1, y1);
    } else {
      const wx = x0 + 1 + ((Math.random() * (w - 1)) | 0);
      const gap = y0 + ((Math.random() * h) | 0);
      for (let y = y0; y <= y1; y++) {
        if (y === gap) continue;
        addWall(wx, y, 3, 1, wx - 1, y);
      }
      divide(x0, y0, wx - 1, y1);
      divide(wx, y0, x1, y1);
    }
  };
  divide(0, 0, COLS - 1, ROWS - 1);
  return finalize(walls);
}

const MAP_TYPES = [
  { id: 'backtracker', name: '曲径', desc: '幽深曲折的长廊', gen: genBacktracker },
  { id: 'prim',        name: '密林', desc: '繁密短促的分岔', gen: genPrim },
  { id: 'braid',       name: '回环', desc: '带环形近路',     gen: genBraid },
  { id: 'division',    name: '庭院', desc: '院墙围出的园地', gen: genDivision },
];

const hasWall = (maze, x, y, d) => maze.walls.has(k(x, y, d));
const newGrid = (v) => Array.from({ length: ROWS }, () => Array(COLS).fill(v));

function markExplored(explored, cx, cy) {
  for (let dy = -SIGHT; dy <= SIGHT; dy++) {
    for (let dx = -SIGHT; dx <= SIGHT; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) explored[ny][nx] = true;
    }
  }
}

/* ---------------- 游戏状态 ---------------- */
const state = {
  screen: 'select',            // select | play | win
  maze: null,
  explored: null,
  charIndex: 0,
  mapType: 0,
  started: false,
  startTime: 0,
  endTime: 0,
  steps: 0,
  player: { cx: 0, cy: 0, rx: 0.5, ry: 0.5, fx: 0.5, fy: 0.5, tx: 0, ty: 0, t: 1, face: 1, moving: false },
};

/* 选择界面背后自动漫游的“幽灵旅人” */
const bot = { cx: 0, cy: 0, rx: 0.5, ry: 0.5, fx: 0.5, fy: 0.5, tx: 0, ty: 0, t: 1, face: 1, moving: false };
let botMaze = null, botExplored = null, botSeen = null;

/* ---------------- 尺寸自适应 ---------------- */
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth; viewH = window.innerHeight;
  canvas.width = viewW * dpr; canvas.height = viewH * dpr;
  canvas.style.width = viewW + 'px'; canvas.style.height = viewH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cell = Math.max(18, Math.floor(Math.min(viewW, viewH) * 0.82 / Math.max(COLS, ROWS)));
  ox = Math.round((viewW - cell * COLS) / 2);
  oy = Math.round((viewH - cell * ROWS) / 2);
}
window.addEventListener('resize', resize);

/* ---------------- 输入 ---------------- */
const KEY_MAP = {
  arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
};
let activeKeys = [];

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  // 输入框聚焦时：回车 = 记录成绩，其余按键交给输入框
  if (e.target && e.target.tagName === 'INPUT') {
    if (key === 'enter') submitScore();
    return;
  }
  if (KEY_MAP[key] || key === ' ') e.preventDefault();
  if (KEY_MAP[key] && state.screen === 'play') {
    activeKeys = activeKeys.filter((k2) => k2 !== key);
    activeKeys.unshift(key);
  }
  if (key === 'enter' && state.screen === 'win') startGame();
});
window.addEventListener('keyup', (e) => {
  activeKeys = activeKeys.filter((k2) => k2 !== e.key.toLowerCase());
});
window.addEventListener('blur', () => { activeKeys = []; });

function currentDir() {
  for (const key of activeKeys) {
    if (KEY_MAP[key]) return KEY_MAP[key];
  }
  return null;
}

/* ---------------- 界面元素 ---------------- */
const el = {
  select: document.getElementById('selectScreen'),
  win: document.getElementById('winScreen'),
  cards: document.getElementById('charCards'),
  mapRow: document.getElementById('mapRow'),
  finalTime: document.getElementById('finalTime'),
  finalSteps: document.getElementById('finalSteps'),
  btnRetry: document.getElementById('btnRetry'),
  btnChange: document.getElementById('btnChangeChar'),
  hud: document.getElementById('hud'),
  hudTime: document.getElementById('hudTime'),
  hudSteps: document.getElementById('hudSteps'),
  hudCharDot: document.getElementById('hudCharDot'),
  hudCharName: document.getElementById('hudCharName'),
  nameInput: document.getElementById('nameInput'),
  btnSubmit: document.getElementById('btnSubmit'),
  lbNote: document.getElementById('lbNote'),
  lbList: document.getElementById('lbList'),
};

/* ---------------- 排行榜 ----------------
 * 远程共享榜（Cloudflare Workers + KV），接口不可达时自动降级为浏览器本地榜。
 * 数据读写集中在 lbRemoteFetch / lbSubmit 两个函数。 */
const LB_KEY = 'maze_scores_v1';
const LB_NAME_KEY = 'maze_last_name';
const LB_SHOW = 20;
const LB_REMOTE = 'https://maze-lb.moshaojie.workers.dev/scores';
/* 演示级防滥用密钥：前端源码公开，只挡随手涂鸦，不挡有心人 */
const LB_SECRET = '673079890c4a36ac2171b9e3ad150389';
let lbSubmitted = false;

function lbLocal() {
  try {
    const list = JSON.parse(localStorage.getItem(LB_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}
function lbCacheSave(list) {
  try { localStorage.setItem(LB_KEY, JSON.stringify(list.slice(0, 100))); } catch (e) { /* 忽略 */ }
}
/* 同名用户只保留一条记录：新成绩更好则替换，否则保留旧成绩 */
function lbUpsert(list, rec) {
  const i = list.findIndex((s) => s.name.toLowerCase() === rec.name.toLowerCase());
  if (i >= 0) {
    if (rec.time < list[i].time) { list[i] = rec; return 'better'; }
    return 'kept';
  }
  list.push(rec);
  return 'new';
}
const lbSorted = (list) => list.slice().sort((a, b) => a.time - b.time || (a.date < b.date ? -1 : 1));

async function lbRemoteFetch() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(LB_REMOTE, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('http ' + r.status);
    const data = await r.json();
    const list = Array.isArray(data.scores) ? data.scores : [];
    lbCacheSave(list);
    return list;
  } finally { clearTimeout(timer); }
}

async function lbSubmit(rec) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    let r;
    try {
      r = await fetch(LB_REMOTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: LB_SECRET, record: rec }),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }
    if (!r.ok) throw new Error('http ' + r.status);
    const data = await r.json();
    const list = Array.isArray(data.scores) ? data.scores : [];
    lbCacheSave(list);
    return { result: data.result || 'new', list };
  } catch (e) {
    // 远程不可达：降级为本地榜
    const list = lbLocal();
    const result = lbUpsert(list, rec);
    lbCacheSave(list);
    return { result, list: lbSorted(list) };
  }
}

function renderBoard(list, myName) {
  el.lbList.innerHTML = '';
  const sorted = lbSorted(list).slice(0, LB_SHOW);
  if (!sorted.length) {
    const empty = document.createElement('div');
    empty.className = 'lb-empty';
    empty.textContent = '暂无记录，来当第一名吧';
    el.lbList.appendChild(empty);
    return;
  }
  sorted.forEach((s, idx) => {
    const row = document.createElement('div');
    row.className = 'lb-row'
      + (idx < 3 ? ' top' + (idx + 1) : '')
      + (myName && s.name.toLowerCase() === myName.toLowerCase() ? ' me' : '');
    row.title = (s.date || '') + ' · ' + (s.steps || 0) + ' 步';
    const rank = document.createElement('span'); rank.className = 'lb-rank'; rank.textContent = idx + 1;
    const name = document.createElement('span'); name.className = 'lb-name'; name.textContent = s.name;
    const time = document.createElement('span'); time.className = 'lb-time'; time.textContent = fmt(s.time);
    const map = document.createElement('span'); map.className = 'lb-map'; map.textContent = s.map || '';
    row.append(rank, name, time, map);
    el.lbList.appendChild(row);
  });
}

function showWin() {
  el.finalTime.textContent = fmt(state.endTime - state.startTime);
  el.finalSteps.textContent = '共走了 ' + state.steps + ' 步';
  lbSubmitted = false;
  el.nameInput.disabled = false;
  el.btnSubmit.disabled = false;
  el.lbNote.textContent = '';
  el.nameInput.value = localStorage.getItem(LB_NAME_KEY) || '';
  el.win.classList.remove('hidden');
  renderBoard(lbLocal(), el.nameInput.value.trim());
  // 先展示本地缓存，再从远程拉取最新榜单刷新
  lbRemoteFetch().then((list) => {
    if (state.screen === 'win') renderBoard(list, el.nameInput.value.trim());
  }).catch(() => { /* 远程不可达时保留本地榜单 */ });
  setTimeout(() => { if (state.screen === 'win' && !lbSubmitted) el.nameInput.focus(); }, 400);
}

async function submitScore() {
  if (state.screen !== 'win' || lbSubmitted) return;
  const name = el.nameInput.value.trim().slice(0, 12);
  if (!name) {
    el.lbNote.textContent = '先输入名字再记录哦';
    el.nameInput.focus();
    return;
  }
  lbSubmitted = true;
  el.nameInput.disabled = true;
  el.btnSubmit.disabled = true;
  el.lbNote.textContent = '记录中…';
  const rec = {
    name,
    time: Math.round(state.endTime - state.startTime),
    steps: state.steps,
    map: MAP_TYPES[state.mapType].name,
    date: new Date().toISOString().slice(0, 10),
  };
  try { localStorage.setItem(LB_NAME_KEY, name); } catch (e) { /* 忽略 */ }
  const { result, list } = await lbSubmit(rec);
  const sorted = lbSorted(list);
  const mine = sorted.find((s) => s.name.toLowerCase() === name.toLowerCase());
  const rank = mine ? sorted.indexOf(mine) + 1 : '-';
  el.lbNote.textContent = result === 'kept'
    ? '这次没有超过你的最好成绩，已保留 ' + fmt(mine.time)
    : (result === 'better' ? '刷新了你的最好成绩！' : '已记录！') + ' 当前排名第 ' + rank;
  renderBoard(sorted, name);
}

/* ---------------- 角色卡片 ---------------- */
function buildCards() {
  CHARACTERS.forEach((ch, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    const cv = document.createElement('canvas');
    cv.width = 120 * dpr; cv.height = 120 * dpr;
    card.appendChild(cv);
    const name = document.createElement('div'); name.className = 'cname'; name.textContent = ch.name;
    const en = document.createElement('div'); en.className = 'cen'; en.textContent = ch.en;
    const desc = document.createElement('div'); desc.className = 'cdesc'; desc.textContent = ch.desc;
    card.appendChild(name); card.appendChild(en); card.appendChild(desc);
    card.addEventListener('click', () => {
      ensureAudio();
      state.charIndex = i;
      startGame();
    });
    el.cards.appendChild(card);
    ch._cv = cv;
  });
}

/* ---------------- 地图版本选择 ---------------- */
function buildMapPicker() {
  MAP_TYPES.forEach((mt, i) => {
    const b = document.createElement('div');
    b.className = 'map-pill' + (i === state.mapType ? ' active' : '');
    const name = document.createElement('span'); name.className = 'mp-name'; name.textContent = mt.name;
    const desc = document.createElement('span'); desc.className = 'mp-desc'; desc.textContent = mt.desc;
    b.appendChild(name); b.appendChild(desc);
    b.addEventListener('click', () => {
      state.mapType = i;
      el.mapRow.querySelectorAll('.map-pill').forEach((p, j) => p.classList.toggle('active', j === i));
    });
    el.mapRow.appendChild(b);
  });
}

function drawCardAvatars(now) {
  for (let i = 0; i < CHARACTERS.length; i++) {
    const ch = CHARACTERS[i];
    const c = ch._cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, 120, 120);
    c.fillStyle = 'rgba(226,149,141,0.12)';
    c.beginPath(); c.arc(60, 66, 46, 0, Math.PI * 2); c.fill();
    c.save();
    c.translate(60, 68);
    drawChar(ch.id, c, 58, 1, Math.sin(now / 320 + i * 2.1) * 3);
    c.restore();
  }
}

/* ---------------- 角色绘制（纯矢量，纪念碑谷小人风格） ---------------- */
function fillRR(c, x, y, w, h, r) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r);
  else { c.rect(x, y, w, h); }
  c.fill();
}

function drawChar(cid, c, s, face, bob) {
  c.save();
  c.translate(0, bob);
  c.fillStyle = 'rgba(90,60,80,0.18)';
  c.beginPath(); c.ellipse(0, s * 0.44, s * 0.3, s * 0.1, 0, 0, Math.PI * 2); c.fill();
  c.scale(face, 1);

  if (cid === 'ida') {
    // 头
    c.fillStyle = '#ffe9dd';
    c.beginPath(); c.arc(0, -s * 0.38, s * 0.17, 0, Math.PI * 2); c.fill();
    // 圆锥帽
    c.fillStyle = '#e98a9b';
    c.beginPath();
    c.moveTo(-s * 0.2, -s * 0.44); c.lineTo(s * 0.02, -s * 0.8); c.lineTo(s * 0.21, -s * 0.42);
    c.closePath(); c.fill();
    // 白裙
    c.fillStyle = '#fff8f4';
    c.beginPath();
    c.moveTo(0, -s * 0.34);
    c.quadraticCurveTo(s * 0.28, -s * 0.06, s * 0.3, s * 0.32);
    c.quadraticCurveTo(0, s * 0.44, -s * 0.3, s * 0.32);
    c.quadraticCurveTo(-s * 0.28, -s * 0.06, 0, -s * 0.34);
    c.fill();
    // 眼睛
    c.fillStyle = '#5a4a55';
    c.beginPath();
    c.arc(s * 0.06, -s * 0.4, s * 0.023, 0, Math.PI * 2);
    c.arc(s * 0.15, -s * 0.4, s * 0.023, 0, Math.PI * 2);
    c.fill();
  } else if (cid === 'totem') {
    const cols = ['#e2795b', '#4fa8a2', '#f6e7b2'];
    let by = s * 0.4;
    for (let i = 0; i < 3; i++) {
      const h = s * 0.23, w = s * (0.54 - i * 0.1);
      by -= h;
      c.fillStyle = cols[i];
      fillRR(c, -w / 2, by, w, h - 1, s * 0.06);
    }
    c.fillStyle = '#3d3a50';
    c.beginPath();
    c.arc(-s * 0.055, by + s * 0.12, s * 0.026, 0, Math.PI * 2);
    c.arc(s * 0.055, by + s * 0.12, s * 0.026, 0, Math.PI * 2);
    c.fill();
  } else { // crow
    // 尾巴
    c.fillStyle = '#3d3a50';
    c.beginPath();
    c.moveTo(-s * 0.16, s * 0.02); c.lineTo(-s * 0.44, -s * 0.06); c.lineTo(-s * 0.18, s * 0.22);
    c.closePath(); c.fill();
    // 身体
    c.beginPath(); c.ellipse(0, s * 0.12, s * 0.26, s * 0.3, 0, 0, Math.PI * 2); c.fill();
    // 头
    c.beginPath(); c.arc(s * 0.1, -s * 0.22, s * 0.18, 0, Math.PI * 2); c.fill();
    // 喙
    c.fillStyle = '#f2b134';
    c.beginPath();
    c.moveTo(s * 0.24, -s * 0.27); c.lineTo(s * 0.46, -s * 0.2); c.lineTo(s * 0.24, -s * 0.15);
    c.closePath(); c.fill();
    // 眼睛
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(s * 0.15, -s * 0.27, s * 0.048, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f2b134';
    c.beginPath(); c.arc(s * 0.165, -s * 0.27, s * 0.022, 0, Math.PI * 2); c.fill();
    // 翅膀
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.beginPath(); c.ellipse(-s * 0.08, s * 0.1, s * 0.11, s * 0.2, -0.35, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

/* ---------------- 流程控制 ---------------- */
function startGame() {
  state.maze = MAP_TYPES[state.mapType].gen();
  state.explored = newGrid(false);
  const p = state.player;
  p.cx = 0; p.cy = 0; p.rx = 0.5; p.ry = 0.5; p.t = 1; p.face = 1; p.moving = false;
  state.steps = 0;
  state.started = false;
  state.startTime = 0;
  state.endTime = 0;
  activeKeys = [];
  markExplored(state.explored, 0, 0);

  const ch = CHARACTERS[state.charIndex];
  el.hudCharName.textContent = ch.name;
  el.hudCharDot.style.background = ch.color;

  el.select.classList.add('hidden');
  el.win.classList.add('hidden');
  el.hud.classList.remove('hidden');
  state.screen = 'play';
  updateHud(0);
}

function onWin(now) {
  state.screen = 'win';
  state.endTime = now;
  activeKeys = [];
  winChime();
  setTimeout(showWin, 550);
}

function backToSelect() {
  state.screen = 'select';
  el.win.classList.add('hidden');
  el.hud.classList.add('hidden');
  el.select.classList.remove('hidden');
}

el.btnRetry.addEventListener('click', () => { ensureAudio(); startGame(); });
el.btnChange.addEventListener('click', backToSelect);
el.btnSubmit.addEventListener('click', submitScore);

/* ---------------- 更新逻辑 ---------------- */
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function tryStartMove(now) {
  const p = state.player;
  const dir = currentDir();
  if (!dir) return false;
  const [dx, dy] = dir;
  const d = DIRS.findIndex(([ddx, ddy]) => ddx === dx && ddy === dy);
  if (hasWall(state.maze, p.cx, p.cy, d)) return false;
  if (!state.started) { state.started = true; state.startTime = now; }
  p.fx = p.cx + 0.5; p.fy = p.cy + 0.5;
  p.tx = p.cx + dx; p.ty = p.cy + dy; // 目标格（格坐标）
  p.t = 0; p.moving = true;
  if (dx !== 0) p.face = dx;
  state.steps++;
  plink();
  return true;
}

function update(dt, now) {
  const p = state.player;
  if (p.t < 1) {
    // 正在移动：补间到目标格中心（tx/ty 是格坐标，需 +0.5 才是格心）
    p.t = Math.min(1, p.t + dt / MOVE_MS);
    const e = easeInOut(p.t);
    p.rx = p.fx + (p.tx + 0.5 - p.fx) * e;
    p.ry = p.fy + (p.ty + 0.5 - p.fy) * e;
    if (p.t >= 1) {
      p.cx = p.tx; p.cy = p.ty;
      p.moving = false;
      if (p.cx === state.maze.exit.x && p.cy === state.maze.exit.y) {
        onWin(now);
      } else {
        tryStartMove(now); // 按键未松开时同帧续走，避免步间顿挫
      }
    }
  } else {
    tryStartMove(now);
  }
  markExplored(state.explored, p.cx, p.cy);
  updateHud(now);
}

function updateBot(dt) {
  if (!botMaze) {
    botMaze = MAP_TYPES[0].gen();
    botExplored = newGrid(false);
    botSeen = newGrid(false);
    botSeen[0][0] = true;
    markExplored(botExplored, 0, 0);
  }
  if (bot.t < 1) {
    bot.t = Math.min(1, bot.t + dt / (MOVE_MS / 0.7));
    const e = easeInOut(bot.t);
    bot.rx = bot.fx + (bot.tx + 0.5 - bot.fx) * e;
    bot.ry = bot.fy + (bot.ty + 0.5 - bot.fy) * e;
    if (bot.t >= 1) { bot.cx = bot.tx; bot.cy = bot.ty; bot.moving = false; }
  } else {
    const opts = [], fresh = [];
    for (const [dx, dy, d] of DIRS) {
      if (hasWall(botMaze, bot.cx, bot.cy, d)) continue;
      opts.push([dx, dy]);
      if (!botSeen[bot.cy + dy][bot.cx + dx]) fresh.push([dx, dy]);
    }
    const list = fresh.length ? fresh : opts;
    if (list.length) {
      const [dx, dy] = list[(Math.random() * list.length) | 0];
      bot.fx = bot.cx + 0.5; bot.fy = bot.cy + 0.5;
      bot.tx = bot.cx + dx; bot.ty = bot.cy + dy;
      bot.t = 0; bot.moving = true;
      if (dx !== 0) bot.face = dx;
      botSeen[bot.ty][bot.tx] = true;
    }
  }
  markExplored(botExplored, bot.cx, bot.cy);
}

const fmt = (ms) => {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor((ms % 1000) / 100);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + t;
};

function updateHud(now) {
  const t = state.started ? (state.endTime || now) - state.startTime : 0;
  el.hudTime.textContent = fmt(t);
  el.hudSteps.textContent = state.steps;
}

/* ---------------- 渲染 ---------------- */
const FLOOR = ['#f9ece7', '#f7e3dd', '#fbeff0', '#f3e6ea', '#f8eee4', '#fdeaea'];

function drawBackdrop(now) {
  const g = ctx.createRadialGradient(viewW * 0.5, viewH * 0.42, 60, viewW * 0.5, viewH * 0.5, Math.max(viewW, viewH) * 0.75);
  g.addColorStop(0, '#fdf1ec');
  g.addColorStop(1, '#f6e7e4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);
  // 缓慢漂浮的几何装饰
  const shapes = [
    { x: 0.12, y: 0.2, r: 60, col: 'rgba(79,168,162,0.07)', sp: 0.00021 },
    { x: 0.88, y: 0.16, r: 90, col: 'rgba(226,149,141,0.09)', sp: 0.00017 },
    { x: 0.85, y: 0.82, r: 70, col: 'rgba(179,163,184,0.09)', sp: 0.00025 },
    { x: 0.15, y: 0.85, r: 46, col: 'rgba(242,177,52,0.07)', sp: 0.00019 },
  ];
  for (const sh of shapes) {
    const dx = Math.sin(now * sh.sp) * 24, dy = Math.cos(now * sh.sp * 1.3) * 18;
    ctx.fillStyle = sh.col;
    ctx.beginPath();
    ctx.arc(viewW * sh.x + dx, viewH * sh.y + dy, sh.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMaze(maze, explored) {
  // 整图岛屿底（衬出地图轮廓，未探索区域保持空白）
  ctx.save();
  ctx.shadowColor = 'rgba(150,90,110,0.20)';
  ctx.shadowBlur = cell * 0.35;
  ctx.shadowOffsetY = cell * 0.18;
  ctx.fillStyle = 'rgba(255,252,250,0.45)';
  fillRR(ctx, ox - cell * 0.4, oy - cell * 0.4, cell * COLS + cell * 0.8, cell * ROWS + cell * 0.8, cell * 0.5);
  ctx.restore();

  // 已探索区域的地板（粉彩拼布），走过的格子永久可见
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!explored[y][x]) continue;
      ctx.fillStyle = FLOOR[(x * 7 + y * 13) % FLOOR.length];
      ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }
  }

  // 已探索区域的墙壁（柔和玫瑰色圆头线段）
  ctx.strokeStyle = '#e2958d';
  ctx.lineWidth = Math.max(3, cell * 0.26);
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(178,94,96,0.32)';
  ctx.shadowBlur = cell * 0.1;
  ctx.shadowOffsetY = cell * 0.05;
  ctx.beginPath();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!explored[y][x]) continue;
      const px = ox + x * cell, py = oy + y * cell;
      if (hasWall(maze, x, y, 0)) { ctx.moveTo(px, py); ctx.lineTo(px + cell, py); }
      if (hasWall(maze, x, y, 3)) { ctx.moveTo(px, py); ctx.lineTo(px, py + cell); }
      if (x === COLS - 1 && hasWall(maze, x, y, 1)) { ctx.moveTo(px + cell, py); ctx.lineTo(px + cell, py + cell); }
      if (y === ROWS - 1 && hasWall(maze, x, y, 2)) { ctx.moveTo(px, py + cell); ctx.lineTo(px + cell, py + cell); }
    }
  }
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function drawExit(maze, now) {
  const ex = ox + maze.exit.x * cell + cell / 2;
  const ey = oy + maze.exit.y * cell + cell / 2;
  const glow = 0.5 + 0.5 * Math.sin(now / 350);
  // 台座
  ctx.fillStyle = '#e8cfc7';
  fillRR(ctx, ex - cell * 0.34, ey + cell * 0.16, cell * 0.68, cell * 0.2, cell * 0.06);
  // 金色拱门
  ctx.save();
  ctx.strokeStyle = '#f2b134';
  ctx.lineWidth = Math.max(3, cell * 0.09);
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(242,177,52,' + (0.4 + 0.4 * glow).toFixed(2) + ')';
  ctx.shadowBlur = cell * (0.25 + 0.3 * glow);
  const w = cell * 0.26, top = ey - cell * 0.06, base = ey + cell * 0.18;
  ctx.beginPath();
  ctx.moveTo(ex - w, base);
  ctx.lineTo(ex - w, top);
  ctx.arc(ex, top, w, Math.PI, 0);
  ctx.lineTo(ex + w, base);
  ctx.stroke();
  ctx.restore();
  // 门上方漂浮的菱形
  ctx.save();
  ctx.translate(ex, ey - cell * 0.5 - glow * cell * 0.07);
  ctx.rotate(now / 900);
  ctx.fillStyle = 'rgba(242,177,52,0.85)';
  const r = cell * 0.09;
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ---------------- 主循环 ---------------- */
let lastT = 0;
function loop(now) {
  const dt = Math.min(50, now - lastT || 16);
  lastT = now;

  if (state.screen === 'play') update(dt, now);
  else if (state.screen === 'select') updateBot(dt);

  drawBackdrop(now);

  const inPlay = state.screen === 'play' || state.screen === 'win';
  const maze = inPlay ? state.maze : botMaze;
  if (maze) {
    const explored = inPlay ? state.explored : botExplored;
    drawMaze(maze, explored);
    // 出口只有在被探索过后才显示
    if (explored[maze.exit.y][maze.exit.x]) drawExit(maze, now);

    const actor = inPlay ? state.player : bot;
    const px = ox + actor.rx * cell, py = oy + actor.ry * cell;
    const chId = inPlay ? CHARACTERS[state.charIndex].id : 'ida';
    const bob = actor.moving
      ? Math.sin(now / 75) * cell * 0.05
      : Math.sin(now / 420) * cell * 0.018;
    ctx.save();
    ctx.translate(px, py);
    drawChar(chId, ctx, cell * 0.78, actor.face, bob);
    ctx.restore();
  }

  if (state.screen === 'select') drawCardAvatars(now);

  requestAnimationFrame(loop);
}

/* ---------------- 启动 ---------------- */
resize();
buildCards();
buildMapPicker();
requestAnimationFrame(loop);
