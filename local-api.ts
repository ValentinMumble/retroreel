import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { loadEnv, type Plugin, type ViteDevServer } from 'vite'
import { galaxyLinks } from './api/_lib/links.ts'
import type { Film, SceneKey } from './src/types.ts'

/**
 * `npm run dev` serves the API routes of api/ itself, with the variables of .env.local, so the site runs without
 * `vercel dev`. Without a Redis store, the films come from scripts/.cache/films.json (built by build_data.py)
 * or, before any TMDB build, straight from scripts/catalog.txt, without posters.
 */

function slug(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** The catalog as films, without TMDB data beyond the pinned id. */
function catalogFilms(root: string): Film[] {
  return readFileSync(`${root}/scripts/catalog.txt`, 'utf8')
    .split('\n')
    .filter((line) => /^\d{4} \| /.test(line))
    .map((line) => {
      const [year, directors, title, scene, note, ...extras] = line.split(' | ')
      const tmdbId = Number(extras.find((extra) => extra.startsWith('id:'))?.slice(3))
      return {
        id: slug(`${title} ${year}`),
        year: Number(year),
        date: year,
        title,
        originalTitle: null,
        directors: directors.split(' & '),
        scene: scene as SceneKey,
        country: extras.find((extra) => extra.startsWith('c:'))?.slice(2) ?? null,
        runtime: null,
        note,
        tmdb: tmdbId ? { id: tmdbId, poster: null, backdrop: null, imdbId: null, trailer: null } : null,
      }
    })
}

function localData(root: string): { films: Film[]; related: Record<string, number[]> } {
  const built = `${root}/scripts/.cache/films.json`
  if (existsSync(built)) return JSON.parse(readFileSync(built, 'utf8'))
  return { films: catalogFilms(root), related: {} }
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

async function route(server: ViteDevServer, request: IncomingMessage, url: URL): Promise<Response> {
  const name = url.pathname.slice('/api/'.length).replace(/\/$/, '')
  const root = server.config.root
  if (!process.env.KV_REST_API_URL && (name === 'films' || name === 'galaxy')) {
    const { films, related } = localData(root)
    return Response.json(name === 'films' ? { films } : galaxyLinks(films, related))
  }
  if (!/^[a-z-]+$/.test(name) || !existsSync(`${root}/api/${name}.ts`)) {
    return Response.json({ error: 'No such route' }, { status: 404 })
  }
  const module = (await server.ssrLoadModule(`/api/${name}.ts`)) as Record<
    string,
    (request: Request) => Promise<Response>
  >
  const handler = module[request.method ?? 'GET']
  if (!handler) return Response.json({ error: 'Method not allowed' }, { status: 405 })
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) if (typeof value === 'string') headers.set(key, value)
  return handler(
    new Request(url, { method: request.method, headers, body: hasBody ? await readBody(request) : undefined }),
  )
}

/**
 * The variables of the .env files, put into process.env for the API routes. loadEnv lets process.env win over the
 * files, so the keys written on the last start are cleared first: a restart after an .env.local edit sees it.
 */
function applyEnv(mode: string, root: string) {
  for (const key of (process.env.RETROREEL_ENV_KEYS ?? '').split(',').filter(Boolean)) delete process.env[key]
  const fromFiles = Object.entries(loadEnv(mode, root, '')).filter(([key]) => !(key in process.env))
  Object.assign(process.env, Object.fromEntries(fromFiles), {
    RETROREEL_LOCAL: '1',
    RETROREEL_ENV_KEYS: fromFiles.map(([key]) => key).join(','),
  })
}

export function localApi(mode: string): Plugin {
  return {
    name: 'retroreel-local-api',
    apply: 'serve',
    configureServer(server) {
      applyEnv(mode, server.config.root)
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
        if (!url.pathname.startsWith('/api/')) return next()
        const answer = async () => {
          const result = await route(server, request, url)
          response.statusCode = result.status
          result.headers.forEach((value, key) => response.setHeader(key, value))
          response.end(Buffer.from(await result.arrayBuffer()))
        }
        answer().catch(next)
      })
    },
  }
}
