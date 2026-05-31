import type { ChangeEvent, FormEvent } from 'react';
import type { AuthState } from './chatTypes';

interface AuthGateProps {
  readonly authState: AuthState;
  readonly loginUserId: string;
  readonly loginPassword: string;
  readonly loginError: string | null;
  readonly onUserIdChange: (value: string) => void;
  readonly onPasswordChange: (value: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function AuthGate({
  authState,
  loginUserId,
  loginPassword,
  loginError,
  onUserIdChange,
  onPasswordChange,
  onSubmit,
}: AuthGateProps) {
  if (authState === 'checking') {
    return (
      <div className="auth-shell auth-shell-loading">
        <div className="brand-lockup">
          <span className="brand-mark">A</span>
          <span>Ainder</span>
        </div>
        <p>세션을 확인하는 중...</p>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <section className="auth-hero" aria-label="Ainder login">
        <div className="brand-lockup">
          <span className="brand-mark">A</span>
          <span>Ainder</span>
        </div>
        <h1>내 대화로 만드는 안전한 AI 페르소나 매칭</h1>
        <p>
          카카오톡 대화는 먼저 정제되고, 공개할 페르소나 정보는 직접
          선택합니다. 매칭 리포트는 양쪽 동의 전까지 잠겨 있습니다.
        </p>
        <div className="auth-proof-row" aria-label="privacy guarantees">
          <span>Raw 삭제 기본값</span>
          <span>public/private/hidden</span>
          <span>양방향 리포트 동의</span>
        </div>
      </section>

      <form className="auth-card" onSubmit={onSubmit}>
        <div>
          <p className="section-kicker">CONSENT FIRST</p>
          <h2>로그인</h2>
        </div>
        <label>
          <span>ID</span>
          <input
            value={loginUserId}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onUserIdChange(event.target.value)
            }
            placeholder="user id"
            autoComplete="username"
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={loginPassword}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onPasswordChange(event.target.value)
            }
            placeholder="password"
            autoComplete="current-password"
          />
        </label>
        {loginError ? <div className="auth-error">{loginError}</div> : null}
        <button type="submit" className="primary-action">
          로그인
        </button>
      </form>
    </div>
  );
}
