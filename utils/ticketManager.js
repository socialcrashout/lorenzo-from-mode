const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    MessageFlags,
    AttachmentBuilder,
    ChannelType,
} = require("discord.js");

const config = require("../config");
const { parseEmoji } = require("./emoji");
const { generateTranscript } = require("./transcript");
const { getDB } = require("../db");

const SELECT_ID = "ticket_panel_select";
const BTN_CLAIM = "ticket_claim";
const BTN_CLOSE = "ticket_close";
const BTN_CLOSE_CONFIRM = "ticket_close_confirm";
const BTN_CLOSE_CANCEL = "ticket_close_cancel";
const BTN_ESCALATE = "ticket_escalate";

const EMOJI_CLOCK = "<:clock:1533146124389585078>";
const EMOJI_PERSON = "<:person:1502514200705105981>";

/* ------------------------------------------------------------------ *
 *  Small persistent counter so ticket channel names don't collide
 *  even after a restart. Stored in MongoDB (ticketCounters collection)
 *
 *  NOTE: MongoDB Node driver v6+ changed findOneAndUpdate to return the
 *  document itself instead of wrapping it in { value }. We handle both
 *  shapes here so this keeps working whether you're on v5 or v6+.
 * ------------------------------------------------------------------ */
async function nextTicketNumber() {
    const db = getDB();
    const result = await db.collection("ticketCounters").findOneAndUpdate(
        { _id: "global" },
        { $inc: { count: 1 } },
        { upsert: true, returnDocument: "after" }
    );
    const doc = result?.value ?? result;
    return doc.count;
}

/* ------------------------------------------------------------------ *
 *  Fill {placeholders} in config text templates
 * ------------------------------------------------------------------ */
function fill(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : ""));
}

/* ------------------------------------------------------------------ *
 *  Format a duration in ms as e.g. "2d 4h", "1h 12m", "45s"
 * ------------------------------------------------------------------ */
function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    // Only show seconds once we're down to the last unit and there's
    // nothing coarser already making the line noisy.
    if (!days && !hours) parts.push(`${seconds}s`);

    return parts.length ? parts.join(" ") : "0s";
}

/* ------------------------------------------------------------------ *
 *  PANEL CONTAINER  (-panel command)
 * ------------------------------------------------------------------ */
function buildPanelContainer() {
    const container = new ContainerBuilder(); // no .setAccentColor() = no accent color

    if (config.panel.bannerUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(config.panel.bannerUrl)
            )
        );
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(config.panel.text));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const select = new StringSelectMenuBuilder()
        .setCustomId(SELECT_ID)
        .setPlaceholder(config.panel.selectPlaceholder)
        .addOptions(
            config.categories.map((cat) => {
                const opt = new StringSelectMenuOptionBuilder()
                    .setLabel(cat.label)
                    .setDescription(cat.description)
                    .setValue(cat.id);
                const emoji = parseEmoji(cat.emoji);
                if (emoji) opt.setEmoji(emoji);
                return opt;
            })
        );

    container.addActionRowComponents(new ActionRowBuilder().addComponents(select));

    if (config.panel.footerUrl) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(config.panel.footerUrl)
            )
        );
    }

    return container;
}

/* ------------------------------------------------------------------ *
 *  TICKET WELCOME CONTAINER (sent inside the new ticket channel)
 * ------------------------------------------------------------------ */
const COLOR_CLAIMED = 0x57f287; // Discord "green" — shown once a ticket is claimed

