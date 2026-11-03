const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const base = path.join(root, 'shenzuoci_yizhi_v2');
const source = fs.readFileSync(path.join(base, 'extension.js'), 'utf8');
const info = JSON.parse(fs.readFileSync(path.join(base, 'info.json'), 'utf8'));
assert.equal(info.name, 'shenzuoci_yizhi_v2');
assert.equal(info.version, source.match(/version:\s*'([^']+)'/)[1]);
assert(source.includes("audio: 'ext:shenzuoci_yizhi_v2/audio/skill:4'"));
assert(source.includes('ext:shenzuoci_yizhi_v2/character/tyj_zuoci.jpg'));
const expected = ['extension.js', 'info.json', 'character/tyj_zuoci.jpg',
    ...Array.from({ length: 4 }, (_, i) => `audio/skill/tyj_bianhuan${i + 1}.mp3`)];
const lines = fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8').trim().split(/\r?\n/);
assert.equal(lines.length, expected.length);
for (const relative of expected) {
    const key = 'shenzuoci_yizhi_v2/' + relative;
    const line = lines.find(item => item.slice(66) === key);
    assert(line, 'Missing checksum: ' + key);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(base, relative))).digest('hex');
    assert.equal(actual, line.slice(0, 64), 'Checksum mismatch: ' + key);
}
console.log('PASS: extension metadata, audio and portrait references, seven runtime file checksums');
