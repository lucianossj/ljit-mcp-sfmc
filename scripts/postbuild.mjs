import { readFileSync, writeFileSync, chmodSync } from 'node:fs';

const entry = 'dist/src/main.js';
const content = readFileSync(entry, 'utf8');

if (!content.startsWith('#!/usr/bin/env node')) {
  writeFileSync(entry, `#!/usr/bin/env node\n${content}`);
}

chmodSync(entry, 0o755);
console.log('postbuild: shebang added and chmod +x applied to', entry);
