import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCompressionReplacement,
  compressMedium,
  countCodePoints,
  formatCompressionNotice,
  headTailPreview,
  parseCompressionMarker,
  previewText,
} from '../src/compression.js'

const spillId = (character: string) => `sha256:${character.repeat(64)}`

test('small-result boundary is measured in Unicode code points', () => {
  assert.equal(countCodePoints('a😀'), 2)
})

test('medium compression removes ANSI and folds deterministic noise', () => {
  const input = '\u001b[32mline\u001b[0m\n\n\nline\nline\nline\nkeep  \n'
  assert.equal(
    compressMedium(input),
    'line\n\nline\n[line repeated x3]\nkeep\n',
  )
})

test('medium head/tail retention preserves both context ends', () => {
  const input = `head-${'a'.repeat(20)}MIDDLE${'b'.repeat(20)}-tail`
  const preview = headTailPreview(input, 8, 8)
  assert.match(preview, /^head-aaa/)
  assert.match(preview, /bb-tail$/)
  assert.match(preview, /chars omitted/)
})

test('medium compression is deterministic', () => {
  const input = 'header\n\n\nvalue\nvalue\nvalue\nfooter'
  assert.equal(compressMedium(input), compressMedium(input))
})

test('large preview preserves Unicode boundaries and is bounded before notice', () => {
  const input = '头😀尾'.repeat(1000)
  const preview = previewText(input, 100)
  assert.ok(preview.includes('chars omitted'))
  assert.ok(countCodePoints(preview) > 100)
  assert.ok(!preview.includes('\ufffd'))
})

test('SPILL_ID notice round-trips its durable marker', () => {
  const id = spillId('a')
  const notice = formatCompressionNotice('large', 20000, 19000, id)
  assert.deepEqual(parseCompressionMarker(notice), {
    mode: 'large',
    originalChars: 20000,
    savedChars: 19000,
    spillId: id,
  })
  assert.equal(parseCompressionMarker(`${notice}\nmore`), undefined)
})

test('compression marker reports the actual final replacement saving', () => {
  const original = 'value\n'.repeat(1000)
  const replacement = buildCompressionReplacement('medium', original, 'value', spillId('b'))
  assert.ok(replacement !== undefined)
  assert.equal(countCodePoints(original) - countCodePoints(replacement.text), replacement.savedChars)
  assert.equal(parseCompressionMarker(replacement.text)?.savedChars, replacement.savedChars)
  assert.match(replacement.text, /Content was trimmed, not lost/)
  assert.match(replacement.text, /retrieve_spill/)
})
