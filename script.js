'use strict';

/* =========================================================
   SUDOKU CORE: generator + solver
   ========================================================= */

function emptyGrid(){
  return Array.from({length:9}, () => Array(9).fill(0));
}

function makeRng(seed){
  // mulberry32 — small deterministic PRNG, used for the daily challenge
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng){
  const rand = rng || Math.random;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isValid(grid, r, c, n){
  for (let i = 0; i < 9; i++){
    if (grid[r][i] === n) return false;
    if (grid[i][c] === n) return false;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++){
    for (let j = 0; j < 3; j++){
      if (grid[br + i][bc + j] === n) return false;
    }
  }
  return true;
}

function findEmpty(grid){
  for (let r = 0; r < 9; r++){
    for (let c = 0; c < 9; c++){
      if (grid[r][c] === 0) return [r, c];
    }
  }
  return null;
}

function fillGrid(grid, rng){
  const pos = findEmpty(grid);
  if (!pos) return true;
  const [r, c] = pos;
  for (const n of shuffle([1,2,3,4,5,6,7,8,9], rng)){
    if (isValid(grid, r, c, n)){
      grid[r][c] = n;
      if (fillGrid(grid, rng)) return true;
      grid[r][c] = 0;
    }
  }
  return false;
}

function generateSolved(rng){
  const grid = emptyGrid();
  fillGrid(grid, rng);
  return grid;
}

// Counts solutions up to a cap (used to verify puzzle has a unique solution).
function countSolutions(grid, cap = 2){
  let count = 0;
  function backtrack(g){
    if (count >= cap) return;
    const pos = findEmpty(g);
    if (!pos){ count++; return; }
    const [r, c] = pos;
    for (let n = 1; n <= 9; n++){
      if (count >= cap) return;
      if (isValid(g, r, c, n)){
        g[r][c] = n;
        backtrack(g);
        g[r][c] = 0;
      }
    }
  }
  backtrack(grid.map(row => row.slice()));
  return count;
}

const DIFFICULTY = {
  easy:   { removeTarget: 40, hints: 5, mistakes: 4, bonus: 100, parSeconds: 300, xp: 40,  label: 'Mudah' },
  medium: { removeTarget: 49, hints: 3, mistakes: 3, bonus: 250, parSeconds: 480, xp: 70,  label: 'Sedang' },
  hard:   { removeTarget: 55, hints: 2, mistakes: 3, bonus: 500, parSeconds: 720, xp: 110, label: 'Sulit' },
  zen:    { removeTarget: 46, hints: 5, mistakes: Infinity, bonus: 150, parSeconds: 600, xp: 55, label: 'Zen' },
  daily:  { removeTarget: 47, hints: 3, mistakes: 3, bonus: 300, parSeconds: 480, xp: 90,  label: 'Harian' },
};

function generatePuzzle(difficulty, rng){
  const solved = generateSolved(rng);
  const puzzle = solved.map(row => row.slice());
  const target = DIFFICULTY[difficulty].removeTarget;
  const positions = shuffle(
    Array.from({length:81}, (_, i) => [Math.floor(i/9), i%9]), rng
  );
  let removed = 0;
  for (const [r, c] of positions){
    if (removed >= target) break;
    const backup = puzzle[r][c];
    puzzle[r][c] = 0;
    if (countSolutions(puzzle) === 1){
      removed++;
    } else {
      puzzle[r][c] = backup;
    }
  }
  return { puzzle, solved };
}

function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}
function dailySeed(){
  const key = todayKey();
  let hash = 0;
  for (let i = 0; i < key.length; i++){
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}
function daysBetween(a, b){
  const ms = 24*60*60*1000;
  const da = new Date(Number(a.slice(0,4)), Number(a.slice(4,6))-1, Number(a.slice(6,8)));
  const db = new Date(Number(b.slice(0,4)), Number(b.slice(4,6))-1, Number(b.slice(6,8)));
  return Math.round((db - da) / ms);
}

/* =========================================================
   PROFILE / PERSISTENT STORAGE  (localStorage)
   ========================================================= */

const LS_KEY = 'sudoku-seru-profile-v2';

function defaultProfile(){
  return {
    xp: 0,
    stats: {
      gamesPlayed: 0,
      gamesWon: 0,
      totalScore: 0,
      longestStreak: 0,
      byDifficulty: {
        easy:   { bestScore: 0, bestTime: null, wins: 0 },
        medium: { bestScore: 0, bestTime: null, wins: 0 },
        hard:   { bestScore: 0, bestTime: null, wins: 0 },
        zen:    { bestScore: 0, bestTime: null, wins: 0 },
      },
    },
    daily: { streak: 0, lastDate: null, completedCount: 0 },
    achievements: [],
    settings: { sound: true, haptics: true, highlight: true, autoNotes: true, theme: 'reef' },
    saved: null, // in-progress game snapshot
    lastResult: null,
  };
}

function loadProfile(){
  try{
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    if (!raw) return defaultProfile();
    const base = defaultProfile();
    return {
      ...base, ...raw,
      stats: { ...base.stats, ...(raw.stats||{}), byDifficulty: { ...base.stats.byDifficulty, ...((raw.stats||{}).byDifficulty||{}) } },
      daily: { ...base.daily, ...(raw.daily||{}) },
      settings: { ...base.settings, ...(raw.settings||{}) },
    };
  }catch(e){ return defaultProfile(); }
}

let profile = loadProfile();
let saveQueued = false;
function persist(){
  if (saveQueued) return;
  saveQueued = true;
  requestAnimationFrame(() => {
    saveQueued = false;
    try{ localStorage.setItem(LS_KEY, JSON.stringify(profile)); }catch(e){}
  });
}

/* =========================================================
   XP / LEVEL CURVE
   ========================================================= */

function xpForLevel(level){ return 100 * level; } // xp required to go from `level` to `level+1`
function levelFromXp(xp){
  let level = 1, remaining = xp;
  while (remaining >= xpForLevel(level)){
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, into: remaining, need: xpForLevel(level) };
}

function grantXp(amount){
  const before = levelFromXp(profile.xp);
  profile.xp += amount;
  const after = levelFromXp(profile.xp);
  persist();
  updateXpUI();
  if (after.level > before.level){
    flashToast(`⭐ Naik ke Level ${after.level}!`);
    haptic([20, 40, 20, 40, 60]);
  }
  return after;
}

function updateXpUI(){
  const { level, into, need } = levelFromXp(profile.xp);
  const pct = Math.max(0, Math.min(1, into / need));
  const CIRC_SMALL = 97.4, CIRC_BIG = 175.9;
  hbLevel.textContent = level;
  hbXp.textContent = into;
  hbXpNext.textContent = need;
  xpRing.style.strokeDashoffset = String(CIRC_SMALL * (1 - pct));
  profileLevel.textContent = level;
  profileLevel2.textContent = level;
  profileXp.textContent = into;
  profileXpNext.textContent = need;
  xpRingBig.style.strokeDashoffset = String(CIRC_BIG * (1 - pct));
}

/* =========================================================
   ACHIEVEMENTS
   ========================================================= */

const ACHIEVEMENTS = [
  { id:'first_win',   icon:'🎉', name:'Kemenangan Pertama', desc:'Selesaikan papan sudoku pertamamu.' },
  { id:'flawless',    icon:'💎', name:'Tanpa Cela', desc:'Menang tanpa satu kesalahan pun.' },
  { id:'no_hints',    icon:'🧠', name:'Otak Sendiri', desc:'Menang tanpa memakai bantuan.' },
  { id:'speedy',      icon:'⚡', name:'Kilat', desc:'Menang dalam waktu kurang dari 3 menit.' },
  { id:'streak_10',   icon:'🔥', name:'Runtutan Panas', desc:'Capai runtutan 10 jawaban benar beruntun.' },
  { id:'hard_win',    icon:'🏔️', name:'Penakluk Sulit', desc:'Menangkan papan tingkat Sulit.' },
  { id:'ten_wins',    icon:'🏅', name:'Veteran', desc:'Menangkan 10 papan sudoku.' },
  { id:'high_score',  icon:'💰', name:'Skor Tinggi', desc:'Raih 1000 poin dalam satu papan.' },
  { id:'daily_3',     icon:'📅', name:'Rutin', desc:'Selesaikan tantangan harian 3 hari beruntun.' },
  { id:'daily_7',     icon:'🌟', name:'Konsisten', desc:'Selesaikan tantangan harian 7 hari beruntun.' },
  { id:'zen_win',     icon:'🌿', name:'Tenang Selalu', desc:'Selesaikan papan dalam mode Zen.' },
  { id:'level_5',     icon:'🚀', name:'Level 5', desc:'Capai level 5.' },
];

function unlockAchievement(id){
  if (profile.achievements.includes(id)) return;
  profile.achievements.push(id);
  persist();
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return;
  showBadgeToast(def);
  renderAchievements();
  haptic([15, 30, 15]);
}

function showBadgeToast(def){
  badgeToastIcon.textContent = def.icon;
  badgeToastTitle.textContent = def.name;
  badgeToast.classList.add('show');
  clearTimeout(showBadgeToast._t);
  showBadgeToast._t = setTimeout(() => badgeToast.classList.remove('show'), 2600);
}

function renderAchievements(){
  badgeGrid.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const unlocked = profile.achievements.includes(a.id);
    const card = document.createElement('div');
    card.className = `badge-card ${unlocked ? 'unlocked' : 'locked'}`;
    card.innerHTML = `
      <span class="badge-icon">${unlocked ? a.icon : '🔒'}</span>
      <p class="badge-name">${a.name}</p>
      <p class="badge-desc">${a.desc}</p>
    `;
    badgeGrid.appendChild(card);
  });
  badgeProgressText.textContent = `${profile.achievements.length} dari ${ACHIEVEMENTS.length} lencana terkumpul`;
  badgeDot.hidden = profile.achievements.length === 0 || document.querySelector('.tab-btn[data-view="achievements"]').classList.contains('seen');
}

