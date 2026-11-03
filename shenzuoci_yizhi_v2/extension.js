import { lib, game, ui, get, ai, _status } from '../../noname.js';

export const type = 'extension';

// 从“汤圆精品包”移植的神左慈。
// 保留旧版 tyj_* ID，方便技能、语音和头像路径互相对应。
export default function () {
            // Async Content 可以访问扩展工厂的闭包；候选计算供 filter 和幻形共同使用。
            const getHuanxingCandidates = function (player) {
                var excluded = new Set(['tyj_bianhuan', 'tyj_huanxing', 'tyj_bianhuan_flash']);
                var tempSkills = player.tempSkills || {};
                for (var tempSkill in tempSkills) excluded.add(tempSkill);
                var additionalSkills = player.additionalSkills || {};
                for (var source in additionalSkills) {
                    var list = additionalSkills[source];
                    if (Array.isArray(list)) {
                        for (var skill of list) {
                            if (skill) excluded.add(skill);
                        }
                    } else if (typeof list === 'string' && list) {
                        excluded.add(list);
                    }
                }
                var originalSkills = new Set(typeof player.getOriginalSkills === 'function' ? player.getOriginalSkills() : []);
                var translations = new Set();
                var skills = player.getSkills(null, false).filter(function (skill) {
                    if (excluded.has(skill)) return false;
                    var info = get.info(skill);
                    if (!info || info.hiddenSkill || !lib.translate[skill]) return false;
                    return !info.temp && !info.sub && !info.charlotte && !info.unique;
                });
                skills.sort(function (a, b) {
                    return (originalSkills.has(b) ? 1 : 0) - (originalSkills.has(a) ? 1 : 0);
                });
                return skills.filter(function (skill) {
                    var translation = lib.translate[skill];
                    if (translations.has(translation)) return false;
                    translations.add(translation);
                    return true;
                });
            };
            const lunhuiOptions = [
                { tag: 'juexingji', control: 'tyj_lunhui_juexingji', name: '觉醒技' },
                { tag: 'dutySkill', control: 'tyj_lunhui_dutySkill', name: '使命技' },
                { tag: 'limited', control: 'tyj_lunhui_limited', name: '限定技' },
                { tag: 'zhuSkill', control: 'tyj_lunhui_zhuSkill', name: '主公技' },
            ];
            const getLunhuiPools = function (player) {
                const pools = { juexingji: [], dutySkill: [], limited: [], zhuSkill: [] };
                const owned = new Set(player.getSkills(true, true, false));
                for (const field of ['skills', 'hiddenSkills', 'invisibleSkills', 'awakenedSkills']) {
                    for (const skill of player[field] || []) owned.add(skill);
                }
                const seen = new Set();
                // gainableSkills 会调用 skillDisabled，连同 unique 技能一起过滤。
                // 轮回要获取这些特殊类型，所以只复用其武将池，按类型另建技能池。
                const characters = get.gainableCharacters(function (info) {
                    return !info.isBoss && !info.isHiddenBoss && !info.isMinskin && !info.isUnseen;
                });
                for (const character of characters) {
                    const data = lib.character[character];
                    for (const skill of data.skills || data[3] || []) {
                        if (seen.has(skill) || owned.has(skill)) continue;
                        seen.add(skill);
                        const info = lib.skill[skill];
                        if (!info || info.sub || info.charlotte || info.temp || info.hiddenSkill ||
                            info.equipSkill || info.fixed || info.vanish ||
                            !lib.translate[skill] || !lib.translate[skill + '_info']) continue;
                        if (info.ai && info.ai.combo) {
                            const combo = Array.isArray(info.ai.combo) ? info.ai.combo : [info.ai.combo];
                            if (!combo.every(function (id) { return player.hasSkill(id, null, null, false); })) continue;
                        }
                        for (const option of lunhuiOptions) {
                            if (info[option.tag]) pools[option.tag].push(skill);
                        }
                    }
                }
                return pools;
            };
            const pack = {
                name: 'shenzuoci_yizhi_v2',
                connect: true,
                character: {
                    tyj_zuoci: ['male', 'shen', 4, ['tyj_bianhuan', 'tyj_lunhui'], ['ext:shenzuoci_yizhi_v2/character/tyj_zuoci.jpg']],
                    tyj_zuoci_gai: ['male', 'shen', 4, ['tyj_bianhuan', 'tyj_huanxing', 'tyj_lunhui'], ['ext:shenzuoci_yizhi_v2/character/tyj_zuoci.jpg']],
                },
                characterFilter: {
                    tyj_zuoci: function (mode) {
                        return mode !== 'guozhan';
                    },
                    tyj_zuoci_gai: function (mode) {
                        return mode !== 'guozhan';
                    },
                },
                characterIntro: {
                    tyj_zuoci: '神左慈，原“汤圆精品包”武将，额外拥有〖轮回〗。',
                    tyj_zuoci_gai: '神左慈改，在神左慈的基础上增加了〖幻形〗，并拥有〖轮回〗。',
                },
                characterTitle: {
                    tyj_zuoci: '#r全扩最强方差将',
                    tyj_zuoci_gai: '#r全扩最强方差将·改',
                },
                skill: {
                    tyj_bianhuan: {
                        trigger: {
                            player: ['damageEnd', 'dying', 'dyingAfter'],
                            global: 'dieAfter',
                        },
                        group: ['tyj_xingsheng', 'tyj_bianhuan_flash'],
                        // 不指定技能子目录；引擎会按当前技能名拼接 tyj_bianhuan1.mp3 至 tyj_bianhuan4.mp3。
                        audio: 'ext:shenzuoci_yizhi_v2/audio/skill:4',
                        forced: true,
                        filter: function (event, player, triggerName) {
                            // 只跳过已经由本技能濒死分支处理过的原伤害。
                            // 本体的 _dyinged 在尝试进入濒死前设置，不能用它判断是否实际触发过。
                            if (triggerName === 'damageEnd' && event._tyj_bianhuan_dyingHandled) return false;
                            // dyingAfter 只有在角色存活且体力已经恢复到 1 点以上时才算脱离濒死。
                            if (triggerName === 'dyingAfter') {
                                return event.player === player && player.isAlive() && player.hp > 0;
                            }
                            return true;
                        },
                        content: function () {
                            'step 0'
                            if ((event.triggername === 'dying' || event.triggername === 'dyingAfter') &&
                                trigger && trigger.reason && trigger.reason.name === 'damage' && trigger.reason.player === player) {
                                trigger.reason._tyj_bianhuan_dyingHandled = true;
                            }
                            var list = get.gainableSkills();
                            list.remove(player.getSkills());
                            list = list.randomGets(3);
                            event.skillai = function () {
                                return get.max(list, get.skillRank, 'item');
                            };
                            if (!list.length) {
                                event.finish();
                                return;
                            }
                            if (event.isMine()) {
                                var dialog = ui.create.dialog('forcebutton');
                                dialog.add('选择获得一项技能');
                                var clickItem = function () {
                                    _status.event._result = this.link;
                                    dialog.close();
                                    game.resume();
                                };
                                for (var i = 0; i < list.length; i++) {
                                    if (lib.translate[list[i] + '_info']) {
                                        var translation = get.translation(list[i]);
                                        if (translation[0] === '新' && translation.length === 3) {
                                            translation = translation.slice(1, 3);
                                        } else {
                                            translation = translation.slice(0, 2);
                                        }
                                        var item = dialog.add('<div class="popup pointerdiv" style="width:80%;display:inline-block"><div class="skill">【' +
                                            translation + '】</div><div>' + lib.translate[list[i] + '_info'] + '</div></div>');
                                        item.firstChild.addEventListener('click', clickItem);
                                        item.firstChild.link = list[i];
                                    }
                                }
                                dialog.add(ui.create.div('.placeholder'));
                                event.switchToAuto = function () {
                                    event._result = event.skillai();
                                    dialog.close();
                                    game.resume();
                                };
                                _status.imchoosing = true;
                                game.pause();
                            } else {
                                event._result = event.skillai();
                            }
                            'step 1'
                            _status.imchoosing = false;
                            var link = result;
                            if (!link) {
                                event.finish();
                                return;
                            }
                            player.addSkill(link, true);
                            player.popup(link);
                            player.flashAvatar('tyj_bianhuan', link);
                            if (!player.storage.tyj_huashen_gained) {
                                player.storage.tyj_huashen_gained = [];
                            }
                            player.storage.tyj_huashen_gained.push(link);
                            game.log(player, '获得了技能', '【' + get.translation(link) + '】');
                            game.delay();
                        },
                        subSkill: {
                            flash: {
                                trigger: { player: ['logSkill', 'useSkillBegin'] },
                                logSkill: 'tyj_bianhuan',
                                audio: 'tyj_bianhuan',
                                direct: true,
                                charlotte: true,
                                filter: function (event, player) {
                                    if (!player.storage.tyj_huashen_gained || !player.storage.tyj_huashen_gained.length) return false;
                                    var skill = event.sourceSkill || event.skill;
                                    var list = player.storage.tyj_huashen_gained.slice(0);
                                    game.expandSkills(list);
                                    for (var i of list) {
                                        if (i === skill || i + '_backup' === skill) return true;
                                    }
                                    return false;
                                },
                                content: function () {
                                    event.skillx = trigger.sourceSkill || trigger.skill;
                                    for (var i of player.storage.tyj_huashen_gained) {
                                        var info = get.info(i);
                                        if (i === event.skillx || i + '_backup' === event.skillx ||
                                            (info.group && typeof info.group === 'string' && (info.group + '_backup' === event.skillx || info.group === event.skillx)) ||
                                            (info.sourceSkill && (info.sourceSkill === event.skillx || info.sourceSkill + '_backup' === event.skillx))) {
                                            player.flashAvatar('tyj_bianhuan', i);
                                        }
                                        if (info.group && Array.isArray(info.group)) {
                                            for (var j of info.group) {
                                                if (j === event.skillx || j + '_backup' === event.skillx) player.flashAvatar('tyj_bianhuan', i);
                                            }
                                        }
                                    }
                                },
                            },
                        },
                        ai: {
                            threaten: 6.8,
                            maixie: true,
                            maixie_hp: true,
                        },
                    },
                    tyj_huanxing: {
                        enable: 'phaseUse',
                        usable: 1,
                        filter: function (event, player) {
                            return getHuanxingCandidates(player).length > 0;
                        },
                        content: async function (event, trigger, player) {
                            var skills = getHuanxingCandidates(player);
                            if (!skills.length) {
                                return;
                            }
                            skills.push('cancel2');
                            var result = await player.chooseControl(skills).set('prompt', '幻形：选择失去一个技能，或取消').set('ai', function () {
                                return 'cancel2';
                            }).forResult();
                            if (!result || result.control === 'cancel2') return;
                            player.removeSkill(result.control);
                            player.logSkill('tyj_huanxing');
                            await player.useSkill('tyj_bianhuan').set('forceDie', true);
                        },
                    },
                    tyj_lunhui: {
                        trigger: { global: 'roundStart' },
                        direct: true,
                        round: 1,
                        init: function (player) {
                            // 删除记录持续整局，失去后重新获得轮回也不刷新。
                            if (!Array.isArray(player.storage.tyj_lunhui)) player.storage.tyj_lunhui = [];
                        },
                        filter: function (event, player) {
                            const used = player.storage.tyj_lunhui || [];
                            if (used.length >= lunhuiOptions.length) return false;
                            const pools = getLunhuiPools(player);
                            return lunhuiOptions.some(function (option) {
                                return !used.includes(option.tag) && pools[option.tag].length > 0;
                            });
                        },
                        content: async function (event, trigger, player) {
                            const used = player.storage.tyj_lunhui || [];
                            const pools = getLunhuiPools(player);
                            const available = lunhuiOptions.filter(function (option) {
                                return !used.includes(option.tag) && pools[option.tag].length > 0;
                            });
                            if (!available.length) return;
                            const choice = await player.chooseControl(available.map(function (option) {
                                return option.control;
                            }).concat('cancel2')).set('prompt', '轮回：选择一项，或取消本轮发动')
                                .set('choiceList', available.map(function (option) {
                                    return (lunhuiOptions.indexOf(option) + 1) + '.随机获得一个' + option.name;
                                })).set('displayIndex', false).set('ai', function () { return 0; }).forResult();
                            const option = choice && available.find(function (item) { return item.control === choice.control; });
                            if (!option) return;
                            const candidates = pools[option.tag].randomGets(3);
                            const result = await player.chooseControl(candidates)
                                .set('prompt', '轮回：选择获得一个' + option.name)
                                .set('choiceList', candidates.map(function (skill) {
                                    return '【' + get.translation(skill) + '】' + get.skillInfoTranslation(skill, player);
                                })).set('displayIndex', false).set('ai', function () {
                                    const controls = _status.event.controls;
                                    return controls.reduce(function (best, skill) {
                                        return get.skillRank(skill, 'in') > get.skillRank(best, 'in') ? skill : best;
                                    }, controls[0]);
                                }).forResult();
                            if (!result || !candidates.includes(result.control)) return;
                            // 选择期间可能发生其他结算；只在技能仍可获得时执行和删除。
                            if (!getLunhuiPools(player)[option.tag].includes(result.control) ||
                                (player.storage.tyj_lunhui || []).includes(option.tag)) return;
                            player.logSkill('tyj_lunhui');
                            await player.addSkills(result.control);
                            player.markAuto('tyj_lunhui', [option.tag]);
                            player.syncStorage('tyj_lunhui');
                            game.log(player, '删除了〖轮回〗的', '#y' + option.name, '选项');
                        },
                        mark: true,
                        marktext: '轮',
                        intro: {
                            markcount: function (storage) { return lunhuiOptions.length - (storage || []).length; },
                            content: function (storage) {
                                const remaining = lunhuiOptions.filter(function (option) {
                                    return !(storage || []).includes(option.tag);
                                }).map(function (option) { return option.name; });
                                return remaining.length ? '未删除选项：' + remaining.join('、') : '全部选项均已删除';
                            },
                        },
                    },
                    tyj_xingsheng: {
                        trigger: {
                            global: 'phaseBefore',
                            player: 'enterGame',
                        },
                        logSkill: 'tyj_bianhuan',
                        popup: false,
                        filter: function (event) {
                            return event.name !== 'phase' || game.phaseNumber === 0;
                        },
                        content: function () {
                            player.logSkill('tyj_bianhuan', player);
                            player.damage(1, 'thunder');
                            player.recover();
                        },
                    },
                },
                translate: {
                    tyj_zuoci: '神左慈',
                    tyj_zuoci_gai: '神左慈改',
                    tyj_zuoci_ab: '左慈',
                    tyj_zuoci_character: '神左慈',
                    tyj_bianhuan: '变幻',
                    tyj_bianhuan_info: '①锁定技，你受到未令你进入濒死的伤害后、进入濒死时、脱离濒死状态后或场上角色死亡后，你随机列出三个已开启的技能并选择其中一个获得。②游戏开始时，你可受到一点雷电伤害然后回复一点体力。',
                    tyj_xingsheng: '新生',
                    tyj_xingsheng_info: '游戏开始时，你可以受到一点雷电伤害然后回复一点体力。',
                    tyj_huanxing: '幻形',
                    tyj_huanxing_info: '出牌阶段限一次，你可以选择一个技能失去并发动一次〖变幻〗。',
                    tyj_lunhui: '轮回',
                    tyj_lunhui_info: '每轮游戏开始时，你可以选择以下一项执行，然后删除此项：1.随机获得一个觉醒技；2.随机获得一个使命技；3.随机获得一个限定技；4.随机获得一个主公技。',
                    tyj_lunhui_juexingji: '觉醒技',
                    tyj_lunhui_dutySkill: '使命技',
                    tyj_lunhui_limited: '限定技',
                    tyj_lunhui_zhuSkill: '主公技',
                },
            };
    return {
        name: 'shenzuoci_yizhi_v2',
        content: function () {},
        precontent: function () {
            // 新框架不会仅因 game.import('character') 自动启用角色包；
            // 将本扩展加入可选武将包列表，否则扩展虽显示为已开启，选将界面仍找不到神左慈。
            var packName = 'shenzuoci_yizhi_v2';
            if (lib.config.characters && !lib.config.characters.includes(packName)) {
                lib.config.characters.push(packName);
                game.saveConfig('characters', lib.config.characters);
            }
            if (lib.config.all && lib.config.all.characters && !lib.config.all.characters.includes(packName)) {
                lib.config.all.characters.push(packName);
                game.saveConfig('connect_characters', lib.config.all.characters);
            }
            lib.translate[packName] = '神左慈移植';
            lib.translate['extension_' + packName] = '神左慈移植';
            lib.translate[packName + '_character_config'] = '神左慈移植';
        },
        package: {
            character: {
                character: pack.character,
                characterFilter: pack.characterFilter,
                characterIntro: pack.characterIntro,
                characterTitle: pack.characterTitle,
                translate: pack.translate,
                connect: true,
            },
            skill: {
                skill: pack.skill,
                translate: pack.translate,
                connect: true,
            },
            intro: '神左慈与神左慈改均新增轮回；保留变幻、幻形、头像和四段技能语音。',
            author: '移植自汤圆精品包',
            diskURL: '',
            forumURL: '',
            version: '1.1.0',
        },
        // 新版资源约定：audio 指向 skill 目录时，引擎按技能名查找编号文件。
        files: {
            character: [],
            card: [],
            skill: [],
            audio: ['skill/tyj_bianhuan1.mp3', 'skill/tyj_bianhuan2.mp3', 'skill/tyj_bianhuan3.mp3', 'skill/tyj_bianhuan4.mp3'],
        },
    };
}
