// Loads the real data files from disk into the same data object the browser uses.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeData } from '../js/data.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function loadDiskData(dir = process.env.LTG_DATA || path.join(HERE, '..', 'data')) {
  const read = rel => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
  const meta = read('meta.json');
  return makeData(meta, read('players.json'), read('teams.json'), async rel => read(rel));
}
