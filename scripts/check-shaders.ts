import { execFileSync } from 'node:child_process';
import { accessSync, chmodSync, constants, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import validator from 'glslang-validator-prebuilt-predownloaded';

const SHADERS = path.resolve('src/client/shaders');

function executable(file: string): string {
  try {
    accessSync(file, constants.X_OK);
  } catch {
    chmodSync(file, 0o755);
  }
  return file;
}

async function sources(): Promise<{ name: string; stage: string; text: string }[]> {
  const found: { name: string; stage: string; text: string }[] = [];
  for (const file of readdirSync(SHADERS).filter((entry) => entry.endsWith('.ts'))) {
    const module = (await import(pathToFileURL(path.join(SHADERS, file)).href)) as Record<string, unknown>;
    for (const [name, value] of Object.entries(module)) {
      if (typeof value !== 'string' || !value.startsWith('#version')) continue;
      found.push({ name: `${file}:${name}`, stage: /vertex$/i.test(name) ? 'vert' : 'frag', text: value });
    }
  }
  return found;
}

function check(
  binary: string,
  directory: string,
  shader: { name: string; stage: string; text: string },
): string | null {
  const file = path.join(directory, `${shader.name.replace(/[^a-z0-9]/gi, '-')}.${shader.stage}`);
  writeFileSync(file, shader.text);
  try {
    execFileSync(binary, [file], { stdio: 'pipe' });
    return null;
  } catch (error) {
    const output = (error as { stdout?: Buffer }).stdout?.toString() ?? String(error);
    return `${shader.name}\n${output.trim()}`;
  }
}

const binary = executable(validator.path);
const directory = mkdtempSync(path.join(tmpdir(), 'squish-shaders-'));
const shaders = await sources();
const problems = shaders.map((shader) => check(binary, directory, shader)).filter((problem) => problem !== null);
rmSync(directory, { recursive: true, force: true });
if (problems.length) {
  console.error(problems.join('\n\n'));
  process.exit(1);
}
console.info(`shaders: ${String(shaders.length)} compile`);
