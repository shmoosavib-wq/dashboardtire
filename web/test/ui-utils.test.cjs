const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const typescript = require('typescript');

const source = readFileSync(path.join(__dirname, '../src/api.ts'), 'utf8');
const compiled = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
}).outputText;
const frontendModule = { exports: {} };
new Function('exports', 'require', 'module', compiled)(frontendModule.exports, require, frontendModule);
const { fromPersianDate, toPersianDate, normalizeIntegerInput } = frontendModule.exports;
const fa = String.fromCharCode(...Array.from({ length: 10 }, (_, index) => 0x06f0 + index));
const asciiDate = (value) => value.replace(/[\u06f0-\u06f9]/g, (digit) => String(fa.indexOf(digit)));

test('integer entry normalizes Persian, Arabic and English zero without treating it as empty', () => {
  assert.equal(normalizeIntegerInput(String.fromCharCode(0x06f0)), '0');
  assert.equal(normalizeIntegerInput(String.fromCharCode(0x0660)), '0');
  assert.equal(normalizeIntegerInput('0'), '0');
  assert.equal(normalizeIntegerInput(String.fromCharCode(0x06f1, 0x06f2, 0x066c, 0x06f0, 0x06f3, 0x06f4)), '12034');
});

test('Persian calendar dates select a Gregorian day and round-trip correctly', () => {
  for (const date of ['1405/01/01', '1405/08/19', '1404/12/29']) {
    const persianDate = date.replace(/\d/g, (digit) => fa[Number(digit)]);
    const isoDate = fromPersianDate(persianDate);
    assert.match(isoDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(toPersianDate(isoDate), asciiDate(persianDate));
  }
  assert.equal(fromPersianDate('1405/13/01'), '');
  assert.equal(fromPersianDate('1404/12/30'), '');
});
