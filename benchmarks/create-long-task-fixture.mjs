import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), 'long-task-fixture')
const targetChars = 2_700_000
const head = 'BENCHMARK_EVIDENCE_BEGIN PRIMARY=HYDRA-17. Preserve this exact primary value. '
const tail = ' BENCHMARK_EVIDENCE_END SECONDARY=ORBIT-42. Preserve this exact secondary value.'
const record = 'record alpha delta harbor vector lantern granite orbit signal archive verify sequence '
const bodyLength = targetChars - head.length - tail.length
const body = record.repeat(Math.ceil(bodyLength / record.length)).slice(0, bodyLength)

await mkdir(root, { recursive: true })
await writeFile(join(root, 'evidence.txt'), `${head}${body}${tail}`, 'utf8')
await writeFile(join(root, 'checkpoint-1.txt'), 'CHECKPOINT_ONE=verified. Continue to the second checkpoint.', 'utf8')
await writeFile(join(root, 'checkpoint-2.txt'), 'CHECKPOINT_TWO=verified. Produce the exact requested final status.', 'utf8')
await writeFile(
  join(root, 'task.txt'),
  [
    'This is a controlled long-context benchmark. Use only the read tool; do not call pwsh, write, edit, or any other tool.',
    'First, read evidence.txt exactly once with limit=1. Then read checkpoint-1.txt and checkpoint-2.txt in that order.',
    'Do not summarize or answer until all three reads have completed.',
    'After the reads, reply with exactly this one line and nothing else:',
    'BENCHMARK_DONE: HYDRA-17|ORBIT-42|CHECKPOINTS-OK',
  ].join('\n'),
  'utf8',
)

console.log(JSON.stringify({ root, evidenceChars: targetChars }))
