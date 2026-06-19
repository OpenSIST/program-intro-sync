# Skill: OpenSIST Program Summary

## 触发条件

当用户提供 `ProgramID`（格式 `ProgramName@University`）及对应的 manifest entry 时使用本 skill。

---

## 输入格式

```
programId: MSCS@CMU
university: Carnegie Mellon University
programName: MSCS
degree: Master
opensist_description: |          # 可选：OpenSIST 社区内部描述（中文），若为 null 则忽略
  ## 项目介绍
  * ...
  ## 录取偏好/条件
  * ...
manifestEntry:
  sources:
    OpenCS:
      matched: true
      rawUrl: https://raw.githubusercontent.com/...
      htmlUrl: https://github.com/...
    GlobalCS:
      matched: false
    CSGrad:
      matched: true
      rawUrl: https://raw.githubusercontent.com/...
      htmlUrl: https://github.com/...
  sourceCount: 2
```

---

## 执行步骤

### Step 1 — 判断路径

**若 `sourceCount === 0` 且 `opensist_description` 为 null**：直接进入 **「仅官网路径」**（Step 2b）。

**若 `sourceCount >= 1` 或 `opensist_description` 非 null**：进入 **「完整路径」**（Step 2a）。

---

### Step 2a — 完整路径（有来源）

**2a-0. 读取 OpenSIST 内部描述（如有）**

若 `opensist_description` 非 null，将其作为「OpenSIST 社区内部描述」来源直接使用，无需 fetch。
此来源包含中文社区对项目的评价、录取偏好和申请注意事项，权重与 OpenCS/CSGrad 同等。
在输出中引用时标注：`[OpenSIST 社区](https://opensist.tech)`

**2a-1. 获取外部社区内容**

从 manifestEntry 中找到所有 `matched: true` 的条目，用 WebFetch 获取每个 `rawUrl`。
不需要再搜索 GitHub。直接 fetch 已知 URL。

**2a-2. 搜索官网**

用 WebSearch 搜索：`"[University] [ProgramName] master program official 2025 site:edu"`
然后 WebFetch 官方项目页，提取：
- 官网 URL
- 项目时长、学费、是否强制实习/论文
- 申请截止日期（Round 1 / Final）
- 语言要求（TOEFL/IELTS）、GRE 要求
- 推荐信数量

**2a-3. 输出完整 markdown**（见「完整输出格式」）

---

### Step 2b — 仅官网路径（无社区来源）

用 WebSearch 搜索：`"[University] [ProgramName] master program official requirements 2025"`

若搜索结果明确指向官方项目页：WebFetch 官网，输出简化版 markdown（见「简化输出格式」）。

若连官网都无法确认（搜索结果不明确、页面 404 等）：输出「失败信号」（见「失败信号格式」）。

---

## 完整输出格式

```markdown
# [ProgramName] @ [University]

> **ProgramID**: `XXX@YYY`
> **官网**: [名称](url) _(WebSearch + WebFetch，YYYY-MM-DD)_
> **生成日期**: YYYY-MM-DD
> **社区来源**: [OpenCS](htmlUrl) · [CSGrad](htmlUrl) · [OpenSIST 社区](https://opensist.tech)  _(按实际有内容的来源列）_

---

## 项目概览

| 字段 | 内容 | 来源 |
|------|------|------|
| 学位类型 | ... | 官网 |
| 项目时长 | ... | 官网 / GlobalCS |
| 授课语言 | ... | 官网 |
| 是否强制实习 | ... | GlobalCS / CSGrad |
| 是否需要论文 | ... | 官网 / OpenCS |

## 学费与奖学金

- **学费**：...（[官网](url)，YYYY 年数据）
- **奖学金**：...（官网 / GlobalCS）

## 申请要求

- **截止日期**：...（[官网](url)，⚠️ 请以最新官网为准）
- **TOEFL / IELTS**：...（[官网](url)）
- **GRE**：...（[官网](url)）
- **推荐信**：...封（[官网](url)）
- **其他**：...

## 课程与项目特色

...（[官网](url) / [OpenCS](htmlUrl)）

## 录取偏好与信号

> ⚠️ 社区经验，仅供参考

- ...（[OpenCS](htmlUrl)，数据截至 Xfall）
- ...（[CSGrad](htmlUrl)，数据截至 Xfall）

## 就业情况

...（[CSGrad](htmlUrl)）

## 网申注意事项

- ...（[官网](url)）
- ...（[OpenCS](htmlUrl)）

---

_内容综合自 OpenCS / GlobalCS / CSGrad 及官网，数据有时效性，以官网为准。生成于 YYYY-MM-DD。_
```

---

## 简化输出格式（仅官网）

```markdown
# [ProgramName] @ [University]

> **ProgramID**: `XXX@YYY`
> **官网**: [名称](url) _(WebSearch，YYYY-MM-DD)_
> **生成日期**: YYYY-MM-DD
> **注**：暂无 OpenCS / GlobalCS / CSGrad 社区数据

---

## 项目概览

| 字段 | 内容 | 来源 |
|------|------|------|
| ... | ... | 官网 |

## 学费与奖学金

...（官网）

## 申请要求

...（官网）

## 课程特色

...（官网）

---

_内容仅来自官网，数据有时效性。生成于 YYYY-MM-DD。_
```

---

## 失败信号格式

```markdown
# 匹配失败：[programId]

## 失败原因

[从以下中选择]
- **无社区来源**：三个 repo 均无匹配文件
- **官网无法确认**：搜索结果指向多个不同项目，或页面 404
- **项目代码冲突**：文件名中程序名称与 ProgramID 不一致

## 候选项（如有）

| 候选 ProgramID | 来源 | 匹配原因 | 疑点 |
|---------------|------|---------|------|
| ... | ... | ... | ... |

## 搜索尝试

- WebSearch `[搜索词]` → [结果描述]

## 建议

[具体说明，如「请确认 ProgramID 是否正确」]
```

---

## 强制约束

1. **每条信息必须注明来源 URL**，无来源的不写
2. **负样本规则**：manifest 已做了匹配过滤；若 fetch 到的内容与 programId 明显不符（标题写的是不同项目），放弃该来源并在输出中注明
3. **时效性**：注明信息对应的申请季；冲突的取最新并注明冲突
4. **无信息字段**：写 `暂无信息，建议查阅官网`，不编造
