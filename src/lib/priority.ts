/**
 * v2.1 priority model (plan §5.2): Impact × Risk × (1 − Confidence).
 * Impact/Risk 1–5; Confidence 0–1 or null — null means "evidence not assessed"
 * and counts as 0 (full verification weight). priorityScore is ALWAYS derived:
 * no write path may accept it as input (schemas only default it to 0 so that
 * legacy rows missing the field normalize on read).
 */
export interface ScoreInputs {
  impact: number
  risk: number
  confidence: number | null
}

export function computePriorityScore({ impact, risk, confidence }: ScoreInputs): number {
  const raw = impact * risk * (1 - (confidence ?? 0))
  return Math.round(raw * 100) / 100
}
