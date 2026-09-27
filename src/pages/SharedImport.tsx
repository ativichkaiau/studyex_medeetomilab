import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useSwapNavigate } from '../lib/swap'
import { useStore } from '../lib/store'
import { Kicker, Rule } from '../components/ui'
import { isCloudConfigured, loadSharedProject } from '../lib/supabase'
import { Sk } from '../components/Skeleton'

type State = 'loading' | 'notconfig' | 'notfound' | { name: string; project: unknown }

export default function SharedImport() {
  const { id } = useParams()
  const { importProject } = useStore()
  const nav = useSwapNavigate()
  const [st, setSt] = useState<State>('loading')

  useEffect(() => {
    if (!isCloudConfigured()) { setSt('notconfig'); return }
    if (!id) { setSt('notfound'); return }
    loadSharedProject(id).then((d) => setSt(d ?? 'notfound')).catch(() => setSt('notfound'))
  }, [id])

  function importIt() {
    if (typeof st === 'object') {
      importProject(JSON.stringify(st.project))
      nav('/')
    }
  }

  return (
    <>
      <div className="page-head">
        <Rule />
        <Kicker>SHARED PROJECT</Kicker>
        <h1>Import a shared project</h1>
      </div>
      <div className="card lg">
        {st === 'loading' && <Sk kind="snapshot" />}
        {st === 'notconfig' && <p className="empty">This device isn’t connected to a cloud project, so it can’t open share links. Connect one via the ☁ Cloud button in the top bar.</p>}
        {st === 'notfound' && <p className="empty">That shared project couldn’t be found — the link may be wrong or it was removed.</p>}
        {typeof st === 'object' && (
          <>
            <div className="card-h"><span className="sq" style={{ background: 'var(--blue)' }} />{st.name || 'Shared project'}</div>
            <p className="small" style={{ marginBottom: 12 }}>This adds a copy of the shared project to your workspace (your existing projects are untouched).</p>
            <div className="wrap-gap">
              <button className="btn primary sm" onClick={importIt}>＋ Import into my workspace</button>
              <button className="btn ghost sm" onClick={() => nav('/')}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
