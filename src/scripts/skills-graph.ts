// ── Skills Graph ─────────────────────────────────────────────
// Self-contained module: reads data from DOM data island,
// renders the appropriate skills visualization.
//
// Modes:
//   1 = Constellation field (random scatter, color = group)
//   2 = Force-directed clusters (physics simulation, groups emerge naturally)
//   Static fallback for prefers-reduced-motion

const SKILLS_GRAPH_MODE = 2;

// ── Shared: build skill nodes, edges, adjacency ─────────────
function buildSkillGraph(data: any) {
  // Base palette — extended automatically for any number of groups
  const basePalette = {
    light: ['#0071e3', '#bf4800', '#1a8a3f', '#7b3fa0'],
    dark: ['#0a84ff', '#ff9f0a', '#30d158', '#bf5af2']
  };
  const groups = Object.entries(data.skills) as [string, string[]][];
  // Generate evenly-spaced HSL colors for groups beyond the base palette
  function generateColor(index: number, dark: boolean): string {
    const hue = (index * 137.5) % 360; // golden angle for good spread
    return dark
      ? `hsl(${hue}, 80%, 60%)`
      : `hsl(${hue}, 70%, 40%)`;
  }
  const groupColors = {
    light: groups.map((_, i) => basePalette.light[i] ?? generateColor(i, false)),
    dark: groups.map((_, i) => basePalette.dark[i] ?? generateColor(i, true))
  };
  const nodes: any[] = [];
  const nameIdx: Record<string, number> = {};
  groups.forEach(([group, items], gi) => {
    items.forEach((name: string) => {
      nameIdx[name] = nodes.length;
      nodes.push({ name, group: gi, groupName: group });
    });
  });
  const connections = data.skillConnections || [
    ['Python', 'Experiment Automation'], ['Python', 'Numerical Simulation'],
    ['Python', 'Image Processing'], ['Python', 'Signal Processing'],
    ['C/C++', 'FPGA Interfaces'], ['C/C++', 'Real-time Data Acquisition'],
    ['LabVIEW', 'Experiment Automation'], ['LabVIEW', 'Real-time Data Acquisition'],
    ['MATLAB', 'Signal Processing'], ['MATLAB', 'Numerical Simulation'],
    ['MATLAB', 'Fourier Optics'], ['MATLAB', 'Image Processing'],
    ['SQL', 'Statistical Modeling'],
    ['Spatial Light Modulators', 'Fourier Optics'],
    ['Ultrafast Lasers', 'Optical Characterization'],
    ['Device Fabrication', 'Optical Characterization'],
    ['Spatial Light Modulators', 'Hardware-Software Co-design'],
    ['FPGA Interfaces', 'Hardware-Software Co-design'],
    ['Real-time Data Acquisition', 'Hardware-Software Co-design'],
    ['Fourier Optics', 'Optical Characterization'],
    ['Signal Processing', 'Real-time Data Acquisition'],
    ['Image Processing', 'Optical Characterization'],
  ];
  const edgeSet = new Set<string>();
  const edges: number[][] = [];
  function addEdge(a: number, b: number) {
    const key = a < b ? a + ',' + b : b + ',' + a;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push([a, b]);
  }
  connections.forEach(([a, b]: [string, string]) => {
    if (nameIdx[a] !== undefined && nameIdx[b] !== undefined)
      addEdge(nameIdx[a], nameIdx[b]);
  });

  // Auto-connect: nodes without any cross-group edge get connected
  // to the nearest group-mates' cross-group neighbors (bridge via affinity),
  // or failing that, to a random node in the group with the most connections.
  const crossAdj: Set<number>[] = Array.from({ length: nodes.length }, () => new Set());
  edges.forEach(([a, b]) => {
    if (nodes[a].group !== nodes[b].group) {
      crossAdj[a].add(b); crossAdj[b].add(a);
    }
  });
  for (let i = 0; i < nodes.length; i++) {
    if (crossAdj[i].size > 0) continue; // already has cross-group edges
    // Find group-mates that DO have cross-group edges
    const myGroup = nodes[i].group;
    const candidates = new Map<number, number>(); // nodeIdx → score
    for (let j = 0; j < nodes.length; j++) {
      if (j === i || nodes[j].group === myGroup) continue;
      // Score: how many of i's group-mates connect to j?
      let score = 0;
      for (let k = 0; k < nodes.length; k++) {
        if (k === i || nodes[k].group !== myGroup) continue;
        if (crossAdj[k].has(j)) score += 2;
        if (crossAdj[j].has(k)) score += 1;
      }
      // Bonus for j being well-connected (hub nodes are natural bridges)
      score += crossAdj[j].size * 0.3;
      if (score > 0) candidates.set(j, score);
    }
    // Pick top 1-2 candidates
    const sorted = [...candidates.entries()].sort((a, b) => b[1] - a[1]);
    const pick = Math.min(sorted.length, 2);
    for (let p = 0; p < pick; p++) {
      addEdge(i, sorted[p][0]);
      crossAdj[i].add(sorted[p][0]);
      crossAdj[sorted[p][0]].add(i);
    }
    // Fallback: if no affinity-based candidates, connect to the most-connected
    // node in a different group
    if (pick === 0) {
      let bestJ = -1, bestConn = -1;
      for (let j = 0; j < nodes.length; j++) {
        if (nodes[j].group === myGroup) continue;
        if (crossAdj[j].size > bestConn) { bestConn = crossAdj[j].size; bestJ = j; }
      }
      if (bestJ >= 0) {
        addEdge(i, bestJ);
        crossAdj[i].add(bestJ);
        crossAdj[bestJ].add(i);
      }
    }
  }

  // Intra-group edges (for force-directed mode)
  const intraEdges: number[][] = [];
  groups.forEach(([, items]) => {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        intraEdges.push([nameIdx[items[i]], nameIdx[items[j]]]);
      }
    }
  });
  const adj: Set<number>[] = Array.from({ length: nodes.length }, () => new Set());
  edges.forEach(([a, b]) => { adj[a].add(b); adj[b].add(a); });
  return { groupColors, groups, nodes, nameIdx, edges, intraEdges, adj, N: nodes.length };
}

