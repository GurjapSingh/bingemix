import { v4 as uuidv4 } from 'uuid';
import { writeFileSync } from 'fs';

const id = uuidv4();
writeFileSync('.env.generated', `PLEX_CLIENT_ID=${id}\n`);

console.log(`Generated Plex Client ID: ${id}`);