function buildTicketContainer(member, category, { claimed = null, escalated = false } = {}) {
    const container = new ContainerBuilder();

    if (claimed) {
        container.setAccentColor(COLOR_CLAIMED);
    }

    if (config.ticket.bannerUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(config.ticket.bannerUrl))
        );
    }

    const text = fill(config.ticket.text, { user: `${member}`, category: category.label });
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));

    if (claimed) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Claimed by ${claimed}`)
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(BTN_CLAIM)
            .setLabel(claimed ? "Claimed" : "Claim")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(Boolean(claimed)),
        new ButtonBuilder().setCustomId(BTN_CLOSE).setLabel("Close").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(BTN_ESCALATE)
            .setLabel("Escalate")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(escalated)
    );

    container.addActionRowComponents(row);

    return container;
}

function buildClaimConfirmContainer(claimedBy) {
    const container = new ContainerBuilder();
    container.setAccentColor(COLOR_CLAIMED);
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`✅ You claimed this ticket, ${claimedBy}.`)
    );
    return container;
}

function buildCloseConfirmContainer() {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("Are you sure you want to close this ticket? A transcript will be saved.")
    );
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(BTN_CLOSE_CONFIRM).setLabel("Confirm Close").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(BTN_CLOSE_CANCEL).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        )
    );
    return container;
}

function buildEscalateContainer(member, staff) {
    const container = new ContainerBuilder();
    const roleId = config.ids.managementRoleId;
    const text = fill(config.escalate.text, { user: `${member}`, staff: `${staff}` });
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
    return { container, pingText: fill(config.escalate.pingText, { user: `${member}`, role: roleId ? `<@&${roleId}>` : "" }) };
}

/* ------------------------------------------------------------------ *
 *  TRANSCRIPT LOG CONTAINER — sent to the transcript log channel when
 *  a ticket closes. Components V2, no accent color.
 * ------------------------------------------------------------------ */
function buildTranscriptLogContainer({ channelName, openedBy, closedBy, durationMs }) {
    const container = new ContainerBuilder(); // no .setAccentColor() = no accent color

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Transcript — #${channelName}`),
        new TextDisplayBuilder().setContent(
            [
                `${EMOJI_CLOCK} Duration: ${formatDuration(durationMs)}`,
                `${EMOJI_PERSON} Opened by: ${openedBy}`,
                `${EMOJI_PERSON} Closed by: ${closedBy}`,
            ].join("\n")
        )
    );

    return container;
}

/* ------------------------------------------------------------------ *
 *  SELECT MENU HANDLER -> creates the ticket channel
 * ------------------------------------------------------------------ */
async function handleCategorySelect(interaction) {
    const categoryId = interaction.values[0];
    const category = config.categories.find((c) => c.id === categoryId);
    if (!category) {
        return interaction.reply({ content: "Unknown category, tell an admin.", flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const pingRoleId = category.pingRoleId || config.ids.supportRoleId;
    const num = String(await nextTicketNumber()).padStart(4, "0");
    const channelName = `${category.channelPrefix}-${num}`;

    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: interaction.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
            ],
        },
    ];

    if (pingRoleId) {
        overwrites.push({
            id: pingRoleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
            ],
        });
    }

    const parentId = category.categoryId || config.ids.ticketsCategoryId;

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentId || undefined,
        permissionOverwrites: overwrites,
        topic: `Ticket for ${interaction.user.tag} | category: ${category.label} | opener: ${interaction.user.id}`,
    });

    const container = buildTicketContainer(interaction.user, category);
    const pingText = fill(config.ticket.pingText, {
        user: `${interaction.user}`,
        role: pingRoleId ? `<@&${pingRoleId}>` : "",
    }).trim();

    // Components V2 messages can't use the `content` field, so pings go in
    // as their own top-level TextDisplay component instead.
    const messageComponents = [];
    if (pingText) messageComponents.push(new TextDisplayBuilder().setContent(pingText));
    messageComponents.push(container);

    await channel.send({
        components: messageComponents,
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { users: [interaction.user.id], roles: pingRoleId ? [pingRoleId] : [] },
    });

    await interaction.editReply({ content: `Ticket created: ${channel}` });
}

/* ------------------------------------------------------------------ *
 *  BUTTON HANDLER -> claim / close / escalate
 * ------------------------------------------------------------------ */
