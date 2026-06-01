import { eq } from 'drizzle-orm';
import { ActivityTypes, type TurnContext } from 'botbuilder';
import { db, schema } from '@/db';
import { logger, type AppLogger } from '@/lib/logger';
import { findMatter, CONFIDENCE } from '@/lib/clio/find-matter';
import { loadNegativeAliasesForQuery } from '@/lib/clio/aliases';
import { chatReply } from '@/lib/bot/chat';
import { captureConversationReference } from '@/lib/bot/conversation-refs';
import { MessageFactory } from 'botbuilder';
import { dispatchCardAction } from '@/lib/bot/actions';
import { summarizeThread, formatThreadSummaryMarkdown } from '@/lib/email/summarize-thread';
import { extractIntake } from '@/lib/clio/intake';
import { createProposal } from '@/lib/proposals';
import { buildIntakeApprovalCard, buildDraftReplyPreviewCard, buildMessagePickerCard, buildNewEmailPreviewCard } from '@/lib/bot/cards';
import { runDraftReplyPipeline } from '@/lib/email/draft-pipeline';
import { findMessageByNaturalQuery } from '@/lib/email/message-finder';
import { generateAndSaveNewDraft } from '@/lib/email/draft-new';
import { buildToday, formatTodayMarkdown } from '@/lib/today/digest';
import '@/lib/bot/handlers/clio-note';
import '@/lib/bot/handlers/intake';
import '@/lib/bot/handlers/email-picker';

export async function handleTurn(context: TurnContext): Promise<void> {
  const log = logger.child({
    activityType: context.activity.type,
    userAadObjectId: context.activity.from?.aadObjectId,
    channelId: context.activity.channelId,
  });

  // Capture/refresh the conversation reference on every turn so proactive
  // messages (3.10 email cards, daily digests, etc.) can find the user later.
  try {
    await captureConversationReference(context);
  } catch (err) {
    log.warn({ err }, 'conversation reference capture failed (non-fatal)');
  }

  switch (context.activity.type) {
    case ActivityTypes.Message:
      await handleMessage(context, log);
      break;

    case ActivityTypes.ConversationUpdate:
      await handleConversationUpdate(context, log);
      break;

    case ActivityTypes.Invoke:
      await handleInvoke(context, log);
      break;

    default:
      log.debug('unhandled activity type');
  }
}

async function handleMessage(context: TurnContext, log: AppLogger) {
  const text = (context.activity.text ?? '').trim();
  log.info({ textLength: text.length }, 'received message');

  // Adaptive Card Action.Submit arrives as a Message with `value` populated
  // (and usually no text). Route to the action dispatcher first.
  const cardValue = context.activity.value as Record<string, unknown> | undefined;
  if (cardValue && typeof cardValue === 'object' && typeof cardValue.kind === 'string') {
    const aadObjectId = context.activity.from?.aadObjectId;
    const user = aadObjectId
      ? await db.query.users.findFirst({ where: eq(schema.users.entraOid, aadObjectId) })
      : null;
    if (!user) {
      await context.sendActivity('Your firm user record was not found. Sign in to `/admin` once and try again.');
      return;
    }
    const result = await dispatchCardAction(context, cardValue, user.id);
    if (result.reply) await context.sendActivity(result.reply);
    return;
  }

  if (!text) {
    await context.sendActivity('I need some text to work with — say something or use a slash command.');
    return;
  }

  if (text.toLowerCase() === 'ping') {
    await context.sendActivity('pong');
    return;
  }

  if (text.startsWith('/')) {
    await routeSlashCommand(context, text, log);
    return;
  }

  await context.sendActivities([{ type: ActivityTypes.Typing }]);
  try {
    const reply = await chatReply(text);
    await context.sendActivity(reply);
  } catch (err) {
    log.error({ err }, 'chat fallback failed');
    await context.sendActivity(
      `Model call failed — ${err instanceof Error ? err.message : 'unknown error'}. The error has been logged.`,
    );
  }
}

