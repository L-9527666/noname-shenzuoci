// Source-data audit using the read-only phone snapshot, not a running phone match.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const snapshot = process.env.NONAME_PHONE_SNAPSHOT;
if (!snapshot || !fs.existsSync(snapshot)) {
    console.error('Set NONAME_PHONE_SNAPSHOT to an external phone source snapshot; see tests/README.md.');
    process.exit(1);
}
const lib = { character: {}, skill: {}, translate: {}, config: {}, group: [], filter: {} };
const reports = [];
const game = {
    generateBeatmapTimeleap: () => [], // Music metadata is unrelated to skill categories.
    log() {},
    import(kind, factory) {
        const pack = factory();
        Object.assign(lib.character, pack.character);
        Object.assign(lib.skill, pack.skill);
        Object.assign(lib.translate, pack.translate);
    },
};
const get = {
    // Disabled characters are mocked here: this audit is about source data.
    gainableCharacters: filter => Object.keys(lib.character).filter(id => filter(lib.character[id], id)),
    translation: id => lib.translate[id],
    skillInfoTranslation: id => lib.translate[id + '_info'],
    poptip: id => id,
};
function evaluate(relative) {
    const file = path.join(snapshot, relative);
    const source = fs.readFileSync(file, 'utf8').replace(/^import .*?;\r?\n/gm, '')
        .replace(/export default (\w+);?\s*$/, 'return $1;');
    const context = vm.createContext({ lib, game, get, ui: {}, ai: {}, _status: {}, cards: {}, CacheContext: class {} });
    return vm.runInContext('(function(){\n' + source + '\n})()', context, { filename: relative, timeout: 3000 });
}
for (const pack of ['standard', 'shenhua', 'extra']) evaluate('character/' + pack + '.js');
for (const pack of ['mobile', 'xianding', 'sp2']) {
    Object.assign(lib.character, evaluate('character/' + pack + '/character.js'));
    Object.assign(lib.skill, evaluate('character/' + pack + '/skill.js'));
    Object.assign(lib.translate, evaluate('character/' + pack + '/translate.js'));
}
const source = fs.readFileSync(path.join(__dirname, '../shenzuoci_yizhi_v2/extension.js'), 'utf8')
    .replace(/^import[^\n]*\n/, '')
    .replace('export const type', 'const type')
    .replace('export default function ()', 'function makeExtension()');
const context = vm.createContext({ lib, game, get, _status: {} });
vm.runInContext('Array.prototype.randomGets = function(n){ return this.slice(0,n); };', context);
const extension = vm.runInContext(source + '\nmakeExtension()', context);
const skill = extension.package.skill.skill.tyj_lunhui;
async function main() {
    for (const tag of ['juexingji', 'dutySkill', 'limited', 'zhuSkill']) {
        let stage = 0;
        const p = {
            storage: {}, skills: ['tyj_bianhuan', 'tyj_lunhui'],
            getSkills() { return this.skills.slice(); },
            hasSkill(id) { return this.skills.includes(id); },
            logSkill() {}, markAuto(id, values) { this.storage[id] = values; }, syncStorage() {},
            async addSkills(id) { this.skills.push(id); },
            chooseControl(controls) {
                const data = {};
                const choice = {
                    set(key, value) { data[key] = value; return choice; },
                    async forResult() {
                        if (stage++ === 0) {
                            assert(controls.includes('tyj_lunhui_' + tag), 'Empty real-source category: ' + tag);
                            return { control: 'tyj_lunhui_' + tag };
                        }
                        assert(controls.length > 0 && controls.length <= 3);
                        assert.equal(new Set(controls).size, controls.length);
                        for (const id of controls) {
                            assert(lib.skill[id][tag]);
                            assert(lib.translate[id + '_info']);
                            assert(!lib.skill[id].sub && !lib.skill[id].charlotte);
                        }
                        reports.push({ tag, offered: Array.from(controls), names: Array.from(controls, id => lib.translate[id]) });
                        return { control: controls[0] };
                    },
                };
                return choice;
            },
        };
        skill.init(p);
        assert.equal(skill.filter({}, p), true);
        await skill.content({}, {}, p);
        assert.equal(stage, 2);
        assert(p.storage.tyj_lunhui.includes(tag));
    }
    console.log(JSON.stringify({ characters: Object.keys(lib.character).length, skills: Object.keys(lib.skill).length, reports }, null, 2));
    console.log('PASS: all four categories produce valid candidates from six phone source packs');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
