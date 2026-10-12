# ORBIT runtime and presentation boundary

Target: `Callmecx/chenxi-devlab-2026`, `/intelligence`. The V2 product/activity workflows remain at `/intelligence/tasks`; original warehouse tests remain there. Shared schemas are in `packages/intelligence/src/orbit/types.ts`.

## Ownership

- Runtime is the only writer of station inventory, carrier cargo/energy/transit, world version, task progress and execution status.
- Vue holds detached snapshots in shallow refs. Three.js projects them; neither camera motion nor animation completion dispatches delivery or success.
- One UI interval advances fixed simulation steps. It pauses on page visibility loss. Interpolation only approaches already committed positions.
- One camera owner handles overview, focused object, follow, engineering and comparison. Manual dragging interrupts automatic movement without altering the world.

## Async branches

Comparison sends one immutable paused snapshot and event sequence to a dedicated Worker. Both strategies use the same seed, future fault schedule and committed history. No application API, order or external model exists in that Worker.

Worker results must match both a generation token and the source fingerprint of the current runtime. World changes, cancellation, reset, leaving the route and a five-second timeout terminate the Worker. The adopt button additionally requires an unchanged paused source fingerprint. Adoption sets the future strategy in the original runtime; it never copies simulated future deliveries back into the real branch.

## Replay and tool visibility

Records include version, seed, initial state and ordered events containing run ID, event ID, sequence, simulation tick, wall time, world version and snapshot. Import uses strict bounded schema, conservation and adjacent-history validation. Validated records are immutable and cached; seeking projects snapshots only. It does not instantiate the runtime or execute tools.

Engineering view shows actual tool input/output, source identifiers, measured duration and events. It does not expose invented model reasoning. JSON exports contain synthetic world facts. Print output contains the real result summary.

## Mode boundaries

- Local simulation: implemented deterministic weighted graph search and priority scheduling.
- History replay: implemented read-only validated snapshot projection.
- Live model: not connected; no model credential or paid API is used. AGI is a research vision, not a capability claim.
- Practical tasks: retained V2 synthetic catalog/booking tools with approval; separately tested local service capabilities are not presented as a public hosted backend.

## Performance and lifecycle

The lab route and 3D component are lazy imports. Standard/high quality cap drawing pixels and DPR; operational SVG mode shares the exact runtime. Reduced-motion preference defaults to SVG; users can separately disable spatial motion. Three persistently slow measurement windows trigger a one-way quality reduction or SVG fallback, with a visible explanation. Hidden tabs suspend simulation/rendering; exit disposes renderer resources, listeners, RAF, interval, audio and Worker.

Actual results are reported separately in the acceptance and performance reports; this contract is not a test-pass claim.
