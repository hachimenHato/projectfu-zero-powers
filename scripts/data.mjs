export const CONDITIONS = Object.freeze([
  {
    id: "compassion",
    name: "怜悯",
    increment: 1,
    automation: "native-resource",
    description: "该条件会在你为一名或多名盟友恢复生命值和/或精神值时触发。该条件仅在效果能够自主恢复生命值或精神值时触发，不包括那些仅提升恢复量的效果。",
  },
  {
    id: "disdain",
    name: "傲视",
    increment: 1,
    automation: "turn-start",
    description: "在冲突场景中你的回合开始时，如果有至少一个反派或大将级敌人位于该场景内，这项条件便会触发。",
  },
  {
    id: "love",
    name: "爱恋",
    increment: 1,
    automation: "damage-linked",
    description: "选择此条件时，将它与你所爱的人（另一位玩家角色）绑定。当对方因非自身原因失去生命值或放弃抵抗时触发，前提是你能看见对方。若对方牺牲而你亲眼见证，零界命刻立即填满；当前场景结束时另选一项条件。",
  },
  {
    id: "revenge",
    name: "复仇",
    increment: 3,
    automation: "crisis",
    description: "当你在一个场景中首次进入危机状态时，这项条件便会触发。",
  },
  {
    id: "chain",
    name: "连锁",
    increment: 2,
    automation: "zero-release",
    description: "这项条件会在一位能被你看见的盟友释放零界效果时触发。",
  },
  {
    id: "strategy",
    name: "策略",
    increment: 1,
    automation: "turn-end",
    description: "在冲突场景中你的回合结束时，如果场景中存在一名或多名敌人，且他们总共受到两种或以上的不同异常状态影响，这项条件便会触发。",
  },
  {
    id: "synergy",
    name: "协同",
    increment: 1,
    variable: true,
    automation: "vulnerability-damage",
    description: "当你对一个或多个生物造成伤害时触发；这些生物中每有一个对本次伤害具有弱点相性的生物，零界命刻便填充1格。",
  },
]);

export const EFFECTS = Object.freeze([
  {
    id: "strike",
    name: "零界闪击",
    namingStyle: "offensive",
    automation: "native-weapon-buttons",
    description: "你执行一次顺势攻击，使用你装备的每件武器进行攻击。若只装备一件武器，该攻击造成20点额外伤害；若装备超过一件武器，此次顺势攻击中的每次命中检定获得+5修正值。",
  },
  {
    id: "opportunity",
    name: "零界机遇",
    namingStyle: "offensive",
    automation: "roll-and-actions",
    description: "选择奇数或偶数，投掷3d6并统计符合预测的骰数；可以触发对应结果或相符数量更低的一项效果。零个相符：自身命刻+3，其他可见玩家角色各+1，并额外行动。一个相符：以一件已装备武器顺势攻击，额外伤害等于3d6总值。两个相符：对一个可见生物造成【30+等级的一半+3d6总值】无类型伤害。三个相符：自身及所有可见盟友解除全部异常状态，并恢复【危机值+3d6总值】HP与MP。三骰相同还可额外行动。",
  },
  {
    id: "consumption",
    name: "零界消耗",
    namingStyle: "enhancement",
    automation: "scene-flag",
    description: "直到当前场景结束，你的所有物资点消耗视为减半。你还可以立即执行一次类型为消耗物资的顺势行动。",
  },
  {
    id: "element",
    name: "零界元素",
    namingStyle: "enhancement",
    configurable: "twoDamageTypes",
    automation: "damage-hook",
    description: "创建时从风、雷、暗、土、火、冰、光、毒中选择两种伤害类型。你造成的所有伤害变为其中一种，无视吸收、免疫与抵抗，并造成5点额外伤害。效果持续至场景结束、再次释放或主动结束；本回合还可额外行动。",
  },
  {
    id: "limit",
    name: "零界极限",
    namingStyle: "enhancement",
    automation: "active-effect",
    description: "直到当前场景结束，你的所有属性骰等级视为比原本高一级，最多提升至d12。你还可以额外执行一次行动。",
  },
  {
    id: "magic",
    name: "零界魔法",
    namingStyle: "offensive",
    automation: "native-spell-buttons",
    description: "你执行一次施法顺势行动，施放一个已知法术。该法术的精神值总消耗视为0（包括技能和效果增加的消耗），造成10点额外伤害；若为攻击性法术，施法检定获得+5修正值。",
  },
  {
    id: "objective",
    name: "零界目标",
    namingStyle: "defensive",
    automation: "combat-clock",
    description: "选择一项：使一个与本场景关联的命刻填充3格；或使一个与本场景关联的命刻擦除3格。",
  },
  {
    id: "healing",
    name: "零界疗愈",
    namingStyle: "defensive",
    automation: "targeted-recovery",
    description: "你和你能看见的任意数量盟友解除所有异常状态，并恢复等同于【40+你的等级的一半】的生命值。",
  },
  {
    id: "calamity",
    name: "零界灾厄",
    namingStyle: "offensive",
    configurable: "calamity",
    automation: "targeted-damage-status",
    description: "创建时从风、雷、暗、土、火、冰、光、毒中选择一种伤害类型，再从眩晕、动摇、迟缓、虚弱中选择两种异常状态。选择任意数量可见生物：每个目标受到【30+你的等级的一半】所选类型伤害，并承受所选异常状态。",
  },
  {
    id: "shield",
    name: "零界护盾",
    namingStyle: "defensive",
    automation: "damage-halving",
    description: "在你的下个回合开始前，你和所有位于本场景的盟友受到的所有伤害都减半，先于相性生效。",
  },
  {
    id: "triangle",
    name: "零界铁三角",
    namingStyle: "offensive",
    automation: "native-weapon-buttons",
    description: "你和至多两位可见盟友分别使用正装备的一件武器执行一次顺势攻击；NPC盟友改为执行基础攻击。这些攻击的命中检定获得+5修正值。",
  },
]);

