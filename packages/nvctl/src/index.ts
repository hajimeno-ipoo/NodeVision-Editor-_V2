#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';

import {
  createNvctlContext,
  issueTokenAction,
  listTokensAction,
  revokeTokenAction,
  rotateTokenAction,
  setTempRootAction,
  showSettingsAction
} from './actions';

const ctx = createNvctlContext();

const handleError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red(`nvctl error: ${message}`));
  process.exitCode = 1;
};

const program = new Command();
program
  .name('nvctl')
  .description('NodeVision Editor control CLI')
  .version('0.0.1');

const token = program.command('token').description('HTTP token lifecycle');

token
  .command('issue')
  .argument('[label]', 'Token label', 'default')
  .option('-e, --expires-in <days>', 'Validity in days', '30')
  .option('-f, --force', 'Overwrite an existing token', false)
  .action(async (label: string, options: { expiresIn: string; force?: boolean }) => {
    try {
      const expiresInDays = Number(options.expiresIn ?? '30');
      const record = await issueTokenAction(
        { label, expiresInDays, force: Boolean(options.force) },
        ctx
      );
      console.log(pc.green(`Token '${label}' issued.`));
      console.log(pc.bold(record.value));
      console.log(pc.dim(`Expires at ${record.expiresAt}`));
    } catch (error) {
      handleError(error);
    }
  });

token
  .command('rotate')
  .argument('<label>', 'Token label')
  .option('-e, --expires-in <days>', 'Validity in days', '30')
  .option('-g, --grace-minutes <minutes>', 'Grace period minutes', '15')
  .action(async (label: string, options: { expiresIn: string; graceMinutes: string }) => {
    try {
      const record = await rotateTokenAction(
        {
          label,
          expiresInDays: Number(options.expiresIn ?? '30'),
          graceMinutes: Number(options.graceMinutes ?? '15')
        },
        ctx
      );
      console.log(pc.green(`Token '${label}' rotated.`));
      console.log(pc.bold(record.value));
      if (record.grace) {
        console.log(pc.yellow(`Previous token valid until ${record.grace.expiresAt}`));
      }
    } catch (error) {
      handleError(error);
    }
  });

token
  .command('revoke')
  .argument('<label>', 'Token label')
  .action(async (label: string) => {
    try {
      await revokeTokenAction(label, ctx);
      console.log(pc.yellow(`Token '${label}' revoked.`));
    } catch (error) {
      handleError(error);
    }
  });

token
  .command('list')
  .description('List stored tokens')
  .action(async () => {
    try {
      const records = await listTokensAction(ctx);
      if (!records.length) {
        console.log('No tokens found.');
        return;
      }

      for (const record of records) {
        const graceSuffix = record.grace ? ` (grace until ${record.grace.expiresAt})` : '';
        console.log(`- ${record.label}: expires ${record.expiresAt}${graceSuffix}`);
      }
    } catch (error) {
      handleError(error);
    }
  });

const settings = program.command('settings').description('Settings helpers');

settings
  .command('show')
  .description('Print the current settings JSON')
  .action(async () => {
    try {
      const data = await showSettingsAction(ctx);
      console.log(JSON.stringify(data, null, 2));
    } catch (error) {
      handleError(error);
    }
  });

settings
  .command('temp-root')
  .argument('<path>', 'Absolute or relative tempRoot path')
  .action(async (targetPath: string) => {
    try {
      const updated = await setTempRootAction(targetPath, ctx);
      console.log(pc.green(`tempRoot updated to ${updated.tempRoot}`));
    } catch (error) {
      handleError(error);
    }
  });

program.parseAsync(process.argv).catch(handleError);
