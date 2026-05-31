import type {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  RefObject,
} from 'react';
import type {
  ChatEntry,
  RenderRef,
} from '@ggui-ai/react/chat-helpers';
import { AinderProduct } from './AinderProduct';
import { ChatEntryView } from './ChatEntryView';
import { PanelView } from './RenderFrame';
import type { AppMessageHandler, LayoutMode } from './chatTypes';

interface AgentConsoleProps {
  readonly agentEndpoint: string;
  readonly sandboxUrl: string;
  readonly entries: ReadonlyArray<ChatEntry>;
  readonly renders: ReadonlyArray<RenderRef>;
  readonly sending: boolean;
  readonly prompt: string;
  readonly layout: LayoutMode;
  readonly historyRef: RefObject<HTMLDivElement | null>;
  readonly getAuthToken: () => string | undefined;
  readonly onAppMessage: AppMessageHandler;
  readonly onPromptChange: (value: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onAbort: () => void;
  readonly onLogout: () => void;
  readonly onLaunchPrompt: (prompt: string) => void;
  readonly onResetConversation: () => void;
  readonly onSetLayout: (layout: LayoutMode) => void;
}

export function AgentConsole({
  agentEndpoint,
  sandboxUrl,
  entries,
  renders,
  sending,
  prompt,
  layout,
  historyRef,
  getAuthToken,
  onAppMessage,
  onPromptChange,
  onSubmit,
  onKeyDown,
  onAbort,
  onLogout,
  onLaunchPrompt,
  onResetConversation,
  onSetLayout,
}: AgentConsoleProps) {
  return (
    <div className={`layout layout-${layout}`}>
      <aside className="chat">
        <header>
          <div className="title">
            <div className="brand-lockup">
              <span className="brand-mark">A</span>
              <span>Ainder</span>
            </div>
            <p className="subtitle">private persona exploration</p>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="ghost-action"
              onClick={onResetConversation}
              data-testid="new-session"
            >
              새 세션
            </button>
            <div className="layout-toggle" role="group" aria-label="Layout">
              <button
                type="button"
                className={layout === 'inline' ? 'active' : ''}
                onClick={() => onSetLayout('inline')}
                data-testid="layout-inline"
              >
                Inline
              </button>
              <button
                type="button"
                className={layout === 'panel' ? 'active' : ''}
                onClick={() => onSetLayout('panel')}
                data-testid="layout-panel"
              >
                Panel
              </button>
            </div>
            <button type="button" className="ghost-action" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        </header>

        <div className="history" ref={historyRef} role="log" aria-live="polite">
          {entries.length === 0 ? (
            <AinderProduct sending={sending} onLaunchPrompt={onLaunchPrompt} />
          ) : null}
          {entries.map((entry) => (
            <ChatEntryView
              key={entry.id}
              entry={entry}
              renderInline={layout === 'inline'}
              sandboxUrl={sandboxUrl}
              agentEndpoint={agentEndpoint}
              getAuthToken={getAuthToken}
              onAppMessage={onAppMessage}
            />
          ))}
        </div>

        <form className="composer" onSubmit={onSubmit}>
          <textarea
            name="prompt"
            placeholder="Ainder에게 다음 화면을 요청하세요..."
            rows={1}
            autoFocus
            value={prompt}
            disabled={sending}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onPromptChange(event.target.value)
            }
            onKeyDown={onKeyDown}
          />
          <button
            type={sending ? 'button' : 'submit'}
            disabled={!sending && !prompt.trim()}
            onClick={sending ? onAbort : undefined}
            aria-label={sending ? 'Stop' : 'Send'}
          >
            {sending ? 'Stop' : 'Send'}
          </button>
        </form>
      </aside>

      {layout === 'panel' ? (
        <main className="ui-pane">
          <PanelView
            renders={renders}
            sandboxUrl={sandboxUrl}
            agentEndpoint={agentEndpoint}
            getAuthToken={getAuthToken}
            onAppMessage={onAppMessage}
          />
        </main>
      ) : null}
    </div>
  );
}
