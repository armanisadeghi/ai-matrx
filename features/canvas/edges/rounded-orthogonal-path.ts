/** A point in a diagram's coordinate space. */
export interface DiagramPoint {
  x: number;
  y: number;
}

export interface RoundedOrthogonalPath {
  path: string;
  labelX: number;
  labelY: number;
}

function samePoint(a: DiagramPoint, b: DiagramPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function pointAlongPolyline(
  points: DiagramPoint[],
  fraction: number,
): DiagramPoint {
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index];
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = total * fraction;

  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (remaining <= length) {
      const start = points[index];
      const end = points[index + 1];
      const progress = length === 0 ? 0 : remaining / length;
      return {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      };
    }
    remaining -= length;
  }

  return points.at(-1) ?? { x: 0, y: 0 };
}

/**
 * Build an SVG path through explicit orthogonal waypoints, rounding every turn.
 *
 * This is the shared escape hatch for fixed maps whose important connections
 * need dedicated lanes instead of an automatic router that may stack paths or
 * send a path through a node. Callers own the lane coordinates; this helper
 * owns the consistent corner geometry and label midpoint.
 */
export function roundedOrthogonalPath(
  rawPoints: DiagramPoint[],
  cornerRadius = 16,
): RoundedOrthogonalPath {
  const points = rawPoints.filter(
    (point, index) => index === 0 || !samePoint(point, rawPoints[index - 1]),
  );
  const label = pointAlongPolyline(points, 0.5);

  if (points.length === 0) return { path: "", labelX: 0, labelY: 0 };
  if (points.length === 1)
    return {
      path: `M ${points[0].x} ${points[0].y}`,
      labelX: label.x,
      labelY: label.y,
    };

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    const radius = Math.min(cornerRadius, incoming / 2, outgoing / 2);
    const before = {
      x: corner.x - ((corner.x - previous.x) / incoming) * radius,
      y: corner.y - ((corner.y - previous.y) / incoming) * radius,
    };
    const after = {
      x: corner.x + ((next.x - corner.x) / outgoing) * radius,
      y: corner.y + ((next.y - corner.y) / outgoing) * radius,
    };
    path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
  }
  const last = points.at(-1);
  if (!last) return { path, labelX: label.x, labelY: label.y };
  path += ` L ${last.x} ${last.y}`;

  return { path, labelX: label.x, labelY: label.y };
}
