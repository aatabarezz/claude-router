import { createHmac, createHash, randomBytes } from 'crypto'
import { createCipheriv, createDecipheriv } from 'crypto'

/**
 * Deterministic token generation using HMAC-SHA256.
 * Same PII value + type always produces the same token.
 *
 * @param piiValue - The PII value to tokenize (e.g., "john@example.com")
 * @param piiType - The PII type (e.g., "email")
 * @param secret - The vault secret (from PII_VAULT_SECRET env var)
 * @returns A deterministic token (e.g., "PII_7F3A2E")
 */
export function generateDeterministicToken(
  piiValue: string,
  piiType: string,
  secret: string
): string {
  const hmac = createHmac('sha256', secret)
  hmac.update(`${piiValue}:${piiType}`)
  const hash = hmac.digest('hex').substring(0, 6).toUpperCase()
  return `PII_${hash}`
}

/**
 * Generate SHA256 hash of a PII value for audit purposes.
 * This allows us to verify integrity without storing the original value.
 *
 * @param value - The PII value
 * @returns SHA256 hash (hex string)
 */
export function hashPiiValue(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Encrypt PII value using AES-256-GCM with the token as the key.
 * Returns {iv}:{ciphertext}:{authTag} combined.
 *
 * @param value - The PII value to encrypt
 * @param token - The token (used as encryption key)
 * @returns Encrypted value (base64-encoded {iv}:{ciphertext}:{authTag})
 */
export function encryptPiiValue(value: string, token: string): string {
  // Derive a 256-bit key from the token using SHA256
  const key = createHash('sha256').update(token).digest()

  // Generate a random IV (initialization vector)
  const iv = randomBytes(16)

  // Create cipher
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  // Encrypt the value
  let encrypted = cipher.update(value, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  // Get authentication tag
  const authTag = cipher.getAuthTag()

  // Combine: base64({iv}:{ciphertext}:{authTag})
  const combined = `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`
  return Buffer.from(combined).toString('base64')
}

/**
 * Decrypt a PII value that was encrypted with encryptPiiValue.
 *
 * @param encrypted - The encrypted value (from vault)
 * @param token - The token (used as decryption key)
 * @returns The original PII value
 * @throws Error if decryption fails (tampering detected)
 */
export function decryptPiiValue(encrypted: string, token: string): string {
  try {
    // Decode from base64
    const combined = Buffer.from(encrypted, 'base64').toString('hex')
    const [ivHex, ciphertext, authTagHex] = combined.split(':')

    // Reconstruct components
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    // Derive the same key
    const key = createHash('sha256').update(token).digest()

    // Create decipher
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    // Decrypt
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (err) {
    throw new Error(
      `Failed to decrypt PII value (tampering or wrong key?): ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/**
 * Vault entry interface for storing encrypted PII
 */
export interface VaultEntry {
  id: string
  token: string
  message_id: string
  user_id: string
  department_id: string
  pii_type: string
  pii_hash: string
  original_encrypted: string
  confidence: number
  detector_used: string
  detected_at: string
  created_at: string
  updated_at: string
  ttl_expires_at: string | null
}
