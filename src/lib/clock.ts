/** ISO-string clock, injectable at call sites that need determinism (tests pass explicit times). */
export const nowIso = (): string => new Date().toISOString()
