// The programme manual and guides. One source for the in-app Manual screen and the Markdown download.
// Keep it to what the app does today: when a feature changes, change the text here in the same commit.
export type Block =
  | { t: 'p'; x: string }
  | { t: 'h'; x: string }
  | { t: 'ul'; x: string[] }
  | { t: 'ol'; x: string[] }
  | { t: 'table'; head: [string, string]; rows: [string, string][] }
  | { t: 'note'; x: string };
export type Section = { id: string; title: string; blurb: string; blocks: Block[] };

export const MANUAL_TITLE = 'Unibuild: manual and guides';

export const manual: Section[] = [
  {
    id: 'start', title: 'Quick start', blurb: 'From sign-in to a first checked model.',
    blocks: [
      { t: 'p', x: 'After you sign in, Unibuild opens straight into the Plan of the project you used last (or your newest one). Everything else reads the model you draw there. Use **Projects** (File menu) to switch project, and **Modules** to open the analysis screens.' },
      { t: 'h', x: 'How to work through a project' },
      { t: 'ol', x: [
        'Set up storeys. Use **+ Storey** (or **Copy up**) for each floor. Each storey has an elevation and a height.',
        'Lay out a structural grid with the **Grid line** tool (key G): draw lines one at a time, or generate a whole grid from bay counts and bay sizes.',
        'Draw the architecture: walls first, then doors and windows tapped onto them.',
        'Place the structure: columns on the grid, beams between them (or none for a flat slab), and slabs.',
        'Place the services: one plant and the outlets, each outlet with its cooling load in kW.',
        'Run **Clash detection** after the services are placed, and fix what it finds.',
        'Set the **design basis** (code, concrete class, occupancy, soil bearing) in the Options menu or the Quick Options bar. Then open Member design, Slab and foundations, and Wind and earthquake, and read every red or amber card.',
        'Report and share: export the calculation report from Member design, export the IFC from the File menu, and save snapshots on the Dashboard to compare options.',
      ] },
      { t: 'note', x: 'Everything you draw is saved as you go and syncs between your devices within a few seconds. You never press Save.' },
    ],
  },
  {
    id: 'workspace', title: 'The workspace', blurb: 'What each part of the Plan window is for.',
    blocks: [
      { t: 'table', head: ['Part', 'What it does'], rows: [
        ['Menu bar', 'File (projects, modules, IFC), Edit (undo, redo, select, move, copy, delete), View (zoom, grid, lengths, canvas colour, storeys, 3D), Design (tools, storeys), Analyze (design modules, clashes, schedules, elevations and sections, drawing sheets, dashboard), Options (snap, design basis), Help.'],
        ['Tool bar', 'Icon buttons for select, undo, redo, move, copy, delete, finish, zoom in and out, fit, grid, wall lengths, storey up, 3D and Modules. Hover a button to see its name.'],
        ['Info Box', 'Under the tool bar. Shows the settings of the tool you are using (wall thickness, element type, height, cooling load) and the typed-input fields for exact points.'],
        ['Tool Box', 'On the left. Design tools (grid line, column, beam, slab, wall, door, window, duct, pipe, plant, outlet), then Viewpoint, Document and Analyze shortcuts. Sections fold up with the arrow.'],
        ['View tabs', 'One tab per storey. The plus adds a storey; the 3D tab opens the model in three dimensions.'],
        ['Navigator', 'On the right. The project map (storeys with their level and element count), what is drawn on the current storey, and the Properties of whatever you have selected.'],
        ['Quick Options bar', 'Along the bottom: snap step, grid, wall lengths, canvas colour, object snap, ortho lock, and the design basis.'],
        ['Status bar', 'The hint for the current tool on the left; the pointer position, the length being drawn, the snap type, the storey, snap step and zoom on the right.'],
      ] },
      { t: 'h', x: 'On a phone or a narrow window' },
      { t: 'p', x: 'The Tool Box becomes a strip of tools that scrolls sideways under the Info Box, and the Navigator is hidden: use the Modules button for the other screens. Tap instead of hover; the pointer readout and snap marker are for mouse use.' },
      { t: 'h', x: 'Canvas colour' },
      { t: 'p', x: 'The drawing area is a deep blue blueprint by default. Switch to a light canvas with **View > Deep blue canvas** or the **Blue canvas** switch in the Quick Options bar.' },
    ],
  },
  {
    id: 'storeys', title: 'Storeys', blurb: 'Levels, heights and what belongs where.',
    blocks: [
      { t: 'ul', x: [
        'A storey has an elevation and a height. New storeys stack on top of the last one at the same height.',
        '**+ Storey** adds an empty storey. **Copy up** adds one and copies the walls, doors, windows, columns, beams, slabs and services of the current storey onto it.',
        'A wall, column or any other element belongs to the storey it was drawn on. Switch storeys with the tabs.',
        'Grid lines belong to the project: they show on every storey.',
        'Copy up does not copy grid lines (they are already on every storey).',
      ] },
    ],
  },
  {
    id: 'drawing', title: 'Drawing', blurb: 'How each tool is used.',
    blocks: [
      { t: 'p', x: 'Pick a tool in the Tool Box or the Design menu, then tap on the plan. The status bar always says what the next tap does.' },
      { t: 'table', head: ['Tool', 'How it works'], rows: [
        ['Grid line (G)', 'Tap the start and the end. Vertical lines get numbers (1, 2, 3), horizontal lines get letters (A, B, C). In the Info Box, set bays across and down and their sizes, then **Generate** to draw the whole grid at once (from your start point, or at 2, 2).'],
        ['Wall (W)', 'Tap the start, then each corner: a chain of walls. **Finish** (or Esc) ends the chain. Thickness is set in the Info Box; height is the storey height.'],
        ['Column (C)', 'Tap to place. Use the type stepper in the Info Box to choose the section from the library.'],
        ['Beam (B)', 'Tap the start, then each end point. Beams that meet end to end are analysed as one continuous beam. The section is chosen in the Info Box.'],
        ['Slab (S)', 'Shape **Rectangle**: tap two opposite corners. Shape **Polygon**: tap each corner of any outline, then tap the first corner again (or press Enter, or Finish) to close it. Thickness is set in the Info Box.'],
        ['Arc wall (A)', 'Tap the start, the end, then a point on the curve. The curve is built as a chain of short straight walls (one every 10 degrees or less), so doors, windows, clashes, loads and IFC all work. Undo removes the whole arc in one step.'],
        ['Roof (R)', 'A roof on top of the current storey, drawn like a slab. Form **Flat** works with a rectangle or polygon. Forms **Mono**, **Gable** and **Hip** need the rectangle shape: set the pitch (5 to 60 degrees) and, for mono and gable, which way the ridge runs (the long side by default). The eaves sit at the top of the storey and the ridge rises from there. Ridges and hips are drawn as dashed lines on the plan. In Properties you can change the pitch, change the form, turn the ridge, and flip the slope of a mono roof.'],
        ['Opening (O)', 'Tap two opposite corners of a rectangular opening inside a slab or roof, for a stair well or a shaft. It is drawn crossed out, taken off the slab area and volume, cut out of the 3D view, and exported to IFC. Undo removes it.'],
        ['Stair (T)', 'Tap two opposite corners of the flight. It rises one storey along the longer side, with risers of about 175 mm. Properties shows the number of risers and warns if the run is too short for 250 mm treads; **Flip direction** reverses it.'],
        ['Room (Z)', 'Tap each corner, then the first corner (or Enter) to close. The room is named Room 1, Room 2 and so on and shows its area; rename it in Properties.'],
        ['Dimension (I)', 'Tap the start point, the end point, then where the dimension line should sit. It shows the true length. Points snap like any other tool. Select it to delete it.'],
        ['Text (X)', 'Tap where the note goes. Type the text in the Info Box first; edit it later in Properties.'],
        ['Door (D) and window (N)', 'Tap close to a wall (within about half a metre). The opening is centred where you tapped, kept inside the wall length.'],
        ['Duct (U) and pipe (P)', 'Tap the start, then each end point. Set the centreline height above the floor in the Info Box. You can also let the MEP module route them.'],
        ['Plant', 'Tap to place the air handler or chiller that feeds the outlets.'],
        ['Outlet', 'Tap to place a diffuser or terminal. Set its cooling load in kW in the Info Box before you place it.'],
      ] },
      { t: 'note', x: 'Pitched roofs are rectangles with one pitch and no overhang or dormers. Stairs are straight flights. Rooms, stairs and roofs are not used by the design modules (slabs are taken by their thickness and the column grid, not their outline), and the Dashboard floor area uses the plan bounding box.' },
    ],
  },
  {
    id: 'editing', title: 'Selecting and editing', blurb: 'Select, change, move, copy, delete, undo.',
    blocks: [
      { t: 'ul', x: [
        '**Select (V):** tap an element. Its Properties appear in the Navigator: change thickness, height, width, depth or load with the − and + buttons, or delete it.',
        '**Several at once:** hold Shift and tap, or turn on **Add to selection** in the Info Box (for touch). On the web you can also drag a box: left to right takes what is fully inside, right to left takes everything the box touches. **Ctrl+A** selects the whole storey.',
        '**Rotate and mirror:** with something selected, Edit > Rotate right 90° (E), Rotate left 90° (Q), Mirror left-right (H) or Mirror top-bottom (F), or the Rotate and Mirror links in the Info Box. They turn the whole selection about its centre; doors and windows follow their wall. A column drawn from a library section cannot swap its sides, so check those after a quarter turn.',
        '**Move (M) and Copy (K):** with something selected, tap a base point, then a target point. Doors and windows follow their wall; select the wall to move or copy them with it. The status bar shows the offset while you choose the target.',
        '**Nudge:** with a selection, the arrow keys move it by the snap step.',
        '**Delete:** the Delete key, the bin button, or Delete in Properties. Deleting a wall also deletes its doors and windows.',
        '**Undo and redo:** Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z), or the toolbar buttons. Every add, delete, change, move and copy is one step. Copy up and adding a storey are not part of the undo history.',
      ] },
      { t: 'note', x: 'Rotate, mirror, stretch, trim and offset are not available yet. Columns cannot be resized on the plan: choose another section type before you place them.' },
    ],
  },
  {
    id: 'precision', title: 'Precision tools', blurb: 'Snap, ortho, typed input, zoom.',
    blocks: [
      { t: 'ul', x: [
        '**Grid snap:** points land on the snap step (0.1, 0.25, 0.5 or 1 m). Change it in the Quick Options bar or the Options menu.',
        '**Object snap:** the pointer locks to the endpoints and middles of lines and slabs, to column, plant and outlet points, and to crossings of lines (including grid lines). An amber ring marks the snap and the status bar names it (Endpoint, Middle, Crossing). Switch it with **Object snap** in the Quick Options bar.',
        '**Ortho lock:** with a start point set, the next point is held to the horizontal or vertical through it. Hold **Shift** for a moment, or switch on **Ortho** in the Quick Options bar. Object snap still works along the locked line.',
        '**Typed input:** for exact points, type **X** and **Y** (metres from the plan origin) in the Info Box and press Enter or **Place**. Once a start point is set you can also type a **Length** and an **Angle** (degrees, counter-clockwise from the east; leave the angle empty to use the direction towards the pointer).',
        '**Pointer readout (web):** the status bar shows the snapped X and Y, and the length of the segment being drawn.',
        '**Zoom:** the magnifier buttons, **Fit** (frames the whole storey), and scrolling to pan.',
      ] },
    ],
  },
  {
    id: 'basis', title: 'Design basis', blurb: 'The four settings every design screen shares.',
    blocks: [
      { t: 'p', x: 'Set these once; Member design, Slab and foundations, and Wind and earthquake all start from them, and the calculation report states them.' },
      { t: 'table', head: ['Setting', 'Meaning'], rows: [
        ['Design code', 'Eurocode 2 (EN 1992) or BS 8110. The load factors, shear and bending rules, deflection and crack checks follow the code you pick.'],
        ['Concrete class', 'C25/30, C30/37, C35/45 or C40/50 (cylinder / cube strength in MPa).'],
        ['Occupancy', 'Residential, Office or Laboratory: sets the imposed floor load.'],
        ['Soil bearing', 'The allowable bearing pressure in kPa, used to size footings. It must come from a site investigation.'],
      ] },
    ],
  },
  {
    id: 'modules', title: 'The modules', blurb: 'What each analysis screen is for and when to use it.',
    blocks: [
      { t: 'table', head: ['Module', 'Use it when'], rows: [
        ['Plan', 'Always first. Every other module reads this model.'],
        ['3D view', 'Before you analyse: check the model looks right (storeys stacked at their levels, beam levels, thicknesses). **Drag** to turn the model freely, with no limit, about its centre. **Shift+drag** (or the Roll drag button) spins it about the view axis. The X, Y and Z buttons (and the arrow keys and Q, E on the web) turn it 15 degrees at a time about each axis, so 24 presses make a full turn. The View buttons jump to Isometric, Front, Back, Left, Right, Top and Bottom. The mouse wheel or the Zoom buttons zoom.'],
        ['Import IFC', 'The architecture already exists in another program (Revit, ArchiCAD, Tekla). IFC2x3 and IFC4 are read; storeys, elevations and units are converted.'],
        ['Export IFC', 'To open the model in other BIM programs or share it with the team (File menu).'],
        ['Member design', 'After the structure is drawn: beams, columns and slabs for the code and concrete class you chose, with the calculation report.'],
        ['Slab and foundations', 'Needs columns. Designs slab panels or the flat slab, and pad, combined and strip footings from the soil bearing pressure.'],
        ['Wind and earthquake', 'For anything taller than a couple of storeys, or in a seismic zone.'],
        ['MEP routing and sizing', 'After placing one plant and the outlets with kW loads.'],
        ['Clash detection', 'After every round of changes.'],
        ['Dashboard', 'Quantities, cost, structural status and MEP loads across all storeys; save snapshots to compare options.'],
      ] },
    ],
  },
  {
    id: 'structure', title: 'Structural design', blurb: 'What the structural screens calculate and assume.',
    blocks: [
      { t: 'h', x: 'Member design' },
      { t: 'ul', x: [
        'Beams are analysed as continuous beams with load patterns, using tributary widths from the beam layout. You get hogging and sagging steel and shear links.',
        'Columns carry the load from every storey above them.',
        'Serviceability is checked: calculated deflection against span/250, span/depth limits, and crack width against 0.3 mm.',
        'The **calculation report** (Markdown) lists every input, assumption, intermediate value and clause.',
      ] },
      { t: 'h', x: 'Slab and foundations' },
      { t: 'ul', x: [
        'A storey with columns and slabs but **no beams** is treated as a **flat slab**: bending by the equivalent-frame method (column and middle strips), and punching shear at every column, with the thickness that needs no links.',
        'A storey **with beams** is designed as slab panels (interior, edge and corner bays), with shear, span/depth and cracking checks.',
        'Footings: pads, which become **combined or strip footings** where pads would overlap. Two-dimensional clusters are flagged for a raft, which is not designed yet.',
        'With **ground beams** switched on, they carry the base moments and the tie force and the footings take axial load only.',
        'You can bring the wind and earthquake column-base actions into the footing checks (bearing with eccentricity, uplift, sliding).',
      ] },
      { t: 'h', x: 'Wind and earthquake' },
      { t: 'ul', x: [
        'Wind to EN 1991-1-4 and equivalent-static earthquake to EN 1998-1. Forces go to the columns by the Muto D-value method with a rigid diaphragm and accidental torsion.',
        'You get storey shears, drifts, overturning stability, column moments and overturning axial forces, and every column is checked under the combinations.',
        'It is a shear-building model, not a 3D analysis. Verify it with a full frame model.',
      ] },
    ],
  },
  {
    id: 'mep', title: 'MEP', blurb: 'Placing plant and outlets, routing, sizing and pressure drop.',
    blocks: [
      { t: 'ol', x: [
        'Place one **Plant** and the **Outlets** on a storey; give each outlet its cooling load in kW.',
        'Open **MEP routing and sizing** and route. Ducts (and, if you choose, chilled-water pipes) are routed on a 0.5 m grid: columns are avoided, wall crossings are kept to a minimum, and turns are penalised. Later outlets join the existing tree.',
        'Every segment is sized from the flow it carries. The network is lowered under beams it meets and checked again for clashes.',
        'Results are written to the plan as ordinary duct and pipe elements: you can select and edit them like anything else.',
      ] },
      { t: 'p', x: 'Fittings (elbows, tees, reducers and vertical offsets) are found where segments meet. Pressure drop is Darcy-Weisbach friction plus fitting losses along the path from the plant to the most remote outlet, with a 10% allowance: fan static pressure in Pa for ducts and pump pressure in kPa for pipes. Add filters, coils, grilles, valves and chiller drops from the supplier data.' },
      { t: 'note', x: 'Fire dampers are not modelled yet.' },
    ],
  },
  {
    id: 'documents', title: 'Schedules, elevations and sections', blurb: 'Tables and drawings made from the model.',
    blocks: [
      { t: 'ul', x: [
        '**Schedules** (Analyze > Schedules, or the Document section of the Tool Box): doors and windows with marks D1, D2 and W1, W2 in storey and plan order; walls with gross, opening and net area and volume; columns, beams, slabs and roofs, rooms, stairs, services and a concrete summary. **Download CSV** opens in Excel.',
        'Door height is taken as 2.1 m and window height as 1.2 m everywhere (schedules, drawings, 3D and clash detection).',
        '**Elevations and sections** (Analyze > Elevations and sections): pick North, East, South or West for an elevation, or a section cut at a Y or X position. Move the cut with the −0.5 and +0.5 buttons and flip the viewing direction. Cut elements are drawn dark, what is seen beyond is light, doors and windows are open boxes, and the storey levels are dashed lines. **Download SVG** saves the drawing.',
        '**Drawing sheets** (Analyze > Drawing sheets): choose a storey plan, an elevation or a section, a paper size (A4 to A1) and a scale (or Best fit), fill in the title block, and check the preview. **Print / save this sheet as PDF** opens the browser print window: choose Save as PDF, margins none, scale 100%, and it prints at true scale. **Print the full set** makes one sheet for every plan, elevation and the two middle sections. Plans show walls, columns, beams, doors with swings, windows, stairs, rooms, grid lines, dimensions and text.',
      ] },
      { t: 'note', x: 'These drawings show the model as boxes. There is no hatching by material, no door swings, and no stair or roof slope detail yet.' },
    ],
  },
  {
    id: 'clashes', title: 'Clash detection', blurb: 'Finding things that occupy the same space.',
    blocks: [
      { t: 'p', x: 'Each element becomes a footprint with a height range. Two elements clash when both overlap by more than a small tolerance. Clashes are listed per storey, saved, and marked on the plan with red rings. Run it after every round of changes; chained segments of one duct or pipe run are not counted as clashes with each other.' },
    ],
  },
  {
    id: 'ifc', title: 'IFC import and export', blurb: 'Exchanging models with other programs.',
    blocks: [
      { t: 'ul', x: [
        '**Export** writes a multi-storey IFC4 file with openings and property sets (File > Export IFC). Polygon slabs and roofs keep their outline; a pitched roof is exported flat at the eaves (its form and pitch are in its name); a stair is exported as its box envelope; rooms are not exported yet.',
        '**Import** reads IFC2x3 and IFC4. Extruded solids are read exactly; meshes and B-reps are fitted with an oriented bounding box. Storeys and elevations are brought in and units are converted.',
        'Grid lines are not part of the IFC export yet.',
        'Very large IFC files can be slow to read in the browser.',
      ] },
    ],
  },
  {
    id: 'shortcuts', title: 'Keyboard shortcuts', blurb: 'On the web.',
    blocks: [
      { t: 'table', head: ['Key', 'Action'], rows: [
        ['V', 'Select tool'], ['G', 'Grid line'], ['W', 'Wall'], ['C', 'Column'], ['B', 'Beam'], ['S', 'Slab'], ['D', 'Door'], ['N', 'Window'], ['U', 'Duct'], ['P', 'Pipe'],
        ['A', 'Arc wall'], ['R', 'Roof'], ['T', 'Stair'], ['Z', 'Room'], ['O', 'Opening in a slab'], ['E / Q', 'Rotate the selection right / left'], ['H / F', 'Mirror the selection left-right / top-bottom'], ['I', 'Dimension'], ['X', 'Text'], ['Enter', 'Close the polygon you are drawing'],
        ['M', 'Move the selection'], ['K', 'Copy the selection'], ['Arrow keys', 'Nudge the selection by the snap step'],
        ['Shift (held)', 'Ortho lock while drawing; add to the selection while selecting'],
        ['Esc', 'Finish the chain, cancel move or copy, clear the selection, close a menu'],
        ['Delete or Backspace', 'Delete the selection'],
        ['Ctrl+Z', 'Undo'], ['Ctrl+Y or Ctrl+Shift+Z', 'Redo'], ['Ctrl+A', 'Select everything on the storey'],
      ] },
    ],
  },
  {
    id: 'limits', title: 'Limits and assumptions', blurb: 'Read this before you rely on a result.',
    blocks: [
      { t: 'note', x: 'All design output is preliminary and must be reviewed by a registered engineer before construction. Soil bearing pressure must come from a site investigation.' },
      { t: 'ul', x: [
        'Everything is in metres and millimetres.',
        'Curved walls are chains of straight walls. Roofs are rectangles when pitched, and stairs are straight flights; there are no railings, curtain walls, or free-form shapes. Slab openings are rectangles, and rotation is in quarter turns only. Sections do not show slab openings.',
        'The lateral analysis is a shear-building model; there is no 3D core or P-delta analysis and no ductile seismic detailing.',
        'There are no raft footings, and slab deflection uses the span/depth method rather than a calculation for slabs.',
        'Elevations and sections are simple box drawings with no material hatching. PDF comes from the browser print window (web only); there is no DWG output and no custom sheet layouts with several views on one sheet.',
        'Not yet tested against real Revit, ArchiCAD or Tekla exports.',
      ] },
    ],
  },
  {
    id: 'trouble', title: 'Troubleshooting', blurb: 'Common problems and what to do.',
    blocks: [
      { t: 'table', head: ['Problem', 'What to do'], rows: [
        ['Sign-in link does not return to the app', 'In Supabase open Authentication > URL Configuration and add the app address under Site URL and Redirect URLs.'],
        ['The Plan shows "Loading the model…" for a long time', 'Check your connection. Screens show the last model at once and refresh in the background.'],
        ['A door or window will not place', 'Tap closer to the wall (within about half a metre). The status bar says what went wrong.'],
        ['"Select something first"', 'Move and Copy work on the selection: select the elements, then press M or K.'],
        ['Doors and windows did not move or copy', 'Select the wall as well; openings follow their wall.'],
        ['A change did not stick', 'If a save fails, the red message under the tabs says why and the model reloads from the server. Undo only covers the steps you made in this session.'],
        ['A design card is red or amber', 'Read the note on it: it says which check failed (for example, section too small or punching shear) and what to change.'],
        ['The pointer readout and snap ring are missing', 'They need a mouse. On touch devices tap to place; the snap still applies to your tap.'],
      ] },
    ],
  },
];

