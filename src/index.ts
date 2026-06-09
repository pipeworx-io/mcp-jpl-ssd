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
 * Keyless small-body (asteroid/comet), near-Earth close-approach,
 * Sentry impact-risk, and recent fireball/bolide data.
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
  {
    name: 'impact_risk',
    description:
      'NASA/JPL CNEOS Sentry — Earth impact risk for asteroids. Pass a designation for one object\'s cumulative impact probability, Palermo/Torino scale, diameter, and impact window; or omit it to list all currently-tracked objects above an impact-probability threshold. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        designation: {
          type: 'string',
          description: 'Optional specific object, e.g. "99942" or "2022 KK2". If given, returns that object\'s risk summary.',
        },
        min_probability: {
          type: 'number',
          description: 'List mode only — minimum cumulative impact probability, default 1e-4. Ignored if designation is given.',
        },
        limit: { type: 'number', description: 'List mode only — max objects, default 25.' },
      },
    },
  },
  {
    name: 'recent_fireballs',
    description:
      'NASA/JPL CNEOS — most recent atmospheric fireballs/bolides detected by U.S. Government sensors, with date, radiated and total impact energy (kilotons of TNT), location, altitude, and velocity. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max events, default 15, max 100.' },
        min_energy: {
          type: 'number',
          description: 'Optional minimum total impact energy in kilotons of TNT.',
        },
      },
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
      case 'impact_risk':
        return await impactRisk(args);
      case 'recent_fireballs':
        return await recentFireballs(args);
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

async function impactRisk(args: Record<string, unknown>): Promise<unknown> {
  const designation =
    typeof args.designation === 'string' && args.designation.trim() ? args.designation.trim() : undefined;

  if (designation) {
    const url = `${BASE}/sentry.api?des=${encodeURIComponent(designation)}`;
    const data = (await jget(url)) as Record<string, unknown>;
    const summary = data?.summary as Record<string, unknown> | undefined;
    if (!summary) {
      return { error: 'no Sentry impact data for object', designation };
    }
    return {
      designation,
      fullname: summary?.fullname,
      impact_probability: summary?.ip,
      palermo_scale: summary?.ps_cum,
      torino_scale: summary?.ts_max,
      diameter_km: summary?.diameter,
      n_impacts: summary?.n_imp,
      last_observation: summary?.last_obs,
      years: summary?.range,
    };
  }

  const minProbability =
    typeof args.min_probability === 'number' && Number.isFinite(args.min_probability) ? args.min_probability : 1e-4;

  let limit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.floor(args.limit) : 25;
  if (limit < 1) limit = 1;

  const url = `${BASE}/sentry.api?ip-min=${encodeURIComponent(String(minProbability))}`;
  const data = (await jget(url)) as Record<string, unknown>;

  const count = typeof data?.count === 'number' ? data.count : Number(data?.count ?? 0) || 0;
  const rows = Array.isArray(data?.data) ? (data.data as Record<string, unknown>[]) : [];

  const sorted = [...rows].sort((a, b) => Number(b.ip ?? 0) - Number(a.ip ?? 0));

  const objects = sorted.slice(0, limit).map((o) => ({
    designation: o.des,
    impact_probability: o.ip,
    palermo_scale: o.ps_max,
    torino_scale: o.ts_max,
    diameter_km: o.diameter,
    last_observation: o.last_obs,
    years: o.range,
  }));

  return { count, objects };
}

async function recentFireballs(args: Record<string, unknown>): Promise<unknown> {
  let limit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.floor(args.limit) : 15;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;

  let url = `${BASE}/fireball.api?limit=${encodeURIComponent(String(limit))}&sort=${encodeURIComponent('-date')}`;
  if (typeof args.min_energy === 'number' && Number.isFinite(args.min_energy)) {
    url += `&energy-min=${encodeURIComponent(String(args.min_energy))}`;
  }

  const data = (await jget(url)) as Record<string, unknown>;

  const count = typeof data?.count === 'number' ? data.count : Number(data?.count ?? 0) || 0;
  const fields = Array.isArray(data?.fields) ? (data.fields as string[]) : [];
  const rows = Array.isArray(data?.data) ? (data.data as unknown[][]) : [];

  const idx = (f: string): number => fields.indexOf(f);
  const iDate = idx('date');
  const iEnergy = idx('energy');
  const iImpactE = idx('impact-e');
  const iLat = idx('lat');
  const iLatDir = idx('lat-dir');
  const iLon = idx('lon');
  const iLonDir = idx('lon-dir');
  const iAlt = idx('alt');
  const iVel = idx('vel');

  const at = (row: unknown[], i: number): unknown => (i >= 0 ? row[i] : undefined);

  const fireballs = rows.map((row) => {
    const lat = at(row, iLat);
    const latDir = at(row, iLatDir);
    const lon = at(row, iLon);
    const lonDir = at(row, iLonDir);
    return {
      date: at(row, iDate),
      energy_kt: at(row, iEnergy),
      impact_energy_kt: at(row, iImpactE),
      latitude: lat != null ? `${lat}${latDir ?? ''}` : null,
      longitude: lon != null ? `${lon}${lonDir ?? ''}` : null,
      altitude_km: at(row, iAlt),
      velocity_km_s: at(row, iVel),
    };
  });

  return { count, fireballs };
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