// ══════════════════════════════════════════════════════════════
// MODE 1: Constellation field (random scatter)
// ══════════════════════════════════════════════════════════════
function renderSkillsConstellation(data: any) {
  const { groupColors, groups, nodes, nameIdx, edges, adj, N } = buildSkillGraph(data);

  const canvas = document.getElementById('skills-graph') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d')!;
  const wrap = canvas.parentElement!;

  const DOT_R = 4;
  const HIT_R = 40;
  const FLOAT_AMP = 3;
  const FLOAT_SPEED = 0.0005;
  const MIN_DIST = 90; // minimum distance between nodes during placement

  let hoverIdx = -1;
  let dpr = 1, cw = 0, ch = 0;
  const hx = new Float32Array(N), hy = new Float32Array(N);
  const rx = new Float32Array(N), ry = new Float32Array(N);
  // Stable random seeds per node (so layout is consistent across resizes)
  const seedX: number[] = [], seedY: number[] = [];
  for (let i = 0; i < N; i++) {
    seedX.push(Math.random());
    seedY.push(Math.random());
  }
  const floatPhase = new Float32Array(N);
  const floatAmpX = new Float32Array(N);
  const floatAmpY = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    floatPhase[i] = Math.random() * Math.PI * 2;
    floatAmpX[i] = FLOAT_AMP * (0.5 + Math.random() * 1.0);
    floatAmpY[i] = FLOAT_AMP * (0.5 + Math.random() * 1.0);
  }

  // Smooth transitions
  const nodeScale = new Float32Array(N).fill(1);
  const nodeAlpha = new Float32Array(N).fill(1);
  const edgeTension = new Float32Array(edges.length).fill(0);
  const edgeAlpha = new Float32Array(edges.length).fill(1);
  const glowR = new Float32Array(N).fill(0);
  // Label alignment: -1=left of dot, +1=right of dot (assigned during layout)
  const labelSide = new Int8Array(N);
  let fontFamily = '';

  function layout() {
    // Scatter nodes across canvas with minimum distance enforcement
    const padX = 80, padY = 30;
    const usableW = cw - padX * 2;
    const usableH = ch - padY * 2;
    // Place nodes using their stable seeds, then relax overlaps
    for (let i = 0; i < N; i++) {
      hx[i] = padX + seedX[i] * usableW;
      hy[i] = padY + seedY[i] * usableH;
    }
    // Simple relaxation: push apart nodes that are too close (a few passes)
    for (let pass = 0; pass < 30; pass++) {
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          let dx = hx[i] - hx[j], dy = hy[i] - hy[j];
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MIN_DIST && dist > 0) {
            const push = (MIN_DIST - dist) * 0.5;
            const nx = (dx / dist) * push, ny = (dy / dist) * push;
            hx[i] += nx; hy[i] += ny;
            hx[j] -= nx; hy[j] -= ny;
          }
        }
        // Keep in bounds
        if (hx[i] < padX) hx[i] = padX;
        if (hx[i] > cw - padX) hx[i] = cw - padX;
        if (hy[i] < padY) hy[i] = padY;
        if (hy[i] > ch - padY) hy[i] = ch - padY;
      }
    }
    // Assign label side: label goes toward whichever side has more space
    for (let i = 0; i < N; i++) {
      labelSide[i] = hx[i] < cw / 2 ? 1 : -1;
    }
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    cw = wrap.offsetWidth;
    ch = wrap.offsetHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
  }

  function isDark() { return document.documentElement.dataset.theme === 'dark'; }
  function colors() { return isDark() ? groupColors.dark : groupColors.light; }

  function tick(now: number) {
    // Float
    for (let i = 0; i < N; i++) {
      const p = floatPhase[i] + now * FLOAT_SPEED;
      rx[i] = hx[i] + Math.sin(p) * floatAmpX[i];
      ry[i] = hy[i] + Math.cos(p * 0.7) * floatAmpY[i];
    }

    // Smooth transitions
    const LERP = 0.1;
    for (let i = 0; i < N; i++) {
      const isHover = i === hoverIdx;
      const isNeighbor = hoverIdx >= 0 && adj[hoverIdx].has(i);
      const isSameGroup = hoverIdx >= 0 && nodes[i].group === nodes[hoverIdx].group;
      const dimmed = hoverIdx >= 0 && !isHover && !isNeighbor && !isSameGroup;

      const targetScale = isHover ? 2.2 : (isNeighbor ? 1.4 : 1.0);
      const targetAlpha = dimmed ? 0.08 : 1.0;
      const targetGlow = isHover ? DOT_R * 5 : 0;

      nodeScale[i] += (targetScale - nodeScale[i]) * LERP;
      nodeAlpha[i] += (targetAlpha - nodeAlpha[i]) * LERP;
      glowR[i] += (targetGlow - glowR[i]) * LERP;
    }
    for (let e = 0; e < edges.length; e++) {
      const [a, b] = edges[e];
      const connected = hoverIdx >= 0 && (a === hoverIdx || b === hoverIdx);
      const dimmed = hoverIdx >= 0 && !connected;
      edgeTension[e] += ((connected ? 1 : 0) - edgeTension[e]) * LERP;
      edgeAlpha[e] += ((dimmed ? 0.03 : 1) - edgeAlpha[e]) * LERP;
    }

    // Draw
    ctx.clearRect(0, 0, cw, ch);
    const cols = colors();
    const dark = isDark();
    if (!fontFamily) fontFamily = getComputedStyle(document.body).fontFamily;

    // Edges
    for (let e = 0; e < edges.length; e++) {
      const [a, b] = edges[e];
      const ax = rx[a], ay = ry[a], bx = rx[b], by = ry[b];
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const dx = bx - ax, dy = by - ay;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const bulge = len * 0.18 * (1 - edgeTension[e]);
      const cpx = mx + (-dy / len) * bulge;
      const cpy = my + (dx / len) * bulge;

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(cpx, cpy, bx, by);

      const t = edgeTension[e];
      if (t > 0.05) {
        ctx.strokeStyle = cols[nodes[a].group];
        ctx.lineWidth = 1 + t * 0.4;
        ctx.globalAlpha = 0.06 + t * 0.14;
      } else {
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)';
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = edgeAlpha[e];
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Nodes
    for (let i = 0; i < N; i++) {
      const x = rx[i], y = ry[i];
      const col = cols[nodes[i].group];
      const scale = nodeScale[i];
      const alpha = nodeAlpha[i];

      // Glow ring
      if (glowR[i] > 0.5) {
        ctx.beginPath();
        ctx.arc(x, y, glowR[i], 0, Math.PI * 2);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = Math.min(0.15, (glowR[i] / (DOT_R * 5)) * 0.15);
        ctx.stroke();
      }

      // Dot
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, DOT_R * scale, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();

      // Label
      const isHover = scale > 1.5;
      const side = labelSide[i];
      ctx.textAlign = side > 0 ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `${isHover ? '600' : '400'} ${isHover ? 12 : 10.5}px ${fontFamily}`;
      ctx.fillStyle = isHover ? col : (dark ? '#d1d1d6' : '#48484a');
      const labelX = x + side * (DOT_R * scale + 7);
      ctx.fillText(nodes[i].name, labelX, y);

      // On hover: show group name as subtitle
      if (isHover) {
        ctx.font = `400 9px ${fontFamily}`;
        ctx.fillStyle = dark ? '#8e8e93' : '#86868b';
        ctx.fillText(nodes[i].groupName, labelX, y + 14);
      }
      ctx.globalAlpha = 1;
    }

    requestAnimationFrame(tick);
  }

  function hitTest(ex: number, ey: number) {
    const rect = canvas.getBoundingClientRect();
    const mx = ex - rect.left, my = ey - rect.top;
    let best = -1, bestD2 = HIT_R * HIT_R;
    for (let i = 0; i < N; i++) {
      const dx = rx[i] - mx, dy = ry[i] - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = i; }
    }
    return best;
  }

  canvas.addEventListener('mousemove', e => {
    const idx = hitTest(e.clientX, e.clientY);
    if (idx !== hoverIdx) { hoverIdx = idx; canvas.style.cursor = idx >= 0 ? 'pointer' : 'default'; }
  });
  canvas.addEventListener('mouseleave', () => { hoverIdx = -1; canvas.style.cursor = 'default'; });

  const resizeObs = new ResizeObserver(() => resize());
  resizeObs.observe(wrap);
  const themeObs = new MutationObserver(() => { });
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  resize();
  requestAnimationFrame(tick);
}

