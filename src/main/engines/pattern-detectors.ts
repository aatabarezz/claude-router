/**
 * Supplementary pattern-based PII detectors.
 * These complement OpenAI Privacy Filter with domain-specific patterns.
 */

export interface DetectedPii {
  type: string // "email", "phone", "credit_card", "tckn", "iban", etc
  value: string // The detected PII value
  start: number // Character index in text
  end: number
  detector: string // Which detector found it ("pattern_email", "pattern_tckn", etc)
  confidence: number // 0.0 - 1.0
}

// Email detector: RFC 5322 simplified
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

export function detectEmails(text: string): DetectedPii[] {
  const results: DetectedPii[] = []
  let match

  // Reset lastIndex for global regex
  EMAIL_PATTERN.lastIndex = 0

  while ((match = EMAIL_PATTERN.exec(text)) !== null) {
    results.push({
      type: 'email',
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
      detector: 'pattern_email',
      confidence: 0.98,
    })
  }

  return results
}

// Phone detector: Turkish formats (+90, 0, international)
// Supports formats: +90 5XX XXX XXXX, 05XX XXX XXXX, (5XX) XXX-XXXX, 5XXXXXXXXXX, etc
const PHONE_PATTERNS = [
  /\+90\s?(\(?\d{3}\)?\s?\d{3}\s?\d{4}|\d{10})/g, // +90 format
  /0(\(?\d{3}\)?\s?\d{3}\s?\d{4}|\d{9})/g, // 0 prefix (national)
  /(?<![0-9])[5][0-9]{2}(?:\s|-)?[0-9]{3}(?:\s|-)?[0-9]{4}(?![0-9])/g, // 5XX XXX XXXX
]

export function detectPhoneNumbers(text: string): DetectedPii[] {
  const results: DetectedPii[] = []
  const seen = new Set<string>() // Deduplicate

  for (const pattern of PHONE_PATTERNS) {
    let match
    pattern.lastIndex = 0

    while ((match = pattern.exec(text)) !== null) {
      const value = match[0].trim()
      if (!seen.has(value)) {
        seen.add(value)
        results.push({
          type: 'phone',
          value,
          start: match.index,
          end: match.index + match[0].length,
          detector: 'pattern_phone',
          confidence: 0.92,
        })
      }
    }
  }

  return results
}

// Credit card detector: Visa, Mastercard, Amex with Luhn validation
const CREDIT_CARD_PATTERN = /\b(?:\d{4}[\s-]?){3}\d{4}\b/g

function luhnCheck(cc: string): boolean {
  const digits = cc.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false

  let sum = 0
  let isEven = false

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10)

    if (isEven) {
      digit *= 2
      if (digit > 9) digit -= 9
    }

    sum += digit
    isEven = !isEven
  }

  return sum % 10 === 0
}

export function detectCreditCards(text: string): DetectedPii[] {
  const results: DetectedPii[] = []
  let match

  CREDIT_CARD_PATTERN.lastIndex = 0

  while ((match = CREDIT_CARD_PATTERN.exec(text)) !== null) {
    const value = match[0]
    if (luhnCheck(value)) {
      results.push({
        type: 'credit_card',
        value,
        start: match.index,
        end: match.index + match[0].length,
        detector: 'pattern_credit_card',
        confidence: 0.95,
      })
    }
  }

  return results
}

// IBAN detector: Turkish IBAN (TR32 format)
const IBAN_PATTERN = /TR\d{2}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{2}/gi

export function detectIbans(text: string): DetectedPii[] {
  const results: DetectedPii[] = []
  let match

  IBAN_PATTERN.lastIndex = 0

  while ((match = IBAN_PATTERN.exec(text)) !== null) {
    results.push({
      type: 'iban',
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
      detector: 'pattern_iban',
      confidence: 0.96,
    })
  }

  return results
}

// TCKN detector: Turkish ID (11 digits, first digit 1-9)
const TCKN_PATTERN = /\b[1-9]\d{10}\b/g

export function detectTckn(text: string): DetectedPii[] {
  const results: DetectedPii[] = []
  let match

  TCKN_PATTERN.lastIndex = 0

  while ((match = TCKN_PATTERN.exec(text)) !== null) {
    results.push({
      type: 'tckn',
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
      detector: 'pattern_tckn',
      confidence: 0.93,
    })
  }

  return results
}

