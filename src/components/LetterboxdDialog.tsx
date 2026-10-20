import { useMemo, useRef, useState } from 'react'
import { fetchFeed, readExport, type LetterboxdData } from '../letterboxd'
import { missingFilms } from '../logs'
import type { Film } from '../types'
import { Dialog } from './Dialog'
import { MissingFilms } from './MissingFilms'

interface LetterboxdDialogProps {
  data: LetterboxdData | null
  /** Films matched on the timeline, to show what the import did. */
  seenOnTimeline: number
  /** Every film on the timeline, to list the visitor's films that are not on it. */
  allFilms: Film[]
  owner: boolean
  onPublished: (film: Film) => void
  onChange: (data: LetterboxdData | null) => void
  onClose: () => void
}

const EXPORT_PAGE = 'https://letterboxd.com/settings/data/'

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function errorText(problem: unknown) {
  return problem instanceof Error ? problem.message : String(problem)
}

export function LetterboxdDialog({
  data,
  seenOnTimeline,
  allFilms,
  owner,
  onPublished,
  onChange,
  onClose,
}: LetterboxdDialogProps) {
  const [username, setUsername] = useState(data?.username ?? '')
  const [busy, setBusy] = useState<'import' | 'feed' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const current: LetterboxdData = data ?? { username: null, archive: null, feed: null }

  const follow = async (name: string, base: LetterboxdData) => {
    const feed = await fetchFeed(name)
    return {
      ...base,
      username: feed.username,
      feed: { films: feed.films, name: feed.name, fetchedAt: new Date().toISOString() },
    }
  }

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return
    setBusy('import')
    setError(null)
    try {
      const archive = await readExport(files)
      let next: LetterboxdData = {
        ...current,
        username: archive.username ?? current.username,
        archive: { films: archive.films, exportedAt: archive.exportedAt },
      }
      onChange(next)
      // The export names its member: follow their feed too, for the films logged since.
      if (archive.username && archive.username !== current.feed?.name) {
        setUsername(archive.username)
        setBusy('feed')
        try {
          next = await follow(archive.username, next)
          onChange(next)
        } catch (problem) {
          setError(`Your export is in. The RSS feed could not be read: ${errorText(problem)}`)
        }
      }
    } catch (problem) {
      setError(errorText(problem))
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
      if (folderRef.current) folderRef.current.value = ''
    }
  }

  const followFeed = async () => {
    const name = username.trim().replace(/^@/, '')
    if (!name) return
    setBusy('feed')
    setError(null)
    try {
      onChange(await follow(name, current))
    } catch (problem) {
      setError(errorText(problem))
    } finally {
      setBusy(null)
    }
  }

  const archiveCount = current.archive?.films.filter((film) => film.watched).length ?? 0
  const missing = useMemo(() => (data ? missingFilms(allFilms, data) : []), [allFilms, data])

  return (
    <Dialog title="Your Letterboxd films" onClose={onClose}>
      <p className="lb-intro">
        Letterboxd has no public API, so Retroreel reads your films from your export file and your public RSS feed. Both
        stay in this browser.
      </p>

      <section className="lb-step">
        <h3>1. Your whole history</h3>
        <p>
          On Letterboxd, open{' '}
          <a href={EXPORT_PAGE} target="_blank" rel="noreferrer">
            Settings, Data
          </a>{' '}
          and choose Export your data. Then pick the ZIP file here. Safari unzips downloads: pick the folder then.
        </p>
        <div className="lb-row">
          <input
            ref={fileRef}
            type="file"
            accept=".zip,.csv"
            multiple
            hidden
            onChange={(event) => void importFiles([...(event.target.files ?? [])])}
          />
          <input
            ref={(node) => {
              folderRef.current = node
              // Not in React's input attributes: lets the picker choose a whole folder.
              node?.setAttribute('webkitdirectory', '')
            }}
            type="file"
            hidden
            onChange={(event) => void importFiles([...(event.target.files ?? [])])}
          />
          <button type="button" className="go" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
            {busy === 'import' ? 'Reading…' : current.archive ? 'Pick a newer export' : 'Pick the ZIP file'}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy !== null}
            onClick={() => folderRef.current?.click()}
          >
            or the unzipped folder
          </button>
          {current.archive && (
            <span className="lb-status">
              {archiveCount} films seen, exported {formatDay(current.archive.exportedAt)}
            </span>
          )}
        </div>
      </section>

      <section className="lb-step">
        <h3>2. What you log next</h3>
        <p>Your RSS feed adds your latest 50 diary entries, so films you log after the export show up on each visit.</p>
        <form
          className="lb-row"
          onSubmit={(event) => {
            event.preventDefault()
            void followFeed()
          }}
        >
          <input
            className="search"
            type="text"
            placeholder="Letterboxd username"
            aria-label="Letterboxd username"
            autoComplete="username"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <button type="submit" className="go" disabled={busy !== null || !username.trim()}>
            {busy === 'feed' ? 'Reading…' : current.feed ? 'Refresh' : 'Follow'}
          </button>
        </form>
        {current.feed && (
          <p className="lb-status">
            Following {current.feed.name}: {current.feed.films.length} recent films, read at{' '}
            {formatTime(current.feed.fetchedAt)}
          </p>
        )}
      </section>

      {error && <p className="dialog-error">{error}</p>}
      {(current.archive || current.feed) && (
        <p className="lb-summary">
          <strong>{seenOnTimeline}</strong> of the films on the timeline are in your Letterboxd films.
        </p>
      )}

      {missing.length > 0 && <MissingFilms films={missing} owner={owner} onPublished={onPublished} />}

      <div className="dialog-actions">
        {(current.archive || current.feed) && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onChange(null)
              setUsername('')
            }}
          >
            Forget my films
          </button>
        )}
        <button type="button" className="go" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  )
}
