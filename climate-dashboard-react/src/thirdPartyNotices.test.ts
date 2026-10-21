import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const notices = () => fs.readFileSync(path.join(root, 'THIRD-PARTY-NOTICES.md'), 'utf8');
const dsDir = path.resolve(root, 'climate-dashboard-react', process.env.SYN_DS_PATH ?? '../../syena-design-system');
const rows = () => new Set([...notices().matchAll(/^\| (\S+) \| \S+ \| ([^|]+) \|/gm)].map((m) => m[1]));

describe('THIRD-PARTY-NOTICES.md', () => {
  it('lists every direct production dependency of the app and of the design system', () => {
    const listed = rows();
    const app = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'climate-dashboard-react/package.json'), 'utf8')).dependencies);
    const ds = Object.keys(JSON.parse(fs.readFileSync(path.join(dsDir, 'package.json'), 'utf8')).dependencies);
    expect([...app, ...ds].filter((name) => !listed.has(name))).toEqual([]);
  });

  it('lists both typefaces under the SIL Open Font License, with the licence text', () => {
    const text = notices();
    for (const font of ['@fontsource/poppins', '@fontsource-variable/inter']) {
      expect(text).toMatch(new RegExp(`\\| ${font.replace('/', '\\/')} \\| \\S+ \\| OFL-1\\.1 \\|`));
    }
    expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });

  it('contains no e-mail addresses', () => {
    // A domain starts with a letter, so `name@1.2.3` (a package version) is not an address.
    expect(notices()).not.toMatch(/[\w.+-]+@[A-Za-z][\w-]*(?:\.[A-Za-z][\w-]*)+/);
  });

  it('lists no development tooling', () => {
    const listed = rows();
    for (const tool of ['vite', 'vitest', 'typescript', 'oxlint']) expect(listed.has(tool)).toBe(false);
  });
});
