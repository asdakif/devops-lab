import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
if (existsSync('.env')) {
  console.log('.env already exists; preserved existing credentials.');
} else {
  const password = randomBytes(24).toString('hex');
  const token = randomBytes(32).toString('hex');
  writeFileSync('.env', `POSTGRES_USER=devops\nPOSTGRES_DB=devops\nPOSTGRES_PASSWORD=${password}\nAPI_TOKEN=${token}\nAPI_PORT=3080\nPROMETHEUS_PORT=9095\nDATABASE_URL=postgresql://devops:${password}@127.0.0.1:5435/devops\nPORT=3080\n`, { mode: 0o600, flag: 'wx' });
  console.log('Created .env with random credentials. Keep this file private.');
}
