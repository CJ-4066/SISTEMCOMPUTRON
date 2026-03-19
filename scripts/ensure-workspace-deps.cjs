#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const workspaces = [
  { name: "root", dir: repoRoot, installArgs: ["install"] },
  {
    name: "backend",
    dir: path.join(repoRoot, "backend"),
    installArgs: ["install", "--prefix", "backend"],
  },
  {
    name: "frontend",
    dir: path.join(repoRoot, "frontend"),
    installArgs: ["install", "--prefix", "frontend"],
  },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function dependencyPackagePath(workspaceDir, dependencyName) {
  return path.join(
    workspaceDir,
    "node_modules",
    ...dependencyName.split("/"),
    "package.json",
  );
}

function findMissingDirectDependencies(workspaceDir) {
  const packageJsonPath = path.join(workspaceDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return [];
  }

  const packageJson = readJson(packageJsonPath);
  const directDependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };

  return Object.keys(directDependencies).filter(
    (dependencyName) =>
      !fs.existsSync(dependencyPackagePath(workspaceDir, dependencyName)),
  );
}

function installWorkspaceDependencies(workspace) {
  console.log(
    `[deps] Faltan dependencias en ${workspace.name}. Ejecutando: ${npmCommand} ${workspace.installArgs.join(" ")}`,
  );

  const result = spawnSync(npmCommand, workspace.installArgs, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

for (const workspace of workspaces) {
  const missingDependencies = findMissingDirectDependencies(workspace.dir);

  if (missingDependencies.length === 0) {
    continue;
  }

  console.log(
    `[deps] ${workspace.name}: faltan ${missingDependencies.join(", ")}`,
  );
  installWorkspaceDependencies(workspace);
}
