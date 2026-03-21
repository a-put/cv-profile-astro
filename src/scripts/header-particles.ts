// ── Header particle field ──────────────────────────────────────
// Self-contained module — runs on import.
// Extracted from main.js initHeaderParticles().

(function initHeaderParticles() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('header-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d')!;
  const header = canvas.closest('header')!;

  const BASE_COUNT = 340;
  const initW = window.innerWidth;
  const COUNT = Math.round(BASE_COUNT * (initW <= 480 ? 0.5 : initW <= 768 ? 0.7 : 1.0));
  const REPEL_RADIUS = 90;
  const REPEL_STR = 4;
  const SPRING = 0.06;
  const DAMPING = 0.82;
  const DOT_R = 1.5;
  const CONNECT_RADIUS = 70;
  const CONNECT_ALPHA = 0.18;
  const MARGIN = 0.20; // fraction of canvas to extend grid beyond edges
  const DRIFT_AMP = 20;
  const DRIFT_SPEED = 0.0006;
  const RIPPLE_MAX_R = 400;
  const RIPPLE_STR = 7;
  const DOT_REPEL_R = 18;
  const DOT_REPEL_STR = 0.25;
  const HEARTBEAT = false; // set to false to disable the wandering heartbeat ripple
  const CAT = false;  // set to false to disable the wandering pixel cat
  const JELLYFISH = false;  // set to false to disable the floating pixel jellyfish
  const JF_SCALE = 3;     // pixel size for jellyfish
  const CR2 = CONNECT_RADIUS * CONNECT_RADIUS;
  const DR2 = DOT_REPEL_R * DOT_REPEL_R;

  const BUCKETS = 5;
  const buckets: any[] = Array.from({ length: BUCKETS }, () => []);
  const DB = 10; // dark mode blend buckets
  const darkBuckets: any[] = Array.from({ length: DB }, () => []);
  const spatialHash = new Map(); // reused each frame — cleared, not recreated
  let dotWf: any = [], dotRf: any = [], dotBr: any = []; // per-dot scratch: wake, ripple, breathe (dotsByDepth order)
  let dotWake: any = [];  // per-dot wake factor in dots[] order (for connection brightening)
  const TURB_DECAY = 0.93;
  const TURB_SCALE = 0.04;
  const TURB_MAX = 3.0;
  const GRAVITY_STR = 10;   // max vertical home-offset (px) at full scroll
  const TILT_AMP = 30;   // max px offset for near dots (depth=1) at full tilt
  const WAKE_DURATION = 1000; // ms a dot stays "hot" after cursor contact
  const ATTRACT_STR = 3;    // peak attraction force toward cursor
  const ATTRACT_R = REPEL_RADIUS * 2.2; // attraction radius (wider than repulsion)
  const EXPLODE_STR = 10;   // outward burst velocity on release
  const BEAT_INTERVAL = 2500; // ms between heartbeat ripples (30 bpm)
  const PULSE_WANDER_SPEED = 0.00025; // how fast the heartbeat origin drifts
  const BREATHE_RADIUS = REPEL_RADIUS * 1.4; // zone around cursor where dots pulse
  const BREATHE_AMP = 0.6;   // max radius scale boost (0.6 = +60% at peak)
  const BREATHE_SPEED = 3.5;  // sine frequency (rad/s) for breathing cycle
  // ── Idle constellation (abstract — MST of nearby dots) ─────
  const CONSTELLATION = true;    // set to false to disable idle constellation
  const CONSTEL_IDLE = 3000;     // ms before constellation forms
  const CONSTEL_RAMP = 1500;     // ms to fully blend into constellation positions
  const CONSTEL_PICK_MIN = 6;    // min dots to recruit
  const CONSTEL_PICK_MAX = 10;   // max dots to recruit
  const CONSTEL_SEARCH_R = 140;  // px — radius to search for candidate dots (from cursor)
  const CONSTEL_BONUS_EDGES = 2; // extra edges beyond the MST (creates triangles)
  const CONSTEL_TIGHTEN = 0.18;  // fraction to pull dots toward group centroid
  const CONSTEL_RECRUIT_INTERVAL = 120; // ms between each star activation
  const CONSTEL_ROTATE_SPEED = 0.08;    // radians per second once fully formed
  const CONSTEL_GRAVITY_R = 160;        // lensing pull radius
  const CONSTEL_GRAVITY_STR = 0.08;     // fraction of spring strength for inward pull

  // Compute MST of a set of points using Prim's algorithm
  // points: [{x, y, idx}] — returns edge list [[i, j], ...]
  function computeMST(points: any[]) {
    const n = points.length;
    if (n < 2) return [];
    const inTree = new Uint8Array(n);
    const minCost = new Float32Array(n).fill(Infinity);
    const minFrom = new Int32Array(n).fill(-1);
    const edges: any[] = [];
    inTree[0] = 1;
    for (let j = 1; j < n; j++) {
      const dx = points[j].x - points[0].x, dy = points[j].y - points[0].y;
      minCost[j] = dx * dx + dy * dy;
      minFrom[j] = 0;
    }
    for (let added = 1; added < n; added++) {
      let best = -1, bestCost = Infinity;
      for (let j = 0; j < n; j++) {
        if (!inTree[j] && minCost[j] < bestCost) { bestCost = minCost[j]; best = j; }
      }
      if (best < 0) break;
      inTree[best] = 1;
      edges.push([minFrom[best], best]);
      for (let j = 0; j < n; j++) {
        if (inTree[j]) continue;
        const dx = points[j].x - points[best].x, dy = points[j].y - points[best].y;
        const c = dx * dx + dy * dy;
        if (c < minCost[j]) { minCost[j] = c; minFrom[j] = best; }
      }
    }
    return edges;
  }

  let dots: any[] = [], dotsByDepth: any[] = [], mouse = { x: -9999, y: -9999 },
    prevMouse = { x: -9999, y: -9999 }, turbulence = 0, ripples: any[] = [], t = 0,
    scrollProgress = 0, tiltX = 0, tiltY = 0,
    canvasRect = { left: 0, top: 0 },
    attracting = false, longPressTimer: any = null,
    lastBeat = 0, pulseT = 0, frameCount = 0;

  // Constellation state
  let idleSince = 0, idleMx = -9999, idleMy = -9999;
  let constelDots: any = null;    // [dotIndex, ...] — indices into dots[] for recruited dots
  let constelEdges: any = null;   // [[localI, localJ], ...] — MST + bonus edges (local indices into constelDots)
  let constelOrder: any = null;   // BFS activation order (local indices)
  let constelWasActive = false;
  let constelCx = 0, constelCy = 0;
  let constelOffsets: any = null; // [{ox, oy}] per recruited dot (for rotation)
  let constelActivated: any = null; // [bool, ...] per recruited dot
  let constelActivatedAt: any = null; // [timestamp, ...] per recruited dot
  let constelAllActive = false;
  let constelMaxEdgeLen = 1; // max edge length for opacity scaling
  const CONSTEL_GHOST_DURATION = 2500;
  const constelMap = new Map();

  // ── Pixel cat ────────────────────────────────────────────────
  // All sprites face right (head right, tail left).
  // drawCat mirrors rows horizontally when cat faces left.
  const CAT_SCALE = 4;

  // Shared body rows 0–9; walk frames append 2 leg rows (total 12 rows)
  // Pixel key: # = body  h = highlight  s = shadow  e = eye  t = tail (animated)
  // All sprites: 18 cols wide × 12 rows tall.  Cat faces right (head right, tail left).
  const _CB = [
    "..............#h..",   // r0:  ear tip (outer #, inner h)
    "...........#######",   // r1:  ear base + head sweep
    "...........#######",   // r2:  head crown
    "...........##e####",   // r3:  face — eye at col 13
    "...........#######",   // r4:  muzzle
    ".........#########",   // r5:  neck → body widens
    "ttt.##############",   // r6:  tail + body
    "ttt.#############s",   // r7:  tail + body + shadow
    "ttt.############ss",   // r8:  tail + belly shadow
    ".tt.###########s..",   // r9:  tail tip + lower body
  ];
  const CAT_SPRITES: any = {
    walk_1: [..._CB, "...#####.....#####", "....###.......####"],  // stride A
    walk_2: [..._CB, ".....###.....####.", ".....###.....####."],  // mid-stride
    walk_3: [..._CB, ".....######...####", ".....#####....###."],  // stride B
    walk_4: [..._CB, ".....###.....####.", ".....###.....####."],  // mid-stride
    sit: [
      "..............#h..",   // r0:  ear tip
      "...........#######",   // r1:  ear base
      "...........#######",   // r2:  head crown
      "...........##e####",   // r3:  face, eye open
      "...........#######",   // r4:  muzzle
      ".........#########",   // r5:  neck
      "..........########",   // r6:  upper sitting body (no tail yet)
      "..........########",   // r7:  body
      "tt......##########",   // r8:  tail wraps in front + lower body
      "ttt.....##########",   // r9:  tail + base
      ".....#############",   // r10: paws
      ".....#############",   // r11: paw row
    ],
    sit_blink: [
      "..............#h..",
      "...........#######",
      "...........#######",
      "...........#######",   // r3:  eye closed (e → #)
      "...........#######",
      ".........#########",
      "..........########",
      "..........########",
      "tt......##########",
      "ttt.....##########",
      ".....#############",
      ".....#############",
    ],
    sleep: [
      "..................",   // r0:  empty
      "....########......",   // r1:  top of curled body
      "...##hhhhhh##.....",   // r2:  highlight arc along back
      "..##############..",   // r3:  full body width
      "..#########sss....",   // r4:  body + underside shadow
      "...#########sss...",   // r5:  narrowing + shadow
      "....########ss....",   // r6:  lower body + belly shadow
      ".....#######s.....",   // r7:  tail curl
      "......#####.......",   // r8:  tightest curl
      "..................",   // r9:  empty
      "..................",   // r10: empty
      "..................",   // r11: empty
    ],
    peek: [
      "..................",   // r0:  empty — head low and forward
      "..............##h.",   // r1:  crown/ear just peeking
      "..............####",   // r2:  head bulk at right edge
      ".............##e##",   // r3:  face with eye
      ".............#####",   // r4:  muzzle
      "tttt.#############",   // r5:  tail + crouched body
      "tttt.#############",   // r6:  tail + body
      "tttt.############s",   // r7:  tail + shadow
      ".ttt.###########ss",   // r8:  tail + belly shadow
      ".....#############",   // r9:  lower body
      ".....#############",   // r10: paws
      ".....#############",   // r11: paws flat
    ],
    groom: [
      "..............#h..",   // r0:  ear
      "...........#######",   // r1:  ear base
      "...........#######",   // r2:  head
      "...........##e####",   // r3:  face with eye
      "..........####h###",   // r4:  muzzle + raised paw highlight
      ".........#########",   // r5:  neck + paw
      "..........########",   // r6:  body
      "..........########",   // r7:  body
      "tt......##########",   // r8:  tail + body
      "ttt.....##########",   // r9:  tail + lower body
      ".....#############",   // r10: paws
      ".....#############",   // r11: paws
    ],
    stretch: [
      "..............#h..",   // r0:  ear
      "..............####",   // r1:  head forward and low
      ".......hhhhhhhhhh.",   // r2:  highlight on arched back
      "......####hhhhhhhh",   // r3:  body arch with highlight
      ".....#############",   // r4:  body slopes forward
      "....##############",   // r5:  full stretch
      "...#############..",   // r6:  narrowing toward front
      "...##########.....",   // r7:  more narrowing
      "...######....####.",   // r8:  front paws + back paws
      "...#####......###.",   // r9:  paw tips
      "..................",   // r10: empty
      "..................",   // r11: empty
    ],
    yawn: [
      "..............#h..",   // r0:  ear
      "...........#######",   // r1:  ear base
      "...........#######",   // r2:  head
      "...........##e..##",   // r3:  face: eye + open-mouth gap (2 dots)
      "...........#######",   // r4:  lower face / chin
      ".........#########",   // r5:  neck
      "..........########",   // r6:  body
      "..........########",   // r7:  body
      "tt......##########",   // r8:  tail + body
      "ttt.....##########",   // r9:  tail + lower body
      ".....#############",   // r10: paws
      ".....#############",   // r11: paws
    ],
  };
  let catSpriteCache: any = {}, catSpriteTheme: any = null;
  let cat: any = null;

  // ── Pixel jellyfish ──────────────────────────────────────────
  // Bell: 2 frames (expanded ↔ contracted) — 11 wide × 6 tall
  const JF_BELL = [
    [   // frame 0: expanded (wide, flat dome)
      "...#####...",
      ".#########.",
      "###########",
      "###########",
      ".#########.",
      "...#####...",
    ],
    [   // frame 1: contracted (narrow, tall dome)
      "....###....",
      "...#####...",
      "..#######..",
      ".#########.",
      "..#######..",
      "...#####...",
    ],
  ];
  // Tentacle attachment columns, sway phases, and lengths (outer = longer)
  const JF_TENT = [
    { col: 2, ph: 0.0, len: 13 },
    { col: 4, ph: 1.3, len: 10 },
    { col: 6, ph: 2.6, len: 10 },
    { col: 8, ph: 3.9, len: 13 },
  ];
  const JF_MAX_TENT = 13; // longest tentacle (for boundary calc)
  let jf: any = null, jf2: any = null;

  // Cache scroll progress and canvas rect — avoid reflow inside rAF
  function updateScroll() {
    const scrollMax = document.body.scrollHeight - window.innerHeight;
    scrollProgress = scrollMax > 0 ? window.scrollY / scrollMax : 0;
    updateRect();
  }
  window.addEventListener('scroll', updateScroll, { passive: true });
  window.addEventListener('resize', updateScroll, { passive: true });
  updateScroll();

  // Pseudo-noise from superimposed sines — no library needed
  function noise(x: number, y: number) {
    return (Math.sin(x * 1.4 + y * 0.8) +
      Math.sin(x * 0.6 - y * 1.3) +
      Math.sin((x - y) * 1.1)) / 3;
  }

  function getColor() {
    const hasBg = header.classList.contains('has-bg-image');
    const isDark = document.documentElement.dataset.theme === 'dark';
    if (hasBg) return [255, 255, 255];
    if (isDark) return [174, 174, 178];
    return [90, 110, 135]; // faint accent-blue tint in light mode
  }

  function buildDots() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    const mx = w * MARGIN, my = h * MARGIN;
    const W2 = w + 2 * mx, H2 = h + 2 * my;
    const total = Math.round(COUNT * (W2 * H2) / (w * h));
    dots = [];
    const cols = Math.ceil(Math.sqrt(total * (W2 / H2)));
    const rows = Math.ceil(total / cols);
    const cw = W2 / cols, ch = H2 / rows;
    for (let r = 0; r < rows && dots.length < total; r++) {
      for (let c = 0; c < cols && dots.length < total; c++) {
        const hx = -mx + (c + 0.2 + Math.random() * 0.6) * cw;
        const hy = -my + (r + 0.2 + Math.random() * 0.6) * ch;
        const depth = Math.random();
        const phase = Math.random() * Math.PI * 2; // per-dot hue cycle offset
        dots.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0, depth, phase, lastDisplaced: 0, angle: 0, ghostUntil: 0 });
      }
    }
    dotsByDepth = dots.slice().sort((a: any, b: any) => a.depth - b.depth);
  }

  function buildCatSprites() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    catSpriteTheme = isDark ? 'dark' : 'light';
    const PAD = 1; // 1 canvas-px outline on all sides
    const palette: any = isDark ? {
      'h': '#e5e5ea', '#': '#c7c7cc', 's': '#8e8e93', 'e': '#1c1c1e',
    } : {
      'h': '#6e6e73', '#': '#3a3a3c', 's': '#1c1c1e', 'e': '#f5f5f7',
    };
    const outlineColor = isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.22)';

    catSpriteCache = {};
    for (const [key, sprite] of Object.entries(CAT_SPRITES)) {
      for (const dir of [1, -1]) {
        const rows = (sprite as string[]).length, cols = (sprite as string[])[0].length;
        const oc = new OffscreenCanvas(cols * CAT_SCALE + PAD * 2, rows * CAT_SCALE + PAD * 2);
        const octx = oc.getContext('2d')!;

        // Pass 1: outline — draw each lit pixel slightly expanded (skip 't' — tail drawn per-frame)
        octx.fillStyle = outlineColor;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const ch = dir === 1 ? (sprite as string[])[r][c] : (sprite as string[])[r][cols - 1 - c];
            if (ch !== '.' && ch !== 't') {
              octx.fillRect(PAD + c * CAT_SCALE - 1, PAD + r * CAT_SCALE - 1, CAT_SCALE + 2, CAT_SCALE + 2);
            }
          }
        }
        // Pass 2: colored pixels — 't' transparent, 'e' rendered as vertical slit pupil
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const ch = dir === 1 ? (sprite as string[])[r][c] : (sprite as string[])[r][cols - 1 - c];
            if (ch === 'e') {
              octx.fillStyle = palette['e'];
              octx.fillRect(PAD + c * CAT_SCALE + Math.floor(CAT_SCALE / 2), PAD + r * CAT_SCALE, 1, CAT_SCALE);
            } else {
              const color = palette[ch];
              if (color) {
                octx.fillStyle = color;
                octx.fillRect(PAD + c * CAT_SCALE, PAD + r * CAT_SCALE, CAT_SCALE, CAT_SCALE);
              }
            }
          }
        }
        catSpriteCache[`${key}_${dir}`] = oc;
      }
    }
  }

  function catCircadian() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    return {
      walkSpeed: isDark ? 0.42 : 0.72,
      walkProb: isDark ? 0.0006 : 0.002,
      sitMin: isDark ? 200 : 80,
      sitRange: isDark ? 280 : 100,
      sleepMin: isDark ? 400 : 120,
      sleepRange: isDark ? 400 : 150,
      startleSpeed: isDark ? 1.8 : 2.5,
      watchDist: isDark ? 90 : 150,
      zoomieProb: isDark ? 0.00015 : 0,
    };
  }

  function initCat(W: number) {
    if (!CAT) { cat = null; return; }
    buildCatSprites();
    cat = {
      x: W * 0.25,
      dir: 1,             // 1 = right, -1 = left
      state: 'walk',      // 'walk'|'idle'|'turn'|'sit'|'sleep'|'watch'|'startle'|'peek'|'backup'|'groom'|'stretch'|'yawn'|'zoomie'
      frame: 0,
      walkFrame: 1,       // 1–4 cycling walk sprite
      walkTick: 0,
      stateTimer: 0,
      speed: 0,
      targetSpeed: catCircadian().walkSpeed,
      blinkTimer: 80 + Math.floor(Math.random() * 120),
      blinking: false,
      blinkFrames: 0,
    };
  }

  function tickCat(W: number, H: number) {
    if (!CAT || !cat) return;
    cat.frame++;

    const circ = catCircadian();
    const spriteW = CAT_SPRITES.walk_1[0].length * CAT_SCALE;
    const spriteH = CAT_SPRITES.walk_1.length * CAT_SCALE;
    const cx = cat.x + spriteW / 2;
    const cy = H - spriteH / 2;

    // ── Walk animation — speed-coupled frame rate ──────────────
    if (cat.state === 'walk' || cat.state === 'startle' || cat.state === 'backup' || cat.state === 'zoomie') {
      const period = Math.max(4, Math.round(7 / Math.max(0.15, cat.speed)));
      if (++cat.walkTick >= period) {
        cat.walkTick = 0;
        cat.walkFrame = (cat.walkFrame % 4) + 1;
      }
    }

    // ── Blink ──────────────────────────────────────────────────
    const canBlink = cat.state === 'sit' || cat.state === 'idle' || cat.state === 'watch' || cat.state === 'peek';
    if (canBlink) {
      if (--cat.blinkTimer <= 0 && !cat.blinking) {
        cat.blinking = true;
        cat.blinkFrames = 4;
        cat.blinkTimer = 100 + Math.floor(Math.random() * 150);
      }
      if (cat.blinking && --cat.blinkFrames <= 0) cat.blinking = false;
    } else {
      cat.blinking = false;
    }

    // ── Ripple startle ─────────────────────────────────────────
    if (cat.state !== 'startle' && cat.state !== 'sleep' && cat.state !== 'zoomie') {
      for (const rip of ripples) {
        if (rip.r < 5) continue;
        const ring = Math.abs(Math.hypot(cx - rip.x, cy - rip.y) - rip.r);
        if (ring < 28) {
          cat.state = 'startle';
          cat.stateTimer = 75;
          cat.dir = cx > rip.x ? 1 : -1;
          cat.targetSpeed = circ.startleSpeed;
          break;
        }
      }
    }

    // ── State timer & transitions ──────────────────────────────
    if (cat.stateTimer > 0) {
      cat.stateTimer--;
      if (cat.stateTimer === 0) {
        if (cat.state === 'startle') {
          cat.state = 'walk'; cat.targetSpeed = circ.walkSpeed;
        } else if (cat.state === 'turn') {
          cat.dir *= -1; cat.state = 'walk'; cat.targetSpeed = circ.walkSpeed;
        } else if (cat.state === 'sit') {
          const r = Math.random();
          if (r < 0.25) {
            // Grooming ritual → leads to sleep
            cat.state = 'groom'; cat.stateTimer = 50 + Math.floor(Math.random() * 25);
          } else if (r < 0.40) {
            cat.state = 'sleep';
            cat.stateTimer = circ.sleepMin + Math.floor(Math.random() * circ.sleepRange);
          } else {
            cat.state = 'turn'; cat.stateTimer = 15; cat.targetSpeed = 0;
          }
        } else if (cat.state === 'groom') {
          cat.state = 'stretch'; cat.stateTimer = 40 + Math.floor(Math.random() * 20);
        } else if (cat.state === 'stretch') {
          cat.state = 'yawn'; cat.stateTimer = 35 + Math.floor(Math.random() * 25);
        } else if (cat.state === 'yawn') {
          cat.state = 'sleep';
          cat.stateTimer = circ.sleepMin + Math.floor(Math.random() * circ.sleepRange);
        } else if (cat.state === 'zoomie') {
          cat.state = 'walk'; cat.targetSpeed = circ.walkSpeed;
        } else if (cat.state === 'sleep') {
          cat.state = 'turn'; cat.stateTimer = 20; cat.targetSpeed = 0;
        } else if (cat.state === 'peek') {
          if (Math.random() < 0.55) {
            // Back up carefully from the edge while still facing it
            cat.state = 'backup'; cat.stateTimer = 40; cat.targetSpeed = 0.4;
          } else {
            cat.state = 'turn'; cat.stateTimer = 14; cat.targetSpeed = 0;
          }
        } else if (cat.state === 'backup') {
          cat.state = 'turn'; cat.stateTimer = 12; cat.targetSpeed = 0;
        } else {
          cat.state = 'walk'; cat.targetSpeed = circ.walkSpeed;
        }
      }
    }

    // ── Cursor awareness ───────────────────────────────────────
    if (cat.state === 'walk' && mouse.x > -9000 && Math.abs(mouse.x - cx) < circ.watchDist) {
      cat.state = 'watch';
      cat.stateTimer = 55 + Math.floor(Math.random() * 80);
      cat.targetSpeed = 0;
      cat.dir = mouse.x > cx ? 1 : -1;
    }
    if (cat.state === 'watch' && mouse.x > -9000) {
      cat.dir = mouse.x > cx ? 1 : -1;
    }

    // ── Speed easing ───────────────────────────────────────────
    cat.speed += (cat.targetSpeed - cat.speed) * 0.08;

    // ── Movement ───────────────────────────────────────────────
    if (cat.state === 'walk' || cat.state === 'startle' || cat.state === 'zoomie') {
      cat.x += cat.dir * cat.speed;
      // Peek zone: approaching edge — slow to stop and peer over
      if (cat.state === 'walk') {
        if (cat.x < 22 && cat.dir === -1) {
          cat.state = 'peek'; cat.stateTimer = 80 + Math.floor(Math.random() * 100); cat.targetSpeed = 0;
        } else if (cat.x + spriteW > W - 22 && cat.dir === 1) {
          cat.state = 'peek'; cat.stateTimer = 80 + Math.floor(Math.random() * 100); cat.targetSpeed = 0;
        }
      }
      if (cat.x < 10) {
        cat.x = 10;
        if (cat.state === 'walk') { cat.state = 'turn'; cat.stateTimer = 12; cat.targetSpeed = 0; }
        else if (cat.state !== 'peek') cat.dir = 1;   // zoomie/startle: hard bounce
      }
      if (cat.x + spriteW > W - 10) {
        cat.x = W - 10 - spriteW;
        if (cat.state === 'walk') { cat.state = 'turn'; cat.stateTimer = 12; cat.targetSpeed = 0; }
        else if (cat.state !== 'peek') cat.dir = -1;  // zoomie/startle: hard bounce
      }
      if (cat.state === 'walk' && Math.random() < circ.walkProb) {
        cat.state = Math.random() < 0.5 ? 'sit' : 'idle';
        cat.stateTimer = cat.state === 'sit'
          ? circ.sitMin + Math.floor(Math.random() * circ.sitRange)
          : 40 + Math.floor(Math.random() * 80);
        cat.targetSpeed = 0;
      }
    }
    // Midnight zoomies — dark mode only, random spark while walking or sitting
    if ((cat.state === 'walk' || cat.state === 'sit') && Math.random() < circ.zoomieProb) {
      cat.state = 'zoomie';
      cat.stateTimer = 110 + Math.floor(Math.random() * 30);
      cat.targetSpeed = 4.5;
    }
    // Backup: retreat from edge while still facing it
    if (cat.state === 'backup') {
      cat.x -= cat.dir * cat.speed;
    }
  }

  function drawCat(ctx: CanvasRenderingContext2D, H: number) {
    if (!CAT || !cat) return;

    // Rebuild cache on theme change (cheap string compare per frame)
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    if (catSpriteTheme !== theme) buildCatSprites();

    let spriteKey: string;
    if (cat.state === 'sleep') {
      spriteKey = 'sleep';
    } else if (cat.state === 'walk' || cat.state === 'startle' || cat.state === 'backup' || cat.state === 'zoomie') {
      spriteKey = 'walk_' + cat.walkFrame;
    } else if (cat.state === 'peek') {
      spriteKey = cat.blinking ? 'sit_blink' : 'peek';
    } else if (cat.state === 'groom') {
      spriteKey = 'groom';
    } else if (cat.state === 'stretch') {
      spriteKey = 'stretch';
    } else if (cat.state === 'yawn') {
      spriteKey = 'yawn';
    } else {
      spriteKey = cat.blinking ? 'sit_blink' : 'sit';
    }

    const PAD = 1;
    const rows = CAT_SPRITES[spriteKey].length;
    const baseY = H - rows * CAT_SCALE - 1;
    const bob = (cat.state === 'walk' || cat.state === 'startle' || cat.state === 'backup' || cat.state === 'zoomie') &&
      (cat.walkFrame === 1 || cat.walkFrame === 3) ? 1 : 0;

    if (cat.state === 'sleep') {
      ctx.globalAlpha = 0.65 + 0.35 * (Math.sin(cat.frame * 0.025) * 0.5 + 0.5);
    }

    // Soft amber glow in dark mode — one blur pass on the pre-rendered image
    if (theme === 'dark') {
      ctx.shadowColor = 'rgba(255, 185, 90, 0.6)';
      ctx.shadowBlur = 12;
    }

    ctx.drawImage(catSpriteCache[`${spriteKey}_${cat.dir}`], Math.round(cat.x) - PAD, baseY + bob - PAD);

    ctx.shadowBlur = 0;

    // Animated tail — sine wave sway, drawn per-frame without glow
    if (cat.state !== 'sleep') {
      const isActive = cat.state === 'walk' || cat.state === 'zoomie' || cat.state === 'startle';
      const tailPhase = cat.frame * (isActive ? 0.06 : 0.03);
      const tailAmp = isActive ? 1.5 : 2.5;
      const tailYOff = Math.round(Math.sin(tailPhase) * tailAmp);
      ctx.fillStyle = theme === 'dark' ? '#8e8e93' : '#1c1c1e';
      const tSpr = CAT_SPRITES[spriteKey];
      const tRows = tSpr.length, tCols = tSpr[0].length;
      for (let r = 0; r < tRows; r++) {
        for (let c = 0; c < tCols; c++) {
          if ((cat.dir === 1 ? tSpr[r][c] : tSpr[r][tCols - 1 - c]) === 't') {
            ctx.fillRect(Math.round(cat.x) + c * CAT_SCALE, baseY + bob + r * CAT_SCALE + tailYOff, CAT_SCALE, CAT_SCALE);
          }
        }
      }
    }

    // Whiskers — thin lines from snout (skip sleep and stretch where head is in different position)
    if (cat.state !== 'sleep' && cat.state !== 'stretch') {
      const faceY = baseY + bob + Math.round(3.2 * CAT_SCALE);
      const snoutX = cat.dir === 1 ? Math.round(cat.x) + 18 * CAT_SCALE : Math.round(cat.x);
      const wLen = CAT_SCALE * 3;
      ctx.save();
      ctx.strokeStyle = theme === 'dark' ? 'rgba(229,229,234,0.6)' : 'rgba(58,58,60,0.4)';
      ctx.lineWidth = 0.75;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(snoutX, faceY - CAT_SCALE * 0.6);
      ctx.lineTo(snoutX + cat.dir * wLen, faceY - CAT_SCALE * 1.4);  // upper
      ctx.moveTo(snoutX, faceY);
      ctx.lineTo(snoutX + cat.dir * (wLen + 2), faceY);                    // middle
      ctx.moveTo(snoutX, faceY + CAT_SCALE * 0.5);
      ctx.lineTo(snoutX + cat.dir * wLen, faceY + CAT_SCALE * 1.2);  // lower
      ctx.stroke();
      ctx.restore();
    }

    if (cat.state === 'sleep') ctx.globalAlpha = 1;
  }

  function makeJF(x: number, y: number, vx: number, scale: number, baseAlpha: number, phaseOffset: number, bellTickOffset: number) {
    return {
      x, y, vx, vy: 0,
      phase: phaseOffset,
      bellTick: bellTickOffset,
      bellFrame: 0,
      glowFlash: 0,
      startleCooldown: 0,
      scale,
      baseAlpha,
      trail: [] as any[],
      trailTick: 0,
    };
  }

  function initJF(W: number, H: number) {
    if (!JELLYFISH) { jf = null; jf2 = null; return; }
    jf = makeJF(W * 0.62, H * 0.22, 0.06, 3, 1.0, 0, 0);  // near
    jf2 = makeJF(W * 0.32, H * 0.30, -0.04, 2, 0.5, Math.PI, 9);  // far, out of phase
  }

  function tickOneJF(st: any, W: number, H: number) {
    const sc = st.scale;
    const bellW = JF_BELL[0][0].length * sc;
    const bellH = JF_BELL[0].length * sc;
    const tentH = JF_MAX_TENT * sc;
    const cx = st.x + bellW / 2;
    const cy = st.y + bellH / 2;
    const isDark = document.documentElement.dataset.theme === 'dark';

    // Circadian rhythm — dark: active; light: lethargic
    const pulseInt = isDark ? 20 : 50;
    const jetForce = isDark ? 0.45 : 0.10;
    const grav = isDark ? 0.008 : 0.015;
    const driftAmp = isDark ? 0.010 : 0.003;
    const preferY = isDark ? H * 0.38 : H * 0.70;
    const preferStr = isDark ? 0.018 : 0.010;

    st.phase += 0.045;
    if (st.startleCooldown > 0) st.startleCooldown--;

    // Trail: sample every 4 ticks in dark mode only
    if (isDark && ++st.trailTick >= 4) {
      st.trailTick = 0;
      st.trail.push({ x: st.x, y: st.y, bf: st.bellFrame });
      if (st.trail.length > 6) st.trail.shift();
    } else if (!isDark) {
      st.trail.length = 0;
    }

    // Bell pulse
    if (++st.bellTick >= pulseInt) {
      st.bellTick = 0;
      st.bellFrame ^= 1;
      if (st.bellFrame === 1) {
        st.vy -= jetForce;
        if (isDark) st.glowFlash = 1.0;
      }
    }

    st.vy += grav;
    st.vx += noise(st.phase * 0.28, 0.5) * driftAmp;
    if (st.y > preferY) st.vy -= (st.y - preferY) / H * preferStr;

    st.vx *= 0.968;
    st.vy *= 0.968;

    const mg = 50;
    if (st.x < mg) st.vx += 0.08;
    if (st.x + bellW > W - mg) st.vx -= 0.08;
    if (st.y < mg) st.vy += 0.08;
    if (st.y + bellH + tentH > H - mg) st.vy -= 0.08;

    if (mouse.x > -9000) {
      const dx = cx - mouse.x, dy = cy - mouse.y, d = Math.hypot(dx, dy);
      if (d < 110 && d > 0) { st.vx += (dx / d) * 0.10; st.vy += (dy / d) * 0.10; }
    }

    // Ripple startle — only in dark mode (lethargic in light)
    if (isDark && st.startleCooldown === 0) {
      for (const rip of ripples) {
        if (rip.r < 5) continue;
        const ring = Math.abs(Math.hypot(cx - rip.x, cy - rip.y) - rip.r);
        if (ring < 30) {
          st.bellFrame = 1; st.bellTick = 0;
          st.vy -= 0.65;
          const rdx = cx - rip.x, rd = Math.hypot(rdx, cy - rip.y);
          if (rd > 0) st.vx += (rdx / rd) * 0.40;
          st.glowFlash = 1.0; st.startleCooldown = 35;
          break;
        }
      }
    }

    st.glowFlash *= 0.88;
    st.x += st.vx;
    st.y += st.vy;
  }

  function tickJF(W: number, H: number) {
    if (!JELLYFISH) return;
    if (jf) tickOneJF(jf, W, H);
    if (jf2) tickOneJF(jf2, W, H);
  }

  function drawOneJF(ctx: CanvasRenderingContext2D, st: any, isDark: boolean) {
    const sc = st.scale;
    const bell = JF_BELL[st.bellFrame];
    const rows = bell.length, cols = bell[0].length;
    const bellH = rows * sc;
    const flash = st.glowFlash;
    const ba = st.baseAlpha;

    // Bioluminescent trail (dark mode only, oldest = most faded)
    if (isDark && st.trail.length > 0) {
      for (let i = 0; i < st.trail.length; i++) {
        const trailA = ((i + 1) / st.trail.length) * 0.10 * ba;
        if (trailA < 0.01) continue;
        ctx.fillStyle = `rgba(150,185,255,${trailA.toFixed(2)})`;
        const tp = st.trail[i], tb = JF_BELL[tp.bf];
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++)
            if (tb[r][c] === '#')
              ctx.fillRect(tp.x + c * sc, tp.y + r * sc, sc, sc);
      }
    }

    // Glow halo (dark mode, behind bell)
    if (isDark && flash > 0.05) {
      ctx.fillStyle = `rgba(180,210,255,${(flash * 0.22 * ba).toFixed(2)})`;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (bell[r][c] === '#')
            ctx.fillRect(st.x + c * sc - 1, st.y + r * sc - 1, sc + 2, sc + 2);
    }

    // Bell fill
    const bellA = Math.min(1, (isDark ? 0.80 : 0.55) * ba + flash * 0.25 * ba);
    ctx.fillStyle = isDark
      ? `rgba(150,185,255,${bellA.toFixed(2)})`
      : `rgba(100,120,190,${bellA.toFixed(2)})`;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (bell[r][c] === '#')
          ctx.fillRect(st.x + c * sc, st.y + r * sc, sc, sc);

    // Inner highlight
    const hiSz = Math.max(1, sc - 2);
    ctx.fillStyle = isDark ? 'rgba(210,225,255,0.35)' : 'rgba(180,195,255,0.30)';
    for (let r = 1; r < rows - 1; r++)
      for (let c = 2; c < cols - 2; c++)
        if (bell[r][c] === '#')
          ctx.fillRect(st.x + c * sc + 1, st.y + r * sc + 1, hiSz, hiSz);

    // Tentacles — drag, variable length, taper
    const tentA = Math.min(1, (isDark ? 0.45 : 0.32) * ba + flash * 0.2 * ba);
    ctx.fillStyle = isDark
      ? `rgba(130,165,255,${tentA.toFixed(2)})`
      : `rgba(100,120,190,${tentA.toFixed(2)})`;
    for (const t of JF_TENT) {
      const bx = st.x + t.col * sc, by = st.y + bellH;
      for (let s = 0; s < t.len; s++) {
        const sway = (2 + s * 0.5) * Math.sin(st.phase * 1.6 + t.ph + s * 0.45);
        const drag = -st.vx * s * 0.55;
        const taper = s >= t.len - 3 ? 1 : sc - 1;
        ctx.fillRect(bx + sway + drag, by + s * sc, taper, taper);
      }
    }
  }

  function drawJF(ctx: CanvasRenderingContext2D) {
    if (!JELLYFISH) return;
    const isDark = document.documentElement.dataset.theme === 'dark';
    if (jf2) drawOneJF(ctx, jf2, isDark);  // far jellyfish behind
    if (jf) drawOneJF(ctx, jf, isDark);  // near jellyfish in front
  }

  function updateRect() { canvasRect = canvas.getBoundingClientRect(); }

  let resizeTimer: any;
  function resize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const dpr = window.devicePixelRatio || 1;
      const newW = header.offsetWidth * dpr;
      const newH = header.offsetHeight * dpr;
      // Skip if dimensions unchanged — prevents mobile address-bar resize from
      // resetting dot positions on every scroll
      if (newW === canvas.width && newH === canvas.height) return;
      canvas.width = newW;
      canvas.height = newH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildDots();
      initCat(canvas.width / dpr);
      initJF(canvas.width / dpr, canvas.height / dpr);
      updateRect();
    }, 100);
  }

  function spawnRipple(clientX: number, clientY: number) {
    ripples.push({ x: clientX - canvasRect.left, y: clientY - canvasRect.top, r: 0, str: RIPPLE_STR });
  }

  let headerRafId = 0;
  function tick() {
    if (document.hidden) { headerRafId = 0; return; }
    t = (t + DRIFT_SPEED) % (Math.PI * 2000);
    pulseT += PULSE_WANDER_SPEED;
    const now = performance.now();
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr, H = canvas.height / dpr;
    ctx.clearRect(0, 0, W, H);

    // ── Wandering heartbeat ───────────────────────────────────
    const px = W * (0.5 + noise(pulseT, 314) * 0.30);
    const py = H * (0.5 + noise(314, pulseT) * 0.22);
    if (HEARTBEAT && now - lastBeat > BEAT_INTERVAL) {
      ripples.push({ x: px, y: py, r: 0, str: RIPPLE_STR * 0.15 });
      lastBeat = now;
    }

    const [cr, cg, cb] = getColor();

    // ── Cursor velocity → turbulence ─────────────────────────
    if (prevMouse.x > -9000) {
      const speed = Math.hypot(mouse.x - prevMouse.x, mouse.y - prevMouse.y);
      turbulence = Math.min(TURB_MAX, Math.max(turbulence * TURB_DECAY, speed * TURB_SCALE));
    } else {
      turbulence *= TURB_DECAY;
    }
    prevMouse.x = mouse.x;
    prevMouse.y = mouse.y;

    // ── Scroll gravity offset ────────────────────────────────
    const gravityOffset = (scrollProgress - 0.5) * GRAVITY_STR;

    // ── Idle constellation detection ────────────────────────
    const cursorMoved = !CONSTELLATION || Math.abs(mouse.x - idleMx) > 2.5 || Math.abs(mouse.y - idleMy) > 2.5;
    if (cursorMoved || mouse.x < -9000) {
      // Dissolve ripple + ghost glow when breaking an active constellation
      if (constelWasActive && mouse.x > -9000) {
        ripples.push({ x: idleMx, y: idleMy, r: 0, str: RIPPLE_STR * 0.35 });
        if (constelDots) {
          for (let k = 0; k < constelDots.length; k++) {
            if (constelActivated[k]) dots[constelDots[k]].ghostUntil = now + CONSTEL_GHOST_DURATION;
          }
        }
      }
      idleSince = now;
      idleMx = mouse.x;
      idleMy = mouse.y;
      constelDots = null;
      constelEdges = null;
      constelOrder = null;
      constelOffsets = null;
      constelActivated = null;
      constelActivatedAt = null;
      constelAllActive = false;
      constelMaxEdgeLen = 1;
      constelWasActive = false;
    }
    const idleTime = now - idleSince;
    let constelBlend = 0;
    if (idleTime > CONSTEL_IDLE && mouse.x > -9000 && !attracting) {
      constelBlend = Math.min(1, (idleTime - CONSTEL_IDLE) / CONSTEL_RAMP);
      if (!constelDots) {
        // Pick N nearest dots (by home position distance to cursor)
        const candidates: any[] = [];
        const r2 = CONSTEL_SEARCH_R * CONSTEL_SEARCH_R;
        for (let i = 0; i < dots.length; i++) {
          const dx = dots[i].hx - mouse.x, dy = dots[i].hy - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < r2) candidates.push({ idx: i, d2 });
        }
        candidates.sort((a: any, b: any) => a.d2 - b.d2);
        const pickCount = CONSTEL_PICK_MIN + Math.floor(Math.random() * (CONSTEL_PICK_MAX - CONSTEL_PICK_MIN + 1));
        const picked = candidates.slice(0, pickCount);
        if (picked.length >= 3) {
          constelDots = picked.map((p: any) => p.idx);
          // Build point list for MST (use home positions for stable shape)
          const pts = constelDots.map((di: number) => ({ x: dots[di].hx, y: dots[di].hy }));
          // Compute centroid for tightening
          let cx = 0, cy = 0;
          for (const p of pts) { cx += p.x; cy += p.y; }
          cx /= pts.length; cy /= pts.length;
          // Compute MST
          const mstEdges = computeMST(pts);
          // Compute non-MST edges — skip shortest 30%, pick from the rest for wider triangles
          const mstSet = new Set(mstEdges.map(([a, b]: any) => a < b ? `${a}-${b}` : `${b}-${a}`));
          const extras: any[] = [];
          for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
              const key = `${i}-${j}`;
              if (!mstSet.has(key)) {
                const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
                extras.push({ i, j, d: dx * dx + dy * dy });
              }
            }
          }
          extras.sort((a: any, b: any) => a.d - b.d);
          const skip = Math.floor(extras.length * 0.3);
          const bonusEdges = extras.slice(skip, skip + CONSTEL_BONUS_EDGES).map((e: any) => [e.i, e.j]);
          constelEdges = mstEdges.concat(bonusEdges);
          // Compute max edge length for opacity scaling
          let maxEdgeLen = 0;
          for (const [a, b] of constelEdges) {
            const dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y;
            const len = dx * dx + dy * dy;
            if (len > maxEdgeLen) maxEdgeLen = len;
          }
          constelMaxEdgeLen = Math.sqrt(maxEdgeLen) || 1;
          // BFS activation order starting from the dot closest to cursor (index 0)
          const visited = new Set();
          const order: number[] = [];
          const queue = [0];
          visited.add(0);
          while (queue.length > 0) {
            const v = queue.shift()!;
            order.push(v);
            for (const [a, b] of constelEdges) {
              const next = a === v ? b : b === v ? a : -1;
              if (next >= 0 && !visited.has(next)) { visited.add(next); queue.push(next); }
            }
          }
          for (let i = 0; i < constelDots.length; i++) { if (!visited.has(i)) order.push(i); }
          constelOrder = order;
          constelCx = mouse.x;
          constelCy = mouse.y;
          // Offsets include tightened position (pulled toward centroid)
          constelOffsets = constelDots.map((di: number) => {
            const hx = dots[di].hx, hy = dots[di].hy;
            return {
              ox: hx - mouse.x + (cx - hx) * CONSTEL_TIGHTEN,
              oy: hy - mouse.y + (cy - hy) * CONSTEL_TIGHTEN,
            };
          });
          constelActivated = new Array(constelDots.length).fill(false);
          constelActivatedAt = new Array(constelDots.length).fill(0);
        }
      }

      // Progressive recruitment — activate stars one by one
      if (constelDots && constelOrder) {
        const elapsed = idleTime - CONSTEL_IDLE;
        for (let k = 0; k < constelOrder.length; k++) {
          const li = constelOrder[k]; // local index
          const activateAt = k * CONSTEL_RECRUIT_INTERVAL;
          if (elapsed >= activateAt && !constelActivated[li]) {
            constelActivated[li] = true;
            constelActivatedAt[li] = now;
            ripples.push({ x: dots[constelDots[li]].hx, y: dots[constelDots[li]].hy, r: 0, str: RIPPLE_STR * 0.05 });
            if (!constelAllActive) {
              constelAllActive = constelActivated.every(Boolean);
            }
          }
        }
        constelWasActive = true;

        // Slow rotation once all stars are activated
        if (constelAllActive && constelOffsets) {
          const angle = (now - (idleSince + CONSTEL_IDLE + constelOrder.length * CONSTEL_RECRUIT_INTERVAL)) * 0.001 * CONSTEL_ROTATE_SPEED;
          const cosR = Math.cos(angle), sinR = Math.sin(angle);
          for (let k = 0; k < constelDots.length; k++) {
            const o = constelOffsets[k];
            constelOffsets[k].rx = constelCx + o.ox * cosR - o.oy * sinR;
            constelOffsets[k].ry = constelCy + o.ox * sinR + o.oy * cosR;
          }
        }
      }
    }
    // Build map of activated constellation dots: dotIndex → { localIdx }
    constelMap.clear();
    if (constelDots && constelBlend > 0) {
      for (let k = 0; k < constelDots.length; k++) {
        if (constelActivated[k]) constelMap.set(constelDots[k], k);
      }
    }

    // ── Physics ──────────────────────────────────────────────
    // Hoist tilt constants — same for every dot, only depth varies
    const tiltBaseX = Math.max(-1, Math.min(1, tiltX / 25)) * TILT_AMP;
    const tiltBaseY = Math.max(-1, Math.min(1, tiltY / 25)) * TILT_AMP;
    const cursorActive = mouse.x > -9000;
    frameCount++;
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      const constelLocalIdx = constelBlend > 0 ? constelMap.get(i) : undefined;
      const inConstellation = constelLocalIdx !== undefined;
      // Cursor interaction — skip for constellation dots and when cursor is off-canvas
      // During active constellation, suppress repulsion within lensing radius
      if (cursorActive && !inConstellation) {
        const mx = d.x - mouse.x, my = d.y - mouse.y;
        const mdist = Math.hypot(mx, my);
        if (attracting) {
          if (mdist < ATTRACT_R && mdist > 0) {
            const f = (1 - mdist / ATTRACT_R) * (0.3 + 0.7 * d.depth);
            d.vx -= (mx / mdist) * f * ATTRACT_STR;
            d.vy -= (my / mdist) * f * ATTRACT_STR;
            d.lastDisplaced = now;
          }
        } else {
          if (mdist < REPEL_RADIUS && mdist > 0) {
            // Fade out repulsion inside constellation gravity zone
            let repelScale = 1;
            if (constelWasActive && constelBlend > 0) {
              const gd = Math.sqrt((d.x - constelCx) * (d.x - constelCx) + (d.y - constelCy) * (d.y - constelCy));
              if (gd < CONSTEL_GRAVITY_R) repelScale = Math.max(0, 1 - (1 - gd / CONSTEL_GRAVITY_R) * constelBlend);
            }
            const f = (1 - mdist / REPEL_RADIUS) * (0.3 + 0.7 * d.depth) * (1 + turbulence) * repelScale;
            d.vx += (mx / mdist) * f * REPEL_STR;
            d.vy += (my / mdist) * f * REPEL_STR;
            if (f > 0.01) d.lastDisplaced = now;
          }
        }
      }

      // Ripple ring forces
      for (const rip of ripples) {
        const rx = d.x - rip.x, ry = d.y - rip.y;
        const rdist = Math.hypot(rx, ry);
        const ring = Math.abs(rdist - rip.r);
        if (ring < 25 && rdist > 0) {
          const f = (1 - ring / 25) * rip.str * (1 - rip.r / RIPPLE_MAX_R);
          d.vx += (rx / rdist) * f;
          d.vy += (ry / rdist) * f;
        }
      }

      // Spring toward noise-drifted home target, shifted by gravity + tilt parallax
      // Recompute angle every 4 frames, staggered by index — cuts noise() cost ~4×
      if ((frameCount + i) % 4 === 0) d.angle = noise(d.hx * 0.012 + t, d.hy * 0.012) * Math.PI * 2;
      let tx = d.hx + Math.cos(d.angle) * DRIFT_AMP + tiltBaseX * d.depth;
      let ty = d.hy + Math.sin(d.angle) * DRIFT_AMP + gravityOffset + tiltBaseY * d.depth;

      // Constellation: tighten toward centroid; rotate when fully formed
      if (inConstellation && constelBlend > 0) {
        const co = constelOffsets[constelLocalIdx];
        // Target: tightened offset (always), or rotated offset (when rotating)
        const targetX = (constelAllActive && co.rx !== undefined) ? co.rx : constelCx + co.ox;
        const targetY = (constelAllActive && co.ry !== undefined) ? co.ry : constelCy + co.oy;
        tx = tx + (targetX - tx) * constelBlend;
        ty = ty + (targetY - ty) * constelBlend;
        d.lastDisplaced = now;
      } else if (constelBlend > 0 && constelWasActive) {
        // Gravitational lensing — gently pull nearby dots toward constellation center
        const gx = d.x - constelCx, gy = d.y - constelCy;
        const gd = Math.sqrt(gx * gx + gy * gy);
        if (gd < CONSTEL_GRAVITY_R && gd > 0) {
          const pull = (1 - gd / CONSTEL_GRAVITY_R) * constelBlend * CONSTEL_GRAVITY_STR;
          tx += (constelCx - d.x) * pull;
          ty += (constelCy - d.y) * pull;
        }
      }

      d.vx += (tx - d.x) * SPRING;
      d.vy += (ty - d.y) * SPRING;
      const damp = DAMPING + 0.12 * (1 - d.depth);
      d.vx *= damp;
      d.vy *= damp;
    }

    // ── Per-dot wake factor (dots[] order) for connection brightening ──
    if (dotWake.length < dots.length) dotWake = new Float32Array(dots.length);
    for (let i = 0; i < dots.length; i++) {
      let wk = Math.max(0, 1 - (now - dots[i].lastDisplaced) / WAKE_DURATION);
      // Ghost glow from dissolved constellation — longer, fainter
      if (dots[i].ghostUntil > now) {
        const gf = (dots[i].ghostUntil - now) / CONSTEL_GHOST_DURATION;
        wk = Math.max(wk, gf * 0.4);
      }
      dotWake[i] = wk;
    }

    // ── Build spatial hash (cell = CONNECT_RADIUS, covers both radii) ──
    spatialHash.clear();
    for (let i = 0; i < dots.length; i++) {
      const cx = Math.floor(dots[i].x / CONNECT_RADIUS);
      const cy = Math.floor(dots[i].y / CONNECT_RADIUS);
      const key = cx * 1000 + cy;
      let cell = spatialHash.get(key);
      if (!cell) { cell = []; spatialHash.set(key, cell); }
      cell.push(i);
    }

    // ── Combined pass: dot–dot repulsion + connection bucket assignment ──
    // Single 3×3 neighborhood query handles both — halves hash lookups per frame.
    for (let i = 0; i < BUCKETS; i++) buckets[i].length = 0;
    for (let i = 0; i < dots.length; i++) {
      const cx = Math.floor(dots[i].x / CONNECT_RADIUS);
      const cy = Math.floor(dots[i].y / CONNECT_RADIUS);
      for (let nx = cx - 1; nx <= cx + 1; nx++) {
        for (let ny = cy - 1; ny <= cy + 1; ny++) {
          const cell = spatialHash.get(nx * 1000 + ny);
          if (!cell) continue;
          for (const j of cell) {
            if (j <= i) continue;
            const dx = dots[i].x - dots[j].x;
            const dy = dots[i].y - dots[j].y;
            const d2 = dx * dx + dy * dy;
            if (d2 < DR2 && d2 > 0) {
              const dist = Math.sqrt(d2);
              const f = (1 - dist / DOT_REPEL_R) * DOT_REPEL_STR;
              const fx = (dx / dist) * f;
              const fy = (dy / dist) * f;
              dots[i].vx += fx; dots[i].vy += fy;
              dots[j].vx -= fx; dots[j].vy -= fy;
            }
            if (d2 < CR2) {
              const depthSim = 1 - Math.abs(dots[i].depth - dots[j].depth);
              if (depthSim < 0.15) continue;
              const distFactor = 1 - Math.sqrt(d2) / CONNECT_RADIUS;
              // Boost connection visibility when either endpoint was recently displaced
              const wakeBoost = Math.max(dotWake[i], dotWake[j]);
              const raw = distFactor * depthSim + wakeBoost * 0.2;
              const bi = Math.min(BUCKETS - 1, Math.floor(raw * BUCKETS));
              buckets[bi].push(dots[i].x, dots[i].y, dots[j].x, dots[j].y);
            }
          }
        }
      }
    }

    // ── Integrate positions ───────────────────────────────────
    for (const d of dots) {
      d.x += d.vx;
      d.y += d.vy;
    }

    // Advance and cull ripples (in-place to avoid per-frame array allocation)
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].r += 3.5;
      if (ripples[i].r >= RIPPLE_MAX_R) ripples.splice(i, 1);
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
    for (let bi = 0; bi < BUCKETS; bi++) {
      const lines = buckets[bi];
      if (!lines.length) continue;
      ctx.globalAlpha = ((bi + 0.5) / BUCKETS) * CONNECT_ALPHA;
      ctx.beginPath();
      for (let k = 0; k < lines.length; k += 4) {
        ctx.moveTo(lines[k], lines[k + 1]);
        ctx.lineTo(lines[k + 2], lines[k + 3]);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ── Draw dots (back-to-front, depth-scaled size + opacity) ──
    const isDark = document.documentElement.dataset.theme === 'dark';

    // ── Precompute per-dot wake + ripple + breathe factors (used by both modes) ──
    const n = dotsByDepth.length;
    if (dotWf.length < n) { dotWf = new Float32Array(n); dotRf = new Float32Array(n); dotBr = new Float32Array(n); }
    const breathePhase = now * 0.001 * BREATHE_SPEED;
    const BR2 = BREATHE_RADIUS * BREATHE_RADIUS;
    for (let i = 0; i < n; i++) {
      const d = dotsByDepth[i];
      let wf = Math.max(0, 1 - (now - d.lastDisplaced) / WAKE_DURATION);
      if (d.ghostUntil > now) wf = Math.max(wf, ((d.ghostUntil - now) / CONSTEL_GHOST_DURATION) * 0.4);
      dotWf[i] = wf;
      let rf = 0;
      for (const rip of ripples) {
        const rdist = Math.hypot(d.x - rip.x, d.y - rip.y);
        const ring = Math.abs(rdist - rip.r);
        if (ring < 60) {
          const v = (1 - ring / 60) * (1 - rip.r / RIPPLE_MAX_R);
          if (v > rf) rf = v;
        }
      }
      dotRf[i] = rf;
      // Proximity breathing — precompute radius multiplier
      if (cursorActive) {
        const bdx = d.x - mouse.x, bdy = d.y - mouse.y;
        const bd2 = bdx * bdx + bdy * bdy;
        if (bd2 < BR2) {
          const proximity = 1 - Math.sqrt(bd2) / BREATHE_RADIUS;
          const pulse = (Math.sin(breathePhase + d.phase) + 1) * 0.5;
          dotBr[i] = 1 + proximity * pulse * BREATHE_AMP;
        } else { dotBr[i] = 1; }
      } else { dotBr[i] = 1; }
    }

    if (isDark) {
      // Dark mode: bioluminescence — bucket by blend to minimise fillStyle + fill calls
      for (let i = 0; i < DB; i++) darkBuckets[i].length = 0;
      for (let i = 0; i < n; i++) {
        const d = dotsByDepth[i];
        const disp = Math.hypot(d.x - d.hx, d.y - d.hy);
        const dispFactor = Math.min(1, disp / 25);
        const cycleFactor = (Math.sin(t * 30 + d.phase) + 1) / 2 * 0.65;
        const blend = Math.max(cycleFactor, dispFactor, dotRf[i], dotWf[i]);
        darkBuckets[Math.min(DB - 1, Math.floor(blend * DB))].push(i);
      }
      for (let bi = 0; bi < DB; bi++) {
        const bucket = darkBuckets[bi];
        if (!bucket.length) continue;
        const blendMid = (bi + 0.5) / DB;
        const dr = Math.round(90 + 120 * blendMid);
        const dg = Math.round(110 + 110 * blendMid);
        const db = Math.round(210 + 45 * blendMid);
        const alpha = Math.min(0.99, 0.5 + 0.7 * blendMid);
        ctx.fillStyle = `rgba(${dr},${dg},${db},${alpha.toFixed(2)})`;
        ctx.beginPath();
        for (const i of bucket) {
          const d = dotsByDepth[i];
          const radius = DOT_R * (0.4 + 0.9 * d.depth) * dotBr[i];
          ctx.moveTo(d.x + radius, d.y);
          ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    } else {
      // Light mode: all dots same colour — batch by alpha bucket
      const DBUCKETS = 8;
      for (let bi = 0; bi < DBUCKETS; bi++) {
        const alphaMin = bi / DBUCKETS;
        const alphaMax = (bi + 1) / DBUCKETS;
        const alphaMid = (alphaMin + alphaMax) / 2;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alphaMid.toFixed(2)})`;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const d = dotsByDepth[i];
          const alpha = 0.2 + 0.6 * d.depth;
          if (alpha >= alphaMin && alpha < alphaMax) {
            const radius = DOT_R * (0.4 + 0.9 * d.depth) * dotBr[i];
            ctx.moveTo(d.x + radius, d.y);
            ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      }
      // Wake glow pass — precomputed dotWf[], batched into buckets
      const WBUCKETS = 4;
      for (let wi = 0; wi < WBUCKETS; wi++) {
        const wMin = wi / WBUCKETS, wMax = (wi + 1) / WBUCKETS;
        const wMid = (wMin + wMax) / 2 * 0.45;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${wMid.toFixed(2)})`;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const wf = dotWf[i];
          if (wf >= wMin && wf < wMax) {
            const d = dotsByDepth[i];
            const radius = DOT_R * (0.4 + 0.9 * d.depth) * dotBr[i];
            ctx.moveTo(d.x + radius, d.y);
            ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      }
      // Ripple glow pass — precomputed dotRf[], batched into buckets
      const RBUCKETS = 4;
      for (let ri = 0; ri < RBUCKETS; ri++) {
        const rMin = ri / RBUCKETS, rMax = (ri + 1) / RBUCKETS;
        const rMid = (rMin + rMax) / 2 * 0.5;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${rMid.toFixed(2)})`;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const rf = dotRf[i];
          if (rf >= rMin && rf < rMax) {
            const d = dotsByDepth[i];
            const radius = DOT_R * (0.4 + 0.9 * d.depth) * dotBr[i];
            ctx.moveTo(d.x + radius, d.y);
            ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      }
    }

    // ── Draw constellation (edge lines + star dots) ──────────
    if (constelDots && constelEdges && constelBlend > 0) {
      const EDGE_GROW_MS = 200;
      ctx.lineWidth = 1.2;
      for (const [a, b] of constelEdges) {
        if (!constelActivated[a] || !constelActivated[b]) continue;
        const da = dots[constelDots[a]], db = dots[constelDots[b]];
        // Opacity fades with edge length — short edges bright, long ones faint
        const edgeLen = Math.hypot(da.x - db.x, da.y - db.y);
        const distFade = 1 - 0.5 * (edgeLen / constelMaxEdgeLen);
        const alpha = constelBlend * 0.45 * distFade;
        ctx.strokeStyle = isDark
          ? `rgba(100,180,255,${alpha.toFixed(3)})`
          : `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
        const laterTime = Math.max(constelActivatedAt[a], constelActivatedAt[b]);
        const growT = Math.min(1, (now - laterTime) / EDGE_GROW_MS);
        const fromFirst = constelActivatedAt[a] <= constelActivatedAt[b];
        const fx = fromFirst ? da.x : db.x, fy = fromFirst ? da.y : db.y;
        const toX = fromFirst ? db.x : da.x, toY = fromFirst ? db.y : da.y;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + (toX - fx) * growT, fy + (toY - fy) * growT);
        ctx.stroke();
      }

      // Enlarged bright dots at activated star positions
      const dotAlpha = constelBlend * 0.75;
      ctx.fillStyle = isDark
        ? `rgba(140,200,255,${dotAlpha.toFixed(2)})`
        : `rgba(${cr},${cg},${cb},${dotAlpha.toFixed(2)})`;
      ctx.beginPath();
      for (let k = 0; k < constelDots.length; k++) {
        if (!constelActivated[k]) continue;
        const d = dots[constelDots[k]];
        const r = DOT_R * 1.5;
        ctx.moveTo(d.x + r, d.y);
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    tickJF(W, H);
    drawJF(ctx);
    tickCat(W, H);
    drawCat(ctx, H);

    headerRafId = requestAnimationFrame(tick);
  }

  // Burst dots outward from cursor — called on gravity-well release
  function explode() {
    const stamp = performance.now();
    for (const d of dots) {
      const ex = d.x - mouse.x, ey = d.y - mouse.y;
      const edist = Math.hypot(ex, ey);
      if (edist < ATTRACT_R && edist > 0) {
        const f = 1 - edist / ATTRACT_R;
        d.vx += (ex / edist) * f * EXPLODE_STR;
        d.vy += (ey / edist) * f * EXPLODE_STR;
        d.lastDisplaced = stamp;
      }
    }
  }

  header.addEventListener('mousemove', (e: MouseEvent) => {
    mouse.x = e.clientX - canvasRect.left;
    mouse.y = e.clientY - canvasRect.top;
  });
  header.addEventListener('mouseleave', () => {
    mouse.x = mouse.y = -9999;
    if (attracting) { attracting = false; explode(); }
  });

  // Desktop: Shift key toggles gravity well
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Shift' && !attracting && mouse.x > -9000) attracting = true;
  });
  window.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.key === 'Shift' && attracting) { attracting = false; explode(); }
  });

  // Touch: repulsion tracking + ripple on tap; long-press (500ms) = gravity well
  let touchFired = false;
  header.addEventListener('touchstart', (e: TouchEvent) => {
    touchFired = true;
    updateRect();
    const t0 = e.touches[0];
    mouse.x = t0.clientX - canvasRect.left;
    mouse.y = t0.clientY - canvasRect.top;
    longPressTimer = setTimeout(() => {
      attracting = true;
      longPressTimer = null;
    }, 500);
    Array.from(e.touches).forEach(touch => spawnRipple(touch.clientX, touch.clientY));
  }, { passive: true });
  header.addEventListener('touchmove', (e: TouchEvent) => {
    const t0 = e.touches[0];
    mouse.x = t0.clientX - canvasRect.left;
    mouse.y = t0.clientY - canvasRect.top;
  }, { passive: true });
  document.addEventListener('touchend', () => {
    clearTimeout(longPressTimer); longPressTimer = null;
    if (attracting) { attracting = false; explode(); }
    mouse.x = mouse.y = -9999;
  }, { passive: true });
  document.addEventListener('touchcancel', () => {
    clearTimeout(longPressTimer); longPressTimer = null;
    attracting = false;
    mouse.x = mouse.y = -9999;
  }, { passive: true });

  // ── Device tilt parallax (mobile) ────────────────────────
  function setupTilt() {
    if (typeof DeviceOrientationEvent === 'undefined') return;
    let calibX: number | null = null, calibY: number | null = null;

    function onOrientation(e: DeviceOrientationEvent) {
      if (e.gamma === null) return;
      if (calibX === null) { calibX = e.gamma; calibY = e.beta; }
      const dx = e.gamma - calibX;
      const dy = e.beta! - calibY!;
      // Low-pass filter to smooth sensor jitter
      tiltX += (dx - tiltX) * 0.18;
      tiltY += (dy - tiltY) * 0.18;
    }

    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      // iOS 13+ — requestPermission must be called from a click event
      document.addEventListener('click', function reqPerm() {
        (DeviceOrientationEvent as any).requestPermission()
          .then((s: string) => { if (s === 'granted') window.addEventListener('deviceorientation', onOrientation); })
          .catch(() => { });
      }, { once: true });
    } else {
      window.addEventListener('deviceorientation', onOrientation);
    }
  }
  setupTilt();

  // Mouse click (desktop only — skip if touch already handled it)
  header.addEventListener('click', (e: MouseEvent) => {
    if (touchFired) { touchFired = false; return; }
    spawnRipple(e.clientX, e.clientY);
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !headerRafId) headerRafId = requestAnimationFrame(tick);
  });

  // Initial setup — run immediately, not debounced
  const dpr0 = window.devicePixelRatio || 1;
  canvas.width = header.offsetWidth * dpr0;
  canvas.height = header.offsetHeight * dpr0;
  ctx.setTransform(dpr0, 0, 0, dpr0, 0, 0);
  buildDots();
  initCat(header.offsetWidth);
  initJF(header.offsetWidth, header.offsetHeight);
  updateRect();
  // Fade in after first two frames are rendered so there's no blank flash
  canvas.style.opacity = '0';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  tick();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    canvas.style.transition = reduceMotion ? '' : 'opacity 0.8s ease';
    canvas.style.opacity = '1';
  }));
})();
