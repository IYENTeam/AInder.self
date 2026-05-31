import { useState } from 'react';
import type {
  ChatEntry,
  ToolCallEntry,
} from '@ggui-ai/react/chat-helpers';
import type { AppMessageHandler } from './chatTypes';
import { ResourceFrame, shortLabel } from './RenderFrame';

interface ChatEntryViewProps {
  readonly entry: ChatEntry;
  readonly renderInline: boolean;
  readonly sandboxUrl: string;
  readonly agentEndpoint: string;
  readonly getAuthToken: () => string | undefined;
  readonly onAppMessage: AppMessageHandler;
}

export function ChatEntryView({
  entry,
  renderInline,
  sandboxUrl,
  agentEndpoint,
  getAuthToken,
  onAppMessage,
}: ChatEntryViewProps) {
  if (entry.kind === 'render') {
    if (renderInline) {
      return (
        <div className="msg render-wrap">
          <ResourceFrame
            item={entry.render}
            sandboxUrl={sandboxUrl}
            agentEndpoint={agentEndpoint}
            getAuthToken={getAuthToken}
            onAppMessage={onAppMessage}
          />
        </div>
      );
    }
    return <div className="msg tool">UI ready · {shortLabel(entry.render)}</div>;
  }
  if (entry.kind === 'end') {
    return (
      <div className="msg turn-end" data-testid="turn-end">
        turn ended · {entry.subtype}
      </div>
    );
  }
  if (entry.kind === 'tool-call') {
    return <ToolCallView entry={entry} />;
  }
  return <div className={`msg ${entry.kind}`}>{entry.text}</div>;
}

function ToolCallView({ entry }: { readonly entry: ToolCallEntry }) {
  const [open, setOpen] = useState(false);
  const shortName = entry.name.replace(/^mcp__[^_]+__/, '');
  const pending = entry.result === undefined && entry.isError !== true;
  const status = entry.isError ? 'error' : pending ? 'pending' : 'ok';
  return (
    <div className={`msg tool-call tool-call-${status}`}>
      <button
        type="button"
        className="tool-call-header"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="tool-call-chevron">{open ? 'v' : '>'}</span>
        <span className="tool-call-name">{shortName}</span>
        <span className={`tool-call-status tool-call-status-${status}`}>
          {pending ? '...' : entry.isError ? 'error' : 'ok'}
        </span>
      </button>
      {open ? (
        <div className="tool-call-body">
          <div className="tool-call-section">
            <div className="tool-call-section-label">input</div>
            <pre className="tool-call-json">{prettyJson(entry.input)}</pre>
          </div>
          <div className="tool-call-section">
            <div className="tool-call-section-label">
              {entry.isError ? 'error result' : 'result'}
            </div>
            <pre className="tool-call-json">
              {entry.result === undefined
                ? '(awaiting)'
                : prettyJson(entry.result)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