function evaluateWinAchievements(ctx){
  unlockAchievement('first_win');
  if (ctx.mistakes === 0) unlockAchievement('flawless');
  if (ctx.hintsUsed === 0) unlockAchievement('no_hints');
  if (ctx.seconds < 180) unlockAchievement('speedy');
  if (profile.stats.longestStreak >= 10) unlockAchievement('streak_10');
  if (ctx.difficulty === 'hard') unlockAchievement('hard_win');
  if (profile.stats.gamesWon >= 10) unlockAchievement('ten_wins');
  if (ctx.score >= 1000) unlockAchievement('high_score');
  if (ctx.difficulty === 'zen') unlockAchievement('zen_win');
  if (profile.daily.streak >= 3) unlockAchievement('daily_3');
  if (profile.daily.streak >= 7) unlockAchievement('daily_7');
  if (levelFromXp(profile.xp).level >= 5) unlockAchievement('level_5');
}

/* =========================================================
   GAME STATE
   ========================================================= */

const state = {
  difficulty: 'easy',
  isDaily: false,
  puzzle: null,
  solution: null,
  given: null,
  board: null,
  notes: null,
  selected: null,
  pencilMode: false,
  score: 0,
  streak: 0,
  mistakes: 0,
  hintsUsed: 0,
  seconds: 0,
  timerId: null,
  paused: false,
  over: false,
  won: false,
  history: [],
};

