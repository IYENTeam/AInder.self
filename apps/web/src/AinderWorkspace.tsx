import type { ReactNode } from 'react';
import './AinderWorkspace.css';
import './AinderWorkspaceAgent.css';

interface AinderWorkspaceProps {
  readonly children: ReactNode;
}

interface AinderConnectionStateProps {
  readonly agentEndpoint: string;
  readonly detail?: string;
  readonly status: 'connecting' | 'error';
}

const JOURNEY_STEPS = [
  { id: '01', title: 'Login', body: 'ID/password session' },
  { id: '02', title: 'Upload', body: 'KakaoTalk .txt only' },
  { id: '03', title: 'Sanitize', body: 'raw deleted by default' },
  { id: '04', title: 'Review', body: 'public/private/hidden' },
  { id: '05', title: 'Explore', body: 'left swipe is private' },
  { id: '06', title: 'Request', body: 'summary plus scenes' },
  { id: '07', title: 'Reveal', body: 'report unlock by consent' },
] as const;

const CONTRACTS = [
  ['Raw upload', 'Show retention before upload', 'Never send raw Kakao text'],
  ['Sanitized result', 'Expose category counts only', 'No raw transcript preview'],
  ['Trait review', 'Require visibility controls', 'hidden excluded from memory'],
  ['Left swipe', 'Open private exploration', 'No target notification'],
  ['Match request', 'Attach summary and scenes', 'Full transcript off by default'],
  ['Council report', 'Locked until both consent', 'No numeric compatibility score'],
] as const;

const TABS = ['내 페르소나', '탐색', '요청함', '매칭'] as const;

export function AinderWorkspace({ children }: AinderWorkspaceProps) {
  return (
    <div className="ainder-workspace">
      <main className="ainder-product" aria-label="AInder product workspace">
        <section className="ainder-intro">
          <div>
            <p className="ainder-kicker">AINDER / PRIVACY-FIRST PERSONA DATING</p>
            <h1>Consent-first AI persona matching</h1>
            <p className="ainder-lede">
              The production shell now reflects the design system: Tinder-inspired
              pink, charcoal, white, explicit consent gates, sanitized persona
              review, private exploration, and locked council reports.
            </p>
          </div>
          <div className="ainder-status-pill" aria-label="System status">
            <span className="ainder-live-dot" />
            secure session active
          </div>
        </section>

        <section className="ainder-journey" aria-label="Private matching journey">
          {JOURNEY_STEPS.map((step) => (
            <article
              className={
                step.id === '04' || step.id === '07'
                  ? 'ainder-step ainder-step-emphasis'
                  : 'ainder-step'
              }
              key={step.id}
            >
              <span>{step.id}</span>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </article>
          ))}
        </section>

        <section className="ainder-detail-grid">
          <PersonaPhone />
          <ImplementationContracts />
        </section>
      </main>

      <aside className="ainder-agent" aria-label="AInder agent console">
        <div className="ainder-agent-heading">
          <div>
            <p className="ainder-kicker">AGENT CONSOLE</p>
            <h2>GGUI companion</h2>
          </div>
          <span>live</span>
        </div>
        <div className="ainder-agent-chat">{children}</div>
      </aside>
    </div>
  );
}

export function AinderConnectionState({
  agentEndpoint,
  detail,
  status,
}: AinderConnectionStateProps) {
  return (
    <main className="ainder-connection">
      <section>
        <p className="ainder-kicker">AINDER / AGENT BACKEND</p>
        <h1>{status === 'connecting' ? 'Connecting to AInder' : 'Agent connection failed'}</h1>
        <p>
          {status === 'connecting'
            ? 'Preparing the secure session and sandbox renderer.'
            : 'The frontend could not read the MCP Apps backend manifest.'}
        </p>
        <code>{agentEndpoint}</code>
        {detail !== undefined ? <strong>{detail}</strong> : null}
      </section>
    </main>
  );
}

function PersonaPhone() {
  return (
    <article className="ainder-phone" aria-label="Persona review mobile preview">
      <header>
        <strong>내 페르소나</strong>
        <span className="ainder-live-dot" />
      </header>
      <section className="ainder-upload-card">
        <p className="ainder-kicker">UPLOAD GATE</p>
        <h2>카카오톡 대화 업로드</h2>
        <p>.txt만 허용하고 raw upload는 정제 후 기본 삭제됩니다.</p>
      </section>
      <section className="ainder-progress-card">
        {['Parsing export', 'Detecting identifiers', 'Redacting sensitive topics'].map(
          (label) => (
            <div key={label}>
              <span className="ainder-checkmark" />
              <p>{label}</p>
            </div>
          ),
        )}
        <div className="ainder-muted-row">
          <span />
          <p>Validating safe snippets</p>
        </div>
      </section>
      <section className="ainder-trait-card">
        <p className="ainder-kicker">대화 스타일</p>
        <h2>상대의 감정 맥락을 먼저 확인하는 편이에요.</h2>
        <div className="ainder-visibility">
          <span className="active">public</span>
          <span>private</span>
          <span>hidden</span>
        </div>
      </section>
      <nav className="ainder-mobile-tabs" aria-label="Primary mobile navigation">
        {TABS.map((tab) => (
          <span className={tab === '내 페르소나' ? 'active' : undefined} key={tab}>
            {tab}
          </span>
        ))}
      </nav>
    </article>
  );
}

function ImplementationContracts() {
  return (
    <article className="ainder-contracts" aria-label="Implementation contracts">
      <header>
        <p className="ainder-kicker">IMPLEMENTATION CONTRACTS</p>
        <h2>Code-facing privacy states</h2>
        <p>
          These interface states match the AInder workflow: safe uploads, public
          profile control, private exploration, contextual requests, and mutual
          report reveal.
        </p>
      </header>
      <div className="ainder-contract-table" role="table">
        <div className="ainder-contract-head" role="row">
          <span>State</span>
          <span>UI obligation</span>
          <span>Privacy guardrail</span>
        </div>
        {CONTRACTS.map(([state, obligation, guardrail]) => (
          <div className="ainder-contract-row" key={state} role="row">
            <strong>{state}</strong>
            <span>{obligation}</span>
            <span>{guardrail}</span>
          </div>
        ))}
      </div>
      <div className="ainder-note-grid">
        <section>
          <strong>Persona agents</strong>
          <p>Hidden fields stay unavailable to public profile, memory, and council inputs.</p>
        </section>
        <section>
          <strong>Request context</strong>
          <p>Recipients see a concise summary and 2-3 good scenes, never a transcript by default.</p>
        </section>
        <section className="ainder-note-emphasis">
          <strong>Report reveal</strong>
          <p>Council output stays locked until both sides explicitly consent.</p>
        </section>
      </div>
    </article>
  );
}