async function routeSlashCommand(context: TurnContext, text: string, log: AppLogger) {
  const trimmed = text.slice(1).trim();
  const spaceIdx = trimmed.indexOf(' ');
  const command = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  log.info({ command, hasArgs: args.length > 0 }, 'slash command received');

  switch (command) {
    case 'find-matter':
      await handleFindMatter(context, args, log);
      return;
    case 'summarize-thread':
      await handleSummarizeThread(context, args, log);
      return;
    case 'intake':
      await handleIntake(context, args, log);
      return;
    case 'draft-reply':
      await handleDraftReply(context, args, log);
      return;
    case 'draft-new':
      await handleDraftNew(context, args, log);
      return;
    case 'today':
      await handleToday(context, log);
      return;
    default:
      await context.sendActivity(
        `Unknown command \`${command}\`. Try \`/find-matter <query>\`, \`/summarize-thread\`, \`/draft-reply\`, or \`/today\`.`,
      );
  }
}

async function handleFindMatter(context: TurnContext, query: string, log: AppLogger) {
  if (!query) {
    await context.sendActivity('Usage: `/find-matter <client name, matter description, or excerpt>`');
    return;
  }

  await context.sendActivities([
    { type: ActivityTypes.Typing },
  ]);

  try {
    const negatives = await loadNegativeAliasesForQuery(query);
    const resolution = await findMatter(query, { learnedNegatives: negatives });

    if (resolution.decision === 'no_candidates') {
      await context.sendActivity(`No matters matched "${query}". Try a different query.`);
      return;
    }

    const top = resolution.candidates.slice(0, 3);
    const lines = [
      `**Matter resolution — ${resolution.decision.replace(/_/g, ' ')}**`,
      '',
      ...top.map((c, i) => {
        const pct = Math.round(c.finalConfidence * 100);
        const flag =
          c.finalConfidence >= CONFIDENCE.AUTO_ATTACH
            ? '✅'
            : c.finalConfidence >= CONFIDENCE.HITL_CONFIRM
              ? '🟡'
              : '⚠️';
        return `${i + 1}. ${flag} **${c.displayName}** — ${c.clientName ?? 'no client'} (${pct}%)  \n   _${c.llmReasoning}_`;
      }),
    ];
    await context.sendActivity(lines.join('\n'));
  } catch (err) {
    log.error({ err }, 'find-matter command failed');
    await context.sendActivity(
      `find-matter failed — ${err instanceof Error ? err.message : 'unknown error'}. Check that Clio sync has run and embeddings exist.`,
    );
  }
}

async function handleDraftReply(context: TurnContext, args: string, log: AppLogger) {
  if (!args) {
    await context.sendActivity(
      'Usage: `/draft-reply <description of the email> [-- <directive>]` — e.g. `/draft-reply latest from State Farm about the Rodriguez claim -- decline politely`',
    );
    return;
  }

  // Split off optional directive: "<description> -- decline politely"
  const dashIdx = args.indexOf('--');
  const description = (dashIdx === -1 ? args : args.slice(0, dashIdx)).trim();
  const attorneyDirective = dashIdx === -1 ? undefined : args.slice(dashIdx + 2).trim() || undefined;

  const user = await resolveBotUser(context);
  if (!user) return;

  // Shortcut: if the description looks like a Graph message id, skip search.
  if (/^AAMk[A-Za-z0-9_\-=]{40,}$/.test(description)) {
    await runDirectDraftReply(context, log, user.id, description, attorneyDirective);
    return;
  }

  await context.sendActivities([{ type: ActivityTypes.Typing }]);
  try {
    const candidates = await findMessageByNaturalQuery(user.id, description, { limit: 5 });
    if (candidates.length === 0) {
      await context.sendActivity(`No inbox messages matched "${description}". Try a different description.`);
      return;
    }
    const card = buildMessagePickerCard({
      query: description,
      intent: 'draft',
      attorneyDirective,
      candidates,
    });
    await context.sendActivity(MessageFactory.attachment(card));
  } catch (err) {
    log.error({ err, description: description.slice(0, 80) }, 'message-finder failed');
    await context.sendActivity(
      `Search failed — ${err instanceof Error ? err.message : 'unknown error'}. Try again or paste a message id.`,
    );
  }
}