// Fallback for prefers-reduced-motion
function renderSkillsStatic(data: any) {
  const container = document.getElementById('skills-graph-wrap');
  if (!container) return;
  container.style.height = 'auto';
  const canvas = document.getElementById('skills-graph');
  if (canvas) canvas.remove();
  const list = document.createElement('div');
  list.className = 'flex flex-col gap-6';
  Object.entries(data.skills).forEach(([group, items]) => {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="skill-group-title">${group}</div>
      <div>${(items as string[]).map(s => `<span class="skill-tag">${s}</span>`).join('')}</div>
    `;
    list.appendChild(el);
  });
  container.appendChild(list);
}

// ══════════════════════════════════════════════════════════════
// MODE 2: Force-directed clusters
// ══════════════════════════════════════════════════════════════
function renderSkillsForce(data: any) {
  const { groupColors, groups, nodes, nameIdx, edges, intraEdges, adj, N } = buildSkillGraph(data);
  const allEdges = edges.concat(intraEdges);
  // Pre-compute which edges are intra-group
  const edgeSame = new Uint8Array(allEdges.length);
  for (let e = 0; e < allEdges.length; e++) {
    edgeSame[e] = nodes[allEdges[e][0]].group === nodes[allEdges[e][1]].group ? 1 : 0;
  }

  const canvas = document.getElementById('skills-graph') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d')!;
  const wrap = canvas.parentElement!;

  const isMobile = window.innerWidth <= 768;
  const DOT_R = isMobile ? 3.5 : 4;
  const HIT_R = 40;
  const FLOAT_AMP = isMobile ? 1.2 : 2;
  const FLOAT_SPEED = 0.0005;

  // Physics — tighter on mobile to keep nodes in view
  const REPEL = isMobile ? 800 : 1400;
  const MIN_REPEL_DIST = isMobile ? 50 : 70;
  const INTRA_SPRING = 0.012;
  const INTRA_REST = isMobile ? 75 : 127;
  const CROSS_SPRING = 0.003;
  const CROSS_REST = isMobile ? 170 : 304;
  const CENTER_PULL = isMobile ? 0.005 : 0.0025;
  const PHYS_DAMPING = 0.82;

  // Connectivity-based dot size: more connections = larger
  const connCount = new Float32Array(N);
  for (let i = 0; i < N; i++) connCount[i] = adj[i].size;
  let maxConn = 1;
  for (let i = 0; i < N; i++) { if (connCount[i] > maxConn) maxConn = connCount[i]; }
  const dotScale = new Float32Array(N);
  for (let i = 0; i < N; i++) dotScale[i] = 0.7 + 0.6 * (connCount[i] / maxConn);

  // ── State ──────────────────────────────────────────────────
  let hoverIdx = -1;
  let lockedIdx = -1;           // 10. click-to-lock highlight
  let dragIdx = -1;             // 9. drag nodes
  let dpr = 1, cw = 0, ch = 0;
  let settled = false, settledFrames = 0;
  let isVisible = true;         // 1. pause when off-screen
  let rafId = 0;
  let entryDone = false;

  // Entry animation — staggered by group (8)
  let entryStart = 0;
  const ENTRY_DURATION = 1200;
  const GROUP_STAGGER = 150; // ms between groups

  const sx = new Float32Array(N), sy = new Float32Array(N);
  const svx = new Float32Array(N), svy = new Float32Array(N);
  const hx = new Float32Array(N), hy = new Float32Array(N);
  const rx = new Float32Array(N), ry = new Float32Array(N);

  // Which group each node belongs to (for stagger delay)
  const nodeGroup = new Uint8Array(N);
  for (let i = 0; i < N; i++) nodeGroup[i] = nodes[i].group;

  // 4. Pre-compute group membership arrays (avoid scanning all N per group)
  const groupMembers: number[][] = groups.map(() => []);
  for (let i = 0; i < N; i++) groupMembers[nodeGroup[i]].push(i);

  // Try restoring cached positions (2. session cache)
  const CACHE_KEY = 'skills-force-pos';
  let usedCache = false;
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const pos = JSON.parse(cached);
      if (pos.length === N) {
        for (let i = 0; i < N; i++) { sx[i] = pos[i][0]; sy[i] = pos[i][1]; }
        settled = true;
        usedCache = true;
        entryDone = true; // skip entry animation on cached load
      }
    }
  } catch (_) { }

  if (!usedCache) {
    // Init in tight circle by group
    groups.forEach(([, items], gi) => {
      const baseAngle = (gi / groups.length) * Math.PI * 2;
      items.forEach((name: string, j: number) => {
        const i = nameIdx[name];
        const a = baseAngle + (j - items.length / 2) * 0.25;
        const r = 40 + j * 8;
        sx[i] = Math.cos(a) * r;
        sy[i] = Math.sin(a) * r;
      });
    });
  }

  const floatPhase = new Float32Array(N);
  const floatAmpX = new Float32Array(N);
  const floatAmpY = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    floatPhase[i] = Math.random() * Math.PI * 2;
    floatAmpX[i] = FLOAT_AMP * (0.5 + Math.random() * 1.0);
    floatAmpY[i] = FLOAT_AMP * (0.5 + Math.random() * 1.0);
  }

  const nodeScaleAnim = new Float32Array(N).fill(1);
  const nodeAlpha = new Float32Array(N).fill(1);
  const edgeTension = new Float32Array(allEdges.length).fill(0);
  const ringR = new Float32Array(N).fill(0);     // 6. hover ring radius
  const ringAlpha = new Float32Array(N).fill(0);  // 6. hover ring opacity
  const labelSide = new Int8Array(N);
  const labelOffsetY = new Float32Array(N);
  let fontFamily = '';

  // ── Effective hover: locked takes priority ─────────────────
  function effectiveHover() { return lockedIdx >= 0 ? lockedIdx : hoverIdx; }

  // ── Physics simulation ─────────────────────────────────────
  function simulate() {
    let totalV = 0;
    for (let i = 0; i < N; i++) {
      if (i === dragIdx) continue; // dragged node is pinned
      for (let j = i + 1; j < N; j++) {
        let dx = sx[i] - sx[j], dy = sy[i] - sy[j];
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        if (dist < MIN_REPEL_DIST) {
          const push = (MIN_REPEL_DIST - dist) * 0.15;
          const nx = (dx / dist) * push, ny = (dy / dist) * push;
          if (j !== dragIdx) { svx[i] += nx; svy[i] += ny; }
          if (i !== dragIdx) { svx[j] -= nx; svy[j] -= ny; }
        }
        const d2 = dist * dist;
        const f = REPEL / d2;
        if (j !== dragIdx) { svx[i] += (dx / dist) * f; svy[i] += (dy / dist) * f; }
        if (i !== dragIdx) { svx[j] -= (dx / dist) * f; svy[j] -= (dy / dist) * f; }
      }
    }
    for (let e = 0; e < allEdges.length; e++) {
      const [a, b] = allEdges[e];
      const dx = sx[b] - sx[a], dy = sy[b] - sy[a];
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const spring = edgeSame[e] ? INTRA_SPRING : CROSS_SPRING;
      const rest = edgeSame[e] ? INTRA_REST : CROSS_REST;
      const f = (dist - rest) * spring;
      const fx = (dx / dist) * f, fy = (dy / dist) * f;
      if (a !== dragIdx) { svx[a] += fx; svy[a] += fy; }
      if (b !== dragIdx) { svx[b] -= fx; svy[b] -= fy; }
    }
    const hw = cw * (isMobile ? 0.34 : 0.42), hh = ch * (isMobile ? 0.38 : 0.42);
    for (let i = 0; i < N; i++) {
      if (i === dragIdx) continue;
      svx[i] += -sx[i] * CENTER_PULL;
      svy[i] += -sy[i] * CENTER_PULL;
      if (Math.abs(sx[i]) > hw) svx[i] += (sx[i] > 0 ? -1 : 1) * (Math.abs(sx[i]) - hw) * 0.05;
      if (Math.abs(sy[i]) > hh) svy[i] += (sy[i] > 0 ? -1 : 1) * (Math.abs(sy[i]) - hh) * 0.05;
      svx[i] *= PHYS_DAMPING;
      svy[i] *= PHYS_DAMPING;
      sx[i] += svx[i];
      sy[i] += svy[i];
      totalV += Math.abs(svx[i]) + Math.abs(svy[i]);
    }
    return totalV;
  }

  // ── Label collision avoidance ──────────────────────────────
  const labelW = new Float32Array(N);
  const labelFlip = new Int8Array(N);
  let labelsMeasured = false;

  function measureLabels() {
    if (!fontFamily) return;
    const fontSize = isMobile ? 9 : 10.5;
    ctx.font = `400 ${fontSize}px ${fontFamily}`;
    for (let i = 0; i < N; i++) {
      labelW[i] = ctx.measureText(nodes[i].name).width;
    }
    labelsMeasured = true;
  }

  function resolveLabels() {
    const LABEL_H = isMobile ? 12 : 15;
    const PAD_X = 6;
    for (let i = 0; i < N; i++) { labelOffsetY[i] = 0; labelFlip[i] = 0; }

    function labelBox(i: number) {
      const side = labelFlip[i] ? -labelSide[i] : labelSide[i];
      const dotR = DOT_R * (nodeScaleAnim[i] * dotScale[i]);
      const gap = isMobile ? 5 : 7;
      const anchorX = rx[i] + side * (dotR + gap);
      const w = labelsMeasured ? labelW[i] : 60;
      const y = ry[i] + labelOffsetY[i];
      const left = side > 0 ? anchorX - PAD_X : anchorX - w - PAD_X;
      const right = side > 0 ? anchorX + w + PAD_X : anchorX + PAD_X;
      return [left, y - LABEL_H / 2, right, y + LABEL_H / 2];
    }

    function overlaps(a: number, b: number) {
      const ba = labelBox(a), bb = labelBox(b);
      return ba[0] < bb[2] && ba[2] > bb[0] && ba[1] < bb[3] && ba[3] > bb[1];
    }

    // Check if flipping node i creates any new overlaps with its nearby neighbors
    function flipCausesNewOverlap(i: number, sorted: number[], kIdx: number) {
      const range = 4;
      for (let m = Math.max(0, kIdx - range); m < Math.min(sorted.length, kIdx + range + 1); m++) {
        const j = sorted[m];
        if (j === i) continue;
        if (overlaps(i, j)) return true;
      }
      return false;
    }

    const sorted = Array.from({ length: N }, (_, i) => i).sort((a, b) => ry[a] - ry[b]);

    // Pass 1: Try flipping label side to resolve overlaps
    for (let k = 1; k < sorted.length; k++) {
      const i = sorted[k];
      for (let m = k - 1; m >= 0 && m >= k - 4; m--) {
        const prev = sorted[m];
        if (Math.abs(ry[i] - ry[prev]) > LABEL_H * 3) break;
        if (overlaps(i, prev)) {
          // Try flipping i — only accept if it doesn't create new overlaps
          labelFlip[i] = 1;
          if (!flipCausesNewOverlap(i, sorted, k)) break;
          labelFlip[i] = 0;
          // Try flipping prev
          labelFlip[prev] = 1;
          if (!flipCausesNewOverlap(prev, sorted, m)) break;
          labelFlip[prev] = 0;
        }
      }
    }

    // Pass 2: Vertical nudging for remaining overlaps
    for (let pass = 0; pass < 8; pass++) {
      let anyOverlap = false;
      for (let k = 1; k < sorted.length; k++) {
        const i = sorted[k];
        for (let m = k - 1; m >= 0 && m >= k - 4; m--) {
          const prev = sorted[m];
          if (ry[prev] + labelOffsetY[prev] < ry[i] + labelOffsetY[i] - LABEL_H * 3) break;
          if (overlaps(i, prev)) {
            const bi = labelBox(i), bp = labelBox(prev);
            const overlapY = bp[3] - bi[1];
            if (overlapY > 0) {
              const push = overlapY * 0.5 + 0.5;
              labelOffsetY[i] += push;
              labelOffsetY[prev] -= push;
              anyOverlap = true;
            }
          }
        }
      }
      if (!anyOverlap) break;
    }
  }

  function computeHome() {
    const ox = cw / 2, oy = ch / 2;
    for (let i = 0; i < N; i++) {
      hx[i] = ox + sx[i];
      hy[i] = oy + sy[i];
      labelSide[i] = hx[i] < cw / 2 ? 1 : -1;
    }
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    cw = wrap.offsetWidth;
    ch = wrap.offsetHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeHome();
    labelsMeasured = false; // re-measure on next frame
  }

  function isDark() { return document.documentElement.dataset.theme === 'dark'; }
  function colors() { return isDark() ? groupColors.dark : groupColors.light; }
  function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }

  // ── Cache settled positions ────────────────────────────────
  function cachePositions() {
    try {
      const pos: number[][] = [];
      for (let i = 0; i < N; i++) pos.push([sx[i], sy[i]]);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(pos));
    } catch (_) { }
  }

  // ── Performance state ───────────────────────────────────────
  let frameCount = 0;
  let lastActiveIdx = -1;

  // Edge ripple — single wave on first settle
  let rippleStart = 0;       // timestamp when ripple begins (0 = not started)
  let rippleQueued = 0;      // timestamp when ripple was requested (delay before start)
  let rippleFired = false;   // true after ripple has played
  const RIPPLE_DELAY = 400;    // ms delay after settle before ripple starts
  const RIPPLE_DURATION = 1800; // ms for full expansion
  const RIPPLE_WIDTH = 120;    // px width of the bright band
  let rippleMaxR = 0;          // max radius (computed on trigger)

  // ── Main render loop ───────────────────────────────────────
  function tick(now: number) {
    if (!isVisible) { rafId = 0; return; }
    rafId = requestAnimationFrame(tick);

    if (!entryStart) entryStart = now;
    frameCount++;

    // Queue ripple on first frame if already settled (cached positions)
    // Guard cw/ch > 0: canvas may be in a hidden tab with zero dimensions
    if (!rippleFired && !rippleQueued && !rippleStart && settled && entryDone && frameCount > 1 && cw > 0 && ch > 0) {
      rippleQueued = now;
      rippleMaxR = Math.hypot(cw / 2, ch / 2) + RIPPLE_WIDTH;
    }
    // Start ripple after delay AND entry animation is done
    if (rippleQueued && !rippleStart && entryDone && now - rippleQueued >= RIPPLE_DELAY) {
      rippleStart = now;
      rippleQueued = 0;
    }

    // 3. Reduce to ~30fps when idle (settled, no drag, no hover, no ripple)
    const isIdle = settled && dragIdx < 0 && effectiveHover() < 0 && entryDone && !rippleStart && !rippleQueued;
    if (isIdle && (frameCount & 1)) return; // skip odd frames when idle

    // Simulate physics
    if (!settled) {
      const v = simulate();
      computeHome();
      if (v < 0.05) {
        settledFrames++;
        if (settledFrames > 60) {
          settled = true; cachePositions();
          // Queue ripple on first settle (will start after delay + entry done)
          if (!rippleFired && !rippleQueued && cw > 0 && ch > 0) {
            rippleQueued = now;
            rippleMaxR = Math.hypot(cw / 2, ch / 2) + RIPPLE_WIDTH;
          }
        }
      } else settledFrames = 0;
    }
    // If dragging, keep simulating so other nodes react
    if (dragIdx >= 0 && settled) {
      simulate();
      computeHome();
    }

    // Float + entry animation with per-group stagger
    const ox = cw / 2, oy = ch / 2;
    const entryComplete = now - entryStart > ENTRY_DURATION + groups.length * GROUP_STAGGER;
    if (entryComplete) entryDone = true;

    for (let i = 0; i < N; i++) {
      const p = floatPhase[i] + now * FLOAT_SPEED;
      const targetX = hx[i] + Math.sin(p) * floatAmpX[i];
      const targetY = hy[i] + Math.cos(p * 0.7) * floatAmpY[i];
      if (entryDone) {
        // Skip easing math once entry is complete
        rx[i] = targetX;
        ry[i] = targetY;
      } else {
        const groupDelay = nodeGroup[i] * GROUP_STAGGER;
        const nodeEntryT = Math.max(0, Math.min(1, (now - entryStart - groupDelay) / ENTRY_DURATION));
        const entryEased = easeOutCubic(nodeEntryT);
        rx[i] = ox + (targetX - ox) * entryEased;
        ry[i] = oy + (targetY - oy) * entryEased;
      }
    }

    // Measure label widths once font is available
    if (fontFamily && !labelsMeasured) measureLabels();

    // 1+2. Throttle resolveLabels: every 3rd frame, and skip when truly idle
    const activeIdx = effectiveHover();
    const hoverChanged = activeIdx !== lastActiveIdx;
    lastActiveIdx = activeIdx;
    const needsLabelResolve = !settled || dragIdx >= 0 || hoverChanged || !entryDone || (frameCount % 3 === 0);
    if (needsLabelResolve) resolveLabels();

    // ── Hover transitions ────────────────────────────────────
    const LERP = 0.1;
    for (let i = 0; i < N; i++) {
      const isHover = i === activeIdx;
      const isNeighbor = activeIdx >= 0 && adj[activeIdx].has(i);
      const isSameGroup = activeIdx >= 0 && nodes[i].group === nodes[activeIdx].group;
      const dimmed = activeIdx >= 0 && !isHover && !isNeighbor && !isSameGroup;

      const targetRingR = isHover ? DOT_R * dotScale[i] + 8 : 0;
      const targetRingA = isHover ? 0.35 : 0;
      ringR[i] += (targetRingR - ringR[i]) * LERP;
      ringAlpha[i] += (targetRingA - ringAlpha[i]) * LERP;

      nodeScaleAnim[i] += ((isNeighbor ? 1.3 : 1.0) - nodeScaleAnim[i]) * LERP;
      nodeAlpha[i] += ((dimmed ? 0.08 : 1.0) - nodeAlpha[i]) * LERP;
    }
    for (let e = 0; e < allEdges.length; e++) {
      const [a, b] = allEdges[e];
      const connected = activeIdx >= 0 && (a === activeIdx || b === activeIdx);
      edgeTension[e] += ((connected ? 1 : 0) - edgeTension[e]) * LERP;
    }

    // ── Draw ─────────────────────────────────────────────────
    const cols = colors();
    const dark = isDark();
    if (!fontFamily) fontFamily = getComputedStyle(document.body).fontFamily;

    // Fill canvas with body's transitioning bg color (no transparent flash on theme toggle)
    const bgRaw = getComputedStyle(document.body).backgroundColor;
    ctx.fillStyle = bgRaw;
    ctx.fillRect(0, 0, cw, ch);

    // Overall entry progress (for halos)
    const globalEntryT = Math.min(1, (now - entryStart) / (ENTRY_DURATION + groups.length * GROUP_STAGGER));

    // Group halos — uses pre-computed groupMembers[]
    if (globalEntryT > 0.3) {
      const haloAlpha = Math.min(1, (globalEntryT - 0.3) / 0.5) * (dark ? 0.06 : 0.045);
      for (let gi = 0; gi < groups.length; gi++) {
        const members = groupMembers[gi];
        if (members.length === 0) continue;
        let gx = 0, gy = 0;
        for (let m = 0; m < members.length; m++) {
          gx += rx[members[m]]; gy += ry[members[m]];
        }
        gx /= members.length; gy /= members.length;
        let maxR = 0;
        for (let m = 0; m < members.length; m++) {
          const d = Math.hypot(rx[members[m]] - gx, ry[members[m]] - gy);
          if (d > maxR) maxR = d;
        }
        const haloR = maxR + 40;
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, haloR);
        grad.addColorStop(0, cols[gi]);
        grad.addColorStop(1, 'transparent');
        ctx.globalAlpha = haloAlpha;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, haloR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 7. Vignette — fade edges near canvas border (reuses bgRaw from canvas fill)
    const rgbM = bgRaw.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    const bgR = rgbM ? +rgbM[1] : (dark ? 28 : 245);
    const bgG = rgbM ? +rgbM[2] : (dark ? 28 : 245);
    const bgB = rgbM ? +rgbM[3] : (dark ? 30 : 247);
    const bgSolid = `rgba(${bgR},${bgG},${bgB},1)`;
    const bgClear = `rgba(${bgR},${bgG},${bgB},0)`;
    const vigSize = isMobile ? 30 : 50;
    const vigT = ctx.createLinearGradient(0, 0, 0, vigSize);
    vigT.addColorStop(0, bgSolid); vigT.addColorStop(1, bgClear);
    const vigB = ctx.createLinearGradient(0, ch - vigSize, 0, ch);
    vigB.addColorStop(0, bgClear); vigB.addColorStop(1, bgSolid);
    const vigL = ctx.createLinearGradient(0, 0, vigSize, 0);
    vigL.addColorStop(0, bgSolid); vigL.addColorStop(1, bgClear);
    const vigRGrad = ctx.createLinearGradient(cw - vigSize, 0, cw, 0);
    vigRGrad.addColorStop(0, bgClear); vigRGrad.addColorStop(1, bgSolid);
    ctx.fillStyle = vigT; ctx.fillRect(0, 0, cw, vigSize);
    ctx.fillStyle = vigB; ctx.fillRect(0, ch - vigSize, cw, vigSize);
    ctx.fillStyle = vigL; ctx.fillRect(0, 0, vigSize, ch);
    ctx.fillStyle = vigRGrad; ctx.fillRect(cw - vigSize, 0, vigSize, ch);

    // Edge ripple progress
    let rippleR = 0, rippleActive = false;
    if (rippleStart > 0 && !rippleFired) {
      const rippleT = (now - rippleStart) / RIPPLE_DURATION;
      if (rippleT >= 1) {
        rippleFired = true; rippleStart = 0;
      } else {
        rippleActive = true;
        // Ease-out for decelerating wave
        rippleR = easeOutCubic(rippleT) * rippleMaxR;
      }
    }
    const rcx = cw / 2, rcy = ch / 2; // ripple center

    // Edges — batched: solid (intra-group) first, then dashed (cross-group)
    function drawEdge(e: number) {
      const [a, b] = allEdges[e];
      const ax = rx[a], ay = ry[a], bx = rx[b], by = ry[b];
      const same = edgeSame[e];
      const emx = (ax + bx) / 2, emy = (ay + by) / 2;
      const dx = bx - ax, dy = by - ay;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const bulge = len * 0.15 * (1 - edgeTension[e]);
      const cpx = emx + (-dy / len) * bulge;
      const cpy = emy + (dx / len) * bulge;

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(cpx, cpy, bx, by);

      // Ripple brightness boost for this edge
      let rippleBoost = 0;
      if (rippleActive) {
        const edgeDist = Math.hypot(emx - rcx, emy - rcy);
        const distFromWave = Math.abs(edgeDist - rippleR);
        if (distFromWave < RIPPLE_WIDTH) {
          // Smooth bell curve: brightest at wavefront, fades at edges
          const t01 = 1 - distFromWave / RIPPLE_WIDTH;
          rippleBoost = t01 * t01 * 0.25;
        }
      }

      const t = edgeTension[e];
      if (t > 0.05) {
        if (!same && t > 0.1) {
          const grad = ctx.createLinearGradient(ax, ay, bx, by);
          grad.addColorStop(0, cols[nodes[a].group]);
          grad.addColorStop(1, cols[nodes[b].group]);
          ctx.strokeStyle = grad;
        } else {
          ctx.strokeStyle = cols[nodes[a].group];
        }
        ctx.lineWidth = 1 + t * 0.4;
        ctx.globalAlpha = 0.06 + t * 0.14 + rippleBoost;
      } else {
        const dimmed = activeIdx >= 0;
        const baseAlpha = isMobile ? (same ? 0.03 : 0.02) : (same ? 0.06 : 0.04);
        if (rippleBoost > 0) {
          // During ripple, use group color instead of gray
          ctx.strokeStyle = cols[nodes[a].group];
          ctx.lineWidth = (isMobile ? 0.8 : 1.0) + rippleBoost;
          ctx.globalAlpha = baseAlpha + rippleBoost;
        } else {
          ctx.strokeStyle = dark ? `rgba(255,255,255,${baseAlpha})` : `rgba(0,0,0,${baseAlpha})`;
          ctx.lineWidth = isMobile ? (same ? 0.5 : 0.3) : (same ? 0.8 : 0.6);
          ctx.globalAlpha = dimmed ? 0.3 : 1;
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Draw solid (intra-group) edges
    ctx.setLineDash([]);
    for (let e = 0; e < allEdges.length; e++) { if (edgeSame[e]) drawEdge(e); }
    // Draw dashed (cross-group) edges
    ctx.setLineDash([3, 4]);
    for (let e = 0; e < allEdges.length; e++) { if (!edgeSame[e]) drawEdge(e); }
    ctx.setLineDash([]);

    // Nodes
    for (let i = 0; i < N; i++) {
      const x = rx[i], y = ry[i];
      const col = cols[nodes[i].group];
      const scale = nodeScaleAnim[i] * dotScale[i];
      let alpha;
      if (entryDone) {
        alpha = nodeAlpha[i];
      } else {
        const groupDelay = nodeGroup[i] * GROUP_STAGGER;
        const nodeEntryT = Math.max(0, Math.min(1, (now - entryStart - groupDelay) / ENTRY_DURATION));
        alpha = nodeAlpha[i] * easeOutCubic(nodeEntryT);
      }

      // Ripple node glow — brief halo as wavefront passes
      if (rippleActive) {
        const nodeDist = Math.hypot(x - rcx, y - rcy);
        const distFromWave = Math.abs(nodeDist - rippleR);
        if (distFromWave < RIPPLE_WIDTH) {
          const t01 = 1 - distFromWave / RIPPLE_WIDTH;
          const glowAlpha = t01 * t01 * 0.12;
          ctx.beginPath();
          ctx.arc(x, y, DOT_R * scale + 6, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.globalAlpha = glowAlpha;
          ctx.fill();
        }
      }

      // 6. Hover ring (expanding concentric ring)
      if (ringR[i] > 0.5) {
        ctx.beginPath();
        ctx.arc(x, y, ringR[i], 0, Math.PI * 2);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = ringAlpha[i];
        ctx.stroke();
        // Second outer ring
        ctx.beginPath();
        ctx.arc(x, y, ringR[i] + 5, 0, Math.PI * 2);
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = ringAlpha[i] * 0.4;
        ctx.stroke();
      }

      // Dot
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, DOT_R * scale, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();

      // Label — use flipped side if collision resolver decided to flip
      const isActive = i === activeIdx;
      const side = labelFlip[i] ? -labelSide[i] : labelSide[i];
      ctx.textAlign = side > 0 ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      const labelSize = isMobile ? (isActive ? 10.5 : 9) : (isActive ? 12 : 10.5);
      ctx.font = `${isActive ? '600' : '400'} ${labelSize}px ${fontFamily}`;
      ctx.fillStyle = isActive ? col : (dark ? '#d1d1d6' : '#48484a');
      const labelX = x + side * (DOT_R * scale + (isMobile ? 5 : 7));
      const labelY = y + labelOffsetY[i];
      ctx.fillText(nodes[i].name, labelX, labelY);

      if (isActive) {
        ctx.font = `400 9px ${fontFamily}`;
        ctx.fillStyle = dark ? '#8e8e93' : '#86868b';
        ctx.fillText(nodes[i].groupName, labelX, labelY + 14);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ── Hit testing ────────────────────────────────────────────
  function hitTest(ex: number, ey: number) {
    const rect = canvas.getBoundingClientRect();
    const mx = ex - rect.left, my = ey - rect.top;
    let best = -1, bestD2 = HIT_R * HIT_R;
    for (let i = 0; i < N; i++) {
      const dx = rx[i] - mx, dy = ry[i] - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = i; }
    }
    return best;
  }

  // ── Mouse events ───────────────────────────────────────────
  let mouseDownPos: { x: number; y: number } | null = null;

  canvas.addEventListener('mousemove', e => {
    if (dragIdx >= 0) {
      const rect = canvas.getBoundingClientRect();
      sx[dragIdx] = e.clientX - rect.left - cw / 2;
      sy[dragIdx] = e.clientY - rect.top - ch / 2;
      svx[dragIdx] = 0; svy[dragIdx] = 0;
      settled = false; settledFrames = 0;
      computeHome();
      return;
    }
    const idx = hitTest(e.clientX, e.clientY);
    if (idx !== hoverIdx) { hoverIdx = idx; canvas.style.cursor = idx >= 0 ? 'pointer' : 'default'; }
  });

  canvas.addEventListener('mousedown', e => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
    const idx = hitTest(e.clientX, e.clientY);
    if (idx >= 0) {
      dragIdx = idx;
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });

  // Listen on window so releasing outside canvas still ends the drag
  let wasDrag = false;
  window.addEventListener('mouseup', e => {
    if (dragIdx >= 0) {
      wasDrag = mouseDownPos != null && Math.hypot(e.clientX - mouseDownPos!.x, e.clientY - mouseDownPos!.y) > 5;
      // Check if it was a click (not a drag) to toggle lock
      if (!wasDrag) {
        lockedIdx = lockedIdx === dragIdx ? -1 : dragIdx;
      }
      dragIdx = -1;
      canvas.style.cursor = hoverIdx >= 0 ? 'pointer' : 'default';
    } else {
      wasDrag = false;
    }
    mouseDownPos = null;
  });

  // Click on empty space to dismiss lock (mouseup handles node clicks)
  canvas.addEventListener('click', e => {
    if (wasDrag) return;
    const idx = hitTest(e.clientX, e.clientY);
    // Only handle empty-space clicks here; node clicks handled in mouseup
    if (idx < 0) lockedIdx = -1;
  });

  canvas.addEventListener('mouseleave', () => {
    hoverIdx = -1;
    // Don't clear dragIdx here — mouseup on window handles it
    if (dragIdx < 0) canvas.style.cursor = 'default';
  });

  // ── Touch events ───────────────────────────────────────────
  let touchStartPos: { x: number; y: number } | null = null;

  canvas.addEventListener('touchstart', e => {
    const touch = e.touches[0];
    touchStartPos = { x: touch.clientX, y: touch.clientY };
    const idx = hitTest(touch.clientX, touch.clientY);
    if (idx >= 0) {
      dragIdx = idx;
      hoverIdx = idx;
      e.preventDefault();
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (dragIdx >= 0) {
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      sx[dragIdx] = touch.clientX - rect.left - cw / 2;
      sy[dragIdx] = touch.clientY - rect.top - ch / 2;
      svx[dragIdx] = 0; svy[dragIdx] = 0;
      settled = false; settledFrames = 0;
      computeHome();
      e.preventDefault();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    const touch = e.changedTouches[0];
    const wasTouchDrag = touchStartPos != null &&
      Math.hypot(touch.clientX - touchStartPos!.x, touch.clientY - touchStartPos!.y) > 10;
    if (dragIdx >= 0) {
      // Only toggle lock if it was a tap, not a drag
      if (!wasTouchDrag) {
        lockedIdx = lockedIdx === dragIdx ? -1 : dragIdx;
      }
      dragIdx = -1;
    } else {
      // Simple tap on empty space
      const idx = hitTest(touch.clientX, touch.clientY);
      if (idx >= 0) lockedIdx = lockedIdx === idx ? -1 : idx;
      else lockedIdx = -1;
      hoverIdx = lockedIdx;
    }
    touchStartPos = null;
  });

  // 1. Pause rAF when off-screen
  const visObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      isVisible = entry.isIntersecting;
      if (isVisible && !rafId) rafId = requestAnimationFrame(tick);
    });
  }, { threshold: 0.05 });
  visObs.observe(wrap);

  const resizeObs = new ResizeObserver(() => { resize(); settled = false; settledFrames = 0; });
  resizeObs.observe(wrap);

  resize();
  rafId = requestAnimationFrame(tick);
}

// ── Router: pick mode based on motion preference ────────────
function renderSkills(data: any) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return renderSkillsStatic(data);
  if (SKILLS_GRAPH_MODE === 2) return renderSkillsForce(data);
  return renderSkillsConstellation(data);
}

// ── Self-executing init ──────────────────────────────────────
(function init() {
  const el = document.getElementById('skills-data');
  if (!el) return;
  try {
    const data = JSON.parse(el.textContent || '');
    renderSkills(data);
  } catch (e) {
    console.error('skills-graph: failed to parse data island', e);
  }
})();
