// The vehicle catalogue: every category of the reference picture, each with its templates.
// Cars come from the brand specifications (brands.ts); everything else is defined here and drawn by the realistic model generators.
import { newPart, type PartDoc } from './parts';
import { params, poly, ext, type Template } from './partlib';
import { BRAND_TEMPLATES } from './brands';
import type { VSpec } from './vmodel';

type P = Record<string, number>;
type Item = { key: string; label: string; sub: string; vspec: VSpec; p: P; kg: number; paint?: string };

const body = (name: string, vspec: VSpec, p: P, kg: number): PartDoc => {
  const d = newPart(name); d.kind = 'vehicle'; d.vspec = vspec;
  d.params = params(p);
  const L = p.L ?? 4000, H = p.H ?? 1500, gc = p.gc ?? 0;
  d.steps = [poly('b', 'Overall envelope', 'XZ', '0', [[0, gc], [L, gc], [L, H], [0, H]], [undefined, undefined, undefined, undefined]), ext('be', 'Envelope', 'b', 'new', `${p.W ?? 1800}`, true)];
  d.density = Math.round((kg / ((L * (p.W ?? 1800) * (H - gc)) * 1e-9 * 0.25)) * 10) / 10;
  return d;
};
const T = (cat: string, i: Item): Template => ({ key: i.key, label: i.label, brand: cat, group: 'brand', blurb: i.sub, make: () => body(i.label, i.paint ? { ...i.vspec, paint: i.paint } : i.vspec, i.p, i.kg) });
const car = (style: VSpec['style'], variant?: string): VSpec => ({ kind: 'car', style, variant });

