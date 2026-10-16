import opening from './opening.js';
import terminal from './terminal.js';
import vector from './vector.js';
import pixel from './pixel.js';
import tricks from './tricks.js';
import parallax from './parallax.js';
import raycast from './raycast.js';
import transforms from './transforms.js';
import triangles from './triangles.js';
import light from './light.js';
import magic from './magic.js';
import surfaces from './surfaces.js';
import edges from './edges.js';
import glow from './glow.js';
import raymarch from './raymarch.js';
import optics from './optics.js';
import pathtrace from './pathtrace.js';
import finale from './finale.js';

/** Every room, in visiting order. Each entry is a factory taking the App. */
export const ROOMS = [
  opening,
  terminal,
  vector,
  pixel,
  tricks,
  parallax,
  raycast,
  transforms,
  triangles,
  light,
  magic,
  surfaces,
  edges,
  glow,
  raymarch,
  optics,
  pathtrace,
  finale,
];
