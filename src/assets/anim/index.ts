// Generated: animated sprite sheets (8 frames in a row). `face` is the direction the character faces in the art.
import daeng_walk from './daeng_walk.webp';
import daeng_work from './daeng_work.webp';
import fah_attack from './fah_attack.webp';
import fah_guard from './fah_guard.webp';
import kaew_attack from './kaew_attack.webp';
import kaew_guard from './kaew_guard.webp';
import mali_attack from './mali_attack.webp';
import mali_guard from './mali_guard.webp';
import mali_walk from './mali_walk.webp';
import niran_attack from './niran_attack.webp';
import niran_guard from './niran_guard.webp';
import niran_walk from './niran_walk.webp';
import petch_attack from './petch_attack.webp';
import petch_guard from './petch_guard.webp';
import petch_walk from './petch_walk.webp';
import rin_walk from './rin_walk.webp';
import somchai_walk from './somchai_walk.webp';
import somchai_work from './somchai_work.webp';
export interface Sheet { url: string; frames: number; w: number; h: number; face: 'L' | 'R'; }
export const SHEETS: Record<string, Sheet> = {
  daeng_walk: { url: daeng_walk, frames: 8, w: 64, h: 150, face: 'L' },
  daeng_work: { url: daeng_work, frames: 8, w: 93, h: 151, face: 'L' },
  fah_attack: { url: fah_attack, frames: 8, w: 109, h: 151, face: 'L' },
  fah_guard: { url: fah_guard, frames: 8, w: 72, h: 153, face: 'L' },
  kaew_attack: { url: kaew_attack, frames: 8, w: 110, h: 150, face: 'R' },
  kaew_guard: { url: kaew_guard, frames: 8, w: 80, h: 157, face: 'L' },
  mali_attack: { url: mali_attack, frames: 8, w: 117, h: 151, face: 'L' },
  mali_guard: { url: mali_guard, frames: 8, w: 58, h: 153, face: 'L' },
  mali_walk: { url: mali_walk, frames: 8, w: 73, h: 151, face: 'L' },
  niran_attack: { url: niran_attack, frames: 8, w: 67, h: 150, face: 'L' },
  niran_guard: { url: niran_guard, frames: 8, w: 64, h: 151, face: 'L' },
  niran_walk: { url: niran_walk, frames: 8, w: 75, h: 151, face: 'L' },
  petch_attack: { url: petch_attack, frames: 8, w: 94, h: 151, face: 'L' },
  petch_guard: { url: petch_guard, frames: 8, w: 67, h: 153, face: 'R' },
  petch_walk: { url: petch_walk, frames: 8, w: 70, h: 151, face: 'L' },
  rin_walk: { url: rin_walk, frames: 8, w: 61, h: 151, face: 'L' },
  somchai_walk: { url: somchai_walk, frames: 8, w: 81, h: 151, face: 'L' },
  somchai_work: { url: somchai_work, frames: 8, w: 95, h: 150, face: 'L' },
};
