/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
export const JUMPER = {
  gravity: 1,
  jumpVy: 5,
  playerX: 5,
  playerW: 3,
  obW: 2,
  obH: 3,
  spawnX: 34,
  minGap: 16,
  jitter: 8,
  firstSpawn: 28,
  maxTicks: 900,
  tickMs: 50,
} as const;

export type Obstacle = { x: number; passed: boolean };

export type JumperState = {
  tick: number;
  y: number;
  vy: number;
  alive: boolean;
  score: number;
  obstacles: Obstacle[];
  spawnIndex: number;
  spawns: number[];
};

export function hash32(input: string, index: number): number {
  let hash = 2166136261 ^ (index + 1);
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  return hash >>> 0;
}

export function planSpawns(seed: string, maxTicks = JUMPER.maxTicks): number[] {
  const spawns: number[] = [];
  let tick = JUMPER.firstSpawn;
  let index = 0;
  while (tick < maxTicks - 10) {
    spawns.push(tick);
    const jitter = hash32(seed, index) % (JUMPER.jitter + 1);
    tick += JUMPER.minGap + jitter;
    index += 1;
  }
  return spawns;
}

export function createJumper(seed: string): JumperState {
  return {
    tick: 0,
    y: 0,
    vy: 0,
    alive: true,
    score: 0,
    obstacles: [],
    spawnIndex: 0,
    spawns: planSpawns(seed),
  };
}

export function stepJumper(state: JumperState, jump: boolean): void {
  if (!state.alive) return;
  if (state.spawns[state.spawnIndex] === state.tick) {
    state.obstacles.push({ x: JUMPER.spawnX, passed: false });
    state.spawnIndex += 1;
  }
  if (jump && state.y === 0 && state.vy === 0) {
    state.vy = JUMPER.jumpVy;
  }
  state.vy -= JUMPER.gravity;
  state.y += state.vy;
  if (state.y <= 0) {
    state.y = 0;
    state.vy = 0;
  }
  for (const obstacle of state.obstacles) {
    obstacle.x -= 1;
    const overlaps =
      obstacle.x < JUMPER.playerX + JUMPER.playerW && obstacle.x + JUMPER.obW > JUMPER.playerX;
    if (overlaps && state.y < JUMPER.obH) state.alive = false;
    if (!obstacle.passed && obstacle.x + JUMPER.obW <= JUMPER.playerX) {
      obstacle.passed = true;
      state.score += 1;
    }
  }
  state.obstacles = state.obstacles.filter((obstacle) => obstacle.x > -8);
  state.tick += 1;
  if (state.tick >= JUMPER.maxTicks) state.alive = false;
}

export function simulateJumper(seed: string, jumps: number[]): JumperState {
  if (jumps.length > 400) throw new Error("troppi salti");
  for (let i = 0; i < jumps.length; i++) {
    const tick = jumps[i];
    if (!Number.isInteger(tick) || tick === undefined || tick < 0 || tick >= JUMPER.maxTicks) {
      throw new Error("salto non valido");
    }
    if (i > 0 && tick <= jumps[i - 1]!) throw new Error("salti non in ordine");
  }
  const state = createJumper(seed);
  const jumpSet = new Set(jumps);
  while (state.alive && state.tick < JUMPER.maxTicks) {
    stepJumper(state, jumpSet.has(state.tick));
  }
  return state;
}
