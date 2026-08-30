const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    MessageFlags,
} = require('discord.js');

const { Suggestion, getNextSuggestionNumber } = require('../models/Suggestion');

// ---- hardcoded banner + destination channel ----
const BANNER_URL = 'https://yumi.onl/api/files/6a9466e488d7015a1ae91890/raw';
const SUGGESTION_CHANNEL_ID = '1542149233614913616';

const CUSTOM_IDS = {
    UPVOTE: 'suggest_upvote',
    DOWNVOTE: 'suggest_downvote',
    ACCEPT: 'suggest_accept',
    DENY: 'suggest_deny',
};

const DENY_MODAL_PREFIX = 'suggest_deny_modal:';
const DENY_REASON_INPUT_ID = 'suggest_deny_reason';

// Change this if you'd rather gate accept/deny by a specific role ID.
function isStaff(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

function buildContainer(doc) {
    const container = new ContainerBuilder(); // no accent color set -> default container styling

    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(BANNER_URL)
        )
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Suggestion #${doc.number}`)
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `A new suggestion has been submitted by <@${doc.authorId}>. Check it out below!`
        )
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Suggestion:** ${doc.description}`)
    );

    if (doc.referenceUrl) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('**Reference:**')
        );
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(doc.referenceUrl)
            )
        );
    }

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    if (doc.status === 'pending') {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                'You can vote on this suggestion using the options below. Once reviewed, it will be discussed and evaluated by the .mode Leadership Team before a final decision is made.'
            )
        );
    } else if (doc.status === 'accepted') {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('✅ **This suggestion has been accepted.**')
        );
    } else {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('❌ **This suggestion has been denied.**')
        );
    }

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const locked = doc.status !== 'pending';

    const voteRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(CUSTOM_IDS.UPVOTE)
            .setLabel(`Upvote (${doc.upvotes.length})`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(locked),
        new ButtonBuilder()
            .setCustomId(CUSTOM_IDS.DOWNVOTE)
            .setLabel(`Downvote (${doc.downvotes.length})`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(locked)
    );

    const modRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(CUSTOM_IDS.ACCEPT)
            .setLabel('Accept Suggestion')
            .setStyle(ButtonStyle.Success)
            .setDisabled(locked),
        new ButtonBuilder()
            .setCustomId(CUSTOM_IDS.DENY)
            .setLabel('Deny Suggestion')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(locked)
    );

    container.addActionRowComponents(voteRow, modRow);

    return container;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Submit a suggestion for the community team to review')
        .addStringOption((opt) =>
            opt
                .setName('description')
                .setDescription('Describe your suggestion')
                .setRequired(true)
                .setMaxLength(1000)
        )
        .addAttachmentOption((opt) =>
            opt
                .setName('reference')
                .setDescription('Optional image/reference to attach')
                .setRequired(false)
        ),

    async execute(interaction, client) {
        const description = interaction.options.getString('description', true);
        const reference = interaction.options.getAttachment('reference');

        await interaction.deferReply({ ephemeral: true });

        const targetChannel = await interaction.client.channels
            .fetch(SUGGESTION_CHANNEL_ID)
            .catch(() => null);

        if (!targetChannel) {
            return interaction.editReply(
                "I couldn't find the suggestions channel. Let a staff member know."
            );
        }

        const number = await getNextSuggestionNumber();

        const draft = {
            number,
            authorId: interaction.user.id,
            description,
            referenceUrl: reference?.url ?? null,
            upvotes: [],
            downvotes: [],
            status: 'pending',
        };

        const container = buildContainer(draft);

        let thread;
        let message;
        try {
            thread = await targetChannel.threads.create({
                name: `Suggestion #${number}`,
                autoArchiveDuration: 1440,
                reason: `New suggestion #${number}`,
                message: {
                    flags: MessageFlags.IsComponentsV2,
                    components: [container],
                },
            });
            message = await thread.fetchStarterMessage();
        } catch (err) {
            client?.logs?.error('Failed to post suggestion message:', err) ?? console.error(err);
            return interaction.editReply(
                'Something went wrong posting your suggestion. Let a staff member know.'
            );
        }

        const doc = await Suggestion.create({
            messageId: message.id,
            channelId: targetChannel.id,
            threadId: thread.id,
            ...draft,
        });

        await interaction.editReply(
            `Your suggestion has been submitted! Check it out here: ${message.url}`
        );
    },

    // Called by index.js's generic component dispatcher for every button/select/modal.
    // Return true once handled so the dispatcher stops looping.
    async handleComponent(interaction, client) {
        // --- Deny reason modal submission ---
        if (interaction.isModalSubmit() && interaction.customId.startsWith(DENY_MODAL_PREFIX)) {
            return handleDenyModalSubmit(interaction, client);
        }

        if (!interaction.isButton()) return false;
        if (!Object.values(CUSTOM_IDS).includes(interaction.customId)) return false;

        const doc = await Suggestion.findOne({ messageId: interaction.message.id });
        if (!doc) {
            await interaction.reply({
                content: 'This suggestion no longer exists in the database.',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        const { customId } = interaction;

        if (doc.status !== 'pending' && (customId === CUSTOM_IDS.UPVOTE || customId === CUSTOM_IDS.DOWNVOTE)) {
            await interaction.reply({
                content: 'Voting is closed on this suggestion.',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        if (customId === CUSTOM_IDS.UPVOTE || customId === CUSTOM_IDS.DOWNVOTE) {
            const userId = interaction.user.id;
            doc.upvotes = doc.upvotes.filter((id) => id !== userId);
            doc.downvotes = doc.downvotes.filter((id) => id !== userId);

            if (customId === CUSTOM_IDS.UPVOTE) doc.upvotes.push(userId);
            else doc.downvotes.push(userId);

            await doc.save();

            const container = buildContainer(doc);
            await interaction.update({
                flags: MessageFlags.IsComponentsV2,
                components: [container],
            });
            return true;
        }

        // --- Accept / Deny (staff only) ---
        if (!isStaff(interaction)) {
            await interaction.reply({
                content: "You don't have permission to review suggestions.",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        if (customId === CUSTOM_IDS.DENY) {
            // Deny needs a reason first — show the modal now. This IS the interaction
            // response, so don't call interaction.update()/reply() after this.
            const modal = new ModalBuilder()
                .setCustomId(`${DENY_MODAL_PREFIX}${interaction.message.id}`)
                .setTitle(`Deny Suggestion #${doc.number}`);

            const reasonInput = new TextInputBuilder()
                .setCustomId(DENY_REASON_INPUT_ID)
                .setLabel('Reason for denial')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500);

            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

            await interaction.showModal(modal);
            return true;
        }

        // --- Accept ---
        doc.status = 'accepted';
        doc.resolvedBy = interaction.user.id;
        await doc.save();

        // Respond to the button click FIRST — locking/archiving the thread afterward
        // can break the interaction response if done before it.
        const container = buildContainer(doc);
        await interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: [container],
        });

        await announceResolution(interaction, doc, client);
        await lockSuggestionThread(interaction, doc, client);

        return true;
    },
};

async function handleDenyModalSubmit(interaction, client) {
    const messageId = interaction.customId.slice(DENY_MODAL_PREFIX.length);
    const doc = await Suggestion.findOne({ messageId });

    if (!doc) {
        await interaction.reply({
            content: 'This suggestion no longer exists in the database.',
            flags: MessageFlags.Ephemeral,
        });
        return true;
    }

    const reason = interaction.fields.getTextInputValue(DENY_REASON_INPUT_ID);

    doc.status = 'denied';
    doc.resolvedBy = interaction.user.id;
    doc.denyReason = reason;
    await doc.save();

    // Acknowledge the modal submission itself (separate interaction from the button click)
    await interaction.reply({
        content: `Suggestion #${doc.number} has been denied.`,
        flags: MessageFlags.Ephemeral,
    });

    // Edit the original suggestion message directly, since this modal-submit
    // interaction isn't tied to that message the way a button click is.
    try {
        const channel = await interaction.client.channels.fetch(doc.channelId);
        const message = await channel.messages.fetch(doc.messageId);
        const container = buildContainer(doc);
        await message.edit({
            flags: MessageFlags.IsComponentsV2,
            components: [container],
        });
    } catch (err) {
        client?.logs?.error(`Failed to update suggestion #${doc.number} message after denial:`, err) ?? console.error(err);
    }

    await announceResolution(interaction, doc, client);
    await lockSuggestionThread(interaction, doc, client);

    return true;
}

function buildMentionList(doc) {
    const upvoterIds = doc.upvotes.filter((id) => id !== doc.authorId);
    const mentions = [...new Set(upvoterIds)].map((id) => `<@${id}>`);
    return mentions.length ? mentions.join(' ') : null;
}

async function announceResolution(interaction, doc, client) {
    try {
        const channel = doc.threadId
            ? await interaction.client.channels.fetch(doc.threadId)
            : await interaction.client.channels.fetch(doc.channelId);

        const voterMentions = buildMentionList(doc);

        let content;
        if (doc.status === 'accepted') {
            content = `<@${doc.authorId}> your suggestion has been **accepted**! We'll be working on implementing this soon.`;
            if (voterMentions) content += `\n\nThanks to everyone who voted: ${voterMentions}`;
        } else {
            content = `<@${doc.authorId}> your suggestion has been **denied**.\n**Reason:** ${doc.denyReason ?? 'No reason provided.'}`;
            if (voterMentions) content += `\n\n${voterMentions}`;
        }

        await channel.send({ content });
    } catch (err) {
        client?.logs?.error(`Failed to announce resolution for suggestion #${doc.number}:`, err) ?? console.error(err);
    }
}

async function lockSuggestionThread(interaction, doc, client) {
    if (!doc.threadId) return;
    try {
        const thread = await interaction.client.channels.fetch(doc.threadId);
        await thread?.setLocked(true);
        await thread?.setArchived(true);
    } catch (err) {
        client?.logs?.error('Failed to lock suggestion thread:', err) ?? console.error(err);
    }
}