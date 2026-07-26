/**
 * The pointer machine (§05).
 *
 * Kept separate from the session and cluster machines on purpose: "conflating
 * them is how jigsaw apps end up with pieces stuck to fingers after a phone call
 * comes in." The tests that defend that separation are the cancel and
 * second-pointer ones — in both, the held cluster is let go at exactly where it
 * is, and no piece is left attached to a pointer that no longer exists.
 *
 * The machine is deliberately DOM-free: screen points and timestamps in, board
 * commands out. The listener shell that feeds it real PointerEvents is thin
 * enough to judge by hand, which is the only way §05's arbitration can be judged
 * anyway — two fingers on glass.
 */

import { describe, expect, it } from 'vitest';
import type { Point } from '@/core/geom';
import { LONG_PRESS_MS, MOVE_THRESHOLD_PX, PointerMachine } from '@/input/pointer';
import type { PointerHost } from '@/input/pointer';

interface Recorded {
  grabs: { clusterId: number; world: Point }[];
  drags: { clusterId: number; dx: number; dy: number }[];
  releases: { clusterId: number; velocity: Point }[];
  camera: string[];
}

function harness(options: { zoom?: number; pick?: (world: Point) => number | null } = {}) {
  const zoom = options.zoom ?? 1;
  const log: Recorded = { grabs: [], drags: [], releases: [], camera: [] };

  const host: PointerHost = {
    toWorld: (p) => ({ x: p.x / zoom, y: p.y / zoom }),
    pickCluster: options.pick ?? ((world) => (world.x < 100 && world.y < 100 ? 7 : null)),
    onGrab: (event) => log.grabs.push({ clusterId: event.clusterId, world: event.world }),
    onDragTo: (event) => log.drags.push({ ...event }),
    onRelease: (event) => log.releases.push({ clusterId: event.clusterId, velocity: event.velocity }),
    onCameraBegin: () => log.camera.push('begin'),
    onCameraEnd: () => log.camera.push('end'),
  };

  return { machine: new PointerMachine(host), log };
}

const at = (id: number, x: number, y: number, t: number) => ({ id, x, y, t });

describe('thresholds', () => {
  it('states §05: 6px of movement, 120ms of patience', () => {
    expect(MOVE_THRESHOLD_PX).toBe(6);
    expect(LONG_PRESS_MS).toBe(120);
  });
});

describe('pressing', () => {
  it('does not move a piece before the movement threshold', () => {
    const { machine, log } = harness();
    machine.down(at(1, 10, 10, 0));
    machine.move(at(1, 13, 12, 16));

    expect(machine.phase).toBe('pressing');
    expect(log.grabs).toHaveLength(0);
    expect(log.drags).toHaveLength(0);
  });

  it('starts dragging once the finger passes 6px', () => {
    const { machine, log } = harness();
    machine.down(at(1, 10, 10, 0));
    machine.move(at(1, 20, 10, 16));

    expect(machine.phase).toBe('dragging');
    expect(log.grabs).toEqual([{ clusterId: 7, world: { x: 10, y: 10 } }]);
  });

  it('commits to the drag after a long press without any movement', () => {
    // Picking a piece up and holding it still is a real thing players do while
    // deciding; without this the first tiny move would jump 6px.
    const { machine, log } = harness();
    machine.down(at(1, 10, 10, 0));
    machine.tick(LONG_PRESS_MS + 1);

    expect(machine.phase).toBe('dragging');
    expect(log.grabs).toHaveLength(1);
  });

  it('grabs nothing when the press lands on bare mat', () => {
    const { machine, log } = harness();
    machine.down(at(1, 500, 500, 0));
    machine.move(at(1, 520, 500, 16));

    expect(machine.phase).toBe('camera');
    expect(log.grabs).toHaveLength(0);
    expect(log.camera).toEqual(['begin']);
  });

  it('does nothing at all on a tap — there is no tap-to-select', () => {
    // "There is no tap-to-select-then-tap-to-place. Direct manipulation only —
    // the entire product promise is weight in the hand."
    const { machine, log } = harness();
    machine.down(at(1, 10, 10, 0));
    machine.up(at(1, 11, 10, 40));

    expect(machine.phase).toBe('idle');
    expect(log.grabs).toHaveLength(0);
    expect(log.releases).toHaveLength(0);
  });
});