// Passport detector: Country code (1-2 letters) + 6-9 digits
const PASSPORT_PATTERN = /\b[A-Z]{1,2}\d{6,9}\b/g

export function detectPassports(text: string): DetectedPii[] {
  const results: DetectedPii[] = []
  let match

  PASSPORT_PATTERN.lastIndex = 0

  while ((match = PASSPORT_PATTERN.exec(text)) !== null) {
    results.push({
      type: 'passport',
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
      detector: 'pattern_passport',
      confidence: 0.85, // Lower confidence due to false positives
    })
  }

  return results
}

// Date of birth detector: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
const DATE_PATTERNS = [
  /\b(0[1-9]|[12]\d|3[01])[/-](0[1-9]|1[012])[/-](\d{4})\b/g, // DD/MM/YYYY
  /\b(\d{4})[/-](0[1-9]|1[012])[/-](0[1-9]|[12]\d|3[01])\b/g, // YYYY-MM-DD
]

export function detectDates(text: string): DetectedPii[] {
  const results: DetectedPii[] = []
  const seen = new Set<string>()

  for (const pattern of DATE_PATTERNS) {
    let match
    pattern.lastIndex = 0

    while ((match = pattern.exec(text)) !== null) {
      const value = match[0]
      if (!seen.has(value)) {
        seen.add(value)
        results.push({
          type: 'private_date',
          value,
          start: match.index,
          end: match.index + match[0].length,
          detector: 'pattern_date',
          confidence: 0.88,
        })
      }
    }
  }

  return results
}

// Expiry date detector: MM/YY, MM/YYYY
const EXPIRY_PATTERN = /\b(0[1-9]|1[012])\/(\d{2}|\d{4})\b/g

export function detectExpiryDates(text: string): DetectedPii[] {
  const results: DetectedPii[] = []
  let match

  EXPIRY_PATTERN.lastIndex = 0

  while ((match = EXPIRY_PATTERN.exec(text)) !== null) {
    results.push({
      type: 'expiry_date',
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
      detector: 'pattern_expiry',
      confidence: 0.85,
    })
  }

  return results
}

// CVV detector: 3-4 digits in card context (after card number)
// Note: This is very basic and may have false positives
const CVV_PATTERN = /(?:cvv|cvc|cvc2|cvv2)[\s:]*(\d{3,4})/gi

export function detectCvv(text: string): DetectedPii[] {
  const results: DetectedPii[] = []
  let match

  CVV_PATTERN.lastIndex = 0

  while ((match = CVV_PATTERN.exec(text)) !== null) {
    results.push({
      type: 'cvv',
      value: match[1],
      start: match.index + match[0].indexOf(match[1]),
      end: match.index + match[0].length,
      detector: 'pattern_cvv',
      confidence: 0.80,
    })
  }

  return results
}

// Tax ID detector: Turkish tax ID (10 digits after "vergi no" keyword)
const TAX_ID_PATTERN = /(?:vergi\s*no[.:]?\s*|tax\s*id\s*:\s*)(\d{10})/gi

export function detectTaxIds(text: string): DetectedPii[] {
  const results: DetectedPii[] = []
  let match

  TAX_ID_PATTERN.lastIndex = 0

  while ((match = TAX_ID_PATTERN.exec(text)) !== null) {
    results.push({
      type: 'tax_id',
      value: match[1],
      start: match.index + match[0].indexOf(match[1]),
      end: match.index + match[0].length,
      detector: 'pattern_tax_id',
      confidence: 0.94,
    })
  }

  return results
}

/**
 * Run all pattern detectors on the given text.
 * Returns merged and deduplicated results.
 */
export function detectAllPatterns(text: string): DetectedPii[] {
  const all: DetectedPii[] = [
    ...detectEmails(text),
    ...detectPhoneNumbers(text),
    ...detectCreditCards(text),
    ...detectIbans(text),
    ...detectTckn(text),
    ...detectPassports(text),
    ...detectDates(text),
    ...detectExpiryDates(text),
    ...detectCvv(text),
    ...detectTaxIds(text),
  ]

  // Remove duplicates (same value at same position)
  const seen = new Set<string>()
  const deduplicated: DetectedPii[] = []

  for (const item of all) {
    const key = `${item.type}:${item.value}:${item.start}`
    if (!seen.has(key)) {
      seen.add(key)
      deduplicated.push(item)
    }
  }

  // Sort by position for consistent ordering
  return deduplicated.sort((a, b) => a.start - b.start)
}
