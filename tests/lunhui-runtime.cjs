// Executes the real extension with mocked player events; no phone UI is driven.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function main() {
    const root = path.join(__dirname, '../shenzuoci_yizhi_v2');
    const code = fs.readFileSync(path.join(root, 'extension.js'), 'utf8')
        .replace(/^import[^\n]*\n/, '')
        .replace('export const type', 'const type')
        .replace('export default function ()', 'function makeExtension()');
    const tags = ['juexingji', 'dutySkill', 'limited', 'zhuSkill'];
    const lib = { skill: {}, translate: {}, character: {} };
    const audit = [];
    const get = {
        gainableCharacters(filter) {
            return Object.keys(lib.character).filter(id => !lib.character[id].disabled && filter(lib.character[id], id));
        },
        gainableSkills() { throw new Error('Generic skill pool must not hide unique skills'); },
        translation(id) { return lib.translate[id]; },
        skillInfoTranslation(id) { return lib.translate[id + '_info']; },
        skillRank(id) { return Number(id.split('_').pop()) || 0; },
    };
    const status = {};
    const context = vm.createContext({ lib, get, game: { log: (...args) => audit.push(args) }, _status: status });
    // Seeded shuffle verifies sampling constraints without nondeterministic failures.
    vm.runInContext(`
        let seed = 17;
        Array.prototype.randomGets = function (count) {
            const result = this.slice();
            for (let i = result.length - 1; i > 0; i--) {
                seed = (seed * 48271) % 2147483647;
                const j = seed % (i + 1);
                [result[i], result[j]] = [result[j], result[i]];
            }
            return result.slice(0, count);
        };
    `, context);
    const extension = vm.runInContext(code + '\nmakeExtension()', context);
    const skill = extension.package.skill.skill.tyj_lunhui;
    assert.equal(skill.content.constructor.name, 'AsyncFunction');
    assert.equal(skill.trigger.global, 'roundStart');
    assert.equal(skill.direct, true);
    assert.equal(skill.round, 1);
    for (const id of ['tyj_zuoci', 'tyj_zuoci_gai']) {
        assert(extension.package.character.character[id][3].includes('tyj_lunhui'));
    }
    assert.equal(extension.package.version, JSON.parse(fs.readFileSync(path.join(root, 'info.json'), 'utf8')).version);

    function add(id, info) {
        lib.skill[id] = info;
        lib.translate[id] = id;
        lib.translate[id + '_info'] = id + ' description';
        return id;
    }
    const normal = [];
    for (const tag of tags) {
        for (let n = 1; n <= 4; n++) normal.push(add(tag + '_' + n, { [tag]: true, unique: true }));
    }
    lib.character.enabled = { skills: normal };
    lib.character.duplicate = { skills: ['juexingji_1', 'dutySkill_1'] };
    lib.character.oldFormat = ['male', 'shen', 4, ['juexingji_2']];
    lib.character.disabled = { disabled: true, skills: [add('disabled_awake', { juexingji: true })] };
    lib.character.boss = { isBoss: true, skills: [add('boss_awake', { juexingji: true })] };
    lib.character.hidden = { isUnseen: true, skills: [add('hidden_awake', { juexingji: true })] };
    const unusable = ['sub', 'charlotte', 'temp', 'hiddenSkill', 'equipSkill', 'fixed', 'vanish'].map(flag =>
        add('internal_' + flag, { juexingji: true, [flag]: true }));
    unusable.push(add('needs_missing_parent', { juexingji: true, ai: { combo: 'missing_parent' } }));
    unusable.push(add('no_description', { juexingji: true }));
    delete lib.translate.no_description_info;
    lib.character.internal = { skills: unusable };
    const validIds = new Set(normal);

    function player(answers) {
        const p = {
            storage: {}, skills: ['tyj_bianhuan', 'tyj_lunhui'], awakenedSkills: [],
            hiddenSkills: [], invisibleSkills: [], prompts: [], actions: [], answers,
            getSkills: () => p.skills.slice(),
            hasSkill: id => p.skills.includes(id),
            logSkill: id => p.actions.push(['log', id]),
            async addSkills(id) { p.skills.push(id); p.actions.push(['gain', id]); },
            markAuto(id, values) {
                if (!Array.isArray(p.storage[id])) p.storage[id] = [];
                for (const value of values) if (!p.storage[id].includes(value)) p.storage[id].push(value);
                p.actions.push(['mark', id]);
            },
            syncStorage: id => p.actions.push(['sync', id]),
            chooseControl(controls) {
                const prompt = { controls: Array.from(controls), fields: {} };
                p.prompts.push(prompt);
                const event = {
                    set(key, value) { prompt.fields[key] = value; return event; },
                    async forResult() {
                        const answer = p.answers.shift();
                        assert.notEqual(answer, undefined, 'Unexpected extra choice event');
                        const control = typeof answer === 'function' ? answer(prompt, p) : answer;
                        return { control };
                    },
                };
                return event;
            },
        };
        skill.init(p);
        return p;
    }
    const pick = tag => prompt => {
        assert(prompt.controls.length > 0 && prompt.controls.length <= 3);
        assert.equal(new Set(prompt.controls).size, prompt.controls.length);
        for (const id of prompt.controls) {
            assert(validIds.has(id), 'Unexpected candidate: ' + id);
            assert(lib.skill[id][tag], 'Candidate tag mismatch');
        }
        assert.equal(prompt.fields.choiceList.length, prompt.controls.length);
        status.event = { controls: prompt.controls };
        assert(prompt.controls.includes(prompt.fields.ai()));
        return prompt.controls[0];
    };

    // Four independent rounds remove exactly the selected option after gaining.
    const p = player([]);
    for (const tag of tags) {
        p.prompts.length = 0;
        p.answers.push('tyj_lunhui_' + tag, pick(tag));
        assert.equal(skill.filter({}, p), true);
        await skill.content({}, {}, p);
        assert(p.storage.tyj_lunhui.includes(tag));
        const category = p.prompts[0];
        for (const used of p.storage.tyj_lunhui.filter(id => id !== tag)) {
            assert(!category.controls.includes('tyj_lunhui_' + used));
        }
        assert(category.controls.includes('cancel2'));
    }
    assert.deepEqual(Array.from(p.storage.tyj_lunhui), tags);
    assert.equal(p.actions.filter(item => item[0] === 'gain').length, 4);
    assert.equal(skill.filter({}, p), false);
    skill.init(p); // Losing/regaining the skill does not reset deletion records.
    assert.deepEqual(Array.from(p.storage.tyj_lunhui), tags);
    assert.equal(skill.intro.markcount(p.storage.tyj_lunhui), 0);
    assert(skill.intro.content(p.storage.tyj_lunhui).includes('全部'));

    const canceled = player(['cancel2']);
    await skill.content({}, {}, canceled);
    assert.equal(canceled.actions.length, 0);
    assert.equal(canceled.storage.tyj_lunhui.length, 0);
    assert.equal(canceled.prompts.length, 1);
    const fresh = player([]);
    assert.equal(skill.intro.markcount(fresh.storage.tyj_lunhui), 4);

    // Exclude every already owned/awakened skill; one candidate remains displayable.
    const short = player(['tyj_lunhui_juexingji', prompt => {
        assert.deepEqual(prompt.controls, ['juexingji_4']);
        return prompt.controls[0];
    }]);
    short.skills.push('juexingji_1', 'juexingji_2');
    short.awakenedSkills.push('juexingji_3');
    await skill.content({}, {}, short);
    assert(short.skills.includes('juexingji_4'));
    const empty = player([]);
    empty.skills.push(...normal);
    assert.equal(skill.filter({}, empty), false);
    await skill.content({}, {}, empty);
    assert.equal(empty.prompts.length, 0);
    assert.equal(empty.storage.tyj_lunhui.length, 0);

    // Grant completion is awaited before the selected option is deleted.
    let finish;
    const pending = player(['tyj_lunhui_limited', pick('limited')]);
    pending.addSkills = id => new Promise(resolve => { finish = () => { pending.skills.push(id); resolve(); }; });
    const task = skill.content({}, {}, pending);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pending.storage.tyj_lunhui.length, 0);
    finish();
    await task;
    assert.deepEqual(Array.from(pending.storage.tyj_lunhui), ['limited']);
    const failed = player(['tyj_lunhui_dutySkill', pick('dutySkill')]);
    failed.addSkills = async () => { throw new Error('grant failed'); };
    await assert.rejects(skill.content({}, {}, failed), /grant failed/);
    assert.equal(failed.storage.tyj_lunhui.length, 0);

    // Another effect can grant the previewed skill during the selection event.
    const stale = player(['tyj_lunhui_zhuSkill', (prompt, actor) => {
        actor.skills.push(prompt.controls[0]);
        return prompt.controls[0];
    }]);
    await skill.content({}, {}, stale);
    assert.equal(stale.actions.length, 0);
    assert.equal(stale.storage.tyj_lunhui.length, 0);

    console.log('PASS: both characters, four tags including unique, random <=3, exclusions, cancel, persistent deletions, separate players, short/empty pools, awaited grants');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
