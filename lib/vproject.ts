// New vehicle projects: a named workspace that starts from a class of vehicle (or from nothing but wheels) and is yours to design.
import { newPart, type PartDoc } from './parts';
import { circles, ext, params } from './partlib';
import { bicycle, boxTruck, bus, motorcycle, pickup, sedan, tractor, trailer } from './vehicles';
import { fromSpec, SPECS } from './brands';

export type VKind = { key: string; label: string; blurb: string; make: () => PartDoc };
const spec = (brand: string, model: string) => () => fromSpec(SPECS.find(s => s.brand === brand && s.model === model)!);

// A blank vehicle: just the wheels, a wheelbase and a chassis plate, with the sizes as named parameters.
export function blankVehicle(): PartDoc {
  const d = newPart('Vehicle');
  d.params = params({ wb: 2700, track: 1500, rw: 330, tw: 225 });
  d.steps = [
    circles('ws', 'Wheels', 'XZ', 'track/2', [{ c: ['0', 'rw'], r: 'rw' }, { c: ['wb', 'rw'], r: 'rw' }]), ext('wf', 'Wheels', 'ws', 'new', 'tw', true),
    { id: 'wp', type: 'pattern', name: 'Wheels, other side', of: 'wf', mode: 'linear', count: '2', dx: '0', dy: 'track', dz: '0', axis: 'z', angle: '360', cx: '0', cy: '0', cz: '0' },
  ];
  return d;
}

export const VEHICLE_KINDS: VKind[] = [
  { key: 'blank', label: 'Blank (wheels only)', blurb: 'Wheelbase, track and wheels. You design the rest.', make: blankVehicle },
  { key: 'car', label: 'Car', blurb: 'Sedan body to reshape', make: sedan },
  { key: 'suv', label: 'SUV', blurb: 'Tall estate body', make: spec('Toyota', 'RAV4') },
  { key: 'sports', label: 'Sports car', blurb: 'Low two-seat body', make: spec('Ferrari', '296 GTB') },
  { key: 'pickup', label: 'Pickup', blurb: 'Cab and load bed', make: pickup },
  { key: 'truck', label: 'Truck', blurb: 'Cab, cargo box, three axles', make: boxTruck },
  { key: 'bus', label: 'Bus', blurb: 'Long hollow body with windows', make: bus },
  { key: 'moto', label: 'Motorcycle', blurb: 'Frame, engine, two wheels', make: motorcycle },
  { key: 'bike', label: 'Bicycle', blurb: 'Diamond frame', make: bicycle },
  { key: 'trailer', label: 'Trailer', blurb: 'Open box on an axle', make: trailer },
  { key: 'tractor', label: 'Tractor', blurb: 'Farm tractor', make: tractor },
];

export function newVehicleProject(name: string, kind: string): PartDoc {
  const k = VEHICLE_KINDS.find(x => x.key === kind) ?? VEHICLE_KINDS[0];
  return { ...k.make(), name: name.trim() || 'New vehicle', kind: 'vehicle' };
}
