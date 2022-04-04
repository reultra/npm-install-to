/* eslint-disable no-await-in-loop, no-restricted-syntax */
const fs = require('fs/promises');
const { join, relative, dirname } = require('path');
const process = require('process');
const Arborist = require('@npmcli/arborist');
const packlist = require('npm-packlist');

const copyPacklist = async (from, to) => {
  const list = await packlist({ path: from });
  for (const file of list) {
    if (!file.startsWith('node_modules/')) {
      await fs.cp(join(from, file), join(to, file), {
        recursive: true,
        errorOnExist: false,
      });
    }
  }
};

const relativeSymlink = async (target, path) => {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.symlink(`./${relative(dirname(path), target)}`, path);
};

const installTo = async (destination, options = {}) => {
  const { source = process.cwd(), root = source, omit = new Set() } = options;
  const tree = await new Arborist({ path: root }).loadActual();
  const destinations = new Map();
  for (const edge of tree.edgesOut.values()) {
    if (edge.workspace && source === edge.to.realpath) {
      const to = join(destination, edge.to.location);
      destinations.set(edge.to, to);
    }
  }
  for (const [node, dest] of destinations) {
    if (!node.dev) {
      if (node.isLink && node.target) {
        const targetPath = destinations.get(node.target);
        if (targetPath == null) destinations.set(node.target, dest);
        else await relativeSymlink(targetPath, dest);
      } else {
        if (node.isWorkspace || node.isRoot) {
          await copyPacklist(node.target.realpath, dest);
        } else {
          const nm = join(node.realpath, 'node_modules');
          await fs.cp(node.realpath, dest, {
            recursive: true,
            errorOnExist: false,
            filter: (src) => src !== nm,
          });
        }
        for (const edge of node.edgesOut.values()) {
          if (!omit.has(edge.type) && edge.to != null) {
            destinations.set(
              edge.to,
              join(
                destinations.get(edge.to.parent) || destination,
                relative(edge.to.parent.location, edge.to.location)
              )
            );
          }
        }
      }
    }
  }
};

module.exports = installTo;
