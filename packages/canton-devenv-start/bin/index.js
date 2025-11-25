#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const TEMPLATE_ROOT = path.join(__dirname, '..', 'templates');

function printHelp() {
  console.log(`devenv-init\n\nUsage:\n  bunx devenv-init [options]\n\nOptions:\n  --dir, --path <path>   Output directory (defaults to CWD)\n  --force, -f            Overwrite existing files\n  --help, -h             Show this help text\n`);
}

function parseArgs(argv) {
  const opts = {
    targetDir: process.cwd(),
    force: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir' || arg === '--path') {
      const next = argv[i + 1];
      if (!next) {
        console.error('Error: --dir requires a path argument');
        process.exit(1);
      }
      const resolvedPath = path.resolve(process.cwd(), next);
      const normalizedPath = path.normalize(resolvedPath);

      // Security: Prevent path traversal attacks
      // Allow absolute paths but validate they're not system directories
      const forbiddenPaths = ['/etc', '/usr', '/bin', '/sbin', '/var', '/sys', '/proc'];
      const isSystemPath = forbiddenPaths.some(fp => normalizedPath === fp || normalizedPath.startsWith(fp + '/'));

      if (isSystemPath) {
        console.error(`Error: Cannot write to system directory: ${normalizedPath}`);
        console.error('Please choose a different target directory');
        process.exit(1);
      }

      opts.targetDir = normalizedPath;
      i += 1;
    } else if (arg === '--force' || arg === '-f') {
      opts.force = true;
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
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (err) {
    console.error(`Error: Failed to create directory ${dirPath}`);
    console.error(`Reason: ${err.message}`);
    process.exit(1);
  }
}

function copyEntry(src, dest, opts, results) {
  let stats;
  try {
    stats = fs.statSync(src);
  } catch (err) {
    console.error(`Error: Cannot read source file ${src}`);
    console.error(`Reason: ${err.message}`);
    process.exit(1);
  }

  if (stats.isDirectory()) {
    ensureDir(dest);
    try {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      entries.forEach((entry) => {
        copyEntry(
          path.join(src, entry.name),
          path.join(dest, entry.name),
          opts,
          results,
        );
      });
    } catch (err) {
      console.error(`Error: Cannot read directory ${src}`);
      console.error(`Reason: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  try {
    if (fs.existsSync(dest) && !opts.force) {
      results.skipped.push(dest);
      return;
    }
  } catch (err) {
    console.error(`Error: Cannot check destination ${dest}`);
    console.error(`Reason: ${err.message}`);
    process.exit(1);
  }

  ensureDir(path.dirname(dest));

  try {
    fs.copyFileSync(src, dest);
    // Only set file permissions if not on Windows
    // Windows doesn't support Unix-style permissions
    if (process.platform !== 'win32') {
      // Check if this is a shell script by extension
      const isShellScript = /\.(sh|bash)$/i.test(src);
      
      if (isShellScript) {
        // Shell scripts should always be executable (owner execute + read/write)
        fs.chmodSync(dest, 0o755);
      } else if (stats.mode & 0o111) {
        // If source has any execute bit, preserve owner execute only
        const sanitizedMode = (stats.mode & 0o666) | 0o100;
        fs.chmodSync(dest, sanitizedMode);
      } else {
        // Regular files: read/write only
        fs.chmodSync(dest, stats.mode & 0o666);
      }
    }
    results.copied.push(dest);
  } catch (err) {
    console.error(`Error: Failed to copy ${src} to ${dest}`);
    console.error(`Reason: ${err.message}`);
    process.exit(1);
  }
}

function relativeList(base, items) {
  return items
    .map((item) => path.relative(base, item) || path.basename(item))
    .sort();
}

function main() {
  try {
    if (!fs.existsSync(TEMPLATE_ROOT)) {
      console.error('Template directory is missing. Reinstall the package.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Error: Cannot access template directory');
    console.error(`Reason: ${err.message}`);
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
  let entries;
  try {
    entries = fs.readdirSync(TEMPLATE_ROOT, { withFileTypes: true });
  } catch (err) {
    console.error(`Error: Cannot read template directory ${TEMPLATE_ROOT}`);
    console.error(`Reason: ${err.message}`);
    process.exit(1);
  }
  entries.forEach((entry) => {
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
}

main();
