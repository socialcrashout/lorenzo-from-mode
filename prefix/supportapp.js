// prefix/supportapp.js
// Drop in your /prefix folder. Your loader picks it up automatically via
// { name, execute }. No changes to index.js needed.

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  Collection,
} = require('discord.js');

// ---------------------- CONFIG (edit these) ----------------------
const BRAND_EMOJI = '<:mode_branding_20260510_032226_00:1506790198917206156>';
const FOOTER_ICON_URL = 'https://yumi.onl/api/files/6a6974fa91bbc4fb21f03ab5/raw';
const SUPPORT_APP_REVIEW_CHANNEL_ID = '1502786233963778189';
const SUPPORT_ROLE_ID = ['1504316405942718644', '1504645343252320428', '1504316712277774479'];
// -------------------------------------------------------------------

// Temp storage between modal 1 -> modal 2 (per user)
const pendingApplications = new Collection(); // userId -> { q1, q2, q3, q5, q9 }
// Full submitted answers, kept so Accept/Decline can rebuild the container
const submittedApplications = new Collection(); // userId -> { q1..q12 }

function footerGallery() {
  return new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(FOOTER_ICON_URL));
}

// ---------------------- Modals ----------------------
// NOTE: customIds below are lowercase and MUST match the lowercase keys
// read in handleModal1Submit/handleModal2Submit exactly (case-sensitive).
function buildModal1() {
  const modal = new ModalBuilder().setCustomId('supportapp_modal1').setTitle('Support Team Application (1/2)');

  const q1 = new TextInputBuilder()
    .setCustomId('q1')
    .setLabel('Are you 13 years old or older? (Yes/No)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const q2 = new TextInputBuilder()
    .setCustomId('q2')
    .setLabel('What is your Discord username?')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const q3 = new TextInputBuilder()
    .setCustomId('q3')
    .setLabel('Why are you interested in joining?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const q5 = new TextInputBuilder()
    .setCustomId('q5')
    .setLabel('Previous support/mod/customer service exp?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const q9 = new TextInputBuilder()
    .setCustomId('q9')
    .setLabel('Staff gave wrong info — what would you do?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(q1),
    new ActionRowBuilder().addComponents(q2),
    new ActionRowBuilder().addComponents(q3),
    new ActionRowBuilder().addComponents(q5),
    new ActionRowBuilder().addComponents(q9)
  );

  return modal;
}

function buildModal2() {
  const modal = new ModalBuilder().setCustomId('supportapp_modal2').setTitle('Support Team Application (2/2)');

  const q10 = new TextInputBuilder()
    .setCustomId('q10')
    .setLabel('How active can you be in the server?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const q12 = new TextInputBuilder()
    .setCustomId('q12')
    .setLabel('Anything else you would like us to know?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(q10),
    new ActionRowBuilder().addComponents(q12)
  );

  return modal;
}

function buildDeclineModal(applicantId) {
  const modal = new ModalBuilder()
    .setCustomId(`supportapp_declinemodal_${applicantId}`)
    .setTitle('Decline Application');

  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason for declining')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(reason));
  return modal;
}

// ---------------------- Shared: build the review container ----------------------
// state: 'pending' | 'accepted' | 'declined'
function buildReviewContainer(applicantId, answers, state) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${BRAND_EMOJI} | New Support Team Application\nApplicant: <@${applicantId}> (${applicantId})`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**1. Are you 13 years old or older?**\n${answers.q1}`,
          `**2. What is your Discord username?**\n${answers.q2}`,
          `**3. Why are you interested in joining the Support Team?**\n${answers.q3}`,
          `**5. Do you have any previous experience in customer service?**\n${answers.q5}`,
          `**9. What would you do if another staff member gave a member incorrect information?**\n${answers.q9}`,
          `**10. How active can you be within the server?**\n${answers.q10}`,
          `**12. Is there anything else you would like us to know about you?**\n${answers.q12}`,
        ].join('\n')
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addMediaGalleryComponents(footerGallery());

  const acceptBtn = new ButtonBuilder()
    .setCustomId(state === 'pending' ? `supportapp_accept_${applicantId}` : 'supportapp_accept_disabled')
    .setLabel(state === 'accepted' ? 'Accepted' : 'Accept')
    .setStyle(ButtonStyle.Success)
    .setDisabled(state !== 'pending');

  const declineBtn = new ButtonBuilder()
    .setCustomId(state === 'pending' ? `supportapp_decline_${applicantId}` : 'supportapp_decline_disabled')
    .setLabel(state === 'declined' ? 'Declined' : 'Decline')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(state !== 'pending');

  container.addActionRowComponents(new ActionRowBuilder().addComponents(acceptBtn, declineBtn));

  return container;
}

// ---------------------- Modal 1 submit -> Continue button ----------------------
async function handleModal1Submit(interaction) {
  const answers = {
    q1: interaction.fields.getTextInputValue('q1'),
    q2: interaction.fields.getTextInputValue('q2'),
    q3: interaction.fields.getTextInputValue('q3'),
    q5: interaction.fields.getTextInputValue('q5') || 'N/A',
    q9: interaction.fields.getTextInputValue('q9'),
  };
  pendingApplications.set(interaction.user.id, answers);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${BRAND_EMOJI} | Step 1 complete\nClick below to finish the last two questions.`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addMediaGalleryComponents(footerGallery())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('supportapp_continue').setLabel('Continue').setStyle(ButtonStyle.Secondary)
      )
    );

  await interaction.reply({
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

// ---------------------- Modal 2 submit -> post to review channel ----------------------
async function handleModal2Submit(interaction) {
  const prev = pendingApplications.get(interaction.user.id);
  if (!prev) {
    return interaction.reply({
      content: 'Your session expired — please run the command again from the start.',
      flags: MessageFlags.Ephemeral,
    });
  }
  pendingApplications.delete(interaction.user.id);

  const answers = {
    ...prev,
    q10: interaction.fields.getTextInputValue('q10'),
    q12: interaction.fields.getTextInputValue('q12') || 'N/A',
  };
  submittedApplications.set(interaction.user.id, answers);

  const reviewChannel = await interaction.client.channels.fetch(SUPPORT_APP_REVIEW_CHANNEL_ID);
  const container = buildReviewContainer(interaction.user.id, answers, 'pending');

  await reviewChannel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });

  await interaction.reply({
    content: 'Your application has been submitted. Thank you!',
    flags: MessageFlags.Ephemeral,
  });
}

// ---------------------- Accept button ----------------------
async function handleAccept(interaction, applicantId) {
  await interaction.deferUpdate();

  const guild = interaction.guild;
  const member = await guild.members.fetch(applicantId).catch(() => null);

  if (member) {
    await member.roles.add(SUPPORT_ROLE_ID).catch(() => null);

    const dmContainer = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${BRAND_EMOJI} You have passed the Support Team Application and have been given the role. Welcome aboard!`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addMediaGalleryComponents(footerGallery());

    await member
      .send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 })
      .catch(() => null);
  }

  const answers = submittedApplications.get(applicantId);
  const container = buildReviewContainer(applicantId, answers, 'accepted');

  await interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}

