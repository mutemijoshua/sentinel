'use client';

import { useActionState } from 'react';
import { login } from '../actions';
import { Submit } from '@/components/client';

export default function LoginPage() {
  const [state, action] = useActionState(login, null);
  return (
    <main className="login">
      <form action={action}>
        <h1>
          <span className="brand-mark" /> Sentinel Hub
        </h1>
        <p>Status of all your websites.</p>
        {state?.error && <p className="error">{state.error}</p>}
        <label className="f">
          <span>Password</span>
          <input type="password" name="password" autoComplete="current-password" required autoFocus />
        </label>
        <Submit busy="Signing in…">Sign in</Submit>
      </form>
    </main>
  );
}
