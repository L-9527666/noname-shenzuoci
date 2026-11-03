# 测试说明

在仓库根目录使用 Node.js 执行，无需安装第三方依赖：

```sh
npm run check
npm test
```

- `check-assets.cjs`：校验版本一致性、入口引用和资源 SHA-256。
- `huanxing-runtime.cjs`：执行真实扩展工厂与技能函数，模拟候选过滤/去重、取消、无候选、嵌套事件等待及濒死获救去重。
- `lunhui-runtime.cjs`：模拟四类标签、至多三选一、取消、永久删除类别、空池及不足三项、等待授予成功和授予失败等边界。

以上不会启动手机游戏，不等同于手机实战或完整引擎测试。

## 可选：使用手机源码快照核查候选

`lunhui-phone-catalog.cjs` 保留了原有六个武将包的数据核查。手机本体源码未上传，需要自行提供与适配版本一致的只读快照：

```powershell
$env:NONAME_PHONE_SNAPSHOT = 'D:\你的只读快照目录'
npm run test:phone-catalog
```

该目录下需包含 `character/standard.js`、`character/shenhua.js`、`character/extra.js`，以及 `character/mobile/`、`character/xianding/`、`character/sp2/` 下的 `character.js`、`skill.js` 和 `translate.js`。

原始 2026-11-03 快照曾核查 617 名武将、1512 条主技能定义。这个脚本只核查加载源码中的候选标签，并模拟禁将筛选；不读取当前对局的实际启用配置。缺少外部快照时会明确提示，默认 `npm test` 不运行此项。
