import { access, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import sqlite3 from 'sqlite3';

function timestamp() {
  return new Date().toISOString().replaceAll(/[:.]/g, '-');
}

function getSqlitePath() {
  const configured = process.env.TASK_DATABASE_PATH;
  if (configured?.toLowerCase().endsWith('.json')) {
    return join(dirname(configured), 'taskflow.sqlite');
  }
  return configured ?? join(process.cwd(), 'data', 'taskflow.sqlite');
}

async function backupSqlite(source, destination) {
  await access(source);
  const database = await new Promise((resolveDatabase, reject) => {
    const connection = new sqlite3.Database(
      source,
      sqlite3.OPEN_READONLY,
      (error) => (error ? reject(error) : resolveDatabase(connection)),
    );
  });
  try {
    await new Promise((resolveBackup, reject) => {
      const backup = database.backup(destination);
      backup.step(-1, (stepError) => {
        backup.finish((finishError) => {
          if (stepError) {
            reject(stepError);
          } else if (finishError) {
            reject(finishError);
          } else {
            resolveBackup();
          }
        });
      });
    });
  } finally {
    await new Promise((resolveClose, reject) => {
      database.close((error) =>
        error ? reject(error) : resolveClose(),
      );
    });
  }
}

async function backupPostgres(connectionString, destination) {
  const url = new URL(connectionString);
  const environment = {
    ...process.env,
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  };
  const sslMode =
    url.searchParams.get('sslmode') ??
    (url.searchParams.get('ssl') === 'true' ? 'require' : undefined);
  if (sslMode) {
    environment.PGSSLMODE = sslMode;
  }

  await new Promise((resolveBackup, reject) => {
    const child = spawn(
      'pg_dump',
      ['--no-password', '--format=custom', '--file', destination],
      { env: environment, stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolveBackup();
      } else {
        reject(new Error(`pg_dump exited with status ${code ?? 'unknown'}`));
      }
    });
  });
}

async function main() {
  if (process.env.DATABASE_URL && process.env.TASK_DATABASE_PATH) {
    throw new Error('Set only DATABASE_URL or TASK_DATABASE_PATH');
  }
  const backupDirectory = resolve(
    process.env.TASK_BACKUP_DIR ?? join(process.cwd(), 'backups'),
  );
  await mkdir(backupDirectory, { recursive: true });

  if (process.env.DATABASE_URL) {
    const destination = join(backupDirectory, `taskflow-${timestamp()}.dump`);
    await backupPostgres(process.env.DATABASE_URL, destination);
    console.log(`PostgreSQL backup written to ${destination}`);
    return;
  }

  const source = resolve(getSqlitePath());
  const destination = join(
    backupDirectory,
    `taskflow-${timestamp()}.sqlite`,
  );
  await backupSqlite(source, destination);
  console.log(`SQLite backup written to ${destination}`);
}

main().catch((error) => {
  console.error(
    'Database backup failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
