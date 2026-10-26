import { background } from '../shaders/background.ts';
import { cellFragment, cellVertex } from '../shaders/cell.ts';
import { creatureFragment, creatureVertex } from '../shaders/creature.ts';
import {
  fieldFragment,
  fluidAdvect,
  fluidDivergence,
  fluidGradient,
  fluidPressure,
  fluidSplat,
  quadVertex,
} from '../shaders/fluid.ts';
import { fusionFragment, fusionVertex } from '../shaders/fusion.ts';
import { blitFragment, blurPass, brightPass, composite } from '../shaders/post.ts';
import {
  bubbleFragment,
  bubbleVertex,
  debrisFragment,
  debrisVertex,
  foodFragment,
  foodVertex,
  haloFragment,
  haloVertex,
  shadowFragment,
} from '../shaders/sprites.ts';
import { ShaderProgram } from './program.ts';

export const programs = {
  advect: new ShaderProgram(quadVertex, fluidAdvect),
  divergence: new ShaderProgram(quadVertex, fluidDivergence),
  pressure: new ShaderProgram(quadVertex, fluidPressure),
  gradient: new ShaderProgram(quadVertex, fluidGradient),
  splat: new ShaderProgram(quadVertex, fluidSplat),
  background: new ShaderProgram(quadVertex, background),
  cell: new ShaderProgram(cellVertex, cellFragment),
  halo: new ShaderProgram(haloVertex, haloFragment),
  shadow: new ShaderProgram(haloVertex, shadowFragment),
  food: new ShaderProgram(foodVertex, foodFragment),
  bubble: new ShaderProgram(bubbleVertex, bubbleFragment),
  debris: new ShaderProgram(debrisVertex, debrisFragment),
  creature: new ShaderProgram(creatureVertex, creatureFragment),
  fusion: new ShaderProgram(fusionVertex, fusionFragment),
  bright: new ShaderProgram(quadVertex, brightPass),
  field: new ShaderProgram(quadVertex, fieldFragment),
  blur: new ShaderProgram(quadVertex, blurPass),
  blit: new ShaderProgram(quadVertex, blitFragment),
  composite: new ShaderProgram(quadVertex, composite),
};
