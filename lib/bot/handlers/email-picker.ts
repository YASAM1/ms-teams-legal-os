import { MessageFactory } from 'botbuilder';
import { registerAction } from '@/lib/bot/actions';
import { buildDraftReplyPreviewCard } from '@/lib/bot/cards';
import { runDraftReplyPipeline } from '@/lib/email/draft-pipeline';
import { summarizeThread, formatThreadSummaryMarkdown } from '@/lib/email/summarize-thread';

type DraftConfirmPayload = {
  kind: 'email.draft.confirm';
  message_id?: string;
  attorneyDirective?: string;
};

type SummarizeConfirmPayload = {
  kind: 'email.summarize.confirm';
  message_id?: string;
};

registerAction('email.picker.cancel', async () => 'Cancelled. Run the slash command again with a different description.');

registerAction('email.draft.confirm', async (context, payload, userId) => {
  const p = payload as DraftConfirmPayload;
  if (!p.message_id) return 'No message selected. Try again.';

  await context.sendActivity({ type: 'typing' });

  const result = await runDraftReplyPipeline({
    userId,
    messageId: p.message_id,
    attorneyDirective: p.attorneyDirective?.trim() || undefined,
  });

  await context.sendActivity(
    MessageFactory.attachment(
      buildDraftReplyPreviewCard({
        matterDisplayName: result.matterDisplayName,
        tone: result.tone,
        subject: result.subject,
        body: result.body,
        citedFacts: result.citedFacts,
        uncertainties: result.uncertainties,
        validationWarnings: result.validationWarnings,
        outlookDraftUrl: result.outlookDraftUrl,
      }),
    ),
  );
  return;
});

registerAction('email.summarize.confirm', async (context, payload, userId) => {
  const p = payload as SummarizeConfirmPayload;
  if (!p.message_id) return 'No message selected. Try again.';

  await context.sendActivity({ type: 'typing' });

  const result = await summarizeThread(userId, p.message_id);
  await context.sendActivity(formatThreadSummaryMarkdown(result));
  return;
});
