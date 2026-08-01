import fs from 'node:fs';

const partsDirectory = new URL('./build-csa-deactivation-hotfix.parts/', import.meta.url);
const generatedScript = new URL('./.build-csa-deactivation-hotfix.generated.mjs', import.meta.url);
const partNames = fs.readdirSync(partsDirectory)
  .filter(name => name.endsWith('.part'))
  .sort((left, right) => {
    if (left === 'part-07.part') return 1;
    if (right === 'part-07.part') return -1;
    return left.localeCompare(right);
  });

if (!partNames.length) throw new Error('CSA deactivation hotfix build parts are missing.');
const source = partNames
  .map(name => fs.readFileSync(new URL(name, partsDirectory), 'utf8'))
  .join('');
fs.writeFileSync(generatedScript, source, 'utf8');
await import(`${generatedScript.href}?run=${Date.now()}`);
