import { createHash } from 'crypto'

export type PiiTier = 'P0' | 'P1' | 'P2' | 'P3'

export interface PiiEntity {
  type: string
  tier: PiiTier
  original: string
  placeholder: string
}

export interface PiiResult {
  maskedText: string
  entities: PiiEntity[]
  mapping: Record<string, string>
}

// P0: Public — company/org names (low risk, publicly available)
// P1: Internal Personal Data — name, email, phone, address
// P2: Confidential Personal Data — national ID, passport, IBAN, tax ID, credit card
// P3: Restricted/Sensitive — health, medical, biometric, religion, political, criminal

const PATTERNS: Array<{ type: string; tier: PiiTier; regex: RegExp }> = [
  // P3 — Restricted/Sensitive (run first so they don't get partially matched by P1/P2)
  { tier: 'P3', type: 'HEALTH_CONDITION',  regex: /\b(diabetes|cancer|HIV|AIDS|hypertension|depression|anxiety|epilepsy|schizophrenia|alzheimer|tumor|chemotherapy|diagnosis|chronic illness)\b/gi },
  { tier: 'P3', type: 'RELIGION',          regex: /\b(muslim|christian|jewish|hindu|buddhist|atheist|catholic|protestant|sunni|shia|alevi)\b/gi },
  { tier: 'P3', type: 'POLITICAL_VIEW',    regex: /\b(AKP|CHP|HDP|MHP|İYİP|left.wing|right.wing|communist|nationalist|liberal|conservative) (member|voter|supporter|üye|seçmen)\b/gi },
  { tier: 'P3', type: 'BIOMETRIC',         regex: /\b(fingerprint|parmak izi|face recognition|yüz tanıma|retina scan|iris scan|voice print)\b/gi },

  // P2 — Confidential Personal Data
  { tier: 'P2', type: 'TCKN',             regex: /\b[1-9][0-9]{10}\b/g },
  { tier: 'P2', type: 'IBAN',             regex: /\bTR\d{2}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?\d{2}\b/gi },
  { tier: 'P2', type: 'PASSPORT',         regex: /\b[A-Z]{1,2}[0-9]{6,9}\b/g },
  { tier: 'P2', type: 'CREDIT_CARD',      regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g },
  { tier: 'P2', type: 'TAX_ID',           regex: /\bvergi\s*no[:\s]+\d{10}\b/gi },

  // P1 — Internal Personal Data
  { tier: 'P1', type: 'EMAIL',            regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi },
  { tier: 'P1', type: 'PHONE',            regex: /\b(?:\+90|0)?[ -]?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}\b/g },
  { tier: 'P1', type: 'PERSON',           regex: /\b([A-ZÇĞİÖŞÜ][a-zçğışöşü]+ [A-ZÇĞİÖŞÜ][a-zçğışöşü]+)\b/g },
  { tier: 'P1', type: 'DATE_OF_BIRTH',    regex: /\b(0?[1-9]|[12][0-9]|3[01])[\/\-.](0?[1-9]|1[012])[\/\-.](19|20)\d{2}\b/g },
  { tier: 'P1', type: 'HOME_ADDRESS',     regex: /\b(mahalle|sokak|cadde|apt\.|kat\s+\d|daire\s+\d|no:\s*\d)\b/gi },

  // P0 — Public Information
  { tier: 'P0', type: 'ORG_NAME',         regex: /\b[A-ZÇĞİÖŞÜ][A-Za-zçğışöşü]+ (?:A\.Ş\.|Ltd\.|Holding|Grup|Bank|Bankası|Sigorta|Teknoloji)\b/g },
]

export const TIER_LABELS: Record<PiiTier, string> = {
  P0: 'P0 — Public',
  P1: 'P1 — Internal Personal Data',
  P2: 'P2 — Confidential Personal Data',
  P3: 'P3 — Restricted / Sensitive',
}

export const TIER_COLORS: Record<PiiTier, string> = {
  P0: 'text-slate-400',
  P1: 'text-yellow-400',
  P2: 'text-orange-400',
  P3: 'text-red-500',
}

export function maskPii(text: string): PiiResult {
  const entities: PiiEntity[] = []
  const mapping: Record<string, string> = {}
  const counters: Record<string, number> = {}
  let maskedText = text

  for (const { type, tier, regex } of PATTERNS) {
    regex.lastIndex = 0
    maskedText = maskedText.replace(regex, (match) => {
      counters[type] = (counters[type] ?? 0) + 1
      const placeholder = `<${type}_${counters[type]}>`
      entities.push({ type, tier, original: match, placeholder })
      mapping[placeholder] = match
      return placeholder
    })
  }

  return { maskedText, entities, mapping }
}

export function restorePii(text: string, mapping: Record<string, string>): string {
  let restored = text
  for (const [placeholder, original] of Object.entries(mapping)) {
    restored = restored.replaceAll(placeholder, original)
  }
  return restored
}

export function hashMapping(mapping: Record<string, string>): string {
  return createHash('sha256').update(JSON.stringify(mapping)).digest('hex')
}