async function handleDraftNew(context: TurnContext, description: string, log: AppLogger) {
  if (!description) {
    await context.sendActivity(
      'Usage: `/draft-new <description>` — e.g. `/draft-new casual note to James Smith at jsmith@gmail.com saying it was great seeing him today`',
    );
    return;
  }

  const user = await resolveBotUser(context);
  if (!user) return;

  await context.sendActivities([{ type: ActivityTypes.Typing }]);
  try {
    const result = await generateAndSaveNewDraft(user.id, { description });
    const card = buildNewEmailPreviewCard({
      to: result.draft.toAddresses,
      cc: result.draft.ccAddresses,
      subject: result.draft.subject,
      body: result.draft.body,
      uncertainties: result.draft.uncertainties,
      outlookDraftUrl: result.outlookDraftUrl,
    });
    await context.sendActivity(MessageFactory.attachment(card));
  } catch (err) {
    log.error({ err }, 'draft-new pipeline failed');
    await context.sendActivity(
      `Draft generation failed — ${err instanceof Error ? err.message : 'unknown error'}.`,
    );
  }
}

async function runDirectDraftReply(
  context: TurnContext,
  log: AppLogger,
  userId: string,
  messageId: string,
  attorneyDirective: string | undefined,
) {
  await context.sendActivities([{ type: ActivityTypes.Typing }]);
  try {
    const result = await runDraftReplyPipeline({ userId, messageId, attorneyDirective });
    const card = buildDraftReplyPreviewCard({
      matterDisplayName: result.matterDisplayName,
      tone: result.tone,
      subject: result.subject,
      body: result.body,
      citedFacts: result.citedFacts,
      uncertainties: result.uncertainties,
      validationWarnings: result.validationWarnings,
      outlookDraftUrl: result.outlookDraftUrl,
    });
    await context.sendActivity(MessageFactory.attachment(card));
  } catch (err) {
    log.error({ err, messageId: messageId.slice(0, 32) }, 'draft-reply pipeline failed');
    await context.sendActivity(
      `Draft generation failed — ${err instanceof Error ? err.message : 'unknown error'}.`,
    );
  }
}

async function resolveBotUser(context: TurnContext) {
  const aadObjectId = context.activity.from?.aadObjectId;
  if (!aadObjectId) {
    await context.sendActivity('I cannot identify you. Sign in once at `/admin` and try again.');
    return null;
  }
  const user = await db.query.users.findFirst({
    where: eq(schema.users.entraOid, aadObjectId),
  });
  if (!user) {
    await context.sendActivity('Your firm user record was not found. Sign in to `/admin` once and try again.');
    return null;
  }
  return user;
}

