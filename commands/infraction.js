const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
} = require('discord.js');

const {
    Infraction,
    generateInfractionId,
    buildInfractionContainer,
    buildHistoryContainer,
    logAction,
    INFRACTION_CHANNEL_ID,
} = require('../utils/infractionManager');

// ── Role lock — add the role ID(s) allowed to use this command ──
const STAFF_ROLE_IDS = ['1504311819458580531', '1504313264576925757', '1504312910862880879'];

const ACTION_CHOICES = [
    { name: 'Notice', value: 'Notice' },
    { name: 'Warning', value: 'Warning' },
    { name: 'Strike', value: 'Strike' },
    { name: 'Suspension', value: 'Suspension' },
    { name: 'Termination', value: 'Termination' },
];

function isStaff(member) {
    if (!member) return false;
    if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    return member.roles.cache.some(r => STAFF_ROLE_IDS.includes(r.id));
}

async function denyNoPermission(interaction) {
    return interaction.reply({
        content: 'You do not have permission to use this command.',
        ephemeral: true,
    });
}

// Attempts to DM the affected user a copy of the infraction container.
// Silently fails (returns false) if their DMs are closed — never throws,
// so it can't break the command.
async function tryDM(client, userId, container) {
    try {
        const user = await client.users.fetch(userId);
        await user.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
        return true;
    } catch (err) {
        return false;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('infraction')
        .setDescription('Manage user infractions.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand(sub =>
            sub.setName('issue')
                .setDescription('Issue a new infraction to a user.')
                .addUserOption(o => o.setName('user').setDescription('The user to infract.').setRequired(true))
                .addStringOption(o => o.setName('action').setDescription('The infraction action.').setRequired(true).addChoices(...ACTION_CHOICES))
                .addStringOption(o => o.setName('reason').setDescription('Reason for the infraction.').setRequired(true))
                .addBooleanOption(o => o.setName('appealable').setDescription('Can this infraction be appealed?').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('edit')
                .setDescription('Edit an existing infraction.')
                .addStringOption(o => o.setName('infraction_id').setDescription('The infraction ID, e.g. MD-7K3X9Q').setRequired(true))
                .addStringOption(o => o.setName('action').setDescription('New action.').addChoices(...ACTION_CHOICES))
                .addStringOption(o => o.setName('reason').setDescription('New reason.'))
                .addBooleanOption(o => o.setName('appealable').setDescription('New appealable status.'))
        )
        .addSubcommand(sub =>
            sub.setName('void')
                .setDescription('Void an existing infraction.')
                .addStringOption(o => o.setName('infraction_id').setDescription('The infraction ID, e.g. MD-7K3X9Q').setRequired(true))
                .addStringOption(o => o.setName('reason').setDescription('Reason for voiding.').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('history')
                .setDescription("View a user's infraction history.")
                .addUserOption(o => o.setName('user').setDescription('The user to look up.').setRequired(true))
        ),

    async execute(interaction, client) {
        if (!isStaff(interaction.member)) {
            return denyNoPermission(interaction);
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'issue') return handleIssue(interaction, client);
        if (sub === 'edit') return handleEdit(interaction, client);
        if (sub === 'void') return handleVoid(interaction, client);
        if (sub === 'history') return handleHistory(interaction, client);
    },
};

async function handleIssue(interaction, client) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user', true);
    const action = interaction.options.getString('action', true);
    const reason = interaction.options.getString('reason', true);
    const appealable = interaction.options.getBoolean('appealable', true);

    const infractionId = await generateInfractionId();

    const infraction = await Infraction.create({
        guildId: interaction.guildId,
        userId: targetUser.id,
        userTag: targetUser.tag,
        infractionId,
        action,
        reason,
        appealable,
        issuedById: interaction.user.id,
        issuedByTag: interaction.user.tag,
    });

    const fields = [
        ['User', `<@${targetUser.id}>`],
        ['Infraction ID', `\`${infraction.infractionId}\``],
        ['Action Issued', action],
        ['Reason', reason],
        ['Issued by', `<@${interaction.user.id}>`],
        ['Date', `<t:${Math.floor(infraction.createdAt.getTime() / 1000)}:F>`],
        ['Appealable', appealable ? 'Yes' : 'No'],
    ];

    const container = buildInfractionContainer({ headerAction: action, fields });

    const dmSent = await tryDM(client, targetUser.id, container);

    const runInInfractionChannel = interaction.channelId === INFRACTION_CHANNEL_ID;

    if (runInInfractionChannel) {
        // Already in #infractions — show the full embed once, no separate confirmation needed.
        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    } else {
        await interaction.editReply({
            content: `Infraction issued — logged in <#${INFRACTION_CHANNEL_ID}>.`,
        });
    }

    if (!dmSent) {
        await interaction.followUp({ content: `Note: I couldn't DM <@${targetUser.id}> (their DMs may be closed).`, ephemeral: true });
    }

    await logAction(client, {
        fullContainer: container,
        eventType: 'Issued',
        issuerId: interaction.user.id,
        targetId: targetUser.id,
        action,
        reason,
        infractionId: infraction.infractionId,
        skipChannelPost: runInInfractionChannel,
    });
}

async function handleEdit(interaction, client) {
    await interaction.deferReply();

    const infractionId = interaction.options.getString('infraction_id', true);
    const newAction = interaction.options.getString('action');
    const newReason = interaction.options.getString('reason');
    const newAppealable = interaction.options.getBoolean('appealable');

    const infraction = await Infraction.findOne({ infractionId });
    if (!infraction) {
        return interaction.editReply({ content: `No infraction found with ID \`${infractionId}\`.` });
    }

    if (newAction === null && newReason === null && newAppealable === null) {
        return interaction.editReply({ content: 'You must provide at least one field to edit (action, reason, or appealable).' });
    }

    const editEntries = [];

    if (newAction !== null && newAction !== infraction.action) {
        editEntries.push({
            field: 'action',
            oldValue: infraction.action,
            newValue: newAction,
            editedById: interaction.user.id,
            editedByTag: interaction.user.tag,
        });
        infraction.action = newAction;
    }

    if (newReason !== null && newReason !== infraction.reason) {
        editEntries.push({
            field: 'reason',
            oldValue: infraction.reason,
            newValue: newReason,
            editedById: interaction.user.id,
            editedByTag: interaction.user.tag,
        });
        infraction.reason = newReason;
    }

    if (newAppealable !== null && newAppealable !== infraction.appealable) {
        editEntries.push({
            field: 'appealable',
            oldValue: infraction.appealable ? 'Yes' : 'No',
            newValue: newAppealable ? 'Yes' : 'No',
            editedById: interaction.user.id,
            editedByTag: interaction.user.tag,
        });
        infraction.appealable = newAppealable;
    }

    infraction.editHistory.push(...editEntries);
    await infraction.save();

    const fields = [
        ['User', `<@${infraction.userId}>`],
        ['Infraction ID', `\`${infraction.infractionId}\``],
        ['Action Issued', infraction.action],
        ['Reason', infraction.reason],
        ['Issued by', `<@${infraction.issuedById}>`],
        ['Edited by', `<@${interaction.user.id}>`],
        ['Date', `<t:${Math.floor(infraction.createdAt.getTime() / 1000)}:F>`],
        ['Appealable', infraction.appealable ? 'Yes' : 'No'],
    ];

    const container = buildInfractionContainer({ headerAction: 'Edited', fields });

    const dmSent = await tryDM(client, infraction.userId, container);

    const runInInfractionChannel = interaction.channelId === INFRACTION_CHANNEL_ID;

    if (runInInfractionChannel) {
        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    } else {
        await interaction.editReply({
            content: `Infraction \`${infraction.infractionId}\` edited — logged in <#${INFRACTION_CHANNEL_ID}>.`,
        });
    }

    if (!dmSent) {
        await interaction.followUp({ content: `Note: I couldn't DM <@${infraction.userId}> (their DMs may be closed).`, ephemeral: true });
    }

    await logAction(client, {
        fullContainer: container,
        eventType: 'Edited',
        issuerId: interaction.user.id,
        targetId: infraction.userId,
        action: infraction.action,
        reason: infraction.reason,
        infractionId: infraction.infractionId,
        skipChannelPost: runInInfractionChannel,
    });
}

async function handleVoid(interaction, client) {
    await interaction.deferReply();

    const infractionId = interaction.options.getString('infraction_id', true);
    const voidReason = interaction.options.getString('reason') || 'No reason provided.';

    const infraction = await Infraction.findOne({ infractionId });
    if (!infraction) {
        return interaction.editReply({ content: `No infraction found with ID \`${infractionId}\`.` });
    }

    if (infraction.status === 'Voided') {
        return interaction.editReply({ content: `Infraction \`${infractionId}\` is already voided.` });
    }

    infraction.status = 'Voided';
    infraction.voidReason = voidReason;
    infraction.voidedById = interaction.user.id;
    infraction.voidedByTag = interaction.user.tag;
    infraction.voidedAt = new Date();
    await infraction.save();

    const fields = [
        ['User', `<@${infraction.userId}>`],
        ['Infraction ID', `\`${infraction.infractionId}\``],
        ['Original Action', infraction.action],
        ['Void Reason', voidReason],
        ['Voided by', `<@${interaction.user.id}>`],
        ['Date', `<t:${Math.floor(infraction.voidedAt.getTime() / 1000)}:F>`],
        ['Appealable', 'N/A'],
    ];

    const container = buildInfractionContainer({ headerAction: 'Voided', fields });

    const dmSent = await tryDM(client, infraction.userId, container);

    const runInInfractionChannel = interaction.channelId === INFRACTION_CHANNEL_ID;

    if (runInInfractionChannel) {
        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    } else {
        await interaction.editReply({
            content: `Infraction \`${infraction.infractionId}\` voided — logged in <#${INFRACTION_CHANNEL_ID}>.`,
        });
    }

    if (!dmSent) {
        await interaction.followUp({ content: `Note: I couldn't DM <@${infraction.userId}> (their DMs may be closed).`, ephemeral: true });
    }

    await logAction(client, {
        fullContainer: container,
        eventType: 'Voided',
        issuerId: interaction.user.id,
        targetId: infraction.userId,
        action: infraction.action,
        reason: voidReason,
        infractionId: infraction.infractionId,
        skipChannelPost: runInInfractionChannel,
    });
}

async function handleHistory(interaction, client) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user', true);

    const infractions = await Infraction.find({ userId: targetUser.id, guildId: interaction.guildId })
        .sort({ createdAt: -1 })
        .lean();

    const container = buildHistoryContainer({ user: targetUser, infractions });

    await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}