/* =========================================================
   DOM REFS
   ========================================================= */

const appEl = document.getElementById('app');
const boardEl = document.getElementById('board');
const overlayEl = document.getElementById('board-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub = document.getElementById('overlay-sub');
const overlayResumeBtn = document.getElementById('overlay-resume');

const timerEl = document.getElementById('timer');
const scoreEl = document.getElementById('score');
const streakEl = document.getElementById('streak');
const streakStatEl = document.getElementById('streak-stat');
const mistakesEl = document.getElementById('mistakes');
const maxMistakesEl = document.getElementById('max-mistakes');
const bestScoreEl = document.getElementById('best-score');

const soundToggleBtn = document.getElementById('sound-toggle');
const levelTabs = document.querySelectorAll('.level-tab');

const numpadEl = document.getElementById('numpad');
const btnUndo = document.getElementById('btn-undo');
const btnErase = document.getElementById('btn-erase');
const btnPencil = document.getElementById('btn-pencil');
const btnHint = document.getElementById('btn-hint');
const hintCountEl = document.getElementById('hint-count');
const btnPause = document.getElementById('btn-pause');
const btnNewGame = document.getElementById('btn-new-game');

const winModal = document.getElementById('win-modal');
const winTime = document.getElementById('win-time');
const winScore = document.getElementById('win-score');
const winBonus = document.getElementById('win-bonus');
const winXp = document.getElementById('win-xp');
const winNote = document.getElementById('win-note');
const winClose = document.getElementById('win-close');
const winNext = document.getElementById('win-next');
const winShare = document.getElementById('win-share');

const overModal = document.getElementById('over-modal');
const overClose = document.getElementById('over-close');
const overRetry = document.getElementById('over-retry');

const genToast = document.getElementById('gen-toast');
const badgeToast = document.getElementById('badge-toast');
const badgeToastIcon = document.getElementById('badge-toast-icon');
const badgeToastTitle = document.getElementById('badge-toast-title');

const hbLevel = document.getElementById('hb-level');
const hbXp = document.getElementById('hb-xp');
const hbXpNext = document.getElementById('hb-xp-next');
const xpRing = document.getElementById('xp-ring');

const profileLevel = document.getElementById('profile-level');
const profileLevel2 = document.getElementById('profile-level-2');
const profileXp = document.getElementById('profile-xp');
const profileXpNext = document.getElementById('profile-xp-next');
const xpRingBig = document.getElementById('xp-ring-big');

const dailyCard = document.getElementById('daily-card');
const dailyFlame = document.getElementById('daily-flame');
const dailyStreakEl = document.getElementById('daily-streak');
const dailySub = document.getElementById('daily-sub');
const dailyCta = document.getElementById('daily-cta');

const stPlayed = document.getElementById('st-played');
const stWon = document.getElementById('st-won');
const stWinrate = document.getElementById('st-winrate');
const stScore = document.getElementById('st-score');
const stLongstreak = document.getElementById('st-longstreak');
const stDailystreak = document.getElementById('st-dailystreak');
const recordList = document.getElementById('record-list');

const badgeGrid = document.getElementById('badge-grid');
const badgeProgressText = document.getElementById('badge-progress-text');
const badgeDot = document.getElementById('badge-dot');

const themeRow = document.getElementById('theme-row');
const setSound = document.getElementById('set-sound');
const setHaptics = document.getElementById('set-haptics');
const setHighlight = document.getElementById('set-highlight');
const setAutonotes = document.getElementById('set-autonotes');
const btnShareApp = document.getElementById('btn-share-app');
const btnResetProgress = document.getElementById('btn-reset-progress');

const tabbar = document.getElementById('tabbar');
const views = document.querySelectorAll('.view');

/* =========================================================
   SOUND (tiny WebAudio beeps — no external files)
   ========================================================= */

let audioCtx = null;
function beep(freq, duration = 0.09, type = 'sine', gain = 0.05){
  if (!profile.settings.sound) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  }catch(e){ /* audio unavailable, ignore */ }
}
const sfx = {
  place: () => beep(520, 0.08, 'triangle', 0.05),
  error: () => beep(140, 0.18, 'sawtooth', 0.06),
  hint:  () => beep(700, 0.12, 'sine', 0.05),
  win:   () => { beep(523,0.12); setTimeout(()=>beep(659,0.12),100); setTimeout(()=>beep(784,0.2),200); },
  streak:() => beep(880, 0.1, 'triangle', 0.04),
  tap:   () => beep(360, 0.05, 'sine', 0.03),
};

