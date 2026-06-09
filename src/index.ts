interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * NASA/JPL Solar System Dynamics + CNEOS MCP.
 * Keyless small-body (asteroid/comet) and near-Earth close-approach data.
 */


const BASE = 'https://ssd-api.jpl.nasa.gov';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'get_small_body',
    description:
      'NASA/JPL Solar System Dynamics — look up an asteroid or comet by name or designation and return its orbit and physical parameters (eccentricity, semi-major axis, MOID, diameter, albedo, NEO/PHA flags). Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Asteroid/comet name or designation, e.g. "Ceres", "433 Eros", "Halley", "2021 PH27".',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'close_approaches',
    description:
      'NASA/JPL CNEOS — list near-Earth close approaches to Earth in a date range, with miss distance (AU), relative velocity (km/s), and absolute magnitude (size proxy). Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Start date (inclusive), YYYY-MM-DD.' },
        end: { type: 'string', description: 'End date (inclusive), YYYY-MM-DD.' },
        max_distance: {
          type: 'string',
          description: 'Max miss distance, default "0.05" AU. Accepts lunar distances too, e.g. "10LD".',
        },
        limit: { type: 'number', description: 'Max rows, default 25, max 100.' },
      },
      required: ['start', 'end'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'get_small_body':
        return await getSmallBody(args);
      case 'close_approaches':
        return await closeApproaches(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function getSmallBody(args: Record<string, unknown>): Promise<unknown> {
  const name = args.name;
  if (typeof name !== 'string' || !name.trim()) {
    return { error: 'small body not found', name };
  }
  const url = `${BASE}/sbdb.api?sstr=${encodeURIComponent(name)}&phys-par=1`;
  const data = (await jget(url)) as Record<string, unknown>;

  const object = data?.object as Record<string, unknown> | undefined;
  if (!object) {
    return { error: 'small body not found', name };
  }

  const orbit = data?.orbit as Record<string, unknown> | undefined;
  const orbitClass = object.orbit_class as Record<string, unknown> | undefined;

  const rawElements = Array.isArray(orbit?.elements) ? (orbit!.elements as Record<string, unknown>[]) : [];
  const elements = rawElements.map((el) => ({
    name: (el.label as unknown) ?? el.name,
    value: el.value,
    units: el.units,
  }));

  const rawPhys = Array.isArray(data?.phys_par) ? (data.phys_par as Record<string, unknown>[]) : [];
  const physical = rawPhys.map((p) => ({
    name: (p.desc as unknown) ?? p.name,
    value: p.value,
    units: p.units,
  }));

  return {
    fullname: object.fullname,
    designation: object.des,
    kind: object.kind,
    orbit_class: orbitClass?.name,
    neo: object.neo,
    potentially_hazardous: object.pha,
    orbit: {
      epoch: orbit?.epoch,
      moid_au: orbit?.moid,
      elements,
    },
    physical,
  };
}

async function closeApproaches(args: Record<string, unknown>): Promise<unknown> {
  const start = args.start;
  const end = args.end;
  if (typeof start !== 'string' || !start.trim()) {
    return { error: 'Required argument "start" is missing. Pass a date like "2026-01-01".' };
  }
  if (typeof end !== 'string' || !end.trim()) {
    return { error: 'Required argument "end" is missing. Pass a date like "2026-02-01".' };
  }

  const maxDistance =
    typeof args.max_distance === 'string' && args.max_distance.trim() ? args.max_distance.trim() : '0.05';

  let limit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.floor(args.limit) : 25;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;

  const url =
    `${BASE}/cad.api?date-min=${encodeURIComponent(start)}&date-max=${encodeURIComponent(end)}` +
    `&dist-max=${encodeURIComponent(maxDistance)}&body=${encodeURIComponent('Earth')}` +
    `&sort=${encodeURIComponent('dist')}&limit=${encodeURIComponent(String(limit))}`;

  const data = (await jget(url)) as Record<string, unknown>;

  const count = typeof data?.count === 'number' ? data.count : Number(data?.count ?? 0) || 0;
  const fields = Array.isArray(data?.fields) ? (data.fields as string[]) : [];
  const rows = Array.isArray(data?.data) ? (data.data as unknown[][]) : [];

  const idx = (f: string): number => fields.indexOf(f);
  const iDes = idx('des');
  const iCd = idx('cd');
  const iDist = idx('dist');
  const iDistMin = idx('dist_min');
  const iVRel = idx('v_rel');
  const iH = idx('h');

  const at = (row: unknown[], i: number): unknown => (i >= 0 ? row[i] : undefined);

  const approaches = rows.map((row) => ({
    object: at(row, iDes),
    date: at(row, iCd),
    distance_au: at(row, iDist),
    min_distance_au: at(row, iDistMin),
    velocity_km_s: at(row, iVRel),
    magnitude: at(row, iH),
  }));

  return { count, approaches };
}

async function jget(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) {
    const body = await res.text().then((t) => t.slice(0, 200)).catch(() => '');
    throw new Error(`JPL SSD: ${res.status} ${body}`);
  }
  return res.json();
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
