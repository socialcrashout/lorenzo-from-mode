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
const PREFIX = '-supportapp';
const BRAND_EMOJI = '<:mode_branding_20260510_032226_00:1506790198917206156>';
const FOOTER_TEXT = '.mode • Support Team Applications'; // hardcoded footer, edit as needed
const FOOTER_ICON_URL = 'https://yumi.onl/api/files/6a6974fa91bbc4fb21f03ab5/raw'; // hardcoded footer icon
const SUPPORT_APP_REVIEW_CHANNEL_ID = '1502786233963778189';
const SUPPORT_ROLE_ID = ['1504316405942718644', '1504645343252320428', '1504316712277774479'];
// -------------------------------------------------------------------

// Temp storage for answers between modal 1 and modal 2 (per user)
const pendingApplications = new Collection(); // userId -> { q1, q2, q3, q5, q9 }

// Footer as a full-width banner image (V2 has no native embed-footer)
function footerGallery() {
  return new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(FOOTER_ICON_URL).setDescription(FOOTER_TEXT)
  );
}

// ---------------------- Step 0: -supportapp message command ----------------------
function handleMessage(message) {
  if (message.author.bot) return;
  if (message.content.trim().toLowerCase() !== PREFIX) return;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${BRAND_EMOJI} | Support Team Application\nClick below to start your application. You'll answer a few short questions across two steps.`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addMediaGalleryComponents(footerGallery());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('supportapp_start')
      .setLabel('Start Application')
      .setStyle(ButtonStyle.Primary)
  );

  message.channel.send({
    components: [container, row],
    flags: MessageFlags.IsComponentsV2,
  });
}

// ---------------------- Step 1: Start button -> Modal 1 ----------------------
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

// ---------------------- Step 2: Modal 1 submit -> Continue button ----------------------
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
    .addMediaGalleryComponents(footerGallery());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('supportapp_continue')
      .setLabel('Continue')
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({
    components: [container, row],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

// ---------------------- Step 3: Modal 2 submit -> post to review channel ----------------------
async function handleModal2Submit(interaction) {
  const prev = pendingApplications.get(interaction.user.id);
  if (!prev) {
    return interaction.reply({
      content: 'Your session expired — please run the command again from the start.',
      flags: MessageFlags.Ephemeral,
    });
  }
  pendingApplications.delete(interaction.user.id);

  const q10 = interaction.fields.getTextInputValue('q10');
  const q12 = interaction.fields.getTextInputValue('q12') || 'N/A';

  const reviewChannel = await interaction.client.channels.fetch(SUPPORT_APP_REVIEW_CHANNEL_ID);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${BRAND_EMOJI} | New Support Team Application\nApplicant: <@${interaction.user.id}> (${interaction.user.id})`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**1. 13 or older?**\n${prev.q1}`,
          `**2. Discord username**\n${prev.q2}`,
          `**3. Why interested?**\n${prev.q3}`,
          `**5. Prior experience**\n${prev.q5}`,
          `**9. Wrong info from staff — response**\n${prev.q9}`,
          `**10. Activity level**\n${q10}`,
          `**12. Anything else**\n${q12}`,
        ].join('\n\n')
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addMediaGalleryComponents(footerGallery());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`supportapp_accept_${interaction.user.id}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`supportapp_decline_${interaction.user.id}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
  );

  await reviewChannel.send({
    components: [container, row],
    flags: MessageFlags.IsComponentsV2,
  });

  await interaction.reply({
    content: 'Your application has been submitted. Thank you!',
    flags: MessageFlags.Ephemeral,
  });
}

// ---------------------- Step 4a: Accept button ----------------------
async function handleAccept(interaction, applicantId) {
  const guild = interaction.guild;
  const member = await guild.members.fetch(applicantId).catch(() => null);

  if (member) {
    await member.roles.add(SUPPORT_ROLE_ID).catch(() => null);
    await member
      .send({
        content: `${BRAND_EMOJI} You have passed the Support Team Application and have been given the role. Welcome aboard!`,
      })
      .catch(() => null); // ignore if DMs closed
  }

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('supportapp_accepted').setLabel('Accepted').setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId('supportapp_decline_disabled').setLabel('Decline').setStyle(ButtonStyle.Danger).setDisabled(true)
  );

  const components = interaction.message.components.slice(0, -1);
  await interaction.update({
    components: [...components, disabledRow],
    flags: MessageFlags.IsComponentsV2,
  });
}

// ---------------------- Step 4b: Decline button -> reason modal ----------------------
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

async function handleDeclineModalSubmit(interaction, applicantId) {
  const reason = interaction.fields.getTextInputValue('reason');
  const guild = interaction.guild;
  const member = await guild.members.fetch(applicantId).catch(() => null);

  if (member) {
    await member
      .send({
        content: `${BRAND_EMOJI} Your Support Team Application was not accepted at this time.\n**Reason:** ${reason}`,
      })
      .catch(() => null);
  }

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('supportapp_accept_disabled').setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId('supportapp_declined').setLabel('Declined').setStyle(ButtonStyle.Danger).setDisabled(true)
  );

  const components = interaction.message.components.slice(0, -1);
  await interaction.update({
    components: [...components, disabledRow],
    flags: MessageFlags.IsComponentsV2,
  });

  await interaction.followUp({ content: `Declined and notified <@${applicantId}>.`, flags: MessageFlags.Ephemeral });
}

// ---------------------- Wiring ----------------------
function setup(client) {
  client.on('messageCreate', handleMessage);

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
      console.error('supportApplication error:', err);
    }
  });
}

module.exports = setup;