function haptic(pattern){
  if (!profile.settings.haptics) return;
  if (navigator.vibrate){
    try{ navigator.vibrate(pattern); }catch(e){}
  }
}

/* =========================================================
   THEME
   ========================================================= */

const THEMES = [
  { id:'reef',  name:'Karang' },
  { id:'ocean', name:'Samudra' },
  { id:'grape', name:'Anggur' },
  { id:'paper', name:'Kertas' },
];

function applyTheme(id){
  profile.settings.theme = id;
  appEl.dataset.theme = id;
  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.swatch === id);
  });
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(appEl).getPropertyValue('--bg').trim();
  if (meta && bg) meta.setAttribute('content', bg);
  persist();
}

function buildThemeRow(){
  themeRow.innerHTML = '';
  THEMES.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'theme-swatch';
    btn.dataset.swatch = t.id;
    btn.title = t.name;
    btn.setAttribute('aria-label', t.name);
    btn.addEventListener('click', () => { applyTheme(t.id); sfx.tap(); });
    themeRow.appendChild(btn);
  });
}

/* =========================================================
   TAB / VIEW NAVIGATION
   ========================================================= */

function switchView(name){
  views.forEach(v => { v.hidden = v.dataset.view !== name; });
  tabbar.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'stats') renderStats();
  if (name === 'achievements'){
    renderAchievements();
    document.querySelector('.tab-btn[data-view="achievements"]').classList.add('seen');
    badgeDot.hidden = true;
  }
  sfx.tap();
}

tabbar.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

/* =========================================================
   BOARD RENDERING
   ========================================================= */

function buildBoardDOM(){
  boardEl.innerHTML = '';
  for (let r = 0; r < 9; r++){
    for (let c = 0; c < 9; c++){
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.tabIndex = 0;
      if (r === 2 || r === 5) cell.classList.add('row-thick-bottom');
      if (r === 3 || r === 6) cell.classList.add('row-thick-top');

      const notes = document.createElement('div');
      notes.className = 'notes';
      for (let n = 1; n <= 9; n++){
        const span = document.createElement('span');
        span.dataset.n = n;
        notes.appendChild(span);
      }
      cell.appendChild(notes);

      cell.addEventListener('click', () => selectCell(r, c));
      boardEl.appendChild(cell);
    }
  }
}

function cellEl(r, c){
  return boardEl.children[r * 9 + c];
}

function renderBoard(){
  for (let r = 0; r < 9; r++){
    for (let c = 0; c < 9; c++){
      const el = cellEl(r, c);
      const val = state.board[r][c];
      const isGiven = state.given[r][c];

      Array.from(el.childNodes).forEach(n => {
        if (!n.classList || !n.classList.contains('notes')) el.removeChild(n);
      });
      el.classList.remove('given','user-filled','error');

      const notesDiv = el.querySelector('.notes');

      if (val !== 0){
        notesDiv.style.display = 'none';
        const span = document.createElement('span');
        span.textContent = val;
        span.style.position = 'relative';
        span.style.zIndex = '1';
        el.appendChild(span);
        el.classList.add(isGiven ? 'given' : 'user-filled');
      } else {
        notesDiv.style.display = 'grid';
        const noteSet = state.notes[r][c];
        notesDiv.querySelectorAll('span').forEach(s => {
          const n = Number(s.dataset.n);
          s.textContent = noteSet.has(n) ? n : '';
          s.classList.toggle('on', noteSet.has(n));
        });
      }
    }
  }
  refreshHighlights();
  refreshNumpadState();
}

function refreshHighlights(){
  for (let r = 0; r < 9; r++){
    for (let c = 0; c < 9; c++){
      cellEl(r,c).classList.remove('selected','peer','same-value');
    }
  }
  if (!state.selected) return;
  const { r: sr, c: sc } = state.selected;
  const val = state.board[sr][sc];

  for (let r = 0; r < 9; r++){
    for (let c = 0; c < 9; c++){
      const sameRow = r === sr;
      const sameCol = c === sc;
      const sameBox = Math.floor(r/3) === Math.floor(sr/3) && Math.floor(c/3) === Math.floor(sc/3);
      if (sameRow || sameCol || sameBox) cellEl(r,c).classList.add('peer');
      if (profile.settings.highlight && val !== 0 && state.board[r][c] === val) cellEl(r,c).classList.add('same-value');
    }
  }
  cellEl(sr, sc).classList.remove('peer');
  cellEl(sr, sc).classList.add('selected');
}

function refreshNumpadState(){
  const counts = Array(10).fill(0);
  for (let r=0;r<9;r++) for (let c=0;c<9;c++){
    if (state.board[r][c] !== 0) counts[state.board[r][c]]++;
  }
  numpadEl.querySelectorAll('.num-tile').forEach(btn => {
    const n = Number(btn.dataset.num);
    btn.classList.toggle('complete', counts[n] >= 9);
  });
}

/* =========================================================
   SELECTION & INPUT
   ========================================================= */

function selectCell(r, c){
  if (state.over || state.won || state.paused) return;
  state.selected = { r, c };
  refreshHighlights();
}

function pushHistory(entry){
  state.history.push(entry);
  btnUndo.disabled = false;
}

