import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Empacota o servidor como Desktop Extension (.mcpb) para instalação em 1 clique
 * no Claude Desktop (Settings > Extensions > Install Extension).
 *
 * Fluxo: build (SWC) -> staging com deps de produção -> injeta a versão do
 * package.json no mcpb/manifest.json -> `mcpb pack`.
 *
 * Saída: dist-mcpb/ljit-mcp-sfmc-<versão>.mcpb
 */
const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;
const stage = resolve(root, '.mcpb-build');
const outDir = resolve(root, 'dist-mcpb');
const outFile = resolve(outDir, `ljit-mcp-sfmc-${version}.mcpb`);

const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

console.log(`[pack-mcpb] empacotando v${version}`);

// 1. build limpo
run('npm run build');

// 2. staging
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(resolve(root, 'dist'), resolve(stage, 'dist'), { recursive: true });
for (const f of ['package.json', 'package-lock.json', 'README.md']) {
  cpSync(resolve(root, f), resolve(stage, f));
}

// 3. dependências apenas de produção
run('npm ci --omit=dev --ignore-scripts', stage);

// 4. manifest com a versão sincronizada
const manifest = JSON.parse(readFileSync(resolve(root, 'mcpb/manifest.json'), 'utf8'));
manifest.version = version;
writeFileSync(resolve(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// 5. pack
mkdirSync(outDir, { recursive: true });
run(`npx --yes @anthropic-ai/mcpb pack "${stage}" "${outFile}"`);

// 6. limpeza do staging
rmSync(stage, { recursive: true, force: true });

console.log(`\n[pack-mcpb] OK -> ${outFile}`);
console.log('[pack-mcpb] publique no GitHub Releases com:');
console.log(`  gh release create v${version} --target master "${outFile}"`);