async function handleButton(interaction) {
    const { customId, channel, member } = interaction;
    const isStaff = config.ids.supportRoleId ? member.roles.cache.has(config.ids.supportRoleId) : true;

    switch (customId) {
        case BTN_CLAIM: {
            if (!isStaff) {
                return interaction.reply({ content: "Only support staff can claim tickets.", flags: MessageFlags.Ephemeral });
            }
            const category = config.categories.find((c) => channel.name.startsWith(c.channelPrefix)) || config.categories[0];
            const openerId = channel.topic?.match(/opener: (\d+)/)?.[1];
            const opener = openerId ? await interaction.guild.members.fetch(openerId).catch(() => null) : null;

            const container = buildTicketContainer(opener?.user || "the ticket opener", category, { claimed: interaction.user });
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });

            await interaction.followUp({
                components: [buildClaimConfirmContainer(interaction.user)],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
            break;
        }

        case BTN_CLOSE: {
            const confirm = buildCloseConfirmContainer();
            await interaction.reply({
                components: [confirm],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
            break;
        }

        case BTN_CLOSE_CANCEL: {
            // This message was originally sent with IsComponentsV2, so the edit
            // has to stay V2 too - no `content`, just a TextDisplay component.
            await interaction.update({
                components: [new TextDisplayBuilder().setContent("Cancelled.")],
                flags: MessageFlags.IsComponentsV2,
            });
            break;
        }

        case BTN_CLOSE_CONFIRM: {
            await interaction.update({
                components: [new TextDisplayBuilder().setContent("Closing ticket & generating transcript...")],
                flags: MessageFlags.IsComponentsV2,
            });
            await closeTicket(channel, interaction.user);
            break;
        }

        case BTN_ESCALATE: {
            if (!isStaff) {
                return interaction.reply({ content: "Only support staff can escalate tickets.", flags: MessageFlags.Ephemeral });
            }
            const openerId = channel.topic?.match(/opener: (\d+)/)?.[1];
            const opener = openerId ? await interaction.guild.members.fetch(openerId).catch(() => null) : null;

            const { container, pingText } = buildEscalateContainer(opener?.user || "the ticket opener", interaction.user);

            const escalateComponents = [];
            if (pingText) escalateComponents.push(new TextDisplayBuilder().setContent(pingText));
            escalateComponents.push(container);

            await channel.send({
                components: escalateComponents,
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: { roles: config.ids.managementRoleId ? [config.ids.managementRoleId] : [] },
            });
            await interaction.reply({ content: "Ticket escalated.", flags: MessageFlags.Ephemeral });
            break;
        }

        default:
            break;
    }
}

/* ------------------------------------------------------------------ *
 *  PREFIX COMMAND HANDLER -> -close
 *  Same confirm-then-close flow as the Close button, just triggered by
 *  a message instead of an interaction. Posts the confirm container as
 *  a normal channel reply; BTN_CLOSE_CONFIRM / BTN_CLOSE_CANCEL on that
 *  reply are still interactions and go through handleButton() above
 *  exactly like the button-triggered flow does.
 * ------------------------------------------------------------------ */
async function handleCloseCommand(message) {
    const category = config.categories.find((c) => message.channel.name?.startsWith(c.channelPrefix));
    if (!category) {
        return message.reply("This doesn't look like a ticket channel.");
    }

    const confirm = buildCloseConfirmContainer();
    await message.reply({
        components: [confirm],
        flags: MessageFlags.IsComponentsV2,
    });
}

/* ------------------------------------------------------------------ *
 *  CLOSE + TRANSCRIPT
 * ------------------------------------------------------------------ */
async function closeTicket(channel, closedBy) {
    let filePath, fileName;
    try {
        ({ filePath, fileName } = await generateTranscript(channel));
    } catch (err) {
        console.error("Failed to generate transcript:", err);
    }

    if (filePath && config.ids.transcriptLogChannelId) {
        try {
            const logChannel = await channel.guild.channels.fetch(config.ids.transcriptLogChannelId);
            if (logChannel) {
                const openerId = channel.topic?.match(/opener: (\d+)/)?.[1];
                const opener = openerId ? await channel.guild.members.fetch(openerId).catch(() => null) : null;
                const durationMs = Date.now() - channel.createdTimestamp;

                const logContainer = buildTranscriptLogContainer({
                    channelName: channel.name,
                    openedBy: opener?.user ?? (opener ?? "Unknown"),
                    closedBy,
                    durationMs,
                });

                await logChannel.send({
                    components: [logContainer],
                    flags: MessageFlags.IsComponentsV2,
                    files: [new AttachmentBuilder(filePath, { name: fileName })],
                });
            }
        } catch (err) {
            console.error("Failed to post transcript:", err);
        }
    }

    if (config.behavior.onClose === "archive" && config.behavior.archiveCategoryId) {
        await channel.setParent(config.behavior.archiveCategoryId, { lockPermissions: false }).catch(console.error);
        await channel.permissionOverwrites
            .edit(channel.guild.roles.everyone, { SendMessages: false })
            .catch(console.error);
        return;
    }

    setTimeout(() => {
        channel.delete().catch(console.error);
    }, (config.behavior.closeDelaySeconds || 5) * 1000);
}

module.exports = {
    SELECT_ID,
    BTN_CLAIM,
    BTN_CLOSE,
    BTN_CLOSE_CONFIRM,
    BTN_CLOSE_CANCEL,
    BTN_ESCALATE,
    buildPanelContainer,
    handleCategorySelect,
    handleButton,
    handleCloseCommand,
};