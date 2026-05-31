import type { UseMcpAppsChatResult } from '@ggui-ai/react/chat-helpers';

export type AppMessageHandler = UseMcpAppsChatResult['handleAppMessage'];

export type LayoutMode = 'inline' | 'panel';

export type AuthState = 'checking' | 'authenticated' | 'unauthenticated';
