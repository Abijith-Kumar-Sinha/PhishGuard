// Tier-1 ML hybrid — inference.
//
// The "model" is ~19 floats bundled in modelWeights.ts. A verdict is just the
// classic feature extractor followed by one dot product:
//     p = sigmoid( bias + Σ wⱼ · (xⱼ − meanⱼ)/stdⱼ )
// No runtime dependency, no network, sub-millisecond. Because the model is
// linear, every prediction decomposes into per-feature contributions, so the
// ML path stays as explainable as the rule path.
import type { Level } from './scoring'
import { extractFeatures } from './features'
import { MODEL } from '../data/modelWeights'

export interface MLContribution {
  feature: string
  value: number // raw feature value
  contribution: number // wⱼ · standardized(value); >0 pushes toward phishing
}

export interface MLVerdict {
  host: string
  probability: number // P(phishing) in [0,1]
  level: Level
  contributions: MLContribution[] // sorted by |contribution|, descending
}

export function predictML(input: string): MLVerdict {
  const { names, values } = extractFeatures(input)
  const contributions: MLContribution[] = values.map((v, j) => {
    const std = MODEL.std[j] || 1
    return { feature: names[j], value: v, contribution: MODEL.weights[j] * ((v - MODEL.mean[j]) / std) }
  })
  let logit = MODEL.bias
  for (const c of contributions) logit += c.contribution
  const probability = 1 / (1 + Math.exp(-logit))
  const level: Level =
    probability >= MODEL.blockThreshold ? 'dangerous' : probability >= MODEL.warnThreshold ? 'suspicious' : 'safe'
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  return { host: input, probability, level, contributions }
}