const V = { fo: 0, gc: 0 };
void V;
const COMMERCIAL: Item[] = [
  { key: 'van-sprinter', label: 'Van (Mercedes-Benz Sprinter)', sub: 'Large panel van, 5.9 m', vspec: car('van', 'panel'), p: { L: 5900, W: 2020, H: 2600, wb: 3665, gc: 200, rw: 340, tw: 235, fo: 1000 }, kg: 2500, paint: '#e8eaed' },
  { key: 'van-transit', label: 'Panel Van (Ford Transit)', sub: 'Medium panel van, 5.5 m', vspec: car('van', 'panel'), p: { L: 5500, W: 2100, H: 2500, wb: 3300, gc: 200, rw: 330, tw: 225, fo: 950 }, kg: 2200, paint: '#f2f3f5' },
  { key: 'minibus-hiace', label: 'Minibus (Toyota HiAce)', sub: '14-seat minibus, 5.4 m', vspec: car('van'), p: { L: 5380, W: 1880, H: 2285, wb: 3210, gc: 190, rw: 320, tw: 215, fo: 900 }, kg: 2100, paint: '#eef0f2' },
  { key: 'lorry-daf', label: 'Lorry (DAF XF)', sub: 'Rigid box lorry, 9.5 m', vspec: { kind: 'truck' }, p: { L: 9500, W: 2550, gc: 460, fh: 640, cabl: 2100, cabh: 1900, boxl: 6800, boxh: 2700, rw: 520, tw: 295, fo: 1300, wb: 5000, ax2: 1350 }, kg: 9500, paint: '#d9dde2' },
  { key: 'truck-volvo-fh', label: 'Truck (Volvo FH)', sub: 'Tractor unit with 13.6 m trailer', vspec: { kind: 'semi' }, p: { L: 16500, W: 2550, gc: 460, fh: 640, cabl: 2300, cabh: 2000, rw: 520, tw: 295, fo: 1300, wb: 3800, ax2: 0 }, kg: 18000, paint: '#e9ecef' },
];
const BUSES: Item[] = [
  { key: 'bus-city', label: 'City Bus (Mercedes-Benz)', sub: '12 m low-floor city bus', vspec: { kind: 'bus' }, p: { L: 12000, W: 2550, H: 3250, wb: 6000, fo: 2600, gc: 420, rw: 520, tw: 295, nwin: 7, wl: 1100, wsp: 1300, wz: 1450, wh: 900 }, kg: 11000, paint: '#f4f5f7' },
  { key: 'bus-coach', label: 'Coach (Setra)', sub: '12.2 m long-distance coach', vspec: { kind: 'coach', variant: 'coach' }, p: { L: 12200, W: 2550, H: 3700, wb: 6100, fo: 2700, gc: 480, rw: 520, tw: 295, nwin: 7, wl: 1100, wsp: 1300, wz: 1700, wh: 800 }, kg: 14000, paint: '#e4e8ee' },
  { key: 'bus-double-decker', label: 'Double Decker (Volvo)', sub: 'Two-deck city bus, 4.4 m tall', vspec: { kind: 'coach', variant: 'double' }, p: { L: 11300, W: 2550, H: 4400, wb: 5800, fo: 2400, gc: 400, rw: 500, tw: 295, nwin: 6, wl: 1100, wsp: 1300, wz: 1350, wh: 800 }, kg: 12500, paint: '#c8102e' },
  { key: 'bus-school', label: 'School Bus (Ford)', sub: 'Yellow school bus', vspec: { kind: 'bus' }, p: { L: 9800, W: 2400, H: 3000, wb: 5000, fo: 2000, gc: 420, rw: 470, tw: 265, nwin: 6, wl: 1000, wsp: 1200, wz: 1300, wh: 800 }, kg: 8000, paint: '#f5b800' },
  { key: 'minibus-iveco', label: 'Minibus (Iveco)', sub: '19-seat minibus', vspec: car('van'), p: { L: 6200, W: 2000, H: 2700, wb: 3750, gc: 220, rw: 340, tw: 235, fo: 1050 }, kg: 3500, paint: '#f1f2f4' },
];
const BIKES: Item[] = [
  { key: 'moto-harley', label: 'Cruiser (Harley-Davidson)', sub: 'Touring cruiser, 2.4 m', vspec: { kind: 'moto' }, p: { wb: 1630, rw: 340, tw: 150 }, kg: 330, paint: '#1d1d20' },
  { key: 'moto-yamaha', label: 'Sport Bike (Yamaha)', sub: 'Supersport, 1.4 m wheelbase', vspec: { kind: 'moto' }, p: { wb: 1400, rw: 320, tw: 180 }, kg: 200, paint: '#1747c9' },
  { key: 'moto-ducati', label: 'Panigale (Ducati)', sub: 'Italian superbike', vspec: { kind: 'moto' }, p: { wb: 1469, rw: 320, tw: 190 }, kg: 175, paint: '#c8102e' },
  { key: 'scooter-vespa', label: 'Scooter (Vespa)', sub: 'Classic city scooter', vspec: { kind: 'scooter' }, p: { wb: 1280, rw: 250, tw: 110 }, kg: 130, paint: '#9fbfc4' },
  { key: 'bike-ebike', label: 'E-Bike', sub: 'Electric commuter bicycle', vspec: { kind: 'bike' }, p: { wb: 1130, rw: 340 }, kg: 24, paint: '#2a2d31' },
  { key: 'bike-mountain', label: 'Mountain Bike', sub: '29-inch trail bike', vspec: { kind: 'bike' }, p: { wb: 1130, rw: 370 }, kg: 14, paint: '#2e7d32' },
  { key: 'bike-road', label: 'Road Bike', sub: 'Lightweight racing bicycle', vspec: { kind: 'bike' }, p: { wb: 990, rw: 335 }, kg: 8, paint: '#c0392b' },
  { key: 'bike-folding', label: 'Folding Bike', sub: '20-inch compact bicycle', vspec: { kind: 'bike' }, p: { wb: 1000, rw: 250 }, kg: 11, paint: '#e67e22' },
  { key: 'bike-cargo', label: 'Cargo Bike', sub: 'Three-wheel cargo bike', vspec: { kind: 'trike', variant: 'cargo' }, p: { wb: 1500, rw: 300 }, kg: 45, paint: '#1f6f8b' },
  { key: 'bike-tricycle', label: 'Tricycle', sub: 'Adult tricycle with seat', vspec: { kind: 'trike' }, p: { wb: 1300, rw: 300 }, kg: 22, paint: '#7d3c98' },
];
const HEAVY: Item[] = [
  { key: 'tractor-john-deere', label: 'Tractor (John Deere)', sub: 'Row-crop tractor', vspec: { kind: 'tractor' }, p: { L: 3900, hoodl: 1500, hw: 700, cabx: 1750, cabl: 1350, cabh: 1450, cw: 1350, chassisH: 220, rrw: 800, rtw: 450, rtr: 1650, frw: 500, ftw: 250, ftr: 1500, rax: 2650, fax: 500, exh: 36, W: 2600, H: 2900 }, kg: 6500, paint: '#367c2b' },
  { key: 'excavator-cat', label: 'Excavator (Caterpillar)', sub: '30-tonne crawler excavator', vspec: { kind: 'excavator' }, p: { L: 9500, W: 3200, H: 3200 }, kg: 30000, paint: '#f2b705' },
  { key: 'bulldozer-cat', label: 'Bulldozer (Caterpillar)', sub: 'Crawler dozer with blade and ripper', vspec: { kind: 'bulldozer' }, p: { L: 5500, W: 3400, H: 3200 }, kg: 24000, paint: '#f2b705' },
  { key: 'loader-volvo', label: 'Wheel Loader (Volvo)', sub: 'Articulated wheel loader', vspec: { kind: 'loader' }, p: { L: 8200, W: 3200, H: 3600, rw: 900, tw: 600 }, kg: 18000, paint: '#f2b705' },
  { key: 'dump-komatsu', label: 'Dump Truck (Komatsu)', sub: 'Rigid tipper truck', vspec: { kind: 'dumper' }, p: { L: 7600, W: 2550, gc: 480, fh: 700, cabl: 2000, cabh: 1800, boxl: 4800, boxh: 1500, rw: 540, tw: 300, fo: 1200, wb: 4000, ax2: 1350 }, kg: 12000, paint: '#f2b705' },
  { key: 'crane-liebherr', label: 'Crane (Liebherr)', sub: 'Mobile truck crane', vspec: { kind: 'crane' }, p: { L: 11500, W: 2550, gc: 460, fh: 640, cabl: 2100, cabh: 1900, rw: 520, tw: 295, fo: 1400, wb: 5200, ax2: 1400 }, kg: 36000, paint: '#f1c40f' },
  { key: 'forklift-toyota', label: 'Forklift (Toyota)', sub: '3-tonne counterbalance forklift', vspec: { kind: 'forklift' }, p: { L: 3300, W: 1200, H: 2200 }, kg: 4500, paint: '#e8e8ea' },
  { key: 'mixer-sany', label: 'Concrete Mixer (Sany)', sub: '9 m³ truck mixer', vspec: { kind: 'mixer' }, p: { L: 8000, W: 2500, gc: 460, fh: 640, cabl: 2000, cabh: 1850, rw: 520, tw: 295, fo: 1200, wb: 4300, ax2: 1350 }, kg: 15000, paint: '#e8a317' },
  { key: 'roller-caterpillar', label: 'Road Roller (Caterpillar)', sub: 'Double-drum vibratory roller', vspec: { kind: 'roller' }, p: { L: 5000, W: 2300, H: 3000 }, kg: 10000, paint: '#f2b705' },
  { key: 'snow-plough-mercedes', label: 'Snow Plough (Mercedes-Benz)', sub: 'Truck with plough blade and gritter', vspec: { kind: 'snow' }, p: { L: 7000, W: 2500, gc: 460, fh: 640, cabl: 2000, cabh: 1800, rw: 500, tw: 285, fo: 1200, wb: 3900, ax2: 0 }, kg: 11000, paint: '#e8a317' },
];
const FARM: Item[] = [
  { key: 'combine-john-deere', label: 'Combine Harvester (John Deere)', sub: 'Grain harvester with header', vspec: { kind: 'combine' }, p: { L: 9500, W: 3500, H: 4000 }, kg: 18000, paint: '#367c2b' },
  { key: 'tractor-fendt', label: 'Tractor (Fendt)', sub: 'High-power farm tractor', vspec: { kind: 'tractor' }, p: { L: 4300, hoodl: 1700, hw: 800, cabx: 1950, cabl: 1450, cabh: 1500, cw: 1450, chassisH: 240, rrw: 850, rtw: 520, rtr: 1800, frw: 560, ftw: 320, ftr: 1700, rax: 2850, fax: 550, exh: 40, W: 2800, H: 3000 }, kg: 9000, paint: '#4c9a2a' },
  { key: 'sprayer-john-deere', label: 'Sprayer (John Deere)', sub: 'Self-propelled crop sprayer', vspec: { kind: 'sprayer' }, p: { L: 7200, W: 3000, H: 3900 }, kg: 11000, paint: '#367c2b' },
  { key: 'seeder-kverneland', label: 'Seeder (Kverneland)', sub: 'Trailed seed drill', vspec: { kind: 'seeder' }, p: { L: 4200, W: 3200, H: 2400 }, kg: 3200, paint: '#c8102e' },
  { key: 'baler-krone', label: 'Baler (Krone)', sub: 'Round baler', vspec: { kind: 'baler' }, p: { L: 5200, W: 2400, H: 2300 }, kg: 4000, paint: '#3d9a2a' },
];
const MINING: Item[] = [
  { key: 'mining-truck-cat', label: 'Mining Truck (Caterpillar)', sub: '100-tonne haul truck', vspec: { kind: 'dumper', variant: 'mining' }, p: { L: 11000, W: 5000, gc: 800, fh: 900, cabl: 2400, cabh: 2300, boxl: 7000, boxh: 3000, rw: 1100, tw: 650, fo: 1800, wb: 5500, ax2: 0 }, kg: 90000, paint: '#f2b705' },
  { key: 'loader-volvo-front', label: 'Front Loader (Volvo)', sub: 'Mining wheel loader', vspec: { kind: 'loader' }, p: { L: 12000, W: 4200, H: 5000, rw: 1300, tw: 800 }, kg: 60000, paint: '#f2b705' },
  { key: 'drill-rig-sandvik', label: 'Drill Rig (Sandvik)', sub: 'Mobile drilling rig', vspec: { kind: 'crane' }, p: { L: 9000, W: 2550, gc: 600, fh: 700, cabl: 2000, cabh: 1800, rw: 600, tw: 320, fo: 1200, wb: 4300, ax2: 1400 }, kg: 30000, paint: '#f2b705' },
  { key: 'stacker-terex', label: 'Stacker (Terex)', sub: 'Tracked stacking conveyor', vspec: { kind: 'conveyor', variant: 'stacker' }, p: { L: 30000, W: 3000, H: 9000 }, kg: 60000, paint: '#e8a317' },
  { key: 'conveyor-sandvik', label: 'Conveyor (Sandvik)', sub: 'Inclined belt conveyor', vspec: { kind: 'conveyor' }, p: { L: 30000, W: 3000, H: 9000 }, kg: 20000, paint: '#e8a317' },
];
const AIR: Item[] = [
  { key: 'air-boeing-787', label: 'Boeing 787', sub: 'Wide-body airliner, 57 m', vspec: { kind: 'airliner' }, p: { L: 57000, W: 60000, H: 17000 }, kg: 120000, paint: '#1f4e9c' },
  { key: 'air-airbus-a350', label: 'Airbus A350', sub: 'Wide-body airliner, 67 m', vspec: { kind: 'airliner' }, p: { L: 66800, W: 64750, H: 17100 }, kg: 142000, paint: '#17488a' },
  { key: 'air-embraer-e195', label: 'Embraer E195', sub: 'Regional jet, 39 m', vspec: { kind: 'airliner' }, p: { L: 38650, W: 28700, H: 10500 }, kg: 28000, paint: '#1e6bb8' },
  { key: 'air-bombardier-7500', label: 'Bombardier Global 7500', sub: 'Long-range business jet', vspec: { kind: 'airliner' }, p: { L: 33800, W: 31700, H: 8200 }, kg: 24000, paint: '#6b7280' },
  { key: 'air-cessna-172', label: 'Cessna 172', sub: 'Light single-engine plane', vspec: { kind: 'plane' }, p: { L: 8300, W: 11000, H: 2700 }, kg: 800, paint: '#2a6fb0' },
  { key: 'heli-airbus-h135', label: 'Airbus H135', sub: 'Twin-engine helicopter', vspec: { kind: 'helicopter' }, p: { L: 12200, W: 2800, H: 3500 }, kg: 1800, paint: '#1f5fbf' },
  { key: 'heli-bell-407', label: 'Bell 407', sub: 'Light utility helicopter', vspec: { kind: 'helicopter' }, p: { L: 12500, W: 2700, H: 3500 }, kg: 1300, paint: '#c0392b' },
  { key: 'heli-eurocopter-h145', label: 'Eurocopter H145', sub: 'Medical and utility helicopter', vspec: { kind: 'helicopter' }, p: { L: 13000, W: 2900, H: 3700 }, kg: 2000, paint: '#d6d9dd' },
  { key: 'air-dassault-falcon-7x', label: 'Dassault Falcon 7X', sub: 'Tri-jet business aircraft', vspec: { kind: 'airliner' }, p: { L: 23400, W: 26200, H: 7800 }, kg: 15000, paint: '#a5acb5' },
  { key: 'heli-sikorsky-s92', label: 'Sikorsky S-92', sub: 'Heavy transport helicopter', vspec: { kind: 'helicopter' }, p: { L: 17100, W: 3300, H: 4600 }, kg: 7000, paint: '#2f4f7f' },
];
const SEA: Item[] = [
  { key: 'ship-royal-caribbean', label: 'Royal Caribbean Cruise Ship', sub: '360 m cruise liner', vspec: { kind: 'ship', variant: 'cruise' }, p: { L: 360000, W: 47000, H: 70000 }, kg: 1000000000, paint: '#1c56a6' },
  { key: 'ship-carnival', label: 'Carnival Cruise Ship', sub: '300 m cruise liner', vspec: { kind: 'ship', variant: 'cruise' }, p: { L: 300000, W: 38000, H: 60000 }, kg: 800000000, paint: '#c8102e' },
  { key: 'ship-msc', label: 'MSC Cruises Cruise Ship', sub: '330 m cruise liner', vspec: { kind: 'ship', variant: 'cruise' }, p: { L: 330000, W: 43000, H: 66000 }, kg: 900000000, paint: '#0b3d8f' },
  { key: 'boat-yacht', label: 'Yacht (Princess)', sub: 'Motor yacht, 30 m', vspec: { kind: 'ship', variant: 'yacht' }, p: { L: 30000, W: 7000, H: 6000 }, kg: 90000, paint: '#f4f6f8' },
  { key: 'boat-speedboat', label: 'Speedboat (Sea Ray)', sub: 'Sport cruiser, 9 m', vspec: { kind: 'ship', variant: 'speedboat' }, p: { L: 9000, W: 2900, H: 3000 }, kg: 3500, paint: '#e7ebef' },
  { key: 'ship-fishing', label: 'Fishing Boat (Commercial)', sub: 'Trawler, 20 m', vspec: { kind: 'ship', variant: 'fishing' }, p: { L: 20000, W: 6000, H: 5000 }, kg: 90000, paint: '#2c5aa0' },
  { key: 'ship-tanker-shell', label: 'Tanker (Shell)', sub: 'Oil tanker, 250 m', vspec: { kind: 'ship', variant: 'tanker' }, p: { L: 250000, W: 44000, H: 36000 }, kg: 90000000, paint: '#f1c40f' },
  { key: 'ship-cargo-maersk', label: 'Cargo Ship (Maersk)', sub: 'Container ship, 300 m', vspec: { kind: 'ship', variant: 'cargo' }, p: { L: 300000, W: 48000, H: 40000 }, kg: 90000000, paint: '#5ab4e5' },
  { key: 'sub-type-212', label: 'Submarine (Type 212)', sub: 'Diesel-electric submarine, 56 m', vspec: { kind: 'submarine' }, p: { L: 56000, W: 7000, H: 11000 }, kg: 1800000, paint: '#2c3a46' },
  { key: 'boat-sailing', label: 'Sailing Boat (Beneteau)', sub: 'Cruising sloop, 12 m', vspec: { kind: 'sailboat' }, p: { L: 12000, W: 3800, H: 17000 }, kg: 7000, paint: '#f2f3f5' },
];
const RAIL: Item[] = [
  { key: 'train-siemens-ice', label: 'Siemens ICE', sub: 'High-speed train, 4 cars', vspec: { kind: 'train', variant: 'hs' }, p: { L: 100000, W: 2950, H: 3900, cars: 4 }, kg: 400000, paint: '#c8102e' },
  { key: 'train-alstom-tgv', label: 'Alstom TGV', sub: 'High-speed train, 4 cars', vspec: { kind: 'train', variant: 'hs' }, p: { L: 100000, W: 2900, H: 4100, cars: 4 }, kg: 400000, paint: '#1d3f8a' },
  { key: 'train-hitachi-bullet', label: 'Hitachi Bullet Train', sub: 'Shinkansen, 4 cars', vspec: { kind: 'train', variant: 'hs' }, p: { L: 100000, W: 3380, H: 3650, cars: 4 }, kg: 380000, paint: '#00a1de' },
  { key: 'train-crrc-fuxing', label: 'CRRC Fuxing', sub: 'High-speed train, 4 cars', vspec: { kind: 'train', variant: 'hs' }, p: { L: 100000, W: 3360, H: 4050, cars: 4 }, kg: 420000, paint: '#b01e23' },
  { key: 'train-stadler-flirt', label: 'Stadler Flirt', sub: 'Regional train, 3 cars', vspec: { kind: 'train', variant: 'regional' }, p: { L: 75000, W: 2900, H: 4200, cars: 3 }, kg: 150000, paint: '#2a6fb0' },
  { key: 'train-bombardier-talent', label: 'Bombardier Talent', sub: 'Regional train, 3 cars', vspec: { kind: 'train', variant: 'regional' }, p: { L: 75000, W: 2950, H: 4250, cars: 3 }, kg: 140000, paint: '#d11f2c' },
];
const EMERGENCY: Item[] = [
  { key: 'amb-sprinter', label: 'Ambulance (Mercedes-Benz)', sub: 'Emergency ambulance van', vspec: car('van', 'ambulance'), p: { L: 5900, W: 2020, H: 2650, wb: 3665, gc: 200, rw: 340, tw: 235, fo: 1000 }, kg: 3200, paint: '#f4f5f6' },
  { key: 'fire-scania', label: 'Fire Engine (Scania)', sub: 'Pumper with ladder', vspec: { kind: 'fire' }, p: { L: 8000, W: 2500, gc: 460, fh: 640, cabl: 2100, cabh: 1900, rw: 520, tw: 295, fo: 1300, wb: 4300, ax2: 1350 }, kg: 15000, paint: '#c8102e' },
  { key: 'police-bmw', label: 'Police Car (BMW)', sub: 'Patrol sedan with light bar', vspec: car('sedan', 'police'), p: { L: 4709, W: 1827, H: 1442, wb: 2851, gc: 140, rw: 335, tw: 225, fo: 960 }, kg: 1700, paint: '#f3f5f7' },
  { key: 'rescue-land-rover', label: 'Rescue Vehicle (Land Rover)', sub: 'Defender rescue truck', vspec: car('suv', 'rescue'), p: { L: 4758, W: 1996, H: 1967, wb: 3022, gc: 220, rw: 400, tw: 255, fo: 1000 }, kg: 2500, paint: '#e8a317' },
  { key: 'tow-volvo', label: 'Tow Truck (Volvo)', sub: 'Flatbed recovery truck', vspec: { kind: 'tow' }, p: { L: 7000, W: 2400, gc: 460, fh: 640, cabl: 2000, cabh: 1800, rw: 500, tw: 285, fo: 1200, wb: 3900, ax2: 0 }, kg: 9000, paint: '#e8a317' },
];
const RV: Item[] = [
  { key: 'rv-camper-vw', label: 'Camper Van (Volkswagen)', sub: 'Pop-top camper van', vspec: car('van'), p: { L: 5000, W: 1950, H: 2000, wb: 3000, gc: 190, rw: 330, tw: 225, fo: 880 }, kg: 2200, paint: '#5aa0c8' },
  { key: 'rv-motorhome-adria', label: 'Motorhome (Adria)', sub: 'Integrated motorhome, 7.4 m', vspec: { kind: 'rv', variant: 'motorhome' }, p: { L: 7400, W: 2300, H: 3000 }, kg: 3500, paint: '#2a6fb0' },
  { key: 'rv-caravan-knaus', label: 'Caravan (Knaus)', sub: 'Touring caravan, 6 m', vspec: { kind: 'rv', variant: 'caravan' }, p: { L: 6000, W: 2300, H: 2700 }, kg: 1400, paint: '#8fa3b5' },
  { key: 'rv-ford', label: 'RV (Ford)', sub: 'Class C recreational vehicle', vspec: { kind: 'rv', variant: 'rv' }, p: { L: 8000, W: 2400, H: 3200 }, kg: 5000, paint: '#a33a2a' },
  { key: 'jetski-sea-doo', label: 'Jet Ski (Sea-Doo)', sub: 'Personal watercraft', vspec: { kind: 'jetski' }, p: { L: 3300, W: 1200, H: 1100 }, kg: 400, paint: '#f4d21f' },
];
const OTHER: Item[] = [
  { key: 'other-segway', label: 'Segway (Ninebot)', sub: 'Electric kick scooter', vspec: { kind: 'segway' }, p: { L: 1200, W: 500, H: 1250 }, kg: 14, paint: '#2a2d31' },
  { key: 'other-hoverboard', label: 'Hoverboard (Samsung)', sub: 'Self-balancing board', vspec: { kind: 'hoverboard' }, p: { L: 700, W: 220, H: 200 }, kg: 10, paint: '#2a2d31' },
  { key: 'other-drone', label: 'Drone (DJI)', sub: 'Quadcopter with camera', vspec: { kind: 'drone' }, p: { L: 600, W: 600, H: 330 }, kg: 1, paint: '#d9dde2' },
  { key: 'other-balloon', label: 'Air Balloon (Hot Air)', sub: 'Hot-air balloon with basket', vspec: { kind: 'balloon' }, p: { L: 15000, W: 15000, H: 22000 }, kg: 450, paint: '#d1342c' },
  { key: 'other-deepsee', label: 'Submersible (DeepSee)', sub: 'Two-person submersible', vspec: { kind: 'submarine', variant: 'mini' }, p: { L: 5000, W: 1800, H: 2200 }, kg: 4800, paint: '#f1c40f' },
];

