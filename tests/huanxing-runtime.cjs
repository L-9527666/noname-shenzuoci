// Local regression checks with mocked engine events; this does not run the phone engine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function main() {
    const file = path.join(__dirname, '../shenzuoci_yizhi_v2/extension.js');
    const source = fs.readFileSync(file, 'utf8')
        .replace(/^import[^\n]*\n/, '')
        .replace('export const type', 'const type')
        .replace('export default function ()', 'function makeExtension()');
    const infos = {};
    const lib = { translate: {} };
    const ids = ['tyj_bianhuan', 'tyj_huanxing', 'tyj_bianhuan_flash',
        'normal', 'effect', 'other', 'temporary', 'lord', 'identity', 'equipment',
        'tempFlag', 'subFlag', 'charlotteFlag', 'uniqueFlag', 'hiddenFlag'];
    for (const id of ids) {
        infos[id] = {};
        lib.translate[id] = id;
    }
    lib.translate.effect = lib.translate.normal;
    for (const flag of ['temp', 'sub', 'charlotte', 'unique']) infos[flag + 'Flag'][flag] = true;
    infos.hiddenFlag.hiddenSkill = true;
    const context = vm.createContext({ lib, get: { info: id => infos[id] } });
    const extension = vm.runInContext(source + '\nmakeExtension()', context);
    const bianhuan = extension.package.skill.skill.tyj_bianhuan;
    const skill = extension.package.skill.skill.tyj_huanxing;
    assert.equal(skill.content.constructor.name, 'AsyncFunction');
    assert.equal(skill.enable, 'phaseUse');
    assert.equal(skill.usable, 1);

    function makePlayer(selected = 'normal') {
        const calls = [];
        return {
            calls,
            tempSkills: { temporary: 'phaseAfter' },
            additionalSkills: { lordBonus: ['lord'], identityBonus: 'identity' },
            getOriginalSkills: () => ['normal'],
            getSkills(hidden, equipment) {
                assert.equal(hidden, null);
                assert.equal(equipment, false);
                return ids.filter(id => id !== 'equipment').slice().reverse();
            },
            chooseControl(options) {
                calls.push(['choose', Array.from(options)]);
                const choice = {
                    set() { return choice; },
                    async forResult() { return { control: selected }; },
                };
                return choice;
            },
            removeSkill(id) { calls.push(['remove', id]); },
            logSkill(id) { calls.push(['log', id]); },
            useSkill(id) {
                calls.push(['use', id]);
                return { set() { return Promise.resolve(); } };
            },
        };
    }
    const chosen = makePlayer();
    assert.equal(skill.filter({}, chosen), true);
    await skill.content({}, null, chosen);
    assert.deepEqual(chosen.calls[0], ['choose', ['normal', 'other', 'cancel2']]);
    assert.deepEqual(chosen.calls.slice(1), [
        ['remove', 'normal'], ['log', 'tyj_huanxing'], ['use', 'tyj_bianhuan'],
    ]);
    const canceled = makePlayer('cancel2');
    await skill.content({}, null, canceled);
    assert.equal(canceled.calls.length, 1);
    const empty = makePlayer();
    empty.getSkills = () => ['tyj_bianhuan', 'tyj_huanxing', 'temporary'];
    assert.equal(skill.filter({}, empty), false);
    await skill.content({}, null, empty);
    assert.deepEqual(empty.calls, []);

    // Verify that content waits for the nested event instead of returning early.
    let finish;
    const pending = makePlayer();
    pending.useSkill = () => ({ set: () => new Promise(resolve => { finish = resolve; }) });
    let done = false;
    const task = skill.content({}, null, pending).then(() => { done = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(done, false);
    assert.equal(typeof finish, 'function');
    finish();
    await task;
    assert.equal(done, true);

    // A damage event that caused dying must not fire damageEnd a second time
    // after the dying event is rescued; dyingAfter itself fires once.
    const alive = { hp: 1, isAlive: () => true };
    const dead = { hp: 0, isAlive: () => false };
    assert.equal(bianhuan.filter({ _tyj_bianhuan_dyingHandled: true }, alive, 'damageEnd'), false);
    // The engine sets _dyinged even when a skill prevents entering dying.
    // Without an actual dying branch for this damage, the damage trigger must remain.
    assert.equal(bianhuan.filter({ _dyinged: true }, alive, 'damageEnd'), true);
    assert.equal(bianhuan.filter({}, alive, 'damageEnd'), true);
    assert.equal(bianhuan.filter({ player: alive }, alive, 'dyingAfter'), true);
    assert.equal(bianhuan.filter({ player: dead }, dead, 'dyingAfter'), false);
    assert.equal(bianhuan.filter({}, alive, 'dying'), true);

    // Execute the actual first step in a fresh function, as StepCompiler does.
    // An empty skill pool ends before UI work; it still runs the damage bookkeeping.
    const stepSource = bianhuan.content.toString().split("'step 0'")[1].split("'step 1'")[0];
    const firstStep = new Function('event', 'trigger', 'player', 'get', stepSource);
    function runFirstStep(name, trigger, player) {
        const pool = [];
        pool.remove = () => {};
        pool.randomGets = () => [];
        firstStep({ triggername: name, finish() {} }, trigger, player, { gainableSkills: () => pool });
    }

    // Replay relevant notifications with raw event names (damage/dying), keeping
    // the notification name separate in the filter's third argument.
    const rescued = { hp: 0, isAlive: () => true, getSkills: () => [] };
    const notifications = [];
    const notify = (name, event) => {
        const roles = bianhuan.trigger;
        const watches = value => (Array.isArray(value) ? value : [value]).includes(name);
        if (((event.player === rescued && watches(roles.player)) || watches(roles.global)) &&
            bianhuan.filter(event, rescued, name)) {
            notifications.push(name);
            runFirstStep(name, event, rescued);
        }
    };
    const damage = { name: 'damage', player: rescued, _dyinged: true };
    const dying = { name: 'dying', player: rescued, reason: damage };
    notify('dying', dying);
    assert.equal(damage._tyj_bianhuan_dyingHandled, true);
    rescued.hp = 1;
    notify('changeHp', { name: 'changeHp', player: rescued });
    notify('recoverEnd', { name: 'recover', player: rescued });
    notify('recoverAfter', { name: 'recover', player: rescued });
    notify('dyingAfter', dying);
    notify('damageEnd', damage);
    assert.deepEqual(notifications, ['dying', 'dyingAfter']);

    notifications.length = 0;
    notify('damageEnd', { name: 'damage', player: rescued });
    notify('dieAfter', { name: 'die', player: {} });
    assert.deepEqual(notifications, ['damageEnd', 'dieAfter']);

    // A separate later dying process remains eligible; zero HP is not a rescue.
    notifications.length = 0;
    rescued.hp = 0;
    notify('dying', { name: 'dying', player: rescued });
    notify('dyingAfter', { name: 'dying', player: rescued });
    assert.deepEqual(notifications, ['dying']);
    rescued.hp = 2;
    notify('dyingAfter', { name: 'dying', player: rescued });
    assert.deepEqual(notifications, ['dying', 'dyingAfter']);

    // Preventing dying, or damage during an existing dying process, does not
    // suppress an unrelated damage event merely because it has _dyinged.
    notifications.length = 0;
    rescued.hp = 0;
    rescued.nodying = true;
    const prevented = { name: 'damage', player: rescued, _dyinged: true };
    notify('damageEnd', prevented);
    assert.equal(prevented._tyj_bianhuan_dyingHandled, undefined);
    assert.deepEqual(notifications, ['damageEnd']);
    delete rescued.nodying;
    notify('damageEnd', { name: 'damage', player: rescued, _dyinged: true });
    assert.deepEqual(notifications, ['damageEnd', 'damageEnd']);

    // Acquiring the skill after entering dying still marks the original damage
    // when the rescue branch resolves, so damageEnd cannot repeat it.
    notifications.length = 0;
    rescued.hp = 1;
    const lateDamage = { name: 'damage', player: rescued, _dyinged: true };
    notify('dyingAfter', { name: 'dying', player: rescued, reason: lateDamage });
    notify('damageEnd', lateDamage);
    assert.deepEqual(notifications, ['dyingAfter']);
    console.log('PASS: async closure, candidate exclusions/deduplication, cancel, empty pool, nested event waiting, dying trigger deduplication');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
