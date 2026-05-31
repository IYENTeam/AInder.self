/* eslint-disable no-console */
import { useCallback, useMemo } from 'react';
import { AppRenderer, type RequestHandlerExtra } from '@ggui-ai/react';
import type { RenderRef } from '@ggui-ai/react/chat-helpers';
import type {
  CallToolRequest,
  CallToolResult,
  ReadResourceRequest,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';
import type { AppMessageHandler } from './chatTypes';

interface ResourceFrameProps {
  readonly item: RenderRef;
  readonly sandboxUrl: string;
  readonly agentEndpoint: string;
  readonly getAuthToken: () => string | undefined;
  readonly fillContainer?: boolean;
  readonly onAppMessage?: AppMessageHandler;
}

interface PanelViewProps {
  readonly renders: ReadonlyArray<RenderRef>;
  readonly sandboxUrl: string;
  readonly agentEndpoint: string;
  readonly getAuthToken: () => string | undefined;
  readonly onAppMessage: AppMessageHandler;
}

export function PanelView({
  renders,
  sandboxUrl,
  agentEndpoint,
  getAuthToken,
  onAppMessage,
}: PanelViewProps) {
  const top = useMemo(() => renders[renders.length - 1], [renders]);
  if (!top) {
    return (
      <div className="ui-placeholder">
        <div className="report-lock">잠금</div>
        <h2>GGUI 결과가 여기에 표시됩니다</h2>
        <p>
          왼쪽의 Ainder 액션을 실행하면 업로드, 페르소나 검토, 탐색, 요청,
          리포트 UI가 안전한 iframe으로 렌더링됩니다.
        </p>
      </div>
    );
  }
  return (
    <div className="panel-frame">
      <ResourceFrame
        item={top}
        sandboxUrl={sandboxUrl}
        agentEndpoint={agentEndpoint}
        getAuthToken={getAuthToken}
        onAppMessage={onAppMessage}
        fillContainer
      />
    </div>
  );
}

export function ResourceFrame({
  item,
  sandboxUrl,
  agentEndpoint,
  getAuthToken,
  fillContainer = false,
  onAppMessage,
}: ResourceFrameProps) {
  const html = item.inlinedResource?.text;
  const inlinedCsp = item.inlinedResource?.csp;

  const sandbox = useMemo(() => {
    if (!inlinedCsp) return { url: new URL(sandboxUrl) };
    const csp: {
      connectDomains?: string[];
      resourceDomains?: string[];
    } = {};
    if (inlinedCsp.connectDomains) {
      csp.connectDomains = [...inlinedCsp.connectDomains];
    }
    if (inlinedCsp.resourceDomains) {
      csp.resourceDomains = [...inlinedCsp.resourceDomains];
    }
    return { url: new URL(sandboxUrl), csp };
  }, [sandboxUrl, inlinedCsp]);

  const onCallTool = useCallback(
    async (
      params: CallToolRequest['params'],
      _extra: RequestHandlerExtra,
    ): Promise<CallToolResult> => {
      console.log('[ResourceFrame] tool_call', params);
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        const resp = await fetch(`${agentEndpoint}/agent`, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({
            kind: 'tool-call',
            name: params.name,
            arguments: params.arguments ?? {},
          }),
        });
        if (!resp.ok) {
          console.warn('[ResourceFrame] relay non-2xx', resp.status);
          return { isError: true, content: [] };
        }
        const jsonRpc = (await resp.json()) as {
          readonly result?: CallToolResult;
          readonly error?: { readonly message?: string };
        };
        if (jsonRpc.error !== undefined) {
          console.warn('[ResourceFrame] relay error envelope', jsonRpc.error);
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: jsonRpc.error.message ?? 'relay error',
              },
            ],
          };
        }
        return jsonRpc.result ?? { content: [] };
      } catch (err) {
        console.warn('[ResourceFrame] relay transport error', err);
        return { isError: true, content: [] };
      }
    },
    [agentEndpoint, getAuthToken],
  );

  const onReadResource = useCallback(
    async (
      params: ReadResourceRequest['params'],
      _extra: RequestHandlerExtra,
    ): Promise<ReadResourceResult> => {
      throw new Error(
        `[ResourceFrame] resources/read for ${params.uri} requested ` +
          `post-mount, but the host doesnt operate a relay endpoint. ` +
          `The agent-server library inlines resources on the FIRST tool ` +
          `result; guest-initiated re-reads need the host to add a custom ` +
          `relay (or upgrade to AppRenderer's built-in MCP client).`,
      );
    },
    [],
  );

  return (
    <div className="render">
      <div className="render-chrome">
        <span className="render-id">{shortLabel(item)}</span>
        <span className="render-action">{item.action}</span>
      </div>
      <div
        className="render-frame"
        style={fillContainer ? { flex: 1, minHeight: 0 } : undefined}
      >
        {html !== undefined ? (
          <AppRenderer
            key={item.resourceUri}
            toolName="ggui_render"
            sandbox={sandbox}
            html={html}
            onReadResource={onReadResource}
            onCallTool={onCallTool}
            {...(onAppMessage !== undefined ? { onMessage: onAppMessage } : {})}
            onError={(err) =>
              console.warn('[ResourceFrame] AppRenderer error', err)
            }
          />
        ) : (
          <div className="render-loading" aria-hidden="true">
            <p>
              Resource not inlined for <code>{item.resourceUri}</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function shortLabel(item: RenderRef): string {
  if (item.toolUseId !== undefined && item.toolUseId.length > 0) {
    return `#${item.toolUseId.slice(0, 12)}`;
  }
  const tail = item.resourceUri.split('/').filter(Boolean).pop() ?? '';
  return tail.length > 0 ? `#${tail.slice(0, 12)}` : '#render';
}
