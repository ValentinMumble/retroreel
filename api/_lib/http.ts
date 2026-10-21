/** Small helpers shared by the API routes. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {...init, headers: {'Cache-Control': 'no-store', ...init.headers}});
}

/** Runs a route, turning thrown HttpErrors (and anything else) into JSON error answers. */
export async function handle(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) return json({error: error.message}, {status: error.status});
    console.error(error);
    return json({error: 'Something went wrong, try again later'}, {status: 500});
  }
}

export function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export function bearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // Falls through to the error below.
  }
  throw new HttpError(400, 'Expected a JSON object');
}

export function env(name: string) {
  const value = process.env[name];
  if (!value) throw new HttpError(503, `The server is missing ${name}`);
  return value;
}