export const ACTION_NAMES = Object.freeze({
  offensive: ["噬咬", "刃击", "吐息", "弹幕", "锁链", "爪击", "舞踏", "爆裂", "獠牙", "连击", "怒视", "冲击", "震击", "涡流", "拳击", "斩击", "枪刺", "毒刺", "风暴", "蜂拥"],
  defensive: ["屏障", "壁垒", "覆罩", "法阵", "图纹", "环抱", "方阵", "堡垒", "守护", "援手", "祈请", "迷雾", "罗网", "反射", "环绕", "护盾", "符文", "颂歌", "螺旋", "帷幕"],
  enhancement: ["光环", "觉醒", "祝福", "绽放", "呼吸", "斗篷", "优雅", "本能", "轻吻", "解放", "冥想", "奇迹", "道途", "祷言", "秘传", "传说", "触碰", "幻视", "誓约", "轮转"],
});

export const ORIGIN_NAMES = Object.freeze({
  warfare: { name: "战争之道", entries: ["灵巧", "爆裂", "钢铁", "圣盾", "尘沙", "领主", "军团", "老兵", "皇家", "君权"] },
  beasts: { name: "野兽与怪物", entries: ["鸦羽", "巨龙", "蜻蜓", "鹰隼", "狡狐", "灵猴", "凤凰", "巨蛇", "泰坦", "恶狼"] },
  nature: { name: "自然元素", entries: ["静电", "寒霜", "炽火", "晨露", "骤雨", "虹彩", "震地", "涡旋", "雷鸣", "和风"] },
  inner: { name: "内在力量", entries: ["先祖", "终末", "柔和", "孤绝", "碎心", "记忆", "漫游", "狂怒", "灵性", "超音"] },
  sacred: { name: "神圣与亵渎", entries: ["天使", "祝圣", "魔性", "神性", "永恒", "墓穴", "地狱", "崩毁", "辉光", "幽魂"] },
  mystery: { name: "神秘之物", entries: ["幸运女士", "混沌", "寰宇", "梦境", "缥缈", "隐秘", "月华", "苍白", "棱彩", "猩红"] },
});

export function conditionById(id) {
  return CONDITIONS.find((entry) => entry.id === id) ?? null;
}

export function effectById(id) {
  return EFFECTS.find((entry) => entry.id === id) ?? null;
}

export function randomZeroPowerName(effectId, random = Math.random) {
  const effect = effectById(effectId);
  const style = effect?.namingStyle ?? "offensive";
  const actions = ACTION_NAMES[style];
  const origins = Object.values(ORIGIN_NAMES).flatMap((group) => group.entries);
  const origin = origins[Math.floor(random() * origins.length)];
  const action = actions[Math.floor(random() * actions.length)];
  return `${origin}${action}`;
}
