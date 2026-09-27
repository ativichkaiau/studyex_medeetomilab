import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import {
  isCloudConfigured, cloudConfigSource, setCloudConfig,
  signInEmail, verifyEmailCode, signInPassword, signUpPassword, signOut, onAuth, authRedirectTo,
  createWorkspaceSync, shareProject,
} from '../lib/supabase'
import { watchWorkspaceSync, type Resolution, type SyncStatus } from '../lib/cloudSync'
import { download } from '../lib/reviewSessions'
import { Portal } from './Portal'
import { Sk } from './Skeleton'

const AUTOSYNC_LS = 'williamslab.cloud.autosync'

export default function Cloud({ open, onClose, onSyncStatus }: { open: boolean; onClose: () => void; onSyncStatus?: (status: SyncStatus) => void }) {
  const { state } = useStore()
  const [email, setEmail] = useState<string | null>(null) // signed-in email
  const [userId, setUserId] = useState<string | null>(null)
  const [configured, setConfigured] = useState(isCloudConfigured())
  const [source, setSource] = useState(cloudConfigSource())
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ phase: 'paused', message: 'Sign in to sync this workspace.' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem(AUTOSYNC_LS) !== 'off')
  const syncRef = useRef<Awaited<ReturnType<typeof createWorkspaceSync>> | null>(null)
  const [syncVersion, setSyncVersion] = useState(0)

  // config form
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  // sign-in form
  const [loginEmail, setLoginEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [method, setMethod] = useState<'code' | 'password'>('password')
  const [password, setPassword] = useState('')

  // track auth state
  useEffect(() => {
    if (!configured) return
    const off = onAuth((e, id) => { setEmail(e); setUserId(id) })
    return off
  }, [configured])

  // Keep synchronization alive while the panel is closed, and stop old requests
  // when the account, configuration, or automatic-sync preference changes.
  useEffect(() => {
    let cancelled = false
    let stopWatching: (() => void) | undefined
    let service: Awaited<ReturnType<typeof createWorkspaceSync>> | undefined
    const report = (status: SyncStatus) => {
      if (!cancelled) { setSyncStatus(status); onSyncStatus?.(status) }
    }
    syncRef.current = null
    report({ phase: 'paused', message: email ? 'Automatic sync is off. Use Sync now to exchange changes.' : 'Sign in to sync this workspace.' })
    if (configured && email && userId) {
      if (autoSync) report({ phase: 'checking', message: 'Connecting to your cloud workspace…' })
      createWorkspaceSync(userId, report).then((created) => {
        service = created
        if (cancelled) { service.sync.stop(); return }
        syncRef.current = service
        if (autoSync) stopWatching = watchWorkspaceSync(service.sync)
        else setSyncStatus((status) => ({ ...status }))
      }).catch((e) => report({ phase: 'error', message: e instanceof Error ? e.message : 'Could not connect to cloud sync.' }))
    }
    return () => { cancelled = true; stopWatching?.(); service?.sync.stop() }
  }, [email, userId, configured, autoSync, onSyncStatus, syncVersion])

  function saveConfig() {
    const err = setCloudConfig(url, key)
    if (err) { setMsg({ ok: false, text: err }); return }
    setUrl(''); setKey('')
    setConfigured(isCloudConfigured())
    setSource(cloudConfigSource())
    setMsg({ ok: true, text: 'Connected. Sign in with your email below.' })
  }
  function disconnect() {
    if (!confirm('Disconnect this device from the cloud? Your local data stays; sign-in and sync stop.')) return
    setCloudConfig('', '')
    syncRef.current?.sync.stop()
    setConfigured(false); setSource('none'); setEmail(null)
  }
  async function sendLink() {
    if (!loginEmail.trim()) return
    setBusy('login'); setMsg(null)
    try { await signInEmail(loginEmail); setSent(true); setMsg({ ok: true, text: `Email sent to ${loginEmail.trim()}. Paste the 6-digit code below, or click the link (in this browser).` }) }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not send the email.' }) }
    finally { setBusy(null) }
  }
  async function verifyCode() {
    if (!code.trim()) return
    setBusy('verify'); setMsg(null)
    try { await verifyEmailCode(loginEmail, code); setSent(false); setCode('') /* onAuth flips to signed-in */ }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'That code is invalid or expired — send a fresh one.' }) }
    finally { setBusy(null) }
  }
  async function pwSignIn() {
    if (!loginEmail.trim() || !password) return
    setBusy('pw'); setMsg(null)
    try { await signInPassword(loginEmail, password); setPassword('') /* onAuth flips */ }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Sign-in failed.' }) }
    finally { setBusy(null) }
  }
  async function pwSignUp() {
    if (!loginEmail.trim() || password.length < 6) { setMsg({ ok: false, text: 'Use a password of at least 6 characters.' }); return }
    setBusy('pw'); setMsg(null)
    try {
      const { needsConfirm } = await signUpPassword(loginEmail, password)
      if (needsConfirm) setMsg({ ok: false, text: 'Account made, but Supabase wants email confirmation. Turn off Authentication → Providers → Email → “Confirm email”, then Sign in.' })
      else { setPassword('') /* onAuth flips */ }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Sign-up failed.' }) }
    finally { setBusy(null) }
  }
  async function doSync(resolution?: Resolution) {
    setMsg(null)
    await syncRef.current?.sync.sync(resolution)
  }
  function downloadBackup() {
    const backup = syncRef.current?.latestBackup()
    if (backup) download(`williamslab-device-backup-${Date.now()}.json`, 'application/json', backup)
  }
  async function doShare() {
    setBusy('share'); setMsg(null); setShareLink(null)
    try {
      const id = await shareProject(state.project.name, state)
      setShareLink(`${location.origin}${location.pathname}#/shared/${id}`)
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Share failed.' }) }
    finally { setBusy(null) }
  }
  async function doSignOut() {
    syncRef.current?.sync.stop()
    try { await signOut(); setEmail(null); setShareLink(null); setMsg(null) }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Sign-out failed.' }); setSyncVersion((v) => v + 1) }
  }
  function toggleAuto() {
    setAutoSync((v) => { const n = !v; localStorage.setItem(AUTOSYNC_LS, n ? 'on' : 'off'); return n })
  }

  if (!open) return null
  return (
    <Portal>
      <div className="kbd-overlay" onClick={onClose}>
        <div className="kbd-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
          <div className="kbd-head">
            <b>☁ Cloud sync &amp; sharing</b>
            <button className="ai-x" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div style={{ padding: '4px 2px' }}>
            {!configured ? (
              <>
                <p className="small" style={{ marginBottom: 12 }}>Bring your own free <b>Supabase</b> project — your data stays in your account. Run <span className="mono">db/supabase-schema.sql</span> once in the Supabase SQL editor, then paste the project URL and the <b>anon</b> public key (it’s RLS-protected — safe on the client; never the service_role secret).</p>
                <label className="fld"><span className="fld-l">Project URL</span><input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" /></label>
                <label className="fld"><span className="fld-l">Anon public key</span><input className="input mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi…" /></label>
                <button className="btn primary sm" onClick={saveConfig}>Connect</button>
              </>
            ) : !email ? (
              <>
                <p className="small" style={{ marginBottom: 8 }}>✓ Connected <span className="muted">({source === 'env' ? 'from environment' : 'this device'})</span>. Sign in to sync across devices.</p>
                <p className="small muted" style={{ marginBottom: 10 }}>Email links return to <span className="mono" style={{ wordBreak: 'break-all' }}>{authRedirectTo()}</span>. Supabase ignores that unless it is listed in <b>Authentication → URL Configuration</b> — add it under <b>Redirect URLs</b> and set <b>Site URL</b> to your deployed address, or links bounce to <span className="mono">localhost:3000</span>.</p>
                <label className="fld"><span className="fld-l">Email</span><input className="input" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="you@example.com" /></label>
                <div className="seg" style={{ marginBottom: 10 }}>
                  <button className={`seg-b${method === 'password' ? ' on' : ''}`} onClick={() => setMethod('password')}>Password</button>
                  <button className={`seg-b${method === 'code' ? ' on' : ''}`} onClick={() => setMethod('code')}>Email code</button>
                </div>

                {method === 'password' ? (
                  <>
                    <label className="fld"><span className="fld-l">Password</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pwSignIn()} placeholder="••••••••" /></label>
                    <div className="wrap-gap">
                      <button className="btn primary sm" onClick={pwSignIn} disabled={busy === 'pw' || !loginEmail.trim() || !password}>{busy === 'pw' ? '…' : 'Sign in'}</button>
                      <button className="btn ghost sm" onClick={pwSignUp} disabled={busy === 'pw' || !loginEmail.trim() || password.length < 6}>Create account</button>
                      {source === 'settings' && <button className="btn ghost sm" onClick={disconnect}>Disconnect</button>}
                    </div>
                    <p className="small muted" style={{ marginTop: 8 }}>No email needed — turn off <b>Confirm email</b> once in Supabase (Authentication → Providers → Email), then <b>Create account</b>. Avoids the email rate limit entirely.</p>
                  </>
                ) : (
                  <>
                    {sent && (
                      <label className="fld"><span className="fld-l">6-digit code from the email</span>
                        <div className="flex" style={{ gap: 8 }}>
                          <input className="input mono" style={{ letterSpacing: '0.3em', maxWidth: 140 }} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(e) => e.key === 'Enter' && verifyCode()} placeholder="123456" />
                          <button className="btn primary sm" onClick={verifyCode} disabled={busy === 'verify' || code.length < 6}>{busy === 'verify' ? 'Verifying…' : 'Verify code'}</button>
                        </div>
                      </label>
                    )}
                    <div className="wrap-gap">
                      <button className={`btn sm ${sent ? 'ghost' : 'primary'}`} onClick={sendLink} disabled={busy === 'login' || !loginEmail.trim()}>{busy === 'login' ? 'Sending…' : sent ? 'Resend' : 'Send code'}</button>
                      {source === 'settings' && <button className="btn ghost sm" onClick={disconnect}>Disconnect</button>}
                    </div>
                    <p className="small muted" style={{ marginTop: 8 }}>Built-in email is rate-limited (~2–4/hour). If it’s exhausted, use <b>Password</b> above, or set up custom SMTP in Supabase. Add <span className="mono">{'{{ .Token }}'}</span> to the Magic Link email template to see the code.</p>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="kv"><span className="k">Signed in</span><span className="val"><b>{email}</b></span></div>
                <div className="kv"><span className="k">Sync status</span><span className="val" role="status" style={{ color: syncStatus.phase === 'synced' ? 'var(--green)' : ['error', 'conflict', 'offline'].includes(syncStatus.phase) ? 'var(--red)' : 'var(--muted)' }}>{syncStatus.message}</span></div>
                {syncStatus.checkedAt && <div className="kv"><span className="k">Last checked</span><span className="val">{new Date(syncStatus.checkedAt).toLocaleString()}</span></div>}
                <div className="kv"><span className="k">Auto-sync</span><span className="val"><label style={{ cursor: 'pointer' }}><input type="checkbox" checked={autoSync} onChange={toggleAuto} /> exchange changes across devices</label></span></div>
                <p className="small muted">{autoSync ? 'Updates download when you open or return to the app, and every 15 seconds while it is visible.' : 'Automatic uploads and downloads are paused. Use Sync now to exchange changes.'} Use the same account and Supabase project on each device.</p>
                <div className="divider" />
                <div className="wrap-gap" style={{ marginBottom: 10 }}>
                  <button className="btn primary sm" onClick={() => doSync()} disabled={!!busy || syncStatus.phase === 'checking' || !syncRef.current}>{syncStatus.phase === 'checking' ? 'Syncing…' : '↕ Sync now'}</button>
                  <button className="btn ghost sm" onClick={doShare} disabled={!!busy}>{busy === 'share' ? 'Sharing…' : '🔗 Share this project'}</button>
                </div>
                {syncStatus.phase === 'checking' && <div style={{ marginBottom: 12 }}><Sk kind="sync" label={syncStatus.message} /></div>}
                {syncStatus.phase === 'conflict' && <div className="card" style={{ padding: 12, marginBottom: 12 }}>
                  <p className="small" style={{ marginBottom: 10 }}>Choose a version for the conflicting items. A local backup is saved before applying the choice.</p>
                  <div className="wrap-gap">
                    {syncStatus.updatedAt && <button className="btn primary sm" onClick={() => doSync('cloud')}>Use cloud changes</button>}
                    <button className="btn ghost sm" onClick={() => doSync('local')}>Use this device’s changes</button>
                  </div>
                </div>}
                {syncRef.current?.latestBackup() && <button className="btn ghost sm" onClick={downloadBackup} style={{ marginBottom: 10 }}>Download previous device copy</button>}
                {shareLink && (
                  <div className="kv"><span className="k">Share link</span><span className="val" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input className="input mono" style={{ fontSize: 11 }} readOnly value={shareLink} onFocus={(e) => e.target.select()} />
                    <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(shareLink)}>Copy</button>
                  </span></div>
                )}
                <div className="divider" />
                <div className="wrap-gap">
                  <button className="btn ghost sm" onClick={doSignOut}>Sign out</button>
                  {source === 'settings' && <button className="btn ghost sm" onClick={disconnect}>Disconnect cloud</button>}
                </div>
              </>
            )}
            {msg && <p className="small" style={{ marginTop: 10, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</p>}
          </div>
        </div>
      </div>
    </Portal>
  )
}
