import { CardFactory, type Attachment } from 'botbuilder';

const ADAPTIVE_CARD_VERSION = '1.5';

// ─── Email triage card ──────────────────────────────────────────────────────

type EmailCardInput = {
  importance: 'urgent' | 'actionable' | 'informational' | 'noise';
  subject: string;
  fromAddress: string;
  receivedAt: Date;
  summary: string;
  actionItems: string[];
  matterDisplayName: string | null;
  matterConfidencePct: number | null;
  outlookWebLink?: string | null;
};

const COLOR_BY_IMPORTANCE: Record<EmailCardInput['importance'], string> = {
  urgent: 'attention',
  actionable: 'warning',
  informational: 'good',
  noise: 'default',
};

const LABEL_BY_IMPORTANCE: Record<EmailCardInput['importance'], string> = {
  urgent: '🔴 URGENT',
  actionable: '🟡 ACTIONABLE',
  informational: '🟢 FYI',
  noise: '⚪ NOISE',
};

export function buildEmailTriageCard(input: EmailCardInput): Attachment {
  const matterFact = input.matterDisplayName
    ? [
        {
          title: 'Matter',
          value:
            input.matterConfidencePct != null
              ? `${input.matterDisplayName} (${input.matterConfidencePct}%)`
              : input.matterDisplayName,
        },
      ]
    : [];

  const actions: Array<{ type: string; title: string; url?: string; data?: Record<string, unknown> }> = [];
  if (input.outlookWebLink) {
    actions.push({ type: 'Action.OpenUrl', title: 'Open in Outlook', url: input.outlookWebLink });
  }
  actions.push({
    type: 'Action.Submit',
    title: 'Draft reply',
    data: { kind: 'email.draft_reply', subject: input.subject, fromAddress: input.fromAddress },
  });

  const card = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body: [
      {
        type: 'TextBlock',
        text: LABEL_BY_IMPORTANCE[input.importance],
        weight: 'Bolder',
        size: 'Small',
        color: COLOR_BY_IMPORTANCE[input.importance],
        wrap: true,
      },
      {
        type: 'TextBlock',
        text: input.subject || '(no subject)',
        weight: 'Bolder',
        size: 'Medium',
        wrap: true,
      },
      {
        type: 'TextBlock',
        text: `from ${input.fromAddress} · ${input.receivedAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
        isSubtle: true,
        size: 'Small',
        wrap: true,
      },
      ...(matterFact.length
        ? [
            {
              type: 'FactSet',
              facts: matterFact,
            },
          ]
        : []),
      {
        type: 'TextBlock',
        text: input.summary,
        wrap: true,
        spacing: 'Medium',
      },
      ...(input.actionItems.length
        ? [
            {
              type: 'TextBlock',
              text: 'Action items',
              weight: 'Bolder',
              spacing: 'Medium',
            },
            {
              type: 'Container',
              items: input.actionItems.map((item) => ({
                type: 'TextBlock',
                text: `• ${item}`,
                wrap: true,
                spacing: 'None',
              })),
            },
          ]
        : []),
    ],
    actions,
  };

  return CardFactory.adaptiveCard(card);
}

// ─── Clio note approval card ────────────────────────────────────────────────

type NoteCardInput = {
  proposalId: string;
  matterDisplayName: string;
  matterClientName: string | null;
  matterConfidencePct: number | null;
  proposedNote: string;
  sourceLabel: string; // e.g. "from email: Re: deposition prep — 2026-05-25"
  alternateMatters?: Array<{ matterId: string; displayName: string; clientName: string | null; confidencePct: number }>;
};

export function buildNoteApprovalCard(input: NoteCardInput): Attachment {
  const facts = [
    {
      title: 'Matter',
      value: input.matterConfidencePct != null
        ? `${input.matterDisplayName} (${input.matterConfidencePct}%)`
        : input.matterDisplayName,
    },
  ];
  if (input.matterClientName) {
    facts.push({ title: 'Client', value: input.matterClientName });
  }

  const altChoices = input.alternateMatters?.map((m) => ({
    title: `${m.displayName} — ${m.clientName ?? '(no client)'} (${m.confidencePct}%)`,
    value: m.matterId,
  })) ?? [];

  const card = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body: [
      {
        type: 'TextBlock',
        text: '📝 Note proposal',
        weight: 'Bolder',
        size: 'Small',
        color: 'accent',
      },
      {
        type: 'FactSet',
        facts,
      },
      {
        type: 'TextBlock',
        text: input.sourceLabel,
        isSubtle: true,
        size: 'Small',
        wrap: true,
      },
      ...(altChoices.length > 0
        ? [
            {
              type: 'Input.ChoiceSet',
              id: 'matter_override',
              label: 'Wrong matter? Pick another:',
              isMultiSelect: false,
              choices: altChoices,
              value: '',
            },
          ]
        : []),
      {
        type: 'Input.Text',
        id: 'note_body',
        label: 'Note',
        isMultiline: true,
        value: input.proposedNote,
        maxLength: 4000,
      },
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: 'Approve & save to Clio',
        style: 'positive',
        data: { kind: 'clio.note.approve', proposalId: input.proposalId },
      },
      {
        type: 'Action.Submit',
        title: 'Reject',
        style: 'destructive',
        data: { kind: 'clio.note.reject', proposalId: input.proposalId },
      },
    ],
  };

  return CardFactory.adaptiveCard(card);
}

// ─── Confirmation card (after Clio write succeeded) ─────────────────────────

// ─── Intake (new matter) approval card ──────────────────────────────────────

type IntakeCardInput = {
  proposalId: string;
  proposal: {
    client: {
      firstName: string;
      lastName: string;
      primaryEmail?: string;
      primaryPhone?: string;
      isExisting: boolean;
    };
    matter: {
      description: string;
      practiceArea: string;
      accidentDate?: string;
      incidentLocation?: string;
      injuriesOrDamages?: string;
      opposingParties?: string[];
    };
    notes: string;
    confidence: number;
  };
};

const PRACTICE_AREAS = [
  'Motor Vehicle Accident',
  'Workers Compensation',
  'Premises Liability',
  'Medical Malpractice',
  'Animal Attack',
  'Employment',
  'Other Civil Litigation',
];

export function buildIntakeApprovalCard(input: IntakeCardInput): Attachment {
  const { proposal, proposalId } = input;
  const confidencePct = Math.round(proposal.confidence * 100);
  const confidenceFlag = proposal.confidence >= 0.8 ? '✅' : proposal.confidence >= 0.6 ? '🟡' : '⚠️';

  const card = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body: [
      {
        type: 'TextBlock',
        text: `🧾 New matter intake  ${confidenceFlag} ${confidencePct}% extraction confidence`,
        weight: 'Bolder',
        wrap: true,
      },
      { type: 'TextBlock', text: 'Client', weight: 'Bolder', spacing: 'Medium' },
      {
        type: 'ColumnSet',
        columns: [
          {
            type: 'Column',
            width: 'stretch',
            items: [{ type: 'Input.Text', id: 'client_first_name', label: 'First name', value: proposal.client.firstName, isRequired: true }],
          },
          {
            type: 'Column',
            width: 'stretch',
            items: [{ type: 'Input.Text', id: 'client_last_name', label: 'Last name', value: proposal.client.lastName, isRequired: true }],
          },
        ],
      },
      { type: 'Input.Text', id: 'client_email', label: 'Email', value: proposal.client.primaryEmail ?? '', style: 'Email' },
      { type: 'Input.Text', id: 'client_phone', label: 'Phone', value: proposal.client.primaryPhone ?? '', style: 'Tel' },
      {
        type: 'Input.Toggle',
        id: 'client_is_existing',
        title: 'Existing client in Clio (do not create a new contact)',
        value: proposal.client.isExisting ? 'true' : 'false',
        valueOn: 'true',
        valueOff: 'false',
      },
      { type: 'TextBlock', text: 'Matter', weight: 'Bolder', spacing: 'Medium' },
      { type: 'Input.Text', id: 'matter_description', label: 'Description', value: proposal.matter.description, isRequired: true, isMultiline: true },
      {
        type: 'Input.ChoiceSet',
        id: 'matter_practice_area',
        label: 'Practice area',
        value: proposal.matter.practiceArea,
        choices: PRACTICE_AREAS.map((p) => ({ title: p, value: p })),
        isRequired: true,
      },
      { type: 'Input.Text', id: 'matter_accident_date', label: 'Accident date (YYYY-MM-DD)', value: proposal.matter.accidentDate ?? '' },
      { type: 'Input.Text', id: 'matter_location', label: 'Incident location', value: proposal.matter.incidentLocation ?? '' },
      { type: 'Input.Text', id: 'matter_injuries', label: 'Injuries / damages', value: proposal.matter.injuriesOrDamages ?? '', isMultiline: true },
      { type: 'Input.Text', id: 'matter_opposing_parties', label: 'Opposing parties (comma-separated)', value: (proposal.matter.opposingParties ?? []).join(', ') },
      { type: 'Input.Text', id: 'intake_notes', label: 'Intake note', value: proposal.notes, isMultiline: true },
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: 'Approve & create in Clio',
        style: 'positive',
        data: { kind: 'clio.intake.approve', proposalId },
      },
      {
        type: 'Action.Submit',
        title: 'Reject',
        style: 'destructive',
        data: { kind: 'clio.intake.reject', proposalId },
      },
    ],
  };
  return CardFactory.adaptiveCard(card);
}

export function buildIntakeConfirmationCard(input: {
  clientName: string;
  matterDisplayName: string;
  matterClioId: string;
  clioMatterUrl: string;
  noteCreatedUrl?: string | null;
}): Attachment {
  const actions: Array<{ type: string; title: string; url: string }> = [
    { type: 'Action.OpenUrl', title: 'Open matter in Clio', url: input.clioMatterUrl },
  ];
  if (input.noteCreatedUrl) {
    actions.push({ type: 'Action.OpenUrl', title: 'Open intake note', url: input.noteCreatedUrl });
  }
  const card = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body: [
      { type: 'TextBlock', text: '✅ Matter created in Clio', weight: 'Bolder', color: 'good' },
      { type: 'FactSet', facts: [
        { title: 'Client', value: input.clientName },
        { title: 'Matter', value: input.matterDisplayName },
        { title: 'Clio matter id', value: input.matterClioId },
      ]},
    ],
    actions,
  };
  return CardFactory.adaptiveCard(card);
}

// ─── New outbound email preview card ────────────────────────────────────────

export function buildNewEmailPreviewCard(input: {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  uncertainties: string[];
  outlookDraftUrl: string;
}): Attachment {
  const facts: Array<{ title: string; value: string }> = [{ title: 'To', value: input.to.join(', ') }];
  if (input.cc && input.cc.length > 0) facts.push({ title: 'Cc', value: input.cc.join(', ') });

  const body: Array<Record<string, unknown>> = [
    { type: 'TextBlock', text: '✉️ New draft saved to Outlook', weight: 'Bolder', color: 'good' },
    { type: 'FactSet', facts },
    { type: 'TextBlock', text: input.subject, weight: 'Bolder', wrap: true, spacing: 'Medium' },
    { type: 'TextBlock', text: input.body, wrap: true, spacing: 'Small' },
  ];

  if (input.uncertainties.length > 0) {
    body.push(
      { type: 'TextBlock', text: '⚠️ Confirm before sending', weight: 'Bolder', color: 'warning', spacing: 'Medium', size: 'Small' },
      {
        type: 'Container',
        items: input.uncertainties.map((u) => ({ type: 'TextBlock', text: `• ${u}`, wrap: true, spacing: 'None', size: 'Small' })),
      },
    );
  }

  const card = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body,
    actions: [{ type: 'Action.OpenUrl', title: 'Open in Outlook', url: input.outlookDraftUrl }],
  };
  return CardFactory.adaptiveCard(card);
}

// ─── Message picker / confirmation card ─────────────────────────────────────

type MessagePickerInput = {
  query: string;
  /** Intent of the follow-up action — drives which handler kind we submit. */
  intent: 'draft' | 'summarize';
  /** Optional attorney directive to forward (draft-reply only). */
  attorneyDirective?: string;
  candidates: Array<{
    messageId: string;
    receivedAt: string;
    subject: string;
    fromName: string;
    fromAddress: string;
    bodyPreview: string;
    relevance: number;
    reasoning: string;
  }>;
};

const INTENT_LABEL: Record<MessagePickerInput['intent'], string> = {
  draft: 'Draft a reply',
  summarize: 'Summarize thread',
};

export function buildMessagePickerCard(input: MessagePickerInput): Attachment {
  const choices = input.candidates.map((c) => {
    const date = new Date(c.receivedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const pct = Math.round(c.relevance * 100);
    return {
      title: `[${pct}%] ${c.subject} — from ${c.fromName} (${date})`,
      value: c.messageId,
    };
  });

  const previewBlocks = input.candidates.slice(0, 3).map((c, i) => {
    const pct = Math.round(c.relevance * 100);
    const flag = c.relevance >= 0.85 ? '✅' : c.relevance >= 0.6 ? '🟡' : '⚠️';
    return {
      type: 'Container',
      separator: i > 0,
      items: [
        { type: 'TextBlock', text: `${flag} ${pct}% — ${c.subject}`, weight: 'Bolder', wrap: true, size: 'Small' },
        { type: 'TextBlock', text: `from ${c.fromName} <${c.fromAddress}> · ${c.receivedAt}`, isSubtle: true, size: 'Small', wrap: true },
        { type: 'TextBlock', text: c.reasoning, isSubtle: true, size: 'Small', wrap: true },
      ],
    };
  });

  const card = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body: [
      { type: 'TextBlock', text: `📬 Which message did you mean?`, weight: 'Bolder' },
      { type: 'TextBlock', text: `Query: "${input.query}"`, isSubtle: true, size: 'Small', wrap: true },
      ...previewBlocks,
      {
        type: 'Input.ChoiceSet',
        id: 'message_id',
        label: 'Confirm selection',
        isRequired: true,
        choices,
        value: input.candidates[0]?.messageId ?? '',
      },
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: INTENT_LABEL[input.intent],
        style: 'positive',
        data: {
          kind: input.intent === 'draft' ? 'email.draft.confirm' : 'email.summarize.confirm',
          attorneyDirective: input.attorneyDirective ?? '',
        },
      },
      {
        type: 'Action.Submit',
        title: 'Cancel',
        data: { kind: 'email.picker.cancel' },
      },
    ],
  };
  return CardFactory.adaptiveCard(card);
}

// ─── Draft reply preview card ────────────────────────────────────────────────

type DraftReplyCardInput = {
  matterDisplayName: string | null;
  tone: 'cordial' | 'firm' | 'urgent' | 'sympathetic';
  subject: string;
  body: string;
  citedFacts: string[];
  uncertainties: string[];
  validationWarnings: string[];
  outlookDraftUrl: string;
};

const TONE_COLOR: Record<DraftReplyCardInput['tone'], string> = {
  cordial: 'good',
  firm: 'warning',
  urgent: 'attention',
  sympathetic: 'accent',
};

export function buildDraftReplyPreviewCard(input: DraftReplyCardInput): Attachment {
  const facts: Array<{ title: string; value: string }> = [{ title: 'Tone', value: input.tone }];
  if (input.matterDisplayName) facts.unshift({ title: 'Matter', value: input.matterDisplayName });

  const body: Array<Record<string, unknown>> = [
    { type: 'TextBlock', text: '✉️ Draft saved to Outlook', weight: 'Bolder', color: TONE_COLOR[input.tone] },
    { type: 'FactSet', facts },
    { type: 'TextBlock', text: input.subject, weight: 'Bolder', wrap: true, spacing: 'Medium' },
    { type: 'TextBlock', text: input.body, wrap: true, spacing: 'Small' },
  ];

  if (input.citedFacts.length > 0) {
    body.push(
      { type: 'TextBlock', text: 'Cited facts', weight: 'Bolder', spacing: 'Medium', size: 'Small' },
      {
        type: 'Container',
        items: input.citedFacts.map((f) => ({
          type: 'TextBlock',
          text: `• ${f}`,
          wrap: true,
          spacing: 'None',
          size: 'Small',
          isSubtle: true,
        })),
      },
    );
  }

  if (input.uncertainties.length > 0) {
    body.push(
      { type: 'TextBlock', text: '⚠️ Open questions for attorney', weight: 'Bolder', color: 'warning', spacing: 'Medium', size: 'Small' },
      {
        type: 'Container',
        items: input.uncertainties.map((u) => ({
          type: 'TextBlock',
          text: `• ${u}`,
          wrap: true,
          spacing: 'None',
          size: 'Small',
        })),
      },
    );
  }

  if (input.validationWarnings.length > 0) {
    body.push(
      { type: 'TextBlock', text: '🚨 Validation warnings', weight: 'Bolder', color: 'attention', spacing: 'Medium', size: 'Small' },
      {
        type: 'Container',
        items: input.validationWarnings.map((w) => ({
          type: 'TextBlock',
          text: `• ${w}`,
          wrap: true,
          spacing: 'None',
          size: 'Small',
        })),
      },
    );
  }

  const card = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body,
    actions: [
      { type: 'Action.OpenUrl', title: 'Open in Outlook', url: input.outlookDraftUrl },
    ],
  };
  return CardFactory.adaptiveCard(card);
}

export function buildNoteConfirmationCard(input: {
  matterDisplayName: string;
  clioNoteUrl?: string | null;
  noteBodyPreview: string;
}): Attachment {
  const actions = input.clioNoteUrl
    ? [{ type: 'Action.OpenUrl', title: 'Open in Clio', url: input.clioNoteUrl }]
    : [];

  const card = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body: [
      {
        type: 'TextBlock',
        text: '✅ Note saved to Clio',
        weight: 'Bolder',
        color: 'good',
        wrap: true,
      },
      {
        type: 'TextBlock',
        text: input.matterDisplayName,
        isSubtle: true,
        size: 'Small',
        wrap: true,
      },
      {
        type: 'TextBlock',
        text: input.noteBodyPreview,
        wrap: true,
        spacing: 'Medium',
      },
    ],
    actions,
  };

  return CardFactory.adaptiveCard(card);
}
