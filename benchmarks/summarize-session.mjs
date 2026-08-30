import { readFile } from 'node:fs/promises'
import { zstdDecompressSync } from 'node:zlib'

const sessionPath = process.argv[2]
const expectedFinal = process.argv[3]

if (sessionPath === undefined) {
  throw new Error('usage: node summarize-session.mjs <session.jsonl.zstd> [expected final text]')
}

const ZSTD_MAGIC = 0xFD2FB528

function scanZstdFrames(buffer) {
  const frames = []
  let offset = 0

  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4 || buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`invalid Zstandard frame at byte ${offset}`)
    }
    offset += 4
    if (offset === buffer.length) throw new Error(`incomplete Zstandard frame at byte ${start}`)

    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0) throw new Error(`reserved Zstandard frame bit at byte ${offset - 1}`)

    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const hasChecksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) throw new Error(`incomplete Zstandard header at byte ${start}`)
    offset += remainingHeaderBytes

    for (;;) {
      if (buffer.length - offset < 3) throw new Error(`incomplete Zstandard block at byte ${start}`)
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 3) throw new Error(`reserved Zstandard block type at byte ${offset - 3}`)
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) throw new Error(`incomplete Zstandard block payload at byte ${start}`)
      offset += payloadBytes
      if (lastBlock) break
    }

    if (hasChecksum) {
      if (buffer.length - offset < 4) throw new Error(`incomplete Zstandard checksum at byte ${start}`)
      offset += 4
    }
    frames.push({ start, end: offset })
  }

  return frames
}

function textFromContent(content) {
  if (!Array.isArray(content)) return undefined
  let text = ''
  for (const block of content) {
    if (block?.type !== 'text' || typeof block.text !== 'string') return undefined
    text += block.text
  }
  return text
}

function toolResultText(record) {
  const result = record?.data?.message?.content?.[0]
  return result?.type === 'tool-result' ? textFromContent(result.content) : undefined
}

function assistantText(record) {
  const message = record?.data?.message
  if (message?.role !== 'assistant' || !Array.isArray(message.content)) return undefined
  return message.content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

function usageSample(record) {
  const chunkUsage = record?.type === 'assistant/chunk' && record?.data?.chunk?.type === 'usage'
    ? record.data.chunk.usage
    : undefined
  const messageUsage = record?.type === 'assistant/message' ? record?.data?.usage : undefined
  const usage = chunkUsage ?? messageUsage
  const turn = record?.data?.turn
  const step = record?.data?.step
  if (usage === undefined || !Number.isInteger(turn) || !Number.isInteger(step)) return undefined
  return {
    turn,
    step,
    uncachedInputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
  }
}

const compressed = await readFile(sessionPath)
const records = []
for (const frame of scanZstdFrames(compressed)) {
  const plaintext = zstdDecompressSync(compressed.subarray(frame.start, frame.end)).toString('utf8')
  for (const line of plaintext.split('\n')) {
    if (line.trim().length > 0) records.push(JSON.parse(line))
  }
}

const typeCounts = {}
for (const record of records) typeCounts[record.type] = (typeCounts[record.type] ?? 0) + 1

const totals = {
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}
let lastUsage
for (const record of records) {
  const sample = usageSample(record)
  if (sample === undefined) continue
  const previous = lastUsage?.turn === sample.turn && lastUsage.step === sample.step ? lastUsage : undefined
  for (const key of Object.keys(totals)) totals[key] += sample[key] - (previous?.[key] ?? 0)
  lastUsage = sample
}

const summaryEvents = records.filter((record) => record.type === 'compaction/summary')
const pruneEvents = records.filter((record) => record.type === 'compaction/prune')
const spilledResults = records.filter((record) => /\[SPILL_ID: sha256:[a-f0-9]{64};/.test(toolResultText(record) ?? ''))
const assistantMessages = records.filter((record) => record.type === 'assistant/message')
const finalText = assistantText(assistantMessages.at(-1))?.trim() ?? ''
const latestRequest = [...records].reverse().find((record) => record.type === 'request/header')
const latestContext = [...records].reverse().find((record) => record.type === 'request/context')

console.log(JSON.stringify({
  session: records.find((record) => record.type === 'session')?.id,
  agentPreset: records.find((record) => record.type === 'session')?.agentPreset,
  latestRequest: latestRequest?.data?.header?.config ?? latestRequest?.data?.config,
  contextWindow: latestContext?.data?.contextWindow,
  totalRecords: records.length,
  typeCounts,
  promptTokens: totals.uncachedInputTokens + totals.cacheReadTokens + totals.cacheWriteTokens,
  usage: totals,
  compaction: {
    summaries: summaryEvents.length,
    shadowedTokens: summaryEvents.reduce((total, event) => total + (event.data?.shadowedTokenCount ?? 0), 0),
    prunes: pruneEvents.length,
  },
  spilledResults: spilledResults.length,
  qualityPass: expectedFinal === undefined ? undefined : finalText === expectedFinal,
}))