// plain-text search: the sections that contain every word typed
export function searchManual(q: string): Section[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return manual;
  const text = (s: Section) => (s.title + ' ' + s.blurb + ' ' + s.blocks.map(b => b.t === 'table' ? b.rows.map(r => r.join(' ')).join(' ') : Array.isArray((b as any).x) ? (b as any).x.join(' ') : (b as any).x).join(' ')).toLowerCase();
  return manual.filter(s => { const t = text(s); return words.every(w => t.includes(w)); });
}

const plain = (x: string) => x;
export function manualMarkdown(): string {
  const out: string[] = [`# ${MANUAL_TITLE}`, ''];
  for (const s of manual) {
    out.push(`## ${s.title}`, '', `_${s.blurb}_`, '');
    for (const b of s.blocks) {
      if (b.t === 'p') out.push(plain(b.x), '');
      else if (b.t === 'h') out.push(`### ${b.x}`, '');
      else if (b.t === 'note') out.push(`> ${b.x}`, '');
      else if (b.t === 'ul') out.push(...b.x.map(i => `- ${i}`), '');
      else if (b.t === 'ol') out.push(...b.x.map((i, n) => `${n + 1}. ${i}`), '');
      else out.push(`| ${b.head[0]} | ${b.head[1]} |`, '| --- | --- |', ...b.rows.map(r => `| ${r[0]} | ${r[1].replace(/\|/g, '/')} |`), '');
    }
  }
  return out.join('\n');
}
