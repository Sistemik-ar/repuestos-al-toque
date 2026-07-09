import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    zone: { findMany: vi.fn() },
    mechanicProfile: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { getActiveZones, zonesForRole, mechanicZone, DEFAULT_ZONES } from '@/lib/zones';

beforeEach(() => vi.clearAllMocks());

const BARILOCHE = { id: 1, slug: 'bariloche', name: 'Bariloche', latMin: -41.30, latMax: -40.95, lngMin: -71.70, lngMax: -71.05, active: true, deliveryEnabled: true, storesEnabled: true };
const BOLSON = { id: 2, slug: 'el-bolson', name: 'El Bolsón', latMin: -42.05, latMax: -41.85, lngMin: -71.65, lngMax: -71.40, active: true, deliveryEnabled: false, storesEnabled: false };

describe('getActiveZones', () => {
  it('devuelve las zonas de la DB', async () => {
    prisma.zone.findMany.mockResolvedValue([BARILOCHE, BOLSON]);
    expect(await getActiveZones()).toHaveLength(2);
  });
  it('cae al default (Bariloche) si la tabla está vacía o falla', async () => {
    prisma.zone.findMany.mockResolvedValue([]);
    expect(await getActiveZones()).toEqual(DEFAULT_ZONES);
    prisma.zone.findMany.mockRejectedValue(new Error('no table'));
    expect(await getActiveZones()).toEqual(DEFAULT_ZONES);
  });
});

describe('zonesForRole (comercios solo donde están habilitados)', () => {
  it('mecánicos: todas las zonas activas', () => {
    expect(zonesForRole([BARILOCHE, BOLSON], 'MECHANIC')).toHaveLength(2);
  });
  it('comercios: solo zonas con storesEnabled (hoy Bariloche)', () => {
    const zs = zonesForRole([BARILOCHE, BOLSON], 'STORE');
    expect(zs).toHaveLength(1);
    expect(zs[0].slug).toBe('bariloche');
  });
});

describe('mechanicZone', () => {
  it('usa la zona guardada en el perfil', async () => {
    prisma.mechanicProfile.findUnique.mockResolvedValue({ zoneId: 2, lat: -41.96, lng: -71.53, zone: BOLSON });
    const z = await mechanicZone('m1');
    expect(z?.slug).toBe('el-bolson');
    expect(prisma.zone.findMany).not.toHaveBeenCalled();
  });
  it('sin zoneId (alta vieja): deriva por coordenadas contra las zonas activas', async () => {
    prisma.mechanicProfile.findUnique.mockResolvedValue({ zoneId: null, lat: -41.96, lng: -71.53, zone: null });
    prisma.zone.findMany.mockResolvedValue([BARILOCHE, BOLSON]);
    const z = await mechanicZone('m1');
    expect(z?.slug).toBe('el-bolson');
  });
  it('sin coordenadas devuelve null', async () => {
    prisma.mechanicProfile.findUnique.mockResolvedValue({ zoneId: null, lat: null, lng: null, zone: null });
    expect(await mechanicZone('m1')).toBeNull();
  });
});
