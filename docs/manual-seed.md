# Manual seed: opening guidance moved out of the app's opening screens

This text used to sit on the project hub. It is kept here as the starting material for the programme manual and guides.

## How to work through a project
1. **Set up storeys.** In Plan, use + Storey (or Copy up) for each floor. Each storey has an elevation and a height.
2. **Draw the architecture.** Walls, then doors and windows tapped onto them.
3. **Place the structure.** Columns on a grid, beams between them (or none for a flat slab), and slabs.
4. **Place the services.** A plant and outlets with cooling loads; the MEP module routes and sizes the rest.
5. **Check for clashes.** Run clash detection after the services are placed; fix what it finds.
6. **Design and verify.** Member design, then slab and foundations, then wind and earthquake. Read every red or amber card.
7. **Report and share.** Export the calculation report from Member design, the IFC from the Modules page, and save snapshots on the Dashboard.

## When to use each module
- **Plan:** start here. Every other module reads this model.
- **3D view:** check the model looks right before you analyse it.
- **Import IFC:** when the architecture already exists in another program (Revit, ArchiCAD, Tekla; IFC2x3 or IFC4).
- **Export IFC:** to open the model in other BIM programs or share it with the team.
- **Member design:** after the structure is drawn. Start with the load and concrete class.
- **Slab and foundations:** needs columns. Enter the soil bearing pressure from your site investigation.
- **Wind and earthquake:** for anything taller than a couple of storeys, or in a seismic zone.
- **MEP routing and sizing:** after placing one plant and the outlets (with kW loads) on the plan.
- **Clash detection:** run it after every round of changes.
- **Dashboard:** quantities, cost, structural status and MEP loads; save snapshots to compare options.

## Good to know
- Everything is in metres and millimetres. The plan snaps to a 0.5 m grid. Storeys stack by elevation; a column or wall belongs to the storey it was drawn on.
- A storey with columns and slabs but no beams is treated as a flat slab; with beams it is designed as beams and slab panels.
- Changes sync between devices within a few seconds. Opening a screen again shows the last model at once while it refreshes.
- Choose Eurocode 2 or BS 8110 on the design screens; the report states the code used.
- All results are preliminary and must be checked by a registered engineer before construction. Soil pressure must come from a site investigation.
