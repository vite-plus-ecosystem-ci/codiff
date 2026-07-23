// @ts-check

const { spawn } = require('node:child_process');

/**
 * @typedef {{
 *   command?: string;
 *   spawn?: typeof spawn;
 * }} AgentCommandTransport
 */

/**
 * @param {AgentCommandTransport | undefined} transport
 * @param {() => string} getCommand
 */
const resolveAgentCommandTransport = (transport, getCommand) => ({
  command: transport?.command || getCommand(),
  spawn: transport?.spawn || spawn,
});

module.exports = { resolveAgentCommandTransport };