function placeNumber(n){
  if (!state.selected || state.over || state.won || state.paused) return;
  const { r, c } = state.selected;
  if (state.given[r][c]) return;

  if (state.pencilMode){
    const set = state.notes[r][c];
    const wasOn = set.has(n);
    pushHistory({ type:'note', r, c, n, wasOn });
    if (wasOn) set.delete(n); else set.add(n);
    renderBoard();
    saveSnapshot();
    return;
  }

  if (state.board[r][c] === n) return;

  const prevVal = state.board[r][c];
  const prevNotes = new Set(state.notes[r][c]);
  const correct = state.solution[r][c] === n;

  state.board[r][c] = n;
  if (profile.settings.autoNotes){
    clearPeerNotes(r, c, n);
  }
  state.notes[r][c] = new Set();

  pushHistory({ type:'value', r, c, prevVal, prevNotes, newVal: n });

  if (correct){
    onCorrectEntry();
  } else {
    onWrongEntry(r, c);
  }

  renderBoard();
  checkWin();
  saveSnapshot();
}

function clearPeerNotes(r, c, n){
  for (let i = 0; i < 9; i++){
    state.notes[r][i].delete(n);
    state.notes[i][c].delete(n);
  }
  const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
  for (let i=0;i<3;i++) for (let j=0;j<3;j++) state.notes[br+i][bc+j].delete(n);
}

function onCorrectEntry(){
  state.streak++;
  const multiplier = 1 + Math.min(2, Math.floor(state.streak / 5) * 0.5);
  const gained = Math.round(10 * multiplier);
  state.score += gained;
  if (state.streak > profile.stats.longestStreak) profile.stats.longestStreak = state.streak;
  sfx.place();
  haptic(10);
  if (state.streak > 0 && state.streak % 5 === 0){
    sfx.streak();
    flashToast(`🔥 Runtutan ${state.streak}! Bonus poin naik`);
    haptic([10,20,10]);
  }
  updateStatsUI();
}

function onWrongEntry(r, c){
  state.streak = 0;
  state.score = Math.max(0, state.score - 5);
  state.mistakes++;
  sfx.error();
  haptic([30,20,30]);
  cellEl(r,c).classList.add('error');
  setTimeout(() => cellEl(r,c) && cellEl(r,c).classList.remove('error'), 320);
  updateStatsUI();

  const maxM = DIFFICULTY[state.difficulty].mistakes;
  if (state.mistakes >= maxM){
    endGameOver();
  }
}

function eraseSelected(){
  if (!state.selected || state.over || state.won || state.paused) return;
  const { r, c } = state.selected;
  if (state.given[r][c]) return;
  if (state.board[r][c] === 0 && state.notes[r][c].size === 0) return;

  pushHistory({
    type:'erase', r, c,
    prevVal: state.board[r][c],
    prevNotes: new Set(state.notes[r][c]),
  });
  state.board[r][c] = 0;
  state.notes[r][c] = new Set();
  renderBoard();
  saveSnapshot();
}

function undo(){
  const entry = state.history.pop();
  if (!entry) return;
  if (entry.type === 'value'){
    state.board[entry.r][entry.c] = entry.prevVal;
    state.notes[entry.r][entry.c] = entry.prevNotes;
  } else if (entry.type === 'erase'){
    state.board[entry.r][entry.c] = entry.prevVal;
    state.notes[entry.r][entry.c] = entry.prevNotes;
  } else if (entry.type === 'note'){
    const set = state.notes[entry.r][entry.c];
    if (entry.wasOn) set.add(entry.n); else set.delete(entry.n);
  } else if (entry.type === 'hint'){
    state.board[entry.r][entry.c] = 0;
    state.hintsUsed--;
    updateHintUI();
  }
  btnUndo.disabled = state.history.length === 0;
  renderBoard();
  saveSnapshot();
}

function useHint(){
  if (state.over || state.won || state.paused) return;
  const maxHints = DIFFICULTY[state.difficulty].hints;
  if (state.hintsUsed >= maxHints) return;

  let target = state.selected;
  if (!target || state.board[target.r][target.c] !== 0){
    target = null;
    outer:
    for (let r = 0; r < 9; r++){
      for (let c = 0; c < 9; c++){
        if (state.board[r][c] === 0){ target = { r, c }; break outer; }
      }
    }
  }
  if (!target) return;
  const { r, c } = target;
  if (state.board[r][c] !== 0) return;

  state.board[r][c] = state.solution[r][c];
  state.notes[r][c] = new Set();
  state.hintsUsed++;
  state.score = Math.max(0, state.score - 15);
  state.streak = 0;
  pushHistory({ type:'hint', r, c });
  sfx.hint();
  haptic(15);
  cellEl(r,c).classList.add('hinted');
  updateHintUI();
  updateStatsUI();
  renderBoard();
  checkWin();
  saveSnapshot();
}

function updateHintUI(){
  const maxHints = DIFFICULTY[state.difficulty].hints;
  const left = Math.max(0, maxHints - state.hintsUsed);
  hintCountEl.textContent = left;
  btnHint.disabled = left <= 0;
}

/* =========================================================
   WIN / GAME OVER
   ========================================================= */

function checkWin(){
  for (let r = 0; r < 9; r++){
    for (let c = 0; c < 9; c++){
      if (state.board[r][c] !== state.solution[r][c]) return;
    }
  }
  endWin();
}

