#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __reExport = (target, module2, copyDefault, desc) => {
  if (module2 && typeof module2 === "object" || typeof module2 === "function") {
    for (let key of __getOwnPropNames(module2))
      if (!__hasOwnProp.call(target, key) && (copyDefault || key !== "default"))
        __defProp(target, key, { get: () => module2[key], enumerable: !(desc = __getOwnPropDesc(module2, key)) || desc.enumerable });
  }
  return target;
};
var __toESM = (module2, isNodeMode) => {
  return __reExport(__markAsModule(__defProp(module2 != null ? __create(__getProtoOf(module2)) : {}, "default", !isNodeMode && module2 && module2.__esModule ? { get: () => module2.default, enumerable: true } : { value: module2, enumerable: true })), module2);
};

// cli.ts
var import_meow = __toESM(require("meow"));
var import_chokidar = __toESM(require("chokidar"));
var dependencyTree = require("dependency-tree");
var { resolve, join } = require("path");
var { readdir, writeFile } = require("fs").promises;
var { ensureFile } = require("fs-extra");
var projectRoot = process.env.REMIX_ROOT || process.cwd();
var remixConfig = require(`${projectRoot}/remix.config.js`);
if (!remixConfig) {
  console.error("Cannot find remix.config.js. Check that this is a Remix.run project.");
  process.exit(1);
}
var OUTDIR = ".generated-css-links";
var helpText = `
Usage
$ remix-generate-css-links
Options
--watch, -w  Watch for routes changes
--outdir -o Provide <remix's appDirectory>/<output directory name> for directory to output links files (default ${OUTDIR})
`;
var cli = (0, import_meow.default)(helpText, {
  flags: {
    watch: {
      type: "boolean",
      alias: "w"
    },
    outdir: {
      type: "string",
      alias: "o"
    }
  }
});
if (typeof cli.flags.outdir === "string" && cli.flags.outdir.length)
  OUTDIR = cli.flags.outdir;
var remixAppDirectory = remixConfig.appDirectory || "app";
var appdir = `${projectRoot}/${remixAppDirectory}`;
var appdirLength = appdir.length;
var allStyleLinksInOneFile = async (filepath) => {
  const reducedList = [];
  dependencyTree.toList({
    filename: `${appdir}/${filepath}`,
    directory: `${appdir}/`,
    tsConfig: `${projectRoot}/tsconfig.json`,
    filter: (path) => path.indexOf("node_modules") === -1 && path.indexOf(OUTDIR) === -1
  }).forEach((path) => {
    const pathCheck = path.substring(0, appdirLength);
    if (pathCheck === appdir && path.split(".").slice(-1)[0] === "css") {
      reducedList.push(`~${path.substring(appdirLength)}`);
    }
  });
  let data = `import type { HtmlLinkDescriptor } from "remix";
${reducedList.map((path, index) => `import _${index} from "${path}";`).join("\n")}

export const links = () => {
  const htmlLinkDescriptors: HtmlLinkDescriptor[] = [
    ${reducedList.map((path, index) => {
    return `{ rel: "stylesheet", href: _${index} }`;
  }).join(",\n    ")}
  ]
  return htmlLinkDescriptors
}

interface UniqueLinksHrefMap { [id: HtmlLinkDescriptor["href"]]: HtmlLinkDescriptor; }

export const mergeOtherLinks = (_links: HtmlLinkDescriptor[]) => {
  const uniqueLinksHrefMap: UniqueLinksHrefMap = {}
  _links.forEach(link => uniqueLinksHrefMap[link.href] = link)
  return _links.concat(links().filter(link => !uniqueLinksHrefMap[link.href]))
}
`;
  const generatedFileTarget = `${appdir}/${OUTDIR}/${filepath.split(".").slice(0, -1).join(".")}.generated-links.ts`;
  await ensureFile(generatedFileTarget);
  await writeFile(generatedFileTarget, data);
};
async function processFileTree(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const subDirs = [];
  await Promise.all(dirents.filter((dirent) => {
    if (dirent.isDirectory())
      subDirs.push(dirent);
    else
      return true;
  }).map(async (dirent) => {
    const fullPath = await resolve(dir, dirent.name);
    const pathFromAppDirectory = fullPath.substring(appdirLength + 1);
    return await allStyleLinksInOneFile(pathFromAppDirectory);
  }));
  await Promise.all(subDirs.map(async (dirent) => await processFileTree(await resolve(dir, dirent.name))));
}
var debounce = (callback, wait) => {
  let timeout = null;
  return (...args) => {
    const next = () => callback(...args);
    clearTimeout(timeout);
    timeout = setTimeout(next, wait);
  };
};
var build = async () => {
  const appRootfilename = require.resolve(resolve(appdir, "root.tsx")).substring(appdirLength + 1);
  await allStyleLinksInOneFile(appRootfilename);
  await processFileTree(`${appdir}/routes`);
};
var debouncedBuild = debounce(build, 200);
function watch() {
  debouncedBuild();
  const projectRoutes = join(appdir, "routes/**/*.{js,jsx,ts,tsx}");
  const projectConfig = join(`${projectRoot}`, "remix.config.js");
  import_chokidar.default.watch([projectRoutes, projectConfig]).on("change", () => {
    debouncedBuild();
  });
  console.log(`Watching for changes in your app routes...`);
}
if (require.main === module) {
  (async function() {
    await (cli.flags.watch ? watch : debouncedBuild)();
  })();
}
