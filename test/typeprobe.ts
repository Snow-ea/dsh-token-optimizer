import '@deepseek-ai/dsh-client-runtime/client'
import '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'

type Dock = PropsRuntime<'conversation.composer.dock'>
type Standard = SessionStandardProps
const standard: Standard = null as never
const probe = (value: Dock): { session: unknown; useProjection: unknown } => value
void probe
void standard
void (undefined as unknown as ConversationNode)