describe('dragging', () => {
  it('moves the cluster by the world delta of the finger', () => {
    const { machine, log } = harness({ zoom: 2 });
    machine.down(at(1, 10, 10, 0));
    machine.move(at(1, 30, 10, 16));
    machine.move(at(1, 40, 20, 32));

    // Zoom 2 means ten screen pixels are five world units.
    expect(log.drags.at(-1)).toEqual({ clusterId: 7, dx: 5, dy: 5 });
  });

  it('never emits a drag for a cluster it did not grab', () => {
    const { machine, log } = harness();
    machine.down(at(1, 500, 500, 0));
    machine.move(at(1, 540, 500, 16));
    expect(log.drags).toHaveLength(0);
  });

  it('releases with the velocity the spring inherits', () => {
    const { machine, log } = harness();
    machine.down(at(1, 10, 10, 0));
    machine.move(at(1, 30, 10, 16));
    machine.move(at(1, 60, 10, 32));
    machine.up(at(1, 90, 10, 48));

    const release = log.releases[0]!;
    expect(release.clusterId).toBe(7);
    // Roughly 30 world units per 16ms frame ≈ 1875/s. Sign is what matters here.
    expect(release.velocity.x).toBeGreaterThan(500);
    expect(release.velocity.y).toBe(0);
    expect(machine.phase).toBe('idle');
  });

  it('reports no velocity for a piece that was set down and held still', () => {
    const { machine, log } = harness();
    machine.down(at(1, 10, 10, 0));
    machine.move(at(1, 30, 10, 16));
    machine.move(at(1, 30, 10, 200));
    machine.up(at(1, 30, 10, 260));

    const release = log.releases[0]!;
    expect(Math.hypot(release.velocity.x, release.velocity.y)).toBeLessThan(1);
  });
});

describe('arbitration — two fingers always means camera (§05)', () => {
  it('hands a second pointer to the camera', () => {
    const { machine, log } = harness();
    machine.down(at(1, 500, 500, 0));
    machine.down(at(2, 600, 500, 8));

    expect(machine.phase).toBe('camera');
    expect(log.camera).toEqual(['begin']);
  });

  it('lets go of a held piece the instant a second finger lands', () => {
    const { machine, log } = harness();
    machine.down(at(1, 10, 10, 0));
    machine.move(at(1, 30, 10, 16));
    expect(machine.phase).toBe('dragging');

    machine.down(at(2, 300, 300, 24));

    expect(machine.phase).toBe('camera');
    expect(log.releases).toHaveLength(1);
    expect(log.drags).toHaveLength(1);
  });

  it('does not re-grab when the second finger lifts', () => {
    // The piece was let go. Reattaching it to a finger that is still down would
    // be exactly the "stuck to the finger" bug the state split exists to prevent.
    const { machine, log } = harness();
    machine.down(at(1, 10, 10, 0));
    machine.move(at(1, 30, 10, 16));
    machine.down(at(2, 300, 300, 24));
    machine.up(at(2, 300, 300, 40));
    machine.move(at(1, 60, 10, 56));

    expect(log.grabs).toHaveLength(1);
    expect(log.drags).toHaveLength(1);
    expect(machine.phase).toBe('camera');
  });

  it('returns to idle only when every finger is up', () => {
    const { machine } = harness();
    machine.down(at(1, 500, 500, 0));
    machine.down(at(2, 600, 500, 8));
    machine.up(at(1, 500, 500, 16));
    expect(machine.phase).toBe('camera');

    machine.up(at(2, 600, 500, 24));
    expect(machine.phase).toBe('idle');
  });
});