function endWin(){
  state.won = true;
  stopTimer();
  sfx.win();
  haptic([20,40,20,40,80]);

  const cfg = DIFFICULTY[state.difficulty];
  const timeBonus = Math.max(0, cfg.parSeconds - state.seconds);
  const bonus = cfg.bonus + timeBonus;
  state.score += bonus;

  // ---- persist run into profile ----
  profile.stats.gamesPlayed++;
  profile.stats.gamesWon++;
  profile.stats.totalScore += state.score;

  const diffKey = state.difficulty === 'daily' ? 'medium' : state.difficulty;
  const rec = profile.stats.byDifficulty[diffKey] || (profile.stats.byDifficulty[diffKey] = { bestScore:0, bestTime:null, wins:0 });
  rec.wins++;
  if (state.score > rec.bestScore) rec.bestScore = state.score;
  if (rec.bestTime === null || state.seconds < rec.bestTime) rec.bestTime = state.seconds;

  let dailyBonusNote = '';
  if (state.isDaily){
    const today = todayKey();
    const last = profile.daily.lastDate;
    if (last === today){
      // already counted today somehow — no-op
    } else if (last && daysBetween(last, today) === 1){
      profile.daily.streak++;
    } else {
      profile.daily.streak = 1;
    }
    profile.daily.lastDate = today;
    profile.daily.completedCount++;
    dailyBonusNote = ` Streak harian: ${profile.daily.streak} 🔥`;
  }

  profile.saved = null; // clear resume snapshot — this game is finished
  persist();

  const xpAfter = grantXp(cfg.xp + Math.round(state.score / 20));

  updateBestUI();

  winTime.textContent = formatTime(state.seconds);
  winScore.textContent = state.score;
  winBonus.textContent = `+${bonus}`;
  winXp.textContent = `+${cfg.xp + Math.round(state.score / 20)}`;
  winNote.textContent = (state.hintsUsed > 0
    ? `Selesai dengan ${state.hintsUsed} bantuan.`
    : `Selesai tanpa bantuan sama sekali. Mantap!`) + dailyBonusNote;

  updateStatsUI();
  updateDailyCard();
  openModal(winModal);
  launchConfetti();

  evaluateWinAchievements({
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
    seconds: state.seconds,
    difficulty: state.difficulty === 'daily' ? 'daily' : state.difficulty,
    score: state.score,
  });

  profile.lastResult = {
    difficulty: DIFFICULTY[state.difficulty].label,
    score: state.score,
    time: formatTime(state.seconds),
    isDaily: state.isDaily,
  };
  persist();
}

function endGameOver(){
  state.over = true;
  stopTimer();
  profile.stats.gamesPlayed++;
  profile.saved = null;
  persist();
  openModal(overModal);
}

/* =========================================================
   TIMER
   ========================================================= */

function formatTime(s){
  const m = Math.floor(s / 60).toString().padStart(2,'0');
  const sec = Math.floor(s % 60).toString().padStart(2,'0');
  return `${m}:${sec}`;
}

function startTimer(){
  stopTimer();
  state.timerId = setInterval(() => {
    if (state.paused || state.over || state.won) return;
    state.seconds++;
    timerEl.textContent = formatTime(state.seconds);
    if (state.seconds % 15 === 0) saveSnapshot();
  }, 1000);
}
function stopTimer(){
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
}

/* =========================================================
   PAUSE / RESUME
   ========================================================= */

function togglePause(){
  if (state.over || state.won) return;
  state.paused = !state.paused;
  if (state.paused){
    overlayTitle.textContent = 'Jeda';
    overlaySub.textContent = 'Ketuk lanjutkan untuk main lagi';
    overlayEl.classList.add('show');
    saveSnapshot();
  } else {
    overlayEl.classList.remove('show');
  }
}

/* =========================================================
   STATS UI
   ========================================================= */

function updateStatsUI(){
  scoreEl.textContent = state.score;
  streakEl.textContent = state.streak;
  streakStatEl.classList.toggle('active', state.streak >= 3);
  mistakesEl.textContent = state.mistakes;
  const maxM = DIFFICULTY[state.difficulty].mistakes;
  maxMistakesEl.textContent = maxM === Infinity ? '∞' : maxM;
}

function updateBestUI(){
  const diffKey = state.difficulty === 'daily' ? 'medium' : state.difficulty;
  const rec = profile.stats.byDifficulty[diffKey];
  bestScoreEl.textContent = rec ? rec.bestScore : 0;
}

let toastTimeout = null;
function flashToast(msg){
  genToast.textContent = msg;
  genToast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => genToast.classList.remove('show'), 1800);
}

/* =========================================================
   MODALS
   ========================================================= */

function openModal(el){ el.classList.add('show'); }
function closeModal(el){ el.classList.remove('show'); }

/* =========================================================
   DAILY CHALLENGE
   ========================================================= */

function isDailyDoneToday(){
  return profile.daily.lastDate === todayKey();
}

function updateDailyCard(){
  const done = isDailyDoneToday();
  dailyCard.classList.toggle('done', done);
  dailyStreakEl.textContent = profile.daily.streak;
  dailyFlame.style.opacity = profile.daily.streak > 0 ? '1' : '0.45';
  dailyCta.textContent = done ? 'Selesai ✓' : 'Main';
  dailySub.innerHTML = done
    ? `Sudah main hari ini · Runtutan <span id="daily-streak">${profile.daily.streak}</span> hari`
    : `Runtutan <span id="daily-streak">${profile.daily.streak}</span> hari`;
}

