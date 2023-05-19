import esbuild from 'rollup-plugin-esbuild';
import pluginJson from '@rollup/plugin-json';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { readdirSync, lstatSync } from 'fs';

const readFolders = (path) => readdirSync(path).filter((module) => lstatSync(`${path}/${module}`).isDirectory());
const createModuleDescriptors = (folderName) =>
	readFolders(`./src/${folderName}`).map((moduleName) => {
		return {
			name: moduleName,
			root: `./src/${folderName}/${moduleName}`,
			dist: `./dist-cms/${folderName}/${moduleName}`,
		};
	});

const exclude = [''];

const libs = createModuleDescriptors('libs');
const packages = createModuleDescriptors('packages');
const apps = createModuleDescriptors('apps');

const modules = [...libs, ...apps, ...packages];
const allowedModules = modules.filter((module) => !exclude.includes(module.name));

export default allowedModules
	.map((module) => {
		/** @type {import('rollup').RollupOptions[]} */
		return [
			{
				input: `${module.root}/index.ts`,
				external: [/^@umbraco-cms\//],
				output: {
					dir: `${module.dist}`,
					format: 'es',
					preserveModules: true,
					preserveModulesRoot: `${module.root}`,
				},
				plugins: [nodeResolve(), commonjs(), pluginJson(), esbuild()],
			},
		];
	})
	.flat();
