import { spawnSync } from 'node:child_process';
import { ExitCode } from '../errors/index.js';

interface GrepFlags {
  [key: string]: unknown;
}

export function grepCommand(pattern: string, pathArg: string | undefined, args: string[]): void {
  // Delegate to jina-grep subprocess
  const grepArgs = [pattern];
  if (pathArg) grepArgs.push(pathArg);
  grepArgs.push(...args);

  const result = spawnSync('jina-grep', grepArgs, {
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      process.stderr.write('\x1b[31mError:\x1b[0m jina-grep not found\n');
      process.stderr.write('\x1b[2mInstall jina-grep: pip install jina-grep\x1b[0m\n');
      process.exitCode = ExitCode.ConfigError;
    } else {
      process.stderr.write(`\x1b[31mError:\x1b[0m ${err.message}\n`);
      process.exitCode = ExitCode.ApiError;
    }
    return;
  }

  const code = result.status ?? ExitCode.Success;
  if (code !== 0) {
    process.exitCode = code;
  }
}
