import { spawn } from 'child_process'
import { PrivacyFilterOutput, PrivacyFilterResult, PRIVACY_FILTER_LABEL_MAP } from './privacy-filter-types'

let processingTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Run OpenAI Privacy Filter via subprocess.
 * Communicates with the 'opf' CLI tool via stdin/stdout.
 * The model is downloaded automatically to ~/.opf/privacy_filter if not present.
 *
 * @param text - Text to analyze for PII (up to 128k tokens)
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns Detected PII spans with normalized type names
 */
export async function runPrivacyFilter(
  text: string,
  timeoutMs: number = 30000
): Promise<PrivacyFilterResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()

    // Spawn the 'opf redact' subprocess
    const process = spawn('opf', ['redact', '--format', 'json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
    })

    let output = ''
    let errorOutput = ''

    // Handle stdout (JSON output)
    process.stdout.on('data', (data) => {
      output += data.toString()
    })

    // Handle stderr (errors/warnings)
    process.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    // Clear any existing timeout
    if (processingTimeout) clearTimeout(processingTimeout)

    // Set timeout to kill the process if it takes too long
    processingTimeout = setTimeout(() => {
      process.kill('SIGTERM')
    }, timeoutMs)

    // Handle process completion
    process.on('close', (code) => {
      clearTimeout(processingTimeout!)
      processingTimeout = null

      const processingTimeMs = Date.now() - startTime

      if (code !== 0) {
        return resolve({
          success: false,
          spans: [],
          error: `Privacy Filter process exited with code ${code}: ${errorOutput}`,
          processingTimeMs,
        })
      }

      try {
        // Parse JSON output from Privacy Filter
        const result = JSON.parse(output) as PrivacyFilterOutput

        // Normalize label names
        const spans = result.spans.map((span) => ({
          ...span,
          // Map Privacy Filter label to our internal type
          label: PRIVACY_FILTER_LABEL_MAP[span.label] || span.label,
          // Set confidence if not provided
          confidence: span.confidence ?? 0.95,
        }))

        return resolve({
          success: true,
          spans,
          processingTimeMs,
        })
      } catch (err) {
        return resolve({
          success: false,
          spans: [],
          error: `Failed to parse Privacy Filter output: ${err instanceof Error ? err.message : String(err)}`,
          processingTimeMs,
        })
      }
    })

    // Handle process errors (e.g., 'opf' not found)
    process.on('error', (err) => {
      clearTimeout(processingTimeout!)
      processingTimeout = null

      resolve({
        success: false,
        spans: [],
        error: `Failed to spawn Privacy Filter process: ${err.message}`,
        processingTimeMs: Date.now() - startTime,
      })
    })

    // Send text to Privacy Filter via stdin
    process.stdin.write(text)
    process.stdin.end()
  })
}

/**
 * Check if Privacy Filter is available by attempting to run 'opf --version'
 */
export async function checkPrivacyFilterAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const process = spawn('opf', ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    })

    process.on('close', (code) => {
      resolve(code === 0)
    })

    process.on('error', () => {
      resolve(false)
    })
  })
}
