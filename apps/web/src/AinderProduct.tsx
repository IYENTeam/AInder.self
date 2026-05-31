import type { FormEvent } from 'react';

interface AinderProductProps {
  readonly sending: boolean;
  readonly onLaunchPrompt: (prompt: string) => void;
}

interface ActionCard {
  readonly title: string;
  readonly copy: string;
  readonly cta: string;
  readonly prompt: string;
}

const ACTIONS: readonly ActionCard[] = [
  {
    title: '대화 업로드',
    copy: '카카오톡 .txt를 정제하고 raw 파일 삭제 기본값을 확인합니다.',
    cta: '업로드 플로우 열기',
    prompt:
      'AInder 업로드 화면을 렌더링해줘. KakaoTalk .txt 업로드, raw 파일 삭제 기본값, 보관 opt-in, 정제 진행 상태, redaction summary만 보여주는 privacy-first UI여야 해.',
  },
  {
    title: '페르소나 검토',
    copy: 'AI 해석 카드마다 공개, 비공개, 숨김을 직접 선택합니다.',
    cta: '검토 카드 만들기',
    prompt:
      'AInder 페르소나 리뷰 UI를 렌더링해줘. trait confidence, sanitized evidence snippets, recommended visibility, public/private/hidden segmented controls, public profile preview, publish confirmation을 포함해.',
  },
  {
    title: '비공개 탐색',
    copy: '관심 표현은 상대에게 알리지 않고 페르소나 탐색으로 이어집니다.',
    cta: '탐색 시작하기',
    prompt:
      'AInder 탐색 UI를 렌더링해줘. Tinder 스타일 public persona swipe card, left swipe opens private exploration, direct persona chat vs my persona simulation choice, 10 turn default and 50 turn cap copy를 포함해.',
  },
  {
    title: '요청과 리포트',
    copy: '매칭 요청은 선택한 대화 요약만 첨부하고 리포트는 양쪽 동의가 필요합니다.',
    cta: '요청함 보기',
    prompt:
      'AInder 매칭 요청과 리포트 UI를 렌더링해줘. match request composer, incoming request review, accepted match handoff, locked Cocoun council report with both-user reveal consent state를 포함해.',
  },
];

const TABS = ['내 페르소나', '탐색', '요청함', '매칭'] as const;

export function AinderProduct({ sending, onLaunchPrompt }: AinderProductProps) {
  return (
    <section className="product-brief" aria-label="Ainder product flow">
      <div className="product-hero">
        <p className="section-kicker">AINDER</p>
        <h2>Consent-first persona matching</h2>
        <p>
          공개 프로필은 사용자가 선택한 정보만 보여주고, 탐색 대화와 Cocoun
          리포트는 숨김 필드를 제외한 정제 데이터로만 진행됩니다.
        </p>
      </div>

      <nav className="mobile-tabs" aria-label="Ainder primary navigation">
        {TABS.map((tab, index) => (
          <button
            key={tab}
            type="button"
            className={index === 0 ? 'active' : ''}
            disabled={sending}
            onClick={() => onLaunchPrompt(tabPrompt(tab))}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="privacy-grid">
        <div className="persona-preview">
          <div className="persona-topline">
            <span className="avatar-orbit">AI</span>
            <div>
              <h3>상대에게 이렇게 보여요</h3>
              <p>public 필드만 swipe deck에 노출</p>
            </div>
          </div>
          <div className="trait-chips" aria-label="visibility states">
            <span className="chip chip-public">public</span>
            <span className="chip chip-private">private</span>
            <span className="chip chip-hidden">hidden</span>
          </div>
          <p className="persona-line">
            감정 맥락을 확인하며 대화하고, 약속과 경계를 명확히 하는 편이에요.
          </p>
          <div className="sanitized-note">
            정제된 근거 3개 · 민감 표현 5개 제외 · raw 삭제 완료
          </div>
        </div>

        <div className="report-card">
          <div className="report-lock">잠금</div>
          <h3>매칭 리포트</h3>
          <p>
            Cocoun council은 sanitized persona conversation만 검토합니다. 양쪽
            reveal consent 전에는 요약도 공개되지 않습니다.
          </p>
          <div className="consent-meter">
            <span className="done" />
            <span />
          </div>
          <small>1/2 consent complete</small>
        </div>
      </div>

      <div className="action-grid">
        {ACTIONS.map((action) => (
          <form
            key={action.title}
            className="action-card"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              onLaunchPrompt(action.prompt);
            }}
          >
            <h3>{action.title}</h3>
            <p>{action.copy}</p>
            <button type="submit" disabled={sending}>
              {action.cta}
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}

function tabPrompt(tab: (typeof TABS)[number]): string {
  switch (tab) {
    case '내 페르소나':
      return 'AInder 내 페르소나 탭을 렌더링해줘. conversation source gate, upload status, persona review queue, public profile preview를 포함해.';
    case '탐색':
      return 'AInder 탐색 탭을 렌더링해줘. full-screen mobile swipe deck and private exploration entry flow를 포함해.';
    case '요청함':
      return 'AInder 요청함 탭을 렌더링해줘. incoming/outgoing match request cards and accept/reject/later states를 포함해.';
    case '매칭':
      return 'AInder 매칭 탭을 렌더링해줘. accepted match handoff and locked/revealed Cocoun report states를 포함해.';
    default:
      return assertNever(tab);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled tab: ${value}`);
}
