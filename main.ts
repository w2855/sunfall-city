// Hand-in program for make.fun: copies the entry into the output directory and writes the dossier.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

mkdirSync(out, { recursive: true });
cpSync(resolve(here, 'game'), resolve(out, 'game'), { recursive: true });
cpSync(resolve(here, 'screenshots'), resolve(out, 'screenshots'), { recursive: true });
writeFileSync(
  resolve(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log(`sunfall city: packed game/ + screenshots/ + dossier.json into ${out}`);
