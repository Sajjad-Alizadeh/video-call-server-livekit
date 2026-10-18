import React, { useState } from 'react';

export default function InvitationGenerator({ onUse }) {
  const [accessKey, setAccessKey] = useState('');
  const [room, setRoom] = useState('demo');
  const [identity, setIdentity] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('publisher');
  const [ttl, setTtl] = useState(900);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const secure = window.isSecureContext;

  async function generate(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    setCopied(false);
    try {
      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessKey.trim()}` },
        body: JSON.stringify({ room: room.trim(), identity: identity.trim(), ...(name.trim() ? { name: name.trim() } : {}), role, ttl: Number(ttl) }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Could not generate an invitation. Check the backend connection.');
      setResult(data);
    } catch (failure) {
      setError(failure.name === 'TimeoutError' ? 'The request timed out. Try again.' : failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.invitation);
      setCopied(true);
    } catch {
      setError('Copy is unavailable. Select and copy the invitation from the box below.');
    }
  }

  return (
    <details className="host-panel">
      <summary>Create an invitation · Host</summary>
      <p className="hint">Create a code for one participant. Use a different identity for each person in the same room.</p>
      {!secure && <p role="alert" className="error">Open the HTTPS address before entering your host key. Invitation creation requires HTTPS or localhost.</p>}
      <form onSubmit={generate} aria-busy={busy}>
        <fieldset disabled={busy || !secure} className="host-fields">
          <label htmlFor="host-key">Host access key</label>
          <input id="host-key" type="password" required autoComplete="off" value={accessKey} onChange={event => setAccessKey(event.target.value)} aria-describedby="host-key-help" />
          <p id="host-key-help" className="hint">Use INVITE_CREATOR_KEY from your server configuration. It is kept only in this page's memory.</p>
          <div className="field-pair">
            <div><label htmlFor="host-room">Room</label><input id="host-room" required maxLength={128} value={room} onChange={event => setRoom(event.target.value)} /></div>
            <div><label htmlFor="host-identity">Participant identity</label><input id="host-identity" required maxLength={128} value={identity} onChange={event => setIdentity(event.target.value)} /></div>
          </div>
          <label htmlFor="host-name">Display name (optional)</label>
          <input id="host-name" maxLength={128} value={name} onChange={event => setName(event.target.value)} />
          <div className="field-pair">
            <div><label htmlFor="host-role">Role</label><select id="host-role" value={role} onChange={event => setRole(event.target.value)}><option value="publisher">Publisher</option><option value="viewer">Viewer</option></select></div>
            <div><label htmlFor="host-ttl">Invitation valid for</label><select id="host-ttl" value={ttl} onChange={event => setTtl(Number(event.target.value))}><option value={900}>15 minutes</option><option value={3600}>1 hour</option><option value={86400}>24 hours</option></select></div>
          </div>
        </fieldset>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="host-actions">
          <button type="submit" disabled={busy || !secure}>{busy ? 'Generating…' : 'Generate invitation'}</button>
          <button type="button" className="secondary" onClick={() => setAccessKey('')} disabled={!accessKey || busy}>Forget host key</button>
        </div>
      </form>
      {result && <section className="invitation-result" aria-label="Generated invitation">
        <p role="status">Created for {result.identity} in {result.room}. Expires {new Date(result.expiresAt * 1000).toLocaleString()}.</p>
        <label htmlFor="generated-code">Invitation code</label>
        <textarea id="generated-code" readOnly rows={5} value={result.invitation} onFocus={event => event.target.select()} />
        <div className="host-actions"><button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</button><button type="button" className="secondary" onClick={() => onUse(result.invitation)}>Use this code</button></div>
        <p className="hint">Share only the invitation code with the participant. Keep your host key private.</p>
      </section>}
    </details>
  );
}
