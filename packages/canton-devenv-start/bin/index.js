#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const TEMPLATE_ROOT = path.join(__dirname, '..', 'templates');

function printHelp() {
  console.log(`canton-devenv-start\n\nUsage:\n  npx canton-devenv-start [options]\n\nOptions:\n  --dir, --path <path>   Output directory (defaults to CWD)\n  --force, -f            Overwrite existing files\n  --with-examples        Include example projects\n  --help, -h             Show this help text\n`);
}

function parseArgs(argv) {
  const opts = {
    targetDir: process.cwd(),
    force: false,
    withExamples: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir' || arg === '--path') {
      const next = argv[i + 1];
      if (!next) {
        console.error('Error: --dir requires a path argument');
        process.exit(1);
      }
      opts.targetDir = path.resolve(process.cwd(), next);
      i += 1;
    } else if (arg === '--force' || arg === '-f') {
      opts.force = true;
    } else if (arg === '--with-examples') {
      opts.withExamples = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return opts;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyEntry(src, dest, opts, results) {
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    entries.forEach((entry) => {
      copyEntry(
        path.join(src, entry.name),
        path.join(dest, entry.name),
        opts,
        results,
      );
    });
    return;
  }

  if (fs.existsSync(dest) && !opts.force) {
    results.skipped.push(dest);
    return;
  }

  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, stats.mode);
  results.copied.push(dest);
}

function relativeList(base, items) {
  return items
    .map((item) => path.relative(base, item) || path.basename(item))
    .sort();
}

function main() {
  if (!fs.existsSync(TEMPLATE_ROOT)) {
    console.error('Template directory is missing. Reinstall the package.');
    process.exit(1);
  }

  const opts = parseArgs(process.argv.slice(2));
  ensureDir(opts.targetDir);

  console.log('Canton Dev Env Starter');
  console.log('========================');
  console.log(`Template: ${TEMPLATE_ROOT}`);
  console.log(`Target:   ${opts.targetDir}`);
  console.log('');

  const results = { copied: [], skipped: [] };
  const entries = fs.readdirSync(TEMPLATE_ROOT, { withFileTypes: true });
  entries.forEach((entry) => {
    // Skip examples directory unless --with-examples flag is set
    if (entry.name === 'examples' && !opts.withExamples) {
      return;
    }
    copyEntry(
      path.join(TEMPLATE_ROOT, entry.name),
      path.join(opts.targetDir, entry.name),
      opts,
      results,
    );
  });

  const copied = relativeList(opts.targetDir, results.copied);
  const skipped = relativeList(opts.targetDir, results.skipped);

  if (copied.length) {
    console.log('Created:');
    copied.forEach((item) => console.log(`  • ${item}`));
  }

  if (skipped.length) {
    console.log('Skipped (already existed):');
    skipped.forEach((item) => console.log(`  • ${item}`));
    if (!opts.force) {
      console.log('\nRe-run with --force to overwrite skipped files.');
    }
  }

  console.log('\nNext steps:');
  console.log('  1. Open the folder in VS Code or Cursor');
  console.log('  2. Reopen in the devcontainer when prompted');
  console.log('  3. Run "daml build" at the repo root to warm up the LSP');

  if (!opts.withExamples) {
    console.log('\n💡 Tip: Use --with-examples to include example projects');
  }
}

main();
