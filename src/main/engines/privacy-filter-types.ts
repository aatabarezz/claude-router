// OpenAI Privacy Filter output types

export interface PrivacyFilterSpan {
  text: string
  label: string // "private_email", "private_phone", "account_number", etc
  start: number // character index
  end: number
  confidence?: number // 0.0 - 1.0
}

export interface PrivacyFilterOutput {
  spans: PrivacyFilterSpan[]
}

export interface PrivacyFilterResult {
  success: boolean
  spans: PrivacyFilterSpan[]
  error?: string
  processingTimeMs?: number
}

// Mapping from Privacy Filter labels to our internal PII types
export const PRIVACY_FILTER_LABEL_MAP: Record<string, string> = {
  'private_email': 'email',
  'private_phone': 'phone',
  'private_person': 'person',
  'private_address': 'address',
  'account_number': 'account_number',
  'private_date': 'private_date',
  'private_url': 'private_url',
  'secret': 'secret',
}