dailyCard.addEventListener('click', () => {
  startGame('daily', true);
});

/* =========================================================
   SAVE / RESUME IN-PROGRESS GAME
   ========================================================= */

function saveSnapshot(){
  if (state.over || state.won || !state.board) return;
  profile.saved = {
    difficulty: state.difficulty,
    isDaily: state.isDaily,
    puzzle: state.puzzle,
    solution: state.solution,
    given: state.given,
    board: state.board,
    notes: state.notes.map(row => row.map(s => Array.from(s))),
    score: state.score,
    streak: state.streak,
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
    seconds: state.seconds,
    savedAt: Date.now(),
  };
  persist();
}

function restoreSnapshot(snap){
  state.difficulty = snap.difficulty;
  state.isDaily = !!snap.isDaily;
  state.puzzle = snap.puzzle;
  state.solution = snap.solution;
  state.given = snap.given;
  state.board = snap.board;
  state.notes = snap.notes.map(row => row.map(arr => new Set(arr)));
  state.selected = null;
  state.score = snap.score;
  state.streak = snap.streak;
  state.mistakes = snap.mistakes;
  state.hintsUsed = snap.hintsUsed;
  state.seconds = snap.seconds;
  state.history = [];
  state.paused = false;
  state.over = false;
  state.won = false;

  levelTabs.forEach(t => t.classList.toggle('active', t.dataset.level === state.difficulty));
  btnUndo.disabled = true;
  timerEl.textContent = formatTime(state.seconds);
  updateStatsUI();
  updateHintUI();
  updateBestUI();
  updateDailyCard();

  buildBoardDOM();
  renderBoard();
  startTimer();
}

/* =========================================================
   NEW GAME
   ========================================================= */

function startGame(difficulty, isDaily){
  closeModal(winModal);
  closeModal(overModal);
  overlayEl.classList.remove('show');

  if (isDaily && isDailyDoneToday()){
    flashToast('Tantangan harian sudah selesai — kembali besok! 🌙');
    return;
  }

  flashToast(isDaily ? 'Menyusun tantangan harian…' : 'Menyusun papan sudoku…');

  setTimeout(() => {
    const genKey = isDaily ? 'daily' : difficulty;
    const rng = isDaily ? makeRng(dailySeed()) : undefined;
    const { puzzle, solved } = generatePuzzle(isDaily ? 'daily' : difficulty, rng);

    state.difficulty = genKey;
    state.isDaily = !!isDaily;
    state.puzzle = puzzle;
    state.solution = solved;
    state.board = puzzle.map(row => row.slice());
    state.given = puzzle.map(row => row.map(v => v !== 0));
    state.notes = Array.from({length:9}, () => Array.from({length:9}, () => new Set()));
    state.selected = null;
    state.score = 0;
    state.streak = 0;
    state.mistakes = 0;
    state.hintsUsed = 0;
    state.seconds = 0;
    state.history = [];
    state.paused = false;
    state.over = false;
    state.won = false;

    levelTabs.forEach(t => t.classList.toggle('active', t.dataset.level === difficulty && !isDaily));

    btnUndo.disabled = true;
    timerEl.textContent = '00:00';
    updateStatsUI();
    updateHintUI();
    updateBestUI();
    updateDailyCard();

    buildBoardDOM();
    renderBoard();
    startTimer();
    saveSnapshot();

    setTimeout(() => genToast.classList.remove('show'), 250);
  }, 30);
}

function newGame(difficulty){ startGame(difficulty, false); }

/* =========================================================
   CONFETTI (lightweight canvas burst)
   ========================================================= */

function launchConfetti(){
  const canvas = document.getElementById('confetti-canvas');
  const wrap = canvas.parentElement;
  const rect = wrap.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext('2d');
  const colors = ['#ff6b4a','#2ec4b6','#ffb627','#f4f1ea'];

  const particles = Array.from({length: 70}, () => ({
    x: canvas.width / 2,
    y: 30,
    vx: (Math.random() - 0.5) * 8,
    vy: Math.random() * -6 - 2,
    size: Math.random() * 5 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    gravity: 0.22,
  }));

  let frame = 0;
  function tick(){
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      ctx.restore();
    });
    if (frame < 110){
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  tick();
}

/* =========================================================
   STATS VIEW RENDERING
   ========================================================= */

function renderStats(){
  const s = profile.stats;
  stPlayed.textContent = s.gamesPlayed;
  stWon.textContent = s.gamesWon;
  stWinrate.textContent = s.gamesPlayed ? `${Math.round((s.gamesWon / s.gamesPlayed) * 100)}%` : '0%';
  stScore.textContent = s.totalScore;
  stLongstreak.textContent = s.longestStreak;
  stDailystreak.textContent = profile.daily.streak;

  recordList.innerHTML = '';
  ['easy','medium','hard','zen'].forEach(key => {
    const rec = s.byDifficulty[key];
    const row = document.createElement('div');
    row.className = 'record-row';
    row.innerHTML = `
      <span class="record-name">${DIFFICULTY[key].label}</span>
      <span class="record-vals">
        <span>Menang: <b>${rec.wins}</b></span>
        <span>Skor: <b>${rec.bestScore}</b></span>
        <span>Waktu: <b>${rec.bestTime !== null ? formatTime(rec.bestTime) : '—'}</b></span>
      </span>
    `;
    recordList.appendChild(row);
  });
}

