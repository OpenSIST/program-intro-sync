# program-summary skill

批量为 OpenSIST 收录的 327 个项目生成结构化 Markdown 摘要，综合四类来源：OpenSIST 社区内部描述、OpenCS / GlobalCS / CSGrad 三个开源社区 repo、以及各项目官网。

---

## 目录结构

```
skill/program-summary/
├── skill.md                  # Agent 执行指令（输入格式、步骤、输出模板）
├── manifest.json             # 每个项目的社区 source 匹配结果（v2，agent 智能匹配）
├── manifest-v1-rule-based.json  # 备份：v1 规则匹配结果
├── file-trees.json           # 三个社区 repo 的文件列表缓存
├── program-rename-map.json   # 327 个项目的规范命名 / 去重映射
├── new-programs.json         # 社区 repo 中发现但 OpenSIST 尚未收录的 143 个新项目
├── scripts/
│   └── build-manifest.mjs   # 重新生成 manifest.json 的脚本
└── test-outputs/             # 327 个项目的生成摘要（每个 .md 对应一个 programId）
```

---

## 数据来源

| 来源 | 说明 | 文件数 |
|------|------|--------|
| [OpenCS](https://github.com/opencsapp/opencsapp.github.io) | 社区维护的项目介绍，文件名即 ProgramID | 175 |
| [GlobalCS](https://github.com/Global-CS-application/global-cs-application.github.io) | 分档位的项目信息 | 76 |
| [CSGrad](https://github.com/csms-apply/csgrad) | 数据点、录取案例、项目评价 | 83 |
| OpenSIST 社区描述 | 平台内部中文描述（项目介绍 + 录取偏好 + 注意事项） | 327（198 有实质内容） |
| 官网 | WebSearch + WebFetch 获取的官方信息 | — |

---

## Manifest 统计（v2，agent 智能匹配）

| 等级 | 条件 | 数量 |
|------|------|------|
| Rich | 2–3 个社区来源匹配 | 45 |
| Medium | 1 个社区来源匹配 | 44 |
| Thin | 无社区来源 | 238 |

OpenSIST 内部描述：198 个有实质内容，129 个为默认模板（待补充）。

---

## 生成流程

### 路径判断（`skill.md` Step 1）

- **有来源**（社区 source ≥ 1 或 OpenSIST 有实质内容）→ 完整路径：fetch 社区 rawUrl + WebSearch 官网 → 综合输出
- **无来源** → 仅官网路径：WebSearch + WebFetch 官网 → 简化输出

### 输出格式（完整路径）

每个摘要包含：项目概览表、学费与奖学金、申请要求（截止日期 / TOEFL / GRE / 推荐信）、课程与项目特色、录取偏好与信号、就业情况、网申注意事项。每条信息均标注来源链接。

---

## 重新生成

### 1. 更新 manifest

```bash
# 需要 Cloudflare wrangler 权限（读取 D1 远程数据库）
node skill/program-summary/scripts/build-manifest.mjs
```

### 2. 更新 OpenSIST 描述缓存

```python
# 见 scripts 目录，需要有效的 OpenSIST JWT cookie
# POST https://alpha.opensist.tech/api/query/program_description_batch
# 批次大小 50，结果保存为 /tmp/opensist-descriptions.json
```

### 3. 批量跑摘要（Workflow）

```
# 在 Claude Code 中启动 Workflow，306 个 agent 并行生成
# 每个 agent 读取 /tmp/programs-to-run.json[index]，写入 test-outputs/
```

---

## 附属文件说明

### `program-rename-map.json`

327 个项目的规范命名映射，格式：

```json
{
  "program_id": "MS ECE@CMU",
  "new_id": "ECE@CMU",
  "duplicate_of": null,
  "notes": "去掉冗余 MS 前缀，与社区 repo 命名对齐"
}
```

- 290 个无变化，35 个重命名，2 个重复项标记

### `new-programs.json`

社区 repo 中发现、OpenSIST 尚未收录的 143 个项目，含学校、项目名、学位、目标专业、来源链接等，可用于后续扩充 OpenSIST。

- 北美 101 个 / 欧洲 27 个 / 亚洲 13 个 / 其他 2 个

### `test-outputs/`

327 个 `.md` 文件，文件名即 `programId`（含特殊字符 `/` 的程序名用 `∕`（U+2215）替换）。生成于 2026-06-20。
