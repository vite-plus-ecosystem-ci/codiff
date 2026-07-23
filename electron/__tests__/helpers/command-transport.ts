import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

export type FakeCommandProcess = {
  args: ReadonlyArray<string>;
  close: (code?: number, signal?: NodeJS.Signals | null) => void;
  command: string;
  error: (error: Error) => void;
  options: SpawnOptions;
  process: ChildProcess;
  stderr: (value: string) => void;
  stdin: PassThrough;
  stdout: (value: string) => void;
};

export const createCommandTransport = (onSpawn: (commandProcess: FakeCommandProcess) => void) => {
  const calls: Array<FakeCommandProcess> = [];
  const spawn = (command: string, args: ReadonlyArray<string> = [], options: SpawnOptions = {}) => {
    const process = new EventEmitter() as ChildProcess;
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(process, {
      killed: false,
      kill: () => {
        process.killed = true;
        return true;
      },
      stderr,
      stdin,
      stdout,
    });
    const commandProcess: FakeCommandProcess = {
      args,
      close: (code = 0, signal = null) => process.emit('close', code, signal),
      command,
      error: (error) => process.emit('error', error),
      options,
      process,
      stderr: (value) => stderr.write(value),
      stdin,
      stdout: (value) => stdout.write(value),
    };
    calls.push(commandProcess);
    onSpawn(commandProcess);
    return process;
  };

  return {
    calls,
    transport: {
      command: 'provider-test-command',
      spawn: spawn as typeof import('node:child_process').spawn,
    },
  };
};