async function handleIntake(context: TurnContext, description: string, log: AppLogger) {
  if (!description || description.length < 20) {
    await context.sendActivity(
      'Usage: `/intake <free-form description>` — describe the new client + matter in a sentence or two and I will extract the fields for your approval.',
    );
    return;
  }

  const aadObjectId = context.activity.from?.aadObjectId;
  if (!aadObjectId) {
    await context.sendActivity('I cannot identify you. Sign in once at `/admin` and try again.');
    return;
  }
  const user = await db.query.users.findFirst({
    where: eq(schema.users.entraOid, aadObjectId),
  });
  if (!user) {
    await context.sendActivity('Your firm user record was not found. Sign in to `/admin` once and try again.');
    return;
  }

  await context.sendActivities([{ type: ActivityTypes.Typing }]);

  try {
    const result = await extractIntake({ freeText: description });
    const proposal = await createProposal({
      userId: user.id,
      type: 'clio_note', // 'intake' would require a schema enum change; we use 'clio_note' as a stand-in and store the kind in payload
      matterId: null,
      payload: { intakeKind: 'matter_create', intake: result.proposal, originalDescription: description },
    });

    const card = buildIntakeApprovalCard({ proposalId: proposal.id, proposal: result.proposal });
    await context.sendActivity(MessageFactory.attachment(card));
  } catch (err) {
    log.error({ err }, 'intake extraction failed');
    await context.sendActivity(
      `Intake extraction failed — ${err instanceof Error ? err.message : 'unknown error'}.`,
    );
  }
}

async function handleSummarizeThread(context: TurnContext, identifier: string, log: AppLogger) {
  if (!identifier) {
    await context.sendActivity(
      'Usage: `/summarize-thread <description>` — e.g. `/summarize-thread last week\'s back-and-forth with opposing counsel on the Hill matter`',
    );
    return;
  }

  const user = await resolveBotUser(context);
  if (!user) return;

  // Shortcut: Graph message id or RFC 2822 internet-message id → skip search.
  const looksLikeGraphId = /^AAMk[A-Za-z0-9_\-=]{40,}$/.test(identifier);
  const looksLikeInternetMessageId = /^<?[^@\s]+@[^>\s]+>?$/.test(identifier);
  if (looksLikeGraphId || looksLikeInternetMessageId) {
    await context.sendActivities([{ type: ActivityTypes.Typing }]);
    try {
      const result = await summarizeThread(user.id, identifier);
      await context.sendActivity(formatThreadSummaryMarkdown(result));
    } catch (err) {
      log.error({ err, identifier: identifier.slice(0, 32) }, 'summarize-thread failed');
      await context.sendActivity(
        `summarize-thread failed — ${err instanceof Error ? err.message : 'unknown error'}.`,
      );
    }
    return;
  }

  await context.sendActivities([{ type: ActivityTypes.Typing }]);
  try {
    const candidates = await findMessageByNaturalQuery(user.id, identifier, { limit: 5 });
    if (candidates.length === 0) {
      await context.sendActivity(`No inbox messages matched "${identifier}". Try a different description.`);
      return;
    }
    const card = buildMessagePickerCard({
      query: identifier,
      intent: 'summarize',
      candidates,
    });
    await context.sendActivity(MessageFactory.attachment(card));
  } catch (err) {
    log.error({ err, identifier: identifier.slice(0, 80) }, 'message-finder failed');
    await context.sendActivity(
      `Search failed — ${err instanceof Error ? err.message : 'unknown error'}.`,
    );
  }
}

async function handleToday(context: TurnContext, log: AppLogger) {
  const user = await resolveBotUser(context);
  if (!user) return;

  await context.sendActivities([{ type: ActivityTypes.Typing }]);
  try {
    const result = await buildToday(user.id);
    await context.sendActivity(formatTodayMarkdown(result));
  } catch (err) {
    log.error({ err }, 'today digest failed');
    await context.sendActivity(
      `Couldn't build your daily plan — ${err instanceof Error ? err.message : 'unknown error'}. The error has been logged.`,
    );
  }
}

async function handleConversationUpdate(context: TurnContext, log: AppLogger) {
  const added = context.activity.membersAdded ?? [];
  const botId = context.activity.recipient?.id;
  for (const member of added) {
    if (member.id !== botId) {
      log.info({ memberId: member.id }, 'new member added to conversation');
      await context.sendActivity("Hey — I'm the legal ops agent. Type `ping` to test, or run a slash command.");
    }
  }
}

async function handleInvoke(_context: TurnContext, log: AppLogger) {
  log.info('invoke activity received (adaptive card action — handler TBD)');
}
