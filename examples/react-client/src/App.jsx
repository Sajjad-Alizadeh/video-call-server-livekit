import React, { useRef, useState } from 'react';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import InvitationGenerator from './InvitationGenerator.jsx';

export default function App() {
  const [invitation, setInvitation] = useState('');
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [microphone, setMicrophone] = useState(false);
  const [camera, setCamera] = useState(false);
  const joining = useRef(false);

  async function join(event) {
    event.preventDefault();
    if (joining.current) return;
    joining.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation: invitation.trim() }),
        signal: AbortSignal.timeout(10_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Could not join. Check that the backend is running.');
      if (!result?.token || !result?.serverUrl) throw new Error('The server returned an incomplete connection response.');
      setSession(result);
      setInvitation('');
    } catch (failure) {
      setError(failure.name === 'TimeoutError' ? 'The request timed out. Please try again.' : failure.message);
    } finally {
      joining.current = false;
      setBusy(false);
    }
  }

  if (session) {
    return (
      <main className="meeting">
        <header className="meeting-header">
          <strong>{session.room}</strong>
          <span>Joined as {session.identity}{session.canPublish ? '' : ' · Viewer'}</span>
          <button onClick={() => { setSession(null); setError(''); }}>Leave room</button>
        </header>
        {error && <p role="alert" className="error">{error}</p>}
        <LiveKitRoom
          token={session.token}
          serverUrl={session.serverUrl}
          connect={true}
          audio={session.canPublish && microphone}
          video={session.canPublish && camera}
          onConnected={() => setError('')}
          onDisconnected={() => setSession(null)}
          onError={(failure) => setError(failure.message)}
          onMediaDeviceFailure={() => setError('Camera or microphone access failed. Check browser permissions; you can remain in the room.')}
          data-lk-theme="default"
          className="conference"
        >
          {/* VideoConference includes audio rendering and meeting controls. */}
          <VideoConference />
        </LiveKitRoom>
      </main>
    );
  }

  return (
    <main className="join-page">
      <div className="join-content">
        <p className="eyebrow">YOUR SPACE TO CONNECT</p>
        <h1>Join the conversation.</h1>
        <p className="intro">Paste the invitation you received. Your room and participant name are already included.</p>
        {!window.isSecureContext && <p role="alert" className="error">Use HTTPS or localhost to access your camera or microphone.</p>}
        <form onSubmit={join} aria-busy={busy}>
          <label htmlFor="invitation">Invitation code</label>
          <textarea id="invitation" required maxLength={4096} rows={5} value={invitation}
            onChange={(event) => setInvitation(event.target.value)} autoComplete="off" spellCheck={false}
            aria-describedby="invitation-help" disabled={busy} />
          <p id="invitation-help" className="hint">Keep this code private. It grants access to your room.</p>
          <fieldset disabled={busy}>
            <legend>When you join</legend>
            <label className="choice"><input type="checkbox" checked={microphone} onChange={(event) => setMicrophone(event.target.checked)} /> Turn on microphone</label>
            <label className="choice"><input type="checkbox" checked={camera} onChange={(event) => setCamera(event.target.checked)} /> Turn on camera</label>
          </fieldset>
          {error && <p role="alert" className="error">{error}</p>}
          <button type="submit" disabled={busy || !invitation.trim()}>{busy ? 'Joining…' : 'Join room'}</button>
        </form>
        <p className="hint">You can change your camera and microphone settings during the call.</p>
        <InvitationGenerator onUse={(code) => { setInvitation(code); document.getElementById('invitation')?.focus(); }} />
      </div>
    </main>
  );
}
