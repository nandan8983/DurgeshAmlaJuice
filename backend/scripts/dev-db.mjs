/**
 * A local PostgreSQL for development and testing, with nothing to install.
 *
 * `embedded-postgres` downloads a real PostgreSQL server as an npm package and
 * runs it from `.dev-db/` on port 55432. It exists so the project can be tested
 * on a machine without Docker or a system Postgres — it is a devDependency and
 * never ships to production, where docker-compose.yml or Render's managed
 * Postgres provides the database.
 *
 *   node scripts/dev-db.mjs start    # start (stays in the foreground)
 *   node scripts/dev-db.mjs stop     # stop
 *   node scripts/dev-db.mjs status   # is it up?
 *
 * Connection string (already in .env.example as the default):
 *   postgresql://daj:daj_dev_password@127.0.0.1:55432/daj?schema=public
 */
import EmbeddedPostgres from 'embedded-postgres';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, '..', '.dev-db');

const PORT = Number(process.env.DEV_DB_PORT ?? 55432);
const USER = 'daj';
const PASSWORD = 'daj_dev_password';
const DATABASE = 'daj';

const URL = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}?schema=public`;

function makeServer() {
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
  });
}

/** Is something already listening on the port? */
function isUp() {
  return new Promise((resolve) => {
    const socket = net
      .connect({ host: '127.0.0.1', port: PORT })
      .setTimeout(1500)
      .once('connect', () => {
        socket.destroy();
        resolve(true);
      })
      .once('timeout', () => {
        socket.destroy();
        resolve(false);
      })
      .once('error', () => resolve(false));
  });
}

async function start() {
  if (await isUp()) {
    console.log(`Already running on port ${PORT}.`);
    console.log(`DATABASE_URL=${URL}`);
    return;
  }

  const pg = makeServer();

  // initialise() creates the data directory the first time; afterwards it
  // would fail, so only run it when the directory is not there yet.
  const { existsSync } = await import('node:fs');
  if (!existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    console.log('First run: downloading and initialising PostgreSQL…');
    await pg.initialise();
    await pg.start();
    await pg.createDatabase(DATABASE);
  } else {
    await pg.start();
  }

  console.log('');
  console.log('PostgreSQL is up.');
  console.log(`  DATABASE_URL=${URL}`);
  console.log('');
  console.log('Next:  npm run migrate:deploy  &&  npm run seed  &&  npm run dev');
  console.log('Stop:  npm run db:stop   (or press Ctrl+C here)');
  console.log('');

  const shutdown = async () => {
    console.log('\nStopping PostgreSQL…');
    try {
      await pg.stop();
    } catch {
      // already gone
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Hold the process open so the server keeps running.
  setInterval(() => {}, 1 << 30);
}

async function stop() {
  if (!(await isUp())) {
    console.log('Not running.');
    return;
  }
  await makeServer().stop();
  console.log('Stopped.');
}

async function status() {
  console.log((await isUp()) ? `Running on port ${PORT}.` : 'Not running.');
}

const command = process.argv[2] ?? 'start';
const commands = { start, stop, status };

if (!commands[command]) {
  console.error(`Unknown command "${command}". Use: start | stop | status`);
  process.exit(1);
}

await commands[command]().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