/* =========================================================
   SHARE
   ========================================================= */

async function shareResult(){
  const r = profile.lastResult;
  const text = r
    ? `Aku baru saja menyelesaikan Sudoku ${r.difficulty}${r.isDaily ? ' (Tantangan Harian)' : ''} dengan skor ${r.score} dalam ${r.time}! 🧩✨`
    : `Aku sedang main Sudoku Seru! Level ${levelFromXp(profile.xp).level}, sudah menang ${profile.stats.gamesWon}x. 🧩`;
  if (navigator.share){
    try{ await navigator.share({ title: 'Sudoku Seru', text }); return; }catch(e){ /* cancelled or unsupported */ }
  }
  try{
    await navigator.clipboard.writeText(text);
    flashToast('Disalin ke clipboard! 📋');
  }catch(e){
    flashToast(text);
  }
}

/* =========================================================
   SETTINGS WIRING
   ========================================================= */

function initSettingsUI(){
  setSound.checked = profile.settings.sound;
  setHaptics.checked = profile.settings.haptics;
  setHighlight.checked = profile.settings.highlight;
  setAutonotes.checked = profile.settings.autoNotes;
  applyTheme(profile.settings.theme);
  soundToggleBtn.textContent = profile.settings.sound ? '🔊' : '🔇';
}

setSound.addEventListener('change', () => {
  profile.settings.sound = setSound.checked;
  soundToggleBtn.textContent = profile.settings.sound ? '🔊' : '🔇';
  persist();
});
setHaptics.addEventListener('change', () => { profile.settings.haptics = setHaptics.checked; persist(); if (setHaptics.checked) haptic(10); });
setHighlight.addEventListener('change', () => { profile.settings.highlight = setHighlight.checked; persist(); refreshHighlights(); });
setAutonotes.addEventListener('change', () => { profile.settings.autoNotes = setAutonotes.checked; persist(); });

btnShareApp.addEventListener('click', shareResult);
winShare.addEventListener('click', shareResult);

btnResetProgress.addEventListener('click', () => {
  if (!confirm('Reset semua progres (level, statistik, lencana)? Tindakan ini tidak bisa dibatalkan.')) return;
  const keepTheme = profile.settings.theme;
  profile = defaultProfile();
  profile.settings.theme = keepTheme;
  persist();
  updateXpUI();
  renderAchievements();
  updateDailyCard();
  flashToast('Progres direset.');
});

/* =========================================================
   EVENT WIRING
   ========================================================= */

numpadEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.num-tile');
  if (!btn) return;
  placeNumber(Number(btn.dataset.num));
});

btnUndo.addEventListener('click', undo);
btnErase.addEventListener('click', eraseSelected);
btnHint.addEventListener('click', useHint);
btnPause.addEventListener('click', togglePause);
overlayResumeBtn.addEventListener('click', togglePause);

btnPencil.addEventListener('click', () => {
  state.pencilMode = !state.pencilMode;
  btnPencil.classList.toggle('on', state.pencilMode);
  sfx.tap();
});

btnNewGame.addEventListener('click', () => newGame(state.isDaily ? 'easy' : state.difficulty));

levelTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    levelTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    newGame(tab.dataset.level);
  });
});

soundToggleBtn.addEventListener('click', () => {
  profile.settings.sound = !profile.settings.sound;
  setSound.checked = profile.settings.sound;
  soundToggleBtn.textContent = profile.settings.sound ? '🔊' : '🔇';
  persist();
});

winClose.addEventListener('click', () => closeModal(winModal));
winNext.addEventListener('click', () => newGame(state.isDaily ? 'easy' : state.difficulty));
overClose.addEventListener('click', () => closeModal(overModal));
overRetry.addEventListener('click', () => newGame(state.isDaily ? 'easy' : state.difficulty));

document.addEventListener('keydown', (e) => {
  if (winModal.classList.contains('show') || overModal.classList.contains('show')) return;
  if (document.querySelector('.view[data-view="home"]').hidden) return;

  if (/^[1-9]$/.test(e.key)){
    placeNumber(Number(e.key));
    return;
  }
  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0'){
    eraseSelected();
    return;
  }
  if (e.key.toLowerCase() === 'p'){
    btnPencil.click();
    return;
  }
  if (!state.selected) return;
  let { r, c } = state.selected;
  if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
  else if (e.key === 'ArrowDown') r = Math.min(8, r + 1);
  else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
  else if (e.key === 'ArrowRight') c = Math.min(8, c + 1);
  else return;
  e.preventDefault();
  selectCell(r, c);
});

// Persist an in-flight game if the user leaves the app.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveSnapshot();
});
window.addEventListener('beforeunload', saveSnapshot);

/* =========================================================
   INIT
   ========================================================= */

buildThemeRow();
initSettingsUI();
updateXpUI();
renderAchievements();
updateDailyCard();

if (profile.saved && profile.saved.board){
  restoreSnapshot(profile.saved);
  flashToast('Melanjutkan permainan tersimpan…');
} else {
  newGame('easy');
}

if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
