import '@deepseek-ai/dsh-client-ui-conversation/client'
import '@deepseek-ai/dsh-client-ui-renderer/client'
import '@deepseek-ai/dsh-client-ui-session/client'
import type { ConversationNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'

type Dock = PropsRuntime<'conversation.composer.dock'>
type Standard = SessionStandardProps
const standard: Standard = null as never
const probe = (value: Dock): { sessionId: unknown; useProjection: unknown } => value
void probe
void standard
void (undefined as unknown as ConversationNode)
