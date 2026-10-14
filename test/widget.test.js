import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildWidgetContent } from '../src/widget.js';

test('le widget de synthèse respecte le contrat Gladys', () => {
  const content = buildWidgetContent(
    [
      { status: 'RUNNING', update_available: true },
      { status: 'STOPPED', update_available: false },
      { status: 'ERROR', update_available: false },
    ],
    { mode: 'gladys' },
  );
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[1].items[0].value, 1);
  assert.equal(content.components[1].items[2].value, 1);
  assert.equal(content.components[0].text.fr.length <= 80, true);
});
