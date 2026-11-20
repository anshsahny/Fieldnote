// Writes shared/fixpack.schema.json from the zod schema (web/src/fixpack/schema.ts).
// Run: cd web && npm run schema:write
import { writeFileSync } from 'node:fs';
import { fixPackJsonSchema } from '../src/fixpack/schema';

const out = new URL('../../shared/fixpack.schema.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(fixPackJsonSchema(), null, 2)}\n`);
console.log('wrote shared/fixpack.schema.json');