// ---------------------- Decline button -> reason modal -> DM + disable ----------------------
async function handleDeclineModalSubmit(interaction, applicantId) {
  await interaction.deferUpdate();

  const reason = interaction.fields.getTextInputValue('reason');
  const guild = interaction.guild;
  const member = await guild.members.fetch(applicantId).catch(() => null);

  if (member) {
    const dmContainer = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${BRAND_EMOJI} Your Support Team Application was not accepted at this time.\n**Reason:** ${reason}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addMediaGalleryComponents(footerGallery());

    await member
      .send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 })
      .catch(() => null);
  }

  const answers = submittedApplications.get(applicantId);
  const container = buildReviewContainer(applicantId, answers, 'declined');

  await interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}

// ---------------------- One-time interaction binding ----------------------
function ensureInteractionsBound(client) {
  if (client._supportAppBound) return;
  client._supportAppBound = true;

  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) {
        if (interaction.customId === 'supportapp_start') {
          return interaction.showModal(buildModal1());
        }
        if (interaction.customId === 'supportapp_continue') {
          return interaction.showModal(buildModal2());
        }
        if (interaction.customId.startsWith('supportapp_accept_')) {
          const applicantId = interaction.customId.replace('supportapp_accept_', '');
          return handleAccept(interaction, applicantId);
        }
        if (interaction.customId.startsWith('supportapp_decline_')) {
          const applicantId = interaction.customId.replace('supportapp_decline_', '');
          return interaction.showModal(buildDeclineModal(applicantId));
        }
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId === 'supportapp_modal1') {
          return handleModal1Submit(interaction);
        }
        if (interaction.customId === 'supportapp_modal2') {
          return handleModal2Submit(interaction);
        }
        if (interaction.customId.startsWith('supportapp_declinemodal_')) {
          const applicantId = interaction.customId.replace('supportapp_declinemodal_', '');
          return handleDeclineModalSubmit(interaction, applicantId);
        }
      }
    } catch (err) {
      console.error('supportapp error:', err);
    }
  });
}

// ---------------------- Command entry point ----------------------
module.exports = {
  name: 'supportapp',
  execute: async (message, args, client) => {
    ensureInteractionsBound(client);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${BRAND_EMOJI} | Support Team Application\nClick below to start your application. You'll answer a few short questions across two steps.`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addMediaGalleryComponents(footerGallery())
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('supportapp_start').setLabel('Start Application').setStyle(ButtonStyle.Secondary)
        )
      );

    await message.channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};