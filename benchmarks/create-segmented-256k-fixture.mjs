import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), 'segmented-256k-fixture')
const segmentChars = 170_000
const record = 'record alpha delta harbor vector lantern granite orbit signal archive verify sequence '

function segment(index) {
  const head = index === 1
    ? 'SEGMENT_ONE_BEGIN PRIMARY=HYDRA-17. Preserve this exact primary value. '
    : `SEGMENT_${index}_BEGIN. `
  const tail = index === 4
    ? ' SEGMENT_FOUR_END SECONDARY=ORBIT-42. Preserve this exact secondary value.'
    : ` SEGMENT_${index}_END.`
  const bodyLength = segmentChars - head.length - tail.length
  return `${head}${record.repeat(Math.ceil(bodyLength / record.length)).slice(0, bodyLength)}${tail}`
}

await mkdir(root, { recursive: true })
for (let index = 1; index <= 4; index += 1) {
  await writeFile(join(root, `chunk-${index}.txt`), segment(index), 'utf8')
}
await writeFile(join(root, 'checkpoint-1.txt'), 'CHECKPOINT_ONE=verified. Continue to the second checkpoint.', 'utf8')
await writeFile(join(root, 'checkpoint-2.txt'), 'CHECKPOINT_TWO=verified. Produce the exact requested final status.', 'utf8')
await writeFile(
  join(root, 'task.txt'),
  [
    'This is a controlled long-context benchmark. Use only the read tool; do not call pwsh, write, edit, or any other tool.',
    'Read chunk-1.txt, chunk-2.txt, chunk-3.txt, chunk-4.txt, checkpoint-1.txt, then checkpoint-2.txt, in exactly that order.',
    'Do not summarize or answer until all six reads have completed.',
    'After the reads, reply with exactly this one line and nothing else:',
    'BENCHMARK_DONE: HYDRA-17|ORBIT-42|CHECKPOINTS-OK',
  ].join('\n'),
  'utf8',
)

console.log(JSON.stringify({ root, segmentChars, totalEvidenceChars: segmentChars * 4 }))