describe('interruption', () => {
  it('drops a held piece where it is when the pointer is cancelled', () => {
    // §05: on interruption "any held piece is released to its current position".
    const { machine, log } = harness();
    machine.down(at(1, 10, 10, 0));
    machine.move(at(1, 30, 10, 16));
    machine.cancel(at(1, 30, 10, 20));

    expect(machine.phase).toBe('idle');
    expect(log.releases).toHaveLength(1);
    expect(log.releases[0]!.velocity).toEqual({ x: 0, y: 0 });
  });

  it('releases everything on a hard interrupt, whatever the phase', () => {
    const { machine, log } = harness();
    machine.down(at(1, 10, 10, 0));
    machine.move(at(1, 30, 10, 16));

    machine.interrupt();

    expect(machine.phase).toBe('idle');
    expect(log.releases).toHaveLength(1);
  });

  it('is safe to interrupt when nothing is happening', () => {
    const { machine, log } = harness();
    machine.interrupt();
    expect(machine.phase).toBe('idle');
    expect(log.releases).toHaveLength(0);
  });
});

describe('settling', () => {
  it('accepts the next grab immediately — you can pick up the next piece', () => {
    // §05: "input accepted during settling — you can grab the next piece before
    // this one lands."
    const { machine, log } = harness({ pick: () => 7 });
    machine.down(at(1, 10, 10, 0));
    machine.move(at(1, 30, 10, 16));
    machine.up(at(1, 30, 10, 32));

    machine.down(at(2, 200, 200, 40));
    machine.move(at(2, 230, 200, 56));

    expect(machine.phase).toBe('dragging');
    expect(log.grabs).toHaveLength(2);
  });
});

describe('adoption — a drag that began in the tray (§06)', () => {
  it('enters dragging directly, without asking what is under the finger', () => {
    // `pickCluster` would answer null here: the piece was placed on the mat a
    // moment ago and the hit index may not have caught up within the frame.
    // Adoption is told the cluster, which is the whole point of it.
    const { machine, log } = harness({ pick: () => null });

    expect(machine.adopt(at(1, 400, 300, 0), 12)).toBe(true);
    expect(machine.phase).toBe('dragging');
    expect(machine.heldCluster).toBe(12);
    expect(log.grabs).toEqual([{ clusterId: 12, world: { x: 400, y: 300 } }]);
  });

  it('drags and releases exactly like a gesture that started on the mat', () => {
    const { machine, log } = harness({ pick: () => null });
    machine.adopt(at(1, 100, 100, 0), 12);
    machine.move(at(1, 140, 130, 16));
    machine.up(at(1, 160, 130, 32));

    expect(log.drags).toEqual([{ clusterId: 12, dx: 40, dy: 30 }]);
    expect(log.releases).toHaveLength(1);
    expect(log.releases[0]!.clusterId).toBe(12);
    expect(machine.phase).toBe('idle');
  });

  it('inherits release velocity, so a flicked piece still arrives hot', () => {
    const { machine, log } = harness({ pick: () => null });
    machine.adopt(at(1, 0, 0, 0), 3);
    machine.move(at(1, 30, 0, 16));
    machine.up(at(1, 60, 0, 32));

    expect(log.releases[0]!.velocity.x).toBeGreaterThan(0);
  });

  it('declines while a finger is already down — camera outranks a drag', () => {
    const { machine, log } = harness();
    machine.down(at(1, 500, 500, 0));

    expect(machine.adopt(at(2, 100, 100, 8), 12)).toBe(false);
    expect(machine.heldCluster).toBeNull();
    expect(log.grabs).toHaveLength(0);
  });

  it('lets a second finger take the piece off it, mid-adoption', () => {
    const { machine, log } = harness({ pick: () => null });
    machine.adopt(at(1, 100, 100, 0), 12);
    machine.move(at(1, 140, 100, 16));

    machine.down(at(2, 300, 300, 24));

    expect(machine.phase).toBe('camera');
    expect(machine.heldCluster).toBeNull();
    // Let go where it was, never returned and never kept attached.
    expect(log.releases).toHaveLength(1);
    expect(log.camera).toEqual(['begin']);
  });

  it('lets go on an interrupt, like any other drag (§05)', () => {
    const { machine, log } = harness({ pick: () => null });
    machine.adopt(at(1, 100, 100, 0), 12);
    machine.interrupt();

    expect(machine.phase).toBe('idle');
    expect(log.releases).toHaveLength(1);
    expect(log.releases[0]!.velocity).toEqual({ x: 0, y: 0 });
  });
});