const CARS: string[] = ['toyota-corolla', 'mercedes-benz-c-class', 'bmw-3-series', 'audi-a4', 'ford-mustang', 'honda-civic', 'nissan-altima', 'hyundai-elantra', 'tesla-model-3', 'volkswagen-golf'];
const SUVS: string[] = ['land-rover-range-rover', 'land-rover-defender-110', 'toyota-land-cruiser-300', 'jeep-wrangler', 'mercedes-benz-g-class', 'lexus-lx-600', 'nissan-patrol', 'ford-bronco', 'mitsubishi-pajero', 'suzuki-jimny'];
const LUX: string[] = ['bentley-bentayga', 'rolls-royce-cullinan', 'lamborghini-urus', 'aston-martin-dbx', 'porsche-cayenne', 'bmw-x5'];
const PICKUPS: string[] = ['toyota-hilux-double-cab', 'ford-ranger', 'isuzu-d-max', 'nissan-navara', 'volkswagen-amarok'];
const pick = (keys: string[], cat: string): Template[] => keys.map(k => BRAND_TEMPLATES.find(t => t.key === k)).filter((t): t is Template => !!t).map(t => ({ ...t, brand: cat }));

export const CATALOG: { title: string; icon: string; items: Template[] }[] = [
  { title: 'Cars & Sedans', icon: '🚗', items: pick(CARS, 'Cars & Sedans') },
  { title: 'SUVs & 4×4s', icon: '🚙', items: pick(SUVS, 'SUVs & 4×4s') },
  { title: 'Luxury & Performance', icon: '🏎️', items: [...pick(LUX, 'Luxury & Performance'), ...pick(['ferrari-296-gtb', 'lamborghini-huracan', 'porsche-911'], 'Luxury & Performance')] },
  { title: 'Commercial Vehicles', icon: '🚚', items: [...COMMERCIAL.map(i => T('Commercial Vehicles', i)), ...pick(PICKUPS, 'Commercial Vehicles')] },
  { title: 'Buses & Coaches', icon: '🚌', items: BUSES.map(i => T('Buses & Coaches', i)) },
  { title: 'Motorcycles, Scooters & Bicycles', icon: '🏍️', items: BIKES.map(i => T('Motorcycles, Scooters & Bicycles', i)) },
  { title: 'Heavy Duty & Construction Machinery', icon: '🏗️', items: HEAVY.map(i => T('Heavy Duty & Construction Machinery', i)) },
  { title: 'Agricultural & Farming', icon: '🚜', items: FARM.map(i => T('Agricultural & Farming', i)) },
  { title: 'Mining & Industrial', icon: '⛏️', items: MINING.map(i => T('Mining & Industrial', i)) },
  { title: 'Aircraft & Helicopters', icon: '✈️', items: AIR.map(i => T('Aircraft & Helicopters', i)) },
  { title: 'Ships, Boats & Submarines', icon: '🚢', items: SEA.map(i => T('Ships, Boats & Submarines', i)) },
  { title: 'Trains, Trams & Rail', icon: '🚆', items: RAIL.map(i => T('Trains, Trams & Rail', i)) },
  { title: 'Specialised & Emergency Vehicles', icon: '🚑', items: EMERGENCY.map(i => T('Specialised & Emergency Vehicles', i)) },
  { title: 'Recreational Vehicles', icon: '🏕️', items: RV.map(i => T('Recreational Vehicles', i)) },
  { title: 'Other Notable Vehicles', icon: '🛴', items: OTHER.map(i => T('Other Notable Vehicles', i)) },
];
export const CATALOG_TEMPLATES: Template[] = CATALOG.flatMap(c => c.items).filter(t => !BRAND_TEMPLATES.some(b => b.key === t.key));
