import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('le manifeste et la documentation suivent le contrat externe', () => {
  const manifest = JSON.parse(readFileSync(new URL('gladys-assistant-integration.json', root), 'utf8'));
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'provider');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const text of Object.values(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100);
  }
  assert.match(manifest.docker_image, /:.+$/);
  assert.equal(manifest.gladys_version, '>=5.1.0');
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/b3n0/gladys-integrations_manager/main/cover.jpg',
  );
  const cover = readFileSync(new URL('cover.jpg', root));
  assert.ok(cover.length < 150 * 1024, 'cover.jpg doit peser moins de 150 Ko');
  assert.deepEqual(manifest.categories, ['services']);
  assert.ok(manifest.widgets.length >= 1);
  assert.equal(manifest.containers[0].ports[0].name, 'manager_ui');
  assert.equal(manifest.containers[0].ports[0].browsable, true);
  for (const file of ['docs/fr.md', 'docs/en.md']) {
    const text = readFileSync(new URL(file, root), 'utf8');
    assert.ok(text.length >= 300, file);
  }
  const section = manifest.config_schema[0].description.fr;
  assert.ok(section.includes('{{gladys_host}}'));
  assert.ok(section.includes('{{port:manager_ui}}'));
  assert.ok(section.length <= 1000);
});
