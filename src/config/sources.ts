import type {SourceConfig} from "../types";

export const SOURCE_CONFIGS: SourceConfig[] = [
  {
    name: "OpenCS",
    type: "github_repo",
    owner: "opencsapp",
    repo: "opencsapp.github.io",
    repoUrl: "https://github.com/opencsapp/opencsapp.github.io",
    branch: "master",
    licenseLabel: "CC BY-NC-SA 4.0",
    contentRoots: ["docs"],
    excludePathParts: ["assets", "overrides", "site", ".github"],
  },
  {
    name: "GlobalCS",
    type: "github_repo",
    owner: "Global-CS-application",
    repo: "global-cs-application.github.io",
    repoUrl: "https://github.com/Global-CS-application/global-cs-application.github.io",
    branch: "main",
    licenseLabel: "CHECK_SOURCE_LICENSE",
    contentRoots: ["docs"],
    excludePathParts: ["assets", "overrides", "site", ".idea"],
  },
  {
    name: "CSGrad",
    type: "github_repo",
    owner: "csms-apply",
    repo: "csgrad",
    repoUrl: "https://github.com/csms-apply/csgrad",
    branch: "main",
    licenseLabel: "CHECK_SOURCE_LICENSE",
    contentRoots: ["docs", "content", "src/pages"],
    excludePathParts: ["node_modules", ".next", ".docusaurus", "build", "static", ".github"],
  },
];
