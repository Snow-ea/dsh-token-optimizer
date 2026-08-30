export type CompressionMode = 'medium' | 'large'

export interface CompressionMarker {
  readonly mode: CompressionMode
  readonly originalChars: number
  readonly savedChars: number
  readonly spillId: string
}

export const TOKEN_OPTIMIZER_MARKER = 'dsh-token-optimizer'

const ANSI_ESCAPE_PATTERN = /\u001B\](?:[^\u0007]|\u0007(?!))*?(?:\u0007|\u001B\\)|\u001B\[[0-?]*[ -/]*[@-~]|\u001B[()][0-2A-Z]/g
const ANSI_C1_PATTERN = /\u009B[0-?]*[ -/]*[@-~]/g
const SPILL_ID_PATTERN = 'sha256:[a-f0-9]{64}'
const MARKER_PATTERN = new RegExp(
  `(?:^|\\n\\n)\\[SPILL_ID: (${SPILL_ID_PATTERN}); mode=(medium|large); original=([0-9]+); saved=([0-9]+)\\] ` +
    `Content was trimmed, not lost. Retrieve the complete original with retrieve_spill\\(spillId="(${SPILL_ID_PATTERN})"\\)\\.$`,
)

export function countCodePoints(text: string): number {
  return Array.from(text).length
}

/** Remove CSI, OSC, and common single-character ANSI control sequences. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_PATTERN, '').replace(ANSI_C1_PATTERN, '')
}

/** Keep at most one empty line between non-empty lines. */
export function foldBlankLines(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const folded: string[] = []

  for (const sourceLine of lines) {
    const line = sourceLine.replace(/[ \t]+$/g, '')
    if (line.trim().length === 0) {
      if (folded.length === 0 || folded[folded.length - 1] !== '') folded.push('')
      continue
    }
    folded.push(line)
  }

  return folded.join('\n')
}

/** Replace a run of three or more identical lines with one line and a marker. */
export function foldRepeatedLines(text: string): string {
  const lines = text.split('\n')
  const folded: string[] = []

  for (let index = 0; index < lines.length;) {
    const line = lines[index]
    let end = index + 1
    while (end < lines.length && lines[end] === line) end += 1
    const count = end - index

    if (count >= 3 && line.trim().length > 0) {
      folded.push(line, `[line repeated x${count}]`)
    } else {
      for (let cursor = index; cursor < end; cursor += 1) folded.push(lines[cursor])
    }
    index = end
  }

  return folded.join('\n')
}

/** Deterministic medium-result normalization before bounded head/tail retention. */
export function compressMedium(text: string): string {
  return foldRepeatedLines(foldBlankLines(stripAnsi(text)))
}

/** Keep a deterministic head/tail body, measured in Unicode code points. */
export function headTailPreview(text: string, headChars: number, tailChars: number): string {
  const points = Array.from(text)
  if (points.length <= headChars + tailChars) return text

  const head = points.slice(0, headChars).join('')
  const tail = tailChars > 0 ? points.slice(-tailChars).join('') : ''
  const omitted = points.length - headChars - tailChars
  return `${head}\n\n[... ${omitted} chars omitted ...]\n\n${tail}`
}

/** Keep a deterministic symmetric head/tail preview. */
export function previewText(text: string, maxChars: number): string {
  if (maxChars <= 0) return `[... ${countCodePoints(text)} chars omitted ...]`
  return headTailPreview(text, Math.ceil(maxChars / 2), Math.floor(maxChars / 2))
}

export function formatCompressionNotice(
  mode: CompressionMode,
  originalChars: number,
  savedChars: number,
  spillId: string,
): string {
  return `[SPILL_ID: ${spillId}; mode=${mode}; original=${originalChars}; saved=${savedChars}] ` +
    `Content was trimmed, not lost. Retrieve the complete original with retrieve_spill(spillId="${spillId}").`
}

export interface CompressionReplacement {
  readonly text: string
  /** Actual code points removed from the complete model-facing replacement. */
  readonly savedChars: number
}

/**
 * Build a deterministic replacement whose marker reports the actual reduction,
 * including the marker and retrieval instruction themselves.
 */
export function buildCompressionReplacement(
  mode: CompressionMode,
  original: string,
  body: string,
  spillId: string,
): CompressionReplacement | undefined {
  const originalChars = countCodePoints(original)
  let savedChars = Math.max(0, originalChars - countCodePoints(body))

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const notice = formatCompressionNotice(mode, originalChars, savedChars, spillId)
    const text = `${body}\n\n${notice}`
    const nextSavedChars = Math.max(0, originalChars - countCodePoints(text))
    if (nextSavedChars === savedChars) {
      return nextSavedChars > 0 ? { text, savedChars: nextSavedChars } : undefined
    }
    savedChars = nextSavedChars
  }

  return undefined
}

export function parseCompressionMarker(text: string): CompressionMarker | undefined {
  const match = MARKER_PATTERN.exec(text)
  if (match === null) return undefined

  const originalChars = Number(match[3])
  const savedChars = Number(match[4])
  if (
    !Number.isSafeInteger(originalChars) ||
    !Number.isSafeInteger(savedChars) ||
    originalChars < 0 ||
    savedChars < 0 ||
    savedChars > originalChars ||
    match[1] !== match[5]
  ) {
    return undefined
  }

  return {
    spillId: match[1],
    mode: match[2] === 'medium' ? 'medium' : 'large',
    originalChars,
    savedChars,
  }
}
