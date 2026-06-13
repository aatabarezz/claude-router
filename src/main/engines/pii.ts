import { createHash } from 'crypto'

export interface PiiEntity {
  type: string
  original: string
  placeholder: string
}

export interface PiiResult {
  maskedText: string
  entities: PiiEntity[]
  mapping: Record<string, string>
}

const PATTERNS: Array<{ type: string; regex: RegExp }> = [
  { type: 'TCKN', regex: /\b[1-9][0-9]{10}\b/g },
  { type: 'IBAN', regex: /\bTR\d{2}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?\d{2}\b/gi },
  { type: 'EMAIL', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: 'PHONE', regex: /\b(?:\+90|0)?[ -]?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}\b/g },
  { type: 'PERSON', regex: /\b([A-ZÇĞİÖŞÜ][a-zçğışöşü]+ [A-ZÇĞİÖŞÜ][a-zçğışöşü]+)\b/g },
]

export function maskPii(text: string): PiiResult {
  const entities: PiiEntity[] = []
  const mapping: Record<string, string> = {}
  const counters: Record<string, number> = {}
  let maskedText = text

  for (const { type, regex } of PATTERNS) {
    regex.lastIndex = 0 // reset stateful regex
    maskedText = maskedText.replace(regex, (match) => {
      counters[type] = (counters[type] ?? 0) + 1
      const placeholder = `<${type}_${counters[type]}>`
      entities.push({ type, original: match, placeholder })
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
