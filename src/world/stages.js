// The evolution of real-time 3D, as a list of renderer settings. Each stage
// adds exactly one idea to the one before it. The World renders any stage
// on demand, and sweeps from one to the next across the room.

/**
 * @typedef {object} Stage
 * @property {string} key
 * @property {string} label      short name shown in labs
 * @property {'points'|'wire'|'solid'|'path'} show
 * @property {number} res        internal resolution, as a fraction of the screen
 * @property {number} [shade]    0 random triangle colours · 1 flat albedo · 2 flat lit · 3 Gouraud · 4 Phong
 * @property {boolean} [depth]   depth test (false = painter's mistakes)
 * @property {'none'|'nearest'|'mip'} [tex]
 * @property {boolean} [env]     reflections of the room on shiny things
 * @property {boolean} [msaa]
 * @property {boolean} [shadow]
 * @property {boolean} [hdr]     brighter-than-white + bloom + tone mapping
 */

/** @type {Stage[]} */
export const STAGES = [
  { key: 'points', label: 'Points', show: 'points', res: 0.5 },
  { key: 'wire', label: 'Wireframe', show: 'wire', res: 0.5 },
  { key: 'fill', label: 'Filled, no depth', show: 'solid', res: 0.22, shade: 0, depth: false },
  { key: 'zbuffer', label: 'Depth buffer', show: 'solid', res: 0.22, shade: 1, depth: true },
  { key: 'flat', label: 'Flat shading', show: 'solid', res: 0.3, shade: 2, depth: true },
  { key: 'gouraud', label: 'Gouraud shading', show: 'solid', res: 0.3, shade: 3, depth: true },
  { key: 'phong', label: 'Phong shading', show: 'solid', res: 0.4, shade: 4, depth: true },
  { key: 'texture', label: 'Textures', show: 'solid', res: 0.4, shade: 4, depth: true, tex: 'nearest', env: true },
  { key: 'mipmap', label: 'Mipmaps', show: 'solid', res: 0.5, shade: 4, depth: true, tex: 'mip', env: true },
  { key: 'aa', label: 'Anti-aliasing', show: 'solid', res: 1, shade: 4, depth: true, tex: 'mip', env: true, msaa: true },
  { key: 'shadow', label: 'Shadows', show: 'solid', res: 1, shade: 4, depth: true, tex: 'mip', env: true, msaa: true, shadow: true },
  { key: 'hdr', label: 'HDR & bloom', show: 'solid', res: 1, shade: 4, depth: true, tex: 'mip', env: true, msaa: true, shadow: true, hdr: true },
  { key: 'path', label: 'Path tracing', show: 'path', res: 1 },
];

/** Roughly when each idea arrived, for the year counters in the opening and the finale. */
export const STAGE_YEARS = { points: 1962, wire: 1963, fill: 1968, zbuffer: 1974, flat: 1975, gouraud: 1980, phong: 1985, texture: 1993, mipmap: 1996, aa: 1999, shadow: 2001, hdr: 2005, path: 2018 };

export const stageIndex = (key) => STAGES.findIndex((s) => s.key === key);
export const stage = (key) => STAGES[stageIndex(key)];

/** Camera shots the evolution moves through. Positions in metres. */
export const SHOTS = {
  wide: { pos: [6.2, 4.6, 8.4], look: [0, 1.4, -0.4], fov: 46 },
  overview: { pos: [-4.4, 3.1, 6.9], look: [0.4, 1.3, -0.2], fov: 46 },
  spheres: { pos: [3.1, 2.3, 4.6], look: [-0.5, 1.35, -0.3], fov: 44 },
  floor: { pos: [-3.6, 1.05, 6.6], look: [1.2, 0.8, -2.2], fov: 50 },
  edge: { pos: [0.5, 2.2, 5.0], look: [-0.2, 1.7, 0], fov: 40 },
  glow: { pos: [-2.4, 2.7, 6.4], look: [0.3, 1.5, -0.4], fov: 46 },
  final: { pos: [0, 2.55, 7.4], look: [0, 1.55, 0], fov: 46 },
};
