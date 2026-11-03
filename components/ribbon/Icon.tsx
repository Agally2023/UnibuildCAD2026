import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';

// Line icons on a 24 x 24 grid, drawn here so the ribbon needs no icon font or network.
export type IconName =
  | 'select' | 'column' | 'beam' | 'slab' | 'wall' | 'door' | 'window' | 'duct' | 'pipe' | 'plant' | 'outlet'
  | 'undo' | 'finish' | 'delete' | 'zoomin' | 'zoomout' | 'fit' | 'grid' | 'dims' | 'modules' | 'projects' | 'cube'
  | 'design' | 'foundation' | 'wind' | 'mep' | 'clash' | 'dashboard' | 'storey' | 'plus' | 'copy' | 'ifc' | 'next' | 'code' | 'snap' | 'redo' | 'move' | 'arc' | 'roof' | 'stair' | 'zone' | 'dim' | 'text' | 'table' | 'section' | 'hole';

export function Icon({ name, size = 26, color = '#0a2e1f', accent = '#146c43' }: { name: IconName; size?: number; color?: string; accent?: string }) {
  const p = { stroke: color, strokeWidth: 1.7, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const a = { ...p, stroke: accent };
  const g = (() => {
    switch (name) {
      case 'select': return <Path d="M6 3l12 9-5.5 1.2L15 19l-2.4 1-2.5-5.6L6 18z" {...p} />;
      case 'column': return <><Rect x="8" y="3" width="8" height="18" {...p} /><Line x1="5" y1="21" x2="19" y2="21" {...p} /><Line x1="5" y1="3" x2="19" y2="3" {...p} /></>;
      case 'beam': return <><Path d="M3 8h18v3H3z" {...p} /><Path d="M3 17h18" {...a} strokeDasharray="3 2" /></>;
      case 'slab': return <><Path d="M3 14l9-5 9 5-9 5z" {...p} /><Path d="M3 17l9 5 9-5" {...a} /></>;
      case 'wall': return <><Rect x="3" y="9" width="18" height="6" {...p} /><Path d="M9 9v6M15 9v6" {...a} /></>;
      case 'door': return <><Path d="M5 21V4h9v17" {...p} /><Path d="M14 21a9 9 0 0 0-9-9" {...a} /><Line x1="3" y1="21" x2="21" y2="21" {...p} /></>;
      case 'window': return <><Rect x="4" y="5" width="16" height="14" {...p} /><Path d="M12 5v14M4 12h16" {...a} /></>;
      case 'duct': return <><Rect x="2" y="8" width="20" height="8" {...p} /><Path d="M7 8v8M12 8v8M17 8v8" {...a} /></>;
      case 'pipe': return <><Path d="M2 9h20M2 15h20" {...p} /><Circle cx="12" cy="12" r="2" {...a} /></>;
      case 'plant': return <><Rect x="3" y="5" width="18" height="14" {...p} /><Circle cx="12" cy="12" r="4" {...a} /><Path d="M12 8v8M8 12h8" {...a} /></>;
      case 'outlet': return <><Circle cx="12" cy="12" r="8" {...p} /><Path d="M12 7v10M7 12h10" {...a} /></>;
      case 'undo': return <><Path d="M9 7L4 12l5 5" {...p} /><Path d="M4 12h10a6 6 0 0 1 0 12" {...a} transform="translate(0 -4)" /></>;
      case 'redo': return <><Path d="M15 7l5 5-5 5" {...p} /><Path d="M20 12H10a6 6 0 0 0 0 12" {...a} transform="translate(0 -4)" /></>;
      case 'move': return <><Path d="M12 3v18M3 12h18" {...a} /><Path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" {...p} /></>;
      case 'arc': return <><Path d="M4 19a10 10 0 0 1 16 0" {...p} /><Circle cx="4" cy="19" r="1.8" {...a} /><Circle cx="20" cy="19" r="1.8" {...a} /><Circle cx="12" cy="9.5" r="1.4" {...a} /></>;
      case 'roof': return <><Path d="M2 13l10-8 10 8" {...p} /><Path d="M5 11v8h14v-8" {...a} /></>;
      case 'stair': return <><Path d="M3 20h5v-4h5v-4h5V8h3" {...p} /><Path d="M3 20V4" {...a} /></>;
      case 'zone': return <><Path d="M4 5h16v14H4z" {...p} strokeDasharray="3 2" /><Path d="M9 12h6M12 9v6" {...a} /></>;
      case 'dim': return <><Path d="M4 18h16M4 14v8M20 14v8" {...p} /><Path d="M4 9h16M16 6l4 3-4 3M8 6L4 9l4 3" {...a} /></>;
      case 'text': return <><Path d="M5 6h14M12 6v13" {...p} /><Path d="M9 19h6" {...a} /></>;
      case 'table': return <><Rect x="4" y="5" width="16" height="14" {...p} /><Path d="M4 10h16M4 15h16M10 5v14" {...a} /></>;
      case 'section': return <><Path d="M3 12h18" {...p} strokeDasharray="4 2" /><Path d="M6 12V5l-2 2M18 12V5l2 2" {...a} /><Path d="M6 19h12" {...p} /></>;
      case 'hole': return <><Rect x="3" y="3" width="18" height="18" {...p} /><Rect x="8" y="8" width="8" height="8" {...a} /><Path d="M8 8l8 8M16 8l-8 8" {...a} /></>;
      case 'finish': return <Path d="M4 12l5 5L20 6" {...a} />;
      case 'delete': return <><Path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" {...p} /><Path d="M10 11v7M14 11v7" {...a} /></>;
      case 'zoomin': return <><Circle cx="10" cy="10" r="6" {...p} /><Path d="M15 15l6 6" {...p} /><Path d="M10 7v6M7 10h6" {...a} /></>;
      case 'zoomout': return <><Circle cx="10" cy="10" r="6" {...p} /><Path d="M15 15l6 6" {...p} /><Path d="M7 10h6" {...a} /></>;
      case 'fit': return <><Path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" {...p} /><Rect x="9" y="9" width="6" height="6" {...a} /></>;
      case 'grid': return <><Path d="M4 4h16v16H4zM4 12h16M12 4v16" {...p} /></>;
      case 'dims': return <><Path d="M3 17h18M3 14v6M21 14v6" {...p} /><Path d="M8 10h8" {...a} /></>;
      case 'modules': return <><Rect x="4" y="4" width="7" height="7" {...p} /><Rect x="13" y="4" width="7" height="7" {...a} /><Rect x="4" y="13" width="7" height="7" {...a} /><Rect x="13" y="13" width="7" height="7" {...p} /></>;
      case 'projects': return <Path d="M3 7h7l2 2h9v10H3z" {...p} />;
      case 'cube': return <><Path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" {...p} /><Path d="M12 12l8-4.5M12 12L4 7.5M12 12v9" {...a} /></>;
      case 'design': return <><Path d="M3 8h18v4H3z" {...p} /><Path d="M3 12c4 7 14 7 18 0" {...a} /></>;
      case 'foundation': return <><Rect x="9" y="3" width="6" height="9" {...p} /><Path d="M3 12h18v4H3z" {...p} /><Path d="M5 20h14" {...a} strokeDasharray="2 2" /></>;
      case 'wind': return <><Path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h8" {...p} /></>;
      case 'mep': return <><Path d="M3 8h12v5h6M3 8v8h8" {...p} /><Circle cx="19" cy="17" r="2.5" {...a} /></>;
      case 'clash': return <><Circle cx="9" cy="12" r="6" {...p} /><Circle cx="15" cy="12" r="6" {...a} /></>;
      case 'dashboard': return <><Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...p} /><Path d="M4 20V10M16 20v-7" {...a} /></>;
      case 'storey': return <><Path d="M12 3l9 5-9 5-9-5z" {...p} /><Path d="M3 13l9 5 9-5M3 17l9 5 9-5" {...a} /></>;
      case 'plus': return <Path d="M12 5v14M5 12h14" {...a} />;
      case 'copy': return <><Rect x="8" y="8" width="12" height="12" {...p} /><Path d="M16 8V4H4v12h4" {...a} /></>;
      case 'ifc': return <><Path d="M6 3h8l5 5v13H6z" {...p} /><Path d="M14 3v5h5" {...p} /><Path d="M9 15h6M9 18h4" {...a} /></>;
      case 'next': return <Path d="M5 12h14M13 6l6 6-6 6" {...a} />;
      case 'code': return <><Path d="M8 7l-5 5 5 5M16 7l5 5-5 5" {...p} /><Path d="M14 5l-4 14" {...a} /></>;
      case 'snap': return <><Circle cx="12" cy="12" r="3" {...a} /><Path d="M12 2v5M12 17v5M2 12h5M17 12h5" {...p} /></>;
    }
  })();
  return <Svg width={size} height={size} viewBox="0 0 24 24">{g}</Svg>;
}
