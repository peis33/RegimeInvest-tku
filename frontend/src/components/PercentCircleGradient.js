const BORDER_WIDTH = 0;
const RED = '#B32C2C';
const RED_WARM = '#A84432';
const RED_DARK = '#7D2D2D';
const RED_ORANGE = '#944630';
const BLEND_RED_1 = '#824A31';
const BLEND_RED_2 = '#744D31';
const BLEND_OLIVE_1 = '#674F30';
const BLEND_OLIVE_2 = '#5C572F';
const GREEN = '#2CB331';
const GREEN_MID = '#3E792F';
const GREEN_DARK = '#287D2C';
const OLIVE = '#53622F';

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getGradient(redPercent) {
  const redFraction = clamp(redPercent / 100, 0, 1);

  if (redFraction <= 0) {
    return {
      colors: [GREEN_DARK, GREEN_MID, GREEN, GREEN_MID, GREEN_DARK],
      positions: [0, 0.25, 0.5, 0.75, 1],
    };
  }

  if (redFraction >= 1) {
    return {
      colors: [RED_DARK, RED, RED_ORANGE, RED, RED_DARK],
      positions: [0, 0.25, 0.5, 0.75, 1],
    };
  }

  // The red section is centered at the top of the ring. The two boundaries
  // are blended so the color spreads into olive and green without seams.
  const halfRed = redFraction / 2;
  // Keep a visible core even when the red or green section is only 10%.
  // The blend width scales with the smaller section instead of consuming it.
  const transition = Math.min(0.09, redFraction * 0.6, (1 - redFraction) * 0.6);
  const redEdgeStart = halfRed - transition / 2;
  const greenEdgeStart = halfRed + transition / 2;
  const greenEdgeEnd = 1 - greenEdgeStart;
  const redEdgeEnd = 1 - redEdgeStart;
  const greenMidStart = greenEdgeStart + (0.5 - greenEdgeStart) * 0.35;
  const greenMidEnd = 1 - greenMidStart;

  return {
    colors: [
      RED,
      RED_WARM,
      RED_ORANGE,
      BLEND_RED_1,
      BLEND_RED_2,
      BLEND_OLIVE_1,
      BLEND_OLIVE_2,
      OLIVE,
      GREEN_MID,
      GREEN,
      GREEN_MID,
      OLIVE,
      BLEND_OLIVE_2,
      BLEND_OLIVE_1,
      BLEND_RED_2,
      BLEND_RED_1,
      RED_ORANGE,
      RED_WARM,
      RED,
    ],
    positions: [
      0,
      redEdgeStart / 2,
      redEdgeStart,
      redEdgeStart + transition * 0.2,
      redEdgeStart + transition * 0.4,
      redEdgeStart + transition * 0.6,
      redEdgeStart + transition * 0.8,
      greenEdgeStart,
      greenMidStart,
      0.5,
      greenMidEnd,
      greenEdgeEnd,
      greenEdgeEnd + transition * 0.2,
      greenEdgeEnd + transition * 0.4,
      greenEdgeEnd + transition * 0.6,
      greenEdgeEnd + transition * 0.8,
      redEdgeEnd,
      1 - redEdgeStart / 2,
      1,
    ],
  };
}

export { BORDER_WIDTH };
