/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
export type ReflexJudgement = {
  foul: boolean;
  slow: boolean;
  suspicious: boolean;
  ms: number;
};

export function judgeReflex(targetAt: number, tappedAt: number): ReflexJudgement {
  const ms = tappedAt - targetAt;
  if (ms < 0) return { foul: true, slow: false, suspicious: false, ms };
  if (ms < 80) return { foul: false, slow: false, suspicious: true, ms };
  if (ms > 2000) return { foul: false, slow: true, suspicious: false, ms };
  return { foul: false, slow: false, suspicious: false, ms };
}

export function reflexBlocked(result: ReflexJudgement): boolean {
  return result.foul || result.slow || result.suspicious;
}
