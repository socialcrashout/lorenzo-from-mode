const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

// Recursively walk the parsed payload and collect every distinct filename
// referenced via "attachment://filename.ext" (in embeds, components, etc.)
function findAttachmentRefs(node, found = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) findAttachmentRefs(item, found);
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) findAttachmentRefs(value, found);
  } else if (typeof node === 'string' && node.startsWith('attachment://')) {
    found.add(node.slice('attachment://'.length));
  }
  return found;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Send a raw embed/message JSON payload (e.g. from Discohook) to this channel')
    .addStringOption(option =>
      option
        .setName('json')
        .setDescription('Paste the Discohook "Message Contents (JSON)" here')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option
        .setName('file')
        .setDescription('Or upload a .json file instead (for long payloads)')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option
        .setName('image1')
        .setDescription('Image file matching an attachment:// reference in your JSON (filename must match)')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option
        .setName('image2')
        .setDescription('Another image file matching an attachment:// reference')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option
        .setName('image3')
        .setDescription('Another image file matching an attachment:// reference')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option
        .setName('image4')
        .setDescription('Another image file matching an attachment:// reference')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option
        .setName('image5')
        .setDescription('Another image file matching an attachment:// reference')
        .setRequired(false)
    )
    // remove/change this if you want anyone to be able to use it
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const jsonOption = interaction.options.getString('json');
    const fileOption = interaction.options.getAttachment('file');
    const imageOptions = ['image1', 'image2', 'image3', 'image4', 'image5']
      .map(name => interaction.options.getAttachment(name))
      .filter(Boolean);

    if (!jsonOption && !fileOption) {
      return interaction.reply({
        content: 'Give me either the `json` text or a `.json` file to send.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // 1. Get the raw JSON text, either from the option or the uploaded file
    let rawText = jsonOption;
    if (!rawText && fileOption) {
      try {
        const res = await fetch(fileOption.url);
        rawText = await res.text();
      } catch (err) {
        return interaction.editReply(`Couldn't download that file: ${err.message}`);
      }
    }

    // 2. Parse it
    let payload;
    try {
      payload = JSON.parse(rawText);
    } catch (err) {
      return interaction.editReply(
        `That's not valid JSON: ${err.message}\n` +
        `Tip: use Discohook's "JSON Editor" or the code icon (</>) to grab the exact payload.`
      );
    }

    // 3. Strip fields Discord's message-create endpoint doesn't accept
    //    (Discohook sometimes includes these for its own UI/backup purposes)
    delete payload.webhook_id;
    delete payload.id;
    delete payload.channel_id;
    delete payload.timestamp;
    delete payload.edited_timestamp;
    delete payload.author;
    delete payload.type;

    delete payload.attachments;

  
    const neededFilenames = findAttachmentRefs(payload);
    const files = [];

    if (neededFilenames.size > 0) {
      const missing = [];

      for (const filename of neededFilenames) {
        const match = imageOptions.find(att => att.name === filename);
        if (!match) {
          missing.push(filename);
          continue;
        }

        try {
          const res = await fetch(match.url);
          const arrayBuffer = await res.arrayBuffer();
          files.push({
            name: filename,
            data: Buffer.from(arrayBuffer),
          });
        } catch (err) {
          return interaction.editReply(
            `Couldn't download the uploaded image "${filename}": ${err.message}`
          );
        }
      }

      if (missing.length > 0) {
        return interaction.editReply(
          `Your JSON references attachment://${missing.join(', attachment://')} but ` +
          `no matching file was uploaded (or the filename doesn't match exactly).\n` +
          `Upload the image(s) using the image1-image5 options, with filenames matching ` +
          `exactly what's in the JSON.`
        );
      }

      // Discord matches attachment:// references by filename against this
      // array, keyed by index into the multipart "files" payload.
      payload.attachments = files.map((f, i) => ({ id: i, filename: f.name }));
    }

    try {
      await interaction.client.rest.post(
        `/channels/${interaction.channelId}/messages`,
        { body: payload, files: files.length > 0 ? files : undefined }
      );
      await interaction.editReply('Sent ✅');
    } catch (err) {
      console.error(err);
      await interaction.editReply(
        `Discord rejected that payload: ${err.message}\n` +
        `Double-check it's the full message JSON (not just an embed object).`
      );
    }
  },
};